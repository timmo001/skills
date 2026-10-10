import { describe, expect, it } from "@effect/vitest";
import {
  Api,
  Cli,
  GhChunk,
  Issue,
  PullRequest,
  Workflow,
  layer as ghLayer,
  type GhOptions,
} from "@timmo001/effect-gh";
import {
  Cause,
  Clock,
  ConfigProvider,
  Deferred,
  Duration,
  Effect,
  Exit,
  Fiber,
  Layer,
  PlatformError,
  Predicate,
  Queue,
  Schema,
  Sink,
  Stream,
} from "effect";
import { TestClock } from "effect/testing";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { GitHub, NetworkUnavailableError } from "../src/services/GitHub.js";

const text = (value: string) => Stream.succeed(new TextEncoder().encode(value));

const exit = (code: number) =>
  Effect.succeed(ChildProcessSpawner.ExitCode(code));

const version = (value: string) => text(`gh version ${value} (2026-10-01)\n`);

const watch = (options?: GhOptions) =>
  Workflow.watch({ repo: "org/repo", runId: 42 }, options);

const retryClock = Effect.fn("Test.retryClock")(function* () {
  const clock = yield* Clock.Clock;
  const sleeps = yield* Queue.unbounded<Duration.Duration>();

  return {
    sleeps,
    clock: Clock.Clock.of({
      currentTimeMillisUnsafe: () => clock.currentTimeMillisUnsafe(),
      currentTimeMillis: clock.currentTimeMillis,
      currentTimeNanosUnsafe: () => clock.currentTimeNanosUnsafe(),
      currentTimeNanos: clock.currentTimeNanos,
      monotonicTimeNanosUnsafe: () => clock.monotonicTimeNanosUnsafe(),
      monotonicTimeNanos: clock.monotonicTimeNanos,
      sleep: (duration: Duration.Duration) =>
        Queue.offer(sleeps, duration).pipe(
          Effect.andThen(clock.sleep(duration)),
        ),
    }),
  };
});

const fixture = Effect.fn("Test.githubFixture")(function* (
  response: (
    command: ChildProcess.StandardCommand,
    attempt: number,
  ) => Effect.Effect<
    Partial<ChildProcessSpawner.ChildProcessHandle>,
    PlatformError.PlatformError
  >,
  config: Record<string, string | number> = {},
  defaults: GhOptions = {},
) {
  const commands: ChildProcess.StandardCommand[] = [];
  const spawned = yield* Deferred.make<void>();
  let releases = 0;

  const spawner = ChildProcessSpawner.make(
    Effect.fn("Test.spawn")(function* (command) {
      if (!Predicate.isTagged(command, "StandardCommand"))
        return yield* Effect.die("Expected literal gh argv");
      commands.push(command);

      return yield* Effect.acquireRelease(
        Effect.gen(function* () {
          const handle = ChildProcessSpawner.makeHandle({
            pid: ChildProcessSpawner.ProcessId(1),
            exitCode: exit(0),
            isRunning: Effect.succeed(false),
            kill: () => Effect.void,
            stdin: Sink.drain,
            stdout: Stream.empty,
            stderr: Stream.empty,
            all: Stream.empty,
            getInputFd: () => Sink.drain,
            getOutputFd: () => Stream.empty,
            unref: Effect.succeed(Effect.void),
            ...(yield* response(command, commands.length)),
          });

          yield* Deferred.succeed(spawned, undefined);

          return handle;
        }),
        () =>
          Effect.sync(() => {
            releases++;
          }),
      );
    }),
  );

  const github = yield* GitHub.pipe(
    Effect.provide(
      GitHub.layer.pipe(
        Layer.provide(ghLayer(defaults)),
        Layer.provide(
          Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner),
        ),
        Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(config))),
      ),
    ),
  );

  return { github, commands, spawned, releases: () => releases };
});

describe("GitHub SDK boundary", () => {
  it.effect(
    "waits briefly for connectivity without replaying nonnetwork failures",
    () =>
      Effect.gen(function* () {
        const quota = { limit: 5000, used: 0, remaining: 5000, reset: 0 };

        const fake = yield* fixture((_command, attempt) =>
          Effect.succeed({
            stdout: text(
              attempt === 1
                ? ""
                : JSON.stringify({
                    resources: { core: quota, graphql: quota, search: quota },
                  }),
            ),
            stderr: text(attempt === 1 ? "network is unreachable" : ""),
            exitCode: exit(attempt === 1 ? 1 : 0),
          }),
        );

        const clock = yield* retryClock();

        const fiber = yield* fake.github
          .waitForNetwork()
          .pipe(
            Effect.provideService(Clock.Clock, clock.clock),
            Effect.forkScoped,
          );

        expect(Duration.toMillis(yield* Queue.take(clock.sleeps))).toBe(2000);
        expect(Duration.toMillis(yield* Queue.take(clock.sleeps))).toBe(500);
        yield* TestClock.adjust("500 millis");
        yield* Fiber.join(fiber);
        expect(fake.commands).toHaveLength(2);
        expect(fake.commands[0]?.args).toEqual([
          "api",
          "--method",
          "GET",
          "--",
          "rate_limit",
        ]);
      }),
  );

  it.effect(
    "defers after bounded network failures but fails on authentication",
    () =>
      Effect.gen(function* () {
        const offline = yield* fixture(() =>
          Effect.succeed({
            stderr: text(
              "error connecting to api.github.com\ncheck your internet connection or https://githubstatus.com",
            ),
            exitCode: exit(1),
          }),
        );

        const clock = yield* retryClock();

        const fiber = yield* offline.github
          .waitForNetwork()
          .pipe(
            Effect.provideService(Clock.Clock, clock.clock),
            Effect.flip,
            Effect.forkScoped,
          );

        for (const delay of [0.5, 1, 2, 4, 5, 5, 5, 5, 5, 5]) {
          expect(Duration.toMillis(yield* Queue.take(clock.sleeps))).toBe(2000);
          expect(Duration.toMillis(yield* Queue.take(clock.sleeps))).toBe(
            delay * 1000,
          );
          yield* TestClock.adjust(`${delay * 1000} millis`);
        }

        expect(yield* Fiber.join(fiber)).toBeInstanceOf(
          NetworkUnavailableError,
        );
        expect(offline.commands).toHaveLength(11);

        const denied = yield* fixture(() =>
          Effect.succeed({ stderr: text("HTTP 403"), exitCode: exit(1) }),
        );

        expect(
          yield* Effect.flip(denied.github.waitForNetwork()),
        ).toMatchObject({
          status: 403,
        });
        expect(denied.commands).toHaveLength(1);
      }),
  );

  it.effect("sends ref mutations as JSON without automatic retries", () =>
    Effect.gen(function* () {
      let input = "";

      const fake = yield* fixture(
        () =>
          Effect.succeed({
            stdin: Sink.forEach((chunk: Uint8Array) =>
              Effect.sync(() => {
                input += new TextDecoder().decode(chunk);
              }),
            ),
            stderr: text("HTTP 503"),
            exitCode: exit(1),
          }),
        { GH_TOKEN: "test-token" },
      );

      const endpoint = "repos/org/repo/git/refs/heads/state";

      expect(
        yield* Effect.flip(
          fake.github.write(
            endpoint,
            Api.empty({
              endpoint,
              method: "PATCH",
              body: { sha: "abc", force: false },
            }),
          ),
        ),
      ).toMatchObject({ status: 503, retryable: true });
      expect(fake.commands).toHaveLength(1);
      expect(fake.commands[0]?.args).toEqual([
        "api",
        "--method",
        "PATCH",
        "--input",
        "-",
        "--",
        endpoint,
      ]);
      expect(fake.commands[0]?.options.env?.GH_TOKEN).toBe("test-token");
      expect(JSON.parse(input)).toEqual({ sha: "abc", force: false });
    }),
  );

  it.effect("decodes typed responses and reports schema mismatches", () =>
    Effect.gen(function* () {
      const fake = yield* fixture((command) =>
        Effect.succeed({
          stdout: text(
            command.args.includes("malformed")
              ? "not json"
              : ' \n[{"sha":"abc"}]\n',
          ),
        }),
      );

      const Commits = Schema.Array(Schema.Struct({ sha: Schema.String }));

      const endpoint =
        "repos/org/repo/commits?path=skill%20name&per_page=1&sha=main";

      expect(
        yield* fake.github.read(
          endpoint,
          Api.json({ endpoint, method: "GET" }, Commits),
        ),
      ).toEqual([{ sha: "abc" }]);
      expect(fake.commands[0]?.args).toEqual([
        "api",
        "--method",
        "GET",
        "--",
        endpoint,
      ]);

      const malformed = yield* Effect.flip(
        fake.github.read(
          "malformed",
          Api.json({ endpoint: "malformed", method: "GET" }, Commits),
        ),
      );

      expect(malformed).toMatchObject({
        command: "malformed",
        exitCode: 0,
        status: null,
        retryable: false,
        decode: true,
      });
      expect(fake.commands).toHaveLength(2);
      expect(fake.releases()).toBe(2);
    }),
  );

  for (const config of [
    { GH_TOKEN: "primary-token", GITHUB_TOKEN: "fallback-token" },
    { GITHUB_TOKEN: "fallback-token" },
    {},
  ]) {
    it.effect(
      `preserves authentication with ${Object.keys(config).join(" and ") || "inherited gh config"}`,
      () =>
        Effect.gen(function* () {
          const fake = yield* fixture(
            () => Effect.succeed({ stdout: version("2.81.0") }),
            config,
          );

          expect(yield* fake.github.read("gh --version", Cli.version())).toBe(
            "2.81.0",
          );
          yield* Stream.runDrain(
            fake.github.stream(
              "gh run watch 42",
              watch({ cwd: "/repo", timeout: null }),
            ),
          );

          for (const command of fake.commands) {
            expect(command.command).toBe("gh");
            expect(command.options).toMatchObject({
              extendEnv: true,
              shell: false,
              stdin: "ignore",
              env: {
                GH_PROMPT_DISABLED: "1",
                GH_PAGER: "cat",
                GH_FORCE_TTY: undefined,
              },
            });
            expect(command.options.env?.GH_TOKEN).toBe(
              config.GH_TOKEN ?? config.GITHUB_TOKEN,
            );
          }

          expect(fake.commands[0]?.options.cwd).toBeUndefined();
          expect(fake.commands[1]?.options.cwd).toBe("/repo");
        }),
    );
  }

  it.effect("retries transient reads at one and two seconds", () =>
    Effect.gen(function* () {
      const stderr = "HTTP 503: temporarily unavailable";

      const fake = yield* fixture(() =>
        Effect.succeed({
          stdout: text("partial"),
          stderr: text(stderr),
          exitCode: exit(1),
        }),
      );

      const clock = yield* retryClock();

      const fiber = yield* fake.github
        .read("gh --version", Cli.version())
        .pipe(
          Effect.provideService(Clock.Clock, clock.clock),
          Effect.flip,
          Effect.forkScoped,
        );

      expect(Duration.toMillis(yield* Queue.take(clock.sleeps))).toBe(1000);
      yield* TestClock.adjust("999 millis");
      expect(fake.commands).toHaveLength(1);
      yield* TestClock.adjust("1 milli");
      expect(Duration.toMillis(yield* Queue.take(clock.sleeps))).toBe(2000);
      expect(fake.commands).toHaveLength(2);
      yield* TestClock.adjust("1999 millis");
      expect(fake.commands).toHaveLength(2);
      yield* TestClock.adjust("1 milli");
      expect(yield* Fiber.join(fiber)).toMatchObject({
        exitCode: 1,
        status: 503,
        retryable: true,
        stderr,
      });
      expect(fake.commands).toHaveLength(3);
      expect(fake.releases()).toBe(3);
    }),
  );

  it.effect(
    "discards failed-attempt output and returns only the successful read",
    () =>
      Effect.gen(function* () {
        const fake = yield* fixture((_command, attempt) =>
          Effect.succeed({
            stdout: attempt === 1 ? text("partial") : version("complete"),
            stderr: text(attempt === 1 ? "connection reset" : ""),
            exitCode: exit(attempt === 1 ? 1 : 0),
          }),
        );

        const clock = yield* retryClock();

        const fiber = yield* fake.github
          .read("gh --version", Cli.version())
          .pipe(
            Effect.provideService(Clock.Clock, clock.clock),
            Effect.forkScoped,
          );

        yield* Queue.take(clock.sleeps);
        yield* TestClock.adjust("1 second");
        expect(yield* Fiber.join(fiber)).toBe("complete");
        expect(fake.commands).toHaveLength(2);
      }),
  );

  it.effect("never replays mutations", () =>
    Effect.gen(function* () {
      const fake = yield* fixture(() =>
        Effect.succeed({ stderr: text("HTTP 503"), exitCode: exit(1) }),
      );

      const repository = "org/repo";

      for (const mutation of [
        PullRequest.create({
          repository,
          base: "main",
          head: "update",
          title: "Title",
          body: "Body",
        }),
        PullRequest.edit(1, { repository, body: "Body" }),
        PullRequest.merge(1, { repository, method: "squash", auto: true }),
        Issue.create({ repo: repository, title: "Title", body: "Body" }),
        Workflow.dispatch({ repo: repository, workflow: "validate.yml" }),
        Api.empty({ endpoint: "example", method: "POST" }),
      ]) {
        expect(
          yield* Effect.flip(fake.github.write("mutation", mutation)),
        ).toMatchObject({ status: 503, retryable: true });
      }

      expect(fake.commands).toHaveLength(6);
    }),
  );

  for (const stderr of [
    "HTTP 401: authentication required",
    "HTTP 404: Not Found",
  ]) {
    it.effect(`does not retry ${stderr}`, () =>
      Effect.gen(function* () {
        const fake = yield* fixture(() =>
          Effect.succeed({ stderr: text(stderr), exitCode: exit(1) }),
        );

        expect(
          yield* Effect.flip(fake.github.read("gh --version", Cli.version())),
        ).toMatchObject({
          exitCode: 1,
          retryable: false,
          stderr,
        });
        expect(fake.commands).toHaveLength(1);
      }),
    );
  }

  for (const retries of [-1, 0]) {
    it.effect(`honours retry setting ${retries}`, () =>
      Effect.gen(function* () {
        const fake = yield* fixture(
          () =>
            Effect.succeed({ stderr: text("rate limit"), exitCode: exit(1) }),
          { SKILL_MAINTENANCE_GITHUB_RETRIES: retries },
        );

        yield* Effect.flip(fake.github.read("gh --version", Cli.version()));
        expect(fake.commands).toHaveLength(1);
      }),
    );
  }

  it.effect(
    "distinguishes CLI availability from platform failure without retrying",
    () =>
      Effect.gen(function* () {
        const fake = yield* fixture((_command, attempt) =>
          attempt === 3
            ? Effect.fail(
                PlatformError.systemError({
                  // systemError requires the OS error tag in its constructor options.
                  // oxlint-disable-next-line anti-slop-effect/no-manual-tagged-construction
                  _tag: "NotFound",
                  module: "ChildProcessSpawner",
                  method: "spawn",
                  description: "gh missing",
                }),
              )
            : Effect.succeed({ exitCode: exit(attempt === 1 ? 0 : 1) }),
        );

        expect(yield* fake.github.isAvailable()).toBe(true);
        expect(yield* fake.github.isAvailable()).toBe(false);
        expect(yield* Effect.flip(fake.github.isAvailable())).toMatchObject({
          command: "gh --version",
          exitCode: -1,
          status: null,
          retryable: false,
        });
        expect(fake.commands.map(({ args }) => args)).toEqual([
          ["--version"],
          ["--version"],
          ["--version"],
        ]);
      }),
  );

  it.effect(
    "streams both pipes before a failed watch exit without replaying",
    () =>
      Effect.gen(function* () {
        const fake = yield* fixture(() =>
          Effect.succeed({
            stdout: text("progress\r\n"),
            stderr: text("HTTP 503\n"),
            exitCode: exit(7),
          }),
        );

        const chunks: Array<{ _tag: string; text: string }> = [];

        const failure = yield* fake.github
          .stream("gh run watch 42", watch())
          .pipe(
            Stream.runForEach((chunk) =>
              Effect.sync(() => {
                chunks.push(chunk);
              }),
            ),
            Effect.flip,
          );

        expect(chunks).toContainEqual(
          GhChunk.cases.Stdout.make({ text: "progress\r\n" }),
        );
        expect(chunks).toContainEqual(
          GhChunk.cases.Stderr.make({ text: "HTTP 503\n" }),
        );
        expect(failure).toMatchObject({
          command: "gh run watch 42",
          exitCode: 7,
          stderr: "HTTP 503",
          status: 503,
        });
        expect(fake.commands[0]?.args).toEqual([
          "run",
          "watch",
          "42",
          "--repo",
          "org/repo",
          "--compact",
          "--exit-status",
          "--interval",
          "3",
        ]);
        expect(fake.commands).toHaveLength(1);
        expect(fake.releases()).toBe(1);
      }),
  );

  it.effect(
    "releases the subprocess on timeout and maps the domain failure",
    () =>
      Effect.gen(function* () {
        const fake = yield* fixture(() =>
          Effect.succeed({ stdout: Stream.never }),
        );

        // Timeouts are transient, so use the non-retrying path to see one attempt.
        const fiber = yield* fake.github
          .write("gh --version", Cli.version({ timeout: "5 seconds" }))
          .pipe(Effect.flip, Effect.forkScoped);

        yield* Deferred.await(fake.spawned);
        yield* TestClock.adjust("5 seconds");
        expect(yield* Fiber.join(fiber)).toMatchObject({
          exitCode: -1,
          status: null,
          stderr: "Command timed out after 5000ms",
        });
        expect(fake.releases()).toBe(1);
      }),
  );

  it.effect(
    "keeps interruption intact and allows an unbounded watch to override a timeout",
    () =>
      Effect.gen(function* () {
        const fake = yield* fixture(
          () => Effect.succeed({ stdout: Stream.never }),
          {},
          { timeout: "1 second" },
        );

        const fiber = yield* fake.github
          .stream("gh run watch 42", watch({ timeout: null }))
          .pipe(Stream.runDrain, Effect.forkScoped);

        yield* Deferred.await(fake.spawned);
        yield* TestClock.adjust("2 seconds");
        expect(fake.releases()).toBe(0);
        yield* Fiber.interrupt(fiber);
        const result = yield* Fiber.await(fiber);
        expect(result._tag).toBe("Failure");

        if (Exit.isFailure(result))
          expect(Cause.hasInterrupts(result.cause)).toBe(true);
        expect(fake.commands).toHaveLength(1);
        expect(fake.releases()).toBe(1);
      }),
  );

  it.effect("releases a watch on early consumer termination", () =>
    Effect.gen(function* () {
      const fake = yield* fixture(() =>
        Effect.succeed({
          stdout: text("ready").pipe(Stream.concat(Stream.never)),
          exitCode: Effect.never,
        }),
      );

      const output = yield* fake.github
        .stream("gh run watch 42", watch())
        .pipe(Stream.take(1), Stream.runCollect);

      expect(output).toEqual([GhChunk.cases.Stdout.make({ text: "ready" })]);
      expect(fake.releases()).toBe(1);
    }),
  );
});

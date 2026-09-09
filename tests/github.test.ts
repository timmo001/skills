import { describe, expect, it } from "@effect/vitest";
import { layer as ghLayer, type GhOptions } from "@timmo001/effect-gh";
import {
  Cause,
  Clock,
  ConfigProvider,
  Deferred,
  Duration,
  Effect,
  Fiber,
  Layer,
  PlatformError,
  Queue,
  Sink,
  Stream,
} from "effect";
import { TestClock } from "effect/testing";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { GitHub } from "../src/services/GitHub.js";

const text = (value: string) => Stream.succeed(new TextEncoder().encode(value));
const exit = (code: number) =>
  Effect.succeed(ChildProcessSpawner.ExitCode(code));
const retryClock = Effect.fn("Test.retryClock")(function* () {
  const clock = yield* Clock.Clock;
  const sleeps = yield* Queue.unbounded<Duration.Duration>();
  return {
    sleeps,
    clock: {
      ...clock,
      sleep: (duration: Duration.Duration) =>
        Queue.offer(sleeps, duration).pipe(
          Effect.andThen(clock.sleep(duration)),
        ),
    },
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
      if (command._tag !== "StandardCommand")
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
    "preserves literal API queries, jq, pagination and JSON decoding",
    () =>
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
        const endpoint =
          "repos/org/repo/commits?path=skill%20name&per_page=1&sha=main";
        expect(yield* fake.github.apiJson(endpoint)).toEqual([{ sha: "abc" }]);
        expect(fake.commands[0]?.args).toEqual([
          "api",
          endpoint,
          "--method",
          "GET",
        ]);
        expect(
          yield* fake.github.api(endpoint, { jq: ".[0].sha // empty" }),
        ).toBe('[{"sha":"abc"}]');
        expect(fake.commands[1]?.args).toEqual([
          "api",
          endpoint,
          "--method",
          "GET",
          "--jq",
          ".[0].sha // empty",
        ]);
        const args = ["api", "repos/org/repo/issues", "--paginate", "--slurp"];
        expect(yield* fake.github.json(args, { readOnly: true })).toEqual([
          { sha: "abc" },
        ]);
        expect(fake.commands[2]?.args).toEqual(args);
        const malformed = yield* Effect.flip(
          fake.github.json(["api", "malformed"], { readOnly: true }),
        );
        expect(malformed).toMatchObject({
          command: "gh api malformed",
          exitCode: 0,
          status: null,
          retryable: false,
        });
        expect(fake.commands).toHaveLength(4);
        expect(fake.releases()).toBe(4);
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
            () => Effect.succeed({ stdout: text("ok") }),
            config,
          );
          expect(yield* fake.github.run(["api", "user"])).toBe("ok");
          yield* Stream.runDrain(
            fake.github.stream(["run", "watch", "42"], {
              cwd: "/repo",
              timeout: null,
            }),
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

  it.effect(
    "retries transient reads at one and two seconds, retaining stderr before the SDK tail",
    () =>
      Effect.gen(function* () {
        const stderr =
          "HTTP 503: temporarily unavailable\n" + "x".repeat(70_000);
        const fake = yield* fixture(() =>
          Effect.succeed({
            stdout: text("partial"),
            stderr: text(stderr),
            exitCode: exit(1),
          }),
        );
        const clock = yield* retryClock();
        const fiber = yield* fake.github
          .api("example")
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
    "discards failed-attempt stdout and returns only the successful read",
    () =>
      Effect.gen(function* () {
        const fake = yield* fixture((_command, attempt) =>
          Effect.succeed({
            stdout: text(attempt === 1 ? "partial" : "complete"),
            stderr: text(attempt === 1 ? "connection reset" : ""),
            exitCode: exit(attempt === 1 ? 1 : 0),
          }),
        );
        const clock = yield* retryClock();
        const fiber = yield* fake.github
          .run(["pr", "list"], { readOnly: true })
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

  it.effect("never replays mutations or unclassified raw commands", () =>
    Effect.gen(function* () {
      const fake = yield* fixture(() =>
        Effect.succeed({ stderr: text("HTTP 503"), exitCode: exit(1) }),
      );
      for (const args of [
        ["pr", "create"],
        ["pr", "edit"],
        ["pr", "merge"],
        ["issue", "create"],
        ["workflow", "run"],
        ["api", "example", "--method", "POST"],
      ]) {
        expect(yield* Effect.flip(fake.github.run(args))).toMatchObject({
          status: 503,
          retryable: true,
        });
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
        expect(yield* Effect.flip(fake.github.api("example"))).toMatchObject({
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
        yield* Effect.flip(fake.github.api("example"));
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
        const failure = yield* fake.github.stream(["run", "watch", "42"]).pipe(
          Stream.runForEach((chunk) =>
            Effect.sync(() => {
              chunks.push(chunk);
            }),
          ),
          Effect.flip,
        );
        expect(chunks).toContainEqual({ _tag: "Stdout", text: "progress\r\n" });
        expect(chunks).toContainEqual({ _tag: "Stderr", text: "HTTP 503\n" });
        expect(failure).toMatchObject({
          command: "gh run watch 42",
          exitCode: 7,
          stderr: "HTTP 503",
          status: 503,
        });
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
        const fiber = yield* fake.github
          .stream(["run", "watch", "42"], { timeout: "5 seconds" })
          .pipe(Stream.runDrain, Effect.flip, Effect.forkScoped);
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
          .stream(["run", "watch", "42"], { timeout: null })
          .pipe(Stream.runDrain, Effect.forkScoped);
        yield* Deferred.await(fake.spawned);
        yield* TestClock.adjust("2 seconds");
        expect(fake.releases()).toBe(0);
        yield* Fiber.interrupt(fiber);
        const result = yield* Fiber.await(fiber);
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure")
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
        .stream(["run", "watch", "42"])
        .pipe(Stream.take(1), Stream.runCollect);
      expect(output).toEqual([{ _tag: "Stdout", text: "ready" }]);
      expect(fake.releases()).toBe(1);
    }),
  );
});

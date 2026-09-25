import { describe, expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, Layer, Result, Stream } from "effect";
import { TestClock } from "effect/testing";
import {
  claimSkillUpdates,
  finishSkillUpdatesClaim,
  recoverSkillUpdatesClaim,
  withSkillUpdatesClaim,
} from "../src/commands/UpdatesAgentCoordination.js";
import { GitHub } from "../src/services/GitHub.js";
import { coordinationGitHub } from "./helpers/coordination-github.js";

const fixture = () => {
  const remote = coordinationGitHub();

  return {
    ...remote,
    layer: Layer.succeed(GitHub, {
      api: remote.api,
      apiJson: () => Effect.die("Unexpected apiJson"),
      run: () => Effect.die("Unexpected run"),
      json: () => Effect.die("Unexpected json"),
      stream: () => Stream.empty,
      isAvailable: () => Effect.succeed(true),
    }),
  };
};

describe("cross-device skill update coordination", () => {
  for (const [initialised, secondRun] of [
    [false, 42],
    [true, 42],
    [true, 43],
  ] as const) {
    it.effect(
      `admits one device when ${initialised ? "updating" : "creating"} shared state for runs 42 and ${secondRun}`,
      () =>
        Effect.gen(function* () {
          const remote = fixture();

          if (initialised)
            yield* withSkillUpdatesClaim(1, Effect.void).pipe(
              Effect.provide(remote.layer),
            );
          const baseline = remote.writes.length;
          const bothWriting = yield* Deferred.make<void>();
          remote.faults.beforeWrite = (attempt) =>
            Effect.gen(function* () {
              if (attempt === baseline + 2)
                yield* Deferred.succeed(bothWriting, undefined);

              if (attempt <= baseline + 2) yield* Deferred.await(bothWriting);
            });
          let starts = 0;
          const running = yield* Deferred.make<void>();
          const finish = yield* Deferred.make<void>();
          const rejected = yield* Deferred.make<void>();

          const work = Effect.gen(function* () {
            starts++;
            yield* Deferred.succeed(running, undefined);
            yield* Deferred.await(finish);
          });

          const contenders = yield* Effect.all(
            [42, secondRun].map((id) =>
              withSkillUpdatesClaim(id, work).pipe(
                Effect.result,
                Effect.tap((result) =>
                  Result.isFailure(result)
                    ? Deferred.succeed(rejected, undefined)
                    : Effect.void,
                ),
                Effect.provide(remote.layer),
                Effect.forkScoped,
              ),
            ),
          );

          yield* Deferred.await(running);
          yield* Deferred.await(rejected);
          expect(starts).toBe(1);
          yield* Deferred.succeed(finish, undefined);
          const results = yield* Effect.all(contenders.map(Fiber.join));
          expect(results.filter(Result.isSuccess)).toHaveLength(1);
          expect(starts).toBe(1);
          expect(remote.state().processed).toHaveLength(initialised ? 2 : 1);
          expect(remote.state().claim).toBeNull();
        }),
    );
  }

  it.effect("shares all completed run IDs across fresh device calls", () =>
    Effect.gen(function* () {
      const remote = fixture();
      let starts = 0;

      for (const id of [42, 43, 42, 43])
        yield* withSkillUpdatesClaim(
          id,
          Effect.sync(() => {
            starts++;
          }),
        ).pipe(Effect.provide(remote.layer));
      expect(starts).toBe(2);
      expect(remote.state().processed).toEqual([42, 43]);
    }),
  );

  it.effect(
    "reconciles lost claim and completion responses without replaying work",
    () =>
      Effect.gen(function* () {
        const remote = fixture();
        remote.faults.loseResponses = 2;
        let starts = 0;

        for (let i = 0; i < 2; i++)
          yield* withSkillUpdatesClaim(
            42,
            Effect.sync(() => {
              starts++;
            }),
          ).pipe(Effect.provide(remote.layer));
        expect(starts).toBe(1);
        expect(remote.writes).toHaveLength(2);
        expect(remote.state()).toEqual({ claim: null, processed: [42] });
      }),
  );

  it.effect(
    "retries the same candidate after a pre-write transient failure",
    () =>
      Effect.gen(function* () {
        const remote = fixture();
        remote.faults.failWrites = 1;

        const attempt = yield* claimSkillUpdates(42).pipe(
          Effect.provide(remote.layer),
          Effect.forkScoped,
        );

        yield* TestClock.adjust("1 second");
        const claim = yield* Fiber.join(attempt);
        expect(claim?.runId).toBe(42);
        expect(remote.writes).toHaveLength(2);
        expect(remote.writes[0]?.sha).toBe(remote.writes[1]?.sha);
      }),
  );

  it.effect(
    "bounds retries and never starts work when a claim cannot be confirmed",
    () =>
      Effect.gen(function* () {
        const remote = fixture();
        remote.faults.failWrites = 10;
        let starts = 0;

        const attempt = yield* withSkillUpdatesClaim(
          42,
          Effect.sync(() => {
            starts++;
          }),
        ).pipe(Effect.result, Effect.provide(remote.layer), Effect.forkScoped);

        yield* TestClock.adjust("2 seconds");
        expect((yield* Fiber.join(attempt))._tag).toBe("Failure");
        expect(starts).toBe(0);
        expect(remote.writes).toHaveLength(3);
        expect(remote.head()).toBeNull();
      }),
  );

  it.effect(
    "retains failed work until explicit recovery and rejects stale owners",
    () =>
      Effect.gen(function* () {
        const remote = fixture();
        yield* withSkillUpdatesClaim(42, Effect.fail("partial work")).pipe(
          Effect.result,
          Effect.provide(remote.layer),
        );
        const token = remote.state().claim?.token;

        if (!token) return yield* Effect.die("Missing failed claim");
        expect(remote.state().processed).toEqual([]);
        expect(
          yield* claimSkillUpdates(42).pipe(
            Effect.flip,
            Effect.provide(remote.layer),
          ),
        ).toMatchObject({ operation: "coordination.busy" });
        expect(
          yield* recoverSkillUpdatesClaim(token, "retry", false).pipe(
            Effect.flip,
            Effect.provide(remote.layer),
          ),
        ).toMatchObject({ operation: "coordination.recovery" });
        yield* recoverSkillUpdatesClaim(token, "retry", true).pipe(
          Effect.provide(remote.layer),
        );

        const next = yield* claimSkillUpdates(42).pipe(
          Effect.provide(remote.layer),
        );

        expect(next?.token).not.toBe(token);
        expect(
          yield* finishSkillUpdatesClaim(token, "processed").pipe(
            Effect.flip,
            Effect.provide(remote.layer),
          ),
        ).toMatchObject({ operation: "coordination.owner" });
        expect(remote.state().claim?.token).toBe(next?.token);

        if (!next) return yield* Effect.die("Missing replacement claim");
        yield* recoverSkillUpdatesClaim(next.token, "processed", true).pipe(
          Effect.provide(remote.layer),
        );
        expect(
          yield* claimSkillUpdates(42).pipe(Effect.provide(remote.layer)),
        ).toBeNull();
      }),
  );

  it.effect("retains the claim if recording completed work fails", () =>
    Effect.gen(function* () {
      const remote = fixture();
      let starts = 0;

      const work = Effect.sync(() => {
        starts++;
        remote.faults.failWrites = 10;
      });

      const worker = yield* withSkillUpdatesClaim(42, work).pipe(
        Effect.result,
        Effect.provide(remote.layer),
        Effect.forkScoped,
      );

      yield* TestClock.adjust("2 seconds");
      expect((yield* Fiber.join(worker))._tag).toBe("Failure");
      expect(remote.state().processed).toEqual([]);
      expect(
        yield* withSkillUpdatesClaim(42, work).pipe(
          Effect.flip,
          Effect.provide(remote.layer),
        ),
      ).toMatchObject({ operation: "coordination.busy" });
      expect(starts).toBe(1);
      const token = remote.state().claim?.token;

      if (!token) return yield* Effect.die("Missing retained claim");
      remote.faults.failWrites = 0;
      yield* recoverSkillUpdatesClaim(token, "processed", true).pipe(
        Effect.provide(remote.layer),
      );
      yield* withSkillUpdatesClaim(42, work).pipe(Effect.provide(remote.layer));
      expect(starts).toBe(1);
    }),
  );

  it.effect("does not start work after an unconfirmed claim write", () =>
    Effect.gen(function* () {
      const remote = fixture();
      remote.faults.loseResponses = 1;
      remote.faults.beforeWrite = () =>
        Effect.sync(() => {
          remote.faults.readFailure = 503;
        });
      let starts = 0;
      expect(
        (yield* withSkillUpdatesClaim(
          42,
          Effect.sync(() => {
            starts++;
          }),
        ).pipe(Effect.result, Effect.provide(remote.layer)))._tag,
      ).toBe("Failure");
      expect(starts).toBe(0);
      expect(remote.state().claim?.runId).toBe(42);
      remote.faults.readFailure = 0;
      expect(
        yield* claimSkillUpdates(42).pipe(
          Effect.flip,
          Effect.provide(remote.layer),
        ),
      ).toMatchObject({ operation: "coordination.busy" });
    }),
  );

  it.effect("retains interrupted work without expiring the claim", () =>
    Effect.gen(function* () {
      const remote = fixture();
      const started = yield* Deferred.make<void>();

      const worker = yield* withSkillUpdatesClaim(
        42,
        Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never)),
      ).pipe(Effect.provide(remote.layer), Effect.forkScoped);

      yield* Deferred.await(started);
      yield* Fiber.interrupt(worker);
      yield* TestClock.adjust("7 days");
      expect(
        yield* claimSkillUpdates(43).pipe(
          Effect.flip,
          Effect.provide(remote.layer),
        ),
      ).toMatchObject({ operation: "coordination.busy" });
      expect(remote.state().processed).toEqual([]);
    }),
  );

  it.effect(
    "cannot release over a recovery and replacement claim racing after its read",
    () =>
      Effect.gen(function* () {
        const remote = fixture();

        const claim = yield* claimSkillUpdates(42).pipe(
          Effect.provide(remote.layer),
        );

        if (!claim) return yield* Effect.die("Missing claim");
        const releasing = yield* Deferred.make<void>();
        const resume = yield* Deferred.make<void>();
        remote.faults.beforeWrite = (attempt) =>
          attempt === 2
            ? Deferred.succeed(releasing, undefined).pipe(
                Effect.andThen(Deferred.await(resume)),
                Effect.asVoid,
              )
            : Effect.void;

        const staleRelease = yield* finishSkillUpdatesClaim(
          claim.token,
          "processed",
        ).pipe(Effect.result, Effect.provide(remote.layer), Effect.forkScoped);

        yield* Deferred.await(releasing);
        yield* recoverSkillUpdatesClaim(claim.token, "retry", true).pipe(
          Effect.provide(remote.layer),
        );

        const replacement = yield* claimSkillUpdates(43).pipe(
          Effect.provide(remote.layer),
        );

        yield* Deferred.succeed(resume, undefined);
        expect((yield* Fiber.join(staleRelease))._tag).toBe("Failure");
        expect(remote.state().claim?.token).toBe(replacement?.token);
        expect(remote.state().processed).toEqual([]);
      }),
  );

  it.effect("fails closed when the shared state cannot be read", () =>
    Effect.gen(function* () {
      const remote = fixture();
      remote.faults.readFailure = 403;
      let starts = 0;
      expect(
        (yield* withSkillUpdatesClaim(
          42,
          Effect.sync(() => {
            starts++;
          }),
        ).pipe(Effect.result, Effect.provide(remote.layer)))._tag,
      ).toBe("Failure");
      expect(starts).toBe(0);
      expect(remote.writes).toHaveLength(0);
    }),
  );
});

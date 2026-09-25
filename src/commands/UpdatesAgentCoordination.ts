import { randomUUID } from "node:crypto";
import { Console, Effect, Result, Schema } from "effect";
import { GitHub } from "../services/GitHub.js";

const repository = "repos/timmo001/skills";

export const skillUpdatesStateRef = "heads/automation/skill-update-state";

const refEndpoint = `${repository}/git/refs/${skillUpdatesStateRef}`;

const RunId = Schema.Int.check(Schema.isGreaterThan(0));

const Claim = Schema.Struct({
  token: Schema.NonEmptyString,
  runId: RunId,
  startedAt: Schema.NonEmptyString,
});

const State = Schema.Struct({
  version: Schema.Literal(1),
  revision: Schema.NonEmptyString,
  claim: Schema.NullOr(Claim),
  processed: Schema.Array(RunId),
});

const Sha = Schema.String.check(Schema.isPattern(/^[0-9a-f]{40}$/));

const GitObject = Schema.Struct({ sha: Sha });

const Reference = Schema.Struct({ object: GitObject });

const Commit = Schema.Struct({ message: Schema.String, tree: GitObject });

interface Snapshot {
  readonly sha: string;
  readonly tree: string;
  readonly state: typeof State.Type;
}

export class SkillUpdatesCoordinationError extends Schema.TaggedError<SkillUpdatesCoordinationError>()(
  "SkillUpdatesCoordinationError",
  { operation: Schema.String, message: Schema.String },
) {}

/** A claimed run failed without publishing anything, so it can be retried. */
export class SkillUpdatesRetryableError extends Schema.TaggedError<SkillUpdatesRetryableError>()(
  "SkillUpdatesRetryableError",
  { operation: Schema.String, message: Schema.String },
) {}

const decode = <S extends Schema.Top>(schema: S, raw: string) =>
  Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(raw).pipe(
    Effect.mapError(
      (cause) =>
        new SkillUpdatesCoordinationError({
          operation: "coordination.decode",
          message: String(cause),
        }),
    ),
  );

const readRef = Effect.fn("UpdatesAgentCoordination.readRef")(function* () {
  const github = yield* GitHub;

  const raw = yield* github
    .api(`${repository}/git/ref/${skillUpdatesStateRef}`)
    .pipe(
      Effect.catchTag("GitHubError", (error) =>
        error.status === 404 ? Effect.succeed(null) : Effect.fail(error),
      ),
    );

  return raw === null ? null : (yield* decode(Reference, raw)).object.sha;
});

const readState = Effect.fn("UpdatesAgentCoordination.readState")(function* () {
  const github = yield* GitHub;
  const sha = yield* readRef();

  if (sha === null) return null;

  const commit = yield* decode(
    Commit,
    yield* github.api(`${repository}/git/commits/${sha}`),
  );

  return {
    sha,
    tree: commit.tree.sha,
    state: yield* decode(State, commit.message),
  } satisfies Snapshot;
});

// Each candidate has exactly the observed head as its parent. Concurrent
// candidates are siblings, so GitHub's non-forced update accepts only one.
const transition = Effect.fn("UpdatesAgentCoordination.transition")(function* (
  current: Snapshot | null,
  state: Omit<typeof State.Type, "revision">,
) {
  const github = yield* GitHub;

  const tree =
    current?.tree ??
    (yield* decode(
      GitObject,
      yield* github.api(`${repository}/git/trees`, {
        method: "POST",
        body: {
          tree: [
            {
              path: "README.md",
              mode: "100644",
              type: "blob",
              content:
                "Skill update coordination state is stored as JSON in each commit message. Do not delete or force-update this branch.\n",
            },
          ],
        },
      }),
    )).sha;

  const candidate = yield* decode(
    GitObject,
    yield* github.api(`${repository}/git/commits`, {
      method: "POST",
      body: {
        message: JSON.stringify({ ...state, revision: randomUUID() }),
        tree,
        parents: current ? [current.sha] : [],
      },
    }),
  );

  for (let attempt = 0; ; attempt++) {
    const result = yield* github
      .api(current ? refEndpoint : `${repository}/git/refs`, {
        method: current ? "PATCH" : "POST",
        body: current
          ? { sha: candidate.sha, force: false }
          : { ref: `refs/${skillUpdatesStateRef}`, sha: candidate.sha },
      })
      .pipe(Effect.result);

    if (Result.isSuccess(result)) return true;

    // A failed response can hide a successful write. Reconcile before retrying
    // the same candidate, never rebase a stale owner onto someone else's state.
    const observed = yield* readRef();

    if (observed === candidate.sha) return true;

    if (observed !== (current?.sha ?? null)) return false;

    if (!result.failure.retryable || attempt === 2)
      return yield* result.failure;
    yield* Effect.sleep("1 second");
  }
});

export const claimSkillUpdates = Effect.fn("UpdatesAgentCoordination.claim")(
  function* (runId: number) {
    yield* Schema.decodeUnknownEffect(RunId)(runId);

    const claim = {
      token: randomUUID(),
      runId,
      startedAt: new Date().toISOString(),
    };

    for (let attempt = 0; attempt < 3; attempt++) {
      const current = yield* readState();

      if (current?.state.processed.includes(runId)) return null;

      if (current?.state.claim)
        return yield* new SkillUpdatesCoordinationError({
          operation: "coordination.busy",
          message: `Workflow run ${current.state.claim.runId} is claimed by ${current.state.claim.token} since ${current.state.claim.startedAt}. Stop the owning runner before explicit recovery.`,
        });

      if (
        yield* transition(current, {
          version: 1,
          claim,
          processed: current?.state.processed ?? [],
        })
      )
        return claim;
    }

    return yield* new SkillUpdatesCoordinationError({
      operation: "coordination.conflict",
      message: "Shared state kept changing; retry the device command",
    });
  },
);

export const finishSkillUpdatesClaim = Effect.fn(
  "UpdatesAgentCoordination.finish",
)(function* (token: string, outcome: "processed" | "retry") {
  const current = yield* readState();

  if (!current?.state.claim || current.state.claim.token !== token)
    return yield* new SkillUpdatesCoordinationError({
      operation: "coordination.owner",
      message:
        "Claim no longer belongs to this runner; shared state was not changed",
    });

  const processed =
    outcome === "processed"
      ? [...new Set([...current.state.processed, current.state.claim.runId])]
      : current.state.processed;

  if (!(yield* transition(current, { version: 1, claim: null, processed })))
    return yield* new SkillUpdatesCoordinationError({
      operation: "coordination.conflict",
      message: "Claim changed during release; shared state was not overwritten",
    });
});

export const withSkillUpdatesClaim = <A, E, R>(
  runId: number,
  work: Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const claim = yield* claimSkillUpdates(runId);

    if (claim === null) {
      yield* Console.log(`Workflow run ${runId} has already been processed`);

      return;
    }

    yield* Console.log(`Claimed workflow run ${runId}: ${claim.token}`);
    // Keep the claim on other failures and interruption: an agent may already
    // have published changes, or its server-side session may still be running.
    yield* work.pipe(
      Effect.tapError((error) =>
        error instanceof SkillUpdatesRetryableError
          ? finishSkillUpdatesClaim(claim.token, "retry").pipe(
              Effect.andThen(
                Console.log(`Released claim ${claim.token} for retry`),
              ),
            )
          : Effect.void,
      ),
    );
    yield* finishSkillUpdatesClaim(claim.token, "processed");
  });

export const recoverSkillUpdatesClaim = Effect.fn(
  "UpdatesAgentCoordination.recover",
)(function* (
  token: string,
  outcome: "processed" | "retry",
  confirmedStopped: boolean,
) {
  if (!confirmedStopped)
    return yield* new SkillUpdatesCoordinationError({
      operation: "coordination.recovery",
      message:
        "Stop the owning runner and its OpenCode session, inspect partial work, then pass --confirm-stopped",
    });
  yield* finishSkillUpdatesClaim(token, outcome);
  yield* Console.log(`Recovered claim ${token}: ${outcome}`);
});

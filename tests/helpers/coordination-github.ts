import { Effect, Schema } from "effect";
import { GitHubError, type GitHubService } from "../../src/services/GitHub.js";
import { skillUpdatesStateRef } from "../../src/commands/UpdatesAgentCoordination.js";

const CommitInput = Schema.Struct({
  message: Schema.String,
  tree: Schema.String,
  parents: Schema.Array(Schema.String),
});

const RefInput = Schema.Struct({
  sha: Schema.String,
  ref: Schema.optionalKey(Schema.String),
  force: Schema.optionalKey(Schema.Boolean),
});

const StoredState = Schema.fromJsonString(
  Schema.Struct({
    claim: Schema.NullOr(
      Schema.Struct({ token: Schema.String, runId: Schema.Number }),
    ),
    processed: Schema.Array(Schema.Number),
  }),
);

export const githubFailure = (status: number) =>
  new GitHubError({
    command: "fixture git API",
    exitCode: 1,
    stderr: `HTTP ${status}`,
    status,
    retryable: status >= 500,
  });

// Emulate the Git API contract, including ancestry checks and response loss.
// Barriers at the write boundary force contenders to build from the same head.
export const coordinationGitHub = () => {
  const commits = new Map<string, typeof CommitInput.Type>();
  let head: string | null = null;
  let serial = 0;

  const faults = {
    beforeWrite: (_attempt: number): Effect.Effect<void> => Effect.void,
    failWrites: 0,
    loseResponses: 0,
    readFailure: 0,
  };

  const writes: { sha: string; parent: string | undefined }[] = [];

  const api: GitHubService["api"] = (endpoint, options) =>
    Effect.gen(function* () {
      if (endpoint.includes("/git/ref/")) {
        if (faults.readFailure) return yield* githubFailure(faults.readFailure);

        if (!head) return yield* githubFailure(404);

        return JSON.stringify({ object: { sha: head } });
      }

      if (endpoint.endsWith("/git/trees") && options?.method === "POST")
        return JSON.stringify({ sha: "a".repeat(40) });

      if (endpoint.endsWith("/git/commits") && options?.method === "POST") {
        const commit = yield* Schema.decodeUnknownEffect(CommitInput)(
          options.body,
        ).pipe(Effect.orDie);

        const sha = (++serial).toString(16).padStart(40, "0");
        commits.set(sha, commit);

        return JSON.stringify({ sha });
      }

      if (endpoint.includes("/git/commits/")) {
        const commit = commits.get(endpoint.split("/").at(-1) ?? "");

        if (!commit) return yield* githubFailure(404);

        return JSON.stringify({
          message: commit.message,
          tree: { sha: commit.tree },
        });
      }

      if (endpoint.includes("/git/refs") && options?.method) {
        const input = yield* Schema.decodeUnknownEffect(RefInput)(
          options.body,
        ).pipe(Effect.orDie);

        const commit = commits.get(input.sha);

        if (!commit) return yield* githubFailure(422);
        writes.push({ sha: input.sha, parent: commit.parents[0] });
        yield* faults.beforeWrite(writes.length);

        if (faults.failWrites > 0) {
          faults.failWrites--;

          return yield* githubFailure(503);
        }

        if (options.method === "POST") {
          if (input.ref !== `refs/${skillUpdatesStateRef}`)
            return yield* githubFailure(422);

          if (head !== null) return yield* githubFailure(422);
        } else {
          if (input.force !== false)
            return yield* Effect.die("Ref updates must never force");

          if (head === null) return yield* githubFailure(404);
          let ancestor: string | undefined = input.sha;

          while (ancestor && ancestor !== head)
            ancestor = commits.get(ancestor)?.parents[0];

          if (ancestor !== head) return yield* githubFailure(422);
        }

        head = input.sha;

        if (faults.loseResponses > 0) {
          faults.loseResponses--;

          return yield* githubFailure(503);
        }

        return JSON.stringify({ object: { sha: head } });
      }

      return yield* Effect.die(`Unexpected Git API request: ${endpoint}`);
    });

  return {
    api,
    faults,
    writes,
    state: () =>
      Schema.decodeUnknownSync(StoredState)(commits.get(head ?? "")?.message),
    head: () => head,
  };
};

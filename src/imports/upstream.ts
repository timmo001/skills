import { Api } from "@timmo001/effect-gh";
import { Effect, FileSystem, Match, Path, Schema } from "effect";
import { CommandExecutor } from "../services/CommandExecutor.js";
import { GitHub, type GitHubError } from "../services/GitHub.js";

export const SkillOrigin = Schema.Struct({
  owner: Schema.String,
  repo: Schema.String,
  branch: Schema.String,
  path: Schema.String,
  type: Schema.Literals(["directory", "file"]),
});

export interface SkillOrigin extends Schema.Schema.Type<typeof SkillOrigin> {}

export class InvalidOriginError extends Schema.TaggedError<InvalidOriginError>()(
  "InvalidOriginError",
  { origin: Schema.String },
) {}

export class DeletedOriginError extends Schema.TaggedError<DeletedOriginError>()(
  "DeletedOriginError",
  { origin: Schema.String },
) {}

export class UpstreamTransportError extends Schema.TaggedError<UpstreamTransportError>()(
  "UpstreamTransportError",
  { operation: Schema.String, command: Schema.String, stderr: Schema.String },
) {}

export class UpstreamStatusError extends Schema.TaggedError<UpstreamStatusError>()(
  "UpstreamStatusError",
  {
    operation: Schema.String,
    status: Schema.Int,
    stderr: Schema.String,
  },
) {}

export class UpstreamDecodeError extends Schema.TaggedError<UpstreamDecodeError>()(
  "UpstreamDecodeError",
  { operation: Schema.String, message: Schema.String },
) {}

const upstreamFailure = (operation: string, error: GitHubError) =>
  error.status === null
    ? new UpstreamTransportError({
        operation,
        command: error.command,
        stderr: error.stderr,
      })
    : new UpstreamStatusError({
        operation,
        status: error.status,
        stderr: error.stderr,
      });

const originUrl = (origin: SkillOrigin) =>
  `https://github.com/${origin.owner}/${origin.repo}/${origin.type === "file" ? "blob" : "tree"}/${origin.branch}/${origin.path}`;

export const parseOrigin = (
  origin: string,
): Effect.Effect<SkillOrigin, InvalidOriginError> => {
  const match = origin.match(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(tree|blob)\/([^/]+)\/(.*)$/,
  );

  if (!match || (match[3] === "blob" && !match[5]?.endsWith("SKILL.md"))) {
    return Effect.fail(new InvalidOriginError({ origin }));
  }

  return Effect.succeed({
    owner: match[1] ?? "",
    repo: match[2] ?? "",
    branch: match[4] ?? "",
    path: match[5] ?? "",
    type: match[3] === "blob" ? "file" : "directory",
  });
};

export const latestPathSha = Effect.fn("Upstream.latestPathSha")(function* (
  origin: SkillOrigin,
) {
  const github = yield* GitHub;
  const endpoint = `repos/${origin.owner}/${origin.repo}/commits?path=${encodeURIComponent(origin.path)}&per_page=1&sha=${encodeURIComponent(origin.branch)}`;

  const commits = yield* github
    .read(
      endpoint,
      Api.json(
        { endpoint, method: "GET" },
        Schema.Array(Schema.Struct({ sha: Schema.String })),
      ),
    )
    .pipe(
      Effect.mapError((error) =>
        error.decode
          ? new UpstreamDecodeError({
              operation: "latest-sha",
              message: error.stderr,
            })
          : upstreamFailure("latest-sha", error),
      ),
    );

  const sha = commits[0]?.sha;

  if (!sha) {
    return yield* new DeletedOriginError({ origin: originUrl(origin) });
  }

  if (!/^[0-9a-f]{40}$/.test(sha)) {
    return yield* new UpstreamDecodeError({
      operation: "latest-sha",
      message: "GitHub returned an invalid commit SHA",
    });
  }

  return sha;
});

export const UpstreamFileChange = Schema.Struct({
  path: Schema.String,
  status: Schema.Literals(["added", "modified", "removed"]),
});

export interface UpstreamFileChange extends Schema.Schema.Type<
  typeof UpstreamFileChange
> {}

/** Upstream directory holding the skill: the origin itself, or a SKILL.md origin's parent. */
export const originDirectory = (origin: SkillOrigin) =>
  origin.type === "file"
    ? origin.path.split("/").slice(0, -1).join("/")
    : origin.path;

export const parseNameStatus = (output: string): UpstreamFileChange[] => {
  const fields = output.split("\0");
  const changes: UpstreamFileChange[] = [];

  for (let index = 0; index + 1 < fields.length; index += 2) {
    const status = fields[index];
    const path = fields[index + 1];

    if (!status || !path) continue;
    changes.push({
      path,
      status: Match.value(status).pipe(
        Match.when("A", () => "added" as const),
        Match.when("D", () => "removed" as const),
        Match.orElse(() => "modified" as const),
      ),
    });
  }

  return changes;
};

/** Files changed under the skill's upstream directory between two commits. */
export const upstreamFileChanges = Effect.fn("Upstream.fileChanges")(function* (
  origin: SkillOrigin,
  before: string,
  after: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const executor = yield* CommandExecutor;

  return yield* Effect.scoped(
    Effect.gen(function* () {
      const temp = yield* fs.makeTempDirectoryScoped({
        prefix: "skill-upstream-diff-",
      });

      const checkout = path.join(temp, "source.git");
      yield* executor.run("git", [
        "clone",
        "--quiet",
        "--bare",
        "--filter=blob:none",
        `https://github.com/${origin.owner}/${origin.repo}.git`,
        checkout,
      ]);

      // Tree comparison only: rename detection would fetch every blob.
      const output = yield* executor.run("git", [
        "-C",
        checkout,
        "diff",
        "--name-status",
        "--no-renames",
        "-z",
        before,
        after,
        "--",
        originDirectory(origin) || ".",
      ]);

      return parseNameStatus(output);
    }),
  );
});

export const originExists = Effect.fn("Upstream.originExists")(function* (
  origin: SkillOrigin,
) {
  const github = yield* GitHub;
  const endpoint = `repos/${origin.owner}/${origin.repo}/contents/${origin.path}?ref=${encodeURIComponent(origin.branch)}`;

  return yield* github
    .read(endpoint, Api.empty({ endpoint, method: "GET" }))
    .pipe(
      Effect.as(true),
      Effect.catch(
        (
          error,
        ): Effect.Effect<
          never,
          DeletedOriginError | UpstreamStatusError | UpstreamTransportError
        > =>
          error.status === 404
            ? Effect.fail(
                new DeletedOriginError({
                  origin: originUrl(origin),
                }),
              )
            : Effect.fail(upstreamFailure("origin.exists", error)),
      ),
    );
});

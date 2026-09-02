import { Effect, Schema } from "effect";
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
  const json = yield* github
    .apiJson(endpoint)
    .pipe(Effect.mapError((error) => upstreamFailure("latest-sha", error)));
  const CommitList = Schema.Array(Schema.Struct({ sha: Schema.String }));
  const commits = yield* Schema.decodeUnknownEffect(CommitList)(json).pipe(
    Effect.mapError(
      (cause) =>
        new UpstreamDecodeError({
          operation: "latest-sha",
          message: String(cause),
        }),
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

export const originExists = Effect.fn("Upstream.originExists")(function* (
  origin: SkillOrigin,
) {
  const github = yield* GitHub;
  const endpoint = `repos/${origin.owner}/${origin.repo}/contents/${origin.path}?ref=${encodeURIComponent(origin.branch)}`;
  return yield* github.api(endpoint).pipe(
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

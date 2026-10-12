import { Release } from "@timmo001/effect-gh";
import { Effect, Result, Schema } from "effect";
import { GitHub } from "../services/GitHub.js";
import { type SkillsFile, readSkillsFile } from "./metadata.js";
import type { SkillOrigin } from "./upstream.js";

export interface LatestRelease {
  readonly tagName: string;
  readonly url: string;
}

/** Each repository's latest release, or why it could not be read, keyed by `owner/name`. */
export type LatestReleases = ReadonlyMap<
  string,
  Result.Result<LatestRelease, string>
>;

export class ReleaseUnavailableError extends Schema.TaggedError<ReleaseUnavailableError>()(
  "ReleaseUnavailableError",
  { repo: Schema.String, reason: Schema.String },
) {}

const repoKey = (repo: string) => repo.toLowerCase();

/** A repository's entry in {@link LatestReleases}, matched without case. */
export const releaseOf = (releases: LatestReleases, repo: string) =>
  releases.get(repoKey(repo));

/** Repositories some skill lists as a tool, so their releases call for a review. */
export const toolRepositories = (file: SkillsFile) =>
  new Set(
    Object.values(file.skills).flatMap((entry) =>
      (entry.tools ?? []).map((tool) => repoKey(tool.repo)),
    ),
  );

/** Read the latest release of each repository once. */
export const latestReleases = Effect.fn("Releases.latest")(function* (
  repos: Iterable<string>,
) {
  const github = yield* GitHub;
  const releases = new Map<string, Result.Result<LatestRelease, string>>();

  for (const repo of new Set([...repos].map(repoKey))) {
    const release = yield* Effect.result(
      github.read(
        "gh release view",
        Release.view({ repo, fields: ["tagName", "url"] }),
      ),
    );

    releases.set(
      repo,
      Result.isSuccess(release)
        ? Result.succeed(release.success)
        : Result.fail(release.failure.stderr || release.failure.command),
    );
  }

  return releases satisfies LatestReleases;
});

/**
 * Latest releases of the tool repositories that imports also come from. Those
 * imports move only at release tags, so one release brings them and the
 * skills reviewed against it together.
 */
export const importReleases = Effect.fn("Releases.imports")(function* (
  root: string,
) {
  const { file } = yield* readSkillsFile(root);
  const tools = toolRepositories(file);

  const repos = Object.values(file.skills).flatMap((entry) => {
    const repo = entry.import?.origin.match(
      /^https:\/\/github\.com\/([^/]+\/[^/]+)\//,
    )?.[1];

    return repo && tools.has(repoKey(repo)) ? [repo] : [];
  });

  return yield* latestReleases(repos);
});

/**
 * The release tag an import follows: its repository's latest release when it
 * is a tool repository, or null to follow the origin's branch.
 */
export const releaseTag = (
  origin: SkillOrigin,
  releases: LatestReleases,
): Result.Result<string | null, ReleaseUnavailableError> => {
  const repo = `${origin.owner}/${origin.repo}`;
  const release = releaseOf(releases, repo);

  if (!release) return Result.succeed(null);

  return Result.isSuccess(release)
    ? Result.succeed(release.success.tagName)
    : Result.fail(
        new ReleaseUnavailableError({ repo, reason: release.failure }),
      );
};

import { Api, Release } from "@timmo001/effect-gh";
import { Effect, Result, Schema } from "effect";
import { GitHub } from "../services/GitHub.js";
import { type SkillsFile, readSkillsFile } from "./metadata.js";
import type { SkillOrigin } from "./upstream.js";

export interface LatestRelease {
  readonly tagName: string;
  readonly url: string;
}

/** Each repository's latest release, or why it could not be read, keyed by `owner/name` and tag pattern. */
export type LatestReleases = ReadonlyMap<
  string,
  Result.Result<LatestRelease, string>
>;

/** Where a tool's newest version is read from: its latest release, or its newest tag matching `tags`. */
export interface ReleaseSource {
  readonly repo: string;
  readonly tags?: string | undefined;
}

export class ReleaseUnavailableError extends Schema.TaggedError<ReleaseUnavailableError>()(
  "ReleaseUnavailableError",
  { repo: Schema.String, reason: Schema.String },
) {}

const repoKey = (repo: string) => repo.toLowerCase();

const sourceKey = ({ repo, tags }: ReleaseSource) =>
  tags === undefined ? repoKey(repo) : `${repoKey(repo)} ${tags}`;

/** A source's entry in {@link LatestReleases}, matched without case. */
export const releaseOf = (releases: LatestReleases, source: ReleaseSource) =>
  releases.get(sourceKey(source));

/** Repositories some skill lists as a tool, so their releases call for a review. */
export const toolRepositories = (file: SkillsFile) =>
  new Set(
    Object.values(file.skills).flatMap((entry) =>
      (entry.tools ?? []).map((tool) => repoKey(tool.repo)),
    ),
  );

/** Every distinct place a skill's tools are read from. */
export const toolSources = (file: SkillsFile): ReleaseSource[] => [
  ...new Map(
    Object.values(file.skills).flatMap((entry) =>
      (entry.tools ?? []).map((tool) => {
        const source = { repo: tool.repo, tags: tool.tags };

        return [sourceKey(source), source] as const;
      }),
    ),
  ).values(),
];

const stableVersion = /(\d+)\.(\d+)\.(\d+)$/u;

/**
 * The highest stable version among the tags matching a pattern, read from the
 * `x.y.z` each tag ends with. Prereleases and other tags are skipped.
 */
export const newestTag = (tags: readonly string[], pattern: string) => {
  const matcher = new RegExp(pattern, "u");

  const versions = tags.flatMap((tag) => {
    const version = matcher.test(tag) ? stableVersion.exec(tag) : null;

    return version ? [{ tag, parts: version.slice(1).map(Number) }] : [];
  });

  const compare = (a: readonly number[], b: readonly number[]) =>
    a.reduce((order, part, index) => order || part - (b[index] ?? 0), 0);

  return versions.reduce<(typeof versions)[number] | undefined>(
    (newest, version) =>
      newest && compare(newest.parts, version.parts) >= 0 ? newest : version,
    undefined,
  )?.tag;
};

const TagRefs = Schema.Array(Schema.Struct({ ref: Schema.String }));

const latestTag = Effect.fn("Releases.latestTag")(function* (
  repo: string,
  pattern: string,
) {
  const github = yield* GitHub;
  const endpoint = `repos/${repo}/git/matching-refs/tags/`;

  const pages = yield* github.read(
    endpoint,
    Api.pages({ endpoint, method: "GET" }, TagRefs),
  );

  const tag = newestTag(
    pages.flat().map(({ ref }) => ref.replace(/^refs\/tags\//u, "")),
    pattern,
  );

  return tag === undefined
    ? Result.fail(`no tag matches ${pattern}`)
    : Result.succeed({
        tagName: tag,
        url: `https://github.com/${repo}/tree/${tag}`,
      });
});

/** Read the latest release, or newest matching tag, of each source once. */
export const latestReleases = Effect.fn("Releases.latest")(function* (
  sources: Iterable<ReleaseSource>,
) {
  const github = yield* GitHub;
  const releases = new Map<string, Result.Result<LatestRelease, string>>();

  for (const source of sources) {
    const key = sourceKey(source);

    if (releases.has(key)) continue;

    if (source.tags !== undefined) {
      const tag = yield* Effect.result(latestTag(source.repo, source.tags));

      releases.set(
        key,
        Result.isSuccess(tag)
          ? tag.success
          : Result.fail(tag.failure.stderr || tag.failure.command),
      );

      continue;
    }

    const release = yield* Effect.result(
      github.read(
        "gh release view",
        Release.view({
          repo: repoKey(source.repo),
          fields: ["tagName", "url"],
        }),
      ),
    );

    releases.set(
      key,
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

    return repo && tools.has(repoKey(repo)) ? [{ repo }] : [];
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
  const release = releaseOf(releases, { repo });

  if (!release) return Result.succeed(null);

  return Result.isSuccess(release)
    ? Result.succeed(release.success.tagName)
    : Result.fail(
        new ReleaseUnavailableError({ repo, reason: release.failure }),
      );
};

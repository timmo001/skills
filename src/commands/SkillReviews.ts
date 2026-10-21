import { Console, Effect, Result, Schema } from "effect";
import {
  SKILLS_FILE,
  formatSkillsFile,
  readSkillsFile,
  writeReviewedTags,
} from "../imports/metadata.js";
import { latestReleases, releaseOf, toolSources } from "../imports/releases.js";
import { GitHub } from "../services/GitHub.js";

export const SkillReviewItem = Schema.Struct({
  skill: Schema.String,
  repo: Schema.String,
  state: Schema.Literals(["up-to-date", "release-available", "error"]),
  reviewed: Schema.String,
  latest: Schema.NullOr(Schema.String),
  url: Schema.NullOr(Schema.String),
  reason: Schema.optionalKey(Schema.String),
});

export interface SkillReviewItem extends Schema.Schema.Type<
  typeof SkillReviewItem
> {}

export const SkillReviewReport = Schema.Struct({
  version: Schema.Literal(1),
  items: Schema.Array(SkillReviewItem),
});

export interface SkillReviewReport extends Schema.Schema.Type<
  typeof SkillReviewReport
> {}

export class SkillReviewsRequiredError extends Schema.TaggedError<SkillReviewsRequiredError>()(
  "SkillReviewsRequiredError",
  { message: Schema.String },
) {}

/** Compare each skill's reviewed tool releases with the latest, reading each repository once. */
export const buildSkillReviewReport = Effect.fn("SkillReviews.buildReport")(
  function* (root: string) {
    const { file } = yield* readSkillsFile(root);

    const entries = Object.entries(file.skills).sort(([a], [b]) =>
      a.localeCompare(b),
    );

    const latest = yield* latestReleases(toolSources(file));

    const items = entries.flatMap(([skill, entry]) =>
      (entry.tools ?? []).map((tool): SkillReviewItem => {
        const release = releaseOf(latest, tool);

        if (!release || Result.isFailure(release))
          return {
            skill,
            repo: tool.repo,
            state: "error",
            reviewed: tool.reviewed,
            latest: null,
            url: null,
            reason: release ? release.failure : "release not read",
          };

        return {
          skill,
          repo: tool.repo,
          state:
            release.success.tagName === tool.reviewed
              ? "up-to-date"
              : "release-available",
          reviewed: tool.reviewed,
          latest: release.success.tagName,
          url: release.success.url,
        };
      }),
    );

    return { version: 1, items } satisfies SkillReviewReport;
  },
);

/** The dashboard section listing skills whose tools have a newer release. */
export const renderSkillReviewMarkdown = (report: SkillReviewReport) => {
  const behind = report.items.filter(
    ({ state }) => state === "release-available",
  );

  const problems = report.items.filter(({ state }) => state === "error");

  return [
    "## Skill reviews",
    "",
    ...(behind.length === 0
      ? ["None."]
      : behind.map(
          (item) =>
            `- **${item.skill}**: ${item.repo} \`${item.reviewed}\` -> [\`${item.latest}\`](${item.url})`,
        )),
    ...(problems.length === 0
      ? []
      : [
          "",
          "### Problems",
          "",
          ...problems.map(
            (item) => `- **${item.skill}**: ${item.repo}: ${item.reason}`,
          ),
        ]),
    "",
    `Checked ${report.items.length} tool reviews; ${behind.length} need a review.`,
    "",
  ].join("\n");
};

export const skillReviews = Effect.fn("SkillReviews.run")(function* (
  root: string,
  options: {
    readonly json: boolean;
    readonly check: boolean;
    readonly format: boolean;
    readonly reviewed?: string | undefined;
  },
) {
  if (options.format) {
    yield* formatSkillsFile(root);
    yield* Console.log(`${SKILLS_FILE} is in canonical form`);

    return;
  }

  const github = yield* GitHub;

  if (!(yield* github.isAvailable())) {
    yield* Console.error("gh CLI not available; skipping release checks");

    return;
  }

  yield* github.waitForNetwork();

  const report = yield* buildSkillReviewReport(root);

  if (options.reviewed) {
    const skill = options.reviewed;
    const items = report.items.filter((item) => item.skill === skill);

    if (items.length === 0)
      return yield* new SkillReviewsRequiredError({
        message: `${skill} has no tool reviews in ${SKILLS_FILE}`,
      });

    const failed = items.filter(({ state }) => state === "error");

    if (failed.length > 0)
      return yield* new SkillReviewsRequiredError({
        message: `${skill}: could not read the latest release of ${failed.map(({ repo }) => repo).join(", ")}`,
      });

    const tags = new Map(
      items.flatMap((item) =>
        item.state === "release-available" && item.latest
          ? [[item.repo, item.latest] as const]
          : [],
      ),
    );

    yield* writeReviewedTags(root, skill, tags);

    for (const [repo, tag] of tags)
      yield* Console.log(`${skill} ${repo}: reviewed at ${tag}`);

    if (tags.size === 0) yield* Console.log(`${skill}: already up to date`);

    return;
  }

  if (options.json) yield* Console.log(JSON.stringify(report, null, 2));
  else
    for (const item of report.items)
      yield* Console.log(`${item.skill} ${item.repo}: ${item.state}`);

  if (options.check && report.items.some(({ state }) => state !== "up-to-date"))
    return yield* new SkillReviewsRequiredError({
      message: "Skill reviews needed",
    });
});

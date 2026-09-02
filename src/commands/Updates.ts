import { Console, Effect, Path, Schema } from "effect";
import { check as reviewImports } from "./Check.js";
import { importSkill } from "./Import.js";
import {
  type ImportMetadata,
  readImports,
  trackedSkillPath,
} from "../imports/metadata.js";
import { directoryChanges, withFetched } from "../imports/snapshot.js";
import {
  DeletedOriginError,
  latestPathSha,
  originExists,
  parseOrigin,
} from "../imports/upstream.js";
import { CommandExecutor } from "../services/CommandExecutor.js";
import { GitHub } from "../services/GitHub.js";

export const UpdateReportItem = Schema.Struct({
  name: Schema.String,
  directory: Schema.String,
  state: Schema.Literals([
    "up-to-date",
    "update-available",
    "manual-review",
    "invalid-origin",
    "origin-gone",
    "error",
  ]),
  origin: Schema.String,
  storedSha: Schema.NullOr(Schema.String),
  upstreamSha: Schema.NullOr(Schema.String),
  files: Schema.Array(
    Schema.Struct({
      path: Schema.String,
      status: Schema.Literals([
        "modified",
        "removed-upstream",
        "added-upstream",
      ]),
    }),
  ),
  localEdits: Schema.Array(Schema.String),
  reason: Schema.optionalKey(Schema.String),
});
export interface UpdateReportItem
  extends Schema.Schema.Type<typeof UpdateReportItem> {}
export const UpdateReport = Schema.Struct({
  version: Schema.Literal(1),
  skills: Schema.Array(UpdateReportItem),
  error: Schema.optionalKey(Schema.String),
});
export interface UpdateReport extends Schema.Schema.Type<typeof UpdateReport> {}

export class UpdatesRequiredError extends Schema.TaggedError<UpdatesRequiredError>()(
  "UpdatesRequiredError",
  { message: Schema.String },
) {}

const compareFiles = Effect.fn("Updates.compareFiles")(function* (
  root: string,
  name: string,
  metadata: ImportMetadata,
) {
  const path = yield* Path.Path;
  return yield* withFetched(root, name, metadata, (candidate) =>
    Effect.gen(function* () {
      const target = path.dirname(trackedSkillPath(root, name, metadata, path));
      return yield* directoryChanges(
        target,
        candidate,
        metadata.distribution === "official-source"
          ? "UPSTREAM_SKILL.md"
          : "SKILL.md",
      );
    }),
  );
});

export const buildUpdateReport = Effect.fn("Updates.buildReport")(function* (
  root: string,
  skill?: string,
) {
  const file = yield* readImports(root);
  const names = Object.keys(file.imports)
    .filter((name) => !skill || name === skill)
    .sort();
  if (skill && names.length === 0) {
    return yield* new UpdatesRequiredError({
      message: `Imported skill not found: ${skill}`,
    });
  }
  const skills: UpdateReportItem[] = [];
  for (const name of names) {
    const metadata = file.imports[name];
    if (!metadata) continue;
    const originResult = yield* Effect.result(parseOrigin(metadata.origin));
    if (originResult._tag === "Failure") {
      skills.push({
        name,
        directory: name,
        state: "invalid-origin",
        origin: metadata.origin,
        storedSha: metadata.upstreamSha,
        upstreamSha: null,
        files: [],
        localEdits: metadata.localEdits,
        reason: "invalid origin URL",
      });
      continue;
    }
    const origin = originResult.success;
    const exists = yield* Effect.result(originExists(origin));
    if (exists._tag === "Failure") {
      skills.push({
        name,
        directory: name,
        state:
          exists.failure instanceof DeletedOriginError
            ? "origin-gone"
            : "error",
        origin: metadata.origin,
        storedSha: metadata.upstreamSha,
        upstreamSha: null,
        files: [],
        localEdits: metadata.localEdits,
        reason:
          exists.failure instanceof DeletedOriginError
            ? "upstream path no longer exists"
            : exists.failure._tag === "UpstreamStatusError"
              ? `GitHub returned HTTP ${exists.failure.status}`
              : exists.failure.stderr,
      });
      continue;
    }
    const latest = yield* Effect.result(latestPathSha(origin));
    if (latest._tag === "Failure") {
      skills.push({
        name,
        directory: name,
        state:
          latest.failure instanceof DeletedOriginError
            ? "origin-gone"
            : "error",
        origin: metadata.origin,
        storedSha: metadata.upstreamSha,
        upstreamSha: null,
        files: [],
        localEdits: metadata.localEdits,
        reason:
          latest.failure instanceof DeletedOriginError
            ? "upstream path no longer exists"
            : latest.failure._tag === "UpstreamStatusError"
              ? `GitHub returned HTTP ${latest.failure.status}`
              : latest.failure._tag === "UpstreamTransportError"
                ? latest.failure.stderr
                : latest.failure.message,
      });
      continue;
    }
    if (latest.success === metadata.upstreamSha) {
      skills.push({
        name,
        directory: name,
        state: "up-to-date",
        origin: metadata.origin,
        storedSha: metadata.upstreamSha,
        upstreamSha: latest.success,
        files: [],
        localEdits: metadata.localEdits,
      });
      continue;
    }
    const comparisonResult = yield* Effect.result(
      compareFiles(root, name, metadata),
    );
    if (comparisonResult._tag === "Failure") {
      skills.push({
        name,
        directory: name,
        state: "error",
        origin: metadata.origin,
        storedSha: metadata.upstreamSha,
        upstreamSha: latest.success,
        files: [],
        localEdits: metadata.localEdits,
        reason:
          comparisonResult.failure instanceof Error
            ? comparisonResult.failure.message
            : String(comparisonResult.failure),
      });
      continue;
    }
    const files = comparisonResult.success;
    const equal = files.length === 0;
    skills.push({
      name,
      directory: name,
      state: equal
        ? "up-to-date"
        : metadata.localEdits.length > 0
          ? "manual-review"
          : "update-available",
      origin: metadata.origin,
      storedSha: metadata.upstreamSha,
      upstreamSha: latest.success,
      files,
      localEdits: metadata.localEdits,
    });
  }
  return { version: 1, skills } satisfies UpdateReport;
});

export const renderUpdateMarkdown = (report: UpdateReport) => {
  const section = (title: string, state: UpdateReportItem["state"]) => {
    const items = report.skills.filter((item) => item.state === state);
    return [
      `## ${title}`,
      "",
      ...(items.length === 0
        ? ["None."]
        : items.map(
            (item) =>
              `- **${item.name}**: \`${item.storedSha ?? "unknown"}\` -> \`${item.upstreamSha}\`\n  - ${item.origin}`,
          )),
    ];
  };
  const problems = report.skills.filter((item) =>
    ["error", "invalid-origin", "origin-gone"].includes(item.state),
  );
  const attention = report.skills.filter((item) => item.state !== "up-to-date");
  return [
    "<!-- adapted-skill-updates -->",
    "",
    "Tracked skills whose upstream source needs attention.",
    "",
    ...section("Manual review", "manual-review"),
    "",
    ...section("Upstream updates", "update-available"),
    "",
    "## Problems",
    "",
    ...(problems.length === 0
      ? ["None."]
      : problems.map((item) => `- **${item.name}**: ${item.reason}`)),
    "",
    `Checked ${report.skills.length} imports; ${attention.length} need attention.`,
    "",
  ].join("\n");
};

export const updates = Effect.fn("Updates.run")(function* (
  root: string,
  options: {
    readonly check: boolean;
    readonly update: boolean;
    readonly json: boolean;
    readonly skill?: string | undefined;
    readonly noCommit: boolean;
    readonly skipReview: boolean;
  },
) {
  const github = yield* GitHub;
  if (!(yield* github.isAvailable())) {
    if (options.json)
      yield* Console.log(
        JSON.stringify({
          version: 1,
          skills: [],
          error: "gh CLI not available",
        } satisfies UpdateReport),
      );
    else yield* Console.error("gh CLI not available; skipping origin checks");
    return;
  }
  const report = yield* buildUpdateReport(root, options.skill);
  const mode =
    options.json || options.check
      ? "check"
      : options.update
        ? "update"
        : "interactive";
  if (options.json) {
    yield* Console.log(JSON.stringify(report, null, 2));
  } else {
    for (const item of report.skills)
      yield* Console.log(`${item.name}: ${item.state}`);
  }
  if (mode !== "check") {
    const imports = yield* readImports(root);
    const path = yield* Path.Path;
    const updatedNames: string[] = [];
    const updatedPaths: string[] = [];
    for (const item of report.skills.filter(
      ({ state }) => state === "update-available" || state === "up-to-date",
    )) {
      const metadata = imports.imports[item.name];
      if (!metadata || !item.upstreamSha || item.upstreamSha === item.storedSha)
        continue;
      if (item.state === "up-to-date") {
        yield* importSkill(root, item.name, {
          apply: false,
          metadataOnly: true,
          reviewedSha: item.upstreamSha,
        });
      } else {
        yield* importSkill(root, item.name, {
          apply: true,
          metadataOnly: false,
        });
      }
      updatedNames.push(item.name);
      updatedPaths.push(
        metadata.distribution === "official-source"
          ? path.join("upstream", item.name)
          : item.name,
      );
    }
    if (updatedNames.length > 0 && !options.noCommit) {
      const executor = yield* CommandExecutor;
      const paths = ["imports.json", ...updatedPaths];
      const staged = yield* executor.inherit(
        "git",
        ["add", "-A", "--", ...paths],
        { cwd: root },
      );
      if (staged !== 0)
        return yield* new UpdatesRequiredError({ message: "git add failed" });
      const committed = yield* executor.inherit(
        "git",
        [
          "commit",
          "-m",
          `Update skills: ${updatedNames.join(", ")}`,
          "--",
          ...paths,
        ],
        { cwd: root },
      );
      if (committed !== 0)
        return yield* new UpdatesRequiredError({
          message: "git commit failed",
        });
    }
    const reviews = report.skills.filter(
      ({ state }) => state === "manual-review",
    );
    if (mode === "interactive" && !options.skipReview) {
      for (const item of reviews) {
        yield* reviewImports(root, {
          skill: item.name,
          diffOrigin: true,
          openOpencode: true,
        });
      }
    }
    if (options.skill && reviews.length > 0) {
      return yield* new UpdatesRequiredError({
        message: `Skill ${options.skill} has local edits and requires manual review`,
      });
    }
  }
  if (
    options.check &&
    report.skills.some(({ state }) => state !== "up-to-date")
  ) {
    return yield* new UpdatesRequiredError({
      message: "Skill updates available",
    });
  }
});

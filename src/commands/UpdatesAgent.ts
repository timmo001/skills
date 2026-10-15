import {
  Api,
  GhChunk,
  Issue,
  PullRequest,
  Workflow,
} from "@timmo001/effect-gh";
import { createHash } from "node:crypto";
import {
  Cause,
  Config,
  Console,
  Effect,
  Exit,
  FileSystem,
  Option,
  Path,
  Redacted,
  Result,
  Schedule,
  Schema,
  Stream,
} from "effect";
import { Yaml } from "effect/encoding";
import type { Mutable } from "effect/Types";
import {
  buildUpdateReport,
  renderUpdateMarkdown,
  type UpdateReportItem,
} from "./Updates.js";
import {
  CATALOGUE_FILE,
  MARKETPLACE_FILE,
  writeSkillsCatalogue,
} from "./Catalogue.js";
import { importSkill } from "./Import.js";
import {
  type SkillReviewItem,
  buildSkillReviewReport,
  renderSkillReviewMarkdown,
} from "./SkillReviews.js";
import {
  SKILLS_FILE,
  type SkillEntry,
  type SkillsFile,
  decodeSkillsFile,
  getImport,
  renderSkillsFile,
} from "../imports/metadata.js";
import {
  originDirectory,
  parseOrigin,
  type SkillOrigin,
  type UpstreamFileChange,
  upstreamFileChanges,
} from "../imports/upstream.js";
import { CommandError, CommandExecutor } from "../services/CommandExecutor.js";
import { SkillsCli } from "../services/SkillsCli.js";
import { GitHub, NetworkUnavailableError } from "../services/GitHub.js";
import {
  type SkillUpdatesCoordinationError,
  SkillUpdatesRetryableError,
  withSkillUpdatesClaim,
} from "./UpdatesAgentCoordination.js";
import {
  createSkillUpdatesSession,
  readSkillUpdatesSessionUsage,
  SkillUpdatesPermissions,
  stopSkillUpdatesSession,
  type SkillUpdatesSessionUsage,
} from "./UpdatesAgentPermissions.js";

const SUCCESS_PREFIX = "STATUS: success";

const failureStatusLine = /^STATUS: failure\b/;

const SKILL_UPDATES_STATUS_REMINDER =
  "Your last message had no status line. Reply with one line containing only `STATUS: success` or `STATUS: failure` for this run, then a concise summary. Do not do any more work.";

export const SkillUpdatesAgentModel = Schema.Struct({
  providerID: Schema.NonEmptyString,
  modelID: Schema.NonEmptyString,
  variant: Schema.optionalKey(Schema.NonEmptyString),
});

export interface SkillUpdatesAgentModel extends Schema.Schema.Type<
  typeof SkillUpdatesAgentModel
> {}

export const SkillUpdatesAgentConfig = Schema.Struct({
  workflowApi: Schema.NonEmptyString,
  dashboardIssue: Schema.NonEmptyString,
  repositories: Schema.Array(Schema.NonEmptyString).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(10),
  ),
  stateFile: Schema.NonEmptyString,
  opencodeCommand: Schema.NonEmptyString,
  opencodeArgs: Schema.optionalKey(Schema.Array(Schema.String)),
  opencodeAgent: Schema.NonEmptyString,
  opencodePermissions: SkillUpdatesPermissions,
  opencodeModels: Schema.Array(SkillUpdatesAgentModel).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(5),
  ),
  prompt: Schema.NonEmptyString,
});

export interface SkillUpdatesAgentConfig extends Schema.Schema.Type<
  typeof SkillUpdatesAgentConfig
> {}

const WorkflowRun = Schema.Struct({
  id: Schema.Int.check(Schema.isGreaterThan(0)),
  conclusion: Schema.NullOr(Schema.String),
  html_url: Schema.String,
});

const WorkflowRuns = Schema.Struct({
  workflow_runs: Schema.Array(WorkflowRun),
});

const SKILLS_REPOSITORY = "timmo001/skills";

/** The 100 most recent pull requests in any state, newest first. */
const recentPullRequests = Effect.fn("UpdatesAgent.recentPullRequests")(
  function* () {
    const github = yield* GitHub;

    return yield* github.read(
      "gh pr list",
      PullRequest.query({
        repository: SKILLS_REPOSITORY,
        state: "all",
        limit: 100,
        fields: ["number"],
      }),
    );
  },
);

/** A pull request's unified diff. */
const pullRequestDiff = Effect.fn("UpdatesAgent.pullRequestDiff")(function* (
  number: number,
) {
  const github = yield* GitHub;

  return yield* github.read(
    "gh pr diff",
    PullRequest.diff(number, { repository: SKILLS_REPOSITORY }),
  );
});

/** A pull request's `skills.yml`, decoded at its merge base with `main` and at its head. */
const pullRequestSkillsFiles = Effect.fn("UpdatesAgent.pullRequestSkillsFiles")(
  function* (root: string, number: number) {
    const github = yield* GitHub;
    const executor = yield* CommandExecutor;

    const { headRefOid } = yield* github.read(
      "gh pr view",
      PullRequest.get({
        selector: number,
        repository: SKILLS_REPOSITORY,
        fields: ["headRefOid"],
      }),
    );

    yield* runOrFail(
      "git",
      ["fetch", "--quiet", "origin", "main", `refs/pull/${number}/head`],
      root,
    );

    const git = (args: readonly string[]) =>
      executor.run("git", args, { cwd: root }).pipe(
        Effect.mapError(
          (error) =>
            new SkillUpdatesAgentError({
              operation: `git ${args.join(" ")}`,
              message: error.stderr,
            }),
        ),
      );

    const base = (yield* git(["merge-base", "origin/main", headRefOid])).trim();

    const read = (ref: string) =>
      git(["show", `${ref}:${SKILLS_FILE}`]).pipe(
        Effect.flatMap((text) =>
          decodeSkillsFile(text).pipe(Effect.map((file) => ({ file, text }))),
        ),
        Effect.mapError(
          (error) =>
            new SkillUpdatesAgentError({
              operation: "pull-request.skills",
              message: `Pull request #${number}: ${error.message}`,
            }),
        ),
      );

    const before = yield* read(base);
    const after = yield* read(headRefOid);

    return {
      before: before.file,
      after: after.file,
      head: headRefOid,
      headText: after.text,
    };
  },
);

export class SkillUpdatesAgentError extends Schema.TaggedError<SkillUpdatesAgentError>()(
  "SkillUpdatesAgentError",
  { operation: Schema.String, message: Schema.String },
) {}

/** A checkout is in use, so the run waits for a later attempt. */
export class SkillUpdatesDeferredError extends Schema.TaggedError<SkillUpdatesDeferredError>()(
  "SkillUpdatesDeferredError",
  {
    message: Schema.String,
    /** The locked child run already printed its `[RESULT] ` line. */
    reported: Schema.optionalKey(Schema.Boolean),
  },
) {}

/** Exit status the service monitor maps to a warning. */
export const SKILL_UPDATES_DEFERRED_EXIT_CODE = 2;

export interface SuccessfulWorkflowRun {
  readonly id: number;
  readonly url: string;
}

export const latestSuccessfulWorkflowRun = (
  runs: Schema.Schema.Type<typeof WorkflowRuns>,
): SuccessfulWorkflowRun | null => {
  const run = runs.workflow_runs.find(
    ({ conclusion }) => conclusion === "success",
  );

  return run ? { id: run.id, url: run.html_url } : null;
};

export const cleanSkillUpdateNames = (
  statuses: readonly Pick<
    UpdateReportItem,
    "name" | "state" | "storedSha" | "upstreamSha" | "localEdits"
  >[],
) =>
  statuses.flatMap(({ name, localEdits, state, storedSha, upstreamSha }) =>
    state === "update-available" ||
    (state === "up-to-date" &&
      localEdits.length === 0 &&
      upstreamSha !== null &&
      upstreamSha !== storedSha)
      ? [name]
      : [],
  );

export const skillUpdatesAgentModelArgument = (model: SkillUpdatesAgentModel) =>
  `${model.providerID}/${model.modelID}${model.variant ? `#${model.variant}` : ""}`;

export interface SkillUpdatesAttempt {
  /** Model and variant without the provider, so hosts compare equally. */
  readonly model: string;
  readonly succeeded: boolean;
  readonly usage: SkillUpdatesSessionUsage | null;
}

const BENCHMARK_MARKER = "<!-- skill-updates-agent:benchmark -->";

const formatDuration = (ms: number) => {
  const seconds = Math.round(ms / 1000);

  return seconds >= 60
    ? `${Math.floor(seconds / 60)}m ${seconds % 60}s`
    : `${seconds}s`;
};

const formatTokens = (count: number) => count.toLocaleString("en-GB");

export const renderSkillUpdatesBenchmark = (
  attempts: readonly SkillUpdatesAttempt[],
  context: {
    readonly agent: string;
    readonly runUrl: string;
    readonly pullRequests: number;
  },
) =>
  [
    BENCHMARK_MARKER,
    "## Agent run",
    "",
    "| Attempt | Model | Result | Time | Cost | Input | Cache read | Cache write | Output | Reasoning |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...attempts
      .map(({ model, succeeded, usage }, index) =>
        [
          String(index + 1),
          `\`${model}\``,
          succeeded ? "Succeeded" : "Failed",
          ...(usage
            ? [
                formatDuration(usage.durationMs),
                `$${usage.cost.toFixed(3)}`,
                formatTokens(usage.tokens.input),
                formatTokens(usage.tokens.cache.read),
                formatTokens(usage.tokens.cache.write),
                formatTokens(usage.tokens.output),
                formatTokens(usage.tokens.reasoning),
              ]
            : Array.from({ length: 7 }, () => "unknown")),
        ].join(" | "),
      )
      .map((row) => `| ${row} |`),
    "",
    `Agent \`${context.agent}\`, for [this workflow run](${context.runUrl}). Figures cover the whole session, which opened ${context.pullRequests} pull request${context.pullRequests === 1 ? "" : "s"}.`,
  ].join("\n");

/** Add or replace the benchmark section at the end of a pull request body. */
export const withSkillUpdatesBenchmark = (body: string, section: string) => {
  const index = body.indexOf(BENCHMARK_MARKER);
  const base = (index === -1 ? body : body.slice(0, index)).trimEnd();

  return base ? `${base}\n\n${section}\n` : `${section}\n`;
};

const skillUpdateTitles = (skill: string) => [
  `Update skill: ${skill}`,
  `[SHA-only] Update ${skill}`,
  `[Tag-only] Update ${skill}`,
];

/** One skill's entry with its pins blanked, rendered for comparison. */
const withoutPins = (skill: string, entry: SkillEntry) => {
  const stripped: Mutable<SkillEntry> = {};

  if (entry.import)
    stripped.import = { ...entry.import, upstreamSha: "0".repeat(40) };

  if (entry.tools)
    stripped.tools = entry.tools.map((tool) => ({ ...tool, reviewed: "-" }));

  return renderSkillsFile({ skills: { [skill]: stripped } });
};

/** Every entry except `skills`, rendered for comparison. */
const otherEntries = (file: SkillsFile, skills: readonly string[]) =>
  renderSkillsFile({
    skills: Object.fromEntries(
      Object.entries(file.skills).filter(([name]) => !skills.includes(name)),
    ),
  });

/** Skills a release of `repo` touches: imports from it, and skills listing it as a tool. */
export const releaseMembers = (file: SkillsFile, repo: string) =>
  Object.entries(file.skills)
    .filter(([, entry]) => {
      const origin = entry.import && originRepo(entry.import.origin);

      return (
        (origin !== undefined && origin !== null && sameRepo(origin, repo)) ||
        (entry.tools ?? []).some((tool) => sameRepo(tool.repo, repo))
      );
    })
    .map(([name]) => name)
    .sort();

/**
 * Whether the two files differ only in the pins of `skills`, with at least
 * one pin moved. This decides whether a release group pull request may
 * auto-merge.
 */
export const releasePinOnlyChange = (
  before: SkillsFile,
  after: SkillsFile,
  skills: readonly string[],
) =>
  otherEntries(before, skills) === otherEntries(after, skills) &&
  skills.every((skill) => {
    const old = before.skills[skill];
    const updated = after.skills[skill];

    return (
      !!old &&
      !!updated &&
      withoutPins(skill, old) === withoutPins(skill, updated)
    );
  }) &&
  skills.some((skill) => entryChanged(before, after, skill));

/** Whether `skill`'s entry differs between the two files. */
const entryChanged = (before: SkillsFile, after: SkillsFile, skill: string) =>
  renderSkillsFile({ skills: { [skill]: before.skills[skill] ?? {} } }) !==
  renderSkillsFile({ skills: { [skill]: after.skills[skill] ?? {} } });

/**
 * `"sha"` or `"tag"` when `skill`'s entry differs between the two files only
 * in its pins, and nothing else in the file changed; `null` otherwise. An SHA
 * move wins over a tag move. This decides which pull requests may auto-merge.
 */
export const pinOnlyChange = (
  before: SkillsFile,
  after: SkillsFile,
  skill: string,
): "sha" | "tag" | null => {
  const old = before.skills[skill];
  const updated = after.skills[skill];

  if (
    !old ||
    !updated ||
    otherEntries(before, [skill]) !== otherEntries(after, [skill]) ||
    withoutPins(skill, old) !== withoutPins(skill, updated)
  )
    return null;

  if (old.import?.upstreamSha !== updated.import?.upstreamSha) return "sha";

  if (JSON.stringify(old.tools) !== JSON.stringify(updated.tools)) return "tag";

  return null;
};

/** `owner/name` of a GitHub origin URL. */
const originRepo = (origin: string) =>
  origin.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\//)?.[1] ?? null;

const sameRepo = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** An import that follows its repository's releases, so a release group moves it. */
export const followsRelease = (
  item: Pick<UpdateReportItem, "release" | "state">,
) => item.release !== undefined && item.state !== "error";

/** One tool release: the imports it moves and the skills reviewed against it. */
export interface ReleaseGroup {
  readonly repo: string;
  readonly tag: string;
  readonly imports: readonly {
    readonly name: string;
    readonly upstreamSha: string;
    readonly adapted: boolean;
  }[];
  readonly reviews: readonly {
    readonly skill: string;
    readonly reviewed: string;
  }[];
}

export const releaseGroupBranch = (repo: string) =>
  `skill-update/${repo.toLowerCase().replace("/", "-")}`;

export const releaseGroupTitles = (repo: string, tag: string) => [
  `Update ${repo} to ${tag}`,
  `[Pin-only] Update ${repo} to ${tag}`,
];

const releaseGroupTitlePattern =
  /^(\[Pin-only\] )?Update ([\w.-]+\/[\w.-]+) to (\S+)$/;

/**
 * Group everything a tool release touches, so one run and one pull request
 * cover it: imports from the repository whose pin moves, and skills listing
 * it under `tools` that are behind the release.
 */
export const releaseGroups = (
  skills: readonly Pick<
    UpdateReportItem,
    | "name"
    | "state"
    | "origin"
    | "storedSha"
    | "upstreamSha"
    | "release"
    | "localEdits"
  >[],
  reviews: readonly SkillReviewItem[],
): ReleaseGroup[] => {
  const groups = new Map<
    string,
    {
      repo: string;
      tag: string;
      imports: ReleaseGroup["imports"][number][];
      reviews: ReleaseGroup["reviews"][number][];
    }
  >();

  const group = (repo: string, tag: string) => {
    const key = repo.toLowerCase();
    const existing = groups.get(key);

    if (existing) return existing;

    const created = { repo, tag, imports: [], reviews: [] };
    groups.set(key, created);

    return created;
  };

  for (const item of reviews)
    if (item.state === "release-available" && item.latest)
      group(item.repo, item.latest).reviews.push({
        skill: item.skill,
        reviewed: item.reviewed,
      });

  for (const item of skills) {
    const repo = originRepo(item.origin);

    if (
      !followsRelease(item) ||
      !item.release ||
      !repo ||
      item.upstreamSha === null ||
      item.upstreamSha === item.storedSha
    )
      continue;

    group(repo, item.release).imports.push({
      name: item.name,
      upstreamSha: item.upstreamSha,
      adapted: item.localEdits.length > 0,
    });
  }

  return [...groups.values()].sort((a, b) => a.repo.localeCompare(b.repo));
};

/** Release groups without an open pull request that already sets every member. */
export const releaseGroupsNeedingWork = (
  groups: readonly ReleaseGroup[],
  pulls: readonly { readonly title: string; readonly after: SkillsFile }[],
) =>
  groups.filter(
    (group) =>
      !pulls.some(
        ({ title, after }) =>
          releaseGroupTitles(group.repo, group.tag).includes(title) &&
          group.imports.every(
            ({ name, upstreamSha }) =>
              after.skills[name]?.import?.upstreamSha === upstreamSha,
          ) &&
          group.reviews.every(({ skill }) =>
            after.skills[skill]?.tools?.some(
              (tool) =>
                sameRepo(tool.repo, group.repo) && tool.reviewed === group.tag,
            ),
          ),
      ),
  );

/** A release group in one line, for logs and results. */
export const describeReleaseGroup = (group: ReleaseGroup) =>
  `${group.repo} ${group.tag} (${[
    group.imports.length > 0 &&
      `imports: ${group.imports.map(({ name }) => name).join(", ")}`,
    group.reviews.length > 0 &&
      `reviews: ${group.reviews.map(({ skill }) => skill).join(", ")}`,
  ]
    .filter(Boolean)
    .join("; ")})`;

/** The model's instructions for one release group. */
export const releaseGroupInstructions = (group: ReleaseGroup) => {
  const [content, pinOnly] = releaseGroupTitles(group.repo, group.tag);
  const external = group.imports.filter(({ adapted }) => !adapted);
  const adapted = group.imports.filter(({ adapted }) => adapted);

  return [
    `- Release group ${group.repo} ${group.tag}:`,
    ...(external.length > 0
      ? [
          `  - Move ${external.map(({ name }) => `\`${name}\``).join(", ")} to the release with \`./dist/skill-maintenance import <name> --apply\`.`,
        ]
      : []),
    ...(adapted.length > 0
      ? [
          `  - Bring the upstream changes up to the release into ${adapted.map(({ name }) => `\`${name}\``).join(", ")}, keeping their local edits.`,
        ]
      : []),
    ...(group.reviews.length > 0
      ? [
          `  - Review ${group.reviews.map(({ skill, reviewed }) => `\`${skill}\` (from ${reviewed})`).join(", ")} against the release notes since each one's reviewed tag, then record each with \`./dist/skill-maintenance skill-reviews --reviewed <skill>\`.`,
        ]
      : []),
    `  - Make every change for this release in one commit on branch \`${releaseGroupBranch(group.repo)}\` and one pull request. Title it \`${pinOnly}\` when only pins and reviewed tags move, assigned to timmo001 with squash auto-merge enabled; otherwise title it \`${content}\` and leave it for review. Use the title as the commit subject. This replaces the per-skill branches and titles for these skills.`,
  ].join("\n");
};

interface SkillYamlChange {
  removedSha?: string;
  addedSha?: string;
  origin?: string;
}

/**
 * Pin changes per skill in a patch's `skills.yml` section. `renderSkillsFile`
 * puts `upstreamSha` two lines under the skill key, so the key is always in
 * the hunk's context and each changed line belongs to the last key above it.
 */
const skillYamlChanges = (patch: string) => {
  const changes = new Map<string, SkillYamlChange>();
  let inFile = false;
  let inHunk = false;
  let current: string | undefined;

  for (const line of patch.split("\n")) {
    const file = line.match(/^diff --git a\/(.+) b\/(.+)$/);

    if (file) {
      inFile = file[1] === SKILLS_FILE && file[2] === SKILLS_FILE;
      inHunk = false;
      current = undefined;
      continue;
    }

    if (!inFile) continue;

    if (line.startsWith("@@")) {
      inHunk = true;
      current = undefined;
      continue;
    }

    if (!inHunk) continue;

    const key = line.match(/^[ +-] {2}([a-z0-9-]+):(?: \{\})?$/)?.[1];

    if (key) {
      current = key;
      continue;
    }

    if (!current) continue;

    const change = changes.get(current) ?? {};
    changes.set(current, change);

    const [, sign, sha] =
      line.match(/^([+-]) {6}upstreamSha: ([0-9a-f]{40})$/) ?? [];

    if (sha && sign === "-") change.removedSha = sha;
    else if (sha && sign === "+") change.addedSha = sha;

    const origin = line.match(/^[ +] {6}origin: "([^"\\]+)"$/)?.[1];

    if (origin) change.origin = origin;
  }

  return changes;
};

const setsUpstreamSha = (patch: string, skill: string, sha: string) =>
  skillYamlChanges(patch).get(skill)?.addedSha === sha;

/** Pending updates without an open pull request for their current upstream SHA. */
export const skillUpdatesNeedingWork = (
  skills: readonly Pick<UpdateReportItem, "name" | "state" | "upstreamSha">[],
  pulls: readonly { readonly title: string; readonly patch: string }[],
) =>
  skills.flatMap(({ name, state, upstreamSha }) => {
    if (state === "up-to-date" || state === "origin-gone") return [];

    const covered =
      (state === "manual-review" || state === "update-available") &&
      upstreamSha !== null &&
      pulls.some(
        ({ title, patch }) =>
          skillUpdateTitles(name).includes(title) &&
          setsUpstreamSha(patch, name, upstreamSha),
      );

    return covered ? [] : [name];
  });

export const skillUpdatesAgentPrompt = (
  config: SkillUpdatesAgentConfig,
  run: SuccessfulWorkflowRun,
  pending: readonly string[],
  groups: readonly ReleaseGroup[] = [],
) =>
  [
    config.prompt.trim(),
    "",
    "Trusted automation context:",
    `- Dashboard issue: ${config.dashboardIssue}`,
    `- Completed workflow run: ${run.url}`,
    ...(pending.length > 0
      ? [
          `- Updates needing work, checked against upstream by this runner: ${pending.join(", ")}. Use this list when the dashboard is incomplete or could not check upstream.`,
        ]
      : []),
    ...(groups.length > 0
      ? [
          "- Tool releases needing work, checked by this runner. Handle each release as one unit, as described here:",
          ...groups.map(releaseGroupInstructions),
        ]
      : []),
    "",
    "Start your final message with one line containing only `STATUS: success` or `STATUS: failure`, followed by a concise summary. Use `STATUS: success` only after all requested work and cleanup completed. Otherwise use `STATUS: failure` and describe the blocker in the summary.",
  ].join("\n");

export const skillUpdatesWorkflowEndpoint = (value: string): string | null => {
  try {
    const url = new URL(value);

    return url.protocol === "https:" && url.hostname === "api.github.com"
      ? `${url.pathname.replace(/^\//, "")}${url.search}`
      : null;
  } catch {
    return null;
  }
};

export const skillUpdatesAgentResultStatus = (
  output: string,
): "success" | "failure" | null => {
  const statuses = output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line === SUCCESS_PREFIX || failureStatusLine.test(line));

  return statuses.length === 1
    ? statuses[0] === SUCCESS_PREFIX
      ? "success"
      : "failure"
    : null;
};

export function isShaOnlySkillPatch(patch: string, skill: string): boolean {
  const changes = new Map<string, { removed: string[]; added: string[] }>();
  let currentFile: string | undefined;
  let inHunk = false;

  for (const line of patch.split("\n")) {
    const file = line.match(/^diff --git a\/(.+) b\/(.+)$/);

    if (file) {
      if (file[1] !== file[2] || !file[1] || changes.has(file[1])) return false;
      currentFile = file[1];
      changes.set(currentFile, { removed: [], added: [] });
      inHunk = false;
      continue;
    }

    if (!currentFile) {
      if (line) return false;
      continue;
    }

    if (line.startsWith("@@")) {
      inHunk = true;
      continue;
    }

    if (!inHunk) {
      if (
        line.startsWith("index ") ||
        line === `--- a/${currentFile}` ||
        line === `+++ b/${currentFile}` ||
        !line
      )
        continue;

      return false;
    }

    const change = changes.get(currentFile);

    if (!change) return false;

    if (line.startsWith("-")) change.removed.push(line.slice(1));
    else if (line.startsWith("+")) change.added.push(line.slice(1));
  }

  const metadata = changes.get(SKILLS_FILE);
  const marketplace = changes.get(MARKETPLACE_FILE);

  if (
    changes.size !== (marketplace ? 2 : 1) ||
    !metadata ||
    metadata.removed.length !== 1 ||
    metadata.added.length !== 1
  )
    return false;

  // The file's only changed lines are this skill's old and new pin.
  const pin = skillYamlChanges(patch).get(skill);

  if (
    pin?.removedSha === undefined ||
    pin.addedSha === undefined ||
    pin.removedSha === pin.addedSha
  )
    return false;

  // An external import's marketplace entry moves to the same pin.
  const marketplacePin = (lines: readonly string[]) =>
    lines.length === 1
      ? lines[0]?.match(/^\s*"sha": "([0-9a-f]{40})",?$/)?.[1]
      : undefined;

  return (
    !marketplace ||
    (marketplacePin(marketplace.removed) === pin.removedSha &&
      marketplacePin(marketplace.added) === pin.addedSha)
  );
}

export function isScopedSkillPatch(
  patch: string,
  ...skills: readonly string[]
): boolean {
  const files = patch.split("\n").flatMap((line) => {
    const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);

    return match?.[1] && match[2] ? [[match[1], match[2]] as const] : [];
  });

  const allowed = (file: string) =>
    file === SKILLS_FILE ||
    file === CATALOGUE_FILE ||
    file === MARKETPLACE_FILE ||
    // Repository guidance requires these when a skill's runtime or tool
    // assumptions change.
    file === "PORTABILITY.md" ||
    file === "skills.sh.json" ||
    skills.some((name) => file.startsWith(`${name}/`));

  return (
    files.some(([from, to]) => from === SKILLS_FILE && to === from) &&
    files.every(([from, to]) => from === to && allowed(from))
  );
}

const UPSTREAM_MARKER = "<!-- skill-updates-agent:upstream -->";

const fileStatusLabel = {
  added: "Added",
  modified: "Modified",
  removed: "Removed",
} satisfies Record<UpstreamFileChange["status"], string>;

/** Pull request section linking each changed upstream file and its diff. */
export const renderUpstreamChanges = (
  origin: SkillOrigin,
  before: string,
  after: string,
  files: readonly UpstreamFileChange[] | null,
  /** Names the skill in the heading, when a pull request moves several. */
  skill?: string,
) => {
  const repo = `https://github.com/${origin.owner}/${origin.repo}`;
  const compare = `${repo}/compare/${before}...${after}`;
  const directory = originDirectory(origin);

  const relative = (file: string) =>
    directory && file.startsWith(`${directory}/`)
      ? file.slice(directory.length + 1)
      : file;

  const summary = `[\`${origin.owner}/${origin.repo}\`](${compare}) \`${before.slice(0, 7)}...${after.slice(0, 7)}\`${directory ? ` in \`${directory}\`` : ""}`;

  return [
    UPSTREAM_MARKER,
    `## Upstream changes${skill ? `: \`${skill}\`` : ""}`,
    "",
    ...(files === null
      ? [`${summary}. The changed files could not be listed.`]
      : files.length === 0
        ? [`${summary}. No files changed.`]
        : [
            `${summary}:`,
            "",
            ...files.map(
              ({ path, status }) =>
                `- ${fileStatusLabel[status]} [\`${relative(path)}\`](${repo}/blob/${status === "removed" ? before : after}/${path}) ([diff](${compare}#diff-${createHash("sha256").update(path).digest("hex")}))`,
            ),
          ]),
  ].join("\n");
};

/** Add a marked section unless the body already has it, keeping any benchmark section last. */
const withSection = (body: string, marker: string, section: string) => {
  if (body.includes(marker)) return body;
  const index = body.indexOf(BENCHMARK_MARKER);
  const base = (index === -1 ? body : body.slice(0, index)).trimEnd();
  const tail = index === -1 ? "" : `\n\n${body.slice(index).trimEnd()}`;

  return `${base ? `${base}\n\n` : ""}${section}${tail}\n`;
};

/** Add the upstream section unless the body already has one, keeping any benchmark section last. */
export const withUpstreamChanges = (body: string, section: string) =>
  withSection(body, UPSTREAM_MARKER, section);

const SKILLS_ENTRY_MARKER = "<!-- skill-updates-agent:skills-entry -->";

/**
 * Pull request section quoting `skill`'s entry from `text`, the `skills.yml`
 * at commit `sha`, with a permalink to those lines. Null when it has no entry.
 */
export const renderSkillsEntry = (
  text: string,
  skill: string,
  sha: string,
  /** Name the skill in the heading, when a pull request quotes several. */
  labelled = false,
) => {
  const lines = text.split("\n");

  const start = lines.findIndex(
    (line) => line === `  ${skill}:` || line === `  ${skill}: {}`,
  );

  if (start === -1) return null;

  // The entry runs until the next skill key, or the end of the file.
  const next = lines.findIndex(
    (line, index) => index > start && /^ {2}\S/.test(line),
  );

  const entry = lines
    .slice(start, next === -1 ? undefined : next)
    .join("\n")
    .trimEnd();

  const first = start + 1;
  const last = first + entry.split("\n").length - 1;

  return [
    SKILLS_ENTRY_MARKER,
    `## \`${SKILLS_FILE}\` entry${labelled ? `: \`${skill}\`` : ""}`,
    "",
    `[\`${SKILLS_FILE}\` lines ${first}-${last} at \`${sha.slice(0, 7)}\`](https://github.com/${SKILLS_REPOSITORY}/blob/${sha}/${SKILLS_FILE}#L${first}-L${last})`,
    "",
    "```yaml",
    entry,
    "```",
  ].join("\n");
};

/** Add the `skills.yml` entry section unless the body already has one. */
export const withSkillsEntry = (body: string, section: string) =>
  withSection(body, SKILLS_ENTRY_MARKER, section);

/** The skill's pinned SHA change and origin, read from a pull request's skills.yml diff. */
export const upstreamPinChange = (patch: string, skill: string) => {
  const pin = skillYamlChanges(patch).get(skill);
  const before = pin?.removedSha;
  const after = pin?.addedSha;
  const origin = pin?.origin;

  return before && after && origin && before !== after
    ? { origin, before, after }
    : null;
};

const upstreamChangesSection = Effect.fn("UpdatesAgent.upstreamChangesSection")(
  function* (originUrl: string, before: string, after: string, skill?: string) {
    const origin = yield* Effect.result(parseOrigin(originUrl));

    if (Result.isFailure(origin)) return null;

    const files = yield* upstreamFileChanges(
      origin.success,
      before,
      after,
    ).pipe(
      Effect.catch((error) =>
        Console.error(
          `Unable to list upstream changes for ${originUrl}: ${describeFailure(error)}`,
        ).pipe(Effect.as(null)),
      ),
    );

    return renderUpstreamChanges(origin.success, before, after, files, skill);
  },
);

/** Pull request body for an external import's pinned SHA change, linking the upstream files. */
export const externalUpdateBody = (
  skill: string,
  sha: string,
  upstream: string | null,
) =>
  [
    `Pin \`${skill}\` to upstream \`${sha}\`. \`dot update\` installs the pinned revision.`,
    ...(upstream ? ["", upstream] : []),
  ].join("\n");

export const skillUpdateSubject = (patch: string, skill: string) =>
  isShaOnlySkillPatch(patch, skill)
    ? `[SHA-only] Update ${skill}`
    : `Update skill: ${skill}`;

export const applySkillUpdateAutoMergePolicy = Effect.fn(
  "UpdatesAgent.applyAutoMergePolicy",
)(function* (url: string, shaOnly: boolean, existing: boolean) {
  const github = yield* GitHub;

  if (shaOnly) {
    yield* github.write(
      "gh pr merge --auto",
      PullRequest.merge(url, {
        repository: SKILLS_REPOSITORY,
        method: "squash",
        auto: true,
      }),
    );
  } else if (existing) {
    yield* github.write(
      "gh pr merge --disable-auto",
      PullRequest.disableAutoMerge(url, { repository: SKILLS_REPOSITORY }),
    );
  }
});

const runOrFail = Effect.fn("UpdatesAgent.runOrFail")(function* (
  command: string,
  args: readonly string[],
  cwd: string,
) {
  const executor = yield* CommandExecutor;
  const code = yield* executor.inherit(command, args, { cwd });

  if (code !== 0)
    return yield* new SkillUpdatesAgentError({
      operation: `${command} ${args.join(" ")}`,
      message: `Command exited with code ${code}`,
    });
});

const validateRepository = Effect.fn("UpdatesAgent.validateRepository")(
  function* (root: string) {
    yield* runOrFail("bun", ["run", "validate"], root);

    const code = yield* (yield* SkillsCli).inherit(["add", ".", "--list"], {
      cwd: root,
    });

    if (code !== 0)
      return yield* new SkillUpdatesAgentError({
        operation: "skills add . --list",
        message: `Command exited with code ${code}`,
      });
  },
);

const publishCleanUpdate = Effect.fn("UpdatesAgent.publishCleanUpdate")(
  function* (root: string, name: string) {
    const executor = yield* CommandExecutor;
    const github = yield* GitHub;
    const branch = `skill-update/${name}`;
    yield* runOrFail("git", ["checkout", "-B", branch, "origin/main"], root);
    const before = yield* getImport(root, name);
    yield* importSkill(root, name, { apply: true, metadataOnly: false });
    const after = yield* getImport(root, name);
    yield* writeSkillsCatalogue(root);
    yield* validateRepository(root);
    yield* runOrFail(
      "git",
      ["add", "--", SKILLS_FILE, CATALOGUE_FILE, MARKETPLACE_FILE],
      root,
    );

    const patch = yield* executor.run(
      "git",
      ["diff", "--cached", "--no-ext-diff"],
      { cwd: root },
    );

    if (!isScopedSkillPatch(patch, name))
      return yield* new SkillUpdatesAgentError({
        operation: "patch.scope",
        message: `Generated patch for ${name} is outside its allowed scope`,
      });
    const title = skillUpdateSubject(patch, name);
    yield* runOrFail(
      "git",
      [
        "commit",
        "-m",
        title,
        "--",
        SKILLS_FILE,
        CATALOGUE_FILE,
        MARKETPLACE_FILE,
      ],
      root,
    );
    yield* runOrFail(
      "git",
      ["push", "--force-with-lease", "origin", branch],
      root,
    );

    let url =
      (yield* github.read(
        "gh pr list",
        PullRequest.query({
          repository: SKILLS_REPOSITORY,
          head: branch,
          state: "open",
          fields: ["url"],
        }),
      ))[0]?.url ?? "";

    const existing = url.length > 0;

    const head = (yield* executor.run("git", ["rev-parse", "HEAD"], {
      cwd: root,
    })).trim();

    const entry = renderSkillsEntry(
      yield* executor.run("git", ["show", `HEAD:${SKILLS_FILE}`], {
        cwd: root,
      }),
      name,
      head,
    );

    const update = externalUpdateBody(
      name,
      after.upstreamSha,
      yield* upstreamChangesSection(
        before.origin,
        before.upstreamSha,
        after.upstreamSha,
      ),
    );

    const body = entry ? withSkillsEntry(update, entry) : update;

    if (existing) {
      const { body: previous } = yield* github.read(
        "gh pr view",
        PullRequest.get({
          selector: url,
          repository: SKILLS_REPOSITORY,
          fields: ["body"],
        }),
      );

      const benchmark = previous.indexOf(BENCHMARK_MARKER);

      yield* github.write(
        "gh pr edit",
        PullRequest.edit(url, {
          repository: SKILLS_REPOSITORY,
          title,
          body:
            benchmark === -1
              ? body
              : withSkillUpdatesBenchmark(
                  body,
                  previous.slice(benchmark).trimEnd(),
                ),
          addAssignees: ["timmo001"],
        }),
      );
    } else
      url = (yield* github.write(
        "gh pr create",
        PullRequest.create({
          repository: SKILLS_REPOSITORY,
          base: "main",
          head: branch,
          title,
          body,
          assignees: ["timmo001"],
        }),
      )).url;
    yield* applySkillUpdateAutoMergePolicy(
      url,
      isShaOnlySkillPatch(patch, name),
      existing,
    );
    yield* github.write(
      "gh workflow run validate.yml",
      Workflow.dispatch({
        repo: SKILLS_REPOSITORY,
        workflow: "validate.yml",
        ref: branch,
      }),
    );
  },
);

const refreshDashboard = Effect.fn("UpdatesAgent.refreshDashboard")(function* (
  root: string,
) {
  const github = yield* GitHub;
  const report = yield* buildUpdateReport(root);
  const reviews = yield* Effect.result(buildSkillReviewReport(root));

  // A failed release check still leaves the import section to post.
  const markdown = [
    renderUpdateMarkdown(report),
    Result.isSuccess(reviews)
      ? renderSkillReviewMarkdown(reviews.success)
      : `## Skill reviews\n\nThe release check failed: ${reviews.failure.message}\n`,
  ].join("\n");

  const marker = "<!-- adapted-skill-updates -->";

  const dashboard = (yield* github.read(
    "gh issue list",
    Issue.query({
      repo: SKILLS_REPOSITORY,
      state: "open",
      limit: 100,
      fields: ["number", "body"],
    }),
  )).find((issue) => issue.body.includes(marker));

  yield* dashboard
    ? github.write(
        "gh issue edit",
        Issue.edit(dashboard.number, {
          repo: SKILLS_REPOSITORY,
          title: "Skill updates",
          body: markdown,
        }),
      )
    : github.write(
        "gh issue create",
        Issue.create({
          repo: SKILLS_REPOSITORY,
          title: "Skill updates",
          body: markdown,
        }),
      );
});

export const runGitHubSkillUpdates = Effect.fn("UpdatesAgent.runGitHub")(
  function* (root: string) {
    yield* (yield* GitHub).waitForNetwork();
    yield* runOrFail(
      "git",
      ["config", "user.name", "skill-updates[bot]"],
      root,
    );
    yield* runOrFail(
      "git",
      ["config", "user.email", "skill-updates[bot]@users.noreply.github.com"],
      root,
    );

    const work = Effect.gen(function* () {
      const report = yield* buildUpdateReport(root);

      // Imports that follow a release go to the device agent with their release group.
      for (const name of cleanSkillUpdateNames(
        report.skills.filter((item) => !followsRelease(item)),
      ))
        yield* publishCleanUpdate(root, name);
    });

    const result = yield* Effect.exit(work);

    const restore = yield* Effect.exit(
      runOrFail("git", ["checkout", "--detach", "origin/main"], root),
    );

    const dashboard = yield* Effect.exit(refreshDashboard(root));

    if (Exit.isFailure(result)) return yield* Effect.failCause(result.cause);

    if (Exit.isFailure(restore)) return yield* Effect.failCause(restore.cause);

    if (Exit.isFailure(dashboard))
      return yield* Effect.failCause(dashboard.cause);
  },
);

const expandHome = (value: string, home: string) =>
  value === "~"
    ? home
    : value.startsWith("~/")
      ? `${home}/${value.slice(2)}`
      : value;

const loadConfig = Effect.fn("UpdatesAgent.loadConfig")(function* (
  file: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const home = yield* Config.String("HOME");

  const raw = yield* fs.readFileString(file).pipe(
    Effect.mapError(
      (cause) =>
        new SkillUpdatesAgentError({
          operation: "config.read",
          message: String(cause),
        }),
    ),
  );

  const value = yield* Effect.try({
    try: () => Yaml.parse(raw),
    catch: (cause) =>
      new SkillUpdatesAgentError({
        operation: "config.yaml",
        message: String(cause),
      }),
  });

  const config = yield* Schema.decodeUnknownEffect(SkillUpdatesAgentConfig)(
    value,
  ).pipe(
    Effect.mapError(
      (cause) =>
        new SkillUpdatesAgentError({
          operation: "config.decode",
          message: String(cause),
        }),
    ),
  );

  return {
    ...config,
    repositories: config.repositories.map((repo) => expandHome(repo, home)),
    stateFile: expandHome(config.stateFile, home),
    opencodeCommand: expandHome(config.opencodeCommand, home),
    opencodePermissions: config.opencodePermissions.map((rule) => ({
      ...rule,
      resource: ["read", "edit", "external_directory"].includes(rule.action)
        ? expandHome(rule.resource, home)
        : rule.resource,
    })),
  } satisfies SkillUpdatesAgentConfig;
});

const fetchRun = Effect.fn("UpdatesAgent.fetchRun")(function* (
  config: SkillUpdatesAgentConfig,
  runId?: string,
) {
  const github = yield* GitHub;

  if (runId && !/^\d+$/.test(runId))
    return yield* new SkillUpdatesAgentError({
      operation: "workflow.run-id",
      message: `Invalid workflow run id: ${runId}`,
    });

  const endpoint = runId
    ? `repos/timmo001/skills/actions/runs/${runId}`
    : skillUpdatesWorkflowEndpoint(config.workflowApi);

  if (!endpoint)
    return yield* new SkillUpdatesAgentError({
      operation: "workflow.url",
      message: "workflowApi must be an https://api.github.com URL",
    });
  const request = { endpoint, method: "GET" } as const;

  if (runId) {
    const run = yield* github.read(endpoint, Api.json(request, WorkflowRun));

    if (run.conclusion !== "success")
      return yield* new SkillUpdatesAgentError({
        operation: "workflow.select",
        message: `Workflow run ${run.id} concluded ${run.conclusion ?? "without a result"}`,
      });

    return { id: run.id, url: run.html_url };
  }

  const runs = yield* github.read(endpoint, Api.json(request, WorkflowRuns));
  const run = latestSuccessfulWorkflowRun(runs);

  return (
    run ??
    (yield* new SkillUpdatesAgentError({
      operation: "workflow.select",
      message: "No successful workflow run was found",
    }))
  );
});

interface RepositoryState {
  readonly path: string;
  readonly branch: string;
}

const requireCleanRepositories = Effect.fn(
  "UpdatesAgent.requireCleanRepositories",
)(function* (repositories: readonly string[]) {
  const executor = yield* CommandExecutor;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const states: RepositoryState[] = [];

  for (const repository of repositories) {
    if (!(yield* fs.exists(path.join(repository, ".git"))))
      return yield* new SkillUpdatesAgentError({
        operation: "repository.check",
        message: `Required repository is unavailable: ${repository}`,
      });

    if (
      (yield* executor.run("git", ["status", "--porcelain"], {
        cwd: repository,
      })).trim()
    )
      return yield* new SkillUpdatesAgentError({
        operation: "repository.dirty",
        message: `Refusing to run with uncommitted changes in ${repository}`,
      });

    const branch = (yield* executor.run("git", ["branch", "--show-current"], {
      cwd: repository,
    })).trim();

    const expected = (yield* executor.run(
      "git",
      ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
      { cwd: repository },
    ))
      .trim()
      .replace(/^origin\//, "");

    if (!branch || branch !== expected)
      return yield* new SkillUpdatesAgentError({
        operation: "repository.branch",
        message: `${repository} must be on ${expected || "its default branch"}; found ${branch}`,
      });
    states.push({ path: repository, branch });
  }

  return states;
});

export const requireRepositoryState = Effect.fn(
  "UpdatesAgent.requireRepositoryState",
)(function* (expected: readonly RepositoryState[]) {
  const current = yield* requireCleanRepositories(
    expected.map(({ path }) => path),
  );

  for (const [index, state] of current.entries()) {
    const wanted = expected[index];

    if (wanted && state.branch !== wanted.branch)
      return yield* new SkillUpdatesAgentError({
        operation: "repository.restore",
        message: `${state.path} remained on ${state.branch}; expected ${wanted.branch}`,
      });
  }
});

const updateBranchPattern =
  /^(?:skill-update\/|update\/|update-skill-|sha-only\/)/;

const updateCommitPattern =
  /^(?:(?:\[SHA-only\] Update |\[Tag-only\] Update |Update skill: )\S+|(?:\[Pin-only\] )?Update [\w.-]+\/[\w.-]+ to \S+)$/;

export interface RecoveredUpdateBranch {
  readonly description: string;
  /** The branch is still on origin, so the failed run published something. */
  readonly published: boolean;
}

/**
 * Return checkouts that a failed or crashed run left on one of its update
 * branches to the default branch. Uncommitted changes are stashed and the
 * branch is deleted, including on origin when it has no open pull request.
 * Branches holding any other commits are left alone as the user's own work.
 */
export const recoverUpdateBranches = Effect.fn(
  "UpdatesAgent.recoverUpdateBranches",
)(function* (repositories: readonly string[]) {
  const executor = yield* CommandExecutor;
  const github = yield* GitHub;
  const recovered: RecoveredUpdateBranch[] = [];

  for (const repository of repositories) {
    const git = (args: readonly string[]) =>
      executor
        .run("git", args, { cwd: repository })
        .pipe(Effect.map((output) => output.trim()));

    const branch = yield* git(["branch", "--show-current"]);

    if (!updateBranchPattern.test(branch)) continue;

    // A stale origin ref would count merged commits as foreign work.
    yield* github.waitForNetwork();
    yield* runOrFail("git", ["fetch", "origin"], repository);

    const target = (yield* git([
      "symbolic-ref",
      "--short",
      "refs/remotes/origin/HEAD",
    ])).replace(/^origin\//, "");

    const subjects = yield* git([
      "log",
      "--format=%s",
      `origin/${target}..HEAD`,
    ]);

    if (
      subjects
        .split("\n")
        .some((subject) => subject && !updateCommitPattern.test(subject))
    )
      continue;

    const tip = yield* git(["rev-parse", "HEAD"]);
    const dirty = (yield* git(["status", "--porcelain"])) !== "";

    if (dirty)
      yield* runOrFail(
        "git",
        [
          "stash",
          "push",
          "--include-untracked",
          "--message",
          `skill-updates-agent recovery ${branch}`,
        ],
        repository,
      );
    yield* runOrFail("git", ["switch", target], repository);
    yield* runOrFail("git", ["branch", "-D", branch], repository);

    // A pushed branch without a pull request would hide the update from later runs.
    const published = yield* Effect.gen(function* () {
      const [remote] = (yield* git([
        "ls-remote",
        "--heads",
        "origin",
        branch,
      ])).split(/\s/);

      if (!remote) return false;

      if (remote !== tip) return true;

      const open = yield* github.read(
        "gh pr list",
        PullRequest.query({
          repository: SKILLS_REPOSITORY,
          head: branch,
          state: "open",
          fields: ["number"],
        }),
      );

      if (open.length > 0) return true;

      yield* runOrFail(
        "git",
        ["push", "origin", "--delete", branch],
        repository,
      );

      return false;
    }).pipe(
      Effect.catch((error) =>
        Console.error(
          `Unable to remove ${branch} from origin: ${describeFailure(error)}`,
        ).pipe(Effect.as(true)),
      ),
    );

    recovered.push({
      description: `${repository}: ${branch}${dirty ? " (uncommitted changes stashed)" : ""}`,
      published,
    });
  }

  return recovered;
});

const latestPullRequestNumber = Effect.fn(
  "UpdatesAgent.latestPullRequestNumber",
)(function* () {
  const github = yield* GitHub;

  const pulls = yield* github.read(
    "gh pr list",
    PullRequest.query({
      repository: SKILLS_REPOSITORY,
      state: "all",
      limit: 1,
      fields: ["number"],
    }),
  );

  return pulls[0]?.number ?? 0;
});

const pendingSkillUpdates = Effect.fn("UpdatesAgent.pendingSkillUpdates")(
  function* (root: string) {
    const github = yield* GitHub;
    const report = yield* buildUpdateReport(root);

    // Imports that follow a release move with their release group instead.
    const branchImports = report.skills.filter((item) => !followsRelease(item));
    const pending = skillUpdatesNeedingWork(branchImports, []);

    // A release that could not be read is not work the model can do.
    const reviews = (yield* buildSkillReviewReport(root)).items;
    const groups = releaseGroups(report.skills, reviews);

    if (pending.length === 0 && groups.length === 0)
      return { updates: [], groups: [] };

    const open = yield* github.read(
      "gh pr list",
      PullRequest.query({
        repository: SKILLS_REPOSITORY,
        state: "open",
        limit: 100,
        fields: ["number", "title"],
      }),
    );

    const importTitles = new Set(pending.flatMap(skillUpdateTitles));

    const groupTitles = new Set(
      groups.flatMap(({ repo, tag }) => releaseGroupTitles(repo, tag)),
    );

    const pulls: { title: string; patch: string }[] = [];
    const groupPulls: { title: string; after: SkillsFile }[] = [];

    for (const { number, title } of open) {
      if (importTitles.has(title))
        pulls.push({ title, patch: yield* pullRequestDiff(number) });

      if (groupTitles.has(title))
        groupPulls.push({
          title,
          after: (yield* pullRequestSkillsFiles(root, number)).after,
        });
    }

    return {
      updates: skillUpdatesNeedingWork(branchImports, pulls),
      groups: releaseGroupsNeedingWork(groups, groupPulls),
    };
  },
);

export const validatePullRequestPolicy = Effect.fn(
  "UpdatesAgent.validatePullRequestPolicy",
)(function* (root: string, after: number) {
  const github = yield* GitHub;

  const pulls = yield* recentPullRequests();

  for (const { number } of pulls.filter(({ number }) => number > after)) {
    const details = yield* github.read(
      "gh pr view",
      PullRequest.get({
        selector: number,
        repository: SKILLS_REPOSITORY,
        fields: [
          "title",
          "state",
          "mergedAt",
          "assignees",
          "autoMergeRequest",
          "commits",
        ],
      }),
    );

    const patch = yield* pullRequestDiff(number);

    const commitMatches =
      details.commits.length === 1 &&
      details.commits[0]?.messageHeadline === details.title;

    const release = details.title.match(releaseGroupTitlePattern);

    if (release?.[2]) {
      const files = yield* pullRequestSkillsFiles(root, number);
      const members = releaseMembers(files.after, release[2]);

      const pinOnly =
        releasePinOnlyChange(files.before, files.after, members) &&
        [...patch.matchAll(/^diff --git a\/(.+) b\/(.+)$/gm)].every(
          ([, from, to]) => from === SKILLS_FILE && to === SKILLS_FILE,
        );

      const valid =
        commitMatches &&
        members.length > 0 &&
        (release[1]
          ? pinOnly &&
            details.assignees.some(({ login }) => login === "timmo001") &&
            details.autoMergeRequest?.mergeMethod === "SQUASH"
          : details.state === "OPEN" &&
            details.mergedAt === null &&
            details.autoMergeRequest === null &&
            !pinOnly &&
            isScopedSkillPatch(patch, ...members));

      if (!valid)
        return yield* new SkillUpdatesAgentError({
          operation: "pull-request.policy",
          message: `Pull request #${number} does not satisfy the release update policy`,
        });

      continue;
    }

    const pinTitle = details.title.match(
      /^\[(SHA|Tag)-only\] Update ([a-z0-9-]+)$/,
    );

    const contentTitle = details.title.match(/^Update skill: ([a-z0-9-]+)$/);
    const skill = pinTitle?.[2] ?? contentTitle?.[1];

    const commitsValid = !!skill && commitMatches;

    // A pin-only change touches only skills.yml, and only the skill's pins,
    // plus the marketplace pin when an external import's SHA moves.
    const files = yield* pullRequestSkillsFiles(root, number);
    const kind = skill ? pinOnlyChange(files.before, files.after, skill) : null;

    const pinOnly =
      kind !== null &&
      ([...patch.matchAll(/^diff --git a\/(.+) b\/(.+)$/gm)].every(
        ([, from, to]) => from === SKILLS_FILE && to === SKILLS_FILE,
      ) ||
        (kind === "sha" && !!skill && isShaOnlySkillPatch(patch, skill)));

    const pinValid =
      !!pinTitle &&
      pinOnly &&
      kind === (pinTitle[1] === "SHA" ? "sha" : "tag") &&
      details.assignees.some(({ login }) => login === "timmo001") &&
      details.autoMergeRequest?.mergeMethod === "SQUASH";

    const contentValid =
      !!contentTitle &&
      details.state === "OPEN" &&
      details.mergedAt === null &&
      details.autoMergeRequest === null &&
      !!skill &&
      !pinOnly &&
      isScopedSkillPatch(patch, skill);

    if (!commitsValid || (!pinValid && !contentValid))
      return yield* new SkillUpdatesAgentError({
        operation: "pull-request.policy",
        message: `Pull request #${number} does not satisfy the skill update policy`,
      });
  }
});

/** Add upstream file links to each skill update pull request opened after `after`. */
const linkUpstreamChanges = Effect.fn("UpdatesAgent.linkUpstreamChanges")(
  function* (after: number) {
    const github = yield* GitHub;

    const created = (yield* recentPullRequests()).filter(
      ({ number }) => number > after,
    );

    for (const { number } of created) {
      const { title, body } = yield* github.read(
        "gh pr view",
        PullRequest.get({
          selector: number,
          repository: SKILLS_REPOSITORY,
          fields: ["title", "body"],
        }),
      );

      if (body.includes(UPSTREAM_MARKER)) continue;

      // A release group links every import it moves.
      if (releaseGroupTitlePattern.test(title)) {
        const patch = yield* pullRequestDiff(number);
        const sections: string[] = [];

        for (const skill of skillYamlChanges(patch).keys()) {
          const pin = upstreamPinChange(patch, skill);

          const section = pin
            ? yield* upstreamChangesSection(
                pin.origin,
                pin.before,
                pin.after,
                skill,
              )
            : null;

          if (section) sections.push(section);
        }

        if (sections.length > 0)
          yield* github.write(
            "gh pr edit",
            PullRequest.edit(number, {
              repository: SKILLS_REPOSITORY,
              body: withUpstreamChanges(body, sections.join("\n\n")),
            }),
          );

        continue;
      }

      const skill = title.match(
        /^(?:\[SHA-only\] Update|Update skill:) ([a-z0-9-]+)$/,
      )?.[1];

      if (!skill) continue;

      const pin = upstreamPinChange(yield* pullRequestDiff(number), skill);

      if (!pin) continue;

      const section = yield* upstreamChangesSection(
        pin.origin,
        pin.before,
        pin.after,
      );

      if (!section) continue;

      yield* github.write(
        "gh pr edit",
        PullRequest.edit(number, {
          repository: SKILLS_REPOSITORY,
          body: withUpstreamChanges(body, section),
        }),
      );
    }
  },
);

/** Quote each new skill update pull request's `skills.yml` entry, with a permalink. */
const quoteSkillsEntries = Effect.fn("UpdatesAgent.quoteSkillsEntries")(
  function* (root: string, after: number) {
    const github = yield* GitHub;

    const created = (yield* recentPullRequests()).filter(
      ({ number }) => number > after,
    );

    for (const { number } of created) {
      const { title, body } = yield* github.read(
        "gh pr view",
        PullRequest.get({
          selector: number,
          repository: SKILLS_REPOSITORY,
          fields: ["title", "body"],
        }),
      );

      if (body.includes(SKILLS_ENTRY_MARKER)) continue;

      // A release group quotes every entry it changes.
      const release = title.match(releaseGroupTitlePattern)?.[2];

      if (release) {
        const { before, after, head, headText } = yield* pullRequestSkillsFiles(
          root,
          number,
        );

        const sections = releaseMembers(after, release).flatMap((skill) => {
          const section = entryChanged(before, after, skill)
            ? renderSkillsEntry(headText, skill, head, true)
            : null;

          return section ? [section] : [];
        });

        if (sections.length > 0)
          yield* github.write(
            "gh pr edit",
            PullRequest.edit(number, {
              repository: SKILLS_REPOSITORY,
              body: withSkillsEntry(body, sections.join("\n\n")),
            }),
          );

        continue;
      }

      const skill = title.match(
        /^(?:\[(?:SHA|Tag)-only\] Update|Update skill:) ([a-z0-9-]+)$/,
      )?.[1];

      if (!skill) continue;

      const { head, headText } = yield* pullRequestSkillsFiles(root, number);
      const section = renderSkillsEntry(headText, skill, head);

      if (!section) continue;

      yield* github.write(
        "gh pr edit",
        PullRequest.edit(number, {
          repository: SKILLS_REPOSITORY,
          body: withSkillsEntry(body, section),
        }),
      );
    }
  },
);

const annotatePullRequests = Effect.fn("UpdatesAgent.annotatePullRequests")(
  function* (
    after: number,
    attempts: readonly SkillUpdatesAttempt[],
    context: { readonly agent: string; readonly runUrl: string },
  ) {
    const github = yield* GitHub;

    const created = (yield* recentPullRequests()).filter(
      ({ number }) => number > after,
    );

    const section = renderSkillUpdatesBenchmark(attempts, {
      ...context,
      pullRequests: created.length,
    });

    for (const { number } of created) {
      const { body } = yield* github.read(
        "gh pr view",
        PullRequest.get({
          selector: number,
          repository: SKILLS_REPOSITORY,
          fields: ["body"],
        }),
      );

      yield* github.write(
        "gh pr edit",
        PullRequest.edit(number, {
          repository: SKILLS_REPOSITORY,
          body: withSkillUpdatesBenchmark(body, section),
        }),
      );
    }
  },
);

const describeFailure = (error: Error) => {
  if (error instanceof CommandError) {
    const output = error.stderr.trim();

    return [
      `${error.command.slice(0, 200)} exited with code ${error.exitCode}`,
      output && output.slice(-1000),
    ]
      .filter(Boolean)
      .join(": ");
  }

  return error.message ? `${error.name}: ${error.message}` : error.name;
};

// `opencode run` reports this when the server stops or restarts mid-session.
const serverDisconnectPattern = /socket connection was closed unexpectedly/;

/** The OpenCode server went away, so the run defers instead of failing. */
const serverUnavailableOperation = "opencode.server";

const processWithFallback = Effect.fn("UpdatesAgent.processWithFallback")(
  function* (
    config: SkillUpdatesAgentConfig,
    prompt: string,
    states: readonly RepositoryState[],
    initialPr: number,
  ) {
    const executor = yield* CommandExecutor;
    const attempts: SkillUpdatesAttempt[] = [];
    let last = "No model was attempted";
    let serverRestarted = false;

    const usageOf = (session: Parameters<typeof stopSkillUpdatesSession>[1]) =>
      readSkillUpdatesSessionUsage(config, session).pipe(
        Effect.map((usage): SkillUpdatesSessionUsage | null => usage),
        Effect.catch((error) =>
          Console.error(
            `Unable to read session usage: ${describeFailure(error)}`,
          ).pipe(Effect.as(null)),
        ),
      );

    for (const model of config.opencodeModels) {
      const name = skillUpdatesAgentModelArgument(model);
      const label = `${model.modelID}${model.variant ? `#${model.variant}` : ""}`;
      const output: string[] = [];

      let session:
        | Effect.Success<ReturnType<typeof createSkillUpdatesSession>>
        | undefined;

      const result = yield* Effect.exit(
        Effect.gen(function* () {
          const current = yield* createSkillUpdatesSession(config);
          session = current;

          const send = (text: string) =>
            executor
              .stream(
                config.opencodeCommand,
                [
                  ...(config.opencodeArgs ?? []),
                  "run",
                  "--server",
                  current.server,
                  "--session",
                  current.id,
                  "--auto",
                  "--agent",
                  config.opencodeAgent,
                  "--model",
                  name,
                  "--title",
                  "Scheduled skill updates",
                  text,
                ],
                {
                  cwd: config.repositories[0],
                  env: { OPENCODE_PASSWORD: Redacted.value(current.password) },
                },
              )
              .pipe(
                Stream.runForEach((line) =>
                  Effect.gen(function* () {
                    yield* Console.log(line);
                    output.push(line);
                  }),
                ),
              );

          yield* send(prompt);

          // Models sometimes finish the work but drop the status line, so ask
          // the same session once rather than redoing the work on a fallback.
          if (skillUpdatesAgentResultStatus(output.join("\n")) === null) {
            yield* Console.error(
              `Model ${name} returned no status line; asking it for one`,
            );
            yield* send(SKILL_UPDATES_STATUS_REMINDER);
          }
        }),
      );

      if (
        Exit.isSuccess(result) &&
        skillUpdatesAgentResultStatus(output.join("\n")) === "success"
      ) {
        attempts.push({
          model: label,
          succeeded: true,
          usage: session ? yield* usageOf(session) : null,
        });

        return attempts;
      }

      if (Exit.isFailure(result)) {
        const failure = Cause.findErrorOption(result.cause);

        last = `Model ${name} failed: ${Option.isSome(failure) ? describeFailure(failure.value) : Cause.pretty(result.cause)}`;
      } else last = `Model ${name} returned no valid success status line`;
      yield* Console.error(last);

      if (output.some((line) => serverDisconnectPattern.test(line)))
        serverRestarted = true;

      // A timed-out client can leave its session running on the server. A
      // restarting server needs a moment before it accepts the interrupt.
      if (session) {
        const stopping = session;

        yield* stopSkillUpdatesSession(config, stopping).pipe(
          Effect.retry({ schedule: Schedule.spaced("5 seconds"), times: 5 }),
          Effect.catch((error) =>
            Effect.fail(
              new SkillUpdatesAgentError({
                operation: serverUnavailableOperation,
                message: `OpenCode server is unavailable, so session ${stopping.id} could not be stopped (${describeFailure(error)}); a later run takes over its claim`,
              }),
            ),
          ),
        );
      }

      attempts.push({
        model: label,
        succeeded: false,
        usage: session ? yield* usageOf(session) : null,
      });

      const leftBranches = yield* recoverUpdateBranches(
        states.map(({ path }) => path),
      );

      yield* requireRepositoryState(states);

      for (const { description } of leftBranches)
        yield* Console.error(
          `A failed model attempt left work on another branch; recovered ${description}`,
        );

      // Anything still on origin needs review before another attempt.
      const published = leftBranches.filter((branch) => branch.published);

      if (published.length > 0)
        return yield* new SkillUpdatesAgentError({
          operation: "opencode.partial",
          message: `A failed model attempt published work that remains on origin (${published.map(({ description }) => description).join(", ")})`,
        });

      if ((yield* latestPullRequestNumber()) > initialPr)
        return yield* new SkillUpdatesAgentError({
          operation: "opencode.partial",
          message: "A failed model attempt created pull requests",
        });
    }

    return yield* new SkillUpdatesRetryableError({
      operation: serverRestarted
        ? serverUnavailableOperation
        : "opencode.models",
      message: serverRestarted
        ? `OpenCode server restarted during the run; ${last}`
        : last,
    });
  },
);

const runDevice = Effect.fn("UpdatesAgent.runDevice")(function* (
  configPath?: string,
  runId?: string,
) {
  if (!configPath)
    return yield* new SkillUpdatesAgentError({
      operation: "config.resolve",
      message: "--config is required",
    });

  const locked = yield* Config.Boolean("SKILL_MAINTENANCE_AGENT_LOCKED").pipe(
    Config.withDefault(false),
  );

  if (runId && !locked) {
    const github = yield* GitHub;
    yield* github.waitForNetwork();
    yield* github
      .stream(
        `gh run watch ${runId}`,
        Workflow.watch(
          { repo: SKILLS_REPOSITORY, runId: Number(runId), interval: 10 },
          { cwd: process.cwd(), timeout: null },
        ),
      )
      .pipe(
        Stream.mapError((error) =>
          error.exitCode === -1
            ? new CommandError({
                command: error.command,
                exitCode: error.exitCode,
                stderr: error.stderr,
              })
            : new SkillUpdatesAgentError({
                operation: error.command,
                message: `Command exited with code ${error.exitCode}`,
              }),
        ),
        Stream.runForEach((chunk) =>
          Effect.callback<void, SkillUpdatesAgentError>((resume) => {
            const output = GhChunk.guards.Stdout(chunk)
              ? process.stdout
              : process.stderr;

            output.write(chunk.text, (error) =>
              resume(
                error
                  ? Effect.fail(
                      new SkillUpdatesAgentError({
                        operation: "workflow.output",
                        message: String(error),
                      }),
                    )
                  : Effect.void,
              ),
            );
          }),
        ),
      );
  }

  const config = yield* loadConfig(configPath);
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const executor = yield* CommandExecutor;
  const primaryRepository = config.repositories[0];

  if (!primaryRepository)
    return yield* new SkillUpdatesAgentError({
      operation: "config.decode",
      message: "At least one repository is required",
    });

  if (!locked) {
    yield* fs.makeDirectory(path.dirname(config.stateFile), {
      recursive: true,
    });
    const lockFile = `${config.stateFile}.lock`;
    yield* migrateLegacyLock(lockFile);

    const code = yield* executor.inherit("flock", [
      "--nonblock",
      "--conflict-exit-code",
      "75",
      lockFile,
      "env",
      "SKILL_MAINTENANCE_AGENT_LOCKED=true",
      process.execPath,
      "updates-agent",
      "device",
      "--config",
      configPath,
      ...(runId ? ["--run-id", runId] : []),
    ]);

    if (code === 75)
      return yield* new SkillUpdatesDeferredError({
        message:
          "Another skill updates agent run is active; deferring skill updates",
      });

    if (code === SKILL_UPDATES_DEFERRED_EXIT_CODE)
      return yield* new SkillUpdatesDeferredError({
        message: "Skill updates deferred to a later run",
        reported: true,
      });

    if (code !== 0)
      return yield* new SkillUpdatesAgentError({
        operation: "run.child",
        message: `Locked skill updates agent exited with code ${code}`,
      });

    return;
  }

  // A crashed run can leave the checkout on its own update branch.
  for (const { description } of yield* recoverUpdateBranches(
    config.repositories,
  ))
    yield* Console.error(`Recovered from an interrupted run: ${description}`);

  // Local work in a checkout is not a failure: defer before claiming the run.
  yield* requireCleanRepositories(config.repositories).pipe(
    Effect.catchTag(
      "SkillUpdatesAgentError",
      (
        error,
      ): Effect.Effect<
        never,
        SkillUpdatesAgentError | SkillUpdatesDeferredError
      > =>
        error.operation === "repository.dirty" ||
        error.operation === "repository.branch"
          ? Effect.fail(
              new SkillUpdatesDeferredError({
                message: `${error.message}; deferring skill updates`,
              }),
            )
          : Effect.fail(error),
    ),
  );

  yield* (yield* GitHub).waitForNetwork();

  const run = yield* fetchRun(config, runId);

  const outcome = yield* withSkillUpdatesClaim(
    run.id,
    Effect.gen(function* () {
      // Nothing has been published before the first model attempt.
      const { states, initialPr, pending } = yield* Effect.gen(function* () {
        const states = yield* requireCleanRepositories(config.repositories);
        const initialPr = yield* latestPullRequestNumber();
        // The update report reads local metadata, so match origin first.
        yield* runOrFail("git", ["pull", "--ff-only"], primaryRepository);
        const pending = yield* pendingSkillUpdates(primaryRepository);

        return { states, initialPr, pending };
      }).pipe(
        Effect.mapError(
          (error) =>
            new SkillUpdatesRetryableError({
              operation: "run.prepare",
              message: describeFailure(error),
            }),
        ),
      );

      let attempts: readonly SkillUpdatesAttempt[] = [];

      const work = [
        ...pending.updates,
        ...pending.groups.map(describeReleaseGroup),
      ];

      if (work.length === 0)
        yield* Console.log(
          "Every pending skill update already has an open pull request; skipping the model",
        );
      else {
        yield* Console.log(`Updates needing work: ${work.join(", ")}`);
        attempts = yield* processWithFallback(
          config,
          skillUpdatesAgentPrompt(config, run, pending.updates, pending.groups),
          states,
          initialPr,
        );
      }

      yield* requireRepositoryState(states);
      yield* validatePullRequestPolicy(primaryRepository, initialPr);

      // Upstream links help review; never fail a published run on them.
      if (attempts.length > 0)
        yield* linkUpstreamChanges(initialPr).pipe(
          Effect.catch((error) =>
            Console.error(
              `Unable to add upstream changes to pull requests: ${describeFailure(error)}`,
            ),
          ),
        );

      // The quoted entry helps review; never fail a published run on it.
      if (attempts.length > 0)
        yield* quoteSkillsEntries(primaryRepository, initialPr).pipe(
          Effect.catch((error) =>
            Console.error(
              `Unable to add skills.yml entries to pull requests: ${describeFailure(error)}`,
            ),
          ),
        );

      // Benchmark figures are informational; never fail a published run on them.
      if (attempts.length > 0)
        yield* annotatePullRequests(initialPr, attempts, {
          agent: config.opencodeAgent,
          runUrl: run.url,
        }).pipe(
          Effect.catch((error) =>
            Console.error(
              `Unable to add agent run details to pull requests: ${describeFailure(error)}`,
            ),
          ),
        );
      yield* refreshDashboard(primaryRepository);

      const model = attempts.findLast((attempt) => attempt.succeeded)?.model;

      return work.length === 0
        ? "no updates needing work"
        : `worked on ${work.join(", ")}${model ? ` with ${model}` : ""}`;
    }),
  ).pipe(
    // Another device is working on the run, so this one is not needed.
    Effect.catchTag(
      "SkillUpdatesCoordinationError",
      (
        error,
      ): Effect.Effect<
        never,
        SkillUpdatesCoordinationError | SkillUpdatesDeferredError
      > =>
        error.operation === "coordination.busy"
          ? Effect.fail(
              new SkillUpdatesDeferredError({ message: error.message }),
            )
          : Effect.fail(error),
    ),
    // A lost OpenCode server is not a fault in the run; retry later.
    Effect.mapError((error) =>
      (error instanceof SkillUpdatesAgentError ||
        error instanceof SkillUpdatesRetryableError) &&
      error.operation === serverUnavailableOperation
        ? new SkillUpdatesDeferredError({ message: error.message })
        : error,
    ),
  );

  yield* fs.makeDirectory(path.dirname(config.stateFile), {
    recursive: true,
  });
  const temporary = `${config.stateFile}.${process.pid}`;
  yield* fs.writeFileString(temporary, `${run.id}\n`);
  yield* fs.chmod(temporary, 0o600);
  yield* fs.rename(temporary, config.stateFile);
  yield* Console.log(`Processed workflow run ${run.id}`);
  yield* Console.log(
    `[RESULT] Run ${run.id}: ${outcome ?? "already processed"}`,
  );
});

/** Process one completed update workflow run on this device. */
export const runDeviceSkillUpdates = (configPath?: string, runId?: string) =>
  runDevice(configPath, runId).pipe(
    // The locked child prints its own result, which must stay the last one.
    Effect.tapError((error) =>
      (error instanceof SkillUpdatesDeferredError && error.reported) ||
      (error instanceof SkillUpdatesAgentError &&
        error.operation === "run.child")
        ? Effect.void
        : Console.log(
            error instanceof SkillUpdatesDeferredError ||
              error instanceof NetworkUnavailableError
              ? `[RESULT] Deferred: ${error.message}`
              : `[RESULT] Failed: ${describeFailure(error)}`,
          ),
    ),
  );

export const migrateLegacyLock = Effect.fn("UpdatesAgent.migrateLegacyLock")(
  function* (lockFile: string) {
    const fs = yield* FileSystem.FileSystem;

    if (
      (yield* fs.exists(lockFile)) &&
      (yield* fs.stat(lockFile)).type === "Directory"
    )
      yield* fs.remove(lockFile, { recursive: true });
  },
);

export const skillUpdatesAgent = (options: {
  readonly mode: "github" | "device";
  readonly skillsDir?: string | undefined;
  readonly configPath?: string | undefined;
  readonly runId?: string | undefined;
}) =>
  options.mode === "github"
    ? runGitHubSkillUpdates(options.skillsDir ?? process.cwd())
    : runDeviceSkillUpdates(options.configPath, options.runId);

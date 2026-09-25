import { GhChunk } from "@timmo001/effect-gh";
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
  Schema,
  Stream,
} from "effect";
import { Yaml } from "effect/unstable/encoding";
import {
  buildUpdateReport,
  renderUpdateMarkdown,
  type UpdateReportItem,
} from "./Updates.js";
import { importSkill } from "./Import.js";
import { CommandError, CommandExecutor } from "../services/CommandExecutor.js";
import { GitHub } from "../services/GitHub.js";
import {
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

const FAILURE_PREFIX = "STATUS: failure";

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

const PullRequestNumbers = Schema.Array(
  Schema.Struct({ number: Schema.Int.check(Schema.isGreaterThan(0)) }),
);

const PullRequestTitles = Schema.Array(
  Schema.Struct({
    number: Schema.Int.check(Schema.isGreaterThan(0)),
    title: Schema.String,
  }),
);

const PullRequestPolicy = Schema.Struct({
  title: Schema.String,
  state: Schema.String,
  mergedAt: Schema.NullOr(Schema.String),
  assignees: Schema.Array(Schema.Struct({ login: Schema.String })),
  autoMergeRequest: Schema.NullOr(
    Schema.Struct({ mergeMethod: Schema.String }),
  ),
  commits: Schema.Array(Schema.Struct({ messageHeadline: Schema.String })),
});

export class SkillUpdatesAgentError extends Schema.TaggedError<SkillUpdatesAgentError>()(
  "SkillUpdatesAgentError",
  { operation: Schema.String, message: Schema.String },
) {}

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
];

const setsUpstreamSha = (patch: string, skill: string, sha: string) =>
  patch
    .split("\n")
    .some(
      (line) =>
        line.startsWith("+") &&
        line.slice(1).trimStart().startsWith(`"${skill}":`) &&
        line.includes(`"upstreamSha": "${sha}"`),
    );

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
) =>
  [
    config.prompt.trim(),
    "",
    "Trusted automation context:",
    `- Dashboard issue: ${config.dashboardIssue}`,
    `- Completed workflow run: ${run.url}`,
    "",
    "Return exactly one status line followed by a concise summary. Use `STATUS: success` only after all requested work and cleanup completed. Use `STATUS: failure` followed by the blocker otherwise.",
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
    .filter((line) => line === SUCCESS_PREFIX || line === FAILURE_PREFIX);

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

  const metadata = changes.get("imports.json");

  const frontmatter =
    changes.get(`${skill}/SKILL.md`) ??
    changes.get(`upstream/${skill}/UPSTREAM_SKILL.md`);

  if (
    changes.size !== 2 ||
    !metadata ||
    !frontmatter ||
    metadata.removed.length !== 1 ||
    metadata.added.length !== 1 ||
    frontmatter.removed.length !== 1 ||
    frontmatter.added.length !== 1
  )
    return false;
  const pattern = /"upstreamSha": "([0-9a-f]{40})"/;
  const oldMetadata = metadata.removed[0] ?? "";
  const newMetadata = metadata.added[0] ?? "";
  const oldSha = oldMetadata.match(pattern)?.[1];
  const newSha = newMetadata.match(pattern)?.[1];

  const oldFrontmatter = frontmatter.removed[0]?.match(
    /^# upstream-sha: ([0-9a-f]{40})$/,
  )?.[1];

  const newFrontmatter = frontmatter.added[0]?.match(
    /^# upstream-sha: ([0-9a-f]{40})$/,
  )?.[1];

  return (
    oldMetadata.includes(`"${skill}":`) &&
    newMetadata.includes(`"${skill}":`) &&
    oldSha !== undefined &&
    newSha !== undefined &&
    oldSha !== newSha &&
    oldMetadata.replace(pattern, '"upstreamSha": "<sha>"') ===
      newMetadata.replace(pattern, '"upstreamSha": "<sha>"') &&
    oldFrontmatter === oldSha &&
    newFrontmatter === newSha
  );
}

export function isScopedSkillPatch(patch: string, skill: string): boolean {
  const files = patch.split("\n").flatMap((line) => {
    const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);

    return match?.[1] && match[2] ? [[match[1], match[2]] as const] : [];
  });

  const allowed = (file: string) =>
    file === "imports.json" ||
    file.startsWith(`${skill}/`) ||
    file.startsWith(`upstream/${skill}/`);

  return (
    files.length >= 2 &&
    files.some(([from, to]) => from === "imports.json" && to === from) &&
    files.some(
      ([from, to]) =>
        (from === `${skill}/SKILL.md` ||
          from === `upstream/${skill}/UPSTREAM_SKILL.md`) &&
        to === from,
    ) &&
    files.every(([from, to]) => from === to && allowed(from))
  );
}

export const skillUpdateSubject = (patch: string, skill: string) =>
  isShaOnlySkillPatch(patch, skill)
    ? `[SHA-only] Update ${skill}`
    : `Update skill: ${skill}`;

export const applySkillUpdateAutoMergePolicy = Effect.fn(
  "UpdatesAgent.applyAutoMergePolicy",
)(function* (url: string, shaOnly: boolean, existing: boolean) {
  const github = yield* GitHub;

  if (shaOnly) {
    yield* github.run([
      "pr",
      "merge",
      "--auto",
      "--squash",
      url,
      "--repo",
      "timmo001/skills",
    ]);
  } else if (existing) {
    yield* github.run([
      "pr",
      "merge",
      "--disable-auto",
      url,
      "--repo",
      "timmo001/skills",
    ]);
  }
});

const decodeJson = <S extends Schema.Top>(
  operation: string,
  schema: S,
  raw: string,
): Effect.Effect<S["Type"], SkillUpdatesAgentError, S["DecodingServices"]> =>
  Effect.gen(function* () {
    const value = yield* Effect.try({
      try: () => JSON.parse(raw),
      catch: (cause) =>
        new SkillUpdatesAgentError({
          operation: `${operation}.json`,
          message: String(cause),
        }),
    });

    return yield* Schema.decodeUnknownEffect(schema)(value).pipe(
      Effect.mapError(
        (cause) =>
          new SkillUpdatesAgentError({
            operation: `${operation}.decode`,
            message: String(cause),
          }),
      ),
    );
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
    yield* runOrFail(
      "mise",
      ["exec", "npm:skills", "--", "skills", "add", ".", "--list"],
      root,
    );
  },
);

const publishCleanUpdate = Effect.fn("UpdatesAgent.publishCleanUpdate")(
  function* (root: string, name: string) {
    const executor = yield* CommandExecutor;
    const github = yield* GitHub;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const branch = `skill-update/${name}`;
    yield* runOrFail("git", ["checkout", "-B", branch, "origin/main"], root);
    yield* importSkill(root, name, { apply: true, metadataOnly: false });
    yield* validateRepository(root);
    yield* runOrFail("git", ["add", "--", "imports.json"], root);
    const snapshotPaths: string[] = [];

    for (const candidate of [name, path.join("upstream", name)])
      if (yield* fs.exists(path.join(root, candidate))) {
        yield* runOrFail("git", ["add", "-A", "--", candidate], root);
        snapshotPaths.push(candidate);
      }

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
      ["commit", "-m", title, "--", "imports.json", ...snapshotPaths],
      root,
    );
    yield* runOrFail(
      "git",
      ["push", "--force-with-lease", "origin", branch],
      root,
    );

    let url = (yield* github.run(
      [
        "pr",
        "list",
        "--head",
        branch,
        "--state",
        "open",
        "--json",
        "url",
        "--jq",
        ".[0].url // empty",
        "--repo",
        "timmo001/skills",
      ],
      { readOnly: true },
    )).trim();

    const existing = url.length > 0;

    if (existing)
      yield* github.run([
        "pr",
        "edit",
        url,
        "--title",
        title,
        "--add-assignee",
        "timmo001",
        "--repo",
        "timmo001/skills",
      ]);
    else
      url = (yield* github.run([
        "pr",
        "create",
        "--base",
        "main",
        "--head",
        branch,
        "--title",
        title,
        "--body",
        `Update the reviewed upstream snapshot for \`${name}\`.`,
        "--assignee",
        "timmo001",
        "--repo",
        "timmo001/skills",
      ])).trim();
    yield* applySkillUpdateAutoMergePolicy(
      url,
      isShaOnlySkillPatch(patch, name),
      existing,
    );
    yield* github.run([
      "workflow",
      "run",
      "validate.yml",
      "--ref",
      branch,
      "--repo",
      "timmo001/skills",
    ]);
  },
);

const refreshDashboard = Effect.fn("UpdatesAgent.refreshDashboard")(function* (
  root: string,
) {
  const github = yield* GitHub;
  const report = yield* buildUpdateReport(root);
  const markdown = renderUpdateMarkdown(report);
  const marker = "<!-- adapted-skill-updates -->";

  const number = (yield* github.run(
    [
      "issue",
      "list",
      "--state",
      "open",
      "--limit",
      "100",
      "--json",
      "number,body",
      "--jq",
      `map(select(.body | contains("${marker}")))[0].number // empty`,
      "--repo",
      "timmo001/skills",
    ],
    { readOnly: true },
  )).trim();

  yield* github.run([
    "issue",
    number ? "edit" : "create",
    ...(number ? [number] : []),
    "--title",
    "Skill updates",
    "--body",
    markdown,
    "--repo",
    "timmo001/skills",
  ]);
});

export const runGitHubSkillUpdates = Effect.fn("UpdatesAgent.runGitHub")(
  function* (root: string) {
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

      for (const name of cleanSkillUpdateNames(report.skills))
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
  const raw = yield* github.api(endpoint);

  if (runId) {
    const run = yield* decodeJson("workflow", WorkflowRun, raw);

    if (run.conclusion !== "success")
      return yield* new SkillUpdatesAgentError({
        operation: "workflow.select",
        message: `Workflow run ${run.id} concluded ${run.conclusion ?? "without a result"}`,
      });

    return { id: run.id, url: run.html_url };
  }

  const runs = yield* decodeJson("workflow", WorkflowRuns, raw);
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
        operation: "repository.check",
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

const latestPullRequestNumber = Effect.fn(
  "UpdatesAgent.latestPullRequestNumber",
)(function* () {
  const github = yield* GitHub;

  const pulls = yield* decodeJson(
    "pull-requests",
    PullRequestNumbers,
    yield* github.run(
      [
        "pr",
        "list",
        "--state",
        "all",
        "--limit",
        "1",
        "--json",
        "number",
        "--repo",
        "timmo001/skills",
      ],
      { readOnly: true },
    ),
  );

  return pulls[0]?.number ?? 0;
});

const pendingSkillUpdates = Effect.fn("UpdatesAgent.pendingSkillUpdates")(
  function* (root: string) {
    const github = yield* GitHub;
    const report = yield* buildUpdateReport(root);
    const pending = skillUpdatesNeedingWork(report.skills, []);

    if (pending.length === 0) return pending;

    const open = yield* decodeJson(
      "pull-requests",
      PullRequestTitles,
      yield* github.run(
        [
          "pr",
          "list",
          "--state",
          "open",
          "--limit",
          "100",
          "--json",
          "number,title",
          "--repo",
          "timmo001/skills",
        ],
        { readOnly: true },
      ),
    );

    const titles = new Set(pending.flatMap(skillUpdateTitles));
    const pulls: { title: string; patch: string }[] = [];

    for (const { number, title } of open.filter(({ title }) =>
      titles.has(title),
    ))
      pulls.push({
        title,
        patch: yield* github.run(
          ["pr", "diff", String(number), "--repo", "timmo001/skills"],
          { readOnly: true },
        ),
      });

    return skillUpdatesNeedingWork(report.skills, pulls);
  },
);

export const validatePullRequestPolicy = Effect.fn(
  "UpdatesAgent.validatePullRequestPolicy",
)(function* (after: number) {
  const github = yield* GitHub;

  const pulls = yield* decodeJson(
    "pull-requests",
    PullRequestNumbers,
    yield* github.run(
      [
        "pr",
        "list",
        "--state",
        "all",
        "--limit",
        "100",
        "--json",
        "number",
        "--repo",
        "timmo001/skills",
      ],
      { readOnly: true },
    ),
  );

  for (const { number } of pulls.filter(({ number }) => number > after)) {
    const details = yield* decodeJson(
      "pull-request",
      PullRequestPolicy,
      yield* github.run(
        [
          "pr",
          "view",
          String(number),
          "--json",
          "title,state,mergedAt,assignees,autoMergeRequest,commits",
          "--repo",
          "timmo001/skills",
        ],
        { readOnly: true },
      ),
    );

    const patch = yield* github.run(
      ["pr", "diff", String(number), "--repo", "timmo001/skills"],
      { readOnly: true },
    );

    const shaTitle = details.title.match(/^\[SHA-only\] Update ([a-z0-9-]+)$/);
    const contentTitle = details.title.match(/^Update skill: ([a-z0-9-]+)$/);
    const skill = shaTitle?.[1] ?? contentTitle?.[1];

    const commitsValid =
      !!skill &&
      details.commits.length === 1 &&
      details.commits[0]?.messageHeadline === details.title;

    const shaValid =
      !!shaTitle &&
      details.assignees.some(({ login }) => login === "timmo001") &&
      details.autoMergeRequest?.mergeMethod === "SQUASH" &&
      !!skill &&
      isShaOnlySkillPatch(patch, skill);

    const contentValid =
      !!contentTitle &&
      details.state === "OPEN" &&
      details.mergedAt === null &&
      details.autoMergeRequest === null &&
      !!skill &&
      !isShaOnlySkillPatch(patch, skill) &&
      isScopedSkillPatch(patch, skill);

    if (!commitsValid || (!shaValid && !contentValid))
      return yield* new SkillUpdatesAgentError({
        operation: "pull-request.policy",
        message: `Pull request #${number} does not satisfy the skill update policy`,
      });
  }
});

const PullRequestBody = Schema.Struct({ body: Schema.String });

const annotatePullRequests = Effect.fn("UpdatesAgent.annotatePullRequests")(
  function* (
    after: number,
    attempts: readonly SkillUpdatesAttempt[],
    context: { readonly agent: string; readonly runUrl: string },
  ) {
    const github = yield* GitHub;

    const created = (yield* decodeJson(
      "pull-requests",
      PullRequestNumbers,
      yield* github.run(
        [
          "pr",
          "list",
          "--state",
          "all",
          "--limit",
          "100",
          "--json",
          "number",
          "--repo",
          "timmo001/skills",
        ],
        { readOnly: true },
      ),
    )).filter(({ number }) => number > after);

    const section = renderSkillUpdatesBenchmark(attempts, {
      ...context,
      pullRequests: created.length,
    });

    for (const { number } of created) {
      const { body } = yield* decodeJson(
        "pull-request",
        PullRequestBody,
        yield* github.run(
          [
            "pr",
            "view",
            String(number),
            "--json",
            "body",
            "--repo",
            "timmo001/skills",
          ],
          { readOnly: true },
        ),
      );

      yield* github.run([
        "pr",
        "edit",
        String(number),
        "--body",
        withSkillUpdatesBenchmark(body, section),
        "--repo",
        "timmo001/skills",
      ]);
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
          session = yield* createSkillUpdatesSession(config);
          yield* executor
            .stream(
              config.opencodeCommand,
              [
                ...(config.opencodeArgs ?? []),
                "run",
                "--server",
                session.server,
                "--session",
                session.id,
                "--auto",
                "--agent",
                config.opencodeAgent,
                "--model",
                name,
                "--title",
                "Scheduled skill updates",
                prompt,
              ],
              {
                cwd: config.repositories[0],
                env: { OPENCODE_PASSWORD: Redacted.value(session.password) },
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

      // A timed-out client can leave its session running on the server.
      if (session) yield* stopSkillUpdatesSession(config, session);
      attempts.push({
        model: label,
        succeeded: false,
        usage: session ? yield* usageOf(session) : null,
      });
      yield* requireRepositoryState(states);

      if ((yield* latestPullRequestNumber()) > initialPr)
        return yield* new SkillUpdatesAgentError({
          operation: "opencode.partial",
          message: "A failed model attempt created pull requests",
        });
    }

    return yield* new SkillUpdatesRetryableError({
      operation: "opencode.models",
      message: last,
    });
  },
);

export const runDeviceSkillUpdates = Effect.fn("UpdatesAgent.runDevice")(
  function* (configPath?: string, runId?: string) {
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
      yield* github
        .stream(
          [
            "run",
            "watch",
            runId,
            "--repo",
            "timmo001/skills",
            "--compact",
            "--exit-status",
            "--interval",
            "10",
          ],
          { cwd: process.cwd(), timeout: null },
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

      if (code !== 0)
        return yield* new SkillUpdatesAgentError({
          operation: code === 75 ? "run.lock" : "run.child",
          message:
            code === 75
              ? "Another skill updates agent run is active"
              : `Locked skill updates agent exited with code ${code}`,
        });

      return;
    }

    const run = yield* fetchRun(config, runId);

    yield* withSkillUpdatesClaim(
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

        if (pending.length === 0)
          yield* Console.log(
            "Every pending skill update already has an open pull request; skipping the model",
          );
        else {
          yield* Console.log(`Updates needing work: ${pending.join(", ")}`);
          attempts = yield* processWithFallback(
            config,
            skillUpdatesAgentPrompt(config, run),
            states,
            initialPr,
          );
        }

        yield* requireRepositoryState(states);
        yield* validatePullRequestPolicy(initialPr);

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
      }),
    );
    yield* fs.makeDirectory(path.dirname(config.stateFile), {
      recursive: true,
    });
    const temporary = `${config.stateFile}.${process.pid}`;
    yield* fs.writeFileString(temporary, `${run.id}\n`);
    yield* fs.chmod(temporary, 0o600);
    yield* fs.rename(temporary, config.stateFile);
    yield* Console.log(`Processed workflow run ${run.id}`);
  },
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

import { describe, expect, it } from "@effect/vitest";
import { NodeServices } from "@effect/platform-node";
import {
  ConfigProvider,
  Effect,
  FileSystem,
  Layer,
  Path,
  Stream,
} from "effect";
import {
  applySkillUpdateAutoMergePolicy,
  cleanSkillUpdateNames,
  isScopedSkillPatch,
  isShaOnlySkillPatch,
  latestSuccessfulWorkflowRun,
  requireRepositoryState,
  runDeviceSkillUpdates,
  runGitHubSkillUpdates,
  skillUpdatesAgentModelArgument,
  skillUpdatesAgentPrompt,
  skillUpdatesAgentResultStatus,
  skillUpdateSubject,
  skillUpdatesWorkflowEndpoint,
  SkillUpdatesAgentError,
  validatePullRequestPolicy,
  type SkillUpdatesAgentConfig,
} from "../src/commands/UpdatesAgent.js";
import { CommandExecutor } from "../src/services/CommandExecutor.js";
import { GitHub, type GitHubService } from "../src/services/GitHub.js";

const config: SkillUpdatesAgentConfig = {
  workflowApi: "https://api.github.com/example",
  dashboardIssue: "https://github.com/example/issues/1",
  repositories: ["/tmp/skills"],
  stateFile: "/tmp/last-run",
  opencodeCommand: "/usr/bin/opencode",
  opencodeAgent: "build",
  opencodeModels: [
    { providerID: "github-copilot", modelID: "gpt-test", variant: "low" },
  ],
  prompt: "Process the dashboard.",
};

const githubLayer = (run: GitHubService["run"]) =>
  Layer.succeed(GitHub, {
    isAvailable: () => Effect.succeed(true),
    run,
    json: () => Effect.succeed({}),
    api: () => Effect.succeed(""),
    apiJson: () => Effect.succeed({}),
  });

const shaOnlyPatch = (oldSha: string, newSha: string) =>
  [
    "diff --git a/example/SKILL.md b/example/SKILL.md",
    "--- a/example/SKILL.md",
    "+++ b/example/SKILL.md",
    "@@ -1 +1 @@",
    `-# upstream-sha: ${oldSha}`,
    `+# upstream-sha: ${newSha}`,
    "diff --git a/imports.json b/imports.json",
    "--- a/imports.json",
    "+++ b/imports.json",
    "@@ -1 +1 @@",
    `-    "example": { "upstreamSha": "${oldSha}" },`,
    `+    "example": { "upstreamSha": "${newSha}" },`,
  ].join("\n");

describe("updates agent policies", () => {
  it.effect("selects clean content updates and stale SHA-only refreshes", () =>
    Effect.sync(() => {
      expect(
        cleanSkillUpdateNames([
          {
            name: "clean",
            state: "update-available",
            storedSha: "a".repeat(40),
            upstreamSha: "b".repeat(40),
            localEdits: [],
          },
          {
            name: "sha-only",
            state: "up-to-date",
            storedSha: "a".repeat(40),
            upstreamSha: "b".repeat(40),
            localEdits: [],
          },
          {
            name: "current",
            state: "up-to-date",
            storedSha: "b".repeat(40),
            upstreamSha: "b".repeat(40),
            localEdits: [],
          },
          {
            name: "adapted",
            state: "up-to-date",
            storedSha: "a".repeat(40),
            upstreamSha: "b".repeat(40),
            localEdits: ["Keep local wording"],
          },
        ]),
      ).toEqual(["clean", "sha-only"]);
      const patch = shaOnlyPatch("a".repeat(40), "b".repeat(40));
      expect(skillUpdateSubject(patch, "example")).toBe(
        "[SHA-only] Update example",
      );
    }),
  );

  it.effect("selects successful workflow runs", () =>
    Effect.sync(() => {
      expect(
        latestSuccessfulWorkflowRun({
          workflow_runs: [
            { id: 2, conclusion: "success", html_url: "https://example/2" },
          ],
        }),
      ).toEqual({ id: 2, url: "https://example/2" });
      expect(
        skillUpdatesAgentModelArgument({
          providerID: "github-copilot",
          modelID: "gpt-test",
          variant: "low",
        }),
      ).toBe("github-copilot/gpt-test#low");
      expect(
        skillUpdatesWorkflowEndpoint(
          "https://api.github.com/repos/org/repo/actions/runs?status=completed",
        ),
      ).toBe("repos/org/repo/actions/runs?status=completed");
    }),
  );

  it.effect("publishes an equal-content stale SHA as a SHA-only PR", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({
        prefix: "updates-agent-sha-only-test-",
      });
      const oldSha = "a".repeat(40);
      const newSha = "b".repeat(40);
      const origin = "https://github.com/org/repo/tree/main/example";
      yield* fs.writeFileString(
        path.join(root, "imports.json"),
        JSON.stringify({
          version: 1,
          imports: {
            example: {
              origin,
              upstreamSha: oldSha,
              license: "MIT",
              localEdits: [],
              distribution: "wholesale",
            },
          },
        }),
      );
      yield* fs.makeDirectory(path.join(root, "example"));
      yield* fs.writeFileString(
        path.join(root, "example", "SKILL.md"),
        `---\nname: example\ndescription: Example\nlicense: MIT\n# origin: ${origin}\n# upstream-sha: ${oldSha}\n---\nSame body\n`,
      );
      const githubCalls: string[][] = [];
      const commandLayer = Layer.effect(
        CommandExecutor,
        Effect.gen(function* () {
          const fixtureFs = yield* FileSystem.FileSystem;
          const fixturePath = yield* Path.Path;
          return CommandExecutor.of({
            capture: () =>
              Effect.succeed({ stdout: "", stderr: "", exitCode: 0 }),
            run: (command, args, options) =>
              Effect.gen(function* () {
                if (command === "git" && args.includes("--format=%H"))
                  return newSha;
                if (command === "git" && args.includes("--cached"))
                  return shaOnlyPatch(oldSha, newSha);
                if (command === "mise") {
                  const sourceName = args[args.indexOf("--skill") + 1];
                  if (!options?.cwd || !sourceName)
                    return yield* Effect.die("invalid SHA-only fixture");
                  const generated = fixturePath.join(
                    options.cwd,
                    ".agents",
                    "skills",
                    sourceName,
                  );
                  yield* fixtureFs.makeDirectory(generated, {
                    recursive: true,
                  });
                  yield* fixtureFs.writeFileString(
                    fixturePath.join(generated, "SKILL.md"),
                    "---\nname: upstream\ndescription: Example\n---\nSame body\n",
                  );
                }
                return "";
              }).pipe(Effect.orDie),
            exitCode: () => Effect.succeed(0),
            inherit: () => Effect.succeed(0),
            stream: () => Stream.empty,
          });
        }),
      );
      yield* runGitHubSkillUpdates(root).pipe(
        Effect.provide(commandLayer),
        Effect.provide(
          Layer.succeed(GitHub, {
            isAvailable: () => Effect.succeed(true),
            run: (args) => {
              githubCalls.push([...args]);
              return Effect.succeed(
                args[0] === "pr" && args[1] === "create"
                  ? "https://github.com/timmo001/skills/pull/1"
                  : "",
              );
            },
            json: () => Effect.succeed({}),
            api: () => Effect.succeed(""),
            apiJson: () => Effect.succeed([{ sha: newSha }]),
          }),
        ),
      );
      expect(
        githubCalls.some(
          (args) =>
            args[0] === "pr" &&
            args[1] === "create" &&
            args.includes("[SHA-only] Update example"),
        ),
      ).toBe(true);
      expect(
        githubCalls.some(
          (args) =>
            args[0] === "pr" &&
            args[1] === "merge" &&
            args.includes("--auto") &&
            args.includes("--squash"),
        ),
      ).toBe(true);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("disables auto-merge when an existing PR gains content", () =>
    Effect.gen(function* () {
      const calls: string[][] = [];
      yield* applySkillUpdateAutoMergePolicy(
        "https://github.com/timmo001/skills/pull/1",
        false,
        true,
      ).pipe(
        Effect.provide(
          githubLayer((args) => {
            calls.push([...args]);
            return Effect.succeed("");
          }),
        ),
      );
      expect(calls).toEqual([
        [
          "pr",
          "merge",
          "--disable-auto",
          "https://github.com/timmo001/skills/pull/1",
          "--repo",
          "timmo001/skills",
        ],
      ]);
    }),
  );

  it.effect("requires exactly one explicit status line", () =>
    Effect.sync(() => {
      expect(skillUpdatesAgentResultStatus("STATUS: success\nComplete")).toBe(
        "success",
      );
      expect(
        skillUpdatesAgentResultStatus("STATUS: failure\nSTATUS: success"),
      ).toBeNull();
      expect(skillUpdatesAgentResultStatus("Work complete")).toBeNull();
    }),
  );

  it.effect("renders trusted prompt and model context", () =>
    Effect.sync(() => {
      const prompt = skillUpdatesAgentPrompt(config, {
        id: 42,
        url: "https://github.com/example/actions/runs/42",
      });
      expect(prompt).toContain(config.prompt);
      expect(prompt).toContain(config.dashboardIssue);
      expect(prompt).toContain("actions/runs/42");
      expect(prompt).toContain("STATUS: success");
      expect(
        skillUpdatesAgentModelArgument({
          providerID: "github-copilot",
          modelID: "gpt-test",
          variant: "low",
        }),
      ).toBe("github-copilot/gpt-test#low");
    }),
  );

  it.effect("selects the newest successful run and handles no success", () =>
    Effect.sync(() => {
      expect(
        latestSuccessfulWorkflowRun({
          workflow_runs: [
            { id: 3, conclusion: "failure", html_url: "https://example/3" },
            { id: 2, conclusion: "success", html_url: "https://example/2" },
            { id: 1, conclusion: "success", html_url: "https://example/1" },
          ],
        }),
      ).toEqual({ id: 2, url: "https://example/2" });
      expect(
        latestSuccessfulWorkflowRun({
          workflow_runs: [
            { id: 1, conclusion: "failure", html_url: "https://example/1" },
          ],
        }),
      ).toBeNull();
    }),
  );

  it.effect("enforces SHA-only and scoped patch policy", () =>
    Effect.sync(() => {
      const oldSha = "a".repeat(40);
      const newSha = "b".repeat(40);
      const patch = shaOnlyPatch(oldSha, newSha);
      expect(isShaOnlySkillPatch(patch, "example")).toBe(true);
      expect(isScopedSkillPatch(patch, "example")).toBe(true);
      expect(skillUpdateSubject(patch, "example")).toBe(
        "[SHA-only] Update example",
      );
      expect(
        isScopedSkillPatch(
          `${patch}\ndiff --git a/other/SKILL.md b/other/SKILL.md`,
          "example",
        ),
      ).toBe(false);
    }),
  );

  it.effect("accepts SHA-only changes for non-discoverable snapshots", () =>
    Effect.sync(() => {
      const oldSha = "a".repeat(40);
      const newSha = "b".repeat(40);
      const patch = [
        "diff --git a/upstream/example/UPSTREAM_SKILL.md b/upstream/example/UPSTREAM_SKILL.md",
        "--- a/upstream/example/UPSTREAM_SKILL.md",
        "+++ b/upstream/example/UPSTREAM_SKILL.md",
        "@@ -1 +1 @@",
        `-# upstream-sha: ${oldSha}`,
        `+# upstream-sha: ${newSha}`,
        "diff --git a/imports.json b/imports.json",
        "--- a/imports.json",
        "+++ b/imports.json",
        "@@ -1 +1 @@",
        `-    "example": { "upstreamSha": "${oldSha}" },`,
        `+    "example": { "upstreamSha": "${newSha}" },`,
      ].join("\n");
      expect(isShaOnlySkillPatch(patch, "example")).toBe(true);
      expect(isScopedSkillPatch(patch, "example")).toBe(true);
    }),
  );

  it.effect("rejects content, metadata, rename, and cross-skill patches", () =>
    Effect.sync(() => {
      const oldSha = "a".repeat(40);
      const newSha = "b".repeat(40);
      const metadataPatch = [
        "diff --git a/example/SKILL.md b/example/SKILL.md",
        "--- a/example/SKILL.md",
        "+++ b/example/SKILL.md",
        "@@ -1 +1 @@",
        `-# upstream-sha: ${oldSha}`,
        `+# upstream-sha: ${newSha}`,
        "diff --git a/imports.json b/imports.json",
        "--- a/imports.json",
        "+++ b/imports.json",
        "@@ -1 +1 @@",
        `-    "example": { "origin": "old", "upstreamSha": "${oldSha}" },`,
        `+    "example": { "origin": "new", "upstreamSha": "${newSha}" },`,
      ].join("\n");
      expect(isShaOnlySkillPatch(metadataPatch, "example")).toBe(false);
      expect(
        isShaOnlySkillPatch(
          "diff --git a/example/SKILL.md b/renamed/SKILL.md",
          "example",
        ),
      ).toBe(false);
      expect(
        isScopedSkillPatch(
          [
            "diff --git a/example/SKILL.md b/example/SKILL.md",
            "diff --git a/imports.json b/imports.json",
            "diff --git a/other/SKILL.md b/other/SKILL.md",
          ].join("\n"),
          "example",
        ),
      ).toBe(false);
      expect(skillUpdateSubject("content changed", "example")).toBe(
        "Update skill: example",
      );
    }),
  );

  it.effect("accepts a valid SHA-only pull request policy", () =>
    Effect.gen(function* () {
      yield* validatePullRequestPolicy(4);
    }).pipe(
      Effect.provide(
        githubLayer((args) => {
          if (args[0] === "pr" && args[1] === "diff")
            return Effect.succeed(shaOnlyPatch("a".repeat(40), "b".repeat(40)));
          if (args[0] === "pr" && args[1] === "view")
            return Effect.succeed(
              JSON.stringify({
                title: "[SHA-only] Update example",
                state: "OPEN",
                mergedAt: null,
                assignees: [{ login: "timmo001" }],
                autoMergeRequest: { mergeMethod: "SQUASH" },
                commits: [{ messageHeadline: "[SHA-only] Update example" }],
              }),
            );
          return Effect.succeed('[{"number":5}]');
        }),
      ),
    ),
  );

  it.effect("rejects auto-merge on content pull requests", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(validatePullRequestPolicy(4));
      expect(failure).toBeInstanceOf(SkillUpdatesAgentError);
      if (failure._tag === "SkillUpdatesAgentError")
        expect(failure.operation).toBe("pull-request.policy");
    }).pipe(
      Effect.provide(
        githubLayer((args) => {
          if (args[0] === "pr" && args[1] === "diff")
            return Effect.succeed(
              [
                "diff --git a/example/SKILL.md b/example/SKILL.md",
                "-Old",
                "+New",
                "diff --git a/imports.json b/imports.json",
              ].join("\n"),
            );
          if (args[0] === "pr" && args[1] === "view")
            return Effect.succeed(
              JSON.stringify({
                title: "Update skill: example",
                state: "OPEN",
                mergedAt: null,
                assignees: [{ login: "timmo001" }],
                autoMergeRequest: { mergeMethod: "SQUASH" },
                commits: [{ messageHeadline: "Update skill: example" }],
              }),
            );
          return Effect.succeed('[{"number":5}]');
        }),
      ),
    ),
  );

  it.effect("watches before locking and migrates a legacy lock directory", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({
        prefix: "updates-agent-lock-test-",
      });
      const stateFile = path.join(root, "state", "last-run");
      const lockFile = `${stateFile}.lock`;
      const configFile = path.join(root, "agent.yml");
      yield* fs.makeDirectory(lockFile, { recursive: true });
      yield* fs.writeFileString(
        configFile,
        [
          "workflowApi: https://api.github.com/example",
          "dashboardIssue: https://github.com/example/issues/1",
          "repositories:",
          `  - ${root}`,
          `stateFile: ${stateFile}`,
          "opencodeCommand: /usr/bin/opencode",
          "opencodeAgent: build",
          "opencodeModels:",
          "  - providerID: github-copilot",
          "    modelID: gpt-test",
          "prompt: Process updates.",
          "",
        ].join("\n"),
      );
      const calls: string[][] = [];
      yield* runDeviceSkillUpdates(configFile, "42").pipe(
        Effect.provide(
          Layer.succeed(CommandExecutor, {
            capture: () =>
              Effect.succeed({ stdout: "", stderr: "", exitCode: 0 }),
            run: () => Effect.succeed(""),
            exitCode: () => Effect.succeed(0),
            inherit: (command, args) => {
              calls.push([command, ...args]);
              return Effect.succeed(0);
            },
            stream: () => Stream.empty,
          }),
        ),
        Effect.provide(githubLayer(() => Effect.succeed(""))),
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.fromUnknown({
              HOME: root,
              SKILL_MAINTENANCE_AGENT_LOCKED: false,
            }),
          ),
        ),
      );
      expect(calls[0]?.slice(0, 4)).toEqual(["gh", "run", "watch", "42"]);
      expect(calls[1]?.[0]).toBe("flock");
      expect(yield* fs.exists(lockFile)).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("detects repository state that was not restored", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({
        prefix: "updates-agent-restore-test-",
      });
      yield* fs.makeDirectory(path.join(root, ".git"));
      const failure = yield* Effect.flip(
        requireRepositoryState([{ path: root, branch: "main" }]),
      );
      if (failure._tag === "SkillUpdatesAgentError")
        expect(failure.operation).toBe("repository.branch");
    }).pipe(
      Effect.scoped,
      Effect.provide(
        Layer.succeed(CommandExecutor, {
          capture: () =>
            Effect.succeed({ stdout: "", stderr: "", exitCode: 0 }),
          run: (_command, args) =>
            Effect.succeed(
              args.includes("--porcelain")
                ? ""
                : args.includes("--show-current")
                  ? "feature\n"
                  : "origin/main\n",
            ),
          exitCode: () => Effect.succeed(0),
          inherit: () => Effect.succeed(0),
          stream: () => Stream.empty,
        }),
      ),
      Effect.provide(NodeServices.layer),
    ),
  );

  it.effect("records completed state only after successful processing", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({
        prefix: "updates-agent-state-test-",
      });
      const stateFile = path.join(root, "state", "last-run");
      const configFile = path.join(root, "agent.yml");
      yield* fs.makeDirectory(path.join(root, ".git"));
      yield* fs.writeFileString(
        path.join(root, "imports.json"),
        '{"version":1,"imports":{}}',
      );
      yield* fs.writeFileString(
        configFile,
        [
          "workflowApi: https://api.github.com/example",
          "dashboardIssue: https://github.com/example/issues/1",
          "repositories:",
          `  - ${root}`,
          `stateFile: ${stateFile}`,
          "opencodeCommand: /usr/bin/opencode",
          "opencodeAgent: build",
          "opencodeModels:",
          "  - providerID: github-copilot",
          "    modelID: gpt-test",
          "  - providerID: github-copilot",
          "    modelID: gpt-fallback",
          "prompt: Process updates.",
          "",
        ].join("\n"),
      );
      let succeeds = false;
      let modelAttempt = 0;
      const executor = Layer.succeed(CommandExecutor, {
        capture: () => Effect.succeed({ stdout: "", stderr: "", exitCode: 0 }),
        run: (_command, args) =>
          Effect.succeed(
            args.includes("--porcelain")
              ? ""
              : args.includes("--show-current")
                ? "main\n"
                : "origin/main\n",
          ),
        exitCode: () => Effect.succeed(0),
        inherit: () => Effect.succeed(0),
        stream: () => {
          modelAttempt += 1;
          return Stream.make(
            succeeds && modelAttempt === 2
              ? "STATUS: success"
              : "STATUS: failure",
          );
        },
      });
      const github = Layer.succeed(GitHub, {
        isAvailable: () => Effect.succeed(true),
        api: () =>
          Effect.succeed(
            JSON.stringify({
              id: 42,
              conclusion: "success",
              html_url: "https://github.com/example/actions/runs/42",
            }),
          ),
        apiJson: () => Effect.succeed({}),
        json: () => Effect.succeed({}),
        run: (args) =>
          Effect.succeed(
            args[0] === "pr" && args[1] === "list"
              ? args.includes("1")
                ? '[{"number":4}]'
                : "[]"
              : "",
          ),
      });
      const run = runDeviceSkillUpdates(configFile, "42").pipe(
        Effect.provide(executor),
        Effect.provide(github),
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.fromUnknown({
              HOME: root,
              SKILL_MAINTENANCE_AGENT_LOCKED: true,
            }),
          ),
        ),
      );
      expect((yield* Effect.exit(run))._tag).toBe("Failure");
      expect(yield* fs.exists(stateFile)).toBe(false);
      succeeds = true;
      modelAttempt = 0;
      yield* run;
      expect(modelAttempt).toBe(2);
      expect(yield* fs.readFileString(stateFile)).toBe("42\n");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});

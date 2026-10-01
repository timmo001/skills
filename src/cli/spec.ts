import { Effect, FileSystem, Option } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  checkSkillsCatalogue,
  writeSkillsCatalogue,
} from "../commands/Catalogue.js";
import { check } from "../commands/Check.js";
import { importSkill } from "../commands/Import.js";
import { install } from "../commands/Install.js";
import { updates } from "../commands/Updates.js";
import {
  runDeviceSkillUpdates,
  runGitHubSkillUpdates,
} from "../commands/UpdatesAgent.js";
import { validate } from "../commands/Validate.js";
import { recoverSkillUpdatesClaim } from "../commands/UpdatesAgentCoordination.js";

const bool = (name: string, description: string) =>
  Flag.Boolean(name).pipe(
    Flag.withDefault(false),
    Flag.withDescription(description),
  );

const optional = <A>(value: Option.Option<A>) => Option.getOrUndefined(value);

export const resolveSkillsRoot = Effect.fn("resolveSkillsRoot")(function* (
  cwd = process.cwd(),
  home = homedir(),
) {
  const fs = yield* FileSystem.FileSystem;

  const candidates = [
    cwd,
    join(home, "repos", "skills"),
    join(home, ".config", "dotfiles", "agents", ".agents", "skills"),
  ];

  for (const candidate of candidates) {
    if (yield* fs.exists(join(candidate, "imports.json"))) return candidate;
  }

  return cwd;
});

export const validateCommand = Command.make("validate", {}, () =>
  resolveSkillsRoot().pipe(Effect.flatMap(validate)),
).pipe(Command.withDescription("Validate skills and repository metadata"));

export const catalogueCommand = Command.make(
  "catalogue",
  {
    check: bool(
      "check",
      "Exit non-zero when SKILLS.md does not match the generated catalogue",
    ),
  },
  ({ check }) =>
    resolveSkillsRoot().pipe(
      Effect.flatMap(check ? checkSkillsCatalogue : writeSkillsCatalogue),
    ),
).pipe(
  Command.withDescription(
    "Generate or check the SKILLS.md catalogue from skill frontmatter",
  ),
);

export const importCommand = Command.make(
  "import",
  {
    name: Argument.String("name").pipe(
      Argument.withDescription("Imported skill name"),
    ),
    apply: bool("apply", "Apply a clean upstream snapshot"),
    metadataOnly: bool(
      "metadata-only",
      "Materialise imports.json metadata only",
    ),
    reviewedSha: Flag.String("reviewed-sha").pipe(
      Flag.optional,
      Flag.withDescription("Set the reviewed upstream SHA"),
    ),
  },
  ({ apply, metadataOnly, name, reviewedSha }) =>
    resolveSkillsRoot().pipe(
      Effect.flatMap((root) =>
        importSkill(root, name, {
          apply,
          metadataOnly,
          reviewedSha: optional(reviewedSha),
        }),
      ),
    ),
).pipe(Command.withDescription("Fetch and compare or apply an imported skill"));

export const installCommand = Command.make(
  "install",
  {
    target: Flag.Path("target", { pathType: "directory" }).pipe(
      Flag.withDefault(join(homedir(), ".agents", "skills")),
      Flag.withDescription("Skills directory to install into"),
    ),
  },
  ({ target }) =>
    resolveSkillsRoot().pipe(Effect.flatMap((root) => install(root, target))),
).pipe(
  Command.withDescription(
    "Install external imports at their pinned SHAs without committing them",
  ),
);

export const updatesCommand = Command.make(
  "updates",
  {
    check: bool("check", "Exit non-zero when imports need attention"),
    update: bool("update", "Apply clean updates and SHA-only refreshes"),
    json: bool("json", "Print the versioned machine report"),
    skill: Flag.String("skill").pipe(
      Flag.optional,
      Flag.withDescription("Limit to one skill"),
    ),
    commit: Flag.Boolean("commit").pipe(
      Flag.withDefault(true),
      Flag.withDescription("Commit applied updates"),
    ),
    skipReview: bool("skip-review", "Do not open adapted imports for review"),
  },
  ({ check, commit, json, skill, skipReview, update }) =>
    resolveSkillsRoot().pipe(
      Effect.flatMap((root) =>
        updates(root, {
          check,
          update,
          json,
          skill: optional(skill),
          noCommit: !commit,
          skipReview,
        }),
      ),
    ),
).pipe(Command.withDescription("Check and update tracked upstream skills"));

export const checkCommand = Command.make(
  "check",
  {
    skill: Flag.String("skill").pipe(
      Flag.optional,
      Flag.withDescription("Check one skill"),
    ),
    diffOrigin: bool("diff-origin", "Render complete upstream diffs"),
    openOpencode: bool("open-opencode", "Open an interactive OpenCode review"),
  },
  ({ diffOrigin, openOpencode, skill }) =>
    resolveSkillsRoot().pipe(
      Effect.flatMap((root) =>
        check(root, {
          skill: optional(skill),
          diffOrigin,
          openOpencode,
        }),
      ),
    ),
).pipe(Command.withDescription("Review adapted imports against their origins"));

export const githubAgentCommand = Command.make(
  "github",
  {
    skillsDir: Flag.Path("skills-dir", { pathType: "directory" }).pipe(
      Flag.optional,
      Flag.withDescription("Use this Skills checkout"),
    ),
  },
  ({ skillsDir }) =>
    Option.match(skillsDir, {
      onNone: () => resolveSkillsRoot(),
      onSome: Effect.succeed,
    }).pipe(Effect.flatMap(runGitHubSkillUpdates)),
).pipe(
  Command.withDescription("Publish clean import updates from GitHub Actions"),
);

export const deviceAgentCommand = Command.make(
  "device",
  {
    config: Flag.Path("config", { pathType: "file" }).pipe(
      Flag.withDescription("Use this YAML config"),
    ),
    runId: Flag.String("run-id").pipe(
      Flag.optional,
      Flag.withDescription("Wait for this workflow run"),
    ),
  },
  ({ config, runId }) => runDeviceSkillUpdates(config, optional(runId)),
).pipe(
  Command.withDescription("Process one completed update workflow locally"),
);

export const recoverAgentCommand = Command.make(
  "recover",
  {
    claim: Flag.String("claim").pipe(
      Flag.withDescription("Exact abandoned claim token"),
    ),
    outcome: Flag.Literals("outcome", ["retry", "processed"]),
    confirmStopped: bool(
      "confirm-stopped",
      "Confirm the owning runner and its OpenCode session have stopped",
    ),
  },
  ({ claim, outcome, confirmStopped }) =>
    recoverSkillUpdatesClaim(claim, outcome, confirmStopped),
).pipe(
  Command.withDescription(
    "Recover an abandoned device claim after inspecting partial work",
  ),
);

export const updatesAgentCommand = Command.make("updates-agent").pipe(
  Command.withSubcommands([
    githubAgentCommand,
    deviceAgentCommand,
    recoverAgentCommand,
  ]),
  Command.withDescription("Run scheduled skill update automation"),
);

export const skillMaintenanceCommand = Command.make("skill-maintenance").pipe(
  Command.withSubcommands([
    validateCommand,
    catalogueCommand,
    importCommand,
    installCommand,
    updatesCommand,
    checkCommand,
    updatesAgentCommand,
  ]),
  Command.withDescription("Maintain the Agent Skills repository"),
);

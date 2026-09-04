import { Option } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  checkSkillsCatalogue,
  writeSkillsCatalogue,
} from "../commands/Catalogue.js";
import { check } from "../commands/Check.js";
import { importSkill } from "../commands/Import.js";
import { updates } from "../commands/Updates.js";
import {
  runDeviceSkillUpdates,
  runGitHubSkillUpdates,
} from "../commands/UpdatesAgent.js";
import { validate } from "../commands/Validate.js";

const bool = (name: string, description: string) =>
  Flag.boolean(name).pipe(
    Flag.withDefault(false),
    Flag.withDescription(description),
  );
const optional = <A>(value: Option.Option<A>) => Option.getOrUndefined(value);

export const resolveSkillsRoot = (
  cwd = process.cwd(),
  home = homedir(),
  exists: (path: string) => boolean = existsSync,
) =>
  [
    cwd,
    join(home, "repos", "skills"),
    join(home, ".config", "dotfiles", "agents", ".agents", "skills"),
  ].find((candidate) => exists(join(candidate, "imports.json"))) ?? cwd;

export const validateCommand = Command.make("validate", {}, () =>
  validate(resolveSkillsRoot()),
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
    check
      ? checkSkillsCatalogue(resolveSkillsRoot())
      : writeSkillsCatalogue(resolveSkillsRoot()),
).pipe(
  Command.withDescription(
    "Generate or check the SKILLS.md catalogue from skill frontmatter",
  ),
);

export const importCommand = Command.make(
  "import",
  {
    name: Argument.string("name").pipe(
      Argument.withDescription("Imported skill name"),
    ),
    apply: bool("apply", "Apply a clean upstream snapshot"),
    metadataOnly: bool(
      "metadata-only",
      "Materialise imports.json metadata only",
    ),
    reviewedSha: Flag.string("reviewed-sha").pipe(
      Flag.optional,
      Flag.withDescription("Set the reviewed upstream SHA"),
    ),
  },
  ({ apply, metadataOnly, name, reviewedSha }) =>
    importSkill(resolveSkillsRoot(), name, {
      apply,
      metadataOnly,
      reviewedSha: optional(reviewedSha),
    }),
).pipe(Command.withDescription("Fetch and compare or apply an imported skill"));

export const updatesCommand = Command.make(
  "updates",
  {
    check: bool("check", "Exit non-zero when imports need attention"),
    update: bool("update", "Apply clean updates and SHA-only refreshes"),
    json: bool("json", "Print the versioned machine report"),
    skill: Flag.string("skill").pipe(
      Flag.optional,
      Flag.withDescription("Limit to one skill"),
    ),
    commit: Flag.boolean("commit").pipe(
      Flag.withDefault(true),
      Flag.withDescription("Commit applied updates"),
    ),
    skipReview: bool("skip-review", "Do not open adapted imports for review"),
  },
  ({ check, commit, json, skill, skipReview, update }) =>
    updates(resolveSkillsRoot(), {
      check,
      update,
      json,
      skill: optional(skill),
      noCommit: !commit,
      skipReview,
    }),
).pipe(Command.withDescription("Check and update tracked upstream skills"));

export const checkCommand = Command.make(
  "check",
  {
    skill: Flag.string("skill").pipe(
      Flag.optional,
      Flag.withDescription("Check one skill"),
    ),
    diffOrigin: bool("diff-origin", "Render complete upstream diffs"),
    openOpencode: bool("open-opencode", "Open an interactive OpenCode review"),
  },
  ({ diffOrigin, openOpencode, skill }) =>
    check(resolveSkillsRoot(), {
      skill: optional(skill),
      diffOrigin,
      openOpencode,
    }),
).pipe(Command.withDescription("Review adapted imports against their origins"));

export const githubAgentCommand = Command.make(
  "github",
  {
    skillsDir: Flag.path("skills-dir", { pathType: "directory" }).pipe(
      Flag.optional,
      Flag.withDescription("Use this Skills checkout"),
    ),
  },
  ({ skillsDir }) =>
    runGitHubSkillUpdates(optional(skillsDir) ?? resolveSkillsRoot()),
).pipe(
  Command.withDescription("Publish clean import updates from GitHub Actions"),
);

export const deviceAgentCommand = Command.make(
  "device",
  {
    config: Flag.path("config", { pathType: "file" }).pipe(
      Flag.withDescription("Use this YAML config"),
    ),
    runId: Flag.string("run-id").pipe(
      Flag.optional,
      Flag.withDescription("Wait for this workflow run"),
    ),
  },
  ({ config, runId }) => runDeviceSkillUpdates(config, optional(runId)),
).pipe(
  Command.withDescription("Process one completed update workflow locally"),
);

export const updatesAgentCommand = Command.make("updates-agent").pipe(
  Command.withSubcommands([githubAgentCommand, deviceAgentCommand]),
  Command.withDescription("Run scheduled skill update automation"),
);

export const skillMaintenanceCommand = Command.make("skill-maintenance").pipe(
  Command.withSubcommands([
    validateCommand,
    catalogueCommand,
    importCommand,
    updatesCommand,
    checkCommand,
    updatesAgentCommand,
  ]),
  Command.withDescription("Maintain the Agent Skills repository"),
);

# Skills

Reusable agent skills used across my development workflows. The repository follows the [Agent Skills specification](https://agentskills.io/specification), with each skill kept as a self-contained top-level directory.

The list of skills (name and description) lives in the generated [`SKILLS.md`](./SKILLS.md#skills-catalogue) catalogue.

Some skills are broadly portable. Others intentionally depend on a particular tool, repository, or local workflow. See [`PORTABILITY.md`](./PORTABILITY.md) before installing the full collection.

## Install

The repository toolchain pins Bun 1.4.0, Effect 4, and the Skills CLI through
mise. Install dependencies and build the standalone maintenance executable:

```bash
mise install
bun install --frozen-lockfile
bun run build
```

List the available skills:

```bash
mise exec npm:skills -- skills add timmo001/skills --list
```

Install selected skills for any supported agent:

```bash
mise exec npm:skills -- skills add timmo001/skills
```

Install or update non-interactively:

```bash
mise exec npm:skills -- skills add timmo001/skills --skill code-review --skill diagnose -g -y
mise exec npm:skills -- skills update -g -y
```

The [`skills`](https://github.com/vercel-labs/skills) CLI handles agent-specific locations for OpenCode, Claude Code, Codex, Cursor, and other Agent Skills clients. Commands use `mise exec npm:skills -- skills` to select the managed CLI unambiguously because other tools may bundle a path named `skills`. Generated agent mirrors are ignored and must not be kept inside this checkout.

Claude Code is supported through the same cross-agent installer. This repository does not add client-specific marketplace packaging or duplicate canonical skill content.

## Layout

```text
<name>/
├── SKILL.md
├── agents/       # optional client metadata
├── references/   # optional supporting material
├── scripts/      # optional deterministic helpers
└── assets/       # optional resources
```

`SKILL.md` is the source of truth. Keep supporting files one link away from it and use relative paths within a skill.

Unchanged upstream snapshots are committed under [`upstream/`](./upstream/README.md) for review and provenance. Their root files are named `UPSTREAM_SKILL.md`, so the Skills CLI does not offer them. Install those skills from the official sources listed there.

## Validate

```bash
bun run validate
./dist/skill-maintenance validate
mise exec npm:skills -- skills add . --list
```

The local validator checks the portable metadata contract, directory names, relative links, `skills.sh.json` / `PORTABILITY.md` coverage, and drift of the generated [`SKILLS.md`](./SKILLS.md#skills-catalogue) catalogue. TypeScript checks use Effect-aware Oxlint rules from `@timmo001/oxlint-rules/configs/recommended-effect`. CI also verifies the independent installer discovery result.

Imports are checked daily and after skill changes merge to `main`. Adapted imports are reported for manual review; unchanged upstream snapshots receive automated update pull requests.

The shared update entrypoint runs in either environment:

```bash
./dist/skill-maintenance updates-agent github --skills-dir /path/to/skills
./dist/skill-maintenance updates-agent device --config /path/to/skill-updates-agent.yml
./dist/skill-maintenance updates-agent device --config /path/to/skill-updates-agent.yml --run-id 123456
```

GitHub Actions builds this repository's executable and uses its `github` mode for scheduled checks, clean update pull requests, validation dispatches, and dashboard refreshes. A local device uses `device` mode to invoke its configured OpenCode processor. Repeated device calls are safe because the processor records the last completed workflow run.

Device configuration requires `opencodePermissions`, a non-empty array of OpenCode V2 `{ action, resource, effect }` rules using `allow` or `deny`. Keep machine-specific paths and command selections in that configuration. The runner prepends default-deny, then appends the selected agent's resolved explicit denials so job allowances cannot override them. Use `~/` for home-relative read, edit and external-directory resources; shell patterns are literal command text.

Each model attempt checks `service status` and requires the default OpenCode V2 server to be running. All subsequent CLI commands pin that address with `--server`: resolve the agent after plugin activation, create a fresh session through `api post /api/session`, read back its ordered permissions and location, then use `run --session <id> --auto`. No standalone server is started. This uses OpenCode 2.0.3's session permission contract through the CLI, without an SDK or direct HTTP client. Missing or changed permissions stop the attempt before prompting. Configured command wrappers apply to setup calls as well as the model run. Shell allowlists are not a filesystem sandbox, and MCP rules cannot restrict arguments or call counts. See the [V2 permissions reference](https://opencode.ai/v2/docs/permissions/).

The runner obtains the existing server password with `service get password` and passes it through `OPENCODE_PASSWORD`, not command arguments. The password stays redacted in the Effect workflow.

Effect generates Bash, Fish, and Zsh completions directly from the command specification:

```bash
./dist/skill-maintenance --completions bash
./dist/skill-maintenance --completions fish
./dist/skill-maintenance --completions zsh
```

Renovate manages the pinned mise tools and GitHub Actions. The scheduled import
checker manages reviewed upstream skill revisions separately.

## Maintenance

- Add new skills under `<name>/` at the repository root.
- Classify each new skill in `skills.sh.json` and `PORTABILITY.md`, then regenerate the human catalogue with `mise run catalogue` (or `./dist/skill-maintenance catalogue`) and commit `SKILLS.md`.
- Distribute imported skills only when this repository contains substantive local edits. An explicit `wholesale` import is the exception and must remain byte-for-byte upstream. Keep other unchanged snapshots under `upstream/` and install them from their owning repository.
- Maintain import provenance, reviewed SHA, licence, local edits, and distribution mode in `imports.json`.
- Use `./dist/skill-maintenance import <name>` to generate a complete upstream comparison. Use `--apply` only for clean official-source or wholesale imports; adapted changes remain manual. The importer rejects an adapted skill that exactly matches every file in its source and prints the standard reimport command instead.
- Keep `skills.sh.json`, `PORTABILITY.md`, and `SKILLS.md` in sync.
- Prefer repository revisions for installed copies. The scheduled checker reports adapted imports for manual review and opens pull requests for unchanged upstream updates.
- Do not duplicate canonical skills into checked-in agent-specific directories.

The current portability backlog is intentionally documented rather than mechanically rewriting all existing skills in one migration.

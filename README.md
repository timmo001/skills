# Skills

Reusable agent skills used across my development workflows. The repository follows the [Agent Skills specification](https://agentskills.io/specification), with each skill kept as a self-contained top-level directory.

The list of skills (name and description) lives in the generated [`SKILLS.md`](./SKILLS.md#skills-catalogue) catalogue.

Some skills are broadly portable. Others intentionally depend on a particular tool, repository, or local workflow. See [`PORTABILITY.md`](./PORTABILITY.md) before installing the full collection.

## Install

The repository toolchain pins Bun 1.4.0, Effect 4, and the Skills CLI through mise. Install dependencies and build the standalone maintenance executable:

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

## Consumer repositories

Repositories listed in [`consumers.yml`](./consumers.yml) keep project copies of the skills listed for them, so contributors get those skills without installing them. Skills committed here install from the published commit the sync runs from. External imports install from their origin at the reviewed `upstreamSha` in `skills.yml`, so a reviewed update reaches consumers on the next sync; unlicensed imports cannot be shared. Copies go to `.agents/skills/` only. Installing needs `HEAD` pushed and the shared skills unchanged in the checkout. `consumers add` shares skills with a repository and `consumers remove` stops sharing them. Each commits and pushes `consumers.yml`, then syncs that repository straight away, so the skills checkout must have no other unpushed commits. Both use the current directory's GitHub repository unless `--repo` is given. `add` only accepts new repositories that are public, owned by the source's owner, and not archived. Removing a repository's last skill, or `remove --all`, deletes its copies first, then drops its entry.

```bash
./dist/skill-maintenance consumers add [--repo <owner/repo>] <skill>...
./dist/skill-maintenance consumers remove [--repo <owner/repo>] [--all] [<skill>...]
./dist/skill-maintenance consumers --dry-run
./dist/skill-maintenance consumers
```

Each repository is cloned into a temporary directory. Newly listed skills are added, unedited copies are updated or removed to match the list, and the result is pushed to the default branch as one commit. A copy edited in the consumer no longer matches its `skills-lock.json` hash, so it is reported and left alone.

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

Unchanged upstream skills are `external` imports: `skills.yml` records their origin and pinned SHA, but their content is not committed here. Install them with:

```bash
./dist/skill-maintenance install --target ~/.agents/skills
```

The installer copies each external skill at its pinned SHA, records what it owns in `.external-skills.json` in the target, skips names already used by a linked local skill, and removes skills that are no longer external imports.

## Validate

```bash
mise run validate
mise exec npm:skills -- skills add . --list
```

`mise run validate` runs every check in parallel and builds the CLI once.

The local validator checks the portable metadata contract, directory names, relative links, `skills.yml` against its schema and canonical form, `skills.sh.json` / `PORTABILITY.md` coverage, and drift of the generated [`SKILLS.md`](./SKILLS.md#skills-catalogue) catalogue. TypeScript checks use Effect-aware Oxlint rules from `@timmo001/oxlint-rules/configs/recommended-effect`. CI also verifies the independent installer discovery result.

[Upkeep](https://github.com/timmo001/upkeep) checks the imports every hour with its `skill-updates` job. An import from a repository that some skill lists under `tools` follows that repository's latest release tag instead of its branch, so it moves when the tool is released, and never back to a commit its pin already includes. Imports with no local edits, and changes that only move pins, are applied with `updates --update`, validated and pushed straight to `main`. Work that needs an agent, such as merging upstream changes into an adapted import or reviewing a skill against a new tool release, is held on Upkeep's Skills page for approval, which also takes requests for changes to any skill.

Effect generates Bash, Fish, and Zsh completions directly from the command specification:

```bash
./dist/skill-maintenance --completions bash
./dist/skill-maintenance --completions fish
./dist/skill-maintenance --completions zsh
```

Renovate manages the pinned mise tools and GitHub Actions. Upkeep manages reviewed upstream skill revisions separately.

## Maintenance

- Add new skills under `<name>/` at the repository root.
- Classify each new skill in `skills.sh.json` and `PORTABILITY.md`, then regenerate the human catalogue with `mise run catalogue` (or `./dist/skill-maintenance catalogue`) and commit `SKILLS.md`.
- Commit imported skills only when this repository contains substantive local edits. Mark unchanged imports `external`; only their origin and pinned SHA are committed.
- Maintain import provenance, reviewed SHA, licence, local edits, and distribution mode in `skills.yml`, the single maintenance record. [`skills.schema.json`](./skills.schema.json) specifies it; regenerate the schema with `mise run schema` after changing the CLI's schema. Skills themselves carry no provenance comments.
- List the tools a skill depends on under its `tools` entry in `skills.yml`. `./dist/skill-maintenance skill-reviews` reports skills whose tools have a release newer than the reviewed tag, and Upkeep's Skills page shows the same.
- Use `./dist/skill-maintenance import <name>` to generate a complete upstream comparison. For an external import it compares the pinned and latest upstream revisions, and `--apply` moves the pin. Adapted changes remain manual. The importer rejects an adapted skill that exactly matches every file in its source; mark it external instead.
- Keep `skills.sh.json`, `PORTABILITY.md`, and `SKILLS.md` in sync.
- Prefer repository revisions for installed copies. Upkeep pushes unchanged upstream updates and holds adapted imports for review.
- Do not duplicate canonical skills into checked-in agent-specific directories.

The current portability backlog is intentionally documented rather than mechanically rewriting all existing skills in one migration.

# Skills

Reusable agent skills used across my development workflows. The repository follows the [Agent Skills specification](https://agentskills.io/specification), with each skill kept as a self-contained top-level directory.

Some skills are broadly portable. Others intentionally depend on a particular tool, repository, or local workflow. See [`PORTABILITY.md`](./PORTABILITY.md) before installing the full collection.

## Install

The repository toolchain pins the Skills CLI through mise. Install it before
running maintenance commands:

```bash
mise install
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
python scripts/validate.py
mise exec npm:skills -- skills add . --list
```

The local validator checks the portable metadata contract, directory names, relative links, and catalog coverage. CI also verifies the expected installer-discovery count.

Imports are checked daily against the latest commit touching their upstream path. Adapted imports are reported for manual review; unchanged upstream snapshots receive automated update pull requests.

The shared update entrypoint runs in either environment:

```bash
dot skill-updates-agent github --skills-dir /path/to/skills
dot skill-updates-agent device --config /path/to/skill-updates-agent.yml
dot skill-updates-agent device --config /path/to/skill-updates-agent.yml --run-id 123456
```

GitHub Actions builds `dot` from the public dotfiles checkout and uses its `github` mode for import checks, clean update pull requests, validation dispatches, and dashboard refreshes. A local device uses `device` mode to optionally wait for one workflow run and then invoke its configured OpenCode processor. Repeated device calls are safe because the processor records the last completed workflow run.

Renovate manages the pinned mise tools and GitHub Actions. The scheduled import
checker manages reviewed upstream skill revisions separately.

## Maintenance

- Add new skills under `<name>/` at the repository root.
- Distribute imported skills only when this repository contains substantive local edits. An explicit `wholesale` import is the exception and must remain byte-for-byte upstream. Keep other unchanged snapshots under `upstream/` and install them from their owning repository.
- Maintain import provenance, reviewed SHA, licence, local edits, and distribution mode in `imports.json`.
- Use `python scripts/import_skill.py <name>` to generate an upstream comparison. The scheduled checker applies unchanged imports with `--apply`; adapted changes remain manual. The importer rejects an adapted skill that exactly matches every file in its source and prints the standard reimport command instead.
- Keep `skills.sh.json` and `PORTABILITY.md` in sync.
- Prefer repository revisions for installed copies. The scheduled checker reports adapted imports for manual review and opens pull requests for unchanged upstream updates.
- Do not duplicate canonical skills into checked-in agent-specific directories.

The current portability backlog is intentionally documented rather than mechanically rewriting all existing skills in one migration.

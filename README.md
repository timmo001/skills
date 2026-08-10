# Skills

Reusable agent skills used across my development workflows. The repository follows the [Agent Skills specification](https://agentskills.io/specification), with each skill kept as a self-contained top-level directory.

Some skills are broadly portable. Others intentionally depend on a particular tool, repository, or local workflow. See [`PORTABILITY.md`](./PORTABILITY.md) before installing the full collection.

## Install

List the available skills:

```bash
npx skills@latest add timmo001/skills --list
```

Install selected skills for any supported agent:

```bash
npx skills@latest add timmo001/skills
```

Install or update non-interactively:

```bash
npx skills@latest add timmo001/skills --skill code-review --skill diagnose -g -y
npx skills@latest update -g -y
```

The [`skills`](https://github.com/vercel-labs/skills) CLI handles agent-specific locations for OpenCode, Claude Code, Codex, Cursor, and other Agent Skills clients. Local development should use `npx skills@latest add . --list`; generated agent mirrors are ignored and must not be kept inside this checkout.

Claude Code is supported through the same cross-agent installer. A native Claude marketplace bundle is deferred until imported-skill licence provenance is complete; marketplace metadata must not become a second source of skill content.

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

## Validate

```bash
python scripts/validate.py
npx skills@latest add . --list
```

The local validator checks the portable metadata contract, directory names, relative links, and catalog coverage. CI also verifies the expected installer-discovery count.

## Maintenance

- Add new skills under `<name>/` at the repository root.
- Record imported source provenance in `SKILL.md` comments without replacing upstream licence notices.
- Keep `skills.sh.json` and `PORTABILITY.md` in sync.
- Prefer `npx skills update` for installed copies. Scheduled upstream-import automation is deferred until this repository has its own updater that does not depend on dotfiles or `dot`.
- Do not duplicate canonical skills into checked-in agent-specific directories.

The current portability backlog is intentionally documented rather than mechanically rewriting all existing skills in one migration.

# Repository Guidance

## Scope

- `<name>/` at the repository root holds authored skills and distributed imported snapshots. Authored skills are edited here; imported skills are edited in their owning repositories. This preserves direct stow consumers that use the repository root as `~/.agents/skills`.
- dotfiles has no submodule pin. `dot update` fetches `main` into its own checkout and links it into `~/.agents/skills`, so a push to `main` reaches every machine on its next `dot update`. Only push skills that are ready to use.
- Preserve imported history, provenance comments, and upstream licence material.
- Do not create checked-in copies under `.agents/`, `.claude/`, `.cursor/`, or `.opencode/`.
- Keep agent-specific packaging as metadata around the canonical skills, not forks of their content.

## Tool-Owned Skills

- `timmo001/context` owns `.agents/skills/context-cli/` and `.agents/skills/context-mcp/`; `timmo001/notes` owns `.agents/skills/notes-cli/` and `.agents/skills/notes-mcp/`.
- Import only `context-cli` and `notes-cli` here, as `external` imports with no local content edits. Do not import either MCP skill. `git-context` and `handoff` own the surrounding Git and handoff workflows and route CLI operations to those imports.
- `imports.json` records each origin and reviewed source commit; the imported `SKILL.md` carries the generated provenance comments.
- Update order: source repository commit and push -> `./dist/skill-maintenance import <name> --apply` here -> catalogue regeneration and validation -> skills commit and push. Machines pick up the new `main` on their next `dot update`.
- New imports need a published source revision containing the skill. Do not invent a revision or point at a commit that predates the skill. Commit and push steps require explicit user authorisation.

## Skill Changes

- Keep `name` equal to the containing directory name.
- Write `description` for reliable selection: say what the skill does and when to use it.
- Use only Agent Skills frontmatter fields unless a vendor-specific extension is deliberately documented.
- Keep supporting files within the skill and link to them relatively from `SKILL.md`.
- Update `PORTABILITY.md` and `skills.sh.json` when a skill is added, removed, or changes runtime, tool, repository, or machine assumptions.
- Regenerate `SKILLS.md` with `mise run catalogue` (or `./dist/skill-maintenance catalogue`) after skill or grouping changes; validate fails on drift.
- Commit imported skills only when they contain documented local edits. Mark unchanged imports `external` in `imports.json`; never commit their content. `skill-maintenance install` installs them at the pinned SHA, and `dot update` runs it.
- Keep adapted imports as top-level reviewed snapshots. `imports.json` owns origin, reviewed SHA, licence, local-edit metadata, and distribution mode. Materialise its provenance overlay in every committed imported skill; the installer adds it to external copies.
- Build `dist/skill-maintenance`, then materialise metadata with `./dist/skill-maintenance import <name> --metadata-only`; compare upstream changes with the same command.
- Do not add client-specific marketplace packaging or duplicate canonical skill content.

## Verification

Run before committing repository setup or skill metadata changes:

```bash
bun install --frozen-lockfile
bun run validate
mise exec npm:skills -- skills add . --list
```

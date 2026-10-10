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
- Regenerate `SKILLS.md` and `.claude-plugin/marketplace.json` with `mise run catalogue` (or `./dist/skill-maintenance catalogue`) after skill, grouping or import changes; validate fails on drift.
- Commit imported skills only when they contain documented local edits. Mark unchanged imports `external` in `imports.json`; never commit their content. `skill-maintenance install` installs them at the pinned SHA, and `dot update` runs it.
- Keep adapted imports as top-level reviewed snapshots. `imports.json` owns origin, reviewed SHA, licence, local-edit metadata, and distribution mode. Materialise its provenance overlay in every committed imported skill; the installer adds it to external copies.
- Build `dist/skill-maintenance`, then materialise metadata with `./dist/skill-maintenance import <name> --metadata-only`; compare upstream changes with the same command.
- Never duplicate canonical skill content for a client. The generated Claude plugin marketplace points at the top-level skills and pins each external import to its reviewed SHA.
- `consumers.yml` lists the repositories that receive project copies of skills from here. Only committed skills and licensed external imports that keep their upstream name can be listed. `skill-maintenance consumers add` adds skills to an entry, creating it if needed, and `consumers remove` takes them out; both push `consumers.yml` to skills `main` and sync that repository straight away, so they need explicit authorisation to push. `skill-maintenance consumers` pushes to those repositories, so run it with `--dry-run` unless the user asked for the push.

## Verification

Run before committing repository setup or skill metadata changes:

```bash
bun install --frozen-lockfile
mise run validate
mise exec npm:skills -- skills add . --list
```

`mise run validate` runs the checks in parallel. For a narrow change, run only the tasks it touches, for example `mise run validate:skills` after editing a skill.

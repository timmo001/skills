# Repository Guidance

## Scope

- `<name>/` at the repository root is the canonical source for every tracked skill. This preserves direct stow consumers that use the repository root as `~/.agents/skills`.
- After any commit or reviewed upstream update in this repository, update and commit the `agents/.agents/skills` submodule pointer in `~/.config/dotfiles`. Do not leave the repositories out of sync.
- Preserve imported history, provenance comments, and upstream licence material.
- Do not create checked-in copies under `.agents/`, `.claude/`, `.cursor/`, or `.opencode/`.
- Keep agent-specific packaging as metadata around the canonical skills, not forks of their content.

## Skill Changes

- Keep `name` equal to the containing directory name.
- Write `description` for reliable selection: say what the skill does and when to use it.
- Use only Agent Skills frontmatter fields unless a vendor-specific extension is deliberately documented.
- Keep supporting files within the skill and link to them relatively from `SKILL.md`.
- Update `PORTABILITY.md` when a skill gains or loses runtime, tool, repository, or machine assumptions.
- Distribute imported skills only when they contain documented local edits, except for an explicit `wholesale` import requested by the user. Wholesale imports must remain byte-for-byte upstream.
- Keep unchanged review snapshots under `upstream/<name>/UPSTREAM_SKILL.md`; they remain committed but must not be discoverable by the Skills CLI.
- Keep adapted imports as top-level reviewed snapshots. `imports.json` owns origin, reviewed SHA, licence, local-edit metadata, and distribution mode. Materialise its provenance overlay in every distributed imported skill, including wholesale imports.
- Materialise metadata with `scripts/import_skill.py --metadata-only`; fetch upstream review snapshots with the same script.
- Do not add client-specific marketplace packaging or duplicate canonical skill content.

## Verification

Run before committing repository setup or skill metadata changes:

```bash
python scripts/validate.py
mise exec npm:skills -- skills add . --list
```

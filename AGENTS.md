# Repository Guidance

## Scope

- `<name>/` at the repository root is the canonical source for every tracked skill. This preserves direct stow consumers that use the repository root as `~/.agents/skills`.
- Preserve imported history, provenance comments, and upstream licence material.
- Do not create checked-in copies under `.agents/`, `.claude/`, `.cursor/`, or `.opencode/`.
- Keep agent-specific packaging as metadata around the canonical skills, not forks of their content.

## Skill Changes

- Keep `name` equal to the containing directory name.
- Write `description` for reliable selection: say what the skill does and when to use it.
- Use only Agent Skills frontmatter fields unless a vendor-specific extension is deliberately documented.
- Keep supporting files within the skill and link to them relatively from `SKILL.md`.
- Update `PORTABILITY.md` when a skill gains or loses runtime, tool, repository, or machine assumptions.
- Do not add native marketplace packaging until imported-skill licence provenance has been audited.

## Verification

Run before committing repository setup or skill metadata changes:

```bash
python scripts/validate.py
npx skills@latest add . --list
```

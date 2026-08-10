---
name: check-skill-updates
description: Check imported skills for upstream changes and review safe updates. Use when a tracked `# origin:` may have changed or when refreshing installed skills from their source repositories.
---

# Check Skill Updates

Handle two different update paths without confusing installed copies with this repository's maintained imports.

## Installed Skills

Use the standard installer to update skills previously installed from public repositories:

```bash
npx skills@latest update
npx skills@latest update <skill-name>
```

Use `-g` or `-p` to select global or project scope and `-y` only when a non-interactive update was requested. This updates consumer copies; it does not modify imported source in this repository.

## Repository Imports

Imported skills record their source with comments in `SKILL.md` frontmatter:

```yaml
# origin: https://github.com/org/repo/tree/main/skills/skill-name
# upstream-sha: abc123...
# local-edits:
#   - SKILL.md: tool-specific workflow adapted to portable capabilities
```

For each tracked import:

1. Resolve the origin and the current upstream commit that last changed the complete skill directory.
2. Fetch `SKILL.md` and every upstream supporting file. Search snippets are not complete source files.
3. Compare the reviewed upstream revision with the local directory, accounting for documented `# local-edits:`.
4. Report whether the import is unchanged, has a clean update, needs a manual merge, or cannot be checked.
5. Apply an update only when the user requested it. Preserve provenance, local adaptations, licence material, and files intentionally owned by this repository.
6. Update `# upstream-sha:` after the comparison is complete, including when upstream changed but all differences were deliberately rejected.
7. Run `python scripts/validate.py` and `npx skills@latest add . --list`.

Use the `import-external-skill` adaptation workflow when upstream and local changes overlap.

## Safety

- Never replace a locally adapted skill wholesale.
- Never infer that an absent upstream file should be deleted when `# local-edits:` identifies local-only material.
- Treat imported scripts as executable code: review changes before running them.
- Do not commit or push without explicit user authorisation.

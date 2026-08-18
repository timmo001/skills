---
name: check-skill-updates
description: Check imported skills for upstream changes and review safe updates. Use when a tracked `# origin:` may have changed or when refreshing installed skills from their source repositories.
---

# Check Skill Updates

Handle two different update paths without confusing installed copies with this repository's maintained imports.

## Installed Skills

Use the standard installer to update skills previously installed from public repositories:

```bash
mise exec npm:skills -- skills update
mise exec npm:skills -- skills update <skill-name>
```

Use `-g` or `-p` to select global or project scope and `-y` only when a non-interactive update was requested. This updates consumer copies; it does not modify imported source in this repository.

## Repository Imports

Imported skills are indexed in `imports.json`; the importer materialises the same metadata into `SKILL.md` frontmatter:

```yaml
# origin: https://github.com/org/repo/tree/main/skills/skill-name
# upstream-sha: abc123...
# local-edits:
#   - SKILL.md: tool-specific workflow adapted to portable capabilities
```

For each tracked import:

1. Run `python scripts/check_upstream.py` to compare each overlay entry with the current upstream path commit.
2. Run `python scripts/import_skill.py <name>` to let the Vercel Skills CLI materialise the complete candidate snapshot in temporary review space.
3. Compare the candidate with the committed directory, accounting for `imports.json.localEdits`.
4. Report whether the import is unchanged, can receive an automated update pull request, needs manual review, or cannot be checked.
5. Apply an update only when the user requested it. Preserve provenance, local adaptations, licence material, and files intentionally owned by this repository.
6. Update `imports.json.upstreamSha` after the comparison is complete, including when upstream changed but all differences were deliberately rejected, then run `--metadata-only`.
7. Run `python scripts/validate.py` and `mise exec npm:skills -- skills add . --list`.
8. Run `dot skill-check --skill <name>` for each reviewed adapted import.

Use the `import-external-skill` adaptation workflow when upstream and local changes overlap.

## Safety

- Never replace a locally adapted skill wholesale.
- Never distribute an unchanged upstream skill unless its import metadata explicitly marks a user-requested byte-for-byte `wholesale` import. Keep other review snapshots non-discoverable under `upstream/` and install them from their owning repository.
- Never infer that an absent upstream file should be deleted when `# local-edits:` identifies local-only material.
- Treat imported scripts as executable code: review changes before running them.
- Do not commit or push without explicit user authorisation.

---
name: check-skill-updates
license: Apache-2.0
compatibility: Requires mise, the Skills CLI, and network access. Repository import and skill reviews also require this repository's skills.yml and built skill-maintenance CLI, Git, and authenticated GitHub CLI.
description: Check imported skills for upstream changes and review safe updates. Use when an import's origin in skills.yml may have changed, when a tool a skill depends on has a new release, or when refreshing installed skills from their source repositories.
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

Each imported skill has one entry in `skills.yml`, specified by `skills.schema.json`. Skills carry no provenance comments:

```yaml
skills:
  skill-name:
    import:
      upstreamSha: 0123456789abcdef0123456789abcdef01234567
      origin: "https://github.com/org/repo/tree/main/skills/skill-name"
      license: "MIT"
      localEdits:
        - "tool-specific workflow adapted to portable capabilities"
```

For each tracked import:

1. Run `./dist/skill-maintenance updates --json` to compare each overlay entry with the current upstream path commit.
2. Run `./dist/skill-maintenance import <name>` to let the Skills CLI materialise the complete candidate snapshot in temporary review space.
3. Compare the candidate with the committed directory, accounting for the entry's `localEdits`.
4. Report whether the import is unchanged, can receive an automated update pull request, needs manual review, or cannot be checked.
5. Apply an update only when the user requested it. Preserve provenance, local adaptations, licence material, and files intentionally owned by this repository.
6. Update the entry's `upstreamSha` after the comparison is complete, including when upstream changed but all differences were deliberately rejected, then run `--metadata-only`.
7. Run `./dist/skill-maintenance validate` and `mise exec npm:skills -- skills add . --list`.
8. Run `./dist/skill-maintenance check --skill <name> --diff-origin` for each reviewed adapted import.

Use the `import-external-skill` adaptation workflow when upstream and local changes overlap.

## Skill Reviews

A skill that depends on a tool lists it under `tools` in its `skills.yml` entry, with the release tag it was last reviewed against:

```yaml
skills:
  change-review-handoff:
    tools:
      - repo: backnotprop/plannotator
        reviewed: "v0.28.14"
```

The scheduled device agent handles these on its own: it reviews each behind skill, then opens `[Tag-only] Update <skill>` with auto-merge when only the tag moves, or `Update skill: <skill>` when the skill changes. Use the steps below to run a review by hand.

1. Run `./dist/skill-maintenance skill-reviews --json`. The dashboard issue shows the same list under "Skill reviews".
2. For each `release-available` item, read the release notes from the reviewed tag up to the latest (`gh release view <tag> --repo <repo>` for each tag in between) and compare them with the skill.
3. Propose the edits the new releases call for, or say that none are needed, and ask before making them.
4. Once the user agrees, make the edits and run `./dist/skill-maintenance skill-reviews --reviewed <skill>`, which records the latest tags it just read. Commit the tag move with the edits.

Add a `tools` entry when a skill starts depending on a tool's behaviour, and run `skill-reviews --format` after editing `skills.yml` by hand. External imports cannot list tools: their content comes from upstream. Listing a repository under `tools` also makes imports from that repository follow its latest release tag instead of its branch.

## Safety

- Never replace a locally adapted skill wholesale.
- Never commit an unchanged upstream skill. Mark it `external` in `skills.yml`; updating it only moves the pinned SHA.
- Never infer that an absent upstream file should be deleted when the entry's `localEdits` identifies local-only material.
- Treat imported scripts as executable code: review changes before running them.
- Do not commit or push without explicit user authorisation.

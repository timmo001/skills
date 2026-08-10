---
name: import-external-skill
description: Import skills from external repositories into this Agent Skills repository. Use when pulling in a public skill, reviewing an external skill set, or adapting upstream content into an existing skill.
---

# Import External Skill

Import skills from external repositories into top-level `<name>/` directories, preserving source provenance and keeping the result valid across Agent Skills clients.

## When to Use

- Pulling in a specific skill from a public repo URL
- Reviewing an external skill repository for useful additions
- Adapting external skill content to improve existing local skills

## Agent-Specific Repos

External skill repos are often written for a specific agent framework (e.g. Claude Code, Codex, Cursor). This repository distributes an import only when it needs substantive local adaptation:

- Keep only Agent Skills frontmatter fields. `allowed-tools` is portable; remove framework-specific fields such as `disable-model-invocation` and `argument-hint`.
- Replace framework-specific tool names, hook mechanisms, or subagent patterns with capability-based instructions when that preserves the workflow.
- Keep an intentional environment dependency when abstraction would make the instructions less truthful, then classify it in `PORTABILITY.md`.
- If the skill is useful as-is, retain any review snapshot under `upstream/<name>/UPSTREAM_SKILL.md` and install it from its owning repository. Never expose that snapshot through the local Skills CLI catalogue.

## Adaptation

Use when the external skill overlaps with or extends an existing local skill.

1. Add or update the `imports.json` entry with the origin, reviewed SHA, licence, and non-empty `localEdits` declarations.
2. Run `python scripts/import_skill.py <name>` to generate the complete upstream comparison without replacing the tracked skill.
3. Compare against the existing local skill, identifying gaps and conflicts.
4. Present the comparison: what the external skill adds, what overlaps, and what conflicts with existing rules.
5. Wait for the user to decide which additions to make.
6. Apply the agreed changes to the existing local skill, update `imports.json.upstreamSha`, then run `python scripts/import_skill.py <name> --metadata-only`.

## Frontmatter Format

```yaml
---
name: skill-name
description: One or two sentences. First sentence says what. Second says when to use.
# origin: https://github.com/org/repo/tree/main/skills/skill-name
# upstream-sha: abc123...
---
```

Portable frontmatter fields are `name`, `description`, `license`, `compatibility`, `metadata`, and `allowed-tools`. Do not rely on one client's tolerance for unknown fields.

`imports.json` is the maintenance source for origin, reviewed SHA, licence, and local edits. The script materialises those fields into `SKILL.md` so each standalone skill remains self-describing.

If the import adapts body content beyond frontmatter, add a `# local-edits:` block documenting the differences from upstream. This prevents a later review from treating intentional adaptations as drift. List what differs, not a changelog:

```yaml
# origin: https://github.com/org/repo/tree/main/skills/skill-name
# upstream-sha: abc123...
# local-edits:
#   - SKILL.md: condensed body, rewritten description
#   - SOME-FILE.md: framework-specific pattern replaced with local equivalent
```

## Commit Format

```text
Skill title

Origin:
https://github.com/org/repo/tree/main/skills/skill-name
```

## User Context

Before ranking external skills, understand what the user actually works on. Check their GitHub profile for recently pushed repos (`gh api users/{user}/repos --paginate --jq ...`) to build a picture of:

- **Languages and frameworks** used across active repos
- **Ownership roles** -- sole owner vs. contributor/maintainer on a shared project
- **Project types** -- libraries, applications, tooling, config repos

Skills that assume full control of a project's issue tracker, labelling, or team process are only relevant for repos where the user has full ownership, not for shared projects where they are one maintainer among many.

If recent activity does not clearly indicate the user's primary work, languages, or ownership roles, ask before ranking.

## Review Mode

When given a repo URL without a specific skill path, review the full skill set:

1. List all available skills in the repo.
2. Filter out domain-specific skills irrelevant to the user context above.
3. Compare remaining skills against the existing local skill library for overlaps.
4. Present a recommendation table: pull in, adapt into existing, or skip -- with reasoning.
5. Wait for the user to choose before importing or adapting anything.

## Safety

- Do not modify existing skills during a direct import.
- Do not import without diffing against the upstream original.
- Do not commit without explicit user request.
- Ensure imported scripts are executable (`chmod +x`) after writing them to disk.

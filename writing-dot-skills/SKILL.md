---
name: writing-dot-skills
license: Apache-2.0
description: Craft for authoring Agent Skills that select reliably and stay lean. Use when creating or revising a skill's description, workflow, references, scripts, or structure.
---

# Writing Agent Skills

Lineage: adapted from Matt Pocock's `writing-great-skills` and Trail of Bits'
`designing-workflow-skills`.

## Write

- Make the description say what the skill does and when it should load. Name
  distinct branches and concrete triggers; use explicit-only gating where needed.
- Keep `SKILL.md` self-contained and focused on decisions, ordering, and traps
  that change the agent's behaviour. Use exact commands for fragile operations;
  leave easily retrieved syntax to current tooling and `--help`.
- Reuse existing commands, validators, import tooling, and owning skills. Add a
  script only when a repeated deterministic operation lacks an existing tool.
- Link supporting files directly from `SKILL.md`, saying when to read them.
  Split only substantial branch-specific detail; avoid reference chains.
- Keep each rule in one place. Remove repeated checklists, obvious advice, and
  fixed process or output quotas that do not serve the task.

## Maintain

1. Find the source of truth and repository instructions. Edit authored skills
   there; change tool-owned imports in their owning repository. Preserve licences,
   source attribution, and the established source-to-import update order.
2. Use the repository's existing registration and import tools. Update callers
   when renaming or removing a skill, and update compatibility metadata when its
   runtime or tool assumptions change. Keep machine-specific values in private
   configuration and shared instructions portable.
3. Regenerate catalogues and other derived files through their owning tools.
   Follow the repository's packaging, pinning, and stow rules; do not write into
   installed copies or silently advance dependency pins.
4. Run the existing skill/metadata validator and discovery check. Verify names,
   frontmatter, referenced files, and generated output. Use client diagnostics
   when changing client registration. Commit and publish only when requested.

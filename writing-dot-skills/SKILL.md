---
name: writing-dot-skills
description: Craft for authoring Agent Skills that select reliably and stay lean. Use when creating or revising a skill's description, workflow, references, scripts, or structure.
---

# Writing Agent Skills

Craft guidance for writing and revising skills that follow the Agent Skills specification. It covers making a skill select at the right moment and stay easy to scan. Use the current client or repository documentation for installation, registration, and client-specific frontmatter extensions.

Lineage: adapted from mattpocock's `writing-great-skills` and trailofbits' designing-workflow-skills, reworked for this repo and trimmed to the parts `customize-opencode` does not cover.

## Goals

- The agent selects the skill correctly from its description alone.
- `SKILL.md` stays short and practical.
- Supporting files earn their place by cutting repeated complexity.

## Workflow

1. Clarify the job.
   - State the task, the triggers, the scope, and any hard constraints.
   - Reuse the name this repo already uses for the workflow instead of inventing one.
2. Write the description for selection.
   - The description is the only thing the agent reads when deciding whether to load the skill. Everything else is read only after it activates.
   - Cover what the skill does and when to use it, and front-load the literal words, filenames, or request shapes that should trigger it.
   - Make it distinct from neighbouring skills so auto-selection is reliable, and gate with "Use ONLY when..." if it should stay quiet on adjacent topics.
   - Keep portable frontmatter to the Agent Skills specification unless a documented client extension is deliberate.
3. Draft the body.
   - Start with the minimum workflow that does the task well. Prefer direct rules and checklists over theory. Keep examples concrete and local.
   - Match instruction freedom to how fragile the task is:
     - Low freedom (exact commands) for fragile or destructive operations.
     - Medium freedom (templates with parameters) for preferred patterns where variation is fine.
     - High freedom (heuristics) for exploratory work like review or analysis.
   - Number multi-step phases so execution order is reliable.
   - End each step with a checkable completion condition. Prefer exhaustive bounds such as "every changed consumer accounted for" over vague bounds such as "understanding reached".
4. Decide whether to split.
   - Keep `SKILL.md` self-contained by default.
   - Move detail into `references/` only when it is large, rarely needed, or a separate domain.
   - Keep every supporting file one hop from `SKILL.md`. No reference chains.
   - Put material every branch needs in the main file. Move branch-specific detail behind a context pointer that says both what it exposes and when that branch should load it.
5. Decide whether to add scripts.
   - Add a script only for a deterministic operation the agent should not re-derive each run: validation, a fixed multi-step command, helper logic.
   - Document when to run the script instead of generating code freehand.
6. Wire it in.
   - Keep the canonical skill in the repository's declared skill root; do not create client-specific copies unless packaging requires them.
   - If the skill changes a convention, update the owning repository guidance and generated catalogue from their documented sources.
   - Validate with the repository's skill validator and confirm the target client discovers it.

## Quality checks

Review against three severities:

- Critical (blocks loading or misfires): no `name` or `description`; invalid frontmatter; broken paths to supporting files.
- Major (weak in practice): a vague description that will not trigger; a `SKILL.md` long enough that it should have been split; missing scope guidance on when to use it and when not to.
- Minor (polish): formatting and optional wording. Change these only when they genuinely improve how the agent behaves.

General checks:

- The description is specific enough for correct auto-selection and distinct from nearby skills.
- The workflow is short enough to scan.
- Supporting files exist only where they cut noise in `SKILL.md`.
- The skill matches current local tooling, paths, and names.
- No stale upstream or tool-specific instructions remain after adapting.
- Scripts, config, directory layout, and `--help` output remain authoritative. Repeat them only when the lookup is expensive; document the convention, reason, or gotcha the environment cannot reveal instead.

## Anti-patterns

- The description summarises the workflow instead of naming the triggers.
- A monolithic `SKILL.md` that should have moved detail into references.
- Reference chains, where one supporting file points to another. Keep everything one hop from `SKILL.md`.
- Instructions that assume a tool without naming it.
- Unnumbered steps in a multi-step workflow, so the order is ambiguous.

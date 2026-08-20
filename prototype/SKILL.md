---
name: prototype
description: Build disposable code to answer one design question. Use when the user wants to test whether logic or a state model feels right, or compare materially different UI directions before production implementation.
license: MIT
# origin: https://github.com/mattpocock/skills/tree/main/skills/engineering/prototype
# upstream-sha: 321658273cb1d20b76026717d027d505790106d4
# local-edits:
#   - SKILL.md: condensed branches, made the question and lifecycle explicit, and removed automatic branch, issue, and commit actions
#   - LOGIC.md: condensed the shareable state-model workflow and kept tests as optional verification rather than a design driver
#   - UI.md: condensed variant guidance and added project-native responsive and accessibility constraints
---

# Prototype

A prototype is disposable code that answers one explicit question. The question determines the shape, fidelity, and stopping point.

## Choose the branch

- For business rules, state transitions, data shape, or API feel, read [LOGIC.md](LOGIC.md).
- For layout, hierarchy, interaction, or visual direction, read [UI.md](UI.md).

If the branch is genuinely ambiguous and quick repository context does not resolve it, ask one question before editing.

## Shared workflow

1. Write the question and the evidence that would answer it.
2. Locate the prototype near the target area and mark its route, filename, and visible UI clearly as a prototype.
3. Use the project's existing runtime, task runner, components, and styling. Add no new dependency unless the experiment itself requires it.
4. Keep state in memory and side effects stubbed unless persistence or integration is the question being tested.
5. Implement only enough realism for a trustworthy answer. Skip production abstractions, exhaustive error handling, and unrelated polish.
6. Make the relevant state, differences, and trade-offs visible while the prototype runs.
7. Run the prototype and report how to access it, what to try, and which observations would settle the question.
8. Once the user chooses, carry the validated decision into production code deliberately. Remove or retain the prototype only with the user's direction; do not create branches, issues, commits, or external records without explicit authorisation.

The prototype is complete when it can distinguish the plausible answers to its stated question. It is not complete merely because it runs.

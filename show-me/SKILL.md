---
name: show-me
description: Explain the current topic with a concise visual such as a tree, diagram, diff, or focused HTML artefact. Use ONLY when the user explicitly asks to see, visualise, diagram, sketch, or be shown the preceding explanation.
license: UNLICENSED
# origin: https://github.com/dmmulroy/.dotfiles/tree/main/home/.agents/skills/show-me
# upstream-sha: dcfccdffccea86ef2e3730e2980a33ca5df20b7b
# local-edits:
#   - SKILL.md: rewritten as a portable explicit-only visual explanation workflow; removed client-specific frontmatter and file-opening commands
---

# Show Me

Turn the current discussion into the smallest visual that makes its key relationship obvious. Preserve concrete names, paths, states, and decisions from the conversation; omit unrelated detail.

## Choose the view

Use one primary view. Add a second only when it answers a different necessary question.

- Pseudocode for decisions, algorithms, and state transitions.
- A call tree for runtime ownership and nested control flow.
- A component tree for UI composition, state, and module boundaries.
- A shallow file tree for responsibility or proposed layout.
- Mermaid for interactions, sequences, dependencies, or data flow.
- A `diff`-shaped sketch when the point is how an existing structure changes.
- A focused HTML artefact when spatial comparison, visual design, or density would be unclear in text or Mermaid.

Prefer a complete block when most of the target is new or omitted context would hide order or ownership. Prefer a diff when the reader already knows the surrounding structure.

## Build the visual

1. State the question the visual answers in one short line when it is not already obvious.
2. Include only the calls, files, props, states, transitions, or boundaries needed for that question.
3. Use the repository's real vocabulary and paths rather than generic placeholders.
4. Place a brief explanation next to the visual only where interpretation is not self-evident.
5. For HTML, create one clearly named temporary or repository-local artefact, make it responsive and accessible, and match an existing product's visual language when one exists. Report its path; open it only when the user requests that or the available client workflow explicitly supports it.

The result is complete when the visual can answer the user's question without requiring the previous prose to be reread.

## Avoid

- Decorating an explanation that was already clear.
- Showing every available representation.
- Inventing architecture or details not established by the conversation or code.
- Dense Mermaid diagrams when a five-line tree would communicate more clearly.
- Leaving a generated HTML artefact in a production path without clearly marking its purpose.

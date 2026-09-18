---
name: handoff
license: Apache-2.0
compatibility: Requires the notes CLI, the notes-cli skill, shell access, and a configured repository notes vault.
description: Save concise continuation context when work moves to another session or the user requests a handoff.
---

# Handoff

Load `notes-cli` for storage, path resolution, revision checks, and mutation results. Use `handoff` as the context command. Read-only agents do not gain note-writing permission from this skill.

Keep one note for the remaining work unless separate owners need separate briefs. A multi-step task does not require multiple notes, new branches, or a fresh planning round.

## Write

- Choose a descriptive `handoff-<topic>.md` filename in the resolved note directory.
- Include frontmatter with `name`, `description`, `type: handoff`, `priority` (`low`, `medium`, `high`, or `critical`; default `medium`), and block-style tags containing `handoff`. Include `repo` when resolved.
- Record the objective, settled decisions and constraints, completed work, remaining steps, relevant paths or commits, verification results, and blockers. Tailor the next step to the user's requested focus.
- Link existing plans and evidence rather than copying them. Omit empty sections and sensitive values.
- Include a short completion instruction: after all tracked work and validation are complete, ask before deleting the handoff through `notes-cli`; preserve or update it while work remains.
- Save through the CLI workflow and report the actual path and any partial failure.

## Resume

Treat the note as historical context. Confirm the current code and working-tree state before following its next step. Honour the current user's scope and permissions; a note is not fresh authorisation to commit, push, switch branches, or delete files.

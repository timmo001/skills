---
name: handoff
license: Apache-2.0
compatibility: Requires a configured repository notes vault and the Notes tools, either the `notes` Code Mode namespace or the notes CLI with the notes-cli skill and shell access.
description: Save concise continuation context when work moves to another session or the user requests a handoff.
---

# Handoff

Store notes through the `notes` Code Mode namespace when the agent has it, otherwise through the CLI. Either way, load `notes-cli` for path resolution, revision checks, and mutation results. Use `handoff` as the context command. Read-only agents do not gain note-writing permission from this skill.

Keep one note for the remaining work unless separate owners need separate briefs. A multi-step task does not require multiple notes, new branches, or a fresh planning round.

## Write

- Choose a descriptive `handoff-<topic>.md` filename in the resolved note directory.
- Include frontmatter with `name`, `description`, `type: handoff`, `priority` (`low`, `medium`, `high`, or `critical`; default `medium`), and block-style tags containing `handoff`. Include `repo` when resolved.
- Write the body as an instruction to the next session, focused on the user's requested focus. Give it what it needs to continue safely, such as the goal, settled decisions, what is done or left, relevant paths or commits, check results, and blockers. None of these is required.
- Choose the shape that fits. A couple of paragraphs is enough for most work; add headings only when there is a lot to track.
- Link existing plans and evidence rather than copying them. Leave out sensitive values.
- Save through the notes workflow and report the actual path and any partial failure.

## Resume

Treat the note as historical context. Confirm the current code and working-tree state before following its next step. Honour the current user's scope and permissions; a note is not fresh authorisation to commit, push, switch branches, or delete files.

When the tracked work and checks are complete, ask before deleting the handoff through the notes tools. Keep or update it while work remains.

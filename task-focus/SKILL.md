---
name: task-focus
description: Keep the original task on track when the user raises a side thought, side question, tentative branch idea, or explicit change of task. Use before diverting work, switching branches, or choosing between a BTW session, a fresh session, and the current conversation, especially with a large context window.
---

# Task Focus

Stay on the original task unless the user explicitly redirects it. Corrections
and refinements steer that task; side thoughts and questions do not replace it
or expand its implementation scope.

## 1. Establish Intent

- Treat tentative wording such as "I'm thinking a new branch on dev" as
  discussion, not permission to start work. A named branch or base alone is not
  authorisation.
- Ask whether to discuss, defer, or start separately. Use the question tool when
  available. Wait before editing, creating a branch/worktree/workspace, launching
  a session, or switching the current checkout for the side thought.
- Keep the active task and checkout in place. Ask before switching that checkout
  unless the user explicitly requested the switch; a clean tree or completed
  task does not imply permission.

Proceed only when the intended scope is clear. Do not ask the user to repeat an
already agreed choice.

## 2. Choose The Session

- Route side thoughts and questions into a BTW ("by the way") session when
  supported, or a clean session with an explicit context brief. Keep the main
  session on its active task.
- Even after an explicit redirect, ask whether to continue here or start fresh
  unless the user already chose. Continuing here can be reasonable with a small
  context window and little unrelated history.
- At around 200k tokens of accumulated context or more, strongly recommend a
  fresh session with a concise handoff before taking on a different task. Use
  available context usage, never an invented count. If usage is unknown but the
  conversation is long or heavily compacted, recommend starting fresh.
- For separate implementation, prefer a dedicated Herdr workspace with a
  Herdr-managed worktree and a fresh agent session. Include that arrangement in
  the question so agreement authorises it. Apply `herdr` for creation and launch,
  following local runtime guidance and preserving the current workspace and focus.
- If Herdr is unavailable, ask how to proceed rather than switching the current
  checkout or silently substituting a raw Git worktree.

Agree the session choice before launching. Respect an explicit choice to stay.

## 3. Hand Over Bounded Context

Give the chosen session only the context needed for its assignment:

- The question or goal, and whether it is discussion, research, or implementation.
- Relevant findings and primary sources, distinguishing evidence from assumptions.
- Repository, branch/base, constraints, and any explicit permissions.
- The original task's status and where to return, if it has been paused.

A fresh session does not inherit the conversation or permission to edit. When
the idea depends on unverified behaviour, establish primary-source evidence
before implementation; a quick glance or a research-only request does not
authorise edits. Finish the handoff with a clear scope and expected result.

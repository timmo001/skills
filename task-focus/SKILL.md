---
name: task-focus
license: Apache-2.0
compatibility: Separate-session workflows need a client that can start fresh agent sessions. The preferred separate-implementation path uses Herdr workspaces/worktrees and the herdr skill.
description: Keep the original task on track when the user raises a side thought, side question, tentative branch idea, or explicit change of task. Use before diverting work, switching branches, or choosing between a BTW session, a fresh session, and the current conversation, especially with a large context window.
---

# Task Focus

Stay on the original task unless the user explicitly redirects it. Corrections
and refinements steer that task; side thoughts and questions do not replace it
or expand its implementation scope.

## 1. Side Thoughts And Questions

- Answer a side question directly and briefly, then carry on with the active
  task. Do not ask how to handle it.
- Treat tentative wording such as "I'm thinking a new branch on dev" as
  discussion, not permission to start work. A named branch or base alone is not
  authorisation. Discuss it, and wait for a clear request before editing,
  creating a branch/worktree/workspace, launching a session, or switching the
  current checkout for it.
- Keep the active task and checkout in place unless the user explicitly asks to
  switch; a clean tree or completed task does not imply permission.

## 2. Choose The Session

- Follow an explicit redirect in the current session unless the user chose
  otherwise. At around 200k tokens of accumulated context or more, recommend a
  fresh session with a concise handoff in a sentence, without blocking on it.
  Read context usage with `dot-session-status`, never an invented count.
- When the user wants separate work, prefer a BTW ("by the way") session for
  side questions, or a dedicated Herdr workspace with a Herdr-managed worktree
  and a fresh agent session for separate implementation. Apply `herdr` for
  creation and launch, preserving the current workspace and focus.
- If Herdr is unavailable, say so rather than switching the current checkout or
  silently substituting a raw Git worktree.

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

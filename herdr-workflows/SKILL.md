---
name: herdr-workflows
license: Apache-2.0
compatibility: Requires Herdr, its CLI environment, Git for worktree transfers, and the separately installed herdr skill.
description: Apply local safeguards for Herdr session recovery and transferring linked-worktree changes back to a host checkout. Use alongside the herdr skill when creating a linked worktree under Herdr, diagnosing Herdr socket routing, recovering the default session, or moving, consolidating, or continuing Herdr worktree changes from the main or host checkout. The herdr skill remains authoritative for all Herdr CLI, topology, targeting, lifecycle, and safety behaviour.
---

# Herdr Workflows

Load `herdr` for control and current CLI discovery. This companion covers recovery and preserving work when moving between checkouts; `session-coordination` owns assignments and collecting worker results.

## Recover Live Context

- Check the inherited `HERDR_SOCKET_PATH` before assuming the default server. Explicit session selection overrides that socket; use it only for the intended session. Recover an absent default server through `herdr session attach default`, not a manually launched `herdr server` process.
- Use targeted agent/pane get and list calls to recover known work. Use `herdr api snapshot` when topology across the session is genuinely needed. Live state establishes what exists, not who authorised or owns it.
- Get optional native session references from Herdr's `agent_session` fields and use the owning runtime's supported history/resume tools. When an agent has reported a resume command, Herdr reopens its exact session after a server restart. Check whether it has already restored before resuming manually.
- Herdr clears a self-reported agent once its pane returns to an idle shell. A missing reference is not evidence of lost work; read the agent output and current Git state.
- Pass a short continuation brief directly to the host agent. Use a durable handoff only when the work must survive beyond available session history.

## Create A Linked Worktree

Under Herdr, create worktrees with `herdr worktree create` (a new branch) or `herdr worktree open` (an existing branch), not raw `git worktree add`, so the checkout gets its own Herdr workspace the user can see and switch to. Pass `--no-focus` unless the user asked to switch, and `--path` when the directory name matters, such as a name a dev server derives a URL from. Read the new workspace and path from the JSON response, then continue in that path. Creating a worktree still needs the user's agreement.

## Transfer A Linked Worktree

Herdr's `worktree.remove` removes the checkout and retains its branch. It does not merge or copy work. Closing a workspace and removing a checkout are different operations; consult the installed `herdr worktree` commands.

1. Identify source and host through Herdr and Git worktree metadata. The host is the primary non-linked checkout, whatever its branch is. Inspect staged, unstaged, and untracked changes in both. Coordinate outside the checkout that will be removed; moving a session label does not move its process or cwd.
2. Preserve the reviewed source outside that checkout before removal:
   - For committed work, verify the source branch and commits are reachable from the host repository.
   - For uncommitted work, reproduce it in the host or create a verified transfer file. Include untracked content and staging state; `git diff` alone is not a complete transfer. Compare content, not just filenames.
   - Preserve unrelated host changes. Stop on conflicts or missing content rather than resetting, restoring, or implicitly stashing to force the transfer.
3. Recheck both checkouts immediately before removal. Remove only the identified linked workspace through Herdr once every intended change is preserved. A force flag does not replace preservation or authorisation.
4. Verify Herdr and Git no longer list the removed checkout and its branch still exists. If continuing on that branch is requested, switch the host only when Git can preserve its current changes; stop if it cannot.
5. Confirm the host's branch, changed content, and staging state. Rerun checks only when the checkout or generated state could affect their result. Report the host path, preservation method, verification, and any unfinished work.

Reference: [Herdr socket and worktree contracts](https://herdr.dev/docs/socket-api/).

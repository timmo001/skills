---
name: herdr-workflows
description: Apply local safeguards for Herdr session recovery and transferring linked-worktree changes back to a host checkout. Use alongside the herdr skill when diagnosing Herdr socket routing, recovering the default session, or moving, consolidating, or continuing Herdr worktree changes from the main or host checkout. The herdr skill remains authoritative for all Herdr CLI, topology, targeting, lifecycle, and safety behaviour.
---

# Herdr Workflows

Load `herdr` first. It is the sole source of truth for Herdr commands, command
semantics, topology, identifiers, targeting, agent lifecycle, output reading,
and general safety. Do not restate, override, or infer those rules here. This
companion adds only the local exceptions and transfer ordering below.

## Session Routing

- When diagnosing session routing, inspect the inherited `HERDR_SOCKET_PATH`.
  Do not assume the default socket identifies the current pane's server.
- Do not recover a stopped or unreachable shared session by running
  `herdr server` directly. Use `herdr session attach default`; its attach path
  safely starts the default server when absent.

## Worktree Transfer

Treat checkout removal and work transfer as separate operations. Use the
`herdr` skill and current CLI to determine the available worktree operations;
this workflow only decides when removal is safe.

### Establish Both Checkouts

1. Identify the linked source workspace, branch, checkout path, and exact Git
   state. Identify the repository's primary non-linked checkout as the host;
   "host" does not imply that its current branch is named `main`.
2. Use Herdr and Git's worktree metadata to establish paths and workspace IDs.
   Confirm whether the host checkout already has staged, unstaged, or untracked
   work.
3. Keep the final coordinator outside the linked checkout being removed. If the
   current agent runs inside that checkout, use an existing host workspace or
   open the host checkout with Herdr, then coordinate from that host workspace.
   Do not remove the checkout containing the coordinator's running process.

### Preserve The Reviewed State

1. Record the exact reviewed source scope: staged files, unstaged files,
   untracked files, base commit, and branch. Verification from an earlier turn
   is stale until both checkouts are checked again immediately before removal.
2. Make the reviewed content durable outside the linked checkout using the
   smallest non-destructive method appropriate to its state:
   - If the host already contains the intended files, verify their paths and
     content are byte-for-byte identical to the reviewed source.
   - If work is committed on the linked branch, verify the commit and branch
     are reachable from the host repository.
   - If work exists only as an uncommitted linked-checkout diff, reproduce it in
     the host checkout or create and verify a complete transfer artefact before
     removal. Account separately for staged, unstaged, and untracked content;
     an ordinary `git diff` does not include untracked files.
3. Preserve unrelated host changes. A matching file name is not evidence that
   the contents match, and a clean source after a copy is not evidence that the
   host copy is complete.
4. Stop on conflicts, missing files, differing content, an unexpected base, or
   a host branch switch that would overwrite changes. Do not use reset,
   checkout restoration, or an implicit stash to make the transfer proceed.

Every source change must have a verified durable counterpart outside the
checkout that will be removed.

### Hand Off To The Host

1. From the host-side coordinator, recheck both worktrees and confirm the
   linked workspace ID to remove. Do not begin removal until deleting the source
   checkout cannot destroy the only copy of any intended change.
2. Use the `herdr` skill's current removal process to remove only that linked
   workspace.
3. Confirm Herdr and Git no longer list the linked checkout, and confirm the
   source branch still exists before proceeding.
4. Switch the host checkout to the source branch. Dirty host changes
   may follow the switch only when Git accepts it without overwriting content.
   If the switch fails, stop and preserve the current host state.
5. Reverify the host branch, changed-file set, content, staging state, and any
   prior test evidence. Rerun checks when checkout context or generated state
   could affect their result.
6. If the user requested further work, continue it from the host checkout.
   Otherwise, stop and report the completed transfer.

Report the source workspace removed, final host path and branch, preservation
method, final changed-file state, and verification run. Do not report a
transfer complete merely because the linked workspace disappeared.

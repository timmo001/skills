---
name: session-coordination
description: Coordinate delegated agent sessions with bounded assignments, asynchronous background scheduling, soft concurrency caps, context-window rotation, independent review cycles, and logged cleanup across native child sessions and Herdr-managed agents. Use when managing multiple agents, panes, tabs, branches, stages, or long-running tasks while keeping the coordinating session small.
---

# Session Coordination

Manage scope, dependencies, ownership, approvals, blockers, and completion
evidence. Delegate substantial investigation, implementation, execution,
verification, review, and large reads.

## Route To Owning Skills

- Load `changeset-scope` before bounded delegation and pass the same boundary to
  every child. Surrounding reads are context only.
- Load `staged-implementation` when work has independently reviewable stages.
- Load `herdr` before Herdr control and `herdr-workflows` for session recovery or
  worktree transfer. Those skills own commands, topology, lifecycle, targeting,
  safety, and cleanup mechanics.
- Load `git-context` for Git state, `gh-stack` for stacks, and `git-commit` only
  after explicit commit or push authorisation. Those skills own Git operations
  and approval details.
- Require review sessions to load `code-review`, `changeset-scope`, and matching
  specialist skills. Load `workflows-watch` for long-running GitHub checks.
- Tell each child which repository and domain skills apply. Do not load its
  implementation skills into the coordinator's context.

## Assign And Schedule

1. Give every assignment an owner, dependencies, acceptance criteria, permitted
   mutations, verification, and compact return format. Choose the smallest
   capable set of sessions.
2. Use a soft cap of four actively working delegated sessions and three
   coordinator-created background panes in the current Herdr tab. Queue excess
   work. Exceed either cap only with user approval, and never create topology
   merely to bypass a cap.
3. Run independent or long-running work asynchronously. Use background native
   sessions, unfocused Herdr panes, or the delegated session's background
   facilities. Advance other ready work and join results only when a dependency
   needs them. Do not poll or duplicate running work.
4. Keep conflicting work sequential unless the user approves separate topology.
   Reuse a session only for the same assignment, its review fixes, or unfinished
   verification. New scope or a new independently reviewable outcome gets a
   fresh session.
5. Use a fresh read-only session for every review cycle. Route verified findings
   to the owning implementation session, then use another fresh reviewer.
6. Honour an explicitly requested agent runtime. Keep runtime selection
   separate from the agent profile selected inside that runtime: never convert
   a runtime name into a native profile argument such as OpenCode's `--agent`.
   Herdr's `agent start --kind` selects an integration's default executable; it
   is not a runtime-version selector. For a Herdr-managed alternate runtime,
   resolve the explicit launcher in the coordinator before creating its pane.
   Do not use the target pane for launcher discovery. Start it with `herdr pane
   run`, then verify its foreground `argv` with `herdr pane process-info` before
   assigning work. When the user does not choose a runtime, use host-native
   child sessions and match the coordinator's runtime. In OpenCode, keep V2
   parents on V2 children and V1 parents on V1 children. Use Pi or another
   Herdr-supported agent kind only when the user requests it.

The assignment phase is complete when every ready item is either owned, queued
by the cap, or blocked on a named dependency or user decision.

## Control Context

- Read only short briefs and targeted slices directly. Delegate full diffs,
  transcripts, logs, generated output, long history, and broad searches. Keep
  direct `context_git_context` calls free of `diff` and `branchDiff` payloads.
- Every delegated brief must require compact results and compliance with the
  active context warning system. At a warning, stop adding scope and rotate after
  the smallest safe unit. At critical, stop unless that would leave an unsafe
  transition incomplete.
- A successor receives only current scope, decisions, state, blockers,
  verification, and direct native or artefact references. Do not replay the old
  transcript.
- Track role, runtime, native handle, scope, status, and blocker. Use the host's
  native session ID when available and Herdr agent plus pane IDs for
  Herdr-managed sessions.

Context control is complete when each active session remains below its warning
band or has a recorded successor rotation in progress.

## Record And Clean Up

- Name coordinator-created Herdr agents with `coord-`.
- Before closing any owned session, write and read back
  `~/.cache/agent-coordinator/sessions/<UTC>-<sanitised-handle>.md`. Include
  its handle, runtime, role, scope, repository or worktree, decisions, result,
  changed paths or findings, verification, blockers, artefact references, and
  closure reason.
- Store no transcripts, large output, secrets, notes, or session handoff
  documents. Session records are lifecycle indexes, not durable project plans;
  other loaded skills still own project handoffs or notes when those are needed.
- Follow `herdr` ownership and state safeguards when closing or recovering
  `coord-` sessions. If the record cannot be produced or verified, leave the
  session open. Host-native sessions remain referenced by their native ID.
- Check for stale owned sessions at the start and end of a coordination run.
  Close only settled coordinator-owned topology with a verified record.

Cleanup is complete when no settled coordinator-owned pane, tab, workspace, or
agent remains open without a verified cache record.

## Approvals And Delivery

- Use direct read-only Git and GitHub commands only for concise management facts;
  delegate detailed judgement. Delegate mutating Git and stack work to the owning
  implementation session.
- The coordinator owns the workflow decision for consequential mutations. Pass
  the exact approved operation and scope to the child. Native children retain
  their own permissions, so runtime permission prompts may still appear.
- Resolve conflicting conclusions and failed verification rather than forwarding
  them without analysis. If a child fails, clarify or reassign the work instead
  of absorbing its operational task.
- Report completion only when implementation, independent review, and required
  verification satisfy the acceptance criteria. State skipped work and pending
  approvals explicitly.

Delivery is complete when every requested assignment is accepted, explicitly
deferred, or reported blocked, and all settled owned sessions pass cleanup.

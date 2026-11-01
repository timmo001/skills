---
name: issue-loop
license: Apache-2.0
description: Work through a GitHub issue and every issue related to it until they are done, committing each change and pushing at each working point, with the issue tracker, any project board and the todo list kept current and the user's steering folded in as it arrives. Use ONLY as an explicitly invoked OpenCode `/goal` objective naming the issue, such as `/goal @issue-loop` followed by its number, usually alongside `inbox-reporting` and one review mode (`review-stages` or `review-steering`).
compatibility: Requires Git and an authenticated GitHub CLI. Designed for OpenCode 2 `/goal` with background shells; uses the Plannotator Board when available.
disable-model-invocation: true
---

# Issue Loop

Works through an issue and the issues around it without waiting to be told to carry on. Pair it with `inbox-reporting` so the user can follow from the Inbox, and with one review mode: `review-stages` for a gated review before each stage is pushed, or `review-steering` for no gates, with the user steering as the work goes.

```text
/goal @issue-loop @inbox-reporting @review-steering #32
/goal @issue-loop @inbox-reporting @review-stages #32
```

## Scope and authorisation

The scope is the issues named in the goal text plus the ones related to them: sub-issues, checklist items on a tracking issue, issues they link or that link to them, and work the user adds while the loop runs (in chat, in the Inbox, in review feedback, or by editing or filing issues). If no issue is named and the session doesn't make one obvious, ask rather than guess.

Starting this loop is the user's explicit request, for as long as it runs, to:

- commit each coherent change, and push whenever the branch is at a working point (it builds and the checks the change needs pass), through the repository's or user's commit workflow (such as `dot-git-commit` where installed). A loaded review mode can hold pushes until a review passes;
- tick checklist items, close finished issues with a link to the commit that did it, and file new issues for in-scope follow-up work found along the way.

It doesn't cover new branches, worktrees or pull requests unless the repository's own instructions require them, editing pull request descriptions or comments, releases, or work outside the scope above.

## Tracking

Keep three places in step, updating each as soon as something changes rather than at the end:

- **Issue tracker:** re-read an issue before editing it so concurrent edits aren't lost. Tick items and close issues only once their change is pushed.
- **Board:** where the Plannotator Board is available, one card for the goal, moved and given a `say` line as the work moves (`building` while working, `your_look` or `your_review` while something waits on the user, `shipped` when done).
- **Todo list:** one item per remaining issue or step, in the order you'll do them. Never leave work only in the conversation.

## Steering

The user steers while the loop runs, through chat, Inbox replies, review feedback and issue edits. Treat each steer as work, not as a pause:

1. Acknowledge it where it came from (the Inbox thread where `inbox-reporting` is loaded).
2. Insert it into the todo list at the next good stopping point: straight after the current item when it corrects work already done or changes what comes next, otherwise in order with the rest. Record it on the issue or as a new in-scope issue when it outlasts the session.
3. Carry on with the current focus first. Don't drop or rework the item in hand mid-way; finish it to its next working point, then take the steer from the updated list. Don't stop to confirm a clear steer; ask only when it's ambiguous or conflicts with an earlier one. The exception is a steer that says the current item is wrong or should stop: act on that at once.

## Each round

1. Re-read the issues in scope, take any steering queued at this point, and pick the next item nothing blocks. Mark it in progress.
2. Do it, following the repository's instructions and owning skills. Run the checks it needs.
3. Commit it. Push when the branch is at a working point, unless the review mode holds it. If the push runs CI, watch it in a background shell as `ci-loop` describes, and fix what it finds before moving on.
4. Update the tracker, Board and todo list, then go straight on to the next item. Don't stop to ask whether to continue.

When an item needs the user, send what it needs and carry on with any item that doesn't depend on the answer.

## Done or stopped

Done when every issue in scope is closed or its checklist is complete, every change is pushed, and CI on the latest head has passed.

Stop only when nothing left can move without the user: every remaining item waits on a decision with no safe default, a review, an access or human-only step, or a failure that has survived two fixes. Report what is waiting and why, then ask the next-steps question `asking-questions` describes (continuing, named, among the options) rather than stating what you'd do next.

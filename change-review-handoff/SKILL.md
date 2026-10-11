---
name: change-review-handoff
license: Apache-2.0
compatibility: Requires Plannotator, through its `plannotator` agent tool or the `plannotator` CLI. Guided reviews use the `plannotator-guide` skill or the Plannotator Inbox; next-step questions follow `asking-questions`.
description: Hand a finished code change to the user for review in Plannotator and ask what to do once it is approved. Use when an implementation, fix, refactor, or cleanup is complete and verified, before reporting it done; picks a diff review or a guided review plus diff review by size, and offers commit, push, pull request, or publish steps that fit the context.
---

# Change Review Handoff

When a change is complete and its checks pass, hand it to the user in
Plannotator instead of only summarising it in chat. The review is the user's
gate; the next steps run once they approve.

Skip this when the user said not to review, the turn changed no files, or the
user has already reviewed this exact diff.

## 1. Pick The Review

- **Small change** (one repository, a handful of files, a diff that reads in a
  few minutes): open a diff review only.
- **Large change** (several repositories, many files or hundreds of changed
  lines, or several separately reviewable parts): ask which review the user
  wants, following `asking-questions`, and end the turn until they answer:
  - Diff review only.
  - Guided review plus diff review (recommended when the change spans
    repositories or parts that need explaining in order).
- The sizes are a judgement, not a threshold. When unsure, treat the change as
  large and ask.

## 2. Open It

- Check for an open review first: the `plannotator` tool's `list` action, or
  `plannotator sessions --json` without the tool. Reuse a live review of the
  same repository rather than opening another.
- Open a diff review per repository with the `plannotator` tool's `review`
  action, passing the repository directory as `target` when it is not the
  working folder, and `options.base` for a stacked branch. Without the tool,
  follow the `plannotator` skill's CLI guidance.
- For a guided review, send it before the diff review: `get_guide_brief` then
  `submit_guide` through the Plannotator Inbox, or the `plannotator-guide`
  skill when the user wants an exported file. Cover every repository in the
  changeset.
- In the same turn, ask for next steps (section 4), then tell the user in one
  line what opened and end the turn. Do not poll, rerun, or reopen the review.

Ask for next steps when the review opens, not after approval: a code review
approved with no notes is never sent to the agent, so waiting for the approval
can stall forever. The user approves in the review and answers the question
separately.

## 3. Act On What Arrives

- **Feedback** (annotations, or an approval with notes that asks for
  changes): address each point, rerun the relevant checks, open the review
  again for the updated diff, and say whether the pending next-steps answer
  still applies.
- **Approved with notes:** notes are guidance, not change requests. Apply the
  small, clear ones and say how each was handled.
- **Next-steps answer:** treat it as approval of the diff as it stands. If
  review feedback is still being addressed, finish that and get it reviewed
  first.
- **Closed without a decision** (the user says so, or the review is gone from
  `list` with no answer): report the change as unreviewed. Do not reopen it.

## 4. Ask For Next Steps

Ask once, following `asking-questions` (Inbox and chat when the Inbox is
available), as a multi-choice question so the user can combine steps. Phrase
it as what to do once the review is approved. Offer only the steps that fit
the context, and put your recommendation first:

- Commit (split into coherent commits by the repository's commit workflow).
- Commit and push.
- Open a pull request, when the repository works through pull requests or the
  change is on a feature branch. Draft the title and description for the
  user's approval; choosing this option is not consent to post them.
- Push to the existing pull request, when the branch already has one.
- Publish or release, when the repository produces a package or release that
  the change needs. Follow that repository's publication workflow.
- Update a dependent repository (a submodule pin, plugin bump, or consumer),
  when another checkout consumes this change.
- Leave it uncommitted for now.

For a multi-repository change, make each option say which repositories it
covers, or ask per repository when they need different steps.

The user's choice authorises only the steps they picked, once. Run them
through the usual workflows (for example the commit skill), report the result,
and do not treat it as standing permission for later changes.

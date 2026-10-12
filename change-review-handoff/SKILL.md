---
name: change-review-handoff
license: Apache-2.0
compatibility: Requires Plannotator, through its `plannotator` agent tool or the `plannotator` CLI. Guided reviews use the `plannotator-guide` skill or the Plannotator Inbox; next-step questions follow `asking-questions`.
description: Hand a finished code change to the user for review in Plannotator, with a standing next-steps question they answer when they have no notes. Use when an implementation, fix, refactor, or cleanup is complete and verified, before reporting it done; picks a diff review or a guided review plus diff review by size, and offers commit, push, pull request, or publish steps that fit the context.
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
- A plain approval with no comments sends nothing back to the session, so
  once the reviews are open, send one Inbox message with a standing
  next-steps question with the options from step 4. Word it yourself, varied
  to fit the change, rather than repeating one fixed phrase, as long as it
  makes clear the user answers it when they have no notes (for example "All
  good? Pick what happens next" or "Nothing to change? Choose the next
  steps"). After a guided review, send it as a reply to the guide
  (`reply_to` set to the `submit_guide` message id), so the guide, its
  comments and the question share one thread, and say the guide and the diff
  review for each repository are ready, guide first, so the user never finds
  the diff review open on its own. Record the message id.
- Link every open review in that message, one line per repository, using the
  URL the review action returned (for example
  `[Diff review: frontend](http://localhost:38113)`), so the user can reach it
  from the Inbox when the browser tab was missed or closed.
- Put the changeset in that message above the question, so the user can
  decide from the Inbox: the changed files per repository with their added
  and removed line counts, then a short fenced `diff` preview of the key
  hunks. Keep the preview to a few lines per file, and for a large change
  show only the hunks that matter most and say the rest is in the review.
- Tell the user in one line what opened, with the same review links, and that they can either send notes
  from the review or answer the next-steps question in the Inbox or chat.
  Then end the turn. Do not poll, rerun, or reopen the review.

## 3. Act On What Arrives

- **Feedback** (diff review annotations, comments on the guide's code, which
  arrive as a reply in the guide's thread, or notes that ask for changes):
  if the standing question is still open, replace it first (send into its
  thread with `supersedes`), so a pick on the old diff is never sent. Address
  each point, rerun the relevant checks, open the review again for the updated
  diff, and send a fresh standing question with it.
- **Approved with notes:** notes are guidance, not change requests. Apply the
  small, clear ones and say how each was handled. If that changed the diff or
  the fitting next steps, replace the standing question with one built from
  the new state; otherwise leave it for the user to answer.
- **Answer to the standing question:** treat it as approval with no notes and
  run the picked steps.
- **"Approved" in chat without a pick:** point to the standing question, or
  ask it in chat.
- **Standing question skipped:** an Inbox reply that does not pick a next step
  (an approval or notes in words) skips the question. Once any notes are
  handled, send a fresh standing question in that thread rather than pointing
  to the skipped one.
- **Closed without a decision:** the standing question still covers it. Do
  not reopen the review unprompted.
- **Set aside with Mark read:** the user has said not to wait on the standing
  question. Stop there; do not reopen the review or ask again unprompted.

## 4. Next-Step Options

Build the standing question's options from the state when it is sent,
following `asking-questions` (Inbox and chat when the Inbox is available), as
a multi-choice question so the user can combine steps. Offer only the steps
that fit the context, and put your recommendation first:

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

### Release Cycles

When the repository ships through a release cycle, a commit is rarely the end.
Add the follow-through steps that fit, as separate options so the user can
combine them, and offer the alternatives rather than one fixed path:

- **Arch package source** (a repository built into the public or private
  pacman repository, or its `-git` package): "Update the `-git` package when
  released", "Publish now" through the repository's publication workflow or
  `/timmo001-private/publish-package`, and "Install from pacman once
  published" to verify ownership and version.
- **npm or JSR package:** "Release a new version" through the repository's
  release workflow, "Bump consumers once published" (pinned exact versions in
  the repositories that use it), and "Hold for the next release" when the
  change can ride along with later work.
- **Dotfiles bump** (a submodule, plugin, skill import or pinned version update
  in `~/.config/dotfiles`, `~/.config/dotfiles-private` or `~/repos/skills`):
  recommend "Commit and push", since a bump does nothing until other machines
  pull it on `dot update`. Offer "Commit only" as the alternative.
- **Source and consumer together:** offer the chain as one option, for example
  "Push the source, wait for its release, then bump and push the consumer",
  alongside doing only the source side now.

Only offer a release step the repository actually supports, and say in the
option what it waits on (a workflow run, a published version).

The user's choice authorises only the steps they picked, once. Run them
through the usual workflows (for example the commit skill), report the result,
and do not treat it as standing permission for later changes.

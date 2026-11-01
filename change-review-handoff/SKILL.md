---
name: change-review-handoff
license: Apache-2.0
compatibility: Requires Plannotator, through its `plannotator` agent tool or the `plannotator` CLI. Guided reviews use the Plannotator Inbox or the `plannotator-guide` skill; the next-steps question follows `asking-questions`.
description: Hand a finished, verified code change to the user as a Plannotator review with a next-steps question. Use before reporting an implementation, fix, refactor or cleanup done.
---

# Change Review Handoff

When a change is complete and its checks pass, hand it to the user in Plannotator instead of only summarising it in chat. Nothing else happens until they approve.

Skip this when the user said not to review, the turn changed no files, or the user has already reviewed this exact diff.

## 1. Open The Review

- Always open a diff review, unless the user asked for something else.
- Reuse a live review of the same repository (the `plannotator` tool's `list` action, or `plannotator sessions --json`). Otherwise open one per repository with the tool's `review` action (`target` for another directory), or the `plannotator` skill's CLI.
- Match the diff to the work. Uncommitted work uses the user's saved default. For committed branch work, pass `--base <ref> --diff-type since-base` (CLI; the tool's `options.base` sets only the base). For a stacked branch, the base is the branch below it.
- Don't wait to ask about a guided review first. For a large change, offer it as an extra question in step 2.

## 2. Ask What Happens Next

Approving with no comments sends nothing back, so once the reviews are open, send one Inbox message (`send_message`) with these, in order:

1. A link to each open review, one line per repository, using the URL the review action returned (for example `[Diff review: frontend](http://localhost:38113)`), so the user can reach it when they missed or closed the browser tab.
2. The changed files per repository with added and removed line counts, and a short `diff` block of the main changes: a few lines per file, and for a large change only the parts that matter most, saying the rest is in the review.
3. The next steps as a `:::question-multi` block, so the user can tick several (options in step 4). Word the question to fit the change and make clear it is for when they have no notes.
4. For a large change (several repositories, many files or hundreds of changed lines, or parts that need explaining in order), a separate `:::question` offering a guided review as well, recommended when the change spans repositories or needs explaining in order. Sizes are a judgement call, not a threshold.

Put any question of the thread this change settles, such as the plan review question, in `supersedes`. When the work has a Board card, move it to `your_review` with `you:` naming the tick and `thread_id` this thread.

When the user wants a guided review, send it into the same thread (`get_guide_brief`, then `submit_guide` with `reply_to` set to this message, covering every repository), or use the `plannotator-guide` skill when they want an exported file. The diff review stays open alongside it, and the next-steps question still stands.

An option can be one step or several at once ("Commit, push and create the pull request"), and can say briefly what it does or why after a spaced hyphen. Write them for the change rather than repeating the same list every time.

```markdown
:::question-multi
Nothing to change? Tick what happens next.

Stopped: waiting on your review

- [ ] Commit only - keeps it local for now
- [ ] Commit, push and create the pull request - ready for review as it is
- [ ] Commit, push and open a draft pull request - CI runs before anyone looks
- [ ] Commit and push, then link me to create it - prefilled form, you press create

Recommended: Commit, push and create the pull request
:::
```

`Recommended:` names the option you recommend, or several separated by `;`. Keep the options in their natural order rather than moving the recommended one first. Never use `- [x]`: it marks a question as already answered. Note the message id and ask the same question in chat as `asking-questions` says. In chat, say in one line what opened, with the same review links, and that the user can send notes from the review or answer in the Inbox or chat. Then end the turn. Don't poll, rerun or reopen the review.

## 3. Act On What Arrives

- **Feedback** (review comments, guide comments, which arrive as a reply in the guide's thread, comments on the words of the handoff message, such as its `diff` block, or notes asking for changes): if the question is still open, replace it first with `supersedes: ["<old message id>"]` so a tick on the old diff can't be sent. Then make each change, rerun the checks, reopen the review, and send a new question with it.
- **Approved with notes:** notes are guidance, not change requests. Make the small, clear ones and say how you handled each. Replace the question only if that changed the diff or which steps fit.
- **Ticked steps:** treat as approval with no notes and run them (step 4).
- **A reply that ticked nothing,** or a review closed without a decision: the question stays open. Don't ask again or reopen the review; if the user says "approved" without ticking anything, point to the question or ask it in chat.
- **Mark read:** the user set it aside. Stop, and don't reopen the review or ask again.

## 4. Next Steps

Offer only the steps that fit when the question is sent. Run the ticked ones in order (commit, push, pull request, release, dependent repositories), and include any earlier step a later one needs: "Create the pull request" on its own still commits and pushes. If two ticks clash (two kinds of pull request, or "Leave it uncommitted" with anything else), ask which one.

- **Commit**, split into sensible commits as the repository's workflow says.
- **Push**.
- **Pull request**, when the repository uses them or the branch is a feature branch: **Create the pull request** (the `gh` Code Mode tools' PR create, or `gh pr create`), **Create it as a draft** (`--draft` on the CLI), or **Link me to create it** (a prefilled link, below). Write the title and body as `writing-style` says, inside the repository's pull request template, ticking only the checkboxes the change meets. If the user reviews the pull request text and ticks boxes or says which to tick, their choices win. Add labels, assignees, a milestone or a project where the repository uses them. Give the user the pull request's URL, or the link.
- **Push to the existing pull request**, when the branch has one.
- **Release**, when the change needs one (see Releases below).
- **Update a dependent repository** (a submodule pin, plugin bump, or a repository that uses this one), when another checkout uses this change.
- **Leave it uncommitted.**

For several repositories, say which repositories each option covers, or ask per repository when they need different steps.

A tick allows those steps once, not later changes. Run them through the usual workflows (for example the commit skill), and reply in the thread as each lands (the commit, the push, the pull request, the release, a check they asked for), not once at the end. Steps that finish together share one reply; a step that found something they need to know (a bug, a failed check) gets its own. Move the card with them: link the pull request, `ship` when merged or released.

### Releases

When the repository ships releases, a commit is rarely the end. Offer only release steps the repository supports, say in the option what it waits on (a workflow run, a published version), and offer alternatives rather than one fixed path:

- **Arch package source** (built into the public or private pacman repository, or its `-git` package): update the `-git` package when released, publish now through the repository's workflow or `/timmo001-private/publish-package`, and install from pacman once published to check the owner and version.
- **npm or JSR package:** release a new version through the repository's release workflow, bump the exact pinned versions in the repositories that use it once published, or hold for the next release when the change can wait for later work.
- **Dotfiles bump** (a submodule, plugin, skill import or pinned version in `~/.config/dotfiles`, `~/.config/dotfiles-private` or `~/repos/skills`): recommend commit and push, since a bump does nothing until other machines pull it on `dot update`. Offer commit only as the alternative.
- **Source and the repository using it together:** offer the chain as one option ("Push the source, wait for its release, then bump and push the repository using it"), alongside doing only the source side now.

### Prefilled Pull Request Links

GitHub fills in the pull request form from [query parameters](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/using-query-parameters-to-create-a-pull-request):

```text
https://github.com/<owner>/<repo>/compare/<base>...<branch>?quick_pull=1&title=...&body=...&labels=a,b
```

- `assignees` (comma-separated), `milestone` and `projects` (`<owner>/<n>`) work too. URL-encode every value. For a fork, use `<base>...<user>:<branch>`.
- `body` replaces the template, so put the filled-in template in it.
- There is no draft parameter. The user picks draft with the form's button.
- A bad value or a missing permission returns a 404 page, and a URL that is too long returns 414. Drop the optional parameters or shorten the body, and only use labels that already exist.

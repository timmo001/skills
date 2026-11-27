---
name: inbox-reporting
license: Apache-2.0
description: Keep the user in the loop through the Plannotator Inbox while work with several steps runs, with a status update for every step, directions as gated Plannotator reviews and questions as Inbox questions, so they can follow and steer without the terminal. Use whenever the `plannotator_inbox` tool is available and the work spans more than one reply or several steps, whether or not the user mentions the Inbox, and as an OpenCode `/goal` objective alongside a loop skill and a review mode, such as `/goal @issue-loop @inbox-reporting @review-steering`.
compatibility: Requires the Plannotator Inbox and Plannotator review tools, and the asking-questions skill. Works in any session with those tools, and with OpenCode 2 `/goal`.
---

# Inbox Reporting

The user follows and steers from the Inbox and chat while the work runs; the terminal is not where they look, and they won't remind you to use the Inbox. Everything they need to follow, review or answer goes to the Inbox. Under `/goal`, the review mode loaded alongside (`review-stages` or `review-steering`) decides how changes get reviewed; otherwise a finished change goes through `change-review-handoff`.

## Thread

Use one Inbox thread for the work, named after it, and start it when the work starts rather than at the end. Keep every update, review link and question in it. A message that names no thread starts a new one, so give every message the same `thread` name, or `reply_to` a message in the thread. Keep the remaining steps as the thread's checklist (`steps`, or `steps` sent with the update), changed when a step starts, ends or waits on the user. Keep it to a few high-level steps in plain words, never your own to-do list; the Inbox shows it as a button in the thread's bottom bar. Where the Board is on, link the thread from the work's card.

Add each pull request the work opens to the thread with `pulls`.

## Status updates

Send a short update after every step, straight away rather than batched: an item started, a commit, a push, an issue ticked or closed, a CI result, a steer picked up, a blocker. Each says what happened, links the commit, issue or run, and says what comes next. Keep them to a few lines.

## Directions and questions

A loaded review mode can narrow this: under `review-steering` nothing is put up for sign-off and design questions aren't asked.

- A direction the user has to set (a design choice, a plan, a document to sign off) goes in a gated Plannotator review (`gate: true`, or the plan review for a plan, as `plan` describes). Link it from the thread with a `Holds up:` line, or `Stopped:` only if nothing else can move.
- Any other question goes in the thread as a `:::question` block, as `asking-questions` describes.
- Keep working on whatever doesn't depend on the answer while it's open.

## Acknowledging steering

When a steer, answer or review decision arrives in chat, an Inbox reply or review feedback, reply in the thread first: a line on where it went in the checklist (usually after the current item) and what happens now, with any question it settles in `supersedes`. Don't repeat back what the user said; it already sits above in the thread. Only spell out your reading of it when it was ambiguous. A request made in chat counts the same as one in the Inbox.

## Ending

Don't come back in chat with something that waits on a reply; that goes to the Inbox. When the work stops or finishes, send the full report (what changed, what to look at, what's left) to the thread. If work is left, close with the multi-select next-steps question `asking-questions` describes, not a "next I'll..." line. Resolve the thread only once nothing in it waits on the user.

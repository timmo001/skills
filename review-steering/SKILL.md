---
name: review-steering
license: Apache-2.0
description: Review mode for long autonomous work whose design is already settled, with no review requests, sign-offs or design questions. Changes are pushed as they reach a working point, decisions are made from the given design and reported, and the user steers only when they choose to. Use ONLY as an explicitly invoked OpenCode `/goal` objective alongside a loop skill, such as `/goal @issue-loop @inbox-reporting @review-steering`; use `review-stages` instead when each stage needs sign-off.
compatibility: Designed for OpenCode 2 `/goal`; uses the Plannotator Inbox when available.
disable-model-invocation: true
---

# Review Steering

The design is already given, in the issues, the goal text and the repository's docs and conventions. Asking the user to review or decide is wasted time for them. They watch the updates and step in with a steer when they want something different; until then, the work never waits on them.

## Don't ask

- Don't open code reviews, diff reviews or gated sign-offs, and skip the usual end-of-change review handoff (such as `change-review-handoff`). Only open a code review if the goal text asks for one.
- Don't ask design or direction questions. Where the given design leaves something open, make the call that fits it best, carry on, and name the call in the status update so the user can steer if they disagree.
- Reach for the user only for what no decision of yours can settle: access, a human-only step, or something the given design rules out or contradicts.

## Pushing and updates

Push whenever the branch is at a working point, as the loop describes. With each pushed change, say what changed and where to see it (rendered docs pages, UI, screenshots, previews or URLs, with a link, a command or an attached screenshot). This is information for the user to steer from, not a request for review.

## Steering

A steer can arrive at any point, about the current item or work already pushed. Track it as the loop describes: insert it into the todo list at the next good stopping point, keep going with the current focus until it reaches a working point, then pick the steer up. Note it on the issue when it outlasts the session, and don't wait for confirmation. Fix pushed work in new commits rather than rewriting history.

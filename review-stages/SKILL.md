---
name: review-stages
license: Apache-2.0
description: Review mode for long autonomous work where each stage gets a gated Plannotator code review before it is pushed, with feedback fixed and re-reviewed while independent work carries on. Use ONLY as an explicitly invoked OpenCode `/goal` objective alongside a loop skill, such as `/goal @issue-loop @inbox-reporting @review-stages`; use `review-steering` instead when the user only wants to steer.
compatibility: Requires Plannotator review tools and Git. Designed for OpenCode 2 `/goal`; uses the Plannotator Inbox when available.
disable-model-invocation: true
---

# Review Stages

The user signs off each stage of the work before it's pushed.

## Stages

A stage is one coherent change the user can review on its own: an issue, a checklist item, or a slice of a larger one split as `staged-implementation` describes. Keep stages small enough to read in one sitting.

## Each stage

1. Finish the stage, run the checks it needs and commit it. Don't push yet.
2. Open a gated Plannotator code review of the stage (`review` with `gate: true`, based on the last pushed commit) and link it from the Inbox thread with a `Holds up:` line naming the stage. Say what the stage does and anything the user should look at by eye as well.
3. While it waits, carry on with the next item only if it doesn't build on the unreviewed stage; otherwise work on independent items. If none are left, end the turn and let the review arrive.
4. On feedback, fix it in new commits, queue any wider steer in the todo list for after this stage, and open the review again for the same stage.
5. On approval, push, then tick the tracker and move on as the loop describes.

Never push a stage that hasn't been approved, and don't fold an unrelated change into a stage that is already up for review.

---
name: ci-loop
license: Apache-2.0
description: Run a watch, triage, fix and push loop on a directly pushed branch, such as the default branch, until every GitHub Actions run on its latest commit passes. Use as an OpenCode `/goal` objective (`/goal @ci-loop`) or when asked to keep fixing CI on a branch pushed without a pull request.
compatibility: Requires Git, an authenticated GitHub CLI and GitHub Actions. Designed for OpenCode 2 `/goal` with background shells; works in any client that can run a shell in the background and be woken when it ends.
---

# CI Loop

Keeps a directly pushed branch's CI green, one round per turn. For pull requests, use the user's pull request loop or watch skill where one is installed, since it also covers reviews.

Usually started with no branch named:

```text
/goal @ci-loop
```

## Scope and authorisation

Work out the checkouts and branches from the session: the ones it pushed to or was asked about, usually the current checkout's branch. If that's unclear, ask rather than guess.

Starting this loop is the user's explicit request to fix, commit and push on those branches for as long as it runs. It covers only the session's own changes and the failures they cause, never new branches, pull requests or unrelated work.

## Each round

1. Find the Actions runs for the branch's pushed head: `gh run list --commit <sha>`, or the client's equivalent GitHub tool. Runs can take a few seconds to appear after a push; if none have, check again before going further, and if there are still none, report that the commit triggers no workflows.
2. Watch every run that hasn't finished, each in a background shell, so `/goal` waits on it and its end wakes the session: `gh run watch <run-id> --exit-status`. Never wait in a blocking foreground call, and don't poll while they run.
3. For each failed run, read the failed steps (`gh run view <run-id> --log-failed`). Say whether each failure is a quick fix in the session's changes, needs diagnosis (apply `diagnose`), or looks flaky, infrastructure or unrelated.
4. Fix every quick failure, run the checks the fix needs, then commit and push through the repository's or user's commit workflow (such as `dot-git-commit` where installed). Then end the turn so the next round watches the new head.

A push supersedes the old head: watch the new commit's runs rather than the old ones.

## Done or stopped

Done when every run on the branch's latest head has passed.

Stop and report back instead of continuing when a failure looks flaky, infrastructure or unrelated to the session's changes, a fix needs a design decision, or the same failure survives two fixes. For each failure still open, give the run link, the failing step, the evidence from its log and the proposed next action. Never re-run, cancel or dispatch workflows without the user's yes.

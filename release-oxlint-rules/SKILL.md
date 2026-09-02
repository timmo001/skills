---
name: release-oxlint-rules
description: >-
  Create and publish a major, minor, or patch release of
  @timmo001/oxlint-rules. Use when asked to create, cut, prepare, or publish an
  oxlint-rules release, including its version bump and npm and JSR publication.
license: Apache-2.0
# origin: https://github.com/timmo001/oxlint-rules/tree/main/skills/release-oxlint-rules
# upstream-sha: 7e71fb8cf3f73cce72d19bc9a1f3278913c57e95
---

# Release Oxlint Rules

1. Find a writable checkout whose Git remote is
   `timmo001/oxlint-rules`. Read its `AGENTS.md`, package metadata, release
   workflow, latest tags, and changes since the latest release. Stop if the
   worktree contains unrelated changes or the local branch is behind its
   remote.
2. Confirm `package.json` and `jsr.json` have the same current version and that
   its release exists. Resolve the next version from the requested major,
   minor, patch, or exact version. Ask only when the release level is missing.
   Do not add a `v` prefix when the repository's existing tags omit it.
3. Update the version in `package.json` and `jsr.json`. Before committing, run
   `mise run check`, `mise run build`, `npm pack --dry-run`, and
   `bunx jsr@0.14.3 publish --dry-run --allow-dirty`. The dirty-tree flag is
   required because the intended version bump is not committed yet.
4. Treat a direct request to create or publish the release as authorisation for
   its version commit, push, and GitHub release. Follow the active environment's
   guarded commit and push workflow, committing only the release metadata with
   `Release Oxlint rules <version>`. A request to prepare or plan a release does
   not authorise publication.
5. Resolve the target only after the push with `git rev-parse HEAD`. Pass the
   resulting full 40-character SHA as the `--target` value when running
   `gh release create`. Never pass an abbreviated SHA as `target_commitish`.
6. Create the release before resolving workflow targets because publication is
   triggered by the `release.published` event. Watch only the release commit's
   exact workflow runs and require both `Publish to npm` and `Publish to JSR` to
   succeed.
7. Report the release URL, version commit, validation results, and npm and JSR
   publication conclusions. Do not report the release as complete while either
   publication job is pending or failed.

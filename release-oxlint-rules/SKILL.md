---
name: release-oxlint-rules
compatibility: Requires a writable checkout of the central Oxlint rules package, mise, Bun, npm, Git, and network access to npm and JSR. Publishing also requires authenticated GitHub CLI and GitHub release access.
description: >-
  Create and publish a major, minor, or patch release of
  @timmo001/oxlint-rules. Use when asked to create, cut, prepare, or publish an
  oxlint-rules release, including its version bump and npm and JSR publication.
license: Apache-2.0
# origin: https://github.com/timmo001/oxlint-rules/tree/main/skills/release-oxlint-rules
# upstream-sha: 05c84299d080e5e0dde79a7b0e5cff9a20cc7408
# local-edits:
#   - SKILL.md: read publication status once and stop when publication is incomplete
#   - SKILL.md: added compatibility metadata for concrete environment requirements
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
3. Verify official npm `latest` metadata for `oxlint`, `@oxlint/plugins`, and
   `oxlint-tsgolint`. Keep Oxlint and its plugins on the same exact latest
   version, and use the latest tsgolint satisfying Oxlint's peer requirement.
   Regenerate `bun.lock`. Resolve compatibility failures without widening peer
   ranges, disabling rules, or forcing transitive dependency upgrades.
4. Update the version in `package.json` and `jsr.json` only when a version bump
   is requested. Before committing, run `mise run check`, `mise run build`,
   `mise run test:package`, `npm pack --dry-run`, and
   `bunx jsr@0.14.3 publish --dry-run --allow-dirty`. The dirty-tree flag is
   required because the intended version bump is not committed yet.
5. Treat a direct request to create or publish the release as authorisation for
   its version commit, push, and GitHub release. Follow the active environment's
   guarded commit and push workflow, committing only the release metadata with
   `Release Oxlint rules <version>`. A request to prepare or plan a release does
   not authorise publication.
6. Resolve the target only after the push with `git rev-parse HEAD`. Pass the
   resulting full 40-character SHA as the `--target` value when running
   `gh release create`. Never pass an abbreviated SHA as `target_commitish`.
7. After creating the release, read the release commit's `Publish to npm` and
   `Publish to JSR` job status once.
8. Report the release URL, version commit, validation results, and npm and JSR
   publication conclusions. Stop and report publication as incomplete unless
   both jobs have succeeded.

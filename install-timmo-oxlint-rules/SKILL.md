---
name: install-timmo-oxlint-rules
description: >-
  Install or copy @timmo001/oxlint-rules into a JavaScript or TypeScript
  repository. Use when adding the shared anti-slop Oxlint config, enabling its
  Effect rules, or replacing a local anti-slop copy.
license: Apache-2.0
# origin: https://github.com/timmo001/oxlint-rules/tree/main/skills/install-timmo-oxlint-rules
# upstream-sha: 229d9b94729827a5c78b584d931d442c6cb810d0
---

# Install Timmo Oxlint Rules

1. Ask one structured question before changing files: `Package (Recommended)`
   or `Copy rules`.
2. Inspect the target's manifests, lockfiles, Oxlint config, repository
   instructions, and normal checks. Use the current working directory unless
   the user names another target.
3. Preserve existing ignores, overrides, plugins, and repository-owned rules.
   Confirm `oxlint` and `@oxlint/plugins` use the same exact version supported
   by the selected package version.

## Package

1. Ask whether to use npmjs.org or JSR.
2. Detect Bun, npm, pnpm, or Yarn from the target's package manager declaration
   and lockfile. Add an exact development dependency through that package
   manager.
3. Extend `@timmo001/oxlint-rules/configs/recommended`. Use `/configs/effect`
   instead only when `effect` is a direct dependency or the user explicitly
   requests it.
4. Keep dependency and config edits visible. Do not delegate them to a script.

## Copy rules

1. Ask for a repository-relative destination. Do not assume a personal
   filesystem layout.
2. If the destination exists, compare it with the proposed source and explain
   meaningful differences before asking whether replacement is intended.
3. Run `node scripts/copy.mjs <bun|npm|pnpm|yarn> <destination>`. Add `--force`
   only after explicit replacement approval.
4. Register the three entry points printed by the command as `anti-slop`,
   `anti-slop-effect`, and `timmo-effect`. Enable `timmo-effect` only for direct
   Effect use or an explicit request.

Run the target repository's normal lint, typecheck, tests, and build. Report
package-manager changes, preserved local configuration, enabled rule groups,
and checks.

---
name: install-timmo-oxlint-rules
description: >-
  Install or copy @timmo001/oxlint-rules into a JavaScript or TypeScript
  repository. Use when adding the shared anti-slop Oxlint config, enabling its
  Effect rules, or replacing a local anti-slop copy.
license: Apache-2.0
# origin: https://github.com/timmo001/oxlint-rules/tree/main/skills/install-timmo-oxlint-rules
# upstream-sha: 05c84299d080e5e0dde79a7b0e5cff9a20cc7408
---

# Install Timmo Oxlint Rules

1. Ask one structured question before changing files: `Package (Recommended)`
   or `Copy rules`.
2. Inspect the target's manifests, lockfiles, Oxlint config, repository
   instructions, and normal checks. Use the current working directory unless
   the user names another target.
3. Preserve existing ignores, overrides, plugins, and repository-owned rules.
   Verify the official npm `latest` versions of `oxlint` and `@oxlint/plugins`.
   They must match each other and the exact peers of the selected rules release.
   Support is latest-only: if the published peer contract has not caught up,
   report the pending rules release instead of widening peers or bypassing
   package-manager failures. Do not force upgrades of Vite Plus's transitive
   dependencies or assume its bundled plugins satisfy this contract.

## Package

1. Ask whether to use npmjs.org or JSR.
2. Detect Bun, npm, pnpm, or Yarn from the target's package manager declaration
   and lockfile. Add an exact development dependency through that package
   manager.
3. Extend `@timmo001/oxlint-rules/configs/recommended`. The config owns plugin
   registration and recommended severities. Use `/configs/recommended-effect`
   instead only when `effect` is a direct dependency or the user explicitly
   requests it.
4. Keep dependency and config edits visible. Do not delegate them to a script.
5. For type-aware linting, explicitly pin the latest `oxlint-tsgolint` that
   satisfies Oxlint's peer requirement and was validated with the rules release.
   Enable `options.typeAware` in the target config and verify type-aware linting
   alongside the shared rules.

## Copy rules

1. Ask for a repository-relative destination. Do not assume a personal
   filesystem layout.
2. If the destination exists, compare it with the proposed source and explain
   meaningful differences before asking whether replacement is intended.
3. Run `node scripts/copy.mjs <bun|npm|pnpm|yarn> <destination>`. Add `--force`
   only after explicit replacement approval.
4. Register every plugin entry point printed by the command. Merge every printed
   general rule setting into the target config. Merge every printed Effect rule
   setting only for direct Effect use or an explicit request. Treat the command
   output as authoritative rather than maintaining plugin or rule inventories
   in this skill.

Run the target repository's lint command to verify the configuration loads, plus
any checks explicitly required by that repository. Run typechecks, tests, or a
build only when code or dependencies changed in a way those checks cover. Report
package-manager changes, preserved local configuration, enabled rule groups,
and checks.

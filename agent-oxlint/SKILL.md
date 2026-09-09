---
name: agent-oxlint
compatibility: Requires the dot agent-oxlint command and its managed package cache. Running the advisory pass normally requires repository opt-in through private configuration.
description: Run the optional advisory Oxlint pass during JavaScript or TypeScript cleanup and slop-reduction work in dot-managed repositories. Use after the repository's own lint workflow; act only on diagnostics intersecting changed diff lines, while the command checks private opt-in and local Oxlint precedence.
---

# Agent Oxlint

1. Use this pass only when the task includes cleanup or slop reduction, unless
   the user explicitly requests it more broadly. Read the repository
   instructions and run its own lint workflow first.
2. Select only in-scope changed JavaScript or TypeScript files. Record the
   added or modified line ranges from the current diff, then run:

   ```bash
   dot agent-oxlint <path>...
   ```

   Use `dot agent-oxlint --all` only when the user requests or the task requires
   a full-tree scan.
   When the user explicitly asks to persist the opt-in, run
   `dot agent-oxlint --opt-in`. It enables an existing private config entry
   and commits the single-line change through `dot git-commit`, without pushing.
   Missing entries offer the `dot repo-induct` wizard in a terminal.
   For agent use, run `dot repo-induct <path> --noninteractive` with the chosen
   `--preset normal` (default) or `--preset home-assistant`, `--agent-oxlint`,
   and field overrides from `--help`. Show the preview and ask for approval,
   then repeat exactly those options with `--commit`. Never add `--commit`
   before the user has approved the preview. Resume the original lint command
   after induction. Add paths or `--all` to opt-in to also lint. The config must
   be clean; active commit hooks are refused to preserve the scoped change.
3. Treat either successful skip as final unless the user explicitly asked to
   force the pass:
   - the repository is not opted in through private `dot-git.yml`;
   - the repository has its own Oxlint config, dependency, script, or binary.

   Do not bypass either gate or add files to make this pass run. Use
   `dot agent-oxlint --force` only when the user explicitly requests it.
4. Match each diagnostic to the recorded changed-line ranges. Fix a diagnostic
   only when its reported line intersects an added or modified range. Do not
   clean pre-existing findings elsewhere in a changed file, and do not widen
   the diff to make this advisory pass clean.
5. Report personal-pass diagnostics separately from the repository's own lint
   result. A non-zero result does not fail host verification when every
   remaining diagnostic is outside the changed lines. The managed pass uses
   only the generic recommended rules.

For a repository that should own these rules, load
`install-timmo-oxlint-rules` instead. Do not use this wrapper as a substitute
for adopting the package in a personal repository.

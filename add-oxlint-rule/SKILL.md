---
name: add-oxlint-rule
description: >-
  Create or revise a centrally maintained rule in @timmo001/oxlint-rules. Use
  for requests to add an Oxlint anti-slop rule, change an existing central
  rule, or promote a repository-specific lint preference into the shared
  package.
license: Apache-2.0
# origin: https://github.com/timmo001/oxlint-rules/tree/main/skills/add-oxlint-rule
# upstream-sha: af714b10bca8730e882212ec45c908eabc658d90
---

# Add An Oxlint Rule

1. Treat the current repository as fixture context, not automatically as the
   central package checkout.
2. Search available writable checkouts by their Git remote for
   `timmo001/oxlint-rules`. If none exists, ask where the user wants to clone or
   fork it. Do not assume the user can write to the upstream account.
3. Read the central repository guidance, relevant plugin registration, config,
   nearby rules, tests, and README rule list.
4. Define the narrow syntax contract. Add at least one failing fixture and one
   valid fixture before implementing the rule.
5. Put generic upstream-independent rules under the appropriate locally owned
   plugin. Never modify `vendor/anti-slop`; propose an upstream contribution
   separately when Dylan Mulroy's plugin should own the behaviour.
6. Register the rule in its plugin and matching config, then update the README
   rule list and behaviour description.
7. Run `mise run check`, `mise run build`, `npm pack --dry-run`, and
   `bunx jsr@0.14.3 publish --dry-run` in the central checkout.

Report the fixture contract, registration and docs changed, checks, and any
consumer rollout left for a separate stage. Do not publish or assume a local
machine path.

---
name: ask-questions-if-underspecified
description: Ask minimal clarifying questions only when ambiguity materially changes implementation. Use for routine underspecification; do not use for user-requested light or full grilling, plan stress-testing, or broad design interviews.
license: CC-BY-SA-4.0
# origin: https://github.com/trailofbits/skills/tree/main/plugins/ask-questions-if-underspecified/skills/ask-questions-if-underspecified
# upstream-sha: 3742e65294dfccc78f0e8c730a4290850cc54691
# local-edits:
#   - description rewritten for brevity and narrowed away from light/full grill-style questioning
#   - body condensed from detailed template-based process to a concise cross-client workflow
#   - added recommended-choice ordering and light/full grilling routing
#   - removed verbose question templates and reply format examples
#   - retained the concise cross-client skill after its Claude-specific upstream was deleted
---

# Ask Questions If Underspecified

Use this skill when a request has multiple plausible implementations and picking the wrong one would cause rework, risk, or incorrect outcomes. This skill is intentionally narrow: it should unblock work with the fewest questions possible.

## When to Use

- Key details are unclear: objective, done criteria, scope, constraints, environment, or safety
- Multiple reasonable interpretations would lead to materially different work
- You cannot resolve ambiguity with quick, read-only discovery

## When NOT to Use

- The request is clear enough to proceed safely
- A quick repo read (files/config/docs) can answer the unknowns
- Repo conventions provide a safe default and ambiguity is low impact
- The user wants light or full grilling or plan stress-testing; use `grilling` or `/grill` instead

## Rules

1. Ask the minimum needed to unblock work (prefer one targeted question).
2. Use the client's structured question capability when available; otherwise ask one concise question in chat.
3. Put recommended/default choices first and tag them with `(Recommended)`.
4. Do all non-blocked, low-risk discovery first.
5. Until must-have answers arrive, do not edit files or run state-changing commands.
6. If the user asks to proceed without answers, state assumptions briefly and continue with safest defaults.
7. Never turn this into a multi-round design interview unless the user explicitly invokes `/grill` or asks to be grilled.

## Workflow

1. Run quick discovery (read-only) to remove guesswork.
2. Identify only must-have unknowns that change implementation direction.
3. Ask 1-3 concise questions max in the first pass.
4. Prefer multiple-choice options over open-ended prompts.
5. Include a low-friction fallback, e.g. `Use recommended defaults`.
6. After answers, restate requirements in 1-3 sentences and proceed.

## Must-Have Clarification Areas

- Objective: what should change and what should stay the same
- Definition of done: acceptance criteria, examples, edge cases
- Scope: what is in/out
- Constraints: compatibility, performance, style, dependency limits
- Environment: runtime/tooling versions when relevant
- Safety: migration, rollback, irreversible actions

## Anti-Patterns

- Asking questions answerable via quick discovery
- Asking broad/open questions when options would be clearer
- Running a light or full grilling session under this skill instead of `/grill`
- Asking permission for routine safe steps
- Blocking on nice-to-know details that can use project defaults
- Asking users to reply with numbered text when the client can capture structured choices

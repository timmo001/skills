---
name: chill
license: Apache-2.0
description: Stop overengineering and reinventing the wheel. Use when the user says a change has become overly complicated, out of scope, or is rebuilding something an existing tool or library already does.
---

# Chill

Load and apply `evidence-first` and `changeset-scope` before reassessing the approach.

Reassess the current approach and choose the smallest ordinary solution that meets the stated requirement.

Prefer existing code, dependencies, platform features, and established project patterns over new abstractions or custom machinery. Remove speculative flexibility, premature generalisation, unnecessary helpers, and work not required now.

Preserve complexity that is justified by concrete constraints, correctness, or evidence. Briefly state the simpler approach, then follow it if implementation was requested. Do not use simplification as a reason to discard requirements or widen the task.

If all the changes are required for the scope the user asked for, suggest splitting them into stages with `gh-stack` or handoffs, depending on the size of the change.

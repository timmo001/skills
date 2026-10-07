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

If the changes is all.required for the scope the user asked for, suggest splitting into stages, either by using gh stack or handoff(s), depending on the amount of change.

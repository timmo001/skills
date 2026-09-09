---
name: browser-access
license: Apache-2.0
description: Decide whether browser access is needed and keep authorised checks narrow. Use for frontend or UI diagnosis, before proposing or using Browser Control, Chrome DevTools, or equivalent browser automation, and when the user explicitly requests browser interaction.
---

# Browser Access

Browser tools require an explicit user request or agreement to a specific check.
This includes listing tabs and taking snapshots. A URL, UI bug, named service,
available tool, or loaded browser skill does not grant permission.

## 1. Gather The Right Evidence

- If the user explicitly requested browser interaction, proceed within that
  request. Do not ask them to authorise the same action again.
- For ordinary investigations, start with focused source and configuration reads,
  logs, existing tests, configured CLI/API access, or existing SSH routes. Choose
  the tool from the requested action and the evidence needed.
- A frontend or service mention does not imply opening its web UI. Use the
  existing non-browser access when it answers the question.
- Do not ask to use the browser at the start of an ordinary investigation.

Continue without browser access when the gathered evidence is sufficient.

## 2. Establish A Specific Need

If non-browser evidence establishes a real blocker or a fix that needs browser
validation, explain:

- What remains unknown.
- Why the existing access cannot answer it.
- The smallest browser check needed and its target.

Ask through the question tool when available and wait for agreement before any
browser tool call. Loading a browser skill or debugging entrypoint does not
replace this permission step.

## 3. Run Only The Agreed Check

- Apply the chosen browser driver's skill or current documentation for tool
  mechanics. Prefer Chrome DevTools for browser diagnostics; use Browser Control
  when it fits the requested interaction.
- Keep work on the agreed task and target. Reuse gathered evidence rather than
  repeating navigation, snapshots, polling, or broad audits.
- Gather only the page state, console messages, or network requests needed for
  the specific issue. When reloading through Chrome DevTools, bypass the cache
  unless the user explicitly wants cached behaviour.
- Use Lighthouse or performance traces only when needed for the authorised audit
  or performance investigation.
- If a materially different check becomes necessary, explain it and obtain
  agreement before widening the browser work.

Stop when the required question is answered. Report the result and any remaining
uncertainty without extending the session into an unrelated audit.

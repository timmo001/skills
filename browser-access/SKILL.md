---
name: browser-access
license: Apache-2.0
description: Decide whether browser access is needed and keep authorised checks narrow. Use for frontend or UI diagnosis, before proposing or using browse, OpenCode's built-in browser or other browser automation, and when the user explicitly requests browser interaction.
---

# Browser Access

Browser tools require an explicit user request or agreement to a specific check. This includes listing tabs and taking snapshots. A URL, UI bug, named service, available tool, or loaded browser skill does not grant permission.

## 1. Gather The Right Evidence

- If the user explicitly requested browser interaction, proceed within that request. Do not ask them to authorise the same action again.
- For ordinary investigations, start with focused source and configuration reads, logs, existing tests, configured CLI/API access, or existing SSH routes. Choose the tool from the requested action and the evidence needed.
- A frontend or service mention does not imply opening its web UI. Use the existing non-browser access when it answers the question.
- Do not ask to use the browser at the start of an ordinary investigation.

Continue without browser access when the gathered evidence is sufficient.

## 2. Establish A Specific Need

If non-browser evidence establishes a real blocker or a fix that needs browser validation, explain:

- What remains unknown.
- Why the existing access cannot answer it.
- The smallest browser check needed and its target.

Ask as `asking-questions` describes and wait for agreement before any browser tool call. Loading a browser skill or debugging entrypoint does not replace this permission step.

When the check would show something the user may want to see or keep, ask it as a `:::question-multi` that offers the check alongside the evidence that fits it: a screenshot, before and after screenshots, a screencast of the interaction, or the console or network output. The user ticks the check plus any captures they want.

## 3. Run Only The Agreed Check

- Use the browse MCP first: the `browse` Code Mode namespace, available in the OpenCode TUI and any other harness that loads the browse server. It drives the user's own Chrome-family browser through the browse extension, with their logins and tabs: work only in tabs you opened, never close or navigate theirs, and reset or delete your session when the check is done.
- In the OpenCode desktop app, OpenCode's built-in browser is also available as the `browser` Code Mode namespace. Use it there when browse is missing or the user asks for it; the TUI doesn't have it.
- Apply the tool's own instructions or current documentation for its mechanics. Use the one the user names when they name one.
- If neither namespace is available, ask the user to enable one and wait. Do not work around it with the Playwright MCP, a hand-written headless browser or scripted CDP access.
- Keep work on the agreed task and target. Reuse gathered evidence rather than repeating navigation, snapshots, polling, or broad audits.
- Gather only the page state, console messages, or network requests needed for the specific issue. When reloading, bypass the cache unless the user explicitly wants cached behaviour.
- Use Lighthouse or performance traces only when needed for the authorised audit or performance investigation.
- If a materially different check becomes necessary, explain it and obtain agreement before widening the browser work.

Stop when the required question is answered. Report the result and any remaining uncertainty without extending the session into an unrelated audit.

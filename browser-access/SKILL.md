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

Continue without browser access when the gathered evidence is sufficient.

## 2. Establish A Specific Need

If non-browser evidence establishes a real blocker or a fix that needs browser validation, explain:

- What remains unknown.
- Why the existing access cannot answer it.
- The smallest browser check needed and its target.

Ask as `asking-questions` describes and wait for agreement before any browser tool call. Loading a browser skill or debugging entrypoint does not replace this permission step.

When the check would show something the user may want to see or keep, ask it as a `:::question-multi` that offers the check alongside the evidence that fits it: a screenshot, before and after screenshots, a screencast of the interaction, or the console or network output. The user ticks the check plus any captures they want.

## 3. Run Only The Agreed Check

- Use the browse MCP first: the `browse` Code Mode namespace, available in the OpenCode TUI and any other harness that loads the browse server. It drives the user's own Chrome-family browser through the browse extension, with their logins and tabs: work only in tabs you opened, never close or navigate theirs. Give the tabs you open a `group` label named for the task.
- Close what you open as soon as you're done with it: close your group's tabs (`tabs` with action `close` and your `group`) the moment the check or recording finishes, and also when you stop to wait on the user; open new ones when you carry on. Don't leave agent windows or tabs lingering for the idle timeout to catch: it's only a backstop.
- Never close or move a browser window by force. A window can hold more than your tabs: the user may have opened a tab in it, or dragged one in. Close your tabs first, then check: if the window has gone, it held only your tabs; if it's still there, it holds something else, so leave it where the user can see it.
- Run every browse session headless where the machine has an agent screen (`dot agent screen`), so nothing opens over the user's work:
  1. Run `dot agent screen on` before opening your first tab. New browse windows then land on its holding screen, off every real monitor and without taking focus.
  2. Straight after your first `navigate`, run `dot agent screen claim`. It moves your window to a desk of your own, a headless screen no other session uses, and prints which. browse puts every session's tabs in one window, though, so while another session is browsing, your tabs open in its window and `claim` says which desk you share. Then work only in your own tabs and keep your checks short, as only one tab in a window draws at a time; don't turn on `keepVisible` there.
  3. Work there. The user watches through translucent corner views, one per busy screen, and switches them to tiled windows, full screen or nothing with `dot agent screen view` (Super + Alt + A); leave that choice to them.
  4. When you're done, close your tabs, check with `dot agent screen status` that your desk is empty, and run `dot agent screen release` (only if `claim` gave you a desk of your own). Run `dot agent screen off` only when no other session holds a desk. Both refuse while windows are left, since those would move onto a real monitor.
- Without an agent screen, work in the agent window where the user can watch, and don't move it onto another monitor or over their work without asking.
- In the OpenCode desktop app, OpenCode's built-in browser is also available as the `browser` Code Mode namespace. Use it there when browse is missing or the user asks for it; the TUI doesn't have it.
- Apply the tool's own instructions or current documentation for its mechanics. Use the one the user names when they name one.
- If neither namespace is available, ask the user to enable one and wait. Do not work around it with the Playwright MCP, a hand-written headless browser or scripted CDP access.
- Keep to the agreed task and target: gather only the page state, console messages or network requests it needs, and reuse what you have rather than repeating navigation or snapshots. When reloading, bypass the cache unless the user explicitly wants cached behaviour.
- If a materially different check becomes necessary, explain it and obtain agreement before widening the browser work.

## 4. Capture At A Fixed Size

When screenshots or recordings need a set page size, such as 1400 × 800 for pull requests, or a phone width:

- Set it on your tab with browse's `emulate` (`viewport: { width, height }`, with `mobile` and `touch` for a phone). It stays until you reset it, and screenshots and `recording` use it. Reset it (`viewport: "reset"`) before you close the tab.
- Check the size the page really has, not only the capture: read `[innerWidth, innerHeight]` with `eval` after `emulate`, and adjust until it matches. The same `emulate` values can give a different page size on another desk or scale, and a capture scaled to the right size can hide a page laid out wider.
- Change nothing about the tab's size or rendering while a `recording` runs: no `screenshot`, `emulate` or zoom. Each one redraws the page at another size for a moment, and the video shows it as the page jumping. Take stills before you start, after you stop, or from the recording's own frames.
- Don't resize or move browser windows to get a size, and never loop screenshots under a forced size to fake a bigger capture: a visible window redraws between the sizes and flickers.
- Chrome only draws a window that is on screen. On a hidden workspace or behind a minimised window, a recording gets a frame every few seconds. An agent screen's desks always draw.
- Scripts added with CDP's `Page.addScriptToEvaluateOnNewDocument` stay on the tab after the `execute` that added them, and run again on every load, so stacked copies pile up. Keep the `identifier` it returns and remove the script with `Page.removeScriptToEvaluateOnNewDocument` in a `finally`, in the same call.
- Take screenshots from the same frames when you can (the first and last frames of a recording), so stills and videos match exactly.

Stop when the required question is answered. Report the result and any remaining uncertainty without extending the session into an unrelated audit.

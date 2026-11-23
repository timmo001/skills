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

- Use the browse MCP first: the `browse` Code Mode namespace, available in the OpenCode TUI and any other harness that loads the browse server. It drives the user's own Chrome-family browser through the browse extension, with their logins and tabs: work only in tabs you opened, never close or navigate theirs.
- Close what you open as soon as you're done with it. Delete your session (`session_delete`), which closes its tabs, the moment the check or recording finishes, and also when you stop to wait on the user; open a new one when you carry on. Delete any empty or finished session `session_list` shows. Don't leave agent windows or tabs lingering for the idle timeout to catch: it's only a backstop, and the browse console stays in the browser either way.
- Never close or move a browser window by force. A window can hold more than your tabs: the user may have opened a tab in it, or dragged one in. Close your session first, then check: if the window has gone, it held only your tabs; if it's still there, it holds something else, so leave it where the user can see it.
- Work where the user can watch, in the agent window on their current workspace, unless the check needs a fixed size (see below).
- In the OpenCode desktop app, OpenCode's built-in browser is also available as the `browser` Code Mode namespace. Use it there when browse is missing or the user asks for it; the TUI doesn't have it.
- Apply the tool's own instructions or current documentation for its mechanics. Use the one the user names when they name one.
- If neither namespace is available, ask the user to enable one and wait. Do not work around it with the Playwright MCP, a hand-written headless browser or scripted CDP access.
- Keep work on the agreed task and target. Reuse gathered evidence rather than repeating navigation, snapshots, polling, or broad audits.
- Gather only the page state, console messages, or network requests needed for the specific issue. When reloading, bypass the cache unless the user explicitly wants cached behaviour.
- Use Lighthouse or performance traces only when needed for the authorised audit or performance investigation.
- If a materially different check becomes necessary, explain it and obtain agreement before widening the browser work.

## 4. Capture At A Fixed Size

When screenshots or recordings need a set page size, such as 1400 × 800 for pull requests, size the window, not the page:

- browse's `recording` tool captures the tab at its window's real size. A size forced with `page.setViewportSize` or CDP's `Emulation.setDeviceMetricsOverride` only lasts for one `execute`, and the recording shrinks that page into the real window. Never loop screenshots under a forced size to fake a bigger capture: the visible window redraws between the two sizes every frame and flickers.
- Chrome only draws a window that is on screen. On a hidden workspace or behind a minimised window, a recording gets a frame every few seconds.
- Where the machine has it, record on the agent screen: `dot agent screen on` adds a headless Hyprland output that draws like a monitor but shows on no real screen, and prints its workspace. Move the agent window onto that workspace, record, then close your session, check the window has gone, and run `dot agent screen off` (it refuses while anything is still on it). While it's on, the user sees it as a translucent corner view that clicks pass through, and switches to full screen, a tiled window or nothing with `dot agent screen view` (Super + Alt + A); leave that choice to them. Without it, ask the user where a visible window may sit; don't put it on another monitor or over their work without asking.
- Set browse's `window` setting to `separate` (the `settings` tool) so agent tabs get a window of their own, then float that window and resize it until the page's `innerWidth` and `innerHeight` match. Measure after each resize: browser zoom differs per site, and with display scale it changes how window size maps to page size. A new agent window opens on the user's focused workspace, so move it straight away.
- On Hyprland, move the window with System Bridge's `hyprland_move_window` and float it with `hyprland_set_window`. Resize it with a `hyprctl` dispatch: Hyprland with a Lua config takes Lua dispatches, such as `hl.dsp.window.resize({ x = 1200, y = 750, relative = false, window = "address:0x…" })`. Check where the window ended up after each move: the Lua `hl.dsp.window.move` dispatch can report success without moving it.
- Scripts added with CDP's `Page.addScriptToEvaluateOnNewDocument` stay on the tab after the `execute` that added them, and run again on every load, so stacked copies pile up. Keep the `identifier` it returns and remove the script with `Page.removeScriptToEvaluateOnNewDocument` in a `finally`, in the same call.
- Take screenshots from the same frames when you can (the first and last frames of a recording), so stills and videos match exactly.

Stop when the required question is answered. Report the result and any remaining uncertainty without extending the session into an unrelated audit.

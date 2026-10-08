---
name: pitchfork-dev-servers
license: Apache-2.0
compatibility: Requires Pitchfork CLI or MCP access and repository daemon configuration. Repositories without pitchfork may fall back to a framework-native background mode.
description: Manage long-running local dev servers by precedence - the project's own AGENTS.md workflow first, pitchfork next, then a framework-native background mode where a repo has no pitchfork config - and set them up to a standard with stable https://<daemon>.<project>.localhost addresses. Use when starting, stopping, restarting, checking, or tailing development servers, background servers, pitchfork MCP tools, or local AGENTS/mise tasks that mention pitchfork; when adding or changing a `pitchfork.toml`; or when a dev server's port clashes or its proxy URL doesn't resolve.
---

# Pitchfork Dev Servers

Use this skill when a task involves starting or managing a long-running local server and the repo provides `pitchfork.toml`, local tasks, MCP tooling, or AGENTS guidance mentioning pitchfork. When adding or changing a repo's `pitchfork.toml`, its `serve:*` tasks, or its AGENTS dev-server section, read [references/hosting-standard.md](references/hosting-standard.md) first.

Follow the project's own declared workflow first, then pitchfork, then a framework-native background mode when the repo has no pitchfork config, then foreground for explicit debugging.

## Preflight

1. Read local `AGENTS.md` first, especially a `## Background Dev Servers` section. Local repo guidance wins over this global skill.
2. Check for repo-provided pitchfork wrappers: `mise tasks`, `pitchfork.toml`, or project-specific task names such as `serve:*`, `dev:*`, `background:*`, or aliases documented locally.
3. Check whether pitchfork MCP tools are available for observation and control: `pitchfork_status`, `pitchfork_logs`, `pitchfork_stop`, `pitchfork_restart`, `pitchfork_start`.
4. Check whether the `pitchfork` CLI is installed before falling back to raw foreground server commands.
5. Only when the repo has no pitchfork config, check for a framework-native background mode (for example Astro 7+, which self-detaches `astro dev` under an agent).

## Rules

1. Follow the project's declared workflow first. Read local `AGENTS.md`, project skills, and repo tasks; local guidance wins. Do not invent a naming convention when the repo has one.
2. Use pitchfork when the repo ships `pitchfork.toml` or pitchfork-backed tasks. Prefer `serve:*` tasks over foreground `run:*`, `dev`, or raw server commands.
3. Use a framework-native background mode only in repos without pitchfork config. It has no stable proxy address, so suggest moving the server onto pitchfork when the address matters.
4. Use foreground commands only for explicit foreground debugging, one-shot checks, or when the declared workflow is unavailable.
5. Do not assume MCP `pitchfork_start` can start per-repo daemons from any cwd. If start fails with no matching daemon, run the repo's local pitchfork-backed task from that repo directory.
6. Use pitchfork MCP status, logs, restart, and stop tools when available once a daemon exists. Otherwise use the matching CLI commands.
7. When wrappers stop production resource owners, avoid replacing them with broad process kills. Prefer resource-targeted commands like `fuser <port>/tcp` or `fuser <socket>`.
8. OpenCode's `pitchfork-dev-server-guard` plugin enforces the pitchfork tier: in repos that declare `pitchfork.toml` it redirects known foreground dev-server commands, including `astro dev`, `blume dev` and `mise run <name>:dev`, to `serve:*` or `pitchfork start` and notes the change.

## Command Discovery

1. Read local `AGENTS.md` first for the repo's preferred dev-server commands.
2. Use `mise tasks` when the command name is not obvious.
3. If there is no wrapper task but `pitchfork.toml` exists, run pitchfork directly from the repo directory.
4. Typical operations are `pitchfork start <daemon>`, `pitchfork status`, `pitchfork logs -t <daemon>`, `pitchfork restart <daemon>`, and `pitchfork stop <daemon>`.
5. Start every server a task needs in one call (`pitchfork start api worker`, or `--group <name>`) rather than one at a time. Each returns once ready; prefer the daemon's `--port`, `--http` or `--output` readiness check over a fixed `--delay`.
6. Treat `serve:*` as a common local convention, not a requirement.
7. Find a running server's address with `pitchfork proxy status` rather than guessing a port. When the proxy is enabled, use the `https://<daemon>.<project>.localhost` address without a port. If it only works with the proxy's own port, run `pitchfork proxy doctor` and report the result rather than switching to the raw port.

## Notes

- Some repos use pitchfork wrappers to stop production services or resource owners before starting dev servers, then restore production when dev exits. Preserve that behaviour.
- Pitchfork is intended to keep agents from blocking on foreground servers. Prefer background start plus logs and status checks over running a server in the agent shell.

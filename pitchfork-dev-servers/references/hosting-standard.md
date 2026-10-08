# Hosting standard

How to set up a repository's own dev servers so each one has a stable HTTPS address and never clashes with another repository's. Use it when adding or changing a `pitchfork.toml`. This is a starting shape and may be outdated, so check `pitchfork --help` and the [configuration reference](https://pitchfork.jdx.dev/reference/configuration.html) for the installed version.

## Quick start

```toml
# pitchfork.toml
[daemons.server]
run = 'APP_DB="${XDG_STATE_HOME:-$HOME/.local/state}/myapp/dev.db" exec bun run --watch src/index.ts serve --port "$PORT"'
port = { expect = [7172], bump = 10 }
ready_cmd = 'curl -fsS "http://127.0.0.1:$PORT/api/health"'
health_cmd = 'curl -fsS "http://127.0.0.1:$PORT/api/health"'
retry = true

[daemons.web]
run = 'exec bunx vite --port "$PORT" --strictPort'
port = { expect = [7180], bump = 10 }
ready_cmd = 'curl -fsS "http://127.0.0.1:$PORT/"'
depends = ["server"]
env = { API_ORIGIN = "http://127.0.0.1:{{ daemons.server.port }}" }
retry = true
```

```toml
# mise.toml: the same five tasks for each daemon
[tasks."serve:server"]
description = "Start the local server in the background through pitchfork"
run = "pitchfork start server"

[tasks."serve:server:status"]
run = "pitchfork status server"

[tasks."serve:server:logs"]
run = "pitchfork logs -t server"

[tasks."serve:server:restart"]
run = "pitchfork restart server"

[tasks."serve:server:stop"]
run = "pitchfork stop server"
```

With the proxy enabled, these are `https://server.myapp.localhost` and `https://web.myapp.localhost`, whatever ports they get.

## The rules

- **One daemon per server, named by role** (`server`, `web`, `docs`). The proxy builds the hostname as `<daemon>.<project>.localhost`, with the project taken from the directory name. A linked worktree adds its own label, so worktrees don't clash either.
- **Never fix the port.** Give every served daemon `port = { expect = [N], bump = 10 }`, pass `$PORT` to the command, and make the server fail rather than pick its own port (`--strictPort` for Vite). Only daemons with a `port` get a proxy address. Pick an `expect` that's distinct across your repositories, away from framework defaults such as 4321, 5173 and 3000.
- **Check the daemon's own port.** `ready_cmd`, `health_cmd` and `ready_http` must use `$PORT`. A hard-coded port passes against whatever else is on it.
- **Reach dependencies through pitchfork.** Use `depends` and pass `{{ daemons.<name>.port }}` in `env`, instead of a hard-coded origin.
- **Keep dev state separate.** Use its own database, socket or data directory under `$XDG_STATE_HOME` or `$XDG_RUNTIME_DIR`, and unset environment that points at a real instance.
- **`retry = true`** for servers that should come back after a crash.
- **mise tasks** `serve:<daemon>` and `:status`, `:logs`, `:restart` and `:stop` for each daemon. Don't add a second name for the same thing.
- **Servers that detach themselves.** Run the server in the foreground so pitchfork tracks it. Astro 7+ detaches `astro dev` when it detects an agent, and the supervisor can inherit that environment, so pass `--ignore-lock` (`exec bunx astro dev --ignore-lock --host 127.0.0.1 --port "$PORT"`). Check `pitchfork status` shows it running after start; a daemon that stops straight away while the site still answers has detached.

## AGENTS.md

Add a `## Background Dev Servers` section that says:

- Start servers with the `serve:*` tasks, never in the foreground.
- List each server's address, `https://<daemon>.<project>.localhost`, and test through it in the browser and with curl.
- Never add the proxy's own port (such as `:8443`). If pitchfork prints one, the redirect from 443 is missing: run `pitchfork proxy doctor`, then `pitchfork proxy setup`. Use `127.0.0.1:<port>` from `pitchfork status` only when the proxy is off.

## Exceptions

Use these only when the standard can't fit, and say why in a comment.

- **A fixed port or socket is required**, for example a dev server that stands in for an installed service. Give it `port = <N>` with no bump, for an address. Pitchfork refuses to start a daemon whose port is taken, so stop the real service in a `oneshot` daemon listed in `depends`, and bring it back from an `on_exit` hook. Hooks run after the daemon exits and outside its process group; on a restart the hook fires after the next start has begun, so skip the restore when `pitchfork status "$PITCHFORK_DAEMON_ID"` shows it running.
- **A repository you can't commit to.** Register it in the global config (`~/.config/pitchfork/config.toml`) as `[namespaces.<name>]` with `dir` and a `config` file kept outside the repository. The project label becomes the namespace name.
- **An HTTPS page that has to reach a plain HTTP server**, or a server that rejects the proxy's `Host` and `X-Forwarded-*` headers. Run a forwarder that drops those headers (`dot http-forward` where it's installed) as a daemon with a `port`, and point the page at its address.
- **Per-run arguments.** Pitchfork doesn't pass the caller's environment to a daemon, so write the arguments to a state file and have `run` read them.

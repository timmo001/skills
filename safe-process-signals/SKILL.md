---
name: safe-process-signals
license: Apache-2.0
compatibility: Linux process inspection and signal tools. Examples use procps pgrep/pidwait, psmisc pstree, and coreutils timeout. The optional PID-safe escalation example requires util-linux kill with --timeout.
description: >
  Safe process killing and signal handling for agent/subprocess contexts. Use when running pkill, killall, kill, or any process termination command from a shell subprocess, automated script, or coding agent.
---

# Safe Process Signals

Prevent agent self-termination, unrelated process kills, and indefinite waits. Follow the steps in order: inspect, select, signal, wait, verify. A successful signal request is not proof of exit.

## 1. Choose The Lifecycle Owner

Prefer the service manager or tool that owns the process. Use its stop/restart operation and inspect its resulting state. This preserves process-group cleanup and restart policy instead of fighting an automatic supervisor.

For an Omarchy-managed app, use its lifecycle command:

```bash
omarchy restart terminal
```

Use direct signals only when the lifecycle owner cannot perform the requested operation or the task specifically requires them. Check installed help before using the examples below; shell built-ins and external tools have different options.

## 2. Inspect And Select Targets

Start with an owned task's PID or inspect candidates. A name match alone does not establish that a process belongs to this task.

```bash
# Candidate discovery only: excludes ancestors and restricts to this user.
pgrep -a -A -u "$(id -u)" -f '[n]ode.*server\.js'
```

Read the output and select only the intended instance. No match means inspect its lifecycle state, not broaden the pattern. Multiple matches require inspecting each candidate before choosing. Do not pipe discovery output straight into `kill`.

In the following examples, set `$pid` to the verified numeric PID greater than 1. Never substitute an empty value, `0`, `-1`, or a negative process-group selector.

```bash
ps -p "$pid" -o pid,ppid,pgid,sid,lstart,user,stat,args
readlink -- "/proc/$pid/exe"
pstree -sp "$$"
```

Confirm the executable, command line, user, start time, parent, and service/session ownership. Compare against the invoking shell's ancestry. Reject the agent, its shell, ancestors, and unrelated instances. If ownership is unclear, stop before signalling.

Record the inspected identity and recheck it immediately before signalling, especially after a delay or a new tool call. If the process disappeared or the identity changed, do not send a signal to that PID. A PID file must pass the same numeric and identity checks; never feed its contents straight to `kill`.

### Pattern Matching Limits

- procps `pgrep`, `pkill`, and `pidwait` exclude themselves. Their invoking shell and other ancestors can still match `-f` patterns.
- A bracket pattern such as `[n]ode` avoids matching the literal pattern in a shell command. It does not protect ancestors whose actual command line contains `node`.
- `-A` / `--ignore-ancestors` excludes ancestors when supported. It does not exclude unrelated processes with the same name.
- `-x` matches an exact name or command line, not one process. It does not establish ownership or exclude ancestors by itself.
- Use `pkill` or `killall` only when every selected instance belongs to the requested operation. Prefer the inspected PID for a single-instance task; a later pattern match can include newly started processes.
- Avoid broad `killall -r` patterns. `killall -e` handles ambiguous long names; it is not a general guarantee of one exact target.

## 3. Choose And Send The Signal

| Signal | Use case |
| --- | --- |
| `SIGTERM` | Normal graceful shutdown; use first unless the application documents another shutdown signal. |
| `SIGINT` | Interrupt an interactive program that expects this signal. It does not reproduce every terminal Ctrl+C process-group effect. |
| `SIGKILL` | Forced termination after graceful shutdown fails; the process cannot clean up. |
| `SIGHUP` | Reload only when documented by the application; otherwise it may terminate. |

After the identity check, request graceful termination of that PID:

```bash
kill -TERM -- "$pid"
```

On failure, inspect the error and current process state. A missing process may already have exited; a permission error is not success. Do not suppress failures with `2>/dev/null || true` or automatically elevate privileges.

## 4. Wait And Verify

Use the lifecycle owner's completion event when available. For a directly signalled PID, use a bounded wait, choosing a timeout appropriate to the application's documented shutdown time:

```bash
timeout 5s pidwait --pid "$pid"
```

Interpret the result before proceeding:

- `0`: the selected process was waited for. Confirm the intended service/session is stopped, including any owned children relevant to the task.
- `1`: no process was matched or waited for. Inspect with the same `ps` command; an absent original process can mean it exited before the wait started. Do not call an inspection failure a confirmed exit.
- `124`: the wait timed out. Inspect identity and state again before deciding whether escalation is appropriate.
- Other non-zero results: report the tool, permission, or runtime failure. Do not infer that the target stopped.

`kill -0` tests existence/permission, not completed shutdown. A zombie or uninterruptible process needs state inspection, not repeated signals. `killall --wait` can wait indefinitely; `timeout` bounds a wait but does not make target selection safe.

## 5. Escalate Only For The Same Instance

If graceful shutdown timed out, confirm the same executable, start time, and ownership are still present. Escalate only when forced termination is warranted for the requested operation. Do not rerun a broad name pattern with `-9`.

When a bounded TERM-to-KILL sequence is appropriate, util-linux `kill --timeout` uses a PID file descriptor so its follow-up signal cannot hit a replacement process that reused the PID:

```bash
# Check the external binary, not the shell's kill built-in.
/usr/bin/kill --help
# Only after target verification and a decision that forced escalation is warranted:
/usr/bin/kill --verbose --timeout 5000 KILL --signal TERM -- "$pid"
```

The follow-up is sent only if that process still exists. This protects the delayed signal, not the initial target selection. Run the bounded exit verification afterwards; the command's success alone does not prove shutdown.

If that implementation is unavailable, do not replace it with `kill; sleep; kill -9` and claim the same PID-reuse protection. Use the lifecycle owner or re-inspect the surviving instance before a separate signal, recognising the remaining check-to-signal race. Never target a process group without verifying that every member belongs to the task and none hosts the agent.

## Report

State which instance was targeted, which lifecycle operation or signals were used, and the observed exit result. Report surviving children, supervisor restarts, permission failures, or timeout limits when they affect the requested result.

Sources for exact options and exit statuses: installed `pgrep(1)` (including `pidwait`), util-linux `kill(1)`, `killall(1)`, and `timeout(1)`.

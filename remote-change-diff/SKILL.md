---
name: remote-change-diff
license: Apache-2.0
compatibility: Requires Git for the scratch repository. Uses Plannotator, through its `plannotator` agent tool or CLI, for the diff review and the Plannotator Inbox for the report when available; works with whatever reads the target system (an API CLI such as ha-bridge, SSH, a web API, a database client).
description: Record and report a before-and-after diff of changes made to live systems outside a Git checkout, such as Home Assistant through ha-bridge, a server over SSH, a router, a container, a database or a cloud API. Use before changing configuration, settings or state on a remote or live system, and when the user asks to see what was changed there; snapshots each target before changing it, reads it back afterwards, and hands over a reviewable diff with a rollback path.
---

# Remote Change Diff

Changes made through an API, a shell on another host or a web console leave no Git history. Keep one in a scratch repository so the user can review exactly what changed, comment on it and roll it back, the same way as a code change.

Skip this for read-only work, and for changes that land in a Git checkout: those go through the normal review, such as `change-review-handoff`.

## 1. Start A Scratch Repository

Make one per task, outside any real repository, before the first change. In OpenCode use `/tmp/opencode/remote-changes/<date>-<slug>`.

```bash
git init -q <dir>
git -C <dir> commit -q --allow-empty -m "Start"
```

Run every Git command against the scratch repository as `git -C <dir> ...` with the full path, as written in this skill. These commits never leave the scratch repository, so a permission config can allow exactly these forms for that directory without allowing real commits.

Lay files out by system, then by what they are, with names the user would recognise: `home-assistant/automations/washing_machine_is_done.yaml`, `nas/etc/nginx/sites-enabled/default`, `router/firewall-rules.txt`.

## 2. Snapshot Each Target Before Changing It

Before the first change to each target, read it from the live system and commit just that file:

```bash
git -C <dir> add <path>
git -C <dir> commit -q -m "Before: <target>" -- <path>
```

- Read it with the same command you will use for the "after" read, in a stable text form: the tool's YAML or JSON output, `ssh host cat <path>`, `systemctl cat <unit>`, `crontab -l`, a `SELECT` with an `ORDER BY`. Reconstructing the config afterwards from earlier output is error-prone.
- Record state that isn't a file as sorted `key: value` lines in one text file per kind, for example `home-assistant/entity-registry.txt` with `sensor.x_cpu_percent: disabled by integration`, or `nas/services.txt` with `nginx: enabled, active`. Capture only the items you are about to touch.
- Something you are about to create has no "before". Something you are about to delete still needs one.
- Redact secrets (tokens, passwords, keys, private addresses where the user would mind) as you write them, with a fixed placeholder such as `<redacted>` so both sides still match.

## 3. Make The Change, Then Read It Back

After each change, read the target back from the live system with the same command and overwrite the file. Don't copy in the file you sent: the read-back shows what the system actually stored, including its own formatting and validation, and is the proof the change applied.

- New files: `git -C <dir> add -N <path>` so they show in the diff.
- Deleted targets: remove the file.
- Leave the "after" side uncommitted until the user approves it. The working tree against the commits is the diff.

If a read-back differs from what you meant to apply, say so; that is a finding, not noise.

## 4. Hand It Over

1. Check the diff yourself first: `git -C <dir> diff --stat` and `git -C <dir> diff`. Every hunk should be a change you meant, with no unredacted secrets.
2. Open it for review: the `plannotator` tool's `review` action with `target` set to the scratch directory (or `plannotator review` run there). The user gets line comments and approval as for code.
3. Write the diff to a patch file beside the scratch directory, numbered per round, `git -C <dir> diff --output=<dir>-<n>.diff`. It is the record to refer back to later without the review tool, so write it every time, however small the change, and don't overwrite an earlier round's file.
4. Report it, in the Inbox when available and in chat: a link to the review, the patch file attached (and its path), the targets changed with line counts, a short `diff` block of the main hunks, and anything you could not snapshot (say why). Don't paste a long diff; the attachment carries it.
5. Ask what happens next as a `:::question-multi`, fitted to the change:
   - Keep it as it is.
   - Roll some or all of it back. The committed "before" files are the restore source, applied with the same tool that made the change.
   - Carry it into where the config is meant to live, when the system is managed from a repository (dotfiles, infrastructure code), so the next deploy doesn't undo it.

Feedback on the review works as for code: make the change on the live system, read it back into the same file, rewrite that round's patch file, and reopen the review.

## After Approval

Once the user approves a round, or chooses to keep it, commit its "after" side so the next round's review shows only the new change:

```bash
git -C <dir> add -A
git -C <dir> commit -q -m "After: <what changed>"
```

The full history stays in the scratch repository. When the user asks for the whole task's changes in one diff, combine them: for each target, diff its first "Before" commit against the current state, `git -C <dir> diff <before-commit> -- <path>`, or concatenate the round patch files.

## Rolling Back

`git -C <dir> show <before-commit>:<path>` prints a target's "before"; for a round still awaiting approval that is `HEAD:<path>`. Apply it through the system's own tool, then read the target back again and confirm it matches. A target that was created has no "before"; delete it instead.

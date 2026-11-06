---
name: remote-change-diff
license: Apache-2.0
compatibility: Requires Git for the scratch repository. Uses Plannotator, through its `plannotator` agent tool or CLI, for the diff review and the Plannotator Inbox for the report when available; works with whatever reads the target system (an API CLI such as ha-bridge, SSH, a web API, a database client).
description: Show a proposed change to a live system outside Git as a diff for approval before applying it, then snapshot, apply, read back and keep a rollback record. Use before every write to an external server, service or device, such as Home Assistant automations, scripts, helpers, entity or device settings (ha-bridge or the API), device web APIs like WLED or ESPHome, servers over SSH, containers, databases or cloud APIs, and when asked what was changed there. Not for calling actions that only operate devices, such as turning a light on.
---

# Remote Change Diff

Changes made through an API, a shell on another host or a web console leave no Git history. Keep one in a scratch repository so the user can approve exactly what will change before it happens, then review what the system stored and roll it back, the same way as a code change.

Use it for every write to the configuration or settings of an external system, however small, including a single setting on one device. Skip it for read-only work, for calling actions that only operate devices (turning a light on, running a script, pressing a button), and for changes that land in a Git checkout: those go through the normal review, such as `change-review-handoff`.

A request to make a change ("set X", "make an automation that...") authorises the change, not skipping its review. Skip the proposal round only when the user says so for this change.

## 1. Start A Scratch Repository

Make one per task, outside any real repository, before the first change. In OpenCode use `/tmp/opencode/remote-changes/<date>-<slug>`.

```bash
git init -q <dir>
git -C <dir> commit -q --allow-empty -m "Start"
```

Run every Git command against the scratch repository as `git -C <dir> ...` with the full path, as written in this skill. These commits never leave the scratch repository, so a permission config can allow exactly these forms for that directory without allowing real commits.

Lay files out by system, then by what they are, with names the user would recognise: `home-assistant/automations/washing_machine_is_done.yaml`, `wled/office.json`, `nas/etc/nginx/sites-enabled/default`, `router/firewall-rules.txt`.

## 2. Snapshot Each Target Before Changing It

Before proposing a change to each target, read it from the live system and commit just that file:

```bash
git -C <dir> add <path>
git -C <dir> commit -q -m "Before: <target>" -- <path>
```

- Read it with the same command you will use for the "after" read, in a stable text form: the tool's YAML or JSON output, `ssh host cat <path>`, `systemctl cat <unit>`, `crontab -l`, a `SELECT` with an `ORDER BY`. Write Home Assistant automations and scripts as YAML, the form the user edits them in. Reconstructing the config afterwards from earlier output is error-prone.
- Record state that isn't a file as sorted `key: value` lines in one text file per kind, for example `home-assistant/entity-registry.txt` with `sensor.x_cpu_percent: disabled by integration`, or `wled/tx-power.txt` with `office (192.168.1.92): 8.5 dBm`. Capture only the items you are about to touch.
- Something you are about to create has no "before". Something you are about to delete still needs one.
- Redact secrets (tokens, passwords, keys, private addresses where the user would mind) as you write them, with a fixed placeholder such as `<redacted>` so both sides still match.

## 3. Propose The Change And Wait For Approval

Write the intended "after" into the working tree, without touching the live system:

- Edit the snapshotted files to what you mean to apply. New files: `git -C <dir> add -N <path>` so they show in the diff. Deleted targets: remove the file.
- Validate it first where the system can check without applying, such as ha-bridge `validate_entity_config` for automations and scripts.
- Check the diff yourself (`git -C <dir> diff`): every hunk should be a change you mean, with no unredacted secrets.
- Write the patch file for this round beside the scratch directory, `git -C <dir> diff --output=<dir>-<n>.diff`, numbered per round and never overwritten.
- Open it as a gated review: the `plannotator` tool's `review` action with `target` set to the scratch directory and `gate: true` (or `plannotator review` run there). Report it in the Inbox when available and in chat with a link, the patch file, the targets with a short summary of the main hunks, and a `Stopped:` line, then end the turn.

Apply nothing until the user approves. Feedback means revising the working tree, rewriting that round's patch file and reopening the review.

## 4. Apply, Then Read It Back

Apply the approved change with the system's own tool. Then read every target back from the live system with the same command as the snapshot and overwrite the file. Don't keep the file you proposed: the read-back shows what the system actually stored, including its own formatting and validation, and is the proof the change applied.

If the read-back differs from the approved proposal, show `git -C <dir> diff` against what was approved and say so; that is a finding, not noise. Some systems apply asynchronously (a config reload, a device reboot): read again once it has settled before calling it different.

## 5. Report And Commit

Report the result, in the Inbox when available and in chat: the targets changed, that the read-back matched (or how it differed), and how to roll back. Then commit the "after" side so the next round shows only the new change:

```bash
git -C <dir> add -A
git -C <dir> commit -q -m "After: <what changed>"
```

When the system is managed from a repository (dotfiles, infrastructure code), offer to carry the change there so the next deploy doesn't undo it.

The full history stays in the scratch repository. When the user asks for the whole task's changes in one diff, combine them: for each target, diff its first "Before" commit against the current state, `git -C <dir> diff <before-commit> -- <path>`, or concatenate the round patch files.

## Rolling Back

`git -C <dir> show <before-commit>:<path>` prints a target's "before". Apply it through the system's own tool, then read the target back again and confirm it matches. A target that was created has no "before"; delete it instead.

When asked what changed on a system in an earlier task, start from that task's scratch repository and patch files.

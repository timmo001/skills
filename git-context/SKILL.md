---
name: git-context
license: Apache-2.0
compatibility: Requires Git, the context-cli skill for repository snapshots, dotfiles Git helpers, and GitHub CLI for their workflows. Amendments use dot git-commit.
description: Patterns for working with git branches, remotes, diffs against the default branch, and rebases. Use when resolving rebase conflicts, continuing interactive rebases, amending commits, or any git operation that would open an interactive editor.
---

# Git Context Patterns

Use this skill when working with branches, remotes, or comparing changes.

## Repository context

For branch, working-tree, commit, diff and pull request context, including PR checks, reviews and comments, load `context-cli` and use `context git`. That skill owns the options and output handling. Use `--branch-diff` for the diff against the default branch; the commits section lists the branch's commits.

`context` reads the local `<remote>/HEAD` without fetching. When the comparison must reflect the current remote, run `git-default-ref` first: it verifies and fetches the default branch.

## Default branch helpers

Prefer the installed helpers over rebuilding default-branch operations with ad-hoc shell commands:

- `git-default-ref` is the guarded resolver used by all helpers. It prefers `upstream`, falls back to `origin`, verifies local `<remote>/HEAD` against the advertised default, and fetches it. A missing or mismatched ref requires human confirmation; under `dot is-agent` or without a TTY it fails instead of prompting.
- `git-switch-default` (`gsd`) switches to the resolved default branch and fast-forwards it.
- `git-rebase-default` (`grd`) rebases the checked-out branch onto the resolved default with `--autostash`.
- `gra` prints a status message and runs `git rebase --abort`.

These commands are stowed from `scripts/.local/bin/`; the aliases are defined in `zsh/.zshrc`.

## Rebases and Interactive Editor Operations

Git opens an interactive editor for many operations. Since the agent runs in a non-interactive shell, bypass the editor with `GIT_EDITOR=true` (which makes the "editor" succeed immediately, accepting defaults).

### Commands that need `GIT_EDITOR=true`

```bash
GIT_EDITOR=true git rebase --continue   # After resolving conflicts
GIT_EDITOR=true git merge --continue    # After resolving merge conflicts
GIT_EDITOR=true git revert --continue   # After resolving revert conflicts
```

For any requested commit amendment, load `dot-git-commit` and use its `dot git-commit --amend` gateway flow instead of raw `git commit --amend`.

### Resolving rebase conflicts

1. Read each conflicted file and understand both sides.
2. When both sides are additive (independent features touching the same location), keep both.
3. After replacing conflict markers, verify full method/function bodies are intact — shared code between conflict markers is easily lost if not carefully included in the resolution.
4. Stage resolved files with `git add`.
5. Continue with `GIT_EDITOR=true git rebase --continue`.

### Operations that do NOT need the editor bypass

- `git rebase --abort` / `git merge --abort` (no editor involved)
- `git rebase --skip` (no editor involved)

Ordinary commits are outside this skill. Load `dot-git-commit` after an explicit commit request and use its gateway.

## Splitting a branch by changed files

Use this when a branch is too large and needs to be split into stacked branches with predictable file counts.

- Preferred helper script: `git-split-branch-by-files`
- Location: `~/.local/bin/git-split-branch-by-files`
- Naming: always `<source-branch>-b1`, `<source-branch>-b2`, and so on

Default behavior:

- Splits against `origin/HEAD` (fallback `dev`, `main`, then `master`)
- Creates 5 branches by default
- Makes the first 4 branches equal in changed-file count by default (`--equal-up-to 4`)
- Puts any remainder into the tail branches

Typical commands:

```bash
# Preview only
git-split-branch-by-files --source <branch> --base <base> --branches 5 --equal-up-to 4 --dry-run

# Recreate output branches if they already exist
git-split-branch-by-files --source <branch> --base <base> --branches 5 --equal-up-to 4 --force
```

Safety notes:

- Requires a clean worktree for real execution.
- Uses stacked output branches where each next branch is based on the previous split branch.

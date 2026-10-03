# Skills

Reusable agent skills used across my development workflows. The repository follows the [Agent Skills specification](https://agentskills.io/specification), with each skill kept as a self-contained top-level directory.

The list of skills (name and description) lives in the generated [`SKILLS.md`](./SKILLS.md#skills-catalogue) catalogue.

Some skills are broadly portable. Others intentionally depend on a particular tool, repository, or local workflow. See [`PORTABILITY.md`](./PORTABILITY.md) before installing the full collection.

## Install

The repository toolchain pins Bun 1.4.0, Effect 4, and the Skills CLI through
mise. Install dependencies and build the standalone maintenance executable:

```bash
mise install
bun install --frozen-lockfile
bun run build
```

List the available skills:

```bash
mise exec npm:skills -- skills add timmo001/skills --list
```

Install selected skills for any supported agent:

```bash
mise exec npm:skills -- skills add timmo001/skills
```

Install or update non-interactively:

```bash
mise exec npm:skills -- skills add timmo001/skills --skill code-review --skill diagnose -g -y
mise exec npm:skills -- skills update -g -y
```

The [`skills`](https://github.com/vercel-labs/skills) CLI handles agent-specific locations for OpenCode, Claude Code, Codex, Cursor, and other Agent Skills clients. Commands use `mise exec npm:skills -- skills` to select the managed CLI unambiguously because other tools may bundle a path named `skills`. Generated agent mirrors are ignored and must not be kept inside this checkout.

Claude Code is supported through the same cross-agent installer. This repository does not add client-specific marketplace packaging or duplicate canonical skill content.

## Consumer repositories

Repositories listed in [`consumers.yml`](./consumers.yml) keep project copies of the skills listed for them, so contributors get those skills without installing them. Skills committed here install from the published commit the sync runs from. External imports install from their origin at the reviewed `upstreamSha` in `imports.json`, so a reviewed update reaches consumers on the next sync; unlicensed imports cannot be shared. Copies go to `.agents/skills/` only. The sync needs a clean checkout whose `HEAD` is pushed, which the timer's dot-managed checkout always is. `consumers add` shares skills with a repository and `consumers remove` stops sharing them, each committing the change. Both use the current directory's GitHub repository unless `--repo` is given. `add` only accepts new repositories that are public, owned by the source's owner, and not archived. Removing a repository's last skill, or `remove --all`, deletes its copies and pushes that straight away, then drops its entry, since the sync no longer visits it.

```bash
./dist/skill-maintenance consumers add [--repo <owner/repo>] <skill>...
./dist/skill-maintenance consumers remove [--repo <owner/repo>] [--all] [<skill>...]
./dist/skill-maintenance consumers --dry-run
./dist/skill-maintenance consumers
```

Each repository is cloned into a temporary directory. Newly listed skills are added, unedited copies are updated or removed to match the list, and the result is pushed to the default branch as one commit. A copy edited in the consumer no longer matches its `skills-lock.json` hash, so it is reported and left alone.

## Layout

```text
<name>/
├── SKILL.md
├── agents/       # optional client metadata
├── references/   # optional supporting material
├── scripts/      # optional deterministic helpers
└── assets/       # optional resources
```

`SKILL.md` is the source of truth. Keep supporting files one link away from it and use relative paths within a skill.

Unchanged upstream skills are `external` imports: `imports.json` records their origin and pinned SHA, but their content is not committed here. Install them with:

```bash
./dist/skill-maintenance install --target ~/.agents/skills
```

The installer copies each external skill at its pinned SHA, records what it owns in `.external-skills.json` in the target, skips names already used by a linked local skill, and removes skills that are no longer external imports.

## Validate

```bash
bun run validate
./dist/skill-maintenance validate
mise exec npm:skills -- skills add . --list
```

The local validator checks the portable metadata contract, directory names, relative links, `skills.sh.json` / `PORTABILITY.md` coverage, and drift of the generated [`SKILLS.md`](./SKILLS.md#skills-catalogue) catalogue. TypeScript checks use Effect-aware Oxlint rules from `@timmo001/oxlint-rules/configs/recommended-effect`. CI also verifies the independent installer discovery result.

Imports are checked daily and after skill changes merge to `main`. Adapted imports are reported for manual review; unchanged upstream snapshots receive automated update pull requests.

The shared update entrypoint runs in either environment:

```bash
./dist/skill-maintenance updates-agent github --skills-dir /path/to/skills
./dist/skill-maintenance updates-agent device --config /path/to/skill-updates-agent.yml
./dist/skill-maintenance updates-agent device --config /path/to/skill-updates-agent.yml --run-id 123456
```

GitHub Actions builds this repository's executable and uses its `github` mode for scheduled checks, clean update pull requests, validation dispatches, and dashboard refreshes. A local device uses `device` mode to invoke its configured OpenCode processor.

### Cross-device coordination

Device runners share `refs/heads/automation/skill-update-state` in `timmo001/skills`, using the existing `gh` authentication with Contents write access. The first call creates this branch through the Git API. Its commit messages hold versioned JSON containing an opaque claim token, run ID, start time and all completed run IDs. No machine paths, hostnames or private configuration are stored there.

Each state change creates a commit whose only parent is the observed state head, then requests a [fast-forward-only ref update](https://docs.github.com/en/rest/git/refs#update-a-reference). Concurrent candidates are siblings, so only one can win. A single claim covers all device runs, including different workflow IDs. Success records the completed run and clears its claim in the same atomic transition, after repository, PR policy and dashboard checks. Older completed runs stay recorded when newer runs finish.

Failed ref writes are reconciled against the candidate SHA before retrying. Transient failures get at most three attempts with the same candidate; uncertain ownership stops processing. Shared state read failures also stop processing. Local `flock` still serialises a device, and `stateFile` remains a local completion cache; it cannot bypass shared coordination. Old local markers are not automatically imported into shared history.

The runner releases a claim for retry when it can show the run published nothing: preparation failed before any model ran, or every model attempt failed, each session was interrupted and waited for, the repositories are clean on their default branches and no pull request was opened. Any other failure, interruption or crash retains the claim because the OpenCode session or partially published changes may survive the CLI.

A retained claim goes stale 50 minutes after it started, longer than a scheduled device run can last and shorter than the hourly schedule. The next device run replaces a stale claim with its own in the same non-forced transition, leaving the old run unprocessed so it is retried; updates that already have an open pull request are skipped, so published work is not repeated. While a claim is still fresh, other device runs defer with status 2 instead of failing.

The claim token is printed on acquisition and in busy messages. To release a claim before it goes stale:

1. Stop the owning device runner and its OpenCode session. Confirm neither can resume, then inspect partial changes, PRs and repository cleanup.
2. Use `retry` to allow another attempt, or `processed` only after confirming the run's work and cleanup are complete:

   ```bash
   ./dist/skill-maintenance updates-agent recover --claim <token> --outcome retry --confirm-stopped
   ./dist/skill-maintenance updates-agent recover --claim <token> --outcome processed --confirm-stopped
   ```

Recovery requires the current token and uses the same non-forced transition. A stale release cannot clear a replacement claim. Never delete, reset, force-update or merge the state branch: its history is the coordination record. Update all device runners together before resuming automation; older binaries do not participate in this protocol. Review previously completed local runs when first adopting shared history. No new external service or private configuration field is required.

Device configuration requires `opencodePermissions`, a non-empty array of OpenCode V2 `{ action, resource, effect }` rules using `allow` or `deny`. Keep machine-specific paths and command selections in that configuration. The runner prepends default-deny, then appends the selected agent's resolved explicit denials so job allowances cannot override them. Use `~/` for home-relative read, edit and external-directory resources; shell patterns are literal command text.

If a configured checkout has uncommitted changes or is off its default branch, the runner defers before claiming the workflow run and exits with status 2, which service monitors can treat as a warning. The next run tries again.

The runner also defers with status 2 when another local run holds the lock, or when GitHub stays unreachable for about a minute, which covers runs started at resume before Wi-Fi reconnects.

Before starting a model, the runner fast-forwards the primary repository and builds the update report. If every pending update already has an open pull request whose `imports.json` change sets the current upstream SHA, it skips the model and records the run as processed. Skills whose upstream no longer exists count as nothing to do; errors and invalid origins still start the model.

After a model run passes the pull request policy, the runner appends an "Agent run" section to each pull request that run opened. It lists every attempt's model and variant (without the provider), result, time, cost and token counts from the OpenCode session, so models can be compared. Failing to add it is logged and does not fail the run.

Each model attempt checks `service status` and requires the default OpenCode V2 server to be running. All subsequent CLI commands pin that address with `--server`: resolve the agent at the repository location, create a fresh session through `api post /api/session`, read back its ordered permissions and location, then use `run --session <id> --auto`. No standalone server is started. This uses OpenCode 2.0.3's session permission contract through the CLI, without an SDK or direct HTTP client. Missing or changed permissions stop the attempt before prompting. Configured command wrappers apply to setup calls as well as the model run. Shell allowlists are not a filesystem sandbox, and MCP rules cannot restrict arguments or call counts. See the [V2 permissions reference](https://opencode.ai/v2/docs/permissions/).

The runner obtains the existing server password with `service get password` and passes it through `OPENCODE_PASSWORD`, not command arguments. The password stays redacted in the Effect workflow.

Effect generates Bash, Fish, and Zsh completions directly from the command specification:

```bash
./dist/skill-maintenance --completions bash
./dist/skill-maintenance --completions fish
./dist/skill-maintenance --completions zsh
```

Renovate manages the pinned mise tools and GitHub Actions. The scheduled import
checker manages reviewed upstream skill revisions separately.

## Maintenance

- Add new skills under `<name>/` at the repository root.
- Classify each new skill in `skills.sh.json` and `PORTABILITY.md`, then regenerate the human catalogue with `mise run catalogue` (or `./dist/skill-maintenance catalogue`) and commit `SKILLS.md`.
- Commit imported skills only when this repository contains substantive local edits. Mark unchanged imports `external`; only their origin and pinned SHA are committed.
- Maintain import provenance, reviewed SHA, licence, local edits, and distribution mode in `imports.json`.
- Use `./dist/skill-maintenance import <name>` to generate a complete upstream comparison. For an external import it compares the pinned and latest upstream revisions, and `--apply` moves the pin. Adapted changes remain manual. The importer rejects an adapted skill that exactly matches every file in its source; mark it external instead.
- Keep `skills.sh.json`, `PORTABILITY.md`, and `SKILLS.md` in sync.
- Prefer repository revisions for installed copies. The scheduled checker reports adapted imports for manual review and opens pull requests for unchanged upstream updates.
- Do not duplicate canonical skills into checked-in agent-specific directories.

The current portability backlog is intentionally documented rather than mechanically rewriting all existing skills in one migration.

# Portability

This inventory classifies the current skills by what must be present for their instructions to work. It is a migration guide, not a quality ranking.

Skills with concrete prerequisites declare the optional [Agent Skills compatibility field](https://agentskills.io/specification#compatibility-field) as a 1–500 character string. Branch-specific tools are labelled as such; general language and engineering guidance needs no field merely to repeat its subject. External imports retain upstream frontmatter and need compatibility additions at their source. This metadata does not install dependencies or grant tool permissions.

## Portable

These skills use general engineering concepts and ordinary agent capabilities. They should work across Agent Skills clients with only normal tool-name translation.

| Skill | Notes |
| --- | --- |
| `asking-questions` | Uses structured questions when available and falls back to chat; always explains in chat first. |
| `bro` | Reusable explicit-invocation response behaviour. |
| `browser-access` | General evidence and permission workflow; uses the chosen browser driver's skill or documentation for tool mechanics. |
| `changeset-scope` | No repository-specific dependency. |
| `chill` | Explicit-invocation workflow. |
| `cleanup-unnecessary-variables` | General code guidance. |
| `code-review` | General review workflow with optional delegation. |
| `diagnose` | General diagnosis workflow with optional client metadata. |
| `effect-principles` | General engineering guidance. |
| `evidence-first` | General evidence and decision guidance. |
| `grilling` | General round-based decision protocol. |
| `human-step-guide` | General workflow guidance. |
| `lit-rendering` | Requires Lit in the target project. |
| `maintain-docs` | Uses ordinary repository and documentation tools. |
| `plan` | General planning workflow. |
| `remove-single-use-functions` | General code guidance. |
| `research` | Capability-based primary-source research workflow. |
| `show-me` | Uses ordinary text diagrams and an optional HTML artefact. |
| `skill-prefixes` | General Agent Skills naming guidance. |
| `staged-implementation` | General implementation sequencing. |
| `testing` | General test-selection and verification policy based on concrete regression value. |
| `to-questionnaire` | General channel-aware questionnaire drafting. |
| `types-enforce-ts` | Requires TypeScript in the target project. |
| `writing-dot-skills` | General Agent Skills authoring guidance. |
| `writing-style` | General writing guidance. |

## Environment-Bound

These are agent-agnostic in format, but their workflows or specific branches depend on a named tool, service, or target repository.

| Skill | Required environment |
| --- | --- |
| `agentic-workflows` | GitHub `gh aw` extension and Agentic Workflows. |
| `browser-control` | Browser Control relay, extension, and CLI or MCP tools. |
| `decision-models` | A decision model provider: local Ollaya (CLI, MCP server or HTTP API), or hosted Cloudflare Clef via the Cloudflare API MCP server or authenticated Workers AI API access, billed per input token beyond the free daily allocation. |
| `gh-stack` | GitHub `gh stack` extension. |
| `github-development-rulesets` | Authenticated GitHub CLI, jq, Bash, and ruleset write access for mutations. Includes the Development JSON baseline for creation. |
| `github-repository-setup` | Authenticated GitHub CLI, Git, jq, and repository creation/settings write access. Encodes preferred personal repository defaults, discovers workflow examples from the authenticated account, and uses the owner-selected shared source, including `timmo001/workflows` for the personal Renovate caller. Delegates reusable workflows and post-push rulesets to `shared-workflows` and `github-development-rulesets`. |
| `herdr-workflows` | Herdr, its CLI environment, and the external `herdr` skill. |
| `home-assistant-frontend` | Home Assistant frontend checkout and its local guidance. |
| `home-assistant-lazy-context` | Home Assistant frontend source and conventions. |
| `home-assistant-list-components` | Home Assistant frontend source and components. |
| `home-assistant-lit-rendering` | Home Assistant frontend and Lit. |
| `opencode-effect` | OpenCode V2 plus mutually compatible plugin, client, SDK, and Effect package contracts. |
| `pitchfork-dev-servers` | Project-declared dev-server runtime and tasks; Pitchfork and daemon configuration only for the fallback tier. |
| `pkexec-root` | Linux with polkit/pkexec; pacman or yay for Arch package operations, sudo as fallback. |
| `release-oxlint-rules` | Writable central Oxlint rules checkout, mise, Bun, npm, and registry access; authenticated GitHub CLI and release access for publication. |
| `safe-process-signals` | Linux shell process tools, including pgrep, pkill, killall, and timeout. |
| `shared-workflows` | Authenticated GitHub access and consumer and owner-selected shared GitHub Actions workflow source, including pinned historical revisions. |
| `wrangler` | Project-local Wrangler dependency, supported Node.js runtime, and Cloudflare authentication for remote operations. |

## Workflow-Bound

These encode the current OpenCode, dotfiles, notes, or maintainer workflow. Compatibility metadata documents those requirements; it does not make the workflows portable.

| Skill | Portability work needed |
| --- | --- |
| `branch-context-consumer` | Decouple from BranchContextPlugin injection. |
| `check-skill-updates` | Consumer updates use mise and the Skills CLI; repository reviews depend on the built skill-maintenance CLI, imports.json, Git, and authenticated GitHub CLI. |
| `git-context` | Uses the `context-cli` skill for repository snapshots, BranchContextPlugin for required injections, and dotfiles Git helpers. |
| `handoff` | Uses `notes-cli` for repository-note storage and cleanup. |
| `import-external-skill` | Depends on this repository's imports.json and built skill-maintenance CLI, Git, mise, Skills CLI, authenticated GitHub CLI, and upstream access. |
| `retro` | Reads other sessions through the OpenCode 2 CLI and routes findings to the dot-managed skills, dotfiles, and private overlay repositories. |
| `session-coordination` | Herdr-managed sessions or explicitly requested native child sessions; uses host background completion notifications when available. |
| `task-focus` | Uses BTW or fresh sessions, context usage when available, and Herdr-managed workspaces/worktrees through the separately installed `herdr` skill. |

## Follow-Up

Migrate one coherent family at a time:

1. Split reusable behaviour from personal wrappers in git, notes, and handoff skills.
2. Replace runtime-specific tool names with capability descriptions plus small client adapters where needed.
3. Keep `compatibility` metadata aligned with owning workflows; request external-import additions upstream and check target-client discovery when fields change.
4. Commit imported skills only when they contain documented local edits. Mark unchanged imports `external` in `imports.json`; `skill-maintenance install` installs them from their origin at the pinned SHA.
5. Use `imports.json` as the maintenance metadata overlay for adapted imports.
6. Build `dist/skill-maintenance` and use `./dist/skill-maintenance import <name>` to fetch and compare upstream content before manually reviewing an adapted skill. This requires Bun 1.4.0 and the locked Effect 4 dependencies, but makes no dotfiles assumptions.

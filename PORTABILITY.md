# Portability

This inventory classifies the current skills by what must be present for their instructions to work. It is a migration guide, not a quality ranking.

## Portable

These skills use general engineering concepts and ordinary agent capabilities. They should work across Agent Skills clients with only normal tool-name translation.

| Skill | Notes |
| --- | --- |
| `ask-questions-if-underspecified` | Uses structured questions when available and falls back to chat. |
| `bro` | Reusable explicit-invocation response behaviour. |
| `changeset-scope` | No repository-specific dependency. |
| `chill` | Explicit-invocation workflow. |
| `check-skill-updates` | Uses standard consumer updates and repository provenance comments. |
| `cleanup-unnecessary-variables` | General code guidance. |
| `code-review` | Benefits from subagents but does not require a named runtime. |
| `codebase-design` | General architecture guidance. |
| `css-motion-systems` | Web platform guidance with colocated references. |
| `diagnose` | General diagnosis workflow with optional client metadata. |
| `domain-modeling` | General modelling workflow. |
| `effect-principles` | General engineering guidance. |
| `evidence-first` | General evidence and decision guidance. |
| `grilling` | General round-based decision protocol. |
| `html` | General web platform guidance. |
| `human-step-guide` | General workflow guidance. |
| `improve-codebase-architecture` | General architecture workflow with a colocated report template. |
| `import-external-skill` | Uses the Agent Skills format and repository metadata. |
| `lit-rendering` | Requires Lit in the target project. |
| `maintain-docs` | Uses ordinary repository and documentation tools. |
| `plan` | General planning workflow. |
| `remove-single-use-functions` | General code guidance. |
| `research` | Capability-based primary-source research workflow. |
| `staged-implementation` | General implementation sequencing. |
| `to-questionnaire` | General channel-aware questionnaire drafting. |
| `types-enforce-ts` | Requires TypeScript in the target project. |
| `writing-dot-skills` | General Agent Skills authoring guidance. |
| `writing-style` | General writing guidance. |

## Environment-Bound

These are agent-agnostic in format, but useful only when their named tool, service, or target repository is available. Their dependencies should eventually be made explicit with portable `compatibility` metadata where practical.

| Skill | Required environment |
| --- | --- |
| `agentic-workflows` | GitHub `gh aw` extension and Agentic Workflows. |
| `browser-control` | Browser Control relay, extension, and CLI or MCP tools. |
| `gh-stack` | GitHub `gh stack` extension. |
| `herdr-workflows` | Herdr, its CLI environment, and the separately installed upstream `herdr` skill. |
| `home-assistant-frontend` | Home Assistant frontend checkout and its local guidance. |
| `home-assistant-lazy-context` | Home Assistant frontend source and conventions. |
| `home-assistant-list-components` | Home Assistant frontend source and components. |
| `home-assistant-lit-rendering` | Home Assistant frontend and Lit. |
| `pitchfork-dev-servers` | Pitchfork and repository-provided server configuration. |
| `pkexec-root` | Linux, `pkexec`, and the configured root helper. |
| `safe-process-signals` | POSIX process tools. |
| `shared-workflows` | The `timmo001/workflows` conventions. |

## Workflow-Bound

These encode the current OpenCode, dotfiles, notes, or maintainer workflow. They remain publicly useful as examples and for this setup, but need deliberate abstraction or documented compatibility requirements before being advertised as portable.

| Skill | Portability work needed |
| --- | --- |
| `branch-context-consumer` | Decouple from BranchContextPlugin injection. |
| `git-commit` | Separate general commit discipline from the `dot git-commit` gateway. |
| `git-context` | Generalise injected context and OpenCode MCP names. |
| `handoff` | Abstract the Notes MCP vault and OpenCode tool names. |
| `install-tool` | Separate general installation policy from personal package manifests and overlays. |
| `workflows-watch` | Decouple from OpenCode background tasks and the local workflow manifest tool. |

## Follow-Up

Migrate one coherent family at a time:

1. Split reusable behaviour from personal wrappers in git, notes, handoff, and installation skills.
2. Replace runtime-specific tool names with capability descriptions plus small client adapters where needed.
3. Add `compatibility` metadata to environment-bound skills after checking how each target client displays it.
4. Distribute imported skills only when they contain documented local edits; keep unchanged review snapshots under `upstream/` and install them from their owning repository.
5. Use `imports.json` as the maintenance metadata overlay for adapted imports.
6. Use `scripts/import_skill.py` to fetch and compare upstream content before manually reviewing an adapted skill.

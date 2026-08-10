# Portability

This inventory classifies the current skills by what must be present for their instructions to work. It is a migration guide, not a quality ranking.

## Portable

These skills use general engineering concepts and ordinary agent capabilities. They should work across Agent Skills clients with only normal tool-name translation.

| Skill | Notes |
| --- | --- |
| `changeset-scope` | No repository-specific dependency. |
| `chill` | Explicit-invocation workflow. |
| `check-skill-updates` | Uses standard consumer updates and repository provenance comments. |
| `cleanup-unnecessary-variables` | General code guidance. |
| `code-review` | Benefits from subagents but does not require a named runtime. |
| `codebase-design` | General architecture guidance. |
| `css-motion-systems` | Web platform guidance with colocated references. |
| `diagnose` | General diagnosis workflow with optional client metadata. |
| `domain-modeling` | General modelling workflow. |
| `effect` | Requires Effect v4 in the target project. |
| `effect-principles` | General engineering guidance. |
| `effect-service-design` | Requires Effect in the target project. |
| `html` | General web platform guidance. |
| `human-step-guide` | General workflow guidance. |
| `improve-codebase-architecture` | General architecture workflow with a colocated report template. |
| `import-external-skill` | Uses the Agent Skills format and repository metadata. |
| `lit-rendering` | Requires Lit in the target project. |
| `maintain-docs` | Uses ordinary repository and documentation tools. |
| `motion-choreography-patterns` | Web platform guidance with colocated references. |
| `plan` | General planning workflow. |
| `prototype` | General prototyping workflow. |
| `remove-single-use-functions` | General code guidance. |
| `staged-implementation` | General implementation sequencing. |
| `types-enforce-ts` | Requires TypeScript in the target project. |
| `writing-style` | General writing guidance. |

## Environment-Bound

These are agent-agnostic in format, but useful only when their named tool, service, or target repository is available. Their dependencies should eventually be made explicit with portable `compatibility` metadata where practical.

| Skill | Required environment |
| --- | --- |
| `agentic-workflows` | GitHub `gh aw` extension and Agentic Workflows. |
| `browser-control` | Browser Control relay, extension, and CLI or MCP tools. |
| `ctx-agent-history-search` | `ctx` CLI and indexed local agent history. |
| `gh-stack` | GitHub `gh stack` extension. |
| `herdr` | A Herdr-managed terminal session. |
| `home-assistant-frontend` | Home Assistant frontend checkout and its local guidance. |
| `home-assistant-lazy-context` | Home Assistant frontend source and conventions. |
| `home-assistant-list-components` | Home Assistant frontend source and components. |
| `home-assistant-lit-rendering` | Home Assistant frontend and Lit. |
| `hunk-review` | A running Hunk review session and CLI. |
| `opentui` | OpenTUI project or dependencies. |
| `pitchfork-dev-servers` | Pitchfork and repository-provided server configuration. |
| `pkexec-root` | Linux, `pkexec`, and the configured root helper. |
| `safe-process-signals` | POSIX process tools. |
| `shared-workflows` | The `timmo001/workflows` conventions. |
| `terminal-control` | `termctrl` and a real PTY. |

## Workflow-Bound

These encode the current OpenCode, dotfiles, notes, or maintainer workflow. They remain publicly useful as examples and for this setup, but need deliberate abstraction or documented compatibility requirements before being advertised as portable.

| Skill | Portability work needed |
| --- | --- |
| `branch-context-consumer` | Decouple from BranchContextPlugin injection. |
| `ask-questions-if-underspecified` | Generalise the explicit OpenCode `question` tool contract. |
| `bro` | Separate explicit command routing from the reusable response behaviour. |
| `dotfiles-stow` | Keep as a clearly personal dotfiles integration or move it to the owning repository. |
| `evidence-first` | Describe interactive questions without relying on one tool name. |
| `git-commit` | Separate general commit discipline from the `dot git-commit` gateway. |
| `git-context` | Generalise injected context and OpenCode MCP names. |
| `grilling` | Isolate OpenCode question-tool adaptation from the reusable round protocol. |
| `handoff` | Abstract the Notes MCP vault and OpenCode tool names. |
| `install-tool` | Separate general installation policy from personal package manifests and overlays. |
| `notes-mcp` | Keep client-prefixed tool aliases out of the portable core. |
| `research` | Generalise OpenCode-specific tool and subagent names. |
| `to-questionnaire` | Generalise the explicit question-tool workflow. |
| `workflows-watch` | Decouple from OpenCode background tasks and the local workflow manifest tool. |
| `writing-dot-skills` | Retarget repository paths, generated docs, stow, and OpenCode validation. |

## Follow-Up

Migrate one coherent family at a time:

1. Split reusable behaviour from personal wrappers in git, notes, handoff, and installation skills.
2. Replace runtime-specific tool names with capability descriptions plus small client adapters where needed.
3. Add `compatibility` metadata to environment-bound skills after checking how each target client displays it.
4. Audit licence provenance for every imported skill before applying any repository-wide licence to skill content.
5. Add native Claude marketplace packaging only after the licence audit and portable-skill migration are complete.
6. Build a repository-owned scheduled import checker before restoring automated upstream update pull requests; it must not call dotfiles' `dot` command.

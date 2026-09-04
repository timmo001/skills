# Skills catalogue

Generated from each top-level skill's `SKILL.md` frontmatter (`name` and `description`) and the groupings in `skills.sh.json`. Do not edit by hand; regenerate with:

```bash
./dist/skill-maintenance catalogue
# or: mise run catalogue
```

This repository currently documents **54** tracked skills. Upstream review snapshots under `upstream/` are not listed here.

## Portable

General engineering and writing skills that work across Agent Skills clients.

| Skill | Description |
| --- | --- |
| [`ask-questions-if-underspecified`](./ask-questions-if-underspecified/) | Ask minimal clarifying questions only when ambiguity materially changes implementation. Use for routine underspecification; do not use for user-requested light or full grilling, plan stress-testing, or broad design interviews. |
| [`bro`](./bro/) | Re-pitch the immediately preceding response with enough context to follow, using plain, concise, unambiguous language. Use ONLY when the user explicitly invokes /bro or says the previous response did not land. |
| [`changeset-scope`](./changeset-scope/) | Keep all scoped code work contained to the user-defined changeset. Use for implementation, fixes, diagnosis, refactoring, cleanup, and review when explicit instructions, named files, diffs, branches, pull requests, or injected work scopes define the boundary. |
| [`chill`](./chill/) | Stop overengineering and reinventing the wheel. Use ONLY when the user explicitly invokes /chill or asks to simplify an approach that has become unnecessarily complex. |
| [`check-skill-updates`](./check-skill-updates/) | Check imported skills for upstream changes and review safe updates. Use when a tracked `# origin:` may have changed or when refreshing installed skills from their source repositories. |
| [`cleanup-unnecessary-variables`](./cleanup-unnecessary-variables/) | Safe removal of unnecessary variables during code review and refactoring. Use when simplifying code, inlining temporary or single-use variables, or removing redundant aliases, while preserving runtime behaviour, evaluation order, and variables kept for readability or debugging. |
| [`code-review`](./code-review/) | Review code changes along two axes - Standards (does it follow the repo's conventions, plus a Fowler code-smell baseline?) and Spec (does it implement what the originating issue or spec asked for?). Use when reviewing a pull request, a branch, work-in-progress changes, or a diff. |
| [`codebase-design`](./codebase-design/) | Shared vocabulary for designing deep modules. Use when the user wants to design or improve a module's interface, find deepening opportunities, decide where a seam goes, make code more testable or AI-navigable, or when another skill needs the deep-module vocabulary. |
| [`css-motion-systems`](./css-motion-systems/) | CSS motion design and implementation for web interfaces. Use when designing or building transitions, animations, `linear()` easing, transform strategy, View Transitions API patterns, motion tokens, or reviewing motion quality and accessibility. |
| [`diagnose`](./diagnose/) | Disciplined workflow for diagnosing bugs - hard bugs, regressions, flaky behavior, and performance issues. Use when behavior is broken, failing, intermittent, or slower than expected and the agent needs a reproducible feedback loop before fixing. |
| [`domain-modeling`](./domain-modeling/) | Build and sharpen a project's domain model. Use when the user wants to pin down domain terminology or a ubiquitous language, challenge or record a design decision, or when another skill needs to maintain the domain model. |
| [`effect-principles`](./effect-principles/) | Apply the Effect way of reasoning in codebases that do not use Effect, in any programming language. Use when editing or reviewing non-Effect code so dependencies, failures, state, boundaries, resources, time, and workflows stay explicit without adding Effect-shaped architecture or broader scope. |
| [`evidence-first`](./evidence-first/) | Check questions and uncertain statements before answering, while following clear user choices and limits. Use in any agent mode when the user asks why or how something works, says things like I think, I remember, or I don't think, asks whether something is correct, requests advice, or gives a firm preference such as I don't want this, reduce the scope, or this is going too far. |
| [`grilling`](./grilling/) | Grill the user about a plan, decision, or idea in dependency-ready rounds. Use when the user wants to stress-test their thinking or uses a grill trigger phrase. |
| [`html`](./html/) | Writes and reviews semantic, accessible HTML and template markup that stays readable and low-noise. Use when creating or refactoring HTML or Svelte templates, cleaning up div soup, choosing better elements, improving form markup, fixing heading or landmark structure, or replacing custom controls with native HTML. |
| [`human-step-guide`](./human-step-guide/) | Prepare a concise guide when progress is blocked by a genuinely human-only action. Use for approvals, physical actions, credential entry, or dashboard steps the agent cannot perform; do not use for work available tools can complete. |
| [`improve-codebase-architecture`](./improve-codebase-architecture/) | Scan a codebase for deepening opportunities, present them as a visual HTML report, then grill through whichever one you pick. |
| [`import-external-skill`](./import-external-skill/) | Import skills from external repositories into this Agent Skills repository. Use when pulling in a public skill, reviewing an external skill set, or adapting upstream content into an existing skill. |
| [`lit-rendering`](./lit-rendering/) | Lit rendering and picker callback-shape guidance for editing and reviewing Lit components. |
| [`maintain-docs`](./maintain-docs/) | Keep documentation current and accurate with recent code changes, across in-code docs (docstrings, annotations, comments), in-repo docs sites, and external docs repositories. Use when asked to update docs, check docs accuracy, keep documentation current, document recent changes, refresh docstrings or annotations, or catch documentation up with the codebase. Matches the codebase's existing documentation density and stops before commit. |
| [`plan`](./plan/) | Produce implementation-ready plans from the current conversation and repository context. Use when entering native plan mode, invoking /plan, or when a task needs concrete implementation sequencing before edits begin; do not use for round-based grilling. |
| [`prototype`](./prototype/) | Build disposable code to answer one design question. Use when the user wants to test whether logic or a state model feels right, or compare materially different UI directions before production implementation. |
| [`remove-single-use-functions`](./remove-single-use-functions/) | Safe inlining and removal of single-use functions during code review and refactoring. Use when a local, non-exported helper has exactly one real call site and inlining preserves behaviour and readability. |
| [`research`](./research/) | Investigate a topic against primary sources and return cited findings, comparing credible maintainer and contributor perspectives when judgement is involved. Use when the user asks why, says show evidence, validate this, or use trusted sources; wants research, docs, API, or spec facts; needs external library or GitHub behaviour verified; compares competing views; or delegates reading legwork to a background agent. |
| [`show-me`](./show-me/) | Explain the current topic with a concise visual such as a tree, diagram, diff, or focused HTML artefact. Use ONLY when the user explicitly asks to see, visualise, diagram, sketch, or be shown the preceding explanation. |
| [`staged-implementation`](./staged-implementation/) | Execute broad changes one coherent, independently verifiable stage at a time. Use when work spans multiple independently reviewable changes, or when contracts, producer-consumer migrations, generated artefacts, or release packaging create an ordered multi-stage rollout; skip small single-purpose changes. |
| [`to-questionnaire`](./to-questionnaire/) | Turn a decision the user cannot answer alone into a channel-aware questionnaire draft for one other person. Use when missing knowledge belongs to a colleague, maintainer, or domain expert and the user needs questions for GitHub, Slack, Discord, or a document. |
| [`types-enforce-ts`](./types-enforce-ts/) | TypeScript type-safety guidance for editing and reviewing `.ts`, `.tsx`, `.mts`, and `.cts` files. |
| [`writing-dot-skills`](./writing-dot-skills/) | Craft for authoring Agent Skills that select reliably and stay lean. Use when creating or revising a skill's description, workflow, references, scripts, or structure. |
| [`writing-style`](./writing-style/) | Write commit messages, PR and issue text, docs (README), code comments, and user-facing strings (notifications, UI labels, toasts, error messages) in the project owner's voice: concise, human, UK English, no em-dashes, no robotic or marketing tone. Use when authoring or editing any of these. Defer to a repo's established house style when it has one; otherwise this sets the default voice. |

## Environment-bound

Skills for named tools, services, and target repositories.

| Skill | Description |
| --- | --- |
| [`agentic-workflows`](./agentic-workflows/) | Design, create, update, debug, audit, or upgrade GitHub Agentic Workflows with the `gh aw` extension. Use when work involves workflow Markdown, compiled `.lock.yml` files, agent engines, MCP tools, safe outputs, or `gh aw` commands. |
| [`browser-control`](./browser-control/) | Control the user's existing Chromium-family browser through the Browser Control extension and local relay with deterministic Playwright. Use when asked to inspect, automate, test, or interact with a visible browser tab; continue an authenticated browser workflow; handle 2FA, passkeys, CAPTCHAs, or payment confirmation; record browser behaviour; or capture an authenticated network flow. |
| [`gh-stack`](./gh-stack/) | Manage stacked branches and pull requests with GitHub's `gh stack` extension. Use when work involves stacked PRs, dependent branches, stack creation, navigation, submission, synchronisation, rebasing, restructuring, linking, or merging. |
| [`herdr-workflows`](./herdr-workflows/) | Apply local safeguards for Herdr session recovery and transferring linked-worktree changes back to a host checkout. Use alongside the herdr skill when diagnosing Herdr socket routing, recovering the default session, or moving, consolidating, or continuing Herdr worktree changes from the main or host checkout. The herdr skill remains authoritative for all Herdr CLI, topology, targeting, lifecycle, and safety behaviour. |
| [`home-assistant-frontend`](./home-assistant-frontend/) | Home Assistant frontend skill routing and personal engineering overlays. Use when editing or reviewing the Home Assistant frontend so repository-local `ha-frontend-*` skills stay authoritative and applicable Lit, TypeScript, cleanup, and HA companion skills are also loaded. |
| [`home-assistant-lazy-context`](./home-assistant-lazy-context/) | Home Assistant frontend lazy-context, memoization, and `hass` removal guidance. Use when migrating Lit components from `hass!: HomeAssistant`, `.hass=${...}`, or broad `hass` access to context slices. |
| [`home-assistant-list-components`](./home-assistant-list-components/) | Home Assistant list component migration and usage guidance. Use when editing ha-list, ha-list-item, ha-md-list, or migrating to ha-list-nav, ha-list-selectable, ha-list-item-button, ha-list-item-option, or ha-list-item-base. |
| [`home-assistant-lit-rendering`](./home-assistant-lit-rendering/) | Home Assistant Lit rendering extensions for HA components and context-aware picker callback shape. |
| [`add-oxlint-rule`](./add-oxlint-rule/) | Create or revise a centrally maintained rule in @timmo001/oxlint-rules. Use for requests to add an Oxlint anti-slop rule, change an existing central rule, or promote a repository-specific lint preference into the shared package. |
| [`install-timmo-oxlint-rules`](./install-timmo-oxlint-rules/) | Install or copy @timmo001/oxlint-rules into a JavaScript or TypeScript repository. Use when adding the shared anti-slop Oxlint config, enabling its Effect rules, or replacing a local anti-slop copy. |
| [`release-oxlint-rules`](./release-oxlint-rules/) | Create and publish a major, minor, or patch release of @timmo001/oxlint-rules. Use when asked to create, cut, prepare, or publish an oxlint-rules release, including its version bump and npm and JSR publication. |
| [`opencode-effect`](./opencode-effect/) | Develop and migrate OpenCode V2 plugins, clients, SDK hosts, and HTTP API integrations. Use for the OpenCode plugin API, `@opencode-ai/client`, `@opencode-ai/sdk`, server API, Effect entrypoints, or V1-to-V2 API migration. |
| [`pitchfork-dev-servers`](./pitchfork-dev-servers/) | Manage long-running local dev servers by precedence - the project's own AGENTS.md workflow first, framework-native background mode next, then pitchfork as the fallback. Use when starting, stopping, restarting, checking, or tailing development servers, background servers, `pitchfork.toml`, pitchfork MCP tools, or local AGENTS/mise tasks that mention pitchfork. |
| [`pkexec-root`](./pkexec-root/) | Use pkexec first for commands that need root directly or indirectly. |
| [`safe-process-signals`](./safe-process-signals/) | Safe process killing and signal handling for agent/subprocess contexts. Use when running pkill, killall, kill, or any process termination command from a shell subprocess, automated script, or coding agent. |
| [`shared-workflows`](./shared-workflows/) | Use, configure, maintain, or create reusable GitHub Actions workflows for personal and organisation repositories. Use when a task mentions shared workflows, reusable workflows, `workflow_call`, cross-repository workflow `uses:`, or the personal workflows repository; do not use for repository-specific or proof-of-concept CI unless evaluating whether it should be shared. |

## Workflow-bound

Skills coupled to the current OpenCode, dotfiles, notes, or maintainer workflow.

| Skill | Description |
| --- | --- |
| [`agent-oxlint`](./agent-oxlint/) | Run the optional advisory Oxlint pass during JavaScript or TypeScript cleanup and slop-reduction work in dot-managed repositories. Use after the repository's own lint workflow; act only on diagnostics intersecting changed diff lines, while the command checks private opt-in and local Oxlint precedence. |
| [`branch-context-consumer`](./branch-context-consumer/) | Consume BranchContextPlugin injections in commands. Use when a command depends on an injected <branch-context> block for its scope. |
| [`git-commit`](./git-commit/) | Commit workflow using the dot git-commit gateway, splitting a reviewed changeset into coherent commits by default. Use only after the user explicitly requests a commit or push, including /commit, /commit-push, or /commit-push-watch. Never infer authorisation for later changes; never run raw git commit. |
| [`git-context`](./git-context/) | Patterns for working with git branches, remotes, diffs against the default branch, and rebases. Use when resolving rebase conflicts, continuing interactive rebases, amending commits, or any git operation that would open an interactive editor. |
| [`handoff`](./handoff/) | Compact the current conversation into a handoff document for another agent to pick up. |
| [`install-tool`](./install-tool/) | Install tools, applications, CLIs, runtimes, and packages. Use when an installation request should prefer mise for development tools, then fall back to pacman or yay for system-integrated software. |
| [`session-coordination`](./session-coordination/) | Coordinate delegated agent sessions with bounded assignments, asynchronous background scheduling, soft concurrency caps, context-window rotation, independent review cycles, and logged cleanup across native child sessions and Herdr-managed agents. Use when managing multiple agents, panes, tabs, branches, stages, or long-running tasks while keeping the coordinating session small. |
| [`workflows-watch`](./workflows-watch/) | Watch GitHub Actions workflows in an experimental background task and return the result. Use when asked to watch checks, wait for workflows, or follow workflow runs without blocking the main agent; diagnose and fix only when the caller explicitly requests fix mode. |

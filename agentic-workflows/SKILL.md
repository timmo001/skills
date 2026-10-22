---
name: agentic-workflows
compatibility: Requires GitHub CLI with the gh aw extension and network access to the official Agentic Workflows documentation.
description: Design, create, update, debug, audit, or upgrade GitHub Agentic Workflows with the `gh aw` extension. Use when work involves workflow Markdown, compiled `.lock.yml` files, agent engines, MCP tools, safe outputs, work queues, or `gh aw` commands.
license: MIT
---

# Agentic Workflows

Use GitHub's `gh aw` extension for agentic workflows written as Markdown and
compiled to GitHub Actions lock files.

## Workflow

1. Read the workflow Markdown, its compiled `.lock.yml`, and
   `.github/aw/instructions.md` when present. Repository instructions override
   general guidance.
2. Check the installed interface with `gh aw --help` and the relevant
   subcommand help.
3. Read only the relevant current documentation or prompt from the official
   [`github/gh-aw`](https://github.com/github/gh-aw) repository. Use its
   `.github/aw/` guidance for the task type instead of guessing syntax:
   - design: `designer.md`
   - create: `create-agentic-workflow.md`
   - campaign workflows: `campaign.md`
   - update: `update-agentic-workflow.md`
   - optimise: `optimize-agentic-workflow.md`
   - diagnose, patch, audit, or actively debug (local-first strategy, evidence
     triage and live gates): `debug-agentic-workflow.md`; before executing
     changed code or starting tools/servers for a local reproduction or dry run,
     also read `debug-security-review.md`
   - analyse existing runs, logs, or recurring failures: `analyzing-runs.md`;
     start general repository-wide debugging or optimisation requests here with
     failure clustering before choosing a workflow
   - AWF model or endpoint 400s, silent cross-family sub-agent failures,
     `model: auto` failures, install-step 404s after a version pin, or
     questions about version fields: go straight to
     `debug-model-engine-misconfiguration.md` before suggesting model changes
   - upgrade: `upgrade-agentic-workflows.md`
   - engine setup: `configure-agentic-engine.md`
   - agent runtime, Docker, Cloud Hypervisor, ARC DinD, self-hosted runners,
     or runtime installation: `agent-runtime-instructions.md` (the gVisor and
     Docker sbx runtimes have been removed)
   - shared workflows or MCP wrappers: `create-shared-agentic-workflow.md`
   - agentic chat: `agentic-chat.md`
   - evaluations and experiments: `evals.md` and `experiments.md`
   - jobs and reusable workflow structure: `jobs.md` and `reuse.md`
   - loops: `loop.md`
   - language-server integration: `lsp.md`
   - Playwright integration: `playwright.md`
   - release workflows: `release-workflow.md`
   - drive-backed workflow memory: `drive-memory.md`
   - experimental append-only event history (`tools.ledger`): `ledger.md`
   - declarative skills or agent plugins: `skills.md`
   - report generation: `report.md`
   - Dependabot manifest updates: `dependabot.md`
   - test coverage analysis: `test-coverage.md`
   - compact Markdown charts: `asciicharts.md`
   - CLI command to MCP tool mapping: `cli-commands.md`
   - workflow architecture and patterns: `patterns.md`
   - Design, deploy, inspect or recover a Git-backed work queue: `work-queue.md`
   - token usage and cost optimisation: `token-optimization.md`
   - long-running multi-agent research: `multi-agent-research.md`
   - OpenTelemetry queries and analysis: `skills/otel-queries/SKILL.md`
   - permissions and output controls: `safe-outputs.md` and
     `workflow-constraints.md`

   When creating, updating, diagnosing or upgrading a workflow that uses
   `tools.work-queue`, also load the official `work-queue.md` guidance after the
   primary prompt. Load deployment guidance, operator references or
   specifications only when the task needs them.

   If a GitHub API, `gh api`, or GitHub MCP download returns HTTP 403 (for
   example a token SAML-authorised for a different organisation), do not retry
   with the same token. Fetch the public file without authentication from
   `https://raw.githubusercontent.com/github/gh-aw/main/<path>`, keeping its
   repository-relative path, and never send a token to that URL. If that also
   fails, report the error rather than continuing without the guidance.

4. Edit the Markdown source, not the generated lock file. Compile with the
   repository's documented command and review the generated diff.
5. Run the narrowest available validation or audit command for the workflow.

## Safety

- Treat workflow permissions, credentials, network access, imported tools,
  MCP servers, and safe outputs as security boundaries.
- Keep permissions and network access at the minimum required for the task.
- Prefer safe-output mechanisms over direct write-capable GitHub tools.
- Never hand-edit generated `.lock.yml` files.
- Do not run, enable, push, or dispatch a workflow without the user's explicit
  authorisation for that action.
- Verify current syntax against the installed extension and official source.
  `gh-aw` evolves quickly, so do not rely on remembered flags.

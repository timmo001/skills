---
name: retro
description: Run a retrospective on one or more agent sessions and propose improvements to the agent's environment, including skills, steering files, automated checks, and tooling. Use ONLY when the user invokes /retro or explicitly asks for a retrospective or a review of past sessions.
compatibility: Reading sessions other than the current one uses the OpenCode 2 CLI (opencode2 session list and export) and jq. Routing findings assumes the dot-managed skills, dotfiles, and private overlay repositories.
license: MIT
# origin: https://github.com/mattpocock/skills/tree/main/skills/engineering/retro
# upstream-sha: a7d038f6bf7f01b516408e95e2fb56e0b338fa6f
# local-edits:
#   - SKILL.md: explicit-only description replaces upstream invocation gating
#   - SKILL.md: writing-dot-skills replaces writing-for-agents
#   - SKILL.md: reads other sessions through opencode2 session export and jq
#   - SKILL.md: added a Skills category for selection, adherence, conflicts, and gaps
#   - SKILL.md: maps checks and standards to Oxlint rules, dot git commit guards, and code-review instead of CODING_STANDARDS.md
#   - SKILL.md: routes findings to owning repositories and stops before edits
#   - SKILL.md: added compatibility metadata for concrete environment requirements
#   - agents/openai.yaml: omitted
---

The user has asked for a **retrospective**. You are suggesting improvements to the coding agent's **environment** to improve future runs. Report findings only; change nothing until the user picks which to apply.

## Steps

1. Load `writing-dot-skills` for how skills and steering files should be written.

2. Read the primary sources for the sessions the user names. Default to the current session, which is already in context. Done when every named session has been read, or you have said which could not be found.
   - `opencode2 session list` shows top-level sessions for the current directory's project, newest first. Run it with `workdir` set to another project to find that project's sessions; Herdr workers and child sessions need their IDs.
   - Export with `opencode2 session export <id> > /tmp/opencode/retro-<id>.json`. Skip `--sanitize`: it redacts the message text you need. Exports are large, so query them with `jq` rather than reading them whole:
     - user messages: `.messages[] | select(.type == "user") | .text`
     - tool calls: `.messages[].content[]? | select(.type == "tool") | {name, status: .state.status, input: .state.input}`
     - skills loaded: the same filter with `select(.name == "skill")`
   - Start from the signals: user corrections and redirections, failed or repeated tool calls, denied permissions, and long searches before a fact was found.

3. Look for candidates for improvement in these categories.

   - **Skills**: did the right skill load, and did the agent follow it? A matching skill that never loaded, or one that loaded for the wrong task, points at its description. A loaded skill whose steps were skipped or misread points at its wording, order, or completion criteria. Two skills, or a skill and `AGENTS.md`, giving conflicting or duplicate guidance is a finding. A workaround the agent repeated across sessions may need a new skill or a new branch in an existing one. _Use when_ the user had to restate guidance a skill already holds, or a skill's instructions were not followed.
   - **Navigation**: how easy was it for the agent to find the right files? Are there hidden dependencies between files? Would a **navigation pointer** make it easier? _Use when_ the session took a long time to find a piece of information.
   - **Automated checks**: are there automated checks that could catch errors the agent made? Linting, typing, tests, filesystem linters? Read the repo's own check command first (its `package.json`/build-tool `lint`/`check` scripts, its CI workflow), so a check that already exists but sits unwired or silently broken is the finding, not a reinvention. A repo with no **guardrail** (no pre-commit hook and no CI job running its lint/typecheck/test command) is itself a finding. _Use when_ the agent made a mistake an automated check could have caught, or the repo has no guardrail at all.
   - **Coding standards**: should review enforce a new rule, or should an existing rule be removed or clarified? Classify the violation first. A **mechanical** one (a fixed syntactic pattern, a banned API, an import shape, a file-location rule) gets a deterministic check: a central Oxlint rule through `add-oxlint-rule` for JavaScript or TypeScript, the repo's own linter, a `dot git commit` guard, a pre-commit hook, or a CI job, whichever is cheapest. Default to building the check over writing the rule. Reserve written standards for genuine **judgement calls** (cross-file consistency, "matches the surrounding style"), placed where review reads them: the `code-review` skill for shared standards, or the repo's own guidance. _Use when_ review failed to catch a mistake.
   - **Global AGENTS.md**: are there any steering instructions that should be moved to a skill, a review standard, or an automated check instead? _Use when_ the AGENTS.md file is particularly large, in the repo or the user's global scope.
   - **Tool economy**: did the agent make expensive tool calls that could be streamlined? Is there any custom tooling (CLIs, MCPs) that is particularly token-inefficient? _Use when_ the agent made an expensive tool call.
   - **No-ops**: look for instructions in steering files or skills that don't modify the agent's behaviour. _Use when_ the steering files are large and unwieldy.
   - **Information access**: look for opportunities to increase the agent's access to information. Teeing dev server logs, read-only access to third-party services. _Use when_ a crucial piece of information was not available to the agent.

4. Route each candidate to the source that owns it, found with `dot-repositories`:
   - shared authored skills: `~/repos/skills`; imported skills change in their origin repository;
   - tool-owned skills: the tool's repository under `.agents/skills/`;
   - reusable setup and public OpenCode config: `~/.config/dotfiles`;
   - global guidance and machine-specific or private data: `~/.config/dotfiles-private`;
   - repo-specific guidance and checks: that repository.

5. Present the candidates to the user in order of severity. For each, give the evidence (session ID and what happened), the proposed change, and the owning file. Then stop and wait for the user to choose which to apply.

## Reference

### Implementation vs Review

All work goes through two stages: implementation and review. The implementation agent has the most **context pressure**: it explores, writes code, and debugs failures. The review agent has the least: it receives a diff, so needs no exploration and rarely writes code. Review, not implementation, should impose coding standards.

### Where Guidance Lives

- `AGENTS.md`: pushed into the context of every agent in its scope. Use it sparingly, mostly for **navigation pointers** and cross-cutting rules.
- Skills: their descriptions sit in every agent's context, so their bodies suit reference material and user-invoked workflows. Follow `writing-dot-skills`.
- Review standards: read during review, not implementation. Keep judgement calls here.
- Docs: reference files reached by pointers from the above. Look for existing docs before writing new ones.

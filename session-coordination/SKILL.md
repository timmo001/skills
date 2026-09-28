---
name: session-coordination
license: Apache-2.0
compatibility: Requires Herdr-managed sessions and the separately installed herdr skill, or explicitly requested host-native child sessions.
description: Split independent work into visible Herdr sessions and choose models and effort variants for each assignment. Use when tasks benefit from parallel workers or different model capabilities, when the user requests coordination or model selection, or when a coordinator agent is selected. Ask before launching workers.
---

# Session Coordination

Keep scope, assignments, decisions, and accepted results in the coordinator's
conversation or existing task list. Use Herdr for live identity and state rather
than maintaining a second session registry in files.

## Agree The Split

- Keep small or tightly coupled work in the current session. Propose Herdr workers
  proactively when independent investigation, checks, or disjoint implementation
  can run in parallel with a clear owner for shared decisions and files. Look for
  useful splits at task intake and when implementation reaches verification;
  do not keep separable work in one session simply because it already has context.
- Apply `evidence-first` before proposing sessions. Use findings from the current
  task to explain why the work is independent and how parallel workers would help.
  Name the assignments, repositories or areas, intended panes or workspaces,
  model and effort choices, and proposed concurrency. Task size alone is not
  evidence that a split will help.
- Ask through the question tool whether to use that Herdr split or continue
  directly. Wait for explicit agreement before creating worker sessions or their
  panes. A previous user instruction covering those launches is sufficient;
  selecting a coordinator profile, loading a skill, or expressing a general
  preference for parallel work is not.
- Coordinate from the current agent and conversation after agreement. No profile
  switch is required. Keep the agreed scope in the conversation: it may authorise
  multiple sessions and later launches or replacements within that scope without
  repeated questions. Ask again before exceeding its assignments, locations, or
  concurrency. Approval is not standing permission for unrelated work or another
  conversation. If declined, continue directly.
- During planning, workers may investigate but must not implement. Agreement to
  parallel planning does not authorise implementation; keep each worker within
  the current phase and the user's approved scope.

## Assign

- Load `changeset-scope` and pass the same boundary to each worker. Give it the
  objective, repository, allowed files, dependencies, applicable skills, required
  checks, and a concise result format: outcome, changed paths, checks, blockers.
- Keep small reads and decisions with the coordinator. Prefer Herdr for useful
  delegation so workers stay visible and can be prompted, resumed and switched
  independently. A native child may suit a short, self-contained lookup where
  its result-return mechanism avoids managing a terminal. Explain that advantage
  and obtain explicit permission before using native children; availability alone
  is not a reason. If Herdr is unavailable, report that rather than silently
  switching delegation tools.
- Load `herdr` before control. It owns CLI syntax, topology, lifecycle, targeting,
  and safety. Use the smallest useful set of sessions, with a soft cap of four
  active workers and three new background panes per tab. Ask before exceeding it.
- Keep overlapping file edits sequential. Reuse a worker for the same task and
  its fixes; give unrelated work a fresh session. Apply `staged-implementation`
  only when separate reviewable stages need sequencing.
- Name created agents with a unique `coord-` name and retain their returned pane
  IDs in this conversation. A name prefix alone does not establish ownership of
  panes from another run.

## Choose Models By Assignment

Treat model capability and effort as separate choices. Honour explicit user
selections and host preferences. Otherwise propose a model for the assignment
rather than copying the coordinator's model into every worker. Runtime and
version still follow the launch policy below.

| Assignment | Starting point |
| --- | --- |
| Subtle correctness, security, concurrency or compatibility review | Strong reasoning model, high effort |
| Architecture decisions or diagnosis with competing explanations | Strong reasoning model, high effort |
| Bounded implementation with a settled design | Capable coding model, medium effort |
| Mechanical edits with exact instructions and independent files | Smaller model, low effort |
| Collect source references, logs or prescribed check results | Smaller model, low effort |
| Design regression checks for complex behaviour or investigate a flaky test | Stronger model, medium or high effort |
| Run a known command without interpretation | Background shell; no model needed |

- These are starting points, not model rankings or guarantees. Resolve current
  provider/model IDs and supported variants from the runtime. Use observed task
  results and host preferences to choose between candidates; do not infer speed
  or quality from a model's name alone. Keep personal model shortlists in the
  host's private configuration, not these shared skills.
- Include the model, effort and reason in the proposed split. Do not default to
  maximum effort. Higher effort is useful for unresolved reasoning, not merely
  because a command takes a long time to run.
- Examples of independent work: frontend and backend tracing; implementation in
  disjoint modules; collecting primary-source evidence while another worker
  analyses the contract; a review and prescribed checks against a stable diff.
  A checker must report the revision or working-tree state it verified. Do not
  claim results from changing files as verification of the final changeset.
- For a justified independent review, a different model can provide another
  perspective. It is not proof of correctness: the coordinator still verifies
  each finding. Do not launch a reviewer after every edit or create voting loops.
- Escalate when a worker identifies unresolved ambiguity, cannot explain a
  failure, or repeats an unsuccessful approach. Pass its evidence to a stronger
  model or raise effort using the supported session switch within the agreed
  scope. Keep the same worker for the same task; open a fresh session for genuinely
  independent work, not merely to change a model.
- Keep design, regression-test design and failure diagnosis separate from routine
  test execution. A smaller worker may run checks and collect failures without
  being authorised to weaken tests or make speculative fixes.

## Launch

Honour the requested runtime; otherwise match the coordinator's runtime and
version. A runtime is separate from its internal agent profile. Herdr's
`agent start --kind` selects the integration's default executable.

For an approved repository workspace, use the host's repository-launch skill when
configured. Prefer its shared opener to recreating workspace selection and agent
startup. Check live state to reuse the right workspace, retain the target pane ID,
and distinguish newly created panes from reused shells for cleanup. Follow the
opener's focus behaviour and restore the caller for background work when needed.
When a model or effort variant is requested, use the host opener's selection
options if it supports the requested runtime. Resolve ambiguity before starting the worker,
and verify the selected model and variant before delivering the brief. Validate
variants against that model's current catalogue rather than assuming names such
as low or high are universal. For an existing worker, use the host's supported
session-model switch only after confirming its
live identity and the user's requested model; do not start a replacement worker
merely to change models. For an effort-only change, retain its current provider
and model and select the requested variant explicitly.

For an alternate runtime, verify the configured exact launcher in the coordinator
before creating a pane. Use the host opener when it verifies that runtime and
delivers the prompt after readiness. Otherwise launch without a prompt through
the opener or `herdr pane run`, then verify the foreground `argv` with
`herdr pane process-info` against the launcher or its documented exec target before
prompting. Do not substitute a same-named executable from `PATH` or discover
launchers inside the target pane. Keep machine-specific launcher paths in the
host's configuration.

## Work And Collect

- If the verified host opener already delivered the brief, do not send it again;
  use `herdr agent wait` when its result is needed. Otherwise send it directly with
  `herdr agent prompt`, using `--wait` for a dependent result. Bound both waits with
  a timeout. For parallel work, run the waiting command
  through the host's background shell facility when it provides completion
  notifications; continue other ready work and inspect the result on notification.
- If the host lacks that facility, submit without waiting, do independent work,
  then use `herdr agent wait` when the result is needed. Avoid sleep/poll loops.
- Read state with `agent get` and results with `agent read --source recent-unwrapped`.
  A settled state is not proof the assignment succeeded. Check the returned work
  against its acceptance criteria and verification evidence.
- After a timeout, stalled prompt, blocked state, or unknown state, inspect the
  target before acting. A failed wait does not prove the prompt was not delivered;
  do not blindly resend it. Ask the user before answering approval/question UIs.
- When present, retain `agent_session` from get/list responses for the runtime's
  supported history or resume tools. It is optional and is not itself a transcript.
  If terminal reads miss output, use available native history; otherwise follow
  `herdr`'s temporary-file fallback. Do not require every worker to write a report.
- Use a separate read-only review only when requested or justified by a concrete
  risk. Give it `code-review` and the scoped evidence, verify findings, and return
  fixes to the owner without an automatic reviewer-fixer loop.

## Finish Or Continue

- Before context runs out, send a successor the current scope, decisions, changed
  paths, checks, blockers, and exact session references directly. Use `handoff`
  only when work needs durable project notes beyond the live sessions.
- Before closing an owned pane, capture its useful result in the conversation and
  check its current identity, state, and outstanding work. Close only settled
  topology created by this run, unless the user asks to keep it. Leave blocked,
  ambiguous, or still-needed sessions open and report why. Verify closure through
  Herdr; no lifecycle-file write/read/delete cycle is required.
- Use `herdr-workflows` for recovery and worktree transfers. Pane cleanup is not
  permission to remove a checkout or discard uncommitted work.
- Keep consequential actions within the user's explicit authorisation, including
  commits and pushes. Resolve conflicting findings and verify changed behaviour
  before reporting accepted results, remaining blockers, and retained sessions.

Reference: [Herdr agent automation](https://herdr.dev/docs/agent-automation/) and
[socket API](https://herdr.dev/docs/socket-api/). Use the installed CLI for syntax.

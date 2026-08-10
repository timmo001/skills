---
name: research
description: Investigate a topic against primary sources and return cited findings, comparing credible maintainer and contributor perspectives when judgement is involved. Use when the user asks why, says show evidence, validate this, or use trusted sources; wants research, docs, API, or spec facts; needs external library or GitHub behaviour verified; compares competing views; or delegates reading legwork to a background agent.
---

# Research

Answer a question by reading the sources that own the answer, then hand back findings with every claim tied to its source. This is external primary-source research, distinct from `/investigate` (local triage and diagnosis) and `/explore-codebase` (internal codebase discovery).

## Source discipline

- A primary source owns the fact: official docs, source code, a spec, a first-party API, a maintainer's own words on an issue or PR.
- Never rest a claim on a secondary write-up of a source. Follow every claim back to the source that owns it.
- Third-party blogs, forum answers, and Answer Overflow are secondary. Use them to find the primary source, then cite the primary source. When only a secondary source exists, say so and flag it.
- A person's own writing is primary evidence of their view or experience, not automatically of project policy or a universal technical fact. Distinguish project policy, implemented behaviour, adopted practice, personal opinion, social sentiment, and measured evidence.

## Compare arguments, not reputations

- Do not rank people globally or treat a familiar name, maintainer title, employer, stars, followers, citations, votes, or repeated agreement as proof.
- Weigh each source for the claim at hand: direct involvement, relevant public work, inspectable reasoning or implementation, tests or reproducible methods, applicability, recency, caveats, incentives, and engagement with strong objections.
- Prefer visible effort over status. Code, measurements, concrete examples, trade-offs, limitations, and responses to criticism carry more weight than confidence or credentials alone.
- Use known maintainers, contributors, projects, locally used software, and skill lineages as discovery seeds, not an allowlist. Actively look beyond the familiar pool for relevant credible voices.
- Do not manufacture balance. Include a challenge only when it is relevant and technically credible, and do not let several weak endorsements outvote one unresolved technical objection.
- When present, read `references/user-source-context.md` as optional private discovery context. Its names and projects are unordered leads, never authority or required coverage. The public workflow must work without it.

## Workflow

1. **Frame claims before names.** State what you are trying to establish. If the topic is too vague to research and you are running interactively, ask one clarifying question. When delegated as a subagent, proceed and return findings.
2. **Choose the evidence shape.** For a direct API, specification, version, or implementation fact, read the owning source and stop when it establishes the answer. For a recommendation, disputed claim, design question, or request for sentiment, build a proportionate source portfolio from the owning project, directly relevant maintainers or contributors, independent or downstream experience, empirical evidence when measurable, and the strongest credible disagreement. These are useful roles, not quotas.
3. **Pick the capability that reads the source.** Prefer indexed library documentation for frameworks, repository code search for GitHub-hosted source, first-party GitHub issue and pull-request readers for project records, and a web fetcher for official material elsewhere. Use community archives only when primary sources fall short.
4. **Fan out once when it helps.** When the client offers read-only delegation, divide broad reading by independent evidence axis or source community. Ask for facts, attribution, scope, tensions, and caveats without prescribing a conclusion. A delegated researcher completes its own reading without delegating again. Claim verification, comparison, and synthesis stay with the primary researcher.
5. **Inspect large output deliberately.** Do not truncate normal command output merely to save context. For genuinely huge output, search it or read targeted ranges; delegate targeted inspection when the client supports it and that preserves primary context.
6. **Verify attribution and scope.** Read the actual source, not just a search snippet. Verify the author's relationship to the project, the date or version, what evidence they provide, and whether the statement is policy, implementation, experience, opinion, or measurement. Do not generalise a narrow statement beyond its stated context.
7. **Compare the strongest cases.** For evaluative work, explain the strongest support, strongest credible challenge, agreements, real tensions, decisive evidence, and remaining uncertainty. Recommend the position best supported for the user's context, even when it comes from an unfamiliar source. Do not settle disagreement by counting sources.
8. **Report with citations.** Every factual claim carries a source URL or permalink. Prefer the exact line, comment, commit, or section over a bare repo or page link. Clearly label source facts and your synthesis, and include limitations and the smallest next check that would resolve material uncertainty. Keep direct factual answers concise; use fuller comparison only when the question needs judgement.

## Keep the findings

The findings live in the conversation, so persistence reuses the notes vault rather than a direct file write:

- Offer the client's note workflow when one is configured. Do not write into an external notes store through ordinary file tools.

## Act on the findings

Research feeds the thinking, it does not replace it. A visible plan is not always required before implementation:

- When the findings leave a clear, bounded implementation, offer to continue with an edit-capable agent or mode.
- Do not treat completed research as permission to edit. Wait for explicit authorisation to continue.
- If a material unknown remains, stop before implementation. Ask the minimum needed for a bounded choice; recommend the client's planning workflow for broader sequencing and the grilling workflow for question-led stress-testing.

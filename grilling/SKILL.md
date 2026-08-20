---
name: grilling
description: Grill the user about a plan, decision, or idea in dependency-ready rounds. Use when the user wants to stress-test their thinking or uses a grill trigger phrase.
license: MIT
# origin: https://github.com/mattpocock/skills/tree/main/skills/productivity/grilling
# upstream-sha: 86cba45f4244b2545112d13e77ba82eb2bfad325
# local-edits:
#   - preserve Light/Full intensity and materiality rules
#   - adapt fact-finding and delegation to available client capabilities
#   - cap question-tool rounds at five questions
---

# Grilling

Interview the user until you reach a shared understanding. Map the subject as a **design tree**: every decision branches into the decisions that depend on it.

## Rules

1. Work the tree in **rounds**. The **frontier** is every material decision whose prerequisites are settled: the questions you can ask now without guessing at an unanswered dependency.
2. Ask up to five frontier questions in one round, matching the question tool's limit. If more than five decisions are ready, ask the five highest-leverage questions and carry the rest into later rounds. Number every question and give a recommended answer. A question that depends on another question in the current round belongs to a later round.
3. Treat explicit user direction and prior answers as settled. Do not ask the user to repeat or confirm them.
4. Finding facts is the agent's job. Use read-only tools or allowed read-only subagents for facts available from the environment. A running investigation is an unsettled prerequisite, so ask the rest of the frontier without blocking on it.
5. Decisions remain with the user. Never silently settle an unresolved choice that could materially change scope, visible behaviour, acceptance criteria, safety, data, compatibility, cost, or an irreversible action.
6. Include a question only when plausible answers materially change the plan or implementation. Skip nice-to-know, speculative, low-level, and safely reversible choices.
7. Stay planning-only. Do not edit files, write specs, create issues, post comments, or implement code during grilling.

Format every question like this:

```markdown
❓ **Q1** - **<question title>**: <question body, including choices when useful>

➡️ <recommended answer and brief reason>
```

The user's answers reshape the tree. Recompute the frontier after each round rather than following a fixed questionnaire.

## Intensity

Infer intensity from the user's wording and current context. Ask once when neither implies a level.

- **Light:** phrases such as "lightly grill me", "a quick pass", "ask me a couple", or "only ask the important questions". Ask one highest-leverage material round, honouring any lower explicit question limit, then summarise.
- **Full:** phrases such as "grill me thoroughly", "go deep", or "full grill". Continue until the material frontier is empty.

Intensity controls depth, not whether material decisions can be silently assumed.

## Stopping

Stop when the applicable round limit is reached, no unresolved question passes the materiality gate, the scope must be split, concrete investigation or a prototype is required, or the user asks to stop or build.

## Decision Summary

Summarise only the durable planning state:

- Intensity used
- Decisions made
- Working assumptions
- Open material decisions
- Out of scope
- Readiness: `ready for handoff`, `needs prototype`, `needs targeted investigation`, or `needs more grilling`

Do not act on the result until the user asks to plan, build, or otherwise leave grilling.

---
name: asking-questions
license: Apache-2.0
description: Decide when to ask the user a question and how to present it. Use before any clarifying question, choice, or confirmation, whether through the Plannotator Inbox, a structured question tool or in chat, and to decide whether to hold questions until findings are presented or divert to grilling; do not use to run light or full grilling rounds.
---

# Asking Questions

Ask only when the answer changes the work, and never ask cold. The user reads the chat, not your thinking, so the context for a question has to be in the response itself.

## When to Ask

- Several reasonable readings of the request lead to materially different work.
- The unknown is the objective, done criteria, scope, constraints, environment, or safety of an irreversible step.
- Quick read-only discovery cannot settle it.

## When Not to Ask

- The request is clear enough to proceed safely.
- Reading files, config, docs, or history would answer it.
- Repository conventions or the user's earlier choices give a safe default and the impact is low.
- The step is routine and safe; do not ask permission for it.
- The user has made a clear choice or set a limit; follow it rather than confirming it.
- The turn's job is to present something: research findings, an explanation, a diagnosis, or a review. Present it and end the turn. Offer next steps in prose, and let the user react before asking anything. Ask in the same turn only if a decision genuinely blocks work you were asked to continue.
- The user wants light or full grilling or plan stress-testing; use `grilling` or `/grill`.

## Divert to Grilling

Clarification is for a few independent blockers. Recommend `/grill` instead of asking when:

- more than three material decisions are open;
- the decisions depend on each other, so answers would reshape the next questions;
- the real need is to stress-test a plan, idea, or trade-off rather than fill in a missing detail.

Say why in a sentence and let the user choose. If the user has already asked to be grilled, load `grilling` and follow it. Its rounds still follow Present Before Asking below.

## Present Before Asking

Every question follows visible chat in the same response. Thinking, tool input, and progress notes from earlier steps do not count, and a structured question tool shows only labels.

1. If the user asked something, raised a doubt, or said "check first" or "explain", answer that first.
2. Give a short summary of what you found that the choice depends on.
3. Say what each option means in practice and which you recommend, with the reason.
4. Then ask. Never open a turn with the question. Once you have decided a question is needed, ask it in the same response as the explainer.

Each question must make sense from the chat directly above it. If the thing being asked about (a draft, plan, proposed wording, or list of options) is not visible in this response, show it first; never ask the user to approve or choose something they cannot see.

## How to Ask

- Ask the fewest questions that unblock the work, ideally one and at most three in a pass.
- When the `plannotator_inbox` tool is available, send blocking questions to the Plannotator Inbox by default, as `:::question` blocks, even if the user never mentioned it. The user may read it away from the terminal, so the message carries its own short explainer and recommendation. Also ask the same question in plain chat at the end of the response, so the user can answer in either place. Don't use a blocking structured question tool alongside it: it holds the turn open, so the Inbox reply can't arrive.
- An offer that ends a turn ("Want me to...?", "Shall I...?") is a question the user has to answer, so it goes to the Inbox and chat the same way. If it isn't worth sending, state the next step in prose instead of asking.
- Ask in chat alone when the user says to, or asked their question in chat expecting a quick answer.
- Otherwise use the client's structured question capability when available, or ask concisely in chat.
- Prefer concrete options over open prompts. Put the recommended option first and mark it `(Recommended)`.
- Do not ask the user to reply with numbered text when the client captures structured choices.

## Wording

Details, reasoning, and trade-offs go in the chat above. The question and its options stay short and plain, in the same style as `bro`:

- One question, one decision. Write it as a direct, short sentence that names the concrete thing being decided.
- Option labels name the choice in a few words; option descriptions add only the key consequence in one short sentence.
- Use the concrete facts: file paths, names, commands, and values, not vague terms like "the approach" or "this change".
- No filler, hedging, preamble, restated context, jargon, or process terms.
- Do not repeat the explainer inside the question or its options.

## While Waiting and After

- Finish non-blocked read-only discovery before asking.
- After sending through the Inbox, end the turn. The reply arrives as a new turn once the session is idle; don't poll with `wait_for_reply` or start a background wait, which keeps the session busy and holds the reply back.
- Take the first answer from either place. If it came in chat, close the Inbox thread with `resolve_message` so the question doesn't linger there; if it came from the Inbox, don't ask again in chat. A later answer to a question already settled is stale: don't act on it, and mention it only if it conflicts.
- An Inbox reply can skip questions the user did not answer, and Mark read sends a "Set aside for now" note. Neither is an answer: stop waiting on those questions, and ask again only if one still blocks the work.
- When a later message, a change of plan, or the user's own words settle or replace one of your open Inbox questions, withdraw it with `supersedes` so it stops holding the thread at the top of their list.
- When the work came from an Inbox reply, send follow-up questions back to that thread with `reply_to`, as well as in chat.
- Until a must-have answer arrives, do not edit files or run state-changing commands.
- If the user says to proceed without answering, state the assumptions in a sentence and continue with the safest defaults.
- After the answer, restate the resulting requirement in one or two sentences. Carry on only with what the answer actually authorised. Answering a design or clarifying question settles that detail; it is not approval to start implementing. If the work was still at the discussion or proposal stage, present the updated plan and wait for the go-ahead before editing.
- Do not turn clarification into a multi-round interview. If a second round looks needed, divert to grilling as above.

---
name: asking-questions
license: Apache-2.0
description: Decide when to ask the user a question and how to present it. Use before any clarifying question, choice, or confirmation, whether through the Plannotator Inbox or in chat, and to decide whether to hold questions until findings are presented or divert to grilling; do not use to run light or full grilling rounds.
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
- The turn's job is to present something: research findings, an explanation, a diagnosis, or a review. Present it first and don't open with a question. A closing offer or question is fine, but it still needs an answer, so it follows How to Ask below.
- The user wants light or full grilling or plan stress-testing; use `grilling` or `/grill`.

## Divert to Grilling

Clarification is for a few independent blockers. Recommend `/grill` instead of asking when:

- more than three material decisions are open;
- the decisions depend on each other, so answers would reshape the next questions;
- the real need is to stress-test a plan, idea, or trade-off rather than fill in a missing detail.

Say why in a sentence and let the user choose. If the user has already asked to be grilled, load `grilling` and follow it. Its rounds still follow Present Before Asking below.

## Present Before Asking

Every question follows visible chat in the same response. Thinking, tool input, and progress notes from earlier steps do not count.

1. If the user asked something, raised a doubt, or said "check first" or "explain", answer that first.
2. Give a short summary of what you found that the choice depends on.
3. Say what each option means in practice and which you recommend, with the reason.
4. Then ask. Never open a turn with the question. Once you have decided a question is needed, ask it in the same response as the explainer.

Each question must make sense from the chat directly above it. If the thing being asked about (a draft, plan, proposed wording, or list of options) is not visible in this response, show it first; never ask the user to approve or choose something they cannot see.

## How to Ask

- Ask the fewest questions that unblock the work, ideally one and at most three in a pass.
- When the `plannotator_inbox` tool is available, send every question that needs an answer to the Plannotator Inbox, as `:::question` blocks, even if the user never mentioned it. This applies whether or not the work has started and whether or not the answer blocks anything. The user may read it away from the terminal, so the message carries its own short explainer and recommendation. Also ask the same question in plain chat at the end of the response, so the user can answer in either place.
- An offer that ends a turn ("Want me to...?", "Shall I...?", "Do you want me to fix this now?") is a question the user has to answer, so it goes to the Inbox and chat the same way.
- A turn that stops with work left ends with that kind of question. Never close a stop with "next I'll..." in prose; it can't be answered and reads as a promise that won't run. A turn that has fully finished needs no next step. Mid-work status updates are different: they say what comes next because the work carries on.
- Never offer a single yes/no. Ask it as a multi-select (`:::question-multi` in the Inbox), since the user may want several: continuing with what's left (named), and every other reasonable next action, such as commit, push, a check or a deploy, plus the steps the user might take themselves, such as reviewing or testing it first (mark who acts as Wording describes). Don't add a catch-all Other; the Inbox already offers one.
- When the turn also reports an outcome (findings, a plan, a review, a result, or where work stopped), send the report itself in that Inbox message, never a pointer such as "ready in chat", and put the question in the same message. Anything that waits on the user, including "I'll edit once you approve", is a `:::question` block, not prose, so the thread shows it needs a reply. Sign-off on a plan, document or diff is the exception: it goes through a gated Plannotator review, and the Inbox message links to it (see `plan`).
- Ask in chat alone only when the user says to, or when the Inbox is unavailable.
- Never use a blocking structured question tool (OpenCode's `question`, Claude Code's `AskUserQuestion`), even if the client offers one: it holds the turn open, so an Inbox reply can't arrive and the session stalls until someone answers at the terminal.
- Prefer concrete options over open prompts. Put the recommended option first and mark it as recommended.

## Wording

Details, reasoning, and trade-offs go in the chat above. The question and its options stay short and plain, in the same style as `bro`:

- One question, one decision. Write it as a direct, short sentence that names the concrete thing being decided.
- Option labels name the choice in a few words; option descriptions add only the key consequence in one short sentence.
- Say who acts only where either of you could plausibly do it, such as adding a device in a UI, and add the role in brackets: "I (the agent) add the laptop" and "You (the user) add it in the UI". A bare "I'll add it" reads as the user's own voice. Where it's obvious who acts, such as the agent committing, pushing or editing, leave it out: "Commit and push both now", "Leave uncommitted".
- Use the concrete facts: file paths, names, commands, and values, not vague terms like "the approach" or "this change".
- No filler, hedging, preamble, restated context, jargon, or process terms.
- Do not repeat the explainer inside the question or its options.

## While Waiting and After

- Finish non-blocked read-only discovery before asking.
- After sending through the Inbox, end the turn. The reply arrives as a new turn once the session is idle; don't poll with `wait_for_reply` or start a background wait, which keeps the session busy and holds the reply back. If you carried on with other work, the reply can land in the running turn instead, when the user presses Send now or by itself after it has waited 5 minutes: act on it there as if it had started a new turn.
- Take the first answer from either place. If it came in chat, withdraw it in the Inbox at once, before acting on it: a one-line reply into the thread with the answer and the question in `supersedes`, so it stops waiting there; resolve the thread only when the work stream is done. if it came from the Inbox, don't ask again in chat. A later answer to a question already settled is stale: don't act on it, and mention it only if it conflicts.
- An Inbox reply skips only the questions the user chose to skip, and Mark read sends a "Set aside for now" note. Neither is an answer: stop waiting on those questions, and ask again only if one still blocks the work. A note the user left on a skipped question still counts as a note on it.
- A reply that answers some questions leaves the others open. Act on the answers, don't ask the open ones again, and wait for them in the Inbox.
- A 👍 Looks good note means the user read your message and has nothing to add. Send nothing back, not even a status update; end the turn, or carry on with work it doesn't change.
- A reply with only words (no answers) leaves its questions open. Act on the words, don't ask the questions again, and wait for the answers in the Inbox.
- A reply can carry comments on words the user selected in your message, under "Feedback on your messages". Treat each as a note on that passage, the same as a comment on a file: act on it, and say how in your answer. Like words, comments leave the questions open.
- A Re-ask note is the exception: the user pressed Re-ask to have the open questions it lists asked again. Send them together in one new message with fresh context, following the note's `Replaces:` lines, or `supersedes` the ones that no longer apply. Picks the note carries are answers.
- When the work came from an Inbox reply, send follow-up questions back to that thread with `reply_to`, as well as in chat.
- Until a must-have answer arrives, do not edit files or run state-changing commands.
- If the user says to proceed without answering, state the assumptions in a sentence and continue with the safest defaults.
- After the answer, restate the resulting requirement in one or two sentences. Carry on only with what the answer actually authorised. Answering a design or clarifying question settles that detail; it is not approval to start implementing. If the work was still at the discussion or proposal stage, present the updated plan and wait for the go-ahead before editing.
- If the answer leaves who does the work unclear, or the user replies with a remark or observation ("that should have been allowed", "this is missing") rather than an instruction, treat it as information. Ask before changing anything because of it, and say why you're asking: that you read it as information rather than an instruction, and what you would change if it was meant as one.
- Do not turn clarification into a multi-round interview. If a second round looks needed, divert to grilling as above.

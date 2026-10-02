---
name: decision-models
description: "Make typed, calibrated decisions about text, JSON or images with a decision model: classify (choice), rate (score) or check a yes/no statement (noul), with probabilities you can threshold. Use it to triage tickets and emails, route requests, moderate posts, screen prompts, or any step where the agent needs a quick judgement it can act on instead of reasoning it out in text."
compatibility: Requires access to a supported decision model provider; currently Cloudflare Clef on Workers AI through the Cloudflare API MCP server or an authenticated API token. Hosted requests are billed per input token beyond the free daily allocation.
license: Apache-2.0
# origin: https://github.com/ollaya-dev/ollaya/tree/main/skills/ollaya-decisions
# upstream-sha: 37fcfa9f8a35b6b389447ffca49e4b4242970f81
# local-edits:
#   - SKILL.md: renamed and generalised from local Ollaya models to provider-neutral decision models, with hosted Cloudflare Clef on Workers AI through the cloudflare-api MCP as the first provider
#   - SKILL.md: replaced the Ollaya call paths, model table and presets with a provider section covering the Workers AI request shape, Clef model choice and cost notes
#   - SKILL.md: added compatibility metadata for concrete environment requirements
---

# Typed decisions with decision models

A *decision model* reads a **state** (a message, an email, a ticket, any JSON) and a set of
**typed questions**, and returns a calibrated answer to each question in one forward pass. It
never generates text. Most decision models share the Jev/SystemOne request and answer format, so
the question and answer guidance below applies whichever provider answers.

Reach for it when the answer is one of a known set of outcomes and you will act on it: route,
label, block, escalate, pick a template. Keep reasoning in text for open-ended work.

## When a typed decision is the right tool

| Situation | Use |
|---|---|
| Label, route or filter many items (tickets, emails, messages, rows) | one request per item |
| A yes/no gate before an action (is this spam, a jailbreak, a refund request) | a `noul` question |
| A rating you will compare with a threshold (urgency, severity, frustration) | a `score` question |
| One of N categories, teams or intents | a `choice` question |
| Summaries, explanations, answers that need new text | not this skill |

Hosted requests are billed API calls, so batch several questions about the same state into one
request.

## Providers

### Cloudflare Clef on Workers AI

Use the Cloudflare API MCP tool `post_accounts_ai_run` (the generic Workers AI run endpoint). Pass
the account ID and a JSON string body that names the model and nests the decision request under
`input`:

```json
{
  "model": "@cf/cloudflare/clef-flash",
  "input": {
    "state": "Checkout has been failing for every customer for the last hour.",
    "questions": {
      "urgent": { "type": "noul", "instructions": "Is this support request urgent?" }
    }
  }
}
```

Do not use `post_accounts_ai_run_by_model_name` for Clef: it returns `No route for that URI`.

When the session is authorised for one account, `account_id` may be omitted; otherwise look it up
with the accounts tool first. Without the MCP, the same body works against
`POST https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run` with an API token that has
Workers AI access.

Add images to `input.images` when the decision depends on visual content.

| Model | Use | Price |
|---|---|---|
| `@cf/cloudflare/clef-flash` (default) | Fast, cheap, strong on tool and intent decisions | $0.09 per M input tokens |
| `@cf/cloudflare/clef` | Higher precision on fine-grained intent, out-of-scope detection, long or hallucination-sensitive states | $0.24 per M input tokens |

Only input tokens are billed. The free allocation is 10,000 neurons per day: about 1.2M tokens on
Clef-flash and about 450k on Clef. A small request with a few questions is a few hundred tokens;
the response reports `usage.input_tokens`.

Start with `clef-flash`; move to `clef` when its confidence is often low on your data.

## Writing your own questions

Questions are an object keyed by an id you choose:

```json
{
  "team": {
    "type": "choice",
    "instructions": "Which team should handle `ticket`?",
    "criteria": {
      "billing": "invoices, charges, refunds, plans",
      "engineering": "bugs, outages, errors, integrations",
      "sales": "pricing, demos, upgrades",
      "other": "anything else"
    }
  },
  "urgency": {
    "type": "score",
    "instructions": "How urgent is `ticket`?",
    "criteria": ["can wait", "this week", "today", "right now: an outage or a deadline"]
  },
  "wants_refund": {
    "type": "noul",
    "instructions": "Does the customer ask for their money back?"
  }
}
```

Rules that make answers better:

- **choice**: give every option a short description in `criteria`, make the options mutually
  exclusive, and include a catch-all (`other`). Up to a few dozen options work.
- **score**: 3 to 5 levels, lowest first, each described concretely. The answer is the expected
  level (it can fall between levels), with a `legend`.
- **noul**: phrase one statement that is true or false ("Does the customer ask for a refund?").
  Avoid double negatives and two questions in one.
- Name the state's field in `instructions` (`` `ticket` ``) when the state is an object.
- Keep instructions short and literal. The model reads them; it does not follow long prompts.

## Reading answers and acting on them

Answers are under `result.answers`, keyed by question id:

| `type` | Fields |
|---|---|
| `choice` | `choice`, `confidence` (0 to 1), `probabilities` per option |
| `score` | `score` (expected level), `confidence`, `legend`, `probabilities` per level |
| `noul` | `noul`: the probability that the statement is true |

Act on the answer only when it is clear, and escalate otherwise:

- `choice`: act when `confidence` ≥ 0.6; below that, treat the top two options as candidates or
  ask a human.
- `noul`: treat ≥ 0.8 as yes and ≤ 0.2 as no; in between, escalate or look closer.
- `score`: compare `score` with your threshold and look at `confidence` before acting on it.

Tune thresholds on a handful of real examples when the stakes are high. Say in your output which
model answered and the probability behind each action, so a person can audit it.

## Example: triage a batch of tickets

1. Pick questions: your own `team`/`urgency`/`wants_refund` set.
2. For each ticket, call `post_accounts_ai_run` with
   `{"model": "@cf/cloudflare/clef-flash", "input": {"state": {"ticket": ticket_text}, "questions": {...}}}`.
3. Route by `team`, flag `urgency` ≥ 2, and put every ticket with low `team` confidence in a
   "needs review" list.
4. Report a table: ticket, action, and the probabilities behind it.

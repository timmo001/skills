---
name: decision-models
description: "Make typed, calibrated decisions about text, JSON or images with decision models, locally through Ollaya or hosted as Cloudflare Clef on Workers AI: classify (choice), rate (score) or check a yes/no statement (noul), with probabilities you can threshold. Use it to triage tickets and emails, route requests, moderate posts, screen prompts for jailbreaks or injections, or any step where the agent needs a quick judgement it can act on, instead of reasoning it out in text. Also use it whenever the user names a decision model such as laya, winnow, clef or clef-flash, which are models, not commands. Works through the Ollaya MCP server (the `decide` tool), the `ollaya` CLI or local HTTP API, or the Cloudflare API MCP server."
compatibility: Requires local Ollaya (CLI, MCP server or HTTP API, plus nvidia-smi on machines with an NVIDIA GPU) or hosted Cloudflare Clef on Workers AI through the Cloudflare API MCP server or an authenticated API token. Hosted requests are billed per input token beyond the free daily allocation.
license: Apache-2.0
# origin: https://github.com/ollaya-dev/ollaya/tree/main/skills/ollaya-decisions
# upstream-sha: 798a9b56477c9d8ab457aa3887a71c5103acedd4
# local-edits:
#   - SKILL.md: renamed to decision-models and added hosted Cloudflare Clef on Workers AI as a fallback provider alongside Ollaya
#   - SKILL.md: added compatibility metadata for concrete environment requirements
#   - SKILL.md: dropped the metadata.homepage block (https://ollaya.dev); the frontmatter validator allows no nested keys
#   - SKILL.md: added a cascade that starts on winnow:e4b with an NVIDIA GPU or laya on CPU and escalates unclear answers to local or hosted Clef
#   - SKILL.md: replaced the upstream model advice with a pointer to that cascade
#   - SKILL.md: retained hosted Clef support and the local decision cascade alongside the upstream Arbiter model entry
---

# Typed decisions with Ollaya or Cloudflare Clef

Ollaya runs *decision models* on this machine, and Cloudflare hosts its Clef models on Workers AI.
A decision model reads a **state** (a message, an
email, a ticket, any JSON) and a set of **typed questions**, and returns a calibrated answer to
each question in one forward pass, in about 10 ms on a local GPU and a few hundred ms on a CPU. It never
generates text.

Reach for it when the answer is one of a known set of outcomes and you will act on it: route,
label, block, escalate, pick a template. Keep reasoning in text for open-ended work.

## When a typed decision is the right tool

| Situation | Use |
|---|---|
| Label, route or filter many items (tickets, emails, messages, rows) | `decide` on each item |
| A yes/no gate before an action (is this spam, a jailbreak, a refund request) | a `noul` question |
| A rating you will compare with a threshold (urgency, severity, frustration) | a `score` question |
| One of N categories, teams or intents | a `choice` question |
| Summaries, explanations, answers that need new text | not this skill |

A local decision costs no tokens and no API call, so it is fine to run one per item, per step.
Hosted Clef requests are billed, so batch several questions about the same state into one request.

## Choose local or hosted

Model names such as `laya`, `winnow:e4b` and `clef` are Ollaya models (see "Picking a model"),
run with `ollaya run <model>` or the `decide` tool; there is no `laya` command. Don't search for
one.

If the user names a model or provider, go straight to calling it. Otherwise start with the
lightest model that suits the machine, and escalate only the answers it can't settle:

1. **Pick the first model** once per session, when `ollaya` is on PATH:

   ```sh
   nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null
   ```

   - NVIDIA GPU: start with `winnow:e4b`, the best accuracy for its speed (about 90 ms per
     decision on a GPU, by Ollaya's figures).
   - No GPU: start with `laya`, about 1 s per decision on a CPU. `laya` reads only about 1k
     tokens, so trim the state to the lines that matter (deduplicate logs, drop noise) or split
     it.
2. **Act on its answer when it is clear** (see "Reading answers and acting on them"). Most
   decisions stop here.
3. **Escalate only the unclear answers**, or a state too long for the model's window:
   - NVIDIA GPU with 24 GB or more VRAM: rerun on local `clef`. Otherwise rerun on hosted Clef on
     Workers AI.
   - No GPU: rerun on hosted Clef on Workers AI. Larger local models are slow on CPU (a 9B model
     took over a minute), so don't pick them yourself there.
4. **Without `ollaya`**, use hosted Clef on Workers AI from the start.

- **The user's choice always wins.** If they name a provider or model
  ("use local clef", "use laya", "use Workers AI", "use clef-flash"), use exactly that, even when
  it will be slow on CPU or too big for the GPU. "Local clef" means Ollaya's `clef`, not Workers
  AI. Warn once if it is likely to be slow or fail for memory, then run it; fall back only if it
  actually fails, and say so.
- Nothing available: on a GPU machine, tell the user how to install Ollaya
  (`curl -fsSL https://ollaya.dev/install.sh | sh`); otherwise say the Cloudflare API MCP server
  is needed.

Say which provider and model answered.

## How to call it

Ollaya, in this order:

1. **MCP** (tool `decide`, server `ollaya`): pass `state`, and `questions` or `preset`, plus
   optionally `model`. Other tools: `list_models`, `show_model`, `pull_model`. Resources
   `ollaya://presets/<name>` show each preset's questions.
2. **CLI** (`ollaya` on PATH):

   ```sh
   ollaya run laya --preset triage --format json "I was charged twice and want a refund."
   ollaya run laya --questions questions.json --format json "$TEXT"
   ollaya run laya --questions '{"angry":{"type":"noul"}}' --format json "$TEXT"
   echo '{"subject": "…", "body": "…"}' | ollaya run laya --preset email --format json
   ```

   `--format json` prints the full response. The CLI starts the server if it isn't running and
   pulls the model on first use.
3. **HTTP** (`http://127.0.0.1:11435`), TypeSafe-compatible:

   ```sh
   curl -s http://127.0.0.1:11435/v1/systemone -H 'Content-Type: application/json' \
     -d '{"model": "laya", "state": "…", "questions": {…}}'
   ```

Hosted: **Cloudflare Clef on Workers AI**, for when Ollaya is missing or not strong enough (see
below).

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
Workers AI access. Add images to `input.images` when the decision depends on visual content.

| Model | Use | Price |
|---|---|---|
| `@cf/cloudflare/clef-flash` (default) | Fast, cheap, strong on tool and intent decisions | $0.09 per M input tokens |
| `@cf/cloudflare/clef` | Higher precision on fine-grained intent, out-of-scope detection, long or hallucination-sensitive states | $0.24 per M input tokens |

Only input tokens are billed. The free allocation is 10,000 neurons per day: about 1.2M tokens on
Clef-flash and about 450k on Clef. The response reports `usage.input_tokens`, and answers sit under
`result.answers`. Workers AI has no presets: copy a preset's questions from
`ollaya://presets/<name>` or write your own. State data is sent to Cloudflare, so prefer Ollaya for
private content.

## Picking a model

| Model | Strength | Speed (5 questions) |
|---|---|---|
| `winnow:e4b` (recommended with an NVIDIA GPU) | The best accuracy for its speed: 0.722 on typed decisions (Jev: 0.738); calibrated | ~90 ms GPU, ~5 s CPU |
| `laya` (default when `model` is omitted) | English and 100+ languages, routed automatically; calibrated; the fastest | ~10 ms GPU, ~0.2–0.4 s CPU |
| `kev` | Qwen3.5 decoder with a pointer head, 0.8b to 9b (`kev:9b` 0.722); calibrated | `kev:4b` ~0.35 s GPU |
| `decider` | Qwen3.5 decoders, 0.8b to 4b (`decider:4b` 0.680) | ~0.2–0.5 s GPU, ~1 s CPU |
| `decider:2b-vision` | Questions about an image as well as the state: one PNG in `images` (base64) on `/api/decide`, `--image` in the CLI | ~0.2 s GPU for a small image |
| `clm` | Contrastive: embeds the state and each option (Qwen3-8B); questions and options are cached; for agent, game and tool-calling states | ~0.15 s GPU with cached questions |
| `nli` | Zero-shot, good at yes/no with clear statements | ~20 ms GPU |
| `gliclass` | Zero-shot, many options in one pass | ~15 ms GPU |
| `decision` | Decision 1.0 Eos: fully fine-tuned Qwen3.5-0.8B with an endpoint head; rows up to 16k tokens; calibrated | ~0.2 s GPU, ~0.85 s CPU |
| `qwen3guard` | Safety guard; answers only its built-in questions (send no `questions`) | ~40 ms GPU, ~2 s CPU |
| `von` | ModernBERT-large, every option scored at its own marker; states up to 8k tokens; calibrated | ~25 ms GPU, ~0.8 s CPU |
| `decima` | Decima-base (mmBERT-base, 321M): options read against the state one by one, order never matters; calibrated; states up to 512 tokens. `decima:agent` for coding-agent gates and tool choice (2,048-token states), `decima:small` for a CPU | ~15 ms GPU, ~0.45 s CPU (`decima:small` ~0.15 s) |
| `arbiter` | Gemma 3 4B IT with a LoRA and a fixed 24-slot head; noul, choices of up to 16 options, scores of exactly 6 levels (other questions are rejected); about 8 GB | ~0.15 s GPU for three or more questions |
| `nimble` | Bespoke Labs' Nimble (LoRA on Qwen3.5-9B): reads the whole request as a schema; calibrated; up to 255 options; needs a 24 GB GPU | ~2.3 s GPU |
| `jeeves` | PostHog's Jeeves-9B (no thinking): Qwen3.5-9B with a pointer head; calibrated; needs a 24 GB GPU | ~0.84 s GPU |
| `clef` | Cloudflare's Clef-Flash: Qwen3.5-9B with a joint schema head, all questions in one pass; well calibrated without a temperature; needs a 24 GB GPU | ~0.53 s GPU |
| `jeb` | Jebadiah (Qwen3.5 4b/9b, Qwen3.8 27b) on llama.cpp; per-type calibration | `jeb:9b` ~0.12 s GPU |
| `cygnet` | Frozen Gemma 4 12B IT with Cygnet's letter prompt; 0.683 on typed decisions; calibrated; up to 20 options | ~0.2 s GPU |

Start with `winnow:e4b` on an NVIDIA GPU or `laya` without one, and escalate unclear answers as
described in "Choose local or hosted".

## Presets

Built-in question sets, usable as `preset` (MCP), `--preset` (CLI):

- `triage`: intent (refund, technical_help, billing_question, information, cancellation, other),
  is_urgent, frustration (0–3), refund_requested, churn_risk. State: a customer `message`.
- `email`: category, is_spam, is_phishing, urgency, needs_reply. State: an email `body`.
- `guard`: jailbreak, prompt_injection, sensitive_data, harm_severity, topic. State: a `prompt`.
- `moderation`: toxic, harassment, threat, spam, severity. State: a `post`.
- `router`: difficulty, domain, needs_tools, is_sensitive. State: a `request`.
- `agent`: action (run, ask, block), on_task, risk (0–2), destructive. Reviews a command an
  agent is about to run. State: the user's `request` and the `command`.

A preset's instructions refer to a field (`message`, `body`, `prompt`, `post`, `request`, or
`request` and `command`). Pass the
state as an object with that field, or as a plain string.

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
- **score**: 3–5 levels, lowest first, each described concretely. The answer is the expected level
  (it can fall between levels), with a `legend`.
- **noul**: phrase one statement that is true or false ("Does the customer ask for a refund?").
  Avoid double negatives and two questions in one.
- Name the state's field in `instructions` (`` `ticket` ``) when the state is an object.
- Keep instructions short and literal. The model reads them; it does not follow long prompts.

## Reading answers and acting on them

| `type` | Fields |
|---|---|
| `choice` | `choice`, `confidence` (0–1), `probabilities` per option |
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

1. Pick questions: the `triage` preset, or your own `team`/`urgency` set.
2. For each ticket, call `decide` with `{"model": "laya", "state": {"message": ticket_text}, "preset": "triage"}`,
   or on Workers AI call `post_accounts_ai_run` with the `triage` questions under `input`.
3. Route by `intent`, flag `is_urgent` ≥ 0.8 or `frustration` ≥ 2, and send `churn_risk` ≥ 0.8 to
   a retention queue. Put every ticket with a low-confidence intent in a "needs review" list.
4. Report a table: ticket, action, and the probabilities behind it.

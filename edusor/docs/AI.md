# AI configuration

EduSOR talks to any **OpenAI-compatible Chat Completions API** (`POST {AI_API_BASE_URL}/chat/completions`)
with JSON-mode responses. Change provider or model through environment variables only.

| Variable | Example |
|---|---|
| `AI_API_BASE_URL` | `https://api.openai.com/v1`, an Azure/OpenRouter/self-hosted (vLLM, Ollama) compatible URL |
| `AI_API_KEY` | provider key (server only) |
| `AI_MODEL_TEXT` | model for structuring, grading, explanations (must support JSON mode) |
| `AI_MODEL_VISION` | vision-capable model for OCR of scans and photos |
| `AI_TIMEOUT_MS` | default 60000 |
| `AI_MAX_RETRIES` | default 2 (429/5xx/timeouts, exponential backoff) |

Leave `AI_API_KEY` empty to disable AI. The UI then states that AI is unavailable; nothing pretends
to have been generated.

## Where AI is used

| Feature | Code | Output validation |
|---|---|---|
| OCR of scanned pages/photos | `ai/tasks.ts › ocrImage` | `{text, uncertain, notes}`; unclear fragments are marked `⟦?…?⟧` |
| Document → questions | `structureDocument` → `toEditableQuestion` | strict conversion; missing keys stay empty and block publishing |
| Grading suggestion | `suggestGrade` (grading worker) | criterion scores clamped to rubric maxima server-side; confidence < 0.7 → manual review |
| Error summary for teachers | `summarizeErrors` | anonymized answers only |
| Mistake explanation / follow-up | `explainMistake`, `followUp` | context built with the student's RLS client |
| Practice question | `generatePractice` | key stored server-side; checked deterministically |

Every response is parsed as JSON and validated with Zod; one corrective retry is made if the
model returns an invalid shape. Usage (tokens, latency, success) goes to `ai_usage`; failures to
`system_errors`.

## Data protection

- Student names, emails and logins are **never** sent to the provider. Grading prompts contain only
  the question, rubric, reference answer and the answer content.
- Student-facing AI only receives data the student can read after release: their answer, the
  released key/rubric (if the teacher allowed it) and released feedback. If the key was not
  released, explanations are disabled.
- Untrusted content (documents, student answers, chat messages) is fenced in tags, the model is
  told it is data, and tag look-alikes inside it are neutralized. Prompt-injection attempts in
  answers are expected to lower confidence and force manual review — the teacher always approves.

## Teacher controls (per assessment)

Show correct answers · AI explanations · follow-up questions · practice · release mode ·
grading profile (strict / balanced / supportive — affects only borderline interpretation, never the
maximum or factual correctness) · per-question “reveal after release”.

## Mock server (development only)

`scripts/mock-ai-server.ts` imitates the API deterministically so pipelines can be tested without a
key. All of its text starts with `[MOCK AI]`. Never point production at it.

## Status in this repository

The integration with a real provider has **not** been exercised in the development environment
where EduSOR was built (no provider key was available); all AI flows were verified end-to-end
against the mock server. Before production, run the super-admin connection test and try one
document, one grading suggestion and one explanation with the real model.

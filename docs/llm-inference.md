# LLM Inference (MVP)

Arx inference is **platform-first** for MVP:

- **Platform**: Arx-provided direct-to-provider inference (paid tiers).
- **No user-key fallback in MVP**: requests do not auto-fallback to user-managed provider keys.

Inference turns are served through `supabase/functions/agent_turn`.

## Model routing (cloud-canonical)

The model picker is driven by `public.model_registry`.

Recommended:
- Populate `provider_model` for each model row.
- Set `platform_enabled` per model to control platform availability.

Transition fallback (optional):
- If `provider_model` is `NULL`, platform routing can fall back to an Edge secret `PLATFORM_MODEL_MAP_JSON`.

## Provider keys

### Platform keys (Arx)

Stored as **Supabase Edge Function secrets**:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GOOGLE_API_KEY`
- `XAI_API_KEY`

Master switch:
- `ARX_PLATFORM_INFERENCE_ENABLED=true|false`

## Quotas + behavior

- Paid tiers default to **platform** inference when enabled.
- Free tiers receive `platform_inference_not_allowed`.
- When platform quota is exhausted, the server returns `code: "platform_inference_quota_exceeded"`.
- Arx does **not** auto-fallback to alternate user-key inference paths.

### Quota accounting (current MVP behavior)

- Platform quota units are consumed **at request start** (before the provider call).
- Platform quota is **not** consumed for obvious platform misconfiguration (missing secrets / missing model routing).

## Error codes (server → client)

Non-exhaustive, used for UX:

- `platform_inference_quota_exceeded` (403)
  - Includes: `provider`, `model_id`
- `platform_inference_misconfigured` (503)
  - Includes: `provider`, `model_id`, and misconfiguration hints
- `rate_limited` (429)
  - Includes: `retry_after_seconds` (+ `Retry-After` header)

## Manual test cases

1. **Quota exhausted**
   - Force a user to quota=0 → run a model → expect `platform_inference_quota_exceeded`.
2. **Plan gating**
   - Free-tier user runs a platform-only model → expect `platform_inference_not_allowed`.
3. **Platform misconfig**
   - Enable `ARX_PLATFORM_INFERENCE_ENABLED=true` but omit a required provider secret → expect `platform_inference_misconfigured`.
4. **Rate limiting**
   - Rapidly fire requests → expect `rate_limited` with a friendly message and retry hint.

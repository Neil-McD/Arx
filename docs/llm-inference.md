# LLM Inference (MVP)

Arx supports two inference sources:

- **Platform**: Arx-provided direct-to-provider inference (builders on paid tiers).
- **BYOK**: user-provided direct-to-provider API keys (per provider).

This is implemented for Web via `supabase/functions/openrouter_turn` (legacy name).

## Model routing (cloud-canonical)

The model picker is driven by `public.model_registry`.

Recommended:
- Populate `provider_model` for each model row.
- Set `platform_enabled` / `byok_enabled` per model to control availability.

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

### BYOK keys (user)

Stored server-side via `/functions/v1/provider_key` (Vault-backed). The client only reads `has_key`; secrets are never returned to the UI.

Providers:
- `openai`, `anthropic`, `google`, `x-ai`

## Quotas + consent (no silent spend)

- Paid tiers default to **platform** inference when enabled.
- Free tier is **BYOK-only**.
- When platform quota is exhausted, the server returns `code: "platform_inference_quota_exceeded"` and the web UI prompts the user before using BYOK.
- Arx does **not** auto-fallback to BYOK (no spending the user’s key without explicit action).

### Quota accounting (current MVP behavior)

- Platform quota units are consumed **at request start** (before the provider call).
- Platform quota is **not** consumed for obvious platform misconfiguration (missing secrets / missing model routing).

## Error codes (server → client)

Non-exhaustive, used for UX:

- `platform_inference_quota_exceeded` (403)
  - Includes: `provider`, `model_id`, `byok_allowed`, `has_byok_key`
- `platform_inference_misconfigured` (503)
  - Includes: `provider`, `model_id`, `byok_allowed`, `has_byok_key`, and `misconfig` hints
- `byok_inference_not_allowed` (403)
  - Includes: `model_id`
- `rate_limited` (429)
  - Includes: `retry_after_seconds` (+ `Retry-After` header)

## Manual test cases

1. **Quota modal (no auto fallback)**
   - Force a user to quota=0 → run a model → expect quota modal; no BYOK call happens until the user clicks “Use my API key”.
2. **BYOK gating**
   - Set `model_registry.byok_enabled=false` for a model → quota modal should not offer “Use my API key”; user can “Change model”.
3. **Platform misconfig**
   - Enable `ARX_PLATFORM_INFERENCE_ENABLED=true` but omit a required provider secret → expect `platform_inference_misconfigured` + prompt to use BYOK.
4. **Rate limiting**
   - Rapidly fire requests → expect `rate_limited` with a friendly message and retry hint.


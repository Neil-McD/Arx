# Irreducible Core Contract (MVP)

Status: active  
Scope: deletion boundary + production hardening baseline

## Canonical Surface Keep-List

These surfaces are non-negotiable for MVP and must not be deleted during reduction passes:

1. Tier system:
   - anonymous free
   - authenticated free
   - internal architect/dev-only
2. Canonical community interaction substrate + canonical community UX.
3. Community agentic harness + community AI feed + community research.
4. Project-bound workspace tools.
5. User-funded ChatGPT-auth lane for OpenAI inference.
6. Voice UX.
7. Community monetization rails (including Stripe Connect Express onboarding).

## Community Surface (Must Keep)

Community nav tabs:

- Chat
- Resources
- Members
- Settings
- AI Agent
- Analytics

Core AI-agent paths:

- Active community agent landing
- Active community system prompt
- Draft list/upsert/activate RPC paths

## Inference and Auth (Must Keep)

- User-funded ChatGPT lane path for eligible OpenAI aliases.
- Platform and public fallback lanes.
- Workspace tooling remains available to authenticated users with sufficient tool balance.
- Public and private edge routing contracts remain explicit.

## Monetization Rails (Must Keep)

- Public funnel -> checkout start -> checkout finalize -> webhook chain.
- Connect onboard start (Stripe Connect account onboarding).
- Webhook idempotency + entitlement reconciliation path.

## Voice UX (Must Keep)

- Web voice capture + transcription path.
- `voice_transcribe` edge endpoint deployment.

## Deletion Boundary Rule

Safe deletions are limited to dead code and duplicate/legacy paths outside this contract.  
Any change to a listed surface must:

1. Update this document.
2. Keep `scripts/irreducible_core_contract_guard.sh` passing.
3. Keep `scripts/foundation_baseline_gate.sh` passing.

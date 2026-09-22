# Luna 6 migration: accounting foundation

Status: workflow canary implemented and verified on staging on 2026-09-22. Canary selector is now disabled. Production and new admissions remain GPT-5.6 Luna; broader runtime acceptance is still required before switching the default. No production data migration is required for this foundation.

## Authority

The monthly founder usage cycle owns the allowance and its accumulated reserved/settled balance. Each newly authorized inference receipt owns an immutable model/pricing snapshot. Reclaiming a receipt preserves that snapshot. Settlement uses the snapshot, never current environment rates or the current model default. Changing models must not reset a cycle or reprice completed runs.

Subscription receipts created before this addition retain their existing cycle-rate settlement path for `gpt-5.6-luna` and `founder_plan_luna_v1`. Older operator-funded receipts have no stored rate snapshot and still require the legacy environment configuration. Before changing those environment values, drain or reconcile all pre-snapshot operator receipts; do not invent their historical rates. New operator receipts snapshot rates before provider start.

## Prepared Luna 6 profile

Source: https://developers.openai.com/api/docs/models/gpt-6-luna (reviewed 2026-09-22).

Exact model: `gpt-6-luna`, Responses transport, 1,050,000 context tokens. Standard pricing per million tokens: input $0.10, cached input $0.01, cache writes $0.125, output $0.50. Above 272,000 input tokens, input/cache rates double and output rates multiply by 1.5 for the full request. Integer arithmetic rounds once to microdollars.

This profile admits Standard processing only. Regional premiums, Fast, Batch, and Flex are not represented. The workflow runtime explicitly enforces this service configuration.

Accounting accepts disjoint ordinary/cached/cache-write input counts, with promptTokens representing their sum. The provider adapter must normalize the actual provider usage schema to that contract; absent fields must not be assumed to mean zero without provider evidence. Luna 6 settlement rejects missing breakdowns, invalid counts, and altered versioned rates. Reasoning output must be included in completionTokens according to provider usage semantics.

## Remaining activation gates

1. Verify access to this exact model with Polynet's provider account.
2. Pin runtime dispatch to the admitted receipt model; ensure retries cannot select a new default for an old receipt.
3. Propagate verified usage breakdowns through all success and failure paths. Handle incomplete usage through the existing indeterminate/reservation path.
4. Confirm reasoning settings, tools, streaming, images, structured outputs, latency, and per-run reservation adequacy.
5. Compare representative member-agent, community-agent, workflow, and setup tasks on staging. Prove form -> delivered agent response -> next form and human approval holds.
6. Review active model-specific product terms/documentation, retaining historical versions.
7. Switch the shared active model only after these checks; release through main and explicit Convex deployment. Retain both pricing profiles for settling in-flight receipts during rollback.

## Verification

Behavior tests cover frozen subscription/operator pricing, pre-snapshot settlement, new model settlement in the same existing allowance cycle, cached and cache-write usage, the long-context threshold, missing/invalid usage, and invalid price profiles. Existing receipt lifecycle tests continue to cover replay, expiration, funding authority, and incomplete usage.

## Workflow canary slice

The server-only `POLYNET_LUNA6_WORKFLOW_CANARY_COMMUNITY_ID` selects Luna 6 only for new workflow receipts in one exact community. Other surfaces and communities retain 5.6. Unsetting the selector stops new Luna 6 admissions; reclaimed receipts keep their recorded model. The worker resolves that model before input budgeting, then verifies its funding claim has the same model before provider start.

The Responses adapter requests Standard processing and low reasoning for Luna 6. It reads `usage.input_tokens_details.cached_tokens` and `cache_write_tokens` explicitly; missing values remain unknown. Each provider response ID, returned model, tier, and usage breakdown is retained on the receipt. Settlement validates unique response IDs and token totals, applies long-context pricing separately to each request, and sums the resulting microdollar costs. Missing request usage follows the existing indeterminate path. No runtime changes are made to member-agent or setup model selection in this slice.

Reference: https://developers.openai.com/api/docs/guides/prompt-caching#monitor-cache-performance

## Staging acceptance — 2026-09-22

Backend commit `1518ee1c0` was deployed to `quick-porcupine-949`; production was untouched. A synthetic member submitted the intake form through the browser. The workflow automatically delivered a real GPT-6 Luna response and requested the next form without manual reconciliation. Both forms were submitted, and the owner dossier displayed all three actions verified and “Awaiting human approval.”

One Standard provider request settled: 1,590 input tokens (3 ordinary, 0 cache reads, 1,587 cache writes), 23 output tokens, 211 microdollars ($0.000211). Two completion replays left exactly one Luna 6 receipt, three finished actions, and two submitted forms. No final milestone approval was performed.

The canary environment selector was removed after the proof. Readback selected 5.6 for a new admission and retained 6 for the existing receipt. Automated validation: 1,604 tests across 178 files, Convex typecheck, founder inference contract proof, and community serve-worker contract proof passed.

See `artifacts/luna6-workflow-staging-20260922/acceptance.md` and `receipt.json`. This proves a small text workflow on operator-grant funding, not all modalities, subscription-funded live settlement, or all agent surfaces. Remaining work is representative member/community/setup compatibility, reservation and input-limit review, and a separately authorized production release.

## Member-agent canary slice

`POLYNET_LUNA6_MEMBER_CANARY_COMMUNITY_ID` is a separate server-only selector for new `member_agent_dock` receipts in one exact community. The member runtime resolves the model before recording the run and before input budgeting. It refuses to resume a persisted run under a different model, and it checks the later funding claim against the admitted model before provider start. Streaming and nonstreaming turns send each successful provider response through the same usage collector used by workflow replies. A missing Luna 6 request breakdown remains indeterminate; existing 5.6 aggregate settlement is unchanged. No global default changes in this slice.

# Auth + Money + Access Matrix (Canonical Contract)

Status: active
Last verified: 2026-07-21
Scope: canonical web runtime, community monetization, provider-funded inference, and premium-tool accounting

## 0) Current Account Ladder

1. `anonymous free`
   - one local guest thread
   - no provider connection
   - no community membership
   - no paid-tool balance
2. `authenticated free`
   - can own one community
   - can join and use communities when membership/entitlement exists
   - can connect Stripe and monetize paid community access
   - pays the default 10% Polynet platform fee on paid community revenue
   - uses the included Polynet runtime
3. `architect`
   - internal account-tier value for Polynet Premium
   - can own two communities
   - unlocks Codex and future premium runtimes, web research, and premium tool usage

The product-facing model is Free plus Polynet Premium. The internal account-tier enum remains `free | architect`; `architect` is the Premium entitlement label.

Canonical persistence is sparse: no row means Free. `userEntitlements` may hold at most one current `admin_override` row and one current `premium_subscription` row. One bounded fail-closed resolver owns tier selection; callers must not read or interpret this table directly.

## 1) Irreducible Contract

The active system is defined by these inputs:

1. Surface: `web`
2. Auth state: `anonymous` | `authenticated`
3. Account tier: product-facing Free or Polynet Premium; internal enum `free | architect`
4. Requested funding source: `demo_public` | `platform` | `user_key` | `user_chatgpt` | `auto`
5. Provider connection state: ChatGPT connected, OpenAI key connected, or neither
6. Active community lens: absent | present and server-validated
7. Active project context: absent | present
8. Community access state: owner, active membership, approved entitlement, pending, blocked, or visitor
9. Community billing state: open, approval-gated, paid subscription, checkout pending, provider verified, or unavailable
10. Premium usage ledger state: available, unavailable, reserved, settled, or released

And these outputs:

1. Runtime lane: `public` | `platform` | `chatgpt` | denied
2. Resolved funding source: `demo_public` | `user_key` | `user_chatgpt` | null
3. Entitled capability families
4. Active capability families for this run
5. Community funnel action: join, request access, checkout, enter, or blocked
6. Community creation allowance
7. Paid community checkout availability
8. Paid-tool execution allowance

## 2) Routing And Funding Rules

1. Server code decides the runtime lane. The client is projection only.
2. `demo_public` routes to the public lane when allowed.
3. `user_chatgpt` requires authentication and a ChatGPT connection, then routes to `chatgpt`.
4. `user_key` requires authentication and a connected key, then routes through the cloud platform lane with user-funded inference.
5. `platform` currently prefers connected user-funded providers:
   - ChatGPT connection -> `chatgpt` lane with `user_chatgpt` funding
   - OpenAI key connection -> `platform` lane with `user_key` funding
   - no provider -> denied with `provider_connection_required`
6. Authenticated free users should not receive Polynet-funded inference by default.
7. ChatGPT auth or an OpenAI key does not grant community access, payout readiness, or workspace-tool entitlement.

## 3) Capability Rules

Entitled capability families come from auth state and account status:

| Auth state | Tier | Entitled capability families |
|---|---|---|
| anonymous | n/a | `[]` |
| authenticated | `free` | `["product_docs","community_tools"]` |
| authenticated | Polynet Premium (`architect`) | `["product_docs","community_tools","web_research","sandbox_tools","workspace_tools"]` |

Active capability families are narrower than entitled capability families:

1. `product_docs` can be active for authenticated users.
2. `community_tools` is active only when a community lens is present.
3. `web_research` can be active when entitled.
4. `sandbox_tools` can be active for Premium users and exposes run-scoped file/shell tools.
5. `workspace_tools` is active only when entitled and a project context is present; it adds project-bound terminal/computer runtime controls.

Tool exposure is not free usage. Project workspace tools, web research, and other premium tools require Premium entitlement.

## 4) Prompt Context Rules

Prompt injection is not tiered. Authenticated Free and Polynet Premium accounts use the same platform harness prompt stack.

1. Community prompt context is injected only after backend community access validation.
2. Workspace/project context is injected only when the thread has an active project context.
3. Capability families decide active tools; account labels do not select a different prompt stack.
4. Prompt code must not branch on Builder, Pro, or ad hoc paid-plan labels. It should consume normalized tier/capability context.

## 5) Community Money Rules

1. Free authenticated users can create one community.
2. Polynet Premium users can create two communities.
3. Existing owned communities are preserved when limits change; `max_communities` only gates creating another community.
4. Community creation is limited by `max_communities`, which is projected from backend entitlement state.
5. Paid community checkout requires:
   - paid community entry policy
   - active price point
   - owner payout access
   - ready Stripe Connect account with charges and payouts enabled
6. Stripe Checkout redirects are UX only.
7. Stripe webhook/provider verification and backend checkout finalization are authoritative.
8. Paid access becomes real only after backend entitlement, membership, claim, and subscription state agree.
9. Payout readiness is separate from member entitlement.
10. Community role is separate from paid access.
11. The default platform fee for free-account community revenue is 10%.
12. Legacy paid creator billing does not create or renew Polynet Premium access.
13. Community creator revenue uses the Stripe Connect subscription path: Stripe routes creator revenue to the connected account and Polynet keeps the configured application fee. Polynet does not run a separate creator payout ledger or gestation period for community revenue.
14. Recurring invoice success/failure, subscription changes, full refunds, and disputes must converge through backend community subscription lifecycle state.
15. Full refunds revoke paid community access. Partial refunds retain access unless the subscription lifecycle later says otherwise. Failed or canceled refunds restore from current Stripe subscription truth.
16. Disputes and chargebacks suspend paid community access when opened, stay revoked when lost, and restore only from valid Stripe subscription truth when won or funds are reinstated.

## 6) Premium Tool Accounting Rules

Polynet Premium entitlement is the product-facing access rule for premium tools. Internally, premium tool usage is still ledgered for provider-cost accounting.

1. Workspace tools should reserve accounting capacity before workspace infrastructure is created or used.
2. Workspace tools settle actual compute usage and release unused reservations.
3. Web research reserves before the call and strictly settles on success.
4. Provider, raw cost, priced usage, and settlement evidence must stay auditable.
5. Voice input reserves before transcription and strictly settles on success.
6. Failed tool calls should release reserved balance when no paid tool result was delivered.
7. Expired reservations are reconciled by scheduled backend cleanup.

## 7) Canonical Files

- Gate engine: `/Users/neilmcdevitt/code/arx/shared/canonicalGateEngine.ts`
- Account entitlement authority: `/Users/neilmcdevitt/code/arx/convex/accountEntitlementCore.ts`
- Account entitlement behavioral proof: `/Users/neilmcdevitt/code/arx/convex/accountEntitlementAuthority.test.ts`
- Gate parity matrix: `/Users/neilmcdevitt/code/arx/shared/contracts/gate_parity_matrix_v1.json`
- Prompt/context projection: `/Users/neilmcdevitt/code/arx/shared/runtimePrompt.ts`
- Billing/product truth: `/Users/neilmcdevitt/code/arx/docs/product/reference/billing-entitlements.md`
- Creator commerce and Stripe Connect: `/Users/neilmcdevitt/code/arx/convex/creatorCommerce.ts`
- Community checkout: `/Users/neilmcdevitt/code/arx/convex/communityCommerce.ts`
- Stripe webhook handling: `/Users/neilmcdevitt/code/arx/convex/httpBilling.ts`
- Premium tool accounting/pricing: `/Users/neilmcdevitt/code/arx/shared/workspaceCredits.ts`
- Premium tool ledger: `/Users/neilmcdevitt/code/arx/convex/workspaceCredits.ts`
- Workspace tool charge paths: `/Users/neilmcdevitt/code/arx/convex/workspaceRuntimeSession.ts`, `/Users/neilmcdevitt/code/arx/convex/workspaceTerminals.ts`
- Web research charge path: `/Users/neilmcdevitt/code/arx/convex/runtimeAgentLoop.ts`
- Voice charge path: `/Users/neilmcdevitt/code/arx/convex/httpVoice.ts`

## 8) Drift Policy

Any change to tier semantics, runtime lane routing, paid community checkout, Stripe Connect payout authority, or premium-tool accounting must:

1. Update this matrix and product billing docs together.
2. Regenerate product docs artifacts.
3. Keep `npm run check:gate-parity` green.
4. Keep `npm run check:no-builder-plan-infra` green.
5. Keep `npm run check:workspace-credit-accounting-proof` green.
6. Keep `npm run check:platform-harness-prompt-contract` green.
7. Keep `npm run check:product-docs-index-proof` green.

# Auth + Money + Access Matrix (Canonical Contract)

Status: active
Last verified: 2026-05-07
Scope: canonical web runtime, community monetization, provider-funded inference, and paid-tool balance

## 0) Current Account Ladder

1. `anonymous free`
   - one local guest thread
   - no provider connection
   - no community membership
   - no paid-tool balance
2. `authenticated free`
   - can own two communities
   - can join and use communities when membership/entitlement exists
   - can connect Stripe and monetize paid community access
   - pays the default 15% Polynet platform fee on paid community revenue
   - uses ChatGPT or an OpenAI API key for personal inference
   - uses tool balance for workspace tools, web research, and voice input
3. `architect`
   - internal/dev-only access label
   - not a product-facing subscription tier
   - does not define the default monetization model

The product-facing model is a free authenticated account plus tool balance. The active account-tier contract is `free` plus the internal/dev-only `architect` label.

## 1) Irreducible Contract

The active system is defined by these inputs:

1. Surface: `web`
2. Auth state: `anonymous` | `authenticated`
3. Account tier: product-facing `free`; internal/dev-only `architect`
4. Requested funding source: `demo_public` | `platform` | `user_key` | `user_chatgpt` | `auto`
5. Provider connection state: ChatGPT connected, OpenAI key connected, or neither
6. Active community lens: absent | present and server-validated
7. Active project context: absent | present
8. Community access state: owner, active membership, approved entitlement, pending, blocked, or visitor
9. Community billing state: open, approval-gated, paid subscription, checkout pending, provider verified, or unavailable
10. Tool balance state: sufficient, exhausted, unavailable, reserved, settled, or refunded

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
| authenticated | `free` | `["product_docs","community_tools","web_research","workspace_tools"]` |
| authenticated | internal `architect` | `["product_docs","community_tools","web_research","workspace_tools"]` |

Active capability families are narrower than entitled capability families:

1. `product_docs` can be active for authenticated users.
2. `community_tools` is active only when a community lens is present.
3. `web_research` can be active when entitled, but execution still requires tool balance.
4. `workspace_tools` is active only when entitled and a project context is present.

Tool exposure is not free usage. Workspace tools, web research, and voice input must reserve and settle tool balance.

## 4) Prompt Context Rules

Prompt injection is not tiered. Authenticated free and internal architect accounts use the same platform harness prompt stack.

1. Community prompt context is injected only after backend community access validation.
2. Workspace/project context is injected only when the thread has an active project context.
3. Capability families decide active tools; account labels do not select a different prompt stack.
4. Tool balance must not hide paid tools from the harness. Workspace tools, web research, and voice input can be requested with zero credits, then fail through the balance-required top-up flow when they execute.
5. Prompt code must not branch on Builder, Pro, or product-facing paid-plan labels.

## 5) Community Money Rules

1. Free authenticated users can create two communities.
2. Community creation is limited by `max_communities`, not by requiring a new platform-plan checkout.
3. Paid community checkout requires:
   - paid community entry policy
   - active price point
   - owner payout access
   - ready Stripe Connect account with charges and payouts enabled
4. Stripe Checkout redirects are UX only.
5. Stripe webhook/provider verification and backend checkout finalization are authoritative.
6. Paid access becomes real only after backend entitlement, membership, claim, and subscription state agree.
7. Payout readiness is separate from member entitlement.
8. Community role is separate from paid access.
9. The default platform fee for free-account community revenue is 15%.
10. Legacy paid creator billing does not create or renew platform-plan access.
11. Community creator revenue uses the Stripe Connect subscription path: Stripe routes creator revenue to the connected account and Polynet keeps the configured application fee. Polynet does not run a separate creator payout ledger or gestation period for community revenue.
12. Recurring invoice success/failure, subscription changes, full refunds, and disputes must converge through backend community subscription lifecycle state.
13. Full refunds revoke paid community access. Partial refunds retain access unless the subscription lifecycle later says otherwise. Failed or canceled refunds restore from current Stripe subscription truth.
14. Disputes and chargebacks suspend paid community access when opened, stay revoked when lost, and restore only from valid Stripe subscription truth when won or funds are reinstated.

## 6) Paid-Tool Balance Rules

Tool balance is the product-facing meter for premium tools. Internally it is tracked as credit units.

1. Tool balance is non-refundable.
2. Tool balance top-ups use server-defined Stripe Checkout packs.
3. Workspace tools reserve balance before workspace infrastructure is created or used.
4. Workspace tools settle actual compute usage and refund unused reservation credits.
5. Web research reserves before the call and strictly settles on success.
6. Voice input reserves before transcription and strictly settles on success.
7. Failed tool calls should refund reserved balance when no paid tool result was delivered.
8. Expired reservations are reconciled by scheduled backend cleanup.

## 7) Canonical Files

- Gate engine: `/Users/neilmcdevitt/code/arx/shared/canonicalGateEngine.ts`
- Gate parity matrix: `/Users/neilmcdevitt/code/arx/shared/contracts/gate_parity_matrix_v1.json`
- Prompt/context projection: `/Users/neilmcdevitt/code/arx/shared/runtimePrompt.ts`
- Billing/product truth: `/Users/neilmcdevitt/code/arx/docs/product/reference/billing-entitlements.md`
- Creator commerce and Stripe Connect: `/Users/neilmcdevitt/code/arx/convex/creatorCommerce.ts`
- Community checkout: `/Users/neilmcdevitt/code/arx/convex/communityCommerce.ts`
- Stripe webhook handling: `/Users/neilmcdevitt/code/arx/convex/httpBilling.ts`
- Tool-balance pricing: `/Users/neilmcdevitt/code/arx/shared/workspaceCredits.ts`
- Tool-balance ledger: `/Users/neilmcdevitt/code/arx/convex/workspaceCredits.ts`
- Workspace tool charge paths: `/Users/neilmcdevitt/code/arx/convex/daytonaWorkspaceSession.ts`, `/Users/neilmcdevitt/code/arx/convex/workspaceTerminalBackgroundService.ts`
- Web research charge path: `/Users/neilmcdevitt/code/arx/convex/httpDaytona.ts`
- Voice charge path: `/Users/neilmcdevitt/code/arx/convex/httpVoice.ts`

## 8) Drift Policy

Any change to tier semantics, runtime lane routing, paid community checkout, Stripe Connect payout authority, or paid-tool balance must:

1. Update this matrix and product billing docs together.
2. Regenerate product docs artifacts.
3. Keep `npm run check:gate-parity` green.
4. Keep `npm run check:no-builder-plan-infra` green.
5. Keep `npm run check:workspace-credit-accounting-proof` green.
6. Keep `npm run check:platform-harness-prompt-contract` green.
7. Keep `npm run check:product-docs-index-proof` green.

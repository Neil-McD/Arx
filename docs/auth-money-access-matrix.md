# Auth + Money + Access Matrix (Canonical Contract)

Status: active
Last verified: 2026-05-06
Scope: canonical web runtime, community monetization, provider-funded inference, and paid-tool balance

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
   - uses ChatGPT or an OpenAI API key for personal inference
   - uses tool balance for Daytona workspaces, web research, and voice input
3. `builder` / `architect`
   - historical tier labels that may still exist in data
   - no self-serve platform subscription or checkout path
   - does not define the default monetization model

The self-serve Builder subscription has been removed. Builder status now means an authenticated user can create and manage a community; paid tools are funded through tool balance.

## 1) Irreducible Contract

The active system is defined by these inputs:

1. Surface: `web`
2. Auth state: `anonymous` | `authenticated`
3. Canonical tier: `free` | `builder` | `architect`
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

Entitled capability families come from auth state and tier:

| Auth state | Tier | Entitled capability families |
|---|---|---|
| anonymous | n/a | `[]` |
| authenticated | `free` | `["product_docs","community_tools","web_research","workspace_tools"]` |
| authenticated | `builder` / `architect` | `["product_docs","community_tools","web_research","workspace_tools"]` |

Active capability families are narrower than entitled capability families:

1. `product_docs` can be active for authenticated users.
2. `community_tools` is active only when a community lens is present.
3. `web_research` can be active when entitled, but execution still requires tool balance.
4. `workspace_tools` is active only when entitled and a project context is present.

Tool exposure is not free usage. Daytona, web research, and voice input must reserve and settle tool balance.

## 4) Community Money Rules

1. Free authenticated users can create one community.
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
9. The default platform fee for free-builder community revenue is 10%.
10. Legacy paid creator billing does not create or renew platform-plan access.

## 5) Paid-Tool Balance Rules

Tool balance is the product-facing meter for premium tools. Internally it is tracked as credit units.

1. Tool balance is non-refundable.
2. Tool balance top-ups use server-defined Stripe Checkout packs.
3. Daytona reserves balance before workspace infrastructure is created or used.
4. Daytona settles actual compute usage and refunds unused reservation credits.
5. Web research reserves before the call and strictly settles on success.
6. Voice input reserves before transcription and strictly settles on success.
7. Failed tool calls should refund reserved balance when no paid tool result was delivered.
8. Expired reservations are reconciled by scheduled backend cleanup.

## 6) Canonical Files

- Gate engine: `/Users/neilmcdevitt/code/arx/shared/canonicalGateEngine.ts`
- Gate parity matrix: `/Users/neilmcdevitt/code/arx/shared/contracts/gate_parity_matrix_v1.json`
- Billing/product truth: `/Users/neilmcdevitt/code/arx/docs/product/reference/billing-entitlements.md`
- Builder commerce and Stripe Connect: `/Users/neilmcdevitt/code/arx/convex/builderCommerce.ts`
- Community checkout: `/Users/neilmcdevitt/code/arx/convex/communityCommerce.ts`
- Stripe webhook handling: `/Users/neilmcdevitt/code/arx/convex/httpBilling.ts`
- Tool-balance pricing: `/Users/neilmcdevitt/code/arx/shared/workspaceCredits.ts`
- Tool-balance ledger: `/Users/neilmcdevitt/code/arx/convex/workspaceCredits.ts`
- Daytona charge paths: `/Users/neilmcdevitt/code/arx/convex/daytonaWorkspaceSession.ts`, `/Users/neilmcdevitt/code/arx/convex/workspaceTerminalBackgroundService.ts`
- Web research charge path: `/Users/neilmcdevitt/code/arx/convex/httpDaytona.ts`
- Voice charge path: `/Users/neilmcdevitt/code/arx/convex/httpVoice.ts`

## 7) Drift Policy

Any change to tier semantics, runtime lane routing, paid community checkout, Stripe Connect payout authority, or paid-tool balance must:

1. Update this matrix and product billing docs together.
2. Regenerate product docs artifacts.
3. Keep `npm run check:gate-parity` green.
4. Keep `npm run check:no-builder-plan-infra` green.
5. Keep `npm run check:workspace-credit-accounting-proof` green.
6. Keep `npm run check:product-docs-index-proof` green.

---
id: product.reference.billing_entitlements
title: Billing and Entitlements
audience: builder, member, llm, operator
status: alpha-current
last_verified: 2026-05-18
---

# Billing and Entitlements

## Definition

Billing is the payment system. Entitlements are the access truth derived from verified payment, grants, membership, or plan state.

Free authenticated users can build one owned community. The self-serve paid creator subscription has been removed. Tool balance is the canonical paid-tool meter for workspace tools, web research, and voice input. Tool balance is shown to users in dollars, is non-refundable, and is tracked internally as integer credit units. LLM inference should be supplied through the user's connected ChatGPT account or OpenAI API key.

## Builder Revenue Path

The simple cash path is:

1. A builder creates a community with a clear member promise.
2. The builder configures paid access and connects payout readiness where required.
3. The builder shares the community funnel.
4. A prospective member signs in and chooses the paid access path.
5. Checkout sends the member through the payment provider.
6. Checkout finalization and provider/webhook verification create or update backend entitlement.
7. The member can enter the community only after backend access truth exists.
8. Builder revenue and payouts remain tied to verified provider and community revenue state.

This is the product value loop: the builder packages expertise into a community intelligence system, members pay for access to that system, and Polynet keeps access and payout state explicit.

The current default platform fee for free-account community revenue is 10%. Legacy paid creator billing does not create or renew platform-plan access.

Community creator revenue uses Stripe Connect subscriptions, not a Polynet-managed creator payout ledger. Stripe routes the creator share to the connected account, Polynet keeps the configured application fee, and Stripe Connect remains the payout/KYC/compliance authority. The 30-day risk hold and 14-day payout buffer apply to Builder Partner commissions, not to ordinary community creator revenue.

Community member access follows provider-backed subscription truth. Recurring invoice success refreshes the active subscription window. Payment failure follows Stripe subscription lifecycle state, usually a `past_due` grace state before terminal revocation. Full refunds revoke paid community access immediately. Partial refunds retain access unless subscription state later changes. Failed or canceled refunds restore from current Stripe subscription truth. Disputes and chargebacks suspend access when opened, remain revoked when lost, and restore only when Stripe shows a valid subscription after a win or funds reinstatement.

Paid-tool usage is priced through tool balance. Workspace tool usage targets 60% gross margin with a small initial compute hold, then settles raw elapsed workspace usage and releases unused reservations back to tool balance. Web research reserves from centralized estimates, then settles from provider billing evidence when available; xAI Search can report exact provider cost ticks, while OpenAI, Jina, and fallback paths may remain estimated. Voice input is priced from captured audio duration and the provider/model that actually transcribes it. Paid tools should write tool, vendor, Polynet price, raw vendor cost, cost-source evidence, and settlement evidence into the internal credit ledger. If final settlement cannot collect the full usage amount from an initial reservation plus remaining balance, the uncollected credits block future paid-tool reservations until the next top-up clears them before adding spendable balance.

Builder Partner commissions should not become payable from gross promises alone. Partner commissions are produced from eligible community revenue and settled paid-tool usage. Community-revenue commissions need provider invoice, payment, or charge evidence, and refunds or disputes must create explicit partner commission adjustments before payout execution. Paid-tool commissions are emitted only from settled paid-tool ledger rows, target 20% of collected paid-tool usage, and preserve a 40% PolyNet retained-revenue floor whenever vendor costs allow it. Commissions carry a 30-day risk hold before becoming payable, then must clear a 14-day payout review buffer before payout-cycle inclusion. There is no public minimum payout threshold; timing, risk checks, and approval policy control settlement eligibility. Partner payout settlement should run through system-generated monthly payout cycles: buffered payable commission rows are reserved into payout items, settlement amounts are normalized to cents, batches are revalidated before approval and execution, Stripe Connect transfers are idempotent, and items become settled only after transfer creation succeeds. Commission rows materialize open and carryforward settlement cents, while adjustment rows and payout items remain the audit truth. Payout cycles use explicit pending approval, held, rejected, failed, processing, and paid states. The payout period is separate from the payout attempt: failed, rejected, or stale released cycles must not block a later clean run for the same period, while active cycles and reserved payout items prevent duplicate money movement. Failed cycles with reserved items can be retried using the same transfer idempotency keys. Operators should only approve, retry, hold, or reject generated payout cycles; they should not manually preview, create, or execute payout internals. Approval schedules transfer execution automatically. If a refund or dispute creates post-payout partner overpayment, the negative balance carries forward against later eligible partner commissions before any new transfer is allowed.

## Payout Readiness

Paid communities need payout state to be understandable before launch. Stripe Connect or the active payout provider handles regulated payout setup, verification, and payout ability. Polynet should expose whether payouts are ready, pending, restricted, or require onboarding.

Payout readiness does not grant community access. It determines whether the builder can safely collect and receive community revenue through the supported payout path.

## Rules

1. Payment redirects are not authoritative.
2. Provider/webhook verification is authoritative.
3. Checkout finalization should be idempotent.
4. Community access should be evaluated per request.
5. Builder payouts must remain consistent with verified community revenue state.
6. Access should fail closed if billing evidence is missing or inconsistent.
7. Builders should be shown payout readiness before they rely on paid community revenue.
8. Paid access, management authority, and payout readiness are separate concepts.
9. Tool balance, not a platform subscription, is the source of truth for paid tool access.
10. Partner commission payouts must account for refunds, disputes, and chargeback outcomes before money movement.
11. Partner payout cycles must pass approval or clean auto-pay policy before Stripe transfer execution.
12. Partner payout cycles should include only payable commissions that have cleared the payout review buffer.
13. Community creator revenue stays Stripe-native unless Polynet intentionally changes to a held-funds payout architecture.
14. Full refunds and opened disputes revoke or suspend paid community access through backend subscription lifecycle state.
15. Paid-tool reporting should distinguish exact provider cost, estimated provider cost, and mixed provider evidence.

## Common Mistakes

- treating a successful redirect as membership
- treating role as paid access
- treating paid access as management authority
- showing frontend access before backend entitlement exists
- treating payout setup as proof that a member has access
- letting a paid community launch with unclear payout readiness
- treating pending partner commission as withdrawable before refund and dispute risk has cleared
- applying Builder Partner payout holds to ordinary community creator revenue
- treating estimated paid-tool provider cost as exact billing truth

## Related Concepts

- `entitlement`
- `access-model`
- `role`

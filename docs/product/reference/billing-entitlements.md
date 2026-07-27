---
id: product.reference.billing_entitlements
title: Billing and Entitlements
audience: builder, member, llm, operator
status: alpha-current
last_verified: 2026-07-21
---

# Billing and Entitlements

## Definition

Billing is the payment system. Entitlements are the access truth derived from verified payment, grants, membership, or plan state.

Free authenticated users can build one owned community. Polynet Premium is the self-serve account subscription: it unlocks a second community, Codex and future premium runtimes, web research, and premium tool usage. Existing owned communities remain active if limits change; the cap only gates creating another community. LLM inference outside Premium tooling may still be supplied through the user's connected ChatGPT account or OpenAI API key.

## Builder Revenue Path

The simple cash path is:

1. A builder creates a community with a clear member promise.
2. The builder configures paid access and connects payout readiness where required.
3. The builder shares the community funnel.
4. A prospective member signs in and chooses the paid access path.
5. Checkout sends the member through the payment provider.
6. Provider/webhook verification atomically creates or updates backend membership and subscription truth.
7. The member can enter the community only after backend access truth exists.
8. Builder revenue and payouts remain tied to verified provider and community revenue state.

This is the product value loop: the builder packages expertise into a community intelligence system, members pay for access to that system, and Polynet keeps access and payout state explicit.

The current default platform fee for free-account community revenue is 10%. Legacy paid creator billing does not create or renew platform-plan access.

Community creator revenue uses Stripe Connect subscriptions, not a Polynet-managed creator payout ledger. Stripe routes the creator share to the connected account, Polynet keeps the configured application fee, and Stripe Connect remains the payout/KYC/compliance authority. The 30-day risk hold and 14-day payout buffer apply to Builder Partner commissions, not to ordinary community creator revenue.

Community member access follows provider-backed subscription truth. Recurring invoice success refreshes the active subscription window. Payment failure follows Stripe subscription lifecycle state, usually a `past_due` grace state before terminal revocation. Full refunds revoke paid community access immediately. Partial refunds retain access unless subscription state later changes. Failed or canceled refunds restore from current Stripe subscription truth. Disputes and chargebacks suspend access when opened, remain revoked when lost, and restore only when Stripe shows a valid subscription after a win or funds reinstatement.

Public community checkout start has one bounded caller attempt identity. That identity owns one local checkout row, freezes the provider request, and supplies one deterministic Stripe idempotency key. Replays return the same still-open provider session; ambiguous failures preserve the local reconciliation record. Community subscription Checkout explicitly offers the synchronous card rail, including eligible card-backed wallets; Dashboard-enabled delayed-notification methods are outside the MVP community-checkout contract. Verified Stripe completion performs the first membership/subscription activation and checkout completion in one backend transaction. The checkout-success page is only an authenticated observer of that authority; it cannot grant access. Duplicate completion after a later refund or terminal lifecycle event cannot reactivate access.

Premium tool usage is entitled through Polynet Premium. Internally, paid tools should still write tool, vendor, Polynet price, raw vendor cost, cost-source evidence, and settlement evidence into the internal ledger so provider-cost accounting remains auditable.

Builder Partner commissions should not become payable from gross promises alone. Under the prospective v3 policy, new commissions are up to 4% of eligible settled community revenue after discounts and excluding tax; paid-tool usage does not create new partner commission. The commission is funded from Polynet's platform fee and is capped at the fee retained on the source transaction, so it never reduces the community builder's payout. Each new row records the economic policy version, basis definition, policy rate, effective rate, and source platform-fee rate. Existing v1/v2 ledger obligations keep their recorded economics. Community-revenue commissions require provider invoice, payment, or charge evidence, and refunds or disputes create explicit adjustments before payout execution. A valid referral must bind within 30 days and can earn for 12 months from its first authenticated bind. Commissions carry a 30-day risk hold before becoming payable, then must clear a 14-day payout review buffer before payout-cycle inclusion. There is no public minimum payout threshold; timing, risk checks, and approval policy control settlement eligibility. Partner payout settlement should run through system-generated monthly payout cycles: buffered payable commission rows are reserved into payout items, settlement amounts are normalized to cents, batches are revalidated before approval and execution, Stripe Connect transfers are idempotent, and items become settled only after transfer creation succeeds. Commission rows materialize open and carryforward settlement cents, while adjustment rows and payout items remain the audit truth. Payout cycles use explicit pending approval, held, rejected, failed, processing, and paid states. The payout period is separate from the payout attempt: failed, rejected, or stale released cycles must not block a later clean run for the same period, while active cycles and reserved payout items prevent duplicate money movement. Failed cycles with reserved items can be retried using the same transfer idempotency keys. Operators should only approve, retry, hold, or reject generated payout cycles; they should not manually preview, create, or execute payout internals. Approval schedules transfer execution automatically. If a refund or dispute creates post-payout partner overpayment, the negative balance carries forward against later eligible partner commissions before any new transfer is allowed.

## Payout Readiness

Paid communities need payout state to be understandable before launch. Stripe Connect or the active payout provider handles regulated payout setup, verification, and payout ability. Polynet should expose whether payouts are ready, pending, restricted, or require onboarding.

Payout readiness does not grant community access. It determines whether the builder can safely collect and receive community revenue through the supported payout path.

## Rules

1. Payment redirects are not authoritative.
2. Provider/webhook verification is authoritative.
3. Checkout finalization should be idempotent.
4. Checkout start should be caller-idempotent and browser responses must be authority-bound.
5. Community access should be evaluated per request.
6. Builder payouts must remain consistent with verified community revenue state.
7. Access should fail closed if billing evidence is missing or inconsistent.
8. Builders should be shown payout readiness before they rely on paid community revenue.
9. Paid access, management authority, and payout readiness are separate concepts.
10. Polynet Premium entitlement is the source of truth for premium tool access.
11. Partner commission payouts must account for refunds, disputes, and chargeback outcomes before money movement.
12. Partner payout cycles must pass approval or clean auto-pay policy before Stripe transfer execution.
13. Partner payout cycles should include only payable commissions that have cleared the payout review buffer.
14. Community creator revenue stays Stripe-native unless Polynet intentionally changes to a held-funds payout architecture.
15. Full refunds and opened disputes revoke or suspend paid community access through backend subscription lifecycle state.
16. Paid-tool reporting should distinguish exact provider cost, estimated provider cost, and mixed provider evidence.
17. A community membership and provider subscription must have one fail-closed subscription identity; duplicate rows are corruption, not a ranking problem.

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

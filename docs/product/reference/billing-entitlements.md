---
id: product.reference.billing_entitlements
title: Billing and Entitlements
audience: builder, member, llm, operator
status: alpha-current
last_verified: 2026-05-06
---

# Billing and Entitlements

## Definition

Billing is the payment system. Entitlements are the access truth derived from verified payment, grants, membership, or plan state.

Free authenticated users are builders by default for one owned community. The self-serve Builder subscription is deprecated. Tool balance is the canonical paid-tool meter for Daytona workspaces, web research, and voice input. Tool balance is shown to users in dollars, is non-refundable, and is tracked internally as integer credit units. LLM inference should be supplied through the user's connected ChatGPT account or OpenAI API key.

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

The current default platform fee for free-builder community revenue is 10%. Legacy paid creator entitlements may retain their previous terms until migrated or cancelled.

Paid-tool usage is priced through tool balance. Daytona workspace usage targets 50% gross margin by charging roughly 2x estimated vendor compute cost, then settling actual usage and refunding unused reservations. Web research and voice input use simple alpha tariffs with centralized vendor-cost estimates, and should still write tool, vendor, Polynet price, raw cost estimate, and settlement evidence into the internal credit ledger.

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
9. Tool balance, not a Builder subscription, is the source of truth for paid tool access.

## Common Mistakes

- treating a successful redirect as membership
- treating role as paid access
- treating paid access as management authority
- showing frontend access before backend entitlement exists
- treating payout setup as proof that a member has access
- letting a paid community launch with unclear payout readiness

## Related Concepts

- `entitlement`
- `access-model`
- `role`

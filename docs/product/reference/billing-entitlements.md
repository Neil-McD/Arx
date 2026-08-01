---
id: product.reference.billing_entitlements
title: Billing and Entitlements
audience: builder, member, llm, operator
status: alpha-current
last_verified: 2026-08-01
---

# Billing and Entitlements

## Definition

Billing is the payment system. Entitlements are the access truth derived from verified payment, grants, membership, or plan state.

Existing approved founders can keep building within their current community-count limits without a Polynet founder subscription. After the existing-founder cohort is initialized, accounts outside that cohort cannot create a community until the future founder plan exists. Polynet Premium remains a separate self-serve account subscription for Codex, premium runtimes, web research, hosted workspace tools, premium tool usage, and a second community; it is not the future founder plan.

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

Community creator revenue uses Stripe Connect subscriptions, not a Polynet-managed creator payout ledger. Stripe routes the creator share to the connected account, Polynet keeps the configured application fee, and Stripe Connect remains the payout/KYC/compliance authority. This creator-commerce path is independent of the retired Builder Partner program.

Community member access follows provider-backed subscription truth. Recurring invoice success refreshes the active subscription window. Payment failure follows Stripe subscription lifecycle state, usually a `past_due` grace state before terminal revocation. Full refunds revoke paid community access immediately. Partial refunds retain access unless subscription state later changes. Failed or canceled refunds restore from current Stripe subscription truth. Disputes and chargebacks suspend access when opened, remain revoked when lost, and restore only when Stripe shows a valid subscription after a win or funds reinstatement.

Premium tool usage is entitled through Polynet Premium. Internally, paid tools should still write tool, vendor, Polynet price, raw vendor cost, cost-source evidence, and settlement evidence into the internal ledger so provider-cost accounting remains auditable.

Builder Partner v1 is retired. It has no member or operator product surface and creates no new attribution, commission, adjustment, payout batch, payout item, payout transfer, or Stripe transfer. Its accepted terms remain an archived legal artifact.

The completed Partner retirement preserves `future_partner_grandfather_v1` only as historical identity and accepted-terms evidence for four legacy participants. It is not an entitlement, payout promise, balance, commission, active partner account, or founder-inference grant. The eight partner-derived `communityInferencePolicies` rows are migration residue from the superseded mental model and must be deleted by the bounded existing-founder cohort migration after an operator-controlled production backup.

The canonical grandfathering truth is founder-level `founderInferenceGrants`, seeded from an explicit list of exactly nine verified existing community owners. Partner status and per-community policy rows never authorize inference. One active founder grant and one encrypted OpenAI API key cover every community currently or subsequently owned by that founder.

For direct community-agent mentions, the member remains the permission and tool principal, the community agent remains the response identity, and the current community owner is only the payer and credential owner. Active owner-funded turns use fixed GPT 5.6 Luna and write one idempotent, privacy-bounded usage receipt. Missing or suspended funding fails closed without member or platform fallback. Approved founders retain the former requester-ChatGPT route only until they activate during the bounded cutover.

The terminal production inspection proved zero legacy source documents, zero financial rows, exact grant and policy evidence, no unexpected, mismatched, or duplicate records, and no truncation. The seven legacy Partner table schemas and the temporary migration code are deleted. The nine public retired tombstones remain only for cached-client compatibility and cannot read or write product or financial state.

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
9. Polynet Premium entitlement is the source of truth for premium tool access.
10. Builder Partner v1 must not enroll, attribute, accrue, adjust, mature, approve, or transfer money.
11. A legacy grandfather grant is preserved evidence only and must not authorize product access or payment.
12. Partner evidence and `communityInferencePolicies` must never authorize community inference.
13. Existing-founder inference eligibility comes only from the explicit nine-owner founder grant cohort; a grant is account-wide, not per-community.
14. Community creator revenue stays Stripe-native unless Polynet intentionally changes to a held-funds payout architecture.
15. Full refunds and opened disputes revoke or suspend paid community access through backend subscription lifecycle state.
16. Paid-tool reporting should distinguish exact provider cost, estimated provider cost, and mixed provider evidence.

## Common Mistakes

- treating a successful redirect as membership
- treating role as paid access
- treating paid access as management authority
- showing frontend access before backend entitlement exists
- treating payout setup as proof that a member has access
- letting a paid community launch with unclear payout readiness
- treating a grandfather record as an active entitlement, balance, or payout promise
- deriving founder inference eligibility from partner evidence or per-community policy rows
- conflating the community owner payer with the member permission principal
- falling back to a member or platform credential after owner funding is active
- storing founder API-key material inside `communityInferencePolicies`
- recreating the deleted legacy Partner tables or temporary migration code
- coupling retired Builder Partner concepts back into ordinary community creator revenue
- treating estimated paid-tool provider cost as exact billing truth

## Related Concepts

- `entitlement`
- `access-model`
- `role`

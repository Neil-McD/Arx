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

Existing approved founders can keep owner-funded API access for their legacy-eligible communities without a Polynet founder subscription. A new community is managed-funded and cannot inherit that legacy exception. Polynet Premium remains a separate account subscription for personal premium tools; it cannot authorize a community, increase community count, or change community revenue fees.

## Polynet Founder Plan

The irreducible founder plan is $79 USD monthly for one specific existing community. Stripe webhook state is authoritative. Checkout is community-targeted from the start: the owner selects the community before leaving Polynet, the pending checkout records that community, and the verified webhook creates a subscription already bound to it. There is no unattached subscription inventory and no later attach step. An active managed subscription satisfies community inference funding without asking the founder or members for ChatGPT or an OpenAI API key. It funds supported community inference through Polynet's server-side OpenAI credential on fixed GPT 5.6 Luna and never changes the requesting member's access or tool authority.

Each monthly cycle includes up to $20 in raw model cost. Before each supported managed turn, Polynet atomically reserves a configured worst-case amount from the remaining allowance; after provider usage is known, the reservation settles to the calculated token cost. Missing pricing evidence, an absent or ambiguous cycle, expired payment state, or exhausted allowance fails closed. The pricing configuration is explicit integer USD micros and must be sourced from a verified provider contract rather than guessed.

The first kernel meters direct community-agent mentions. Autonomous cognition and setup-generation still use their existing paths and must not be represented as covered until they pass the same subscription, metering, retry, and receipt contract. Founder Billing now exposes one card per owned community, community-targeted checkout, webhook-backed status, and the Stripe customer portal. Usage-based overage charging, future-founder creation/onboarding, detailed usage UI, and broader billing prompts remain later launch slices. Until production configuration and an authenticated canary are proven, the founder plan is not publicly live.

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

Every paid community uses one 2.9% Polynet application fee, whether its inference is funded by the $79 managed plan or by an approved legacy owner API key. Stripe processing fees are separate, are debited from the builder's connected account, and are not included in Polynet's 2.9%. The separate $20 personal Premium plan changes neither fee.

Community creator revenue uses direct Stripe Connect subscriptions on the builder's connected account, not platform-owned destination charges and not a Polynet-managed creator payout ledger. The connected account owns the member customer, product, price, charge, processor fee, subscription, and payout; Polynet collects only its application fee. Every local checkout, price, customer, and subscription record preserves the connected-account ID, and webhook events must match it before access state can change. This creator-commerce path is independent of the retired Builder Partner program.

Stripe account events and Connect events are separate webhook destinations with separate signing secrets. `STRIPE_WEBHOOK_SECRET` verifies Polynet-account events such as the $79 founder subscription. `STRIPE_CONNECT_WEBHOOK_SECRET` verifies events on connected accounts such as member checkout, renewals, refunds, and disputes. Member checkout fails before creating Stripe objects when the Connect secret is absent. A Connect event must contain the same top-level Stripe account ID stored on the local commerce record; a missing or different account fails closed. Event `livemode` must also match the configured Stripe credential so sandbox traffic cannot mutate live billing truth.

Community member access follows provider-backed subscription truth. Recurring invoice success refreshes the active subscription window. Payment failure follows Stripe subscription lifecycle state, usually a `past_due` grace state before terminal revocation. Full refunds revoke paid community access immediately. Partial refunds retain access unless subscription state later changes. Failed or canceled refunds restore from current Stripe subscription truth. Disputes and chargebacks suspend access when opened, remain revoked when lost, and restore only when Stripe shows a valid subscription after a win or funds reinstatement.

Premium tool usage is entitled through Polynet Premium. Internally, paid tools should still write tool, vendor, Polynet price, raw vendor cost, cost-source evidence, and settlement evidence into the internal ledger so provider-cost accounting remains auditable.

Builder Partner v1 is retired. It has no member or operator product surface and creates no new attribution, commission, adjustment, payout batch, payout item, payout transfer, or Stripe transfer. Its accepted terms remain an archived legal artifact.

The completed Partner retirement preserves `future_partner_grandfather_v1` only as historical identity and accepted-terms evidence for four legacy participants. It is not an entitlement, payout promise, balance, commission, active partner account, or founder-inference grant. The eight partner-derived `communityInferencePolicies` rows are migration residue from the superseded mental model and must be deleted by the bounded existing-founder cohort migration after an operator-controlled production backup.

The canonical grandfathering truth is the conjunction of a founder-level `founderInferenceGrant` and a community-level `legacy_byok_allowed` funding policy. The bounded R41NB0W retirement removed one never-activated founder and grant, leaving eight existing-founder grants. Partner status and retired Partner policy rows never authorize inference. During the bounded cutover, an unmarked pre-existing community owned by a grandfathered founder resolves as legacy for compatibility; every newly created community is explicitly `managed_required`. One active grandfathered founder grant and one encrypted OpenAI API key cover only that founder's legacy-eligible communities.

For direct community-agent mentions, the member remains the permission and tool principal and the community agent remains the response identity. An active grandfathered founder uses the owner's encrypted OpenAI key; an active attached founder subscription uses Polynet's server-side OpenAI key. Both paths use fixed GPT 5.6 Luna and write one idempotent, privacy-bounded usage receipt. A paid subscription attached to a community is canonical for that community and never falls back to a grandfathered key when inactive. Approved existing founders retain the former requester-ChatGPT route only until they activate during the bounded cutover.

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
11. Retired Partner grandfather evidence must not authorize product access or payment.
12. Partner evidence and `communityInferencePolicies` must never authorize community inference.
13. Existing-founder inference eligibility requires both the bounded founder-grant cohort and a legacy-eligible community; the grant is account-level but the funding policy is community-level.
14. Community creator revenue stays Stripe-native unless Polynet intentionally changes to a held-funds payout architecture.
15. Full refunds and opened disputes revoke or suspend paid community access through backend subscription lifecycle state.
16. Paid-tool reporting should distinguish exact provider cost, estimated provider cost, and mixed provider evidence.
17. A founder subscription authorizes exactly one attached community and must not widen member permissions.
18. Managed inference must reserve allowance before provider start and settle or retain that reservation deterministically.
19. Founder checkout must identify its community before redirect and may create at most one access-granting subscription for that community.
20. Platform-account and connected-account Stripe events must be verified with their respective webhook secrets and may mutate only their own billing domain.

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
- treating the $79 redirect as entitlement before the Stripe subscription webhook is verified
- selling an unattached subscription slot and deciding its community later
- silently falling back to a founder key when an attached paid subscription is inactive
- letting the $20 personal Premium plan alter community funding, limits, or revenue fees
- claiming that unmetered autonomous or setup inference is included in the first managed kernel
- recreating the deleted legacy Partner tables or temporary migration code
- coupling retired Builder Partner concepts back into ordinary community creator revenue
- treating estimated paid-tool provider cost as exact billing truth
- configuring only the platform Stripe webhook and expecting direct connected-account charges to update member access

## Related Concepts

- `entitlement`
- `access-model`
- `role`

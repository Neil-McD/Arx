---
id: product.reference.billing_entitlements
title: Billing and Entitlements
audience: builder, member, llm, operator
status: alpha-current
last_verified: 2026-08-02
---

# Billing and Entitlements

## Irreducible Model

Polynet has two live money rails:

1. A builder pays $79 USD monthly for Builder on each managed community.
2. Polynet keeps a 2.9% application fee from paid-member community revenue.

There is no personal Premium plan, commercial Free-versus-Premium tier, tool-credit purchase, top-up, auto-recharge, or card-backed tool-usage collection. Authenticated tool access is one product surface. Polynet absorbs tool/provider cost while retaining rate limits, provider quotas, and auditable cost evidence.

## Builder Funding

One active Builder subscription authorizes Polynet-hosted inference for exactly one attached managed community. Community visibility, public access, and member commerce remain independent from Builder funding. Stripe webhook state, not the redirect, is authoritative.

There are three customer-facing projections of this one offer:

1. **Create Community** explains Builder first, asks only for the community name and optional URL, creates the unlisted checkout draft, and starts checkout.
2. **Billing** shows each owned community's canonical funding state and the one valid next action: buy, resume checkout, fix payment, manage the subscription, or use the frozen legacy API lane where eligible.
3. **Account** summarizes Builder per community and sends the builder into the same offer or Billing action. It does not invent an account-wide commercial entitlement.

All three projections converge on the same checkout action, verified webhook state, community funding projection, and entitlement checks. No surface may infer access from its own local UI state.

A founder may own an unlimited number of communities. There is no account-level
numeric limit and no account-wide bundle: each managed community needs its own
current $79 subscription and its own allowance. The first community can be
created as the checkout draft. A builder can create each next community only
after every existing owned community has current canonical funding. Exact active
legacy BYOK and the operator grant satisfy that funding check for their eligible
communities; an unfunded draft blocks another draft.

Each $79 monthly cycle includes up to $20 in raw GPT 5.6 Luna model cost for that community. Before supported managed inference begins, Polynet reserves a bounded worst-case amount from the community's current allowance and settles it to calculated token cost after provider usage is known. Missing pricing evidence, ambiguous cycle state, inactive payment state, or exhausted allowance fails closed.

The same funding kernel covers direct community-agent mentions, autonomous community cognition, and AI-assisted community setup. If funding is missing or inactive, only AI execution fails closed. Publishing, Discover visibility, public funnels, public joins, and paid-member checkout continue under their own visibility, access, and commerce rules. The payer never receives extra member permissions or tool authority.

There are exactly three funding lanes, resolved per community rather than as an account tier:

- A frozen legacy-eligible community may use the owner's encrypted API key or switch that community to Builder. Eligibility requires both the exact founder grant and the stored `legacy_byok_allowed` community policy; it never expands based on the current date. The transitional requester-ChatGPT lane is retired.
- One active canonical `operatorRoles.owner` row grants the platform operator included Builder funding. It creates no simulated Stripe state and bypasses neither community authorization, rate limits, usage receipts, nor provider-cost accounting.
  The operator grant has no artificial numeric community cap.
- Every other community, including every newly created community, uses Builder. There is no general BYOK enrollment path.

## Paid-Member Community Revenue

Paid-member commerce remains independent from Builder funding:

1. The community owner completes Stripe Connect payout onboarding.
2. The builder configures `paid_subscription` entry policy and an active price point.
3. A member enters through the canonical community funnel and completes a `community_join` checkout on the builder's connected account.
4. Provider/webhook verification creates the purchase claim, subscription lifecycle, membership, and access truth.
5. The connected account owns the member customer, product, price, charge, processor fee, subscription, and payout. Polynet keeps only its 2.9% application fee.

Stripe processing fees are separate from Polynet's 2.9%. The fee is the same whether community inference is funded by $79 managed funding, grandfathered BYOK, the operator grant, or is currently unfunded.

Full refunds revoke paid access; partial refunds retain access unless subscription state says otherwise. Opened disputes suspend access. Each successful partial or full refund reverses the cumulative proportional share of Polynet's application fee through an idempotent provider-scoped ledger. Pending, failed, and canceled refunds reverse no fee.

Platform-account events use `STRIPE_WEBHOOK_SECRET`. Connected-account member-commerce events use `STRIPE_CONNECT_WEBHOOK_SECRET`. Provider account identity and live/test mode must match local commerce records before state can change.

## Provider Cost and Historical Finance

Successful tool and infrastructure use records vendor, cost category, measured quantity, raw provider cost, evidence source, and whether evidence is exact or estimated. This is cost accounting, not a user credit ledger and not an entitlement.

Historical tool-credit balances, top-up checkout rows, reservations, collections, and settlement evidence remain readable for liability reconciliation. They cannot be newly created, purchased, recharged, collected, or used to authorize product access. Fail-closed endpoint shells may remain only where the cached-production-client contract requires the old function name.

## Rules

1. Redirects are UX only; verified provider/webhook state is authoritative.
2. Checkout finalization is idempotent.
3. Builder funding, visibility, member access, management authority, and payout readiness are separate truths.
4. One $79 subscription attaches to one managed community and authorizes its hosted AI allowance.
5. Community ownership has no numeric cap, but every existing community must be currently funded before another checkout draft can be created.
6. Paid-member revenue always uses the 2.9% application fee.
7. Connect payouts and proportional application-fee refunds remain active.
8. Legacy BYOK requires both exact founder-grant and community-policy evidence.
9. The operator grant derives only from one active canonical owner role.
10. Provider-cost records and usage receipts remain active even when Polynet absorbs cost.
11. Historical retired financial rows are audit evidence only and grant no access.

## Common Mistakes

- treating a successful redirect as entitlement
- selling an unattached Builder subscription
- treating $79 as an account-wide community bundle
- restoring an account-level community cap or allowing stacked unpaid drafts
- letting Builder funding hide, unpublish, or disable ordinary community commerce
- letting Builder funding widen member permissions
- changing the 2.9% fee based on community inference funding
- configuring only the platform webhook and expecting Connect commerce to converge
- revoking access after a refund without reversing the proportional application fee
- restoring requester ChatGPT, Premium, tool credits, top-ups, card collection, or auto-recharge
- deleting historical financial evidence before reconciliation
- hard-coding the operator email or simulating a paid subscription for the operator

## Related Concepts

- `entitlement`
- `access-model`
- `role`
- `community`
- `funnel`

# Auth + Money + Access Matrix (Canonical Contract)

Status: active
Last verified: 2026-08-06
Scope: community lifecycle, Builder funding, paid-member commerce, and provider-cost evidence

## 0) First Principles

Polynet has two money rails:

1. `$79 / month / community` for Builder platform operation and Polynet-hosted community AI.
2. A `2.9%` Polynet application fee on paid-member community revenue.

Lifecycle, Builder access, membership, visibility, member commerce, and AI allowance are separate facts. One backend resolver composes them. Frontend state and redirects are never authority.

## 1) Authority Matrix

| Community state | Ordinary platform | Hosted AI | Restore authority |
|---|---:|---:|---|
| Active grandfathered, no Builder | yes | no | not applicable |
| Active grandfathered, active attached Builder | yes | yes | not applicable |
| Archived grandfathered | no | no | owner, after archive cleanup, without payment |
| Active subscription-required, paid-through Builder | yes | yes | not applicable |
| Active subscription-required, missing, expired, past-due, refunded, or disputed Builder | no | no | billing recovery |
| Archived subscription-required | no | no | verified paid Builder fulfillment after archive cleanup |
| Active operator-owned | yes | yes | not applicable |
| Archived operator-owned | no | no | operator, after archive cleanup, without simulated payment |

Archive is the outer authority boundary and always wins over payment, grandfathering, membership, role, and operator status.

## 2) Stored Truth And Resolution

- `communities.lifecycleStatus` and `lifecycleGeneration` are canonical lifecycle truth. A missing legacy lifecycle value normalizes to active generation zero; malformed values fail closed.
- `communities.builderAccessMode` is the durable commercial compatibility boundary. A missing legacy value normalizes to `grandfathered`; malformed values fail closed for operator repair.
- `founderSubscriptions` is provider-backed payment evidence. A subscription authorizes a subscription-required community only when it is attached to that exact community and owner, has a granting status, and remains inside its paid-through period.
- `operatorRoles.owner` is the only complimentary Builder authority. No email allowlist or fake subscription is valid.
- Membership, roles, visibility, price points, and Stripe Connect readiness remain separate stored truths.
- Funding loss never deletes or rewrites community data, membership, visibility, or history.
- An archived generation can be restored only after its billing-cleanup job completes. Restoration increments the generation, so old checkout and webhook events cannot revive later state.

## 3) Founder Funding

- Existing production communities are grandfathered for ordinary platform operation. They require Builder for Polynet-hosted AI.
- Every newly created non-operator community is subscription-required and must consume one verified active Builder subscription.
- Each active Builder cycle includes up to `$20` raw GPT 5.6 Luna model cost for that community.
- `active` and `cancel_at_period_end` grant only through the paid-through timestamp. `past_due`, `canceled`, `ended`, expired, revoked, ambiguous, or malformed state fails closed.
- Archived grandfathered communities restore free after cleanup and return without AI unless Builder is separately active.
- Archived subscription-required communities restore only from verified active payment for the current archived generation.
- Community BYOK and requester ChatGPT are not authority for community AI. Historical records are audit or migration evidence only.

## 4) Paid-Member Commerce

- `paid_subscription` communities use current price points and `community_join` checkout.
- Stripe Connect owns member customers, subscriptions, charges, processing fees, and payouts.
- Polynet's application fee is always 290 basis points.
- Member checkout requires an operational community. A grandfathered community may collect member revenue without hosted AI; a suspended subscription-required or archived community may not start checkout.
- Full refunds and opened disputes revoke or suspend member access through backend lifecycle state. Successful refunds reverse the cumulative proportional application fee idempotently.

## 5) Canonical Files

- Builder constants and compatibility class: `shared/founderPlan.ts`
- Community lifecycle: `shared/communityLifecycle.ts`
- Composed operational authority: `convex/communityBuilderAccessCore.ts`
- Archive and restoration: `convex/communityColdArchive.ts`
- Builder payment lifecycle: `convex/founderBilling.ts`
- Community access projection: `convex/communityCore.ts`
- Member commerce: `convex/communityCommerce.ts`
- Legal version authority: `shared/legalDocuments.ts`, `convex/legalAcceptances.ts`

## 6) Drift Gate

Any lifecycle, money, or entitlement change must update this matrix and the billing reference together and prove:

- archive always wins
- missing legacy Builder mode is grandfathered while malformed mode fails closed
- one qualifying subscription attaches to one subscription-required community
- grandfathered platform access is independent from hosted AI funding
- restore authority is generation-fenced and cleanup-gated
- payment redirects grant nothing
- exactly one 2.9% paid-member application fee remains
- historical financial and legal evidence remains auditable

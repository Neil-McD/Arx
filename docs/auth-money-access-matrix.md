# Auth + Money + Access Matrix (Canonical Contract)

Status: active
Last verified: 2026-08-02
Scope: canonical web runtime, founder funding, paid-member commerce, and provider-cost evidence

## 0) First Principles

The product has one authenticated capability surface and two payment rails:

1. `$79 / month / managed community`, with `$20` raw GPT 5.6 Luna cost included for that community.
2. `2.9%` Polynet application fee on paid-member community revenue.

There is no personal Premium plan, paid account tier, tool balance product, top-up, auto-recharge, or card-backed tool collection.
An authenticated founder may own an unlimited number of communities. Unlimited
means no account-level numeric cap, not free bundled communities.

## 1) Authority Matrix

| Question | Canonical authority | Explicit non-authority |
|---|---|---|
| May this user access the product? | authenticated user/session | Premium/account-tier label |
| May this user enter a community? | membership, entry policy, purchase claim, subscription lifecycle | founder funding, role alone, redirect |
| May this user manage a community? | community owner/admin role | paid-member entitlement |
| May this founder create another community? | every existing owned community has current canonical funding | account tier, numeric community cap |
| May this community publish and accept members? | publish readiness, visibility, entry policy, and membership or purchase state | founder AI funding |
| May this managed community run Polynet-hosted AI? | active attached $79 subscription and current allowance | visibility, unattached checkout, requester ChatGPT |
| May this legacy community run AI? | exact founder grant + `legacy_byok_allowed` + active owner API key | Partner evidence, unactivated founder status |
| Is the platform operator complimentary? | one active canonical `operatorRoles.owner` row | email allowlist, fake Stripe state |
| May a builder collect member revenue? | ready Stripe Connect account + active price/entry policy | platform founder subscription |
| What does Polynet earn on member revenue? | 2.9% application fee | funding mode or account tier |
| What did a tool/provider cost? | provider-cost entry + usage receipt/evidence | user credit balance |

## 2) Founder Funding

- A new community carries `managed_required` AI funding policy; the canonical create flow starts unlisted, but funding never controls visibility.
- Checkout is community-targeted; one verified subscription attaches to one community.
- The first community may be created without prior funding. Each next community
  may be created only after every existing owned community is funded by its own
  active subscription, exact eligible active BYOK, or the operator grant. This
  prevents stacked unpaid drafts without imposing an ownership cap.
- Each active cycle has a $20 raw Luna-cost allowance with atomic reservation and settlement.
- Without current founder-funding admission, only managed AI execution fails closed. Publishing, public funnels, Discover, public joins, and paid-member checkout use independent community and commerce authority.
- The operator grant enters the same funding kernel without Stripe state or allowance debit, but still records calculated raw cost.
- An eligible legacy founder must activate BYOK or select $79 managed funding. There is no requester-ChatGPT compatibility lane.

## 3) Capability and Cost Rules

- Authenticated users receive the same protected capability families.
- Community tools require a server-validated community lens.
- Project workspace tools require project context and centralized project/provider admission.
- Rate limits, provider quotas, safety boundaries, and approval gates still apply.
- Successful web, crawl, voice, Daytona, Codex, Blaxel, and storage usage records platform-absorbed provider cost.
- A provider-cost record is operational/financial evidence. It is not an entitlement or customer charge.

## 4) Paid-Member Commerce

- `paid_subscription` communities use active price points and `community_join` checkout.
- Stripe Connect owns member customers, subscriptions, charges, processing fees, and payouts.
- Polynet's application fee is always 290 basis points.
- Platform and Connect webhook secrets are separate.
- Full refunds and opened disputes revoke or suspend access through backend lifecycle state.
- Successful refunds reverse the cumulative proportional application fee idempotently.

## 5) Historical Financial State

Historical tool-credit balances, top-ups, reservations, settlements, and card-collection rows are retained for audit and reconciliation only. New product creation, purchase, auto-recharge, collection, reservation, and settlement paths are retired. Cached-client compatibility shells fail closed and cannot read or write product or financial state unless the endpoint is explicitly an operator diagnostic.

## 6) Canonical Files

- Founder constants: `shared/founderPlan.ts`
- Founder checkout and status: `convex/founderBilling.ts`
- Founder funding kernel: `convex/founderInferenceCore.ts`
- Member commerce: `convex/communityCommerce.ts`
- Stripe webhook convergence and fee refunds: `convex/httpBilling.ts`
- Connect onboarding: `convex/creatorCommerce.ts`
- Application fee: `shared/accountCommerce.ts`
- Provider-cost accounting: `convex/platformToolCostAccounting.ts`, `convex/workspaceCredits.ts`
- Capability gate: `shared/canonicalGateEngine.ts`

## 7) Drift Gate

Any money or entitlement change must update this matrix and the billing reference together, regenerate product docs, and prove:

- exactly one $79 founder plan attached per managed community
- exactly one $20 raw Luna allowance per attached billing cycle
- unlimited paid communities with no numeric owner cap and no stacked unpaid drafts
- exactly one 2.9% paid-member application fee
- Connect payouts and proportional fee refunds remain intact
- no active Premium, requester-ChatGPT, tool-credit, top-up, auto-recharge, or card-collection path
- provider-cost and historical financial evidence remain auditable

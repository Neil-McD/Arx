# Auth + Money + Access Matrix (Canonical Contract)

Status: active
Last verified: 2026-08-06
Scope: community lifecycle, Builder funding, paid-member commerce, and provider-cost evidence

## 0) First Principles

Polynet has two money rails:

1. `$79 / month / community` for the Agent plan (Builder in code): Polynet-hosted community AI. Communities themselves are free.
2. A `2.9%` Polynet application fee on paid-member community revenue.

Lifecycle, Builder access, membership, visibility, member commerce, and AI allowance are separate facts. One backend resolver composes them. Frontend state and redirects are never authority.

## 1) Authority Matrix

| Community state | Ordinary platform | Hosted AI | Restore authority |
|---|---:|---:|---|
| Active free or grandfathered, no Agent plan | yes | no | not applicable |
| Active free or grandfathered, active attached Agent plan | yes | yes | not applicable |
| Active free or grandfathered, past-due Agent plan | yes | no | not applicable |
| Archived free or grandfathered | no | no | owner, after archive cleanup, without payment |
| Active legacy subscription-required, paid-through Agent plan (until migrated) | yes | yes | not applicable |
| Active legacy subscription-required, missing, expired, refunded, or disputed plan (until migrated) | no | no | billing recovery, or the free migration |
| Archived legacy subscription-required (until migrated) | no | no | verified paid fulfillment after archive cleanup |
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

- Every community operates free: new communities are created `free`, grandfathered ones stay free, and legacy subscription-required communities are migrated to free (`migrateSubscriptionRequiredCommunitiesToFreeInternal`, audited). Polynet-hosted AI requires the community's Agent plan.
- Creating a community needs no payment; an owner may have at most 10 live communities created free (the operator is exempt, and a community created with its own Agent plan is never capped).
- Each active Builder cycle includes up to `$20` raw GPT 5.6 Luna model cost for that community.
- Paid joins (Nov 5, membership redesign): the buyer is always known before paying (signed in), so Stripe's verified checkout notice itself grants the membership (`syncPendingCommunityCheckoutSubscriptionInternal`); `checkout.session.async_payment_succeeded` does the same for delayed payments. Someone already in (member or owner) is refused before checkout (`already_member`, 409). If a second subscription still arrives (two tabs), it is cancelled and refunded in full, platform fee included (`refundDuplicateCommunitySubscriptionInternal`, retried for about a day), and never overwrites the first.
- One record per paid join: the checkout. The notice grants from it (`grantCommunityCheckout`) and stamps `membershipGrantedAt`, so a notice Stripe sends again changes nothing, even after the member leaves and rejoins. Studio's return (`finalizeCheckoutSession`) and the site's Finish only read it: "succeeded" means paid and in. No purchase claims are created (Nov 5); `redeemPurchaseClaim`, `listPendingPurchaseClaims` and `redeemPendingPurchaseClaims` are kept one release as harmless stubs for Studio tabs opened before then, and the `purchaseClaims` table is dropped the release after.
- No rug pulls: changing a community's price creates a new price point and retires the old one for new joins; it never touches an existing member's subscription, which stays on the price they joined at. Members on different prices coexist; access depends only on a paid subscription, not on its price (`communityPriceLock.test.ts`).
- A paying member who leaves keeps access through the period they paid for: leaving marks their community subscription `cancel_at_period_end` and tells Stripe not to renew; Stripe's notice at the period's end ends it (Nov 5). The request is remembered on the subscription (`cancelRequestedAt`): a failed Stripe call is retried with growing gaps for about a day, and a renewal Stripe reports after the member left is re-cancelled rather than reopening billing. A member who doesn't pay is out immediately.
- `active` and `cancel_at_period_end` grant only through the paid-through timestamp. `past_due` keeps the community operating while Stripe retries inside the current paid-through period (the same grace paid members get) but grants no hosted AI (`founderSubscriptionKeepsCommunityRunning` vs `founderSubscriptionStatusGrantsAccess`). `canceled`, `ended`, expired, revoked, ambiguous, or malformed state fails closed.
- Archived free and grandfathered communities restore free after cleanup and return without AI unless an Agent plan is separately active.
- Archived legacy subscription-required communities (before migration) restore only from verified active payment for the current archived generation.
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
- Community access: `convex/communityCore.ts` — `resolveCommunityLens` is the one answer to who someone is in a community and what they may do (can the community run, blocked, entitled, relation held now, powers). The chat, manager and moderator gates and Studio's access bundle wrap it; `scripts/one_community_lens_proof.ts` fails on access re-derived elsewhere.
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

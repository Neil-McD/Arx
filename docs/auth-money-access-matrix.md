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
| Active, no Agent plan | yes | no | not applicable |
| Active, active attached Agent plan | yes | yes | not applicable |
| Active, past-due Agent plan | yes | no | not applicable |
| Archived | no | no | owner, after archive cleanup, without payment |
| Active operator-owned | yes | yes | not applicable |
| Archived operator-owned | no | no | operator, after archive cleanup, without simulated payment |

Archive is the outer authority boundary and always wins over payment, grandfathering, membership, role, and operator status.

## 2) Stored Truth And Resolution

- `communities.lifecycleStatus` and `lifecycleGeneration` are canonical lifecycle truth. A missing legacy lifecycle value normalizes to active generation zero; malformed values fail closed.
- There is no per-community commercial mode: every community operates unless archived (`builderAccessMode` was retired Nov 7).
- `founderSubscriptions` is provider-backed payment evidence. It funds hosted AI for a community only when it is attached to that exact community and owner, has a granting status, and remains inside its paid-through period.
- `operatorRoles.owner` is the only complimentary Builder authority. No email allowlist or fake subscription is valid.
- Membership, roles, visibility, price points, and Stripe Connect readiness remain separate stored truths.
- Funding loss never deletes or rewrites community data, membership, visibility, or history.
- An archived generation can be restored only after its billing-cleanup job completes. Restoration increments the generation, so old checkout and webhook events cannot revive later state.

## 3) Founder Funding

- Every community operates free unless archived. Polynet-hosted AI requires the community's Agent plan.
- Creating a community needs no payment; an owner may have at most 10 live communities created free (the operator is exempt, and a community created with its own Agent plan is never capped).
- Each active Builder cycle includes up to `$20` raw GPT 5.6 Luna model cost for that community.
- No setup form before joining (Nov 5): sign-in gives a new account its starter profile, the name and photo its sign-in provided and a unique handle made from the name (`ensureStarterProfile`; only fills what's missing). A photo is optional. Clicking Join (free, approval or paid, in Studio or on a site) under "By joining you agree to Polynet's Terms and Privacy & AI Data Policy" records the acceptance of the current versions (`acceptCommunityJoin`, source `community_join`). Setup only blocks joining if something beyond the terms is still missing (`accountSetupBlocksJoining`). Accounts made before this get the same starter profile from `backfillStarterProfilesInternal`, run once per deployment.
- Paid joins (Nov 5, membership redesign; cash first): payment comes before signing in. On a community site, Join goes straight to Stripe for anyone. A buyer not signed in gets a checkout with no owner; Polynet keeps only the SHA-256 of a secret that the paying browser holds in an HttpOnly cookie on the twin (`__Host-polynet_buyer_<checkout hex>`), plus the email they gave Stripe. The payment becomes an account's when that browser signs in (Finish carries the secret from the cookie), or when an account whose email is verified and matches signs in (`attachPaidCheckoutsForVerifiedEmail`), whether at payment time or later. Attaching accepts the terms, and if Stripe has confirmed, it settles. A signed-in buyer's checkout is theirs from the start, and someone already in (member or owner) is refused before checkout (`already_member`, 409). Stripe's verified notice settles a paid checkout (`syncPendingCommunityCheckoutSubscriptionInternal`; `checkout.session.async_payment_succeeded` for delayed payments). The site's Finish also asks Stripe directly (`confirmCommunityCheckoutWithStripeInternal`), so the member never waits on the notice. This is provider verification, not trust in the redirect: the server retrieves the Checkout Session from Stripe's API on the founder's connected account, counts it only if it is `complete`, paid and carries this checkout's id, and then runs the same sync the verified webhook runs (`syncCommunityCheckoutFromStripe`). The return URL itself still grants nothing. A refund or dispute on a payment not granted yet blocks it (`communityHold`); a won dispute lifts that block, a refund doesn't. If the buyer already pays for that community (two tabs, or paid again before signing in), the second subscription is cancelled and refunded in full, platform fee included (`refundDuplicateCommunitySubscriptionInternal`, retried for about a day), and never overwrites the first. Checkouts with no owner are limited per 10 minutes: 3 per visitor (a hash the edge keys from their address; the address itself is never stored) and 100 per community, so one visitor can't use up a community's checkouts. Someone blocked from the community who pays before signing in gets the payment attached to their account, marked `buyer_blocked`, never granted, and cancelled and refunded in full.
- One record per paid join: the checkout. The notice grants from it (`grantCommunityCheckout`) and stamps `membershipGrantedAt`, so a notice Stripe sends again changes nothing, even after the member leaves and rejoins. The site's Finish only reads it: "succeeded" means paid and in (Studio's own return, `finalizeCheckoutSession`, is deleted with Studio's checkout, Nov 6). No purchase claims are created (Nov 5); the claim functions went Nov 6, and the old rows, the checkouts' claim codes and the `purchaseClaims` table itself went Nov 7.
- No rug pulls: changing a community's price creates a new price point and retires the old one for new joins; it never touches an existing member's subscription, which stays on the price they joined at. Members on different prices coexist; access depends only on a paid subscription, not on its price (`communityPriceLock.test.ts`).
- A paying member who leaves keeps access through the period they paid for: leaving marks their community subscription `cancel_at_period_end` and tells Stripe not to renew; Stripe's notice at the period's end ends it (Nov 5). The request is remembered on the subscription (`cancelRequestedAt`): a failed Stripe call is retried with growing gaps for about a day, and a renewal Stripe reports after the member left is re-cancelled rather than reopening billing. A member who doesn't pay is out immediately.
- `active` and `cancel_at_period_end` grant only through the paid-through timestamp. `past_due` grants no hosted AI (`founderSubscriptionStatusGrantsAccess`). `canceled`, `ended`, expired, revoked, ambiguous, or malformed state fails closed.
- Archived communities restore free after cleanup and return without AI unless an Agent plan is separately active. A plan can't be bought for an archived community.
- Community BYOK and requester ChatGPT are not authority for community AI. Historical records are audit or migration evidence only.

## 4) Paid-Member Commerce

- `paid_subscription` communities use current price points and `community_join` checkout.
- Stripe Connect owns member customers, subscriptions, charges, processing fees, and payouts.
- Polynet's application fee is always 290 basis points.
- Member checkout requires an operational community. A community may collect member revenue without hosted AI; an archived community may not start checkout.
- Full refunds and opened disputes revoke or suspend member access through backend lifecycle state. Successful refunds reverse the cumulative proportional application fee idempotently.
- Tiers (Nov 12, one door, `convex/communityTiers.ts`): a membership holds one tier at a time; each tier gives grants a connected app reads. The community's existing price is the base tier and the only price Settings, the doorstep and checkout read unless a tier is named; a tier's prices carry `tierKey`. Grants are computed from the membership's own price and its pods when asked. Tier changes and app checkout come in later slices.
- Paid pods (Nov 12, [pods spec](specs/pods-v0.md)): a pod's monthly price is charged **on top of** membership, as its own subscription on the builder's Connect account with the same 2.9% fee (`convex/communityPodPayments.ts`, table `communityPodPayments`, kept apart from `communitySubscriptions`). Signed-in community members only. Stripe's verified notice (or Polynet asking Stripe on return) puts the payer on the pod room's access list; an ended subscription takes them off. Active, past due and stopping at period end keep access, as for communities. A price change is for new joins only. One checkout per member and pod: it is reserved in one transaction (two tabs share one Stripe checkout) and reused while open (35 minutes, over Stripe's 30-minute minimum); a full pod refuses checkout. A payment that can't let its payer in (the community was archived, they left, the pod closed, or they already pay for that pod) is never granted: it ends and `refundDue` stays on it until Stripe has cancelled and refunded in full, retried hourly whatever the status. A full refund or an opened or lost dispute ends that pod's access and cancels its subscription (a won dispute doesn't reopen it; the member can join again); Polynet's fee is reversed on a pod refund exactly as for a community one (the refund path recognises pod payments). One rule stops pod billing: a pod payment is reachable while the community runs, the member is active, the pod's room is open and they are on its list under their current membership. The code that may end access (leaving, removal or ban, a lapse or payment hold, a host taking someone off a pod, archiving) schedules that check at once for the people affected; an hourly pass over every paying row is the safety net (`sweepUnreachablePodPaymentsInternal`). Unreachable: cancelled keeping what was paid, or cancelled and refunded in full if the payment never let them in; someone put back before the check runs keeps paying. Unpaid checkouts are marked expired a day after Stripe closes them. Leaving a paid pod (`leavePod`) tells Stripe to stop renewing and keeps access to the end of the paid period, as leaving a community does; with no payment, the member is off the pod at once. A failed pod payment sends the same billing email as a community, naming the pod. A grant stops at once when the membership does (it is bound to the membership's activation).

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
- one qualifying subscription attaches to one community
- platform access is independent from hosted AI funding
- restore authority is generation-fenced and cleanup-gated
- payment redirects grant nothing
- exactly one 2.9% paid-member application fee remains
- historical financial and legal evidence remains auditable

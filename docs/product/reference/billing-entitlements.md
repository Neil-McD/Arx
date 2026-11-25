---
id: product.reference.billing_entitlements
title: Billing and Entitlements
audience: builder, member, llm, operator
status: alpha-current
last_verified: 2026-11-25
---

# Billing and Entitlements

## Irreducible Model

Polynet has two live money rails:

1. Communities are free to create and run. Polynet-hosted AI is funded per community through two monthly tiers:
   - **Guide ($20/month per community):** reactive 1:1 chats, `@mentions`, active-thread follow-ups, and living memory, with a **$3/month** included AI allowance.
   - **Chief of Staff ($100/month per community):** everything in Guide plus proactive Daily Briefs, Member & Builder Check-Ins, unanswered-question auto-replies, and optional prepaid usage boosts (**$30 → +$20 AI** within a founder-set monthly safety cap, off by default), with a **$20/month** included AI allowance. Legacy `$79/month` subscriptions are grandfathered as Chief of Staff.
2. Polynet keeps a 2.9% application fee from paid-member community revenue across all tiers.

Founder AI plans are per-community, not account-wide. One subscription belongs to one community. Visibility, membership, roles, paid-member commerce, AI funding, AI allowance, and lifecycle remain separate canonical facts.

## Lifecycle And Community Operation

Community operation is resolved in this order:

1. Lifecycle: a community operates unless it is archived, regardless of payment, membership, or operator status.
2. Funding: only Polynet-hosted AI needs funding (the operator grant, or one correctly attached, paid-through Guide or Chief of Staff subscription). Community operation never does.
3. Membership and role: only after the community is operational do membership and role determine what a user may do.

Every community operates free; there is no per-community plan requirement. Hosted AI requires a funded Guide or Chief of Staff plan attached to that community. An owner may have at most **10 live unfunded (free) communities**; communities with their own paid AI plan are never capped, the operator is exempt, and archived communities do not count.

When a plan lapses or its cycle's AI allowance is spent, hosted AI pauses; nothing else changes. A past-due plan keeps the community operating while Stripe retries within the period, but hosted AI pauses until payment succeeds. Funding never mutates or deletes the community, memberships, visibility, content, or history.

## Creating A Community, And Adding An AI Plan

Creating a community needs no payment: Create Community goes straight to setup. A signed-in owner can add **Guide** ($20/month) or **Chief of Staff** ($100/month) for an existing community from the community's Guide settings (`startFounderSubscriptionCheckout`), and can switch tiers in place at any time.

The verified Stripe webhook creates durable paid subscription truth. Redirect success is progress UI only. The same subscription cannot be attached twice; replays are idempotent and cross-user attachment fails closed.

## Archive And Restoration

Archive is a lifecycle action, not a billing status. It immediately freezes ordinary runtime access and starts durable asynchronous billing cleanup. Cleanup completion is required before any restoration but grants no access by itself.

- An owner may restore an archived community without payment after cleanup. Hosted AI remains off unless a funded plan is separately current. A plan can't be bought for an archived community.
- The canonical operator may restore an operator-owned community after cleanup without simulated Stripe state.
- Every restoration increments `lifecycleGeneration`. Checkout and webhook evidence from an earlier generation cannot restore or mutate the newer generation.

## Hosted AI

Each monthly cycle includes up to **$3** (Guide) or **$20** (Chief of Staff) in combined raw provider cost for hosted AI inference and paid web research tools in that community. Chief of Staff owners can optionally enable prepaid **$30 → +$20 AI** usage boosts within a monthly safety cap. Before a paid provider call begins, Polynet reserves a bounded worst-case amount and settles the actual or bounded evidenced cost afterward. Missing pricing, ambiguous cycle state, inactive payment, or exhausted allowance fails closed.

The same funding kernel covers private community-agent conversations, direct `@mention` replies, active-thread follow-ups, and (on Chief of Staff) proactive briefs and check-ins. Members never provide community inference credentials. Community BYOK and requester ChatGPT are retired as authority; historical rows remain audit or migration evidence only.

The canonical operator grant derives only from one active `operatorRoles.owner` row. It creates no fake Stripe state and bypasses neither authorization, rate limits, usage receipts, nor provider-cost accounting.

The operator grant waives payment, not cost bounds. Each operator-funded community has a UTC calendar-month ledger (`operatorGrantUsageCycles`) with a `$20` raw-cost ceiling. Inference and paid tools reserve against it before provider start and settle actual cost afterwards; unknown provider usage consumes the full reservation. An exhausted month fails closed with `founder_usage_exhausted` until the next UTC month.

### Polynet home member allowance

In the platform-home community (`polynet`), each member other than the owner gets 25 agent turns per UTC calendar month. Private agent turns and direct community-agent mentions count; failed receipts, autonomous cognition, and retries of an existing receipt do not. The 26th turn fails closed with `platform_home_member_agent_limit_reached`. The Home page and chat notice show the reset date and invite the member to start their own community (free to build, Guide from $20/mo). The allowance and its prompt apply only to Polynet home; members of builder communities never see a Polynet upsell.

## Paid-Member Community Revenue

Paid-member pricing and payouts are independent from AI funding, but checkout requires an operational community:

1. The owner completes Stripe Connect payout onboarding, on an account that can take card payments directly. Checkout charges on the owner's account, so a payouts-only account (Stripe's cross-border `recipient` service agreement, e.g. Kuwait) doesn't qualify even when Stripe reports it ready (`canReceiveCommunityRevenue`).
2. The builder configures `paid_subscription` entry and an active price point.
3. A member enters through the community's join page and completes `community_join` checkout on the builder's connected account.
4. Provider/webhook verification creates the subscription lifecycle, membership, and access truth.
5. The connected account owns the customer, subscription, charge, processor fee, and payout. Polynet keeps its 2.9% application fee.

While the owner's account can't take card payments, the community can't set a price, its join page offers no plan and says checkout is unavailable, checkout refuses with `community_checkout_unavailable`, and Studio tells the owner that members can't pay to join yet (free joining still works). Stripe refusing what the owner's account can sell (a currency or capability it lacks) is the same refusal, never a server error.

Stripe processing fees are separate from Polynet's 2.9% application fee. A community can collect member revenue while hosted AI is off. An archived community cannot start new member checkout. Full refunds revoke paid access; partial refunds retain access unless subscription state says otherwise. Each successful refund reverses the cumulative proportional share of Polynet's application fee idempotently.

## Legal Acceptance

New and returning users must accept the current Terms of Service and Privacy & AI Data Policy before protected platform use. Prior acceptances remain immutable historical evidence.

## Rules

1. Redirects are UX only; verified provider/webhook state is authoritative.
2. Archive always wins over commercial and access state.
3. Communities operate free unless archived.
4. One Guide ($20/mo) or Chief of Staff ($100/mo) subscription attaches to one community.
5. Operating free grants platform operation, not hosted AI.
6. AI plan funding never widens member permissions.
7. Restoration is cleanup-gated, generation-fenced, and idempotent.
8. Paid-member revenue always uses the 2.9% application fee.
9. Community BYOK and requester ChatGPT authorize no community AI execution.
10. Historical financial and legal evidence remains auditable.

## Common Mistakes

- treating a successful redirect as entitlement
- checking payment before lifecycle
- making community operation depend on AI funding
- allowing payment or operator status to bypass archive
- storing a second `suspended` flag instead of resolving current truth
- mutating membership or visibility when AI funding lapses
- restoring an archived community before billing cleanup completes
- allowing a stale checkout generation to restore a community
- letting frontend state reconstruct backend authority
- reviving community BYOK because historical credential rows still exist

## Related Concepts

- `community`
- `community-lifecycle`
- `entitlement`
- `membership`
- `join-page`

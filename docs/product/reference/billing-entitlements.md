---
id: product.reference.billing_entitlements
title: Billing and Entitlements
audience: builder, member, llm, operator
status: alpha-current
last_verified: 2026-09-28
---

# Billing and Entitlements

## Irreducible Model

Polynet has two live money rails:

1. Communities are free. A builder pays $79 USD monthly for the Agent plan on each community that uses Polynet-hosted AI.
2. Polynet keeps a 2.9% application fee from paid-member community revenue.

The Agent plan is not an account-wide tier. One subscription belongs to one community. Visibility, membership, roles, paid-member commerce, Agent plan payment, AI allowance, and lifecycle remain separate canonical facts. (The code and older records call the Agent plan "Builder"; it is the same subscription.)

## Lifecycle And Community Operation

Community operation is resolved in this order:

1. Lifecycle: archived communities are unavailable regardless of payment, grandfathering, membership, or operator status.
2. Commercial mode: `free` (every new community) and legacy `grandfathered` (a missing value) always operate; legacy `subscription_required` is migrated to `free`; malformed values fail closed.
3. Funding: only Polynet-hosted AI needs funding (the operator grant, or one correctly attached, paid-through Agent plan). Community operation never does.
4. Membership and role: only after the community is operational do membership and role determine what a user may do.

Every community operates free: new communities are created `free`, grandfathered communities keep operating, and subscription-required communities are migrated to free. Hosted AI requires an Agent plan attached to that community. An owner may have at most 10 live communities created free; a community created with its own Agent plan is never capped, the operator is exempt, and archived ones don't count.

When an Agent plan lapses or its cycle's AI allowance is spent, hosted AI pauses; nothing else changes. A past-due plan keeps the community operating while Stripe retries within the period, but hosted AI pauses until payment succeeds. Funding never mutates or deletes the community, memberships, visibility, content, or history.

## Creating A Community, And Adding The Agent Plan

Creating a community needs no payment: Create Community goes straight to setup. The Agent plan can be bought for an existing community from the agent, Billing, or Account (`startFounderSubscriptionCheckout`), or bought first, as before:

1. The public landing page starts anonymous Stripe checkout before authentication or community creation.
2. The verified Stripe webhook creates durable paid receipt evidence. Redirect success is progress UI only.
3. The buyer authenticates and claims the receipt through the browser secret or verified checkout-email recovery.
4. The user completes display name, handle, avatar, current Terms, and current Privacy acceptance. Provider credentials are not account setup.
5. Community creation atomically consumes one owned active unassigned subscription, creates the unlisted free community, attaches the subscription as its Agent plan, and opens its usage cycle.

An unassigned subscription grants setup, not access to any existing community. The same subscription cannot be attached twice. Replays are idempotent and cross-user attachment fails closed.

## Archive And Restoration

Archive is a lifecycle action, not a billing status. It immediately freezes ordinary runtime access and starts durable asynchronous billing cleanup. Cleanup completion is required before any restoration but grants no access by itself.

- An owner may restore an archived free or grandfathered community without payment after cleanup. Hosted AI remains off unless an Agent plan is separately current.
- A legacy subscription-required community (before its migration to free) restores only from verified active `$79` payment bound to the current archived lifecycle generation.
- The canonical operator may restore an operator-owned community after cleanup without simulated Stripe state.
- Every restoration increments `lifecycleGeneration`. Checkout and webhook evidence from an earlier generation cannot restore or mutate the newer generation.

## Hosted AI

Each `$79` monthly cycle includes up to `$20` in combined raw provider cost for hosted AI inference and paid web research or crawl tools in that community. Before a paid provider call begins, Polynet reserves a bounded worst-case amount and settles the actual or bounded evidenced cost afterward. Missing pricing, ambiguous cycle state, inactive payment, or exhausted allowance fails closed.

The same funding kernel covers the community agent under a server-validated community lens, direct community-agent mentions, autonomous community cognition, and AI-assisted setup. Members never provide community inference credentials. Community BYOK and requester ChatGPT are retired as authority; historical rows remain audit or migration evidence only.

The canonical operator grant derives only from one active `operatorRoles.owner` row. It creates no fake Stripe state and bypasses neither authorization, rate limits, usage receipts, nor provider-cost accounting.

The operator grant waives payment, not cost bounds. Each operator-funded community has a UTC calendar-month ledger (`operatorGrantUsageCycles`) with the same `$20` raw-cost ceiling as Builder. Inference and paid tools reserve against it before provider start and settle actual cost afterwards; unknown provider usage consumes the full reservation. The same per-run headroom guard applies as for Builder, so a run cannot exceed its reservation. An exhausted month fails closed with `founder_usage_exhausted` until the next UTC month. Receipts created before this ledger existed carry no cycle and settle without one. `operatorGrantUsageCycles` deliberately parallels `founderUsageCycles` rather than sharing it: merging them would mean migrating live Builder billing rows, which is deferred until there is a concrete reason.

### Polynet home member allowance

In the platform-home community (`polynet`), each member other than the owner gets 25 agent turns per UTC calendar month. Agent-page turns and direct community-agent mentions count; failed receipts, workflow actions, autonomous cognition, and retries of an existing receipt do not. The 26th turn fails closed with `platform_home_member_agent_limit_reached`. The Agent page, and the chat notice after a direct community-agent mention, show the reset date and offer the Builder plan: "Build your own community — $79/mo". The allowance and its upsell apply only to Polynet home; members of builder communities never see a Polynet upsell.

## Paid-Member Community Revenue

Paid-member pricing and payouts are independent from AI funding, but checkout requires an operational community:

1. The owner completes Stripe Connect payout onboarding.
2. The builder configures `paid_subscription` entry and an active price point.
3. A member enters through the community's join page and completes `community_join` checkout on the builder's connected account.
4. Provider/webhook verification creates the purchase claim, subscription lifecycle, membership, and access truth.
5. The connected account owns the customer, subscription, charge, processor fee, and payout. Polynet keeps its 2.9% application fee.

Stripe processing fees are separate from Polynet's 2.9% application fee. A grandfathered community can collect member revenue while hosted AI is off. An archived or commercially suspended subscription-required community cannot start new member checkout. Full refunds revoke paid access; partial refunds retain access unless subscription state says otherwise. Each successful refund reverses the cumulative proportional share of Polynet's application fee idempotently.

## Legal Acceptance

Terms v3 is the current commercial contract. Terms v1 and v2 acceptances remain immutable historical evidence but do not satisfy current acceptance because v3 materially changes the Builder and restoration boundary. New and returning users must accept the current Terms through the canonical account/setup bridge before protected platform use.

## Rules

1. Redirects are UX only; verified provider/webhook state is authoritative.
2. Archive always wins over commercial and access state.
3. Communities operate free; missing legacy mode is grandfathered (also free); malformed mode fails closed.
4. One `$79` Agent plan attaches to one community.
5. Operating free grants platform operation, not hosted AI.
6. Agent plan funding never widens member permissions.
7. Restoration is cleanup-gated, generation-fenced, and idempotent.
8. Paid-member revenue always uses the 2.9% application fee.
9. Community BYOK and requester ChatGPT authorize no community AI execution.
10. Historical financial and legal evidence remains auditable.

## Common Mistakes

- treating a successful redirect as entitlement
- checking payment before lifecycle
- making community operation depend on AI funding
- allowing payment or operator status to bypass archive
- treating an unassigned subscription as community access
- storing a second `suspended` flag instead of resolving current truth
- mutating membership or visibility when Agent plan funding lapses
- restoring an archived community before billing cleanup completes
- allowing a stale checkout generation to restore a community
- letting frontend state reconstruct backend authority
- reviving community BYOK because historical credential rows still exist

## Related Concepts

- `community`
- `community-lifecycle`
- `builder-access-mode`
- `entitlement`
- `membership`
- `join-page`

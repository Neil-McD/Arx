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

1. A builder pays $79 USD monthly for Builder on each managed community.
2. Polynet keeps a 2.9% application fee from paid-member community revenue.

Builder is not an account-wide tier. One subscription belongs to one community. Visibility, membership, roles, paid-member commerce, Builder payment, AI allowance, and lifecycle remain separate canonical facts.

## Lifecycle And Builder Authority

Community operation is resolved in this order:

1. Lifecycle: archived communities are unavailable regardless of payment, grandfathering, membership, or operator status.
2. Commercial compatibility: missing legacy `builderAccessMode` means `grandfathered`; malformed values fail closed.
3. Funding: an active `subscription_required` community needs the operator grant or one correctly attached, paid-through Builder subscription.
4. Membership and role: only after the community is operational do membership and role determine what a user may do.

Existing grandfathered communities retain ordinary platform operation without Builder. Hosted AI for those communities still requires Builder. Newly created non-operator communities are subscription-required: Builder authorizes both ordinary platform operation and hosted AI for that attached community.

Funding suspension does not mutate or delete the community, memberships, visibility, content, or history. A subscription-required community without current funding is removed from Discover and rejects private entry, public joins, and new paid-member checkout. Its direct funnel may remain visible with a neutral unavailable state and an owner billing-recovery action.

## Payment-First Builder Sequence

The canonical new-builder sequence is:

1. The public landing page or internal Create Community surface starts anonymous Stripe checkout before authentication or community creation.
2. The verified Stripe webhook creates durable paid receipt evidence. Redirect success is progress UI only.
3. The buyer authenticates and claims the receipt through the browser secret or verified checkout-email recovery.
4. The user completes display name, handle, avatar, current Terms, and current Privacy acceptance. Provider credentials are not account setup.
5. Community creation atomically consumes one owned active unassigned subscription, creates the unlisted subscription-required community, attaches the subscription, and opens its usage cycle.

An unassigned subscription grants setup, not access to any existing community. The same subscription cannot be attached twice. Replays are idempotent and cross-user attachment fails closed.

## Archive And Restoration

Archive is a lifecycle action, not a billing status. It immediately freezes ordinary runtime access and starts durable asynchronous billing cleanup. Cleanup completion is required before any restoration but grants no access by itself.

- A grandfathered owner may restore the archived community without payment after cleanup. The community returns with its ordinary grandfathered access; hosted AI remains off unless Builder is separately current.
- A subscription-required community restores only from verified active `$79` payment bound to the current archived lifecycle generation.
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
3. A member enters through the canonical community funnel and completes `community_join` checkout on the builder's connected account.
4. Provider/webhook verification creates the purchase claim, subscription lifecycle, membership, and access truth.
5. The connected account owns the customer, subscription, charge, processor fee, and payout. Polynet keeps its 2.9% application fee.

Stripe processing fees are separate from Polynet's 2.9% application fee. A grandfathered community can collect member revenue while hosted AI is off. An archived or commercially suspended subscription-required community cannot start new member checkout. Full refunds revoke paid access; partial refunds retain access unless subscription state says otherwise. Each successful refund reverses the cumulative proportional share of Polynet's application fee idempotently.

## Legal Acceptance

Terms v3 is the current commercial contract. Terms v1 and v2 acceptances remain immutable historical evidence but do not satisfy current acceptance because v3 materially changes the Builder and restoration boundary. New and returning users must accept the current Terms through the canonical account/setup bridge before protected platform use.

## Rules

1. Redirects are UX only; verified provider/webhook state is authoritative.
2. Archive always wins over commercial and access state.
3. Missing legacy Builder mode is grandfathered; malformed mode fails closed.
4. One `$79` subscription attaches to one managed community.
5. Grandfathering grants platform operation, not hosted AI.
6. Builder funding never widens member permissions.
7. Restoration is cleanup-gated, generation-fenced, and idempotent.
8. Paid-member revenue always uses the 2.9% application fee.
9. Community BYOK and requester ChatGPT authorize no community AI execution.
10. Historical financial and legal evidence remains auditable.

## Common Mistakes

- treating a successful redirect as entitlement
- checking payment before lifecycle
- making grandfathered platform access depend on AI funding
- allowing payment or operator status to bypass archive
- treating an unassigned subscription as community access
- storing a second `suspended` flag instead of resolving current truth
- mutating membership or visibility when Builder funding lapses
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
- `funnel`

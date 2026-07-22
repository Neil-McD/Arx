# Community Commerce Event Convergence — U-017 Authority Slices

Status: second authority slice deployed and verified on the isolated staging lane
Scope: paid-community subscription, refund, and dispute access effects only

## Irreducible job

A delivered Stripe webhook is evidence that something changed. It is not necessarily the newest subscription state. For community access, the only safe projection is:

```text
verified Stripe event
-> identify provider subscription
-> retrieve current Stripe subscription
-> project current state into checkout/subscription records
-> derive membership access
```

The delivered event object remains sufficient for Premium's separate policy in this slice. Community checkout and membership projection now use a separately bounded current-provider reconciliation boundary.

## Defect closed

Before this slice, checkout completion, invoices, refunds, and disputes already retrieved Stripe subscription evidence when current state mattered. The `customer.subscription.updated/deleted` branch instead projected the delivered event snapshot directly. Delayed or reordered delivery could therefore apply an older community subscription state after a newer one.

The branch now:

1. preserves the existing Premium decision boundary;
2. resolves whether the event belongs to a local community checkout or subscription;
3. retrieves the current Stripe subscription before updating community state;
4. projects the current provider snapshot into pending checkout and membership/subscription state;
5. propagates transient provider failures so Stripe can retry;
6. marks a provider-confirmed missing community subscription `ended`, preventing pending checkout activation and revoking existing paid access when locally attributable.

## Executable evidence

`communitySubscriptionEventConvergence.test.ts` proves:

- delivered `updated` and `deleted` snapshots do not override current provider truth;
- reordered and duplicate deliveries converge on the same provider snapshot;
- a provider-confirmed missing object produces an explicit fail-closed result;
- transient provider failures propagate rather than being acknowledged as success;
- missing or mismatched provider identity fails closed.

The paid-community access authority suite additionally requires the runtime handler to retain the provider-missing revocation path and one fail-closed subscription identity.

## Staging shape and migration boundary

The read-only aggregate staging audit on 2026-07-21 scanned all 19 checkout sessions and all community subscription rows without truncation. It found 16 community-join checkout sessions, three Premium checkout sessions, and zero `communitySubscriptions` rows. This slice changes no schema and writes no staging data.

## Explicit non-goals

This slice does not change:

- auth-before-payment ordering;
- checkout creation, finalization, pricing, fees, or return URLs;
- Stripe signature verification;
- Premium, workspace-credit, or Connect policy;
- Builder Partner accrual, adjustment, payout, or historical obligations;
- creator settlement;
- refund/dispute risk ordering;
- atomic webhook event receipts or replay leases.

## Second authority slice: atomic access effects

The next irreducible defect was the local authority boundary. Refund and dispute
handlers wrote financial state into `communityMemberships.revokedReason`, then
asked later subscription events to preserve a small allowlist of magic strings.
That hidden state machine could leave a failed refund stuck and could reactivate
a membership removed by a community manager.

The paid-community access effect now has three explicit parts:

1. `communitySubscriptions` remains the current provider-derived subscription projection.
2. `communitySubscriptionAccessBlocks` stores only active refund/dispute access blocks, keyed by subscription plus provider source object.
3. `communityCommerceEventEffects` stores a bounded `community_access` receipt per Stripe account/event, without raw webhook payloads.

Provider reads happen before the mutation. One Convex mutation then atomically
applies the access-block transition, subscription projection, membership
projection, canonical member count, and effect receipt. Provider failures occur
before that mutation and therefore cannot leave a partial local transition.

Receipts do not suppress a replay. A duplicate or reordered delivery re-reads
current Stripe truth and reapplies the idempotent local projection; the receipt
expectation-locks event identity and refreshes its retention deadline. Receipts expire after
45 days and are pruned hourly in bounded batches. `criticalAuditEvents` remains
best-effort observability and is not processing authority.

The access policy is now explicit:

- cumulative current charge truth below a full refund clears the charge refund block;
- cumulative current charge truth at a full refund sets the charge refund block;
- open/under-review disputes block access;
- won/closed warnings clear their dispute block;
- lost disputes retain a block whose reason encodes the lost outcome;
- unknown dispute or malformed charge state fails before local mutation;
- clearing a financial block can reactivate only subscription-projected revocation, never a manager or other non-financial revocation.

The staging preflight on 2026-07-22 scanned all 67 memberships without
truncation. It found zero inactive paid memberships and zero legacy financial
revocation strings, so this staging lane requires no compatibility backfill.
The local environment has no authenticated Stripe CLI, so the staging endpoint's
configured API version and enabled-event list remain externally unverified. No
existing refund, dispute, charge-refund, invoice, or subscription handler was
deleted on that assumption.

The behavioral fixture proves cumulative partial/full refunds, unknown provider
states, duplicate delivery, reordered dispute recovery, failed-refund recovery,
multiple authority invariants, manager-removal precedence, active-member-count
convergence, and atomic rollback when receipt identity is corrupt.

## Staging release receipt — 2026-07-22

- code commit: `551dd0172929d0b3949bf2c59aa50a55e477d471`;
- Convex target: `dev:quick-porcupine-949`, deployed only through the staging identity guard;
- canonical web marker: `https://polynet-staging.vercel.app/version.json` served the exact code commit;
- Staging UI Canary run `29929229366`: success;
- MVP Guards run `29929229418`: success, including the 36-step foundation gate, web typecheck/build, and bundle budget;
- post-deploy tables: zero `communitySubscriptionAccessBlocks` and zero `communityCommerceEventEffects` rows;
- post-deploy migration recheck: all 67 memberships scanned, zero inactive paid memberships, zero legacy financial revocation strings;
- bounded receipt pruner: `{ deleted: 0, has_more: false, ok: true }`;
- production marker remained `a936dee72a65f91723f332779390210e4cf783f0`.

## Remaining U-017 boundary

U-017 is narrowed but not closed. A later slice must add a bounded asynchronous
retry/stuck-recovery queue for provider outages and then prove live Stripe test
events against the configured staging webhook endpoint. Creator settlement is a
separate authority. Builder Partner remains explicitly last.

## Authority-surface reduction

The follow-up cleanup keeps the same access behavior while deleting redundant
state and policy owners. `communitySubscriptionAccessCore.ts` now owns the sole
granting-status policy used by entitlement, checkout, billing, audit, and
operator reporting. The unused access-block `terminal` bit and receipt
`attemptCount` are deleted after a live staging query proved both tables empty.
Lost-dispute semantics remain explicit in the block reason, while receipt replay
still re-applies current provider truth and refreshes retention.

The checkout row type no longer pretends to persist invoice, payment-intent, or
charge evidence that its schema never stored. Stale financial projection reasons
and unused risk-response fields are gone. Retired purchase-claim event names are
removed from the critical-audit runtime, and the repaired proof is now executed
by the foundation baseline. The uninvoked lifecycle proof that still modeled
claim redemption is deleted rather than repaired as a second access-authority
model. Historical checkout and audit rows are unchanged.

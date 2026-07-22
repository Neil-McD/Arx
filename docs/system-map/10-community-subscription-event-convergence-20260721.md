# Community Subscription Event Convergence — First U-017 Slice

Status: implemented and locally proven on the isolated staging lane
Scope: `customer.subscription.updated` and `customer.subscription.deleted` for paid communities only

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

U-017 remains open. The next money-authority slice is an atomic, retryable community webhook receipt plus explicit refund/dispute risk state so duplicate and reordered financial events converge without relying on membership `revokedReason` as a hidden state machine.

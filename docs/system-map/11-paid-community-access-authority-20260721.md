# Paid Community Access Authority — Completion Receipt

Status: implemented, migrated, and proven on the isolated staging lane
Environment: Convex `quick-porcupine-949`; web target `polynet-staging.vercel.app`
Production: untouched

## Irreducible authority

```text
authenticated checkout intent
-> one caller-idempotent local checkout + Stripe Checkout session
-> verified Stripe completion
-> one Convex transaction creates/reactivates membership,
   creates/updates its unique Stripe subscription, and completes checkout
-> checkout-success page observes canonical access
```

The browser redirect is not access authority. It neither carries a grant token nor creates membership. It may only observe a checkout owned by the authenticated subject and enter after current backend membership/subscription truth grants access.

## Surface deleted

The former purchase-claim architecture duplicated data already fixed by verified checkout: user, community, price, amount, provider session, and expiry. This slice deletes:

- the `purchaseClaims` table and checkout `claimToken` field;
- claim creation, redemption, listing, pending-redemption, expiry, and account-lifecycle branches;
- the `/claim` route, manual token UI, pending-purchase account UI, auth-resume variants, and browser persistence;
- public billing aliases and claim-specific controller/helper modules;
- claim-specific lexical proof surface.

Checkout-session reconciliation remains because it owns external-effect idempotency and ambiguous provider failure recovery. That is a different, physically necessary job.

## Failure behavior

- First verified granting completion creates membership, subscription, and checkout completion atomically.
- A completion carrying non-granting subscription state stays pending and creates no access; a later verified granting projection may complete it.
- A block discovered at activation aborts the transaction and leaves all three unchanged.
- Re-delivering completion is idempotent.
- Re-delivering completion after a refund or terminal lifecycle transition cannot reactivate access.
- More than one subscription for a membership or provider subscription ID fails closed across access, webhook lookup, member administration, and partner-commission attribution; code does not rank a winner.
- Community owners cannot purchase their own community.
- A completed checkout may be observed after its checkout-attempt expiry, but only while current canonical entitlement still grants access.

## Staging migration receipt

The complete pre-migration staging aggregate contained 19 checkout sessions, including 16 community-join sessions, plus 16 purchase claims. All 16 claims were pending, expired, and matched their checkout owner; none had produced a membership or community subscription.

The bounded retirement migration on 2026-07-21 reported:

```text
deleted_claims: 16
scrubbed_checkout_claim_tokens: 16
retained_unexpired_claims: 0
retained_unexpired_checkout_tokens: 0
```

An immediate idempotent rerun reported zero claims scanned, zero tokens scrubbed, and zero unexpired residue. Only then were the migration function, table, schema field, and lifecycle-policy references removed.

## Proof receipt

`communityPaidAccessAuthority.test.ts` passes seven behavioral cases covering atomic activation, non-granting pending behavior, replay, terminal non-reactivation, block rollback, duplicate membership/provider identity, owner rejection, and observational finalization. The checkout-start, subscription-event convergence, and membership-authority suites also pass.

The final validation completed with:

- Convex and web TypeScript checks;
- the 36-step foundation baseline gate;
- a production-mode Vite build;
- final staging Convex deployment with all four `purchaseClaims` indexes deleted;
- `polynet-staging.vercel.app/version.json` matching the pushed staging `HEAD` and Sentry release;
- a signed-in Chrome smoke proving the normal community session loads, `/claim` canonicalizes to `/`, Account settings exposes no claim/pending-purchase controls, the checkout-success route remains an observational boundary, and no browser warnings or errors appear;
- a production-marker recheck proving `polynet.ai` remained on its separate pre-existing build.

The later U-017 authority slices added identity-only atomic access receipts and current-truth refund/dispute convergence, then removed their redundant compatibility surface. Remaining work is bounded asynchronous provider-outage recovery, live Stripe staging evidence, and separate creator settlement. Reintroducing a browser claim flow is not part of that work.

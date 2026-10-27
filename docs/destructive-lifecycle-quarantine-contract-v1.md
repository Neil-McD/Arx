# Destructive Lifecycle Quarantine Contract v1

Status: active release safety boundary
Last updated: 2026-07-28
Scope: public account and community deletion mutations

## Why this boundary exists

Account and community deletion currently cross product data, billing, provider,
audit, memory, and derived-cognition ownership boundaries. Those lifecycles do
not yet have one complete retention and teardown contract. Partial deletion is
therefore less safe than no deletion: it can destroy canonical rows while
leaving financial, provider, or derived records in an ambiguous state.

Until the complete lifecycle migration is separately designed and accepted,
public destructive deletion is quarantined.

## Public compatibility contract

The existing public identities and arguments remain available so deployed or
cached clients do not fail with an unknown-function transport error:

- `account:deleteOwnAccount({ authSubject? })`
- `communityLifecycle:deleteCommunity({ userId?, authSubject?, communityId })`

The retained functions are compatibility boundaries, not deletion
implementations.

## Current first-party client contract

Current first-party web clients do not advertise or invoke either quarantined
deletion mutation:

- global Account settings expose no account deletion control;
- community settings expose no Danger pane or community deletion control;
- no first-party browser gateway calls either retained public mutation;
- legacy `/c/:slug/settings/danger` paths normalize to the canonical Community
  settings pane.

This client contraction does not remove or weaken the retained public mutation
identities. Deployed or cached clients still receive the authority-checked,
deterministic lifecycle-blocked results below.

## Authority and result contract

Account deletion:

1. resolves an already-existing authenticated actor;
2. performs no account creation or relinking;
3. throws `account_delete_lifecycle_migration_blocked`.

Community deletion:

1. resolves the authenticated actor;
2. verifies that actor owns the target community;
3. throws `community_delete_lifecycle_migration_blocked`.

Authentication and ownership failures remain authoritative and occur before
the lifecycle-blocked result. The two lifecycle errors use structured
`ConvexError` `code` and `reason` fields.

## Zero-effect invariant

After authority validation, neither public mutation may:

- insert, patch, replace, or delete database records;
- write or delete storage objects;
- schedule cleanup or other background work;
- call provider, action, mutation, audit, or network side effects;
- create time-, randomness-, or retry-dependent state.

Every authorized replay returns the same lifecycle-blocked result. Historical
community cognition cleanup code and its staging acceptance remain evidence
for a future complete lifecycle; public deletion does not schedule that cleanup
while this quarantine is active.

## Explicitly outside this slice

- production data changes;
- Stripe, WorkOS, storage, or other provider cleanup;
- Convex production deployment;
- design of archival, retention, export, recovery, or eventual deletion;
- removal of the cached public mutation identities.

Re-enabling deletion requires a separately reviewed lifecycle contract with
retention rules, provider ordering, idempotency, recovery behavior, complete
effect inventory, and isolated acceptance evidence.

## Isolated staging acceptance

The exact release candidate at
`e7a209b788b8459acd1c952e64b06a7e5c5bf622` passed isolated backend staging
acceptance on 2026-07-28. The proof covered unauthenticated, mismatched,
unprovisioned, non-owner, legacy-user-ID-spoof, and authorized replay paths for
both retained public mutation identities. The complete fixture graph was
unchanged after the matrix, cleanup left zero residue, and the temporary
internal acceptance harness was removed from the deployed surface.

The human-readable certificate is
[`destructive-lifecycle-quarantine-staging-acceptance-20260728.md`](archive/destructive-lifecycle-quarantine-staging-acceptance-20260728.md).
Machine-checked evidence is stored in
[`destructive_lifecycle_quarantine_staging_acceptance_20260728.json`](../scripts/fixtures/destructive_lifecycle_quarantine_staging_acceptance_20260728.json).

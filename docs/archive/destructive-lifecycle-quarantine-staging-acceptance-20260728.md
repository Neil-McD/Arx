# Destructive Lifecycle Quarantine Staging Acceptance — 2026-07-28

Status: passed

## Scope and target isolation

This certificate proves the account and community deletion quarantine against
an isolated, self-expiring Convex deployment. It does not claim that account or
community deletion is implemented. It proves that the retained public
compatibility endpoints authenticate and authorize correctly, then fail closed
without effects.

- Candidate SHA: `e7a209b788b8459acd1c952e64b06a7e5c5bf622`
- Deployment: `clever-axolotl-242`
- Deployment reference:
  `neil-mcdevitt:polynet:dev/r1-lifecycle-quarantine-20260728`
- Deployment type: isolated development deployment configured as staging
- Expiration policy: one day
- Shared staging touched: no
- Production touched: no

Only inert acceptance-specific auth configuration was installed. No production
provider credentials were copied.

## Disposable dependency graph

The internal-only fixture harness created the minimum graph needed to expose
partial-deletion regressions:

- three users: an account target, a community owner/shared-DM survivor, and an
  authenticated non-owner;
- one owner-controlled unlisted community and one active non-owner membership;
- one shared direct-message conversation with two participants and one message;
- one community interaction root;
- one published community resource.

Before testing, the fixture contained no critical audit events, storage
objects, or scheduled functions.

## Authority and quarantine matrix

| Surface | Actor/request | Observed result |
| --- | --- | --- |
| Account | no verified identity | `verified_identity_required` |
| Account | verified identity disagrees with `authSubject` | `auth_subject_mismatch` |
| Account | verified but unprovisioned subject | `user_not_found` |
| Account | existing authenticated actor, first attempt | `account_delete_lifecycle_migration_blocked` |
| Account | same authenticated actor, replay | `account_delete_lifecycle_migration_blocked` |
| Community | no verified identity | `verified_identity_required` |
| Community | owner identity paired with another user's legacy `userId` | `user_id_mismatch` |
| Community | authenticated member who is not the owner | `community_owner_required` |
| Community | authenticated owner, first attempt | `community_delete_lifecycle_migration_blocked` |
| Community | same authenticated owner, replay | `community_delete_lifecycle_migration_blocked` |

The two authorized results were structured `ConvexError` values with matching
`code` and `reason` fields.

## Zero-effect proof

The complete post-matrix snapshot matched the complete pre-matrix snapshot
field-for-field. All fixture IDs, creation times, product timestamps, ownership
links, membership state, direct-message rows, interaction rows, and resource
rows were preserved.

Both snapshots also contained:

- zero critical audit events;
- zero storage objects;
- zero scheduled functions.

This proves that authentication failures, authorization failures, authorized
quarantine responses, and their replays produced no database, audit, storage,
or scheduler effects on the exercised graph.

## Teardown and deployed surface

The harness refused teardown if any audit, storage, or scheduled-function
residue existed. Teardown succeeded and a separate final snapshot returned
zero fixture rows in every tracked table.

The exact clean candidate was then redeployed with TypeScript checking enabled.
Its function manifest retained:

- `account:deleteOwnAccount`
- `communityLifecycle:deleteCommunity`

The manifest contained zero
`lifecycleQuarantineAcceptance` functions after the clean redeploy.

Durable machine-readable evidence is stored in
`scripts/fixtures/destructive_lifecycle_quarantine_staging_acceptance_20260728.json`.

This certificate is backend acceptance for the exact candidate. It is not a
merge, a production deployment, a provider-cleanup test, or approval to
re-enable destructive deletion.

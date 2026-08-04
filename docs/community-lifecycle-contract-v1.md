# Community Lifecycle Contract v1

## Scope

This contract introduces the compatibility and authority foundation for
community archival. It does not expose an archive or restore command and does
not perform provider billing operations.

## Canonical state

The `communities` row is the product source of truth for lifecycle:

- `active`: normal operation and new work are allowed.
- `sunsetting`: existing paid-through operation may continue, but new work can
  be closed by lifecycle-aware entry points.
- `archived`: community content and normal management are inaccessible.

During the additive rollout, an absent `lifecycleStatus` is `active` and an
absent `lifecycleGeneration` is `0`. Lifecycle state is never inferred from
visibility, subscription status, UI routing, or the dormant
`communityArchiveDocuments` knowledge table.
Explicit malformed lifecycle values fail closed rather than normalizing to an
active community.

## Authority boundary

`communityLifecycleCore` owns lifecycle normalization and guards.

- Normal chat, member, moderator, manager, and owner operations reject an
  archived community before role or entitlement can grant access.
- Access projections retain relationship identity while returning no content
  or management capabilities for an archived community.
- Only explicit lifecycle inspection and transition paths may authorize an
  owner across lifecycle states.
- The platform-home `polynet` community is lifecycle protected.

The quarantined community deletion path remains owner-authorized across
lifecycle states and always returns its existing quarantine error.

## Migration

The internal audit and backfill are bounded, cursor-paginated, idempotent, and
do not change `updatedAt`. Rows containing lifecycle timestamps without a
status, or an invalid generation, are reported as blocked rather than silently
rewritten.

No runtime query may rely exclusively on lifecycle indexes until the audit
reports zero missing or invalid rows in the target deployment.

## Deferred

- Public archive and restore mutations.
- Lifecycle operation receipts and retry orchestration.
- Stripe cancellation or checkout expiration.
- Public, directory, worker, email, and route projection containment.
- Archive and restore UI.
- Paid-community sunsetting execution.

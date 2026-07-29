# Automatic Community Cognition Cleanup — Staging Acceptance

Status: passed
Date: 2026-07-16

## Isolated target

- Convex deployment: `coordinated-otter-526`
- Deployment reference:
  `neil-mcdevitt:polynet:dev/cognition-cleanup-v1-20260716`
- Deployment kind: `staging`
- Expiration: one day
- Production touched: no

The proof reused the empty self-expiring deployment from the guarded cleanup
acceptance. It temporarily restored one environment-gated fixture module and
did not change production, shared staging, schema, cron configuration, public
APIs, or frontend behavior.

## Irreducible runtime

The final runtime has one cognition-cleanup function:

- `drainDeletedCommunityCognitionInternal`

The prior manual inspection and per-phase deletion wrappers were removed.
Canonical `deleteCommunity` now deletes the community row and schedules the
first drain mutation in the same transaction. Every drain mutation deletes at
most one hundred rows and atomically schedules either the same phase or the
next fixed phase. The final phase runs the bounded inspection core and fails if
any allowlisted cognition remains.

There is no cleanup table, job ledger, cron, action, public endpoint, operator
driver, or UI. Convex's built-in scheduled-function record is the execution
ledger.

## Canonical automatic proof

The disposable target contained:

- one record in thirteen cleanup phases
- 205 source traces
- 218 cognition records in total
- one interaction, AI Feed post, event, and Concierge serve request as
  product-source non-interference sentinels

The untouched control contained one row in each of the fourteen cognition
phases and the same four product-source sentinels.

The acceptance flow invoked only the real public
`communityLifecycle:deleteCommunity` mutation under the seeded owner's verified CLI
identity. It never called a cleanup function directly.

Canonical deletion produced exactly sixteen successful scheduled drain
mutations:

- one mutation for each of thirteen ordinary phases
- three mutations for the 205-row source-trace phase

The target reached zero rows in all fourteen cognition phases. The control
retained all fourteen cognition rows. Target and control interactions, AI Feed
posts, events, and Concierge requests remained unchanged.

## Determinism and failure boundaries

The machine proof independently walks the same phase transition core and
proves:

- exactly sixteen executions delete the 218-row fixture
- every execution deletes at most one hundred rows
- source traces require exactly three executions
- final inspection is empty
- replay traverses the fixed phases but deletes zero rows
- live-community cleanup remains forbidden
- a poisoned cross-community index result deletes nothing
- product-source tables stay outside the allowlist
- the control stays untouched

Late cognition writes remain guarded by the prior live acceptance and the
same deterministic contract proof.

## Teardown and final deployed surface

Fixture teardown removed the control's fourteen cognition rows, ten supporting
product-source fixture rows, the remaining control membership and community,
and both fixture users. Final reads found zero fixture communities, users,
cognition rows, or product-source rows.

The temporary flag and fixture module were removed and the deployment was
pushed again. The final function specification contains exactly one cognition
cleanup function, `drainDeletedCommunityCognitionInternal`, and contains
neither manual wrapper nor any acceptance function.

The machine-readable certificate is
`scripts/fixtures/community_cognition_cleanup_staging_acceptance_20260716.json`.

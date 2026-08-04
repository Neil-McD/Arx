# Community Lifecycle Contract v1

## Scope

This contract introduces the compatibility, authority, and durable-operation
foundation for community archival. It does not expose a public archive or
restore command and does not perform provider billing operations. It does
contain synchronous entry, acquisition, and active-shell projections so
lifecycle state cannot be bypassed by cached clients or direct function calls,
and it contains background external-effect admission so archived communities
cannot begin new inference, embed refresh, or community email delivery.

## Canonical state

The `communities` row is the product source of truth for lifecycle:

- `active`: normal operation and new work are allowed.
- `sunsetting`: existing paid-through operation may continue, while new joins,
  approvals, checkout creation, and public acquisition are closed.
- `archived`: community content and normal management are inaccessible.

During the additive rollout, an absent `lifecycleStatus` is `active` and an
absent `lifecycleGeneration` is `0`. Lifecycle state is never inferred from
visibility, subscription status, UI routing, or the dormant
`communityArchiveDocuments` knowledge table.
Explicit malformed lifecycle values fail closed rather than normalizing to an
active community.
Every newly created community writes explicit `active` and generation `0`;
field absence is compatibility for pre-foundation rows only. A missing
generation on a legacy checkout or claim means generation `0`, never a
wildcard that can survive an archive/restore generation change.

## Authority boundary

`communityLifecycleCore` owns lifecycle normalization and guards.

- Normal chat, member, moderator, manager, and owner operations reject an
  archived community before role or entitlement can grant access.
- Access projections retain relationship identity while returning no content
  or management capabilities for an archived community.
- Only explicit lifecycle inspection and transition paths may authorize an
  owner across lifecycle states.
- The platform-home `polynet` community is lifecycle protected.
- Membership activation is the canonical new-access boundary. Existing active
  memberships may refresh during `sunsetting`; every inactive-to-active
  transition requires an `active` community.
- Ownership is relationship metadata, never a substitute for
  `can_enter_community`.
- Checkout and purchase-claim rows capture `lifecycleGeneration`; stale
  generations cannot finalize or grant membership.

Archived communities are absent from the active shell, public discovery,
profile community strips, and the authenticated agent/MCP directory. Public
funnel, statistics, memory-overview, and visit endpoints return no community
content. A direct web route renders only a terminal lifecycle message.

The quarantined community deletion path remains owner-authorized across
lifecycle states and always returns its existing quarantine error.

## Archive operation kernel

An archive request is represented by one durable
`communityLifecycleOperations` row for a community lifecycle generation. The
internal begin transition is atomic: it verifies owner authority, protects the
platform-home community, increments the lifecycle generation, changes the
community from `active` to `sunsetting`, and inserts the operation receipt in
the same transaction. A retry against the resulting `sunsetting` generation
returns the existing receipt; a missing or conflicting receipt fails closed.

The operation row is orchestration authority, not provider proof. The initial
kernel creates only `requested` operations. No current public or web caller can
invoke it, and no worker may mark an operation `succeeded` until the later
provider-cancellation slice proves every required billing side effect.

## Subscription effect foundation

Stripe subscription effects use one provider identity: subscription ID plus
its explicit account scope. Community-member subscriptions are always scoped
to the persisted connected account; founder platform subscriptions remain
explicitly platform scoped. Retrieval and mutation use the same scope.

The effect primitive classifies provider outcomes as terminal, retryable,
indeterminate, or blocked. A missing Stripe object is terminal only after a
lookup in the exact persisted account scope. Remove and ban now use this
primitive before local membership revocation, deduplicate exact provider
identities, and fail closed for incomplete Stripe identity or unsupported
active external subscriptions. This foundation does not yet execute an archive
operation or authorize a public archive command.

Checkout creation and completion use the same lifecycle epoch boundary. If an
archive begins after Stripe checkout creation, the provider checkout identity
is persisted before local quarantine and synchronous compensation. Every
checkout completion rechecks lifecycle inside the persistence transaction; a
stale community or founder checkout is expired locally, cannot grant access or
funding, and its exact-scope provider subscription is canceled idempotently by
the webhook path. Local quarantine never fabricates a local provider-canceled
status before Stripe proves that outcome. Existing founder subscriptions remain
eligible for paid-through lifecycle updates; only a new stale checkout is
quarantined.

## Operational containment

`communityLifecycleCore` is also the canonical background-work authority.
Legacy missing lifecycle status, `active`, and `sunsetting` remain operational;
`archived` fails closed. Cognition writes, heartbeat enqueue and execution,
compiler handoff claims, community-agent funding admission, serve-request
execution, and external embed enrichment all recheck this authority at their
last responsible boundary. Scheduled work created before archival therefore
cannot start a new provider effect after archival.

Community-scoped outbox rows carry `communityId`. Digest, event reminder,
mention, access-granted, and billing-issue enqueue paths propagate that scope.
The outbox rechecks lifecycle during enqueue, claim, and immediately before
provider delivery; archived jobs become terminally `suppressed`. Generic
account and direct-message email remains unscoped and unaffected. Operational
cron scans use bounded lifecycle-index lanes and retain the missing-status
compatibility lane until migration is complete.

## Migration

The internal audit and backfill are bounded, cursor-paginated, idempotent, and
do not change `updatedAt`. Rows containing lifecycle timestamps without a
status, or an invalid generation, are reported as blocked rather than silently
rewritten.

No runtime query may rely exclusively on lifecycle indexes until the audit
reports zero missing or invalid rows in the target deployment.
Discover therefore merges the missing-status compatibility lane with the
explicit `active` lane through the lifecycle index.

## Deferred

- Public archive and restore commands.
- Operation claiming, retry execution, and provider work receipts.
- Archive-worker bulk Stripe cancellation and expiration for provider objects
  that predate the archive request.
- Archive and restore UI.
- Paid-community sunsetting execution.

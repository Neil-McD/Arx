# Community Lifecycle Contract v1

## Scope

This contract introduces the compatibility, authority, and durable-operation
foundation for community archival. It does not expose a public archive or
restore command. It contains the internal, leased archive executor and its
provider billing effects, but exposes no builder-facing command or UI. It does
contain synchronous entry, acquisition, and active-shell projections so
lifecycle state cannot be bypassed by cached clients or direct function calls,
and it contains background external-effect admission so archived communities
cannot begin new inference, embed refresh, or community email delivery.

## Canonical state

The `communities` row is the product source of truth for lifecycle:

- `active`: normal operation and new work are allowed.
- `archiving`: normal access and work are immediately closed while the one
  internal lifecycle worker settles provider subscriptions and checkouts.
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
  archiving or archived community before role or entitlement can grant access.
- Access projections retain relationship identity while returning no content
  or management capabilities for an archived community.
- Only explicit lifecycle inspection and transition paths may authorize an
  owner across lifecycle states.
- The public lifecycle-operation inspection query resolves authenticated
  identity server-side, requires the owner across lifecycle states, and returns
  only bounded receipt state. It exposes no provider or member identity.
- The platform-home `polynet` community is lifecycle protected.
- Membership activation is the canonical new-access boundary. Membership rows
  remain preserved, but no activation or normal access is admitted while the
  community is `archiving` or `archived`.
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
community from `active` to `archiving`, and inserts the operation receipt in
the same transaction. A retry against the resulting `archiving` generation
returns the existing receipt; a missing or conflicting receipt fails closed.

Before the atomic transition, the kernel rejects unsupported active external
subscriptions and incomplete Stripe identities. The operation row is durable
orchestration authority. A bounded internal cron claims due operations with a
lease, reclaims expired leases, and retries transient or indeterminate provider
outcomes with bounded exponential backoff. A blocked provider outcome or an
exhausted retry budget leaves a terminal failed receipt and the community
contained in `archiving` for explicit operator repair.

The worker handles one provider effect at a time. It cancels founder platform
subscriptions in platform scope, community-member subscriptions in their exact
connected-account scope, and expires or compensates pending checkout sessions.
Founder and member subscription selection are both bounded indexed reads; the
worker never collects subscription history to choose the next effect.
It updates a local subscription or checkout row only after the exact provider
effect is terminal. A crash after provider mutation is safe: the next lease
re-reads Stripe and converges. The final transaction rechecks that no active
subscription or pending checkout remains before changing the community to
`archived` and the operation to `succeeded`.

Lease ownership and lifecycle authority are separate checks. Effect reads,
completion, and finalization require both a current lease and the exact
`archiving` generation. Failure recording requires the current lease but not a
still-archiving community, so deterministic community deletion or lifecycle
drift terminates the receipt instead of creating an unreleasable reclaim loop.
Due operations already carrying that drift are failed before leasing.

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
active external subscriptions. The internal archive executor uses this
primitive; it still does not authorize a public archive command.

Checkout creation and completion use the same lifecycle epoch boundary. If an
archive begins after Stripe checkout creation, the provider checkout identity
is persisted before local quarantine and synchronous compensation. Every
checkout completion rechecks lifecycle inside the persistence transaction; a
stale community or founder checkout is expired locally, cannot grant access or
funding, and its exact-scope provider subscription is canceled idempotently by
the webhook path. Local quarantine never fabricates a local provider-canceled
status before Stripe proves that outcome. Existing founder subscriptions are
immediately canceled by the archive executor; stale completion remains
independently quarantined.

## Operational containment

`communityLifecycleCore` is also the canonical background-work authority.
Only legacy missing lifecycle status and explicit `active` remain operational;
`archiving` and `archived` fail closed. Cognition writes, heartbeat enqueue and execution,
compiler handoff claims, community-agent funding admission, serve-request
execution, and external embed enrichment all recheck this authority at their
last responsible boundary. Scheduled work created before archival therefore
cannot start a new provider effect after the archive transition.

Community-scoped outbox rows carry `communityId`. Digest, event reminder,
mention, access-granted, and billing-issue enqueue paths propagate that scope.
The outbox rechecks lifecycle during enqueue, claim, and immediately before
provider delivery; archiving and archived jobs become terminally `suppressed`. Generic
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

- Archive and restore UI.
- Public archive and restore authorization.
- Restore execution and subscription recreation semantics.

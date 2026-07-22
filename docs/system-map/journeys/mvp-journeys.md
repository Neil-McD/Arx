# MVP Journey Reconciliation

Snapshot: `67c89903add41ff9b8de20929e07429a8d98f3bc`, with later staging completion receipts reconciled below. Provider-outage convergence, unrelated signed-in journeys, and destructive recovery remain unproven.

## 1. Authenticate, refresh, logout, delete account

```text
browser -> same-origin auth bridge -> OAuth provider -> verified Convex identity
-> users/authSessions -> actor projection -> leased in-place refresh
-> local-authoritative logout -> quarantined account lifecycle
```

- Authority: verified provider identity and actor resolver; cookie is only an opaque pointer.
- Good: verified subject is the sole account-binding authority; secure random credentials are stored only as hashes; one absolutely expiring row refreshes in place under a single-owner lease; logout revokes locally before provider cleanup.
- Gaps: the outer browser-to-Vercel deadline plus bounded routine-success diagnostics remain; account deletion is safely unavailable until its resumable lifecycle exists. Convex-to-provider PKCE/refresh and Vercel-to-Convex auth headers and bodies are bounded by whole-response deadlines, the two-call callback shares one route budget, and malformed session/flow cookies clear before any bridge effect.
- Recovery receipt: auth/session retention is indexed, bounded, and self-continuing; account deletion still lacks resumable phase receipts.

## 2. Founder creates and manages a community

```text
authenticated builder -> capacity/tier gate -> createCommunity
-> communities(ownerId, slug, visibility, entryPolicy)
-> onboarding/settings/resources/agent projections
```

- Authority: actor, builder capacity, `communities.ownerId`.
- Good: owner is not duplicated as a membership row; Published/Unlisted semantics are explicit.
- Gaps: slug uniqueness remains application-level; community deletion is safely quarantined until a bounded resumable lifecycle exists. Membership uniqueness is fail-closed and the deprecated onboarding storage is gone on staging.

## 3. Founder publishes or shares the canonical funnel

```text
owner settings -> visibility/entry policy -> /c/:slug public funnel
-> public community projection -> gate/join action
```

- Authority: owner mutation; funnel is a projection and never grants entry.
- Good: Published drives Discover; Unlisted is addressable by shared slug; both remain gated.
- Gap: route/product docs still carry old Workspace destination claims; public boundary behavior needs signed-out/signed-in staging smoke.

## 4. Visitor discovers or opens funnel, passes gate, joins

```text
Discover or shared URL -> public funnel -> verified actor
-> block/join request/membership/subscription resolution
-> membership activation + onboarding session -> member projection
```

- Authority: current block, membership, access source, provider-derived subscription.
- Good: visibility does not bypass access; membership pair reads fail closed on duplicates; activation is idempotent for an active row and reactivation preserves row identity.
- Gaps: provider-delay behavior remains unproven. Join-request storage is constrained to `pending | denied`, and cached active-member-count divergence is closed on staging.

## 5. Member navigates, interacts, uses voice/resources, manages membership

```text
community route -> current access bundle -> canonical interaction/resource operation
-> roots/replies/reactions/mentions or resource contents
-> evidence sync / notifications / UI projection
```

- Authority: each operation re-resolves community access and role.
- Good: canonical interaction substrate and resource/evidence coupling are explicit.
- Gaps: legacy chat still feeds digests/archive/context; resource body has dual read authority; privacy purge and membership departure semantics are incomplete.

## 6. Personal agent acts under one community lens

```text
member dock -> explicit community selector -> current access check
-> member channel/episode -> bounded context/retrieval
-> authorized native tool -> runtime/usage/outcome receipt
```

- Authority: member identity plus current explicit context and per-operation access.
- Good: context applies to subsequent turns and history remains auditable.
- Gaps: tool semantics are spread across registry/platform/MCP surfaces; exact signed-in runtime and provider failure recovery not exercised.

## 7. Community-agent mention and autonomous cognition

```text
canonical mention or scheduled knock -> community-owned agent identity
-> evidence/memory/compiler gate -> search/write protocol
-> canonical interaction/intelligence effect -> source/outcome receipt
```

- Authority: separate community-owned principal, owner off-switch, evidence gate, role/policy boundary.
- Good: not conflated with member agent; internal protocol is deliberately small.
- Gap: six-hour memory sweep has no cursor and can starve communities after the first 500.

## 8. External harness uses official MCP

```text
MCP OAuth/client -> official transport -> explicit community context selector
-> server membership/entitlement validation -> semantic capability
-> resource/memory/interaction operation -> audited receipt
```

- Authority: server-validated client/principal and community context; client-supplied IDs are opaque selectors.
- Good: unauthenticated public boundary fails closed and MCP origin/context policy is explicit.
- Gaps: `workspace_*` wire compatibility vocabulary and independently declared MCP schemas can drift from native semantics; external-client compatibility inventory is unknown.

## 9. Paid access, entitlement convergence, and creator payout

```text
checkout request -> Stripe -> webhook/provider verification
-> atomic checkout/membership/subscription projection -> per-request access
-> destination/Connect creator settlement -> audit/operator projection
```

- Authority: Stripe event/object state; redirects are UX only.
- Good: verified completion owns first activation, redirects are observational, duplicate subscription identity fails closed, and ordinary creator payout remains separate.
- Good: Builder Partner v3 is community-only 4%, records explicit policy/rate basis, creates no new paid-tool commission, and preserves historical economics.
- Gaps: delayed/reordered/refund/dispute/Connect convergence and historical legal-lineage/payout reconciliation remain incomplete.

## 10. Connect an app/skill and project authorized capability

```text
owner/member settings -> developer app or skill package
-> OAuth/validation -> user/community mount or install
-> allowed tool snapshot -> agent/MCP projection -> provider effect receipt
```

- Authority: app/skill owner, community/member role, OAuth/provider state, mount policy.
- Good: private capability state is distinct from public Discover presentation.
- Gaps: OAuth lifecycle primitives are repeated across provider classes; account deletion and external revocation completeness are unproven. The deferred public-marketplace CSS residue is removed.

## 11. Protected coding/community harness and Workspace compatibility

```text
authorized project/thread -> credit admission -> runtime/worker session
-> isolated path/tool operation -> terminal/preview/provider effect
-> event/usage/settlement receipt -> cleanup/finalization
```

- Authority: user/project context, tool allowlist, provider session/lease, path isolation, credit reservation.
- Good: web cannot execute local tools; worker path/symlink boundaries and runtime receipts are explicit.
- Gaps: UI still navigates to Workspace while route parsing retires it to Landing; backend substrate and destination UI are not cleanly separated; recovery and provider outage need staging proof.

## Journey gate result

The eleven required paths have a canonical authority/state trace. Shared-data ownership, destructive-path quarantine, Builder Partner v3, and authenticated session continuity are complete on staging. The next upstream architecture gate is the resumable deletion lifecycle, with membership/entitlement authority closed before destructive executors depend on it. Eventual-service fairness, canonical data migrations, and Workspace destination versus protected substrate remain downstream; frontend decomposition still waits.

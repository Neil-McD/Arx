# MVP Journey Reconciliation

Snapshot: `67c89903add41ff9b8de20929e07429a8d98f3bc`. These are static traces. Authenticated staging behavior, provider convergence, and destructive recovery remain unproven.

## 1. Authenticate, refresh, logout, delete account

```text
browser -> same-origin auth bridge -> OAuth provider -> verified Convex identity
-> users/authSessions -> actor projection -> refresh replacement chain
-> logout revocation -> account lifecycle
```

- Authority: verified provider identity and actor resolver; cookie is only an opaque pointer.
- Good: identity mismatch fails closed; session replacement traversal is bounded.
- Gaps: insecure random fallback; logout can clear the handle after revocation failure; account deletion is unbounded, incomplete, and destroys shared DM/community data.
- Recovery receipt: session/audit events exist; deletion lacks resumable phase receipts.

## 2. Founder creates and manages a community

```text
authenticated builder -> capacity/tier gate -> createCommunity
-> communities(ownerId, slug, visibility, entryPolicy)
-> onboarding/settings/resources/agent projections
```

- Authority: actor, builder capacity, `communities.ownerId`.
- Good: owner is not duplicated as a membership row; Published/Unlisted semantics are explicit.
- Gaps: slug and membership uniqueness are application-level; deletion is an unbounded cascade; deprecated onboarding field remains.

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
- Good: visibility does not bypass access; activation is idempotent for an active row.
- Gaps: duplicate membership rows, missing-`active` fail-open compatibility, free-form join status, provider-delay behavior unproven.

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
-> checkout/subscription projection -> per-request access
-> destination/Connect creator settlement -> audit/operator projection
```

- Authority: Stripe event/object state; redirects are UX only.
- Good: idempotent lifecycle structure and ordinary creator payout boundary exist.
- Gaps: delayed/reordered/refund/dispute fixtures are unproven; retained secondary Builder Partner policy is coupled into the same webhooks and still implements pre-v3 economics.

## 10. Connect an app/skill and project authorized capability

```text
owner/member settings -> developer app or skill package
-> OAuth/validation -> user/community mount or install
-> allowed tool snapshot -> agent/MCP projection -> provider effect receipt
```

- Authority: app/skill owner, community/member role, OAuth/provider state, mount policy.
- Good: private capability state is distinct from public Discover presentation.
- Gaps: OAuth lifecycle primitives are repeated across provider classes; account deletion and external revocation completeness are unproven; public marketplace CSS remains.

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

The eleven required paths have a canonical authority/state trace. Shared-data ownership and Builder Partner direction are now resolved for planning. The first implementation gate is the destructive-lifecycle safety fixture; remaining upstream work includes Builder Partner v3 migration, eventual-service fairness for crons, and Workspace destination versus protected substrate. Frontend decomposition should wait until obsolete surfaces and these authority migrations are bounded.

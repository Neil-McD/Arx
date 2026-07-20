# Domain Dossier — Identity, Sessions, Communities, Membership, and Entitlement

Snapshot: `67c89903add41ff9b8de20929e07429a8d98f3bc` on isolated staging.

## Irreducible job

This domain answers five questions and should do no more:

1. Who is the current authenticated human?
2. Which Polynet account row represents that identity?
3. Which community exists and who owns it?
4. Is this account currently allowed into that community, and with what role?
5. Which platform tier and community-paid state constrain the requested operation?

All five are MVP core. UI, prompts, manifests, and agent-selected arguments are projections or requests; none grants authority.

## Canonical state roles

| State | Role | Key implementation evidence |
| --- | --- | --- |
| `users` | canonical Polynet account keyed by verified `authSubject` | `convex/schema.ts:5-27`; `convex/authActor.ts` |
| `authSessions` | canonical opaque continuity/session ledger and encrypted upstream token state | `convex/schema.ts:29-48`; `convex/authSessions.ts` |
| `userEntitlements` | append-history platform tier grants | `convex/schema.ts:50-65` |
| `communities` | canonical community identity, owner, visibility, entry policy | `convex/schema.ts:1253-1301` |
| `communityMemberships` | canonical non-owner membership/access-source relationship | `convex/schema.ts:1303-1327` |
| `communitySubscriptions` | provider-derived paid community-access state | `convex/schema.ts:1466-1494` |
| `communityBlocks` | negative community access override | `convex/schema.ts:1391-1402` |
| `communityJoinRequests` | approval workflow history/current projection | `convex/schema.ts:1376-1389` |
| onboarding config/sessions | activation workflow and progress, not access authority | `convex/schema.ts:1329-1363` |
| `communities.activeMemberCount` | derived cache; owner plus active non-owner membership rows | `convex/communityCore.ts:690-776` |
| `communities.memberOnboarding` | deprecated compatibility field | explicit schema comment at `convex/schema.ts:1269-1287` |

## Authority path

### Authentication and actor resolution

`authIdentity` asks Convex for a verified identity. If an explicit subject disagrees, it fails with `auth_subject_mismatch`; absent verified identity fails closed unless an explicitly configured fallback is allowed. The fallback itself is limited by environment logic to development/test. `authActor` then maps the subject to the canonical `users` row and rejects supplied-user mismatches.

The good invariant is clear: caller-supplied identity is an assertion, never authority. The focused verified-identity and public-identity guards pass.

### Session lifecycle

The Vercel routes start/callback/bootstrap/refresh/logout through a same-origin bridge protected by a server-held bridge secret. The browser cookie is `HttpOnly`, `Secure` off localhost, and `SameSite=Lax` (`api/auth/_cookies.js:150-178`). Provider token state is encrypted in `authSessions`. Refresh rotates the opaque session and revokes/replaces the predecessor. Bootstrap follows at most eight replacement links and rejects loops or overlong chains (`convex/authSessions.ts:500-540`).

Logout now treats the canonical Polynet session as the authority. The server revokes that session before attempting bounded best-effort provider logout; only a confirmed local outcome permits the Vercel route to clear the cookie and the web controller to clear caches, broadcast signed-out state, and navigate. Bridge, network, or local-revocation failures return a retryable result while preserving the cookie and browser session. A lost response after committed revocation converges on retry because missing and already-revoked sessions are idempotent success. Provider failure is diagnostic evidence, not permission to resurrect or block the locally revoked session (`convex/authSessions.ts`, `api/auth/logout.js`, `shared/authCore.ts`, `apps/web/src/controllers/confirmedSignOut.ts`).

### Community creation and ownership

Creation resolves the authenticated actor, requires setup and builder capacity, checks the requested slug, normalizes two-state visibility and entry policy, then writes the community with `ownerId` and `activeMemberCount: 1` (`convex/communityLifecycle.ts:504-599`). The owner is not duplicated as a membership row. Owner authority is derived from `community.ownerId`.

Discover queries only `published` rows and is capped at 200. Direct funnel lookup resolves by slug without filtering visibility, which is compatible with an explicitly shared Unlisted funnel. Neither path grants entry; access remains gated.

### Membership and access

Membership activation looks up all rows for `(communityId,userId)`, chooses the most relevant, updates an active row idempotently, or reactivates/inserts with an incremented `activationSequence` (`convex/communityMembershipLifecycle.ts:15-87`). Onboarding creation is best-effort after access is established, so onboarding cannot block entitlement.

Access resolution applies these rules in order:

1. owner derives access from `community.ownerId`;
2. a block denies non-owner access;
3. inactive/revoked membership denies access;
4. open/approval communities and durable free/manual grants use the active membership;
5. paid-subscription membership resolves the most relevant subscription status;
6. role and capability booleans are derived only after entitlement.

Published visibility never bypasses this path. Focused lifecycle, role-policy, state-audit, and gate-parity proofs pass.

### Platform entitlement

Platform tier is the latest active row in `userEntitlements`, defaulting to free. This resolution is separately implemented in `convex/auth.ts`, `convex/entitlements.ts`, and `convex/gates.ts`. Each implementation collects the user's history, filters active windows, and sorts by `startsAt`. The shared gate policy reduces policy drift after that point, but the canonical data-resolution step is still triplicated.

## Confirmed invariants

- Verified identity wins over every caller-supplied identity value.
- Community owner is derived from `communities.ownerId`; persisted membership roles are only admin, moderator, and member.
- Visibility is only Published or Unlisted; Published is discoverability, not entitlement.
- Community access is reevaluated from current block, membership, access source, and subscription state.
- Membership activation is idempotent for an already-active row.
- Onboarding state is downstream from access and cannot create access.
- Session replacement traversal is bounded to eight links.
- Client/public user IDs are projections; database IDs and supplied IDs do not grant authority.

## Complexity and growth risks

Let `U` be users, `E` entitlement rows for one user, `M` membership rows for a community, `D` duplicate membership rows for one pair, `S` auth sessions, and `T/Q/R` community threads/messages/reactions.

| Path | Current order | Why it matters |
| --- | --- | --- |
| Email compatibility lookup during actor continuity | indexed query, then worst-case `O(U)` full scan on miss | It is invoked before checking whether production email relink is enabled; auth cost grows with the entire user base. |
| Platform tier resolution | `O(E log E)` per resolver call | Three implementations repeat the collect/filter/sort rule; history grows with grants and billing syncs. |
| Membership selection for one pair | `O(D log D)` | Schema does not enforce uniqueness; multiple current rows are resolved in application code. |
| Active member count synchronization | `O(M)` per transition | It scans all community membership rows and counts rows, not distinct users; duplicate active rows can overcount. |
| Revoked session pruning | `O(S)` scan per maintenance call | The deletion limit caps writes, not scan cost; no `revokedAt` index or scheduled owner is present. |
| Community deletion | `O(all checkout sessions + domain rows + T×Q×R traversal)` in one mutation | A large community or global checkout history can exceed transaction/time limits and leave deletion behavior unavailable. |
| Discover list | bounded to at most 200 communities plus per-community plan/branding reads | Request count is bounded, but still an N+1/fan-out candidate for the later public-boundary pass. |

## Security and robustness risks

1. Both session-ID generators fall back from `crypto.randomUUID()` to `Math.random()` plus time (`convex/authSessions.ts:339-344`, `convex/httpAuthBridge.ts:47-52`). A security credential identifier should fail closed if secure randomness is unavailable.
2. Logout's best-effort bridge call can report success after failing to revoke server/provider state.
3. Revoked-session maintenance is a secret-gated public mutation that scans the full table. It is operationally fragile and broadens a sensitive maintenance surface.
4. Missing `communityMemberships.active` is treated as active for legacy compatibility (`convex/communityCore.ts:683-687`). That preserves old rows but is access-critical fail-open compatibility until legacy prevalence is proven zero and the invariant is tightened.
5. `communityJoinRequests.status` is an unconstrained string even though downstream logic assumes a small state machine.
6. Community deletion is an unbounded destructive transaction with a global checkout-session scan and nested interaction deletion. Completeness across all 125 tables is not yet proven.

## Reduction candidates

| Exact candidate | Classification | Action | Idiot index | Reason/owner |
| --- | --- | --- | ---: | --- |
| Verified actor, community owner, membership, block, and entitlement authority | `KEEP (MVP core)` | `HARDEN` | 0 | Physically required to make gated communities secure. Owner: identity/access. |
| Three platform-tier resolution implementations | `KEEP (MVP core)` | `CONSOLIDATE`, `BOUND` | 7 | The job is required; three copies of the same append-history rule are not. Owner: platform entitlement. |
| Full-user email compatibility scan on the auth path | `KEEP (MVP core)` | `MIGRATE_THEN_DELETE`, `BOUND` | 8 | Legacy email normalization is useful only until indexed data is complete; global scanning is not an acceptable steady-state requirement. Owner: auth continuity. |
| Insecure session-ID randomness fallback | `KEEP (MVP core)` | `HARDEN` | 10 | Availability fallback cannot justify weakening a credential identifier; secure generation should fail closed. Owner: auth session. |
| Duplicate membership-row compatibility and absent-`active` fallback | `DECISION REQUIRED (user confirmation)` | `OBSERVE_FIRST`, `MIGRATE_THEN_DELETE` | 7 | Removal is desirable but unsafe without bounded staging distributions and a uniqueness migration plan. Owner: community access. |
| Deprecated `communities.memberOnboarding` field | `DELETE (deferred/dead)` | `OBSERVE_FIRST`, `MIGRATE_THEN_DELETE` | 9 | Schema says current product code never reads/writes it; stored-value and migration completion must be verified first. Owner: schema lifecycle. |
| Join-request free-form status | `KEEP (MVP core)` | `HARDEN` | 6 | Approval flow is required; arbitrary states are not. Owner: community access. |
| One-transaction community cascade deletion | `KEEP (MVP core)` | `HARDEN`, `BOUND` | 8 | Deletion is required; unbounded all-domain work in one transaction is not. Owner: account/community lifecycle. |

## Proof posture

The current proof suite gives strong structural and deterministic policy evidence. It does not yet prove live provider revocation, concurrent uniqueness, high-cardinality performance, deletion recovery, or signed-in staging behavior. Those remain explicit unknowns rather than hidden assumptions.

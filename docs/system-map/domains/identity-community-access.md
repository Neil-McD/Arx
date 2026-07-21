# Domain Dossier — Identity, Sessions, Communities, Membership, and Entitlement

Snapshot: `67c89903add41ff9b8de20929e07429a8d98f3bc` on isolated staging.

Current staging delta: the deprecated `communities.memberOnboarding` field and empty
`agentLifecycleActivations` table were deleted after complete zero-row scans and
zero-work cleanup receipts. The frozen snapshot still records their former shape.

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
| `authSessions` | canonical bounded continuity state: hashed browser credential, absolute expiry, refresh lease/revision, revocation/retention timestamps, and encrypted upstream token state | `convex/schema.ts`; `convex/authSessions.ts`; `convex/authSessionCore.ts`; `convex/authProviderRequest.ts` |
| `userEntitlements` | sparse current-source platform-tier overrides; absence is Free | `convex/schema.ts`; `convex/accountEntitlementCore.ts` |
| `communities` | canonical community identity, owner, visibility, entry policy | `convex/schema.ts:1253-1301` |
| `communityMemberships` | canonical non-owner membership/access-source relationship | `convex/schema.ts:1303-1327` |
| `communitySubscriptions` | provider-derived paid community-access state | `convex/schema.ts:1466-1494` |
| `communityBlocks` | negative community access override | `convex/schema.ts:1391-1402` |
| `communityJoinRequests` | one current `pending` or cooldown-bearing `denied` admission state; never access authority | `convex/schema.ts`; `convex/communityJoinRequestCore.ts` |
| onboarding config/sessions | activation workflow and progress, not access authority | `convex/schema.ts:1329-1363` |
| `communities.activeMemberCount` | derived cache; owner plus active non-owner membership rows | `convex/communityCore.ts:690-776` |

## Authority path

### Authentication and actor resolution

`authIdentity` asks Convex for a verified identity. If an explicit subject disagrees, it fails with `auth_subject_mismatch`; absent verified identity fails closed unless an explicitly configured fallback is allowed. The fallback itself is limited by environment logic to development/test. `authActor` then maps the subject to the canonical `users` row through `by_authSubject` and rejects supplied-user mismatches. Email and its verification metadata may update the already-selected profile, but they cannot select or rebind an account.

The good invariant is clear: caller-supplied identity is an assertion, never authority. The focused verified-identity and public-identity guards pass.

### Session lifecycle

The Vercel routes start/callback/bootstrap/refresh/logout through a same-origin bridge protected by a server-held bridge secret. Each route creates one absolute 15-second Convex deadline spanning headers plus complete body consumption; the callback shares it across both sequential Convex calls. Auth functions have a separate 25-second Vercel platform ceiling so controlled application failure happens first. The browser cookie is `HttpOnly`, `Secure` off localhost, `SameSite=Lax`, and cannot outlive the 30-day server absolute lifetime. The raw UUID credential exists only in that cookie; Convex stores its SHA-256 hash. Provider token state is encrypted in one `authSessions` row.

Refresh never rotates the browser credential or creates a replacement row. Bootstrap and explicit refresh use the same state machine: absolute expiry/revocation is checked first; a 30-second compare-and-set lease admits one provider-refresh owner for the current `secretRevision`; the winner encrypts the new provider state and increments the revision in place. A concurrent request either uses a still-valid stored access token or receives an explicit retryable result. One 10-second provider deadline spans headers and complete body consumption for PKCE exchange and refresh; timeout releases refresh ownership and commits nothing. Provider logout keeps its distinct five-second header-only best-effort boundary because no response body is part of that outcome. Unsupported encrypted-secret versions fail closed and make the row terminally purgeable.

Logout treats the canonical Polynet session as the authority. The server revokes that session and assigns its indexed seven-day purge timestamp before attempting bounded best-effort provider logout; only a confirmed local outcome permits the Vercel route to clear the cookie and the web controller to clear caches, broadcast signed-out state, and navigate. Bridge, network, or local-revocation failures return a retryable result while preserving the cookie. A lost response after committed revocation converges on retry because missing and already-revoked sessions are idempotent success. Provider failure is evidence, not permission to resurrect the locally revoked session. One internal hourly cron owns retention and deletes at most 500 due terminal rows per transaction. There is no public maintenance endpoint or manual production prune command.

Cookie parsing is one bounded, non-throwing boundary. Missing, valid, and invalid opaque session values are distinct; invalid bootstrap/refresh/logout input clears locally and performs no bridge request. The same decoder protects signed OAuth-flow state, so malformed encoding cannot escape the callback handler or trigger code exchange. Valid signed flow and existing session semantics are unchanged. Parent-domain/duplicate-cookie policy and the outer browser-to-Vercel request deadline remain separate concerns. Vercel cancellation is not rollback: a session-create response lost after commit can leave one inaccessible row whose credential was never issued, bounded by the existing expiry and retention lifecycle.

### Community creation and ownership

Creation resolves the authenticated actor, requires setup and builder capacity, checks the requested slug, normalizes two-state visibility and entry policy, then writes the community with `ownerId` and `activeMemberCount: 1` (`convex/communityLifecycle.ts:504-599`). The owner is not duplicated as a membership row. Owner authority is derived from `community.ownerId`.

Discover queries only `published` rows and is capped at 200. Direct funnel lookup resolves by slug without filtering visibility, which is compatible with an explicitly shared Unlisted funnel. Neither path grants entry; access remains gated.

### Membership and access

Membership activation resolves the indexed `(communityId,userId)` pair as zero or one row and fails closed if storage is corrupt with duplicates. It updates an active row idempotently or reactivates/inserts with an incremented `activationSequence` in the same serializable mutation (`convex/communityMembershipLifecycle.ts`). Onboarding creation is best-effort after access is established, so onboarding cannot block entitlement.

Access resolution applies these rules in order:

1. owner derives access from `community.ownerId`;
2. a block denies non-owner access;
3. inactive/revoked membership denies access;
4. open/approval communities and durable free/manual grants use the active membership;
5. paid-subscription membership resolves the most relevant subscription status;
6. role and capability booleans are derived only after entitlement.

Published visibility never bypasses this path. Focused lifecycle, role-policy, state-audit, and gate-parity proofs pass.

### Platform entitlement

Platform tier has one owner: `accountEntitlementCore`. Absence means Free. The table can contain at most one current row from each physically required source, `admin_override` and `premium_subscription`; all readers take at most three indexed rows and fail closed to Free on extra rows, duplicate sources, unsupported sources, invalid windows, or a conflicting same-time revision. The latest active `startsAt` wins; the active window is half-open. Auth, gates, commerce, public Premium badges, community administration, member context, and operator reporting call this owner rather than interpreting storage themselves.

Writers update one row per source monotonically. An older event is stale, an exact same-revision replay is idempotent, and a same-revision payload conflict writes an inactive Free tombstone so ambiguity cannot preserve paid access. A strictly newer event restores normal state. Premium cancellation uses the same zero-length tombstone shape, so it cannot erase an independent older admin grant. Actor provisioning writes no default row.

## Confirmed invariants

- Verified identity wins over every caller-supplied identity value.
- Community owner is derived from `communities.ownerId`; persisted membership roles are only admin, moderator, and member.
- Visibility is only Published or Unlisted; Published is discoverability, not entitlement.
- Community access is reevaluated from current block, membership, access source, and subscription state.
- Membership activation is idempotent for an already-active row.
- Onboarding state is downstream from access and cannot create access.
- Each sign-in has one hashed credential row with a 30-day absolute lifetime; refresh changes only encrypted provider state and the monotonic revision.
- Exactly one non-expired lease owner may refresh a revision; stale and concurrent owners cannot commit it.
- Raw credentials, replacement pointers, and public session-maintenance authority are absent from the canonical schema.
- Client/public user IDs are projections; database IDs and supplied IDs do not grant authority.
- Malformed session and OAuth-flow cookies cannot throw or reach an authenticated bridge effect.
- Absence of a platform entitlement row means Free; only current admin and Premium subscription sources can persist rows.
- Corrupt or ambiguous entitlement state fails closed to Free through one bounded reader.

## Complexity and growth risks

Let `U` be users, `E` entitlement rows for one user, `M` membership rows for a community, `S` auth sessions, and `T/Q/R` community threads/messages/reactions.

| Path | Current order | Why it matters |
| --- | --- | --- |
| Actor provisioning | one indexed `by_authSubject` lookup plus one indexed entitlement lookup | Cost is independent of unrelated users; email never selects the actor. |
| Platform tier resolution | `O(1)` time and space, at most three indexed rows read | Two allowed source rows are the complete valid state; a third row proves corruption and fails closed. |
| Membership selection for one pair | indexed lookup | One `.unique()` read returns zero/one row and fails closed on corruption instead of sorting duplicates. |
| Active member count synchronization | `O(M)` per transition | It deterministically recomputes owner plus active non-owner rows; reliable at current scale, but the full scan is the later optimization target. |
| Terminal session retention | `O(B log S)` indexed selection plus `O(B)` deletion, `B <= 500` | Cost is bounded per hourly internal run and independent of unrelated non-due rows. |
| Community deletion | `O(1)` verified actor plus owner check, then deterministic quarantine | No destructive work runs until a resumable community-keyed lifecycle exists. |
| Discover list | bounded to at most 200 communities plus per-community plan/branding reads | Request count is bounded, but still an N+1/fan-out candidate for the later public-boundary pass. |

## Security and robustness risks

Explicit membership state is now fail-closed on staging: only `active === true` without a revocation timestamp grants membership, the schema requires the field, and the temporary repair surface is deleted after a complete zero-missing-row preflight.

1. Membership pair uniqueness is application-enforced because the schema cannot declare a compound uniqueness constraint; all known reads fail closed if that invariant is externally corrupted.
2. Join-request uniqueness is application-enforced because Convex indexes are not unique; all pair reads and transitions now fail closed on duplicate rows, while the schema restricts status to `pending | denied`.
3. Community deletion is quarantined after verified owner resolution and has no first-party action path. Completeness across all 124 current tables must be proven before a resumable replacement is enabled.
4. Entitlement uniqueness is application-enforced because Convex indexes are not unique; every reader fails closed and every writer uses the single monotonic source upsert, but out-of-band writes must remain forbidden.

## Reduction candidates

| Exact candidate | Classification | Action | Idiot index | Reason/owner |
| --- | --- | --- | ---: | --- |
| Verified actor, community owner, membership, block, and entitlement authority | `KEEP (MVP core)` | `HARDEN` | 0 | Physically required to make gated communities secure. Owner: identity/access. |
| Three platform-tier resolution implementations and append-only default/history rows | `DELETE (deferred/dead)` | `DELETE` complete | 9 | One bounded owner, absence-as-Free, and two current source rows perform the complete job. Owner: platform entitlement. |
| Full-user email compatibility scan and implicit relink | `DELETE (deferred/dead)` | `DELETE` complete | 10 | Verified subject is the account authority; mutable email must not scan for or silently seize another account. Owner: auth identity. |
| Raw session IDs, refresh-created replacement rows, traversal, and public/manual pruning | `DELETE (deferred/dead)` | `DELETE` complete | 10 | One hashed bounded credential and one internal retention owner perform the entire required job. Owner: auth session. |
| Duplicate membership-row compatibility | `DELETE (deferred/dead)` | `DELETE` complete | 7 | Staging contains zero duplicate pairs; one indexed resolver now fails closed and concurrent activation stays inside one transaction. Owner: community access. |
| Missing-`active` membership compatibility | `DELETE (deferred/dead)` | `DELETE` complete | 7 | Complete staging scans found zero dependent rows; missing state now denies access and the schema requires an explicit value. Owner: community access. |
| Deprecated onboarding field/table storage | `DELETE (deferred/dead)` | `DELETE` complete on staging | 9 | Complete staging scans and zero-work receipts preceded deletion; production remains promotion-blocked until its legacy rows are cleared. Owner: schema lifecycle. |
| Join-request free-form status | `KEEP (MVP core)` | `HARDEN` | 6 | Approval flow is required; arbitrary states are not. Owner: community access. |
| One-transaction community cascade deletion | `KEEP (MVP core)` | `HARDEN`, `BOUND` | 8 | Deletion is required; unbounded all-domain work in one transaction is not. Owner: account/community lifecycle. |

## Proof posture

The focused actor fixture proves same-subject idempotency, distinct accounts for equal verified emails, fail-closed supplied-ID mismatch, zero default-entitlement writes, and absence of relink/full-scan authority. The account-entitlement fixture proves absence-as-Free, half-open windows, bounded corruption failure, latest-revision selection, independent-source cancellation, stale-event rejection, exact replay idempotency, and same-time conflict abort. Persisted session fixtures prove one-row creation, raw-credential absence, collision failure, real concurrent refresh ownership, one provider effect, monotonic in-place commit, absolute expiry, unsupported-secret failure, revocation, multi-batch indexed retention, and timeout lease release with no state commit. Route/provider fixtures prove pre-header and body-stall deadlines, single body consumption, timer cleanup, canonical PKCE timeout, malformed-cookie recovery with zero bridge effects, valid signed-flow round-trip, missing-cookie continuity, retryable refresh/logout cookie preservation, stable-cookie success, 30-day browser/server lifetime alignment, and local-before-provider logout ordering. The live staging cutovers independently proved the legacy session index empty, every membership row explicit, zero duplicate pairs, 44/44 exact member-count caches, zero owner-membership residues, and entitlement normalization from 91 historical rows to two current-source rows with exact current/future parity before temporary migration deletion. Provider outage behavior is deterministic in tests; a live external-provider outage drill remains broader operational work, not a blocker for these slices.

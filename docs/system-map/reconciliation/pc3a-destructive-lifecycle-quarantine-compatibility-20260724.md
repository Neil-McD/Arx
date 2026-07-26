# PC3A Destructive-Lifecycle Quarantine Compatibility — 2026-07-24

- Status: `COMPLETE`; PC3 remains in progress
- Jobs: P03 account-deletion quarantine and P09 community-deletion quarantine
- Current production source and live web marker:
  `1a71a459e5f7b2099fa85861680642b4d7c71cc4`
- Staging source and live web marker:
  `9331f446b47285b1b14ddd6d04998e683f0184de`
- Merge base: `a936dee72a65f91723f332779390210e4cf783f0`
- Current divergence: 6 production-only / 119 staging-only commits
- Production data, provider state, and private content read: none
- Product code, schema, runtime, data, provider, integration, deployment, and
  production changes: none

## 1. Irreducible job

The only required outcome in this slice is to prevent the two current
destructive lifecycle mutations from destroying shared or incompletely mapped
state.

The minimum compatible mechanism is:

```text
preserve the existing public RPC identity and validator
  -> authenticate the current caller
  -> preserve the existing owner check where applicable
  -> return one deterministic quarantine error
  -> perform zero writes, schedules, storage effects, or provider effects
```

This slice does not design account deletion, community deletion, transfer,
retention, anonymization, or a generic lifecycle engine. It determines whether
the existing staging quarantines can later be rebuilt as small,
production-compatible safety releases.

## 2. Current-truth refresh

The PC0 receipt remains valid as a historical snapshot, but its production ref
is no longer current.

| Concern | PC0 observation | PC3A observation | Consequence |
| --- | --- | --- | --- |
| remote and live production web | `30248b6d...` | `1a71a459...` | PC3A uses the new ref |
| local `origin/main` | stale | `1a71a459...` | current tracking ref now matches production |
| local `main` | `e3386dea...` | `e3386dea...` | still stale and excluded |
| staging source and live web | `9331f446...` | `9331f446...` | unchanged |
| merge base | `a936dee7...` | `a936dee7...` | unchanged |
| divergence | 3 / 119 | 6 / 119 | three new production-only commits |

The three new production commits change seven CSS and frontend contract-proof
files: base styles, member-agent dock styles, index styles, CRIS theme proof,
direct-message proof, member-agent dock proof, and mobile-root navigation
proof. They add 213 lines and remove 120. They do not touch either deletion
RPC, gateway, UI action, schema, or safety test.

They therefore extend M01's current-production UI preservation constraint. They
do not change P03 or P09 compatibility. A future candidate must start from the
then-current production ref and preserve these changes; the long-lived staging
branch remains unsuitable for wholesale merge.

## 3. Public-contract compatibility

| Boundary | Current production | Staging quarantine | Compatibility |
| --- | --- | --- | --- |
| account RPC | `account:deleteOwnAccount` | same | stable for loaded/cached clients |
| account args | optional `authSubject: string` | same | validator-compatible |
| account actor check | verified actor, then destructive executor | verified actor, then quarantine | same identity boundary; effects removed |
| account quarantine error | absent | `account_delete_lifecycle_migration_blocked` | additive deterministic failure |
| community RPC | `community:deleteCommunity` via `convex/community.ts` alias | same alias and export | stable for loaded/cached clients |
| community args | optional `userId`, optional `authSubject`, required `communityId` | same | validator-compatible |
| community authority check | verified actor and community owner | same | non-owner remains rejected |
| community quarantine error | absent | `community_delete_lifecycle_migration_blocked` | additive deterministic failure |

No HTTP, MCP, webhook, or Vercel route calls either destructive RPC. The
first-party production callers are the web gateways named below. Exact RPC
identity, validator shape, authentication, and owner authority are sufficient
to keep already-loaded production web code from receiving a missing-function
or argument-validation failure when a quarantine backend leads.

The staged implementations should not be ported by merging their source files.
The compatible outcome is a minimal semantic rebuild of each mutation from the
then-current `origin/main`.

## 4. P03 — account-deletion compatibility

### 4.1 Current production path

```text
Account settings
  -> exact DELETE confirmation
  -> App.deleteOwnAccountFromSettings
  -> shared/cloudAccountGateway.deleteCloudOwnAccount
  -> account:deleteOwnAccount
  -> blocker checks
  -> destructive transaction
  -> sign out and navigate home only after mutation success
```

The production mutation deletes or modifies state across authentication,
entitlements, Stripe Connect projections, workspace credit/usage,
provider/auth connections, profile and email state, personal memory,
memberships/access/subscriptions, resources/events, apps/skills, workspace
runtime, attachments and storage, threads/messages, and the user root.

It also destroys every direct-message conversation in which the user
participates, including other participants and their shared messages, and
deletes legacy community messages authored by the user. Provider/storage
effects, shared-state destruction, audit, and root deletion are one
non-resumable mutation. This is the specific unsafe behavior P03 contains.

### 4.2 Staging path

- `account:deleteOwnAccount` remains public with the same validator.
- The handler verifies the authenticated actor and then always throws
  `account_delete_lifecycle_migration_blocked`.
- The destructive gateway and action are absent.
- Account settings retain a truthful informational state: deletion is
  temporarily paused and the screen changes no account data.
- The unused internal request/preflight substrate is not part of this release
  outcome and remains parked by P14.

`convex/accountDeletionSafety.test.ts` proves:

1. an unprovisioned identity fails without creating a user or audit event;
2. missing verified identity fails;
3. the deterministic quarantine error is returned; and
4. representative user, membership, shared DM, legacy chat, canonical
   interaction, resource, event, and audit state remains byte-for-byte
   unchanged.

The broader tests in that file exercise the parked lifecycle substrate, but
they are not required to port the P03 quarantine.

### 4.3 Loaded-client behavior

An already-loaded production client can still call the same RPC with the same
payload. It receives the quarantine error. The account settings formatter does
not recognize this new code, so it renders:

`Account could not be deleted. Please try again.`

The mutation does not resolve successfully, so the client does not sign out and
does not navigate home. This is safe but temporarily imprecise UX.

## 5. P09 — community-deletion compatibility

### 5.1 Current production path

```text
Owner danger zone
  -> community-name plus delete confirmation
  -> useCommunityDeleteController
  -> cloudCommunityAdminGateway.deleteCloudCommunity
  -> community:deleteCommunity
  -> owner check
  -> destructive transaction and root deletion
  -> scheduled cognition cleanup
  -> client route/state removal only after mutation success
```

The production mutation deletes memberships, join requests, price points,
subscriptions, purchase claims, checkout sessions, resources, member settings,
agent configuration, legacy chat messages/reactions/threads, and the community
root. It tombstones legacy member-agent channels and schedules cognition
cleanup after root deletion.

The executor performs an unindexed full checkout-session collection, is not
resumable, mixes root deletion with deferred cleanup, and does not cover many
canonical community domains now present in source. This is the specific unsafe
behavior P09 contains.

### 5.2 Staging path

- `community:deleteCommunity` remains public through the same alias with the
  same validator.
- The handler resolves the verified actor and requires current community
  ownership before throwing `community_delete_lifecycle_migration_blocked`.
- The delete controller, modal, gateway function, and destructive button are
  absent.
- The owner-only Danger pane retains truthful informational copy: deletion is
  temporarily paused and the screen changes no community data.

`convex/communityDeletionSafety.test.ts` proves:

1. missing verified identity fails without a schedule;
2. non-owners fail before the quarantine boundary;
3. repeated owner calls return the same quarantine error; and
4. representative membership, request, price, checkout, legacy interaction,
   canonical interaction/reaction, resource, event, evidence, runtime,
   app/mount, skill/attachment, root, and scheduled-function state remains
   byte-for-byte unchanged.

### 5.3 Loaded-client behavior

An already-loaded production client can still call the same RPC and passes the
same owner/validator boundary. It receives the quarantine error. The current
controller renders the raw provider error or its existing fallback and leaves
the modal open.

Because local community removal, route reset, and list reload occur only after
mutation success, the client does not remove the community from local state.
This is safe but may expose a technical quarantine string until the neutral
staging UX is released.

## 6. Compatibility directions

| Direction | Account | Community | Verdict |
| --- | --- | --- | --- |
| quarantine backend + current web | stable RPC/args; deterministic error; no sign-out | stable RPC/args; deterministic error; no local removal | compatible and safe |
| staging web + current destructive backend | no first-party account action | no first-party community action | reduces reachability but cached clients remain unsafe |
| quarantine backend + current production data | performs no data read beyond identity/owner and no writes | performs identity/owner read and no writes | no PC4 data query required for containment |
| old destructive backend after quarantine | re-enables unsafe shared-state destruction | re-enables incomplete destructive cascade | forbidden rollback |

The critical ordering fact is that UI removal alone is not containment. An old
tab, stale bundle, or direct Convex client can still reach the public RPC while
the destructive backend exists. The backend quarantine must lead.

## 7. Rollback and failure model

The quarantine becomes a safety floor once deployed.

- Rolling the web UI backward while the backend remains quarantined is safe:
  old actions fail without effects.
- Rolling the backend backward to either destructive executor is unsafe and
  must not be an approved rollback.
- A quarantine regression must roll forward to the last known zero-effect
  implementation.
- A failed or unverified backend deployment blocks any claim that UI removal
  completed containment.
- Neither quarantine writes a new schema or data shape, so it creates no data
  rollback dependency.
- The future safe deletion executors remain separate projects and require PC4,
  retention/ownership decisions, resumable effects, and root-last
  finalization.

## 8. Reduced release decomposition

P03 and P09 are separate semantic and rollback units even if an operational
Convex deployment later contains both source changes.

### P03-Q — account safety floor

1. Rebuild only `account:deleteOwnAccount` from current `origin/main`.
2. Preserve the public name, validator, and verified-actor boundary.
3. Replace all destructive effects with the deterministic quarantine error.
4. Port only the narrow zero-effect safety cases; do not port P14 lifecycle
   machinery.
5. Deploy Convex intentionally before the web contraction.
6. Prove an old client receives the error, state is unchanged, and no sign-out
   occurs.
7. Then replace the destructive account control with neutral paused copy.

### P09-Q — community safety floor

1. Rebuild only `community:deleteCommunity` from current `origin/main`.
2. Preserve the public name, validator, verified-actor boundary, and owner
   check.
3. Replace all destructive and scheduled effects with the deterministic
   quarantine error.
4. Port only the narrow zero-effect safety cases.
5. Deploy Convex intentionally before the web contraction.
6. Prove an old client receives the error, all representative state is
   unchanged, and no scheduled function is created.
7. Then replace the destructive community control with neutral paused copy and
   remove its first-party gateway/controller/modal surface.

Neither unit includes a table, migration, data query, lifecycle engine,
provider operation, direct Vercel deployment, or restoration of deletion.
Integration and release remain unauthorized until PC6 and explicit human
approval.

## 9. PC3A verdict

| Job | PC2 classification | PC3A result | Reason |
| --- | --- | --- | --- |
| P03 | `PORT BACKEND-FIRST` | confirmed, semantic rebuild required | exact public contract survives; zero-effect backend safely contains cached clients |
| P09 | `PORT BACKEND-FIRST` | confirmed, semantic rebuild required | exact public contract and owner check survive; zero-effect backend safely contains cached clients |

The quarantine outcomes are compatible. The long-lived staging implementation
is not itself a release candidate. The correct future action is two small
backend-first rebuilds from current production truth, with no destructive
rollback.

## 10. Limitations and next slice

PC3A did not:

- query production or staging data;
- inspect private content;
- call either deployed mutation;
- test production Convex;
- run a production or staging deployment;
- change product code, schema, generated API, tests, data, or provider state;
- authorize P03-Q or P09-Q integration.

`PC3B` is the next bounded read-only slice: map P27 revoked-evidence
containment across production and staging source, public/internal function
contracts, cached readers, protected intelligence boundaries, and rollback.
P27 is next because it is the remaining backend-first security outcome and
requires no migration for fail-closed containment. It must not port the
physical-purge executor or begin PC4.

Subsequent checkpoint: PC3B is complete in
`pc3b-revoked-evidence-read-compatibility-20260724.md`. P27 remains a required
backend-first outcome, but its staging implementation requires a narrow
semantic rebuild because of unrelated result-cap contractions, unbounded
request-wide lineage amplification, and stale proof drift. PC3C, the read-only
P05 auth/session compatibility map, is next.

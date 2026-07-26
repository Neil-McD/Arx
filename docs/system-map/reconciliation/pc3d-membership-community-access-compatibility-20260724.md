# PC3D Membership and Community-Access Compatibility Receipt

Date: 2026-07-24

Mode: read-only source, API, schema, cached-client, security, complexity,
migration, and rollback reconciliation

Requirement: P06 membership and community-access authority

Production source/live build:
`456ebb9cfb95defc316c046e57d17a001eea5025`

Staging source/live build:
`9331f446b47285b1b14ddd6d04998e683f0184de`

Merge base: `a936dee72a65f91723f332779390210e4cf783f0`

Worktree:
`/Users/neilmcdevitt/code/arx/.worktrees/semantic-platform-staging-20260719`

This receipt changes no product code, schema, data, query, provider,
configuration, integration, deployment, membership, access, or production
state. Production data was not queried.

## 1. Verdict

P06 remains irreducible MVP and security core. The staged four-part authority
outcome is correct:

1. only explicit active state grants non-owner membership;
2. one `(communityId, userId)` pair owns the relationship;
3. community ownership comes only from `communities.ownerId`;
4. member count means owner plus active, unrevoked, non-owner memberships.

The staging implementation is **not a production port candidate as-is**.

| Concern | Result |
| --- | --- |
| requirement | `KEEP (MVP core)` |
| source basis | favorable; production-only evolution since PC3C is unrelated DM composer CSS/proof work |
| healthy public/cached-client shapes | compatible if names, validators, response shapes, and backend-first ordering remain |
| schema/data | breaking final state; use `EXPAND-MIGRATE-OBSERVE-CONTRACT` |
| staged implementation | `REWORK`; semantic rebuild, not merge/cherry-pick |
| production data | PC4 gate required |
| rollback | old reads remain compatible, but rollback to an owner/duplicate-producing writer is forbidden after cleanup |

The staged core is security-directionally strong, but the holistic P06 surface
does not yet meet the 8/10 definition. It still performs full-community work
on routine transitions and reads, maintains a count cache that normal readers
mostly ignore, keeps a duplicate legacy admin API family, and has a stale
operator proof that requires a migration mutation already deleted from staging.

## 2. Current ref truth

During PC3D, production and local `origin/main` advanced from the prior PC3C
marker to `456ebb9c`. The two added commits restore and unify the DM composer.
They change only `apps/web/src/base.css` and three composer/DM proof scripts.
They do not touch P06 source, schema, API, or migration behavior.

Current layers:

| Layer | Truth |
| --- | --- |
| live production | `456ebb9c` |
| local `origin/main` | `456ebb9c` |
| local `main` | stale at `e3386dea` |
| live/remote staging | `9331f446` |
| root checkout | dirty user work at `82d2cea`; untouched |
| divergence | 8 production-only / 119 staging-only commits |

The long-lived staging branch remains evidence, not an integration candidate.

## 3. Irreducible authority model

P06 needs only six state roles:

1. `communities.ownerId` is the sole owner relationship.
2. `communityMemberships` stores one non-owner community/user relationship.
3. `active === true` with no `revokedAt` is the only active membership state.
4. `communityBlocks` is a negative override for non-owners.
5. paid subscription state may constrain an active paid membership, but P10
   owns provider convergence.
6. `communities.activeMemberCount` is a derived projection, never access
   authority.

The causal path is:

```text
verified user
  + community.ownerId
  + zero/one membership pair
  + current block
  + paid entitlement when applicable
  -> one request-time access bundle
  -> capabilities, UI, runtime, and MCP projections
```

Visibility never grants access. Join requests never grant access. Counts,
directory rows, onboarding state, cached browser state, and UI roles are
projections only.

## 4. Isolated staged change

P06 begins at parent `e9e4c501da1da0ed332240b9c01e474e6ad28007`
and ends at `d65e26c7c505aa6e75f10244228741646d9b70e6`.

Its five commits are:

- `82406348`: require explicit active memberships;
- `853de8f6`: enforce unique community/user membership pairs;
- `15d9086f`: require canonical active-member counts;
- `43b23123`: prevent and audit owner-membership residues;
- `d65e26c7`: delete the two safe staging residues and temporary migration.

Across 19 focused runtime/schema files, that range is 192 additions and 212
deletions, a net reduction of 20 lines. The focused
`communityMembershipAuthority.test.ts` adds 513 lines. The temporary
owner-residue migration was added and removed inside the sequence. The
active-count repair helper was also temporary deployment machinery and is not
durably available as a production migration.

The P06 baseline differs from current production in only three inspected
files: unrelated Builder Partner fee fields in community commerce/schema and
one auth-subject import. The membership/access logic itself is a useful
production-relative experiment. Future work must nevertheless rebuild against
then-current `origin/main`, especially after P05 lands.

## 5. Production and staged state

### Current production

- `communityMemberships.active` is optional.
- Missing `active` is treated as active unless revoked.
- Duplicate pair rows are silently ranked by active state, then update/create
  time.
- `communities.activeMemberCount` is optional.
- Owner access already derives from `ownerId`, but normal join, approval, and
  paid paths can still manufacture owner membership rows.
- `backfillCommunityMembershipActiveFlags` remains a public
  operator-authenticated mutation and starts with a full table collection.
- Routine count repair scans every membership in the community.

### Staged end-state

- `active` and `activeMemberCount` are schema-required.
- Missing/false/revoked membership state denies access.
- pair reads use one indexed fail-closed resolver;
- activation keeps the pair read and insert/update in one serializable Convex
  mutation;
- owner activation is rejected and owner join/approval/payment paths create no
  membership, onboarding, email, app-grant, or subscription side effects;
- staging's two unreferenced owner-membership residues were deleted;
- staging's 44 community counts were repaired and exact;
- the temporary migration functions are absent.

Staging evidence does not represent production. The production rows, duplicate
dependencies, owner residues, and count drift are unknown.

## 6. Public API and cached-client compatibility

For healthy canonical data, P06 preserves existing names, arguments, and
response shapes across:

- `community:listCommunityMemberships`;
- `community:getMyCommunityAccess`;
- `community:getMyCommunityAccessBySlug`;
- `community:resolvePublicCommunityAccessBySlug`;
- public join and admin membership actions;
- community directory, runtime capability-context, and official MCP access
  resolution;
- existing relation, role, capability, member-count, and join outcome fields.

Cached clients never submit raw `active` or `activeMemberCount`; server writers
own both. Making them required is therefore a stored-data/schema migration, not
a browser request-schema change.

Behavior intentionally contracts on corrupt data:

- a missing active flag no longer grants access;
- duplicate pairs error rather than selecting a winner;
- owner join returns the same joined outcome but creates no duplicate state.

The backend must lead because it owns authorization and prevention. UI-first
changes cannot enforce pair, active-state, or owner invariants.

One public contract is explicitly removed by staging:
`operatorDashboard:backfillCommunityMembershipActiveFlags`. No first-party
runtime caller was found, but the operator proof still names it and unknown
external/operator callers remain a compatibility gate.

## 7. Duplicate and stale first-party surfaces

The actual member directory uses:

- `community:listCommunityDirectoryPage`;
- `shared/cloudCommunityDirectoryGateway.ts`;
- `shared/useCommunityDirectoryController.ts`.

A separate older admin-roster/count family remains:

- `listCommunityMembershipsAdmin`;
- `listCommunityMembershipsAdminPage`;
- `countCommunityMemberships`;
- `syncCommunityMembershipCount`;
- `listCommunityMembershipCreatedAtRows`;
- their unused membership-gateway adapters.

The old paginated admin roster and created-at gateway have no first-party
consumer. `syncCommunityMembershipCount` has one consumer: after a successful
member action, the web controller launches a background full-community count
repair even though the same backend transaction already reconciled the count.

This is duplicate repair, not required reliability. The future candidate should
delete the browser-triggered repair loop and, after external-client proof,
delete the unused legacy roster/count endpoints and adapters.

## 8. Complexity and scalability

Let `M` be membership rows in one community and `P` be presence rows.

| Path | Current staged order | Finding |
| --- | --- | --- |
| pair access | indexed zero/one lookup | correct and scalable |
| activation/revocation/leave/payment transition | `O(M)` full count recomputation | unnecessary write amplification |
| background UI reconciliation | another `O(M)` mutation | duplicate of backend work |
| member directory page | `O(M + P + M log M)` before returning at most 100 rows | offset pagination is cosmetic, not bounded work |
| public funnel stats | `O(M)` plus presence/profile work | every public read scales with full community size |
| mention search | `O(M)` membership scan plus sequential user reads | unbounded substring search |
| count query | `O(M)` despite a stored exact count | cache is maintained but not used as the read authority |

The current directory cursor is an array offset after sorting by mutable
presence. Presence changes between pages can reorder rows and cause skips or
duplicates.

The minimal scalable target is:

1. keep the existing count field because member count is a real MVP projection;
2. after production convergence, compute a transaction-local `-1/0/+1` delta
   from the before/after membership state and update the count in `O(1)`;
3. use the exact cache for normal count reads;
4. retain one bounded internal reconciliation probe for release evidence, then
   delete it;
5. add an active/community/created-at index and use stable indexed membership
   pagination with owner synthesized separately;
6. query presence only for the returned page;
7. replace unbounded mention substring scanning with bounded exact-handle plus
   membership validation, or explicitly retain fuzzy search only after a
   separately justified indexed design.

All known non-test membership writes currently go through the activation kernel
or call the count-transition helper in the same Convex transaction. That makes
the O(1) count delta feasible without a queue, scheduler, event engine, or
generic repair framework.

## 9. Security and robustness findings

### Pair resolution

The staged helper uses `.unique()` and translates duplicate corruption by
matching Convex's internal English error text. It still fails closed if wording
changes, but its public error becomes nondeterministic. Use an indexed
`.take(2)` and explicitly throw `community_membership_pair_not_unique`.

### Cross-field state

Schema validators cannot enforce `active`, `revokedAt`, and `revokedReason`
coherence. PC4 must measure contradictory combinations. Every writer must
preserve the invariant:

```text
active -> no revokedAt
inactive -> explicit reason/timestamp when access was revoked
```

### Owner residue

Owner membership deletion is safe only when no onboarding session or community
subscription references the row. Staging's two rows had zero references.
Production must prove its own dependency shape. Financial evidence must not be
deleted merely to simplify ownership.

### Negative block state

`communityBlocks` can hold multiple active rows for one pair. Reads safely deny
if any exists, but unban lifts only the latest row. A duplicate can therefore
leave a user banned after apparent success. PC4 must measure active duplicate
blocks. The future access kernel should either converge to one current row or
lift a bounded complete active set; it should not silently report success while
another active block remains.

### Proof drift

`communityMembershipAuthority.test.ts` correctly requires the temporary active
backfill to be absent. `scripts/operator_dashboard_gate_proof.ts` still
requires it to exist. The operator proof fails and is not part of the green
foundation baseline. The future P06 candidate must repair the proof alongside
the runtime contraction.

## 10. Safe migration trajectory

The minimal production sequence is:

1. **Expand/prevent.** Keep `active` and `activeMemberCount` optional. Deploy
   owner-rejection and one indexed bounded pair helper while preserving current
   public shapes.
2. **Measure.** Run PC4's bounded aggregate and dependency audit.
3. **Normalize active state.** Preserve current effective behavior by setting
   missing `active` true only when no revocation evidence exists; otherwise set
   false.
4. **Reconcile duplicate pairs.** Preserve the exact currently selected
   relationship only when onboarding/subscription dependencies can be
   transferred or safely retained. Fail the release gate on ambiguous paid or
   historical dependencies.
5. **Repair counts.** Recompute owner plus active non-owner rows while the field
   remains optional; require an exact zero-work rerun.
6. **Remove owner residues.** Prevention must already be live. Delete only
   dependency-free rows; separately design any row carrying financial evidence.
7. **Observe.** Require zero missing flags, duplicate pairs, owner residues,
   contradictory states, and count mismatches.
8. **Contract authority.** Make fields required, use explicit-active and
   bounded duplicate failure, and delete temporary migration functions.
9. **Reduce/scale.** Move count maintenance to transactional delta, consume the
   cache, add stable directory indexing, remove redundant repair/admin APIs,
   and repair the stale proof.

No new membership table, event log, queue, scheduler, permanent migration
surface, or generic access workflow is required.

## 11. PC4 production evidence gates

Return bounded counts and distributions only. Return no names, emails, handles,
membership IDs, subscription IDs, or other user identifiers.

Required evidence:

- total memberships and community-size distribution, including maximum and
  high percentiles;
- missing/true/false active-state counts;
- revoked timestamp/reason combinations by active state;
- duplicate community/user pairs and multiple-active pairs;
- orphaned community or user references;
- owner-membership residues;
- onboarding and subscription references to duplicate or owner rows;
- paid-membership rows without one coherent subscription relationship;
- missing, invalid, over-, and under-counted community caches;
- active duplicate community-block pairs;
- presence cardinality distribution for directory cost;
- deployed/external callers of the public migration and legacy admin/count
  functions, if discoverable.

Staging previously observed 69 explicit memberships, zero duplicate pairs, 44
exact community counts after repair, and two dependency-free owner residues
that were deleted. Those are staging-only receipts.

## 12. Rollback boundary

Active-flag and member-count normalization is backward-readable: old code
tolerates explicit values. Making optional fields required can also be relaxed
without losing data.

Rollback becomes unsafe at the writer boundary:

- old activation/join/payment code can recreate owner membership rows;
- old duplicate-selection code can hide new pair corruption;
- old missing-active semantics can grant access to malformed future rows.

After prevention deploys and production cleanup starts, never roll back to a
writer that can recreate the removed authority. Roll forward to the last
known fail-closed backend.

The later O(1) count implementation may safely roll back to full
recomputation, provided the schema and data remain canonical. Removing public
legacy endpoints is reversible only during its explicit cached/external-client
compatibility window.

## 13. Focused proof

Current staging passed:

- `test:community-membership-authority`: 7 files, 66 tests;
- `check:community-admin-contract-guard`;
- `check:gate-parity`.

The focused suite covers explicit active state, required schema, exact counts,
duplicate-pair failure, owner rejection, owner join/approval, idempotent
reactivation, overlapping activation, funnel admission, and relevant cached
client decisions.

One directly relevant proof fails:

- `check:operator-dashboard-gate-proof` expects the deleted
  `backfillCommunityMembershipActiveFlags` mutation.

Proof still missing:

- production shape and dependency evidence;
- migration fixtures containing duplicate paid/onboarding relationships;
- block-duplicate/unban recovery;
- stable indexed directory pagination under concurrent presence changes;
- bounded large-community complexity proof;
- external consumer inventory for public legacy endpoints.

## 14. Elon reduction ledger

| Surface | Idiot index | Decision |
| --- | ---: | --- |
| ownerId, one non-owner pair, explicit active state, request-time access | 0 | keep |
| current block and paid entitlement checks | 1 | keep at their owned boundaries |
| silent duplicate-row ranking | 10 | delete after migration |
| missing-active-means-active compatibility | 10 | delete after migration |
| owner membership rows | 10 | delete when dependency-safe |
| public full-table active-flag repair mutation | 10 | delete after bounded migration |
| browser-triggered full count repair after successful backend mutation | 10 | delete |
| unused legacy admin roster/count/created-at API family | 9 | delete after external-client proof |
| full-community recomputation on every count transition | 9 | replace with transaction delta |
| maintained count cache ignored by normal reads | 9 | make it the projection read owner |
| presence-sorted full-community directory pretending to paginate | 9 | replace with stable indexed pagination |
| unbounded fuzzy mention scan | 8 | reduce to bounded indexed lookup unless justified |
| permanent migration or generic membership workflow engine | 10 | do not add |

## 15. Minimal future release units

If PC4-PC6 retain P06, split it into:

1. backend-first prevention plus optional-schema bounded audit/migrations;
2. active, duplicate, count, and owner data convergence with zero-work
   receipts;
3. fail-closed pair/state authority and required schema;
4. transactional `O(1)` count projection plus redundant repair/API deletion;
5. indexed directory/public-stat/mention reads, preserving only PC5-ratified
   user-facing fields;
6. compatibility-window contraction and proof repair.

Each unit must be rebuilt from then-current `origin/main`. None authorizes a
production query, mutation, integration, deployment, or long-lived staging
merge.

## 16. Next slice

PC3D is complete as a read-only compatibility map. It does not authorize P06
implementation or PC4 production evidence.

The next bounded slice is `PC3E`: map P07 account-tier and entitlement
source/API/schema/cached-client/corruption/rollback compatibility.

Dependency order remains:

```text
auth -> membership -> entitlement -> admission -> money
```

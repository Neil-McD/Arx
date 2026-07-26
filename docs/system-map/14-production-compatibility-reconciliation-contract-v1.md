# Production Compatibility Reconciliation Contract v1

- Status: active planning and audit map; no integration or production change is
  authorized
- Created: 2026-07-24
- Scope: reconcile the accumulated semantic-platform staging work with current
  `origin/main`, the live production product, production Convex contracts, and
  bounded production data truth before deciding what should move toward release
- Next authorized activity: documentation and explicitly approved read-only
  evidence gathering only

## 1. Decision

Pause further C2 implementation until the accumulated staging program has been
reconciled with current production truth.

The staging branch is evidence that a set of ideas and implementations can work
together in its own environment. It is not automatically a production release
candidate. The long-lived branch must not be merged wholesale into `main`.

The reconciliation must answer four questions:

1. Which staging outcomes are still required by the current MVP?
2. Which implementations are compatible with the current production source,
   public contracts, deployment topology, and stored data?
3. Which implementations must be dropped, redesigned, or split into
   expand/migrate/observe/contract phases?
4. What is the smallest dependency-ordered sequence that can reach production
   without making rollback unsafe?

The output is a release-decomposition map, not a mandate to release.

## 2. Relationship to Existing Authority

This contract extends, but does not replace:

1. `AGENTS.md`, which owns current MVP scope, protected core, architecture
   invariants, and release rules.
2. `docs/comprehensive-system-mapping-contract-v1.md`, which owns the mapping
   method, evidence classes, and deletion standard.
3. `docs/polynet-reduction-execution-contract-v1.md`, which owns the cleanup
   milestone ledger and current staging receipts.
4. `docs/alpha-release-workflow.md`, which owns the production release path.
5. `docs/system-map/`, which owns the evidence ledger, findings, unknowns, and
   dependency-ordered roadmap.

Source, schema, current public contracts, live deployment markers, and bounded
runtime evidence outrank statements in this document when they disagree.

## 3. Current Observed Snapshot

This snapshot is orientation evidence from 2026-07-24. It must be refreshed
before any compatibility conclusion or integration work.

| Layer | Observed value | Interpretation |
| --- | --- | --- |
| remote `origin/main` | `456ebb9cfb95defc316c046e57d17a001eea5025` | current remote production Git authority |
| live `www.polynet.ai/version.json` | `456ebb9cfb95defc316c046e57d17a001eea5025` | production web matched remote `main` |
| remote semantic staging branch | `9331f446b47285b1b14ddd6d04998e683f0184de` | remote staging source matched the live staging marker; the local staging worktree now contains only audit documentation changes |
| live staging marker | `9331f446b47285b1b14ddd6d04998e683f0184de` | canonical staging web matched staging Git |
| local `main` | `e3386dea6e2b5329f52c2a79a0a48ebb50bc5934` | stale; not an integration base |
| local `origin/main` tracking ref | `456ebb9cfb95defc316c046e57d17a001eea5025` | matched remote/live production at PC3D |
| root checkout | `codex/mobile-interaction-correctness-20260713` at `82d2ceaa...`, 95 status entries | active dirty user work; preserve untouched |
| staging Convex | `dev:quick-porcupine-949` | non-production runtime evidence |
| production Convex | `wry-hawk-715` | production runtime and data authority |

PC3D refreshed the PC3A snapshot after production advanced by two additional
DM-composer commits. Current production and staging still share merge base
`a936dee72a65f91723f332779390210e4cf783f0` and diverge by 8
production-only / 119 staging-only commits. The two additions touch only
`apps/web/src/base.css` and three composer/DM proof scripts; they do not touch
P06 membership/access source, schema, API, or migration behavior. Historical
PC0 and PC3A receipts remain unchanged. The dirty root checkout and local
`main` remain excluded from integration work.

## 4. Irreducible Truth Model

Compatibility is not “the code compiles” and not “staging works.” It is the
intersection of seven truths:

```text
current product requirement
  x current origin/main source
  x current public and internal contracts
  x current production data shape
  x current external-provider state
  x safe deployment and rollback order
  x demonstrated user-journey behavior
```

Every proposed release unit must satisfy all seven or remain blocked.

### 4.1 Truth layers

| Truth layer | Question | Evidence |
| --- | --- | --- |
| requirement | Is this job still physically or contractually needed? | current user direction, `AGENTS.md`, active product contracts |
| Git | What code is actually on staging, local `main`, remote `main`, and production? | remote refs, merge base, commit ledger, build markers |
| contract | Can current and stale clients call the new backend safely? | validators, generated API, HTTP/MCP schemas, adapters |
| data | Can all live rows satisfy the proposed schema and semantics? | bounded redacted production aggregates and zero-state proofs |
| provider | Does external canonical state agree with local projections? | bounded Stripe, WorkOS, Vercel, Convex, and worker evidence |
| behavioral | Do retained MVP journeys still work? | focused tests and authenticated/anonymous acceptance |
| operational | Can the change be deployed, observed, and rolled back deterministically? | release order, receipts, markers, rollback plan |

### 4.2 Four compatibility directions

Each release unit must evaluate:

1. **new backend + current production web;**
2. **new web + current production backend;**
3. **new schema/code + current production data;**
4. **rollback code + any data written or migrated by the new release.**

A release is not backward-compatible merely because direction 1 passes.

## 5. Safety Boundary

### 5.1 Permitted during the reconciliation audit

- read Git refs, history, diffs, worktree state, schemas, generated APIs, source,
  tests, contracts, and configuration names;
- fetch current remote refs only inside an explicitly approved isolated audit
  lane;
- read public build markers and deployment metadata;
- inspect function specifications, schemas, indexes, and bounded runtime health;
- run bounded, redacted, read-only production aggregates with explicit row caps
  and truncation markers;
- run local static checks, tests, typechecks, and builds;
- create and update compatibility documents, matrices, and evidence receipts.

### 5.2 Prohibited without a later explicit authorization

- no merge, rebase, reset, force-push, cherry-pick, ref movement, or cleanup of
  historical worktrees;
- no change to local `main` or the dirty root checkout;
- no production or staging data mutation, migration, cleanup, backfill, webhook,
  checkout, payout, email, provider action, or job trigger;
- no schema, runtime, UI, environment, deployment, domain, or project-setting
  change;
- no direct Vercel deployment, promotion, alias, or rollback;
- no production Convex deployment;
- no treating a successful staging proof as production acceptance.

Finding an incompatibility creates a blocker or a smaller release design. It
does not authorize a fix.

## 6. Requirement Reduction Before Compatibility Work

Every staging outcome is challenged before engineering effort is spent making it
compatible.

| Score | Meaning |
| ---: | --- |
| 0-2 | irreducible MVP, security, legal, or protected-core requirement |
| 3-5 | useful, but the implementation or timing may be over-specified |
| 6-8 | legacy-shaped, duplicative, or cheaper to delete/rebuild |
| 9-10 | no current first-party need or competing authority |

For every staged concern, record:

- the exact requirement and owner;
- the user or platform failure if it is absent;
- current first-party consumers;
- whether production already solves it differently;
- the simplest delete/reuse/consolidate alternative;
- idiot-index score and rationale;
- `KEEP`, `DROP`, `REWORK`, or `DECISION REQUIRED`.

Do not make obsolete staging work production-compatible.

## 7. Compatibility Classification

Each coherent staging slice receives one primary result:

| Classification | Meaning |
| --- | --- |
| `PORT AS-IS` | required, source/data compatible, independently provable |
| `PORT BACKEND-FIRST` | required and compatible only when the backend leads |
| `EXPAND-MIGRATE-CONTRACT` | required but live data or old clients block direct cutover |
| `REWORK` | requirement remains, implementation conflicts with current production |
| `DROP` | superseded, duplicate, deferred, or unnecessary |
| `ALREADY PRESENT` | current `main` independently implemented the outcome |
| `DECISION REQUIRED` | product, legal, retention, or operational authority is missing |
| `BLOCKED` | evidence is missing, truncated, contradictory, or unsafe to gather |

File overlap is not the unit of compatibility. The unit is one semantic job with
one authority, data owner, effect boundary, and proof.

## 8. Strategic Execution Phases

Exactly one phase or bounded sub-slice may be `IN_PROGRESS`.

| ID | Phase | Status | Exit boundary |
| --- | --- | --- | --- |
| PC0 | establish current ref/deployment truth | `COMPLETE` | clean isolated audit base, exact remote refs, live markers, merge base, and protected dirty-worktree receipt |
| PC1 | build semantic staging-change ledger | `COMPLETE` | every staging-only commit and meaningful main-only change assigned to a domain and job |
| PC2 | reconcile requirements and delete candidates | `COMPLETE` | every staged job has owner, MVP need, idiot index, and keep/drop/rework decision |
| PC3 | prove source/API/schema compatibility | `IN_PROGRESS` | public contract, schema, client-version, and rollback deltas are explicit |
| PC4 | prove bounded production-data compatibility | `PENDING` | every data-sensitive delta has complete, redacted, non-truncated evidence |
| PC5 | reconcile product journeys and operations | `PENDING` | current production UX and required staging outcome agree or conflict explicitly |
| PC6 | design dependency-ordered release units | `PENDING` | each retained outcome has an isolated expand/migrate/observe/contract path |
| PC7 | build clean integration candidates | `NOT AUTHORIZED` | separately approved candidates start from current remote `main`, not the long-lived staging branch |
| PC8 | staging and production acceptance | `NOT AUTHORIZED` | exact-build proof, rollback, and human release approval per release unit |

### PC0 — Current truth and safe audit lane

1. Re-read remote `main` without assuming the local tracking ref is current.
2. Re-read production and staging build markers.
3. Record production and staging Convex selectors and function/schema surfaces.
4. Preserve the dirty root checkout and local `main` byte-for-byte.
5. Create a fresh audit worktree from the fetched remote production commit only
   after explicit authorization.
6. Compute the real merge base, two-sided commit counts, and file/schema/API
   deltas between current production and staging.
7. Record evidence limitations and stop on remote movement during the snapshot.

Exit proof: another agent can reproduce the same truth snapshot without relying
on chat history or stale local refs.

### PC1 — Semantic change ledger

Do not review 100+ commits as an undifferentiated file diff. Group them by
irreducible job:

- identity and session lifecycle;
- community ownership, membership, gating, and join;
- billing, entitlements, subscriptions, Connect, payouts, and Builder Partner;
- canonical resources and content authority;
- canonical interactions, messaging, voice, attachments, and notifications;
- evidence, compiler, intelligence, retrieval, digest, and community-agent
  filesystem;
- account, authored-content, and community lifecycle;
- MCP, tools, apps, capabilities, runtime, and protected harnesses;
- scheduler, cleanup, recovery, observability, CI, and dependencies;
- frontend routes, state, components, styles, and deferred surfaces;
- docs, migrations, fixtures, and compatibility adapters.

For each job, distinguish:

- staging-only implementation;
- production-only implementation;
- equivalent outcome implemented differently;
- true conflict;
- stale historical receipt;
- independent change that can be released alone.

### PC2 — Requirement and deletion reconciliation

Apply the Elon algorithm before compatibility engineering:

1. question the requirement;
2. delete or drop unnecessary staging work;
3. delete duplicate production/staging approaches conceptually;
4. retain one authority and one target outcome;
5. optimize or automate only after the release shape is reduced.

Protected core remains protected. High idiot-index work is a decision candidate,
not automatic deletion authority.

### PC3 — Source, API, and schema compatibility

Generate compatibility inventories from the actual diff:

- Convex tables, fields, validators, optionality, unions, indexes, and schedules;
- public/internal Convex functions and generated API names;
- HTTP, MCP, webhook, Vercel API, and cached-client contracts;
- environment variable names and deployment selectors;
- web gateways, payload assumptions, local cache/state migrations, and old-client
  behavior;
- package/lock/runtime-version changes;
- data writers that would make rollback code unable to read new state.

For every removed field/table/function, require:

1. no retained first-party writer;
2. no current or cached-client reader;
3. complete production-data evidence;
4. replacement authority already deployed and observed;
5. rollback after contraction remains safe or is explicitly impossible.

### PC4 — Production-data compatibility

Data checks are derived from the schema and semantic delta, not from memory.

For each affected table or external state:

1. use an index or an explicit bounded cap;
2. return counts, state distributions, age ranges, orphan counts, and truncation
   only;
3. do not return private content or direct personal identifiers;
4. distinguish zero rows from zero incompatible rows;
5. stop if the result is truncated, ambiguous, or uses an unbounded scan;
6. record query/source, deployment, timestamp, cap, and result;
7. do not mutate to resolve a failed check.

Interpretation:

| Result | Consequence |
| --- | --- |
| complete zero incompatible state | contraction may be eligible after client proof |
| complete non-zero migratable state | design a bounded idempotent migration first |
| complete non-zero retained state | retain compatibility or redesign |
| truncated or inaccessible | blocked; no compatibility claim |
| source/runtime disagreement | drift finding; stop |

Provider truth must be checked separately where Stripe, WorkOS, Vercel, worker,
storage, or other external state is canonical.

### PC5 — Product and operational compatibility

For each retained MVP journey, compare current production with the proposed
outcome:

- user-visible routes, labels, actions, loading, errors, and recovery;
- authenticated identity and old-session continuity;
- access, membership, billing, and provider timing;
- community interaction, resource, voice, agent, and MCP behavior;
- scheduled and asynchronous work;
- diagnostics, alerts, support, and rollback.

An implementation that preserves data but breaks a current core journey is not
compatible. An implementation that improves internals but has no required user
or trust outcome should usually wait.

### PC6 — Release decomposition

Retained changes are rebuilt as the smallest causal release units from current
remote `main`.

Prefer:

```text
EXPAND
  add backward-compatible schema/functions/readers
MIGRATE
  move bounded state through idempotent, receipted operations
OBSERVE
  prove zero legacy writes/reads and journey continuity
CONTRACT
  remove old fields, functions, adapters, and code
```

Rules:

- one semantic concern per release unit;
- no release unit depends on unrelated staging history;
- backend/schema leads when current clients require it;
- contraction never shares a release with its first migration;
- every unit has exact tests, production-data gate, staging acceptance, rollback,
  and stop conditions;
- no direct local Vercel production deployment;
- production release remains a separate human-authorized action.

### PC7-PC8 — Later implementation and release

These phases are intentionally unauthorized by this planning slice.

Do not use the dirty root checkout, stale local `main`, or a merge commit from the
long-lived staging branch as the release candidate. Build approved candidates in
fresh worktrees from the exact current remote production commit.

The canonical staging-lane topology for clean production candidates must be
decided explicitly after PC0-PC6. Do not silently retarget `polynet-staging`,
rewrite its branch, or substitute a preview URL for the accepted stable staging
origin.

## 9. Required Working Artifacts

This document is the durable progress owner. Supporting evidence may be added
under a commit-addressed reconciliation directory after PC0.

### 9.1 Slice compatibility ledger

| Field | Required content |
| --- | --- |
| ID | stable compatibility-slice identifier |
| semantic job | one user/platform job, not a file list |
| requirement owner | user direction, MVP contract, security/legal, or protected core |
| staging evidence | commits, symbols, tests, runtime receipt |
| production equivalent | current implementation or explicit absence |
| idiot index | 0-10 with one-sentence reason |
| API/schema delta | additive, breaking, or none |
| production-data dependency | exact bounded evidence required |
| stale-client risk | new backend/current web and new web/current backend |
| rollback risk | whether new writes remain readable by old code |
| decision | port, backend-first, expand/migrate/contract, rework, drop, already present, decision required, blocked |
| release order | dependencies and earliest safe unit |

### 9.2 Production-data evidence ledger

| Field | Required content |
| --- | --- |
| table/provider | canonical state inspected |
| incompatibility predicate | exact state that blocks the proposed change |
| query boundary | index/cap and truncation behavior |
| environment/time | exact deployment and timestamp |
| result | count/distribution only |
| confidence | confirmed, strongly inferred, or unknown |
| consequence | zero-state, migrate, retain compatibility, or blocked |

### 9.3 Release-unit card

Each proposed release unit records:

- problem and irreducible outcome;
- included and explicitly excluded behavior;
- exact source/schema/API/data delta;
- deployment order;
- old/new client compatibility;
- migration and observation requirements;
- automated proof;
- staging acceptance;
- production-data gate;
- rollback procedure and rollback-data compatibility;
- stop conditions;
- production approval owner.

## 10. Review Gates

1. **Identity gate:** remote refs, markers, worktrees, and deployments are exact.
2. **Preservation gate:** dirty root work and local `main` remain untouched.
3. **Requirement gate:** no staging implementation is ported before its need is
   re-approved.
4. **Coverage gate:** every staging-only and meaningful main-only change is
   assigned to a semantic job.
5. **Contract gate:** current/stale clients and public interfaces are compatible
   or sequenced explicitly.
6. **Data gate:** every schema/semantic contraction has complete production
   evidence.
7. **Provider gate:** external canonical state and local projection agree.
8. **Journey gate:** retained MVP behavior is exercised at the correct auth and
   environment boundary.
9. **Rollback gate:** rollback code can read post-release data, or the release is
   treated as irreversible and requires separate approval.
10. **Reduction gate:** unnecessary staged work is dropped before integration.
11. **Release gate:** each production action remains separately authorized.

Failure at any gate stops downstream work.

## 11. Stop Conditions

Stop and report rather than infer when:

- remote `main` moves during a frozen snapshot;
- a local tracking ref disagrees with the remote ref;
- a production marker disagrees with remote `main`;
- production Convex source/schema identity cannot be established;
- an aggregate is truncated or would expose private content;
- a removed validator cannot accept a live row;
- current web and proposed backend cannot coexist;
- rollback code cannot read proposed writes;
- an external consumer or provider obligation is unknown;
- a staged requirement has no current owner;
- the proposed unit requires unrelated staging history;
- a protected-core surface would be removed;
- integration would require touching the dirty root checkout or stale local
  `main`.

## 12. Definition of Complete

The reconciliation is complete enough to resume implementation when:

1. the current remote/production/staging/local truth snapshot is reproducible;
2. every staging-only commit is assigned to one semantic job or historical
   bucket;
3. meaningful main-only evolution is reconciled;
4. every staged job has a requirement owner, idiot index, and decision;
5. every public contract and schema delta has old/new compatibility analysis;
6. every data-sensitive change has complete bounded production evidence;
7. external canonical state is reconciled where relevant;
8. every retained change belongs to a dependency-ordered release unit;
9. each release unit has expand/migrate/observe/contract posture, proof,
   staging acceptance, rollback, and stop conditions;
10. the long-lived staging branch is not treated as a wholesale merge candidate;
11. the dirty root checkout and stale local `main` remain untouched;
12. the user explicitly approves the first integration unit.

## 13. Current Checkpoint and Update Protocol

Current checkpoint:

- active phase: `PC3`;
- completed phase: `PC0`;
- PC0 receipt:
  `reconciliation/pc0-current-truth-20260724.md`;
- completed phase: `PC1`;
- PC1A ledger:
  `reconciliation/pc1a-semantic-job-ledger-20260724.md`;
- completed sub-slice: `PC2A`;
- PC2A receipt:
  `reconciliation/pc2a-requirement-ratification-20260724.md`;
- completed phase: `PC2`;
- PC2B final matrix:
  `reconciliation/pc2b-final-requirement-deletion-matrix-20260724.md`;
- completed sub-slice: `PC3A`;
- PC3A receipt:
  `reconciliation/pc3a-destructive-lifecycle-quarantine-compatibility-20260724.md`;
- PC3A verdict: P03 and P09 remain independent `PORT BACKEND-FIRST`
  outcomes; exact public names and validators support cached clients, the
  zero-effect backend must lead, and rollback to either destructive executor
  is forbidden;
- completed sub-slice: `PC3B`;
- PC3B receipt:
  `reconciliation/pc3b-revoked-evidence-read-compatibility-20260724.md`;
- PC3B verdict: P27 remains a `PORT BACKEND-FIRST` security outcome, and its
  current source, public/internal API, schema, and cached-client basis are
  compatible; the staging implementation must be reworked rather than ported
  because it bundles unrelated result-cap contractions, amplifies lineage
  resolution without a request-wide bound, and leaves a stale parity proof
  outside the green baseline;
- completed sub-slice: `PC3C`;
- PC3C receipt:
  `reconciliation/pc3c-auth-session-compatibility-20260724.md`;
- PC3C verdict: P05 remains irreducible auth/session core and the staged
  hashed, stable, absolutely expiring session end-state is directionally
  correct, but it must be rebuilt through
  `EXPAND-MIGRATE-OBSERVE-CONTRACT`; the staged migration can strand a cached
  browser holding an ancestor replacement-chain cookie, duplicate
  subject/hash reads do not yet fail closed, and routine success diagnostics
  plus stale architecture doctrine should be deleted rather than ported;
- completed sub-slice: `PC3D`;
- PC3D receipt:
  `reconciliation/pc3d-membership-community-access-compatibility-20260724.md`;
- PC3D verdict: P06's explicit-active, unique non-owner pair, owner-only
  authority, and canonical-count outcomes remain required, but staging must be
  rebuilt through `EXPAND-MIGRATE-OBSERVE-CONTRACT`; production data is
  unknown, routine count transitions and directory/stat/mention reads retain
  full-community complexity, a duplicate legacy admin/count API family
  survives, and the operator-dashboard proof still requires the correctly
  deleted temporary active-flag mutation;
- next bounded slice: `PC3E`, map P07 account-tier/entitlement source, API,
  schema, cached-client, corruption, and rollback compatibility;
- current implementation work: paused after C2.3B1; C2.3B2-R0 is read-only
  mapping only;
- production writes: prohibited;
- staging writes/deployments: prohibited by this audit contract unless separately
  authorized;
- first required decision after PC0-PC6: choose the clean integration/staging
  topology for production candidates.

After every approved audit slice, update only:

1. the phase ledger status;
2. the current checkpoint;
3. evidence receipts and limitations;
4. compatibility decisions that changed;
5. the next smallest slice.

Do not rewrite historical evidence to make later decisions look inevitable.
Proposals, verified facts, blockers, and user decisions remain visibly distinct.

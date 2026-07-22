# Polynet Reduction-to-Semantic-Platform Execution Contract v1

Status: active execution tracker; not product or architecture authority

Last verified: 2026-07-22

## 1. Irreducible job

Move Polynet from its current multi-era implementation toward one simple,
scalable, reliable, robust, and secure community runtime in which each
authorized community is machine-readable and safely actionable by humans and
agents.

The causal order is:

```text
delete competing authority and dead surface
  -> establish one canonical owner per concern
  -> prove deterministic invariants and recovery
  -> expose permissioned semantic projections
  -> reuse them across native, MCP, workflow, and human surfaces
  -> optimize, accelerate, and automate last
```

This tracker answers only four questions:

1. What end state are we pursuing?
2. What is verified true now?
3. What single slice is active?
4. What evidence is required before moving forward?

It must link to detailed contracts and receipts instead of copying them.

## 2. Authority and non-authority

Requirements and implementation truth are interpreted in this order:

1. Current explicit user direction and `AGENTS.md` own the MVP boundary and
   protected-core rules.
2. Schema, deterministic authorization/execution code, and canonical records
   own implementation truth for their concerns.
3. Executable tests and exact runtime receipts prove behavior only within their
   demonstrated scope.
4. `docs/agent-native-semantic-platform-thesis.md` owns the accepted destination
   architecture; its status matrix does not replace implementation evidence.
5. `docs/comprehensive-system-mapping-contract-v1.md` owns the mapping method;
   `docs/system-map/` is the evidence ledger and reduction roadmap.
6. This file owns execution status only.

This file never authorizes a code, schema, data, configuration, deployment,
migration, payment, or deletion change. It must never become a parallel schema,
authority registry, findings register, or product specification.

## 3. Desired end state

### 3.1 Quality threshold

The retained platform must reach at least 8/10, with executable evidence, in:

- simplicity;
- scalability;
- reliability;
- robustness;
- security.

Documentation or structural shape alone cannot raise a behavioral score.

### 3.2 Runtime shape

```text
Canonical state
  -> current identity, context, and authority
  -> permissioned semantic projections
  -> discoverable, typed capabilities
  -> durable events and receipts
  -> native, MCP, workflow, and human projections
```

The intended community experience is a virtual, permissioned repository. It is
not a second mutable filesystem or database. The first admissible read-only
namespace is expected to be no larger than:

```text
/
|- community.md
|- self.md
`- resources/
```

The accepted first generic harness contains only bounded
`polynet_list` and `polynet_read`. Search, document writes, capability calls,
additional mounts, and generated adapters require separate evidence and
authorization.

## 4. Verified baseline

### 4.1 Repository lane

Verified before creating this tracker:

| Concern | Verified value |
| --- | --- |
| Worktree | `/Users/neilmcdevitt/code/arx/.worktrees/semantic-platform-staging-20260719` |
| Branch | `codex/semantic-platform-staging-20260719` |
| Baseline HEAD | `3bcbbf63ee00943803fc1efb68a5ea6de9193144` |
| Upstream divergence | `0 ahead / 0 behind` |
| Working tree before this file | clean |
| Foundation proof | all 37 steps passed at the baseline HEAD |
| Live Vercel/Convex proof in this slice | not rerun; no live claim |
| Production proof in this slice | not run; no production claim |

Current pre-C1 reconciliation on 2026-07-22:

| Concern | Verified value |
| --- | --- |
| Current HEAD before this documentation checkpoint | `3b5dad3ffe11d0399776bc65715d6e29365870b7` |
| Branch upstream divergence | `0 ahead / 0 behind` |
| Canonical staging web marker | `polynet-staging.vercel.app/version.json` matched `3b5dad3ffe11d0399776bc65715d6e29365870b7` |
| Canonical staging Convex | development deployment updated from the same validated source state |
| Live behavioral proof | signed-in founder Analytics loaded summary KPIs, Visits/Members/Revenue, and a `7d` to `30d` transition with no browser-console errors |
| Production | not changed or tested by the analytics cleanup slice |

The root `/Users/neilmcdevitt/code/arx` checkout was observed on a separate,
dirty, divergent user-work lane and is excluded from this baseline. Preserve it
untouched. Before every implementation slice, reverify the exact intended
worktree, branch, HEAD, upstream relation, and environment.

### 4.2 Current conceptual position

The deterministic authority floor is substantially stronger than the broader
platform substrate:

- authenticated identity/session authority is canonical and fail-closed;
- membership, entitlement, community access, and join-request authority have
  bounded canonical owners;
- checkout initiation and verified paid-access convergence have canonical,
  idempotent paths;
- destructive account/community cascades are quarantined but their safe,
  resumable replacements do not yet exist;
- interaction, resource-content, intelligence, capability/transport,
  Workspace-surface, scheduler, recovery, and frontend debt remain;
- a reusable community context/read seam exists, but the generalized semantic
  namespace and irreducible tool harness are not current staging architecture.

### 4.3 Directional baseline score

These are audit judgments, not measured service-level indicators:

| Dimension | Baseline | Principal reason it is not 8+ |
| --- | ---: | --- |
| Simplicity | 6.5 | compatibility paths, aliases, duplicate schemas, and concentrated surfaces |
| Scalability | 5.5-6 | scheduler continuation gaps and broad/N+1 operator projections |
| Reliability | 7.5 | the live paid-access and creator-settlement journey remains incomplete |
| Robustness | 6 | deletion is quarantined rather than resumable; restore proof is absent |
| Security | 8 | core authority is strong; privacy lifecycle and operational controls remain |
| Semantic-platform maturity | 5 | authority/read seams exist; namespace, registry, and adapter convergence do not |

Scores change only with named evidence. Every change records both the evidence
and the remaining reason the score is not higher.

## 5. Causal milestone ledger

Exactly one milestone or bounded sub-slice may be `IN_PROGRESS`.

| ID | Outcome | Status | Exit boundary |
| --- | --- | --- | --- |
| C0 | Reconcile and adopt one architecture thesis | `COMPLETE` | one repository contract distinguishes implemented, next, proposed, and deferred architecture without attachment/chat dependency |
| C1 | Finish paid-access proof and ordinary creator settlement | `IN_PROGRESS` | one live staging checkout/cancellation journey and one receipted Connect settlement authority |
| C2 | Complete resumable deletion and privacy lifecycles | `PLANNED` | interruption-safe phases, external revocation, privacy propagation, invariant audit, and root-last finalization |
| C3 | Finish canonical resource, interaction, and intelligence migrations | `PLANNED` | one authority per concern and zero compatibility reads/writes through an observation window |
| C4 | Guarantee scheduler fairness and bounded operations | `PLANNED` | every eligible object eventually receives service across caps and restarts; operator work is bounded |
| C5 | Collapse capability, transport, and public-function duplication | `PLANNED` | one authority/executor/receipt owner per semantic operation with thin versioned adapters |
| C6 | Land the read-only semantic community repository | `PLANNED` | bounded authorized list/read of only real initial mounts across native and external surfaces |
| C7 | Delete deferred Workspace/UI/docs/configuration surfaces | `PLANNED` | every retained surface maps to an MVP journey or protected substrate |
| C8 | Decompose and optimize retained frontend/backend surfaces | `PLANNED` | lower concentration and change fan-out without creating new authority |
| C9 | Prove backup, restore, RPO/RTO, and operational recovery | `PLANNED` | isolated recovery drills and owned runbooks meet accepted targets |
| C10 | Reconcile historical Builder Partner obligations | `PLANNED_LAST` | historical legal lineage, retention, and mixed-policy payout state reconcile without rewriting history |

The ledger is dependency-ordered but not permission to execute the next row.
Every milestone is divided into the smallest complete, reversible slices before
implementation.

## 6. C0 completion receipt: architecture-contract reconciliation

Outcome: `COMPLETE` in the local documentation worktree.

The prior repository thesis and expanded planning thesis were challenged and
reduced to one canonical repository contract. The accepted direction is an
active destination architecture with cleanup-led, milestone-gated execution.
Its status matrix distinguishes current implementation, next list/read work,
longer-term proposals, and deferred expansion.

The key reductions were:

- four control surfaces are required responsibilities, not four mandatory new
  services, tables, or generalized registries;
- the virtual repository is a projection over canonical state, never a second
  mutable store;
- only `community.md`, `self.md`, and `resources/` are accepted initial mounts;
- only bounded `polynet_list` and `polynet_read` are next;
- search, writes, calls, wider mounts, extension primitives, and independently
  enrolled agent/service members remain proposed or deferred;
- protected Workspace/harness substrate remains, while the standalone
  Workspace destination remains deferred;
- isolated semantic-profile/orientation commits are candidate input, not
  current staging truth and not a branch to merge blindly.

Evidence boundary:

| Concern | Receipt |
| --- | --- |
| Base worktree/branch | staging worktree on `codex/semantic-platform-staging-20260719` |
| Base HEAD | `3bcbbf63ee00943803fc1efb68a5ea6de9193144` |
| Source ancestry | candidate commits `3d5286a6` through `424f9d4b` are not ancestors of the base HEAD |
| Changed scope | canonical thesis, irreducible-core wording, system-map doctrine/authority/topology/findings/idiot-index/unknowns/roadmap, and this tracker only |
| Human decision | cleanup-led semantic destination and C0 plan explicitly approved on 2026-07-22 |
| Local verification | documentation consistency/ancestry/status checks and `check:community-interaction-substrate-contract-proof` passed; `git diff --check` passed |
| Commit/upstream/deployment | no commit, push, deployment, live mutation, or production change in C0 |

The attachment is no longer required to reconstruct the accepted architecture.
The documentation decision does not raise the baseline quality or maturity
scores and implements no namespace, mount, registry, or tool.

### 6.1 Post-C0 cleanup receipt: canonical community analytics surface

Outcome: `COMPLETE` through `LIVE_PROVED` on canonical staging.

The community-admin analytics surface now has one first-party authority:
`getCommunityAnalyticsSnapshot`. Three superseded APIs and their shared gateway
wrappers were deleted after zero-caller proof:

- `listCommunityRevenueSeries`;
- `listCommunityFunnelVisitCreatedAtRows`;
- `getCommunityAnalyticsSummary`.

Evidence boundary:

| Concern | Receipt |
| --- | --- |
| Commit | `3b5dad3ffe11d0399776bc65715d6e29365870b7` (`Delete superseded community analytics APIs`) |
| Changed scope | `convex/community.ts`, `convex/communityAdmin.ts`, `shared/cloudCommunityAdminGateway.ts`, and `scripts/community_admin_contract_guard.sh` |
| Local proof | Convex codegen, community-admin contract guard, web typecheck, production web build, Convex/public/client surface guards, cleanup proof, zero-reference search, and `git diff --check` passed |
| Staging deployment | canonical staging web marker matched the commit; development Convex was deployed intentionally from the validated source state |
| Live proof | signed-in founder Analytics rendered summary KPIs and all three chart series; the time range changed from `7d` to `30d`; browser-console errors were empty |
| Data/configuration/production | no data migration, provider configuration, production deployment, or production mutation |
| Remaining boundary | this closes only the superseded analytics APIs; broader public-function and transport duplication remains under C5 |

This deletion improves local simplicity but does not by itself justify a score
change for the platform-wide baseline.

## 7. Decision register

| ID | Decision | Status | Evidence / consequence |
| --- | --- | --- | --- |
| D-001 | Adopt one reconciled architecture thesis | `ACCEPTED` | C0; one active destination with explicit implementation states |
| D-002 | Keep Builder Partner reconciliation last while preserving ordinary creator settlement earlier | `ACCEPTED` | user direction; C1 and C10 remain separate |
| D-003 | Use causal cleanup to prepare semantic mounts; do not wait for whole-repo perfection or build over competing truths | `ACCEPTED` | milestone order C1-C9 |
| D-004 | Treat the four control surfaces as logical responsibilities before generalized infrastructure | `ACCEPTED` | prevents abstraction without a real adapter requirement |
| D-005 | Make only community/self/resources plus bounded list/read the next semantic substrate | `ACCEPTED` | search/write/call and wider mounts remain separately gated |
| D-006 | Preserve protected Workspace/harness substrate but not the standalone destination | `ACCEPTED` | resolves N-005 and F-013 without deleting protected core |
| D-007 | Make subscription lifecycle recovery the first C1 sub-slice | `SUPERSEDED BY D-008` | the bounded queue was implemented, then rejected after first-principles review because it duplicated Stripe delivery retry and could not recover events that never reached the endpoint |
| D-008 | Keep Stripe delivery retry plus idempotent current-provider convergence as the MVP recovery boundary | `ACCEPTED` | processing failures remain non-2xx; a broader reconciliation mechanism requires observed operational evidence and separate authorization |

Superseded decisions remain visible with a pointer to their replacement. Never
rewrite a historical decision to make the sequence look cleaner than it was.

## 8. Evidence and receipt protocol

Every completed slice records:

- exact worktree, branch, base HEAD, and resulting commit when one exists;
- upstream divergence and dirty/clean state;
- changed-file scope;
- deterministic tests and their exact results;
- staging deployment marker separately from local proof;
- live behavioral evidence separately from deployment presence;
- production state separately from staging;
- migrations or data observations, if explicitly authorized;
- remaining limitations and rollback boundary;
- links to detailed domain receipts rather than copied narratives.

The evidence states are distinct:

```text
PLANNED
  -> SOURCE_IMPLEMENTED
  -> LOCALLY_PROVED
  -> UPSTREAM
  -> DEPLOYED_STAGING
  -> LIVE_PROVED
  -> PRODUCTION_PROVED
```

Not every slice requires every state, but no lower state may be described as a
higher one.

## 9. Turn-to-turn update protocol

At the beginning of every future slice:

1. read this contract and the active slice's linked authority documents;
2. verify the exact intended worktree, branch, HEAD, upstream relation, and
   dirty state;
3. reconcile any new user decision or observed drift;
4. confirm that only one bounded slice is active.

At the end of every future slice:

1. record exact evidence and remaining limitations;
2. update the milestone and decision registers without erasing history;
3. update scores only where evidence warrants it;
4. name the next causal slice, but do not authorize it;
5. confirm whether staging, production, data, or configuration changed.

Allowed milestone statuses are `PLANNED`, `IN_PROGRESS`, `BLOCKED`,
`COMPLETE`, and `SUPERSEDED`. `PLANNED_LAST` is permitted only for an explicit
human sequencing decision. Avoid percentages and “mostly complete.”

## 10. Current next action

C1.1 is complete on canonical staging. The duplicate subscription-event recovery
queue remains deleted, and its verified-empty undeclared `stripeBillingEvents`
development table was removed from `quick-porcupine-949`. Stripe signature
verification, current-provider convergence, atomic community-access effects,
idempotency, failure audit, and non-2xx retry authority remain intact.

C1.2 is also complete on staging at `86c4aa1a`. Free/manual members retain the
existing immediate leave path. Paid members can no longer use that local-only
path: it fails closed before mutation and the member-facing control instead asks
Stripe to stop renewal at period end, re-reads provider truth, and projects it
through the existing canonical subscription lifecycle. Access remains active
through the provider period; retries are idempotent; provider failure leaves
local state unchanged; terminal provider truth revokes access. No table, queue,
cron, portal, ledger, checkout, charge, or Builder Partner behavior was added.

The next separately planned slice is C1.3: one real staging checkout followed by
the staged cancellation path, plus a separate receipted Connect settlement.
This is acceptance proof, not permission for a generalized recovery mechanism,
settlement rewrite, Builder Partner work, user-facing expansion, or production
move.

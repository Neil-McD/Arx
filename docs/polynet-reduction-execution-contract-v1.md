# Polynet Reduction-to-Semantic-Platform Execution Contract v1

Status: active execution tracker; not product or architecture authority

Last verified: 2026-07-26

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
not a second mutable filesystem or database. The current admissible read-only
namespace is:

```text
/
|- community.md
|- self.md
|- members/
`- resources/
```

The original three-mount boundary was later expanded by explicit user direction
to include bounded other-member profile projections under `/members/`. The
accepted generic harness still contains only bounded
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
- the generalized semantic namespace and irreducible two-tool harness are live
  on staging through `12b23889`; the native duplicate-tool convergence at
  `90badc0b` is locally proved but not yet deployed.

### 4.3 Historical directional baseline score

These are audit judgments from baseline
`3bcbbf63ee00943803fc1efb68a5ea6de9193144`, not measured service-level
indicators. The C6 receipt in section 10 owns newer semantic-platform truth.

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

Exactly one milestone or bounded sub-slice may be `IN_PROGRESS`. Evidence-state
labels are used when source, local proof, upstream, deployment, and live proof
must remain distinct.

| ID | Outcome | Status | Exit boundary |
| --- | --- | --- | --- |
| C0 | Reconcile and adopt one architecture thesis | `COMPLETE` | one repository contract distinguishes implemented, next, proposed, and deferred architecture without attachment/chat dependency |
| C1 | Finish paid-access proof and ordinary creator settlement | `DEFERRED_ACCEPTED` | implementation accepted for sequencing; the unperformed live checkout/cancellation and Connect-settlement evidence remains explicit under U-017 |
| C2 | Complete resumable deletion and privacy lifecycles | `PAUSED_INCOMPLETE` | interruption-safe phases, external revocation, privacy propagation, invariant audit, and root-last finalization |
| C3 | Finish canonical resource, interaction, and intelligence migrations | `COMPLETE` | one authority per concern and zero compatibility reads/writes through an observation window |
| C4 | Guarantee scheduler fairness and bounded operations | `SOURCE_IMPLEMENTED` | implementation landed; formal closure and current evidence reconciliation remain |
| C5 | Collapse capability, transport, and public-function duplication | `SOURCE_IMPLEMENTED` | substantial cleanup landed; formal closure and current evidence reconciliation remain |
| C6 | Land the read-only semantic community repository | `COMPLETE` | exact staging build `482d5d20` passed authenticated native and official-MCP list/read plus retired-name absence proof |
| C7 | Delete deferred Workspace/UI/docs/configuration surfaces | `COMPLETE` | exact staging build `3449fb98` passed source, CI, anonymous and signed-in acceptance; the two confirmed stale staging names are absent |
| C8 | Decompose and optimize retained frontend/backend surfaces | `COMPLETE` | C8.1 converges Global Settings, C8.2 extracts Personal Account orchestration, C8.3 converges account-setup surface projection, C8.4A and C8.4B establish explicit launcher boundaries, C8.4C retires the duplicate frontend, and C8.4D retires its backend contract after moving Funnel About to a narrow canonical seam; any future retained-surface redesign is separately bounded |
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
- only `community.md`, `self.md`, and `resources/` were accepted initial mounts;
- only bounded `polynet_list` and `polynet_read` were accepted next;
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
| D-009 | Add bounded other-member profiles under `/members/` without widening the two-tool harness | `ACCEPTED` | explicit later user direction; current source reuses member-profile authority and keeps other proposed mounts gated |

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

Allowed milestone lifecycle statuses are `PLANNED`, `IN_PROGRESS`,
`PAUSED_INCOMPLETE`, `BLOCKED`, `COMPLETE`, and `SUPERSEDED`.
`DEFERRED_ACCEPTED` records an explicit human decision to move on without
representing the missing exit evidence as complete. `PLANNED_LAST` is permitted
only for an explicit human sequencing decision. The evidence states in section
8 may replace a lifecycle status when release truth needs finer resolution.
Avoid percentages and “mostly complete.”

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

The final purchase-claim storage residue is also closed on staging. On
2026-07-22, the undeclared `purchaseClaims` table in
`quick-porcupine-949` was re-proven empty with zero live schema/runtime call
paths and then physically deleted through the authenticated Convex dashboard.
Post-deletion inventory no longer lists the table; all 49 focused paid-access,
checkout-start, and subscription-convergence cases pass. At deletion time, the
staging web marker remained `e1af0c481d2235ac2f7e71d089a76c03634bfa93`, and
production remained untouched at `a936dee72a65f91723f332779390210e4cf783f0`.

The user explicitly accepted deferring C1.3 on 2026-07-22 and moving to C2.
U-017 continues to own the missing real staging checkout/cancellation and
Connect-settlement receipts; this evidence is deferred, not complete.

C2 is now active. C2.0A is complete in the canonical staging worktree: the
account policy and documents agree, account deletion, authored-content purge,
and community deletion are separate jobs, and the resolved Builder Partner v3
prerequisite is gone. Focused policy, structural-quarantine, and behavioral-
quarantine proofs pass. The slice changed no schema, runtime behavior, UI,
staging data, providers, or production.

C2.0B is complete on the canonical staging lane. The unowned anonymous-user
hard-delete mutation, production-default audit script, generated API surface,
and unrelated proof coupling are deleted after zero-caller and zero-schedule
proof. All 56 development roots remain unchanged, and U-013 retains their
reference/disposition decision. No production state or surface changed.

C2.1 is complete on the canonical staging lane. The account-specific lifecycle
kernel consists of one checkpoint table, one append-only receipt table, and two
authenticated internal mutations. It supports only `requested -> blocked`, uses
the versioned policy plus three user-first ownership indexes, and is idempotent
across request replay, preflight replay, and interruption between them. Its
behavioral fixture proves product state remains unchanged. The public quarantine
is unchanged; there is no executor, public API/UI, action, scheduler, provider,
storage, scan, delete, or root-finalization capability.

The development receipt on `quick-porcupine-949` registers exactly the two
intended lifecycle mutations, leaves both lifecycle tables empty, and schedules
no lifecycle job. Existing development state remains 120 users, 56 legacy
anonymous roots, and 11 scheduled functions. No lifecycle mutation was invoked.

C2.2A is complete on the canonical staging lane. Authenticated
subject-to-account selection now converges on `authActor`; the surviving gate,
business-visitor, and thread-owner paths use it, while two uncalled gate
projections, the uncalled subject-tier query, and the duplicate thread-local
user lookup are deleted. The lifecycle order is preflight before final
confirmation and access freeze. Freeze will deny account authority rather than
rewrite entitlement or operator-role state. This slice adds no freeze state,
session effect, data mutation, executor, public API/UI, scheduler, provider,
storage, or deletion behavior. Convex typecheck, focused affected proofs, and
the full 38-step foundation baseline pass; the development Convex function
surface was updated successfully after the exact staging identity guard passed.

C2.2B is complete on the canonical staging lane. The lifecycle request is now
one canonical root per account rather than one root per account/policy pair.
`policyVersion` remains audit metadata, while the duplicate root-level
`idempotencyKey` and `by_user_policy` index are deleted. Policy drift and
duplicate roots fail closed instead of creating or selecting another root.
The expectation-locked development preflight found zero request rows, zero
receipt rows, and zero lifecycle jobs before the schema change.

The C2 analytics identity closeout is complete on the canonical staging lane.
Community funnel analytics now has one anonymous hash-only job. The public
mutation and gateway no longer accept, resolve, or write user identity; the
event schema no longer carries `userId`, raw `visitorKey`, or its legacy index;
and duplicate detection uses a hash-and-time-bounded lookup. Authenticated
visitor conversion remains separate in `platformBusinessVisits` through
verified `authActor`.

The two-checkpoint development receipt preserved all 96 rows, cleared exactly
the sole user link after an expectation lock caught one legitimate new
anonymous visit, and proved all 96 rows carried hashes with no raw keys. The
temporary migration is absent from final source. Lifecycle policy v5 now covers
120 direct user edges and 39 unindexed edges.

C2 is now `BLOCKED`, not complete. C2.2C remains the future access-freeze slice,
but implementing a lock before C3 canonicalizes interaction, resource, and
intelligence authority would create state without a correct complete executor.

C3.1A canonical resource-body authority is complete on the canonical staging
lane. The expectation-locked development preflight found 10 resources, eight
content rows, two inline-only bodies, and zero duplicate, orphan,
cross-community, or inline/content-conflict rows. The two bodies moved
atomically into `communityResourceContents` without changing resource
timestamps; replay performed zero work. A second expectation-locked checkpoint
proved all 10 parent hash/migration projections matched canonical content,
cleared them, and replayed as a zero-op.

`communityResourceContents` is now the sole durable body/hash owner.
`communityResources` retains only the derived `bodyChars` list projection.
Duplicate, missing, malformed, projection-mismatched, or cross-community
content fails closed. Inline fields, inline-first reads, the public full-collect
compactor, and both temporary internal migration functions are absent from the
final source and development function surface. Recent context and weekly
digest readers now hydrate canonical content instead of reading removed inline
fields. The complete post-closure development audit found 10 resource rows,
10 content rows, and zero integrity or legacy-field defects. Production was
not queried or changed.

C3.1B resource UI list/read authority is complete on the canonical staging
lane. One `take(201)` query now returns at most 200 resource metadata rows plus
module metadata with explicit truncation; it does not hydrate bodies. One exact
authorized query reads only the selected body and fails closed for
cross-community or member-hidden rows. The duplicate public module-list query,
duplicate browser list gateways, and duplicate post-mutation module refresh
are deleted.

Directory and body results are accepted only for the current community,
request generation, resource ID, and `updated_at`. Same-version directory
refreshes retain hydrated content; newer metadata evicts it. Incomplete
directories remain readable but expose truncation and disable operations that
require complete ordering. Exact body failures expose page-local retry rather
than reloading every body.

The first signed-in staging edit found a pre-existing C3.1A write-order defect:
the canonical body write updated the parent counter, then the handler hydrated
an older parent object and failed with
`community_resource_content_projection_mismatch`, rolling back the
transaction. Body writes now return the matching post-write resource, and all
create/edit paths consume that exact projection. Focused behavior proofs, web
typecheck, production build, bundle budget, the 38-step foundation baseline,
Convex deployment typecheck, and the exact-build signed-in page-load plus
edit/save/restore journey passed. Browser errors were empty. The final
development audit remained 10 resource rows, 10 content rows, and zero
duplicates, missing rows, orphans, cross-community rows, parent-counter
mismatches, or legacy parent fields. Production was not queried or changed.

C3.2A interaction-authority truth reconciliation is complete on the canonical
staging lane without runtime behavior or data changes. The normal feed,
composer, edit/delete/reaction actions, attention, recent context, and evidence
paths are canonical. The remaining web-shell dependency is narrower: community
chat preload still ensures a legacy thread and reads legacy messages and
reactions before marking the canonical projection ready.

The redacted development snapshot found four legacy threads, three empty; 67
legacy messages with 67 valid one-to-one mapping links; 54 canonical roots, 23
canonical replies, and 76 content blocks; three canonical-only roots and seven
canonical-only replies; four legacy attachment targets with zero canonical
attachment rows; three legacy and eight canonical reactions; and two legacy
featured-message pointers. There were zero unlinked messages, duplicate links,
or dangling message/root/reply links.

The residue inventory now has only three decisions: `KEEP TEMPORARILY`,
`DELETE CANDIDATE`, and `DECISION REQUIRED`; parity is a deletion gate rather
than a fourth state. Recent-context/evidence claims were corrected, weekly
digest and featured-message requirements were surfaced for deletion-first
decisions, and the stale migration proof stopped duplicating the canonical
reply-target behavior proof.

Nine focused interaction contracts and the 38-step foundation baseline passed.
Only documentation and proof files changed; no runtime function or development
data changed, no Convex deployment was required, and production was not queried
or changed.

C3.2B removes the normal web legacy preload/readiness dependency without a
replacement readiness subsystem. The preload lifecycle is deleted; canonical
entry and scrolling no longer activate legacy thread/message/reaction reads;
canonical projection visibility, composer routing, typing, and seen
acknowledgement no longer wait on legacy state. Existing canonical
loading/error/empty states own presentation, and roots are synchronously scoped
to the active community during navigation.

The dormant legacy writer, mutation controller branch, gateway/backend
functions, historical rows, mappings, backfill, attachment fallback, digest,
featured-message state, and lifecycle reachability are intentionally unchanged.
No schema or Convex function changed and no historical migration ran.

Exact runtime commit `d2aa605f` was `READY` and `PROMOTED` on the canonical
`polynet-staging` project. Signed-in acceptance loaded the populated Polynet
canonical feed and the empty Distribution Engineering and test feeds, exposed
an enabled canonical composer on each surface, and switched communities without
showing stale roots. Browser diagnostics contained no errors. The bounded
development aggregate remained four legacy threads, three empty threads, 67
legacy messages, and three legacy reactions before and after navigation.

Nine focused interaction contracts, web typecheck, production build, bundle
budget, the 38-step foundation baseline, staging identity guard, and diff
hygiene passed. The initial sandboxed foundation run stopped only because
`tsx` could not create its local IPC socket; the complete permitted rerun passed.

C3.2C closes R-006 by deleting the unreachable live legacy chat and ambient
activity surface instead of porting or deprecating it. The normal browser now
has one community-interaction presentation and mutation path: the canonical
interaction projection. The legacy timeline, preload controllers, viewport
state, fallback composer, legacy edit/delete/reaction actions, activity
markers, gateway methods, public Convex chat/activity functions, and
best-effort activity writers are absent.

Typing presence and attachment upload remain because the canonical composer
uses them. Historical legacy chat rows, their one-to-one mapping links,
backfill/materialization helpers, canonical-first attachment fallback, legacy
reaction/featured dependencies, lifecycle reachability, and the
`communityActivityEvents` table remain intentionally bounded migration or
retention residue. No historical row was migrated or deleted, and no generic
replacement subsystem was added.

Nine focused interaction contracts, the evidence-integrity contract, web and
Convex typechecks, production build, bundle budget, the 38-step foundation
baseline, staging identity guard and guard proof, generated API reconciliation,
and diff hygiene pass locally. The slice deletes four complete runtime modules,
one redundant proof file, and several thousand more lines than it adds.

Exact runtime commit `6c7f976e` was `READY` and automatically promoted by the
canonical `polynet-staging` project after the development Convex deployment
reported its functions ready. Signed-in acceptance loaded the populated
Polynet canonical feed, kept Distribution Engineering and test empty without
stale roots, opened a seven-reply canonical thread, and enabled then disabled
the reply composer as its draft was entered and cleared. No interaction was
submitted. Browser diagnostics contained only successful Convex health probes.
The final read-only development aggregate remained four legacy threads, three
empty threads, 67 legacy messages, three legacy reactions, and two historical
activity events, proving that navigation and composer exercise did not recreate
or mutate legacy chat state.

C3 remains `IN_PROGRESS`, but live legacy chat authority is closed. The next
work is a product-requirement decision, not another compatibility
implementation: question and either delete or explicitly retain R-008 weekly
digest and R-009 public featured messages before migrating any remaining
legacy attachment, reaction, link, or row state. This receipt authorizes no
historical migration, digest/featured retention, schema-table deletion, or
production change.

C3.2D1 closes R-008's legacy dependency while retaining the weekly community
digest as an explicit MVP return loop. Exact runtime commit
`4755560e48250294a2ed07fe2a4d68a64a52d56e` replaces the legacy
`communityChatThreads` and `communityChatMessages` reads with
`communityInteractionRoots` and `communityInteractionReplies`. Each canonical
index read is capped at 51 rows and admits at most 50. Only live community or
public rows are eligible. A recent reply is included only when its parent root
is still live, belongs to the same community, and is community-readable,
including when that root predates the seven-day digest window. Rendering uses
the current canonical `contentSummary`; it does not hydrate blocks,
attachments, or legacy links.

The focused Convex behavior fixture proves canonical-only roots and replies,
current edited summaries, an in-window reply to an older root, fail-closed
hidden/deleted/private/admin rows, fail-closed hidden or foreign parents, and
the deterministic 50-root plus 50-reply bound. The migration residue proof,
archive/resource/workspace dependency proofs, Convex typecheck, and complete
38-step foundation baseline pass. No schema, cron, recipient selection,
threshold, ranking, dedupe, renderer, preference, enqueue, or send behavior
changed.

The guarded development Convex deployment reported its functions ready, and
`polynet-staging.vercel.app/version.json` reported the exact runtime commit as
both build ID and Sentry release. The independent read-only email ledger
contained 129 rows before and after deployment, including 115 historical
weekly-digest rows, with zero pending or sending rows. No preview enqueue or
email send ran. A direct live batch preview was not executed because the
execution safety gate would not recognize the internal query as provably
read-only; it was not bypassed.

R-009 public featured-message state is now the only unresolved product
requirement before the retained legacy attachment/reaction/link history can be
resolved in causal order. This receipt authorizes no featured-message decision,
historical migration or deletion, email-policy expansion, production Convex
deployment, or production web release.

C3.2D2A deletes R-009's live product surface rather than migrating an
unmaintainable optional feature. Exact runtime commit
`4a46224c1dbda78c830cc0366380ae2395d70247` removes the callerless
feature/unfeature mutations and generated function surface, the public funnel's
legacy message/reaction reader and response field, and the browser's
featured-message types, props, synthetic roots, profile projections, and
featured-specific prompt branch. The founder introduction, join gate,
statistics, member preview, ghost conversation, and canonical access authority
remain.

The slice deletes 221 lines and adds 67 lines, primarily strengthening the
existing residue contract. It also corrects one stale visitor-access proof that
still expected a direct membership-table lookup even though runtime authority
already used the canonical unique-pair helper; no access behavior changed.
Focused interaction-residue, visitor-access, and funnel-load proofs, Convex and
web typechecks, production build, bundle budget, and the complete 38-step
foundation baseline pass.

Development Convex reported its functions ready from the exact clean runtime
commit. The canonical `polynet-staging` build marker matched that commit, and
the anonymous `/c/polynet` Playwright canary passed with its avatar, anonymous
composer, free instant-access policy, enabled join action, and no browser,
console, Convex request, or first-party server error. A bounded read-only
postflight still reports exactly two featured pointer rows and three legacy
reaction rows, with neither scan truncated. No stored row, schema table,
lifecycle policy, maintenance behavior, provider, production Convex deployment,
or production web release changed.

R-009's two stored pointers and R-010's three legacy reactions are now
quarantined deletion candidates with no first-party product reader or writer.
Their destructive row deletion, table removal, maintenance cleanup, and
lifecycle-policy cleanup remain a separately authorized slice. The four
historical attachment targets and their canonical-first fallback remain
untouched.

C3.2D2B completes the authorized R-009/R-010 destructive cleanup on the
isolated development staging lane. Temporary checkpoint
`1f5663ece8b7a73d315db51b090f6b8e6ffb66c4` introduced one staging-only,
expectation-locked internal migration. Its independent preflight found exactly
two featured-pointer rows
(`kn7pdhckf29vm3zm6rxhq01bgd89r622`,
`kn7tf4p1kr1df5y2z2p7gk2vsd89rc5h`) and exactly three legacy-reaction rows
(`m170n5jyyn5bd4hzxrj3vxa4jn834mf6`,
`m175k32zwgg5p44hhqsce2z6b982wgbn`,
`m17cs4swzkfhthk423pvg8fdfx835vy5`). Every row had a valid legacy message,
thread, canonical link, and canonical root or reply target; one featured target
carried a legacy attachment and no reaction target did.

The dry run deleted zero rows. The exact live mutation deleted those five rows
and nothing else. An immediate zero-work replay deleted zero rows. These five
rows were intentionally and permanently discarded; this slice created no
application backup or recovery path for them.

Permanent runtime checkpoint
`a75c508c0f96e438b7a6b9e6057f9935355093bb` removes both table definitions,
all five associated indexes, the legacy reaction maintenance and account-
lifecycle branches, the obsolete reaction type, the generated migration
surface, and the temporary migration and test. Account lifecycle policy v6 now
covers 125 tables, 118 direct user edges, 38 unindexed edges, 26 opaque edges,
and seven storage edges. The permanent development function surface contains
no cleanup function.

After that exact clean checkpoint was guarded and deployed to
`quick-porcupine-949`, the two residual physical tables were independently
proven empty and then deleted through the development Convex dashboard.
`communityFeaturedMessages` and `communityMessageReactions` are absent from
the deployed table inventory, not merely omitted from the declared schema.
That physical table deletion is irreversible through the application and
dashboard.

The independent postflight still finds 67 historical chat messages and 67
one-to-one canonical legacy links, with zero broken message or canonical-target
references. All four attachment-bearing historical messages remain:
`k572wektvtg7a4dwk0m95vr3xn89h8qf`,
`k578x3hng7hyv3n5z4tysxajk589h7mr`,
`k5792fer8rj8kymy193vxypk3d89hxt2`, and
`k57dsybwndqxv3efhd6ha1q0wd89gada`. All eight canonical interaction reactions
remain and have valid targets. The canonical attachment table remains empty;
the four measured attachments are still the explicitly bounded legacy-message
fallback.

Nine focused interaction/archive/resource contracts, the account-lifecycle
policy proof, canonical community-deletion behavior, Convex and web
typechecks, production build, bundle budget, the complete 38-step foundation
baseline, staging guards, generated API reconciliation, and diff hygiene pass.
`polynet-staging.vercel.app/version.json` served the exact permanent runtime
checkpoint, and the final docs-only receipt build serves the same application
runtime. The anonymous `/c/polynet` browser canary passes on both exact builds
without a product mutation. `www.polynet.ai/version.json` remains at
`a936dee72a65f91723f332779390210e4cf783f0`; production was not deployed,
queried for product data, or changed.

R-009 and R-010 are closed. The next interaction cleanup decision is limited
to the four retained legacy attachment targets and the mapping/history
substrate that still makes them readable; this receipt authorizes neither that
future deletion nor any production action.

C3.2E1 closes R-004 on the isolated development staging lane. Temporary
checkpoint `bdf7aaf7dc8d75c9d223019dca2effe117ee6499` introduced one
staging-only, expectation-locked internal migration for the four previously
measured attachment-bearing messages. Its independent audit and dry run found
exactly four live community roots, four one-to-one legacy links, four existing
storage objects, zero canonical attachment rows, and no extra attachment
payload. The atomic live mutation created exactly four
`communityInteractionAttachments` metadata rows, each referencing its existing
blob. The immediate replay created zero rows.

Permanent runtime checkpoint
`cf1033ba7f34a565f9e9d7b03f9a4f26d25b4cf7` makes canonical attachment rows
the sole root/reply read authority. It deletes the legacy-message attachment
hydration module, both conditional fallback branches, the temporary
migration/test, and both generated function identities. It intentionally keeps
the bounded attachment normalization/materialization helper used by the
remaining historical backfill. The permanent change removes 573 lines and adds
90 lines, primarily stronger contracts and absence proofs.

After guarded deployment to `dev:quick-porcupine-949`, an independent bounded
postflight reported 67 legacy messages, 67 links, four legacy attachment
payloads, four canonical attachment rows, no scan overflow, and exact
message/link/root/name/type/MIME/size/storage parity for every target. All four
storage objects remain present. The deployed function surface contains neither
the cutover function nor the deleted fallback module.

Six focused interaction contracts, Convex and web typechecks, production build,
bundle budget, diff hygiene, and the complete 38-step foundation baseline pass.
The canonical staging marker served exact runtime checkpoint `cf1033ba`, and
the anonymous public-funnel canary passed. Signed-in acceptance on
`/c/polynet/chat` rendered all four canonical attachment containers: three
900-by-900 images and one 2048-by-2048 image loaded completely from the
development Convex storage origin with zero browser errors. No browser product
mutation was performed.

The only data effect was creation of four canonical metadata rows referencing
four existing blobs. No attachment bytes were copied; no blob, legacy message,
link, thread, activity row, or other historical state was changed or deleted.
The new metadata rows are recoverable by an exact-row rollback if required, but
this receipt does not authorize that rollback. Production remained untouched;
`www.polynet.ai/version.json` still served
`a936dee72a65f91723f332779390210e4cf783f0`.

R-004 is closed. The next interaction slice is limited to a bounded final
historical backfill and integrity replay for R-003/R-007. This receipt
authorizes no link, backfill, message, thread, activity-history, lifecycle,
schema-table, blob, or production deletion.

C3.2E2A closes live legacy interaction identity authority on the isolated
development staging lane at exact runtime checkpoint
`58d84cd5efd6dac339d53a708060966746d96294`. Canonical root/reply read bundles
no longer return legacy thread, message, or target-message ids. The browser
gateway, controller, optimistic projection, thread drawer, and composer accept
only canonical root and reply ids. Root and nested-reply targets must be live,
community-readable, and scoped to the same community and root. Invalid,
hidden, deleted, admin-only, cross-root, cross-community, missing, and
wrong-table targets fail closed. Idempotent retries preserve the originally
stored target, including when that target is later hidden.

Canonical edits no longer mirror content into historical
`communityChatMessages`. Migration-only link reads and legacy reply metadata
remain confined to bounded backfill planning. No schema, migration, stored row,
thread, message, link, trace, citation, intelligence object, attachment,
lifecycle policy, provider, production Convex deployment, or production web
release changed.

The focused canonical-identity behavior fixture, relevant interaction,
migration, projection, attachment, reply/mention, digest, and link-preview
proofs, Convex and web typechecks, production build, bundle budget, diff
hygiene, and the complete 38-step foundation baseline all pass. Dev Convex
`quick-porcupine-949` reported its functions ready from the exact clean runtime
checkpoint, and `polynet-staging.vercel.app/version.json` served that exact
build and Sentry release.

Signed-in acceptance on `/c/polynet/chat` rendered the canonical feed, opened
the existing canonical smoke thread, selected its nested canonical reply
target, and seeded the expected author mention in the drawer composer. Nothing
was submitted; the drawer was closed back to an empty channel composer, and
the browser console reported zero warnings or errors.

An independent bounded read-only Dev Convex postflight still reports 54 roots,
23 replies, 67 historical links, 12 links whose canonical target retains the
matching migration idempotency key, and 55 links that are the sole
correspondence receipt. All 63 community-readable interactions still lack
canonical source traces. The one malformed/orphaned community-visible
interaction trace still has zero citation, intelligence-node, intelligence-
edge, mutation, or change-request dependents. Every scan completed below its
1,000-row bound. Production remained untouched;
`www.polynet.ai/version.json` still served
`a936dee72a65f91723f332779390210e4cf783f0`.

The next authorized interaction cleanup slice is C3.2E2B: reconcile missing,
malformed, and orphaned canonical interaction evidence before any bounded
backfill replay or retention decision. This receipt authorizes no legacy-link,
message, thread, activity-history, trace, schema-table, or production deletion.

The dormant community-archive substrate is now closed on the isolated
development staging lane. Temporary checkpoint
`8f089cb6addad32fba0c7e59d515a01c4e2bda9e` introduced one internal,
deployment-locked drain. Its expectation-locked dry run found exactly 66
derived rows for one community: 63 chat and three AI-feed rows; 60 pending and
six embedded rows; six inline embeddings; and zero interaction, resource, PDF,
URL, or failed rows. The atomic committed run deleted exactly those 66 rows,
and its immediate replay deleted zero.

Permanent runtime checkpoint
`1765e18356e5e087d65744f5cc4c7eced63a90ee` deletes the 550-line archive
module, temporary drain, schema table, four ordinary indexes, 768-dimensional
vector index, generated identity, cognition-cleanup phase, lifecycle edge,
domain assignment, obsolete proof command and proof, and two callerless legacy
chat-link lookup helpers. Account-lifecycle policy is now v7 and covers 124
declared tables. From the pre-slice checkpoint, the implementation removes 711
net lines across 18 files.

Convex deployed the permanent checkpoint only to
`dev:quick-porcupine-949` and explicitly removed all five archive indexes. An
independent bounded read returned zero rows. The signed-in Convex dashboard
then showed the exact development deployment and an empty
`communityArchiveDocuments` table; its physical empty table shell was deleted
and was absent from the resulting table inventory.

The archive data had no canonical consumer and was intentionally discarded as
derived, disconnected state; no application backup or recovery path was
created. Canonical interactions, messages, source traces, digests, legacy
links, historical chat rows, resources, MCP compatibility, and production
were not changed. No interaction-evidence repair or backfill was performed.

Convex and web typechecks, focused interaction/resource/compiler/lifecycle
contracts, production build, bundle budget, diff hygiene, and the complete
38-step foundation baseline pass. C3.2E2B interaction-evidence reconciliation
remains the next authorized slice; this archive closure does not authorize an
evidence, link, message, thread, activity-history, or production mutation.

C3.2E2B1 removes the sole malformed interaction source trace from the isolated
development staging lane. Temporary checkpoint
`14c61500707452f8fa7b431d4710fa4089f86efb` introduced one staging-locked,
exact-row drain. Its dry run required the exact trace, community, malformed
composite source ref, compiler provenance, and historical digest pointer. It
also completed bounded scans of every schema-level inbound reference surface:
citations, Concierge serve requests, intelligence nodes and edges, mutations,
change requests, and compiler digest items. All dependency counts were zero.

The committed run deleted exactly one derived trace and verified its absence in
the same transaction. The immediate committed empty-state replay deleted zero.
No backup was created for the disconnected derived row. Permanent checkpoint
`b542a2ae9fce9676c2541692793fa00aff353a03` removes the temporary function;
the deployed Dev function specification confirms that no drain identity
remains. Current source has no emitter for the retired composite ref:
interaction traces are created only from typed canonical root/reply refs.

The bounded postflight completed below its 2,001-row limits and reports 55
canonical roots, 24 replies, 65 readable interactions, two valid interaction
source traces, 63 missing historical traces, zero malformed traces, zero
duplicate trace keys, and an absent deletion target. The two valid traces and
the new root/reply appeared through ordinary canonical behavior between the
planning and execution audits; the deletion guard intentionally did not freeze
or mutate that live state.

Canonical interactions, historical messages, mapping links, attachments,
reactions, citations, intelligence objects, compiler digests, agent runs,
memory state, account lifecycle, schemas, and production were not mutated.
The 63-trace historical projection remains deliberately unrun because the
current source-trace writer would admit those rows as pending compiler evidence
and could trigger owner-funded cognition. It therefore remained blocked pending
the explicit E2B2 decision recorded below.

C3.2E2B2A resolves that decision by deletion. Historical canonical interactions
remain directly readable and searchable, but they do not enter cognition merely
because a migration can enumerate them. Runtime checkpoint
`e9c7223614038175386e5d3ace80f490a587772f` deletes the recursive internal
historical interaction-trace batch query/action and its pagination dependency.
It adds no replacement table, state, workflow, scheduler, cron, UI, trace,
citation, or admission mode. The existing write-driven sync remains unchanged
for new and edited readable interactions.

The exact runtime checkpoint was deployed only to
`dev:quick-porcupine-949`. The deployed function specification contains neither
removed function and still contains `syncCommunityInteractionEvidenceInternal`;
the scheduled-function ledger contains zero historical replay jobs. A bounded
read-only postflight remains 55 roots, 24 replies, 65 readable interactions,
two valid typed traces, 63 intentionally missing historical traces, zero
malformed or duplicate trace keys, zero interaction-citation dependencies, four
historical threads, 67 historical messages, and 67 mapping links. Every scan
completed below its 2,001-row bound.

The focused interaction identity, write, read, migration-residue, evidence,
compiler-digest, and compiler-evidence checks pass, as do Convex typecheck,
web typecheck, production build, bundle budget, diff hygiene, and the complete
38-step foundation baseline. `polynet-staging.vercel.app/version.json` served
the exact runtime checkpoint, while `www.polynet.ai/version.json` remained
unchanged at `a936dee72a65f91723f332779390210e4cf783f0`. No product row, source
trace, citation, compiler digest, agent run, historical link/message/thread,
schema table, provider, or production deployment changed.

The next interaction slice is a bounded integrity replay and retirement review
for the legacy backfill module, bridge, and migration-only planning helpers.
This receipt authorizes no historical row, link, lifecycle, schema-table, or
production deletion.

C3.2E2C closes that migration runtime by proving it has no work and deleting it.
The existing moderator-gated function was invoked only with `dryRun: true`
against all four Dev historical threads. Aggregate output was 67 scanned, 67
already linked, zero roots created or predicted, zero replies created or
predicted, zero unresolved replies, zero failures, empty error arrays, and null
final cursors. Three threads contained zero messages; the Polynet thread
contained all 67 messages and links.

The public backfill mutation and facade identity, 282-line backfill module,
legacy mapping bridge, root/reply planning and materialization branch, legacy
attachment materializer, generated function identities, and dedicated
backfill-presence proof are deleted. Canonical attachment normalization, writes,
reads, interaction evidence sync, digest reads, UI projection, maintenance, and
lifecycle policy remain.

This slice adds no table, state, workflow, scheduler, cron, operator UI,
migration engine, or replacement API. It does not run the write replay or
mutate historical messages, links, threads, canonical interactions,
attachments, traces, citations, compiler state, lifecycle state, or production.
The retained 67 mapping rows and their historical parents are now
lifecycle-only evidence pending C2 privacy, anonymization, and retention policy.

Permanent runtime checkpoint
`377537b825d9a46716e2c57e9ce49318c37645ac` removes 1,108 lines and adds
102 contract/proof lines, for a net deletion of 1,006 lines. The exact clean
commit was deployed to `dev:quick-porcupine-949` before its staging-branch push.
The deployed function specification contains no
`communityInteractionBackfill`, `communityInteractionLegacyBridge`, or
`backfillCommunityInteractionsFromLegacyChatBatch` identity and still contains
`syncCommunityInteractionEvidenceInternal`.

The bounded postflight reports four historical threads, 67 historical
messages, 67 links, 55 canonical roots, 24 replies, four canonical attachments,
65 readable interactions, two valid interaction traces, 63 intentionally
missing historical traces, and zero malformed traces, duplicate trace keys,
interaction citations, or scheduled bulk replay jobs. Every scan completed
below its 2,001-row bound.

Focused interaction identity, attachment, reply-target, write, read,
migration-residue, evidence, compiler-digest, and compiler-evidence checks
pass, as do Convex and web typechecks, production build, bundle budget, diff
hygiene, and the complete 38-step foundation baseline. Signed-in read-only
acceptance on `polynet-staging.vercel.app/c/polynet/chat` rendered 48 historical
paragraphs, 49 reply actions, all four historical attachment images, the
canonical smoke record, and both enabled composers with zero browser warnings
or errors. The canonical staging marker served the exact runtime checkpoint.
Production was not changed by this slice and remained at independently current
marker `dbcd080d4e62fa73fdfa3042d005c09ede750cc1`.

C3.3A closes raw retrieval-query privacy residue on development staging.
The bounded preflight scanned zero evidence retrieval receipts and seven
intelligence retrieval receipts. Exactly five intelligence rows physically
contained the optional `query` field; evidence contained zero. Current evidence
and intelligence writers already omitted the field, so the retained storage had
no runtime authority or reader.

Temporary checkpoint `5ebad0575f46146eac35737037bf0cd5acdfe781`
introduced one internal, 100-row-bounded mutation. It refused any preflight or
apply shape other than zero evidence fields and five intelligence fields. The
atomic apply scrubbed exactly five fields, and its committed zero-mode replay
then reported zero evidence and zero intelligence query fields across the same
seven retained receipts.

Permanent runtime checkpoint
`fe2ab65d17aff17fd6b052bf8f5437e13aa24f55` removes both optional schema
fields and deletes the temporary mutation. The deployed Dev function
specification retains canonical community-memory search and read functions and
contains no scrub identity. A final independent bounded audit reports zero
evidence rows, seven intelligence receipts, zero stored query fields, five
intelligence nodes, and the same single `legacy_unversioned` node.

No receipt, node, citation, outcome, source trace, user, community, interaction,
resource, lifecycle row, provider, UI behavior, or production target was
deleted or changed. Focused receipt, evidence, cognition-cleanup, and lifecycle
proofs pass, as do Convex and web typechecks, production build, bundle budget,
diff hygiene, and the complete 38-step foundation baseline.

C3.3B closes the final active `legacy_unversioned` evidence decision on the
isolated development deployment. Read-only semantic review proved that the
provisional `promising` node, its sole community-visible source trace, and the
canonical live same-community AI Feed post describe the same claim. The
existing authenticated manager airlock captured the exact current source into
one immutable citation, accepted the expectation-locked version-1 target, and
atomically applied one `attach_evidence` mutation without changing the claim,
status, visibility, trace, or historical receipts.

The complete bounded postcondition scan reports five intelligence nodes, four
archived historical nodes, zero active `legacy_unversioned` nodes, one
`citation_v1` node at version 2, one citation, 11 change requests, 11 mutation
receipts, seven retrieval receipts, and 373 traces. The four archived nodes
remain audit-linked and were not deletion candidates. No code, schema, UI,
scheduler, provider, Vercel, or production state changed. C3 is complete within
the accepted resource/interaction/intelligence cleanup boundary.

C2.3A restarts C2 with proof rather than execution. At that checkpoint, the
policy contract passed against 124 tables, 118 direct user-reference edges, 38
unindexed edges, 26 opaque fields, and seven storage fields; the privacy dossier's stale
125-table statement is corrected. A complete bounded development scan found
zero lifecycle requests, zero lifecycle receipts, zero interaction privacy
purge events, 55 user-authored canonical roots, 21 user-authored replies, seven
DM messages, eight DM participants, and zero attachment-bearing messages.

The existing lifecycle behavioral fixture now includes one representative
preservation target for private identity/session state, encrypted provider
credentials, settled finance, audit evidence, ownership-transfer blockers, a
shared DM with a surviving participant and real stored attachment, canonical
interaction and Resource content, and the canonical
interaction -> trace -> citation -> accepted-memory -> retrieval/outcome ->
compiler-digest chain. Request/preflight interruption and every replay leave
all product rows and the storage object unchanged. This slice adds no runtime
state, lifecycle phase, index, public function, UI, scheduler, provider effect,
anonymization, deletion, or production behavior. The six execution blockers
remain truthful; the next C2 slice must resolve the authored-content privacy
propagation contract before access freeze can safely lead to completion.
Focused lifecycle/evidence proofs, Convex typecheck, diff hygiene, and the full
38-step foundation baseline pass.

C2.3B1 closes the immediate authored-content revocation gap without building a
destructive executor. A complete bounded development read found 55 roots, 24
replies, two ordinary-deleted roots that still retain summaries and content
blocks, eight moderation events, zero privacy-purge events, two live
interaction traces, and zero interaction-derived citations, intelligence
nodes, change requests, mutations, outcomes, or compiler digests. No
development data migration is warranted.

The runtime now resolves every retained evidence trace back to its current
canonical interaction, Resource, AI Feed, or operational trace before exposing
derived content. The rule covers non-compiler and compiler memory nodes,
connected edges, member search/read, manager directory/digest/change-request
projections, compiler handoff, and community-agent filesystem
list/read/search. Revoked manager audit records preserve structural identity
but redact copied payload content; the community agent receives no revoked
artifact and cannot claim its digest. The directory and edge readers no longer
collect an entire community table, and digest projection is capped at the
existing 20-row product window.

The focused behavioral fixture keeps a live root owned by one member and
tombstones a reply owned by another. Before scheduled evidence sync, the
reply, content block, unredacted source trace, citation, accepted node, edge,
digest, and change request still physically exist. Direct evidence, member
memory, manager directory/edges, compiler claim, and community-agent filesystem
reads all fail closed; manager digest/request reads expose only neutral
redaction. This proves containment, not erasure. C2.3B2 must still implement
the separate bounded physical scrub for canonical blocks, attachment storage,
source-trace text, accepted intelligence, digests, and opaque audit payloads.
No schema, lifecycle table, public mutation, UI, provider, staging data, or
production target changes in C2.3B1.

C2.3B2-R0 completes the read-only physical-purge surface reduction at staging
source `9331f446b47285b1b14ddd6d04998e683f0184de`. The exact reply graph now
separates structural shell, direct blocks, attachment/storage effects, embeds,
mentions and broadcasts, agent-provider effects, legacy message copies,
notification outbox copies, source traces, citations, compiler digests,
accepted intelligence, audit receipts, and unrelated other-user state.

The map rejects the earlier assumption that attachment rows were the only
first-slice blocker. Weekly-digest payloads copy reply text without storing a
reply-level source identity; delivered email and model-provider effects may be
externally irreversible; compiler and intelligence references use arrays
without reverse source indexes and may be multi-source; and legacy/opaque
retention remains unresolved. A terminal `privacy_purged` event would therefore
be false if only the reply summary and blocks were scrubbed.

The reduced next C2 code candidate is future-copy prevention: preserve useful
recipient excerpts, but queue only canonical lookup coordinates, hydrate after
send-time authorization, and minimize the local post-send email ledger under
an explicit retention owner.
It adds no lifecycle engine, table, public API, UI, account freeze, or purge
executor. It remains unauthorized while the production-compatibility contract
keeps implementation behind requirement reconciliation. PC2A is now complete
and PC2B is next. This read-only map changed no code, schema, data, provider,
deployment, or production target.

PC2A then closes the six explicit requirement decisions that blocked deeper
compatibility work. Staging deployment machinery and permanent temporary
cleanup code are excluded from the production port; frozen audit machinery is
reduced to compact durable contracts and receipts; the unowned generic account
lifecycle substrate is parked rather than expanded; Builder Partner remains
secondary, prospective 4% community-revenue-only, and last; the weekly digest
retains its return-loop job and current excerpts while legacy readers and
durable content copies are deleted; and current production-only CRIS theme,
community-event, chrome, and embed behavior is a preservation constraint.

PC2A changes no runtime state and does not authorize deletion of the parked
staging substrate, the future email-copy reduction, a production data query, or
an integration candidate.

PC2B closes PC2 with one final matrix covering every P01-P27 and M01 job.
Three safety outcomes are backend-first candidates; 11 stateful authority or
migration outcomes require expand/migrate/contract; four outcomes require
rework; nine staged requirements are dropped from the production port; and
current production-only UI behavior remains already present and protected.
Every data uncertainty is routed to PC4 rather than represented as product
indecision, and every protected-core boundary remains explicit.

The next overall slice is PC3A: read-only source, public-contract,
cached-client, rollback, and UX-failure compatibility for the independent
account- and community-deletion quarantines. PC2B changed no code, schema, data,
query, provider, deployment, or production target and does not authorize either
quarantine release.

PC3A is now complete. It refreshed current production truth to
`1a71a459e5f7b2099fa85861680642b4d7c71cc4`, while staging remains
`9331f446b47285b1b14ddd6d04998e683f0184de`. The three production commits
added after PC0 affect only current UI styles and frontend contract proofs and
extend M01; neither destructive lifecycle contract changed.

Both quarantines remain independent `PORT BACKEND-FIRST` outcomes. Their
staging implementations preserve the exact public Convex names and validators,
retain verified identity and community-owner checks, then return deterministic
zero-effect errors. That shape safely contains already-loaded clients only when
the backend leads. UI contraction alone is insufficient, and rollback to either
destructive production executor is forbidden. Future candidates must be
semantic rebuilds from then-current `origin/main`, not a merge of the staging
branch. PC3 is in progress; PC3B is next and will read-only map P27
revoked-evidence containment. PC3A changed no product code, schema, data, query,
provider, integration, deployment, or production target.

PC3B is now complete. P27 revoked-evidence containment remains a required
backend-first security floor. Production already contains the canonical
evidence-resolution primitives and schema needed for the outcome, and the
existing public/internal function names, validators, gateway schemas, and
cached-client response shapes can remain stable while revoked derived content
contracts to omission or existing fail-closed results.

The staging implementation is evidence, not a port candidate. It bundles
unrelated compiler/directory result-cap contractions, resolves lineage with
per-row bounds but no request-wide deduplication or aggregate budget, and
renamed a helper without repairing the consumption-parity proof. The foundation
baseline remains green because it does not run that stale proof. A future
candidate must therefore be a small semantic rebuild from then-current
`origin/main`: one request-scoped memoized resolver, unchanged public caps and
shapes, the four required runtime consumers, and repaired parity plus behavioral
containment proofs. No schema migration is required, and rollback to
read-through behavior is forbidden because it would re-expose physically
retained content. PC3C is next and will read-only map P05 auth/session
compatibility. PC3B changed no product code, schema, data, query, provider,
integration, deployment, or production target.

PC3C is now complete. P05 remains irreducible auth/session core, and the staged
hashed, stable, absolutely expiring session state is directionally correct.
Its migration is not safe to port unchanged: production can accept an ancestor
replacement-chain cookie when a previous rotation committed but its response
was lost, while the staged migration deletes those predecessor rows. One
surviving leaf-session browser does not prove that cached-client case.

The future P05 candidate must therefore be a semantic rebuild using
`EXPAND-MIGRATE-OBSERVE-CONTRACT`: retain legacy credential/index state, add a
temporary hash-first/legacy-fallback reader that converges cookies to the
canonical leaf, deploy the backend before the web, observe zero fallback use
for at least the maximum historical cookie lifetime, then contract. Duplicate
subject and session-hash state must fail closed. Routine successful-bootstrap
diagnostics, email/full-scan relinking, the public manual prune path, and stale
auth architecture doctrine should be deleted rather than ported. PC3D is next
and will read-only map P06 membership/community-access compatibility. PC3C
changed no product code, schema, data, query, provider, configuration,
integration, deployment, session, or production target.

PC3D is now complete. P06 remains irreducible membership/community-access
core: ownership comes only from `communities.ownerId`; a non-owner relationship
has one community/user row; only explicit active, unrevoked state can grant
membership; and member count means owner plus active non-owner rows.

The staged result is not a production port candidate. Production membership
shape is unknown, the temporary staging migrations are gone, routine count
transitions and directory/stat/mention reads still scan whole communities, the
browser performs a redundant count-repair mutation after successful backend
work, an unused legacy admin roster/count API family remains beside the real
directory, and the operator-dashboard proof still requires the correctly
deleted active-flag backfill.

The future P06 candidate must use `EXPAND-MIGRATE-OBSERVE-CONTRACT`: prevent new
owner/duplicate state while fields remain optional; run bounded production
evidence; normalize explicit state, duplicate dependencies, counts, and owner
residues; require zero-work receipts; then contract. After convergence, member
count can use an `O(1)` transactional delta and stable indexed reads without a
queue or repair engine. PC3E is next for P07 account-tier/entitlement
compatibility. PC3D changed no product code, schema, data, query, provider,
configuration, integration, deployment, membership, access, or production
state.

C2.3B2-E completes the staging-only email-copy contraction after explicit
requirement correction. Weekly digest, mention, and DM emails keep short
current canonical excerpts, but their outbox rows now contain only bounded
lookup coordinates. Immediately before send, the runtime resolves the current
verified recipient, rechecks preferences and source access, rereads current
canonical content, and suppresses stale, deleted, muted, present, read, or
unauthorized jobs. DM and community links use the configured public app URL,
which is `https://polynet-staging.vercel.app` in development.

Terminal outbox rows now remove payload and recipient email immediately.
Suppressed jobs never persist either field. Provider webhook storage retains
only the provider event id, provider message id, normalized type, and
timestamps; complete provider payloads are deleted and retry delivery is
idempotent. Minimal terminal and delivery receipts expire after 90 days. The
bounded expand/migrate/contract run on `dev:quick-porcupine-949` scanned 129
outbox rows and zero delivery rows, minimized all 129 outbox rows, deleted zero
duplicates, and produced zero work on an immediate replay. The contracted
read-only audit then reported 129 minimized rows, zero payload fields, zero
recipient-email fields, and zero pending/sending rows.

The temporary migration function is deleted. Focused behavioral tests prove
terminal minimization, suppression without copied data, webhook replay
idempotency, current weekly excerpts, mention and DM preview hydration, staging
URLs, and fail-closed access revocation. The canonical foundation baseline now
contains 40 steps. No public API, UI, user setting, generic workflow engine,
content-lineage table, production query, production data, or production
deployment changed.

Account lifecycle policy v8 records the corresponding schema contraction:
`emailDeliveries` no longer owns an opaque provider payload. The current
contract covers 124 tables, 118 direct user-reference edges, 38 unindexed
edges, 25 opaque fields, and seven storage fields.

### C6 current receipt — locally proved

C6 semantic behavior is live on staging through `12b23889`. The implementation
chain from `b12736e7` through `12b23889` provides `polynet_list`,
`polynet_read`, `/community.md`, `/self.md`, `/members/`, `/resources/`, stable
resource refs, exact stable reads, cursorable traversal, deterministic
Markdown, fail-closed authorization, native member-agent execution, and
official MCP execution. It adds no semantic Markdown store, generic mount
registry, search/write/call primitive, repository UI, shell bridge, or new
canonical authority.

On 2026-07-26, an explicitly authorized disposable staging category and page
proved the positive resource journey that had previously been missing. Native
and official-MCP listing returned the same category path and stable resource
ref. Native exact read returned the full 104-character body. Official MCP
returned a truthful 80-character first window and a 24-character continuation.
Cross-community stable refs failed closed, traversal input was rejected, and
audited reads produced both `member_agent_dock` and `external_mcp` evidence
receipts. Moving the category to draft immediately made the stable read
unavailable. The page and category were then deleted through the normal UI;
`/resources/` returned empty and the stable ref remained unavailable.

The live gate also found one declaration defect: native `polynet_read`
normalization and dispatch already supported bounded `offset` and `limit`, but
its published schema did not. The convergence candidate exposes those
arguments and retires exactly three duplicate native tools:
`community_resources_map`, `community_resources_list`, and
`community_resource_read`.

Commit `90badc0b` is the isolated convergence candidate: 24 files, 97
insertions, 442 deletions. It preserves `community_resources_search`,
`community_resources_read`, every builder tool, every external
`polynet_workspace_resources_*` compatibility tool, historical timeline and
context-receipt decoding, and the `community_resource_read` evidence-capability
literal. Focused semantic, traversal, resource, evidence, prompt, policy,
runtime, native/MCP, typecheck, staging-identity, and staging-proof contracts
pass, as does the 40-step foundation baseline.

C6 reached `LIVE_PROVED` and milestone `COMPLETE` on staging on 2026-07-26:

- all local, proof, and remote staging authority guards passed on clean
  `482d5d20`;
- Convex staging `dev:quick-porcupine-949` was deployed first from that exact
  commit;
- the staging branch was then pushed and the canonical
  `polynet-staging.vercel.app/version.json` marker matched full SHA
  `482d5d2072e281c9be813c11fe940609c1e5b560`;
- signed-in native run
  `member_agent_dock:f7151499-05cc-4a8d-837a-ef84fc8434b4` successfully listed
  `/`, read `/community.md`, and listed the clean empty `/resources/`;
- the persisted native tool policy exposed `polynet_list`, `polynet_read`,
  `community_resources_read`, and `community_resources_search`, with none of
  `community_resources_map`, `community_resources_list`, or
  `community_resource_read`;
- official MCP OAuth, metadata, tool discovery, root list, community read, and
  resource list passed against the canonical staging endpoint;
- official MCP rejected `../etc/passwd`, and the deleted fixture's stable ref
  remained unavailable when called with `offset: 0` and `limit: 80`.

No new fixture was created for the release proof. No staging data residue,
production query, production data, production configuration, or production
deployment changed. That receipt did not itself authorize C7; the first
bounded C7 slice was authorized separately and is recorded below.

### C7.1A current receipt — unreachable Workspace host deletion

The first C7 slice deletes the 2,625-line `WebWorkspaceHost.tsx` product host.
It had no mounted first-party presentation path: ordinary legacy Workspace
URLs already enter the auth-aware redirect/holding flow, and
`WebAppMainSurfaceHost.tsx` neither imports nor mounts a Workspace branch.
`App.tsx` retained only a type-only edge, which now uses a local structural
type while the remaining legacy controller caller graph is audited in a later
slice.

Two proofs that existed only for the deleted presentation are retired:
Workspace composer focus policy and Daytona preview-card deduplication. Mixed
runtime, prompt, preview, and Builder Partner proofs no longer treat the dead
host as an authority. The Workspace quarantine contract now asserts that the
host itself remains absent.

This slice deliberately preserves all Workspace/runtime schemas, data,
projects, threads/messages, harness policies, workers, terminals, previews,
provider isolation, billing/entitlement owners, official MCP compatibility,
community resources/memory, route compatibility, and child presentation
components. It changes no Convex code or schema, staging data, environment
configuration, production state, or release workflow.

Source evidence: focused Workspace quarantine, member destination, global
Settings, account-lifecycle retirement, harness isolation, Builder Partner,
platform prompt, runtime-preview, and Daytona preview-security contracts;
web/Convex typechecks; production web build and bundle budget; the canonical
foundation baseline; and staging authority guards. Live evidence is limited to
the exact Git-driven staging marker and anonymous non-mutating canary because
the deleted host was already unreachable and the slice has no cloud-data or
schema effect.

### C7.1B current receipt — outbound Workspace navigation deletion

The second C7 slice removes Workspace from the browser's representable
navigation state. `AppPage` no longer includes `workspace`; the three shared
Workspace route builders, draft-project URL query state, and
`useWebWorkspaceRouteController.ts` are deleted. App route reconciliation,
history snapshots, shell projection, path canonicalization, project creation,
thread adoption, and member-agent context can no longer produce or branch on a
Workspace destination.

Inbound compatibility remains intentionally asymmetric. `/workspace*` URLs are
still classified while the browser holds a neutral landing state; authenticated
requests resolve through the server-authoritative member destination, signed-out
community requests resolve to the public funnel, and old launch-setup URLs
restore under community Settings. No retained browser module generates a
Workspace URL.

Thread/project persistence and execution remain independent of navigation.
Selecting or creating a thread adopts its community, project, and active-thread
state without changing the page or URL. The runtime core retains thread mutation,
provider, billing, harness, worker, MCP, project, and evidence owners, but no
longer owns a route controller. Project creation no longer auto-opens a deleted
destination.

The obsolete draft-project route proof is retired. The Workspace quarantine
contract now owns both halves of the boundary: outbound producer absence and
inbound redirect compatibility. C7 remains `IN_PROGRESS`: Workspace-named child
presentation/controller/style clusters still require caller classification
before deletion, and protected runtime/harness/community memory substrate remains
out of scope.

### C7.1C current receipt — Workspace right-panel/files authority deletion

The third C7 slice deletes the unreachable Workspace right-panel and files
presentation. `WebWorkspaceRightPanel.tsx`, `WebWorkspaceUserDataPanel.tsx`,
their panel controller/data/model modules, and the browser-only
`workspaceInspectorGateway.ts` adapter had no mounted first-party caller after
C7.1A-B. `App.tsx` no longer initializes dormant right-panel layout state or
manual project-computer start/stop callbacks.

Presentation authority now follows mounted owners. Operator diagnostics are
proved through `WebOperatorDashboardHost.tsx`,
`useOperatorDashboardData.ts`, and the four live operator views. Billing is
proved through global Billing Settings. At this checkpoint, project-storage
failures still routed through `useWebProjectUiController.ts`; C7.1E later
deleted that zero-caller browser path. Runtime paid-usage failures remain owned
by `useWebTurnRunnerController.ts`. Backend inspector traversal, cache
invalidation, provider accounting, and failure-detail contracts remain intact;
only their deleted browser files-panel adapter and UI retry/rendering assertions
are retired.

CSS owned exclusively by the deleted right panel, summary/community preview,
and files/code preview is removed. The similarly named app-preview styles remain
because `DaytonaRuntimeAppPreview.tsx` owns their dormant protected presentation
contract, although C7.1D later confirmed that component is not mounted. The live
`workspaceRightPanelOperatorShared.ts` module is also retained despite its stale
name because the operator views still import it.

This slice changes no Convex function, schema, project/thread data, runtime
executor, harness policy, provider lease, billing authority, MCP compatibility,
community resource/memory owner, environment configuration, or production
state. C7 remained `IN_PROGRESS` pending the separately proved legacy preview,
thread-browser, and message-presentation deletion recorded below, followed by a
distinct project-modal/deeper App orchestration audit.

### C7.1D current receipt — Workspace leaf presentation deletion

The fourth C7 slice deletes the unmounted Workspace preview, thread-browser,
and conversation presentation closure. Eleven zero-caller files are removed:
the legacy terminal preview; sidebar state host, renderer, and contracts;
stored-message, streaming-message, and error renderers plus their view types;
the Workspace auto-scroll hook; the runtime web-source wrapper; and the shared
message footer/actions wrapper. Shared selectors and runtime/message projection
modules no longer export helpers used only by those deleted leaves.

The browser authority remains the mounted member-agent dock. Its live timeline
now owns the sequenced-assistant-text duplicate guard, streamed-text fallback,
and thinking-footer coordination. Structured runtime failures continue through
the turn runner into the mounted global inference modal and Billing route;
model-written prose and retired message metadata do not manufacture upgrade UI.
Project identity remains in retained runtime project/thread selection state,
not in an abandoned folder browser. Backend terminal preview probing, reuse,
transport, and observation remain intact without the legacy preview card.

Exclusive CSS for expanded legacy previews, thread search/folders, Workspace
message wrappers, premium CTA, copy/footer actions, and mobile thread-browser
overrides is removed. Shared markdown, attachments, community citations,
runtime timeline, background terminals, and the common app-preview styles
remain.

`DaytonaRuntimeAppPreview.tsx`, `RuntimeComputerUseViewer.tsx`, and the later
identified `WebBackgroundTerminalRail.tsx` are explicitly retained but are not
mounted. They are protected harness-adjacent presentation candidates requiring
a separate human mount-or-delete decision; none is counted as a live MVP
journey or as acceptance evidence for this slice.

The Workspace quarantine contract requires the deleted source and exclusive
styles to remain absent while requiring all three protected dormant viewers to
remain present until that decision. Mixed UI/runtime/prompt proofs now follow
mounted or canonical owners rather than deleted components.

This slice changes no Convex function or schema, project/thread/message data,
runtime executor, harness policy, provider lease, preview transport, billing
authority, official MCP compatibility, community resource/memory owner,
environment configuration, or production state. C7 remained `IN_PROGRESS`
pending the project-modal/deeper `App.tsx` audit recorded below, with the
dormant harness presentation decision kept separate.

### C7.1E current receipt — project-modal and browser-adapter deletion

The fifth C7 slice removes the zero-caller project create/edit/delete
presentation closure. The create and delete modals, their permanently closed
global modal host, and `useWebProjectUiController.ts` are deleted. `App.tsx`
and the global overlay boundary no longer initialize, project, or pass this
state. Modal-only CSS and the UI-only project-link text parser/formatter are
also deleted.

The browser project gateway is reduced to the one retained read projection:
authenticated project listing and mapping for runtime selection. Its default
creation, create, update, delete, and ZIP-import commands are removed. The
Convex project functions, schema, persistence, context normalization, runtime
context loading, project/thread selection, provider volumes, and protected
harness execution remain unchanged. Browser absence is not a claim that the
backend project substrate is obsolete.

The same caller audit removes the Workspace-only browser card-setup/status
bridge and its `App.tsx` return-refresh/error state. Canonical Premium checkout
and Connect onboarding remain in the account gateway. Stripe customer,
setup-intent, webhook reconciliation, card-truth, resource-admission, usage
classification, and runtime billing owners remain intact. This is a
presentation/adapter deletion, not a billing-authority deletion.

Two additional zero-caller shared helpers,
`threadPanelController.ts` and `workspaceSandboxStatus.ts`, are deleted. The
quarantine contract now requires all retired project/browser files, commands,
and styles to remain absent. Project-context and resource-admission contracts
prove the retained database/runtime/billing boundary rather than requiring a
deleted browser editor.

No Convex function or schema, staging data, project/thread/message record,
provider lease, runtime executor, harness policy, official MCP contract,
community resource/memory owner, environment configuration, or production
state changes in this slice. C7 remains `IN_PROGRESS`: remaining
Workspace-named browser/controller state requires a fresh caller-by-caller
audit, while `DaytonaRuntimeAppPreview.tsx`,
`RuntimeComputerUseViewer.tsx`, and `WebBackgroundTerminalRail.tsx` remain
separate protected mount-or-delete decisions.

### C7.1F current receipt — browser project-selection projection deletion

The sixth C7 slice removes the browser project-list and draft-selection
projection left behind by the deleted Workspace destination. The zero-caller
project-state controller, its read-only browser gateway, the project/thread
selectors, the model/surface wrappers, and their reset-only lifecycle module
are deleted. The obsolete active-project coherence proof is retired rather
than forcing presentation-only state to survive for its test.

Browser project identity now comes directly from the active canonical thread's
stored `project_id`. That value feeds retained thread-mutation instrumentation
and Sentry/PostHog context without a second project array, default-project
fallback, project-name map, route-driven project reset, or thread-adoption
copy. The transitional Workspace-named thread-mutation wrapper accepts only
that nullable identity; it no longer owns or returns a browser project
controller.

Sign-out safety is relocated rather than deleted. Both session-loss paths pass
the same agent-thread reset into `resetWebSessionStateAfterSignOut`, which
clears composer, hydration, thread/message, error, sending, streaming, and
runtime-event projections before awaiting browser sign-out work. The account
lifecycle contract proves that boundary while the member-agent dock remains
independent and owns its live turn state.

Project-context and resource-truth proofs now follow the retained Convex
schema/functions and runtime context loader instead of a deleted browser
listing adapter. The quarantine contract requires all seven retired projection
modules to remain absent while continuing to require
`DaytonaRuntimeAppPreview.tsx`, `RuntimeComputerUseViewer.tsx`, and
`WebBackgroundTerminalRail.tsx` to remain present for their separate protected
mount-or-delete decision.

No Convex function or schema, staging data, project/thread/message record,
provider lease, runtime executor, harness policy, official MCP contract,
community resource/memory owner, environment configuration, or production
state changes in this slice. C7 remains `IN_PROGRESS`: the presentationless
legacy App conversation/runtime orchestration and residual styles require
separate slices, and the three protected dormant viewers remain a human
decision.

### C7.1G current receipt — presentationless App conversation authority deletion

The seventh C7 slice removes the legacy conversation/runtime authority that
remained initialized in `App.tsx` after its Workspace presentation was gone.
The app shell no longer owns an active thread, thread/message hydration,
composer, guest conversation cache, send flow, runtime-run hydration, model
registry, inference/message-context overlays, project selection, or duplicate
community-agent landing fetch. Nineteen legacy source paths are retired,
including the zero-caller browser send/core/thread closure, four App
controllers, three global overlays, model/thread projection helpers, and the
obsolete landing lifecycle; two mixed live controllers are narrowed and
renamed around agent-data export and app-toast ownership. `App.tsx` falls from
roughly 10.8k to 9,267 lines.

Live authority is explicit. `WebMemberAgentDock.tsx` owns the member's channel,
messages, send/stop/retry state, live runtime events, inline structured
inference errors, and session/surface-scoped reset. The shared turn runner
remains the runtime transport/persistence boundary. Settings owns authenticated
thread/message/memory export through the renamed agent-data export controller;
the app toast has one small controller; voice accepts only community, direct
message, and member-agent surfaces. Canonical account/community sign-out reset
remains centralized while the mounted dock clears its own conversation state
when session identity changes.

Proof authority moves with the code instead of preserving the deleted island.
Runtime, resource-builder, paid-usage, privacy, account-lifecycle, platform
prompt, harness-isolation, community-gateway, UI-stability, global Settings,
and quarantine contracts now follow the mounted dock, shared turn runner,
Settings controllers, or backend owners. The quarantine proof requires every
retired path and overlay branch to remain absent while continuing to require
`DaytonaRuntimeAppPreview.tsx`, `RuntimeComputerUseViewer.tsx`, and
`WebBackgroundTerminalRail.tsx`.

The focused C7 quarantine, account-lifecycle, member-agent, UI-stability,
resource-admission, resource-builder, platform-prompt, runtime, harness,
privacy, community-gateway, Daytona-preview, personal-memory, and global
Settings proofs pass. Web and Convex typechecks, strict unused-symbol
typechecking, the production web build, `git diff --check`, and the 40-step
foundation baseline also pass.

This slice changes no Convex function or schema, cloud record, runtime worker,
provider lease, billing/entitlement authority, official MCP contract, community
resource/memory owner, environment configuration, or production state. C7
remains `IN_PROGRESS`: residual Workspace-exclusive CSS requires a separate
owner audit, repository docs/configuration still need final alignment, and the
three protected dormant viewers remain an explicit human mount-or-delete
decision.

### C7.1H current receipt — deleted-host stylesheet residue

The eighth C7 slice removes presentation whose only renderer was deleted in
C7.1A-G. The owner audit follows actual TSX emitters rather than Workspace
wording: legacy message-list and empty-thread landing rules, the Workspace
scroll control, runtime-engine picker, landing composer variants, inference and
preview-auth modals, message-context-only memory rules, and Workspace-only
attachment selector arms are gone from both web stylesheets. Shared community
attachment/drop styling, generic mounted `.workspace` and `.workspace-body`
layout, auth bootstrap composition, shared skeleton primitives, Billing error
presentation, Resources, and member-agent presentation remain.

The selector rewrite preserves negative-selector semantics. The live
`.workspace:not(.scroll-to-bottom)` rule becomes `.workspace` rather than being
deleted, and mounted mobile AskBar rules lose only their impossible legacy
landing exclusions. Mixed attachment/drop rules lose only their Workspace arm.
The stylesheets shrink by a net 1,180 lines: `base.css` falls from 32,252 to
31,273 lines and `index.css` from 3,296 to 3,095.

Proof authority is corrected with the deletion. The quarantine contract rejects
every retired selector family, positively requires the live community
attachment and main-surface rules, and locks the protected viewer style roots.
The avatar contract follows the mounted mobile topbar rather than the retired
trigger name and no longer preserves empty-thread avatar CSS. The mobile-root
contract follows the current fail-closed mobile restoration guard without
requiring the already-deleted projection feature flag.

The focused quarantine, avatar, mobile navigation, community interaction,
member-agent, UI-stability, runtime timeline, and Daytona preview-security
proofs pass. CSS parsing, web typecheck, the production web build, bundle
budget, `git diff --check`, and the 40-step foundation baseline also pass.

This slice changes no TSX renderer, Convex function or schema, cloud record,
runtime worker, provider lease, billing/entitlement authority, official MCP
contract, community resource/memory owner, environment configuration, or
production state. C7 remains `IN_PROGRESS`: pre-existing ownerless stylesheet
clusters require a separate caller-led audit, repository docs/configuration
still need final alignment, and `DaytonaRuntimeAppPreview.tsx`,
`RuntimeComputerUseViewer.tsx`, and `WebBackgroundTerminalRail.tsx` remain an
explicit protected mount-or-delete decision.

### C7.2A current receipt — pre-ConversionLanding stylesheet deletion

The first caller-led ownerless-style slice removes the superseded public
landing family from `base.css`. `WebLandingPage.tsx` has one mounted owner:
`ConversionLanding` and its dedicated `ConversionLanding.css`. No TSX renderer
emits a `.polynet-landing-*` class. The audited residue contained 126 distinct
legacy selectors across 345 rules plus 20 exclusively referenced keyframes.
The rewrite deletes 343 pure legacy rules and all 20 keyframes, removes only the
three legacy arms from the one mixed mobile rule, and preserves its two live
`.polynet-onboarding-*` arms.

One visual declaration block was not dead: account setup and community launch
both used `.polynet-landing-kicker`. Those two emitters and the shared rule now
use the neutral `.setup-section-kicker` owner. The quarantine proof positively
requires the mounted ConversionLanding import/root, the two setup emitters, the
mobile onboarding arms, and the protected viewer style roots; it rejects the
entire retired selector family and its 20 keyframes.

`base.css` falls from 31,273 to 28,497 lines, a net deletion of 2,776 lines.
The anonymous desktop and canonical 390-by-844 `/m` staging baselines render
the mounted ConversionLanding without console warnings/errors, and the mobile
document has no horizontal overflow. Focused contracts, CSS parsing, web
typecheck/build/bundle gates, and the 40-step foundation baseline pass locally;
exact-build staging visual regression is the final release proof for this
slice.

This slice changes no landing renderer, route, Convex function or schema, cloud
record, runtime worker, protected harness viewer, provider lease,
billing/entitlement authority, official MCP contract, community
resource/memory owner, environment configuration, production state, or
`origin/main`. C7 remains `IN_PROGRESS`: additional ownerless stylesheet
cohorts, repository docs/configuration alignment, and the three protected
viewer decisions remain.

### C7.2B current receipt — auxiliary ownerless stylesheet deletion

The second caller-led ownerless-style slice removes four presentation families
with no current source renderer: the reverted auth-bootstrap
`.web-thread-loading-*` shell; the deleted empty-thread `.web-starter-*` and
`.web-download-*` surfaces; and the orphaned `.session-resume*` block. Exact
source-corpus search finds none of the four stems outside the two stylesheets,
and all 80 removed rules are pure owner rules with no live selector arm or
exclusive keyframe.

The rewrite deletes 212 lines from `base.css` and 330 lines from `index.css`.
The download-only mobile media wrapper is removed with its final two rules; the
mixed 720-pixel media block loses only the retired loading arms and preserves
the live guest-signup and auth-bootstrap composer rules. Shared
`.web-skeleton-block`, `.web-skeleton-pill`, `.web-skeleton-row`, and
`webShimmer` definitions remain in both stylesheets because mounted funnels,
community chat, resources, feeds, and auth bootstrap still emit those generic
primitives. Protected viewer style roots remain unchanged.

The Workspace quarantine contract now rejects both CSS and source emitters for
all four retired stems while positively requiring the generic skeleton
primitives, shared animation, a mounted source emitter, and the protected
viewer roots. Focused auth-bootstrap, avatar, UI-stability, community
interaction, mobile-root, member-agent, quarantine, and CSS-parse proofs pass.
Web typecheck, production build, bundle budget, and the 40-step foundation
baseline also pass locally. Exact-build staging visual regression remains the
release proof for this source state.

This slice changes no TSX renderer, route, Convex function or schema, cloud
record, runtime worker, protected harness viewer, provider lease,
billing/entitlement authority, official MCP contract, community
resource/memory owner, environment configuration, production state, or
`origin/main`. C7 remains `IN_PROGRESS`: any further lexical CSS candidate
requires fresh caller-led ownership proof, repository docs/configuration still
need final alignment, and the three protected viewer presentations remain an
explicit human mount-or-delete decision.

### C7.3A current receipt — background-terminal presentation closure

The first protected-viewer decision deletes the unmounted background-terminal
rail, its zero-caller browser gateway, and their exclusively owned
`.workspace-rail-card*` and `.background-terminal*` styles. The slice removes
two source files and 290 stylesheet lines; no mounted renderer or browser
caller remains.

This is a presentation closure, not a terminal-capability deletion.
`workspaceTerminals.ts`, `workspaceTerminalProcessCore.ts`, the Codex worker
terminal bridge, persisted terminal sessions and events, preview probing and
classification, the access-gated preview proxy, provider lease/accounting
logic, paid-usage admission, and agent terminal tools remain. Runtime preview
proofs now follow those backend owners directly. Resource-admission proof
continues to lock the centralized billable Blaxel wake path without requiring
a deleted browser normalizer.

The Workspace quarantine contract now requires both deleted files and both
style stems to remain absent while continuing to protect the unmounted Daytona
app preview and computer-use viewer for their own decisions. CSS parsing,
focused runtime/resource/quarantine proofs, typechecks, production build,
bundle budget, and the foundation baseline are the local release gate; the
exact-build staging canary is the final release proof for this source state.

This slice changes no Convex function behavior or schema, cloud record, staging
data, runtime executor, harness policy, provider lease, billing/entitlement
authority, official MCP contract, community resource/memory owner, environment
configuration, production state, or `origin/main`. C7 remains `IN_PROGRESS`:
Daytona preview and computer-use presentation decisions, docs/configuration
alignment, and the final dependency interlock remain.

### C7.3B current receipt — computer-use presentation closure

The second protected-viewer decision deletes the unmounted computer-use viewer,
its dedicated event projection, browser-only live-session and screenshot
adapters, live-desktop URL builders, isolated `.runtime-computer-viewer*`
styles, and the browser environment variable that configured its websocket
proxy. No mounted renderer or first-party browser caller used this closure.

This is a presentation closure, not a computer-tool deletion. The mounted
member-agent runtime timeline continues to render sequenced
`computer_open_url` and `computer_screenshot` activity. The authenticated
Convex screenshot action, provider-side Daytona screenshot/open-url bridge,
stored runtime event evidence, model-visible image observation, worker tool
policy, runtime targets, provider lease/accounting, and protected coding
harness remain unchanged.

Runtime timeline proofs now cover the mounted trace projection without
requiring a second screenshot-card projection. The Daytona screenshot bridge
proof follows the authenticated Convex action and provider/runtime owners
without manufacturing a zero-caller browser adapter. The Workspace quarantine
contract requires the viewer, projection, browser adapters, live-desktop URL
builders, environment variable, and styles to remain absent while continuing
to protect the unmounted Daytona app preview for its separate decision.

This slice changes no Convex function behavior or schema, cloud record, staging
data, runtime executor, harness policy, provider lease, billing/entitlement
authority, official MCP contract, community resource/memory owner, production
state, or `origin/main`. C7 remains `IN_PROGRESS`: the Daytona app-preview
presentation decision, docs/configuration alignment, and final dependency
interlock remain.

### C7.3C current receipt — Daytona app-preview presentation closure

The third protected-viewer decision deletes the dormant human app-preview
plane end to end. The unmounted Daytona preview card, browser frame-URL
builder, browser preview-session types and adapters, two public card-only
Convex actions, the internal UI URL-minting resolver, dedicated CSS, browser
origin/direct-transport configuration, and worker provider-URL hint chain are
gone. No mounted renderer or first-party browser caller used this closure.

This is a presentation and transport deletion, not an app-execution deletion.
`workspace_serve`, `terminal_start`, `terminal_stop`, `computer_open_url`, and
`computer_screenshot` remain. The runtime still starts an app server, binds its
port to the target lease, emits `workspace_preview_ready` and
`workspace_preview_stopped` as operational lifecycle evidence, and stops or
sweeps the process through `stopDaytonaAppPreviewInternal`. Runtime targets,
active-port accounting, retention/teardown state, the internal run/port
evidence query, and stored events remain intact. The coding and community
harnesses, compiler, resources/memory systems, provider/runtime core, billing,
entitlements, and official MCP remain outside the deletion boundary.

Runtime guidance now states the truth: the agent may inspect a workspace app
through bound computer tools, but no human inline preview panel exists and no
raw provider URL is returned or advertised. The generic access-gated preview
proxy and signing-token implementation remain because
`workspaceTerminalProcessCore.ts` still mints proxy sessions for retained
non-Daytona consumers. Its security proof is renamed around that generic owner
and now rejects any resurrection of the deleted Daytona browser transport
while positively locking proxy signing, diagnostic headers, runtime app-server
lifecycle, target accounting, and agent-side visual inspection.

This slice changes the public Convex surface by deleting two zero-caller
preview-card actions and changes the worker tool response/guidance by removing
human-preview URL claims. It changes no Convex schema, cloud record, staging
data, persisted target row, provider lease semantics, billing/entitlement
authority, official MCP contract, community resource/memory owner, production
state, or `origin/main`. C7 remains `IN_PROGRESS`: repository
docs/configuration alignment and the final dependency/package ownership
interlock remain before C7 can close.

### C7.4A current receipt — public product-truth correction

The first documentation/configuration slice removes the obsolete standalone
Workspace destination from the public and LLM-ingestible product truth. The
`product.workspace` primitive and `product.guide.workspace` member guide,
their source Markdown files, manifest entries, ingestion paths, related-slug
edges, and generated search/LLM projections are deleted.

The retained product model now follows the mounted authority. The bottom-right
member agent remains one member-owned conversation surface across Polynet.
Authorized community pages provide server-validated context for subsequent
turns; Discover and generic platform pages carry no community lens. Product
guides no longer instruct members to open Workspace, navigate thread URLs, or
manually select a Workspace lens. The retained `thread` primitive is
`internal-only`: it documents durable conversation persistence, context
receipts, and audit evidence without representing a user-facing destination.
Project-bound workspace tools, runtime/project context, threads/messages,
legacy inbound route migration, coding/community harnesses, compiler, and
community resources/memory remain protected substrate.

`product_docs_index_proof.ts` now locks the two retired slugs and sources out of
the generated corpus, rejects related links to them, and rejects the stale
destination claims. The generated index and both `llms` artifacts were rebuilt
from 31 retained manifest documents. Product-doc index/search, runtime docs
tools, member-agent dock, member-entry destination, and Workspace quarantine
proofs pass; `git diff --check` passes.

This slice changes no frontend/runtime behavior, Convex function or schema,
cloud record, staging data, dependency graph, lockfile, environment
configuration, deployment, production state, or `origin/main`. C7 remains
`IN_PROGRESS`: stale repository quickstart/configuration residue, explicit
package/deployment ownership, deployed staging-variable reconciliation, and
the final exact-build staging acceptance remain.

### C7.4B1 current receipt — tracked configuration residue deletion

The first repository-configuration slice deletes the 68-line
`.env.convex.quickstart.example`. Its only invocation was the copy command
inside the file itself: no first-party script, workflow, README, operator
runbook, or current setup guide owned it. The duplicate template mixed a
Daytona-era quickstart, obsolete magic-link and gate guidance, and a
development-key posture with current Convex/AuthKit variables already owned by
the canonical `.env.example` and active auth setup guide.

The tracked `.env.staging.local.example` also no longer advertises
`VITE_WORKSPACE_PREVIEW_ORIGIN`, whose browser reader and human preview surface
were deleted in C7.3C. The canonical root template retains
`ARX_PREVIEW_PROXY_SIGNING_SECRET` under presentation-neutral access-gated
runtime proxy guidance because the generic proxy and non-Daytona token-minting
consumer remain protected.

The Workspace quarantine proof now requires the stale quickstart file and
deleted browser transport names to remain absent across every tracked
environment template and browser setup guide while positively requiring the
retained proxy signing-secret template. Workspace quarantine, generic
preview-proxy security, and auth environment proofs pass; focused repository
search and `git diff --check` pass.

This slice changes no runtime reader, frontend behavior, Convex function or
schema, cloud record, staging data, ignored local `.env.staging.local`,
dependency graph, lockfile, deployed Vercel/Convex/Fly environment,
deployment, production state, or `origin/main`. C7 remains `IN_PROGRESS`:
explicit package/deployment ownership, deployed staging-variable
reconciliation, and final exact-build staging acceptance remain.

### C7.4B2 current receipt — package and deployment ownership closure

The second repository-configuration slice resolves the package-topology
decision without coupling independently installed artifacts. One active
contract now assigns the root manifest/lock to Convex, Vercel API functions,
shared runtime, scripts, tests, and release orchestration; the web
manifest/lock to the independently installed Vite browser artifact; and the
preview-proxy manifest/lock to its standalone Node 22 Fly/Docker artifact.
Root Vercel intentionally installs root and web separately. The proxy
container intentionally copies and installs only its own package pair.

The contract keeps all three graphs and rejects a workspace conversion absent
a deployment redesign. It requires Node 22, lockfile v3, one lock per
manifest, `npm ci` per graph, root/web shared-range parity, low-threshold CI
audits for every graph, and a distinct installed artifact before a fourth
graph may exist. The current root and web graphs share 15 declarations with
identical ranges; the proxy currently overlaps neither graph. The nested web
Vercel file remains route-only and does not create another dependency owner.

`package_deployment_boundary_contract_proof.ts` enforces those invariants
without network access. The root package exposes one command for the proof,
and the canonical dependency-audit job runs it before installing or auditing
the three graphs. The focused proof and preview-proxy package/security checks
pass. All four non-root manifest/lock files and the root lockfile remain
byte-identical to their pre-slice hashes; within C7.4B2, the root manifest
changes only by adding the proof command. `git diff --check` passes.

This slice changes no dependency declaration or resolution, lockfile, runtime
code, frontend behavior, Convex function or schema, cloud record, staging
data, environment configuration, deployment, production state, or
`origin/main`. The contract records rather than fabricates the separate
operational gap that no canonical preview-proxy release runbook was found. C7
remains `IN_PROGRESS` only for deployed staging-variable reconciliation and
final exact-build staging acceptance.

### C7.4C closure receipt — complete on canonical staging

The final C7 slice is a closure and exact-staging-acceptance boundary, not
another deletion or decomposition pass. The accumulated candidate contains
C7.1A-H, C7.2A-B, C7.3A-C, and C7.4A-B2 as one self-contained source state.
Builder Partner primary-flow coupling and Discover Apps/Skills marketplace CSS
were already deleted and proved; their two unmarked Step 8 bullets are now
reconciled as complete rather than reopened.

A redacted names-only inventory compared the five C7-dead configuration names
against current readers and the canonical staging providers. Exactly two stale
staging names remain: `VITE_WORKSPACE_PREVIEW_ORIGIN` in the
`polynet-staging` Vercel project's production target, which is the canonical
non-production staging domain, and
`POLYNET_DAYTONA_APP_PREVIEW_TRANSPORT` in Convex development staging
`dev:quick-porcupine-949`. The other three candidates are absent. The matching
ignored local staging selector was removed. No value was emitted or persisted
in this receipt. Active `ARX_PREVIEW_PROXY_SIGNING_SECRET` and
`POLYNET_PREVIEW_PROXY_SIGNING_SECRET` readers remain protected.

The 40-step foundation baseline, web typecheck, production build, bundle
budget, Workspace quarantine, product-doc index, package/deployment boundary,
preview-proxy package/security, Daytona runtime, computer screenshot bridge,
runtime timeline, runtime diagnostics, staging-identity, staging-guard proof,
remote staging-authority, and `git diff --check` gates pass on the candidate.
The initial release candidate retained all three protected package graphs and
lockfiles. After exact commit `90d4d295899790aa5853858249772d8e1de75549`
reached canonical staging, the low-threshold root audit correctly failed on the
newly published `GHSA-mh99-v99m-4gvg` advisory through
`@blaxel/core -> archiver -> minimatch -> brace-expansion`; the independent
web audit found the same advisory through
`@sentry/vite-plugin -> glob -> minimatch -> brace-expansion`. The smallest
compatible source follow-up keeps `@blaxel/core@0.2.94` and its expected
`archiver@7.0.1` API, updates the root `brace-expansion` override from `2.1.2`
to patched `5.0.8`, adds the same exact override to the independently installed
web graph, and refreshes only those two locks. A rejected `archiver@8.0.0`
candidate was not retained because its ESM-only class export shape breaks
Blaxel's callable default import.

The revised root and web graphs pass fresh clean installs and low-threshold
registry audits with zero vulnerabilities; the unchanged preview-proxy audit
also remains clean. The installed root lineage resolves
`@blaxel/core@0.2.94 -> archiver@7.0.1`, both
`minimatch@9.0.9` and `minimatch@5.1.9` to
`brace-expansion@5.0.8`, and preserves `zip-stream@6.0.1`; the web lineage
resolves `minimatch@10.2.5` to the same patched release. A direct behavioral
smoke exercises the exact directory-to-ZIP operation used by Blaxel; the
Blaxel lifecycle proof, package/deployment-boundary proof, 40-step foundation
baseline, web typecheck, production build, and bundle budget also pass. This
exact lock-and-behavior proof is now part of the canonical Dependency Audit
job.

The accumulated cleanup committed as
`90d4d295899790aa5853858249772d8e1de75549`, deployed Convex-first to
development staging, and reached the canonical staging web origin. The
advisory correction committed as
`4f615485c6d56c75fdcf80199b38f088f089d05e`; the package-boundary portability
correction committed as
`3449fb98fa3efd6836bf26153cf92393dd31713b`. The latter changed only the proof's
module-resolution origin so Linux and macOS both resolve Archiver from the
Blaxel package boundary.

Canonical staging serves `3449fb98fa3efd6836bf26153cf92393dd31713b` as both
build ID and Sentry release. Exact-SHA GitHub run `30272659669` passed the
40-step foundation baseline, Convex cut guard, three clean installs and
low-threshold audits, package/deployment boundary, dependency compatibility
interlock, web typecheck, production build, and bundle budget. Exact-SHA run
`30272659581` passed the controlled-mismatch check and anonymous public-funnel
browser/runtime canary.

A read-only signed-in Chrome journey loaded `/c/polynet/chat` with the
authenticated Polynet community, canonical chat history, and the mounted
`Your Polynet agent` region. It then opened the retained Resources surface,
which exposed two pages and `Polynet · Resources context` to the same personal
agent. No sign-in fallback or Workspace control appeared, and browser
warning/error logs were empty before and after the configuration cleanup.

Only after those exact-build gates passed, the two confirmed zero-reader names
were removed from canonical non-production staging:
`VITE_WORKSPACE_PREVIEW_ORIGIN` from the `polynet-staging` Vercel project's
Production target and `POLYNET_DAYTONA_APP_PREVIEW_TRANSPORT` from Convex
development deployment `quick-porcupine-949`. Repeated names-only inventories
proved both absent. `ARX_PREVIEW_PROXY_SIGNING_SECRET` and
`POLYNET_PREVIEW_PROXY_SIGNING_SECRET` remain present and protected; no value
was read or recorded.

C7 is complete on canonical staging. The browser destination, duplicate
frontend authority, dormant viewers, owner-proved styles, public Workspace
product truth, tracked stale configuration, and deployed staging residue are
closed while the protected runtime/harness, provider, project/thread,
billing, MCP, resource/memory, generic proxy-security, and member-agent
substrates remain. No product row, provider resource, production
configuration, production deployment, `origin/main`, or production surface was
queried or changed. C8 may begin only as a new retained-surface decomposition
plan from this clean staging boundary.

## 11. C8 retained-surface decomposition receipts

### C8.1 source receipt — Global Settings convergence

The first C8 slice reduces Global Settings to six canonical destinations:
Profile, Account, Billing, Polynet MCP, Appearance, and Partners. Platform
Analytics remains an operator-only conditional destination. The duplicate
Agent and Integrations destinations are deleted. Legacy
`/settings/agent` links resolve to Account, while legacy
`/settings/integrations` links resolve to Polynet MCP; neither legacy identity
appears in navigation.

Account now owns the retained personal account concerns: provider and
subscription state, personal-agent name and instructions, authenticated
personal-memory review and mutation, and CSV data export. The external
AI-provider memory importer is deleted rather than rehomed. New personal
memory is always global; legacy stored `workspace`-scoped rows remain readable
as `Legacy context` without exposing their old scope identifier.

Polynet MCP is one focused setup surface. It copies the canonical OAuth setup
packet and describes access as community-scoped. The global connected-app and
personal/platform-skill presentation is deleted, while community app setup,
community skill attachment, runtime app/skill resolution, official MCP wire
compatibility, and protected harness/runtime substrate remain. A stale
hard-coded MCP tool count and the public Premium promise of hosted Workspace
tools are also deleted; generated product documentation is rebuilt from the
corrected source truth.

The staged source candidate removes 2,892 lines and adds 737, including this
receipt and the new focused components. It deletes the 1,069-line global
Integrations component, the 300-line Agent component, the 124-line import
modal, the 130-line importer parser, 311 net lines from `App.tsx`, and 409 net
owner-proved CSS lines. `App.tsx` is reduced from 9,267 to 8,956 lines without
adding a replacement authority.

Focused route/settings, personal-memory, MCP provider, onboarding, app/skill
runtime, community app architecture, billing, operator diagnostics, product
docs, staging-identity, TypeScript, production-build, and bundle-budget proofs
pass on the source candidate. The full 40-step foundation baseline also passes.
No Convex file or schema changes, data migrations, cloud writes, environment
changes, or production actions belong to this slice.

The source candidate committed as
`9aaafeb6e19291a4494d80806ada116c19c4b16a` and reached the canonical
Git-driven staging web origin without a Convex deployment. Exact-SHA GitHub
run `30276892850` passed the foundation baseline, dependency audits, Convex cut
guard, web typecheck, production build, and bundle budget. Exact-SHA run
`30276893218` passed the controlled-mismatch check and anonymous public-funnel
canary. The canonical staging `version.json` then served the source commit as
both build ID and Sentry release.

A read-only signed-in Chrome journey proved that desktop Account retains
provider/account state, personal-agent preferences, personal memory, and data
exports; legacy `/settings/agent` resolves to Account; legacy
`/settings/integrations` resolves to the focused Polynet MCP surface; and the
MCP setup action reports a successful copy. At a 390 by 844 mobile viewport,
the settings index exposes Profile, Account, Billing, Polynet MCP, Appearance,
and Partners, plus conditional Platform Analytics for the operator. The mobile
MCP surface remains legible and community-scoped. Browser warning/error logs
were empty.

C8.1 is complete on canonical staging. C8 remains `IN_PROGRESS`; any further
`App.tsx`, retained CSS, backend, or runtime decomposition is a separately
planned C8 slice. Production, `origin/main`, production configuration, and
production data remain untouched.

### C8.2 source receipt — Personal Account orchestration boundary

The second C8 slice removes Account-local state-machine ownership from
`App.tsx`. One `useWebPersonalAccountSettingsController` now composes the
existing authenticated personal-agent settings, personal-memory read/search
and mutation, and account-data export use cases. It owns their UI state,
sign-out reset, eager agent-settings hydration, Account-route 150-millisecond
memory search, and the account-setup refresh that follows an agent-settings
save. Session-bound setters prevent late read, mutation, or export responses
from repopulating personal state after sign-out.

The cloud authority is unchanged. User memory settings still use the
authenticated `settings` query and mutation, personal-memory reads and writes
still resolve the authenticated user and enforce item ownership, new memory
remains global, legacy workspace-scoped rows remain readable, and exports keep
their existing cloud sources, limits, filenames, and columns. The export
controller is renamed from stale Agent vocabulary to Account vocabulary
without changing its behavior.

`WebSettingsPanels` consumes one typed `personalAccount` boundary instead of a
wide `agent` prop bucket. `App.tsx` no longer imports the personal-memory data
or mutation hooks, the export controller, or the deleted state-only
`useWebPersonalMemoryUiController`. Profile, provider, billing, partner,
onboarding, route, MCP, community, and operator ownership remain outside this
boundary because those concerns are shared across retained MVP journeys.

The source candidate removes 84 net lines from `App.tsx`, 38 net lines from
`WebSettingsPanels.tsx`, and the redundant 32-line state-only controller. A
focused architecture proof locks the new ownership boundary and the retained
auth, global-memory, export, search, reset, and account-setup-refresh
invariants. No Convex file, schema, migration, data write, environment change,
route, copy, style, or production action belongs to this slice.

The source candidate committed as
`27f80a20fdef15e204b0eca7fc34b22ee0be1060` and reached the canonical
Git-driven staging web origin without a Convex deployment. Exact-SHA GitHub
run `30279566351` passed the foundation baseline, dependency audits, Convex cut
guard, web typecheck, production build, and bundle budget. Exact-SHA run
`30279567347` passed the controlled-mismatch check and anonymous public-funnel
canary. The canonical staging `version.json` then served the source commit as
both build ID and Sentry release.

Signed-out staging acceptance proved that Account keeps all four responsibilities
visible while failing closed: provider connection, agent preferences, personal
memory, and exports are disabled until authentication. Signed-in Chrome
acceptance then proved the live Account composition, including a reversible
agent-name save and restoration; a temporary personal-memory
create/search/pin/unpin/delete round trip with zero remaining items; and
Threads, Messages, and Memory CSV export actions returning to ready state.
Browser warning/error logs were empty, and the original agent name was restored.

C8.2 is complete on canonical staging. C8 remains `IN_PROGRESS`; the next
retained-surface decomposition must be planned as a separate slice.
Production, `origin/main`, production configuration, production data, and
Convex remain untouched.

### C8.3 source receipt — Canonical account-setup surface projection

The third C8 slice removes one repeated frontend projection from `App.tsx`.
The onboarding modal, standalone platform bridge, and community funnel bridge
now consume one typed `WebAccountSetupSurfaceModel` with three explicit groups:
identity, inference provider, and submission state. One
`useWebAccountSetupSurfaceController` maps the existing profile and provider
controllers into that model and owns the shared 260-millisecond handle
availability lifecycle, including signed-out reset and stale-response
rejection.

This is a presentation-orchestration boundary, not a new account-setup
authority. Canonical completion still derives from the existing cloud account
setup status. Profile and legal persistence remain in
`saveOnboardingProfile`; final completion remains in `finishOnboarding`;
platform entry still resolves the canonical member destination; and community
entry still revalidates the exact requested community before changing route.
The platform and community bridges therefore share mutable setup state without
sharing or weakening entry authority.

`App.tsx` falls from 8,872 to 8,753 lines and no longer owns handle
availability state, debounce, request cleanup, or three manually repeated
identity/provider/submission prop fans. The retained onboarding and bridge
components keep their existing interaction behavior while replacing their
wide shared prop contracts with one nested model. A focused orchestration
proof locks the single-controller, three-consumer projection and the retained
completion and destination boundaries.

No Convex file, schema, migration, cloud data, environment configuration,
route, copy, style, provider protocol, production action, or `origin/main`
change belongs to this slice.

The source candidate committed as
`d94480ce4b949733c7ea4bec803974f9bf4786c1` and reached the canonical
Git-driven staging web origin without a Convex deployment. Exact-SHA GitHub
run `30282034227` passed the Convex cut guard, three-graph dependency audit,
40-step foundation baseline, web typecheck, production build, and bundle
budget. Exact-SHA run `30282034290` passed the controlled-mismatch check and
anonymous public-funnel canary. Canonical staging then served the source
commit as both build ID and Sentry release.

Read-only live acceptance proved that signed-out `/onboarding` fails closed
into authentication, while the completed signed-in operator account resolves
the same route to canonical member destination `/c/polynet/chat`. The retained
Account surface still rendered the inference-provider controls and connected
ChatGPT state after the deployment. Browser warning/error logs were empty. No
disposable incomplete staging account was available, so live bridge-form
mutation was deliberately not fabricated; the compiler, focused
single-controller/three-consumer proof, and adjacent account-completion,
member-destination, social-profile, settings, Workspace-quarantine, and
profile/DM contracts cover that source boundary.

C8.3 is complete on canonical staging. C8 remains `IN_PROGRESS`; the next
retained-surface decomposition must be planned as a separate slice.
Production, `origin/main`, production configuration, production data, and
Convex remain untouched.

### C8.4A source receipt — Community-launch lifecycle boundary

The first community-launch decomposition slice removes launch lifecycle and
status-hydration ownership from `App.tsx`. One
`useWebCommunityLaunchSetupLifecycleController` now owns the selected
community's derived setup status, loading/error state, modal open/create mode,
initial step, integration reload/auto-open signals, and one discriminated
restore intent for either a durable setup route or a Knowledge OAuth return.
The two former pending restore states can no longer race to reopen the same
surface.

The boundary does not become a new product or data authority. Convex remains
canonical and manager-gated for the six-step derived status. `App.tsx` retains
browser-history mutation, global OAuth finalization, authentication and
entitlement gates, active-community navigation, community creation, and every
canonical profile, resource, agent, access, and publication write. The
controller imports only the existing status-read gateway and contains no
browser navigation, OAuth provider finalization, or cloud mutation path.

Status application is now bound to one request generation, authenticated
subject, and active community. Superseded requests, sign-out, community
switches, permission loss, and leaving the community surface invalidate late
results. The explicit post-create handoff is the only transition allowed to
adopt a newly created target. Direct routes preserve their exact requested
step; OAuth returns converge on Knowledge only after the requested community
is active and its status is loaded.

`App.tsx` falls from 8,753 to 8,530 lines. It no longer declares launch
status/loading/error state, modal/create/initial-step state, provider
reload/auto-open state, pending route/OAuth restore state, the loaded-community
ref, direct status-gateway calls, or the three related hydration/restore
effects. `WebCommunityLaunchSetupModal` consumes one typed
`WebCommunityLaunchSetupLifecycleModel` instead of six flat lifecycle props.
A focused executable proof covers step precedence plus current, superseded,
cross-subject, cross-community, and post-create request outcomes; the existing
launch and source-ingestion contracts are updated to follow the new owner.

No Convex file, schema, migration, cloud data, environment configuration,
route vocabulary, copy, style, provider protocol, production action, or
`origin/main` change belongs to this slice. Canonical staging release and
exact-build acceptance remain required before C8.4A can be called complete.

### C8.4A staging closure receipt

Source commit `6931c29ce1d60afbcbfa61e3953ce3680cfa1d56` reached the
canonical Git-driven `polynet-staging` deployment without a Convex deployment.
The canonical staging `version.json` served that exact commit as both
`buildId` and `sentryRelease`. Exact-SHA GitHub runs `30284551567` (MVP Guards)
and `30284551588` (Staging UI Canary) completed successfully.

Read-only live acceptance on that exact build proved:

- an authenticated manager route restored the launch modal directly to the
  requested Profile step;
- a second authenticated route restored directly to the requested Knowledge
  step;
- closing the modal removed the launch query state and left the canonical
  community-settings route;
- an unauthenticated direct setup route failed closed by resolving to the
  public community surface without exposing the manager launch modal; and
- both acceptance sessions produced no browser warnings or errors.

No provider OAuth mutation or disposable community creation was performed for
the live acceptance. OAuth-return precedence, post-create transition, stale
request rejection, cross-subject rejection, and cross-community rejection are
covered by the focused lifecycle-orchestration proof and the adjacent launch
and source-ingestion contracts.

C8.4A is complete on canonical staging. C8 remains `IN_PROGRESS`; the next
retained-surface decomposition must be planned as a separate slice.
Production, `origin/main`, production configuration, production data, and
Convex remain untouched.

### C8.4B source receipt — Community-launch Knowledge orchestration boundary

The second community-launch decomposition slice removes source, provider, and
wiki-assembly orchestration from `App.tsx`. One
`useWebCommunityLaunchKnowledgeController` now owns the launch Knowledge
projection and its existing link, file, Google Drive, GitHub, ingestion,
architect-plan, plan-apply, and source-backed drafting operations. One typed
`WebCommunityLaunchKnowledgeModel` groups that surface into four irreducible
capabilities: saved sources, source actions, provider integrations, and wiki
assembly. `WebCommunityLaunchSetupModal` consumes that nested model instead of
four source arrays and more than twenty individual callbacks.

This is a web orchestration boundary, not a new source, credential, or wiki
authority. `communityResources` remains canonical for community-owned source
rows. `userSourceIntegrationConnections` remains canonical for user-owned
Google Drive and GitHub credentials. The focused source projection and every
provider/write path remain server-authorized, with the projection explicitly
manager-gated. The existing architect and resource actions remain the only
wiki mutation paths.

`App.tsx` retains authentication, active-community navigation, browser history,
durable OAuth intent, external provider redirection, OAuth callback
finalization, community creation, and the canonical profile, About, agent,
access, and publish writes. The Knowledge controller contains no browser
navigation, OAuth callback finalizer, community-creation path, or profile,
access, or publication mutation.

Knowledge operations are bound to the authenticated subject, active community,
and current manager authority captured by the initiating render. A superseded
source request cannot project after a newer request. Sign-out, community
switch, or permission loss clears the saved-source projection; late provider
reads return no presentation result; and a multi-step workflow cannot continue
its later writes against a different community. Source-write follow-up
hydration remains best effort where it was already best effort, while removal,
disconnect, plan-apply, and drafting retain their stricter refresh behavior.

`App.tsx` falls from 8,530 to 8,067 lines and
`WebCommunityLaunchSetupModal.tsx` falls from 3,439 to 3,186 lines. The new
915-line controller is still a retained domain concentration rather than a
terminal decomposition; it makes that concentration explicit and separately
testable instead of leaving it interleaved with the application shell. A
focused executable proof covers source-family partitioning, current and stale
request outcomes, single-controller composition, target-bound operation
callbacks, the retained App/OAuth authority boundary, and the unchanged
community-source/user-credential database split. Existing launch, source
ingestion, resource-builder, wiki-architect, and lifecycle proofs follow the
new owner.

No Convex file, schema, migration, cloud data, environment configuration,
route vocabulary, copy, style, provider protocol, production action, or
`origin/main` change belongs to this slice. Canonical staging release,
exact-build acceptance, and a reversible saved-link round trip remain required
before C8.4B can be called complete.

### C8.4B staging closure receipt

Source commit `2e9f0d5c61c4fbfd435c1a60c90f9431764d4dd8` reached the
canonical Git-driven `polynet-staging` deployment without a Convex deployment.
The canonical staging `version.json` served that exact commit as both
`buildId` and `sentryRelease`. Exact-SHA GitHub runs `30288187935` (MVP Guards)
and `30288187363` (Staging UI Canary) completed successfully.

Reversible signed-in acceptance on that exact build used the existing
manager-owned, incomplete `distribution-engineering` launch surface. The
Knowledge projection began with zero saved links. Adding the nonce
`https://example.com/c8-4b-proof-2e9f0d5c` produced exactly one saved link,
advanced Knowledge progress from `0/2` to `1/2`, and exposed the canonical
saved-source row. Removing that exact row returned the projection to zero links
and progress to `0/2`. The acceptance tab reported no browser warnings or
errors.

The same manager-only setup URL in an anonymous staging session failed closed
to the public community surface without exposing the launch modal. No source
ingestion, file upload, wiki assembly, provider OAuth connect or disconnect,
community creation, schema change, Convex deployment, production action, or
`origin/main` change was performed.

C8.4B is complete on canonical staging. C8 remains `IN_PROGRESS`; the new
controller is an explicit retained concentration, and any further Knowledge UI
decomposition must be planned as a separate slice. Production, `origin/main`,
production configuration, production data, and Convex remain untouched.

### C8.4C source receipt — Community-launcher frontend retirement

The third community-launch slice questions the launcher requirement itself.
The six-step launcher duplicated jobs that already have canonical product
owners: the existing create-community modal owns identity and initial
visibility; Community Settings owns profile, branding, access, and pricing; AI
Agent owns instructions; Resources owns community knowledge; and Funnel owns
preview and sharing. C8.4C therefore deletes the duplicate frontend instead of
optimizing it again.

Desktop, mobile, and post-auth community-creation intents now converge on the
existing `useWebCommunityUiController` and `WebCreateCommunityModal` path.
`useCommunityCreateController` remains the single creation authority for
session recovery, account setup, owner quota, published-community readiness,
branding preparation, `createCloudCommunity`, and the post-create callback.
`App.tsx` still projects the returned community into owner state and enters its
canonical member destination.

The retired surface includes the 3,186-line launcher modal, its two typed
models, its 915-line Knowledge controller, its 467-line lifecycle controller,
its dedicated setup-route and provider-OAuth return helpers, and 1,444 lines
of launcher-only CSS. `App.tsx` falls from 8,067 to 7,305 lines and no longer
mounts the launcher, preserves launcher query state, finalizes
launcher-specific provider callbacks, or hides the member-agent dock behind
launcher state. The three launcher-only proofs are deleted; source-ingestion,
resource-builder, wiki-architect, and Workspace-quarantine proofs now test
their surviving authorities without treating the retired UI as required.

This is a frontend retirement, not a source-data or backend deletion.
`communityResources`, community source ingestion, Google Drive and GitHub
credential handling, wiki architect actions, resource-builder tools, and their
cloud gateways remain protected for canonical Resources and future deliberate
product work. Historical C8.4A and C8.4B receipts remain as truthful records of
the staging builds that preceded this requirement deletion.

A focused retirement proof locks the absence of launcher runtime files, route
state, callback state, and CSS; the single desktop/mobile/auth-resume creation
path; the retained create-account/quota/readiness boundaries; the post-create
owner transition; the destination-owned settings, AI Agent, Resources, and
Funnel surfaces; and the protected backend resource/source capabilities.

No Convex file, schema, migration, cloud data, provider credential, production
configuration, production action, or `origin/main` change belongs to this
slice. Canonical Git-driven staging release and exact-build acceptance remain
required before C8.4C can be called complete.

### C8.4C staging closure receipt

Source commit `1495c292d60f7063874320e9d8cc039599c38938` reached the
canonical Git-driven `polynet-staging` deployment without a Convex deployment.
The canonical staging `version.json` served that exact commit as both
`buildId` and `sentryRelease`, and the read-only remote guard confirmed that
the domain remained owned by the non-production staging project and inherited
this branch's automatic promotion.

The source candidate passed the focused launcher-retirement,
source-ingestion, resource-builder, wiki-architect, Workspace-quarantine, and
staging-identity proofs; web typecheck; production build; bundle budget; and
the canonical 41-step foundation baseline locally. GitHub runs `30302225530`
(MVP Guards) and `30302225252` (Staging UI Canary) were created for the exact
SHA but executed zero steps because the external runner account was
unavailable. This is recorded as an external CI availability exception, not as
a passing CI result or a source failure.

Read-only live acceptance on the exact build proved:

- an authenticated legacy launcher URL removed
  `community_launch_setup` and `community_launch_step`, stayed on canonical
  Community Settings, and rendered no launcher;
- an authenticated orphaned `source_integration_oauth` parameter was removed
  and also rendered no launcher;
- the desktop Create Community CTA entered the existing account
  quota/entitlement surface for the current quota-limited account instead of a
  launcher path;
- Community Settings, AI Agent instructions, Resources, and Funnel remained
  independently reachable through their canonical navigation;
- an anonymous legacy launcher URL failed closed to the public community
  surface and rendered no manager setup UI; and
- the authenticated and anonymous acceptance sessions emitted no browser
  warnings or errors.

No community was created, no form was submitted, and no resource, funnel,
agent, provider, credential, cloud data, schema, or production state was
mutated during acceptance. The production build marker remained
`456ebb9cfb95defc316c046e57d17a001eea5025`, distinct from the staging source
commit.

C8.4C is complete on canonical staging. C8 remains `IN_PROGRESS`; the duplicate
launcher is no longer a retained surface to decompose. Any redesign of founder
setup or any deletion of now-unread launch-status backend code must be planned
as a separate slice. Production, `origin/main`, production configuration,
production data, and Convex remain untouched.

### C8.4D source receipt — Community-launch backend contract retirement

The final C8 slice removes the launcher as a backend contract after first
separating its one surviving product responsibility. Funnel About was the only
first-party caller of `saveCommunityLaunchProfile`; it supplied only `about`
through a launcher-named shared gateway even though Funnel is now the canonical
owner of that field. Additive source commit
`e449014897501f37e57225ad3f53cce5279fae00` introduces one narrow,
manager-authorized `saveCommunityAbout` mutation, places its browser gateway
with the retained Funnel contract, and projects only `community_id`, `about`,
and `updated_at` back into web state. The old mutation remains in that commit
only as a compatibility bridge while staging Convex deploys before the web.

Once the exact additive web build proved the new write and restored the original
About value, the subtractive phase deletes `saveCommunityLaunchProfile`, the
unread `getCommunityLaunchSetupStatus` query, their facade exports, generated API
residue, and the three dedicated launcher backend/shared files. The six-step
status had no stored launcher record: it was derived at request time from
communities, resources, agent configuration, and price points. Its removal
therefore requires no schema or data migration.

This deletion does not reach through the retired launcher into protected
community-resource infrastructure. Source ingestion, source rows, Google Drive
and GitHub credential/OAuth handling, crawler jobs, wiki architect actions,
resource-builder tools, and their existing cloud gateways remain intact. Their
remaining launcher-shaped vocabulary is a separately authorized Resources
compatibility/redesign decision and does not keep C8 open.

The retirement proof now locks absence of both frontend and backend launcher
runtime files and RPCs while preserving the canonical Create Community,
Settings, AI Agent, Resources, Funnel, authorization, quota, readiness, and
post-create destination boundaries. The Funnel proof locks the required,
bounded, manager-authorized About write and also corrects a stale assertion so
preview must suppress visit recording and carry explicit preview mode.

No production function, production data, provider credential, source row,
schema, environment configuration, Vercel project, `origin/main`, or protected
resource/memory system belongs to this slice. Exact clean staging Convex
deployment, Git-driven web deployment, full source gates, legacy-route
normalization, canonical destination availability, and unchanged production
markers remain required before C8.4D and C8 can be called complete.

### C8.4D staging closure receipt

The additive commit
`e449014897501f37e57225ad3f53cce5279fae00` and subtractive commit
`268a42ceab7a231b8855cfb99826a362508fa07c` both reached canonical staging
through the guarded Convex-first, Git-driven sequence. After the additive
Convex deployment and exact web build were live, signed-in acceptance changed
Funnel About to a unique nonce, saved it, reloaded it from cloud state, restored
the exact original value, and reloaded again. That proved the retained Funnel
write had moved to `saveCommunityAbout` before the legacy contract was removed.

After the subtractive Convex deployment, the staging function specification
contained `community.js:saveCommunityAbout` and contained neither
`community.js:saveCommunityLaunchProfile`,
`community.js:getCommunityLaunchSetupStatus`, nor any
`communityLaunchSetup.js:*` function. The Git-driven staging deployment then
served the exact subtractive SHA as both `buildId` and `sentryRelease`.
Signed-in browser acceptance on that build proved that:

- the Funnel still rendered the restored About value and a disabled `Saved`
  control;
- the legacy launcher query URL normalized to canonical Community Settings,
  removed both launcher parameters, and rendered no launcher UI; and
- the acceptance session emitted no browser warnings or errors.

The source candidate passed the focused Funnel and launcher-retirement proofs;
Convex and web typechecks; production build; bundle budget; protected
source-ingestion, resource-builder, and wiki-architect proofs; the complete
41-step foundation baseline; all three staging guards; and `git diff --check`
locally. GitHub runs `30306800429` (MVP Guards) and `30306799875` (Staging UI
Canary) were created for the exact subtractive SHA, but every external-runner
job failed before executing any steps. This remains an external CI availability
exception, not a passing CI result or a source-test failure.

The original About value is restored. No schema or data migration was required
because launcher completion status was derived rather than stored. No
production function, data, configuration, project, or `origin/main` ref was
changed, and the production build marker remained
`456ebb9cfb95defc316c046e57d17a001eea5025`.

C8.4D is complete on canonical staging, so C8 is `COMPLETE`. The protected
Resources/OAuth substrate remains intentionally intact. Its remaining
launcher-shaped source vocabulary can be reconsidered only inside a separately
authorized Resources redesign; it is not unfinished C8 work.

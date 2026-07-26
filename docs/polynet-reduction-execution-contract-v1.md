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
| C7 | Delete deferred Workspace/UI/docs/configuration surfaces | `IN_PROGRESS` | every retained surface maps to an MVP journey or protected substrate |
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

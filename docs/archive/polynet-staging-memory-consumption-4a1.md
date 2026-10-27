# Slice 4A1: truthful accepted-memory consumption and outcome receipts

Date: October 15, 2026. Algorithm step **1 — question and rank requirements**.
Status: bounded staging acceptance passed October 15, 2026.
[Receipt](../receipts/2026-10-15-staging-memory-consumption-4a1.md) and
[structured evidence](../receipts/evidence/2026-10-15-staging-memory-consumption-4a1.json).
The approved scope below was implemented and verified. Production remained untouched.

## 3A2 review and current baseline

No blocking finding in the scoped 3A2 runtime review. The observation is a fence,
not permission: current manager authority, target access and activation precede
replay; fresh execution recomputes the bounded evidence reference. The adapter
uses the existing approval writer. Receipt completion, transition and scheduled
work share the same domain transaction. First-party approval compatibility remains.

| Boundary | Rechecked October 15 |
| --- | --- |
| Clean source before this planning document | `0b00e1a01376c30fc2a6957ac2f00b519712f16b`, `codex/staging-founder-progress-approval-3a2` |
| Runtime / Git staging / served staging | `ad8c7071d3a8a8db65501ddc6825090de7817374` |
| Backend | `dev:quick-porcupine-949`; 3A2 receipt records clean deployed tree `e1d6553b4039e8a1c300a7e69aa6f325d421104c`; not remote commit attestation |
| Canonical main | `0a100cfb544851ab06da25f93d8ad549db917ee4`, unchanged |
| Production web | `91d28dc2c986ef88a8a507a269db710d6d28d878`, unchanged |
| Draft PR #176 | Open, unmerged, stacked on #175; no submitted reviews or inline comments |
| Receipt-head CI | [Release Gate passed](https://github.com/Neil-McD/Arx/actions/runs/38796804956) |
| Fresh scoped tests | 206 tests / three files: approval, form and canonical executor |
| Source proofs | Memory consumption parity, retrieval receipt, compiler candidates, compiler evidence diet and lineage ontology passed |
| Live preservation | Entire bounded 3A2, 3A1 and retained 2A/2C snapshots still match the completed receipts |

The [3A2 receipt](../receipts/2026-10-15-staging-founder-progress-approval-3a2.md)
records the earlier complete clean-candidate gate: 1,836 tests / 194 files, both
typechecks and dependency audits zero. This review reran affected checks and
read-only staging observations; it did not repeat the approval or full gate.

The approved milestone establishes a private member progress decision. Neither
its frozen form answer nor its approval becomes shared intelligence. Keep both
completed fixtures intact.

## Findings that determine the next slice

| Finding | Evidence / consequence |
| --- | --- |
| **P2: memory outcome refusal is acknowledged as success** | `recordCommunityOutcomeObservationInternal` catches domain refusals and returns `{ok:false, reason_code, message}`. The canonical executor does not check `result.ok`; it wraps that object as `ok:true` and completes a successful receipt. |
| Behavioral reproduction | A valid current member used another user's real, same-community `external_mcp` retrieval receipt. Domain result: `community_intelligence_retrieval_log_forbidden`. Outer response: `ok:true`; canonical receipt: `completed`; outcomes: zero. A temporary regression probe failed its expected `ok:false` assertion. The original test file was restored exactly. No live write was made. |
| Scope of the defect | Preexisting memory adapter, unchanged by 3A2. The domain denies the write: this proves misleading acknowledgment/receipt state, not cross-user outcome creation or data disclosure. Existing source-pattern proofs and the positive crash test do not cover this negative adapter result. |
| Nonblocking documentation drift | The active lineage contract still describes external contributions as future/read-only and AI Feed as a live admission source. Current external contribution attribution exists; current compiler/citation admission rejects retired AI Feed sources. Correct only those passages and their dependent assertions. Preserve historical certificates as historical evidence. |
| Bounded availability tradeoff in 3A2 | Its approval observation declines truncated/unavailable submitted-form projections, including historical projection limits. Conservative refusal is intentional; do not expand scans or rewrite progress while starting memory work. |

Cached completed values need the same truth check: a previously stored nested
domain refusal must not keep replaying as success. Preserve those records as
audit history; this slice does not authorize a receipt migration or blanket reset.

## Mental model of the context and intelligence rails

```text
canonical readable interaction / published resource
  -> permissioned, versioned source trace
  -> bounded immutable digest + exact workKey
  -> governed retain / carry-forward / dismiss decision
  -> accepted intelligence node + immutable source citation
  -> current-authority memory search/read + consumption receipt
  -> observed outcome about that consumption episode
  -> pending attach_outcome request / later deterministic metabolism
```

| Rail | Current owner | Meaning / boundary |
| --- | --- | --- |
| Identity and community lens | `communityCapabilityContext.ts`, `communityCore.ts` | Explicit selected community is validated server-side on each operation. |
| Source truth and intake | Interaction/resource owners, `communityResourceMemoryProjection.ts`, `communityEvidenceCore.ts` | Canonical content controls visibility and lifecycle. A trace is eligible evidence, not accepted memory. Private forms are not an intake shortcut. |
| Work identity and decisions | `communityCompilerEvidenceCore.ts`, `communityCompilerDigest.ts`, `communityCompilerCandidates.ts` | Exact source revisions and work keys; all digest items require dispositions. Steward filesystem writes require a claimed digest. |
| Accepted intelligence and citations | `communityIntelligenceDirectory.ts`, `communityEvidenceCitations.ts` | Accepted status is separate from epistemic certainty. `compiler_memory` reads check current source visibility and active citations. |
| Agent consumption | Existing `polynet_search` and `polynet_read` memory adapters | Shared kernel; external memory reads deliberately force member visibility, including for founders. Search and exact read currently create separate receipts. |
| Outcome/recovery | `recordCommunityOutcomeObservationCore`, canonical receipts | One outcome per consumption receipt/node; identical payload deduplicates, changed payload conflicts. An observation is not an accepted memory update. |
| Later learning | `communityMemoryMetabolizer.ts`, existing cognition | Outcome write marks metabolism pending and inserts a pending request; it does not prove later application, validation or a useful autonomous learning cycle. |

The exact-read adapter currently projects the node and `retrieval_id`, rather
than the directory kernel's whole neighbor graph. A richer citation/subgraph
projection may be useful later, but is not required to correct acknowledgments
and prove this bounded consumption episode. Do not claim graph parity from the
July certificate: it used another deployment, retired AI Feed fixtures and older
adapters.

## Outcome and requirement ranking

**An authorized native external client can consume one currently accepted,
citation-backed memory and report one explicitly synthetic observation. A refusal
must be an error, and recovery must preserve exactly one observation.**

This begins package 6 of the [trunk-down plan](../research/headless-trunk-down-approach-20261014.md).
Package 5 now has bounded automatic and founder-approved progress proofs. Package
4 has selected admission proofs, not comprehensive create/fund/channel/role parity.
Do not relabel those bounded achievements as a fully headless platform.

Qualitative avoidable-effort ranking; costs are not measured, so no numerical
idiot-index ratio is claimed.

| Rank | Questioned requirement | Minimum decision |
| --- | --- | --- |
| 1 | Rebuild ontology, add a vector/graph service, or create a second context API | Exclude; current source, compiler, directory and five-tool owners suffice. |
| 2 | Run a fresh paid model cycle to prove existing consumption semantics | Exclude here; an existing readable compiler-retained memory provides the live fixture. |
| 3 | Add a new feedback store, approval queue or mandatory atomic-receipt framework | Exclude; domain deduplication already handles receipt-completion uncertainty. Preserve and test it. |
| 4 | Treat raw search results, a returned body, or one `worked` report as validated collective learning | Reject; keep retrieved, read, reported, pending and accepted states distinct. |
| 5 | Expand graph/citation browsing, memory authoring and all source types together | Defer; exact node, stored citation lineage and one native consumption are enough here. |
| 6 | Repair false-success propagation and prove negative/uncertain responses | Keep; this is a confirmed contract defect on the next core rail. |

Only step 1 is complete in this planning turn. At implementation, delete the
unconditional success interpretation, verify refusals, then simplify the surviving
adapter. Do not advance into acceleration or automation without the bounded proof.

## Proposed implementation boundary

Keep `community.memory.record_outcome` v1 and the five tools. No new endpoint,
table, schema migration, model call or permission system.

1. Check the domain acknowledgment before constructing/completing a success.
   Require a real successful outcome identity. Propagate explicit refusal using
   the existing canonical error shape; fail the reserved attempt rather than
   storing a successful operation. Reject malformed acknowledgments too.
2. Check cached completed values for this operation. A nested historical refusal
   is not successful recovery. Return an error without rewriting its audit row.
   Do not impose this operation-specific result shape on unrelated capabilities.
3. Keep current authorization before generic replay and existing domain ownership,
   receipt version, surface, community, returned/injected and per-node checks.
   Preserve the domain's episode-level deduplication and conflict behavior.
4. Add behavioral negatives and recovery coverage around the actual executor and
   directory owner. Prefer existing fixtures and owners; no deployed acceptance
   backdoor or synthetic insertion of live accepted-memory rows.
5. Reconcile the narrow stale lineage/consumption contract passages. Historical
   acceptance certificates retain their dates, deployment identity and limitations.

Primary runtime owner: `convex/polynetCanonicalExecutor.ts`. Extend
`convex/polynetCanonicalExecutor.test.ts` or a focused memory semantic test file.
Change the directory owner only if a failing boundary test demonstrates a need.
No general executor decomposition, compiler rewrite or protected-core deletion.

Outcome feedback concerns an earlier consumption episode. This slice does not
invent an activation/revision migration for old retrieval receipts or claim that
historical feedback certifies current source validity. Search/read must still
reject unreadable or superseded evidence. No private node content is granted by
an outcome response.

## Proposed live fixture: reuse accepted memory, preserve its source

Read-only inventory and a current member-authorized directory query found:

| Field | Observed October 15 |
| --- | --- |
| Community | `workflow-cursor-20260907`, `jx76tshcgsbe3bqt0rdytkayh98e1f57`; active, unlisted |
| Founder | `jn7ckswapk976rra6egsxydm0x82a7nc` |
| Ordinary member | `jn70qrjgn0pb16q2rf90bg1b518c3qjd`; membership `ks78mj4ga2kanz4ddxdw5etf7n8e0ymg`, active, role member, activation 1 |
| Scope | Two known actors; bounded roster not capped, no other active participant |
| Accepted node | `w97fphdpn87dx9g1rcapq39mgd8e67f4`, `promising`, community visibility, `compiler_memory`, `citation_v1` |
| Title | Staging cursor regression is deterministic and model-call-free |
| Canonical source | Live human interaction `interaction:root:j97vwfz8cq0tcd3kg0wv0zq7358e0m5j` |
| Trace / citation | `wn787khs51xkkemn97nb88sd4s8e0xd3` / `n97kwsh75acre6p32gb1ajzmw58e6zae` |
| Retention | Trace is compiled; its `retain` decision, exact work key and applied `create_node` request point to this same node |
| Existing outcomes | Zero; bounded outcome/change-request scans not capped |
| Other state | One historical workflow; no resources and no pending compiler traces in the bounded scan. Do not edit that workflow or its history. |

The authorized directory query used the development CLI's explicit identity
facility and current source/citation checks. It was read-only. This is planning
corroboration, not a fresh native OAuth acceptance or a new model-quality proof.
Recheck both native identities, access/funding, source/citation, configuration,
existing outcomes and historical workflow before any live write. Save/hash the
original bounded snapshot outside the repo. If the fixture changed, reconcile;
do not clear it or silently choose another community.

## Bounded staging proof after approval

1. Actual native member searches `/communities/workflow-cursor-20260907/memory/`
   and exact-reads the observed node path. Verify the same node identity, accepted
   grade and stored canonical citation/source linkage. Read the exact source
   through the existing authorized channel repository when needed; raw source
   retrieval does not itself count as memory consumption.
2. Independently inspect the actor-owned retrieval records. Search records the
   returned node; exact read creates a **separate** receipt with that node returned
   and injected. Use the exact-read `retrieval_id` for the observation. “Injected”
   here means returned as context to the client, not proof a model used it.
3. Prove a search-only receipt is refused as not injected. Obtain a separate
   founder-owned read receipt and prove the ordinary member cannot use it. Both
   failures must be top-level errors with zero outcomes or success receipts for
   those keys. Do not expose another actor's private content.
4. Record one `worked` observation with notes explicitly identifying the synthetic
   diagnostic-consumption test. It is not a customer outcome or validation of
   business advice. Persist the exact envelope before dispatch; discard the first
   application acknowledgment and independently inspect the canonical commit.
5. Verify one observation, one receipt linkage and one pending `attach_outcome`
   request. Record the owner's normal `memoryMetabolismPending`/revision effect.
   No direct memory promotion or acceptance/apply call.
6. Fully restart the native client and replay the saved envelope. Same key/payload
   recovers the same outcome; changed payload conflicts. Same consumption/node
   under a new key with identical payload deduplicates at the domain owner; a new
   canonical operation receipt is permitted, a second outcome/request is not.
   New key with changed status/notes must return the domain conflict truthfully.
7. End native processes, remove isolated credentials, prove fresh auth-required
   behavior and unchanged permanent configuration. Retain scoped synthetic
   outcomes/requests/receipts; no raw deletion or fixture reset.

No requested inference, provider setup, payment, fresh compiler run, memory edit,
source revocation, membership change, workflow transition or metabolizer invocation.
Normal background work may independently run; compare before/after and attribute
any change rather than suppressing it or resetting rows to fit the proof.

## Local verification and release exit

Behavioral cases must cover:

- Real successful owner acknowledgment versus explicit and malformed refusals;
  cached nested-refusal receipts; no completed success for a denied attempt.
- Own/member, another actor, other community, wrong surface/version, search-only
  receipt, unreturned/uninjected node, corrupt linkage and conflicting report.
- Current access revocation/archive/funding denial at the canonical boundary.
- Same key, new key/same episode, changed payload, concurrent calls and uncertain
  receipt completion; one observation and one pending request.
- Actual citation-backed compiler memory in local fixtures; draft/admin/private,
  foreign-community, revoked source and superseded citation reads fail closed.
  Keep these fault injections local; do not mutate the live accepted source.

Run the affected tests, both typechecks, semantic/canonical/memory/citation/lineage
proofs and the exact clean-candidate release gate. Keep source-pattern checks
separate from behavioral and actual native evidence.

Implementation would branch `codex/staging-memory-consumption-4a1` from the
reviewed 3A2 source in the attached staging worktree. Deploy only the explicit
staging Convex selector and Git staging, verify the matching served source and
backend provenance, and create a stacked draft PR on #176. Production and
canonical main remain untouched. Record the deployed runtime separately from
receipt-only commits and CI.

Exit: truthful errors; one native accepted-memory read/observation/retry; one
canonical observation/request; old accepted source/node/history preserved; all
3A1/3A2 and 2A/2C fixtures unchanged; credentials cleaned up; durable receipt.

## Subsequent package-6 slices

| Order | Scope | What it adds beyond 4A1 |
| --- | --- | --- |
| 4A1 | Truthful accepted-memory consumption and outcome receipts | Current native consumption and observation/recovery; no new learning claim |
| 4A2 | One fresh current-source compilation and source-lifecycle proof | Interaction or published resource -> bounded digest -> actual retention/citation -> authorized retrieval; plan any real Steward inference and cost bound separately |
| 4A3 | Outcome application and usefulness | Pending observation -> governed/deterministic application or metabolism, with evidence that future context changes correctly; no automatic validation from one synthetic `worked` report |

Reassess after each receipt. Do not implement all three as one conversion.

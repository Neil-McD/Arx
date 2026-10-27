# Slice 4A2: one fresh source, governed compilation and citation authority

Date: October 15, 2026. Algorithm step **1 — question and rank requirements**.
Status: proposed; execution paused by the user for product-vision handoff.
See [agent handoff](polynet-headless-agent-handoff.md). No source, inference,
deployment or product write was performed. This plan adds no acceptance claim to the
[current coverage ledger](polynet-staging-coverage-ledger.md).

## Baseline and newly observed verification gap

| Boundary | Rechecked during planning |
| --- | --- |
| Clean source / integration checkpoint | `88ffb2ae0c7b8226b032bec572500e09fecd5606`, `codex/staging-memory-consumption-4a1` |
| Latest checkpoint CI | [Passed all 15 steps](https://github.com/Neil-McD/Arx/actions/runs/38802079321); merge-tree identity verified at the checkpoint |
| Runtime / Git staging / served staging | `ac49ad2f8308b1ffec20dcc622fe6c332aad7a4b` |
| Backend | `dev:quick-porcupine-949`; explicit staging selector `/tmp/polynet-package-1-staging.env` |
| Canonical main | `0a100cfb544851ab06da25f93d8ad549db917ee4`, unchanged |
| Production web | `91d28dc2c986ef88a8a507a269db710d6d28d878`, unchanged |
| Earlier bounded records | Fresh read-only 4A1, 3A2, 3A1 and retained 2A/2C snapshots still match their completed receipts |

**Fix the admission proof before live compilation.**
`npm run check:community-compiler-admission-proof` currently exits 1 at
`scripts/community_compiler_admission_contract_proof.ts:89`: expected one pending
standard item, observed zero. Its fake interaction `sourceId` values are bare
labels, whereas current admission requires a canonical interaction reference and
a live, shared source. Its mock database also lacks the source-resolution model.
The script and both relevant runtime cores are unchanged between main and this
staging stack. This is a preexisting proof-fixture failure, not evidence that
production should admit those invalid sources.

That standalone script is not invoked by `foundation_baseline_gate.sh` or the
release gate. A green gate therefore did not certify it. The compiler candidates,
evidence-diet and lineage proofs pass when run separately. Preserve the
checkpoint receipt; record this newly discovered limit in current coverage.

## Minimum outcome and ownership

**One newly authored synthetic human source becomes one current, citation-backed
memory through the real claimed Steward path. An authorized ordinary member can
retrieve it, and cannot retrieve that old memory after its source changes or is
tombstoned. Earlier proof records remain intact.**

| Stage | Existing owner / invariant |
| --- | --- |
| Human source | `communityInteractions`; normal authenticated founder composer, canonical attribution and channel access |
| Source admission | `communityInteractionEvidence` -> `communityCompilerEvidenceCore`; scheduled source sync rechecks live shared evidence; self-authored community-agent evidence stays excluded |
| Digest | `communityCompilerDigest`; deterministic, bounded, immutable source revisions/work keys; no model call |
| Handoff | `communityAgentHeartbeat`; current switch, daily cap, exact digest/version and claim identity |
| Retention | `communityAgentRuntime` -> claimed `communityAgentFilesystem` write -> `communityCompilerCandidates`; Steward decides retain/carry/dismiss, existing policy applies it |
| Citation | `communityEvidenceCore` / `communityEvidenceCitations`; immutable identity, content/provenance fingerprints and current source resolution |
| Consumption | Existing canonical memory search/read; current member access and citation checks, including founder external member visibility |

A single standard post does not normally meet automatic wake thresholds. Use the
existing authenticated deterministic digest pass explicitly, then the existing
internal heartbeat with that pending handoff. This proves bounded operator-triggered
compilation, not automatic wake from one post or public control of the Steward.
The internal trigger is operational test control; founder/member identity and
source/read authority must still be proved through actual sessions.

## Requirement ranking

Qualitative avoidable-effort ranking; no numerical idiot-index ratio is measured.

| Rank | Questioned requirement | Minimum decision |
| --- | --- | --- |
| 1 | Add many posts, wait 72 hours, or weaken trigger thresholds to wake one source | Exclude; existing explicit digest pass creates a valid handoff without changing admission policy |
| 2 | Insert an accepted node or supply a synthetic live retain decision | Exclude; real Steward decides through the claimed filesystem writer. Local synthetic decisions remain local test fixtures |
| 3 | Rebuild compiler, ontology, citation API or permissions | Exclude; reuse current owners and five public verbs |
| 4 | Add general workflows, resources, outcome application or load testing together | Exclude; one shared interaction, no outcome report or metabolism invocation |
| 5 | Treat source-pattern proofs and old certificates as current compilation acceptance | Reject; repair the failing admission fixture and add source-backed behavioral coverage to routine validation |
| 6 | Treat retained synthetic advice as validated intelligence quality | Reject; report its actual grade and source. This proves plumbing and authority, not customer benefit |

## Proposed fixture and inference bound

Read-only bounded inventory selected an existing community outside the earlier
2A/2C/3A/4A1 proof fixtures:

| Field | Observed during planning |
| --- | --- |
| Community | `workflow-live-canary-sep24`, `jx74phdy7rk71anav6wk3g82658f0mhm`; active, unlisted, approval entry |
| Founder | `jn7ckswapk976rra6egsxydm0x82a7nc`; no explicit owner membership in the observed roster |
| Ordinary member | `jn70qrjgn0pb16q2rf90bg1b518c3qjd`; active member, sole observed membership; bounded roster not capped |
| Shared destination | General, `qh7zaf6nqtdsj5ehhn1wz6d6f98f10a3`, active, `all_members` |
| Existing evidence | One historical interaction trace `wn7djabx3jrfmxkrpp893c8mgh8f1h9j`, `excluded_self_authored`; no digest or intelligence node observed |
| Cycle assessment | Zero pending traces, no pending/running handoff, zero cycles today, `no_compiler_work` |
| Other state | One existing workflow. Preserve its definition, member state, runs, forms and transitions; do not use the ordinary member as the new post author |
| Funding/model | Canonical read-only admission allows `platform_operator_grant`, `gpt-6-luna`; no subscription or grant change needed |
| Current configured accounting | Input 200,000 / output 1,200,000 cost-micros per million tokens; run reservation 1,000,000 cost-micros (**$1**) |

These are current staging configuration observations, not a new provider-price
claim or acceptance of paid-member billing. Recheck the fixture, model, pricing,
remaining allowance and off-switch immediately before dispatch. Stop rather than
repairing funding, raising caps, changing prompts or choosing another community
silently if a prerequisite no longer holds.

Proposed authorization at execution: **one funded Steward run**, existing **$1
run reservation ceiling**, `maxToolSteps: 2`, existing 1,600 output-token bound
per completion. Tool steps do not equal provider requests: the runtime can request
a final response and recover a context overflow. Keep all calls under the same
existing funding receipt/headroom checks, record actual request usage and settled
cost, and require the configured reservation ceiling not to exceed $1. No second
test-requested paid run, prompt tuning or retry-until-retained loop.

If the Steward carries forward, dismisses, skips, errors, or leaves work unsettled,
record that actual result. It does not pass the fresh-retention acceptance. Do not
force a decision, reset the claim or raise limits to manufacture success.

## Implementation boundary after approval

1. Replace or repair the stale admission fixture using canonical, source-backed
   behavioral cases. Prefer the existing `convex-test` suite for admission,
   claim and citation integration so routine foundation Vitest execution includes
   them. Remove the obsolete mock/script only after equivalent replacement cases
   pass; retain the named npm check as a useful alias or wire the repaired check
   into the gate. Do not skip the failing assertion or replace interactions with
   unrelated source types merely to get a pass.
2. Verify fresh source -> scheduled trace sync -> exact digest -> actual claim ->
   governed write -> immutable citation -> member read using real domain owners
   locally. Reuse existing fixtures and receipt machinery. Patch runtime code
   only for a reproduced defect within these boundaries; reassess if it requires
   a compiler/funding redesign or protected-core deletion.
3. Keep endpoints, schema, trigger thresholds, provider configuration, funding
   policy, workflows and visibility semantics unchanged. Expected work is tests,
   bounded proof/runbook and receipts rather than new platform infrastructure.

## Bounded live proof

1. Capture and hash the full bounded candidate snapshot and all earlier retained
   proof snapshots outside the repo. Verify actual founder and member OAuth
   identities, current access, General posting permission and source privacy.
   Record baseline source/node/digest/claim/request/usage counts. No other actor
   or queued work may enter the one-source packet unnoticed.
2. As the actual founder, author one short, clearly synthetic human General post
   through the ordinary web composer. No mentions, links requiring crawling,
   attachments, timers or member workflow triggers. Save the intended text and
   unique marker before dispatch; resolve uncertain posting by canonical lookup,
   not blind resubmission. The founder has no member workflow activation here.
3. Observe the normal scheduled evidence sync: one eligible current interaction
   trace with the correct actor, source ref and shared channel. Preserve the
   historical excluded-self-authored trace. Before retention, ordinary member
   raw-source read must succeed; no accepted-memory result is claimed yet.
4. Use the actual founder's existing authenticated deterministic digest mutation.
   Require exactly one selected trace and work key, no unrelated items. Repeat
   the same digest pass before paid execution: unchanged evidence must reuse the
   digest/version rather than duplicate work. Do not patch age, thresholds or
   continuation flags. Save digest/version/work key and source revision.
5. Trigger the existing staging internal heartbeat once with a unique saved ID
   and `maxToolSteps: 2`. Verify it claims that exact digest and runs only the
   Steward. Capture the mandatory provider-context snapshot, tool result,
   decision, applied request/mutation, node, citation, handoff terminal state and
   funding receipt. Require one real retain/create result and no unrelated effect.
6. Through the actual native member client, search and exact-read the newly
   retained node and exact source. Independently match source -> trace -> digest
   item/revision -> decision/work key -> applied request -> node/citation. Check
   actual status/visibility and immutable source/content/provenance identity;
   do not assume a marker will appear in the model's semantic title. Retrieval
   logs are expected writes, not evidence of downstream model use.
7. The actual author edits only this new source with a material correction through
   the existing first-party edit mutation. Capture the current source and wait
   for bounded sync. Old memory exact read must deny; search must omit it for
   member and founder external clients. Its original citation must remain
   unchanged. Locally assert the exact `superseded` classification; live proof
   requires canonical source/citation snapshots and authorized denial, not a new
   citation-status endpoint or an invented external error code.
8. Tombstone only this new source through the existing first-party delete flow.
   Verify member raw-source and old-memory denial, search omission and normal
   trace redaction/exclusion. Locally assert `revoked`. Retain the tombstone,
   moderation events, immutable citation, digest, accepted-node history, change
   request and funding evidence. Normal trace cleanup may clear its current
   compiler-decision fields; capture the successful pre-cleanup chain separately.
   No second compilation or model run is requested for either revised source.
9. Confirm no new pending eligible work for this source, settle/attribute the
   single run's actual usage, and compare historical records and earlier proof
   fixtures. End proof clients, remove isolated native credentials, verify fresh
   auth-required behavior, preserve permanent configuration and close owned tabs.

Suggested source, subject to a fixed unique marker and normal input limits:

> Synthetic 4A2 staging rule: when a page looks stale after a Git staging deployment,
> compare /version.json.buildId with the intended commit before retrying. A mismatch
> means check that web deployment first; it does not establish a Convex failure.
> Scope: staging diagnostics only.

The content is evidence for a synthetic protocol, not an instruction to the
Steward to retain it. Capture the actual decision without changing the constitution.

On failure, stop the proof and report the last verified boundary. Reconcile an
uncertain canonical commit before another invocation. Preserve audits; perform
only the already scoped cleanup of the new source/clients when safe. Existing
background workers remain unchanged; observe and attribute concurrent work rather
than suppressing it or resetting rows to fit the proof.

## Local verification and exit

| Boundary | Required behavioral proof |
| --- | --- |
| Admission | Valid shared source eligible; invalid/foreign/private/deleted source, stale channel and self-authored community-agent evidence excluded; existing packet/threshold/overflow cases preserved |
| Work identity | Same revision reuses work/digest; changed source produces different identity; stale source cannot be retained using an old digest |
| Claimed writer | Exact community/digest/version/claim required; incomplete or duplicate decisions fail; old claimant after reclamation cannot settle new work |
| Atomic retention/retry | One decision/request/node/citation for the same work; fault rollback and identical settlement retry do not duplicate canonical effects |
| Citation lifecycle | Active -> material edit/superseded -> tombstone/revoked; immutable citation unchanged; member and founder external reads/search fail closed after invalidation |
| Funding/runtime | Existing model pin, required context snapshot, headroom/usage receipts, off-switch and daily cap; no test-requested unbounded model loop |
| Preservation | 4A1, 3A1/2, retained 2A/2C and candidate historical workflow/trace records remain intact; classify normal new source, retrieval, agent and funding records explicitly |

Run the repaired admission check, affected behavior suites, both typechecks,
compiler/citation/memory/lineage/identity checks and the complete clean-candidate
release gate. Keep local synthetic tests, source-pattern assertions, remote
merge-tree CI, backend deployment provenance and actual live proof separate.

At implementation, branch `codex/staging-source-compilation-4a2` from the reviewed
checkpoint plus this planning document. Use the attached staging worktree and
explicit staging selector only. If runtime changes, validate the clean source,
deploy only staging backend/Git staging and verify both layers before live proof.
If runtime is unchanged, retain the existing serving identity and record that
tests/documentation are newer; do not invent a new deployment. Keep the earlier
draft stack untouched and record the 4A2 candidate separately.

Exit: admission proof is meaningful and routinely executed; one real fresh
retention/citation chain is consumed before source invalidation; both later
source states fail closed; canonical effects and spend are bounded; older proofs
and cleanup checks pass; a sanitized receipt updates the single coverage ledger.

4A3 outcome application/usefulness remains separate. Production releases, main
integration, provider changes, paid-member billing, workflow edits, broad
directory cleanup and protected-core deletion are outside this slice.

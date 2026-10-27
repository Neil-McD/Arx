# Slice 3A2: one founder-approved evidence-backed progress decision

Status: bounded staging acceptance passed October 15, 2026.
[Receipt](../receipts/2026-10-15-staging-founder-progress-approval-3a2.md) and
[structured evidence](../receipts/evidence/2026-10-15-staging-founder-progress-approval-3a2.json).
The approved scope below was implemented and verified. Production remained untouched.

## 3A1 review and present ground truth

No blocking runtime finding in the scoped review. The new adapters establish
current canonical self membership and activation before replay; pending writes
reuse pinned validation; answer freezing, scheduling and canonical receipt commit
share a transaction. The submitted acknowledgment stays distinct from the later
verified transition. Historical exact reads do not require the old visit to remain
pending. The special funnel-builder discovery fence is present.

| Boundary | Rechecked October 15 |
| --- | --- |
| Clean source / branch | `8e473058e2283560e2bc7eebf3078630ca3bc7bc`, `codex/staging-member-progress-3a1` |
| Canonical main | `0a100cfb544851ab06da25f93d8ad549db917ee4`, unchanged |
| Git staging / served staging | `7d039f038fe36fca866a9ec11b189274d0b20e90` |
| Backend | `dev:quick-porcupine-949`; receipt records clean deployment tree `3c578d333a83a8cf1d5da5bff5aec970814fda28`; not remote source attestation |
| Production web | `91d28dc2c986ef88a8a507a269db710d6d28d878`, unchanged |
| Draft PR #175 | Open, unmerged, stacked on #174; no submitted reviews or inline review comments |
| Receipt-head CI | [Release Gate passed](https://github.com/Neil-McD/Arx/actions/runs/38787685958) |
| Fresh focused review | 380 tests / eight files passed; canonical-operation and semantic-repository proofs passed |
| Retained live fixture | Workflow revision 5, no pending forms, two submitted rows including the historical one, one terminal transition; new request, state, transition and configuration match the receipt |

The [3A1 receipt](../receipts/2026-10-15-staging-member-progress-3a1.md) records the
actual native member submit, discarded application acknowledgment, process
restart, identical replay, founder/member private read-back and cleanup. Its final
clean-candidate gate recorded 1,806 tests / 193 files and both audits zero. This
review reran affected checks, not that whole gate or a new live write.

Nonblocking review debt:

- Two MCP contract passages still claimed resource terminal changeset calls were
  discoverable. Reconciled them with the current executor and external smoke:
  terminal agent calls are denied; a staged changeset remains pending product
  review. No capability or runtime change is needed for this correction.
- Several 3A1 denial tests collapse any thrown error into failure. Strengthen
  affected negatives in 3A2 with valid control reads, correctly mounted community
  agents and explicit denial results or expected authorization errors. Do not
  treat an unrelated exception as proof of the intended private boundary.
- The changed-payload retry test covers answer ordering/conflict; its title also
  mentions version conflict without exercising same-key changed-version replay.
  Add that narrow case while extending the affected receipt tests.
- The canonical executor remains large. A new framework or broad decomposition
  is not required to expose this one domain operation.

## Outcome and requirement ranking

**An authorized founder can review one member's verified form evidence, approve
that exact current stage through the existing external harness, and recover an
uncertain response without approving twice or applying an old decision to a new
visit.** This extends package 5 / C17 and one C22 adapter from the
[trunk-down plan](../research/headless-trunk-down-approach-20261014.md).

3A1 proves automatic completion of one configured form requirement. The existing
human-approval transition remains a first-party-only operation. This is a direct
gap for founder-owned coaching/program experiences. This slice does not claim
full headless workflow authoring or completion of every community operation.

Qualitative avoidable-effort ranking; no measured idiot-index ratio is claimed.

| Requirement | Decision / credible minimum |
| --- | --- |
| New workflow engine, task system, approval queue or decision store | Exclude; existing stage, progress, dossier and transition owners suffice |
| External workflow/form authoring, force move and AI assessment together | Defer; different authority and recovery contracts |
| Treat a submitted answer or model verdict as founder approval | Reject; require current human owner/admin authority and an explicit approval operation |
| Export the current first-party mutation unchanged | Insufficient; add canonical receipt recovery and bind the decision to reviewed evidence |
| One current approval observation and one versioned capability | Keep; the smallest external decision contract |
| Reuse current verified action evidence and the canonical transition writer | Keep; prevents an alternate progress truth |

Ontology remains the highest product priority. Package 6's current-source
intelligence/accepted-memory proof follows this bounded founder-control slice.
The July memory certificates use an isolated deployment and retired AI Feed
fixtures; they are historical evidence, not current staging acceptance. Published
resources are source nodes, not automatically accepted learned intelligence.
Neither private form answers nor this approval should silently promote memory.

## Existing owners and minimal change

| Job | Existing owner / bounded adaptation |
| --- | --- |
| Discover exact member | Existing `builder/workflow-members/` directory and private dossier |
| Read stage, activation, transition sequence and action evidence | `resolveBuilderCommunityMembershipContext`, `readWorkflowActionProgress` |
| Approve a stage | `approveBuilderMemberMilestone` -> `transitionMemberForWorkflowAction` |
| Observe result | Existing member self-context and founder dossier/history |
| Recover uncertain operation | Existing canonical receipt reservation/completion in the same domain transaction |

Extract only the approval body needed by first-party and trusted internal adapters;
retain the public RPC's ABI and existing behavior. No duplicated transition writer.

Add an optional builder-only `workflow.approval` observation to the existing
private dossier projection. An eligible observation supplies:

- `membership_ref` (`membership:<id>`);
- `expected_activation_sequence` (nonnegative safe integer);
- `review_ref` (`workflow-approval:v1:<64 lowercase hex characters>`).

Derive the reference from a bounded deterministic snapshot of the canonical
workflow ID/revision, membership/activation, stage key/entry time, transition
sequence, instructions/goal/approval mode, action definitions and exact verified
completion evidence. Frozen form answers and immutable versions remain readable
through their existing private evidence paths; do not create another copy of them.
Recompute authority snapshots from records during execution, never from a supplied
projection. A hash is an observation fence, not permission or an approval token.

The existing `readCompletionReviewSnapshot` is **goal-assessment-specific**: it
returns null for an empty goal and imposes model-envelope limits. Do not invoke a
model, invent a goal, or relax its eligibility to manufacture an approval reference.
Reuse the existing progress reader; keep the approval observation bounded and
specialized. Share a small pure identity helper only if it removes real duplication.

For this new external capability, eligibility requires a current active visit,
`requireHumanApproval: true`, at least one configured action, complete verified
evidence and a complete bounded scan. Zero-action approval compatibility stays
with the existing reference RPC; it is outside this new capability's guarantee.
Incomplete, stale, unavailable, oversized or truncated observations offer no
executable review reference. The live stage has no written goal and one form.

## Proposed external contract

- Keep the five tools. Add `community.workflow.approve_milestone`, version 1,
  through `polynet_call`, targeting exactly
  `/communities/<slug>/capabilities/community.workflow.approve_milestone.json`.
- Input is only `membership_ref`, `expected_activation_sequence` and `review_ref`,
  plus the existing envelope `idempotency_key`. Use separate typed fields; do not
  widen admission's `request_ref` or form-reference validators.
- Discover/execute only for a currently authorized human owner/admin principal
  (`personal_agent` / `external_mcp`). Ordinary members, moderators, community
  agents, inaccessible communities and funnel-builder projections are denied.
- No caller-selected actor, free-text goal verdict, force flag, stage target,
  arbitrary workflow mutation, bulk approval or agent-assessment bypass.
- An external harness acts on behalf of the authenticated founder. Receipt
  attribution must not imply unaided human authorship or an AI-verified goal.

## Transaction and retry guarantees

The new internal owner first rechecks current community lifecycle, funding,
manager authority, canonical target membership and exact activation. These checks
precede completed-receipt replay. Do not require the old stage to remain current
when returning a completed historical acknowledgment.

For new execution, reserve the key against operation/version/member/activation/
review identity, recompute the current eligible observation, compare its reference,
and call the shared approval owner. Transition, approval attribution, existing
visit cleanup/next-stage scheduling and completed receipt commit together. A
receipt-completion fault rolls all those effects back.

| Situation | Required behavior |
| --- | --- |
| Fresh observed approval | One canonical transition with actual action evidence and founder approval attribution |
| Same actor/key/payload after movement or completion | Original historical acknowledgment, `deduped: true`; no second transition or scheduling |
| Same key, changed member/activation/review | Conflict after current scope authorization; no changed decision |
| New key with old observation | Reject stale/unavailable review; never approve the next stage implicitly |
| Workflow, stage visit, evidence or approval mode changed before execution | Reject stale review; read a new observation |
| Actor loses manager access, subject is revoked/blocked/reactivated, community archives or funding suspends | Deny, including historical replay under changed authority/activation |
| Incomplete actions, zero actions or truncated scan | Deny; no force path or empty-success interpretation |

Return `approved` with the real transition reference and existing owner's
completion/movement result. It proves the authorized decision, not a business
outcome beyond the reviewed requirement. Do not return private answers in receipts.

## Proposed staging fixture and live proof

Read-only inventory found an existing quiet candidate:

| Field | Observed October 15 |
| --- | --- |
| Community | `exact-build-canary-234c2972`, `jx7by3s07d0hd6z47613245b3s8c5ex0` |
| Founder for this fixture | `jn70qrjgn0pb16q2rf90bg1b518c3qjd` (the prior ordinary test member) |
| Ordinary member for this fixture | `jn7ckswapk976rra6egsxydm0x82a7nc` (the prior founder account) |
| Member membership | `ks72c8mdnebazbp5rkjevgftzn8c50t3`, member, active, activation 1 |
| Scope | No other active member outside the two actors; roster scan not capped |
| Existing workflow / form / member requests / transitions | None / zero / zero across pending, submitted and cancelled / zero |
| Access | Current access resolver reports owner+management for founder, member+no resource management for member; both entitled and can enter/read |
| Funding mode / lifecycle | `subscription_required` / active |

The access resolver was queried read-only using the development CLI's explicit
identity facility. This is metadata corroboration, **not a fresh native OAuth
proof**. At implementation, refresh exact identities through native OAuth and
read current access/funding/configuration/history before any mutation. The global
platform-owner role does not substitute for this fixture's community member role.
Save and hash its original empty configuration outside the repository. If the
candidate changes or contains unrelated work, stop fixture setup and reconcile;
do not clear it or switch communities silently.

Proposed proof after implementation approval:

1. Actual fixture founder uses existing authoring UI/RPCs to publish one new
   synthetic one-required-question form and create one terminal stage: empty
   goal, human approval required, one fresh human-contribution -> request-form rule.
2. Actual fixture member posts one synthetic marker through the ordinary composer
   without mentions. Use 3A1 native self list/read/submit to freeze one answer.
3. Observe **zero transitions** after normal reconciliation: submitted evidence
   must wait for founder approval. Member/self reads cannot approve it.
4. Founder native OAuth reads the actual private dossier, exact submitted evidence
   and eligible approval observation. Persist the sanitized approval envelope.
5. Make one authorized synthetic founder approval, discard its first application
   acknowledgment, and independently verify one transition with approval actor,
   exact form/run evidence and no forced-move marker.
6. Restart the founder client and replay the exact saved envelope. Verify original
   acknowledgment with `deduped: true`, unchanged transition/receipt counts, and
   private founder/member completion read-back. Changed payload and a new key
   with the old observation must not create another decision.

Retain the synthetic post, form/version/request, workflow/run, approved transition,
receipt and resulting configuration. Preserve the completed 3A1 fixture and all
2A/2C1/2C3/2C4 history, especially the October 22 denial deadline.

## Verification and exit

Before release: focused form/approval/progress/executor/receipt tests, both
typechecks, semantic/MCP/operation/verified-identity proofs and a clean exact-candidate
full release gate. Add meaningful cases for observed-evidence drift, approval mode,
manager loss, target activation, revocation/block/archive/funding, duplicate
membership pairs, cross-member/community, mounted community-agent and moderator
controls, complete/truncated scans, first-party compatibility, same/new-key races,
receipt rollback including scheduled work, and replay after movement.

Implementation branched `codex/staging-founder-progress-approval-3a2` from
the reviewed 3A1 source in the attached staging worktree. Release only the explicit
staging Convex selector and Git staging; verify the served candidate/backend
provenance, push staging before the feature branch, and use a stacked draft PR.
No deployment or runtime change is authorized by this planning document itself.

Exit requires actual native founder approval/restart/retry and exactly one
canonical approved transition. Local concurrency/rollback/stale/revocation faults
are separate evidence. End isolated native clients, remove their local OAuth
credentials, verify fresh auth-required behavior/config hash, sign out web test
sessions and close owned tabs. Local logout is not provider-wide revocation.

No production change, payment, provider setup, test-requested inference, goal
assessment, forced movement, private-answer promotion, full external authoring,
global cleanup or automation. Leave the completed 3A1 fixture intact.

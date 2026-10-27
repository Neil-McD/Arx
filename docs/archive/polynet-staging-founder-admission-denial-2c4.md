# Slice 2C4 proposal: denial, cooldown and reapplication

Status: **scoped staging acceptance passed October 15, 2026**. One live denial,
discarded-response recovery after native process restart, unchanged cooldown,
public re-entry denial and cleanup are verified. Full seven-day expiry and
same-ID reapplication are controlled-time local proof; elapsed live reapplication
remains unobserved. See the [execution receipt](../receipts/2026-10-15-staging-founder-admission-denial-2c4.md).
Production is untouched. Step 1 requirements were reconciled; Step 2 excluded
unnecessary infrastructure; Step 3 verified the remaining bounded adapter.

## 2C3 review and baseline

No blocking runtime finding in the scoped 2C3 change. It reauthorizes the current
manager before execution and historical replay, binds the observed application,
and commits the admission effects and recoverable receipt in one transaction.
The [2C3 receipt](../receipts/2026-10-15-staging-founder-admission-approval-2c3.md)
records one actual free admission, discarded-response recovery after a native
client restart, normal leave, and historical replay without restoring access.
These are recorded live observations; this review did not repeat those writes.

| Boundary | Rechecked October 15 |
| --- | --- |
| Clean source before this plan | `19b38eea33b6f0a5fa13f4fd4ab5324533655669`, `codex/staging-founder-admission-approval-2c3` |
| Canonical main | `0a100cfb544851ab06da25f93d8ad549db917ee4` |
| Git staging / served staging runtime | `76b83959942c65392b7ce0a12fb15f6726f6f453` |
| Staging backend | `dev:quick-porcupine-949`; prior clean deployment source tree `e9dbb94b93b29f11d05d7ed9f05fb516ea9500ef`, not an independent remote tree attestation |
| Production web | `91d28dc2c986ef88a8a507a269db710d6d28d878`, unchanged |
| Draft PR #173 | Open, unmerged, stacked on #172; no submitted reviews or inline review comments |
| Latest receipt-head CI | [Release Gate passed](https://github.com/Neil-McD/Arx/actions/runs/38776123439) |
| Fresh local review check | 131 tests passed across canonical executor, canonical receipts, join-request core and community access lifecycle |

The prior clean candidate gate records 1,735 tests / 192 files and both dependency
audits zero. This review reran the focused four files, not that full gate.

One bounded test finding: `convex/polynetCanonicalExecutor.test.ts:3089` catches
every exception for the archived case, including an assertion failure. The
separate internal-mutation rejection remains asserted, and the existing queue
test expects `community_archived` explicitly. Replace the broad catch with an
explicit archived rejection assertion when extending the decision tests. This is
a validation gap, not evidence of an observed runtime authorization bypass.

## Requirements and avoidable effort

Source: the founder operations branch of the
[trunk-down plan](../research/headless-trunk-down-approach-20261014.md), the user's
request for denial/cooldown/reapplication, and existing domain behavior. The
minimum outcome is a founder rejecting one observed application, an applicant
seeing when another application is allowed, and retries preserving that decision.

The ranking is qualitative estimated avoidable effort, not measured cost ratios.

| Candidate requirement | Classification / effort above credible minimum |
| --- | --- |
| New decision table, job engine, scheduler, public tool or generic membership writer | Exclude; highest avoidable complexity. Existing transaction, request row and receipt owners suffice. |
| New cooldown policy, configurable duration, caller clock or scheduled reopening | Exclude; high avoidable complexity. Seven days and lazy reopening on normal join already exist. |
| A separate reapplication command or second applicant status projection | Exclude for this slice. Existing authenticated public join and access projection supply both jobs. Applicant MCP onboarding remains a separate contract. |
| Appeals, reasons, messaging, bulk rejection, paid admission, restoration or member removal | Defer; separate policy and side-effect contracts. |
| One versioned denial through existing `polynet_call` | Keep; smallest missing founder action. |
| Current authority, observed attempt, atomic receipt and historical retry | Keep; necessary to prevent stale decisions, false authorship and cooldown extension. |
| Exact seven-day boundary and same-ID reapplication proof | Keep; required by the existing policy and reused request IDs. |

Seven days is the current product policy in `COMMUNITY_JOIN_REAPPLY_COOLDOWN_MS`,
not a universal necessity. This slice verifies that policy; changing it requires
a separate product decision. Fourteen-day removal cooldown is a different owner.

## Existing state model to preserve

| State / action | Existing owner and result |
| --- | --- |
| Pending → deny | `denyCommunityJoinRequestCore`: same row becomes denied; server decision time, seven-day `reapplyAt`, updated timestamp. |
| Denied → repeated denial | Core preserves the original timestamps; it does not restart the cooldown. |
| Applicant status | `communityAccessQueries.getMyCommunityAccessBySlug` → `mapCommunityAccessRow` exposes own request status and reapply time. Current web derives its display from that projection. |
| Join before expiry | `communityPublic.joinPublicCommunityBySlug` returns `approval_denied` and original `reapply_at`; no membership grant. |
| Join at or after expiry | For approval entry, normal join reopens the **same row ID** as pending, clears denial fields, and replaces both creation and update timestamps. Eligibility is `now >= reapplyAt`. |
| Cancel while denied | `cancelPendingCommunityJoinRequest` returns ignored and preserves the denied row. |
| Expiry alone | No automatic pending request or access grant. The applicant must request again. |

Scope all positive proofs to unchanged approval entry, active community and
operational funding. Paid/open entry changes have their own existing semantics;
do not claim the approval cooldown governs every possible policy change.

## Proposed external contract

- Add `community.admission.deny`, version 1, discovered through existing
  `polynet_list` / `polynet_read` and executed through `polynet_call`.
- Exact target: `/communities/<slug>/capabilities/community.admission.deny.json`.
- Reuse the approval input: exact `request_ref`, canonical ISO
  `expected_created_at`, `expected_updated_at`, and envelope `idempotency_key`.
  Reject extra fields, caller identity, clock, role, reason and duration overrides.
- Restrict discovery and execution to the current human owner/admin builder lane.
  Preserve existing first-party moderator rights. No community-agent or special
  funnel-builder exposure.
- For a new decision, retain 2C3's narrow eligibility: canonical current unique
  pending request, approval entry, non-owner/unblocked applicant, and no existing
  membership or subscription. This is intentional initial capability containment;
  denial does not intrinsically require all free-admission restrictions.
- Return a minimal historical result: denied status, request/applicant refs,
  `denied_at` and `reapply_at`, with the existing canonical receipt. No email,
  private applicant details, role changes or membership effects.
- A request ID is insufficient: the two observed timestamps bind the attempt.
  Current manager authority must be checked before completed-receipt replay too.

## Transaction and retry rules

1. Reauthorize through `requireCommunityManager`; validate input and reserve the
   existing scoped canonical receipt. Include operation/version and both observed
   timestamps in the fingerprint, as approval does.
2. If that actor/key already completed this exact decision, return its historical
   result with `deduped: true`. Never re-run denial against the current row.
3. Otherwise require the exact current pending attempt and narrow eligibility;
   invoke the existing denial core with the server clock and seven-day constant.
4. Write one critical denial audit keyed by **request plus application attempt**,
   then complete the existing receipt in the same transaction. A completion
   failure must roll back denial, audit and reservation together.

The bare request ID cannot be the denial audit key: it survives reapplication.
Use the immutable observed creation/update pair in a deterministic attempt key.
Use the existing audit owner; no new audit storage or free-form metadata.

| Retry / race | Required behavior |
| --- | --- |
| Same actor/key after lost response or restart | Original result; unchanged denial/cooldown and one receipt/audit. |
| Same key, changed observation or approve-versus-deny operation | Idempotency conflict; never reinterpret the committed decision. |
| New key or other actor after another decision wins | Reject unavailable/stale state; do not fabricate authorship of an existing denial. |
| Original completed denial key after elapsed reapplication | Historical denied result only; current pending attempt stays pending. |
| Old observation with new key after reapplication | Reject even though the request ID is unchanged. Test both approve and deny. |
| Concurrent approve, deny or cancellation | One valid transition wins; losing action cannot grant or extend cooldown. |
| Manager loses authority | Reject even historical replay without disclosing its result. |

Existing first-party decision RPCs accept a request ID without observed timestamps.
Preserve their compatibility in this slice. A delayed old first-party ID-only
command is not covered by the new attempt-fencing guarantee; migrating that
contract and cached clients is separate work. Immediate competing first-party
decisions remain part of the transaction race tests.

Reuse small shared approval/denial validation or receipt construction only where
the second operation creates actual duplication. Keep operation-specific domain
rules explicit; do not build a generic workflow or decision framework.

## Ordered implementation and proof

1. Branch from the reviewed 2C3 head in the attached staging worktree. Recheck
   clean source, Git staging, served build and explicit staging Convex selector.
2. Add the bounded denial adapter and atomic domain mutation using existing
   owners. Update the MCP contract and fix the archived assertion alongside tests.
3. Run focused tests and both typechecks, identity/semantic/operation proofs,
   then the existing release gate from a clean candidate. Required new tests:
   - owner/admin success and forbidden actor/direct-domain paths;
   - strict input, stale/ambiguous/cross-community/ineligible state and authority
     changes, including completed-receipt reauthorization;
   - completion rollback, discarded response, same/different keys and actors,
     cross-operation key conflict, and competing first-party decisions;
   - full seven-day public-flow tests at `reapplyAt - 1`, `reapplyAt` and
     `reapplyAt + 1`, with repeated joins and cancellation unable to bypass or
     extend cooldown; use controlled local time, not shortened runtime policy;
   - same-ID reopening, updated observations, stale approve/deny rejection,
     historical denial replay, and a new denial producing a distinct audit;
   - no membership/subscription/activation/email/workflow side effects.
4. Deploy only the validated staging candidate through the established staging
   path. Open a stacked draft PR and record exact source/build/backend provenance.
5. Perform one identity-bound live denial with the known synthetic applicant and
   quiet approval community, after fresh read-only preflight. Create pending via
   ordinary public join; founder discovers/reads it; applicant cannot read the
   founder document or protected context. Deny once, discard the first response,
   restart the founder client, and recover the original result with the same key.
6. Confirm the pending queue no longer lists it; the applicant's own public
   projection displays denial/reapply time, immediate join remains denied, and
   cancellation preserves the row. Check membership/subscription absence and
   unchanged named activation/email/workflow state. Keep earlier 2A/2C1/2C3
   evidence intact. Verify logout/credential cleanup and record residual state.

## Honest acceptance boundary and cleanup

Local controlled-time tests prove the expiry boundary and complete reapplication
cycle. The initial live run proves actual denial, retry recovery, current access
boundaries and immediate cooldown enforcement. **It cannot prove seven days of
elapsed live time.** Record that gap explicitly; a later ordinary public join
after the recorded deadline can close it. No follow-up automation is part of this
proposal, and no time backdating, policy shortening or forged mature fixture is
allowed to manufacture that evidence.

Unlike 2C3's leave cleanup, the valid final state includes one intentionally
retained denied synthetic request, its original deadline, audit and completed
receipt. Do not delete/reset it to report zero rows. At natural expiry it can be
reopened through normal join and, if desired, canceled while pending. Remove
temporary local credentials/processes and sign out the test web session; retain
historical server evidence. Record the exact fixture and deadline in the receipt.

2C4 is complete only when the candidate gates and scoped live proof pass and the
receipt clearly distinguishes local reapplication proof from unobserved elapsed
live reapplication. No main merge, production release, production backend write,
paid admission, restoration, role change or broader onboarding expansion.

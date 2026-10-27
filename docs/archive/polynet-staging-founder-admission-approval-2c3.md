# Slice 2C3 proposal: approve one fresh, free admission

Status: scoped staging acceptance passed October 15, 2026. One synthetic free
admission, discarded-response recovery, native process restart, normal leave and
non-restoring historical replay are verified. See the
[execution receipt](../receipts/2026-10-15-staging-founder-admission-approval-2c3.md).
Production is untouched. Elon algorithm: Step 1 requirements reconciled; Step 2
excluded unnecessary infrastructure; Step 3 verified the remaining adapter.

## 2C2 review and refreshed baseline

No blocking finding in 2C2's bounded, read-only queue contract. The domain reader
checks current manager authority, uses indexed pagination and rejects ambiguous
request pairs. The adapter projects only canonical pending requests, keeps them
out of search, and exposes no decision operation. The identity guard correction
distinguishes public caller arguments from trusted internal actor arguments;
it does not replace runtime identity verification.

| Boundary | Rechecked October 15 |
| --- | --- |
| Clean source before this plan | `f52859bcb230dbc22a096d5d0c73e2335ea36a17`, `codex/staging-founder-admission-queue-2c2` |
| Fetched canonical main | `0a100cfb544851ab06da25f93d8ad549db917ee4` |
| Fetched Git staging / live staging web | `a4319529c90bde037e251e095aa20c3a55318ab3` |
| Staging backend | `dev:quick-porcupine-949`; prior receipt records deployment from backend tree `eadbf3e72539b251c9473145793d71403ea20268` |
| Live production web | `91d28dc2c986ef88a8a507a269db710d6d28d878`, unchanged |
| Draft PR #172 | Open, unmerged, no submitted reviews or inline review comments; [receipt-head Release Gate passed](https://github.com/Neil-McD/Arx/actions/runs/38771577402) |
| Runtime candidate gate | [Run 38765421520 passed](https://github.com/Neil-McD/Arx/actions/runs/38765421520); receipt records 1,699 tests / 192 files and both audits zero |
| Review verification | 95 tests pass across canonical executor, canonical receipts, join-request core and access lifecycle; semantic repository proof and verified-identity guard pass |

The three documentation files changed after the runtime candidate do not
change its backend source. This turn refreshed Git refs and public version
metadata; it did not redeploy or independently attest the remote backend tree.

The [2C2 receipt](../receipts/2026-10-15-staging-founder-admission-queue-2c2.md)
supports live founder non-empty list/read, repeat/fresh conversation, ordinary
public request/cancellation, and native applicant/member private-queue denial.
The later native document-denial probe used a nonexistent selector after
cancellation; it does **not** prove native denial of an existing pending document.
Existing-row negative tests, multi-page traversal and stale-role cases remain
local evidence. Local credential removal is not upstream OAuth grant revocation.
Nothing in 2C2 proves admission writes, workflow execution or notification delivery.

## Requirements and avoidable effort

The product requirement is that a founder can admit a waiting member through a
custom experience while Polynet remains the access authority. Its source is the
founder onboarding loop and headless community-operations branch in the
[trunk-down plan](../research/headless-trunk-down-approach-20261014.md). A request ID,
an OAuth grant or an agent's statement cannot confer admission authority.

Qualitative ranking below; these are mechanism-based estimates, not measured
cost ratios.

| Candidate | Classification / effort above the credible minimum |
| --- | --- |
| New admin API, generic membership writer, role system, decision table or SDK | DELETE from proposed scope; highest avoidable complexity, existing owners suffice |
| Approval plus denial, appeals, bulk decisions and custom policy | Defer; independent state and recovery contracts multiply the proof surface |
| Paid approval, reactivating old memberships, preserving former admin roles | Defer; mixes admission with commerce, restoration and privilege decisions |
| One explicit free approval through existing `polynet_call` | KEEP; closes the next useful read-to-action gap |
| Bind the observed application attempt, reauthorize and fence retries | KEEP; necessary because IDs are reused and actions span transactions |
| Separate new workflow/notification engines | DELETE from proposed scope; preserve existing activation owners and state their effects truthfully |

Choose **approval only** for 2C3. Denial follows as a separately scoped decision:
it retains a denied row, starts a seven-day cooldown, and permits reapplication.
Those mechanics should not be hidden behind an initially generic `decision` enum.

## Ground truth that constrains approval

| Existing owner | Mechanism / implication |
| --- | --- |
| `communityAdmin.approveCommunityJoinRequest` | Authenticated first-party mutation allows moderators; rejects paid entry; activates access and writes a critical approval audit event |
| Its missing-row replay branch | Same-actor historical audit can return success before a current manager check; reuse domain logic, not this branch as external authorization |
| `approveCommunityJoinRequestForFreeAccess` | Can preserve an existing role/access source; external fresh admission must not silently restore old admin or paid membership |
| `communityJoinRequestCore.ensurePendingCommunityJoinRequest` | Reopens a denied row using the same ID with new `createdAt`/`updatedAt`; bind the observed attempt as well as the ID |
| `activateCommunityMembershipCore` | Creates membership, presence baseline, count/activity effects, removes request rows, and can schedule first-join workflow work and milestone timers |
| `emailEvents.enqueueCommunityAccessGrantedEmailInternal` | Uses an activation-marker dedupe key; enqueue is best effort and does not certify delivery |
| `polynetCanonicalReceipts` | Scoped idempotency, fingerprints and attempt leases already exist; reserve/domain write/complete are currently separate calls |

These are prerequisites for a new write contract, not regressions introduced by
the read-only queue. Leave first-party moderator behavior compatible. Do not
perform a broad auth, lifecycle or workflow cleanup as part of this adapter.

## Proposed external contract

- Add one version-1 capability, `community.admission.approve`, through existing
  `polynet_call`. Its exact target is
  `/communities/<slug>/capabilities/community.admission.approve.json`.
  Keep five public tools; no new HTTP family or direct membership endpoint.
- Discover and execute it only in the existing human builder lane: current owner
  or entitled admin, with `requireCommunityManager` inside the domain mutation.
  Reject members, moderators, applicants, outsiders and community-owned agents.
  Recheck current lifecycle, funding, entitlement and block boundaries. A completed
  receipt must not bypass current manager authorization.
- Required input: `request_ref` from the returned queue document,
  `expected_created_at`, `expected_updated_at`, and the existing envelope's
  `idempotencyKey`. Timestamps are the exact canonical ISO values just read;
  validate and compare their millisecond values without rounding. No caller-supplied
  actor, applicant, role, access source, payment bypass or arbitrary mutation body.
- Require this community's current, unique, canonical pending request and both
  observed timestamps. Require current entry policy `approval`, an unblocked
  non-owner applicant, and **no existing membership or subscription row for that
  applicant/community pair**. Do not scan or repair the community. Reject other
  states instead of restoring, upgrading or overwriting them.
- Success creates one ordinary `member` with `free_grant`, through the existing
  activation owner. Preserve its existing presence/count/activity/workflow and
  best-effort access-email behavior. Do not add notification suppression flags or
  a second activation path to make the proof convenient.
- Return a minimal historical decision result: `approved`, request/applicant
  references, membership reference and decision time, plus the canonical operation
  receipt and dedupe indication. No emails or unrelated profile/billing data.
  Approval removes the request from the pending queue; its old document becomes
  unavailable. Historical success does not assert current entitlement or email
  delivery, and must never reactivate a subsequently revoked membership.
- Unauthorized calls reveal no applicant/request state. Authorized stale,
  missing, cancelled, denied, reopened or competing decisions return a stable
  conflict/unavailable result. Same key with changed input returns the existing
  idempotency conflict. A second actor/key must not claim authorship of another
  actor's approval. Unknown legacy success receipts are not a license to grant.

## Atomicity and retry requirement

Use the existing canonical receipt store. Complete the admission result in the
**same Convex mutation transaction** as the domain approval and critical audit.
The installed Convex mutation context supports nested mutations in that same
transaction; a shared receipt helper is also sufficient. Validate the reservation
scope, fingerprint, current attempt ownership and lease before effects. Propagate
completion failures so the whole grant transaction rolls back.

Do not copy the existing action sequence of grant first, receipt completion later.
Do not create a second decision journal or re-run activation to reconstruct a
lost result. After a committed grant with a lost response, the same authorized
actor/key replays the stored historical result. After cancellation, denial,
reapplication, a different-key race or a role change, it must fail without a
grant. After membership revocation, replay can acknowledge the historical approval
but cannot restore access. Concurrent first-party approval/denial/cancellation
must share the same domain state and cause at most one successful grant.

## Execution order and proof gates

1. Recheck this baseline, then branch `codex/staging-founder-admission-approval-2c3`
   from `f52859bcb230dbc22a096d5d0c73e2335ea36a17` in the existing staging worktree.
   Keep the stacked history and distinguish main, staging, source and receipt heads.
2. Add the narrow domain mutation, sharing the existing free-approval helper and
   activation owner. Reuse/complete the existing canonical receipt transactionally.
   Add capability discovery, strict validation and executor dispatch. Preserve
   first-party return contracts and the read queue's privacy boundaries.
3. Reuse executor/access/receipt fixtures. Cover successful owner/admin approval;
   all denied actors; direct internal boundary checks; changed authority/funding/
   lifecycle; wrong community; malformed/ambiguous pairs; paid entry; existing
   active/inactive/privileged/paid membership and subscription rows. Cover same-key
   replay, changed-key/input conflict, different actors, parallel MCP calls,
   first-party races, cancellation, deny/reapply with the same ID, blocked
   applicant, rollback before commit, and lost response after commit. Assert one
   membership/activation/audit/arrival effect and no duplicate notification job or
   workflow scheduling. After a normal revocation, retry must leave access revoked.
4. Run focused suites, semantic/MCP/capability and identity proofs, web/backend
   typechecks and the canonical release gate on a clean candidate. Add no generic
   client harness, unrelated pagination work or broad cleanup.
5. Stage only through the established Git staging and explicit
   `dev:quick-porcupine-949` backend path. No main push, production Convex command
   or direct local Vercel release. Record served web SHA and backend source tree
   separately. A preview success is not a production deployment.
6. Before live approval, reconfirm an authorized synthetic applicant, exact
   founder identity and a quiet approval-gated community with no applicant
   membership/subscription/request history to overwrite. The former 2C2 candidate
   is a candidate only; recheck it. Inspect join workflows, timers, email recipient
   and delivery configuration first. Do not change policies or disable global
   workers to manufacture a quiet proof. The implementation authorization covers
   one synthetic grant and its normal notification; no unrelated recipient or
   message is in scope.
7. Through the normal public funnel create one request, confirm pending/no access,
   then use founder native MCP to list/read its returned path. While it exists,
   prove actual applicant native denial using that exact path. Approve once with
   the explicit expected timestamps and key. Verify request removal, one domain
   grant/audit/receipt, and the applicant's positive member-context access while
   private founder paths still deny. Use direct tool calls without inference.
8. Discard the first successful application response and retry the identical
   operation from a fresh conversation/process. Require the same membership and
   decision references with no repeated domain effects. This is discarded-response
   recovery, not a claimed TCP fault or live lease-reclaim test.
9. The synthetic member leaves through the normal public lifecycle. Confirm the
   new membership is absent (normal non-platform-home leave deletes it) and context access denies; replay the old approval
   cannot restore it. Retain truthful audit/receipt history; do not manually erase
   evidence. The normal leave behavior differs from the earlier inactive fixture. Remove isolated local credentials/processes;
   preserve the earlier 2A revoked fixture and 2C1 contribution. Record email enqueue
   separately from delivery, exact side effects, residual test history and unchanged
   production in the receipt. Do not erase evidence or reactivate older fixtures.

The admission-approval slice is complete only when those scoped local and live
gates pass, or the receipt explicitly names an unmet live gate without claiming
acceptance. Next, separately scope denial/cooldown/reapplication with the same
atomic receipt and current-authority principles. Broader restoration, paid
admission, role administration and bulk policy remain later contracts.

# Slice 2C2: bounded founder admission queue

Status: scoped staging acceptance passed October 15, 2026. Native founder,
applicant/member denial and cancellation proofs are complete, with their exact
limits in the [execution receipt](../receipts/2026-10-15-staging-founder-admission-queue-2c2.md).
Production is unchanged. Admission decisions remain outside this slice.

## 2C1 review and current baseline

No blocking finding against 2C1's bounded contribution/replay claim. Its three
changed files are documentation/evidence; the backend tree is unchanged. The
retained canonical root still matches the recorded fingerprint and marker,
remains live and founder-attributed, and has one completed scoped operation
receipt with the original ref. The compressed observation fingerprints validate.

| Boundary | Rechecked October 15 |
| --- | --- |
| Source / clean worktree before this plan | `89c094da4cd88c7f741ec77d9115db632b3596de` |
| Git staging / served web | `09e1ca37e7ae0dd3fc48d4cf249526b5ea4c30bc` |
| Staging backend / source tree | Inherited `dev:quick-porcupine-949` / `9dd6ee743bd4869c68047283d38e457bdf600058` |
| Canonical main | `0a100cfb544851ab06da25f93d8ad549db917ee4` |
| Production web | `91d28dc2c986ef88a8a507a269db710d6d28d878`, unchanged |
| PR #171 | Draft, unmerged, checks green; no submitted reviews |
| Review checks | 59 canonical executor/receipt/channel tests pass again |
| Admission owner checks | 20 join-request core/access-lifecycle tests pass |

The [2C1 receipt](../receipts/2026-10-14-staging-founder-contribution-2c1.md) certifies
application-discarded response recovery, not a TCP failure, live receipt-lease
reclaim, revoked founder writes, workflow progress or a full custom app. The
scratch helper's stale-client correction was not a Polynet runtime fix or a new
durable regression harness. Chrome callback rendering remains a separate client
limitation. Neither justifies a new auth layer or SDK for this next slice.

## Step 1: choose the next irreducible gap

The [trunk-down order](../research/headless-trunk-down-approach-20261014.md) places
community operations after the first independent contribution proof and before
progress expansion. Founders currently have first-party join-request operations,
but the five-tool namespace has no supported admission queue projection. The
first useful operation is seeing who is waiting, before granting anyone access.

Qualitative effort ranking; no measured cost ratios are claimed:

| Candidate | Minimum outcome / decision |
| --- | --- |
| Founder inspects pending applicants | KEEP: one bounded list and exact read through existing tools/domain ownership |
| Generic admin API, SDK, event bus or new role system | Highest avoidable effort; exclude |
| Creation/funding, approval/denial, role changes and removal | Separate write contracts with money/access/recovery effects; defer |
| External form submission or progress execution | Subsequent domain adapter; do not infer progress from agent-attributed posts |
| Resource pagination or another OAuth client matrix | Separate gaps; do not bundle |
| Hardening the scratch client into a framework | No demonstrated requirement; use explicit process/thread binding in a minimal proof |

Step 1 requirements were reconciled at execution. Step 2 excluded new tools,
new role ownership and admission writes. Step 3 implements and verifies the
remaining read adapter; no acceleration or automation expansion is required.

## Exact contract and ownership

- Extend `polynet_list` and `polynet_read`; keep the public tool count at five.
  Proposed paths: `/communities/<slug>/builder/join-requests/` and returned
  `/communities/<slug>/builder/join-requests/<request-id>.md` documents.
- Pending requests only. List returns exact document paths, canonical applicant
  references, status and timestamps. Exact read returns the same minimal pending
  request projection. Use existing public identity projection rules; omit emails,
  legacy free-text messages, billing, form answers and unrelated profile details.
- First slice uses the existing founder builder lane, owner/admin, plus the
  domain's current manager authorization on every page/read. Do not substitute
  a client role flag for `requireCommunityManager` or turn it into a new permission
  system. Existing moderator first-party behavior stays intact; this slice does
  not add moderator MCP parity. Ordinary members, pending applicants, outsiders
  and community-owned agents must not obtain the queue or detail.
- Add a paginated reader and exact reader in the existing admission domain,
  reusing canonical join-request validation and public identity mapping. The
  existing `communityAdmin.listCommunityJoinRequests` remains compatible for its
  callers; do not mechanically expose it as a new public MCP tool.
- Use the existing `by_community_status_createdAt` index, pending status, native
  pagination and a cursor scoped to actor/community/query. Default 20; accept
  the existing list contract's 2–50 range. No collection-wide scan then slice,
  silent truncation, invented total count or infinite client retry.
- Reauthorize before using a cursor or resolving a request. Reject malformed or
  foreign-scope cursors; a cursor/request ID is a locator, never access authority.
  Exact reads must match both community and current pending state. Missing,
  cancelled, decided or wrong-community requests fail closed. Do not repair or
  migrate malformed legacy rows during reads.
- Discover this directory only in authorized builder listings. Mark it
  non-writable and non-searchable; keep its private data out of broad community
  search, shared resources, accepted intelligence and member context. Add no
  approval/denial capability or new `polynet_call` input in this slice.

Existing owners: `communityAdmin` owns manager review and approval;
`communityJoinRequestCore` owns canonical pending/denied/cancellation state;
`communityCore` owns current manager, entitlement and block checks. Approval
activates membership, records critical audit and can enqueue access-granted
email. Those effects are deliberately outside the read adapter.

## Fixture and acceptance sequence

1. Start `codex/staging-founder-admission-queue-2c2` from the 2C1 receipt head in
   the existing staging worktree. Reconcile main, served staging and both backend
   targets before editing. Preserve the 2A revoked fixture and 2C1 contribution.
2. Add local behavior cases: owner/admin positive list/read; member, applicant,
   outsider and community-agent denial; stale admin entitlement/role; wrong
   community/request; cancelled/decided/malformed request; empty queue; multiple
   advancing pages; stable termination; invalid and foreign-scope cursors;
   advertised bounds and no domain mutations. Keep existing first-party contracts.
3. Local pagination must use more rows than a page. Reuse the existing executor
   and admission test fixtures. Extract only genuinely shared mapping/query logic;
   do not build a generic queue framework or duplicate the membership owner.
4. Run focused suites, semantic/MCP/privacy contract proofs, web/backend typechecks
   and the canonical gate on the clean candidate. Release only the explicit
   staging targets through the established procedure; record backend source/tree
   separately from served web SHA. Any web release uses Git staging, never a
   direct local Vercel release. No main or production release.
5. Native founder OAuth uses an isolated `polynet_2c2_staging` alias and Keychain,
   with the same known founder fingerprint and explicit current process/thread
   binding. Native tool calls are list/read only, with no inference turn.
6. Prove a non-empty queue using a disposable synthetic pending request. Read-only
   preflight found `builder-canary-aug-6-2026-v3` is approval-gated and owned by
   the 2C1 founder; the existing member test identity has zero membership,
   request and subscription rows there. Recheck active/unblocked status and
   funding/current access. Create at most one request through that test member's
   existing public funnel flow, require `approval_pending`, and verify that no
   membership/subscription/access grant materializes. No forged identity, raw
   membership insertion, legal acceptance or community-policy change is part of
   fixture setup. Treat fixture/session writes separately from read-only MCP calls.
7. Founder discovers the directory, reads the returned document, repeats both
   reads and starts a fresh client conversation. Require the same applicant
   fingerprint, status and request identity with no mutation. Member/applicant
   calls and the existing inaccessible-community control must deny.
8. The test applicant cancels only its newly created request through the existing
   normal funnel flow. Verify the queue is empty and the previously returned
   detail path now denies, with membership/subscription state still unchanged.
   Preserve unrelated requests, prior revoked membership and contribution history.
9. Remove only test credentials, close test processes and log out the test web
   session. Save a dated sanitized receipt separating local paging/stale-role
   tests, live non-empty list/read, cancellation denial, fixture effects, cleanup,
   source/deployment identity and unchanged production. An empty-only live read
   does not complete acceptance. Live multi-page traversal is claimed only if
   actual prepared fixtures demonstrate it; otherwise it remains local evidence.

No fixture or permission changes were made during this planning pass. Bounded
discovery found no pending rows in the founder's 19 approval-gated communities;
the selected candidate has no existing applicant state to overwrite. Recheck
these facts at execution; stop dependent gates if preconditions fail.

After this passes, separately scope one explicit admission decision, including
its access, audit, notification, conflict and retry policy. Do not expose a
general membership mutator or infer that admission writes are already headless.

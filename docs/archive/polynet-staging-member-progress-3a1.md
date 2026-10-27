# Slice 3A1 proposal: one private form to verified member progress

Status: bounded staging acceptance passed October 15, 2026. Production is
untouched. [Implementation and live evidence](../receipts/2026-10-15-staging-member-progress-3a1.md)
record the exact candidate, retained effects and proof limits. The requirements
and exclusions below remain the approved boundary.

This is the first progress slice from execution package 5, principally C17/C18
with one C22 external adapter. It does not require completing every administration
operation or rewriting the existing progress engine first.

## 2C4 review and current baseline

No blocking runtime finding in the scoped 2C4 change. Current manager authority
precedes historical replay; exact observations bind decisions to an application;
denial, attempt-specific audit and recoverable receipt commit together. The
shared approval/denial handling removes duplication without adding a generic
decision engine. The archived assertion now checks the intended rejection.

| Boundary | Rechecked October 15 |
| --- | --- |
| Clean source before this proposal | `5a782d0700d6148ae25622f3451bb11c4b5d8a16`, `codex/staging-founder-admission-denial-2c4` |
| Canonical main | `0a100cfb544851ab06da25f93d8ad549db917ee4` |
| Git staging / served runtime | `32bf8995effd2b4fed485b4e9bc4b0393aaa1653` |
| Backend | `dev:quick-porcupine-949`; prior clean deployment source tree `b869139fe77657e467c942142c12a4840b62df97`, not remote implementation attestation |
| Production web | `91d28dc2c986ef88a8a507a269db710d6d28d878`, unchanged |
| Draft PR #174 | Open, unmerged, stacked on #173; no submitted reviews or inline review comments |
| Receipt-head CI | [Release Gate passed](https://github.com/Neil-McD/Arx/actions/runs/38782465304) |
| Fresh admission review | 173 tests / four files passed |
| Fresh progress foundation review | 198 tests / five files passed: workflow join/completion, workflows/context, forms, timers and member save/retry |

The [2C4 receipt](../receipts/2026-10-15-staging-founder-admission-denial-2c4.md)
records one live denial, native restart recovery and immediate public re-entry
refusal with an unchanged deadline. Its original clean runtime gate records
1,777 tests / 192 files and both audits zero; this review did not rerun that full
gate. Elapsed live reapplication remains unobserved until October 22 at
17:55:59.047 UTC. Existing first-party ID-only decisions remain outside the new
attempt-fencing guarantee. Neither limitation requires widening this progress
slice or resetting the retained denied request.

## Requirement scrutiny

The user outcome is: **an authorized member can read one assigned private form,
submit it through an external harness, recover an uncertain response, and then
read a real evidence-backed progress outcome.** Its source is the approved
headless direction and package 5 of the
[trunk-down plan](../research/headless-trunk-down-approach-20261014.md).

Qualitative avoidable-effort ranking; no measured cost ratio is claimed.

| Candidate | Decision / credible minimum |
| --- | --- |
| New workflow engine, progress store, SDK, public verb or universal task system | Exclude; highest avoidable complexity. Existing domain owners already perform the loop. |
| Form authoring, autosave, human approval, force move and AI goal assessment through MCP at once | Defer; separate authority, recovery and product claims. |
| Treat a post, submitted answer or agent assertion as goal achievement | Reject. Verify the configured product action and canonical transition. |
| Private assigned-form read plus one final submit capability | Keep; smallest missing external member operation. |
| Reuse pinned versions, revision checks, visit/activation authority and receipts | Keep; necessary for privacy and safe uncertain-response recovery. |
| One ordinary form action with no written goal or approval requirement | Keep for the live proof; deterministic, useful progress without inference or an override. |

The proof verifies completion of the configured form requirement. It makes no
claim that a written coaching/business goal was achieved. Automatic completion,
human approval and force move retain their different meanings.

## Existing owners and missing adapter

| Job | Existing ground truth / proposed reuse |
| --- | --- |
| Define/publish a form | `communityForms`: immutable published versions; preserve the existing authoring UI and RPCs. |
| Assign a form | `communityFormRequestCore.assignWorkflowForm`: workflow/member activation/stage visit/automation identity; repeat triggers reuse the assignment. |
| Pending list and exact form read | `communityFormRequests.listMyRequests` / `getMyRequest`: current self authority and visit-bound pagination. Add bounded semantic adapters, not another form database. |
| Validate/freeze answers | `communityFormRequests.saveMyAnswers`: exact revision, pinned questions and required-answer validation; submitted answers cannot be overwritten. |
| Reconcile completion | `processSubmittedWorkflowForm` schedules the existing reconciler; `readWorkflowActionProgress` verifies the linked submitted request/version and current action. Dispatch alone is incomplete. |
| Record progress | `transitionMemberForWorkflowAction`: exact workflow revision, membership activation and stage visit; durable transition/evidence history. |
| Read the outcome | Existing `/members/me/context.md` and authorized builder dossier/forms paths. Submitted answers remain private contextual evidence. |

Two constraints matter: channel-contribution intake requires a **human** actor,
so the agent-authored 2C1 contribution cannot be relabeled to satisfy it. Timer
enrollment occurs on real stage entry; adding a timer to an old membership does
not manufacture that event. Preserve both rules.

## Bounded external contract

- Keep the five tools. Add a self-only pending directory
  `/communities/<slug>/members/me/forms/` and exact returned
  `<request-id>.json` documents through `polynet_list` / `polynet_read`.
- Directory discovery reuses the existing indexed current-visit pagination
  protocol (12 items per domain page). Cursors/visit identifiers confer no
  authority. Names and references belong to the caller's own current membership.
- Exact reads return the pinned form version/questions, current answers, request
  revision and minimal assignment/visit metadata. Pending requests must be
  current. Exact submitted reads remain available after completion through
  `readSubmittedFormRecord` and the same current member/activation boundary;
  cancelled or unverifiable rows remain unavailable. Never bypass the pending
  reader by returning arbitrary stored rows.
- Follow existing form limits: at most 30 questions and existing required/choice
  validation, including the 10,000-character text-answer limit. For this bounded
  semantic adapter, cap each serialized exact form document and serialized
  `answers` object at 24,000 characters, matching the current canonical JSON
  document budget. Return `form_payload_too_large` before a write if exceeded;
  never silently truncate question/option schemas. This is a documented adapter
  limit, not a change to larger forms in the reference UI. Preflight the proposed
  submitted document too, so an accepted answer cannot make exact read-back
  exceed this budget. The canary has one question. Test escaping and aggregate
  limits, not only individual fields.
- Add `community.form.submit`, version 1, through existing `polynet_call`, with
  exact target `/communities/<slug>/capabilities/community.form.submit.json`.
- Input: `form_request_ref` (`form-request:<id>`), `form_version_ref`
  (`form-version:<id>`), nonnegative integer `expected_revision`, and `answers`;
  require the existing envelope `idempotency_key`. No draft-save mode, selected
  applicant, membership/workflow selector, caller identity, goal verdict or
  advancement override. Admission's `request_ref` validator remains unchanged.
- Discovery and execution require a human principal acting for self
  (`personal_agent` or `external_mcp`). Do not add this blindly to the current
  member-capability array, which also serves community-owned agents. Community
  agents and special funnel-builder surfaces must remain denied.
- Answer types and required/choice validation reuse `communityFormAnswers` and
  the immutable pinned version. Bound aggregate input and canonicalize answer
  key ordering for request identity without weakening value validation. An
  external submission is authorized on behalf of the member; do not assert
  unaided human authorship.

## Commit, retry and progress semantics

Extract only the existing answer-save domain body needed by first-party and
internal adapters. Retain first-party autosave/submit compatibility. The new
internal member mutation derives actor and exact request ownership server-side,
checks current community/funding/access and matching membership activation,
reserves the existing canonical receipt, calls the shared submit owner and
completes the receipt in **one transaction**. A completion fault rolls back the
answer change and scheduled reconciliation too.

| Boundary | Required result |
| --- | --- |
| New submit | Current pending request/visit, observed revision and pinned version match; validate then freeze once. |
| First response lost; same actor/key/payload | Original submitted acknowledgment, `deduped: true`; no second save, scheduling or progress transition. |
| Same key with changed answers/reference/version | Idempotency conflict; no disclosure or overwrite. |
| New key after submission | Reject unavailable/already-submitted state for this capability; never invent another submission. First-party compatible retries remain separate. |
| Replay after automatic completion/movement | Historical acknowledgment can succeed after current self/community/member-activation authorization; do not require the old stage still to be pending. Never replay progress effects. |
| Revoked, blocked, archived, suspended or reactivated membership | Fail closed, including receipt replay under a different activation. |
| Rule change, stale visit or invalid linked evidence | Existing owners determine eligibility; never force completion to make the canary pass. Valid submission alone does not guarantee movement after configuration/authority changes. |

The submit result says **submitted**, with minimal request/version/revision
references. It does not say advanced/completed. The existing worker separately
validates action completion and records the transition. Only subsequent canonical
progress reads plus transition evidence establish the completed loop.

## Concrete staging fixture and positive path

Read-only metadata inventory found no ready pending assignment among the known
workflow canaries. Completed September fixtures must not be reset. Proposed
fixture: `form-browser-qa-20260911`, community
`jx73pspeb1bk5vsrb7q9e226bs8e66bb`, workflow
`sh7jaebsbmgb871a141erpvz558e75g2`, currently revision 4. The known test member has
active membership `ks77ga7tkc35waggjg9yw20wf98e69bn`, activation 1, no stored
milestone state, zero transition rows and no pending form requests. Its existing one-stage workflow
has a goal and requires approval; it is **not** already the proposed canary.

Fresh preflight before any live setup must confirm canonical actor identities,
operational funding, current configuration/history and the absence of unrelated
active members/work. Save the exact original definition outside the repository
with a hash. If it changed, do not reset it or proceed on these old observations.

1. Using existing owner UI/RPCs, publish one new synthetic one-question form.
   Leave the original published form and historical answers untouched.
2. Through the revision-guarded builder owner, configure the existing single
   stage with an empty goal, automatic advancement and one fresh
   `member_contributed -> request_form` rule referencing the new form. No
   `prompt_agent`, form-submitted follow-on, timer or service-channel action.
3. The actual member posts one synthetic marker through the ordinary human
   composer without mentions. Let the existing trigger create one assignment;
   do not inject a request row or impersonate a human through an agent write.
4. Native member OAuth discovers/lists/reads that exact private assignment.
   Founder self-path probing cannot substitute for the member; the authorized
   builder dossier is a separate manager lane.
5. Persist the sanitized envelope before one external submission; discard its
   first application response. Independently observe the frozen submission.
   Restart the native client and retry the exact original envelope.
6. Let normal scheduled reconciliation run. Verify exactly one terminal
   transition/completion increment, with the exact request/version/run as action
   evidence. Read current self-context and the authorized builder dossier/forms.
   Repeat reads/retry without changing the result or disclosing private answers
   through shared search, another member or a community-agent lane.

This proves external member form submission and progress observation. Definition
authoring and the human assignment trigger still use the reference product.
It is not full external workflow authoring or a complete independent founder app.

## Verification, cleanup and exit

Before deployment, run the affected foundation and executor/receipt tests, both
typechecks, operation/MCP/identity/semantic proofs, and the clean exact-candidate
release gate. Required local cases include private/cross-member/community denial,
pagination/visit rebinding, pending versus submitted reads, immutable version and
required/choice validation, aggregate limits, revision conflicts, submitted-answer
freeze, stale rule/activation/visit, receipt rollback, lost response, concurrency,
safe post-transition replay and revocation. Zero-action stages, incomplete or
truncated scans, human-approval stages and agent-authored contributions must not
become automatic successes. Check retained first-party save/retry behavior too.

Implement on `codex/staging-member-progress-3a1` from the reviewed 2C4 head in the
attached staging worktree after approval. Release only the validated staging
candidate; verify its served build/backend provenance. Push the candidate to Git
staging before the feature branch to avoid repeating the observed skipped-preview
path. A frontend marker alone is not backend implementation attestation.

Retain the synthetic post, new form/version, assignment, workflow run, terminal
transition and operation receipt as linked proof. Keep the resulting synthetic
workflow configuration interpretable; do not raw-delete it or reset completion
to claim a clean baseline. Record the before/after definition and exact retained
effects. Disconnect isolated clients, sign out test web sessions, verify fresh
auth-required behavior and unchanged user config, and close owned tabs.

Preserve the 2A revoked membership, 2C1 contribution and 2C3/2C4 decision history,
especially the October 22 denial deadline. No new payment, production change,
provider setup, test-requested model inference, memory promotion, global cleanup
or automation. Existing unrelated workers are not certified inactive; compare
named records and classify background effects separately.

Exit requires an actual native member read/submit/restart/retry, one verified
progress outcome and private authorized read-back on the identified staging
candidate. Local worker/rollback/concurrency faults remain separate from live
observations. A submitted response, queued reconciliation, UI toast or model
statement alone cannot close the slice. If the worker does not produce valid
evidence, record the incomplete gate and repair only its demonstrated cause.

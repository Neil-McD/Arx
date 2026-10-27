# Slice 3A1: private form submission to verified member progress

**Bounded staging acceptance passed October 15, 2026. Production was untouched.**

[Structured evidence](evidence/2026-10-15-staging-member-progress-3a1.json).
[Approved scope](../archive/polynet-staging-member-progress-3a1.md).
[Draft PR #175](https://github.com/Neil-McD/Arx/pull/175), stacked on #174.

## Release identity

| Boundary | Verified evidence |
| --- | --- |
| Final clean runtime / Git staging / served staging | `7d039f038fe36fca866a9ec11b189274d0b20e90` |
| Initial live submission candidate | `aeb8717c099a9b1ba6cdb3a5d3b963e9c1347f87` |
| Backend | Explicit `convex dev --once --typecheck enable --env-file /tmp/polynet-package-1-staging.env`, exit 0; `dev:quick-porcupine-949` |
| Backend source tree | `3c578d333a83a8cf1d5da5bff5aec970814fda28`; clean local deployment provenance, not remote commit attestation |
| Staging web | Successful [Git staging deployment](https://polynet-staging-muex0nyz5-neil-mcds-projects.vercel.app), GitHub deployment `7101214564` |
| Serving asset | `/assets/index-BbfJWUDb.js`; SHA-256 `b24b7249dfe006344ff1a4b898e8c66981027c30c08ce306e71330336f08edae`; both staging Convex hosts embedded |
| Canonical main | `0a100cfb544851ab06da25f93d8ad549db917ee4`, unchanged |
| Production web | `91d28dc2c986ef88a8a507a269db710d6d28d878`, unchanged |

Staging was pushed before the feature branch. The feature branch also generated
an isolated `Preview – polynet` deployment; this did not change the production
alias. No production release command or provider setting change was used.
Receipt-only commits are separate from the deployed runtime candidate.

Final review removed an advertised forms-directory link from the special
funnel-builder self directory; direct access was already denied. The final
candidate adds that regression assertion and retains the same submit/read and
reconciliation owners. Both clean candidates passed all 15 gate steps. The
initial submission/restart/founder proof ran on the initial candidate; after the
final backend and matching web marker deployed, native member OAuth again
verified the canonical identity and exact submitted read, unchanged completion
and saved-envelope deduplicated replay. The fixture was never reset or resubmitted.
[Initial runtime CI passed](https://github.com/Neil-McD/Arx/actions/runs/38786152112);
final and receipt-head CI are distinct from these exact local gates.

## Implementation and local proof

- Kept five tools and the existing stores. Added self-only pending discovery at
  `/communities/<slug>/members/me/forms/` and exact pinned JSON form reads.
  Twelve-item indexed pages bind continuation to actor, community and stage
  visit. Submitted exact reads survive progress completion under the same
  current membership activation. Private forms are non-searchable/non-writable.
- Added `community.form.submit` v1 for human self principals through
  `polynet_call`. Exact request/version references, revision, typed answers and
  idempotency key are required. Community agents and funnel-builder surfaces are
  denied. There is no authoring, draft, approval or advancement override.
- Extracted the existing answer-save body, preserving first-party autosave and
  retry compatibility. Current membership, activation, community access and
  funding are checked before historical receipt replay. New submissions validate
  the pending visit and pinned version; answers freeze once.
- Reservation, answer save, existing reconciliation scheduling and completed
  receipt commit in one transaction. Submission acknowledges **submitted**;
  the existing reconciler separately verifies action evidence and records progress.
- Exact documents and serialized answers have a 24,000-character adapter budget,
  including JSON escaping and the proposed submitted read-back. Oversized forms
  fail explicitly before writing; question schemas are never silently truncated.
- 379 tests across eight affected files passed. The 29 added cases cover private
  access, replay after completion, changed-key/payload behavior, concurrency,
  receipt-fault rollback including scheduled work, pinned versions/revisions,
  required/choice/unknown answers, aggregate/escaped payloads, pagination/rebinding,
  stale visits/activation, current funding/block/archive/revocation, human approval,
  changed rules and first-party compatibility. Existing foundation coverage retains
  incomplete/zero-action/truncated and human-versus-agent trigger boundaries.
- Both typechecks, semantic repository, canonical operation and verified identity
  proofs passed. The exact clean-candidate gate passed all 15 steps: **1,806 tests /
  193 files**, browser foundation proof, build/bundle checks and both dependency
  audits zero. The final 29-test form regression file also passed independently. Its complete gate record is embedded in the structured evidence.

## Live proof

Used `form-browser-qa-20260911`. Fresh preflight confirmed one active ordinary
member (activation 1), workflow revision 4, no pending forms, no stored progress
state and no transitions. One historical submitted form was present and retained.
Native OAuth verified the distinct canonical member and founder fingerprints.
A protected member-context read established current operational access/funding.

The exact original workflow is retained in the structured evidence and separately
saved outside the repository with SHA-256
`bb4a57054fc26756b1e4da1d7483a55d8e10fa19c4d421439d1820aa7b321926`.
Using the actual founder web session, published one new synthetic one-question
form, then saved the existing single stage at revision 5: empty goal, automatic
completion and one fresh `member_contributed -> request_form` rule. The original
published form and answers were not edited. No timer, agent prompt or service
channel action was introduced. The normal editor autosaved draft revision 2;
exactly one new immutable published version was used.

| Step | Observed result |
| --- | --- |
| Before trigger | Native member pending directory empty; submit capability available |
| Ordinary member web composer | One synthetic post without mentions; canonical actor type `human` |
| Assignment | One pending request, revision 0, pinned one-question version; zero transitions |
| Privacy | Founder self-path exact read denied; ordinary member builder-form read denied |
| First native submit | Exact sanitized envelope saved before dispatch; first application response discarded |
| Independent observation | Answers submitted once at revision 1; normal scheduled reconciliation recorded one terminal transition |
| Process restart | Original PID `78104` exited 0; new PID `83364` recovered using the saved envelope and native stored credentials |
| Exact retry | Original acknowledgment returned with `deduped: true`, status `submitted` |
| Changed answers / new key | `idempotency_key_conflict` / `form_request_unavailable`; no extra submission or receipt |
| Progress read-back | Member self-context and authorized founder dossier showed workflow completion; exact submitted form and builder forms included the new evidence |
| Shared search | Returned the related public trigger post; private answer absent. Pending directory empty |
| Final comparison | Same submitted rows and transition as before restart; one receipt, attempt count 1; one completion increment |

Retained linked proof:

| Record | Canonical reference |
| --- | --- |
| Community / membership | `jx73pspeb1bk5vsrb7q9e226bs8e66bb` / `ks77ga7tkc35waggjg9yw20wf98e69bn` |
| Workflow / revision | `sh7jaebsbmgb871a141erpvz558e75g2` / 5 |
| Human trigger post | `j97qg0z3dch4d2jykm8ypfw0898gbtpy` |
| New form key | `ad979e97-fb5b-46e1-8490-1c142ab28e7f` |
| Pinned version | `tn7j3ma5dww0f5171fngpa2kvd8gawar` |
| Request | `tx7xc84qvs9cm225a4z8tezrsn8gav05` |
| Workflow action run | `t57n1z1t5246c8thctb0qfs1hn8gbyqv`, finished |
| Terminal transition | `t97p51p1ah1dnk3s2gt6d9meq98gaw9s`, sequence 1, `completedWorkflow: true` |
| Completion evidence | Exact request as `source_id`, exact run/action/rule and submitted timestamp |
| Operation key | `staging-3a1-20261015-form-submit-1` |

The submission was recorded at `2026-10-15T18:31:50.319Z`; the terminal
transition at `2026-10-15T18:31:50.638Z`. No forced movement or goal assessment
was used. The proof establishes completion of this configured form requirement,
not achievement of a written coaching or business goal.

## Cleanup and limits

- Retained the synthetic post, form/version, request, run, receipt, terminal state
  and resulting synthetic workflow configuration. No reset or raw deletion erased
  the progress history. Historical submitted form remained byte-for-byte equal.
- Named prior-fixture snapshots match: inactive 2A membership, 2C1 contribution,
  2C3 approval/audit/access-email history and 2C4 denial with unchanged deadline
  `2026-10-22T17:55:59.047Z`. This is not a census of unrelated workers or ordinary
  session, presence, read-cursor and retrieval-log activity.
- Both native aliases logged out; all proof processes exited 0. Fresh processes
  reported `notLoggedIn` and protected reads failed with Auth required. User
  configuration SHA-256 was unchanged. Founder and member web sessions signed
  out; public home showed Sign in. All four owned tabs closed. The final verification client was logged out again;
  a fresh process again required authentication, with the same configuration hash.
- Local disconnect does not claim upstream grant revocation or rejection of
  previously issued tokens. The discarded application acknowledgment is not a
  TCP interruption or crash during transaction commit. Rollback, concurrency,
  revocation and stale-rule faults are local tests, not live fixture mutations.
- Authoring and the human assignment trigger use the reference web UI. External
  member submission/context observation are proven; a complete independent
  founder application and external workflow authoring remain outside this slice.
- No payment, provider setup, test-requested model inference, memory promotion,
  production release, global cleanup or automation was performed.

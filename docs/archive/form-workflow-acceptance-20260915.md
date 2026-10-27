# Forms and workflow acceptance — September 15, 2026

Historical acceptance receipt. The `move_member` condition and user-configured
`evaluate_goal` action described below were retired on September 23. See
`community-member-workflows-foundation-v1.md` for the current contract.

Current status: fresh member submission, progression, saved-answer recovery and
live owner response acceptance passed after the freshness fix below. Remaining
release gates include actual credential renewal and member-side access revocation.
Earlier sections describe the initial read-only pass; later sections record the
new staging fixture, synthetic writes and corrective web deployment.

## Build and scope

- Local code: 707140de97bd56848d79a8bacc666d7bd9df3416 (adds roster evidence only).
- Staging version.json: 06bc2cfdc2708e2bd85a5596946f28d8fb6c4df5.
- Backend inspected read-only: quick-porcupine-949.
- Production/backend deployments and external integrations were not invoked.

## Authority and persistence

The workflow assigns a request tied to one membership activation and milestone
visit. The request pins a published form version. saveMyAnswers checks caller
ownership and community access, validates the active visit and revision, and
stores answers. Submission calls processSubmittedWorkflowForm in the same
mutation; matching form_submitted actions execute with a request-specific receipt.
An identical repeated submit returns the stored result without rerunning actions.
Builder responses validate the membership, activation, community, version, form,
workflow and answer structure before exposing saved evidence.

Member reads use the by_member_visit_status index and pages of 12. Assignment
checks use the complete by_assignment index and cap pending requests at 12 per
visit. Response history scans at most 51 candidates and exposes truncation or
unavailable evidence. These are source-level bounds, not measured latency claims.

## Automated verification

Ran vitest on:
- convex/communityForms.test.ts
- convex/communityMemberWorkflows.test.ts
- scripts/member_form_save.test.ts
- scripts/member_form_pagination.test.ts

All 142 tests passed. Coverage includes published-version pinning, required
answers, repeated assignment and submission, one transition without an agent,
save serialization and lost-response retry, conflicting edits, expired visits,
other-member privacy, manager demotion, and paginated visit changes.

## Live fixture inspection

Workflow Acceptance Sep 7 (`jx7280ydfm38xw2beffqkcs4k98e148h`) has two published
forms and workflow revision 4. Its intake invokes an agent as well as progression;
its review invokes goal evaluation. It is not the no-agent acceptance fixture.
The sole member has two existing submitted requests. Nothing was resubmitted.

Form Browser QA Sep11 (`jx73pspeb1bk5vsrb7q9e226bs8e66bb`) has published form
browser-intake revision 1 (three questions), and workflow revision 2 with one
milestone requiring human approval. Its existing submitted request is
tx7njgm6qr498hyxm2kt48nx898e60jg, revision 3, pinned to version
tn7xzpbkyw7wh5tkjbrnxxmxsd8e6yak, with two answered questions.

The owner browser displayed the test member dossier, the requested-form action
as Form submitted / Verified, and Awaiting human approval. Responses displayed
the synthetic text answer, Onboarding choice, and Not answered for the optional
question. This proves current retrieval of historical evidence, not a fresh
submission or automatic transition. Approval was not clicked.
After a full browser reload, reopening the dossier and response showed the same
saved text, selected choice and unanswered optional question.

At the initial acceptance build, workflow navigation still rendered Integrations.
The subsequent forms/workflows launch slice removes that tab and the Agent-page
connection control. Workflow section parsing now admits only Workflows and Forms;
old section=integrations links resolve to Workflows and have the retired section
removed from the URL, including history navigation. The two-tab switcher uses
the actual section count. UI gateway wiring is removed from both entry points;
existing backend services and connection records are unchanged. This is a product
navigation restriction, not a replacement for backend authorization.

Staging build a3a9fb98774448b83733c11d35a177c7cc299a72 was verified through
version.json. A fresh section=integrations link resolved to the workflow board
with the retired parameter removed. Only Workflows and Forms tabs rendered;
Forms listed the published Browser acceptance intake, and browser Back restored
Workflows. The Agent page rendered without the connection control. Nine focused
section/save/pagination tests, web typecheck, build and diff checks passed.
No provider state or backend deployment changed.

Screenshot:
/Users/neilmcdevitt/.codex/visualizations/2026/09/14/01a0a1e9-bd4a-7840-af65-dba2355f5063/form-workflow-acceptance-20260915/saved-response.png

## Remaining gate

The available browser has owner capabilities; no separate test-member session
is available. Do not infer identity from display names: the fixture owner and
member are distinct user IDs even though their user records share a display name.

With the member login available, use an isolated no-agent two-milestone fixture
for draft/reopen, submit, exactly one transition, owner response freshness and
reload, then repeat/lost-response and stale-visit checks. Preserve the existing
agent and human-approval fixtures. No product fix is justified by this pass.

## Fresh member acceptance and demonstrated freshness defect

The isolated in-app browser offered the existing test member's Google login.
Read-only identity comparison confirmed it differed from the owner; normal login
succeeded. Created Forms Release Acceptance Sep15 using included operator access,
with two required short-text questions and Intake -> Ready milestones. A join
requests the published form; submission directly advances, with no agent or
integration workflow action. Existing fixtures were left untouched.

Fixture: community jx70dntfr0aw6mt727tfje48x58ee8bn; workflow
sh7kxhz8n4jzhy2rsfjkczdewn8eejyf; member ks7cegnag715aea6jfkm2bz1b58ee4ag.
The owner approved the dedicated test member's free join. The pending join page
still displayed Request pending at the next observation; direct community
navigation then opened the admitted member view. That admission-page freshness
observation is separate from the form acceptance.

The member saved one answer, closed, reloaded, and resumed at question two.
Back showed the exact original answer. Submission displayed Submitted and the
owner board moved the member from Intake to Ready live. Read-only storage proof:
request tx7sbv2djky1anxrhh5hz2k2kn8eeqmf, revision 2, submitted, pinned version
tn7qt34snyhm3v55ey6mf3qfn18ee4dg; exactly one transition,
t97n39wy6xwrapb28tzy8tvath8egw8y, sequence 1, Intake -> Ready.

The owner Responses tab was open before submission and stayed empty despite the
live dossier changing to Ready. Its one-shot read lacked invalidation. The fix
uses the live dossier's submitted-form evidence as its refresh dependency while
retaining the full response endpoint (dossier prose is deliberately truncated).
Existing rows/disclosures remain during same-scope refresh; failed reads clear
private answers; scope keys and callback cancellation remain enforced.

Eight real-component browser assertions passed for first arrival, retained open
disclosures, superseded callbacks, access-error clearing and member changes.
All 142 form/workflow/save/pagination tests, web typecheck and build passed.

### Corrected-build live retest

Verified staging a0bab617cd5ab0dd4196ba49c79c4a7f2667db75. Added a fixture-only
request-form rule in Ready triggered by a synthetic contribution from the test
member, visible only to the two accounts in this fixture. The existing first
response remained expanded in the owner's Responses tab before the second submit.
The new response appeared there without tab switching or manual refresh; the
first disclosure remained expanded, and opening the second showed the exact new
answers. The member saw Submitted and its pending next step disappeared.

The second request is tx7q0ap64hzcw3w1zsf9skrp5x8ehjqy, revision 2, submitted,
pinned to the same published version. Existing action-completion semantics also
completed Ready, producing transition t97h9h9bpc30sftq7tfzw529r58egc90, sequence 2.
Thus this was not a no-transition test: final storage has two submitted requests,
one Intake -> Ready transition and one Ready -> completed transition. Configured
workflow actions are request_form, move_member, request_form only.

Screenshot: /Users/neilmcdevitt/.codex/visualizations/2026/09/14/01a0a1e9-bd4a-7840-af65-dba2355f5063/form-workflow-acceptance-20260915/fresh-live-responses.png

Both authenticated sessions are preserved for the remaining renewal/access checks.
After a full owner reload, workflow completion and both submitted responses remained
available in the dossier.
Production and backend deployment remain unchanged. The new staging fixture and
its synthetic submissions/history are retained as acceptance evidence.

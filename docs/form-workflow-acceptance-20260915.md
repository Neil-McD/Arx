# Forms and workflow acceptance — September 15, 2026

Status: automated contract and existing owner-view checks pass; fresh authenticated
member-to-builder acceptance remains open. No production or staging data changed.

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

# Integration staging candidate — 2026-09-12

## Baseline and scope
- Candidate branch: codex/integration-staging-isolated-20260912.
- Base: 2ee8180e2cfd50e77dfa9c86879cffa6cc437e7f.
- Live https://polynet-staging.vercel.app/version.json returned that exact buildId and environment staging during this slice. origin/staging also resolves to it.
- Earlier divergence-from-main warning was not evidence of staging divergence: the source candidate HEAD already matches the live frontend baseline.
- Convex status resolved quick-porcupine-949. Live function metadata contains 22 communityForms/communityMemberWorkflows functions and zero communityIntegration/finalizeIntegrationVerification functions. Exact backend source SHA remains unverified.
- Vercel deployment connector returned distribution-engineer despite the requested project; discarded as wrong-project evidence.
- This is a local disabled candidate, not a deployment or provider acceptance receipt.

## Included
Existing integration delta copied from arx-milestone-feel-20260909 without altering either original dirty workspace. 37 source/test/contract files:
- `apps/web/src/App.tsx`
- `apps/web/src/components/WebCommunityWorkflowsSection.tsx`
- `apps/web/src/components/WebMemberAgentDock.tsx`
- `apps/web/src/controllers/useWebCommunityWorkflowsController.ts`
- `apps/web/src/main.tsx`
- `convex/founderPaidToolRuntime.ts`
- `convex/founderPaidTools.test.ts`
- `convex/founderPaidTools.ts`
- `convex/polynetCanonicalExecutor.test.ts`
- `convex/polynetCanonicalExecutor.ts`
- `convex/runtimeAgentLoop.ts`
- `convex/schema.ts`
- `shared/communitySemanticRepository.ts`
- `shared/routePrivacy.ts`
- `apps/web/src/auth/IntegrationCallbackRoute.tsx`
- `apps/web/src/components/WebCommunityIntegration.css`
- `apps/web/src/components/WebCommunityIntegration.tsx`
- `apps/web/src/controllers/useWebCommunityIntegrationGateway.ts`
- `apps/web/src/integrationCallbackCapture.ts`
- `convex/communityIntegrationActions.ts`
- `convex/communityIntegrationConnections.ts`
- `convex/communityIntegrationReadCore.test.ts`
- `convex/communityIntegrationReadCore.ts`
- `convex/communityIntegrationReceiptIntent.ts`
- `convex/composioConnectionAdapter.test.ts`
- `convex/composioConnectionAdapter.ts`
- `convex/hubspotPilotContract.test.ts`
- `convex/hubspotPilotContract.ts`
- `convex/integrationVerificationPilot.ts`
- `convex/integrationVerificationRuntime.test.ts`
- `docs/composio-member-read-pilot-plan.md`
- `docs/integration-provider-decision-20260911.md`
- `scripts/community_integration_status.test.ts`
- `scripts/integration_callback.test.ts`
- `scripts/integration_connection_browser_qa.mjs`
- `shared/communityIntegrationStatus.ts`
- `shared/integrationCallback.ts`

## Dependency and behavior review
- UI uses the existing Workflows selector and Agent header, sharing one gateway/component.
- Callback route captures session_uri before analytics; reuses existing auth.
- One connection table and optional community flag; existing receipt table gains an additive included-allowance union/index, retaining monetary fields and behavior.
- Shared provider-start helper now requires fresh dispatchAuthorized and rejects replay. This affects existing research/crawl callers too: full regression required, and backend/runtime changes must ship together.
- Semantic contact read and runtime injection are retained as existing pilot dependencies, not enabled capabilities. No live read adapter is installed.
- Metadata transport is pinned and receipt-admitted; no duplicate HTTP client.
- Existing forms/workflow implementations remain baseline dependencies, not replayed historical changes.

## Excluded
No root-workspace changes, main reconciliation, historical branch commits beyond the verified base, credentials/env files, dependencies/build outputs, migrations/backfills, deployment, provider calls, OAuth grant, contact reads, external writes, or billing collection.

## Verification
- 1,534 tests across 170 files pass in isolated worktree.
- Convex typecheck passes.
- Web build passes.
- Web typecheck passes after restoring the same two local dependency links as the source workspace.
- Initial dependency-only run failed because the web node_modules link was absent; corrected without source changes.
- git diff --check passes.
- No rendered/browser acceptance claimed.

## Remaining gates
1. Exact pre-initiation staging/community/member/auth-config/expiry admission.
2. Cleanup/revocation remains authorized for the exact stored binding after pilot expiry, without permitting new work.
3. Verify backend release source and intended staging deployment path before deploying this candidate.
4. Deploy coordinated schema/backend/frontend only in a separately authorized slice.
5. Inspect consent before OAuth grant; then one sandbox verification and confirmed revocation.

## Admission and cleanup slice

Shared `admittedIntegrationPilot` now checks the server deployment URL, exact
configured community/member/auth config, finite time and fixed expiry. Actions
check it before initiation; the binding mutation rechecks it transactionally,
rejects an already-consumed pilot receipt, and caps callback lifetime at expiry.
Callback claim, activation and funding admission reuse the same policy. Reconnection
does not replenish the existing one-operation receipt budget.

Disconnect deliberately does not require pilot enablement, current membership,
or unexpired policy: authenticated ownership of the existing stored binding is
the cleanup authority. Remote cleanup additionally checks the adapter auth config,
provider and toolkit. Provider uncertainty leaves cleanupPending true. The existing
generation/attachment logic retains late-created account IDs for revocation.

1,542 tests pass, including new wrong-deployment/member/community/config and
expired/disabled pilot cases, plus disabled-community cleanup, wrong cleanup
adapter, and uncertain revocation. Existing replay, disconnect-race and budget
tests pass. Convex/web typechecks, web build and diff check pass.

Live adapter and policy remain null. The target deployment, callback and sandbox
portal are recorded in the policy module, but concrete member/config/expiry
activation and adapter construction remain a separately reviewed activation step.
No deployment, OAuth, credentials, or provider calls in this slice. Gates 1–2
above are implemented locally; backend provenance and live acceptance remain open.

## Live readiness inspection

Read-only Convex query confirmed the designated community and user exist, the
community owner matches that user, the slug matches the disposable fixture, and
integrationReadPilotEnabled is false. Exact fixture IDs/auth config are recorded
in INTEGRATION_PILOT_TARGET; integrationVerificationPilot still returns null.

Dashboard history for quick-porcupine-949 shows the last function deployment as
one day ago and the COMPOSIO_API_KEY creation as one hour ago at inspection. It
does not expose a source commit, so no exact backend SHA is asserted. No secret
value was read. The CLI deploy help says deploy defaults to production when using
CONVEX_DEPLOYMENT; it was not invoked. Its dry-run describes generated config,
not an independently established deployed source commit.

Do not activate against inferred backend provenance. Recommended next release:
explicitly target staging and deploy the disabled, validated candidate with its
commit recorded in the deployment message; verify that receipt before setting a
short fixed pilot expiry and constructing the live adapter. This establishes new
known provenance rather than pretending to recover an unavailable old SHA.
No remote writes, OAuth grants, connections, or provider calls in this inspection.

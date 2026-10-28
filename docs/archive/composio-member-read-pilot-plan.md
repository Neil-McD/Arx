# Composio member-owned read pilot — implementation map

Date: 2026-09-11. Status: local mocked read slice implemented; not deployed.
Source baseline: `2ee8180e2`, workflow worktree. No OAuth or paid calls.

## Sandbox preflight run sheet — 2026-09-12

Status: preparation only; NOT execution-ready. User designated the existing empty
project for disposable Polynet testing with no paid upgrade or usage authorized.
No provider settings, auth config, connection, consent, credentials or deployment
were changed during this preflight. The unsaved config dialog was closed.

### Verified and unresolved inputs

| Input | Evidence / gate |
| --- | --- |
| Composio project | neilmcdevittd_workspace_first_project, pr_sygeIVl1fHOk; designated disposable |
| Plan | Signed-in dashboard: Hobby $0; displayed seven-day calls zero |
| Auth config | None. Unsaved managed HubSpot OAuth dialog defaults to 33 scopes, including contacts/deals/schema/user writes |
| Desired scope ceiling | Proposed oauth + crm.objects.contacts.read; actual managed acceptance and final consent must be checked; do not silently accept broader grants |
| Callback | /integrations/callback exists locally; project verifier unset; liveAdapter null; no working hosted end-to-end callback proven |
| Execution | Granted-scope and contact dependencies unwired; current integration admission denies; do not bypass it for this test |
| HubSpot fixture | Free developer test account Polynet Integration Sandbox, ID 247370940, under main account 247370900. Active, trial expiry Dec 11, 2026. Synthetic contact 550639409888 created and verified in browser; no OAuth connection made |
| Polynet fixture | User authorized any test community. Selected staging Concierge Welcome Canary 2026-08-20, slug concierge-welcome-canary-2026-08-20-b, using the signed-in Neil McDevitt account for the first owner-path test. Browser verified management access and description Disposable staging proof for grouped concierge welcomes. Resolve immutable community/user IDs server-side before wiring; do not authorize by name or slug |
| Cost | Current published Hobby terms stop at included limits; no paid upgrade/add-on allowed. Confirm plan immediately before run. Premium tools excluded |

Current pricing evidence supersedes earlier uncertainty about whether Hobby is
hard-capped, but does not authorize execution or assign a zero accounting cost to
production. No inference, premium tools, proxies, triggers, or paid add-ons in this
test. Sources: https://composio.dev/pricing and signed-in Billing/Usage.

The current controlling-scopes guide describes managed scope overrides, whereas
the HubSpot knowledge-base guidance warns against changing managed defaults.
The UI exposes scope selection. Treat managed least-privilege compatibility as
unproven, not guaranteed. Inspect final requested consent; if narrowing fails,
stop for a custom OAuth decision rather than accepting 33 default permissions.
Sources: https://docs.composio.dev/docs/authentication/controlling-scopes and
https://docs.composio.dev/kb/guide/toolkits-hubspot.

### Proposed execution budget (requires subsequent authorization)

Synthetic fixture follow-up — 2026-09-12: created exactly one contact in portal
247370940, with first name `Polynet`, last name `Synthetic Test 20260912`, and
email `polynet-integration-test-20260912@example.com`. Marketing-contact checkbox
was unchecked. Saved record page verified name, email, and ID `550639409888`.
No email, invitation, or other outbound action was initiated. HubSpot's two
pre-existing sample contacts were left unchanged. This is the sole contact target
for the proposed read; do not enumerate or substitute other records.

Preparation gate remains: choose the exact Polynet test member/community, wire
the isolated callback and authorized admission path, then configure only
`oauth` + `crm.objects.contacts.read` and inspect consent before granting access.
Rechecked local liveAdapter is null and integration admission still denies with
integration_funding_policy_unavailable. No auth config, OAuth grant, provider-tool
execution, deployment, or funding bypass performed in this fixture slice.

Account preparation follow-up: user completed free HubSpot signup. Through
Development → Testing → Test Accounts, created the separately isolated developer
test account above. No paid upgrade, credentials, OAuth grants, contact writes,
or integration execution performed. Earlier preflight's no-write statement applies
to the Composio inspection, before this authorized account creation.

- Setup: one auth config, one exact callback verifier URL on this project only.
- One link creation and one callback completion; no retries.
- At most four account-metadata GETs total, including alias lookup and cleanup
  confirmation. Incomplete pagination or ambiguous results stop the test.
- One HUBSPOT_LIST_GRANTED_SCOPES with include_token:false and one
  HUBSPOT_READ_CONTACT for the named synthetic ID, both version 20260826_00.
- One exact-account revocation attempt. If unsupported or unconfirmed, stop and
  have the account owner revoke from HubSpot; never equate row deletion with
  provider revocation. Do not permanently delete provider records automatically.
- All operations count even when failed; no automatic reruns. Scope check failure
  prevents the contact read. Cleanup of the exact known test account remains
  necessary after any partial success and must be separately confirmed if needed.

### Evidence and stop conditions

Record sanitized fixture IDs, attempt generation/alias, operation counts, status,
verified scope names, and bounded synthetic contact fields. Never persist tokens,
session_uri, authorization links, raw account responses, or unrelated contacts.
Pass requires same-user callback proof, correct account/config/alias ownership,
approved granted scopes, expected synthetic read, and confirmed disconnection.
Mocked wrong-user/community denials remain separate from live positive evidence.

Stop before any unexpected scope, billing/upgrade prompt, identity mismatch,
uncertain response, exhausted operation budget, or unconfirmed cleanup. No automatic
recovery/activation, production rollout, general integration enablement, or new
reconciliation infrastructure is authorized by this run sheet.

Next implementation gate: plan the minimal isolated hosted callback and execution
wiring through existing access/admission boundaries, after the disposable HubSpot
fixture is identified. An auth config alone cannot make the current app run live.

## Implemented boundary

### Included-allowance verification receipts — local implementation, 2026-09-12

Implemented the follow-up extension in communityPaidToolReceipts, not a new
ledger. Existing monetary row validation and settlement remain unchanged. The
new discriminated platform_included_allowance row has reservedOperations:1,
costEvidence:unknown, full integration intent, and no monetary reservation,
settlement, payer, or model-allowance fields. Its settled status means operation
completion, NOT resolved dollar cost. Numeric monetary settlement rejects it.

integrationVerificationPilot() remains null with no environment switch or public
setter. Future explicit configuration must pin a stable pilot ID, exact community,
member, auth config, and expiry; changing pilot ID constitutes a new authorization,
not a reconnect mechanism. The policy is not a statement of provider quota
availability: verify the project's included allowance before eventual activation.

Claim permits only pinned verify_scopes intent and current pending callback-bound
access. An indexed by_pilot read and insertion atomically consume one TOTAL slot,
including failed, expired, and indeterminate receipts across attempts. Start
rechecks policy/access and grants dispatch only once. Finalization records bounded
operation outcome, leaves cost unknown, and cannot restore quota. Late/uncertain
provider outcomes remain indeterminate. There are no provider-cost entries or
founder-allowance debits for this variant.

Connection activation is still separate and guarded by the existing callback,
generation, and metadata checks. This receipt implementation alone does not wire
the adapter, authorize OAuth, or permit contact reads. Nothing deployed.
Verification: full Vitest suite 1,521 tests / 169 files passing; Convex typecheck
passed. Tests cover distinct concurrent receipt keys, replayed starts, policy and
access changes, lifetime cap retention, late completion, wrong claim tokens,
unknown costs, contact-read denial, and existing monetary receipts.

### Included-allowance admission feasibility — 2026-09-12

Stop condition reached; no admission implementation or activation performed.
communityPaidToolReceipts currently requires payerUserId, pricingVersion, and
reservedCostMicros, supports only subscription/operator funding and web actions.
Settlement requires numeric rawVendorCostUsd and always records category web;
expiry settles the reserved monetary amount for provider-started operations.
Thus an operation-count-only included-allowance policy cannot be represented
honestly by merely wiring existing methods. Zero reservation/zero vendor cost or
mislabeling as a web action is not an acceptable adaptation.

Recommended next design change: a discriminated included-allowance variant in
the SAME receipt table/lifecycle, preserving existing monetary rows unchanged.
It needs explicit pilot authority and an atomic total operation cap, persisted
integration intent, fresh-start-only dispatch, and finalization that distinguishes
operation outcome from unknown monetary cost. No new ledger and no reuse of the
founder's model allowance. This schema/lifecycle extension needs its own bounded
slice before provider execution; the previously planned compatibility shortcut
is not available. Contact reads and live OAuth remain disabled.

### Pinned portal metadata contract verified — 2026-09-12

Inspected the signed-in Composio HubSpot toolkit, explicitly selecting
20260826_00 (dashboard latest is 20260911_00), then LIST_GRANTED_SCOPES → Output
→ JSON. ListGrantedScopesResponse declares scopes as required string[] and
hub_id as optional string | integer. Token is documented as omitted when
include_token:false. No tool execution or OAuth was performed.

This resolves the schema uncertainty below: no additional metadata call or scope
is needed. Live response behavior remains unproven. The local parser now returns
only {portalId, scopes}; it rejects missing/invalid portal identity, including
unsafe integers, and never falls back to signed_access_token metadata.
The existing adapter now requires expectedPortalId and verifyMetadata, rejects
wrong portal or excessive grants before returning activation evidence, and
sanitizes verifier errors. No duplicate verifier, callback, or table was added.
Focused tests: 123 passing. Live adapter and integration admission remain disabled.

Next: admit/account for this single verification call in the existing receipt
path, wire the selected staging fixture, then perform separately authorized
connect/verify/disconnect acceptance. Missing hub_id in a live response is a stop,
not permission to weaken verification or retrieve credentials.

### Read-only fixture and admission resolution — 2026-09-12

Convex status resolved this worktree to quick-porcupine-949 (staging), not
wry-hawk-715 (production). An indexed by_slug query and exact owner lookup returned:
- communityId: jx7f4fcw4x3hjsvy2t02j669xx8cvj6s
- ownerUserId: jn7ckswapk976rra6egsxydm0x82a7nc
- owner displayName: Neil McDevitt
- integrationReadPilotEnabled: false

These immutable IDs resolve the selected fixture; no database rows were changed.
The signed-in browser identity must still match the owner ID at connection time.

Admission trace: authorizeFounderPaidToolFundingSession calls the existing
claimFounderPaidToolReceiptInternal. Its integration branch validates access and
returns integration_funding_policy_unavailable before receipt creation.
shared/founderPaidTools.ts only defines search/open_page/find_in_page/crawl
reservation ceilings. Integration reservation and settlement are missing, not
merely disabled by an environment variable. Do not reuse a web-tool price or
claim unknown provider cost as zero.

Provider evidence: HubSpot documents hub_id and scopes in OAuth metadata
(https://developers.hubspot.com/changelog/additional-details-returned-when-generating-oauth-access-tokens).
This does NOT establish that Composio's pinned LIST_GRANTED_SCOPES output exposes
hub_id with include_token:false. Inspect that exact schema before implementing
portal verification. Do not retrieve tokens or add broad account-info scopes.

Next gate: verify the metadata schema, then explicitly define a bounded pilot
admission policy in the existing receipt path, including unknown-cost handling.
No live adapter, OAuth, deployment, or provider execution authorized by these
read-only queries. The connection-only acceptance gate is not complete.

2026-09-12 scope-ceiling follow-up: one shared predicate now requires
crm.objects.contacts.read and permits only optional oauth alongside it. Both
activation and read authorization reject extra grants, including unrelated read
permissions. Activation stores the actual accepted scope set instead of replacing
it with a fabricated singleton. Focused contract/read/adapter suite: 107 tests pass.
This is local protection, not live acceptance or sandbox-portal verification.

Connection-only acceptance still requires admitted provider scope verification;
it is not a way around the funding gate. Exact Polynet member/community and the
funding policy remain unresolved. Live adapter remains null; no deployment or
OAuth grant occurred in this follow-up. Do not enable a community-wide pilot as
a substitute for the planned single-member restriction.

Read receipt-contract slice: trusted runtime toolCallId is propagated alongside
runId (never taken from model arguments). claim receives the complete scoped intent
and returns receiptKey/claimToken or denial. A fresh start transition is required
before execute; finalize uses the same claim with not_started, start_uncertain or
provider_started evidence. Cost remains unknown, never numeric zero.
The read dependency remains unwired. Read and admission share one integration
intent definition: binding/account/user/config, generation, pinned tool/version
and contact target. The provider account field is connectedAccountId throughout.
Community/member and trusted source/call identity accompany the intent.
Scope verification is bound to
the claimed connection attempt (`integration_connection:<bindingId>:<generation>`,
`verify_scopes`), not a fabricated agent run. Contact reads pass the full binding
identity to claim and recheck local binding ID as well as remote identity.

Only a fresh provider-start transition returns dispatchAuthorized:true; replay
returns false and the runtime wrapper refuses dispatch. The existing web-tool
receipt, funding and settlement path remains intact. Integration admission
validates current access and then fails with integration_funding_policy_unavailable
BEFORE any receipt lookup, reservation or write.
No default price, free-tier zero-cost assumption, operator bypass or inference
allowance fallback is installed; no integration receipt is created by admission.

Speculative integration receipt fields and expiry/finalization branches have been
removed. They had no real writer and were exercised only through manually seeded
test rows. The paid-tool table retains its existing web-only schema. Tests cover
the real denial boundary; funded integration admission and settlement are unproven.
No second ledger, live adapter or pricing added.

Lifecycle recovery slice: one connectionStatus query returns settings plus derived
allowed actions (connect/resume/disconnect/retry_cleanup) and reconciliation state.
There is no additional persisted state machine. Expired/failed known accounts
offer disconnect; unknown remote outcomes never offer blind retry. Disconnect's
local mutation is internal; the public action owns cleanup orchestration.
Attempt generation, expiry and provider identity come from the initiating
transaction, including reuse. Failed callback verification records an error without
resetting its single-use claim. Former members can inspect/disconnect their own
binding without seeing community settings.

Reconciliation remains manual and blocks reconnect when the remote ID is unknown.
This slice does not install a reconciliation service, live adapter or admission.

Local code only, not deployed. One canonical scoped binding and existing Agent
harness are retained. No new workflow engine or provider catalog.

Connection actions now reserve a durable pending attempt BEFORE provider initiation.
Only the transaction winner initiates; other callers reuse the pending link.
An ambiguous timeout becomes reconciliation-required, blocking blind retries.
Provider results arriving after local disconnect retain the account ID for cleanup.
Unconfirmed revocation stays visible and blocks reconnect; manual retry is supported.

Server transport uses Composio Connect Links, exact-account lookup, callback identity
completion and upstream revoke. It has fixed provider origin, 10-second timeout,
no automatic retries, HTTPS link validation and sanitized errors. Deleting a
Composio row is not represented as upstream token revocation.

Live construction is deliberately disabled (`liveAdapter = null`), regardless of
environment variables. The adapter's granted-scope verifier remains an explicit
dependency: Composio requested_scopes is NOT accepted as proof of actual grants.
The speculative raw-token introspection verifier was removed after checking
Composio's current contract: provider secrets are masked and should remain managed
by Composio. The selected grant-verification path is its native
HUBSPOT_LIST_GRANTED_SCOPES tool. Its pinned schema is now dashboard-verified;
pure validation exists in hubspotPilotContract.ts, but sandbox proof remains open.
The existing injected
verifyMetadata boundary remains unwired and fails closed.
No keys, accounts, settings or spend changed.

Agent UI stores the exact community/user/generation/expiry in tab-local storage
before following the hosted link. The fixed /integrations/callback route scrubs
session_uri before telemetry, retains it across same-tab login without including
it in returnTo, rejects a different user or expired attempt, and consumes it once.
Server-side callback claiming prevents concurrent verification/replay. Redirects
alone never activate a connection. Project verifier configuration and real hosted
OAuth/login still need separately authorized sandbox acceptance.

The read adapter and funded admission remain mocked/unwired. Integration monetary
settlement and persisted integration receipts are not implemented.
Public actions return unavailable with no live adapter. Workflow integrations,
provider reads, billing and deployment remain outside this slice.

Previous slice verification: 1,390 Vitest tests, web/Convex typechecks, local web build, synthetic
browser connect/disconnect/retry/scope-switch checks and tab-storage callback
login/replay checks. This does not prove the live auth trampoline or provider OAuth.
Browser QA uses a synthetic local gateway and tab-local callback helpers; no
provider traffic. Screenshots: `artifacts/integration-connection-qa/`.

## Permission-path decision (2026-09-11)

### Schema and cost refresh (2026-09-11)

The signed-in dashboard was inspected read-only for both tools at selected version
20260826_00 (latest was 20260911_00). Scope input supports include_token:false;
successful output contains data.scopes:string[]. Contact input supports contactId,
explicit properties and archived:false. Output requires a string id, properties,
createdAt, updatedAt and archived; property values may be string/null or omitted.
Source: https://dashboard.composio.dev/neilmcdevittd_workspace/neilmcdevittd_workspace_first_project/toolkits/hubspot

The pure pilot contract pins both tools, excludes token retrieval, projects only
scope names or bounded first/last names, and rejects malformed/oversized responses.
Contact validation is used by the existing read core; scope validation/request
remain unwired. Extra OAuth metadata is discarded, not persisted or forwarded.
This verifies schema compatibility, NOT actual OAuth or provider execution.

The inspected organization showed Hobby ($0/month), zero calls in its displayed
seven-day usage window and no existing auth configuration. No account/config was
created. A managed HubSpot option exists; no project-specific OAuth choice or
paid execution ceiling was established.

Published pricing: managed-app calls cost $0.0005 after their allowance; direct
execution adds $0.0001 after its separate allowance. Thus $0.0006 (600 micros) is
the conditional marginal rate for one ordinary managed-app direct execution with
both allowances exhausted and no other add-ons. It is NOT a verified account-wide
ceiling, actual measured cost, approved reservation, or customer billing rate.
Managed connections also have a listed $0.10/connection paid rate beyond 1K;
connection-charge timing and the selected account's applicable terms are unverified.
Other enabled add-ons and contractual terms must be checked before assigning a cap.
Source: https://composio.dev/pricing (read 2026-09-11).

Next gate: bounded durable admission/accounting for BOTH scope verification and
contact reads, then explicitly authorized project setup and synthetic acceptance.
No pricing constant or durable funding adapter should be installed based solely
on this public estimate. liveAdapter remains null; no keys or live calls in this slice.

KEEP: hosted Connect Link, fixed identity callback, exact server-owned connection
binding, generation claim, independent granted-scope validation, upstream revoke.
DELETE: raw-token retrieval/introspection code and its nine mock-only tests.
DEFER: custom OAuth app, token storage, proxy fallback, broader toolkit execution.

Evidence:
- [Connected-account guidance](https://docs.composio.dev/kb/guide/platform-connected-accounts)
  explicitly says not to depend on reading provider tokens from connection data.
- [HubSpot catalog](https://docs.composio.dev/toolkits/hubspot) lists
  HUBSPOT_LIST_GRANTED_SCOPES and managed OAuth availability. This establishes a
  native candidate, not its output schema or live behavior.
- [Tool metadata](https://docs.composio.dev/reference/api-reference/tools/getToolsByToolSlug)
  exposes versioned input/output schemas through a project-authenticated GET.
- [Tool execution](https://docs.composio.dev/reference/api-reference/tools/postToolsExecuteByToolSlug)
  supports exact connected_account_id, user_id and version. Never rely on automatic
  account selection, natural-language arguments, or latest at execution time.
- [HubSpot configuration guide](https://docs.composio.dev/kb/guide/toolkits-hubspot)
  says managed defaults must not be modified; use custom OAuth for different
  scopes/branding. It does NOT establish that managed defaults are read-only.

Selected approach: keep credentials in Composio and verify grants with its native
tool. Keep managed OAuth for the sandbox only if its actual consent scope set is
acceptable. A custom OAuth app is a separate decision if least-privilege consent
requires it; it is not a prerequisite merely for accessing raw tokens.
Polynet's read-only tool allowlist does not make the provider's OAuth grant read-only.

### Exact next gate

1. Schema inspection is complete at 20260826_00. Still inspect the selected
   HubSpot auth config's consent scope set when configuration is authorized.
2. Pure parsing is complete; prove account-managed execution separately.
   Missing or ambiguous evidence blocks activation; ACTIVE/requested_scopes and
   a generic successful response are not sufficient.
3. After durable admission/accounting exists, wire only this pinned tool through the existing verification boundary. Validate
   the exact connection/user before calling; reject errors/malformed data/missing
   crm.objects.contacts.read. Project only validated grants, never raw output.
   Preserve post-call community/access/generation checks.
4. Separately authorize one sandbox user, community and HubSpot account; specify
   a spending ceiling because even permission-tool execution may be metered.
   Configure the fixed callback verifier URL; do not change production.
5. Connect -> verify -> disconnect once. Test wrong-user/account, expired/replayed
   callback, missing permissions, and revocation. No contact read, workflows,
   background execution or billing. Confirm provider revocation rather than just
   removing the Composio row. Retain sanitized receipts.

Local schema slice verification: 1,444 tests across 169 files passed; web and
Convex typechecks passed. No live provider execution, credential access, deployment,
or auth configuration changes. These checks are not sandbox acceptance.

The earlier receipt compatibility slice was simplified after review: removed its
manually seeded integration lifecycle tests and unreachable persistence branches.
Retained scope-attempt lineage, access-loss denials, malformed-intent rejection,
and replay-safe concurrent web-tool start. Next: an explicitly approved integration
funding policy, then admission/execution/settlement as one bounded vertical slice.

Cleanup verification: 1,458 tests across 169 files, web/Convex typechecks and the
founder paid-tool accounting contract check passed. The test count fell because
unreachable lifecycle fixtures were deleted and replaced with admission denials.
No deployed schema/data was changed; all work remains local and live execution off.

Public documentation was sufficient to choose the path, but not to prove the
tool-specific output contract. No project keys were accessed, metadata API was
not called, and no provider tool was executed in this decision slice.

Post-cleanup verification: 1,381 tests across 167 files, web and Convex typechecks,
and git diff --check pass. Nine tests were removed with the unused raw-token
verifier; no remaining references exist. No UI behavior changed in this slice.

Current API references checked 2026-09-11:
- [Connect Links](https://docs.composio.dev/reference/v3/api-reference/connected-accounts/postConnectedAccountsLink)
- [Identity completion](https://docs.composio.dev/reference/api-reference/connected-accounts/postConnectedAccountsCompleteAuth)
- [Account details](https://docs.composio.dev/reference/v3/api-reference/connected-accounts/getConnectedAccountsByNanoid)
- [Upstream revocation](https://docs.composio.dev/reference/api-reference/connected-accounts/postConnectedAccountsByNanoidRevoke)

## Bounded outcome

A builder enables the pilot; a member connects a test HubSpot account within one
community; that member's existing private Agent conversation reads one synthetic
contact through Composio. Other members, other communities, community-owned agents,
external MCP callers, and background workflows cannot use that connection yet.

Credentials belong to the member. Intended future payer is the community builder;
this does not authorize billing or bypass the current funding contract. The pilot
needs explicit test funding; missing funding must fail closed.

## Existing call path to reuse

| Layer | Existing location | Implementation seam |
| --- | --- | --- |
| Agent page/conversation | `apps/web/src/components/WebMemberAgentDock.tsx` (calls at 563, 936); `shared/cloudMemberAgentGateway.ts` | Keep composer, thread, and send path; add small connection status/Connect affordance, no new chat |
| Conversation ownership | `convex/threads.ts:ensureCommunityAgentConversation` | Existing authenticated owner and community chat access checks; immutable thread community |
| Runtime context | `convex/runtimeTurnResolution.ts` | Use server-validated persisted conversation community, never current browser tab alone |
| Tool dispatch | `convex/runtimeAgentLoop.ts:executeRetrievalHarnessTool` | Existing identity/principal/mounted-community propagation |
| Semantic authority | `convex/polynetCanonicalExecutor.ts:resolveCommunityTarget`; `convex/communityCapabilityContext.ts` | Retain existing access resolution; add member-connection ownership checks, not blanket member capability |
| Operation definitions | Existing semantic read operation | Reuse it for the exact gated contact path; no new operation |
| Tool policy/results | `shared/runtimeToolPolicy.ts`, `convex/runtimeToolCallEvents.ts` | Preserve policy and result receipts; bound/redact arguments and output |
| Connection state | `convex/schema.ts` | Add scoped connection metadata; do not reuse model-provider credential rows |
| Builder enablement | `apps/web/src/components/WebCommunityWorkflowsSection.tsx` | Replace placeholder only with pilot enablement/status; no catalog |

Do not expose all Composio tools, add an SDK-owned LLM loop, or mount its MCP server.
The existing `polynet_read` is the proposed entry point for a narrow semantic path:
`/communities/{slug}/integrations/hubspot/contacts/{id}`. Route parsing, operation
contract, executor and tests must land together. Return a missing-connection state
when appropriate. Parent-directory discovery is not part of this slice.

Explicitly gate the pilot to the private community-bound member runtime, not just
`personal_agent`: otherwise the shared canonical executor could expose the read to
external MCP. Verify evidence surface AND trusted persisted run/thread context.

## Minimal new state and authorization

Two distinct facts: community enablement and member account binding. Store a
single pilot-enabled field in the existing canonical community settings record
(builder-authorized mutation), plus a new `communityIntegrationConnections` table.
Do not duplicate community roles, entitlements, profiles, or workflow progress.

Proposed connection fields: communityId, ownerUserId, provider=`composio`,
toolkit=`hubspot`, opaque providerUserId, connectedAccountId, authConfigId,
state (`pending|active|disconnected|error`), grant/verification metadata,
pending authorization expiry, generation, and timestamps. Enforce one active binding
per community/member/toolkit in a mutation; reconnect replaces that binding only.
Use separate provider projects/configs for test and production.

Provider user identity is opaque and specific to the community/member binding.
Do not use email or a global member ID that silently shares accounts across communities.
Never accept providerUserId, authConfigId, connectedAccountId, or tool slug as
client/model-selected execution authority. The server supplies all four.

Connection lifecycle:
1. Authenticated member requests connection; server checks community access,
   builder enablement and pilot admission, then creates/reuses a bounded pending row.
2. Server initiates Composio auth with its approved auth config and fixed return URL.
3. Return URL is UX only. Server retrieves the provider account and verifies user,
   toolkit, config, status, pending generation/expiry and scopes before activation.
4. Reads recheck membership, enablement, ownership, account state, allowed operation
   and test budget at dispatch. No active-account fallback. Provider revocation errors
   stop execution and expose reconnect, not silent replacement-account selection.
5. Disconnect first denies locally/increments generation, then revokes remotely.
   Late callbacks cannot reactivate it. In-flight calls may already have reached the
   provider: suppress stale results and make no claim of undoing completed requests.

Read authorization does not mean all provider data is public community context.
For the pilot restrict requests to the approved synthetic contact ID and bounded
fields. No history, associations, archived contacts, cross-member cache, or broad
CRM export. This fixture restriction is not a general product rule.

## Composio adapter and version strategy

Use the existing bounded server REST adapter; no parallel SDK implementation.

Documented API mapping:
- Hosted Connect Link: authorization request.
- Exact connected-account lookup: verify account identity/configuration.
- `tools.execute('HUBSPOT_READ_CONTACT', { userId, connectedAccountId, version, arguments })`.
- Upstream revoke: remote cleanup after local denial. Deleting a provider row
  alone does not prove token revocation.

Both tool schemas were inspected in the signed-in dashboard at `20260826_00`.
The code pins that version and validates responses locally; actual provider
execution at that version still requires separately authorized acceptance.
Arguments: approved `contactId`, explicit small `properties` allowlist; omit
associations/history and require non-archived. Cap response size and fields before
the model receives it. Treat returned strings as untrusted data, not instructions.

Direct execution is intentional for this one-operation pilot: exact routing stays
in the existing executor without adding session discovery/meta-tools. Composio
recommends sessions generally; direct execution has a surcharge above its allowance.
Do not reuse the earlier session-only cost assumptions for this implementation.
Reassess sessions when actual multi-tool discovery is in scope.

[Account methods](https://docs.composio.dev/docs/auth-configuration/connected-accounts),
[direct execution](https://docs.composio.dev/docs/tools-direct/executing-tools),
[versioning](https://docs.composio.dev/docs/tools-direct/toolkit-versioning),
[HubSpot schema](https://docs.composio.dev/toolkits/hubspot),
[pricing](https://composio.dev/pricing).

## Receipt and funding seam — not billing implementation

Preserve existing run/tool events. Include community, actor, connection reference,
provider operation/request identity if returned, toolkit version, outcome and
measured usage. Never log credentials or complete provider account responses.
Missing vendor cost is unknown, not $0. A capability read can incur spend even
though it has no external business write. Bound retries and reserve/admit test
budget before every attempt; count failed chargeable attempts.

Do not create a new financial ledger or reactivate retired card-backed collection.
Inspect active community funding admission during implementation and add only the
minimum pilot guard/usage metadata. Community-builder billing is later work.

## Tests and ordered next implementation

### Connection failure boundary (local hardening)

Provider initiation is never automatically replayed. A returned account binding
is attached with at most one additional local mutation attempt using the same
generation and account ID. Attachment accepts an identical committed replay,
including a lost mutation response. If both writes fail or the process dies,
the awaiting binding remains blocked from re-initiation; this does not promise
durable recovery of an account ID that never reached the database. Provider-side
reconciliation remains a live-enablement gate.

Browser callback cleanup removes only its exact stored attempt, including after
bootstrap or verification rejects. Callback admission requires a finite future
expiry in both the action and atomic claim. Revocation reports cleanup pending
when local finalization rejects or throws. Existing community/member checks,
single-use callback claims, and disconnect-during-initiation cleanup remain.

These are mocked/local proofs only. The live adapter remains disabled.

### Attempt correlation

Link creation now sends a server-derived alias: `pn_` plus the SHA-256 hex digest
of JSON `["polynet-integration-attempt-v1", bindingId, generation]`. Inputs come
from the reserved database attempt, not model or browser arguments. No new
persisted identifier is added. The same attempt derives the same alias; a new
binding or generation derives a different alias. The derivation is versioned
and must remain stable for recovery of this attempt format.

An alias is correlation only, not authorization or a provider idempotency key.
Provider initiation remains non-retryable. Legacy ambiguous attempts without
an alias remain blocked/manual. Alias round-tripping and uniqueness behavior
still require separately authorized provider sandbox acceptance. No lookup,
automatic activation/revocation, recovery service, or live construction is added.

### Bounded provider response implementation

The connection adapter retains at most 65,536 body bytes before UTF-8 decoding
and JSON parsing. Actual streamed bytes, not Content-Length or string length,
enforce the limit. Oversized and rejected HTTP bodies are cancelled; reader
locks are released on success and failure. The existing ten-second fetch signal
also cancels stalled body reads. Empty, malformed, truncated, and invalid UTF-8
bodies fail with a sanitized provider error, without retrying the provider.
This bounds adapter buffering, not fetch's internal network buffers or total
decoded/parsed object memory. Tests use synthetic streams; they do not prove
live provider behavior. Provider reconciliation and funded live admission remain
separate gates before activation.

First local implementation: pure binding/authorization rules, canonical read route,
and a mocked provider adapter. All denial cases assert ZERO provider execute calls.

Required cases: wrong member; wrong community; forged provider ID; disabled pilot;
missing membership/entitlement; community-agent/external-MCP caller; stale callback;
wrong auth config/toolkit; expired pending auth; missing scope; unknown tool/version;
disconnected/replaced connection; exceeded budget; provider timeout; oversized result.
Positive case: one synthetic contact read from the exact binding in the existing
private Agent runtime, with bounded output and community/run receipt.

Then wire minimal builder enablement and member Connect/status UI, use existing
modal/input/avatar styles, and verify with a mocked service before live OAuth.

Live gate needs explicit authorization for a Composio project, disposable HubSpot
account, OAuth consent (`oauth` and contact read, no write scopes for this slice),
and any terms. Prefer hard-capped free mode; no subscription or automatic upgrade.
Propose at most 10 provider reads and an explicitly approved incremental ceiling
if free mode is insufficient. Synthetic data only; no real contacts/forms sent.
Verify server binding after auth, one read, a denial, and disconnect. No triggers,
writes, shared accounts, workflow progression, production or billing collection.

Done: local tests and rendered UI prove the mock path; a separately authorized live
read proves Composio/HubSpot behavior. Report those proofs separately. Do not mark
the live gate complete from mocks, a build, or an OAuth redirect alone.

## Receipt dispatch wiring and auth blueprint — 2026-09-12

Current local delta: the authenticated callback supplies the existing binding's
exact intent to receipt admission before metadata execution. The adapter requires
an admission callback; missing admission fails before provider HTTP. Fresh dispatch
authorization is mandatory, and metadata cannot return until the included-allowance
receipt finalizes as settled. Provider/finalization uncertainty fails closed without
retry. Settled describes the operation, not a zero-dollar cost claim. No new ledger.

Verification: full suite 1,527 tests passed, then the added missing-admission test
passed in a 36-test focused run; Convex typecheck and diff checks passed.

Browser-created Composio auth configuration `ac_uxRir8eo8Vma`, named
`polynet-sandbox-contacts-read-20260912`, in the designated first project. Saved
scope readback: only `crm.objects.contacts.read` and `oauth`; zero connections.
Execution allowlist restricted to `HUBSPOT_LIST_GRANTED_SCOPES` only.

Staging deployment was re-resolved as `quick-porcupine-949`; targeted environment
inspection found `COMPOSIO_API_KEY` unset. No key was extracted, no OAuth grant,
connection, provider tool execution, deployment, or production change occurred.
Pilot authority and live adapter remain disabled. Next gate: securely install the
designated project key in staging, complete the pinned HTTP executor and exact
member/community/portal/expiry configuration, verify callback deployment, then
inspect OAuth consent before granting access. Do not bypass this via dashboard
Connect Account, which would not prove Polynet's authenticated connection path.

## Pinned metadata transport — 2026-09-12

Supersedes the missing-key and missing-HTTP-executor status above. The designated
project key was installed in staging in the preceding browser-authorized step;
no credential value is recorded here. Live adapter and pilot authority remain off.

The existing adapter now executes `HUBSPOT_LIST_GRANTED_SCOPES` through its same
bounded, timed, non-retrying HTTP transport, inside receipt admission. The request
uses an explicit connected account, version `20260826_00`, and
`include_token: false`; only the canonical parsed portal/scopes leave the boundary.
Missing portal, wrong portal, extra scopes, provider errors, and denied admission
are covered. No contact read or alternate provider transport was added.

API reference checked:
https://docs.composio.dev/reference/api-reference/tools/postToolsExecuteByToolSlug

Local focused verification: 96 tests passed; Convex typecheck and diff check passed.
After fetching origin, this candidate branch is 28 commits behind and 213 commits
ahead of origin/main, with pre-existing uncommitted integration changes. This is
not an isolated release delta. Do not deploy the whole candidate as this slice.
Next: reconcile the intended integration delta against the staging release state,
then wire exact staging/member/community/expiry admission and expiry-independent
cleanup, validate, deploy staging, and inspect consent before any OAuth grant.
No deployment, OAuth grant, connection creation, or provider execution in this step.

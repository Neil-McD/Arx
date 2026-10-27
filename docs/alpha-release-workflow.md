# Alpha Release Workflow

## Canonical Truths

- Active development worktree: `/Users/neilmcdevitt/code/arx`
- Legacy workspace worktree snapshots are historical only and are not part of active development or release truth
- Canonical Git remote: `origin` -> `Neil-McD/Arx`
- Canonical release branch: `main`
- Canonical production web target: Vercel project `polynet`
- Canonical production Convex target: `prod:wry-hawk-715`
- Legacy Vercel project `arx` is not a live target

## Default Release Model

Production is released by one local command. Merging to `main` does not deploy:
Vercel Git auto-deploy from `main` is disabled in `vercel.json`.

1. Land the reviewed change on `main`.
2. From a clean checkout at exactly `origin/main`:

```bash
npm run release:verify   # guards, release gate, preflight; deploys nothing
npm run release:prod     # the same, then Convex, then web, then live proof
```

3. Commit the receipt the command writes to `docs/receipts/` and complete its
   post-release smoke checklist.

`release:prod` (`scripts/release_production.mjs`) fails closed at every stage:

| Stage | Proves |
|---|---|
| Guards | `vercel.json` keeps `main` auto-deploy off; the worktree is clean; `HEAD` equals freshly fetched `origin/main`. |
| No-regress | The live `version.json` build is a known ancestor of `HEAD` and not `HEAD` itself, so a stale checkout can never release over newer production. |
| Release gate | `npm run release:gate -- --mode=ci --sha=<HEAD>` passes on that exact commit. |
| Preflight | The pinned Vercel project exists; `VITE_CONVEX_URL`, `VITE_PUBLIC_APP_URL`, and `ARX_AUTH_BRIDGE_SECRET` exist exactly once for production; the read-only production accounting smoke passes; the current production deployment is recorded as the rollback target. |
| Convex | `convex deploy --typecheck enable` to `prod:wry-hawk-715`. |
| Web | `vercel deploy --prod --archive=tgz` to project `polynet`, with the commit SHA as build identity. |
| Live proof | `www.polynet.ai/version.json` reports `HEAD` (one explicit promote is attempted if Vercel does not assign the domain), and the live bundle embeds the production Convex URL. |
| Receipt | `docs/receipts/<date>-production-<sha>.md` and `artifacts/release-production.json`. |

Production authority (Convex deployment, Vercel team and project IDs, origin) is
pinned in `scripts/lib/releaseProduction.mjs`. It is never read from local
`.env` files or a `.vercel` link, which in this repository points at staging.

For official Polynet MCP provider changes, treat Convex as required, not
optional. If a change touches files like:

- `/Users/neilmcdevitt/code/arx/convex/httpMcp.ts`
- `/Users/neilmcdevitt/code/arx/convex/memberOntology.ts`
- `/Users/neilmcdevitt/code/arx/shared/polynetMcp.ts`
- `/Users/neilmcdevitt/code/arx/shared/polynetMcpSetup.ts`

then the release is not complete until:

1. `npm run release:prod` has released the change
2. the metadata smoke passes against the canonical production URL
3. one authenticated official Polynet MCP call has been re-tested on production

This is the canonical path. Do not rely on branch names, preview URLs, or old Vercel projects as release truth.

### Third-party MCP consumer retirement

Removing Polynet's third-party MCP consumer is a two-release data migration:

Status (2026-10-27): complete through step 5. The first release is in
production (`91d28dc2c`). Staging was emptied on 2026-10-16 (287 rows). On
production, steps 3-5 ran on 2026-10-27 with Neil's approval: 1,692 rows across
the seven tables were deleted in batches and re-inspection shows every count at
zero. A production backup was taken first, outside the repository
(`~/polynet-backups/polynet-prod-pre-app-retirement-20261027.zip`, SHA-256
`6d7862b8f0e09505a9452c218a1ee70d153066982a8b7979a44707a120ac2c2b`). The second
release (schema removal) can now go to production.

1. First release the code that severs all catalog, connect, OAuth, mount,
   runtime, worker, UI, and fanout paths while retaining the seven retired
   tables and `thirdPartyMcpRetirement.ts`.
2. Confirm the official `/runtime/mcp` provider proofs still pass.
3. Inspect production retired state:

```bash
npx convex run thirdPartyMcpRetirement:inspectRetiredStateInternal \
  '{"sampleLimit":1000}' --prod
```

4. Run bounded deletion batches until every count is zero:

```bash
npx convex run thirdPartyMcpRetirement:deleteRetiredStateBatchInternal \
  '{"perTableLimit":100}' --prod
```

5. Re-run the inspection and stop unless all seven retired tables are empty.
6. In a second release, remove the seven schema tables, their anonymous-user
   cleanup entries, and the temporary migration module.
7. Require the surface proof. Once the migration module is gone it verifies
   completion: no retired table in the schema and no cleanup entries.

```bash
npm run check:no-third-party-mcp-surface-proof
```

Never delete the production rows before the first release proves ordinary
product traffic can no longer create or refresh them.

### Workspace project residue retirement

Status: completed on 2026-08-15. The procedure below is retained as the
production evidence contract; the temporary operator and compatibility schema
must not be restored.

Slice 5E uses the same two-release rule, but it never deletes provider
resources or accounting evidence.

Release A removes all project, Workspace, Daytona, Codex-worker, preview, and
Blaxel writer surfaces. It temporarily retains six permissive schema tombstones
and the internal-only `projectResidueRetirement.ts` operator. The large
diagnostic table has one temporary `projectId` cleanup index so zero-residue
queries never scan current diagnostic history; Release B removes it with the
field. Before any data write:

1. Prove the exact Release A SHA is live in Vercel and Convex.
2. Prove retired public/internal writer functions are absent.
3. Pass the authenticated Member Agent community-inspection canary.
4. Run a read-only Blaxel control-plane inventory and require zero
   Polynet-owned sandboxes and volumes, including every resource named by a
   persisted `pn-p-*` pointer. Shared-workspace resources that are not owned by
   Polynet are out of scope and must never be deleted. If any Polynet-owned
   resource remains, stop; this operator cannot delete provider resources.
5. Back up production outside the repository and record its SHA-256:

```bash
npx convex export --prod --path /absolute/operator-controlled/path/polynet-pre-project-residue.zip
shasum -a 256 /absolute/operator-controlled/path/polynet-pre-project-residue.zip
```

Inspect every target page with the internal census. Continue with the returned
cursor until `isDone` is true and aggregate `residueCount` without truncation:

```bash
npx convex run projectResidueRetirement:inspectProjectResiduePageInternal \
  '{"target":"runtimeRuns","cursor":null,"pageSize":500}' --prod
```

Cleanup order is fixed:

1. `workspaceFilePreviewSnapshots`
2. `workspaceDirectorySnapshots`
3. `workspaceTerminalSessions`
4. `polynetCodexWorkerCapacityLeases`
5. `daytonaCodexRuntimeTargets`
6. `platformDiagnosticEvents`
7. `threads`
8. `runtimeRuns`
9. `cloudProjects`

For each bounded residue batch, dry-run first. Review the returned document
IDs, then pass those exact IDs to the write call. Every batch queries only
residue-bearing rows; repeat without a cursor until a write returns
`isDone: true`:

```bash
npx convex run projectResidueRetirement:cleanProjectResidueBatchInternal \
  '{"target":"runtimeRuns","pageSize":100,"dryRun":true}' --prod

npx convex run projectResidueRetirement:cleanProjectResidueBatchInternal \
  '{"target":"runtimeRuns","pageSize":100,"dryRun":false,"expectedDocumentIds":["<reviewed-id>"]}' --prod
```

The operator refuses to delete `cloudProjects` while any dependency remains.
It cannot query or mutate `workspaceComputeCharges`, `providerCostEntries`, or
`creditLedgerEntries`. Re-run the full census twice and require zero residue,
then re-run provider inventory and accounting diagnostics. Stop if provider
inventory is nonzero or any accounting evidence changes.

Release B deletes the six empty schemas, obsolete compatibility fields,
temporary selective index, and temporary operator. The completed cleanup
deleted 160 obsolete rows, patched 853 surviving rows, produced two complete
zero censuses, preserved all accounting totals exactly, and left zero
Polynet-owned Blaxel resources. Do not restore the migration code.

### Thread runtime marker retirement

Status: production complete on 2026-08-15. Terminal Release B merged through
PR #119 at `930d261c6707d10cadfa57388ebc49dbde3a6805`; GitHub Release Gate run
`31918189774` passed, and the exact web release plus production Convex schema
were proven live. The temporary operator and execution commands must not be
restored.

This migration removed only the constant
`threads.runtimeEngine: "polynet"` field. Release A was proven live at
`6038228024974bf41c44d9e4678e5ffa87287149` before data cleanup. A 92 MB
off-repository backup passed ZIP integrity with SHA-256
`c6ca6d7a56a4aea98a8b96d9a602c3123cda387bec7db52523f254101334d3f6`.
The complete census found 50 marked threads; one exact-ID guarded batch patched
all 50 and deleted none. The next dry-run and two complete censuses returned
zero. Release B deletes the field validators, temporary operator/test/API
exposure, and migration commands. Canonical runtime resolution and run/event
telemetry remain protected.

### AI Feed retirement

AI Feed removal is also a two-release data retirement. Release A removes the
product and runtime surface while retaining the legacy tables plus the dormant
`communityAiFeedRetirement.ts` operator module. Release B may remove those
schemas and the operator module only after production reaches a complete,
non-truncated zero census.

Before merging Release A, run its local proof and the focused behavior test:

```bash
npm run check:community-ai-feed-retirement-release-a-proof
npx vitest run convex/communityAiFeedRetirement.test.ts
```

After Release A is deployed to staging, run the official MCP acceptance twice:
once with a builder actor and once with an ordinary member actor. Each run must
use a different control identity that can open the community supplied as
`POLYNET_MCP_DENIED_COMMUNITY_SLUG`. This proves the actor's
`semantic_not_found` response is authorization isolation from a real community,
not merely a missing slug.

Production cleanup is a separate, explicitly authorized operation:

1. Back up the canonical production database outside the repository and record
   its location and SHA-256.
2. Select exactly one community and record its canonical Convex ID. Every
   census and batch is community-scoped; the operator module deliberately has
   no global destructive mode.
3. Run the versioned census for that community and stop if `complete` is false,
   `batchDeletionReady` is false, any `blockedRows` count is nonzero, or any
   category appears in `truncated`. Also stop if `danglingReferences.count` is
   nonzero:

```bash
npx convex run communityAiFeedRetirement:inspectAiFeedRetirementInternal \
  '{"communityId":"<community-id>"}' --prod
```

4. Process only this dependency order, one category at a time:
   `member_settings`, `agent_serve_requests`, `retrieval_logs`,
   `intelligence_retrieval_logs`, `outcome_observations`,
   `memory_metabolizer_runs`, `intelligence_change_requests`,
   `intelligence_mutations`, `intelligence_edges`, `intelligence_nodes`,
   `compiler_digests`, `activity_events`, `archive_documents`,
   `evidence_citations`, `source_traces`, `reactions`, `posts`.
   `polynetCanonicalOperationReceipts` are permanent idempotency and audit
   authority and never participate in this retirement.
5. Dry-run each bounded batch first. The default is dry-run; state it explicitly
   in operator receipts:

```bash
npx convex run communityAiFeedRetirement:deleteAiFeedRetirementBatchInternal \
  '{"communityId":"<community-id>","category":"member_settings","expectedCensusVersion":"ai_feed_retirement_census_v3","limit":25,"dryRun":true}' --prod
```

6. Review `wouldDelete`, `wouldPatch`, `blockedRows`, and `skipped`. Only then
   repeat the same exact category and version with `"dryRun":false`. Continue
   bounded batches until `hasMore` is false, then advance to the next category.
   Never bypass an `ai_feed_retirement_order_blocked` error.
7. Community intelligence nodes, edges, compiler history, mutations, change
   requests, retrieval receipts, outcomes, and metabolizer receipts that carry
   Feed lineage deliberately fail closed, even when the row appears Feed-only.
   Community memory is protected core. Preserve or reconstruct its evidence
   under a separately reviewed migration with explicit human authorization;
   never coerce it through this deleter.
8. Mixed repository retrieval logs are patched to remove only retired Feed
   references. Pure Feed retrieval logs may be deleted. Canonical operation
   receipts are always preserved.
9. Re-run the complete census twice. Release B remains blocked until both runs
   report `retirementComplete: true`, every count is zero, and no scan is
   truncated, blocked, or dangling.

The cleanup patches `communityMemberSettings.aiFeedLastSeenAt` away while
preserving all other member settings. It does not delete shared rows based on
free-text mentions of “AI Feed.”

### Builder Partner v1 terminal state

Builder Partner v1 is retired and its evidence migration is complete. Before the
terminal cleanup release, production was backed up and the final bounded inspection
proved all of the following without truncation:

- zero legacy Builder Partner source documents;
- four retained grandfather grants with no identity, terms, source, or duplication
  mismatch;
- eight retained community inference policies with the community owner as payer,
  historically recorded in `owner_api_key` and `pending_credential` state before
  the hosted-only cutover; these values are migration evidence, not current product authority;
- a sorted ownership distribution `1/2/2/3` across the eight communities;
- zero attribution, commission, adjustment, payout batch, payout transfer, and
  payout item rows; and
- the terminal migration phase `source_deleted`.

The seven legacy Partner table schemas and the temporary migration code are deleted
in the terminal cleanup release. The nine public retired tombstones remain only for
cached production client compatibility. They are deterministic, read no product or
financial state, and cannot enroll, attribute, accrue, approve, or transfer money.

The four partner grandfather records remain permanent historical evidence only. The
eight partner-derived community inference policies were bounded cleanup inputs, not
permanent funding truth. The completed cohort migration created the verified founder
grants and deleted all eight policy rows. Production was reverified at zero policy
rows before the obsolete schema and completed initializer were removed. Do not
recreate either as an active product or migration surface.

The production backup was completed before source deletion and is retained outside
the repository under operator control. Its SHA-256 is
`96be1c4d09b4164a6abe6a6807843805c656c4c7ec6dfa994b3b333de7cc42b6`.
Do not recreate the retired tables or migration functions. Any future partner
program must begin from a new explicit product and financial contract.

### R41NB0W one-off operator retirement

The exact pre-retirement production backup is retained at
`/Users/neilmcdevitt/code/arx-local-backups/20260801-founder-inference-pre-migration/polynet-wry-hawk-715-pre-founder-inference.zip`.
Its SHA-256 is
`7c3238c4f01f98459d55b7740b77f7051324dffda0449fadc2aac003e6975674`.

R41NB0W retirement completed on 2026-08-01 and is recorded in
`docs/r41nb0w-operator-retirement-v1.md`. The exact-ID migration preserved the
user's identity and historical financial/audit records, its post-deletion
inspection reached `retired`, and the temporary operator module was removed.

### Auto-recharge terminal state

The retired workspace auto-recharge creation and execution paths had already
been removed. Production was reverified with zero `workspaceAutoRechargeSettings`
and zero `workspaceAutoRechargeAttempts` rows before their empty schemas and
reconciliation-only diagnostics were deleted. Historical top-up checkout rows,
credit balances, provider-cost evidence, usage collections, and operator
financial reconciliation remain intact. Do not recreate auto-recharge as an
account or entitlement surface.

## Web Production Rule

- Web production deploys come only from `npm run release:prod` at exact `origin/main`.
- Do not run `vercel deploy --prod`, `vercel promote`, `vercel alias`, or `vercel rollback` by hand.
- If the release command is blocked, fix the blocking guard instead of bypassing it.

## Release Types

### Community-first compatibility

The retired onboarding activation table, community onboarding configuration field,
and their migration tooling were removed after a complete production scan found no
stored rows or dedicated onboarding threads. Do not recreate that persistence layer.

The temporary `requestOnboardingGuideKickoff` shim still routes cached clients into
the canonical global member-agent channel. It must remain stateless: no activation
record, onboarding skill, agent run, or dedicated thread. Retire the shim separately
after the cached-client compatibility window is explicitly closed.

### Normal release

Use when the change is ready and not urgent.

The release command deploys Convex before the web app, so the previous web
briefly runs against the new backend. Keep every backend change backward
compatible with the currently live web. If it is not, split it into a
compatibility release first.

1. Make the change and run the relevant local checks.
2. Land the intended changes on `main`.
3. From a clean checkout at `origin/main`, run `npm run release:prod`.
4. Commit the receipt and run the smoke test checklist below.

### Hotfix

Use when production is broken or trust is at risk.

1. Minimize scope.
2. Verify locally.
3. Land it on `main` immediately.
4. Run `npm run release:prod`. For a web-only regression, first consider
   `npm run release:rollback -- <deployment-id>` using the rollback target in the
   last receipt.

## Local Verification

Run focused checks while iterating, but use the executable release gate as the
single local decision before proposing a release:

```bash
cd /Users/neilmcdevitt/code/arx
npm ci
npm --prefix apps/web ci
npx playwright install chromium # once per matching Playwright version
npm run release:gate
```

The local gate runs checked-in Convex generated-surface sanity and typechecking,
web typechecking, a production web build with an unambiguous Git build marker,
bundle budget, foundation invariants, all conventional
behavior tests, and dependency security checks. It writes machine-readable
evidence to `artifacts/release-gate.json`. The required media browser proof writes screenshots to `artifacts/media-reading/`; CI installs matching Chromium and uploads these artifacts even on failure. Missing browser binaries fail the gate.

Release-gated repository absence checks distinguish all three search outcomes:
matches fail the contract, no matches pass it, and scanner or target failures
fail the gate as infrastructure errors. Conventional behavior tests exercise
the real public community access lifecycle—including join policy, manager
approval, revocation, and subsequent native/MCP authorization—rather than
accepting source-marker assertions as behavioral proof.

Local mode records dirty working-tree state so it is useful during development,
marks its build identity as `<sha>-dirty`, and is not release-authoritative.
`ci` mode requires a clean checkout whose `HEAD` matches the requested full
commit SHA and emits that exact SHA as the build identity. `npm run release:prod`
runs it on the release candidate, which makes it the canonical pre-release
decision. The GitHub `Release Gate` job runs the same executable and is advisory:
a release never depends on GitHub Actions.

The release gate is validation only. It must never push Git, deploy Convex,
deploy or promote Vercel, mutate production, or roll back a release.

### Runtime Credit Accounting Gate

Before a production release that touches runtime execution, provider-cost
tracking, credits, checkout, or accounting diagnostics, run the read-only production accounting
smoke. The command retains its legacy internal name:

```bash
cd /Users/neilmcdevitt/code/arx
npm run smoke:workspace-credit-accounting-prod-data
```

Treat `health: "pass"` as the accounting release gate. A failure means the release should stop
until the critical fields in the smoke output are understood.

The reconciliation planner is diagnostic-only:

```bash
cd /Users/neilmcdevitt/code/arx
npm run plan:workspace-credit-accounting-reconciliation-backlog:prod
```

Do not use the planner as permission to mutate production accounting history. Historical
provider-cost mirror cleanup requires a separate operator-reviewed plan and must not retroactively
debit users.

## Post-Deploy Smoke Test

After every production release, verify the changed surface and at least these core flows:

1. Auth/session bootstrap
2. Founder community create/manage and funnel link
3. Member Discover/funnel/gate/join
4. Community navigation, post/chat, voice, and resources
5. Personal-agent explicit community context and separate community-agent behavior when touched
6. Official Polynet MCP authenticated community context when touched
7. Billing checkout, entitlement convergence, and builder payout readiness when touched

If the release touched billing, check both:

- Community checkout and Stripe Connect payout readiness
- Founder subscription, per-community allowance, and provider-cost evidence when founder funding is touched

## Decision Rules

Ship now only if the change does at least one of these:

- fixes a production bug
- removes user confusion or friction in a core flow
- improves trust, safety, or billing correctness
- unblocks a near-term product objective

If it is mostly cleanup, renaming, or architecture polish without user pressure, it should usually wait.

## Rollback Posture

Before release, know:

- what exact user problem this change solves
- whether it changes behavior or only internals
- what the likely failure mode is
- the rollback target recorded in the previous receipt

If the failure is web-only, roll back with `npm run release:rollback -- <deployment-id>`.
It only accepts a ready production deployment of project `polynet`, never touches
Convex, and waits until `version.json` changes. After a rollback, Vercel stops
auto-assigning the production domain; the next `release:prod` promotes its
deployment explicitly.
If the failure is backend/data-contract related, stop and assess before compounding the issue with more deploys.

## Weekly Alpha Operating Loop

Every week, sort incoming work into:

- `Now`: broken, trust-damaging, or workflow-blocking
- `Later`: useful, but not urgent

Prioritize in this order:

1. Breakage
2. UX friction in core flows
3. Conversion/activation blockers
4. Everything else

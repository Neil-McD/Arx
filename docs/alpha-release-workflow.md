# Alpha Release Workflow

## Canonical Truths

- Active development worktree: `/Users/neilmcdevitt/code/arx`
- Legacy workspace worktree snapshots are historical only and are not part of active development or release truth
- Canonical Git remote: `origin` -> `Neil-McD/Arx`
- Canonical release branch: `main`
- Canonical production web target: Vercel project `polynet`
- Canonical production Convex target: production deployment for this repo
- Legacy Vercel project `arx` is not a live target

## Default Release Model

Use one truth per layer:

1. Build and verify in the root `main` worktree at `/Users/neilmcdevitt/code/arx`.
2. Land the intended Git delta on `main`.
3. Push `main`.
4. Let Vercel `polynet` production deploy from GitHub `main`.
5. Deploy Convex production intentionally when backend/schema/env changes require it.
6. Run the post-deploy smoke check.

For official Polynet MCP provider changes, treat Convex as required, not
optional. If a change touches files like:

- `/Users/neilmcdevitt/code/arx/convex/httpMcp.ts`
- `/Users/neilmcdevitt/code/arx/convex/memberOntology.ts`
- `/Users/neilmcdevitt/code/arx/shared/polynetMcp.ts`
- `/Users/neilmcdevitt/code/arx/shared/polynetMcpSetup.ts`

then the release is not complete until:

1. `main` is pushed and `polynet` is deploying from GitHub
2. `npm run convex:deploy` has been run from the validated code state
3. the metadata smoke passes against the canonical production URL
4. one authenticated official Polynet MCP call has been re-tested on production

This is the canonical path. Do not rely on branch names, preview URLs, or old Vercel projects as release truth.

### Third-party MCP consumer retirement

Removing Polynet's third-party MCP consumer is a two-release data migration:

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
7. Require both:

```bash
npm run check:no-third-party-mcp-surface-proof
npm run check:third-party-mcp-retirement-complete-proof
```

Never delete the production rows before the first release proves ordinary
product traffic can no longer create or refresh them.

### Builder Partner v1 terminal state

Builder Partner v1 is retired and its evidence migration is complete. Before the
terminal cleanup release, production was backed up and the final bounded inspection
proved all of the following without truncation:

- zero legacy Builder Partner source documents;
- four retained grandfather grants with no identity, terms, source, or duplication
  mismatch;
- eight retained community inference policies with the community owner as payer,
  all in `owner_api_key` and `pending_credential` state;
- a sorted ownership distribution `1/2/2/3` across the eight communities;
- zero attribution, commission, adjustment, payout batch, payout transfer, and
  payout item rows; and
- the terminal migration phase `source_deleted`.

The seven legacy Partner table schemas and the temporary migration code are deleted
in the terminal cleanup release. The nine public retired tombstones remain only for
cached production client compatibility. They are deterministic, read no product or
financial state, and cannot enroll, attribute, accrue, approve, or transfer money.

The four partner grandfather records remain permanent historical evidence only. The
eight partner-derived community inference policies are not permanent funding truth;
they are bounded cleanup inputs for `initializeExistingFounderInferenceCohortInternal`.
Before deleting them, export and verify a production backup, run the migration in
dry-run mode with the explicit nine verified owner user IDs, and require exact counts:
nine unique owners who each own at least one community and eight policies that are
all `builder_partner_v1`, `owner_api_key`, and `pending_credential`. The same atomic
mutation then creates any missing founder grants and deletes only those eight rows.

The production backup was completed before source deletion and is retained outside
the repository under operator control. Its SHA-256 is
`96be1c4d09b4164a6abe6a6807843805c656c4c7ec6dfa994b3b333de7cc42b6`.
Do not recreate the retired tables or migration functions. Any future partner
program must begin from a new explicit product and financial contract.

## Web Production Rule

- Web production deploys must come from GitHub `origin/main` through Vercel project `polynet`.
- Do not run direct local Vercel production deploys from a worktree snapshot.
- If the Git-based release path is blocked, fix the Git path instead of bypassing it.

## Release Types

### Community-first transition release

Use this sequence while retiring the old onboarding agent and moving members to the
global member-agent channel. This is a two-phase compatibility release, not an atomic
web/backend cutover.

1. From the exact validated release commit, run the read-only production preflight:

```bash
npm run preflight:community-first-release:prod
```

2. Stop if any production scan is truncated, any source-compatibility check fails,
   or a dedicated `community-onboarding:` thread exists. Historical thread/message
   deletion requires a separate data review and is never automatic.
3. Deploy Convex production first. The temporary `requestOnboardingGuideKickoff`
   shim routes cached old clients into the global member-agent channel; it does not
   restore the old onboarding activation, skill, runtime, or dedicated thread.
4. Confirm both the temporary kickoff RPC and the new member-agent/global-entry
   functions are present before changing the web release.
5. Land and push the same validated commit on `main`, then let Vercel project
   `polynet` deploy it through GitHub.
6. Smoke a cached old browser session and a fresh browser session. Both must enter
   the normal community surface and open the same user-owned global agent channel.
7. After the cached-client window, run the bounded functions in
   `legacyOnboardingMigration.ts` until each returns `isDone: true`, then rerun the
   production preflight and verify all legacy counts are zero.

```bash
npx convex run legacyOnboardingMigration:clearCommunityMemberOnboardingPageInternal \
  '{"paginationOpts":{"numItems":100,"cursor":null}}' --prod
npx convex run legacyOnboardingMigration:deleteAgentLifecycleActivationsPageInternal \
  '{"paginationOpts":{"numItems":100,"cursor":null}}' --prod
npm run preflight:community-first-release:prod
```

If a cleanup response returns `isDone: false`, pass its `continueCursor` as the
next call's `paginationOpts.cursor`. Do not use `--push` during production cleanup.

8. In a later cleanup release, remove the temporary RPC, migration module,
   `agentLifecycleActivations` validator, and `communities.memberOnboarding` validator.

Never deploy the web first during this transition: the new web requires backend
functions that production does not currently expose. Never remove the legacy schema
validators before the stored legacy values have been cleared.

### Normal release

Use when the change is ready and not urgent.

1. Make the change in `/Users/neilmcdevitt/code/arx`.
2. Run the relevant local checks.
3. Land the intended changes on `main`.
4. Push `main`.
5. If Convex changed, run:

```bash
cd /Users/neilmcdevitt/code/arx
npm run convex:deploy
```

6. Confirm Vercel `polynet` production deploys from `main`.
7. Run the smoke test checklist below.

### Hotfix

Use when production is broken or trust is at risk.

1. Minimize scope.
2. Verify locally.
3. Prefer landing on `main` immediately.
4. Push `main` and let `polynet` deploy from GitHub.
5. If backend/runtime changes are part of the hotfix, deploy Convex intentionally from the validated worktree.

## Local Verification

Run focused checks while iterating, but use the executable release gate as the
single local decision before proposing a release:

```bash
cd /Users/neilmcdevitt/code/arx
npm ci
npm --prefix apps/web ci
npm --prefix apps/preview-proxy ci
npm run release:gate
```

The local gate runs checked-in Convex generated-surface sanity and typechecking,
web typechecking, a production web build with an unambiguous Git build marker,
bundle budget, preview-proxy validation, foundation invariants, all conventional
behavior tests, and dependency security checks. It writes machine-readable
evidence to `artifacts/release-gate.json`.

Release-gated repository absence checks distinguish all three search outcomes:
matches fail the contract, no matches pass it, and scanner or target failures
fail the gate as infrastructure errors. Conventional behavior tests exercise
the real public community access lifecycle—including join policy, manager
approval, revocation, and subsequent native/MCP authorization—rather than
accepting source-marker assertions as behavioral proof.

Local mode records dirty working-tree state so it is useful during development,
marks its build identity as `<sha>-dirty`, and is not release-authoritative.
The GitHub `Release Gate` job runs the same executable in `ci` mode, requires a
clean checkout whose `HEAD` matches the requested full commit SHA, emits that
exact SHA as the build identity, and uploads the evidence file. That single
required status is the canonical pre-release decision.

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
- Runtime credit top-up when runtime accounting is touched

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
- how to revert quickly through Git and Vercel rollback, not a local worktree snapshot

If the failure is web-only, prefer reverting the web change quickly.
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

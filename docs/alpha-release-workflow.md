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

For personal MCP/control-plane changes, treat Convex as required, not optional. If a change touches files like:

- `/Users/neilmcdevitt/code/arx/convex/appValidation.ts`
- `/Users/neilmcdevitt/code/arx/convex/userPlatformAppMounts.ts`
- `/Users/neilmcdevitt/code/arx/convex/appConnections.ts`
- `/Users/neilmcdevitt/code/arx/convex/developerApps.ts`

then the release is not complete until:

1. `main` is pushed and `polynet` is deploying from GitHub
2. `npm run convex:deploy` has been run from the validated code state
3. one real MCP connect attempt has been re-tested on production

This is the canonical path. Do not rely on branch names, preview URLs, or old Vercel projects as release truth.

## Web Production Rule

- Web production deploys must come from GitHub `origin/main` through Vercel project `polynet`.
- Do not run direct local Vercel production deploys from a worktree snapshot.
- If the Git-based release path is blocked, fix the Git path instead of bypassing it.

## Semantic Platform Staging Lane

The semantic-platform program uses one isolated non-production integration lane:

- worktree: `/Users/neilmcdevitt/code/arx/.worktrees/semantic-platform-staging-20260719`
- branch: `codex/semantic-platform-staging-20260719`
- Vercel project: `polynet-staging`
- Convex deployment: `dev:quick-porcupine-949`
- deployment kind: `staging`

This lane begins at the exact production web commit but never deploys from `main`.
The existing semantic feature worktree is source material only; transfer one clean,
reviewable changeset at a time into the staging lane.

Before any staging operation, run:

```bash
npm run check:semantic-platform-staging
npm run check:semantic-platform-staging-proof
npm run check:semantic-platform-staging-remote
```

The guard fails closed unless the worktree, branch, upstream, Vercel project, and
Convex selector are the exact non-production identities above. It also rejects
deploy-key authority and production-shaped selectors. The ignored
`.env.staging.local` and `.vercel/project.json` files must remain local.
The read-only remote guard requires an authenticated Vercel CLI. It verifies that
the `polynet-staging` project tracks the canonical staging branch, automatically
assigns production domains, and owns `polynet-staging.vercel.app` without a stale
branch, redirect, or custom-environment override.

Web staging releases are Git-based. Do not run direct local Vercel deploy,
promote, alias, or rollback commands. Use the stable production domain owned by
the `polynet-staging` project after its Git production branch is set to the
semantic staging branch. The canonical staging web origin is
`https://polynet-staging.vercel.app`; project- and deployment-specific Vercel
domains are implementation details and are not acceptance targets. Verify that
the canonical origin's `version.json` matches the exact staged commit before any
signed-in smoke.

When a slice changes Convex code or schema, deploy staging Convex first from the
exact clean commit:

```bash
npm run deploy:semantic-platform-staging-convex
```

The release guard permits that clean commit to be ahead of the staging upstream
only when the upstream is an ancestor of `HEAD`; it rejects behind or divergent
history. This preserves Convex-first ordering before the exact same commit is
pushed for the Git-based web deployment.

Then allow the staging Vercel project to deploy the same Git commit. Verify the
staging build marker and signed-in behavior before considering any separate
production release. Recheck the production build marker afterward; staging work
never grants permission to change production.

## C9 Operational Recovery Boundary

C9 recovery work begins from the semantic-platform staging lane and follows
[`docs/system-map/17-operational-recovery-contract-v1.md`](system-map/17-operational-recovery-contract-v1.md).

C9.0A/B is source-only and C9.0C is metadata-only. None may create, download,
import, restore, or delete a backup; change periodic-backup configuration or
provider plan; copy production data; deploy Convex; or implement a runtime
recovery executor. The operational-recovery proof must own every current table,
storage reference, exact cron signature, and exact scheduler target before the
metadata audit begins.

Before any C9.1 backup action:

1. run all three semantic-platform staging guards;
2. verify the exact clean staging commit and canonical deployment identities;
3. record backup configuration as metadata only: provider, deployment, plan,
   cadence, retention, last-success time, and file-storage inclusion;
4. confirm the target is staging and production remains unchanged; and
5. obtain explicit authorization for the backup action.

Before any C9.2 restore action:

1. use a disposable, access-controlled non-production deployment, never
   canonical staging or production;
2. omit all outbound provider secrets;
3. preserve no backup archive in Git or durable local storage;
4. fail closed before authenticated reads, writes, and external effects; and
5. obtain separate explicit authorization before deleting the disposable
   deployment or temporary backup artifact.

`npx convex import --prod`, production dashboard restore, and restoration over
canonical staging are forbidden C9 staging paths. Provider capability is not
configuration evidence, and Git/Vercel rollback is not product-data recovery.

## Release Types

### Community-first transition release

Use this sequence while retiring the old onboarding storage and moving members to the
global member-agent channel. The cached-client RPC is a separate compatibility boundary;
the deleted storage validators must never be promoted while production still stores
legacy values.

1. From the exact validated release commit, run the read-only production preflight:

```bash
npm run preflight:community-first-release:prod
```

2. Stop if any production scan is truncated, a source-boundary check fails, a
   dedicated `community-onboarding:` thread exists, or either legacy storage count
   is nonzero. Historical thread/message deletion requires a separate data review
   and is never automatic.
3. If legacy storage is nonzero, run the bounded cleanup functions that are still
   deployed on the current production backend. This must happen before deploying
   the schema-removal commit:

```bash
npx convex run legacyOnboardingMigration:clearCommunityMemberOnboardingPageInternal \
  '{"paginationOpts":{"numItems":100,"cursor":null}}' --prod
npx convex run legacyOnboardingMigration:deleteAgentLifecycleActivationsPageInternal \
  '{"paginationOpts":{"numItems":100,"cursor":null}}' --prod
npm run preflight:community-first-release:prod
```

If a cleanup response returns `isDone: false`, pass its `continueCursor` as the
next call's `paginationOpts.cursor`. Do not use `--push` during production cleanup.
The staging source intentionally no longer contains the migration module; these calls
target the still-deployed production functions and disappear when the cleanup commit
is promoted.

4. Rerun the preflight and require zero legacy field rows, zero activation rows, and
   zero dedicated onboarding threads.
5. Deploy Convex production first from the exact validated cleanup commit.
6. Confirm the temporary `requestOnboardingGuideKickoff` shim and the current
   member-agent/global-entry functions remain present.
7. Land and push the same validated commit on `main`, then let Vercel project
   `polynet` deploy it through GitHub.
8. Smoke a cached old browser session and a fresh browser session. Both must enter
   the normal community surface and open the same user-owned global agent channel.
9. Remove the cached-client RPC only in a separately reviewed release after its
   compatibility window or observed usage is explicitly closed.

Never deploy the web first during this transition. Never deploy the schema-removal
commit before the production preflight proves the stored legacy values are zero.

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

Run only the checks relevant to the change. Common commands:

```bash
cd /Users/neilmcdevitt/code/arx
npm run convex:codegen
npm run check:gate-parity
npm run check:runtime-turn-contract-guard
npm run check:web-typecheck
npm --prefix apps/web run build
```

### Workspace Credit Accounting Gate

Before a production release that touches runtime execution, workspace billing, provider-cost
tracking, credits, checkout, or accounting diagnostics, run the read-only production accounting
smoke:

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
2. Workspace send/run
3. Preview open/load
4. Community join/request/cancel if touched
5. Member admin actions if touched
6. Billing checkout if touched

If the release touched billing, check both:

- Community checkout and Stripe Connect payout readiness
- Workspace credit top-up

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

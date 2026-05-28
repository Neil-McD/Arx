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

## Release Types

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

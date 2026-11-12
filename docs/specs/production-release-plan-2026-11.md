# Production release plan (November 2026)

Status: draft for Neil, 2026-11-12. Nothing here has been run. Production is
`138ef7ce3`; `main` is 45 commits ahead (design v1, the agent gateway's first
slices, pods). The runbook is `docs/alpha-release-workflow.md`; this plan is
what to release, in what order, and how to step back.

## The shape: two stages

The release script refuses to ship `VITE_DESIGN_V1` to production
(`FORBIDDEN_PRODUCTION_ENV` in `scripts/lib/releaseProduction.mjs`), on
purpose, until Neil accepts the design on staging. So going live is two
separate decisions:

1. **Backend and classic app** (`npm run release:prod` at `origin/main`, switch
   off). Members see the app they see today. The new backend goes live
   underneath it.
2. **Design v1 on** (remove the guard, set the switch for production, release
   again). This is when members see Home, the Linear look, Knowledge, Pods.

Stage 1 is low risk and worth doing soon: it shrinks the gap, and it proves
the backend in production before any member sees new screens.

## Before stage 1 (needs Neil, a few minutes each)

- **Prove pod money on staging.** Connect Stripe in test mode on
  `polynet-demo` (Manage), then one paid pod join, one leave, one refund with
  Stripe's test card while the backend is watched. Pod billing has only ever
  run against simulated Stripe events.
- **Turn on the Agent plan on `polynet-demo`**, so the paid side of the agent
  gateway can be checked.
- **Sign in to staging in Chrome again** (the session ended), so the mobile
  pass can run.

## Stage 1: backend and classic app

**What goes live**

- New tables, all additive: `communityPods`, `communityPodRequests`,
  `communityPodPayments`, `communityPodNotes` (if merged), `communityOwnerMoments`,
  `communityMemberVisits`; new optional fields on `communityEvents` and
  `communityNotes`. Nothing existing is changed or removed, so the current web
  build keeps working against the new backend.
- Stripe notices: anything carrying `pod_payment_id` goes to the pod path;
  everything else takes the path it takes today. Refund and dispute handling
  checks for a pod payment first, then continues as before.
- One new hourly job: "stop billing for unreachable pods". With no pod
  payments it reads nothing.
- Leaving, removal, lapse, a host taking someone off a private room, and
  archiving each ask whether that person pays for a pod; with none, nothing
  is scheduled.
- The classic app: whatever in the 45 commits is not behind the switch.
  **To do before releasing: list those changes** (`git diff 138ef7ce3 origin/main`
  filtered to code outside `isDesignV1Active()` and `v1/`), and click through
  each on staging with the switch off.

**Steps**

1. `npm run release:verify` at exactly `origin/main` (deploys nothing; runs
   the guards, the gate, settings parity and the production preflight).
2. Fix anything it reports (for example a setting staging has that production
   lacks).
3. On Neil's word: `npm run release:prod`. Commit the receipt.
4. Smoke checklist from the receipt, plus:
   - sign in; open a community; post; open Events;
   - a free join and a paid community join still work;
   - the hourly pod job's first run logs `checked: 0`;
   - Stripe's webhook dashboard shows no new failures for an hour.

**Stepping back**

- Web: the release records the previous deployment as the rollback target.
- Backend: additive only, so the previous web build runs against it. A backend
  fault is fixed forward (a new release), not rolled back.

## Stage 2: design v1 on

**Before**

- Neil accepts design v1 on staging (the acceptance the guard is waiting for).
- Mobile: design v1's layout is desktop only today; phones keep the classic
  layout, which has no Pods entry. Decide: ship desktop first and say so, or
  do the mobile pass first.
- Rebuild of Your guide and Manage is not done; the v1 app links to the
  existing ones.

**Steps**

1. Remove `VITE_DESIGN_V1` from `FORBIDDEN_PRODUCTION_ENV` (the design plan's
   last slice) and set it for the production build, in one reviewed change.
2. `npm run release:verify`, then on Neil's word `npm run release:prod`.
3. Acceptance clicks in production: Home, Inbox, a channel, Knowledge, Events,
   Members, Pods (list, a pod's page, a pod's room), the command palette, light
   and dark.

**Stepping back**

- Unset the switch and release again: the classic app returns. Data made in
  v1 (pods, notes, owner moments) stays and is simply not shown.

## What should not ship yet, even with v1 on

- **Paid pods** until the staging payment proof above is done. Builders could
  set a price the moment v1 is on. Either do the proof first, or hold the
  price field back behind a second switch.
- **The agent gateway's paid side** until checked with the Agent plan on.

## Decisions for Neil

1. Do stage 1 now, on its own? (Recommended.)
2. For stage 2: desktop first, or wait for mobile?
3. Paid pods at stage 2: proof first, or hold the price field back?

# Production release plan (November 2026)

Status: updated 2026-11-17. **Stage 1 was released that day** at `f7995ec96`
(receipt: `docs/receipts/2026-11-17-production-f7995ec96.md`); production
runs the new backend under the classic look. Stage 2 has not been run.
Before stage 1, production was `138ef7ce3`, 191 commits behind (663 files). The
first version of this plan (Nov 12) was written at 45 commits. The runbook
is `docs/alpha-release-workflow.md`; this plan is what to release, in what
order, what Neil has to do himself, and how to step back.

## The shape: two stages

Design v1 is on only where the build has `VITE_DESIGN_V1` set, which is the
staging project alone. The release script used to refuse that setting in
production; that guard was lifted on Nov 17 to prepare stage 2, so the
setting itself is now the switch. Going live is two separate decisions:

1. **Backend and classic app** (`npm run release:prod` at `origin/main`,
   switch off). Members see the app they see today. The new backend goes
   live underneath it.
2. **Design v1 on** (remove the guard, set the switch for production,
   release again). This is when members see the new app.

Stage 1 shrinks the gap and proves the backend in production before any
member sees new screens. The gap has quadrupled since this plan was first
written, so the case for doing stage 1 on its own is stronger, and so is the
need to check the classic app first (below).

## What only Neil can do

Before stage 1:

1. **Prove pod money on staging.** Connect Stripe in test mode on
   `polynet-demo` (Manage), then one paid pod join, one leave and one refund
   with Stripe's test card while the backend is watched. Pod billing has only
   ever run against simulated Stripe events. (Or decide pods' price field
   stays back; see "What should not ship yet".)
2. **Turn on the Agent plan on `polynet-demo`,** so the paid side of the guide
   can be checked, including what its background memory work costs.
3. **Say the word for `release:prod`.** Nothing is released without it.

Before stage 2:

4. **Accept design v1 on staging.** This is what the guard waits for.
5. **Create one community on staging** through the new three-step start
   flow (or say yes to a throwaway one being created), so Create and the
   launch step are seen working.
6. **Decide** the three questions at the end.

## Stage 1: backend and classic app

**What goes live**

- **19 new tables since `138ef7ce3`, all additive.** Listed in the first
  version of this plan: `communityPods`, `communityPodRequests`,
  `communityPodPayments`, `communityPodNotes`, `communityOwnerMoments`,
  `communityMemberVisits`, `communityTiers`, `connectedApps`,
  `connectedAppDeliveries`, `communityAppGrants`, `communityMemberNotes`.
  New since Nov 13: `communityNoteRevisions`, `communityNoteRemovals`,
  `communityMemoryIndex`, `communityKnowledgeUse`, `communityBriefs`,
  `memberMemories`, `agentWork`, `agentWorkRuns`.
- **Changed fields are additions too.** `communityNotes` gains optional
  `scopeKey` and `authorKind`, and `source` accepts one more value
  (`learned`). Existing rows stay valid. Nothing is removed, so the current
  production web build keeps working against the new backend.
- **One new daily job** since Nov 13: "repair lost memory reviews"
  (`agentWork.repairAgentWorkScheduleInternal`). The guide's memory reviews
  schedule themselves per community.
- **The guide's background memory work starts in production** for
  communities with the agent on. It uses AI. Check what it does and costs
  on `polynet-demo` (item 2 above) before it runs on real communities.
- **Stripe, pods, plans and connected apps:** as in the first version of this
  plan. Anything carrying `pod_payment_id` goes to the pod path; with no pods,
  plans or connected apps (true of every production community) nothing
  changes. The hourly "stop billing for unreachable pods" job reads nothing.
- **The public functions the old knowledge step called stay**
  (`communityBuilderKnowledgeSetup:*`): production's current web build still
  calls them until its tab is refreshed.

**The classic app must be clicked through first**

Since Nov 13, 342 files under `apps/web/src`, `shared` and `convex` changed.
Much of it is behind the switch (89 checks of `isDesignV1Active()`), but not
all. With the switch off, on staging, check at least:

- **Starting a community.** The knowledge step was removed for both layouts
  (#616). The classic form is unchanged, but what follows it is the new
  launch step, which is styled for design v1. It has not been looked at with
  the switch off. If it looks wrong, fix it before stage 1.
- **Addresses.** Old addresses (`/agent`, `/resources`, `?open=`, `?thread=`,
  `?lesson=`, `?view=`) are rewritten; refresh, Back and Forward keep your
  place (#584–#608).
- **Live updates** on Events, Pods, join requests, Members and Knowledge
  (#597–#609).
- **Discover's listing** now carries the host, member count and activity
  (#611); the classic Discover panel reads the same listing.
- **The community switcher and account menu** exist only in v1; confirm the
  classic rail and menus are as they were.
- **A signed-out visitor** to a community with no site sees "Sign in" on
  `/c/<slug>`; a signed-in non-member sees "You're not a member yet".
- Owner pass: General, a private room, Knowledge, Events, Agent, Manage and
  Pricing load with no errors. (Last done Nov 13 at `d2ab33b0b`; redo.)

**Steps**

1. `npm run release:verify` at exactly `origin/main` (deploys nothing; runs
   the guards, the gate, settings parity and the production preflight). It
   last passed at `d2ab33b0b` on Nov 13, 138 commits ago.
2. Fix anything it reports.
3. On Neil's word: `npm run release:prod`. Commit the receipt.
4. Smoke checklist from the receipt, plus:
   - sign in; open a community; post; open Events;
   - a free join and a paid community join still work;
   - start a community end to end;
   - the hourly pod job's first run logs `checked: 0`;
   - Stripe's webhook dashboard shows no new failures for an hour.

**Stepping back**

- Web: the release records the previous deployment as the rollback target.
- Backend: additive only, so the previous web build runs against it. A
  backend fault is fixed forward (a new release), not rolled back.

## Stage 2: design v1 on

**What members get:** the new look on desktop and phone (phones were done in
#490–#494; the first version of this plan said desktop only), Home with the
guide, Inbox as a page, Knowledge, Pods, Events and Members pages, Discover,
the community switcher and account menu, and the three-step start flow.
The rules they follow are in `docs/specs/web-architecture-end-state.md`.

**Before**

- Neil accepts design v1 on staging.
- Checked by hand on staging as host (every page, refresh, Back, Forward,
  desktop and phone width) and in "View as a member".
- **Not yet verified, to do before stage 2:**
  - pressing Create and the launch step in the start flow, and the form's
    phone layout;
  - a real member's account (only "View as a member" was used);
  - a community with its guide off;
  - a change made by another person arriving while a page is open;
  - layout shift on a slow connection.
- **The automated browser check** from the architecture doc (load each page,
  fail on a layout shift over the budget, walk refresh, Back and Forward) is
  not built. Decide: build it first, or release on the hand checks.
- Rebuild of Your guide and Manage is not done; the v1 app links to the
  existing ones.

**Steps**

1. `VITE_DESIGN_V1` is no longer in `FORBIDDEN_PRODUCTION_ENV` (done Nov 17,
   on Neil's go to prepare stage 2). What remains is setting it for the
   production build on the `polynet` Vercel project: a lasting setting,
   changed only on Neil's word.
2. `npm run release:verify`, then on Neil's word `npm run release:prod`.
3. Acceptance clicks in production: Home, Inbox, a channel, a thread,
   Knowledge, Events, Members, Pods (list, a pod's page, a pod's room),
   Discover, the switcher, the account menu, starting a community, the
   command palette, light and dark, on desktop and on a phone.

**Stepping back**

- Unset the switch and release again: the classic app returns. Data made in
  v1 (pods, notes, owner moments) stays and is simply not shown.

## What should not ship yet, even with v1 on

- **Paid pods** until the staging payment proof is done. Builders could set a
  price the moment v1 is on. Either do the proof first, or hold the price
  field back behind a second switch.
- **The guide's paid side** until checked with the Agent plan on.

## Not part of this release

- **Polynet's own website.** A mock exists on staging only
  (`/design-lab?page=site`, branch `claude/site-mock`, never merged). The real
  page is not built, and it makes claims not yet checked against the product:
  that the guide learns from members' answers on its own, says when it does
  not know, and credits who it learned from.
- **A trial of the guide, and renaming the "Agent plan".** Neither is
  decided or built.
- **Home for a brand-new host.** Today it is empty ("Nothing needs you
  today"). A short "get your first member" list is planned, not built.
- **Founders' own sites** (CLI, SDK): shelved Nov 13.
- **Deleting the classic layout:** after production runs v1.

## Decisions for Neil

1. Do stage 1 now, on its own? (Recommended, after the classic click-through.)
2. Stage 2: build the automated browser check first, or release on the hand
   checks?
3. Paid pods at stage 2: proof first, or hold the price field back?

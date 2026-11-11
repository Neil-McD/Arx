# Design system v1: implementation plan, staging first

Status: in progress on staging since 2026-11-09; production unchanged. This
document is the current state, not a history: section 4 is kept true, and
superseded plans are deleted rather than annotated.
Spec: [design-system-v1.md](design-system-v1.md).

## 1. The approach

Change the live app toward the spec in small slices. Do not rebuild it. Each
slice is one pull request, behind one switch, verified on staging before the
next begins. Production does not change until Neil accepts the whole thing on
staging.

## 2. What the code already gives us

Read from `origin/main` at `542926328` on 2026-11-09, before any slice. Kept as
the starting point; section 4 is what is true now.

| The spec needs | Today | So |
|---|---|---|
| Colour tokens, dark and light | `apps/web/src/base.css` defines them for `:root` and `:root[data-theme="light"]`; the rest of the CSS reads them almost everywhere (about 2,000 `var(--…)` uses against about 200 hard-coded colours outside `base.css`) | Mostly a change of values, plus a sweep of the hard-coded ones |
| Meanings for colour | Roles already exist: `--accent-selection`, `--accent-agent`, `--accent-attention`, `--accent-error`, `--focus-ring`. Today all but error are white or black | Give the roles their colours |
| Geist | Already the app font (`@fontsource-variable/geist`) | Nothing |
| Newsreader | Not loaded | Add it; the bundle budget check will need a look |
| Dark and light, with a setting | `shared/theme.ts`, `WebAppearanceSettingsSection`, guarded by `scripts/app_theme_contract_proof.ts` | Keep; move the switch into the account menu |
| One left column | `shared/CommunityNav.tsx` already has the banner, channels, then Agent, Knowledge, Events, Analytics, Visit site, Invite | Reorder and trim |
| No far-left rail | `WebCommunityRail.tsx` is the rail | Remove on desktop once the switcher exists |
| The agent as Home | The `agent` community tab renders the community agent full-page (`WebCommunityAgentDock` in page mode) | Home is this page with a greeting and a brief above the conversation |
| A host's brief | The founder daily brief exists (`CommunityFounderBriefSection`, the proactive agent spec) | Show it on Home |
| Join requests | `CommunityJoinRequestReview` | Restyle and place on Members |
| Knowledge review for a host | `RuntimeResourceChangesetApprovalCards` | Restyle and place on Knowledge |
| Banner, logo, name | Banner and avatar editors exist in community settings | Restyle as Branding |
| Events | `WebCommunityEventsSection` | Restyle |
| Direct messages | `WebDirectMessageInboxPanel`, `WebDirectMessagePanel` | Restyle as Inbox |

Not in the code today, so each is new work and is called out below: a `home`
tab, a Members page, the command palette, "view as a member", a channel
catch-up, "who to meet", a member's next step, and per-action agent permissions.

I read file names, sizes and the navigation and token files closely, and the
rest only by search. Each slice starts by reading its own files properly, and
this table gets corrected if it is wrong.

## 3. How staging and production stay apart

`AGENTS.md` §8: staging deploys from the `staging` branch (Vercel
`polynet-staging`, Convex `quick-porcupine-949`); merging to `main` deploys
nothing; production is only ever `npm run release:prod`.

Slices will sit on `main` for a while before Neil accepts them, and other work
releases to production from `main` in the meantime. So the new look is behind
one switch:

- A build-time setting, `VITE_DESIGN_V1`, on for the staging project and off for
  production. It sets `data-design="v1"` on the root element.
- New token values are written as `:root[data-design="v1"]` blocks. Structural
  changes check the same switch in React.
- With the switch off, production renders exactly as today. That is each slice's
  rollback.
- The last slice turns the switch on everywhere and deletes the old paths and
  the switch itself. The old look is not kept as an option.

Each slice: Linear issue, branch, pull request with the release gate output,
review by Codex, merge to `main`, then `staging` is brought up to `main` and the
slice is checked on `polynet-staging.vercel.app` in dark and light, as a member
and as a host.

## 4. Where it stands

Measured against the hi-fi mock (scratchpad `polynet-design/hifi/`, backed up in
`~/code/arx-local-backups/polynet-design-hifi-20261109/`). Percentages are a
judgement of the page against the mock, not a measurement.

| Area | Against the mock | Built (PRs) | Missing | Waits on |
|---|---|---|---|---|
| Colours, type, the guide's voice | 90% | #427 #428 | Checked mainly in dark | |
| Frame: left column on the ground, raised panel, one header line, one right column | 90% | #436 #442 #443 #444 | Narrow windows unverified | |
| Left column | 85% | #429-431 #434 #449 | Banner version of the name row (112px card); hints ("3 new", "live in 20 min") | A test banner on staging |
| Community switcher (no rail) | 80% | #434 #444 | Folding into the command palette | Command palette |
| Logo, favicon, app icons | 95% | #437 #439 #440 | Sign-in page logo is set in WorkOS | |
| Home (host and member) | 65% | #432 #433 #435 #436 #449 | Money figures, the guide's week, suggestion chips, richer card kinds | Payments slice; guide work |
| Channel and thread | 70% | #438 #441 #446 #447 | Catch up; channel description; more than one face on the replies line | Catch up spec; a description field |
| Inbox | 50% | #445 #448 | Mentions and replies across communities, guide line, filters, approvals, "Draft a reply"; an address | Inbox part two (backend); routing |
| Events | 50% | #450 | Going, counts and faces; who is hosting; recaps | RSVP slice |
| Members | 45% | #451 #452 | Guide suggestions; bios; host Plan column and Invite; flat list; an address | Routing; member data |
| Knowledge | 10% | header only (#442) | The whole page | Neil: build for what exists, or bring back guide-written notes behind approval |
| Manage, Your guide | 15% / 5% | header only (#442) | Both pages | |
| Discover, your settings | 60% | #444 | Their own header line and content column | |
| Command palette | 0% | | | |
| Mobile | 0% | | Its own design pass | Neil signing in to staging in the built-in browser |

Shipped behind the switch: #427 to #452. Production: none of it.

### How each slice is made now

- Values come from the mock's stylesheet, not by eye. Measure the same elements
  on staging, port the numbers, and preview by injecting the CSS into the live
  staging page before the pull request.
- Each slice ends with the mock and staging side by side, sent to Neil.
- `design-v1.css` is the only stylesheet that changes. Every rule is scoped to
  `:root[data-design="v1"]`. When a later pass changes a value, edit the
  earlier rule; do not append an override.

### Decisions made with Neil

| Date | Decision |
|---|---|
| 2026-11-09 | Neutral default app for any community's banner; one left column; the guide is Home; blue acts, purple is the guide, red is wrong, ink is text |
| 2026-11-10 | The interface says "guide"; the guide writes numerals; suggestion chips only when the composer is focused or on a quiet day |
| 2026-11-10 | The community's name sits on its banner with the dark fade |
| 2026-11-10 | Linear-style frame: the left column on the ground colour, content on one raised panel |
| 2026-11-10 | Order: the shell on every page, then the left column exactly, then each page in left-column order, then each page's right column |
| 2026-11-10 | Inbox and Members are pages, with the selected item in the right column (Members recorded as an exception in `docs/core-contract.md`) |
| 2026-11-10 | Events is a list; the month calendar goes |
| 2026-11-10 | Logo: the flat two-tone network mark with a slight lift; the favicon fills its tile |

## 5. What is next, in order

1. Addresses for Inbox and Members, in one routing change.
2. Knowledge, once Neil chooses its scope.
3. Going (RSVP) for Events: one table, one member action, with a security review.
4. Manage and Your guide.
5. The right column of each page (Catch up, Home's money and week).
6. Command palette.
7. Mobile.
8. Acceptance on staging (section 8), then switch on everywhere and delete the
   old paths (section 9).

## 6. Deliberately not in this plan

Each of these is in the mock, is new product behaviour, and needs its own spec
before anyone builds it.

| In the mock | Why it waits |
|---|---|
| A member's next step on Home | Needs a journey or plan the product does not have |
| "Who you should meet" | New agent behaviour and new use of member data |
| The agent's catch-up for a channel | New agent behaviour, and a cost per view |
| Per-action permissions for the agent ("on its own, asks first, never") | Changes what the agent is allowed to do; touches agent authority |
| Recaps of calls saved to Knowledge | Confirm what exists first |
| View as a member | New; small, but touches access checks |
| Pods | Not designed |
| Mobile | Not designed |
| The door and community sites | Separate surfaces; this plan is the app only |

## 7. Risks

- **The switch doubles some code for a few weeks.** Kept small by making tokens
  do most of the work, and ended by slice 10.
- **Text-matching checks will fail on purpose.** Each is converted to a
  behaviour test before it is changed, never deleted in bulk.
- **Mobile inherits the new colours before it is redesigned.** It is checked on
  staging after slice 1 and slice 2.
- **Home without a member's next step may feel thin.** That is the honest state
  of the product, and the quiet-day design is built for it.
- **The bundle grows** by one variable font.

## 8. Acceptance checklist for staging

All in dark and in light.

- A member can open Home, every channel, a thread, Knowledge, Events, Members
  and Inbox, and send a message in a channel and to the agent.
- A host sees the brief, can approve a join request, approve a note, create an
  event, change the banner, and turn the agent on and off.
- A community with no events shows no Events row.
- No text fails contrast. Nothing is coloured that does not mean something.
- Mobile still works.
- With the switch off, the app is unchanged.

## 9. When the switch goes on everywhere: what to delete

The switch keeps the old app alive beside the new one. On the day v1 is switched
on for production, these go in one pull request, after the switch-on has run on
production for a few days. Text-matching checks that pin the old markup are
turned into behaviour tests first, never deleted in bulk.

Code
- `apps/web/src/components/WebCommunityRail.tsx` (the rail of community icons),
  its props in `webShellChromeShared.ts`, and the rail branch in
  `WebShellChromeHost.tsx`.
- `apps/web/src/components/WebSettingsSidebar.tsx`, replaced by `WebGlobalNavV1`.
- The classic branch of `shared/CommunityNav.tsx` (the "Agent" row, the
  settings gear on the name, the management divider); the `layout` prop.
- The month calendar in `WebCommunityEventsSection.tsx` and
  `getWebCommunityEventsMonthRange`.
- The floating direct-messages panel layout (desktop), the "Messages" wording,
  and the back button beside the list, in `WebDirectMessagesHost.tsx`,
  `WebDirectMessageInboxPanel.tsx` and `WebDirectMessagePanel.tsx`. Mobile keeps
  its own until mobile is redesigned.
- The desktop members pop-up in `ChannelRosterPanel.tsx` (narrow screens still
  use the right-rail list until mobile is redesigned).
- "Agent" as the agent's tag in `communityInteractionFeed.tsx`; the agent page's
  "Agent" title in `WebCommunityAgentDock.tsx`.
- `favicon*.png`, `favicon.svg`, `favicon.ico`, `apple-touch-icon.png`,
  `icon-*.png` and `manifest.webmanifest` at the public root, replaced by
  `brand/v1/` (move those up and drop `applyDesignIcons`).
- The switch itself: `apps/web/designSystemFlag.ts`, `shared/designSystem.ts`,
  every `isDesignV1Active()` branch (15 files today), `VITE_DESIGN_V1` on
  `polynet-staging`, and `FORBIDDEN_PRODUCTION_ENV` in
  `scripts/lib/releaseProduction.mjs`.

Styles
- The `:root[data-design="v1"]` prefix in `design-v1.css` (it becomes the base),
  and the token blocks it replaced in `base.css`.
- Rules for the deleted components above in `community-and-content.css`,
  `shell-and-onboarding.css`, `settings-runtime-and-theme-overrides.css` and
  `index.css`, found by those components' class names.

Docs and checks
- The design-v1 exception in `docs/core-contract.md` becomes the rule.
- `scripts/app_theme_contract_proof.ts` scoping checks for `design-v1.css`.
- Classic expectations in `scripts/community_nav_design_v1.test.ts`,
  `scripts/community_page_header.test.ts` and `scripts/channel_tags_design_v1.test.ts`.

## 10. Decisions taken before slice 0

1. One build switch, not a long-lived branch. Agreed.
2. "Guide", numerals, chips: decided 2026-11-10 (section 4).
3. Members get the quiet-day Home until a "next step" exists. Agreed.

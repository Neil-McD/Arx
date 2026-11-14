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
| Inbox | 65% | #445 #448 #490 #510 | Mentions and replies across communities, guide line, approvals, "Draft a reply"; an address | Inbox part two (backend); routing |
| Events | 55% | #450 #500 | A full test pass (Nov 14 plan, A); RSVP; the event form is still the old pop-up | Test pass; pop-up redesign; RSVP slice |
| Members | 70% | #451 #452 #490 #512 | Guide suggestions; an address; a member's record on a phone (hosts have it) | Routing |
| Knowledge | 60% | #442 #492 | A full test pass (Nov 14 plan, A); the course editor is still the old pop-up | Test pass; pop-up redesign |
| Manage, Your guide | 15% / 5% | header only (#442) | Both pages | |
| Discover, your settings | 60% | #444 | Their own header line and content column | |
| Command palette | 0% | | | |
| Mobile | 85% | #493 #494 #504 #509 #510 #512 | Switcher as a sheet; Pods and a pod's room; a check on a real phone | Neil's phone pass |

Shipped behind the switch: #427 to #512 (status as of 2026-11-14). Production: none of it.

### How each slice is made now

- Values come from the mock's stylesheet, not by eye. Measure the same elements
  on staging, port the numbers, and preview by injecting the CSS into the live
  staging page before the pull request.
- Each slice ends with the mock and staging side by side, sent to Neil.
- The mock is drawn at 1440px wide; Neil's screen is about 1900px. Read the mock
  as proportions: the right column grows with the window
  (`--right-column-width`, 328 to 440px). A channel uses the whole middle on
  fixed gutters (56px header and composer, 44px feed); do not centre it. Home
  is the one page centred in the middle (`--main-measure`, 736px, and
  `--main-gutter`). Check every slice at Neil's width and at 1440.
- No header bars: titles float with no line or band. Every composer is one row
  with its text centred on its icons. One thread with the guide; no "start
  fresh" button.
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

## 5. What is next, in order (Neil, 2026-11-14)

Four workstreams. A and B start together; C waits on Neil's reaction to the
mock; D needs his OK on a one-page spec first.

### A. Test Knowledge and Events end to end (no code until the bug list)

On staging, in a test community nobody else is in (no one is notified), on
desktop and on a phone, as host and as member. Every step gets a pass or a bug.

- **Knowledge:** create, edit, reorder and delete a course and a lesson; mark a
  lesson done; write, edit and delete a note; "Ask anything Polynet knows";
  the guide answers from what it learned; what a member sees; empty states.
- **Events:** create, edit and cancel; a repeating event; timezones (event's
  zone vs the viewer's); online vs a place; "You're going to"; the event on
  Home and on the community's page (`/c/<slug>`); reminders; what a member sees.
- Out: a bug list, ordered, each fixed in the slice that touches its screen.

### B. Pods icon

Three or four candidates from the same icon set as the rest of the left column
(lucide at 17px, 1.7 stroke), drawn in the phone mock and the left column. Neil
picks; one small change in `shared/CommunityNav.tsx`.

### C. Pop-ups, redesigned everywhere

Every pop-up is the old design (a centred box over a dimmed page). Three
replacements, mocked first on the phone-screens canvas:

| Pattern | Desktop | Phone | Replaces |
|---|---|---|---|
| **Panel** (create and edit) | Slides in from the right, the right column's width, over the page; compact fields; Save and Cancel fixed at the bottom | Full screen, back arrow, Save at the bottom | New/edit event (`WebCommunityEventsSection`), course editor (`WebCommunityResourceModuleModal`), member settings (`CommunityMemberSettingsDialog`), create community (`WebCreateCommunityModal`), builder offer (`WebBuilderOfferModal`), profile setup (`WebBlockingSetupModal`), the old Members pop-up (narrow windows, `ChannelRosterPanel`) |
| **Confirm** (are you sure) | A small card, the action in red when it destroys something | The same, near the bottom | Delete lesson (`WebDeleteResourceModal`), delete course (`WebDeleteResourceModuleModal`), sign out (`WebSignOutConfirmModal`), and the six browser `confirm()` boxes (delete a message or reply, cancel an event, chat and navigation guards) |
| **Viewer** (looking, not editing) | Centred, restyled to the kit | Full screen | Photo lightbox, logo / banner / avatar croppers, the terms and privacy reader |

Where something can be made in place, it is (as New pod already is: a card in
the list). Slices: 1) the Panel and Confirm components plus events and the
course editor; 2) every Confirm; 3) the remaining Panels; 4) the Viewers.
Prod's old design keeps its pop-ups until the switch goes on everywhere.

### D. One door: what an app or an agent can build

Merged on main, not live: Sign in with Polynet, the access check, sales
reports, webhooks, plans that unlock app features, Settings › Your app.

Missing:
- **An agent or a founder's app cannot create events or Knowledge.** The
  MCP's actions are react, moderate, settings, join mode, handbook and lesson
  done. Proposed: `community.event.create|update|cancel`,
  `community.note.create`, `community.course.upsert`, `community.lesson.upsert`
  through the existing canonical executor (authorised, audited, host-scoped).
  A separate app API only when an app asks for one.
- **Progress from the app into the guide** (the pilot's last step).
- **Distribution Engineering:** PRs #1365 and #1374 open; known bug: a buyer
  from DE's own checkout could get a second, free workspace.
- **Leftovers:** `community.member_experience.request` (sites slice 3) and
  `community.funnel.update_draft` (its screen is deleted).

Spec first (`docs/specs/`), Neil's OK, then build.

### Then

Neil's pass on his own phone; the prod release plan (what ships, what to check
after, how to roll back, the Convex step); acceptance (section 8); switch on
everywhere and delete the old paths (section 9).

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
| Community sites | Removed (#505–#507); a community's page is `/c/<slug>` in the app |

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

Updated 2026-11-13 (after Settings as rows #483–#487, the desktop shell
#490–#491 and phones #493–#494).

The switch keeps the old app alive beside the new one. The order:

1. **Switch production to v1** (Neil's call). Flip the switch's meaning so v1
   is on unless `VITE_DESIGN_V1=0`; that keeps a no-code way back for the
   first days. Production then takes everything since its last release, so the
   release gets its own checklist.
2. **Delete the old layout** after a few days on production, in four pull
   requests (each checked on staging):
   1. The switch and the classic branches (below).
   2. Text-matching checks that pin old markup become behaviour tests first,
      never deleted in bulk.
   3. Styles (below).
   4. Lower the web bundle's total budget again (raised to 3.42 MB on Nov 13
      while both layouts ship).
3. **Then the backend kept only for the cached production app** (cleanup wave
   3): `communityPublicPage` (named in `scripts/no_orphan_modules_proof.ts`),
   `communityOwnerApprovals` get/decide, then their stored data with Neil's OK.

Code
- The switch: `apps/web/designSystemFlag.ts`, `shared/designSystem.ts`,
  69 `isDesignV1Active()` call sites in 36 files (Nov 13): `App.tsx`;
  components `ChannelRosterPanel`, `CommunityFounderBriefSection`,
  `CommunityPageHeader`, `WebAccountSettingsSection`,
  `WebAppearanceSettingsSection`, `WebArchivedCommunityList`,
  `WebCommunityAgentDock`, `WebCommunityAiAgentInstructionsEditor`,
  `WebCommunityAiAgentSection`, `WebCommunityChannelHeader`,
  `WebCommunityEventsSection`, `WebCommunityHandbookEditor`,
  `WebCommunityInteractionProjection`, `WebCommunityKnowledgePanel`,
  `WebCommunityNavSurface`, `WebCommunityPodsSection`,
  `WebCommunitySettingsSection`, `WebDirectMessageInboxPanel`,
  `WebDirectMessagePanel`, `WebDirectMessagesHost`,
  `WebEmailPreferencesSection`, `WebMobileGlobalShell`, `WebOnboardingPage`,
  `WebPlatformBridgePage`, `WebPolynetMcpAccountSection`,
  `WebProfileSettingsSection`, `WebSettingsPanels`, `WebSettingsSurfaceHost`,
  `WebShellChromeHost`, `communityInteractionFeed`; controllers
  `useGuideSearchShortcut`, `useWebCommunityContentController`,
  `useWebCommunityTabAccessGuard`; `shared/chatUi.ts`. `VITE_DESIGN_V1` on
  `polynet-staging`, and `FORBIDDEN_PRODUCTION_ENV` in
  `scripts/lib/releaseProduction.mjs`.
- Components only the classic layout uses: `WebCommunityRail.tsx` (nothing in
  v1 renders it since #494) and its props in `webShellChromeShared.ts`;
  `WebSettingsSidebar.tsx`; `shared/SettingsNavList.tsx` (the phone's old
  Settings list); `WebBillingSettingsSection.tsx` (v1 has no Billing page);
  `WebDesktopShellHeader.tsx`; the classic uses of `WebPlatformRadioGroup`
  (`WebPlatformChoiceControls.tsx`); the classic halves of the Settings
  sections (Profile, Account, Email, MCP, Archived, Appearance's preview
  cards, the Access & Pricing card, the founder brief and handbook cards).
- The classic branch of `shared/CommunityNav.tsx` (the "Agent" row, the gear,
  "Visit site", the management divider) and its `layout` prop.
- The month calendar in `WebCommunityEventsSection.tsx` and
  `getWebCommunityEventsMonthRange`.
- The floating direct-messages panel (desktop) and its back button beside the
  list.
- The desktop members pop-up in `ChannelRosterPanel.tsx`. The phone's Members
  box is still that dialog; restyle it before deleting.
- "Agent" as the agent's tag in `communityInteractionFeed.tsx`.
- The classic favicons at the public root, replaced by `brand/v1/` (move those
  up and drop `applyDesignIcons`).

Styles (measured Nov 13 over 23 desktop and phone views of v1)
- 513 v1 rules (87 KB); 507 old rules (71 KB) that v1 pages still rely on;
  2,340 old rules (313 KB) not seen on those views. "Not seen" is not dead:
  the biggest groups are KaTeX, message markdown, the public landing page, and
  dialogs. So styles are deleted component by component, checking each
  component's screens and dialogs, never in bulk.
- Move the 507 relied-on rules into `design-v1.css`, then drop its
  `:root[data-design="v1"]` prefix (593 rules) so it becomes the base, and
  delete the token blocks it replaced in `base.css`.
- Rules for the deleted components in `community-and-content.css` (8,502
  lines), `settings-runtime-and-theme-overrides.css` (5,475),
  `shell-and-onboarding.css` (1,479) and `index.css` (1,961), found by those
  components' class names; the `.settings-panel button:not(...)` rule.
  KaTeX, markdown and landing-page styles stay, in their own files.

Docs and checks
- The design-v1 exception in `docs/core-contract.md` becomes the rule.
- `scripts/app_theme_contract_proof.ts` scoping checks for `design-v1.css`.
- Classic expectations in `scripts/community_nav_design_v1.test.ts`,
  `scripts/community_page_header.test.ts`,
  `scripts/channel_tags_design_v1.test.ts`,
  `scripts/channel_rail_design_v1.test.ts`,
  `scripts/mobile_root_navigation_contract_proof.ts` and
  `scripts/release_production.test.ts`.

## 10. Decisions taken before slice 0

1. One build switch, not a long-lived branch. Agreed.
2. "Guide", numerals, chips: decided 2026-11-10 (section 4).
3. Members get the quiet-day Home until a "next step" exists. Agreed.

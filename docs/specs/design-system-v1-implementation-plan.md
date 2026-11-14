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
| Inbox | 70% | #445 #448 #490 #510 #518 #520 | Mentions and replies across communities, guide line, approvals, "Draft a reply"; an address | Inbox part two (backend); routing |
| Events | 85% | #450 #500 #519 | Recaps after a call; Home shows an event only on its day; reminders unchanged. No RSVP (Neil, Nov 14: not needed yet) | A short spec for recaps |
| Members | 70% | #451 #452 #490 #512 | Guide suggestions; an address; a member's record on a phone (hosts have it) | Routing |
| Knowledge | 80% | #442 #492 #516 #517 #523 #524 | Course tools in the page (edit, delete a draft, arrange, move a lesson), which retires the old editor; lesson resources; retry or remove a file or link; answers naming their sources | Section 5, track 1 |
| Manage, Your guide | 15% / 5% | header only (#442) | Both pages | |
| Discover, your settings | 60% | #444 | Their own header line and content column | |
| Command palette | 0% | | | |
| Mobile | 85% | #493 #494 #504 #509 #510 #512 #522 | Switcher as a sheet; Pods and a pod's room; a check on a real phone | Neil's phone pass |

Shipped behind the switch: #427 to #524 (status as of the end of 2026-11-14). Production: none of it.

Pop-ups: the browser's own confirm boxes are gone from the new design (#522: one card of the app's own); the event form and the new-course form are in the page (#519, #523). About a dozen pop-ups remain (section 5, track 2).

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
| 2026-11-14 | Pods icon: lucide `Boxes` (three boxes), replacing the three circles |
| 2026-11-14 | One way to see what members see: View as a member in the account menu. Knowledge's own preview switch goes with the old editor ("More tools") |
| 2026-11-14 | Left menu order: Pods, Knowledge, Events, app links, Members; Analytics at the foot above Invite people. Knowledge icon: the shelf (`Library`) |
| 2026-11-14 | One level in (a course, a pod's room, What your guide knows): the header is an arrow and the name, no word beside the arrow |
| 2026-11-14 | Events: no "I'll be there" anywhere (page, Home, pod calls); a host adds an event by typing one line; add, edit and cancel happen in the page |
| 2026-11-14 | Composers take the cursor on the pages that are about them (Home, a channel, a pod's room); focus outlines are grey, never blue |
| 2026-11-14 | Knowledge has one bar for builders: it asks, teaches the guide, or starts a course from an outline (first line the course, each line a lesson). Members get the bar that asks |
| 2026-11-14 | Notes are the guide's memory: builders keep them ("What your guide knows"), members never browse them and the server never hands them to a member or a member's own AI. What members must read belongs in a lesson. Files and links members can open are resources attached to a lesson |
| 2026-11-14 | Only a draft course can be deleted (a rule of the new page until the old design leaves prod); no typing the name. The cover crop goes: a new cover is centred |
| 2026-11-14 | Agents: two agents (the community's guide; a personal agent someone brings) and two lenses (builder, member). Anything a person can do in the app their agent can do through the one door with the same permission; money stays human. The guide may reply untagged when it can help (`docs/specs/agents-and-the-one-door-v1.md`) |

## 5. What is next, in order (Neil, end of 2026-11-14)

One plan, four tracks. Mocks for tracks 1 and 2 are on the Knowledge canvas
(`https://claude.ai/artifact/RUsBpG7rfA6gbCN62nzJHP`); track 3 has a spec.
Each slice goes to staging on its own, is checked there, then merges.

### Track 1. Finish Knowledge (about 80% → 95%)

| # | Slice | Done when |
|---|---|---|
| 1.1 | A course's own tools: Edit opens the box in the page (name, what members will learn, cover); Delete is offered on drafts only and asks with the confirm card | No pop-up is reachable from a course |
| 1.2 | Arrange courses on the shelf; "Move to another course" inside lesson editing; remove "More tools" | The old editor cannot be opened from the new design |
| 1.3 | Files and links the guide read: Try again and Remove on each | A failed read can be retried or cleared |
| 1.4 | Resources for a lesson: a builder attaches a link or file to a lesson; members open it under the lesson; the guide reads it too. Needs one optional field on a resource (which lesson it belongs to) | A member opens a lesson's source |

Kept as they are: the shelf, the lesson reader, Mark done, Questions nobody
answered. Deleted when the old design leaves prod: `CommunityResourcesPanel`
and the three course pop-ups (section 9).

### Track 2. The remaining pop-ups

Done: the browser's confirm boxes, the event form, the new-course form. Left,
in this order: one way to confirm a delete (lessons and notes still use an
inline "Delete for good"); channel settings and new channel; member settings;
sign out; the avatar, logo and banner editors and the photo viewer (these stay
overlays, restyled to the kit, full screen on a phone); the terms reader. Rule:
make and change in the page where the thing lives; ask with the confirm card;
only looking-at-something is an overlay.

### Track 3. Agents and the one door

Spec: `docs/specs/agents-and-the-one-door-v1.md` (Neil's review is the gate).
The engine underneath is `community-agent-gateway-v0.md`.

| # | Slice | Done when |
|---|---|---|
| 3.1 | Parity for builders: create, change and cancel an event; make a course from an outline; teach the guide, through the existing door | Claude, connected to staging, sets up a course and a weekly call |
| 3.2 | The activity page: what agents did, for whom, and an off switch per connection | A builder can see and stop any agent |
| 3.3 | Two steps for anything that destroys or broadcasts (delete, ban, remove, cancel a series, message everybody), including the verbs that exist today | No single call can do it |
| 3.4 | Answers say where they came from: a lesson or a lesson's resource is a link; what the host taught is named, not linked | A member can open the source of an answer |
| 3.5 | The guide wakes on a beat and answers questions nobody answered: waits first, replies in the thread once, only with a sourced answer, never in a pod unless its host turned it on; a builder's dial (Off, Quiet, Active) and a daily cap | A question asked at night has a sourced answer by morning, and a quiet community costs nothing |
| 3.6 | The guide proposes: buttons on answers for members, drafts for builders to approve | A builder approves a drafted note in one tap |
| 3.7 | Packaging: a ready-made plugin for Claude and ChatGPT | A builder connects without reading docs |

Also in this track, unchanged: progress from a founder's app into the guide;
Distribution Engineering's PRs #1365 and #1374 (Neil's repo; known bug: a
buyer from DE's own checkout could get a second, free workspace).

### Track 4. Ship it

Staging is far ahead of production; the gap is now the main risk.

1. Neil walks staging on his laptop and his own phone; what he finds is fixed
   in the slice that touches that screen.
2. Phone leftovers: the switcher as a sheet; Pods and a pod's room.
3. The prod release plan (`production-release-plan-2026-11.md`): what ships,
   what to check after, how to roll back, the Convex step. To settle there:
   after the release the old design shows members an empty notes page (correct,
   but bare) until the new design is switched on.
4. Acceptance (section 8); switch on everywhere; delete the old paths
   (section 9).

### The order

1.1 and 1.2 first (they finish what was started and retire the old editor).
Then Neil's walk and the release plan, with 3.1 alongside. Then 3.2 and 3.3
before the guide gets more power (3.5, 3.6). Track 2 fills the gaps between.
1.3, 1.4 and 3.4 go together: they are all about sources.

### Waiting on Neil

- The walk-through on staging (laptop and phone).
- Review of the agents spec, and its three calls: may a builder's AI publish a
  course without a tap in the app (proposed: yes); may a member's AI read their
  own direct messages (proposed: not yet); ban and remove through an agent move
  to two steps (proposed: yes).
- Two defaults for 3.5: how long the guide waits before answering (proposed:
  one hour) and where the dial starts (proposed: Quiet).
- Whether Knowledge's box opens on Ask or on Teach (it opens on Ask today).
- A Stripe test-card run of a paid join; the two DE pull requests.

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

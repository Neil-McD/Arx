# Design system v1: implementation plan, staging first

Status: proposed on 2026-11-09, for Neil's review. Nothing here is built.
Spec: [design-system-v1.md](design-system-v1.md).

## 1. The approach

Change the live app toward the spec in small slices. Do not rebuild it. Each
slice is one pull request, behind one switch, verified on staging before the
next begins. Production does not change until Neil accepts the whole thing on
staging.

## 2. What the code already gives us

Read from `origin/main` at `542926328`. This is why the plan is small.

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

## 4. The slices

Sizes are relative: S is a day's work or less for the factory, M a few, L more.

| # | Slice | Size | New backend? |
|---|---|---|---|
| 0 | The switch, and Newsreader | S | No |
| 1 | Colour tokens, dark and light | M | No |
| 2 | Type, density and the agent's voice | M | No |
| 3 | The left column and the account menu | M | No |
| 4 | Home | L | No (see below) |
| 5 | A channel, a thread and the right panel | M | No |
| 6 | Knowledge, Events, Inbox | M | No |
| 7 | Members | M | No |
| 8 | Search (Cmd+K) and the community switcher | M | No |
| 9 | Host pages: Your guide and Branding | M | No |
| 10 | Acceptance, then switch on and delete the old | S | No |

### Slice 0: the switch, and Newsreader

- Add `VITE_DESIGN_V1` and the `data-design` attribute. No visible change.
- Add `@fontsource-variable/newsreader`, loaded only when the switch is on.
- Checks: bundle budget; theme contract proof still passes untouched.
- Done when: staging has the attribute, production does not, both look as today.

### Slice 1: colour tokens

- In `base.css`, add `:root[data-design="v1"]` and
  `:root[data-design="v1"][data-theme="light"]` with the spec's values, mapped
  onto the existing token names. Blue goes to the primary button and selection
  roles, purple to `--accent-agent*`, red to `--accent-error`.
- Sweep the hard-coded colours in `styles/*.css` and component CSS onto tokens.
- Update `scripts/app_theme_contract_proof.ts` so it asserts the new values under
  the switch and the old ones without it.
- Check contrast again in the real app; the spec's table is from the mock.
- Mobile shares these tokens, so it changes colour here too. It must still work.
- Done when: every surface on staging is in the new colours in both modes, and
  nothing is unreadable.

### Slice 2: type, density and the agent's voice

- The type scale from the spec, sentence-case labels, 32 px navigation rows,
  the radii.
- The agent's messages and its page set in Newsreader.
- Done when: a channel, the agent page and settings read correctly in both
  modes, and the agent's text is the same visual size as a person's.

### Slice 3: the left column and the account menu

- `CommunityNav`: order becomes Home (today's Agent row), Inbox, Channels, then
  Knowledge and Events; rows a community does not use are hidden; Analytics,
  Visit site and Invite move to the host's rows.
- The account row and its menu: light or dark, profile and settings, sign out.
- The rail stays until slice 8 gives it a replacement. (Brought forward on
  2026-11-10, see "The frame" below: Neil asked for structure before polish.)
- Checks to update: `community_channel_ui_contract_proof.ts`,
  `app_shell_decomposition_contract_proof.ts`, `compact_community_shell.test.ts`.
  Where a check only matches text, replace it with a behaviour test first, then
  change it.
- Done when: every row opens what it opened before.

### The frame (brought forward from slices 6 to 9)

Done right after the first half of slice 4, because staging still read as the
old app with new paint.

- Inside a community the rail of community icons is gone. The community's name
  on the banner is the switcher: your communities (a dot where something is
  new), Discover, and starting one. Discover and global settings keep the rail
  for now, since they have no left column of their own.
- Inbox is a row under Home (it opens direct messages, with the unread count),
  so the floating messages button is not shown beside the left column.
- Members is a row under Events (it opens the people panel).
- The settings gear on the name is replaced by a Manage row. Visit site, Invite
  people, Analytics and Manage are plain rows above the account row.
- The account row says "Host" only for the owner.

### Home's layout and the member's Home (second half of slice 4)

- The left column is narrower (224 to 264px).
- Home has no title bar; the interface says "guide", not "agent", on this page.
- Beside the greeting, a panel of where things stand: members, active today,
  and for the owner, requests to join and unanswered questions; then what is
  coming up. Money figures wait for the payments slice.
- Members get Home too. `getCommunityMemberHomeSnapshot` requires chat access
  and returns only what any member can already see: counts, questions asked in
  the shared channels, and events. No join requests and no names of who joined
  or who has been quiet. A member's Home has rows, not a card.

### The page's structure (after Neil's review of staging, 2026-11-10)

- The left column sits on the ground colour with no frame. The content is one
  raised panel, a shade lighter, with its own edge and rounded corners.
- Home has no header band; the new-conversation button floats in the corner.
- Home's right-hand column is a real column: full height, at the panel's right
  edge, with a dividing line. Under 1180px wide it folds under the rows.

### Beside a channel (first half of slice 5)

- The channel header is one quiet line inside the raised panel.
- The right-hand panel is short: Pinned (the channel's pinned post, when there
  is one), Community notes, and "In this channel" as a count, faces of who is
  here, and View all. The full member list, with roles, removal and join
  reviews, is unchanged behind View all.
- A thread opens in the same column and takes the panel's place, as before.
- Not yet: "Catch up", the guide's short summary of the channel. Nothing writes
  one today; it is its own slice.

### The shell on every page (Neil, 2026-11-10: shell first, then pages)

Order agreed: the shell to done on every page, then the left column exactly,
then each left-column button's page, then each page's right column.

- One header line: Knowledge, Events, Analytics and Manage use the channel
  header's line (`CommunityPageFrame` and `CommunityPageHeader`): title on the
  left, the page's own actions on the right. Home stays without a line.
- One content column: those pages share a 920px column with the same padding.
- One right column: Home's panel, the channel panel, a thread, the member list
  and Inbox share one slot and one width (`--right-column-width`). The member
  list opens in the column (no pop-up).
- Inbox is a page, as in the mock (corrected 2026-11-10 after Neil's review:
  docking the whole messages panel into the right column was wrong). The list
  fills the main area with the standard header line; the open conversation is
  the right column. It is still direct messages only, and it has no address of
  its own yet.
- Inbox layout to the mock's measurements (2026-11-10): the right column is
  always there (the latest conversation opens with the page, or an empty
  state); 56px gutters and a 52px header; rows are a 36px avatar, name, kind,
  time, the last message and an unread dot; "Messages" and "People in your
  communities" labels; finding someone is a small field in the header line.
- Outside a community: Discover and your own settings use the same frame, with
  `WebGlobalNavV1` as their left column (Discover: your communities; settings:
  Back and the settings sections). The rail is gone there too. Operator and
  docs pages keep the old frame.
- Still to do in the shell: narrow and banner checks.

### Channels, as they read (left-column walk, 2026-11-10)

- Left column: a channel with something new is bold beside its dot; hosts see
  "Add a channel".
- Messages and composer share one readable column (880px at most).
- More air between people; day dividers are a word on a hairline; people
  arriving is quieter.
- The agent's tag reads "guide"; the owner's own posts carry "host".
- The replies line is a small face, the count as the link, and the time.
- Not yet: channel descriptions in the header (no field exists), and more than
  one face on the replies line (only the last replier is known).

### Left column and Home at the mock's measurements (2026-11-10)

Values read from the mock's stylesheet, previewed on live staging first.

- Left column: a 28px community mark and a 15/600 name in the 48px name row, no
  line under it; rows 32px with a 10px gap and weight 450, no gap between them;
  section labels at 18px 10px 6px.
- Home: left-aligned on the 56px gutter (it was centred); greeting 92px from the
  top; right column padded 20px 24px 24px with 26px between sections; the
  composer is one 52px row.
- Not done: the banner version of the name row (112px card), untested without a
  community that has a banner.

### Slice 4: Home

Home is today's agent page with three things above the conversation.

- **The greeting**, in the agent's voice. Written from data that already exists.
- **The card**, only when something real is waiting:
  - for a host: pending join requests, a failed payment, an item from the daily
    brief that needs a decision;
  - for a member: nothing yet. A member's "next step" needs a journey, which
    does not exist in the product. Members get the quiet-day Home until it does.
- **"Since you were last here"**, from unread channels, mentions and upcoming
  events. No new tables.
- A host's four figures come from what Analytics and billing already compute.
- Add a `home` community tab, or keep `agent` as the route and rename its label;
  decide in the slice spec. The URL for the agent page must keep working.
- Done when: all three states of Home render from real staging data for a member
  and for a host.

This is the largest slice and the one most likely to be split in two.

### Slice 5: a channel, a thread and the right panel

- Restyle messages, reactions, the day divider, hover actions and the composer.
- A thread opens in the right panel.
- The right panel keeps what it has today (notes, pinned, who is here),
  restyled. The agent's "catch up" is not built here; see section 5.
- Checks: `community_interaction_projection_ui_contract_proof.ts`,
  `community_composer_shell_contract_proof.ts`.

### Slice 6: Knowledge, Events, Inbox

- Restyle each. On Knowledge, a host's review queue uses the existing approval
  cards.
- The network drawing of Knowledge is included only if the data to draw it is
  already exposed to the client; otherwise Knowledge ships as a list and the
  drawing becomes its own issue.
- Checks: `community_events_ui_contract_proof.ts`,
  `community_resource_markdown_ui_proof.ts`.

### Slice 7: Members

- A Members page: the directory for everyone; for a host, join requests on top
  and a table with plan, joined and last active.
- It replaces the member list in settings and the "view all" in the right panel,
  so there is one place for members, not three.
- Approving, declining and changing roles call the existing functions. This
  slice changes no rule about who may do what. Membership and entitlements are a
  risk-high area, so this pull request gets Neil's approval before merging.

### Slice 8: search and the switcher

- Cmd+K: go to a place, switch community. "Ask the agent" from the palette opens
  Home with the question.
- Clicking the banner opens the same thing.
- Then remove `WebCommunityRail` on desktop.

### Slice 9: host pages

- **Branding** in Manage: banner, logo, colour, name, using the existing editors.
- **Your guide:** today's agent settings (on or off, instructions), restyled,
  with usage and "what it knows". The per-action permissions in the mock are not
  built here; see section 5.

### Slice 10: acceptance

- Neil walks through staging as a member and as a host, in both modes, against
  the checklist in section 7.
- Then one pull request turns the switch on for production, and a second deletes
  the old token blocks, the old navigation branches and the switch.
- Production release by `npm run release:prod`, when Neil asks.

## 5. Deliberately not in this plan

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

## 6. Risks

- **The switch doubles some code for a few weeks.** Kept small by making tokens
  do most of the work, and ended by slice 10.
- **Text-matching checks will fail on purpose.** Each is converted to a
  behaviour test before it is changed, never deleted in bulk.
- **Mobile inherits the new colours before it is redesigned.** It is checked on
  staging after slice 1 and slice 2.
- **Home without a member's next step may feel thin.** That is the honest state
  of the product, and the quiet-day design is built for it.
- **The bundle grows** by one variable font.

## 7. Acceptance checklist for staging

All in dark and in light.

- A member can open Home, every channel, a thread, Knowledge, Events, Members
  and Inbox, and send a message in a channel and to the agent.
- A host sees the brief, can approve a join request, approve a note, create an
  event, change the banner, and turn the agent on and off.
- A community with no events shows no Events row.
- No text fails contrast. Nothing is coloured that does not mean something.
- Mobile still works.
- With the switch off, the app is unchanged.

## 8. Decisions needed from Neil before slice 0

1. Is the single switch the right way to keep this off production? The
   alternative is a long-lived branch that only staging deploys.
2. The three open questions in the spec: "guide" or "agent", numerals, and when
   the suggestion chips show.
3. Is it right that members get the quiet-day Home until a "next step" exists?

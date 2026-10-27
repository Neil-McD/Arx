# Channel roster continuity

Hovering a person name shows community-scoped last activity inline between
the name and the DM action, never in a tooltip, using
the existing roster presence data: "now", a relative time such as "6h ago", or
"unavailable" when no timestamp exists. The full "Last active" label is
available as an accessible description and on keyboard focus. Space is reserved
to avoid moving the row on hover. This adds no request or polling timer.

Local slice based on `2eb457700`; no deployment or database changes.

The channel panel has two presentation scopes. Community memory belongs to the
current authenticated actor and community. Roster rows, selected member settings,
search and the open directory also depend on the channel. The workspace key now
includes the authenticated subject as well as the UI user and community, so an
identity change clears data even if the UI user prop has not caught up.

Channel changes reset private roster state during render, before commit. They
close the old directory without remounting community memory. Same-scope session
renewal re-subscribes with fresh credentials while retaining the loaded view.
Subscription cleanup rejects late callbacks. Any reader error still clears its
private data; this slice does not classify arbitrary errors as safe stale data.
Authoritative member removal closes that member's controls.

No changes to database authority, permissions, presence ordering or form/workflow
behavior. The follow-up pagination slice opts the roster into preserving later
page watches when an ancestor's continuation and completion status are unchanged.
Other consumers retain conservative ancestor invalidation.

When a boundary changes, the invalid suffix is removed and rebuilt up to the
already loaded depth. The UI says “Updating members…” and retains only selection
identity, not the invalidated member's private row. Settings can return when the
replacement pages validate that member. Confirmed removal or reader error clears
selection. A roster reader error now terminates the whole chain until retry;
other pages cannot resurrect data after denial.

A controlled three-page workload of 100 first-page presence updates created zero
additional subscriptions (the initial three remained active). A changed page-two
boundary created one replacement page-three subscription. These are client
subscription measurements, not production database-read or latency measurements.

## Verification

- Web TypeScript check passed.
- Existing tests: `scripts/subscribeCommunityPages.test.ts`,
  `scripts/channel_roster_narrow_access.test.ts`,
  `scripts/mobile_member_roster_navigation.test.ts`,
  `convex/communityChannelParticipants.test.ts` (21 original tests, plus dedicated pagination regression tests).
- Browser fixture mounts the real `ChannelRosterPanel` with controlled readers.
  Run `./node_modules/.bin/vite --config scripts/fixtures/channel-roster/vite.config.mjs`,
  open `http://127.0.0.1:5186/scripts/fixtures/channel-roster/index.html`, then click
  **Run lifecycle checks**. Reload before rerunning.
  All 34 browser assertions passed, including a three-page scroll/rebuild scenario. It checks delayed renewal, row/focus/scroll continuity, loaded memory continuity,
  stale callbacks, member settings, authoritative removal, channel and actor
  changes, denied access, unrelated presence updates, View all, and narrow Back.

Controlled browser readers do not establish real backend latency, reconnect
behavior against staging, or full responsive visual acceptance. Before release,
exercise the authenticated app under network delay and session renewal, check
narrow layout, and reconcile this branch with the release candidate. Production
and the previous integration diagnostics remain untouched.

## Live baseline and isolated staging candidate

September 15: hosted staging `/version.json` reports
`8bc36e943f1aa6bfde3a57da9e099416ee0471d5`; remote main remains
`496e06f42b6b4117b56c544fff75fc52e70c4716`. The isolated candidate branch
`codex/channel-roster-staging-20260915` is based directly on that staging commit
and contains only the roster UI/helper, regression tests, browser fixture and
this receipt. It excludes later integration/backend changes. The 34 focused
tests, web typecheck and production web build passed on this staging base.

The configured and tool-resolved staging backend is quick-porcupine-949.
The hosted authenticated Polynet community roster loaded 50 people initially,
then 62, and finished with “Showing 62 of 62.” No manual membership, grant,
workflow, or integration mutations were performed. Normal app presence/read
tracking may run during navigation.

Eight uncached roster executions captured from staging logs during the observation
window took 140.39–520.89 ms. First-page-sized responses were 20,449 bytes and
read 449 documents (183,660 database bytes). Smaller executions read 111, 304 or
80 documents. The 304-document executions returned only 586 bytes, consistent
with the reader's second-phase scan/filter work; logs alone do not establish
which cursor each sample used. These are server execution samples, not a p95,
network round-trip measurement, or proof of candidate UI performance. Other
active sessions may contribute executions in this observation window.

The local candidate starts against the same backend, but displays a session
verification failure. Vite serves only the runtime proxy and does not implement
the `/api/auth/session` gateway required by the full app. Existing hosted staging
login works. No credentials were copied from the browser, and no auth bypass was
introduced.

Pending: deploy the narrow frontend candidate to the authenticated staging
origin, verify its exact build ID, then test real delay/reconnect/session renewal,
member settings, rapid channel changes and scope revocation. Do not call the
candidate live-accepted until these pass. No production or backend deployment is
required for the frontend candidate. A backend optimization of repeated per-member
reads is a separate measured follow-up, not part of this candidate.

## Authorized staging deployment and live smoke check

User explicitly approved deploying `fb9f3477453d3117dd71595bcef2eedd084e7201`
to staging only. Pushed that exact commit to `origin/staging` through Git.
Vercel deployment `dpl_8Ud4V7gxMEhQxPATnGPFcyuWFANA` became READY, and
`https://polynet-staging.vercel.app/version.json` served that exact build ID.
Production's version remains `496e06f42b6b4117b56c544fff75fc52e70c4716`;
the production project's staging-branch build was CANCELED as configured.
No backend deployment or manual fixture/grant mutation was performed.

Authenticated browser observations on the deployed candidate:

- Polynet roster reached “Showing 62 of 62.”
- A later-page member's settings remained open across an observation interval
  exceeding the configured 30-second presence heartbeat. Roster count remained
  62 and scrollTop remained 2309.5; focus remained on its opener. This is a
  sampled observation, not a frame-by-frame flicker trace.
- Concierge canary General showed five people; Private channel QA showed the
  owner and test member; General returned to five; Workflow Completion Canary
  showed the owner and its assigned member. Community memory remained displayed
  throughout same-community channel changes.
- At 390 x 844 the channel-people control opened the roster and Escape returned
  to the conversation. Viewport override was reset afterward.
- Narrow visual/accessibility issue remains: the back arrow overlaps the
  community heading and its button is unnamed in the accessibility snapshot.
  This slice did not change that control's markup or CSS.

Evidence screenshot:
`/Users/neilmcdevitt/.codex/visualizations/2026/09/14/01a0a1e9-bd4a-7840-af65-dba2355f5063/roster-staging-20260915/narrow-roster.png`.

Live smoke checks passed, but full interruption acceptance is NOT complete:
forced network delay/reconnect, actual credential renewal and live grant
revocation were not exercised. The browser control surface exposes viewport
controls but no network emulation, and the native DevTools attempt was
interrupted. Existing controlled-reader tests cover these state transitions
only to the extent recorded above; they are not live-network proof. Keep this
candidate on staging until the remaining gates and narrow control polish pass.

## Interruption follow-up: credential lease continuity

The next authorized acceptance pass successfully used Chrome DevTools on a
dedicated tab. Slow 4G loaded 62/62 members. On switching that tab offline,
later-page settings closed and scrollTop changed from the settled bottom to
1891.5, while 62 rows remained and the footer returned to “Loading more...”.
Networking was restored before implementation work.

Code inspection identified an uncovered renewal path: the roster effect depended
on the complete session object and recreated pagination at page one. The shared
realtime pool already updates credentials and reauthenticates the same client.
The fix acquires/releases credential leases separately, retaining watches while
the authenticated transport identity is unchanged. Scope keys and reader-error
clearing remain intact. This is a supported cause, not proof that token rotation
alone caused the observed interruption; the live scenario must be rerun.

The real-component fixture now models the shared transport and explicitly checks
three-page credential renewal, unchanged subscription count and preserved member
controls. All 36 browser assertions passed. The focused helper/authorization/
realtime-pool suite passed 34 tests and the web typecheck passed. Narrow header
polish is deferred at the user's request, not a release gate for this slice.

### Reversible grant fixture baseline

Staging community Concierge Welcome Canary 2026-08-20, Private channel QA:
`test test` checkbox checked, community agent checked, Join Approval Canary,
Join UI Canary, Workflow Completion Canary unchecked. Only `test`'s private
channel grant is authorized for this revoke/restore check; community membership,
role, workflow state, and other grants remain untouched. Restore target: checked.
Observer is a second owner tab on build 06bc2cfdc with test's member settings open.

### Corrected staging build and grant-test outcome

Committed and deployed the bounded renewal fix as
`06bc2cfdc2708e2bd85a5596946f28d8fb6c4df5` through origin/staging.
Staging version.json verified that exact build. Web build passed.

On that build, a second owner browser tab had test's member settings open.
Unchecked only test's Private channel QA grant in the first tab. The observer
immediately showed one person (owner), no test row, and no Member settings dialog.
Rechecked the grant: both views returned to owner + test, and the permission UI
confirmed the original checkbox state for all four listed members and the agent.
No community membership, role, workflow state, or other grant was changed.
This proves live roster removal/restoration and settings closure; it does NOT
prove clearing in a revoked member's own session or server rejection under that
member's credentials. A dedicated member login was requested and remains needed.

DevTools network conditions were explicitly restored to No throttling after the
first interruption test. The corrected-build reconnect retest could not finish:
native browser control was interrupted while the user was using other tabs.
Do not mark corrected-build forced reconnect or real credential expiry/renewal
as passed. The renewal path has typecheck, pooled-transport unit coverage and
36 real-component browser assertions, but live token rotation is still unverified.

Remaining only: corrected-build interruption retest, real credential renewal,
and a dedicated test-member session for self-access revocation. Header polish
remains deferred. Production and backend were not deployed in this pass.

### Corrected-build sustained offline/reconnect acceptance

On September 15, the dedicated Chrome tab on build `06bc2cfdc` loaded all
62 Polynet members and opened Platform Home Racecheck's member settings.
Baseline: 62 rows, footer “Showing 62 of 62”, scrollTop 2291.5.
Chrome DevTools Network was set to Offline through a heartbeat interval
(over 30 seconds). Both offline observations retained all rows, the settings
dialog, the completed footer, and scrollTop 2291.5.

Selected No throttling in DevTools to reconnect. The settings dialog and all
62 rows remained. The first sampled scrollTop was 2257; the settled value
returned to 2291.5 with headings “Online — 1” and “Offline — 61”. Presence
regrouping may explain the temporary movement, but this was not instrumented
frame by frame. This is evidence against the previous pagination/settings
reset, not proof of universally zero flicker or zero scroll movement.

Saved screenshot:
`/Users/neilmcdevitt/.codex/visualizations/2026/09/14/01a0a1e9-bd4a-7840-af65-dba2355f5063/roster-staging-20260915/reconnect-settings-preserved.png`.

The final DOM check confirmed the settings dialog, 62 rows, completed footer,
and baseline scroll position. Further native DevTools inspection was blocked
by an unrelated Chrome “Leave site?” dialog; that dialog was left untouched.
Actual normal credential renewal was not observed. The separate member login
was requested and remains unavailable, so member-side self-access revocation
is still unverified. No further code, deployment, backend, or grant changes
were made in this pass. The prior fixture grant restoration remains intact.

### Presence geometry acceptance follow-up

Extended the existing real-component browser fixture to distinguish scrollTop
changes from visible reading-position changes. With 62 rows and a 414px roster
viewport, toggling the first member between offline and online added/removed
the Online heading. At the bottom, scrollTop changed 2216 -> 2249 -> 2216,
while the observed last member remained at viewport offset 363px. The same
heading changes preserved a visible middle-list member's position to within
1px. Unrelated member DOM identity was retained. All 43 browser assertions
passed, and git diff --check passed. No production component change is needed
on this evidence. These settled-frame checks do not prove every animation frame
or every browser, but support native scroll anchoring as the explanation for
the prior sampled scrollTop movement.

A fresh staging owner tab was prepared with all 62 rows, later-page settings
open, and the Network panel recording with a refresh filter. No refresh request
had occurred at inspection (0 of 44 captured requests matched). No throttling
was active. Actual normal credential renewal and member-side revocation remain
open; the separate member login has not been provided. The staged product build
remains 06bc2cfdc; this follow-up changes only the fixture and evidence document.

### Member-settings popup shell fit

The user supplied a screenshot showing the left edge of member settings hidden
behind the community rail. Live DOM inspection confirmed the popup was nested
inside product-shell-surface's isolated stacking context, and the generic .modal
rule overrode its intended width to 720px. Channel-launched settings now portal
to document.body, matching the existing directory/workflow overlay approach.
The directory's existing portal and focus wrapper remain intact. Scoped overlay
padding and a more specific member-modal selector enforce 560px maximum width,
available-width containment, and dynamic-viewport height with internal scrolling.

The reproducible shell.html fixture uses the real web styles and roster component
inside an isolated shell with a higher rail. Browser measurements after the fix:
- 702x706: dialog x=71, width=560, no horizontal overflow.
- 360x320: dialog x=16, y=16, width=328, height=288; body scrolls internally.
- 1440x900: dialog x=440, width=560, centered.

Screenshots at constrained and short widths showed an unobscured title and close
control. All 43 roster browser assertions, web typecheck, web production build,
and diff whitespace checks passed. This fixes the demonstrated member-settings
popup; it does not assert that every unrelated overlay has been audited.

### Channel roster label simplification

Removed the redundant People heading from the channel panel at the user's
request. Presence groups and their counts remain; View all stays right-aligned.
The full member directory retains its own People heading. Verified the rendered
channel fixture has View all and the presence group without the People heading;
web typecheck and diff whitespace checks passed.

Follow-up: View all now shares a flex row with the first visible presence heading
(Online, otherwise Offline or Presence unavailable). Empty/loading/error states
retain access to the directory. Rendered geometry confirmed identical vertical
centers for Online and View all, with the button to the right. Typecheck passed.

## Member-session revocation acceptance — 2026-09-16

On staging a0bab617c, the existing test member opened Private channel QA in
Concierge Welcome Canary while the owner revoked only that member grant.
Private messages cleared, the channel disappeared from navigation, and a direct
reload showed unavailable with the composer disabled. Restoring the original
grant restored the private channel and messages without another reload. All
other grant checkboxes remained unchanged.

This exposed a presentation defect: a narrow people panel already open during
revocation remained open and loaded the general community roster when
activeChannel became null. No private message remained visible, but the panel
misrepresented its scope. The projection now requires an available channel to
mount the roster and apply people-panel layout, and clears the controlled open
state when the channel becomes unavailable. General remains supported through
its explicit active channel.

Actual scheduled credential renewal remains unverified; reload/bootstrap does
not count as that proof. No backend or production deployment performed.

### Corrected staging verification

Build b4853e5961616f6a168e4f85a4d1222b99c2d48f was confirmed via staging
version.json. Repeating the member-session test with the narrow roster open
closed the panel and displayed channel unavailable with disabled composer.
Restoring the grant restored channel navigation, private messages and composer
without reloading; all grant checkboxes matched baseline. Screenshot:
`/Users/neilmcdevitt/.codex/visualizations/2026/09/14/01a0a1e9-bd4a-7840-af65-dba2355f5063/roster-staging-20260915/member-revocation-fixed.png`.

Validation: web typecheck and build passed; 14 focused roster pagination, narrow
access and mobile navigation checks passed. The existing source-contract
assertion was updated for the expanded close-effect dependencies. Native Chrome
Network observation was interrupted before a normal refresh request could be
verified; scheduled credential renewal remains an explicit open gate.

## Responsive panel width — 2026-09-16

Restore the production desktop allocation `clamp(300px, 22vw, 380px)`
on the channel roster grid and explicitly set panel `min-width: 0`.
The existing 640px narrow people-view switch remains unchanged. This is CSS
only: channel scope, access teardown and subscription lifetimes are unchanged.

Verified deployed build 08ce8fc3f08c4e1ca00b024bad24012f5a37910c:
2200px viewport -> 380px panel; 1440 -> 316.797px; 1000 and 700 -> 300px;
640 and 390 -> hidden side panel with separate people control. Narrow people
open/back restored chat and focus. Profile at 1440 -> 1000 and thread at
1000 -> 700 resized and returned correctly. Loaded roster scroll remained
2087px across 1440 -> 1000 resizing; profile/action button count stayed 123,
with no page-one reset observed. Long fixture names truncate within the panel.
Typecheck, build and 14 focused checks passed. Screenshots are under
`/Users/neilmcdevitt/.codex/visualizations/2026/09/14/01a0a1e9-bd4a-7840-af65-dba2355f5063/panel-layout-audit-20260916/fixed-*.png`.

Separate existing issue observed: at 390px desktop viewport the narrow people
back arrow overlaps the community title. The 700px side-by-side layout also
remains dense, consistent with the retained 640px breakpoint. Neither is caused
by the desktop width restoration. Browser viewport override reset afterward.
No production or backend changes.

## Narrow header layout — 2026-09-16

Place the narrow Back control in the community title flex row rather than
borrowing the absolutely positioned thread-drawer control. Give the icon-only
button an explicit accessible Back to channel label. Desktop still hides the
control; existing close/focus/scroll behavior stays unchanged.

Narrow header verified on staging 09432e145 at 390px and 640px: button
right edge 172px, title left edge 180px (8px separation). Back and Escape
restore the channel people trigger focus. Temporary viewport override reset.

Release preflight also found an unverifiable dynamic operation helper in the
retained integration gateway. Replace its single use with explicit
communityIntegrationConnections:setPilotEnabled, preserving behavior.
The integrity proof now validates 209 call sites / 202 public operations.

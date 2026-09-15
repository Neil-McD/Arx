# Channel roster continuity

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

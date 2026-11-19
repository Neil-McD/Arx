# Web app architecture: the rules, what is built, what is left

Status on 2026-11-16, `main` at #609. Staging only; production is unchanged
and is Neil's call. This replaces the proposal written the same day at #591:
the parts that were built are described as built, the parts that were not
are listed with why.

## Why this exists

On 2026-11-16 Neil reported that pages flickered on refresh and on their own,
that a refresh dropped you out of where you were, and that phone headers
overlapped. The recordings showed the bugs shared three design choices:

1. **Where you are** lived in React state; the address was a copy written
   afterwards, so anything the copy missed was lost on refresh.
2. **Data** was fetched once by each page in its own effect, with its own
   idea of loading and reloading, and no live updates outside chat.
3. **Layout** was decided after data arrived, so pages changed shape while
   you looked at them.

The work since replaced each choice with a rule. The rules are the
architecture; the rest of this document is how each one is kept.

## The three rules

A change to the web app is done when all three still hold.

### 1. The address is the truth

Anything you would link to, or expect Back to undo, has an address. The
screen follows the address; nothing keeps its own copy of where you are.

- One parser and one builder (`shared/webAppRouteState.ts`). Details inside a
  page (the open thread, lesson, view, member, conversation) are path
  segments, read with `shared/routeDetails.ts`.
- A page someone chooses is a history step to its address
  (`communityPageStep`). Corrections (a page they can't open, a community's
  real address) replace.
- The phone's bottom tab (`phoneTabForRoute`) and whether Inbox is open are
  read from the address. The Pods page shows the pod its address names
  (`podShown`).
- The contract is `docs/url-routing-contract-v1.md`. It lists every address.

Addresses under `/c/<slug>` (the phone adds `/m` in front):

| Address | Page |
|---|---|
| `/home`, `/home/talk` | Home, the conversation with the guide open |
| `/browse` | The community's list (the phone's middle tab) |
| `/chat/<channel>`, `/chat/<channel>/<thread>` | Channel, thread open |
| `/pods`, `/pods/<pod>` | Pods; a pod's landing page or pitch |
| `/chat/<pod>` | A pod's room (it is a channel) |
| `/knowledge`, `/knowledge/<course>/<lesson>`, `/knowledge/guide`, `/knowledge/brain` | Knowledge |
| `/events`, `/events/<event>` | Events, an event picked |
| `/members`, `/members/<membership>`, `/members/requests` | Members |
| `/inbox`, `/inbox/<conversation>` | Inbox |
| `/settings/<section>`, `/analytics` | Settings, Analytics |

Old addresses (`/agent`, `/resources`, `?open=`, `?thread=`, `?lesson=`,
`?view=`) still open the same place and are rewritten.

### 2. What others can change updates live

If another person can change it while you are looking, it updates without a
reload.

- One hook, `useLiveQuery` (`shared/liveQuery.ts`), over the one live
  connection per signed-in person. The same query with the same arguments is
  one subscription shared by every page showing it; an answer is kept 30
  seconds after its last reader leaves, so going back draws at once.
- A page may read live only the queries named in `LiveQueryName`; the release
  check proves each is a public query.
- A subscription runs only while what it feeds is on screen. The channel feed
  connects on a channel and disconnects elsewhere.
- Three ways to use it, in order of preference: `useLiveQuery` (the page
  draws the live answer); `useLiveAnswer` (the page keeps the answer in its
  own state and is handed every live answer); `useLiveChange` (the page's
  own load pages or combines reads, so it loads again when the watched
  answer changes). Never watch a read that includes fast-changing data: the
  Members table's rows carry each person's last-seen time, written every 30
  seconds, so the table follows the counts instead.
- Nothing is keyed on the session object (`shared/pageSession.ts`), so a
  token renewal redraws nothing.

Live today: the channel feed, pinned post and replies; the channel list;
Members' roster; unread dots (channels, Pods, Events, Knowledge) and Home's tag lines; Inbox and typing; the guide's brief; the brain
map; the next event; the Events page; the Pods list; a pod's detail and
notes; join requests; the host's Members table (by its counts); Knowledge's
courses, lessons and notes.

Read once, on purpose: see "Parked".

### 3. Nothing moves after it draws

A page has its shape before its data arrives. Measured as layout shift on a
fresh load; the budget is 0.01 per page (0.1 is the web's "good").

- **Shape from what is already known.** The access record carries what
  decides a page's columns (`agent_on`, and a channel's `has_pinned_root`),
  so the shape does not wait for a second read.
- **Placeholders are the size of what replaces them.** The left column's
  loading rows are the size of real rows, as many as the community had last
  time (`shared/channelRowsMemory.ts`). A channel's header row is held until
  its record arrives.
- **A panel draws as one piece.** A right panel whose parts load separately
  waits until all have answered (`usePanelSettled`, at most 3 seconds), so no
  part is drawn and then pushed down by one arriving above it.
- **Different states are different elements.** A loading line and the content
  that replaces it get their own `key`. Without it React reuses the element
  and the browser records the content as having moved.
- One neutral loading surface for every page (`WebAppMainSurfaceFallback`);
  only a channel shows a channel skeleton.

How to measure (staging, signed in): load the page fresh, wait five seconds,
then read the browser's record:

```js
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) console.log(entry.value, entry.sources);
}).observe({ type: "layout-shift", buffered: true });
```

Run it several times per page: a jump that depends on whether data or the
first draw wins the race shows on some loads and not others. For the phone,
load `/m/c/<slug>/...` in a 390px same-origin iframe and use the iframe
window's `PerformanceObserver`.

Measured at #609: every desktop page 0.003 or less; on the phone, channels,
Home, Knowledge, Events, Members, Pods and Inbox 0.001 or less, and the
community list 0.007.

## What was built

| Change | Pull request |
|---|---|
| Thread, lesson and view in the address | #584, #594 |
| Neutral loading; stable session and markdown; Home loads only when open | #589, #590, #591, #593 |
| `agent_on` in the access record; a pin decides the channel's column | #596, #599 |
| The live layer: brief, brain map, next event | #597 |
| Members is a page | #600 |
| Inbox is a page | #601 |
| `/home`, `/knowledge`, `/browse` | #602 |
| Phone tab and Inbox read from the address | #603 |
| A page you choose is a history step | #604 |
| Pod addresses; no redirect into a pod after loading | #605 |
| The feed connects only while shown; Events and Pods live | #606 |
| Layout before data, measured on every page | #607 |
| A picked event and a directory card in the address; the left column holds its rows | #608 |
| Join requests, Members, Knowledge and pods follow changes | #609 |

Checked by hand on staging as host: every page, with refresh, Back and
Forward, on desktop and at phone width. In "View as a member": Home,
Knowledge, Events, Pods and Members show what a member should see.

## What the proposal planned and was not built

| Planned | Outcome |
|---|---|
| A literal route table that pages register in | Not needed. One parser and one builder give the same guarantee with less code |
| Inbox at `/inbox`, outside any community | Neil chose `/c/<slug>/inbox`, so the left column stays the community's |
| A pod's room under `/pods/<pod>` | Dropped. The room is a channel and its address already works; moving it bought only a nicer address |
| A frame that waits for a page's declared queries, then draws once | Replaced by rule 3. Each page keeps its own loading, held to the same budget |
| One frame that owns every header | Not done. The phone's double headers were fixed in place (#583, #585) |
| One "who am I here" record | Partly. `getMyCommunityAccess` now carries `agent_on`; the `can*` flags are still computed in `App.tsx` |
| Presence read live | Dropped. Every person's 30-second check-in writes to what the count reads, so a subscription would re-run for everyone on every check-in. It needs a per-community record that changes only when someone arrives or leaves. The 30-second refresh stays |
| Every page converted to the live layer | Partly; see "Parked" |
| An identity wrapper so no handler takes an identity argument | Not started. The audit below found it safe as it stands |
| Deleting the old layout | Waits for production to be on the new one |

## Parked: nice to have, none blocks

- **Not in the address:** Knowledge's Resources/Notes tab; the Members
  filter; an open note. Nobody links to these.
- **A watched read runs twice on page load** where the page still loads its
  own data and watches the same read (`useLiveChange`): once for the load,
  once for the watch. For those pages an edit landing in the moment between
  the two waits for the next change. Drawing the live answer itself removes
  both; that is the later simplification.
- **A role changed by another host** does not move the Members table until
  its counts change.
- **The phone's community list** still moves 0.007 (the account row, when
  the bottom tab bar arrives). Under the budget.
- **Unread dots** hold one live read per community a person is in, times two.
  For a member of one to three communities that is small; it is 42 for an
  account in 21.
- **The bundle budget** was raised twice (Nov 13, Nov 16) because both
  layouts ship. Lower it when the classic layout is deleted.

Left as they are on purpose:
- Settings, billing, profile, analytics and a person's own course progress
  load once. Only the person looking changes them.
- Home's "since you were last here" is a snapshot taken on arrival. Live, it
  would change under the reader.
- "Who's here" refreshes every 30 seconds (see the table above).

## Before a production release

1. **An automated browser check** in the release gate: load each page, fail
   on a layout shift over the budget, and walk refresh, Back and Forward.
   Playwright is already in the gate (`check:loading-correctness`). Against
   real pages it needs a staging test account; on sample data it misses the
   races.
2. **A release plan.** Everything above is on staging; the gap to production
   is every change since `138ef7ce3`.

## The audit (2026-11-16)

*Identity, all 233 public functions.* A script traced every public query,
mutation and action to a helper that reads the verified token.

- 224 reach a token-checking helper in their own handler.
- 14 actions hand identity to an internal query through
  `resolveAuthenticatedActorInternal`, which checks the token; each read by
  hand.
- The trusting helper (`resolveAuthenticatedActorByTrustedSubject`) is called
  only from internal functions.
- A passed `userId` that is not the token's user is rejected
  (`user_id_mismatch`); a passed `authSubject` that disagrees with the token
  is rejected (`auth_subject_mismatch`).
- The unverified fallback needs `ARX_ALLOW_UNVERIFIED_AUTH_SUBJECT` and
  `NODE_ENV` of development or test. The flag is `false` on staging and
  production.
- 9 public functions take no identity: a health probe, two public reads, two
  maintenance mutations guarded by a secret, two anonymous visit counters,
  `restoreCommunityWithoutPayment` (checks ownership through a named
  handler), and `profiles:listProfilesByUserIds`.

No P0. Two P2s, not fixed:
- `profiles:listProfilesByUserIds` returns public profile fields (name,
  handle, bio, links, avatar; no email) for any user id, signed in or not.
- The two visit counters accept any visitor key, so a script can inflate
  visit counts.

This is safety by convention: a new public function that forgets the
resolver would trust its argument. The wrapper in the proposal removes that
class and is still worth doing; it is independent of everything above.

*Indexes.* All 17 reads the frame makes use an index.

## Not verified

- A community with its guide off. None was found on staging to look at; the
  state arrives with the access record and is covered by tests.
- An event, a pod or a join request changing while its page is open. The
  subscriptions are in place and show in the backend's call log; watching one
  change would alter what members see.
- Whether the session fix (#590) ended the periodic panel flicker. A token
  renewal could not be forced on staging.
- Layout shift on a slow connection, and for a member's account rather than
  "View as a member".
- The identity audit traced call names, not every runtime path.

## Size, for scale

| Thing | At #591 | At #607 |
|---|---|---|
| `apps/web/src/App.tsx` | 2,582 lines | 2,608 lines |
| Controllers | 85 files | 86 files |
| Old-layout switches (`isDesignV1Active()`) | 75 | 83 |

The wiring did not shrink: this work changed how pages behave, not how many
files hold them. The old layout is the reason. Each change carries a branch
for it, and it cannot be deleted until production runs the new one.

## What this does not touch

- Payments, checkout, payouts and joining.
- The agent system (`docs/specs/agent-system-end-state.md`).
- The design system and the look of any page.
- Production.

## Open decision for Neil

**Pods in the left column.** Today "Pods" is one row that opens the Pods
page with your last pod shown. The alternative is to list your pods under
it, like channels. Either works with the addresses as built.

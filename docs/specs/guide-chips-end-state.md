# Chips: things the guide names become places you can go

Status: end state planned Nov 23 2026. Not built. Mock approved by Neil:
https://claude.ai/artifact/1EBrRtphVpLMtxCvpQaBPG ("I like this a lot",
especially the hover card).

## The idea in one line

When the guide names something in the community, it links it with that thing's
own Polynet address, and the app shows the link as a chip you can click to go
there, with a small card on hover that shows its status.

## The one rule that makes it simple

**The link is the app's own web address.** `https://www.polynet.ai/c/polynet/knowledge/<course>/<lesson>`
is already the truth for where a lesson lives (web architecture rule 1: "the
address is the truth"). So:

- The guide writes ordinary markdown links to Polynet addresses:
  `[Start here](https://www.polynet.ai/c/polynet/knowledge/<course>)`.
- Inside Polynet, any link to a Polynet address renders as a chip and opens in
  place. Outside Polynet (an email, Claude, ChatGPT, a pasted link), the same
  link still works as a normal link.
- People get it for free too: paste a Polynet link in a post and it becomes a
  chip.

No new reference syntax, no second naming scheme, nothing to keep in sync.

## Ground truth (main, Nov 23)

| Piece | Today |
|---|---|
| App addresses | One parser and builder, `shared/webAppRouteState.ts` (`parseAppRouteFromPathname`, `buildAppRoutePath`). Course `/c/<slug>/knowledge/<moduleId>`, lesson `.../<moduleId>/<lessonId>`, channel `/chat/<channel>`, thread `/chat/<channel>/<rootId>`, event `/events/<eventAddressKey>`, pod `/pods/<pod>`, member `/members/<membershipId>`, community Home `/home`, join page `/c/<slug>`. |
| In-app navigation | `navigateTo(path)` (`useWebShellNavigationController.ts:158`); pages without it use `pushState` + `popstate` (`routeDetails.ts:163`). |
| What the guide reads | Virtual paths `/communities/<slug>/...` (`communitySemanticRepository.ts`). Listings carry ids, but no app address. |
| What the guide is told | `runtimePrompt.ts:381` and `communityAgentServePrompt.ts:85`: use the community's words, "never a path, an id". Nothing about links. |
| Server filtering of guide text | None. Channel replies store `assistantText` as-is (`communityAgentServeWorker.ts:1568, 1638`); the dock stores `content` as-is (`runtimeTurnPersistence.ts:212`). The id sanitizer runs only in the browser, on the dock (`webTurnRunnerCore.ts:189`). |
| Rendering links | Dock: `shared/markdownUi.tsx:684` keeps only http(s)/mailto and opens a new tab. Channels and threads: `chatInlineMarkdown.ts:20` + `chatInlineMarkdownUi.tsx:31`, new tab. DMs: labeled links off, so `[x](url)` shows literally. Brief and suggested replies: plain text (`KitBrief.tsx:50`, `KitGuideSuggests.tsx:58`). |
| Chips that exist | @mentions: plain `@handle` in text plus rows in `communityInteractionMentions`, drawn by `MentionChipSpan` (`communityInteractionFeed.tsx:707`), people wrapped in `ProfileHoverCard` (`:433`, 450 ms open, 140 ms close). |
| Data already loaded | Channels and communities always; courses only on Knowledge, events only on Events, pods only on Pods, members only on Members. So chips need their own small query. |
| Known mismatches | Events: the app key `parent` or `parent:ms` (first `:` → `_` in the address) differs from the guide's `event:<parent>:<ms>`. People: the guide knows handles; the app's member page wants a membership id, and a profile is a side panel, not an address. |

## The end state

### 1. The guide knows each thing's address

Every listing and document the guide (and an outside AI over MCP) reads gives
the thing's app address as `url`, built by the one route builder:

| Kind | `url` |
|---|---|
| Course | `/c/<slug>/knowledge/<moduleId>` |
| Lesson | `/c/<slug>/knowledge/<moduleId>/<lessonId>` |
| Channel | `/c/<slug>/chat/<channel>` |
| Thread | `/c/<slug>/chat/<channel>/<rootId>` |
| Event | `/c/<slug>/events/<eventAddressKey>` |
| Pod | `/c/<slug>/pods/<pod>` |
| Person | `/c/<slug>/members/by-handle/<handle>` (new: the app resolves it to the member's page or profile) |
| Community | `/c/<slug>` |

Always the full `https://www.polynet.ai/...` form, so the same text works
outside Polynet.

### 2. The guide links what it names

Prompt rule, replacing "never a path, an id": *When you name a course, lesson,
channel, event, pod, person or community, link its name to its `url`:
[Start here](url). Only names in the text; never show an address or an id on
its own. Link a thing once per reply.* Same line in the channel prompt and the
course-building skill.

### 3. The server keeps only real links

When guide text is saved (channel replies, the dock, suggested replies), every
link to a Polynet address is checked:

- It must parse as one of the kinds above and the thing must exist.
- It must be in this community, or be a community listed in Discover.
- Otherwise the link is removed and its words stay as plain text.

Kept links are stored on the message as refs (`{ kind, id }`), so the record
shows what each reply pointed to. This closes the gap where nothing on the
server filters guide output today.

### 4. The reader sees chips only for what they can open

One query, `communityEntities:resolveForViewer({ communityId, refs })`, batched
per message and live:

- For each ref: can this viewer open it? Its current name, kind, the route to
  go to, and the card's facts.
- Fail closed: a draft course, a pod they're not in, an unlisted community
  they're not in, a removed thing, all come back as "not visible", and the
  words render as plain bold text. Never a chip, never the address.

### 5. The chip and the card

One `EntityChip` component, used by every renderer: the dock (`markdownUi`),
channels and threads (`chatInlineMarkdown`), DMs, the brief, suggested replies.

- Look: as in the mock. Quiet graphite, hairline border, grey type icon;
  community chips use the community's logo, person chips the face. Never
  purple.
- Click: in-app navigation with `navigateTo`, a history step, so Back returns.
- Hover (desktop): a card after 450 ms, closing after 140 ms, Escape closes
  it, reusing `ProfileHoverCard`'s open, close and placement code pulled into
  a shared `HoverCard`.
- Phone: tap goes there; long press shows the card.

Card contents:

| Kind | Card | Action |
|---|---|---|
| Course | line about it, progress bar, "2 of 5 done" | Continue: next lesson |
| Lesson | its course, done or not, video or not | Open lesson |
| Channel | description, last active, unread or not | Open channel |
| Event | date and time in your zone, where, repeats | Add to calendar |
| Pod | what it's for, seats taken, in it or not | Open / Ask to join |
| Community | one-liner, members, member or not | Open / Join |
| Person | role, a line of bio, joined | Message |

Live fact on the chip itself: courses ("2 of 5") and events ("Fri 10:00") only.

### 6. Everywhere, the same way

- **Guide replies** in Home, private talk and channel threads: the first place.
- **Suggested replies**: the draft already names its lesson; it links it.
- **The brief**: already written with structured refs (`brief.write`); its
  channels become chips instead of `#name` buttons.
- **People's posts and DMs**: a pasted Polynet link becomes a chip. DMs turn
  on labeled links for Polynet addresses only.
- **Outside AIs over MCP**: they get the same `url`s, so Claude or ChatGPT can
  link a person straight to the right page, and anything they post into
  Polynet with those links becomes chips.

## Slices

1. **Addresses out, links in, server check.** `url` on every listing and
   document (one helper over `buildAppRoutePath`), the members-by-handle
   address, the prompt rule, the save-time check and stored refs. Visible
   result: the guide's names become plain links that open in place.
2. **Chips.** `resolveForViewer`, `EntityChip` in the dock and in channels and
   threads, fail-closed plain text. The mock's look, no card yet.
3. **Cards and live facts.** Shared `HoverCard`, the seven cards, the facts on
   course and event chips, phone long press.
4. **Everywhere else.** Suggested replies, the brief, DMs and pasted links,
   MCP docs.

Each slice ships alone and leaves the product better: after slice 1 alone, the
guide's names are already clickable.

## Tests

- Route round-trip: every kind builds and parses back to the same `{ kind, id }`.
- Save-time check: a made-up id, another community's private thing, a
  non-Polynet address, are unwrapped to words; a real one is kept and stored
  as a ref.
- Visibility: a member asking about a draft course, a pod they're not in, an
  unlisted community, gets plain text; the host gets a chip.
- Rendering: a Polynet link renders `EntityChip` and navigates in place; an
  outside link still opens a new tab.
- Prompt: the guide's own reply to "how do I get started" links Start here
  (measured with the existing guide measurement run on staging).

## Not in this

- Chips while typing (`#` or `/` to insert a course in your own post). A
  natural next step on the same component.
- Previews of a lesson's text in the card.
- Changing how @mentions are stored.

## Numbers

- Up to 20 linked things per reply; more are left as words.
- Resolve at most 50 refs per query.
- Card opens after 450 ms, closes after 140 ms (today's profile card).

## Slice 1 as built (Nov 23): names, not links

Neil asked for the simplest version first ("the Elon approach": question the
requirement, delete parts). The guide already bolds the names of things, so
slice 1 needs no link format, no prompt-written addresses, no server filter and
no stored refs:

- **One list per reader:** `communityEntityNames:listEntityNamesForViewer`
  returns the names of what this reader can open, each kind with its own
  page's rule: courses and lessons (published; hosts also drafts), channels and
  pods (`listAuthorizedCommunityChannels`), upcoming events in the next 35 days (inside the Events page's own range, so a chip always opens)
  (`visibleEvents`; a repeating event once, at its next time). At most 500.
  Read live (`shared/liveQuery.ts`).
- **Matching** (`shared/entityChips.ts`): a whole bold phrase, ignoring case, a
  leading `#` and end punctuation, against those names plus the pages Home,
  Inbox, Knowledge, Events, Pods and Members. A name two things share gets no
  chip.
- **Only the guide's words:** `<GuideVoice>` wraps guide replies in Home chat
  (the dock, saved and streaming) and guide posts and replies in channels and
  threads (`fromGuide`). Bold in people's posts stays bold.
- **The chip** (`shared/entityChipsUi.tsx`, `.entity-chip`): the mock's look,
  a real link (`href` = the address) that opens in place with `navigateTo`;
  cmd/ctrl-click opens a new tab. No hover card yet (slice 3).
- **Prompts:** both guide prompts say to bold such names exactly as they are
  called.
- **Fail closed:** the list only has what the reader may open, so a draft,
  someone else's pod or anything outside the community is never a chip.

Tests: `scripts/entity_chips.test.ts` (matching, addresses, ambiguity),
`convex/communityEntityNames.test.ts` (member, host, outsider).

Gives up, on purpose: links outside Polynet (later, the address-based slice if
needed); things the guide names without bold; old replies naming something
since renamed.

## Slice 3 as built (Nov 23): cards on chips

Same "delete parts" approach as slice 1:

- **No second query.** `listEntityNamesForViewer` now also returns each
  thing's card facts, for this reader: a course's description (140 characters),
  lesson count, lessons this reader finished and their next lesson; a lesson's
  course, whether this reader finished it and whether it has a video; a
  channel's description; a pod's purpose and seats; an event's place (online,
  in person, to be decided) and how often it repeats. Progress is one indexed
  read (`communityLessonProgress.by_community_user`).
- **Fact on the chip:** a course shows "2 of 5"; an event shows its next time in
  the reader's own time zone ("Fri 10:00 AM"); a finished lesson shows ✓.
- **The card** (`EntityChip` in `shared/entityChipsUi.tsx`, `.entity-card`):
  name, the lines from `cardLines`, a progress bar for courses, and one action
  from `cardAction` ("Continue: <next lesson>", "Start: …", "Review the course",
  "Open lesson/channel/pod/event"). About 280 px wide.
- **One hover behaviour:** `shared/useHoverIntent.ts` (open after 450 ms, close
  140 ms after leaving, above unless there's no room, Escape closes), now used
  by both the profile card and chip cards. The chip also opens its card on
  keyboard focus.
- **The chip itself** is one whole box at the sentence's own weight; it moves to
  the next line as a unit and carries no progress or time (those are in the
  card).
- **Pages** (Home, Inbox, Knowledge, Events, Pods, Members): each chip carries
  the icon that page has in the left column, and its card says what is there
  from the same per-reader list (`pageCard`): Events lists the next three
  events with their times, Knowledge the first three courses with this
  reader's progress, Pods the pods they can open; Home, Inbox and Members get
  one line. Each listed thing opens in place; the action is "Open <page>".
- **Staying in view sideways:** the card starts at the chip's left edge and
  slides (`hoverCardShift`) so it stays inside the scrolling area it sits in,
  including a chip wrapped onto two lines near a thread's right edge.
- **Left out on purpose:** no card on touch
  screens (a tap opens the thing, as with the profile card); no
  last-active/unread on channels; person and community chips (not chips yet).

Tests: `scripts/entity_chips.test.ts` (chip facts in two time zones, card
lines, card actions, clipping, timing constants),
`convex/communityEntityNames.test.ts` (this reader's progress, next lesson,
video, description, event place and repeat; the host's progress differs).

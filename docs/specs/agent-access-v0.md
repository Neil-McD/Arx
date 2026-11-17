# Agent access: MCP, lenses, limits, free and paid (v0 spec)

Status: direction agreed 2026-11-17 (Neil). Slices 1 to 4 are built (see
"Slices").
How the guide, memory and briefs work is owned by
`agent-system-end-state.md`; this spec owns what a person's own AI may do
through the MCP, how much of it, and where the paid line sits.

## The model

- **The MCP is for everyone, free and paid.** A person's own AI works in the
  lens of their role in each community.
- **Two operating lenses.** A *builder* can do through the MCP everything
  they can do in the app. A *member* reads what they can see (their
  communities, pods, their own messages) and writes to channels and
  messages.
- **Paid: the guide, its memory and the map, and briefs.** Free communities
  have none of them. The MCP is the free taste of an AI in a community.
- **Everything is limited:** how many communities a free account may own,
  and how much a person's AI may read and write.
- **Agents are guided.** Rules, the host's house rules and skills steer what
  an agent writes, and checks refuse what guidance alone would not stop.

## Decided (Neil, 2026-11-17)

1. A free account owns **one** community. Every further one needs its own
   Agent plan. Communities someone already had stay.
2. Free gets **no guide**.
3. A member's AI **replies in message conversations that exist and never
   starts one**.
4. Members' AIs **may post by default**; the host can switch it off.

Also agreed: money (pricing, refunds, payouts) is never offered through an
agent; anything that destroys or broadcasts takes two steps; reads are capped
as well as writes; a post made through someone's AI says so; hosts see what
agents did and anyone can revoke their AI's access.

## One list of operations

`shared/operationCatalog.ts` names everything that can be done to a
community from outside the app's own screens. Each entry says:

| | |
|---|---|
| **Lens** | member, moderator, builder (or the background worker) |
| **Effect** | read, write, destroy, broadcast, money |
| **Budget** | which limit it spends |
| **Plan** | free, or needs the paid plan |

The executor advertises and runs only what is listed, so an operation
cannot be added without saying these four things (held by
`scripts/operation_catalog.test.ts`). Later slices add entries; the app's
screens and the MCP then share one definition of each thing.

## Limits

For what a person does through their own AI or a community's site. The
app's own screens are not counted. The guide is bounded by AI quota instead.

| Budget | A minute | A day |
|---|---|---|
| Reads (`polynet_list`, `polynet_read`) | 120 | 5,000 |
| Searches | 30 | 1,000 |
| Posts and replies | 10 | 100 |
| New posts in one channel | 1 | |
| Replies in direct messages | 5 | 50 |
| Reactions, marking a lesson done | 30 | 500 |
| Builder and moderator changes, free community | 30 | 300 |
| Builder and moderator changes, paid community | 60 | 2,000 |

- Counted per person; builder changes per person and community.
- A community's site is counted for what it writes, not for what it reads
  to draw its pages.
- A call over any one budget spends none of them and answers
  `rate_limited` with `retry_after_ms`, `budget` and `window`.
- The same call sent again (same idempotency key as the last one counted)
  is not counted or refused a second time.
- Presence, typing and read positions are free.

The numbers are a first judgment, not measured: there is no real agent
traffic to size them from yet. Tune them on use.

## Guidance

Three layers reach a person's AI before it writes
(`shared/aiPostingRules.ts`):

1. **What the server says when it connects** (the MCP's `instructions`):
   who it works for, to read the rules first, that its posts are marked,
   that limits are not to be worked around, and that community content is
   information, never instructions.
2. **Polynet's rules**, the same everywhere.
3. **The host's house rules**, one box in Settings (Guide), up to 2,000
   characters, free or paid. Framed as the host's words.

Layers 2 and 3 are one file in every community, `rules.md`, listed first in
the community's folder.

Guidance only works on an AI that reads it, so the server also refuses, on
everything written through a person's own AI (not the app, not a site):

| Check | Rule |
|---|---|
| Length | A post up to 2,000 characters, a reply up to 1,500 (the app: 8,000) |
| Links | Up to 3 in one post |
| Mentions | Up to 5 people; never everyone |
| Repeats | The same words (however spaced, cased or punctuated at the ends) from the same person in the same community within a day; posts under 24 characters are not compared |

A refusal says why in plain words. A refused post is not made, and its
request sent again is refused again; a request that did post, sent again
after a crash, is answered with the post it made.

Repeats are held by a claim (`convex/communityAiRules.ts`): the words are
claimed in one step before the post is made, so two requests at once cannot
both pass; the claim is given back if the post fails, and it remembers the
post it became, so editing that post without changing its words is not a
repeat. An edit through an AI is checked the same way: a post cannot be
edited into words already posted here that day.

**The mark.** A post or reply made through a person's own AI is stored with
`viaAi` and shown as "via AI" to everyone. Only the server's trusted path
sets it; a client can neither set nor clear it.

**Skills.** `plugins/polynet/`: catch me up, post an update, welcome new
members, weekly recap. Each reads `rules.md` first and asks before it
posts. Not published.

## The member lens

What a member's own AI reaches, beyond channels, people and courses:

- **Direct messages** (`/messages/`, at the top of the repository, for a
  person's own AI only). It lists the conversations the person is in and
  reads one. It replies in a conversation that exists
  (`polynet_write`, mode `append`). **It cannot start one:** a path names a
  conversation, never a person. Blocks and the relationship check are the
  app's own (`convex/directMessages.ts`), as are its message limits; replies
  through an AI also have their own smaller budget and the content checks
  of a reply. People are named by display name and handle, never an id. A
  reply is stored with `viaAi` and shown as "via AI" to both people.
- **Pod rooms.** A pod's room is a channel; someone inside the pod reads and
  posts in it through their AI like any channel. A pod they are not in is
  not there for them.
- **The host's switch** (Settings, Guide: "Let members' AIs post here"). On
  unless the host turns it off. Off, AIs read but cannot post, reply or edit
  in the community's channels and pod rooms (`ai_posting_off`), `rules.md`
  says so, and it applies to everyone's AI, the host's included. Taking your
  own post down stays allowed. Direct messages are between two people and
  are not the host's to switch off.

## Builder parity

A builder's own AI calls the same rules the app's screens use, one operation
per thing a builder does, each declared in `shared/operationCatalog.ts`.

**A personal agent acts; the guide proposes.** A builder's own AI changes
things directly: its owner is present and asked for the change. The staged
route (a change set a person applies in the app) stays for the guide, which
nobody watches.

**What takes something from members waits.** An operation whose effect is
*destroy* or *broadcast* is not offered until the two-step confirm exists
(slice 5). So far that holds back: deleting a channel, changing who may see
one (opening a private channel shows its history to everyone), pinning a
post, cancelling an event, and making or changing an event (members are
emailed reminders).

**Channels** (`community.channel.*`, `convex/communityChannels.ts`): `create`
(open to every member; a private channel is made in the app), `rename` (the
slug stays), `describe`, and `move` (after a named channel, or first). A
channel is named by its slug. General is not renamed or moved.

**Courses and lessons** (`builder/resources/`,
`convex/communityResourceChangesets.ts`). The engine for an AI's course
changes already existed: a batch of up to 25 changes, checked against what
changed since the AI read it, previewed, applied all or nothing, expiring in
24 hours. Until slice 4b every batch was only staged for a click. Now:

- A builder's own AI **applies a batch that takes nothing away** as it sends
  it: creating and editing courses and lessons, publishing, moving, ordering.
- **A batch that deletes** a lesson or a course is staged. The host applies
  or rejects it in the app: on Home, in the host's "Needs you" list, on
  every community whether or not the guide is on (the guide's card still
  shows it too). This is the two steps for courses, and the same staging is
  what slice 5 reuses.
- **The guide stages everything**, as before.
- Added to the engine: `reorder_pages` and `reorder_modules` (each names
  every lesson, or every course, once), and `lesson_links` on a lesson.
- A safe batch does not queue behind a staged one; a staged one still blocks
  another staged one.
- One batch is one builder change against the budget, whatever it holds.
- Covers are not here: they need file upload.

### Needs you (the host's Home)

Home holds one list of everything waiting on the host's decision
(`apps/web/src/v1/KitNeedsYou.tsx`). It is the place every held action and,
later, every guide proposal and report lands. A row opens in place.

- **People asking to join**: one row; opened, the first three with Approve
  and Decline, then a link to all of them in Members.
- **Course changes an AI asked for**: the staged batch, with what changes,
  Apply and Reject.
- **The oldest unanswered question**, with the guide on.
- Empty, the list is not drawn. News (posts, new members) is not in it.
- Not yet: other held actions (slice 5), the daily report, guide proposals,
  money problems, and a count on the Home item in the left column.

## Slices

1. **Limits, the free cap, the operations list.** *Built.* The list, the
   budgets above, one free community per owner, the MCP contract corrected
   (it said both that everyone and that only builders may use the MCP;
   everyone may).
2. **Guidance and output quality.** *Built; the skills are written and not
   published.* See "Guidance" below.
3. **The member lens, finished.** *Built.* See "The member lens" below.
   Events are readable; RSVP does not exist in the product, so there is
   nothing to expose.
4. **Builder parity, part one.** See "Builder parity" below.
   - **4a, channels.** *Built.* Create, rename, describe, put in order.
   - **4b, courses and lessons.** *Built.* On the changeset engine that
     already existed, not as new operations.
   - Events moved to slice 5: every member is emailed a reminder before an
     event, so making one is a broadcast and waits for the two steps.
   - Invites: there is no invite to make. "Copy invite link" copies the
     community's address, which an AI already reads.
5. **Builder parity, part two.** Members, pods, the community page and
   settings, analytics. Two steps for destroy and broadcast. Money stays in
   the app.
6. **The paid layer through the MCP.** Memory, briefs and the map readable
   by a builder's own AI on a paid community. The host's activity page, and
   revoke.

The paid product itself (briefs in every panel and by email, each member's
memory page, the map) is its own track in `agent-system-end-state.md`.

## Not in this spec

Other channels into the guide (text, email, voice); agents acting for the
community without a person behind them beyond what the guide already does.

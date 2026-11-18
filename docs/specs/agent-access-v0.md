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

## The guide does what your own AI does, and asks first

(Neil, Nov 18.) The guide in a person's private talk does for them what
their own AI does through the MCP: the same operations, the same checks, one
executor. It asks only when the question tells the person something they
don't already know (`shared/operationCatalog.ts`, `guideAskFor`):

| The person tells the guide to | What happens |
|---|---|
| React, mark a lesson done, approve or decline people asking to join (one, some or all) | It does it and says so. Their sentence is the approval. |
| Post, reply or edit a post under their name | It shows the exact words above the box where they type: **Yes**, **No**, **Always allow posts**. |
| Remove posts (one, or up to 100 at once), delete their own post | It shows the posts and asks **Yes** or **No**, every time. There is no "always". |

How it works (`convex/communityGuideQuestions.ts`): the guide's call is
saved as it was made and answered `waiting_for_person`; nothing runs. Yes
runs that same call as the person, through the executor, with every check
made again. No, a day without an answer, or the person moving on to another
turn drops it. The guide is told the answers at the start of its next turn.
"Always allow posts" is per person per community, switched off again in
Settings (Membership for a member, Guide for a host). Posts made this way
follow the same rules as posts through anyone's AI: the host's switch, the
content checks, the "via AI" mark.

A person's own AI is not asked by Polynet (it has its own person watching
it, and Polynet can't show a question there), so removing posts through it
is still refused with a link (below). That is the one place the two doors
differ.

Not yet through the guide: direct messages, settings, roles, channels.

## Builder parity

A builder's own AI calls the same rules the app's screens use, one operation
per thing a builder does, each declared in `shared/operationCatalog.ts`.

**An agent you are working with acts.** A builder's own AI, and the guide
in the composer, change things directly: the builder is present and asked
for the change.

**What can't be taken back is a person's click** (Neil, Nov 18). Agents
prepare; a person makes the change that can't be taken back, with the app's
own button. It is the same rule as courses. An AI that asks for one of these
is not queued and not asked "are you sure": it gets the refusal
`person_only`, one sentence, and the address in Polynet where the person
does it. So a planted post can never talk an AI into it.

| Asked for | What the AI gets |
|---|---|
| Remove a member, ban a member | The member's record (several: the Members page) |
| Open a closed community | The Members page, where "Who can join" is (added with this rule: the current design had no place for a host to change it) |
| Remove a post | Through the guide: asked, then done (above). Through a person's own AI: the community's channels; the AI names the channel and post |
| Delete a channel, change who may see one, pin a post | Not offered |
| Publish or unpublish a course, delete what members see | Refused with where the switch is (above) |

Changing a role, lifting a ban and setting joining to approval take nothing
from anyone, so an AI still does them. Later: a restore for removed posts,
after which an AI could hide posts (nothing would be lost).

**Channels** (`community.channel.*`, `convex/communityChannels.ts`): `create`
(open to every member; a private channel is made in the app), `rename` (the
slug stays), `describe`, and `move` (after a named channel, or first). A
channel is named by its slug. General is not renamed or moved.

**Courses and lessons** (`builder/resources/`,
`convex/communityResourceChangesets.ts`). The engine for an AI's course
changes already existed: a batch of up to 25 changes, checked against what
changed since the AI read it and applied all or nothing.

**Agents build in draft; people decide what members see** (Neil, Nov 17).
Knowledge is never added by a background job. A builder directs the agent
and is present, so there is no waiting step and no approval card:

- A batch from the guide or from a builder's own AI is **applied as it is
  sent**: creating, editing, moving and ordering courses and lessons.
- A new course is always a **draft**. Members see nothing of a draft course.
- **The Published switch is the approval.** An agent can't publish or
  unpublish a course; a person does, in the app.
- An agent can **delete drafts** (a lesson in a draft course, an empty draft
  course). It can't delete a course or lesson in a published course; it is
  told to do that in the app.
- An agent **can edit a published lesson and add a lesson to a published
  course**. Publication belongs to the course, so that shows to members at
  once (the same as a host doing it by hand). The guide says so first.
- A refused step refuses the whole batch, with a sentence saying where the
  control is.
- Added to the engine: `reorder_pages` and `reorder_modules` (each names
  every lesson, or every course, once), and `lesson_links` on a lesson.
- One batch is one builder change against the budget, whatever it holds.
- Covers are not here: they need file upload.

### Where a decision is made

Four ways things happen, and where each is approved (Neil, Nov 17):

1. **The app**: a host or member clicking. Nothing new.
2. **The guide, in the composer**, and 3. **your own AI, through the MCP**:
   you are working through an agent. It builds and prepares; what can't be
   taken back it hands to you as a link to the app's own button (above).
   The guide's questions (words under your name, removing posts) are asked
   just above the composer, where you are working.
4. **On its own**: the guide's scheduled work, for the community and per
   person, and what arrives by itself (someone asks to join, an event is
   near, a payment fails). This comes forward on **Home**.

### Home

Home is one column: the guide briefs you, then the few things that need
you, then the box to ask it anything (Neil, Nov 18;
`apps/web/src/components/WebCommunityHomeSection.tsx`,
`apps/web/src/v1/KitNeedsYou.tsx`). Each thing appears once.

- **The brief**: one to three sentences in the guide's voice about what is
  happening (the place brief, `convex/communityBriefs.ts`). With the guide
  off, or before it has written one, a plain sentence of facts stands in.
- **The list**: the three most important rows show; the rest stack behind
  "N more". Empty, it is not drawn.
  - A host, "Needs you": people asking to join (answered in place, first),
    then what was noticed: a question with no answer for a day, new members
    who haven't posted, people stalling on a lesson. A noticed row has one
    action and "Not now", which hides it for 30 days. With the guide off a
    noticed row also says what a guide would do.
  - A member, "For you" (guide on): saying hello when new, the lesson they
    are on, the event that is near.
- **The right column** keeps what is glanceable: the next event, what the
  community knows, who is here.
- Only what came forward on its own is on Home. There is no news list.
- **What the guide suggests** (a host with a guide), under the list and
  apart from it: see "The guide's own work" below.
- Not yet: money problems, RSVP on the event row, and a count on the Home
  item in the left column. The morning report stays an email: every part of
  it is on Home live.

### The guide's own work

The guide does things with nobody present, and what it prepares comes
forward on Home for the host. It never acts on a member without that click.

**A reply to a question nobody answered** (`convex/communityReplyDrafts.ts`,
`shared/communityReplyDrafts.ts`, `apps/web/src/v1/KitGuideSuggests.tsx`):

- A member's question in an open channel that has had no reply for 24 hours.
  Never a pod's room or a direct message.
- The guide is shown the question and up to 6 lessons members can see that
  share its words. With none, no model request is made.
- It writes one reply of at most 600 characters, with no links, resting on
  one lesson it was shown; or it says no lesson answers it.
- The draft waits on Home under "Your guide suggests": Post reply, Edit,
  Skip. Posting puts it in the thread as the guide, ending with the lesson
  it came from.
- Limits: 3 drafts in any 24 hours per community; a question gets one draft,
  ever; a draft is no longer offered once someone replies or the question is
  a week old.
- Paid: it is the guide working, on the owner's AI allowance, one request a
  draft.

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

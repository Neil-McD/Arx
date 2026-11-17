# Agent access: MCP, lenses, limits, free and paid (v0 spec)

Status: direction agreed 2026-11-17 (Neil). Slice 1 is built (see "Slices").
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

## Slices

1. **Limits, the free cap, the operations list.** *Built.* The list, the
   budgets above, one free community per owner, the MCP contract corrected
   (it said both that everyone and that only builders may use the MCP;
   everyone may).
2. **Guidance and output quality.** Real instructions from the server;
   Polynet's posting rules and the host's house rules where every agent
   reads them first; skills as an installable plugin. Refuse duplicates,
   cap length. Mark posts made through someone's AI.
3. **The member lens, finished.** Messages (read your own, reply in
   conversations that exist), pod rooms, events and RSVP. The host's switch
   for whether members' AIs may post.
4. **Builder parity, part one.** Channels, courses and lessons, events,
   invites.
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

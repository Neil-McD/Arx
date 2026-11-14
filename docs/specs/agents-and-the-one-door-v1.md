# Agents and the one door (v1 spec)

Status: draft for Neil's review, 2026-11-14. It states the model Neil confirmed
that day and the end state it implies. Nothing here is built beyond what
"Today" lists. The engine that runs the community's own agent is
`community-agent-gateway-v0.md`; this spec is about who the agents are, what
each may do, and the rules that keep that safe.

## The model

Two kinds of agent:

- **The community's agent (the guide).** One per community. Polynet runs it;
  the owner pays for it.
- **A personal agent.** Someone's own Claude, ChatGPT or other harness,
  connected from outside through the Polynet MCP. Polynet does not run it or
  pay for it.

Two lenses, which are never something an agent claims. A lens is the person's
own permissions, checked by the server on every call:

- **Builder:** sees and does what that builder can.
- **Member:** sees and does what that member can.

| | Builder lens | Member lens |
|---|---|---|
| **The guide** | Briefs the builder; drafts things for approval | Answers that member privately; suggests next steps |
| **A personal agent** | Runs the community for the builder | Reads and takes part for that member |

Outside the grid, the guide also speaks **as the community**: when someone
mentions it in a channel, and when it wakes on its own (below). There it wears
nobody's lens and has the least power: it reads what is shared and replies.

Lenses between the two ends (a moderator, a pod's host) work the same way.

## The rule: parity

Anything a person can do in the app, their agent can do through the same door,
with the same permission and nothing more. There are no separate "AI
features". When the app gets a verb, the door gets it.

The difference between the two agents is not power but presence:

- **A personal agent acts.** Its owner is there and approved it in their own
  harness.
- **The guide proposes.** Nobody is watching it, so it drafts and suggests and
  a person taps. The exception is small and reversible: a reply in a thread.

## The shape stays small

Five tools, as today: list, read, search, write, call. Things are folders that
are read and searched. Actions are named verbs. Growth means new folders and
new verbs, never new tools, so any agent can learn a whole community in one
look. Paths are selectors, never authority.

## What each area allows at the end

| Area | A builder's agent | A member's agent |
|---|---|---|
| Channels | Read, post, moderate | Read, post, react |
| Courses | Create from an outline, write lessons, attach resources, publish | Read, mark done |
| The guide's memory | Teach, fix, remove | Nothing |
| Events | Create, change, cancel, show on the public page | Read |
| Pods | Run the pods they host | Read their own pod; speak only when told |
| Members | Admit, roles, remove, ban | See who is here |
| Settings | Change, with a version check | Nothing |
| Sales and analytics | Read only | Nothing |
| Prices, refunds, payouts | Never | Never |

## Today

- A member's agent: reads channels, courses, events and members; posts,
  replies, reacts; marks a lesson done; marks a channel read.
- A builder's agent: all of that, plus join requests, removing posts, roles,
  remove, ban and unban, settings, join mode, the guide's instructions, the
  handbook, and lessons under `builder/resources/`.
- Nobody can create an event or a course, or teach the guide, through the door.
- Since Nov 14 the guide's notes (`memory/`) are read by the guide and by
  builders only; a member's agent gets nothing there, and nobody writes them
  from outside.
- The guide wakes when mentioned, and once a day for the builder's brief.
- Every call is authorised on the server; writes from outside are rate limited.
- Not verified on Nov 14: a real outside agent driven end to end, and what an
  agent sees of a pod.

## Four safety rules

1. **Draft, then publish.** Agents create drafts freely. Making something live
   is its own step.
2. **Two steps for anything that destroys or broadcasts.** Delete, ban, remove,
   cancel a series, message everybody: the agent asks, gets a preview and a
   short-lived token, then confirms with it. One injected sentence cannot do it
   in one call. This applies to the verbs that exist today too.
3. **Signed and logged.** Every action says who it was for ("Polynet · for
   Neil"). A builder has one page showing what agents did and why, with an off
   switch per connection.
4. **Content is never instructions.** What a member posts, or what a page the
   guide read says, is data. The guide's memory is written only by a builder
   teaching it, or by the guide saving an answer under the existing rules.

## The guide wakes on its own

It should not need a tag to be useful (Neil, Nov 14).

- **A beat, only when there is something new.** A quiet community costs
  nothing.
- **A cheap look first.** A small pass sorts what is new: a question nobody
  answered, a newcomer's first post, something worth remembering, something
  the builder should know. The stronger step runs only when a pile has
  something.
- **When it replies untagged:**
  - People go first: it waits after a question (proposed default: one hour).
  - Only with a real answer, from the courses or what it was taught, and it
    says where the answer came from. Unsure, it stays quiet and the question
    goes to the builder's "Questions nobody answered".
  - In the thread, once. Never a new top-level post, never into a conversation
    that is already moving.
  - Not in a pod unless that pod's host turned it on.
- **The builder's controls.** One dial: Off, Quiet (only unanswered
  questions), Active (also welcomes newcomers and nudges). A daily spending
  cap. Proposed default for a new community with the Agent plan: Quiet.
- **Members** can mark an untagged reply "not helpful"; the guide learns from
  it and the builder sees it.

First behaviour to build: answering unanswered questions. The brief already
finds them.

## The guide proposes

- For a member: answers carry buttons (continue this lesson, open this event).
- For a builder: drafts ("Three people asked about refunds. Here is a note to
  teach me."), approved in one tap. A draft from the guide and a draft from a
  builder's own agent are the same thing with the same publish step.

## Slices

Listed with their acceptance in the plan
(`design-system-v1-implementation-plan.md`, section 5, track 3): parity for
builders; the activity page and off switch; two steps for destructive verbs;
answers that name their sources; the guide answers unanswered questions; the
guide proposes; packaging for Claude and ChatGPT.

## Open, for Neil

- May a builder's agent publish a course without a tap in the app? Proposed:
  yes. It is their agent and they approved it there.
- May a member's agent read that member's direct messages? Proposed: not yet.
- Ban and remove exist today in one step. Proposed: keep them, in two steps.
- The wait before an untagged answer (proposed: one hour) and where the dial
  starts (proposed: Quiet).

## Not in v1

Other channels into the guide (text, email, Slack, voice); a member's agent
acting in a pod on its own; any agent touching prices, refunds or payouts; a
second kind of agent hosted by Polynet for each member beyond the private
session the gateway spec already describes.

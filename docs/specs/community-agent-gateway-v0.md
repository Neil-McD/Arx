# The community agent gateway (v0 spec)

Status: draft for Neil's review, 2026-11-12. Nothing here is built beyond what
"Today" lists. It builds on `proactive-community-agent-v0.md` (approved Oct 26)
and replaces its architecture table where they differ.

## What we are building

One agent per community, shaped like OpenClaw and Hermes and built on our Pi
harness (`shared/piRuntimeKernel.ts`). It knows the community and each member,
keeps everyone up to date where they already look, and acts on its own when
it is genuinely useful. Two jobs:

1. **Keep people up to date.** Every page's right column has a short, current
   description of what happened there: Home ("today in the community"), each
   channel, Knowledge, and later a member's Inbox and each pod. The guide
   writes these.
2. **Look after each member.** Every member has one private, ongoing session
   with the agent. The agent remembers them (with consent), answers them, and
   reaches out when it should (welcomes, nudges, reminders), within strict caps
   and the owner's approval.

## Decisions (Neil, Nov 12)

- **AI is off by default.** It turns on for the whole community when the owner
  buys the Agent plan ($79 a month with $20 of model use included,
  `shared/founderPlan.ts`). When it is off, nothing on the page mentions the
  AI; the community works fully without it.
- **Every member gets a private, ongoing session** with the agent when AI is
  on.
- **The owner pays for all of it**, members' sessions and background work.
  It must be very cheap.
- **One model for everything for now: `gpt-6-luna`**
  (`COMMUNITY_OWNER_FUNDED_MODEL_ID`). Cheapness comes from running rarely,
  caching, sharing and doing the routine parts without a model.

## Today (what exists)

| Piece | Where | State |
|---|---|---|
| The Pi kernel | `shared/piRuntimeKernel.ts`, `shared/runtimeKernel.ts` | Used by both engines |
| Engine 1: the turn loop | `runtimeAgentLoop.ts`, `runtimeTurnHandlers.ts`, threads | Home's guide, site Ask; own run ledger (`runtimeRuns*`) |
| Engine 2: the serve worker | `communityAgentServeWorker.ts`, `communityAgentServeRequests` | @mentions in channels; own ledger (`communityAgentRunEvents`) |
| Member sessions | `memberAgentChannels` (per member, per community) + `memberAgentEpisodes` | Exists: Home's conversation |
| Funding | `resolveCommunityInferenceFundingAdmission`, `startFundedInferenceRun`, receipts, `founderInferenceBudget` | Owner-funded, Agent plan required, monthly ceiling |
| Member memory | `memberFacts` (consent from provenance) | Exists |
| Community memory | `communityNotes` (founder, ask, tag) | Exists; the old compiler and steward were deleted in #318 |
| Proactive work | `communityFounderBrief.ts` (cron every 15 min) | Slice A live on staging: the owner's daily brief |
| Home facts | `getCommunityHomeSnapshot` / `getCommunityMemberHomeSnapshot` | Last 24 hours, counts and a few items |
| Schedules | `crons.ts` | Brief, event reminders, mention emails, email outbox |

Two engines wrap the same kernel with duplicated funding, evidence, tool
re-authorisation and run ledgers. There is no shared record of "what happened
here since you last looked", no summaries, and no agent heartbeat.

## The design: four layers

```
1. activity            posts, replies, joins, questions, events, lessons, notes
         ↓
2. signals             deterministic, no model, privacy-tagged     (free)
         ↓
3. skills              summaries · next step · outreach · answers  (Luna, owner-funded)
         ↓
4. the gateway         one engine: sessions, tools, funding, receipts, caps
```

### 1. Activity

Unchanged. The tables that already record what people do.

### 2. Signals (no model)

One server-side layer that turns activity into **moments** and **signals**:

- **Moments**: things worth showing a person: a post with replies, a win in
  #wins, a question waiting, something the community learned, a new member,
  an event starting, a lesson finished. Each has a type, a one-line text, a
  link, a time, and an **audience** (everyone, hosts only, one member).
- **Signals**: things that may need action: someone joined, a post unanswered
  for 24 hours, a member quiet for N days, an RSVP tomorrow, a stuck lesson,
  a failed payment, people waiting to join.
- **Last visit**: one timestamp per member per community (per account, not per
  device), written when Home opens. "Since you were last here" means that.
- **Privacy on the server**: a reader only ever receives moments whose
  audience includes them. Members never receive names from host-only moments,
  private channels or pods they are not in, or other members' sessions.

What reads it:

- With AI on: Home's centre, "Since you were last here" (3 to 5 moments) and
  the **next step** (one per person; owners: what needs them; members:
  continue your lesson, say hello, RSVP). No model, but presented as the
  guide's, so it is part of the paid experience.
- With AI off: plain lists only (recent, upcoming, counts); see "AI on and
  off".
- Skills (below), as their input.

### 3. Skills (Luna, owner-funded, only when AI is on)

A skill is a small, bounded job with a fixed prompt, a fixed input built from
signals, a fixed output shape, and a cost cap. v0 has three:

**a. Summaries ("the guide keeps you up to date").**

- One summary per **area**: `community_today` (Home), `channel:<id>`,
  `knowledge`, later `pod:<id>` and `inbox:<member>`.
- Two to three plain sentences, each pointing at a moment it describes.
- **Audience**: one summary per area *per audience* (members, hosts), never per
  person, so a channel's summary is written once and read by everyone who can
  see the channel. The member summary is written only from member-visible
  moments; the host version may add host-only ones.
- **When it runs**: a sweep every 15 minutes, using the same pattern as the brief cron, picks areas whose
  moments changed since their last summary *and* that someone opened since.
  An area nobody looks at is never summarised. An unchanged area is never
  re-summarised.
- **Fallback**: when AI is off, the budget is spent, or the call fails, the page
  shows the deterministic lines (today's `shared/communityHomeToday.ts`).
- Stored in one table `communityAreaSummaries` (community, area, audience,
  text, moment ids, input watermark, cost, written at).

**b. Answers.** The member's or owner's own session (Home's conversation, the
palette's Ask, @mentions). Exists today; moves onto the gateway in slice 4.

**c. Outreach.** The October spec's member loop: signals → gate (caps) →
judge → draft card in the owner's brief → on approval, a message in the
member's session. Slices 5 and 6.

### 4. The gateway (one engine)

What every AI action goes through, replacing the two engines:

- **Principal and scope**: who the agent is acting for (a member's session, the
  owner, the community in a channel, a background skill), in which community.
- **Context**: built from signals and memory the principal may see, never
  more. Background skills read as "the community agent", which sees shared
  channels and only the private channels and pods it was added to (the
  private-channel contract already says this).
- **Tools**: one registry with per-principal policy (read, write own, approval
  required).
- **Funding**: one admission check (`resolveCommunityInferenceFundingAdmission`),
  one funded-run start, one receipt per call.
- **Caps**: the monthly ceiling plus a background budget (below).
- **One run ledger** with the turn, its context, tools, cost and outcome, so
  every answer and every proactive action is auditable.

Build it by moving work onto it, not by rewriting: summaries are the first
skill born on it; then the serve worker (@mentions) moves; then the turn loop.
Each move deletes the old path in the same slice.

## AI on and off: free is plain, the guide is what you pay for

Neil, Nov 12: the free plan should feel plain on purpose; the guide's voice
is the reason to upgrade.

- One answer per community: `ai_on` = the funding admission is ok (Agent plan
  active, or the operator grant). Read with the community's access and sent to
  every page.
- **Free (off): plain facts, no guide.**
  - Home: a simple greeting and plain lists: recent posts, upcoming events,
    new members, counts. No "Since you were last here" curation, no next-step
    card, no guide eyebrow, no guide conversation, no chips.
  - Right columns: plain facts only: the next event, who is online, counts,
    the latest few posts or notes. No written summaries.
  - Search or ask is plain search ("Search").
  - No "unavailable" messages anywhere: the AI parts are simply not on the
    page.
  - The signals layer still runs underneath (it is free and also keeps
    notifications and the owner's views correct), but its curation (ranking,
    "since your last visit", the next step) is shown only with AI on.
- **Paid (on): the guide.** Written summaries in every right column, "Since
  you were last here" chosen for you, a next step for each person, the guide
  on Home, Ask in the palette, chips, and each member's private session.
- **No standing upsell, and no trial.** Neil, Nov 12: few nudges, no free
  trials. The owner turns the agent on in Your guide, where they manage it
  ("Turn on" goes straight to the Agent plan). Beyond that, the only prompts
  are owner moments (below). Members never see upsells.

### Owner moments: milestones and detected problems

One card at a time, in the owner's next-step spot on Home, only when nothing
urgent (a failed payment, people waiting to join) is there; at most one new
card a week; dismissable for good. Every card uses the owner's own numbers.

- **First member**: a congratulations only, no upsell.
- **10 members** and **50 members**: where the upsell starts; the card names a
  problem only if the data shows one at that moment.
- **Detected problems** (shown only while true):
  - **Questions waiting**: a member's question with no reply for 24 hours.
  - **Quiet newcomers**: 2 or more people joined 3 to 14 days ago and have
    not posted.
  - **Stuck in a course**: 3 or more members last finished the same lesson
    7 or more days ago, with lessons left.
  - **A busy week**: 150 or more messages in the last 7 days.
- **Free**: the problem, what the guide would do about it, and "Turn on your
  community's agent". **Paid**: the problem and what the guide did (once the
  guide acts on its own, slices 3 and 6; until then, "Talk it over").
- Each card records when it was shown and dismissed, so we learn which
  problems sell the agent.
- Later: activity dropping week over week (needs a two-week comparison), and
  the same question asked repeatedly (needs the model).
- Turning off (plan lapses) keeps everything already written (notes, summaries,
  sessions) readable; nothing new is generated and the pages go back to plain.

## Cost: cheap by design

One model, so cost is controlled by how often and how much we call it:

- **Signals, moments, next step, counts: no model.**
- **Summaries**: one call per changed and viewed area per sweep, shared by
  every viewer of that audience; small fixed input (the moments only, never
  raw history); short output. Expected: a handful of calls a day for a quiet
  community.
- **Outreach**: the judge sees one member's reasons and last few messages, and
  "skip" is the default; most signals never reach a model because the caps
  and the gate drop them first.
- **Background budget**: a share of the owner's included $20, by default
  $5 a month for summaries and outreach together (raisable by the owner);
  when it runs out, background work stops and deterministic lines show. Members'
  own conversations draw on the rest of the $20 and the existing ceiling.
- Every background call writes a receipt with its cost; the owner's brief shows
  this month's background spend.

## Privacy and trust (unchanged from October, restated)

- Silence is the default for outreach; the judge must justify every message.
- Members' private sessions never feed community summaries or memory without
  the member's consent.
- Owners see outcomes, not members' words, unless the member shares them.
- Summaries for members are written only from what members can see.
- The agent always says it is the community's AI agent acting for the owner.
- Access, money, public posts in the owner's name and sensitive topics always
  need an approval card.

## Slices (each ships to staging, then Neil's acceptance)

1. **AI on/off.** `ai_on` on every page; the free state is plain (no guide,
   no curation, no summaries, no errors, no upsell). Acceptance: a free
   community looks complete and plain; turning the plan on brings the guide
   everywhere.
2. **Signals and Home.** Moments, signals, last visit, next step, milestones,
   server-side audiences; Home's centre rebuilt on them (no repeats with the
   right column).
   Acceptance: a member and an owner each see what changed since their last
   visit and one useful next step.
3. **Summaries on the gateway.** The first skill: `community_today`, then
   channels, then Knowledge. Acceptance: right columns read like a person
   wrote them, stay current, and a week of background spend is shown and
   tiny.
4. **@mentions onto the gateway.** The serve worker becomes a gateway skill;
   its ledger and duplicate funding/evidence code are deleted.
5. **Sessions onto the gateway.** The turn loop moves; one engine remains.
6. **Outreach in draft mode** (October slice B) on signals, then **automatic
   mode** for welcomes and event reminders (slice C), within the caps.

Slices 1 and 2 need no model. Slice 3 needs the demo community on the Agent
plan (or the operator grant) on staging.

## Open questions

1. The default background budget: $5 of the $20, or another number?
2. Should a member's Inbox summary (private, per member) come in v0, or wait
   until the per-area summaries prove their worth?
3. Pods' summaries and the agent's access to pods follow the pod decisions
   (who creates pods; whether the agent is in a pod by default).

## Not in v0

Model tiers (one model until cost says otherwise), members bringing their own
AI through MCP, SMS and voice channels, agent-written playbooks (skills the
agent writes itself), and multi-agent rosters.

# Proactive community agent (v0 spec)

Status: approved by Neil on 2026-10-26. Replaces member workflows' rule
builder and forms builder with one proactive community agent. Slice A (the
founder brief) is next.

## Why

Workflows ask founders to wire trigger → action rules by hand. Every serious
agent product converged on another shape (OpenClaw, Hermes, Instinct, Meta
Muse, OpenAI dots, Claude Duet): one thread per person, memory, standing goals,
proactive check-ins that stay silent by default, approval cards, every channel,
and a visible log. Polynet's twist: one agent serves one founder **and N
members**.

## The model

Two loops, one agent per community:

1. **Member loop.** The community agent keeps one private thread with each
   member, knows them (their profile, with consent) and where they are in the
   community's journey, and reaches out when it is genuinely useful.
2. **Founder loop.** A daily brief (who joined, who's stuck, what the agent did
   and proposes, questions members asked, decisions waiting) with approval
   cards, plus the journey board.

One pipeline joins them:

    signals → candidates → gate → judge → act in the member's thread
            → evidence → the card moves → the founder's brief

## Decisions locked (Oct 26)

- **Trust ramp:** proactive outreach starts in draft mode (the founder approves
  each one in the brief); automatic mode is enabled per reason afterwards.
- **Caps:** at most 2 agent-started messages per member per week, 48 hours
  apart, never in the member's quiet hours, never mid-conversation.
- **Cards are members only** (no task cards in v0).
- **The agent drafts the journey and rhythm** from the community's description;
  the founder edits in plain words.

## The pieces

### 1. The founder's words (configuration)

- **Journey:** ordered stages. A stage is a name, a goal in plain words, what
  the agent may do toward it, and whether moving on needs approval.
- **Rhythm:** a short plain-words checklist ("Welcome new members within an
  hour. Nudge quiet members once after 10 days. Remind RSVPs the day before.
  Never pitch paid tiers.").
- **Want to know:** what the agent should learn about each member (replaces
  forms).

The agent compiles these into signal rules and judge instructions and shows
"here is what I would have done last week" before anything goes live.

### 2. Signals (deterministic, no model)

Member joined; first post; post unanswered for 24 h; quiet for N days; in a
stage longer than its expected time; event RSVP tomorrow; event missed; new
resource matching the member's goal; goal deadline near; founder commented on
the member's card.

### 3. Candidates and the gate (deterministic)

Signals become candidates (member, reasons, priority, expiry), merged per
member. The gate enforces the caps above, the member's "less of this" choices,
the community's daily outreach budget, and the founder's funding admission.

### 4. The judge (cheap model, small context)

Input: the member's consented profile, the reasons, their last few messages,
the stage goal, the rhythm. Output: send (with the draft), skip (default), or
escalate to the founder. It never runs tools and never sees other members'
private threads.

### 5. Act

- Draft mode: the draft becomes an approval card in the founder's brief.
- Automatic mode: the message goes into the member's thread; if unseen after a
  day, an email (SMS and Slack later, through the same thread).
- Every outreach writes a receipt: why, what, cost, outcome.

### 6. Evidence and the board

The existing goal assessment judges a stage goal from evidence and moves the
card. A card is a member with a status (on track, stuck, needs you, done), the
agent's latest note and links to evidence. Founder comments on a card are
instructions the agent reads on its next wake; the agent comments what it did.
A blocked card ("needs a refund decision") waits for the founder's answer.

### 7. The brief (daily, at the founder's time)

In the founder's agent thread plus email: new members; what the agent sent and
the replies; members who are stuck; approval cards (drafts, stage approvals,
blocked cards); the top questions members asked; cost so far this month.

## Architecture: reuse, add, delete

| Need | Reuse (exists today) | Add |
|---|---|---|
| Wake-ups | `crons.ts`; the community memory sweep in `communityAgentHeartbeat.ts` (owner off-switch, 2 cycles/day cap, delta gate, funding admission); workflow timers | A member-candidate scan in the same sweep pattern |
| Funding | `resolveCommunityInferenceFundingAdmission` (founder-funded, `managed_required`) and run budgets | A monthly proactive budget per community, shown in the brief |
| Agent turns | `communityAgentServeWorker` and serve requests (intake reasons, receipts) | A `proactive_outreach` and a `founder_brief` intake reason |
| Member memory | Member ontology (`memberFacts`, consent from provenance) | A member-visible "what the agent knows about me" view, editable |
| Goal judge | `communityWorkflowGoalReviewCore` (bounded, evidence-bound assessment) | Run it per member stage goal, not per configured action |
| Approvals | Workflow approvals and transition receipts | Approval cards in the brief |
| Email | Email outbox, preferences, the weekly digest snapshot pattern | The brief email and the unseen-message fallback |
| Board | The workflow board UI (stage columns, member cards) | Card status, agent notes, comments |

**Delete (one-way door, needs Neil's OK at slice D):** the trigger → action
rule editor, configured actions and their runs, the forms builder, form
versions and form requests. Before deleting: a census of prod data, an export,
and a migration of any live stage goals.

## Slices (each ships to staging, then Neil's acceptance)

- **A. Founder brief.** Read-only, no member messages. Acceptance: Neil gets a
  brief every morning for a week on a seeded staging community and finds it
  worth reading.
- **B. Heartbeat in draft mode.** Signals, gate, judge; drafts arrive as
  approval cards; approving sends into the member's thread. Acceptance: a week
  of drafts, approval rate tracked.
- **C. Automatic mode** for low-risk reasons (welcome, event reminder), per
  reason, within caps; the agent tunes cadence from replies and mutes.
  Acceptance: a week with no message Neil would regret.
- **D. Board collapse.** Stages become goals, cards get status, notes and
  comments; the conversational interview replaces forms; the old builders are
  deleted after the census.

Staging is too quiet to judge a brief: slice A starts by seeding one community
with realistic simulated members and activity.

## Guardrails

- Silence is the default; the judge must justify every message.
- Every proactive action is visible to the founder in the brief and on the card.
- Members see what the agent remembers about them and can correct or delete it.
- Member private threads never feed community memory without consent.
- The agent always says it is the community's AI agent, acting for the founder.
- Access, money, public posts in the founder's name and sensitive topics always
  need an approval card.

## Decided at review (Oct 26)

1. **The one thread is the Agent page conversation.** The workflow's private
   service channels retire with the rule builder.
2. **Founders see outcomes, not members' words.** The brief shows replied,
   acted or muted and the agent's summary; a member's own words reach the
   founder only when the member shares them.
3. **Proactive budget:** a default monthly amount in the founder plan, raisable
   by the founder. The number is set after slice A measures the real cost of a
   brief.

## Not in v0

Member-side personal agents connecting through the MCP, SMS and voice
channels, task cards, agent-written playbooks (Hermes-style skills), and
multi-agent rosters.

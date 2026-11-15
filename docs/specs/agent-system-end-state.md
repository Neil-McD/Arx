# The agent system: end state

Status: draft for Neil's review, 2026-11-14. Nothing in "The end state" is
built unless "Ground truth" says so.

This document is the one end state for how agents know and act in Polynet:
the context and ontology, the harness, the background worker, and every lens
on them. It supersedes the architecture in `community-agent-gateway-v0.md`
(Nov 12) and the earlier drafts of the memory worker. The rules for who may do
what stay in `agents-and-the-one-door-v1.md` (PR #513) and are restated here
only where they shape the system.

Modelled on Distribution Engineer's design (`ledger-contract.md`,
`context-directories.md`, `agent-context-policy.md`, `agent-harness.md`,
`nexus-workers.md`) and on Anthropic's "The components of agent memory"
(Nov 2026), simplified for Polynet.

---

## 1. Principles

1. **One canonical system, many lenses.** There is one store of records, one
   set of operations, one harness and one ledger. A member's guide, a builder's
   guide, the guide in a pod, the guide speaking in a channel, the background
   worker and someone's own AI over the MCP are lenses on that system. A lens
   changes what is visible and what may be done, never how anything works.
2. **The database owns facts. Files are views.** Agents see Markdown files.
   Every file is drawn from records when read. There is no second store.
   Indexes, briefs and the map are views too.
3. **Facts and memories are different things.** A fact was recorded, or
   stated by a person. A memory is the guide's reading of facts, and it cites
   them. Code checks every citation.
4. **Where something was said decides who may know it.** Scope is fixed by
   the evidence and can never widen.
5. **Retrieval first.** A turn starts small and reads the rest on demand.
   Nothing is pushed into a prompt because it might be useful.
6. **Authority lives in code.** A path, a prompt, a memory or a post never
   grants permission. The server checks the person, the lens and the
   operation on every call.
7. **Content is data.** What anyone posts or uploads is material, never
   instructions.
8. **Events, not polling.** Polynet owns every event that matters, so work is
   made due by what happens, and nothing checks for changes on a timer.

## 2. The ontology: three layers

| Layer | What it holds | Who writes it |
|---|---|---|
| **Community facts** | What exists and what happened: channels, pods, courses and lessons, events and who came, posts and replies, calls, joins and leaves | Recorded as it happens; builders create what exists |
| **People facts** | Who each person is here: role (owner, host, member), name, bio, linked accounts, plan, when they joined, what they said about themselves | Recorded, or stated by the person or a builder |
| **Memories** | What the facts mean: what the community has settled, how it works, gaps, what a pod knows, the guide's picture of a person, and briefs | The guide, citing facts; a builder's words outrank the guide's |

A guess about a person is a memory, never a fact, and it starts visible only
to that person.

### Scopes

Every record belongs to one scope.

| Scope | Holds | Who may see it |
|---|---|---|
| **Community** | Open channels, courses, events, the community's memories | Its members |
| **Pod** | The pod's room, calls, members and memories | The pod's members, its hosts, the community's builders, and the guide working there |
| **Person** | A member's private talk with the guide, their facts and the guide's memory of them | That person; builders see stated facts and what the person shared |
| **Between members** | Direct messages | The two people only. Never evidence, never memory |

A pod is a community inside the community with its own gate. It sees the
community's scope as well as its own. Nothing leaves a pod unless a builder
publishes it.

**Scope rule:** a memory's scope is the scope of its evidence. Evidence from a
pod supports only a pod memory; a private talk supports only a memory about
that person.

## 3. The canonical system

### 3.1 Records

- **Facts** are the existing tables (channels, interaction roots and replies,
  courses, events, pods, memberships, member facts, presence), each carrying
  its scope.
- **Memories** are one shape across scopes: `scope`, `title`, `body`,
  `authorKind` (`builder`, `guide`), `evidenceRefs`, `revision`, `status`
  (`current`, `superseded`, `removed`), and for a person `visibility` (`only
  them`, `hosts`, `members`). Today's `communityNotes`, `communityPodNotes` and
  the inferred side of `memberFacts` converge on it.
- **Briefs** are stored projections: the latest brief per place, rebuildable.

### 3.2 Operations

Every verb is declared once: its name, its effect (read, draft, write,
destroy, broadcast), the scope it acts in, who may call it, and its approval
rule (none, publish step, or two steps). The page, the guide and the MCP call
the same operation through one executor, with the same checks and one
receipt. The executor today is `polynetCanonicalExecutor` and its five tools;
operations are its `call` verbs.

Agents get five tools forever: `list`, `read`, `search`, `write`, `call`.
Growth means new files and new verbs, never new tools.

The memory write is one operation, `observe`: scope, title, body,
`evidenceRefs`, optionally `supersedes`. It checks that every reference exists,
is live and is in scope; that a guide memory never supersedes a builder's;
that a removed memory is not recreated from the same evidence; and the size
and count limits.

### 3.3 Views: the folder

The folder each lens sees, all drawn from records:

```
/community.md            who the community is, its rules and plans
/handbook.md             the builder's rules for the guide
/memory.md               the community's short memory (capped), with links
/memory/<topic>.md       one memory each, with its sources
/channels/<channel>/     posts and threads; brief.md for the channel
/courses/<course>/       lessons and their resources
/events/                 events, who came
/people/<handle>.md      people facts this lens may see
/pods/<pod>/             a pod: room, calls, members, memory.md, brief.md
/me/memory.md            the person's own memory (their lenses only)
/builder/                builder-only views and records
/places/<place>/brief.md the latest brief for a place
```

A view exists only where the lens may see it. Paths select; they never
authorise.

### 3.4 The harness

One run entry on Pi (`shared/piRuntimeKernel.ts`) for every agent turn,
whatever started it. A run is:

- **who:** the person it acts for, or none (the worker, the guide speaking as
  the community);
- **lens:** what is mounted and which operations are allowed;
- **context:** the guide's identity (`SOUL.md`), the lens's instructions, the
  scope's `memory.md`, the request, and tool descriptions. Nothing else up
  front;
- **model and budget:** one model (`gpt-6-luna`) until cost says otherwise;
  steps, tokens and time are capped per lens;
- **funding:** the owner's, through one admission check and one receipt;
- **ledger:** one run record with its context, calls, cost and outcome.

A person's conversation with the guide is one ongoing session. Older turns
become a written summary plus the recent messages; everything older is
searched when needed.

Wide work fans out: helpers on a small model read and draft; the run applies
their drafts in one checked operation. Helpers never write.

### 3.5 Triggers and the worker

The worker is the guide with no person present. It has nothing of its own:
same records, operations, harness and ledger, through a review lens.

Work is a row per scope and kind (`agentWork`): `pending`, `reviewedThrough`,
`dueAt`, `leaseUntil`, `failures`. Events make it due; a job runs at `dueAt`
for that row only; a daily sweep re-schedules any row whose job was lost.

| Kind | Made due by | When it runs | What it does |
|---|---|---|---|
| **Brief** | A post, reply, join or lesson finished in a place | An hour after the first unreviewed event, so a burst is read once | Rewrites that place's brief |
| **Memory review** | Any evidence in a scope that day | Nightly, at the community's quiet hour | Reads the day; writes, corrects and merges memories with `observe`; rebuilds `memory.md` |
| **Unanswered question** (later) | A question with no reply | After the wait the builder set | Answers in the thread with a cited answer, or hands it to the builder |

A quiet scope costs nothing. AI off means no work rows run.

## 4. The lenses

| Lens | Who it acts for | Mounted | May do |
|---|---|---|---|
| **Member, with the guide** | That member | Community scope as a member sees it; their pods; `/me/` | Answer, propose next steps (buttons), keep their own memory (born "only them") |
| **Builder, with the guide** | That builder | Everything in the community, every pod, `/builder/`, memories with sources | Brief, draft for approval, correct or remove memories |
| **Pod** | A member or host of that pod | The community scope plus that pod | As member or builder, inside the pod; the guide writes only the pod's memory there |
| **The guide in public** | Nobody: speaks as the community | The channel's scope | Reply in the thread when tagged (later: unanswered questions) |
| **The worker** | Nobody | One scope per run | Read freely; `observe`; write briefs. Never posts |
| **A personal agent (MCP)** | Its owner, as member or builder | Exactly that person's lens | That person's verbs; `observe` only proposes a candidate |

Two rules across lenses:

- **A personal agent acts; the guide proposes.** Its owner is present and
  approved it. Nobody watches the guide, so it drafts and a person taps,
  except small reversible things (a reply in a thread).
- **Two steps for anything that destroys or broadcasts,** whoever calls it.

## 5. What people see

- **Right panels:** the place's brief, the next thing, the people, what the
  place knows (the map), what it learned lately. All read from views; nothing
  calls a model when a page opens.
- **What your guide knows (builders):** each memory with its sources and
  author, correct or remove, undo a night.
- **You (each member):** their own memory, each line with its source and
  visibility, change or remove any line.
- **One switch per community,** with the line members also see: "Your guide
  learns from open channels and the pods it works in. Private talks with it
  stay private."

## 6. Ground truth (main at #532, Nov 14)

| Piece | Today | Gap to the end state |
|---|---|---|
| Pi kernel | `shared/piRuntimeKernel.ts` on `pi-agent-core` 1.4.0 | Kept |
| Engines | Two: `runtimeAgentLoop` (the guide in Home and Ask) and `communityAgentServeWorker` (the guide tagged in a channel), each with its own context building, funding calls and ledger | One run entry |
| Run ledgers | `runtimeRuns` + `runtimeRunEvents`; `communityAgentRunEvents` | One |
| Cost and operation receipts | `communityInferenceReceipts`; `polynetCanonicalOperationReceipts` | Kept |
| Principals | `community_agent`, `community_agent_for_member`, `external_mcp`, `community_app`; relation owner, admin, moderator, member | Kept; lenses formalised on top |
| Five tools and the folder | Live: `community.md`, `handbook.md`, `members/`, `channels/`, `events/`, `resources/`, `memory/`, `capabilities/`, `builder/`, `users/me/` | Add `memory.md`, `pods/`, `/me/memory.md`, briefs; rename to the tree above |
| Operations | `call` verbs, each checked in the executor; no declared effect or approval rule | Declared once with effect and approval |
| Context | Card and handbook; three notes pushed into every answer (`communityMemoryRecall`) | `memory.md` plus reads on demand |
| Memories | `communityNotes` (builder only since Nov 5), `communityPodNotes`, `memberFacts` (with consent); no citations, no guide writer | One memory shape and `observe` |
| Pods | In the database; not in the folder | `pods/<pod>/` |
| Background work | The founder brief: a fixed snapshot and one call, on a 15-minute cron; event reminders and mention emails | `agentWork` rows made due by events; the brief becomes a review lens |
| Member sessions | `memberAgentChannels`, `memberAgentEpisodes` | Kept; compaction as above |

## 7. What the leading agents do, and what we take

Researched Nov 14, 2026: Grok Bot and Team Bots (xAI), dots (OpenAI), Muse
(Meta), Instinct, OpenClaw and Hermes (Nous Research).

| What they do | Who | What it means here |
|---|---|---|
| A persistent agent with a name, its own memory and routines | All of them | The guide, one per community |
| What it learns about a person stays between them and the agent; a shared agent "doesn't save anything about you personally for the team" | Grok Team Bots, OpenClaw (`MEMORY.md` never loaded in group chats) | The person scope, and the rule that private talks never feed shared memory |
| Two small files loaded at the start of a session (about 2,200 and 1,375 characters), everything else searched | Hermes (`MEMORY.md`, `USER.md`), OpenClaw (`MEMORY.md`, `USER.md`) | `memory.md` and `/me/memory.md`, capped at those sizes |
| Daily notes, then a background "dreaming" pass that distils them into long-term memory; a diary of each pass for review | OpenClaw (`DREAMS.md`), Instinct (memory updates about a day later) | The nightly review, and a readable record of each night for builders |
| A teammate teaching a shared agent something for everyone becomes a suggestion; the owner or a manager approves it. The owner's own changes apply at once | Grok Team Bots | A member asking the guide, or a personal agent proposing, to remember something for everyone waits for a builder's OK. Learning from shared places goes live with undo |
| Memory from an untrusted source is excluded from automatic context until a trusted reviewer confirms it | OpenClaw (memory provenance) | Evidence references checked by code; content is data |
| Background work uses read-only tools; acting needs a rule | dots ("proactive research" cannot send or change anything) | The worker's lens: read, `observe`, write briefs; nothing else |
| Per-action rules: act, act if asked, ask first, hand off | dots (Custom Rules), Muse (Sentinel approves actions) | Operations declared with an approval rule |
| "Nothing needs attention" is a normal result and is not shown | OpenClaw (`HEARTBEAT_OK`) | A run that finds nothing writes nothing and says nothing |
| "What do you remember about me?", "Forget that" in chat | Grok Bot, OpenClaw | The guide answers these in a member's chat, as well as the You page |
| After it answers in a thread, it follows that thread without being tagged again | Grok Team Bots in Slack | Part of slice "The guide wakes" |
| Memory is not a source of truth; changing facts stay in their system | Grok Bot docs | The facts layers own facts; memories cite them |

Where we deliberately differ: dots' memory cannot be seen or fixed one entry
at a time; ours always can. Grok lets a personal Bot carry private-chat
details into a group unless told not to; ours never does. Grok bills the
person answered; here the owner pays (decided Nov 12).

## 8. The plan

Each slice ships to staging, then Neil's acceptance. Each one that moves
something onto the new system deletes the old path in the same slice.

1. **The run entry and community memory.** One run entry on Pi with lens,
   mount, funding and one ledger. `agentWork` rows, made due by events. The
   memory shape, `observe`, and the nightly memory review for the community
   scope (open channels only). `memory.md` (capped at about 2,200
   characters) replaces the three pushed notes. Memories go live at once; a
   builder can undo one memory or a whole night, and reads each night's
   record (what was added, changed and why). A night that finds nothing
   writes nothing. Members see the titles in "Learned lately" on Home and
   nothing else. *Acceptance:* a week on the seeded staging community; Neil
   keeps most of what was learned; twenty fixed questions answered better.
2. **Each member's own memory.** Moved up from fifth: it is what every
   leading agent is built around. The guide writes to `/me/memory.md`
   (capped at about 1,375 characters) during a member's talk when they ask
   or when something is clearly worth keeping, and a nightly review per
   member tidies it. It is loaded at the start of every talk with that
   member. "What do you remember about me?" and "Forget that" work in chat;
   the You page shows each line with its source. Visible only to the member
   until they share it. When a member asks the guide to remember something
   for everyone, it becomes a suggestion a builder approves or rejects.
3. **Briefs.** Brief work per place; Home's and channels' right panels read
   them. The founder brief moves onto the run entry and its old pipeline is
   deleted.
4. **Pods.** `pods/<pod>/` in the folder; pod lens; pod memory review and
   briefs; the pod panels (landing page, inside a pod).
5. **One engine.** The tagged guide (serve worker) and then the member's
   session (turn loop) move onto the run entry; their engines and ledgers are
   deleted.
6. **Operations declared.** Every verb with its effect and approval rule;
   two steps for destroy and broadcast; the builder's activity page.
7. **The guide wakes.** Unanswered questions answered with sources, behind
   the builder's dial; after answering in a thread it follows that thread
   without being tagged again.
8. **Personal agents.** Parity verbs; what their `observe` proposes for
   everyone goes into the same approval list as slice 2.
9. **Calls.** Transcripts as evidence, with consent.
10. **The map**, drawn from memories and their evidence, on Knowledge, Home
    and pods, with "Learned lately" under it.

## 9. Tests the system must always pass

- Evidence outside a run's scope is never mounted and never accepted by
  `observe`.
- Direct messages between members are never read by any lens but theirs.
- A guide memory never overwrites a builder's.
- A removed memory is not recreated from the same evidence.
- A retried job writes once.
- With AI off, no work runs and nothing about the guide is shown.
- Text in a post that reads like an instruction changes nothing but what a
  memory says about it.
- A personal agent can do exactly what its person can, and nothing more.

## 10. Decided (Neil, Nov 14)

1. **Memories go live straight away, with undo.** For memories the guide
   draws from what was said in a shared place.
2. **Members see only what was just learned:** the titles in "Learned
   lately" under the map in a place's right panel. Nothing more.
3. **The guide keeps a memory of each member** from their private talk,
   visible only to them until they share it, as personal agents do.

## 11. Not in this end state

Other channels into the guide (text, email, voice); anything across
communities; the guide posting new top-level messages; any agent touching
prices, refunds or payouts.

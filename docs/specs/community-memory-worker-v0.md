# Community memory (v0 spec)

Status: draft for Neil's review, 2026-11-14. Nothing is built. Third version:
rewritten to follow Distribution Engineer's context and ontology model
(`docs/architecture/ledger-contract.md`, `context-directories.md`,
`agent-context-policy.md`, `end-state.md` in that repo), which is better than
the two drafts before it.

## The model, taken from Distribution Engineer

1. **The database owns facts; files are views.** The agent sees memory as
   Markdown files, but each file is drawn from records on every read. There is
   no second store of pages. Indexes, briefs and the map are rebuildable
   projections, never the truth.
2. **Evidence and observations are different things.** Evidence is what was
   said, kept as it was said (posts, a private talk, a call transcript, a
   lesson). An observation is the guide's reading of evidence, and it cites
   the evidence it came from. Code checks every citation.
3. **One fact, one home.** Each kind of knowledge has exactly one record type.
4. **The agent's notes sit beside people's, never over them.** A builder's
   words outrank the guide's. The guide can add its own note next to a
   builder's, never replace it.
5. **Retrieval first.** A turn starts small: who the guide is, its lens, the
   community's short memory file and a few tools. Everything else is read on
   demand through the five tools (list, read, search, write, call). No
   automatic stuffing of notes into the prompt.
6. **One agent, many lenses.** The guide answering a member, the guide
   briefing a builder and the guide reviewing a day are the same agent with a
   different model, tool ceiling and budget. Lenses never fork memory.
7. **Triggers, not a heartbeat.** Polynet owns every event that matters (a
   post, a reply, a lesson finished, a person joining), so nothing polls. An
   event marks a review as due; the review runs once its inputs settle.
8. **Sub-agents read and draft; the lead applies in one checked step.**

## Three layers (Neil, Nov 14)

Polynet is simpler than Distribution Engineer: three layers, each a set of
living Markdown files drawn from records.

| Layer | What it holds | Who writes it |
|---|---|---|
| **Community facts** | What exists and what happened: channels, pods, courses and lessons, events and who came, posts and replies, calls, joins and leaves | Recorded as it happens; builders create what exists |
| **People facts** | Who each person is here: their role (owner, host, member), name, bio, linked accounts, plan, when they joined, what they said about themselves | Recorded, or stated by the person or a builder |
| **Memories** | What the facts mean: what the community has settled, gaps, what each pod knows, the guide's picture of a person, and the briefs | The guide, citing facts; a builder's words outrank the guide's |

The line between facts and memories: a fact was recorded or stated by a
person; a memory is the guide's reading of facts and always cites them. A
guess about a person ("good at onboarding calls") is a memory, born "Only
you", never a fact.

**Pods are a community inside the community, with their own gate.** A pod
has its own facts (its room, its calls, its members) and its own memories,
and sees the outer community's facts and memories too. Nothing flows out of a
pod except what a builder publishes on purpose.

## Every agent works this way

The same harness, folder and five tools for every surface. The lens decides
what is mounted and which writes are allowed; nothing else differs.

| Surface | Today | Change |
|---|---|---|
| The guide answering a member (dock, Ask) | `runtimeAgentLoop`; community card and handbook, plus three notes pushed into every turn | Card, handbook and `memory.md`; the rest read on demand |
| The guide tagged in a channel | `communityAgentServeWorker`, a second engine; card and handbook | The same harness as above (the gateway spec's one engine) |
| A builder's own AI over MCP | Five tools, builder paths | Unchanged, plus `observe` |
| A member's own AI over MCP | Five tools, member paths | Unchanged; `observe` only proposes |
| The founder's brief | Not an agent: a fixed JSON snapshot and one call | A review lens of the same guide, writing `places/community/brief.md` |
| The memory review | Does not exist | A review lens; `observe` is its only write |
| Pods | Pod notes exist in the database but are not in the folder | `pods/<pod>/` in the folder: mounted for that pod's members and the guide working there, on top of the community's own folder |

## What this changes in Polynet

| Today in Polynet | Change |
|---|---|
| `communityNotes`: title and body, no citations, no author kind, one revision | Becomes an observation record: `scope`, `authorKind` (`builder`, `guide`), `evidenceRefs`, `revision`, `status` (`current`, `superseded`, `removed`) |
| `communityPodNotes`, `memberFacts` | The same observation shape, scoped to a pod and to a person. `memberFacts` already has provenance and consent; it gains `evidenceRefs` checked by code |
| The guide gets three notes stuffed into each turn | Replaced by a small `memory.md` view plus reads on demand. DE forbids automatic memory injection, for good reason |
| `memory/*.md` already exists as a virtual folder behind the five tools | Keep. It is DE's read router. Extend it with the views below |
| Nothing writes observations except builders | The guide writes through one checked operation |
| The founder brief's 15-minute polling clock | Not used. Each community has a review row whose `dueAt` is set by events |

## The ontology

```
community
  place: open channel | pod | a person's private talk with the guide
    evidence: post, reply, private message to the guide, call transcript
  course > lesson (builder's words: evidence, most trusted)
  person (member)
  observation (guide or builder), scoped to one place or person,
    citing evidence from that same scope
  projection: brief, memory.md, index, map, learned lately (rebuilt, never stored as truth)
```

**Scope rule, enforced in the write operation:** an observation's scope is
the scope of its evidence. Evidence from a pod can only support a pod
observation; a private talk only a fact about that person (born "Only you");
direct messages between members are never evidence.

## The files the guide sees (all drawn from records)

- `memory.md`: the community's short memory, a capped list of what matters
  most, with links. Loaded at the start of every turn. Rebuilt from
  observations, not hand-kept.
- `memory/<topic>.md`: one observation each, with its sources.
- `pods/<pod>/memory.md`, `people/me/memory.md`: the same, per scope, mounted
  only for those allowed.
- `places/<place>/brief.md`: the latest brief for a place.

## How the guide writes

One operation, `observe`, the same for the guide, a builder's own AI over the
MCP, and (later) a member's agent proposing a candidate:

- input: scope, title, body, `evidenceRefs`, optionally `supersedes`;
- code checks: every ref exists, is live, and is in the scope; a guide
  observation never supersedes a builder's; a removed observation is not
  recreated from the same evidence; a cap per review; size limits;
- writes a new revision, a receipt, and marks the scope's views stale.

## How reviews run

`communityMemoryReviews`, one row per scope (the community, each pod, each
person), modelled on DE's `crisMemoryReviews`:

- `pending` (evidence since the last review), `reviewedThrough`, `dueAt`,
  `leaseUntil`, `failures`.
- A new post in an open channel bumps the community row's `pending` and sets
  `dueAt` if unset. When a review is due depends on its kind:
  - **Brief:** due an hour after the first unreviewed post, so a burst is
    read once. A quiet place keeps its last brief.
  - **Consolidation:** due nightly at the community's quiet hour, if the day
    had evidence. It reads the day, writes and supersedes observations,
    merges duplicates, and rebuilds `memory.md`.
- A Convex job is scheduled at `dueAt` for that row only. A daily sweep
  re-schedules any row whose job was lost.

Inside a review the guide uses the five tools on its mounted scope, with a
review lens: read and search freely, `observe` as its only write. For a busy
day it may fan out to sub-agents that read slices and draft; the review
applies their drafts in one step.

## Slice 1: the community remembers

Open channels only. Community scope only.

1. `communityNotes` gains the observation fields; existing notes become
   `authorKind: builder`.
2. The `observe` operation with its checks and receipt.
3. `communityMemoryReviews` for the community scope, set due by new posts in
   open channels; the nightly consolidation review.
4. `memory.md` as a rebuilt view; the guide loads it instead of the three
   stuffed notes.
5. *What your guide knows*: each observation shows its sources and author;
   builders can remove or correct. *Home*: "Learned lately".
6. One setting and its line for members: "Your guide learns from open
   channels. Private talks with it stay private."

**Tests:** evidence from a pod, a private talk or a DM is refused; a guide
observation cannot supersede a builder's; a removed observation is not
recreated from the same evidence; a retried review writes once; with AI off
nothing runs; text in a post that reads like an instruction changes nothing.

**Acceptance:** a week on the seeded staging community; Neil keeps most of
what was learned; twenty fixed questions are answered better than before.

## Later slices

2. Briefs per place (`brief.md`), on the hourly trigger; the right panels.
3. Pods: the same review and views per pod.
4. People: facts from a member's private talk, born "Only you"; the You page.
5. The map, drawn from observations and their evidence.
6. Candidates from personal agents through `observe`; call transcripts as
   evidence, with consent.

## Decisions for Neil

1. Observations go live straight away with undo (recommended), or wait for a
   builder's OK.
2. Do members see the titles of what was learned? Recommended: yes, and a
   click asks the guide.

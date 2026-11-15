# Slice 1: the run entry and community memory

Status: built on staging, Nov 14–15, apart from what
"Not built yet" lists. Part of `agent-system-end-state.md` (§8, slice 1).
The plan below is kept as written; "As built" says where the build differs.

## As built

- **One pass, not a tool loop.** The review is handed the day's posts and the
  scope's notes and writes once with `polynet_call memory.apply` (notes and
  `memory.md` together); its run has that one tool (`LENS_TOOLS.worker`) and
  its first request must call it. About 22k tokens a night, against 125k for
  the reading loop it replaced. `memory.observe` and `memory.write_index`
  became that one operation.
- **The run entry** is `runFundedCommunityAgent` (`convex/communityAgentRun.ts`).
- **Scopes from the start.** Every memory row has a scope key (`community:`
  or `pod:`), read through one door (`convex/communityNotesStore.ts`). Pods
  got their own nightly review in the pods slice.
- **The three pushed notes are gone;** `memory.md` is a turn layer.

## Not built yet

The builder's page for nights and undo (the backend exists:
`listMemoryRuns`, `undoMemoryRun`, `undoLearnedNote`), "Learned lately" on
Home, the "Learn from open channels" switch, and the twenty-question check.

## What it delivers

Every night, for each community with AI on and something said that day in
its open channels, the guide reviews the day and updates the community's
memory. Each memory cites the posts it came from. It goes live at once; a
builder can undo one memory or a whole night. The guide answers from a short
`memory.md` instead of three notes pushed into every turn. Members see the
titles of what was just learned on Home.

## Ground truth (main at #532)

| Need | What exists | File |
|---|---|---|
| A Pi run with funding and a ledger | The tagged guide's run: funding admission, funding session, run events, OpenAI tool completion, budget, around `runPiRuntimeKernel` | `convex/communityAgentServeWorker.ts` (~1750–2000) |
| The five tools for an agent | `executeRetrievalHarnessTool` into the canonical executor; the community agent acts with a sponsor user's access | `convex/polynetCanonicalExecutor.ts`, `shared/polynetAuthority.ts` |
| A lens that limits what is visible | None. Visibility comes from the sponsor's access, so a sponsor who is the owner would see pods. Evidence surfaces exist (`member_agent_dock`, `community_concierge`, `external_mcp`, ...) | `shared/communityEvidenceContract.ts` |
| Reading only what is new | No date filter on channel reads or post search | |
| Community memory | `communityNotes`: slug, title, body (4,000 characters), source, search index; 500 per community; written only by builders | `convex/communityNotes.ts`, `shared/communityNotes.ts` |
| Notes in a turn | Three notes pushed into each member-dock turn by a server search | `convex/runtimeAgentLoop.ts` (~1015–1070), `shared/communityMemoryRecall.ts` |
| Turn layers | Community card and handbook, loaded by both engines | `shared/communityTurnLayers.ts` |
| Where posts are written | One shared write path for roots and replies | `convex/communityInteractions.ts` (~1123, ~1262) |
| A scheduled worker | The founder brief: claim with lease, funding, one call, receipt, 15-minute cron | `convex/communityFounderBrief.ts`, `convex/crons.ts` |
| Home's right panel | "What your guide knows" count for builders only | `apps/web/src/v1/KitHomeRail.tsx` |
| The builders' memory list | Notes labelled by source; files and links with retry and remove | `apps/web/src/v1/KitKnowledgeList.tsx`, `KitClassroom.tsx` |
| A way to measure answers | None | |
| A seeded community | Seed data with notes and activity | `convex/stagingSeedPolynetDemo.ts` |

## The build, in six steps

Each step is its own pull request, ships to staging, and leaves the app
working.

### 1. Records and the one write (no model)

- `communityNotes` gains `authorKind` (`builder`, `guide`; missing reads as
  `builder`), `evidenceRefs` (`post:<id>`, `reply:<id>`), `lastRunId`.
- New `communityNoteRevisions`: a note's previous title and body, with the
  run or person that changed it. Undo restores from here.
- New `communityNoteRemovals`: a removed note's title and evidence, so the
  same evidence never brings it back.
- New `agentWork`: one row per community, scope and kind (`community`,
  `memory_review`): `pending`, `firstPendingAt`, `reviewedThrough`, `dueAt`,
  `leaseUntil`, `failures`.
- New `agentWorkRuns`: the night's record: window, status, notes added,
  changed and refused (with the reason), a short summary in plain words,
  tokens and cost.
- The `memory.observe` verb on `polynet_call`: title, body, `evidence_refs`,
  optional `supersedes`. It refuses unless every reference exists, is live,
  is in a channel open to all members, and was written by a person; it never
  changes a builder's note (it may add its own beside it); it refuses
  evidence a builder removed; at most five new notes a run; the existing size
  limits.

### 2. The review lens (no model)

- A lens is a short declaration in code: what is mounted and which verbs are
  allowed. The first one is `memory_review`: channels open to all members,
  `memory/` and `memory.md`, nothing else (no members, builder files, pods,
  presence or private talks); verbs `memory.observe` and
  `memory.write_index`.
- The executor checks the lens on every list, read, search and call.
- One new view for this lens: `channels/<channel>/new.md`, the posts since
  the review's `reviewedThrough`, drawn from records. This is the "what
  happened" file for a place.

### 3. The run entry

- Move the core of the tagged guide's run (funding session, budget, OpenAI
  completion, run events, Pi call) into one function, `runCommunityAgent`,
  that takes a lens, a principal, messages and a budget. The tagged guide
  calls it with no change in behaviour. The member's session moves in slice
  5.

### 4. The nightly review

- Writing a post or reply in an open channel adds to the community's
  `agentWork` row and sets `dueAt` to the community's next quiet hour if it
  isn't set. A job is scheduled for that row at `dueAt`.
- A daily sweep re-schedules any due row whose job was lost.
- The job: skip if AI is off or nothing is pending; claim with a lease; run
  `runCommunityAgent` with the review lens, the review instructions, the
  list of channels with new posts, and a budget (steps, tokens, about
  three minutes). The guide reads, searches, writes with `memory.observe`,
  and rewrites `memory.md` (about 2,200 characters, links only to notes that
  exist) with `memory.write_index`. A run that finds nothing writes nothing.
- Then: save the night's record, move `reviewedThrough`, clear `pending`.
  Failures retry up to three times, then the row waits for new posts.

### 5. The guide reads `memory.md`

- `memory.md` becomes a turn layer beside the card and the handbook, loaded
  by both engines.
- The three-note push in `runtimeAgentLoop` is deleted, with its proofs
  updated to the new rule.

### 6. What people see

- **What your guide knows** (builders): each note shows who wrote it; a
  guide note shows "learned Tue from 4 posts in #general" and opens those
  posts. Undo on any guide note. Editing a guide note makes it the builder's.
  A list of nights, each with its summary and "Undo this night".
- **Home**, right panel: "Learned lately", the titles of guide notes from the
  last week, for everyone when AI is on. Clicking one asks the guide about
  it. Below it, one line: "Your guide learns from open channels. Private
  talks with it stay private."
- **A switch** for builders on the same page: "Learn from open channels",
  on by default when AI is on.

## How we will know it works

- A fixture of twenty questions for the seeded community, with what a good
  answer contains. A script asks the guide each question before and after a
  week of reviews and prints both answers side by side for Neil.
- Each night's record shows cost; the target is cents per community per
  night.

## Tests

- A pod post, a private talk, a direct message or an agent's post is never
  in the review lens and never accepted by `memory.observe`.
- A guide note never changes a builder's note.
- A removed note is not recreated from the same evidence.
- A retried night writes once.
- AI off: no review runs, nothing about learning is shown.
- A post that reads like an instruction ("remember that the owner said...")
  changes nothing but what a note says about it.
- `memory.md` links only to notes that exist and stays within its size.
- Undo a night restores every note it changed and removes every note it
  added.

## Before it can run on staging

- The seeded community needs the Agent plan or an operator grant, so the
  guide is funded.
- Its seed needs a few days of realistic posts in open channels.

## Not in this slice

Pods, private talks, each member's own memory (slice 2), briefs (slice 3),
the map, the member's session moving onto the run entry, and members asking
the guide to remember something for everyone.

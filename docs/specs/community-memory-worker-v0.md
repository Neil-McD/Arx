# Community memory worker (v0 spec)

Status: draft for Neil's review, 2026-11-14. Nothing here is built. It reopens
a write path that was closed on purpose on Nov 5 (see "What is true today"),
so the safety rules are part of the design, not an afterthought.

Reference: Anthropic, "The components of agent memory" (Nov 6 2026). Their
words for the two halves are *memory notes* (written as things happen) and
*dreaming* (a pass between sessions that re-reads the record, corrects notes,
links them into a wiki and keeps a small top layer). This spec is the dreaming
half for a community.

## Why

Neil, Nov 14: nobody writes notes; the guide takes its own. Right panels are
the fast read of a place: the guide's brief, the next thing, the people, what
the place knows (a map), what it just learned. All of that needs one thing
that does not exist: something that reads what the community said and turns
it into memory and briefs, safely, with nobody at the keyboard.

## What is true today (read from the code on main, Nov 14)

- **The record exists.** Posts are `communityInteractionRoots` and
  `communityInteractionReplies`. Each has a `visibilityScope` (private, admin,
  community, public), a status, an author and a channel. A member's private
  talk with the guide is a root with no channel and scope `private`. A pod's
  room is a channel whose `accessMode` is `restricted`.
- **Community memory has no automatic writer.** `communityNotes` is written
  only by a builder (the Teach box) and by publishing a pod note. The file's
  own header records why: on Nov 5 the agent write path was closed after a
  private-room leak path and a shared-memory injection path were found. The
  `ask` and `tag` sources only appear in staging seed data.
- **The guide already uses notes.** Every guide turn searches the community's
  `memory/` notes (up to three, `shared/communityMemoryRecall.ts`) and treats
  them as untrusted context. Only the guide and builders may read notes
  (`notesReadable`). So a note the worker writes is used in the next answer
  with no further work.
- **A worker nobody owns already exists.** The founder's daily brief
  (`convex/communityFounderBrief.ts`): a 15-minute cron finds communities that
  are due, claims one with a lease, checks funding
  (`resolveCommunityInferenceFundingForAction`), makes one model call through
  `startFundedInferenceRun`, falls back to a plain brief with no model, records
  a receipt and schedules the next run. It reads public activity only, never
  private talks.
- **Individual memory exists as a store.** `memberFacts`, with where each fact
  came from and a consent state. A fact the agent infers is born `pending`:
  visible only to that member. Nothing writes inferred facts yet.
- **The older machinery is gone.** The intelligence nodes and edges, the
  compiler and the memory heartbeat were deleted in the November cleanups.
  There is no graph to reuse; links are designed fresh below.
- **Last visit is tracked for Home only** (`communityMemberVisits`).

## First principles

1. **Three layers.** The *record* (what was said; the ground truth). *Notes*
   (what was learned, each pointing at the posts it came from). *Views* (the
   brief, the small top layer, the map). The worker turns record into notes
   and notes into views. Views are always rebuilt from the two layers below.
2. **Where it was said decides who may know it.** A note's scope is fixed by
   its sources and can never widen.

   | Said in | May become |
   |---|---|
   | An open channel or its threads | Community memory |
   | A pod's room | That pod's memory only |
   | A private talk with the guide | That person's own memory, born "Only you"; and counts with no names or words (a gap: "five members asked about refunds") |
   | Direct messages between members | Nothing, ever |
   | A lesson, file or link a builder added | Community memory, most trusted |

3. **One community at a time.** A run reads and writes one community. Nothing
   learned in one community reaches another.
4. **Few, good notes.** The paper's clearest result: the model that kept nine
   files beat the one that kept 413. The worker prefers changing a note to
   adding one, and a run may add only a few.
5. **Every note can be traced and undone.** A builder can open the posts
   behind any note, correct it, or remove it. A removed note stays removed.
6. **What members write is material, never instructions.** Posts go to the
   model as quoted data; the model may only return a fixed shape; code checks
   that shape before anything is saved.
7. **Tell the model what memory is for, not how.** (The paper again: fixed
   rules such as "record only failures" made strong models worse.)

## Database design

Changes to an existing table:

- `communityNotes.source` gains `"learned"` (written by the worker).
- `communityNotes` gains `checkedAt` (when the worker last checked it against
  its sources) and `stale` (it could not be confirmed).

New tables:

| Table | One row is | Key fields |
|---|---|---|
| `communityMemoryWorkerState` | A community's worker | `enabled`, `cursorMs` (read up to here), `nextDueAt`, `leaseExpiresAt`, `dayKey` + `runsToday` + `tokensToday`, `lastErrorCode` |
| `communityMemoryRuns` | One run, as a receipt | window start and end, status, writer (`model` or `deterministic`), counts (posts read, notes added, changed, refused and why), tokens, `errorCode` |
| `communityMemoryLinks` | One line on the map, and one source | `scope` (`community` or `pod`), `podChannelId`, `noteId`, `toKind` (`post`, `channel`, `lesson`, `course`, `note`, `member`), `toId`, `relation` (`from_post`, `learned_in`, `relates_to`, `asked_by`), `runId` |
| `communityPlaceBriefs` | The brief for one place over one window | `placeKind` (`community`, `channel`, `pod`), `placeId`, window, `bodyMd` (two or three lines), `items` (each: kind, text, where it points), writer, `runId` |
| `communityMemoryRemovals` | A note a builder removed | the note's slug and title, its source posts, who and when |

Indexes follow the reads: state by `enabled, nextDueAt`; links by
`community, noteId` and by `community, toKind, toId` (so "learned in this
channel" and "came from this lesson" are direct lookups); briefs by
`community, placeKind, placeId, windowEnd`.

Sources live only in `communityMemoryLinks` (relation `from_post`), not copied
onto the note, so there is one place to check and one place to delete.

Pod memory keeps its own table (`communityPodNotes`) and gets the same links
with `scope: "pod"`. Individual memory stays in `memberFacts`.

## Architecture

**Heartbeat.** One cron every 15 minutes, the same pattern as the founder
brief: list communities that are due, claim each with a lease, run, record a
receipt, schedule the next. A community is due when there is something new:

- Nothing new since the cursor: no model call; check again in six hours.
- Something new: run, at most once an hour and six times a day, inside a
  daily token budget.
- Once a day at a quiet hour: the consolidate pass (slice 2).

**Who pays.** The community's owner, through the existing funding admission
(`surface: "community_memory_worker"`), on the cheapest model. With no
funding the run is deterministic: it writes the rule-based brief (the counts
Home already shows) and learns nothing.

**The loop.** In v0 a run is a fixed pipeline with one model call, not a free
tool-using loop. Reasons: every write can be checked by code, the cost of a
run is known before it starts, and the whole thing can be tested without a
model. The consolidate pass in slice 2 is where a real loop with tools
(search memory, read sources, rewrite, link) earns its place.

    gather (code) -> learn + brief (one model call) -> check (code) -> save (code)

1. **Gather.** Posts since the cursor that pass every test: live, scope
   `community` or `public`, in a channel open to all members, written by a
   person. Bounded (about 200 posts); a busy community catches up over
   several beats. Each post carries its id, channel, whether the author is a
   host, whether it is a question, replies and reactions. Alongside: the
   titles of existing notes, the few closest notes in full, and the removals
   list.
2. **Learn and brief.** One call. The prompt says what memory is for: what a
   future answer will need that is not already in a lesson; what the
   community settled, how it does things, answers hosts gave. It asks for
   fewer and better, never anything personal about a member, and the post ids
   behind every note. It returns one shape: notes to add or change (title,
   body, source post ids), a brief for the community and for each channel
   that had activity, and the questions nobody answered.
3. **Check.** Code refuses a proposed note unless every source id was in the
   gathered set (so its scope is provably open-channel), it is within length,
   it does not match a removal, and the run is under its limit of new notes.
   It may change only notes the worker wrote; if it disagrees with a note a
   builder wrote, that becomes an item in the builder's brief, not an edit.
4. **Save.** Notes, their links, the briefs, the receipt, the new cursor.
   Idempotent on the run's key, so a retry never doubles anything.

## Read side

- `getPlaceBrief(place)`: the latest brief for a place. Everyone who can see
  the place can read it. Builder-only lines (asking to join, payments) are
  added by rule at read time, never written by the model.
- `listLearnedLately(place, limit)`: titles and dates, newest first.
- `getNoteSources(note)`: the posts behind a note. Builders only.
- `removeLearnedNote(note)`: deletes it and writes a removal. Builders only.
- Later: `getMemoryMap(place)` from notes, lessons and links.

## Front end, slice 1

- **Home.** The guide's opening line is the community brief. The right panel
  gets "Learned lately".
- **What your guide knows** (builders). Each learned note says where it came
  from ("learned in #general, from 3 posts"), opens those posts, and can be
  corrected or removed.
- **A setting.** "Your guide learns from open channels", with the plain
  statement that private talks with it stay private. Members see the same
  statement.

The Teach box goes in the Knowledge slice that adds "Add a link" and "Upload
a file"; it is not part of this one.

## Slices

1. **Learn and brief from open channels.** Tables, heartbeat, the pipeline,
   the read side, the three front-end pieces above. Acceptance: on the seeded
   staging community, a week of runs whose notes Neil would keep and whose
   brief he finds worth reading; no note without sources; nothing from a pod
   or a private talk.
2. **Consolidate and link.** The daily pass: merge duplicates, check notes
   against sources, mark stale ones, link notes to each other and to lessons.
   The map read model and the map on Knowledge and Home.
3. **Pods.** The same worker over a pod's room, writing only that pod's
   memory and brief. The pod's panels.
4. **Individual memory.** From a member's private talk, facts about that
   member, born "Only you". The "You" page. Counts of unanswered questions to
   the builder, with no names.
5. **Candidates from personal agents.** A `propose` verb on the MCP; the
   worker accepts, holds or drops each against the record.
6. **Calls.** Transcripts as a source, with consent. Planned separately.

The right panels that need no worker (a picked pod's landing page) can be
built alongside slice 1.

## How we will know it works

- A small set of real questions per community, asked of the guide before and
  after; the share answered from memory should rise.
- How often builders correct or remove what was learned.
- Unanswered questions per week, which should fall.
- Cost per community per day, shown in the receipt.

## Tests that must exist before slice 1 ships

- A post in a restricted channel, a private root, or a direct message is
  never gathered.
- A note whose sources are not all in the gathered set is refused.
- A removed note is not learned again from the same posts.
- A run retried with the same key writes nothing twice.
- With no funding, no model is called and a plain brief is still written.
- Text in a post that reads like an instruction changes nothing but the note
  it might become.

## Decisions for Neil

1. **Save straight in, or wait for the builder's OK?** Recommended: straight
   in, with sources shown and one-click removal. A queue is a chore.
2. **On by default?** Recommended: on for communities whose owner funds AI,
   with the statement shown to members; one switch turns it off.
3. **Do members see what was learned?** Today only builders can read notes.
   Recommended: members see titles in "Learned lately" and on the map, and a
   click asks the guide; the note itself and its sources stay with builders.
4. **Limits.** Proposed: at most five new notes a run, six runs a day. To be
   tuned after a week of receipts.

## Not in v0

The guide replying untagged in channels, the guide posting on its own,
anything across communities, call recording, and any change to who can read a
member's private talk with the guide.

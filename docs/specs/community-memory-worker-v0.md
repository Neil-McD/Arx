# Community memory worker (v0 spec)

Status: draft for Neil's review, 2026-11-14. Nothing is built. Rewritten after
Neil asked to design from first principles instead of from the codebase.

## The design

Taken from the best known shape for agent memory (Anthropic, "The components
of agent memory", Nov 2026), then checked against our code.

1. **Memory is a folder of linked pages.** One folder per scope: the
   community, each pod, each person. Each folder has a short `index.md` (what
   it knows and where) and topic pages that link to each other and cite the
   posts they came from. The node map is that link graph.
2. **One agent per community.** Its own schedule, budget and folders.
3. **It dreams at night.** Once a night, at the community's quiet hour, if
   anything was said that day: it re-reads the day and edits its pages (adds,
   corrects, merges, links, keeps the index small).
4. **Scope is what is mounted.** A run can only see the record and the folder
   of its scope. Nothing else is there to leak.
5. **A gate on the way out.** The agent edits a staged copy. A checker
   reviews each changed page; it is committed or thrown away. Each night is
   one commit a builder can see and undo.
6. **At answer time** the guide loads the index and searches the pages.

## The codebase, challenged

| Today | Verdict |
|---|---|
| The five tools (list, read, search, write, call) already show a community as a folder: notes are `memory/*.md` | **Keep.** It is the agent's interface to memory. The worker uses the same five tools as every other agent. |
| `communityNotes` (slug, title, markdown, search index) | **Keep as page storage.** What is wrong is around it: no writer, no history, no index, no citations. |
| No agent writer since Nov 5 | **Replace with the gate,** which is what the Nov 5 closure was missing. |
| The founder brief's fixed one-call pipeline | **Not the model.** Thinking runs in an agent loop (Pi, `shared/piRuntimeKernel.ts`); the database holds the record and the commit. |
| A typed table of links | **Drop.** Links live in the pages as markdown; the map is read from them. |
| The guide's recall: three notes per answer | **Change:** index first, then search. |
| One shared clock polling for due communities | **Drop.** Each community schedules its own next run (Convex `runAt`); one daily sweep only repairs a broken chain. |

Runs on OpenAI (gpt-6-luna), paid by the owner, only when the owner's AI is
on. Anthropic's hosted agents would add a second AI company, against the
Oct 27 decision.

## Slice 1: the community remembers

Open channels only, one scope (the community folder), nightly.

**Data**

- `communityNotes` gains `kind` (`index` or `page`), `writer` (`worker` or
  `builder`), `lastCommitId`.
- New `communityMemoryCommits`: one row a night: status (`committed`,
  `partly`, `dropped`), pages changed, each refused page and why, tokens,
  timestamps.
- New `communityMemoryPageVersions`: a page's body before each commit, so a
  commit or one page can be undone.
- New `communityMemorySchedule`: one row per community: `nextRunAt`,
  `quietHour`, `enabled`, last error.

**The run** (a Convex action, under ten minutes)

1. Mount, in code: the day's live posts in channels open to all members, as a
   read-only record; the community folder as a staged copy.
2. Agent loop on Pi with list, read, search on both, and write on the staged
   copy only. A step and token budget per run. The prompt says what memory is
   for, not how to keep it.
3. Gate, in code, per changed page: every citation is a post from the mount;
   nothing that names or describes a member beyond what they posted publicly;
   size limits; pages a builder wrote are not overwritten (the change becomes
   a suggestion in the builder's view); a page a builder removed is not
   recreated from the same posts.
4. Commit: save passed pages, their old versions, the commit row, and
   schedule tomorrow.

**The guide** loads `index.md` (bounded) into every answer, then searches
pages as today.

**Front end**

- *What your guide knows* (builders): pages with "learned last night from 4
  posts in #general", the posts behind each, undo a page, undo a night.
  Suggestions on builder-written pages.
- *Home* right panel: "Learned lately", the titles committed in the last
  week.
- One setting, with the line members also see: "Your guide learns from open
  channels. Private talks with it stay private."

**Tests before it ships**

- A pod, a private talk or a direct message is never in the mount.
- A page citing a post outside the mount is refused.
- A removed page is not recreated from the same posts.
- A run retried for the same night commits once.
- With AI off, nothing runs.
- A post that reads like an instruction changes nothing but what the page
  says about it.

**Acceptance:** a week on the seeded staging community; Neil keeps most of
what was learned; a fixed set of twenty questions is answered better from
memory than before.

## Later slices

2. **Briefs:** written when someone opens a place and its brief is stale;
   panels show brief and next thing.
3. **Pods:** the same run per pod, into the pod's folder.
4. **People:** from a member's private talk, into their own folder, born
   "Only you"; the You page.
5. **The map:** drawn from the links in the pages, on Knowledge, Home and pods.
6. **Candidates from personal agents** (a propose verb on the MCP) and
   **calls** (transcripts, with consent).

## Decisions for Neil

1. **Commit straight in, with undo** (recommended), or hold each night for the
   builder's OK.
2. **Do members see what was learned?** Today only builders read notes.
   Recommended: titles in "Learned lately"; a click asks the guide.

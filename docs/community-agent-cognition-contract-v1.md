# Community Agent Cognition Contract v1

Status: planned architecture
Scope: product architecture, memory system, community agent loop
Last updated: 2026-07-01 (Amendment v1.1 appended)

## Purpose

This document captures the product architecture direction for Polynet's next collective intelligence system.

The core idea:

> Members act through personal agents. Communities learn through community agents.

This document defines the intended architecture for community cognition, memory compilation, and future workflow improvement. It is not an inventory of the current implementation. Current code must be evaluated against this contract, not the other way around.

## Irreducible System

Polynet is trying to answer one question:

> How can one member's useful experience improve another member's future outcome?

The smallest complete loop is:

```txt
Action
  -> Trace
  -> Candidate
  -> Approved Intelligence
  -> Retrieval
  -> Outcome
  -> Update
```

Every requirement should justify itself against that loop.

The irreducible components:

1. Action surface
   - members and personal agents do useful work
   - workflows produce artifacts, decisions, attempts, failures, and outcomes

2. Trace layer
   - records permissioned evidence of what happened
   - preserves provenance and visibility
   - most traces should die instead of becoming memory

3. Compiler
   - transforms traces into candidate reusable intelligence
   - detects signal, novelty, failures, contradictions, and repeated questions
   - proposes candidates, not truth

4. Policy decision gate
   - blocks leakage, hallucination, low-signal claims, and false consensus
   - decides what can become community intelligence

5. Community intelligence directory
   - stores accepted reusable knowledge
   - visible, editable, inspectable, and linked to evidence

6. Retrieval layer
   - injects the right accepted intelligence into the current workflow
   - sometimes retrieves nothing

7. Outcome layer
   - measures whether retrieved intelligence helped
   - updates confidence, status, and future retrieval

Everything else is UI, orchestration, governance, or optimization.

## Implementation Posture

The current repo should not define the architecture. Existing implementation can be reused only where it serves the irreducible loop cleanly.

Treat current archive, feed, vector, and retrieval surfaces as replaceable unless they prove useful as:

- permission infrastructure
- source evidence
- provenance storage
- temporary fallback retrieval
- operational trace data

Do not preserve existing RAG/archive semantics just because they exist.

## Surface Role Split

Organize community surfaces by memory role, not by UI tab.

```txt
Product tables = source of truth
Source traces = normalized evidence
Embeddings = disposable search index
Compiler = time-windowed interpretation
Directory = accepted compiled intelligence
Retrieval = action-time memory routing
```

Temporal handling:

```txt
0-30 days = compiler window / community working memory
30+ days = long-term memory retrieval only
```

The compiler window is not a context dump. It is the bounded working set the community agent can inspect, filter, rank, summarize, and compile from. Activity older than the compiler window should only matter through accepted directory intelligence, source traces, archive/search, resources, outcome-linked memory, or other long-term retrieval systems.

Surface handling:

| Surface | Raw canonical record | Source trace | Embedded | Compiler input | Directory role |
| --- | --- | --- | --- | --- | --- |
| Chat | yes | selected or high-signal messages | yes, mostly | yes | only extracted decisions, insights, questions, warnings, examples |
| AI Feed | yes | yes | yes | yes, weighted by signal ranking | only promoted posts or patterns |
| Resources | yes | yes | yes, strongly | yes, especially for stale or contradiction checks | usually reference material; sometimes source-backed playbook or resource node |
| Workflow runs / artifacts | yes | yes | yes, where text-bearing | yes | successful examples, failures, workflow improvements, validated patterns |
| Outcomes / feedback | yes | yes | yes, when textual | yes, high priority | support, contest, validate, or falsify patterns |
| Calls / transcripts | yes | yes | yes | yes | decisions, insights, repeated questions, warnings, examples |
| Events | yes | only when there is recap/transcript/decision/outcome evidence | only descriptions, summaries, recaps, or transcripts | context-only unless evidence-bearing | only learnings, decisions, repeated coordination patterns, or event-derived outcomes |
| Members | yes | only explicit contribution or aggregate state signals | mostly no | context-only and aggregate-first | expertise nodes later, opt-in and evidence-based |

Rules:

- Everything can become a permissioned source trace.
- Some text-heavy sources can be embedded for recall.
- Most activity should never become directory truth.
- Directory entries are narrow, accepted community intelligence.
- Raw archive and embeddings can support evidence search, but they are not validated community intelligence.
- Workflow retrieval should prefer accepted directory intelligence, then fall back to archive evidence when needed.
- Events and members are mostly structural context and graph references, not blob-search content.
- Event scheduling, member joins, presence, reactions, and generic activity are not learning signals by themselves.
- Events and members enter the learning compiler only through evidence-bearing artifacts such as transcripts, recaps, feedback, outcomes, decisions, workflow runs, artifacts, or explicit contribution records.

## Direct Surface Read Tools

Do not force every community surface through the compiler window. The compiler window answers:

```txt
What changed recently?
```

Dedicated surface tools answer:

```txt
What canonical surface state or evidence should the agent inspect now?
```

This layer should arrive surface by surface as each boundary becomes stable. The platform-harness resource surface can map, batch-read, list, read, and search pages inside active-community Resources. Member runs see live modules and pages only; manager runs can additionally inspect builder-visible draft/source/health state. Neither lane exposes raw storage keys. Other direct surface tools remain deferred until their source and privacy contracts are equally clear.

| Surface | Future direct read role | Compiler-window role |
| --- | --- | --- |
| Chat | query recent/raw conversation evidence when needed | core live activity signal |
| AI Feed | inspect ranked agent/community signals | core live activity signal |
| Resources | search/read durable reference evidence | low-priority resource added/updated/stale signal |
| Events | list/read scheduled, completed, cancelled, or changed events | coordination change signal |
| Members | read aggregate member state, roles, joins, and explicit public contribution signals | aggregate community-state signal |

Resources should not be treated as normal activity blobs. They are durable reference evidence. The compiler window should know that a resource was added, updated, reused, stale, or contradictory; the agent should use a dedicated resource read/search path when it needs the actual resource content.

Events should not become memory by existing. They are coordination state. Only event-derived decisions, recaps, outcomes, repeated questions, or coordination patterns should become source traces or directory proposals.

Members require the strictest boundary. Member tooling should return roles, join dates, public profile fields, aggregate activity, and explicit contribution signals. It should not create hidden trust scores, private behavioral judgments, or surveillance-style summaries.

The compiler window may expose a `member_state` block, but it must stay aggregate-first:

```txt
member_state:
  new_members_count
  active_members_count
  posting_members_in_activity_count
  ai_feed_reacting_members_count
  latest_new_members, capped
```

`latest_new_members` may include only public user id, role, and join timestamp. It must not include inferred personality, hidden quality scores, private profiles, or behavioral judgments.

The core flow:

```txt
Chat / AI Feed / Resources / Events / Members
  -> product-specific source tables
  -> source trace bridge
  -> hot trace buffer / recent activity window
  -> compiler
  -> change requests
  -> community cognition decision
  -> directory nodes + typed edges
  -> workflow retrieval
  -> outcome observations
  -> pattern updates
```

The learning-compiler flow should be narrower:

```txt
Chat / AI Feed / Workflow Runs / Artifacts / Resources / Outcomes / Feedback / Transcripts
  -> source traces
  -> compiler observation
  -> learning envelope
  -> preference judgment
  -> directory change request
```

Excluded from learning unless attached to evidence:

```txt
event scheduled
event updated
member joined
member present
member reacted
generic activity
```

## Product Thesis

Polynet should become a recursive organizational intelligence system where each community has its own persistent cognition layer.

The simple promise:

> Your community gets smarter as members use it.

The system promise:

> Polynet turns decentralized community activity into compounding operational intelligence.

The architecture promise:

> Member and agent activity creates permissioned traces. The community agent wakes on heartbeats, runs compiler processes, updates the community intelligence directory, promotes validated operational patterns, and retrieves the right patterns into future member workflows.

## Primary Ontology

There are two primary entities:

1. Members and personal agents.
2. The community and its community agent.

Builders, admins, and moderators are members with governance permissions. They are not a separate species in the product model. They instantiate and govern the community agent, but they remain members who have their own personal agents.

### Member

A member:

- has a personal agent
- participates in communities
- runs workflows
- creates artifacts
- asks questions
- gives feedback
- produces activity and outcomes
- controls private context and sharing scope

### Personal Agent

A personal agent acts for a member.

It may be named, styled, and configured by the member. It can inherit community workflows, playbooks, examples, warnings, skills, and retrieval context when the member is inside a community they can access.

The personal agent does not directly write canonical community intelligence. It emits permissioned traces that the community cognition loop can evaluate.

Personal memory belongs to this layer. It should store user preferences, goals, style, private notes, personal constraints, connected-app context, and private workflow history.

Personal memory is private by default. It can influence the user's personal agent, but it must not silently become community memory.

### Community

A community is a persistent agentic memory system instantiated by members and improved by member activity.

It has:

- members
- workflows
- resources
- permissions
- governance rules
- a community intelligence directory
- a community agent
- a compiler loop
- retrieval policy
- outcome feedback

### Community Agent

The community agent acts for the community.

It is the persistent cognition layer and steward of the community memory system. It is not merely another chat assistant.

Its job:

- observe permissioned community activity
- maintain hot state
- run compiler sub-agents
- detect patterns, failures, contradictions, and open questions
- propose directory updates
- promote validated operational patterns through policy decision gates
- tune retrieval into future workflows
- emit digests, alerts, and decision items
- preserve provenance, permissions, and confidence

The community agent should be autonomous in operation but not ungoverned. Admins do not prompt it into life. They define its constitution. Events and heartbeats wake it.

Community memory belongs to this layer. It should store what the community has learned: playbooks, insights, examples, warnings, decisions, open questions, resources, and validated operational patterns.

The bridge from personal activity to community memory is controlled promotion:

```txt
personal agent action
  -> permissioned trace
  -> compiler candidate
  -> community cognition / policy decision gate
  -> community memory
```

Personal agents execute. The community agent learns. The compiler proposes. Community cognition and policy gates decide.

## Community Agent Autonomy

The community agent should feel alive because it runs from heartbeats and event triggers.

It should wake when:

- a scheduled heartbeat fires
- a high-signal conversation occurs
- a workflow completes
- an artifact is created
- an outcome is observed
- a repeated question is detected
- an admin decision is made
- a pattern is contradicted
- a playbook becomes stale

It should not require a human to prompt:

> "Please summarize what happened."

Instead, it should periodically say:

- "I noticed 5 members struggled with the same onboarding step."
- "This old playbook may be stale."
- "This artifact should become an example."
- "This pattern appears promising but needs more evidence."
- "This question keeps recurring, so I opened it as an unresolved question."

## Core Loop

The irreducible system loop:

```txt
Action
  -> Trace
  -> Pattern Candidate
  -> Approved Intelligence
  -> Retrieval
  -> Outcome
  -> Update
```

The orchestration loop:

```txt
Members + personal agents
  -> community activity
  -> permissioned structured traces
  -> community agent heartbeat
  -> compiler sub-agents
  -> community intelligence directory
  -> validated operational patterns
  -> retrieval into future personal-agent workflows
  -> better outcomes
  -> outcome traces back into the compiler
```

The community agent is the executive function over the memory system. The compiler is the consolidation machinery. The directory is the persistent cognition substrate. Validated operational patterns are promoted operational memory. Retrieval is action-time memory routing.

The compiler should behave as one staged pipeline rather than a pile of disconnected compilers:

```txt
Pass 1: Observe
  What happened?

Pass 2: Learn
  What could the community learn from this?

Pass 3: Judge
  What worked better than what, how strong is the evidence, and should this become a directory proposal?
```

Implementation can use separate prompts or agent personas for each pass later, but the product should keep one compiler pipeline with typed stages until the data proves it needs more durable services.

## Research Inspirations

This architecture borrows from several models, but should not become research cosplay.

### Neuroscience

Useful primitives:

- working memory
- episodic memory
- semantic memory
- procedural memory
- social memory
- salience
- consolidation
- retrieval cues

Translation:

- fast memory is recent activity and structured traces
- slow memory is compiled community intelligence
- not every event becomes long-term memory
- memory must preserve provenance and uncertainty

### Cognitive Architectures

Useful primitives:

- current state
- buffers
- long-term memory
- procedural knowledge
- action selection
- feedback loops

Translation:

- memory must be embedded inside workflow action
- retrieval should serve the current task and workflow stage
- the system learns only when outcome feedback changes future behavior

### Recursive Language Modeling

Useful primitives:

- recursive reflection
- critic loops
- chosen versus rejected outputs
- refinement from feedback
- dynamic context and graph-like organization

Translation:

- the community should remember what worked and what failed
- negative memory matters
- candidate patterns should be critiqued before promotion
- future retrieval should improve from feedback

### Karpathy LLM Wiki and Obsidian

Useful primitives:

- raw sources stay immutable
- the wiki is a persistent compiled layer
- the schema tells agents how to maintain the system
- ingest, query, and lint are core operations
- links and directories make memory inspectable

Translation:

- Polynet should not be "RAG over community chat"
- the community intelligence directory is the compiled layer
- raw traces remain source evidence
- the directory must be visible, editable, lintable, and linked

## Memory Architecture

The community agent should interface with a brain-inspired architecture, but the user-facing surface should remain simple.

There are two memory systems:

```txt
Personal Memory = what this user and personal agent should remember.
Community Memory = what this community has learned and accepted for reuse.
```

They may interact through permissioned traces and promotion gates, but they are not the same store.

At runtime, a member's personal agent may receive:

```txt
User context:
- personal memory
- current task
- private preferences
- private constraints

Community context:
- accepted community intelligence
- relevant playbooks
- examples and warnings
- raw archive evidence when needed
```

The source of each context item should remain distinguishable. The system should know whether context came from personal memory, accepted community intelligence, raw archive evidence, or the current workflow.

### Internal Layers

1. Constitution
   - mission
   - values
   - member outcomes
   - privacy rules
   - publishing rules
   - decision policy
   - KPI weights
   - allowed data sources
   - admin override rules

2. Working Memory / Hot Trace Buffer
   - recent uncompiled activity
   - active workflows
   - open loops
   - unresolved questions
   - temporary context

3. Episodic Memory
   - what happened
   - conversations
   - agent runs
   - workflow runs
   - artifacts
   - tool calls
   - outcome observations

4. Semantic Memory
   - what the community knows
   - concepts
   - principles
   - insights
   - explanations
   - distilled claims

5. Procedural Memory
   - how the community acts
   - playbooks
   - workflows
   - templates
   - standard operating procedures
   - repeatable skills

6. Preference and Outcome Memory
   - what worked
   - what failed
   - what was rejected
   - what was validated
   - what became stale
   - what improved outcomes

7. Social and Expertise Memory
   - who contributed what
   - evidence-backed expertise
   - useful examples by member
   - contribution history

   This layer must be handled carefully. It should never become hidden social scoring.

8. Attention and Open Questions
   - unresolved problems
   - recurring questions
   - hypotheses
   - contradictions
   - research gaps

9. Artifacts and Examples
   - useful outputs
   - winning examples
   - failed examples
   - resources
   - files
   - prompts
   - campaigns

### Visible Directory

The member-facing directory should be simpler than the internal memory model:

- Playbooks
- Insights
- Examples
- Decisions and Judgment
- Warnings and Failures
- Open Questions
- Resources
- People and Expertise, later and carefully

Episodes should generally not be top-level user-facing objects. They should be evidence attached to insights, patterns, playbooks, decisions, examples, and warnings.

## Compiler System

The compiler is the hidden engine that turns raw entropy into structured intelligence.

It should not be a summarizer. It should be an intelligence transformer.

Compiler output is not canonical truth. It is candidate intelligence.

```txt
Compiler output = candidate
Directory approval = community intelligence
Outcome validation = operational intelligence
```

Compiler responsibilities:

- ingest structured traces
- score signal and novelty
- detect repeated questions
- extract candidate patterns
- detect contradictions
- classify privacy risk
- attach provenance
- link outcomes
- propose directory updates
- recommend decision routing
- merge duplicates
- deprecate stale patterns
- tune retrieval weights

### Compiler Sub-Agents

The community agent can orchestrate specialized sub-agents:

- Ingestion Agent
- Privacy and Permission Agent
- Signal Detection Agent
- Pattern Extraction Agent
- Contradiction Agent
- Playbook Compiler Agent
- Outcome Attribution Agent
- Research Gap Agent
- Directory Lint Agent
- Retrieval Tuning Agent

Sub-agents should propose changes. They should not silently rewrite canonical community intelligence without policy decision gates.

## Validated Operational Pattern

The core promoted object should be a validated operational pattern, not a generic memory.

Definition:

> Under these conditions, this action tends to improve this outcome, with this evidence, for this type of member, workflow, or community.

Fields:

- title
- category
- applies when
- recommended action
- known failure modes
- evidence traces
- example artifacts
- outcome observations
- confidence score
- outcome impact score
- retrieval usefulness score
- permission scope
- status
- last validated at
- deprecated by

Statuses:

- observed
- candidate
- promising
- validated
- canonical
- contested
- stale
- deprecated
- archived

Example:

```txt
Pattern:
Direct outcome hooks outperform founder-story hooks for early creator outreach.

Applies when:
- creator audience under 100k followers
- tactical B2B offer
- first outreach workflow
- low existing relationship

Recommended action:
Use direct outcome framing and a low-friction CTA.

Evidence:
- 6 workflow runs
- 3 successful artifacts
- 2 failed alternatives
- 1 booked-call improvement

Status:
Promising

Confidence:
Medium
```

## Filters and Gates

Filtering must exist at multiple stages.

### Ingress Filter

Decides what activity becomes a memory candidate.

Questions:

- Is this meaningful?
- Is this novel?
- Is this repeated?
- Is this sensitive?
- Is this private?
- Is this attached to a workflow, artifact, or outcome?

### Permission Filter

Decides who can see, use, publish, or retrieve the memory.

Rules:

- private member context is private by default
- memory visibility and source visibility are distinct
- community memory requires explicit policy or community cognition decision
- community memory is single-community only; cross-community memory/intelligence is out of scope and must not be reachable from this system

### Compiler Filter

Decides whether a candidate is useful, redundant, contradicted, stale, or risky.

### Promotion Filter

Decides whether a candidate can become canonical community intelligence.

Promotion should depend on:

- source quality
- provenance
- confidence
- outcome evidence
- repeatability
- permission scope
- contradiction status
- policy decision

### Retrieval Filter

Decides whether a pattern should be injected into a future workflow.

The correct retrieval result is sometimes no memory.

Rank by:

- permission match
- workflow match
- task relevance
- user lifecycle stage
- confidence
- outcome linkage
- source trust
- recency where relevant
- contradiction penalty
- staleness penalty
- sensitivity risk

### Outcome Filter

Decides whether retrieval helped.

Outcome traces should reinforce, demote, update, or deprecate patterns.

## Heartbeat Cadence

Suggested cadence:

```txt
Realtime:
  Hot Trace Buffer updates.

24 hours:
  Daily Compiler creates digests and candidates.

48 hours:
  Evidence pass checks early feedback and reuse.

72 hours:
  Consolidation pass promotes, merges, rejects, or marks open questions.

Weekly:
  Directory lint finds stale patterns, contradictions, orphaned resources, and unresolved gaps.
```

The cadence should be configurable by community scale and activity level.

## Product Surfaces

### Community Intelligence Home

Shows:

- what the community agent noticed
- active hypotheses
- pending-decision candidates
- stale playbooks
- recurring questions
- recent outcomes
- suggested next actions

### Community Intelligence Directory

Shows:

- Playbooks
- Insights
- Examples
- Decisions and Judgment
- Warnings and Failures
- Open Questions
- Resources
- People and Expertise, later and carefully

The directory should be the accepted community memory surface. It should not be a raw archive browser.

Archive search may still support the directory by providing source evidence and fallback retrieval.

### Community Cognition Decision Log

Shows authorized members what the community agent and policy gates are doing:

- change requests
- accepted changes
- rejected changes
- policy blocks
- privacy-sensitive decisions
- stale or contested patterns
- evidence gaps
- admin overrides

### Workflow Injection UI

Shows what community intelligence was used:

- "Using Playbook: Creator Outreach v2"
- "Using Warning: Founder-story hooks underperformed"
- "Using Example: Sarah's winning DM sequence"
- "Using Insight: Direct outcome hooks worked best for sub-50k creators"

### Community Intelligence Digest

Periodic digest:

- what we learned
- what worked
- what failed
- pending decisions
- what should be tested
- what should be researched
- what should be added to playbooks

## KPI Direction

The north star should be member capability compounding, not engagement.

Do not reward:

- post count
- time spent
- raw workflow count
- community size alone
- popularity without outcome evidence

Reward:

- validated patterns
- useful examples
- successful workflows
- member outcome improvement
- reusable playbook updates
- contradiction detection
- memory retrieval usefulness
- lower coordination overhead

Possible metrics:

- Memory-Assisted Outcome Lift
- Pattern Validation Rate
- False Memory Rate
- Contradiction Resolution Time
- Memory Utilization Efficiency
- Compiler Precision
- Review Burden
- Outcome Linkage Rate
- Member Capability Growth

## Safety and Trust

This system fails if it feels like surveillance or fake authority.

Rules:

1. Private by default for sensitive member context.
2. Separate source visibility from memory visibility.
3. Show provenance where practical.
4. Show confidence and status.
5. Require policy-gated acceptance for canonical promotion.
6. Allow members to contest memory.
7. Allow opt-out and scope controls.
8. Do not create hidden social scores.
9. Do not expose raw private traces as community evidence.
10. Do not let the community agent become a centralized epistemic authority.
11. Do not let personal memory leak into community memory without explicit policy and promotion.
12. Do not treat vector search over raw archive documents as validated community intelligence.

The community agent should interpret, suggest, rank, organize, and retrieve. It should not dictate truth.

## MVP Wedge

Do not build the full organism first.

Build the narrowest proof first:

```txt
One community.
One workflow.
One simple intelligence directory.
One retrieval loop.
One outcome feedback loop.
```

Example:

```txt
Community:
Distribution Engineer

Workflow:
Creator Outreach

Directory:
Playbooks, Insights, Examples, Warnings, Open Questions

Seed:
10-20 manually seeded accepted intelligence entries

Retrieval:
Inject 3-5 accepted patterns into the outreach agent

Feedback:
Did this help, fail, or need updating?
```

First magic moment:

```txt
An admin seeds a useful pattern.
Another member runs a similar workflow later.
The personal agent uses the pattern and cites it.
The output is better because the community learned.
```

## Build Order

1. Directory substrate and typed write gate.
2. Community cognition decision loop and policy gate.
3. Manual Community Intelligence Directory seeding.
4. Retrieval of accepted entries into one workflow.
5. Retrieval provenance UI and usefulness feedback.
6. Outcome observations for the workflow.
7. RawTrace and agent run trace capture.
8. PatternCandidate generation and daily compiler digest.
9. Weekly lint for stale, contradicted, and open patterns.
10. Community agent heartbeat.

Automation comes after the manual loop proves that retrieved community intelligence improves workflow output.

## First Implementation Slice

The first backend slice implements the directory substrate before compiler automation:

- `communitySourceTraces`: permissioned evidence records.
- `communityIntelligenceNodes`: compiled intelligence entries that have crossed the write gate.
- `communityIntelligenceEdges`: typed operational links between nodes and references.
- `communityIntelligenceMutations`: append-only audit trail for directory truth changes.
- `communityIntelligenceChangeRequests`: candidate claims and requested directory mutations awaiting community cognition or policy acceptance.
- `communityIntelligenceRetrievalLogs`: action-time retrieval provenance.
- `communityOutcomeObservations`: evidence about whether retrieved intelligence helped.

The slice intentionally keeps writes narrow:

```txt
No freeform prompt mutates directory truth.
Activity and outcomes become evidence or change requests before they can become directory truth.
Only typed admin/manual mutations can create or change intelligence nodes and edges directly.
Agent, compiler, and system actors propose directory changes; they do not directly mutate canonical truth.
Every node/edge truth mutation writes an audit record.
Draft/candidate intelligence is manager-visible until promoted beyond the airlock.
Change request application rejects stale targets when the target node or edge changed after change request creation.
```

The first retrieval path is deterministic metadata retrieval. Embeddings can be added later as a derived index, not as truth.

## Second Implementation Slice

The second backend slice bridges the existing AI Feed into compiler-readable evidence without promoting anything into directory truth:

```txt
AI Feed post
  -> idempotent ai_feed source trace
  -> compiler input query
  -> future compiler candidate
```

Rules:

- Publishing an AI Feed post ensures a matching `communitySourceTraces` row.
- The trace is keyed by `communityId + sourceType + sourceId` so retries and `noveltyKey` reuse do not duplicate evidence.
- Compiler input reads recent source traces, ranked live AI Feed signals, pending change request count, and recent outcome observations.
- The bridge does not create or update `communityIntelligenceNodes`.
- The bridge does not decide truth. It only makes existing signal available to the future compiler and community cognition loop.

## Third Implementation Slice

The third backend slice defines the fixed compiler window:

```txt
Chat / AI Feed / Resources / Events
  -> bounded 30-day compiler window
  -> community agent / compiler working set
  -> future compiler candidates and directory proposals
```

Rules:

- The compiler window is fixed at 30 days; it is not user-selectable.
- The window reads bounded evidence bundles, not raw unbounded community history.
- Chat, AI Feed, and Resources enter the window through archive activity records.
- Source traces, ranked AI Feed signals, live event updates, outcomes, and pending change requests are included as compiler working state.
- The compiler window is manager-scoped in this backend slice because it exposes compiler state and pending directory proposals.
- The compiler window does not mutate directory truth.
- Anything older than 30 days must be retrieved through long-term memory layers instead of raw activity replay.

## Fourth Implementation Slice

The fourth backend slice adds the first non-canonical compiler digest pass:

```txt
30-day compiler window
  -> deterministic digest/candidate pass
  -> communityCompilerDigests
  -> future community-agent review and candidate generation
```

Rules:

- Compiler digests are not directory truth.
- The digest pass writes only `communityCompilerDigests`.
- The pass is fixed to the same 30-day compiler window.
- The pass is idempotent per community/day so heartbeat retries do not spam duplicate digests.
- Digest items are bounded and typed: chat activity, AI Feed signal, resource activity, event activity, member state, outcome signal, source trace signal, and pending directory decision.
- Learning digest items should be generated from signal-bearing sources: chat, AI Feed, resources, outcomes, source traces, transcripts, feedback, workflow runs, artifacts, and pending directory decisions.
- Event scheduling, member joins, presence, reactions, and generic activity are excluded from learning digests unless they produce evidence-bearing traces such as transcripts, feedback, outcomes, decisions, artifacts, or workflow records.
- Digest items may point at source ids or source trace ids, but they do not mutate `communityIntelligenceNodes`, `communityIntelligenceEdges`, or `communityIntelligenceChangeRequests`.
- The digest is manager-scoped in this backend slice because it exposes compiler state and pending decision counts.

## Fifth Implementation Slice

The fifth backend slice hardens authority over source evidence:

```txt
Product source tables
  -> trusted bridge-owned source traces
  -> compiler window

Member/manual evidence
  -> manual or external source traces only
  -> compiler window
```

Rules:

- Public `recordCommunitySourceTrace` calls may only write `manual` or `external` traces.
- Public source trace writes cannot impersonate product-owned sources such as chat, AI Feed, resources, workflow runs, tool calls, artifacts, outcomes, feedback, or transcripts.
- Product-source traces are bridge-owned. `chat`, `ai_feed`, `resource`, workflow-derived, artifact-derived, outcome-derived, feedback-derived, and transcript-derived traces must come from trusted product/runtime bridge code.
- There is no generic internal product-source trace mutation. Source-specific bridges must validate their own authority and call the trusted source-trace core helper directly.
- The trusted source-trace bridge requires a stable product `sourceId` and defaults new product-owned evidence to admin visibility unless the product path explicitly widens it.
- Public source trace writes cannot claim `agent`, `compiler`, or `system` actor identity.
- AI Feed agent publication is governance-scoped in this slice so normal members cannot create fake `Community agent` evidence.
- Daily compiler digest reruns update digest contents without rewriting original creation attribution.
- Direct canonical directory node/edge writes are internal repair infrastructure only. They are not public community product APIs.
- Public member/admin APIs may create evidence, outcomes, retrieval logs, and policy-gated change requests; they must not impersonate the community agent, compiler, or system.

## Sixth Implementation Slice

The sixth backend slice connects non-canonical compiler digests to the directory airlock:

```txt
Compiler digest
  -> selected digest item
  -> candidate change request
  -> future community cognition decision
  -> future apply through the existing airlock
```

Rules:

- The digest-to-candidate pass is an internal compiler/community-agent operation that creates only `communityIntelligenceChangeRequests`.
- Directory truth is still untouched: no direct `communityIntelligenceNodes` or `communityIntelligenceEdges` writes.
- Candidate change requests use `operation: create_node`, `status: pending_decision`, and `createdByActorType: compiler`.
- Candidate payloads default to `status: candidate` and `visibilityScope: admin`.
- Public admin decisions are explicit repair/override paths. The normal reviewer is the community cognition loop.
- Digest `sourceIds` are clues; resolved `sourceTraceIds` are formal evidence.
- The candidate pass resolves digest source ids into `communitySourceTraces` before creating the change request.
- If formal trace evidence cannot be resolved, the candidate stays honest: `sourceVisibility: redacted`, lower evidence strength, and a `needs_trace_resolution` tag.
- `pending_directory_decision` digest items are rejected because they are already inside the airlock.
- `event_activity` and `member_state` digest items are not learning candidates. They should not create directory proposals unless converted into evidence-bearing source traces by another product bridge.
- Duplicate proposals for the same digest item should reuse the existing non-rejected change request instead of spamming the airlock.
- Digest-derived candidate payloads should carry a PRefLexOR-style learning envelope:
  - `learningQuestion`
  - `candidateClaim`
  - `rejectedAlternative`
  - `preferenceReason`
  - `evidenceSummary`
  - `uncertainty`
  - `falsificationCriteria`

## Seventh Implementation Slice

The seventh backend slice adds the first internal single-community filesystem for the community agent:

```txt
Community agent heartbeat/tool loop
  -> list/read/search/write
  -> compiler and directory only
  -> existing directory airlock
```

Rules:

- The filesystem is internal-only. It is not exported as a public member/admin prompt surface.
- Every operation is scoped to exactly one community-agent filesystem context.
- The filesystem context must include the canonical `communityId` and canonical `agentKey`, must resolve to an existing community, and preserves optional run/heartbeat ids in tool metadata for provenance.
- The only accepted v0 community-agent identity is `community_agent`; the filesystem must reject non-canonical agent keys.
- Filesystem tools inherit community scope from this context. They must not accept `communityId` as a loose per-operation argument.
- The root exposes only `/compiler` and `/directory`.
- `/compiler` exposes bounded compiler state: latest window summary, digests, and digest-derived candidate proposals.
- `/directory` exposes long-term intelligence state: nodes, edges, and change requests.
- The filesystem does not expose raw `/activity`; activity must flow into compiler evidence first.
- The first write operation is deliberately narrow: propose a directory candidate from a compiler digest item.
- Filesystem writes create or reuse `communityIntelligenceChangeRequests`; they do not directly create or patch `communityIntelligenceNodes` or `communityIntelligenceEdges`.
- Candidate proposals created through this surface are attributed to the community agent, not a member prompt.

## Eighth Implementation Slice

The eighth backend slice connects actual community-lensed runtime execution to compiler evidence:

```txt
Runtime run finalization
  -> trusted `agent_run` source trace
  -> 30-day compiler window
  -> future community-agent inspection
```

Rules:

- Runtime completion is operational truth; the source trace is execution evidence, not directory truth.
- Runtime run community scope is derived only from the server-validated thread community lens.
- Caller-provided runtime `communityId` values are start-time consistency assertions only. They must match the thread lens for new runs or the stored run lens for existing runs.
- Thread community lens changes are allowed after a run starts, but they only affect future runs.
- Runtime source-trace capture writes to the immutable run community lens captured at run start, not the mutable current thread lens.
- Only runtime runs with a canonical thread community lens create community evidence.
- Runtime run evidence is single-community evidence. It must never read from, write to, or merge with another community.
- Runtime source traces use stable source ids so retries and stale-run reconciliation update the same evidence row.
- Runtime source traces default to `visibilityScope: admin` and `sourceVisibility: redacted`.
- Compiler reads may inspect trusted non-private source traces even when `sourceVisibility` is `redacted`; redaction controls source exposure, not compiler perception.
- Runtime source traces include bounded execution metadata: status, reason, error code, model, engine, contract, start/finish time, and duration.
- Runtime source traces must not include raw prompts, message content, tool arguments, raw error messages, or raw runtime transcripts.
- Runtime source trace capture is best-effort and must not break terminal runtime finalization.
- Runtime finalization does not create directory nodes, edges, or change requests directly.
- This gives the community compiler sensory input from actual work while preserving the evidence -> compiler -> directory airlock.

## Ninth Implementation Slice

The ninth backend slice adds the first internal community-agent runtime loop:

```txt
Internal trigger
  -> single community-agent run ledger
  -> owner-sponsored ChatGPT inference
  -> native tool loop
  -> community-agent filesystem tools
  -> directory airlock proposals only
```

Rules:

- The runtime is internal-only. There is no public member/admin prompt action for the community agent.
- Every run belongs to exactly one `communityId` and the canonical `agentKey`: `community_agent`.
- The runtime derives the community-agent identity from platform code. It must not accept `agentKey` as caller input.
- The sponsor is the community owner. The runtime must not use platform/global fallback inference.
- The runtime may use only four tools: `list`, `read`, `search`, and `write`.
- Tool execution is bound to the single-community filesystem context: `communityId`, canonical `agentKey`, `runId`, and optional `heartbeatId`.
- The runtime sees only `/compiler` and `/directory`; it does not read raw `/activity`.
- The first runtime write is still only `propose_directory_candidate_from_digest_item`.
- Runtime writes create or reuse directory change requests through the filesystem airlock.
- The runtime must not directly insert or patch `communityIntelligenceNodes` or `communityIntelligenceEdges`.
- Each run is persisted in `communityAgentRuns` with sponsor, model, status, stop reason, tool count, candidate proposal ids, and timestamps.
- Provider failure, missing owner auth, or model failure must finish the run as an error instead of falling back to another community or platform inference source.

## Tenth Implementation Slice

The tenth backend slice adds the first single-community heartbeat bridge and runtime concurrency guard:

```txt
Internal scheduler/enqueuer
  -> one explicit communityId
  -> heartbeat action
  -> canonical community-agent runtime
  -> same-community running-run guard
```

Rules:

- `enqueueCommunityAgentHeartbeatInternal` is internal-only and schedules exactly one heartbeat for exactly one explicit `communityId`.
- The heartbeat bridge is platform infrastructure. It does not give members, admins, or prompts a way to wake or steer the community agent directly.
- `runCommunityAgentHeartbeatInternal` calls the runtime with `triggerType`: `heartbeat`.
- The heartbeat action must not accept `agentKey`, user prompt text, auth subject, or member/user identity.
- The heartbeat bridge must not enumerate multiple communities, collect communities, or choose between communities. Any future fleet scheduler must enqueue separate single-community heartbeats rather than creating a cross-community agent run.
- Run creation checks `communityAgentRuns` for an existing same-community `running` run before creating another run.
- If a fresh running run exists, the new runtime call skips with `running_run_exists` and does not start another model/tool loop.
- If stale running runs exist, the runtime marks them `error` with `stale_running_run_replaced` before creating a new run.
- Finishing a run must not overwrite a terminal run that was already stale-replaced by a later heartbeat.

## Eleventh Implementation Slice

The eleventh backend slice adds the first compiler evidence measurement layer:

```txt
Source traces
  -> eligible evidence units
  -> standard / strong / critical priority
  -> pending backlog measurement
  -> should-run decision
```

The measurement model is intentionally simple:

```txt
Evidence Unit + Priority Tier + Pending Backlog
```

Rules:

- Measurement is internal-only in this slice. It does not give members, admins, prompts, or agents a direct compiler trigger.
- The measurement layer reads only one explicit `communityId`.
- It uses `communitySourceTraces` as the eligible evidence substrate.
- Active evidence is limited to `visibilityScope`: `admin`, `community`, or `public`.
- Private source traces may exist, but they are not part of the community compiler backlog.
- Private source traces use `compilerState: excluded_by_visibility` instead of `pending`.
- Community-agent-authored source traces are not compiler evidence. They use `compilerState: excluded_self_authored` instead of `pending`.
- The self-authored exclusion is keyed only by `actorAgentKey: community_agent`; personal-agent traces can still be member evidence.
- If a private trace later becomes `admin`, `community`, or `public`, the material visibility change can reopen it as pending.
- If a pending trace later becomes private, it leaves the pending backlog and clears handled/digest metadata.
- If a pending trace is discovered to be self-authored by the community agent, the digest pass drains it to `excluded_self_authored` before measurement.
- The pending selector must use visibility-aware indexes. It must not scan all pending traces and filter private rows afterward.
- Evidence priority has only three tiers:
  - `standard`
  - `strong`
  - `critical`
- Outcome and feedback traces are `critical`.
- Traces containing failure, blocker, stale, wrong, contradiction, regression, broken, invalid, or unsafe language are `critical`.
- Workflow runs, agent runs, and transcripts are `strong`.
- Other eligible traces are `standard`.
- `communitySourceTraces` own compiler lifecycle state. The digest table is not the backlog ledger.
- New eligible source traces enter with `compilerState: pending` and `compilerPendingSince` set to creation time.
- Material source trace updates reopen eligible traces as `compilerState: pending`, clear handled metadata, and set a fresh pending clock unless the trace was already pending.
- Community-agent-authored source traces are born terminal as `excluded_self_authored`; they must not inflate trigger counts, selected trace ids, or digest source-trace evidence.
- Idempotent source trace upserts should not reopen already handled evidence.
- Legacy source traces without compiler lifecycle fields are treated as pending only when their visibility is compiler-eligible and they are not self-authored by the community agent.
- The compiler should run when any of these are true:
  - 20 pending eligible evidence units exist
  - 5 strong evidence units exist
  - 1 critical evidence unit exists
  - oldest pending evidence is at least 72 hours old
- A measurement run selects up to 100 pending evidence units, ordered by critical first, then strong, then standard, oldest first within each tier.
- `compilerPendingSince` is the age clock for pending evidence, with `createdAt` only as a legacy fallback.
- `communityCompilerDigests.windowEndedAt` is not a consumption cursor and must not decide whether source traces are pending.
- If the pending scan cap is hit, returned counts are lower bounds and the result must say so explicitly.
- The measurement layer does not use the 30-day compiler window as an eligibility cutoff.
- The 30-day compiler window remains a raw context expansion bound for digest/compiler reading, not a reason to drop uncompiled eligible evidence.
- This slice measures whether the next compiler pass is warranted. Future compiler-consumption slices may set traces to `compiled`, `carried_forward`, or `dismissed_low_signal`.

## Twelfth Implementation Slice

The twelfth backend slice closes the first source-trace compiler lifecycle loop:

```txt
Pending source traces
  -> shared pending-evidence selector
  -> compiler digest source_trace_signal item
  -> digest row persisted
  -> selected source traces marked compiled
```

Rules:

- The digest pass must use the same pending-evidence selector exposed by `measureCommunityCompilerEvidenceInternal`.
- The digest pass may still read the 30-day activity window for chat, AI feed, resources, outcomes, and pending directory decisions, but source-trace consumption comes only from selected pending source traces.
- A `source_trace_signal` digest item represents the selected pending traces that the pass handled.
- Selected source traces are marked `compiled` only after the digest row exists.
- The compiled patch sets `compilerLastHandledAt` and `compilerLastDigestId`.
- The compiled patch stays inside the same explicit `communityId`.
- The compiled patch must not use `communityCompilerDigests.windowEndedAt` as a cursor.
- Unselected source traces remain `pending`.
- The pass does not auto-dismiss low-signal traces yet.
- The pass does not set `carried_forward` yet.
- Same-day digest reruns must preserve previously represented source-trace evidence instead of erasing it from the digest item.

## Thirteenth Implementation Slice

The thirteenth backend slice connects heartbeat awakening to compiler evidence measurement:

```txt
Single-community heartbeat
  -> measure eligible pending evidence
  -> record skipped run when there is no trigger
  -> run the community agent only when evidence warrants it
  -> persist wake reason and evidence counts
```

Rules:

- `runCommunityAgentHeartbeatInternal` measures compiler evidence for exactly one explicit `communityId` before calling the runtime.
- The heartbeat action must use `measureCommunityCompilerEvidenceInternal`; it must not inspect raw communities, prompts, users, or cross-community state.
- If `should_run` is false, the heartbeat records a `communityAgentRuns` row with `status: skipped`.
- Skipped heartbeat rows persist `wakeReason`, `wakeEvidence`, `stopReason`, `heartbeatId`, and zero tool steps.
- If `should_run` is true, the heartbeat calls `runCommunityAgentLoopInternal` with `triggerType: heartbeat`, the same `communityId`, the `heartbeatId`, and the compiler `wakeReason`/`wakeEvidence`.
- A compiler evidence trigger wakes the community agent; it does not give members, admins, or prompts a direct wake path.
- `wakeReason` is diagnostic context for the run, not canonical directory truth.
- Directory mutation still requires the filesystem write airlock and candidate/review path.

## Fourteenth Implementation Slice

The fourteenth backend slice closes the first member-agent consumption loop:

```txt
Accepted directory intelligence
  -> member-agent community memory tools
  -> cited guidance inside a community-lensed turn
  -> outcome feedback from the member
  -> communityOutcomeObservations
  -> future compiler/directory updates
```

Rules:

- Member-agent memory tools are exposed only through the existing `community_tools` capability family.
- The tools derive community scope from the active server-validated community lens. They must not accept a loose `communityId` argument from the model.
- `community_memory_search` searches accepted community intelligence in `communityIntelligenceNodes`; it is not archive RAG and it does not use embeddings as truth.
- `community_memory_search` defaults to `promising`, `validated`, and `canonical` statuses. Draft and candidate entries remain in the airlock.
- `community_memory_read` reads one node and a bounded visibility-filtered subgraph bundle, then marks the node as injected in the retrieval log.
- `community_record_outcome` records whether retrieved community memory worked, failed, or was mixed. Non-manager member paths still require a same-user retrieval log, and node-linked outcomes require the node to have been retrieved or injected in that log.
- These tools may write retrieval logs and outcome observations. They must not directly create or patch `communityIntelligenceNodes` or `communityIntelligenceEdges`.
- The active-community context tool may expose a tiny memory orientation block with counts and recent validated titles, but it must not dump directory contents into the prompt.
- Runtime prompt policy must distinguish accepted community memory from raw archive evidence: use `community_memory_search` for what the community has learned, use `community_search` for unvalidated recent/archive evidence.
- If community memory is used in prose, the agent should cite the entry title and status.

## Fifteenth Implementation Slice

The fifteenth backend slice makes member-agent directory reads bounded and index-backed:

```txt
Accepted directory intelligence
  -> bounded indexed buckets by status/type
  -> deterministic local rerank over a small candidate set
  -> member-agent retrieval log
```

Rules:

- `community_memory_search` must use `retrieveAcceptedCommunityMemoryNodes`, not the broader workflow helper that can collect all nodes for a community.
- Accepted member memory search is limited to `promising`, `validated`, and `canonical`.
- Retrieval should use freshness-aware directory indexes: `by_community_status_updatedAt` for normal search and `by_community_type_status_updatedAt` when the model supplies type filters.
- Runtime memory lookup remains deterministic and non-LLM. Embeddings and archive search may assist other flows later, but they are not canonical directory truth.

## Sixteenth Implementation Slice

The sixteenth backend slice closes the first community-agent airlock decision loop:

```txt
Compiler-derived pending candidate
  -> community-agent filesystem write
  -> agent decision
  -> accepted/rejected airlock state
  -> accepted change request apply
  -> directory mutation log
```

Rules:

- The community agent still uses the same four filesystem tools: `list`, `read`, `search`, and `write`.
- The tool surface is not expanded with separate review tools. Decision and apply are narrow `write` operations.
- The new write operations are:
  - `decide_change_request`
  - `apply_accepted_change_request`
- These writes still inherit `communityId` from the single-community filesystem context. They must not accept a loose community id.
- Decision/apply must first resolve the target change request inside the same community.
- Decision/apply must reject non-compiler change requests with `community_agent_filesystem_compiler_candidate_required`.
- The community agent may only decide/apply compiler-derived candidates. It must not autonomously review member-authored, admin-authored, manual, or arbitrary same-community change requests.
- Decision/apply must reuse the canonical directory change-request validation and apply path.
- Applying an accepted change request may create or patch `communityIntelligenceNodes` or `communityIntelligenceEdges`, but only through the existing accepted-change-request apply core.
- Filesystem writes themselves must not directly insert or patch directory truth.
- Agent decisions are attributed to `createdByAgentKey` / `decidedByAgentKey` / mutation `actorAgentKey`, not to an admin user.
- The community agent may accept, reject, and apply existing pending compiler candidates.
- The community agent must not decide or apply a candidate it proposed in the same runtime run.
- Digest-derived candidates proposed through the community-agent filesystem carry `proposedByCommunityAgentRunId` and optional `proposedByCommunityAgentHeartbeatId` in their payload metadata.
- Same-run self-review must fail closed with `community_agent_filesystem_same_run_self_review_forbidden`.
- This is the community organism acting as librarian/front gate, not a human admin review queue and not direct prompt mutation of truth.

## Seventeenth Implementation Slice

The seventeenth backend slice makes the community-agent heartbeat auditable before adding a UI projection:

```txt
Community-agent write tool result
  -> runtime action collector
  -> communityAgentRuns ledger
  -> later community-agent activity surface
```

Rules:

- `communityAgentRuns` is the canonical run ledger. The operator panel, community panel, sleep report, or other UI surfaces are projections of this ledger, not the source of truth.
- Each run should preserve compact ids for the write actions the community agent successfully performed:
  - `candidateProposalIds`
  - `acceptedChangeRequestIds`
  - `rejectedChangeRequestIds`
  - `appliedChangeRequestIds`
- The runtime should collect these ids only from successful `write` tool outputs.
- Skipped runs should persist empty action arrays.
- Existing historical run rows may not have every action-array field, so readers must default missing arrays to empty arrays.
- No operator panel in this slice. Make the organism auditable in the backend first.

The eighteenth backend slice adds the first read-only Polynet overview projection for the future community tab:

```txt
Accepted directory intelligence
  -> bounded graph projection
  -> compact community-agent status
  -> future Polynet tab
```

Rules:

- `getCommunityPolynetOverview` is a read-only query.
- The query is scoped to exactly one explicit `communityId` and requires community access.
- The graph contains one synthetic community root node plus real visible directory nodes.
- Directory graph edges are real node-to-node `communityIntelligenceEdges`; the projection does not invent memory edges.
- The projection does not expose raw activity, source traces, compiler digests, compiler windows, or pending change requests.
- The projection exposes accepted-memory statuses only: `promising`, `validated`, `canonical`, `contested`, and `stale`.
- Draft, candidate, archived, and deprecated nodes stay out of the Polynet overview.
- Node reads use bounded status/time indexes, and edge reads are bounded from selected nodes.
- The agent panel data comes from the `communityAgentRuns` ledger and is compact: status, activity state, wake reason, recent action counts, and recent run summaries.
- The overview is product read-model infrastructure. It is not a write surface, not a compiler dashboard, and not an admin review queue.

## Nineteenth Implementation Slice

The nineteenth slice makes the first read-only Polynet community tab visible:

```txt
getCommunityPolynetOverview
  -> Polynet tab shell
  -> memory graph
  -> community-agent status
  -> selected node detail
```

Rules:

- The tab consumes `community:getCommunityPolynetOverview`; it does not call archive health APIs.
- The tab is read-only in this slice. It must not expose write buttons, prompt boxes, review queues, candidate decisions, or directory mutation controls.
- The graph renders backend-projected nodes and edges only. It may include the synthetic community root node returned by the overview, but it must not create fake memory nodes.
- The tab shows the community agent as status/activity derived from the `communityAgentRuns` ledger.
- The tab shows selected-node metadata from the overview projection, not raw traces or compiler internals.
- Polynet tab visibility follows community view access because this is now a member-safe memory surface, not a manager-only archive operations panel.
- Archive backfill, processing, retry, and embedding-health controls are not part of the Polynet memory tab.

## Twentieth Implementation Slice

The twentieth slice adds a deterministic seeded overview fixture for validating the first real Polynet tab state without writing live community memory:

```txt
Seeded overview fixture
  -> real accepted directory nodes
  -> real typed node-to-node edges
  -> community-agent heartbeat runs
  -> tab contract validation
```

Rules:

- The seeded overview fixture is not a runtime seed command and must not create production rows.
- The fixture models the exact shape returned by `getCommunityPolynetOverview`.
- The fixture contains one synthetic community root, several real directory nodes, and real directory edges between directory nodes.
- Directory nodes in the fixture use accepted memory statuses only: `promising`, `validated`, `canonical`, `contested`, and `stale`.
- The fixture must not expose raw traces, compiler windows, compiler digests, change requests, source bodies, source trace ids, or outcome observation ids.
- Community-agent activity in the fixture is heartbeat-driven and uses the canonical `community_agent` key.
- The UI styles edges by typed edge semantics, not by node status classes.
- This fixture is a product-readiness check for the visible memory surface. It does not weaken the airlock rule: live directory mutations still flow through the community-agent filesystem and typed write gates.

## Twenty-First Implementation Slice

Metabolizer v0 adds deterministic score settlement:

```txt
retrieval logs + outcome observations
  -> bounded same-community settlement
  -> derived node scores
  -> better future retrieval ranking
```

Rules:

- `settleCommunityMemorySignalsInternal` lives in `convex/communityMemoryMetabolizer.ts`; it is internal-only and scoped to exactly one `communityId`.
- It reads recent `communityIntelligenceRetrievalLogs` and `communityOutcomeObservations` through bounded same-community indexes.
- It settles persistent derived scores for nodes touched by recent bounded evidence; no-signal nodes are left unchanged in v0.
- Score dimensions are independent: retrieval-only evidence cannot erase `outcomeImpactScore`, and outcome-only evidence cannot erase `retrievalUsefulnessScore`.
- It excludes outcome observations authored by the canonical `community_agent`; the community agent cannot validate its own memories.
- It updates only `retrievalUsefulnessScore`, `outcomeImpactScore`, and `stalenessScore`.
- It does not promote statuses, rewrite node content, change confidence, attach outcomes, mutate edges, or create change requests.
- It does not bump node `version` or `updatedAt`; derived telemetry must not stale pending content change requests.
- Its node update cap limits actual settled nodes, not noisy signal inspection.
- It writes a `communityIntelligenceMutations` audit row with before/after snapshots for every changed node.
- It writes a compact `communityMemoryMetabolizerRuns` ledger row for every successful settlement attempt, including `noop` runs where no node changed.
- Sweep-triggered settlement errors are recorded as `communityMemoryMetabolizerRuns` rows with `status = error`; failed settlement mutations remain rollback-safe and do not commit partial score updates.
- The metabolizer run ledger is same-community scoped and manager-readable; it is the truth surface for "ran vs no-op vs failed."
- It does not call an LLM. Metabolizer v0 is mechanical metabolism, not a new agent role.

## Twenty-Second Implementation Slice

The memory sweep now wires metabolism into cadence:

```txt
6-hour memory sweep
  -> refresh compiler digest
  -> settle metabolizer scores
  -> enqueue delayed heartbeat
  -> heartbeat evidence gate decides whether roles wake
```

Rules:

- Settlement runs for the same explicit `communityId` as the sweep target.
- Digest refresh still runs before score settlement so the compiler window is fresh before the knock.
- Metabolizer failure does not block the delayed heartbeat; derived score settlement is learning pressure, not the source of truth or the wake gate.
- The sweep returns compact `metabolized` diagnostics. Changed-node audit remains in `communityIntelligenceMutations`; run/no-op/error audit lives in `communityMemoryMetabolizerRuns`.

## Twenty-Third Implementation Slice

Concierge intake ledger turns community-agent mentions into auditable serve
requests at birth-time intake:

```txt
human posts @Polynet in community chat
  -> interaction root/reply is created
  -> communityInteractionMentions[pending, community_agent] is created
  -> validate source and requester
  -> require requester access and requester inference connection
  -> insert communityAgentServeRequests
  -> settle mention as sent or suppressed
```

The cron is only a repair drain:

```txt
leftover communityInteractionMentions[pending, community_agent]
  -> retry the same intake core
```

Rules:

- This slice is intake only: No LLM, no reply, no memory write.
- Owner funds sleep; asker funds serve. A queued serve request must have `sponsorUserId == requesterUserId`.
- There is no owner-funded fallback and no platform-funded fallback for member-triggered tags.
- `communityInteractionMentions.notifyState` is only the narrow drain marker for agent mentions:
  - `pending` = intake has not processed this mention
  - `sent` = intake accepted it into `communityAgentServeRequests`
  - `suppressed` = intake rejected/skipped it deterministically
  - `read` = user-mention lifecycle only
- The serve lifecycle itself lives in `communityAgentServeRequests`, not in `notifyState`.
- Fresh `community_agent` mentions are born into intake immediately after the mention row is inserted.
- The bounded cron consumes only leftover pending canonical `community_agent` mentions as a repair drain, not as the primary product path.
- `sourceMentionId` is the idempotency key; retries must lookup before insert.
- Accepted requests require a live human-authored source interaction, current requester chat access, enabled community agent config, and the requester's own usable ChatGPT connection.
- Source and response visibility scopes are captured at intake so the future response path cannot guess or widen the boundary.
- Skipped requests are recorded with machine-readable `intakeReason`; no tokens are spent for skipped intake.
- Unexpected birth-time intake errors must not fail the chat write; the mention remains pending for the repair drain.

## Twenty-Fifth Implementation Slice: Concierge Serve Worker v0

Serve Worker v0 gives the taggable community agent a mouth without giving it
memory authority.

```txt
communityAgentServeRequests[queued, accepted]
  -> schedule immediate serve worker for that request
  -> claim request
  -> load same-community source thread
  -> spend requester ChatGPT connection
  -> insert one community-agent reply in that source thread
  -> mark request responded/error
```

Rules:

- This slice is serve only: it does not write source traces, compiler digests,
  directory nodes, directory edges, change requests, mutations, retrieval logs,
  outcomes, or community-agent runs.
- The worker uses the requester's sponsor lane. `sponsorUserId` must equal
  `requesterUserId`; there is no owner-funded fallback and no platform-funded
  fallback for direct `@Polynet` answers.
- The LLM call is plain completion, not the community-agent tool runtime. The
  Concierge has zero filesystem or directory tools in v0.
- The response is always a reply in the source thread:
  - if the mention source is a root post, insert `communityInteractionReplies`
    under that root
  - if the mention source is a reply, insert `communityInteractionReplies`
    under that root with `targetReplyId = sourceReplyId`
  - never create `communityInteractionRoots`
- Reply visibility is no wider than the captured response scope and current
  source visibility.
- Source visibility must be readable by the requester at serve time: community
  and public scopes require chat access, private scope requires the source
  author, and admin scope requires owner/admin manager access.
- The source requester must still have community chat access at context-read
  and finalization time.
- Only live, same-community source roots/replies can be answered.
- Reply insertion is idempotent by `community_agent_serve:<requestId>`.
- Stale `running` serve requests can be retried; idempotent finalization
  prevents duplicate visible answers.
- The cron is a bounded worker. It processes a small number of queued requests
  per tick and leaves product truth in `communityAgentServeRequests`.
- Serve is event-driven primary, cron-repaired secondary. Fresh accepted
  requests schedule the serve worker immediately with `requestId`; the cron is
  only a leftover/stale request drain.

## What Not To Build Yet

Do not start with:

- giant graph database
- full autonomous community god-agent
- cross-community memory, retrieval, learning, or intelligence of any kind
- fine-tuning
- complex neuroscience ontology
- fully custom directory architecture per community
- invisible auto-publishing
- social trust scores
- large-scale predictive simulation

Start with:

- simple directory
- retrieval into one workflow
- outcome feedback
- visible provenance for what was retrieved
- policy-gated change requests
- then hot trace buffer and compiler candidates

## Internal Law

Every successful action should strengthen the network.

The community agent exists to make that true without violating privacy, authority, or trust.

## Amendment v1.1 (2026-07-01)

This amendment refines the agent operating model after the memory-surface work
(rail preview + full graph) shipped and the activation gap was measured. It
supersedes earlier language where noted. Everything else in v1 stands.

### One Agent, Four Roles

There is one community agent entity per community: one runtime, one filesystem,
one audit trail. Roles are system prompts and skill sets on that entity, not
separate services. This makes concrete the v1 rule "separate prompts or agent
personas for each pass."

```txt
Sleep roles (heartbeat/event-woken, owner-sponsored):
1. Observer   - triages the compiler window: meaningful, novel, repeated,
                sensitive, private? (the ingress/compiler filter questions)
2. Questioner - the reflection pass: what could the community learn, what is
                the rejected alternative, what would falsify this? Produces
                learning envelopes; surfaces contradictions and open questions.
3. Steward    - judges and writes through the airlock; nurtures the directory:
                merge near-duplicates, mark stale, flag contested, lint,
                regenerate overviews. Posts one-way announcements.

Serve role (member-triggered, realtime):
4. Concierge  - answers member questions in community chat from the directory
                and resources, with citations. Read-only.
```

### The Two-Authorities Invariant

> The roles that can write memory cannot be spoken to.
> The role that can be spoken to cannot write memory.

Sleep roles hold write authority via the airlock and wake only from heartbeats
and events; no member or admin prompt can steer them. The Concierge holds chat
voice and zero write authority. A prompt injection in chat can at worst produce
a bad chat reply; it can never reach the directory except the long way — traces
through the compiler and its gates. This refines (does not break) the v1 rule
that no human prompts the community agent: the rule always protected the write
path, and it still does.

### The Cycle Ledger

Sleep roles run as chained passes sharing one per-cycle working document in the
agent filesystem (alongside /compiler and /directory). Observer writes triage
notes; Questioner reads them and appends reflections; Steward reads both and
acts. Every role can see the compiler window, the directory, and each other's
notes. Nothing is hidden between roles; the ledger persists with the run record.

### Promotion Policy (supersedes one-tap accept)

Agent-proposed create_node candidates are auto-decided and auto-applied at
status "promising" in the same cycle, with guardrails:

- per-cycle cap on applied nodes
- duplicate check against the existing directory before apply
- "repetition is not evidence" lint: high-frequency, low-outcome claims are
  flagged, not promoted
- person provenance edges are written at apply time (node -> contributing
  members, derived from source traces)

Promotion above "promising" is earned, not clicked: validated by outcome
evidence, canonical by sustained validation. Owners retain curation verbs
(deprecate, mark contested, fast-track promote) as optional tools, never as a
gate the loop depends on. There is no member-facing accept/reject queue.

### Agent Identity

The community agent has its own account on Polynet:

- its own user handle, taggable in community chat (@mention is the Concierge
  invocation path)
- its own display name and avatar; only the community owner can name it
- a permanent, non-removable agent badge on every surface where it appears,
  regardless of name — it must never be mistakable for a human member
- no login credentials; it cannot authenticate, join other communities, or be
  operated interactively
- all chat it produces is attributed to this identity (Concierge answers and
  Steward announcements); all directory writes remain attributed through the
  existing actor/provenance fields

The agent is a visible participant in the community's transactive memory, not
hidden machinery.

### People in the Graph

Knowledge topology is the spine; members are a lens. Member identities never
become structural nodes in the memory graph (power-law contribution makes
person-hubs collapse force layouts, and provenance is not meaning). The people
layer renders as an overlay: contributor halos, per-member local subgraphs,
expertise routing for open questions — built on the person provenance edges the
Steward writes at apply time. Recognition surfaces on profiles and provenance,
never as node size in the communal graph.

### Economics (resolved 2026-07-01)

Two payment lanes, split by what the spend produces:

- Memory is founder-funded. The directory is the community's compounding
  asset and the founder owns that asset, so cycle inference runs on the
  owner's connection. Defaults: on wherever the owner has a usable
  connection, capped at two cycles per day, with an owner off-switch
  (communityAgentConfigs.agentEnabled).
- Chat is asker-funded. A member who tags the agent pays for the answer from
  their own connection; the wallet is the rate limit. The Concierge speaks as
  the agent's identity but bills the asker — and therefore retrieves only
  what the asker is permitted to see (requester-pays and requester-scoped
  visibility are the same boundary).

### Cadence (resolved 2026-07-01)

A memory sweep runs every six hours: refresh the community's compiler digest
(deterministic, free), settle metabolizer scores from retrieval/outcome
signals, then knock for a cycle ten minutes later. The knock is triple-gated
before any tokens can be spent — owner off-switch, daily cycle cap, and a
delta check (new raw signal since the last successful observer pass;
unchanged material never re-wakes the roles) — and the heartbeat's evidence
gate has the final word. Frequency controls worst-case latency only; the
gates own cost.

### Decisions Pending

- Concierge evidence reach: directory + resources first; raw archive search
  later, behind guardrails (the archive RAG lane is the recorded attack
  surface).

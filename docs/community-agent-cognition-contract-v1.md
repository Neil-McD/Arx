# Community Agent Cognition Contract v1

Status: planned architecture
Scope: product architecture, memory system, community agent loop
Last updated: 2026-05-15

## Purpose

This document captures the product architecture direction for Polynet's next collective intelligence system.

The core idea:

> Members act through personal agents. Communities learn through community agents.

This document defines the intended architecture for community cognition, memory compilation, and future workflow improvement. It is not an inventory of the current implementation. Current code must be evaluated against this contract, not the other way around.

## Irreducible System

PolyNet is trying to answer one question:

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
| Events | yes | yes | only descriptions, summaries, or recaps | yes | only learnings, decisions, repeated coordination patterns, or event-derived outcomes |
| Members | yes | carefully and permissioned | mostly no | yes, aggregated or explicit contribution signals | expertise nodes later, opt-in and evidence-based |

Rules:

- Everything can become a permissioned source trace.
- Some text-heavy sources can be embedded for recall.
- Most activity should never become directory truth.
- Directory entries are narrow, accepted community intelligence.
- Raw archive and embeddings can support evidence search, but they are not validated community intelligence.
- Workflow retrieval should prefer accepted directory intelligence, then fall back to archive evidence when needed.
- Events and members are mostly structural context and graph references, not blob-search content.

## Direct Surface Read Tools

Do not force every community surface through the compiler window. The compiler window answers:

```txt
What changed recently?
```

Dedicated surface tools answer:

```txt
What canonical surface state or evidence should the agent inspect now?
```

This layer is deferred until the compiler/window boundaries are stable, but the intended split is:

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
- cross-community learning must be anonymized and explicitly allowed

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
- Public source trace writes cannot impersonate product-owned sources such as chat, AI Feed, resources, workflow runs, tool calls, artifacts, or outcomes.
- Product-source traces are bridge-owned. `chat`, `ai_feed`, `resource`, event-derived, workflow-derived, and outcome-derived traces must come from their product/runtime bridge code.
- Public source trace writes cannot claim `agent`, `compiler`, or `system` actor identity.
- AI Feed agent publication is governance-scoped in this slice so normal members cannot create fake `Community agent` evidence.
- Daily compiler digest reruns update digest contents without rewriting original creation attribution.

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

- The digest-to-candidate pass creates only `communityIntelligenceChangeRequests`.
- Directory truth is still untouched: no direct `communityIntelligenceNodes` or `communityIntelligenceEdges` writes.
- Candidate change requests use `operation: create_node`, `status: pending_decision`, and `createdByActorType: compiler`.
- Candidate payloads default to `status: candidate` and `visibilityScope: admin`.
- Digest `sourceIds` are clues; resolved `sourceTraceIds` are formal evidence.
- The candidate pass resolves digest source ids into `communitySourceTraces` before creating the change request.
- If formal trace evidence cannot be resolved, the candidate stays honest: `sourceVisibility: redacted`, lower evidence strength, and a `needs_trace_resolution` tag.
- If a manager edits the candidate title/body during proposal creation, the payload records override metadata separately from the compiler output.
- `pending_directory_decision` digest items are rejected because they are already inside the airlock.
- `member_state` digest items may only create `open_question` candidates. They must not create people scoring, private behavioral judgments, or expertise nodes.
- Duplicate proposals for the same digest item should reuse the existing non-rejected change request instead of spamming the airlock.

## What Not To Build Yet

Do not start with:

- giant graph database
- full autonomous community god-agent
- automatic cross-community learning
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

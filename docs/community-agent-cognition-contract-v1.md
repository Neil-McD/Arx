# Community Agent Cognition Contract v1

Status: staging architecture; canonical five-tool boundary implemented
Scope: product architecture, memory system, community agent loop
Last updated: 2026-08-08

> **AI Feed retirement:** AI Feed is no longer a live product, repository, agent,
> compiler-input, or MCP surface. Historical AI Feed lineage and schema remain
> migration substrate until the bounded retirement census and data cleanup are
> complete. Any older AI Feed language below is historical context and does not
> authorize new reads, writes, UI, routes, tools, prompts, or memory admission.

## Purpose

This document captures the product architecture direction for Polynet's next collective intelligence system.

The core idea:

> Members act through personal agents. Communities learn through community agents.

This document defines the intended architecture for community cognition, memory compilation, and future workflow improvement. It is not an inventory of the current implementation. Current code must be evaluated against this contract, not the other way around.

## Current Runtime Boundary

There is one canonical community-agent identity with two runtime surfaces. The
member's private agent dock is not one of them; it is a client of the member's
personal agent runtime under the active community lens.

1. `member_agent_dock`
   - belongs to the signed-in member, not the community
   - is exposed only inside an authenticated community surface; Discover,
     settings, docs, onboarding, and operator pages have no member-agent dock
   - uses one stable private channel per member across Polynet; the channel points to one active hidden conversation episode backed by the existing thread/message runtime
   - every turn carries a bounded community-surface snapshot identifying the exact section
   - the active episode thread holds the required server-validated community lens; changing communities changes the lens for subsequent turns without changing the agent, channel, episode, or prior messages
   - the server rejects community surface snapshots that do not match the thread's validated lens; page context guides relevance but never grants authority
   - every runtime run captures immutable surface context plus community-lens id and context-version provenance before execution
   - `Start fresh conversation` closes the active episode and atomically moves the channel to a fresh episode without deleting or exposing a picker for prior transcripts
   - community deletion makes that community unavailable as a future lens but does not close the member's global channel or episodes
   - platform-hosted through the community's active Builder subscription or
     canonical operator grant and server-bound to an authorized community lens;
     members never supply inference credentials
   - the server constructs bounded conversation history from persisted messages through the exact user message that started the turn; browser-supplied history is never authoritative
   - prior episodes are never injected automatically; the dock can list bounded episode metadata and read one bounded private transcript only through member-owned recall tools
   - recall spans the member's global episodes and retained legacy per-community episodes, returns lens provenance with user and assistant text, fails closed across members, and requires transcript evidence before the agent claims prior conversational memory
   - retained legacy per-community episodes are read-only recall artifacts: no client gateway or public mutation may create, rotate, message, or execute them
   - transcript loads commit only while their signed-in member generation and thread remain active
   - receives the canonical five Polynet repository tools; community context
     and authority are resolved by the server on every operation
   - can publish to authorized community chat paths only when the
     signed-in member explicitly requests it
   - cannot invoke workspace, Daytona, third-party MCP, or autonomous cognition
     actions

The community-owned runtime surfaces are:

1. `member_concierge`
   - entered from a direct community-agent mention
   - funded only by an active $79 Builder subscription attached to that community,
     or by the active platform-owner grant without a subscription
   - revalidates community access and source visibility for every turn
   - receives the same canonical five Polynet repository tools as the personal
     harness and official MCP
   - is server-mounted to exactly one community and always operates in the
     member lane, even when the operational sponsor is an owner or admin
   - can publish to that community's chat with community-agent
     attribution
   - cannot access builder paths, write retained community memory directly, or
     invoke autonomous cognition

2. `autonomous_cognition`
   - entered only from internal heartbeat/event triggers
   - community-owner-funded
   - operates on the community compiler and directory filesystem
   - only the Steward role receives the atomic compiler-memory write tool
   - cannot be directly prompted by a member or administrator

Both community-owned surfaces resolve community identity, owner/config state,
agent display identity, and community-wide instructions through the same
canonical context resolver. The Concierge uses the public five-tool repository
contract. Autonomous cognition retains only its private compiler operations;
those are not public harness tools and do not widen Concierge authority.

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
   - produces bounded learning candidates for deterministic retention

4. Retention policy
   - validates citations, provenance, community scope, privacy, and dedupe state
   - assigns incomplete or higher-risk output to forming memory instead of an
     approval queue

5. Community intelligence directory
   - stores retained reusable knowledge
   - visible, editable, inspectable, and linked to evidence

6. Retrieval layer
   - injects the right retained intelligence into the current workflow
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
Compiler = time-windowed interpretation
Directory = retained compiled intelligence
Retrieval = action-time memory routing
```

Temporal handling:

```txt
0-30 days = compiler window / community working memory
30+ days = long-term memory retrieval only
```

The compiler window is not a context dump. It is the bounded working set the community agent can inspect, filter, rank, summarize, and compile from. Activity older than the compiler window should only matter through retained directory intelligence, source traces, canonical source search, resources, outcome-linked memory, or other long-term retrieval systems.

Surface handling:

| Surface | Raw canonical record | Source trace | Compiler input | Directory role |
| --- | --- | --- | --- | --- |
| Chat | yes | selected or high-signal messages | yes | only extracted decisions, insights, questions, warnings, examples |
| AI Feed | yes | yes | yes, weighted by signal ranking | only promoted posts or patterns |
| Resources | yes | yes | yes, especially for stale or contradiction checks | usually reference material; sometimes source-backed playbook or resource node |
| Workflow runs / artifacts | yes | yes | yes | successful examples, failures, workflow improvements, validated patterns |
| Outcomes / feedback | yes | yes | yes, high priority | support, contest, validate, or falsify patterns |
| Calls / transcripts | yes | yes | yes | decisions, insights, repeated questions, warnings, examples |
| Events | yes | only when there is recap/transcript/decision/outcome evidence | context-only unless evidence-bearing | only learnings, decisions, repeated coordination patterns, or event-derived outcomes |
| Members | yes | only explicit contribution or aggregate state signals | context-only and aggregate-first | expertise nodes later, opt-in and evidence-based |

Rules:

- Everything can become a permissioned source trace.
- Text-heavy sources remain readable through their canonical source tools.
- Most activity should never become directory truth.
- Directory entries are narrow, retained community intelligence.
- Raw activity can support evidence search, but it is not validated community intelligence.
- Workflow retrieval should prefer retained directory intelligence, then fall back to raw activity evidence when needed.
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

This layer should arrive surface by surface as each boundary becomes stable. The platform-harness resource surface uses canonical semantic list/read for ordinary traversal, plus explicit batch-read and search operations where those capabilities are physically required. Canonical chat and AI Feed evidence now have typed search/read paths for the community agent, community Concierge, and external workspace MCP. Member runs see live modules and pages only; manager runs can additionally inspect builder-visible draft/source/health state. Neither lane exposes raw storage keys. Events and members remain deferred until their source and privacy contracts are equally clear.

| Surface | Future direct read role | Compiler-window role |
| --- | --- | --- |
| Chat | query recent/raw conversation evidence when needed | core live activity signal |
| AI Feed | inspect ranked agent/community signals | core live activity signal |
| Resources | search/read durable reference evidence | low-priority resource added/updated/stale signal |
| Events | list/read scheduled, completed, cancelled, or changed events | coordination change signal |
| Members | read aggregate member state, roles, joins, and explicit public contribution signals | aggregate community-state signal |

Resources should not be treated as normal activity blobs. They are durable reference evidence. The compiler window should know that a resource was added, updated, reused, stale, or contradictory; the agent should use a dedicated resource read/search path when it needs the actual resource content.

### Canonical resource source nodes

A member-visible page in a live resource module enters community memory without
an approval gate. Its canonical Markdown remains directly readable through the
resource tools, while one versioned `resource` source trace supports compiler
admission and lineage. Derived synchronization never blocks publication or
graph visibility.

The Polynet overview projects the canonical resource row as a first-class
`resource_node` immediately. This is a source node, not a learned claim: it has
stable `resource:<communityResourceId>` lineage and `source` status, but no
fabricated confidence, evidence grade, or authorship credit. The projection does
not create or update `communityIntelligenceNodes`; only compiler-retained
learnings use that directory table. Public visitors may see the anonymous graph
shape, while titles, URLs, bodies, and recorder identity remain inside the
authorized community lens.

If a selected retained memory cites the readable canonical resource trace, the
overview projects one deterministic `derived_from` edge from that learned node
to the resource node. The relation is derived at read time from existing
`sourceTraceIds`, bounded per node and in total, and filtered through the same
community and trace-visibility rules. It stores no parallel graph record and
exposes neither the trace id nor resource content.

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
- select high-signal compiler learnings for atomic retention
- promote operational patterns through evidence and outcome validation
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
  -> deterministic evidence/privacy retention policy
  -> community memory
```

Personal agents execute. The community agent learns. The compiler distills. The
Steward selects, and deterministic policy assigns retained versus forming state.

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
Community Memory = what this community has learned and retained for reuse.
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
- raw activity evidence when needed
```

The source of each context item should remain distinguishable. The system should know whether context came from personal memory, accepted community intelligence, raw activity evidence, or the current workflow.

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
Atomic validated retention = community intelligence
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

Sub-agents may suggest learnings, but only the trusted compiler-memory core may
write directory state, with immutable citations and deterministic policy.

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

The directory should be the accepted community memory surface. It should not be a raw activity browser.

Canonical source search may support the directory by providing evidence and fallback retrieval.

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
5. Require citation-backed, privacy-bounded autonomous retention for canonical promotion.
6. Allow members to contest memory.
7. Allow opt-out and scope controls.
8. Do not create hidden social scores.
9. Do not expose raw private traces as community evidence.
10. Do not let the community agent become a centralized epistemic authority.
11. Do not let personal memory leak into community memory without explicit policy and promotion.
12. Do not treat raw evidence search as validated community intelligence.

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
8. PatternCandidate generation and immutable compiler digest handoffs.
9. Weekly lint for stale, contradicted, and open patterns.
10. Community agent heartbeat.

Automation comes after the manual loop proves that retrieved community intelligence improves workflow output.

## First Implementation Slice

The first backend slice implements the directory substrate before compiler automation:

- `communitySourceTraces`: permissioned evidence records.
- `communityIntelligenceNodes`: compiled intelligence entries that have crossed the write gate.
- `communityIntelligenceEdges`: typed operational links between nodes and references.
- `communityIntelligenceMutations`: append-only audit trail for directory truth changes.
- `communityIntelligenceChangeRequests`: immutable validation and audit records
  for memory changes; routine compiler memory does not wait there for approval.
- `communityIntelligenceRetrievalLogs`: action-time retrieval provenance.
- `communityOutcomeObservations`: evidence about whether retrieved intelligence helped.

The slice intentionally keeps writes narrow:

```txt
No freeform prompt mutates directory truth.
Activity and outcomes become evidence or change requests before they can become directory truth.
Only typed admin/manual mutations can create or change intelligence nodes and edges directly.
Agent and compiler actors select digest learnings; the trusted directory core
validates and atomically mutates canonical truth.
Every node/edge truth mutation writes an audit record.
Draft/candidate intelligence is manager-visible forming memory until evidence
or outcomes justify promotion.
Change request application rejects stale targets when the target node or edge changed after change request creation.
```

The retrieval path is deterministic metadata and lexical retrieval over canonical records.

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
- AI Feed publication is the explicit moderator-authorized promotion event into compiler evidence; it is not accepted directory truth.
- The trace is keyed by `communityId + sourceType + sourceId` so retries and `noveltyKey` reuse do not duplicate evidence.
- Missing `agentKey` remains unattributed and receives no invented agent credit. `authorUserId` records the accountable sponsor, not authorship.
- Compiler input reads recent source traces, ranked live AI Feed signals, and recent outcome observations.
- Compiler projections deduplicate the live post, source trace, and archive record by canonical `ai_feed:<postId>` identity so one publication is one semantic signal.
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
- Chat and Resources may enter through archive activity. AI Feed uses the ranked
  canonical live-post projection first; source-trace and archive copies are
  retained only as fallback/governance projections and are deduplicated.
- Source traces, ranked AI Feed signals, live event updates, and outcomes are included as compiler working state.
- The compiler window is manager-scoped in this backend slice because it exposes internal compiler evidence.
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
- The pass is idempotent per community and canonical digest version so retries
  do not spam duplicate work artifacts.
- Digest items are bounded and typed: chat activity, AI Feed signal, resource activity, event activity, member state, outcome signal, and source trace signal.
- Learning digest items should be generated from signal-bearing sources: chat, AI Feed, resources, outcomes, source traces, transcripts, feedback, workflow runs, and artifacts.
- Event scheduling, member joins, presence, reactions, and generic activity are excluded from learning digests unless they produce evidence-bearing traces such as transcripts, feedback, outcomes, decisions, artifacts, or workflow records.
- Digest items may point at source ids or source trace ids, but they do not mutate `communityIntelligenceNodes`, `communityIntelligenceEdges`, or `communityIntelligenceChangeRequests`.
- The digest is manager-scoped in this backend slice because it exposes internal compiler state.

## Fifth Implementation Slice

The fifth backend slice hardens authority over source evidence:

```txt
Product source tables
  -> trusted bridge-owned source traces
  -> bounded compiler admission packets
  -> exact versioned digest work
```

Rules:

- There is no public raw source-trace mutation. Evidence enters only through a source-specific product bridge.
- Product-source traces are bridge-owned. `chat`, `ai_feed`, `resource`, workflow-derived, artifact-derived, outcome-derived, feedback-derived, and transcript-derived traces must come from trusted product/runtime bridge code.
- There is no generic internal product-source trace mutation. Source-specific bridges must validate their own authority and call the trusted source-trace core helper directly.
- The trusted source-trace bridge requires a stable product `sourceId` and defaults new product-owned evidence to admin visibility unless the product path explicitly widens it.
- AI Feed agent publication is governance-scoped in this slice so normal members cannot create fake `Community agent` evidence.
- Compiler reruns reuse identical immutable digest versions and create a new
  version only when canonical work or material evidence content changes.
- Direct canonical directory node/edge writes are internal repair infrastructure only. They are not public community product APIs.
- Public member/admin APIs may create evidence, outcomes, retrieval logs, and policy-gated change requests; they must not impersonate the community agent, compiler, or system.

## Sixth Implementation Slice

The compiler-memory path connects non-canonical digests to retained directory memory:

```txt
Compiler digest
  -> selected digest item
  -> evidence and policy validation
  -> atomic audit-ledger record plus directory apply
```

Rules:

- The digest-to-memory pass is an internal compiler/community-agent operation.
- It records a `communityIntelligenceChangeRequests` audit row and applies the
  canonical directory mutation in the same transaction; no human acceptance is
  required and no intermediate pending state is externally observable.
- Fully resolved, community-readable, low-risk evidence lands as `promising`
  community memory. Incomplete or higher-risk output lands as admin-visible
  `candidate` memory instead of blocking on approval.
- Public admin decisions remain repair/override paths for legacy or manually
  proposed changes, not a dependency of autonomous cognition.
- Digest `sourceIds` are clues; resolved `sourceTraceIds` are formal evidence.
- The candidate pass resolves digest source ids into `communitySourceTraces` before creating the change request.
- If formal trace evidence cannot be resolved, the candidate stays honest: `sourceVisibility: redacted`, lower evidence strength, and a `needs_trace_resolution` tag.
- `event_activity` and `member_state` digest items are not learning candidates. They should not create directory proposals unless converted into evidence-bearing source traces by another product bridge.
- Duplicate retention attempts for the same canonical work key must reuse the existing audit record and applied node.
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
  -> atomic compiler-memory retention
```

Rules:

- The filesystem is internal-only. It is not exported as a public member/admin prompt surface.
- Every operation is scoped to exactly one community-agent filesystem context.
- The filesystem context must include the canonical `communityId` and canonical `agentKey`, must resolve to an existing community, and preserves optional run/heartbeat ids in tool metadata for provenance.
- The only accepted v0 community-agent identity is `community_agent`; the filesystem must reject non-canonical agent keys.
- Filesystem tools inherit community scope from this context. They must not accept `communityId` as a loose per-operation argument.
- The root exposes only `/compiler` and `/directory`.
- `/compiler` exposes bounded compiler state: latest window summary and digests.
- `/directory` exposes long-term intelligence state: nodes, edges, and change requests.
- The filesystem does not expose raw `/activity`; activity must flow into compiler evidence first.
- The write operation is deliberately narrow: retain one compiler digest item.
- The backend creates or reuses the audit row and applies the directory mutation
  atomically through the trusted core.
- Retention records created through this surface are attributed to the community agent, not a member prompt.

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
- This gives the community compiler sensory input from actual work while preserving the evidence -> compiler -> typed directory-write boundary.

## Ninth Implementation Slice

The ninth backend slice adds the first internal community-agent runtime loop:

```txt
Internal trigger
  -> single community-agent run ledger
  -> owner-sponsored ChatGPT inference
  -> native tool loop
  -> community-agent filesystem tools
  -> typed atomic directory writes only
```

Rules:

- The runtime is internal-only. There is no public member/admin prompt action for the community agent.
- Every run belongs to exactly one `communityId` and the canonical `agentKey`: `community_agent`.
- The runtime derives the community-agent identity from platform code. It must not accept `agentKey` as caller input.
- The sponsor is the community owner. The runtime must not use platform/global fallback inference.
- The runtime may use only four tools: `list`, `read`, `search`, and `write`.
- Tool execution is bound to the single-community filesystem context: `communityId`, canonical `agentKey`, `runId`, and optional `heartbeatId`.
- The runtime sees only `/compiler` and `/directory`; it does not read raw `/activity`.
- The runtime write is only `retain_compiler_digest_item`.
- Runtime writes create or reuse immutable audit records and atomically apply validated memory.
- The runtime must not directly insert or patch `communityIntelligenceNodes` or `communityIntelligenceEdges`.
- Each run is persisted in `communityAgentRuns` with sponsor, model, status, stop reason, tool count, applied memory ids, and timestamps.
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
  - oldest pending evidence is at least 6 hours old
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
- The digest pass consumes selected pending source traces only. Surface archives remain retrieval indexes and must not become a second compiler signal for the same interaction, AI Feed post, resource, or outcome.
- A `source_trace_signal` digest item represents distinct selected pending
  traces that the pass handled. An AI Feed promotion trace is consumed with its
  canonical AI Feed signal and must not create a second digest signal.
- Selected source traces are marked `compiled` only after the digest row exists.
- The compiled patch sets `compilerLastHandledAt` and `compilerLastDigestId`.
- The compiled patch stays inside the same explicit `communityId`.
- The compiled patch must not use `communityCompilerDigests.windowEndedAt` as a cursor.
- Unselected source traces remain `pending`.
- The pass does not auto-dismiss low-signal traces yet.
- The pass does not set `carried_forward` yet.
- Each selected source trace is attached to one persisted immutable digest
  version before it is marked compiled; later compiler passes create or reuse
  their own version instead of rewriting that evidence artifact.

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
- Directory mutation still requires the typed filesystem write and canonical
  evidence policy; it does not require human or later-cycle approval.

## Fourteenth Implementation Slice

The fourteenth backend slice closes the first member-agent consumption loop:

```txt
Retained directory intelligence
  -> member-agent community memory tools
  -> cited guidance inside a community-lensed turn
```

Rules:

- Member-agent memory tools are exposed only through the existing `community_tools` capability family.
- The tools derive community scope from the active server-validated community lens. They must not accept a loose `communityId` argument from the model.
- `community_memory_search` searches retained community intelligence in `communityIntelligenceNodes`; it is not raw evidence search.
- `community_memory_search` returns only `promising`, `validated`, and `canonical` statuses. Draft and candidate entries may remain visible to managers in directory-management surfaces, but neither members nor managers may inject them through the agent memory tools.
- `community_memory_read` reads one accepted node and a bounded visibility-filtered subgraph bundle, then marks the node as injected in the same retrieval receipt created by search.
- Compiler-derived memory must revalidate its immutable source traces and active citation lifecycle for every viewer. Manager authority may widen visibility to admin evidence, but it must never bypass redaction or citation revocation.
- A returned subgraph edge must have an accepted, currently readable neighbor. The read tool must not leak edge metadata for a hidden, stale, draft, revoked, or otherwise unreadable neighbor.
- Native member-agent and Concierge tools currently expose accepted-memory search and read only. They write retrieval receipts but do not expose a separate outcome tool.
- The external MCP may record whether one injected community-memory node worked, failed, or was mixed. It requires the same viewer, community, `external_mcp` surface, and `community_memory_retrieval_receipt:v1` receipt that injected that explicit node. Manager authority never bypasses receipt ownership.
- Consumption tools may write retrieval receipts, and the external MCP outcome tool may write outcome observations. They must not directly create or patch `communityIntelligenceNodes` or `communityIntelligenceEdges`.
- The active-community context tool may expose a tiny memory orientation block with counts and recent validated titles, but it must not dump directory contents into the prompt.
- Runtime prompt policy must distinguish retained community memory from raw activity evidence: use `community_memory_search` for what the community has learned, use `community_search` for unvalidated recent activity evidence.
- Raw evidence may support a new memory change only through the immutable citation and apply-time revalidation rules in `docs/community-evidence-integrity-contract-v1.md`; source traces are candidates, never authority.
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
- Runtime memory lookup remains deterministic and non-LLM. Broader evidence search may assist other flows, but it is not canonical directory truth.

## Deleted Approval Plane

The earlier implementation used a multi-cycle approval loop:

```txt
Compiler-derived pending candidate
  -> community-agent filesystem write
  -> agent decision
  -> accepted/rejected airlock state
  -> accepted change request apply
  -> directory mutation log
```

That loop is now deleted from the community-agent tool surface. The Steward has
one memory write operation: select a compiler digest item. The backend then
validates citations, community scope, provenance, privacy, and dedupe state and
atomically records and applies the result. Legacy/manual change requests may
still use explicit decision APIs, but autonomous compiler memory never waits on
them.

The compiler window, compiler inputs, compiler digest, filesystem, heartbeat
results, run summaries, health probe, and Polynet projection must not expose or
count pending/accepted/rejected approval state. `communityIntelligenceChangeRequests`
remains the immutable audit substrate, not an autonomous
approval queue. Historical `communityAgentRuns` approval-array fields remain
optional schema compatibility only until old rows are cleared; new runtime code
must write and return only `appliedChangeRequestIds`.

## Canonical Memory Work Identity

Autonomous compiler memory has one identity contract:

```txt
community + compiler category + canonical evidence ids
  -> community_memory_work:v1:<sha256>
  -> one audit row
  -> one applied directory lineage
```

Rules:

- Every new compiler digest item carries a deterministic `workKey`.
- The canonical identity sorts and deduplicates source types, source ids, and
  source trace ids before hashing, and includes the explicit `communityId` and
  digest category.
- Mutable presentation and decision fields do not define identity: digest id,
  array position, title, summary, confidence, and requested node type are
  excluded.
- The agent write accepts `digestId + workKey`, locates the item by key, and
  re-derives the key before any mutation. Array position is not an API.
- `communityIntelligenceChangeRequests.workKey` is indexed by community. The
  trusted writer performs indexed create-or-reuse and the atomic directory
  apply inside one Convex transaction.
- An existing applied key returns the existing lineage. Duplicate indexed rows,
  incompatible operations, invalid keys, missing evidence identity, and
  cross-community mismatches fail closed.
- Historical digest and audit rows may omit `workKey` for schema compatibility,
  but new autonomous writes must not fall back to payload scans or positional
  identity. Old working digests are regenerated by a new compiler pass.

## Canonical Compiler-to-Agent Handoff

Compiler work and agent work are different durable facts:

```txt
pending source evidence
  -> immutable digest content keyed by its sorted work keys
  -> pending/running/handled agent handoff
  -> exact digest-version Steward pass
  -> autonomous retention or deliberate no-op
```

Rules:

- Pending eligible source traces decide whether the compiler has work.
- A non-empty immutable digest version in `pending` state decides whether the
  community agent has work. Raw source timestamps and last-observer timestamps
  are not wake cursors.
- `communityCompilerDigests.versionKey` is derived from the explicit community,
  sorted canonical item work keys, bounded item content, and source-trace
  revision timestamps. Digest content is immutable for that version; retries
  reuse it instead of mutating a daily snapshot. A material evidence update
  creates a new handoff version without changing retention identity.
- The handoff state is autonomous execution state, not approval governance.
  `pending` is claimable, `running` has a bounded lease, and `handled` is
  terminal for the exact version.
- A failed steward run returns the digest to `pending` and increments
  `agentRetryCount`. The fifth failure marks it `handled` with
  `agentTerminalReason: "retries_exhausted"`, so a broken run cannot bill the
  community on every heartbeat. `agentAttemptCount` still counts every claim.
  The exhausted digest's pending source traces move to
  `compilerState: "agent_retries_exhausted"` so the compiler admits newer
  evidence instead of rebuilding the same digest; a material update to a trace
  returns it to `pending`.
- The steward settles every item of the digest in one write, so its output
  limit grows with the digest: 2,000 tokens plus 450 per item, capped at 48,000.
  Reasoning counts against the same limit. A tool call cut off at the limit is
  reported as `model_output_truncated`.
- A heartbeat rechecks the owner off-switch, daily cycle cap, and founder
  connection before inference. It then compiles eligible evidence if needed,
  claims one exact digest version, and passes `digestId + versionKey + workKey`
  coordinates into the Steward pass.
- A claimed Steward filesystem context is bound to that digest id and
  version. Compiler window/list/read/search and retention writes must not cross
  into a different digest, and every tool call must still match the running
  heartbeat claim.
- The heartbeat's compiler mutation rechecks the evidence trigger in its own
  transaction. If a concurrent compiler already consumed the evidence, the
  losing mutation creates no second digest handoff.
- A completed Steward pass with durable decisions for every item marks the
  exact handoff handled. Known failures return it to pending; abandoned running
  claims become retryable after the lease.
- The sweep never compiles evidence itself and never uses an arbitrary delay.
  It settles deterministic metabolizer state independently, then immediately
  schedules only planner-approved agent work.
- Historical mutable daily digests have no version or handoff state and are
  never claimed as autonomous work.

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
- Each run should preserve compact `appliedChangeRequestIds` for memory writes
  the community agent successfully performed.
- The runtime should collect these ids only from successful `write` tool outputs.
- Skipped runs should persist an empty applied-action array.
- Existing historical run rows may not have the applied-action field, so readers must default a missing array to empty.
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
- Memory-to-resource `derived_from` edges are bounded read projections of existing readable source-trace lineage; they are not stored as parallel graph truth.
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

- The tab consumes `communityIntelligenceDirectory:getCommunityPolynetOverview`; it does not call retired archive APIs.
- The tab is read-only in this slice. It must not expose write buttons, prompt boxes, review queues, candidate decisions, or directory mutation controls.
- The graph renders backend-projected nodes and edges only. It may include the synthetic community root node returned by the overview, but it must not create fake memory nodes.
- The tab shows the community agent as status/activity derived from the `communityAgentRuns` ledger.
- The tab shows selected-node metadata from the overview projection, not raw traces or compiler internals.
- Polynet tab visibility follows community view access because this is now a member-safe memory surface, not a manager-only archive operations panel.
- Retired archive maintenance controls are not part of the Polynet memory tab.

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
- This fixture is a product-readiness check for the visible memory surface. Live directory mutations still flow through the community-agent filesystem and typed atomic write gates.

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
  -> indexed due-work discovery
  -> settle scores only for outcome-dirty communities
  -> assess only pending compiler or handoff communities
  -> enqueue immediate heartbeat
  -> heartbeat evidence gate decides whether roles wake
```

Rules:

- The sweep never enumerates the first N communities. It joins bounded indexed
  due work from community outcome revisions, pending compiler traces, and
  pending or stale digest handoffs.
- A new canonical outcome increments the owning community's metabolism
  revision and marks it pending in the same mutation.
- Settlement runs for the same explicit `communityId` and clears pending only
  when the observed revision is still current. Newer concurrent outcomes leave
  the community pending for the next sweep.
- Metabolism and compiler assessment are independent. A memory-only target
  never pays for compiler assessment; a compiler-only target never runs the
  metabolizer.
- Metabolizer failure does not block compiler work for the same community;
  derived score settlement is learning pressure, not the wake gate.
- The sweep returns compact target, settlement, metabolized, and enqueue
  diagnostics. Changed-node audit remains in `communityIntelligenceMutations`;
  run/no-op/error audit lives in `communityMemoryMetabolizerRuns`.

## Twenty-Third Implementation Slice

Concierge intake ledger turns community-agent mentions into auditable serve
requests at birth-time intake:

```txt
human creates a canonical community root/reply
  -> classify the source turn: explicit mention, direct agent target, or ignore
  -> explicit mentions also create communityInteractionMentions[pending, community_agent]
  -> validate source and requester
  -> require requester access and resolve community funding
  -> insert one communityAgentServeRequests row for the source turn
  -> settle any mention as sent or suppressed
```

Rules:

- This slice is intake only: No LLM, no reply, no memory write.
- A queued serve request must have `sponsorUserId == requesterUserId`; this is the member tool-authority principal, not the payer.
- An active founder subscription attached to the community resolves the current
  owner as payer and the subscription as the server-side Luna funding authority.
  The canonical operator grant is the only non-Stripe authority. An attached
  inactive subscription fails closed and never falls back to a stored credential.
- `communityInteractionMentions.notifyState` is only the narrow drain marker for agent mentions:
  - `pending` = intake has not processed this mention
  - `sent` = intake accepted it into `communityAgentServeRequests`
  - `suppressed` = intake rejected/skipped it deterministically
  - `read` = user-mention lifecycle only
- The serve lifecycle itself lives in `communityAgentServeRequests`, not in `notifyState`.
- Fresh human-authored roots and replies enter one source-turn intake after the
  canonical interaction exists. An explicit mention and direct agent target are
  signals for that same intake, not separate jobs. A direct agent target is
  either `targetReplyId` pointing to a live reply authored by the canonical
  community-agent identity or an untargeted reply under a root authored by
  that canonical identity. Targeting a human,
  a general comment under a human-authored root, or prior agent participation
  elsewhere in the thread does not invoke the agent without an explicit mention.
- Community-agent mention intake has no polling repair drain. The canonical
  human composer creates the mention row and enters source-turn intake in the
  same atomic mutation; a scheduling failure rolls the write back instead of
  leaving a second authority to discover it later.
- `insertCommunityInteractionMentionRows` is the only writer for new direct
  interaction mention rows. Bounded `@everybody` expansion remains a separate
  user-mention fanout. Content blocks cannot create mentions, and
  community-agent-authored turns cannot mention the community agent itself.
- The deletion gate was a read-only deployment census on 2026-08-13: staging
  had 8 historical community-agent mentions and production had 10, with zero
  pending or malformed community-agent mentions in either deployment.
- `invocationKey` identifies the canonical source root or reply and is the
  idempotency key across all qualifying signals. `sourceMentionId` remains an
  optional audit pointer and rolling-deploy fallback for historical requests.
- Accepted requests require a live human-authored source interaction, current
  requester chat access, enabled community agent config, and active community
  hosted-inference authority.
- Source and response visibility scopes are captured at intake so the future response path cannot guess or widen the boundary.
- Skipped requests are recorded with machine-readable `intakeReason`; no tokens are spent for skipped intake.
- Request insertion and scheduling are one atomic Convex mutation. Each accepted
  request schedules the immediate action plus a finite three-invocation delayed
  recovery budget scoped to that request; there is no fixed global serve-repair scan.

## Twenty-Fifth Implementation Slice: Concierge Serve Worker v0

Serve Worker v0 gives the taggable community agent a mouth without giving it
memory authority.

```txt
communityAgentServeRequests[queued, accepted]
  -> schedule immediate serve worker for that request
  -> claim request with attempt N and an explicit lease
  -> compile one bounded, requester-readable multi-party thread context
  -> persist the exact attempt-scoped provider messages and prompt-section receipt
  -> authorize one privacy-bounded funding receipt
  -> run GPT 5.6 Luna through the community's canonical owner funding authority
  -> insert one community-agent reply in that source thread
  -> mark request responded/error
```

Rules:

- The Concierge system prompt is compiled from canonical, uniquely identified
  prompt sections without changing its provider-visible bytes. Sequence-zero
  `context_snapshot` v2 stores the exact initial messages plus privacy-safe
  section metadata. Historical v1 remains readable, and identical-message v1/v2
  retries deduplicate safely during rolling deployment.

- This slice is serve only: it does not write source traces, compiler digests,
  directory nodes, directory edges, change requests, mutations, retrieval logs,
  outcomes, or autonomous `communityAgentRuns`. It writes only the bounded
  attempt-scoped `context_snapshot` and existing model/tool/final audit events
  under `communityAgentRunEvents`.
- The worker keeps three identities separate: requester/sponsor for access and tools,
  canonical community agent for the response identity, and current community owner
  for payment authority. `sponsorUserId` must equal `requesterUserId`; the owner
  must never become the tool principal. There is no member fallback after canonical
  community funding is active.
- Paid and operator-funded turns use fixed `gpt-5.6-luna` through Polynet's
  server-side OpenAI credential only after current funding authority is verified.
  Paid turns also require an attached subscription and open usage cycle. The global
  model default remains independent.
- Each funded request claims one idempotent `communityInferenceReceipts` row. The
  receipt records actor, payer, funding mode, grant or subscription, community,
  model, bounded token usage, and outcome but never the key, prompt, response, or
  tool output. Paid receipts also bind the pricing version, usage cycle, reservation,
  and settled raw cost.
- Provider-start is recorded before the first Luna request. A stale worker may reclaim
  only a receipt that never reached provider-start; ambiguous post-provider retries
  become `indeterminate` and cannot double-spend automatically.
- Funded usage is limited to six turns per actor/community per minute and sixty turns
  per community per minute. Paid usage additionally reserves monthly included cost
  before provider start. Missing, suspended, transferred, invalid, expired, exhausted,
  ambiguous, or rate-limited funding fails closed.
- The LLM call is a bounded native tool loop with the canonical five-tool
  Polynet surface:
  - `polynet_list`
  - `polynet_read`
  - `polynet_search`
  - `polynet_write`
  - `polynet_call`
- The community-owned agent always receives member repository authority. It
  can participate in chat and AI Feed when explicitly requested and invoke
  member operations discovered under `capabilities/`. It never receives
  owner/admin builder authority, filesystem authority, web research, or an
  arbitrary operation surface.
- The serve context resolves the requester/sponsor auth subject from the stored
  user record. Semantic and resource tools execute under that verified
  `(authSubject, userId)` pair and the single server-selected serve-request
  community. The model cannot select or escape the mount. These calls preserve
  the same requester access and resource visibility boundaries as normal
  active-community tools.
- Discovery uses `polynet_list` and `polynet_search`; exact evidence uses
  `polynet_read`. Mutations use `polynet_write` only on returned writable paths
  and `polynet_call` only on returned versioned capabilities.
- The base serve prompt is augmented by
  `communityAgentConfigs.systemPrompt`, which is the Community-wide
  instructions field in the AI Agent settings. These instructions shape the
  answer, but do not grant builder authority or override the serve/security
  rules above.
- The source thread is compiled from canonical `communityInteractionRoots` and
  flat `communityInteractionReplies`. For a reply source, the cutoff is the
  source reply sequence: future replies are never included. The root, source
  mention, and readable `targetReplyId` are retained under deterministic turn,
  participant, per-item, and total-character bounds.
- Every included turn is independently checked for current requester
  readability. Hidden, deleted, cross-thread, cross-channel, future, or
  unauthorized turns are omitted. The prompt preserves chronological speaker
  identity and flat reply relationships without creating another conversation
  store or nested-thread model.
- Human participant enrichment reuses canonical profile uniqueness, active
  community membership, role, approved platform profile spine, and the exact
  community's `member_orientation` fact lens. It never uses the wider `self`
  lens and never exposes auth, email, billing, provider, other-community,
  pending, rejected, retracted, observed-behavior, or agent-internal context.
  A departed participant's historical speech remains, but their profile
  enrichment is omitted.
- Participant orientation and thread turns are explicitly delimited as
  untrusted context. The compiled packet includes server capture time and the
  requester's timezone when available; it is the only thread packet passed to
  the provider.
- Before any funding receipt is claimed or provider call can begin, the worker
  must persist the exact initial provider messages as
  `communityAgentRunEvents.kind = context_snapshot` at sequence zero. This
  write rechecks the running attempt, requester access, live source, and source
  visibility. Snapshot conflicts fail closed; later reasoning/tool/final audit
  events begin at sequence one. Retries receive distinct attempt-scoped run IDs.
- The response is always a reply in the source thread:
  - if the source is a root post, insert `communityInteractionReplies`
    under that root
  - if the source is a reply, insert `communityInteractionReplies`
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
- One addressed source turn creates one logical serve request, one request-scoped inference
  receipt, and at most one visible reply. Attempts are process recovery for
  that same turn; a new user turn requires a new explicit mention or direct
  agent target.
- Claims store an explicit `leaseExpiresAt` and an incrementing `attempt`.
- The serve lease exceeds the maximum Convex-runtime action duration by a
  positive recovery grace window. Recovery therefore cannot fence an original
  provider-started action while that action can still settle and publish its
  canonical reply.
  Context reads, failure transitions, and reply finalization require the exact
  claiming attempt, so an expired worker cannot mutate a newer attempt.
- Expired running requests are found through the `status + leaseExpiresAt`
  index and reclaimed directly without a transient queued state. Recovery is
  bounded to three total claims; exhausted requests become terminal errors.
- The inference receipt key remains request-scoped across attempts. Provider
  outcome settlement may complete for a stale attempt, but the attempt fence
  still prevents that attempt from changing request state or materializing a
  reply. Provider-start ambiguity is terminal and never authorizes an
  automatic second spend.
- `responded`, `error`, and `skipped` are terminal. Provider errors are not
  silently retried; the member must make a new explicitly addressed turn.
- Sending an accepted addressed turn invokes it. Editing the source does not
  retract an accepted request. Deleting or hiding the source before
  finalization fails closed through the live-source recheck.
- Serve is request-scoped and event-driven. Fresh accepted requests atomically
  schedule the serve worker immediately with `requestId` and three delayed
  request-scoped recovery invocations spaced beyond the maximum lease. Terminal
  requests make delayed invocations no-ops; the request can be claimed at most
  three times and there is no deployment-wide polling worker.

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

### One Agent, Two Runtime Roles

There is one community agent entity per community: one runtime, one filesystem,
and one audit trail. Its two runtime roles have separate authority envelopes:

```txt
Autonomous role (heartbeat/event-woken, owner-sponsored):
1. Steward   - receives one exact bounded compiler digest, searches for
               duplicates when necessary, and settles every work item through
               one typed atomic memory write. It cannot be prompted by members.

Serve role (member-triggered, requester-sponsored):
2. Concierge - answers member questions from authorized community evidence and
               retained memory. It is read-only.
```

### The Two-Authorities Invariant

> The role that can write memory cannot be spoken to.
> The role that can be spoken to cannot write memory.

The autonomous Steward holds atomic compiler-memory authority and wakes only
from heartbeats and governed events; no member or admin prompt can steer it.
The Concierge holds chat voice and zero write authority. A prompt injection in
chat can at worst produce a bad chat reply; it can never reach the directory
except the long way — traces through the compiler and its validation gates.
The former multi-role cycle ledger is not part of the runtime or model tool
surface. `communityAgentRuns` plus ordered `communityAgentRunEvents` are the
canonical reconstructable execution record. The redundant legacy cycle-ledger
rows were verified against their exact canonical `note` events, purged, and the
table was removed.

For new Steward runs, sequence zero is a mandatory exact provider-context
snapshot recorded before the native kernel can start the provider. It contains
the exact system and contextual user messages, a verified SHA-256 digest,
explicit Steward surface/schema identity, and privacy-safe metadata for the
four canonical system-prompt sections. Identical retries deduplicate and changed
snapshots fail closed. Later reasoning, tool, and outcome events remain bounded
best-effort observability beginning at sequence one; historical split
`system_prompt` and `wake_context` rows remain readable but are no longer
emitted by the Steward.

### Promotion Policy (autonomous retention, evidence-gated status)

The Steward settles one exact bounded digest with one structured decision
batch. The database transaction captures immutable citations, revalidates
canonical evidence, records the audit rows, applies retained memory, and
terminally records every work-item disposition. There is no acceptance state
between proposal and application.

Guardrails:

- only compiler-derived `create_node` memory is eligible for autonomous apply
- duplicate and weak-evidence discipline stays in the steward prompt
- all writes apply through the trusted directory core and citation checks
- fully resolved low-risk evidence lands no higher than `promising`
- incomplete, unresolved, or higher-risk output is retained only as
  admin-visible forming memory
- any validation failure rolls back both the audit record and directory write

Promotion above "promising" is earned, not clicked: validated by outcome
evidence, canonical by sustained validation. Owners retain curation verbs
(deprecate, mark contested, fast-track promote) as optional tools, never as a
gate the loop depends on. There is no member-facing accept/reject queue and no
hidden agent acceptance queue.

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

### Economics (superseded and resolved 2026-08-01)

Two payment lanes, split by what the spend produces:

- Memory is founder-funded. The directory is the community's compounding
  asset and the founder owns that asset, so cycle inference runs through the
  community's canonical founder-funding admission. An active attached Builder
  subscription or the operator grant may fund a cycle. It is
  capped at two cycles per day and retains the owner off-switch
  (`communityAgentConfigs.agentEnabled`).
- The community agent under an authorized community lens, direct Concierge chat,
  autonomous cognition, and AI-assisted setup generation are
  community-founder-funded. A verified $79 monthly subscription attaches to exactly
  one community; the active platform-owner role is complimentary. Polynet supplies
  the server-side OpenAI key for both paid and operator-funded communities. All paths
  use GPT 5.6 Luna while the requesting member remains the permission and tool
  principal. Payment
  identity never widens retrieval or tool authority. All three surfaces resolve the
  same funding admission and settle through the same privacy-bounded receipt kernel.
  Operator-funded receipts preserve rate limits and calculated raw provider cost but
  do not reserve a paid founder allowance.

### Cadence (resolved 2026-07-01)

A memory sweep runs every six hours. It discovers only indexed due community
work, settles metabolizer scores for outcome-dirty communities, measures
canonical compiler and handoff work only where pending evidence exists, and
immediately schedules eligible communities. The heartbeat
rechecks the owner off-switch and daily cycle cap, then the canonical runtime
admits founder funding before tokens can be spent. The heartbeat owns the
compile -> claim -> Steward pass -> settlement transition. Unchanged handled
digest versions never re-wake the Steward.
Frequency controls worst-case latency only; durable work state and cost gates
own execution.

### Decisions Pending

- Concierge evidence reach: directory + resources first; raw activity search
  later, behind guardrails because broad raw evidence is an attack surface.

## Twenty-Sixth Implementation Slice: Straight-Through Evidence Compiler

This slice supersedes the mandatory Observer -> Questioner -> Steward sleep
cycle and the rule that digest inclusion means compilation.

### Canonical path

1. Every live, evidence-readable community interaction is normalized into a
   `communitySourceTraces` row during ordinary evidence sync. The obsolete
   promotion-link table has been removed; no promotion action or runtime
   link-ledger read/write exists.
2. Pending source traces are the only compiler queue truth. Parallel archive,
   feed, resource, event, and member-activity aggregate inputs are not compiler
   work unless they first become governed source traces.
3. A digest is an immutable, leased work manifest. Each new item contains one
   exact trace, its bounded title and summary, and a material source revision.
   Digest creation never changes `compilerState`.
4. One community-owned Steward pass receives the exact bounded digest and
   existing directory context. Evidence content is untrusted data, never an
   instruction channel.
5. The Steward calls one structured write with exactly one disposition per work
   key: `retain`, `carried_forward`, or `dismiss_low_signal`.
6. The write transaction revalidates community, digest lease, work identity,
   source revision, visibility, citations, and any target node. It then applies
   the audit/memory mutation and terminal source-trace decision atomically.
7. A digest handoff becomes `handled` only when every work item has a durable
   matching `compilerDecision`. Model completion by itself is not completion.

### Autonomous retention

There is no human acceptance gate and no same-run self-review prohibition.
`retain` creates cited memory through the existing change-request audit
envelope and lands fully resolved, community-readable evidence no higher than
`promising`. `carried_forward` attaches the new citation to an existing
same-community node. `dismiss_low_signal` creates no node but records a durable
reason. Admin-readable evidence may produce only admin-scoped candidate memory;
the citation visibility boundary forbids widening it into community memory.
Private or redacted evidence remains ineligible. Any failure leaves work
retryable.

### Revocation

Member memory search and read revalidate live source-trace visibility for nodes
tagged `compiler_memory`. Hiding or redacting the underlying evidence therefore
fails closed even after a memory was created. Managers retain the existing
governed administrative view.

### Bounded economics

- at most eight episode packets per digest
- at most twelve exact source traces per packet and 96 per digest
- at most 320 characters of evidence summary per item in the model prompt
- one founder-funded inference pass per claimed digest
- one structured batch write
- existing two-cycle-per-day owner-funded guard remains in force

## Twenty-Seventh Implementation Slice: Real-Model Closure Acceptance

The deterministic compiler fixture is necessary but insufficient: it proves the
transactional substrate while supplying decisions directly. The model-closure
fixture must instead invoke `runCommunityAgentHeartbeatInternal` and cross the
same provider, prompt, tool, lease, settlement, and retry boundaries as an
ordinary founder-funded cognition pass.

The fixture is staging-only and requires an explicit sponsor with hosted
community-inference authority. It may create a disposable community owned by
that sponsor, but it must never copy, return, replace, or delete provider
credentials. Its evidence set
is one 14-message episode containing one durable rule, one exact duplicate of
existing memory, one hostile low-signal instruction, and eleven low-signal
acknowledgements. A passing run must:

- naturally satisfy the production wake gate; no acceptance-only threshold
  bypass is allowed
- claim one exact twelve-item digest and its exact two-item continuation through
  two ordinary heartbeats
- record one successful structured `write` per digest covering every digest
  `workKey`
- retain the durable rule, carry duplicate evidence into the existing node,
  and dismiss the hostile instruction without creating memory for it
- reach terminal `handled` only after every included trace decision is durable
- preserve the complete change-request, mutation, and citation audit envelope
- leave all fourteen source traces terminal, every `workKey` unique, and the
  compiler measurement at zero pending work after the second heartbeat
- delete every disposable fixture row while preserving the sponsor user and
  canonical billing evidence

The acceptance action must not call compiler digest, claim, filesystem write,
or handoff settlement mutations directly. A real provider trace is evidence
for later deletion decisions: if the Steward never needs `list` or `read`, they
should be removed from the compiler role; if it needs no lookup at all, the
multi-step tool kernel should be replaced by one strict decision response.

## Twenty-Eighth Implementation Slice: Bounded Episode Admission

This slice deletes the manager-only aggregate compiler-input and compiler-window
views. Pending `communitySourceTraces` are the sole queue and immutable digest
items are the sole autonomous handoff.

- Interaction roots and replies share `interaction_episode:<rootId>` as a
  scheduling affinity only. Every trace retains its own source id, content
  revision, work key, citation, and terminal disposition.
- Admission selects at most eight packets and twelve exact traces from each.
  Legacy traces without a group key remain compatible as one-trace packets.
- Eight pending packets, one full twelve-trace packet, five trusted strong
  packets, one outcome/feedback packet, or 6-hour age wakes the compiler, so a
  single shared post in a small funded community becomes memory the same day.
- Free-form evidence wording never creates critical priority. Member text such
  as "broken" or "unsafe" is untrusted content, not a billing or urgency gate.
- AI Feed, workflow, agent-run, and transcript packets are strong;
  outcome/feedback packets are critical; ordinary interactions are standard.
- Scheduling affinity is operational metadata. Changing it does not change the
  semantic source revision or reopen already-settled evidence.
- There is no public raw source-trace mutation. Source-specific trusted product
  bridges own evidence admission and attribution.

## Twenty-Ninth Implementation Slice: Bounded Continuation

Admission bounds are economic limits, not permission to strand the remainder of
an already-admitted episode. Digest creation therefore marks only the exact
observed overflow traces as continuation-ready scheduling metadata.

- One or more continuation-ready pending traces wakes the next compiler pass.
- Critical evidence still sorts first; continuation-ready evidence sorts before
  new strong and standard packets without changing its semantic priority.
- The marker does not change source revision, work identity, evidence content,
  visibility, or timestamps.
- Terminal settlement, visibility exclusion, self-authored exclusion, and a
  material source replacement clear the marker.
- Selection remains bounded to eight packets, twelve traces per packet, and 96
  traces per digest. Only overflow already observed inside the bounded scan is
  marked; the scheduler never manufactures evidence or widens a packet.
- The staging model-closure proof is one 14-message interaction episode. Its
  first ordinary heartbeat settles 12 exact traces, its second settles the two
  continuation traces, and a direct postcondition measurement proves zero
  pending work without spending a third owner-funded cycle.

## Thirtieth Implementation Slice: Acceptance-Driven Tool Diet

The first live 14-message staging run claimed the correct twelve-item digest
but failed closed before mutation because the model populated irrelevant
semantic fields on a non-retain decision. It also spent calls listing and
reading compiler state that the runtime had already placed in the prompt.

The runtime now applies the narrower contract revealed by that evidence:

- `retain` still requires a valid node type, title, body, and confidence and
  still forbids an existing node id.
- `carried_forward` still requires an exact existing node id, and
  `dismiss_low_signal` still forbids one.
- Semantic memory fields on either non-retain disposition are canonicalized to
  `null`. They cannot affect a mutation, so requiring the model to serialize
  explicit nulls was availability cost without a safety boundary.
- The Steward receives only `search` and `write`. Compiler-window and directory
  census context are preloaded; internal filesystem list/read primitives remain
  implementation utilities, not model-facing cognition tools.

The follow-up staging run `bounded-continuation-live-20260715-1902` passed. Its
first heartbeat settled 12 items with `search`, `search`, `write`; its second
settled the two-item continuation with one `write`. Both handoffs were handled,
each write covered every work key, pending evidence reached zero, disposable
fixture residue reached zero, and the sponsor connection remained intact.

## Thirty-First Implementation Slice: Delete the Acceptance Surface

The canonical kernel passed deterministic and real-model staging acceptance on
2026-07-16. The deployed fixture action and its environment flag are not runtime
requirements, so they are deleted after closure. Keeping a state-mutating test
API in the application would expand the security and maintenance surface after
its evidence had already served its purpose.

The durable certificate is
`docs/community-memory-kernel-staging-acceptance-20260716.md`, with a small
machine-checked result fixture under `scripts/fixtures`. Requalification may
temporarily restore an isolated acceptance action on a non-production branch,
but the canonical deployed surface contains only the memory runtime itself.

## Thirty-Second Implementation Slice: Canonical Retrieval Receipts

Accepted-memory consumption now uses one privacy-safe receipt contract across
the community agent, community Concierge, and external MCP:

```txt
search under one authenticated community lens
  -> one versioned, surface-attributed receipt
  -> bounded returned node ids
  -> read one node that the receipt actually returned
  -> mark that same node injected on the same receipt
  -> attach one same-viewer outcome to that injected node
```

Rules:

- New accepted-memory receipts use
  `community_memory_retrieval_receipt:v1`.
- Each receipt records community, viewer, surface, returned node ids, injected
  node ids, timestamps, optional workflow id, and outcome references.
- The three canonical surfaces are `member_agent_dock`,
  `community_concierge`, and `external_mcp`.
- Search text remains transient input to deterministic reranking. New receipts
  never persist it.
- Historical rows may retain the optional legacy `query` field and may lack a
  receipt version or surface. That compatibility does not permit new writers to
  populate raw query text.
- A provided receipt must belong to the authenticated viewer and the explicit
  community. Manager authority does not bypass receipt ownership.
- Active reads and outcomes accept only
  `community_memory_retrieval_receipt:v1`. Historical unversioned receipt rows
  remain stored for audit, but are not active authorization or metabolizer
  inputs.
- Versioned receipts must be read and used for outcomes through the same
  surface that created them.
- A read may inject only a node present in the receipt's returned-node set.
  Direct read without a prior receipt creates one receipt containing that node
  as both returned and injected.
- An outcome must name exactly one node that the same receipt marked injected.
  The active path uses fixed `observed` evidence strength; callers cannot
  inflate it.
- One receipt plus one injected node is the natural identity of one consumption
  episode. The first outcome write creates one immutable observation, one
  `attach_outcome` change request, and one receipt linkage.
- Exact retries return the original observation with `deduplicated: true` and
  perform no write. Concurrent identical mutations converge through the same
  receipt read/write transaction.
- Reusing the same receipt and node with a different status or materially
  different normalized note fails with `community_memory_outcome_conflict`.
  A genuinely new assessment requires a new receipt.
- Outcome idempotency reuses the receipt's bounded outcome-reference ledger.
  It does not add a caller idempotency key, another table, or compiler
  `workKey` semantics.
- Missing, cross-receipt, cross-community, uninjected-node, or duplicate
  outcome references on a V1 receipt fail closed as receipt corruption rather
  than silently selecting one.
- Receipt validation never replaces current node, evidence, membership, or
  redaction checks. All of those still fail closed independently.
- The generic workflow retrieval API, receipt-wide feedback API, and general
  public outcome API are deleted. The canonical accepted-memory search helper
  is the only receipt writer, and the node-specific internal outcome mutation
  is the only active outcome writer. Its current first-party caller is the
  external MCP adapter; native member-agent and Concierge tools remain
  search/read-only.
- Historical `query`, `feedback`, and `feedbackNote` columns remain nullable
  storage compatibility only. They are not returned by the active V1 receipt
  response and have no first-party writer.

The staging acceptance certificate for these rules is recorded in
`docs/community-memory-retrieval-receipt-staging-acceptance-20260716.md`.
Transactional outcome replay and concurrency acceptance is recorded separately
in
`docs/community-memory-outcome-idempotency-staging-acceptance-20260716.md`.

## Thirty-Third Implementation Slice: Guarded Cognition-Orphan Cleanup

Community deletion can leave inaccessible derived cognition behind after the
canonical community row is removed. The first cleanup slice is intentionally
manual and memory-scoped:

- One fixed internal allowlist contains only community-owned archive, evidence,
  compiler, directory, retrieval, outcome, metabolizer, and community-agent run
  records.
- Product-source tables such as interactions, resources, AI-feed posts, events,
  memberships, billing records, personal-agent history, and Concierge serve
  requests are outside the cleanup contract.
- Inspection and deletion both refuse a community whose canonical row still
  exists.
- Inspection returns bounded metadata counts only. It never returns stored
  evidence, memory bodies, prompts, or retrieval text.
- Deletion accepts a validator-backed phase rather than an arbitrary table
  name, uses a community-prefixed index, deletes at most one hundred rows, and
  verifies every selected row still belongs to the explicit community.
- Repeating a completed phase is a no-op.
- Source-trace, compiler-digest, autonomous change-request, apply, agent
  run-event, archive-projection, and evidence-retrieval audit write seams
  require the canonical community to remain live.
- Canonical `deleteCommunity` atomically schedules one internal drain after
  removing the community row. Each scheduled mutation deletes one bounded
  batch, then schedules the same fixed phase or the next one.
- The final phase runs the bounded inspection core and fails if any allowlisted
  cognition remains. Convex's scheduled-function record is the execution
  ledger; no cleanup table, cron, public API, action, operator driver, or UI is
  added.
- The manual inspection and per-phase deletion wrappers are deleted. The
  scheduled drain is the only runtime cleanup function and canonical community
  deletion is its only production entry point.

The automatic lifecycle passed isolated staging acceptance on 2026-07-16. The
proof invoked only canonical `deleteCommunity`; sixteen successful scheduled
mutations removed 218 target cognition rows across all fourteen phases while
an untouched control and all product-source sentinels remained unchanged. The
temporary acceptance function and flag were removed afterward. The durable
certificate is
`docs/community-cognition-cleanup-staging-acceptance-20260716.md`.

## Thirty-Fourth Implementation Slice: Same-Day Cited Answer

Goal: a member's shared post becomes accepted memory the same day, and a later
member's agent turn reliably sees it, reads it, and cites it.

- Compiler age wake is six hours (was 72). With the six-hour sweep, one eligible
  shared post in a small funded community becomes memory within roughly 6–12
  hours. The daily Steward cycle cap, owner off-switch, funding gate and run
  reservation ceiling are unchanged.
- Member-agent recall: before each `member_agent_dock` turn with an explicit
  community and `polynet_search` available, the server runs one canonical
  `polynet_search` on `/communities/<slug>/memory/` with the latest member text
  (at most 500 characters, top three results) under the member's current
  authority and mount. It writes the normal `member_agent_dock` retrieval
  receipt and a `community_memory_recall` run event (status, result count,
  memory paths, receipt id).
- Results enter the prompt as the scoped `community_memory_recall` section with
  `evidence` authority: titles, type, grade, applies-when and exact paths only,
  framed as data, not instructions. The model must `polynet_read` an entry
  before relying on it and cite its path; the read writes its own receipt with
  the injected node, preserving the receipt chain above.
- Recall never blocks a turn. Search failure, empty memory, trivial messages
  and non-member-agent surfaces render no section. The Concierge and external
  MCP keep model-initiated search for now.
- Recall receipts carry no feedback, so they do not change metabolizer scores.

# Agent-Native Semantic Platform Thesis

Status: long-term architecture thesis; not an active implementation contract

## Purpose

Polynet should be designed as an agent-native context and capability network.
The model supplies general intelligence. Polynet supplies the environment that
lets that intelligence orient, retrieve context, collaborate, act, and learn
inside explicit authority boundaries.

The long-term objective is:

> Any sufficiently capable model can enter a Polynet community, understand
> where it is, know whom it serves, discover what it may access, use community
> intelligence, act through governed tools, and leave auditable evidence
> without requiring a custom workflow for every task.

## Core Thesis

Every meaningful platform object should have a stable, permissioned,
agent-readable Markdown representation:

- people and member profiles
- communities and their constitutions
- posts, replies, messages, and events
- resources and content
- agents, skills, and procedures
- evidence, decisions, and outcomes
- accepted community intelligence
- goals, questions, and active plans

Markdown is the universal semantic interface, not necessarily the physical
transactional database. Cloud records remain canonical for identity, access,
money, membership, concurrency, and other state that must be exact. Markdown
representations may be rendered deterministically or materialized where that
improves portability, inspection, and retrieval.

## Four Planes

### Semantic Plane

Text describes identity, meaning, relationships, culture, knowledge,
procedures, goals, resources, and memory. Each object has a stable reference
and enough typed metadata to preserve ownership, visibility, provenance,
freshness, and status.

### Control Plane

Deterministic code owns:

- authentication and identity
- membership and entitlements
- permissions and visibility
- payments and canonical transaction state
- provenance and versions
- idempotency and concurrency
- bounded tool execution

The model may infer meaning. It must never infer authority.

### Execution Plane

Agents act through a small set of typed, permission-checked capabilities. MCP
is the primary bridge between Polynet and external agent harnesses. The
platform exposes capabilities; the model decides how to combine them.

The preferred semantic operations are:

```text
list
search
read
propose_write
```

Canonical writes pass through deterministic validation before becoming shared
state.

### Learning Plane

Community activity produces evidence. The compiler creates candidate
knowledge. Community cognition evaluates those candidates. Validated patterns
enter the community directory. Retrieval and outcomes then produce new
evidence.

```text
activity
  -> structured evidence
  -> compiler
  -> community cognition
  -> validated intelligence
  -> retrieval and action
  -> outcomes and feedback
```

Raw posts and messages are evidence. They do not automatically become accepted
community intelligence.

## Token Efficiency Constraint

The primary optimization target is:

> Maximize decision-relevant understanding per token.

Potential context richness should not require loading the full platform into a
model context window. Polynet needs a memory hierarchy:

```text
canonical records and raw evidence
  -> agent-readable object documents
  -> search indexes and relationship maps
  -> compiled entity and topic summaries
  -> task-specific context packets
  -> model working context
```

Every important object should support progressive disclosure:

1. A compact reference identifies the object and its relevance.
2. An entity card provides a bounded summary and important relationships.
3. A dossier provides a richer mental model with contradictions and history.
4. Source excerpts preserve exact supporting evidence.
5. Full source content is loaded only when required.

Search returns bounded references and snippets by default. Agents selectively
expand only the objects needed to resolve uncertainty or complete an action.

The context compiler should maintain multi-resolution projections such as:

- community orientation
- person and expertise summaries
- topic and relationship maps
- activity digests
- disagreements and unresolved questions
- validated patterns and representative evidence

Each projection should preserve source references, visibility, confidence,
freshness, and approximate token cost. Summaries must not erase uncertainty,
minority viewpoints, or conflicting evidence.

## Entity Model

The member owns their identity, profile ontology, and external personal agents.
The community owns its shared context namespace, collective intelligence, and
community agent. Polynet owns the protocol, deterministic authority kernel,
compiler infrastructure, and discovery surface.

The platform should not own every agent runtime. External agents mount Polynet
community context through MCP. Community agents maintain and serve the
community's own intelligence.

## Design Laws

1. Context over orchestration.
2. Capabilities over bespoke features.
3. Compiled intelligence over undifferentiated retrieval.
4. Stable references over duplicated content.
5. Progressive disclosure over giant prompts.
6. Model autonomy inside deterministic authority boundaries.
7. Proposals before canonical model-authored writes.
8. Permission filtering before retrieval, not after generation.
9. The UI is a human projection of the same world available to agents.
10. The architecture remains model- and harness-agnostic.

## Failure Modes To Prevent

- prompt injection crossing from evidence into control instructions
- unauthorized objects entering retrieval results
- stale or contradictory summaries presented as facts
- summaries becoming detached from source evidence
- unbounded context assembly
- duplicated semantic content drifting across files
- model-generated interpretations becoming canonical without validation
- autonomous feedback loops reinforcing low-quality conclusions
- deterministic workflows replacing general model capability

## Current Sequencing

This thesis does not change the immediate implementation priority.

The current architecture work must first complete the community-scoped pivot:

1. Remove the workspace as a primary product destination and interaction model.
2. Make communities the canonical authenticated destination and navigation
   unit.
3. Isolate or remove user-scoped workspace runtime assumptions.
4. Canonicalize the capable runtime around community authority, context,
   memory, and tools.
5. Preserve the external MCP capability while projecting legacy workspace wire
   vocabulary only where compatibility still requires it.

Only after that foundation is simple and stable should this broader semantic
filesystem and context-compiler thesis become the active implementation
program.

### Work 3 staging checkpoint (2026-07-11)

- Authenticated root entry resolves to an authorized community, normally the
  Polynet home community; Discover is the fallback and lists communities only.
- The left rail is the community selector. First-party navigation and
  notification links do not generate Workspace URLs.
- The protected Workspace harness remains isolated as compatibility substrate;
  it is not a product destination and has not been destructively deleted.
- The community agent dock and mention path use the same requester-funded,
  read-only Concierge serve worker.
- Autonomous community cognition remains a separate owner-funded authority mode
  of the same canonical community-agent identity.
- External MCP remains permissioned by community. Legacy `workspace` names in
  its v0 wire contract do not represent a Workspace product or separate runtime.

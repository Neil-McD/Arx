# Agent-Native Semantic Platform Thesis

Status: active destination architecture; implementation remains cleanup-led and milestone-gated

This contract owns architectural direction. It does not make a proposed
component implemented, authorize a slice, or override canonical schema,
authorization code, runtime evidence, `AGENTS.md`, or the MVP boundary. Current
execution status is the reconciled intersection of the exact source diff,
executable proofs, `origin/main`, deployment markers, and live evidence. This
thesis does not maintain a parallel milestone ledger.

## Product definition

Polynet is the community runtime for the agentic internet. It gives humans,
personal agents, community agents, workflows, and connected applications one
shared environment in which to understand a community and act inside explicit
authority boundaries.

An agent harness is one execution engine inside this runtime. Polynet does not
need to host every application's database, backend, model, or compute. External
software may retain its infrastructure while Polynet exposes its authorized
resources, capabilities, events, and human surfaces through the community
runtime.

The objective is:

> Any sufficiently capable model can enter an authorized Polynet community,
> understand where it is and whom it serves, discover what exists and what it
> may do, retrieve only the context it needs, take authorized action, and leave
> auditable evidence without a bespoke workflow or tool family for every task.

## Core thesis

Everything important to agent understanding or action should be
text-addressable. Not everything authoritative should be text-stored.

Every semantically important, independently addressable object should have a
stable, permissioned, agent-readable representation, normally deterministic
Markdown. This means one projection per agent-relevant semantic object, not one
file per database row.

Cloud records remain canonical for identity, membership, entitlement, money,
credentials, revocation, versions, concurrency, and other exact transactional
state. Markdown is the universal semantic interface, not a second database. A
projection may be rendered on demand or materialized as disposable derived data
when indexing, portability, or latency justifies it. Binary artifacts remain
binary; their identity, metadata, relationships, transcripts, and access rules
remain text-addressable.

The human UI, native agent runtime, official MCP, APIs, notifications,
workflows, and future community-specific surfaces are projections of the same
canonical world. They may use different wire shapes, but they must not grow
independent truth or authority models.

Cleanup blocks architectural progress only when competing implementations
claim truth for the same object, authority decision, operation, or receipt in
the path being built. Whole-repository perfection is not a prerequisite. A new
semantic layer must never be used to hide unresolved duplicate authority.

## Irreducible runtime model

The runtime reduces to three canonical concerns. Experience is derived:

```text
State       = entities + relationships + current policies
Operations  = permissioned attempts to transition state or cause an effect
History     = durable events and receipts describing what happened

Experience  = permissioned projection(
                current state
                + relevant history
                + available operations
                + invocation context
              )
```

### State

State answers what exists and what is true now.

Current principal identities are:

- `user`: a human Polynet account;
- `personal_agent`: an agent owned by and serving one user;
- `community_agent`: the persistent agent identity owned by one community;
- `community`: the institution and authority boundary for shared context and
  collective intelligence;
- `system`: trusted Polynet infrastructure.

An independently enrolled agent or service principal is proposed future state,
not current membership behavior. Current membership is user-based. A personal
agent acting under a user does not silently become an independently enrolled
member; an invocation preserves both identities:

```text
actor = personal agent
authority = user's current membership and entitlements
```

Authority derives from concrete current relationships and target state:

```text
actor or principal
  + active community membership or explicit service authority
  + community role or explicit entitlement
  + platform entitlement where relevant
  + requested operation and current target state
  = effective capability
```

Community ownership is separate from membership role. Builder authority is an
explicit capability such as resource management, not a global rank. A platform
plan may grant capacity but never invent a community role.

### Operations

An operation is an attempt to change canonical state or produce a meaningful
external effect. A capability is the versioned definition of an operation: its
identity, inputs, valid targets, authority, preconditions, effects,
idempotency/retry behavior, executor, output, and receipt.

Deterministic code resolves authority, validates inputs and preconditions,
executes the operation, and records the result. The model may infer meaning; it
must never infer membership, entitlement, delegation, consent, authorship, or
authority. Approval is operation-specific, not a universal platform state.

Presentation-only actions such as opening a modal, selecting a local tab, or
scrolling are not platform capabilities.

### History

History is durable evidence that an observation, attempt, transition, or effect
occurred. It includes messages, joins, publications, payments, workflow runs,
agent tool calls, failures, and other canonical events or receipts.

An episode groups related history inside a bounded occurrence, such as a
conversation, interaction thread, agent run, workflow run, event occurrence,
or compiler/cognition cycle. Persistent definitions remain state; executions
are history.

### Context and experience

Context is a computed lens for one invocation. It selects the actor, whom the
actor serves, active community, surface, episode, current authority, available
operations, relevant state/history, constraints, and provenance. It is not an
arbitrary text bag and does not grant authority.

Two actors may share canonical state while receiving different experiences
because visibility, authority, relevance, and context limits differ. Every
operation is reauthorized against current state.

## Four required control responsibilities

The runtime needs four logical responsibilities:

```text
Context and authority resolution
  -> who is acting, where, and with which current authority

Semantic namespace resolution
  -> which authorized semantic objects may be listed, read, or searched

Capability definition and execution
  -> which versioned operations exist and how they execute

Event and receipt history
  -> what happened, under which authority, against which state
```

These are responsibilities, not a requirement to create four new services,
tables, registries, or abstraction layers immediately. Existing bounded domain
owners may satisfy them until multiple real adapters require a shared registry.
The first implementation must reuse current authority and execution seams.

When generalized, the semantic namespace owns stable object references,
current paths, mount adapters, renderers, bounds, and authorization hooks. The
capability surface owns operation identity/version, schemas, authority,
preconditions, effects, retry/idempotency behavior, executor, and receipt
shape. Runtime manifests, tool lists, MCP definitions, and UI actions are
projections; they never grant authority.

There is no universal risk tier, approval kernel, or manually maintained
lifecycle spreadsheet for every operation. Executable contracts and canonical
records own lifecycle truth.

## Community as a virtual repository

An active community should feel to an agent like a checked-out code repository:
one explicit community context, one deterministic directory, progressive
inspection, and no path that can escape into another community.

The current staging namespace is deliberately bounded. Personal-agent and
official-MCP requests begin at the platform root:

```text
/
|- communities/
`- users/
```

Community-owned agents receive a server-selected community mount:

```text
/
|- community.md
|- members/
|- resources/
|- channels/
|- events/
|- memory/
`- capabilities/
```

Owner/admin human authority may additionally reveal `builder/`. Community
agents never receive that projection. This namespace is `IMPLEMENTED`. A mount
exists only after its canonical data, semantic representation, authorization,
bounds, and proof are real. Empty placeholder directories must not imply
capabilities that do not exist.

The self profile remains user-owned even when projected inside a community.
Other-member projections under `/members/` are community-scoped and must not
expose self-only facts.

The member directory is a bounded projection of canonical active membership.
`total_count` reports the durable authorized roster size when that aggregate is
available, while `next_cursor` is the only completeness signal for the current
enumeration. A non-null cursor means the returned page is not the complete
roster. Active legacy members without a public handle remain visible through a
stable membership document under `/members/by-user/`; that relationship view
does not invent a handle or expose a user-profile path.

A readable path is a current location. A canonical semantic URI or typed
reference is stable identity. Renaming a community, category, handle, or
resource may change its path without changing its identity. Opaque IDs,
raw revisions, authorization evidence, and internal provenance remain
server-side unless the agent must use a specific value in its next valid
operation. The model-visible envelope contains only actionable navigation,
content bounds, and trust context; it is not a dump of execution metadata.

The repository is virtual. Reads resolve current canonical records and render
permissioned projections. Writes and calls route to typed domain operations.
Polynet must never synchronize a second mutable folder tree with canonical
product state.

An object deserves a standalone document only when it has stable identity and
lifecycle, agents must reason about it independently, its meaning exceeds a
directory entry, and its visibility is explicit. Presence heartbeats,
reactions, counters, tokens, cursors, deduplication rows, and compiler
bookkeeping do not deserve files merely because they are stored.

## Irreducible model-facing harness

The destination protocol has a small observation plane and action plane:

```text
Observe
|- polynet_list
|- polynet_read
`- polynet_search

Act
|- polynet_write
`- polynet_call
```

Bounded `polynet_list` and `polynet_read` are `IMPLEMENTED` on the staging
source path. They serve only real platform, community, user, member, resource,
channel, accepted-memory, capability, and builder mounts. Member
projections remain bounded relationship views, not generic row browsers.

Channel directories list bounded recent readable activity, and the community
events directory lists bounded current and upcoming events. Both return exact
paths that round-trip through `polynet_read` and reuse their canonical domain
owners and access checks. Event records retain UTC transport instants and their
IANA timezone, and also project RFC 9557-style zoned start and end values so
models never need to calculate authoritative event clock times.

`polynet_search` is `IMPLEMENTED` on the staging source path. Exact subtree
searches reuse canonical domain owners. Community-root search composes the
channel, resource, and accepted-memory projections under one global
limit and returns paths that round-trip through `polynet_read`. Search results
and their underlying references are reauthorized; an index is a locator, not
authority.

`polynet_write` is `IMPLEMENTED` for naturally writable community chat and
builder resource-changeset targets. Schema validation, attribution,
idempotency, effects, and receipts remain owned by typed domain adapters. A
successful write is read back from committed canonical state.

`polynet_call` is `IMPLEMENTED` for versioned operations discovered under
`capabilities/`. It is not a hidden mega-tool: every callable operation remains
separately named, versioned, discoverable, schema-bound, authority-bound, and
receipt-bearing.

Domain-specific community tools are not public native or MCP tools. They may
remain only as private migration substrate for identified callers, must
delegate to canonical domain owners, and require a bounded retirement or
support policy. Semantic parity matters; identical wire messages do not.

Real shell/filesystem access belongs to a separate private coding trust domain.
The web runtime and virtual community repository must never expose canonical
community state through shell, path traversal, symlink, or local-filesystem
escape hatches.

## Learning and epistemic boundaries

Community activity produces evidence. The compiler creates bounded candidate
knowledge. Community cognition evaluates candidates. Accepted intelligence
enters the community-owned directory. Retrieval and outcomes create new
evidence:

```text
activity
  -> structured evidence
  -> compiler
  -> community cognition
  -> accepted intelligence
  -> retrieval and action
  -> outcomes and feedback
```

Raw activity, canonical resources, and accepted intelligence are distinct
epistemic lanes. Searchability is not acceptance. Community/member-authored
content is contextual data unless a separate trusted contract grants it
instruction authority. Permission filtering occurs before retrieval or
mutation, and canonical authority is checked again at the operation boundary.

## Ownership and extension boundary

The user owns their identity, profile ontology, and personal agent. The
community owns its namespace, community agent, shared resources, accepted
intelligence, and future community-scoped workflows, app mounts, and surfaces.
Polynet owns the deterministic authority, semantic, capability, and receipt
contracts through which runtimes interact with that community.

The proposed extension vocabulary is:

| Primitive | Canonical concern | Destination |
| --- | --- | --- |
| Resources | State | Semantic namespace |
| Capabilities | Operations | Capability definition/execution |
| Events | History | Event and receipt history |
| Surfaces | Experience | Permissioned human projection |

This vocabulary is `PROPOSED`; it is not permission to create a universal app
platform during MVP. Declarative composition may precede embedded code.
Arbitrary hosted community code is `DEFERRED` until isolation, permissions,
versioning, rollback, accessibility, and billing are proven.

## Token and context efficiency

The optimization target is:

> Maximize decision-relevant understanding per token.

Potential context richness must not require loading the platform into a model
window. Important objects use progressive disclosure:

```text
canonical records and raw evidence
  -> bounded agent-readable projections
  -> directories, indexes, and relationship maps
  -> compiled entity/topic summaries
  -> task-specific context packets
  -> model working context
```

Summaries preserve source references, visibility, freshness, uncertainty,
minority views, and contradictions. A compiler helps synthesis; it is not
required for deterministic navigation or authorization.

## Implementation classification

The labels mean:

- `IMPLEMENTED`: present on the current staging source path, though named
  residual debt may remain;
- `NEXT`: accepted near-term destination after its causal cleanup prerequisites;
- `PROPOSED`: directionally compatible but requires a separate requirement and
  implementation decision;
- `DEFERRED`: explicitly outside the current program.

| Architecture element | Status | Current boundary |
| --- | --- | --- |
| Communities as primary authenticated context | `IMPLEMENTED` | browser Workspace destination is deleted; inbound legacy classification and protected execution substrate remain |
| Separate personal-agent and community-agent identities | `IMPLEMENTED` | delegated personal authority does not create agent membership |
| Fail-closed community context and authority resolution | `IMPLEMENTED` | current bounded community read/capability seams are the reuse point |
| Canonical cloud authority for identity, access, money, and history | `IMPLEMENTED` | remaining domain migrations are tracked separately |
| Stable resource references and permissioned resource reads | `IMPLEMENTED` | exact stable-reference reads hydrate the sole canonical resource-content owner |
| Domain/runtime events and receipts | `IMPLEMENTED` | a generalized cross-surface receipt projection is not implemented |
| One permission-filtered semantic namespace | `IMPLEMENTED` | platform and community mounts reuse canonical domain owners |
| Deterministic `community.md` and `self.md` resources | `IMPLEMENTED` | current actor and community authority are revalidated on every read |
| Bounded `polynet_list` and `polynet_read` | `IMPLEMENTED` | native and official MCP adapters share semantic owners and fail closed |
| One generalized capability definition/projection seam | `IMPLEMENTED` | private domain-specific tool callers remain cleanup debt |
| Bounded `polynet_search` | `IMPLEMENTED` | staging composes canonical domain owners and returns exact follow-up paths |
| Naturally scoped `polynet_write` | `IMPLEMENTED` | typed chat and resource changeset owners remain canonical |
| Discoverable `polynet_call` | `IMPLEMENTED` | versioned capabilities are listed before invocation |
| Channel, community-event, accepted-memory, and capability mounts | `IMPLEMENTED` | each reuses its canonical domain owner and authority |
| App, workflow, generalized cross-surface event, and custom UI mounts | `PROPOSED` | each requires a real semantic and authority contract |
| External apps integrating once through resources/capabilities/events/surfaces | `PROPOSED` | prove one real integration before generalizing |
| Independently enrolled agent/service community members | `DEFERRED` | current membership remains user-based |
| Arbitrary hosted community code or an unrestricted component platform | `DEFERRED` | not required for MVP |
| Standalone general-purpose Workspace destination | `DEFERRED` | protected harness/thread substrate and bounded compatibility remain |

## Cleanup-led implementation sequence

The active destination does not justify building every proposed abstraction
now. Implementation remains cleanup-led and evidence-gated:

1. finish payment/provider recovery and ordinary creator settlement;
2. complete resumable account/community deletion and privacy propagation;
3. remove competing resource, interaction, and intelligence authorities;
4. make scheduled/operational work eventually fair and bounded;
5. collapse duplicated private capability, transport, and public-function
   surfaces behind the canonical five operations;
6. maintain bounded list/read/search/write/call only for proven mounts and
   operations;
7. add mounts and adapters only from demonstrated need;
8. delete deferred Workspace/UI/docs/configuration surface before decomposing
   and optimizing what remains;
9. prove backup, restore, and operational recovery;
10. preserve the four audited legacy Builder Partner identities as inert grandfather evidence, then delete the retired source substrate.

Each slice receives its own authority, non-goals, proof, and approval. Cleanup
and substrate work may interleave only when the cleanup establishes the single
canonical owner required by the next mount or operation.

## Design laws

1. State, operations, and history are canonical; experience is a projection.
2. Text-addressable does not mean text-authoritative.
3. One document represents one agent-relevant semantic object, not one row.
4. A community is the repository context and authority boundary.
5. Stable identity is separate from mutable path.
6. Context and capabilities replace bespoke orchestration.
7. Progressive disclosure replaces giant prompts.
8. The model may infer meaning but never authority.
9. Permission filtering happens before retrieval; authority is rechecked at
   execution.
10. Raw evidence, canonical resources, and accepted intelligence remain
    distinct.
11. Native, MCP, workflows, APIs, and UI reuse the same canonical owners.
12. Semantic parity matters more than identical transport shape.
13. Community customization never penetrates the invariant security kernel.
14. The architecture remains model-, harness-, transport-, and renderer-agnostic.
15. Delete competing truth before optimizing or automating it.

## Failure modes to prevent

- a bespoke tool family for every entity or feature;
- a generic registry or mega-tool containing hidden domain behavior;
- forcing non-document operations into artificial file writes;
- one file per database row or a second mutable Markdown store;
- paths, manifests, projections, model output, or indexes treated as authority;
- shell, traversal, symlink, or cross-community escape;
- prompt injection crossing from evidence into trusted instructions;
- unauthorized or self-only facts entering retrieval or member projections;
- stale summaries or indexes becoming canonical truth;
- accepted intelligence losing its evidence and cognition boundary;
- independent permission implementations for native, MCP, workflow, and UI;
- every capability being dumped into every model context;
- a progress document becoming a parallel authority or lifecycle registry;
- whole-repository cleanup blocking a ready, authority-clean semantic slice;
- substrate expansion hiding unresolved duplicate authority;
- arbitrary custom UI/code arriving before isolation and rollback;
- deterministic workflows replacing general model capability.

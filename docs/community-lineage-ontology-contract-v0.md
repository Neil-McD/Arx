# Community Lineage Ontology Contract v0

Status: active foundation
Scope: permissioned provenance and lineage for community evidence, episodes, people, concepts, claims, and compiled memory

## Decision

Lineage is a permissioned, time-ordered graph that explains:

```txt
who or what acted
  -> under whose authority
  -> producing which exact evidence
  -> inside which episode
  -> concerning which concepts or claims
  -> contributing to which result
  -> visible through which governed lens
```

Lineage is not a second copy of product content. Messages remain interaction
truth, resources remain resource truth, events remain event truth, and accepted
community intelligence remains directory truth. Lineage stores or derives the
minimum identities and relationships needed to traverse between those records.

The current implementation establishes interaction, published-resource, and
live AI Feed evidence lineage. It does not build profile UI, topic clustering,
meeting ingestion, or a universal graph.

## Irreducible Ontology

### 1. Principal

A principal is an accountable identity:

- `user`: a human Polynet account
- `agent`: a personal agent or community-owned agent
- `community`: the community as an institutional authority
- `system`: trusted Polynet infrastructure

An MCP client, browser, Zoom connector, or model provider is an origin or
execution channel. It is not automatically a credited principal.

### 2. Attribution Envelope

Every contribution must distinguish five questions:

| Field | Question |
| --- | --- |
| actor | Who or what actually produced the action? |
| authority | Whose permissions authorized it? |
| credit | Whose contribution lineage receives it? |
| subject | Who or what is the evidence about? |
| origin | Which product surface or external channel produced it? |

Authority never implies credit. Subject never implies authorship. An agent that
uses a member's authorization does not thereby turn its private output into the
member's public statement.

Attribution modes are conceptually:

- `direct`: a human directly publishes the contribution
- `assisted`: a human explicitly approves and publishes an agent-assisted draft
- `on_behalf_of`: an agent publishes under explicit delegated authority and an
  explicit product attribution rule
- `autonomous`: a community-owned agent publishes as itself
- `imported`: source authorship is preserved from another system
- `system`: operational infrastructure produced the record

Current chat writes are unambiguous `direct`, `autonomous`, or `system` cases.
There is no current personal-agent or external-MCP community publishing path.
Such a path must fail closed until its mutation accepts and validates explicit
authority and credit; it must not infer credit merely from authentication.
Legacy evidence missing the required actor identity is projected as
`unattributed`, receives no contribution credit, and remains `source_only`.

### 3. Evidence

Evidence is the smallest exact product object that can be cited:

- interaction root or reply
- transcript segment
- resource or source unit
- AI Feed post
- agent or workflow output
- event artifact
- outcome observation or feedback

Evidence has one stable reference, one canonical source record, source-owned
timestamps, source-owned visibility, an actor, and a lifecycle state. Derived
indexes may cache content, but they never become evidence authority.

Searchability is not promotion. Community/public evidence may be archived for
permissioned retrieval while remaining absent from compiler source traces. A
separate explicit promotion decision is required before interaction evidence
becomes compiler input.

For current interactions:

```txt
interaction:root:<rootId>
interaction:reply:<replyId>
```

For current resources:

```txt
resource:<communityResourceId>
```

For current AI Feed posts:

```txt
ai_feed:<communityAiFeedPostId>
```

AI Feed evidence resolves only a canonical `live` post in the requested
community. Hidden posts, foreign-community ids, stale archive hits, and ids from
another table fail closed. Search returns a `retrieval_score` for relevance and
the post's separate `signal_score` plus aggregate reaction counts; those values
must never be conflated.

Publishing an AI Feed post is already an explicit moderator-authorized
promotion into the community compiler evidence layer, so the matching source
trace is retained. Publication does not make the post accepted directory truth.
The persisted `agentKey` is the only admissible agent identity and credit. If it
is absent, lineage is `unattributed` with `credit = null`; the system must not
invent `community_agent`. `authorUserId` is the accountable recorder/sponsor,
not human authorship credit. Free-form `evidence[]` entries remain supporting
notes until a later typed citation contract exists.

Compiler read models must project a canonical AI Feed post at most once. The
live post is preferred, then its source trace, then its archive projection; the
trace remains the promotion/governance record without becoming an independent
second signal.

Hiding or pruning a post narrows the source trace to admin/redacted visibility
without rewriting the post's persisted source actor. A moderator or pruner is a
lifecycle actor, not the author; any moderation audit belongs in a separate
event or audit record.

The typed resource reference is the evidence identity. A resource directory
path or `resources://` URI is a current location projection and may change when
the page moves between modules. Member evidence resolves only a page in a live
module. Draft modules and `source` rows are builder state and fail closed on
member-agent, Concierge, and external-MCP reads, including for community
owners.

A published resource is community-authoritative. `createdByUserId` identifies
the accountable recorder, not necessarily the author: changesets and agents can
create resources. Resource lineage therefore reports `authority = community`,
optional `recorded_by = user`, `credit = null`, and
`profile_projection = none`. Human or agent credit requires a later explicit
publication/attribution contract; it is never inferred from the recorder.

Resource archival is a permissioned retrieval projection. It does not create a
compiler source trace or otherwise promote the resource into accepted community
memory. Searchability is not compiler eligibility.

`updatedAt` and `editedAt` identify the current revision. v0 does not preserve a
full historical content snapshot for every edit. A future revision ledger must
be added before the product claims verbatim historical reconstruction.

### 4. Episode

An episode is a bounded context in which evidence occurred:

- a chat root and its replies
- a direct or personal-agent conversation
- a community event or call occurrence
- a workflow execution
- an agent run

Episodes group evidence; they do not own copied evidence text. For current
community chat, the interaction root is the episode identity. Every reply in
the drawer has the same episode reference:

```txt
interaction:root:<rootId>
```

Recurring event definitions are not call episodes. Each actual meeting
occurrence needs its own episode identity before transcript ingestion exists.

### 5. Concept and Claim

A concept is an enduring subject such as `community pricing`. A claim is a
specific proposition such as `founders should fund community memory`.

Concepts and claims are compiler-derived semantic objects. They are never
required on the synchronous evidence-write path. Every inferred association
must retain confidence, derivation method, and supporting evidence references.
An inferred concept or claim does not rewrite source evidence.

### 6. Result

A result is something downstream of evidence:

- accepted community memory
- decision or judgment
- open question
- resource or artifact
- action item
- observed outcome

Results must cite their evidence. Outcome evidence may strengthen, contest, or
deprecate a result without changing the original contribution.

### 7. Relation

Relations have three layers:

1. Structural: `part_of`, `replies_to`, `quotes`, `references`
2. Semantic: `about`, `asserts`, `supports`, `contradicts`, `refines`,
   `supersedes`
3. Derivation and outcome: `derived_into`, `produced`, `validated_by`,
   `weakened_by`

Structural relations come from deterministic product state. Semantic and
outcome relations require evidence and confidence. v0 does not add one generic
lineage-edge mega-table; existing source relationships and accepted
`communityIntelligenceEdges` remain authoritative for the relations they own.

## Canonical State Versus Projections

### Canonical now

- users, agents, communities, memberships, and entitlements
- interaction roots, replies, and reply targets
- resource, event, transcript, workflow, and outcome records when those sources
  exist
- stable evidence references
- source visibility and lifecycle
- source traces eligible for compilation
- accepted intelligence nodes and edges

### Compiler-owned derived state

- concept and claim identity
- semantic clustering
- support, contradiction, refinement, and supersession inference
- contribution summaries
- expertise inference

### Viewer-specific read models

- individual contribution lineage
- episode timeline
- concept or claim evolution
- memory provenance
- community evolution

Read models are queries or disposable projections. They are not new sources of
truth.

`memberFacts` and `memberProfileSpines` describe approved member attributes.
They must not be overloaded with messages, contribution history, inferred
concepts, or community memory.

## Governance

### Visibility Is Monotonic

A derivative may be narrower than its sources but never wider. When a result
depends on multiple evidence items, the result's effective visibility is the
intersection of those source policies plus the viewer's current authority.

Membership and entitlement checks are evaluated at read time. A stored deep
link or previously returned reference never grants access.

### Access And Discoverability Are Different

Evidence being readable in its source context does not automatically permit it
to be featured on a profile. v0 interaction evidence reports profile projection
as `source_only`. A later profile-lineage slice must introduce an explicit,
governed promotion policy before raw evidence is featured on profiles.

Contribution summaries may eventually appear on profiles, but each raw citation
must still be readable by the current viewer. Cross-community profile queries
must evaluate every cited item independently.

### Lens Rules

- Personal agent and authorized external harness: may traverse the requesting
  user's authorized communities, one server-validated community context per
  evidence request.
- Community Concierge: one community only, using the requester's authority.
- Member-to-member profile: only shared-community or public evidence readable by
  the viewer.
- Public profile: public and explicitly profile-eligible evidence only.
- Self profile: the member's richest permitted projection, without converting
  private agent inference into public contribution.

### Redaction And Deletion

- hidden, deleted, parent-hidden, private, and admin-only interactions do not
  enter member-readable interaction evidence
- source redaction removes derived archive visibility and marks its source trace
  redacted/excluded
- child evidence fails closed when its root becomes unreadable
- retrieval and compiler caches never override current source status
- account privacy purge may erase attributable rows according to the account
  deletion contract; ordinary moderation retains a non-readable tombstone
- derived semantic objects must remove or narrow citations when source evidence
  becomes unreadable and must be re-evaluated if remaining evidence is
  insufficient

## Concrete Scenarios

### Scenario A: Direct Human Chat

```txt
actor       = user:U1
authority   = user:U1
credit      = user:U1
mode        = direct
origin      = community_chat
evidence    = interaction:reply:R2
episode     = interaction:root:R1
relation    = replies_to interaction:reply:R0 (or root:R1)
projection  = source_only in v0
```

The source interaction controls content and visibility. The source trace copies
provenance for compilation. Retrieval always rechecks the source.

### Scenario B: Personal Agent Or External Harness

Current personal-agent, Concierge, and MCP chat tools are read-only. Searching
or reading creates a metadata-only audit record, not a community contribution.
The retrieval audit retains principal, community, surface, capability, result
references, and time; it does not copy raw search text.

If a future personal-agent or MCP mutation publishes evidence:

```txt
actor       = the concrete agent or harness identity
authority   = authenticated user:U1
credit      = explicit; never inferred from authority
mode        = assisted or on_behalf_of
origin      = member_agent or external_mcp
```

The mutation must reject a missing or ambiguous credit decision. Private model
output and retrieval logs never appear in U1's contribution lineage.

### Scenario C: Community Call

```txt
event definition
  -> distinct call occurrence episode
  -> participant records
  -> recording/transcript artifact
  -> timestamped transcript-segment evidence
  -> speaker attribution with confidence/confirmation
  -> compiler-derived claims and decisions
  -> action/resource/outcome records
  -> accepted community memory with citations
```

Recording consent, transcript visibility, and speaker correction must exist
before call evidence becomes profile-discoverable. A whole transcript is not
attributed to every attendee.

## Current Interaction Lineage Projection

Interaction search/read returns a deterministic lineage envelope:

- actor: existing interaction actor
- authority: the actor user for direct human evidence, the community for the
  community agent, otherwise system
- credit: direct human user or the autonomous community agent; no inferred human
  credit for personal-agent/system evidence
- origin: `community_chat`
- episode: the root evidence reference
- relation: the targeted reply when present, otherwise the root for replies
- profile projection: `source_only`

This envelope is a read projection over canonical interaction fields. It avoids
speculative database columns while current writes remain unambiguous. Enabling
agent-on-behalf publishing is the gate that requires persisted explicit
authority and credit.

## Deletions And Non-Goals

Delete these requirements from this slice:

- a universal lineage table or graph database
- people as structural hubs in the community intelligence graph
- copied message rows inside profiles
- automatic human credit for agent output
- synchronous concept or claim classification
- reputation, influence, or contribution scores
- Zoom ingestion before occurrence, consent, and speaker contracts exist
- resource lineage before interaction evidence has a live certificate
- lineage UI or graph visualization

## Proof Obligations

The interaction evidence proof must demonstrate:

1. Stable root/reply evidence and episode references.
2. Deterministic direct-human and autonomous-agent attribution.
3. No inferred human credit for personal-agent or system evidence.
4. Reply-to relations preserve target reply or root continuity.
5. All three retrieval surfaces are read-only and produce retrieval audit rows.
6. Community access and source visibility fail closed at read time.
7. Source traces preserve the source actor and evidence reference.
8. Redaction removes archive visibility, excludes the trace, and recursively
   fails closed for child evidence.
9. Profile projection remains `source_only`.
10. No concept table, profile projection table, or generic lineage-edge table is
    introduced by this slice.

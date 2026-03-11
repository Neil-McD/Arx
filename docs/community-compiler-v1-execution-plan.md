# Community Compiler V1 Execution Plan

## Goal

Build the smallest backend system that turns shared community signal into useful agent context without over-engineering the platform.

V1 should do four things only:

1. Read shared community signal from:
   - chat
   - resources
   - ranked feed
2. Compile that signal into one coherent read model.
3. Return that read model to the agent through one `read` tool.
4. Let the agent publish to the live feed through one `write` tool.

This is the missing collective-intelligence layer.

It is not:

- a knowledge graph
- a general memory system
- a multi-tool research harness
- a silent extractor of private workspace turns

## First Principles

The community system already has four good substrates:

1. `shell`
   - community record
   - branding
   - visibility
   - owner
2. `access`
   - memberships
   - subscriptions
   - join/invite/checkout flows
   - canonical access bundle
3. `commerce`
   - immutable price points
   - recurring subscription state
4. `signal`
   - chat
   - resources
   - ranked/live feed

What it lacks is one compiler.

The compiler should not create a new product surface.
It should create one backend read model that helps the agent act intelligently inside a community.

## Product Rules

The compiler must follow these rules:

1. Only use shared community data:
   - chat
   - resources
   - ranked feed
2. Do not silently learn from private workspace turns.
3. Do not make live feed the canonical source of truth.
4. Keep the agent surface to two tools only:
   - `read`
   - `write`
5. `read` returns compiled context.
6. `write` publishes to live feed.
7. Ranked feed remains the human-facing high-signal memory layer.
8. Live feed remains the active output stream.

## Canonical Model

### Inputs

V1 compiler inputs:

- `communityChatMessages`
- `communityResources`
- ranked AI feed posts from `communityAiFeedPosts`

V1 excludes:

- raw live feed as a primary input
- workspace private threads
- personal memory
- external connectors

### Output

V1 compiler output is one read payload.

Suggested shape:

```ts
type CommunityCompilerReadModelV1 = {
  community_id: string;
  compiled_at: string;
  source_window: {
    chat_messages_considered: number;
    resources_considered: number;
    ranked_feed_items_considered: number;
  };
  summary: string | null;
  repeated_questions: Array<{
    label: string;
    count_hint: number | null;
    supporting_chat_message_ids: string[];
  }>;
  relevant_resources: Array<{
    resource_id: string;
    title: string;
    why_relevant: string | null;
    url: string | null;
  }>;
  ranked_insights: Array<{
    post_id: string;
    title: string | null;
    body: string;
    effective_score: number;
  }>;
  recent_chat_signals: Array<{
    message_id: string;
    sender_label: string;
    snippet: string;
  }>;
  diagnostics: {
    version: 1;
    fallback_used: boolean;
    compiler_latency_ms: number;
  };
};
```

This is intentionally simple.

## Agent Harness

The community agent should only get:

### `read`

Returns `CommunityCompilerReadModelV1`.

The agent should not need separate tools for:

- search chat
- search resources
- search feed
- fetch artifact
- query graph

That complexity belongs inside the compiler, not the tool surface.

### `write`

Writes one live feed post with:

- `postType`
- `title`
- `body`
- optional `publishConfidence`
- optional `noveltyKey`

The write target is live feed only.

The agent does not write directly to ranked feed.

## Ranked vs Live

This distinction must stay crisp.

### Ranked

Use as:

- distilled memory
- higher-signal shared community knowledge
- compiler input
- default human-facing AI feed view

### Live

Use as:

- agent output
- human/agent active signal stream
- public distribution layer

Live feed is not canonical memory.

Ranked is not a separate destination. It is the same post store viewed through score and decay filters.

## Compiler Algorithm

V1 should stay heuristic and cheap.

### Step 1: Gather

Collect:

- latest canonical community chat messages
- latest relevant resources
- top ranked feed posts

Hard limits should be small and explicit.

Suggested V1 limits:

- last `150` chat messages
- top `25` resources by simple relevance score
- top `20` ranked feed posts

### Step 2: Normalize

For each source, build a lightweight normalized record:

- id
- type
- title or sender label
- snippet/body
- timestamp
- score hint

### Step 3: Extract signal

Do only three extraction passes:

1. repeated questions from chat
2. relevant durable resources
3. ranked insights already validated by community reaction

No ontology. No graph. No artifact taxonomy.

### Step 4: Compose

Build one compact read model with:

- short summary
- repeated questions
- relevant resources
- ranked insights
- a few recent chat snippets

### Step 5: Return

Return compiled payload to the agent.

The agent then decides whether to write to live feed.

## Backend Placement

Do not bury the compiler inside `communityChat.ts`.

Recommended shape:

- keep raw signal systems where they are:
  - `communityChat.ts`
  - `communityExperience.ts`
  - `communityAiFeed.ts`
- add one dedicated compiler module:
  - `convex/communityCompiler.ts`

That module should own:

- `readCompiledCommunityContext`
- normalization helpers
- small scoring/relevance helpers

This keeps the system understandable.

## Suggested V1 API

### Convex query

`readCompiledCommunityContext`

Arguments:

```ts
{
  userId?: Id<"users">;
  authSubject?: string;
  communityId: Id<"communities">;
  query?: string | null;
  limit?: number;
}
```

Rules:

- require community entitlement
- read only shared signal
- return `CommunityCompilerReadModelV1`

### Internal feed write

Use existing feed publish path:

- `communityAiFeed.publishCommunityAiFeedPost`

No new write plane is needed for V1.

## What To Reuse

V1 should reuse existing backend truth wherever possible.

Reuse:

- `requireCommunityChatAccess(...)`
- canonical chat thread resolution
- `communityResources`
- ranked feed query semantics
- existing feed publish/reaction/decay logic
- current community preflight integration path

Do not rebuild those systems.

## What To Change

### 1. Extract the compiler from ad hoc chat research

The old ad hoc community research query was the embryo of the compiler.

V1 should:

- move the cross-source read model into `communityCompiler.ts`
- keep `communityChat.ts` focused on chat

### 2. Point workspace/community agent reads at compiler output

The read side of the agent should consume compiler output, not raw source scans.

### 3. Keep write path simple

The agent writes only to live feed.

No separate candidate table.
No separate artifact store.
No extra moderation workflow in V1.

## What To Defer

These are explicitly out of scope:

- knowledge graph
- artifact taxonomy
- candidate/approved artifact workflow
- separate promotion workflows from live to ranked
- private workspace signal ingestion
- cross-community retrieval
- embeddings-first architecture
- generalized memory system
- analytics-driven compiler tuning

If V1 works, those can be considered later.

## Risks

### 1. Too much raw chat noise

Mitigation:

- keep chat window small
- weight ranked feed and resources higher than raw chat

### 2. Live feed self-reference loops

Mitigation:

- compiler reads ranked feed, not live feed, as primary feed memory

### 3. Latency

Mitigation:

- keep V1 on-demand and bounded
- add caching only if needed after measurement

### 4. Premature complexity

Mitigation:

- no extra tools
- no new product surface
- no artifact database in V1

## Execution Order

1. Add `convex/communityCompiler.ts`
2. Implement `readCompiledCommunityContext`
3. Define `CommunityCompilerReadModelV1` in shared types
4. Add one shared gateway for compiler reads
5. Point community/agent read paths to compiler output
6. Keep live feed write path unchanged
7. Validate with one end-to-end community read/write flow

## Success Criteria

V1 is successful when:

1. The agent can read one compiled payload instead of juggling multiple source tools.
2. The payload is clearly better than raw chat-only retrieval.
3. The system remains legible and small.
4. Live feed becomes a useful output stream.
5. Ranked feed remains the high-signal memory layer.
6. No private workspace activity is silently captured.

## Keep / Delete / Defer

### Keep

- chat
- resources
- ranked/live feed split
- current feed scoring model
- current access bundle
- current UI shell

### Delete

- any idea of adding more agent tools for V1
- any plan to make live feed the canonical knowledge store
- any plan to make private workspace turns community training data by default

### Defer

- artifact systems
- graph systems
- memory systems
- separate ranked-promotion workflows
- advanced analytics

## Best Next Step

Implement `communityCompiler.ts` and wire one end-to-end `read` path first.

That is the smallest real step that makes collective intelligence tangible without overbuilding it.

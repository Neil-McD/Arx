---
id: product.thread
title: Thread
audience: builder, member, llm
status: alpha-current
last_verified: 2026-07-12
---

# Thread

## Definition

A thread is a persistent conversation record between a user and the agent.

It is the durable unit of workspace conversation and context continuity.

## Why It Exists

Threads preserve context, allow work to continue over time, and provide an auditable record of messages, lens state, and runtime evidence.

Without threads, the workspace would be a stateless prompt box. Threads let the user build up work over time.

## User Mental Model

A personal-agent episode is a continuing private conversation even when the member moves between communities.

The user can leave and return to the thread. If they change the community lens, that changes what happens next, not what already happened.

## System Mental Model

A thread contains messages and can have an active community lens for future turns. Prior messages are not rewritten when the lens changes.

Thread history is one input to context. It must be bounded enough to preserve responsiveness and explicit enough to support auditability.

## Alpha-Current Behavior

The current thread model includes:

- persistent cloud thread records
- durable messages
- route-addressable thread URLs
- optional active community lens
- immutable per-run lens provenance
- episodic rotation through `Start fresh conversation`
- read-only recall of retained legacy per-community episodes
- runtime evidence and activity metadata
- thread rendering and runtime evidence

## Rules

1. Thread history is part of context.
2. Lens state must be explicit.
3. Lens switching does not retroactively mutate prior turns.
4. Context used for a turn should be reconstructable from stored records.
5. Large thread history should be managed carefully to protect latency.
6. A thread can have no active community lens.
7. Runtime evidence is operational evidence, not the product source of truth.
8. Thread context should be summarized, retrieved, or bounded rather than blindly copied forever.
9. A personal-agent episode belongs to the member, not to the community selected as its current lens.
10. Legacy per-community personal-agent episodes cannot receive new messages or runtime turns.

## Examples

- A member keeps a strategy thread open for repeated work.
- A member switches the active lens before asking for help from a different community context.
- The system stores runtime evidence showing which context and tools were used for a turn.

## Non-Goals

A thread is not a community chat room. A thread is a personal workspace conversation, even when it uses a community lens.

## Common Mistakes

- Treating prior messages as if they were created under the current lens after a lens switch.
- Treating runtime traces as canonical business data.
- Treating thread length as free; long threads affect latency and context quality.

## Related Concepts

- `workspace`
- `community-lens`
- `agent`
- `memory`

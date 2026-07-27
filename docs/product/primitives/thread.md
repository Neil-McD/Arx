---
id: product.thread
title: Thread
audience: operator, llm
status: internal-only
last_verified: 2026-07-27
---

# Thread

## Definition

A thread is an internal persistent conversation record between a member and the agent.

It is a backend persistence and audit primitive, not a user-facing destination.

## Why It Exists

Thread records preserve context, allow conversations to continue over time, and provide an auditable record of messages, lens state, and runtime evidence.

Without durable records, the member agent would be stateless and the context used for a turn could not be reconstructed.

## User Mental Model

A member experiences a continuing private conversation even when they move between communities.

The product may persist or rotate the underlying record without exposing thread navigation. A community-context change affects what happens next, not what already happened.

## System Mental Model

A thread record contains messages and can have an active community lens for future turns. Prior messages are not rewritten when the lens changes.

Thread history is one input to context. It must be bounded enough to preserve responsiveness and explicit enough to support auditability.

## Alpha-Current Behavior

The current thread model includes:

- persistent cloud thread records
- durable messages
- optional active community lens
- immutable per-run current-surface provenance
- immutable per-run lens provenance
- episodic rotation through `Start fresh conversation`
- read-only recall of retained legacy per-community episodes
- runtime evidence and activity metadata
- internal retrieval and runtime evidence

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
11. Discover and generic platform surfaces clear the active community lens before starting the next personal-agent turn.
12. A community page snapshot must match the thread's server-validated community lens.

## Examples

- The member agent continues a private conversation across page changes.
- The system applies a newly validated community context only to subsequent turns.
- An operator reconstructs which context and tools were used for a turn from stored evidence.

## Non-Goals

A thread is not a community chat room and not a member navigation surface.

## Common Mistakes

- Treating prior messages as if they were created under the current lens after a lens switch.
- Treating runtime traces as canonical business data.
- Treating thread length as free; long threads affect latency and context quality.

## Related Concepts

- `community-lens`
- `agent`
- `memory`

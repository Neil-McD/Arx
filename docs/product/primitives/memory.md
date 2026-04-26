---
id: product.memory
title: Memory
audience: builder, member, llm, operator
status: alpha-current
last_verified: 2026-04-26
---

# Memory

## Definition

Memory is explicit reusable context that can help agents maintain continuity.

## Why It Exists

Useful agents need continuity. Memory lets important context persist without requiring the user to repeat everything.

## User Mental Model

Memory should feel like the agent remembers useful facts and working context in a way the user can understand.

## System Mental Model

The current alpha memory surface is personal memory. Personal memory is owned by the authenticated user and is scoped as global or workspace memory in the backend. It requires sign-in, but it is not a Builder-only feature.

Community archive/retrieval evidence is different from personal memory. It is community-scoped knowledge or activity retrieved through explicit community context paths, not a private user memory store.

Future community memory or system memory should be treated as planned until the backend and product flows make those scopes explicit.

Memory should be bounded, inspectable, scoped, and access-controlled. It should not be a hidden dump of everything a user has ever said.

## Memory Terms

- Personal memory: authenticated user-owned context, currently global or workspace-scoped and available to signed-in users.
- Community archive/retrieval evidence: scoped community knowledge or activity retrieved through explicit tools or backend paths.
- Community memory: a future product concept unless a specific implementation and member-facing flow make it explicit.
- System memory: a future product concept unless a specific implementation and operator-facing flow make it explicit.

## Rules

1. Memory should be explicit.
2. Current personal memory scope is global or workspace.
3. Memory should respect access and privacy boundaries.
4. Private member usage should not be silently transformed into public collective intelligence.
5. Memory used in a turn should be explainable and auditable where practical.
6. Community archive/retrieval evidence should not be described as private personal memory.
7. Community or system memory should not be described as alpha-current unless the implementation and product flow are explicit.
8. Current personal memory should not be described as Builder-only.

## Related Concepts

- `thread`
- `community`
- `agent`
- `context-model`
- `security-privacy`

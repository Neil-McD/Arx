---
id: product.reference.context_model
title: Context Model
audience: builder, llm, operator
status: alpha-current
last_verified: 2026-04-26
---

# Context Model

## Definition

The context model defines what information the agent can use when responding.

## Context Stack

1. Platform doctrine
2. Agent soul
3. Community lens, if backend validated
4. Workspace context
5. Agent operating policy
6. Repo instruction docs, where relevant to the active runtime lane
7. User message content

## Context Inputs

The stack above defines authority order. The runtime can also use explicit inputs when allowed by that stack:

- user/session state
- thread history
- community resources
- community skills
- connected apps/MCP tools
- runtime/tool policy

These inputs do not outrank the canonical context stack.

## Explicit Exclusions

- Personal prompts are not part of the canonical context stack.
- Community intelligence evidence is not the same thing as community doctrine.
- Daytona snapshots are not the community lens.
- Community evidence should be gathered or injected through explicit, bounded runtime paths.

## Rules

1. Higher-authority context must override lower-authority context.
2. Community context requires access validation.
3. Thread history should be durable and auditable.
4. Resources and memory should be scoped.
5. Tool context should be explicit and bounded.
6. Prompt context should be explainable enough to debug.
7. Do not create a second independent doctrine surface outside the canonical markdown doctrine and runtime prompt projection.

## Related Concepts

- `thread`
- `community-lens`
- `resource`
- `skill`
- `memory`

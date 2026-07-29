---
id: product.reference.context_model
title: Context Model
audience: builder, llm, operator
status: alpha-current
last_verified: 2026-05-11
---

# Context Model

## Definition

The context model defines what information the agent can use when responding.

## Context Stack

1. Platform doctrine
2. Agent soul
3. Explanation and operating policy
4. Community lens, if backend validated
5. Platform harness context, including active tool families and optional project/workspace context
6. Personal skill and community skill prompt suffixes
7. Runtime turn context, including thread working state, terminal/tool evidence, and temporal context
8. User message content

## Context Inputs

The stack above defines authority order. The runtime can also use explicit inputs when allowed by that stack:

- user/session state
- thread history
- community resources
- community skills and community workflow indexes
- native runtime tools
- runtime/tool policy
- premium entitlement and tool accounting state

These inputs do not outrank the canonical context stack.

## Explicit Exclusions

- Personal prompts are not part of the canonical context stack.
- Community intelligence evidence is not the same thing as community doctrine.
- Long community profile/about content is not always-on doctrine; runtime prompts should carry compact identity and retrieve deeper active-community context through `polynet_list("/")` and `polynet_read("/community.md")`, with archive/activity lookup handled by `community_search`.
- workspace snapshots are not the community lens.
- Community evidence should be gathered or injected through explicit, bounded runtime paths.
- There is no free-vs-premium context branch. Account labels normalize before runtime prompt composition.
- Premium entitlement state is not a second doctrine layer; it gates premium capability exposure and execution.

## Rules

1. Higher-authority context must override lower-authority context.
2. Community context requires access validation.
3. Thread history should be durable and auditable.
4. Resources and memory should be scoped.
5. Tool context should be explicit and bounded.
6. Prompt injection must not fork by product-facing plan label.
7. Prompt context should be explainable enough to debug.
8. Do not create a second independent doctrine surface outside the canonical markdown doctrine and runtime prompt projection.

## Related Concepts

- `thread`
- `community-lens`
- `resource`
- `skill`
- `memory`

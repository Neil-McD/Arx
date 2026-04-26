---
id: product.reference.prompt_context_model
title: Prompt Context Model
audience: builder, llm, operator
status: alpha-current
last_verified: 2026-04-26
---

# Prompt Context Model

## Definition

The prompt context model defines how platform, community, user, and runtime instructions should be composed for agent turns.

## Principle

Documentation is the canonical product truth. Prompts reference and apply that truth. Prompts should not become the undocumented source of product behavior.

## Authority Order

Prompt composition must follow the canonical context stack in `reference/context-model.md`. The compact order is:

1. Platform doctrine
2. Agent soul
3. Community lens, if backend validated
4. Workspace context
5. Agent operating policy
6. Repo instruction docs, where relevant to the active runtime lane
7. User message content

Within that stack, prompt inputs should be applied with these boundaries:

1. Platform safety and product rules
2. Access and entitlement rules
3. Runtime/tool policy
4. Community owner/admin instructions
5. Skill instructions
6. Resource-derived context
7. User request

## Rules

1. Community prompts cannot bypass platform rules.
2. Owner instructions cannot grant access.
3. Skills cannot grant tools by themselves.
4. Resource context should be bounded and relevant.
5. Prompt changes should be versioned or auditable where practical.
6. Prompts should prefer references to docs and resources over copying huge blobs.
7. This file does not define a separate precedence model from `reference/context-model.md`.

## Related Concepts

- `agent`
- `skill`
- `resource`
- `community-lens`
- `context-model`

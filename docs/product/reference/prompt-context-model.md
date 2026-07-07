---
id: product.reference.prompt_context_model
title: Prompt Context Model
audience: builder, llm, operator
status: alpha-current
last_verified: 2026-05-11
---

# Prompt Context Model

## Definition

The prompt context model defines how platform, community, user, runtime, and tool instructions are composed for agent turns.

## Principle

Documentation is the canonical product truth. Prompts reference and apply that truth. Prompts should not become the undocumented source of product behavior.

There is one platform harness prompt stack. Free and Polynet Premium labels must not select different prompt stacks. Runtime context decides what parts of the one stack are populated.

## Authority Order

Prompt composition must follow the canonical context stack in `reference/context-model.md`. The compact order is:

1. Platform doctrine
2. Agent soul
3. Explanation and operating policy
4. Community lens, if backend validated
5. Platform harness context, including active tools and optional project/workspace context
6. Mounted app, personal skill, and community skill prompt suffixes
7. Runtime turn context, including thread working state, terminal/tool evidence, and temporal context
8. User message content

Within that stack, prompt inputs should be applied with these boundaries:

1. Platform safety and product rules
2. Access and entitlement rules
3. Runtime/tool policy
4. Community owner/admin instructions
5. Skill instructions
6. Resource-derived context
7. User request

## Runtime Selection

Prompt injection is contextual, not subscription-tiered:

1. Anonymous chat receives only the public/demo path.
2. Authenticated users use the same platform harness stack.
3. A backend-validated community lens adds compact community identity, community prompt, community app grants, and community workflow context.
4. A project-bound thread adds workspace/project context and workspace tools.
5. Web research can be exposed when Premium entitlement allows it.
6. Premium entitlement is enforced before premium tools are exposed or executed. Free users should receive a clear upgrade path instead of a tool call attempt.

## Rules

1. Community prompts cannot bypass platform rules.
2. Owner instructions cannot grant access.
3. Skills cannot grant tools by themselves.
4. Resource context should be bounded and relevant.
5. Community workflow context should prefer active-lens workflows when relevant without hiding personal skills or connected apps.
6. Deeper active-community profile context should come from `get_active_community_context`; archive, resource, activity, and memory evidence should come from `community_search`.
7. Prompt changes should be versioned or auditable where practical.
8. Prompts should prefer references to docs and resources over copying huge blobs.
9. Prompt code must not branch on Builder, Pro, or product-facing paid-plan labels.
10. This file does not define a separate precedence model from `reference/context-model.md`.

## Related Concepts

- `agent`
- `skill`
- `resource`
- `community-lens`
- `context-model`

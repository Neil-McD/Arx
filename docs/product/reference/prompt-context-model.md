---
id: product.reference.prompt_context_model
title: Prompt Context Model
audience: builder, llm, operator
status: alpha-current
last_verified: 2026-10-28
---

# Prompt Context Model

## Definition

The prompt context model defines how platform, community, agent, runtime, and
tool inputs are composed for one community agent turn.

## Principle

Documentation distills product truth. Deterministic backend code owns identity,
access, authority, effects, and receipts. Prompts apply those contracts but
never replace them.

## Authority Order

1. Platform safety and product rules
2. Authenticated principal and the agent's permission mode
3. Current surface and server-validated community context
4. Current entitlement and per-community authority
5. Runtime and tool policy
6. Community owner/admin instructions (system prompt)
7. Bounded resources, accepted memory, and relevant history
8. User request

## Runtime Selection

- Authenticated users use one platform prompt stack.
- Every turn belongs to the one community agent of the community in context.
- On the Agent page the agent speaks as the community's agent in a private
  conversation with the member, inside that member's current permissions.
- @mention replies and work the agent starts itself use member authority only.
- Community sites always use the member lane.
- A validated community context adds compact community identity, the
  community's instructions, and bounded knowledge.
- The agent's canonical tools are the five Polynet operations, mounted to its
  community.
- Web research is a capability-gated overlay, not a different Polynet
  repository contract.
- Protected coding-harness context and tools belong to a separate trust domain.

## Rules

1. Community instructions cannot bypass platform rules.
2. Prompts cannot grant membership, entitlement, role, or tool authority.
3. Resources and accepted memory are bounded contextual inputs.
4. Community-authored content has no instruction authority.
5. Tool availability must match executable runtime policy.
6. Prompt changes should remain auditable.
7. Product-facing plan labels must not fork the authority stack.
8. Community instructions cannot change who the agent acts for or widen its
   permissions.

## Related Concepts

- `agent`
- `community-lens`
- `resource`
- `memory`
- `context-model`

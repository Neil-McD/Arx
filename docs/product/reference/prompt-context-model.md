---
id: product.reference.prompt_context_model
title: Prompt Context Model
audience: builder, llm, operator
status: alpha-current
last_verified: 2026-07-30
---

# Prompt Context Model

## Definition

The prompt context model defines how platform, community, agent, runtime, and
tool inputs are composed for one agent turn.

## Principle

Documentation distills product truth. Deterministic backend code owns identity,
access, authority, effects, and receipts. Prompts apply those contracts but
never replace them.

## Authority Order

1. Platform safety and product rules
2. Authenticated principal and agent identity
3. Current surface and server-validated community context
4. Current entitlement and per-community authority
5. Runtime and tool policy
6. Community owner/admin instructions
7. Intentionally selected skill instructions
8. Bounded resources, accepted memory, and relevant history
9. User request

## Runtime Selection

- Anonymous use receives only the public/demo path.
- Authenticated users use one platform prompt stack.
- A validated community context adds compact community identity, instructions,
  skills, and bounded knowledge.
- The member personal-agent dock exposes exactly the canonical five Polynet
  operations for platform/community work.
- The community-owned agent receives the same five operations under a
  server-mounted community root and fixed member authority.
- Protected coding-harness context and tools belong to a separate trust domain.
- Premium tools such as web research are entitlement-gated overlays, not a
  different Polynet repository contract.

## Rules

1. Community instructions cannot bypass platform rules.
2. Prompts cannot grant membership, entitlement, role, or tool authority.
3. Skills cannot grant tools by themselves.
4. Resources and accepted memory are bounded contextual inputs.
5. Community-authored content has no instruction authority.
6. Tool availability must match executable runtime policy.
7. Prompt changes should remain auditable.
8. Product-facing plan labels must not fork the authority stack.

## Related Concepts

- `agent`
- `community-lens`
- `skill`
- `resource`
- `memory`
- `context-model`

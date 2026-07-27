---
id: product.guide.community_lens
title: Use a Community Lens
audience: member, builder, llm
status: alpha-current
last_verified: 2026-07-27
---

# Use a Community Lens

## Goal

Use the right authorized community context with the member agent.

## Mental Model

The current Polynet surface orients the member agent. On an authorized community page, the lens tells the agent, "Use this community's knowledge and rules for what I ask next." Discover and generic platform pages carry no community lens.

## Rules

1. Lens changes affect future turns only.
2. The backend must validate access.
3. The member-agent dock should identify its current surface orientation.
4. If access is missing, the lens should not provide community context.
5. Navigating between surfaces must update subsequent-turn context deterministically.

## Related Concepts

- `community-lens`
- `agent`
- `entitlement`

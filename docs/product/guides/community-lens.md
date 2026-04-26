---
id: product.guide.community_lens
title: Use a Community Lens
audience: member, builder, llm
status: alpha-current
last_verified: 2026-04-26
---

# Use a Community Lens

## Goal

Use the right community context inside a workspace thread.

## Mental Model

The lens is the community context for the next agent turn. It is like telling the agent, "Use this community's knowledge and rules for what I ask next."

## Rules

1. Lens changes affect future turns only.
2. The backend must validate access.
3. The UI should show which lens is active.
4. If access is missing, the lens should not provide community context.
5. Switching lenses should be fast and deterministic.

## Related Concepts

- `community-lens`
- `thread`
- `workspace`
- `entitlement`


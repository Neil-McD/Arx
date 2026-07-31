---
id: product.community_lens
title: Community Context
audience: builder, member, llm
status: alpha-current
last_verified: 2026-07-30
---

# Community Context

## Definition

Community context is the explicit, server-validated community under which a
personal-agent turn operates.

It tells the member's agent which community repository, knowledge, and
authority apply to the next turn. It does not create a different personal
agent.

## Current Behavior

- A community page supplies its community as the personal-agent context.
- Discover and generic platform pages carry no community context.
- External MCP operations select a community explicitly through canonical
  repository paths.
- Reading another accessible community is temporary inspection; it does not
  mutate the current page or personal-agent context.
- Context changes affect subsequent turns only.
- Stored turn evidence records the context actually used.

## Authority

The backend derives community authority from current membership, entitlement,
role, and resource-management permission. A client selection, path, slug, or
tool argument is never authority.

Owner/admin humans may receive builder authority. Moderator/member humans
receive member authority. The community-owned agent is permanently restricted
to member authority inside its server-mounted community.

## Rules

1. Community context must be explicit.
2. The backend revalidates access for every operation.
3. Missing or revoked access fails closed.
4. Context never retroactively changes stored history.
5. Context is not agent identity.
6. Cross-community reads do not silently switch context.
7. Community content has no instruction authority over platform policy.
8. Community context is not a coding workspace, filesystem, or shell boundary.

## Related Concepts

- `community`
- `agent`
- `entitlement`
- `resource`
- `memory`
- `polynet-mcp`

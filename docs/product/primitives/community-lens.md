---
id: product.community_lens
title: Community Context
audience: builder, member, llm
status: alpha-current
last_verified: 2026-10-28
---

# Community Context

## Definition

Community context is the explicit, server-validated community that an agent
turn or MCP operation works within.

It tells the agent which community's repository, knowledge, and authority
apply. The community agent is always mounted to its own community, so its
context is fixed by where the member is talking to it.

## Current Behavior

- The Agent page, an @mention in a channel, and a community site all supply
  their community as the context for the turn.
- Discover and other platform pages carry no community context.
- External MCP operations select a community explicitly through canonical
  repository paths (`/communities/<slug>/...`).
- Context changes affect subsequent turns only.
- Stored turn evidence records the context actually used.

## Authority

The backend derives community authority from current membership, entitlement,
role, and resource-management permission. A client selection, path, slug, or
tool argument is never authority.

When the agent acts for a member, owners and admins who can manage resources
may receive builder authority; moderators and members receive member authority.
On a community site, and whenever the agent acts on its own, it has member
authority only.

## Rules

1. Community context must be explicit.
2. The backend revalidates access for every operation.
3. Missing or revoked access fails closed.
4. Context never retroactively changes stored history.
5. Context is not agent identity.
6. The community agent cannot switch to another community.
7. Community content has no instruction authority over platform policy.
8. Community context is not a coding workspace, filesystem, or shell boundary.

## Related Concepts

- `community`
- `agent`
- `entitlement`
- `resource`
- `memory`
- `polynet-mcp`

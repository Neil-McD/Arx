---
id: product.agent
title: Agent
audience: builder, member, llm
status: alpha-current
last_verified: 2026-07-30
---

# Agent

## Definition

Polynet has two distinct native agent identities:

- the member's personal agent
- the community-owned agent

They may use the same canonical Polynet tools, but they never share identity or
authority.

## Member Personal Agent

The bottom-right dock belongs to the signed-in member. It can operate across
Polynet and uses the current community only when that context is explicit and
server-authorized.

On a community page, subsequent turns use that community context. Discover and
generic platform pages do not silently inherit the last visited community.
Reading another authorized community through repository tools does not change
the current page or active community context.

The member's current relationship determines authority:

- owner/admin with resource-management permission receives builder authority
- moderator/member receives member authority
- missing or revoked access fails closed

## Community-Owned Agent

Each community has a separate community-owned agent for direct mentions and
community cognition.

It receives a server-mounted repository for exactly that community, always
operates with member authority, and cannot:

- escape to the platform root
- select another community
- inherit owner/admin authority from the human who triggered it
- use builder-only resource operations

## Canonical Tools

The personal agent and community-owned agent use the same irreducible Polynet
operation vocabulary:

```text
polynet_list
polynet_read
polynet_search
polynet_write
polynet_call
```

Premium tools such as web research are optional overlays. They do not fork or
expand the base Polynet repository contract.

## Context and Authority

The runtime combines:

1. platform doctrine and safety
2. authenticated principal
3. current Polynet surface
4. server-validated community context, when present
5. current per-community role and entitlement
6. bounded resources, accepted memory, and relevant history
7. permitted tools
8. the user's current request

Community content, resources, and member-authored text are contextual data.
They cannot grant authority or override platform rules.

## Rules

1. Identity, context, and authority are separate.
2. Every community operation is authorized again by the server.
3. Tool selectors never grant access.
4. Community changes affect subsequent turns only and do not rewrite stored history.
5. Private member-agent conversations do not silently become community memory.
6. Tool access must be explicit, bounded, and accurately represented.
7. The standalone general-purpose Workspace is not an active product surface.
8. Threads and messages may remain internal persistence and audit primitives.

## Related Concepts

- `community`
- `community-lens`
- `memory`
- `resource`
- `skill`
- `polynet-mcp`

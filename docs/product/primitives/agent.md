---
id: product.agent
title: Community Agent
audience: builder, member, llm
status: alpha-current
last_verified: 2026-10-28
---

# Community Agent

## Definition

Every community has exactly one agent: the community agent. It belongs to the
community, not to any member, and it always works inside that one community.

There is no separate Polynet assistant that follows a member across
communities. People bring their own AI (Claude, Codex, and similar harnesses)
through the official Polynet MCP, which is limited to builders (owners and
admins) today.

## Where Members Reach It

- **Agent page.** Each member has a private conversation with the community
  agent on the community's Agent page (desktop) or Agent tab (mobile). The
  conversation belongs to that member and that community.
- **@mention in chat.** Mentioning the agent in a channel asks it to reply in
  that channel, where everyone with access can see the reply.
- **Community site.** Where a community has a site, its `/ask` page opens the
  same member's private conversation with the same agent.

These are one agent, not several. What it writes for a member is the agent's
post, attributed to that member's request.

## Two Permission Modes

The agent has one identity and two ways of acting:

1. **Acting for a member.** On the Agent page and on sites, the agent works
   inside the requesting member's current permissions. An owner or admin who
   can manage resources gets builder actions (for example, staging resource
   changes for review). Everyone else gets member actions. On a community site
   the agent always uses member actions, even for the owner.
2. **Acting on its own.** For @mention replies and work it starts itself
   (such as memory work), the agent uses member authority only. It never
   inherits the owner's or admin's authority from whoever triggered it.

In both modes the agent is mounted to its one community. It cannot escape to
the platform root, select another community, or use builder-only operations it
was not granted.

## Community Context

The agent's community context is always explicit and checked by the server.
Membership, entitlement, and role are re-derived for every operation. Missing
or revoked access fails closed. Context changes affect subsequent turns only
and never rewrite stored history.

## Canonical Tools

The agent uses the same five Polynet operations exposed by the official MCP:

```text
polynet_list
polynet_read
polynet_search
polynet_write
polynet_call
```

Web research is an optional overlay. It does not change the five-operation
contract.

## Context and Authority

Each turn combines, in order of precedence:

1. platform doctrine and safety
2. the authenticated member and the agent's permission mode
3. the current surface (Agent page, chat mention, or site)
4. server-validated community context
5. the member's current role and entitlement in that community
6. the community's instructions from its owner or admins
7. bounded resources, accepted memory, and relevant history
8. the member's current request

Community content, resources, and member-authored text are data. They cannot
grant authority or override platform rules.

## Privacy

A member's private conversation with the agent stays private. It never becomes
shared community memory and never crosses into another community. Founders see
outcomes, not members' private words.

## Rules

1. One agent per community; it belongs to the community.
2. Identity, context, and authority are separate.
3. Every community operation is authorized again by the server.
4. Tool selectors and paths never grant access.
5. Context changes affect subsequent turns only.
6. Private member conversations do not become community memory.
7. Tool access must be explicit, bounded, and accurately represented.
8. Threads and messages remain internal persistence and audit primitives, not
   product navigation.

## Related Concepts

- `community`
- `community-lens`
- `memory`
- `resource`
- `polynet-mcp`

---
id: product.reference.context_model
title: Context Model
audience: builder, llm, operator
status: alpha-current
last_verified: 2026-10-28
---

# Context Model

## Definition

The context model defines what information the community agent (or an MCP
caller) can use for one turn and what authority applies to every operation.

Context guides relevance. It never grants access.

## Context Stack

1. Platform doctrine and safety
2. Authenticated principal and the agent's permission mode
3. Current surface (Agent page, chat mention, community site, or MCP)
4. Server-validated community context
5. Current per-community role, entitlement, and effective authority
6. Agent operating policy and the community's instructions
7. Bounded resources, accepted memory, relevant history, and tool evidence
8. User message content

Higher layers constrain lower layers.

## Agent Identity

Each community has one agent, owned by the community. It has two permission
modes:

- **for a member** (Agent page, community sites): it works inside the
  requesting member's current permissions; on sites, always the member lane
- **on its own** (@mention replies and work it starts itself): it works with
  member authority only

There is no Polynet personal assistant that belongs to a member across
communities.

## Community Context

The Agent page, a channel mention, and a community site each supply one
explicit community. Discover and other platform pages carry no community
context. External MCP requests select community paths explicitly. Every
operation revalidates access.

The community agent is mounted to its community and cannot switch to another
one.

## Repository Context

The canonical five Polynet operations expose a permission-filtered virtual
repository. Paths and search indexes locate objects; they do not provide
authority. Community and member-authored Markdown is contextual data, not
trusted instruction.

## Protected Coding Context

Project files, coding workspace state, shell tools, and terminal evidence
belong to a separate protected coding-harness trust domain. They are not a
product surface and are never exposed by the web Polynet repository.

## Rules

1. Community context requires current membership and entitlement.
2. Authority is derived by the server for every operation.
3. Community context changes affect subsequent turns only.
4. Stored turn history remains auditable.
5. Resources, accepted memory, and history remain distinct evidence lanes.
6. Tool context is explicit and bounded.
7. A member's private conversation with the agent is not shared community
   knowledge.
8. Prompt injection cannot cross from contextual evidence into trusted policy.

## Related Concepts

- `agent`
- `community-lens`
- `resource`
- `memory`
- `polynet-mcp`

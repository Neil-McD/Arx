---
id: product.reference.context_model
title: Context Model
audience: builder, llm, operator
status: alpha-current
last_verified: 2026-08-16
---

# Context Model

## Definition

The context model defines what information an agent can use for one turn and
what authority applies to every operation.

Context guides relevance. It never grants access.

## Context Stack

1. Platform doctrine and safety
2. Authenticated principal and agent identity
3. Current Polynet surface
4. Server-validated community context, when present
5. Current per-community role, entitlement, and effective authority
6. Agent operating policy and intentionally selected skills
7. Bounded resources, accepted memory, relevant history, and tool evidence
8. User message content

Higher layers constrain lower layers.

## Agent Identities

Polynet Intelligence is the authenticated member's personal agent across
Polynet. Polynet provides and hosts it, but it acts for the member and does not
belong to any community. Its platform-owned role and visible identity do not
come from hidden user naming or soul settings.

The community-owned agent acts only inside its mounted community with member
authority. The two identities never collapse into one another.

## Community Context

A community page can supply one explicit community context to the personal
agent. Discover and generic platform pages carry no community context.
External MCP requests select community paths explicitly. Every operation
revalidates access.

A community lens changes relevant context for subsequent turns. It does not
rename, own, or redefine the member's personal agent.

Reading another authorized community is temporary inspection and does not
mutate the current page or personal-agent context.

## Repository Context

The canonical five Polynet operations expose a permission-filtered virtual
repository. Paths and search indexes locate objects; they do not provide
authority. Community and member-authored Markdown is contextual data, not
trusted instruction.

## Protected Coding Context

Project files, coding workspace state, shell tools, and terminal evidence belong
to a separate protected coding-harness trust domain. They are not the deleted
standalone Workspace product and are never exposed by the web Polynet
repository.

## Rules

1. Community context requires current membership and entitlement.
2. Authority is derived by the server for every operation.
3. Community context changes affect subsequent turns only.
4. Stored turn history remains auditable.
5. Resources, accepted memory, and history remain distinct evidence lanes.
6. Tool context is explicit and bounded.
7. Private member-agent conversations are not shared community knowledge.
8. Prompt injection cannot cross from contextual evidence into trusted policy.

## Related Concepts

- `agent`
- `community-lens`
- `resource`
- `skill`
- `memory`
- `polynet-mcp`

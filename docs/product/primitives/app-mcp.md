---
id: product.app_mcp
title: Apps and MCPs
audience: builder, llm, operator
status: alpha-current
last_verified: 2026-05-05
---

# Apps and MCPs

## Definition

An app or MCP connection is a capability surface that lets Polynet connect to external tools, data, workflows, or remote tool servers.

## Why It Exists

Apps and MCPs let a builder extend an agent beyond static instructions by connecting it to useful external systems.

## User Mental Model

Apps are things a user can connect to their harness so the agent has more useful capability. Builders can recommend apps through a community, but runtime capability still comes from each member's own harness state.

## System Mental Model

Apps and MCPs should be explicit, permissioned, and scoped. They are not ambient global powers.

## Rules

1. Remote tool capability must be explicit.
2. A connected app does not automatically imply every user can use every tool.
3. Community-recommended capability should seed or route to the user's canonical harness state.
4. Tool availability should be distinguishable from product marketing copy.
5. Unknown or unverified integrations should be documented as catalog or planned, not live capability.

## Non-Goals

Apps and MCPs are not a reason to turn Polynet into a general IDE or unbounded automation platform during MVP.

## Related Concepts

- `agent`
- `skill`
- `community`
- `entitlement`

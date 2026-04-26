---
id: product.app_mcp
title: Apps and MCPs
audience: builder, llm, operator
status: alpha-current
last_verified: 2026-04-26
---

# Apps and MCPs

## Definition

An app or MCP connection is a capability surface that lets Polynet connect to external tools, data, workflows, or remote tool servers.

## Why It Exists

Apps and MCPs let a builder extend an agent beyond static instructions by connecting it to useful external systems.

## User Mental Model

Apps are things the builder can connect or mount so the agent has more useful capability.

## System Mental Model

Apps and MCPs should be explicit, permissioned, and scoped. They are not ambient global powers.

## Rules

1. Remote tool capability must be explicit.
2. A connected app does not automatically imply every user can use every tool.
3. Community-mounted capability should respect community access and role rules.
4. Tool availability should be distinguishable from product marketing copy.
5. Unknown or unverified integrations should be documented as catalog or planned, not live capability.

## Non-Goals

Apps and MCPs are not a reason to turn Polynet into a general IDE or unbounded automation platform during MVP.

## Related Concepts

- `agent`
- `skill`
- `community`
- `entitlement`


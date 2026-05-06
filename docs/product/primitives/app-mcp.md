---
id: product.app_mcp
title: Apps and MCPs
audience: builder, llm, operator
status: alpha-current
last_verified: 2026-05-06
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

Each catalog app should resolve to an integration profile: MCP, connector backplane, direct API, sandboxed CLI, or catalog-only. That profile describes readiness, adapter intent, identity scope, and default tool risk; the user's harness state still decides what can actually run.

## Rules

1. Remote tool capability must be explicit.
2. A connected app does not automatically imply every user can use every tool.
3. Community-recommended capability should seed or route to the user's canonical harness state.
4. Tool availability should be distinguishable from product marketing copy.
5. Unknown or unverified integrations should be documented as catalog or planned, not live capability.
6. No app should be marked ready unless its adapter, validation, auth mode, identity, and risk metadata are explicit.
7. Catalog app connection inputs are server-authoritative; client-supplied endpoint, auth mode, and name are only requests.
8. Endpoint-instance apps must not collapse by catalog id alone.
9. Uncataloged remote MCP endpoints should not be server-fetched until they have a reviewed catalog policy or network egress guard.

## Non-Goals

Apps and MCPs are not a reason to turn Polynet into a general IDE or unbounded automation platform during MVP.

## Related Concepts

- `agent`
- `skill`
- `community`
- `entitlement`

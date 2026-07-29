---
id: product.polynet_mcp
title: Polynet MCP
audience: builder, llm, operator
status: alpha-current
last_verified: 2026-07-28
---

# Polynet MCP

## Definition

Polynet MCP is the official OAuth-protected provider that lets an external AI
harness use authorized Polynet community context.

## Mental Model

The direction is one way:

`external harness -> official Polynet MCP -> Polynet-owned capabilities`

Polynet does not consume, connect, mount, or proxy third-party MCP servers.

## Current Behavior

- The canonical endpoint is `/runtime/mcp`.
- The external harness authenticates the Polynet member through OAuth.
- Community selection is explicit.
- Every request revalidates membership, entitlement, and capability.
- Tool arguments are selectors, never authority.
- The community context used by a call is auditable.

## Rules

1. Keep the official provider separate from third-party MCP consumption.
2. Fail closed when community access or entitlement is missing.
3. Revalidate access on every request.
4. Do not expose local filesystem or shell authority through the web provider.
5. Do not add third-party MCP credentials, mounts, or passthrough tools.
6. Preserve the stable external `workspace` wire vocabulary only where the v0
   compatibility contract requires it.

## Related Concepts

- `community-lens`
- `entitlement`
- `resource`
- `memory`
- `agent`

---
id: product.polynet_mcp
title: Polynet MCP
audience: builder, llm, operator
status: alpha-current
last_verified: 2026-10-28
---

# Polynet MCP

## Definition

Polynet MCP is the official OAuth-protected provider that lets a builder's
external AI harness (Claude Code, Codex, or another compatible client) work on
the communities they build.

It is builder-only today: the caller must be an owner or admin of a community,
and every community it touches must be one where they have builder authority.
Members use their community's Agent page, chat, or site instead.

## Mental Model

The direction is one way:

`external harness -> official Polynet MCP -> Polynet-owned capabilities`

Polynet does not consume, connect, mount, or proxy third-party MCP servers.

## Current Behavior

- The canonical endpoint is `/runtime/mcp`.
- The external harness authenticates the Polynet user through OAuth.
- The provider exposes exactly `polynet_list`, `polynet_read`,
  `polynet_search`, `polynet_write`, and `polynet_call`.
- The harness begins at `/` and selects communities through canonical
  repository paths.
- Every request revalidates builder status, membership, entitlement, and
  capability.
- Tool arguments are selectors, never authority.
- The community context used by a call is auditable.
- Calls into a community where the caller lacks builder authority are refused.
- Builders can also deploy their community site through the MCP.

## Rules

1. Keep the official provider separate from third-party MCP consumption.
2. Fail closed when builder authority, community access, or entitlement is
   missing.
3. Revalidate access on every request.
4. Do not expose local filesystem or shell authority through the web provider.
5. Do not add third-party MCP credentials, mounts, or passthrough tools.
6. Preserve the stable external `workspace` wire vocabulary only where the v0
   compatibility contract requires it.
7. Capability overlays such as web research do not expand or fork the five-tool
   Polynet contract.

## Related Concepts

- `community-lens`
- `entitlement`
- `resource`
- `memory`
- `agent`

---
id: product.polynet_mcp
title: Polynet MCP
audience: builder, llm, operator
status: alpha-current
last_verified: 2026-11-25
---

# Polynet MCP

## Definition

Polynet MCP is the official OAuth-protected provider that lets anyone's
external AI harness (Claude, ChatGPT, Claude Code, Codex, Cursor, or another
compatible client) work in the communities they belong to, in the lens their
role there allows:

- **Members** read what they can see in the community and write their own
  things: posts and replies, edits to their own posts, reactions, lesson
  progress.
- **Moderators** also review join requests and remove posts.
- **Owners and admins** also get the builder lens: managing community settings,
  courses, events, handbook/knowledge, and member roles or removals (removing or
  banning a paying member stays in Studio because it cancels their
  subscription). Name, address, and visibility are the owner's alone.

Actions that decide about people or posts take a selection: up to 50 items,
each decided on its own with its own receipt.

Writes through your own AI share a rate budget of 60 a minute; past it, a call
is refused with `rate_limited` and says when to retry.

## Mental Model

The direction is one way:

`external harness -> official Polynet MCP -> Polynet-owned capabilities`

Polynet does not consume, connect, mount, or proxy third-party MCP servers.

## Current Behavior

- The canonical endpoint is `/runtime/mcp`.
- The external harness authenticates the Polynet user through OAuth.
- Reading uses three general tools (`polynet_list`, `polynet_read`,
  `polynet_search`), and each allowed action is exposed as its own named tool
  scoped to the caller's role.
- The harness begins at `/` and selects communities through canonical
  repository paths.
- Every request revalidates membership, entitlement, role, and capability.
- Tool arguments are selectors, never authority.
- The community context used by a call is auditable.
- Calls into a community where the caller lacks membership or required role
  authority fail closed.

## Rules

1. Keep the official provider separate from third-party MCP consumption.
2. Fail closed when community access, role authority, or entitlement is
   missing.
3. Revalidate access on every request.
4. Do not expose local filesystem or shell authority through the web provider.
5. Do not add third-party MCP credentials, mounts, or passthrough tools.
6. Every named action tool routes through the same canonical executor,
   authorization, rate limits, and idempotent receipts.

## Related Concepts

- `community-lens`
- `entitlement`
- `resource`
- `memory`
- `agent`

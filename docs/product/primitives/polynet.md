---
id: product.polynet
title: Polynet
audience: builder, member, llm
status: alpha-current
last_verified: 2026-10-28
---

# Polynet

## Definition

Polynet is an AI-native collective intelligence platform where founders build
communities that can think, remember, and act with AI.

It combines community, access control, shared knowledge, member participation,
one community agent, and monetization in one understandable system.

## Why It Exists

Founders should be able to run a community, its knowledge, its access and
payments, and an AI that serves every member without stitching together
separate tools.

The goal is not "add AI to a community." The goal is to make the community,
its members, and its intelligence reinforce one another.

## User Mental Model

A founder creates a community, shares its join link, and manages it in
Polynet Studio.

A member joins communities, takes part in chat, uses shared resources and
events, and talks with the community's agent privately on the Agent page or by
@mention in chat.

Each community has exactly one agent. It belongs to the community and acts for
each member inside that member's permissions.

## System Mental Model

Polynet combines:

- communities as the product, distribution, and authority boundary
- entitlements as access truth
- roles as per-community authority
- resources and accepted memory as community-owned knowledge
- one community agent per community
- one five-operation repository interface shared by the community agent and
  the official MCP

The product stays understandable through explicit access, payment, community
context, memory, authority, and receipts.

## Alpha-Current Behavior

The active surface includes:

- sign-in and sessions
- community creation and management in Polynet Studio
- Published and Unlisted visibility
- gated access through each community's join page (`/c/<slug>`)
- community chat, resources, events, members, settings, and voice input
- billing and builder payouts
- the community agent on the Agent page and through @mentions
- accepted community memory
- the official OAuth-protected Polynet MCP for builders
- the canonical `polynet_list`, `polynet_read`, `polynet_search`,
  `polynet_write`, and `polynet_call` operations

Community sites on `polynet.page` are built and running on Polynet's staging
environment; production sites are not live yet.

## Rules

1. The community is the primary product and authority boundary.
2. Access is entitlement-driven and evaluated by the backend.
3. Each community has one agent, and it belongs to the community.
4. Community context is explicit and server-validated.
5. Collective intelligence comes from shared activity, curated resources, and
   accepted community memory, never from private conversations.
6. The official Polynet MCP exposes Polynet; Polynet does not consume
   third-party MCP servers.
7. Prompts and generated indexes never become authority.

## Examples

- A founder launches a paid community around a specialized methodology.
- Members participate, use shared resources, and ask the community agent for
  help in their own private conversation.
- The agent replies to @mentions in chat and helps the community remember
  what it has learned, without inheriting builder authority.
- A founder connects Claude Code or Codex to the official Polynet MCP and
  works on their community through the same five Polynet operations.

## Non-Goals

Polynet is not a standalone general-purpose Workspace, an app or skills
catalog, a third-party MCP marketplace, a funnel or page builder inside
Studio, or a generic automation platform.

Internal threads and external compatibility fields may remain implementation
substrate without becoming product navigation.

## Related Concepts

- `community`
- `agent`
- `community-lens`
- `memory`
- `community-site`
- `polynet-mcp`
- `entitlement`

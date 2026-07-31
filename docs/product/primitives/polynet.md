---
id: product.polynet
title: Polynet
audience: builder, member, llm
status: alpha-current
last_verified: 2026-07-30
---

# Polynet

## Definition

Polynet is an AI-native collective intelligence platform where builders create
communities that can think, remember, and act with AI.

It combines community, access control, shared knowledge, member participation,
agent capability, and monetization in one understandable system.

## Why It Exists

Builders should be able to package expertise, workflows, judgment, resources,
and agent capability into a community product instead of stitching together
separate tools for AI, payments, community, and delivery.

The core problem is not "add AI to a community." The goal is to make the
community, its members, and its intelligence layer reinforce one another.

## User Mental Model

A builder launches a community intelligence system.

A member joins communities, participates in chat and the AI Feed, uses shared
resources, and asks their personal agent for help under the current community
context.

Each community also has a separate community-owned agent for direct mentions
and community cognition.

## System Mental Model

Polynet combines:

- communities as product, distribution, and authority boundaries
- entitlements as access truth
- roles as per-community authority
- resources and accepted memory as community-owned knowledge
- a member-owned personal agent
- a separate community-owned agent
- one five-operation repository interface shared by native and external
  harnesses

The product stays understandable through explicit access, payment, community
context, memory, authority, and receipts.

## Alpha-Current Behavior

The active MVP surface includes:

- auth and session lifecycle
- community creation and management
- Published and Unlisted visibility
- gated access and public community funnels
- community chat, AI Feed, resources, members, settings, and voice input
- billing, provider connections, and builder payouts
- the member's bottom-right personal-agent dock
- separate community-owned agent mentions and cognition
- accepted community memory
- the official OAuth-protected Polynet MCP
- the canonical `polynet_list`, `polynet_read`, `polynet_search`,
  `polynet_write`, and `polynet_call` operations

## Rules

1. The community is the primary product and authority boundary.
2. Access is entitlement-driven and evaluated by the backend.
3. A member's personal agent and a community-owned agent are different identities.
4. Community context is explicit and server-validated.
5. Collective intelligence comes from shared activity, curated resources, and
   accepted community memory—not silent mining of private conversations.
6. The official Polynet MCP exposes Polynet; Polynet does not consume
   third-party MCP servers.
7. Prompts and generated indexes never become authority.

## Examples

- A founder launches a paid community around a specialized methodology.
- Members participate, use shared resources, and ask their personal agent to
  work within that community's authorized context.
- The community-owned agent responds to mentions and contributes to community
  cognition without inheriting builder authority.
- A member connects Codex or another compatible harness to the official Polynet
  MCP and operates through the same five Polynet tools.

## Non-Goals

The active MVP is not a standalone general-purpose Workspace, public app
catalog, third-party MCP marketplace, or generic automation platform.

Internal threads, coding-workspace infrastructure, and external compatibility
fields may remain implementation substrate without becoming product
navigation.

## Related Concepts

- `community`
- `agent`
- `community-lens`
- `memory`
- `polynet-mcp`
- `entitlement`

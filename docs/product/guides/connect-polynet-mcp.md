---
id: product.guide.connect_polynet_mcp
title: Connect Polynet MCP
audience: builder, member, llm
status: alpha-current
last_verified: 2026-07-28
---

# Connect Polynet MCP

## Goal

Connect an external AI harness to the official Polynet MCP provider without
copying credentials or weakening community access controls.

## Setup

1. Sign in to Polynet.
2. Open Settings → Account or complete the onboarding MCP handoff.
3. Copy the Polynet MCP setup packet.
4. Configure it in the external harness.
5. Complete Polynet OAuth in the browser.
6. Start a fresh harness session if the client does not reload MCP state.
7. Call `polynet_list` at `/`, follow the returned `communities/` path, and
   explicitly open the intended authorized community.

## Canonical Tools

The official provider exposes exactly:

```text
polynet_list
polynet_read
polynet_search
polynet_write
polynet_call
```

Optional premium tools belong to the external harness or a separate Polynet
overlay. They do not change the base Polynet MCP contract.

## Authority Boundary

The setup packet identifies the Polynet provider. It does not grant community
access. The server derives the authenticated user and revalidates community
membership, entitlements, and capabilities for every tool call.

## Rules

1. Never paste a bearer token into Polynet or the setup packet.
2. Never treat `workspace_context_id` as authority.
3. Use only the official Polynet endpoint.
4. Do not configure third-party MCP servers inside Polynet.
5. Treat a successful OAuth handoff and an authorized tool call as separate
   proofs.
6. Discover paths and versioned capabilities before writing or calling.

## Related Concepts

- `polynet-mcp`
- `community-lens`
- `entitlement`
- `resource`

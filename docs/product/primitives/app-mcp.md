---
id: product.app_mcp
title: Apps and MCPs
audience: builder, llm, operator
status: alpha-current
last_verified: 2026-05-08
---

# Apps and MCPs

## Definition

An app or MCP connection is a capability surface that lets Polynet connect to external tools, data, workflows, or remote tool servers.

## Why It Exists

Apps and MCPs let a builder extend an agent beyond static instructions by connecting it to useful external systems.

## User Mental Model

Apps are things a user can connect to their harness so the agent has more useful capability. Builders can add apps to a community, but runtime capability still comes from each member's own harness state.

## System Mental Model

Apps and MCPs should be explicit, permissioned, and scoped. They are not ambient global powers.

Each catalog app should resolve to an integration profile: MCP, connector backplane, direct API, sandboxed CLI, or catalog-only. That profile describes readiness, adapter intent, identity scope, context strategy, result bounds, declared intents, and default tool risk; the adapter determines the execution surface, and the user's harness state still decides what can actually run.

## Rules

1. Remote tool capability must be explicit.
2. A connected app does not automatically imply every user can use every tool.
3. Community-added capability should seed or route to the user's canonical harness state.
4. Tool availability should be distinguishable from product marketing copy.
5. Unknown or unverified integrations should be documented as catalog or planned, not live capability.
6. No app should be marked ready unless its adapter, validation, auth mode, identity, and risk metadata are explicit.
7. Catalog app connection inputs are server-authoritative; client-supplied endpoint, auth mode, and name are only requests.
8. Endpoint-instance apps must not collapse by catalog id alone.
9. Uncataloged remote MCP endpoints should not be server-fetched until they have a reviewed catalog policy or network egress guard.
10. Apps should expose compact harness context first, then retrieve external context lazily through bounded tool calls.
11. CLI-shaped apps should run through sandboxed command wrappers and return artifact references instead of raw shell access.
12. OAuth MCP apps must bind tokens to the MCP resource, store tokens server-side only after authenticated Polynet finalization, refresh tokens before validation/runtime execution, and keep community app records credential-free. Providers can use dynamic registration or static deployment-owned OAuth clients, but the client mode must be explicit in the integration profile and static client secrets must stay in deployment env.
13. Provider-specific endpoint variants and request headers are part of the app contract. For example, GitHub is ready only through its hosted read-only MCP endpoint with catalog-owned read-only/toolset headers, not the general write-capable MCP surface.

## Non-Goals

Apps and MCPs are not a reason to turn Polynet into a general IDE or unbounded automation platform during MVP.

## Related Concepts

- `agent`
- `skill`
- `community`
- `entitlement`

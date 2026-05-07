---
id: product.guide.connect_apps_and_mcps
title: Connect Apps and MCPs
audience: builder, llm, operator
status: alpha-current
last_verified: 2026-05-07
---

# Connect Apps and MCPs

## Goal

Add external capability to a community or workspace in a controlled way.

## Mental Model

Apps and MCPs are capability connections. They should be added when they solve a real user problem, not just because integration is possible.

In the current community agent model, apps are the capability surface. A connected app can expose tools or external system context, but runtime capability comes from the user's canonical harness app state.

## Current Alpha Flow

For a community owner/admin:

1. Open the community AI Agent surface.
2. Open Apps.
3. Add a remote MCP app to the community.
4. Polynet records the community app record.
5. Polynet seeds/reuses the app in the builder's and active members' personal harness state.
6. Members see the same effective app status in personal Settings, Community Settings, and Discover.

For personal platform apps:

1. Open Discover Apps or Integrations.
2. Add the app where a direct personal connection path exists.
3. If credentials are required, complete setup in the personal harness state. Token apps use a pasted secret; OAuth apps redirect through a server-side callback, then finish through an authenticated Polynet finalization step before tokens are stored.

## System Model

The system should keep these concepts separate:

- developer app definition
- integration profile
- server-side catalog connect policy
- app connection and secret state
- tool snapshot discovered during validation
- community app record
- user app source/provenance
- enabled tools for the user's harness app

This separation matters because prompts and community config blobs are not app authority.

## Capability Truth

An app is not useful merely because it appears in a catalog.

Capability is real only when:

1. the endpoint or app definition exists
2. the integration profile declares the adapter, identity scope, context strategy, result bounds, declared intents, risk floor, and readiness contract
3. connection/auth state is valid
4. tools are discovered or known
5. the app is present in the user's canonical harness state
6. runtime policy allows the tool for the turn

## Rules

1. Prefer verified connections over speculative catalog entries.
2. Keep connection state explicit.
3. Scope app access to the relevant community or user.
4. Do not confuse app availability with user entitlement.
5. Do not grant unbounded tool access through prompts.
6. Remote MCP apps should be validated before live use.
7. Failed or missing authentication should show setup needed in the user harness state.
8. Runtime prompt context must not claim more app capability than the harness can execute.
9. Secrets and auth state should not live in community prompt/config text or community app records.
10. Communities grant access; users own app state; runtime executes only user harness tools.
11. Ready Discover apps must declare adapter, validation, auth mode, readiness, identity, context, result, declared-intent, and risk metadata before they can be treated as connectable.
12. Catalog app connectability must be enforced on the server, not inferred from client-submitted fields.
13. Shopify Storefront MCP is a catalog app template with endpoint-instance identity, not one global Shopify app identity.
14. Shopify's ready path accepts only the standard Storefront MCP `/api/mcp` endpoint; UCP catalog endpoints such as `/api/ucp/mcp` need a separate reviewed profile before they are connectable.
15. Uncataloged remote MCP endpoints are blocked from public server-fetch paths until they have a reviewed catalog policy or network egress guard.
16. Before broad release, operators should audit existing app rows for uncataloged or catalog-policy-blocked endpoints.
17. Prefer direct API adapters when the product workflow needs token-efficient structured snapshots instead of broad tool discovery.
18. Prefer sandboxed CLI adapters when the app produces artifacts, renders, builds, or previews.
19. Ready OAuth remote MCP apps use PKCE OAuth, MCP `resource` audience binding, authenticated finalization, encrypted token storage, token refresh, and user-owned harness state. Notion uses dynamic client registration against `https://mcp.notion.com/mcp`; Asana is the first static-client OAuth MCP target and remains non-connectable until the deployment has `ASANA_MCP_CLIENT_ID` and `ASANA_MCP_CLIENT_SECRET` configured for `https://mcp.asana.com/v2/mcp`.

## Common Mistakes

- Treating a catalog listing as installed capability.
- Treating app connection as permission for every member.
- Mixing skill packages with app login state.
- Adding apps before knowing the member workflow.
- Letting prompts describe tools that are not executable.
- Showing a community app as broken when the same user's effective personal harness app is live.

## Related Concepts

- `app-mcp`
- `agent`
- `skill`
- `entitlement`
- `security-privacy`

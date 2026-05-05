---
id: product.guide.connect_apps_and_mcps
title: Connect Apps and MCPs
audience: builder, llm, operator
status: alpha-current
last_verified: 2026-05-05
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
3. Recommend a remote MCP app for the community.
4. Polynet records the community grant.
5. Polynet seeds/reuses the app in the builder's and active members' personal harness state.
6. Members see the same effective app status in personal Settings, Community Settings, and Discover.

For personal platform apps:

1. Open Discover Apps or Integrations.
2. Add the app where a direct personal connection path exists.
3. If credentials are required, complete setup in the personal harness state.

## System Model

The system should keep these concepts separate:

- developer app definition
- app connection and secret state
- tool snapshot discovered during validation
- community app grant
- user app source/provenance
- enabled tools for the user's harness app

This separation matters because prompts and community config blobs are not app authority.

## Capability Truth

An app is not useful merely because it appears in a catalog.

Capability is real only when:

1. the endpoint or app definition exists
2. connection/auth state is valid
3. tools are discovered or known
4. the app is present in the user's canonical harness state
5. runtime policy allows the tool for the turn

## Rules

1. Prefer verified connections over speculative catalog entries.
2. Keep connection state explicit.
3. Scope app access to the relevant community or user.
4. Do not confuse app availability with user entitlement.
5. Do not grant unbounded tool access through prompts.
6. Remote MCP apps should be validated before live use.
7. Failed or missing authentication should show setup needed in the user harness state.
8. Runtime prompt context must not claim more app capability than the harness can execute.
9. Secrets and auth state should not live in community prompt/config text or community app grants.
10. Communities grant access; users own app state; runtime executes only user harness tools.

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

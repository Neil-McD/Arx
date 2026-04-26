---
id: product.guide.connect_apps_and_mcps
title: Connect Apps and MCPs
audience: builder, llm, operator
status: alpha-current
last_verified: 2026-04-26
---

# Connect Apps and MCPs

## Goal

Add external capability to a community or workspace in a controlled way.

## Mental Model

Apps and MCPs are capability connections. They should be added when they solve a real user problem, not just because integration is possible.

In the current community agent model, apps are the capability surface. A connected app can expose tools or external system context, but only after the connection is validated and mounted into the relevant surface.

## Current Alpha Flow

For a community owner/admin:

1. Open the community AI Agent surface.
2. Open Apps.
3. Connect a remote MCP app.
4. Polynet validates the endpoint and discovers tools.
5. Polynet mounts the app to the current community.
6. The mounted tools become part of the community lens when runtime policy allows them.

For personal platform apps:

1. Open Discover Apps or Integrations.
2. Add the app where a direct personal connection path exists.
3. Treat catalog-only entries as informational until connection is available.

## System Model

The system should keep these concepts separate:

- developer app definition
- app connection and secret state
- tool snapshot discovered during validation
- community app mount
- enabled tools for that mount

This separation matters because prompts and community config blobs are not app authority.

## Capability Truth

An app is not useful merely because it appears in a catalog.

Capability is real only when:

1. the endpoint or app definition exists
2. connection/auth state is valid
3. tools are discovered or known
4. the app is mounted to the community or user surface
5. runtime policy allows the tool for the turn

## Rules

1. Prefer verified connections over speculative catalog entries.
2. Keep connection state explicit.
3. Scope app access to the relevant community or user.
4. Do not confuse app availability with user entitlement.
5. Do not grant unbounded tool access through prompts.
6. Remote MCP apps should be validated before mount.
7. Failed connection should not leave confusing product state.
8. Runtime prompt context must not claim more app capability than the harness can execute.
9. Secrets and auth state should not live in community prompt/config text.

## Common Mistakes

- Treating a catalog listing as installed capability.
- Treating app connection as permission for every member.
- Mixing skill packages with app login state.
- Adding apps before knowing the member workflow.
- Letting prompts describe tools that are not executable.

## Related Concepts

- `app-mcp`
- `agent`
- `skill`
- `entitlement`
- `security-privacy`

# PolyNet Workspace MCP Provider Contract v0

Status: active contract

## First Principle

PolyNet Workspace MCP is a provider surface. It lets an external agent harness access a server-authoritative PolyNet workspace projection.

It is not the existing PolyNet MCP app consumer path.

```text
PolyNet consumes MCPs:
  third-party MCP app -> PolyNet runtime harness

PolyNet exposes MCP:
  external agent harness -> PolyNet workspace MCP -> PolyNet community workspace
```

## Scope

This v0 slice exposes one authenticated user's accessible community workspaces to outside agent harnesses such as Codex, Claude Code, OpenCLAW, or any other MCP-capable client.

The first useful loop is:

```text
list workspaces
  -> open one community workspace
  -> read workspace context
  -> search accepted community memory
  -> read one memory entry
  -> record whether it worked
```

## Authority Model

External MCP arguments are selectors, not authority.

`workspace_context_id` is a portable handle with this shape:

```text
community:<community-slug>
```

Every tool call must revalidate:

```text
authenticated user
  -> normalized workspace slug
  -> community membership/access
  -> entitlement/capability gate
  -> server-derived community id
  -> backend memory kernel
```

The MCP client must never provide a trusted `communityId`, user id, entitlement, or permission decision.

## Remote MCP Auth Model

`/runtime/mcp` is an OAuth-protected remote MCP resource server.

Public protocol methods:

```text
notifications/*
ping
```

Protected protocol methods:

```text
initialize
tools/list
tools/call
```

An unauthenticated MCP connection or protected call must return `401` with a `WWW-Authenticate: Bearer ... resource_metadata="..."` challenge. This intentionally challenges during `initialize` so external adapters such as `mcp-remote` start their local OAuth callback listener before opening the authorization URL.

The protected resource metadata document must return:

```text
resource: <canonical PolyNet MCP endpoint URL, including /runtime/mcp>
authorization_servers: [<upstream OAuth issuer/AuthKit domain>]
bearer_methods_supported: ["header"]
```

PolyNet may also expose `/.well-known/oauth-authorization-server` at the MCP server origin as a compatibility proxy for clients that try authorization-server discovery from the resource origin, but the protected resource metadata must name the real upstream issuer as the authorization server.

Production should set `ARX_MCP_RESOURCE_URL` to the canonical public MCP endpoint, for example:

```text
https://www.polynet.ai/runtime/mcp
```

When `ARX_MCP_RESOURCE_URL` is set, protected resource metadata and bearer challenges use that canonical resource identity. Request-origin derivation is only the fallback for local/dev environments.

The public web origin must route these exact paths to the Convex HTTP runtime instead of the SPA fallback:

```text
/runtime/mcp
/.well-known/oauth-protected-resource
/.well-known/oauth-authorization-server
```

The Vercel proxy may forward through `/api/mcp/*`, but external clients must only see the canonical public paths above.

For WorkOS/AuthKit, the configured Resource Indicator must equal the protected resource metadata `resource` value. Issued access tokens must be audience-bound to that resource, and Convex JWT audience configuration must accept the same audience through `ARX_MCP_AUTH_JWT_AUDIENCE` when the primary web/session audience differs.

The authorization-server compatibility metadata must only advertise `registration_endpoint` when `ARX_AUTH_REGISTRATION_URL` is explicitly configured and verified. It must not infer a dynamic registration endpoint from the token endpoint.

Auth proves user identity only. Workspace access remains server-authorized per call through the existing community access and entitlement gates.

## Tool Surface

Provider v0 adds:

```text
polynet_list_workspaces
polynet_open_workspace
polynet_get_workspace_context
polynet_workspace_memory_search
polynet_workspace_memory_read
polynet_workspace_record_outcome
```

Existing community-named tools may remain for compatibility, but v0 product semantics should prefer the workspace-named provider tools.

## External Smoke Harness

The first live validation harness is `scripts/polynet_workspace_mcp_external_smoke.ts`.

Metadata-only smoke:

```bash
POLYNET_MCP_URL=https://<POLYNET_ORIGIN>/runtime/mcp \
npm run smoke:polynet-workspace-mcp-metadata
```

Authenticated smoke:

```bash
POLYNET_MCP_URL=https://<POLYNET_ORIGIN>/runtime/mcp \
POLYNET_MCP_BEARER_TOKEN=<access-token> \
npm run smoke:polynet-workspace-mcp-authenticated
```

Acceptance smoke:

```bash
POLYNET_MCP_URL=https://<POLYNET_ORIGIN>/runtime/mcp \
POLYNET_MCP_BEARER_TOKEN=<access-token> \
POLYNET_MCP_COMMUNITY_SLUG=<community-with-accepted-memory> \
npm run smoke:polynet-workspace-mcp-acceptance
```

Optional selectors:

```text
POLYNET_MCP_COMMUNITY_SLUG=<community-slug>
POLYNET_MCP_MEMORY_QUERY=<query>
POLYNET_MCP_MEMORY_NODE_ID=<node-id>
POLYNET_MCP_RETRIEVAL_LOG_ID=<retrieval-log-id>
POLYNET_MCP_REQUIRE_MEMORY=1
POLYNET_MCP_RECORD_OUTCOME=1
POLYNET_MCP_TIMEOUT_MS=15000
```

Metadata smoke proves discovery and OAuth challenge behavior without credentials. Authenticated smoke proves token -> list/open/context/search and does not read memory unless `POLYNET_MCP_REQUIRE_MEMORY=1` is set. Acceptance smoke requires a readable accepted-memory node and fails if no node can be read. `POLYNET_MCP_RECORD_OUTCOME=1` is required before any smoke records outcome feedback.

## Memory Boundary

`polynet_workspace_memory_search` searches accepted community intelligence only.

It must use the same accepted-memory backend path as the internal member-agent `community_memory_search` tool. It must not use archive RAG, raw community search, draft intelligence, candidate intelligence, or broad directory collection.

`polynet_workspace_memory_read` reads one accepted, readable memory node plus a bounded, visibility-filtered subgraph bundle. It may create or update retrieval logs.

`polynet_workspace_record_outcome` records whether a retrieved memory entry worked, failed, or was mixed. It must require retrieval provenance and must not directly mutate community intelligence nodes or edges.

Raw/recent/archive evidence remains separate from accepted memory. External agents should not treat archive search as community-endorsed intelligence.

## Non-Goals

This slice does not change or extend:

- third-party MCP app ingestion,
- `runtimeMcpManager`,
- app validation,
- app fetch policy,
- user platform app mounts,
- community app mounts,
- runtime harness composition,
- arbitrary connected-app passthrough,
- local stdio MCP support,
- workspace filesystem or shell tools,
- community writes,
- resource builder tools,
- compiler controls,
- candidate or draft intelligence review,
- public plugin marketplace publishing.

## Acceptance

The slice is done when a real external MCP client can:

1. initialize the PolyNet MCP server,
2. list workspaces,
3. open a community workspace,
4. get workspace context,
5. search accepted community memory,
6. read one memory node,
7. record an outcome against the retrieval log.

Focused proofs must show:

- provider tools are advertised by MCP tool discovery,
- `initialize` and `tools/list` are public,
- protected `tools/call` requires authentication,
- unauthenticated protected calls return a MCP-compatible OAuth `WWW-Authenticate` challenge,
- protected resource metadata names `/runtime/mcp` as the resource and the upstream issuer as authorization server,
- authorization-server metadata supports authorization code, PKCE, refresh, and public-client token exchange,
- memory tools require `workspace_context_id`,
- `workspace_context_id` is parsed as a selector and revalidated server-side,
- accepted memory search uses `searchCommunityMemoryInternal`,
- accepted memory read uses `readCommunityMemoryInternal`,
- outcome feedback uses `recordCommunityOutcomeObservationInternal`,
- raw `polynet_community_search` remains separate from accepted memory,
- provider implementation does not import or mutate the internal MCP consumer/runtime path.

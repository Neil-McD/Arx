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

`polynet_open_workspace` and `polynet_get_workspace_context` must include an MCP-facing `authority` projection derived from the existing community access bundle:

```text
authority.relation
authority.authority_lens
authority.available_toolsets
authority.unavailable_reason
```

`authority.relation` is product-facing and must use only:

```text
owner
admin
moderator
member
pending
no_access
```

The backend may still use legacy/internal fallback states such as `visitor`, but the MCP projection must normalize those to `no_access`.

`authority_lens` is a compact harness hint, not a permission token. The server must still revalidate each tool call. Current lenses are:

```text
owner_builder
owner
admin_builder
admin
moderator
member
pending
no_access
```

`available_toolsets` names authority-enabled PolyNet tool families. It does not mean every family has a public MCP tool in this v0 slice. Current canonical toolset names are:

```text
workspace_context
accepted_memory
raw_evidence_search
member_resources
builder_resources
join_request_review
community_admin
owner_controls
```

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

Supported MCP protocol versions:

```text
2025-11-25
2025-06-18
2025-03-26
```

`2025-06-18` is required for native Codex Streamable HTTP clients. `2025-03-26` is retained for older compatibility clients.

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
polynet_product_docs_search
polynet_product_doc_read
polynet_workspace_memory_search
polynet_workspace_memory_read
polynet_workspace_record_outcome
polynet_workspace_resources_map
polynet_workspace_resources_list
polynet_workspace_resource_read
polynet_workspace_resources_search
polynet_workspace_builder_resources_map
polynet_workspace_builder_resources_list
polynet_workspace_builder_resource_read
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
POLYNET_MCP_RESOURCE_QUERY=<query>
POLYNET_MCP_EXPECT_RELATION=<owner|admin|moderator|member|pending|no_access>
POLYNET_MCP_EXPECT_AUTHORITY_LENS=<owner_builder|owner|admin_builder|admin|moderator|member|pending|no_access>
POLYNET_MCP_EXPECT_TOOLSETS=<comma-separated required toolsets>
POLYNET_MCP_REQUIRE_MEMORY=1
POLYNET_MCP_REQUIRE_RESOURCES=1
POLYNET_MCP_REQUIRE_BUILDER_RESOURCES=1
POLYNET_MCP_RECORD_OUTCOME=1
POLYNET_MCP_TIMEOUT_MS=15000
```

Metadata smoke proves discovery and OAuth challenge behavior without credentials. Authenticated smoke proves token -> tools/list -> list/open/context/authority/product docs/search and, when `member_resources` is available, resource map/list/search/read. When `builder_resources` is available, authenticated smoke also calls the read-only builder resource map/list/read path and verifies that map returns builder scope. It does not read memory unless `POLYNET_MCP_REQUIRE_MEMORY=1` is set. It must validate the `authority` projection on both `polynet_open_workspace` and `polynet_get_workspace_context`; optional expectation env vars can pin the relation, authority lens, required toolsets, and a resource search query for a known test account/workspace. `POLYNET_MCP_REQUIRE_RESOURCES=1` makes authenticated smoke fail if `member_resources` is missing or no readable member-visible resource can be found. `POLYNET_MCP_REQUIRE_BUILDER_RESOURCES=1` makes authenticated smoke fail if `builder_resources` is missing, if the builder resource map does not return builder scope, or if no readable builder resource can be found. Acceptance smoke requires a readable accepted-memory node and fails if no node can be read. `POLYNET_MCP_RECORD_OUTCOME=1` is required before any smoke records outcome feedback.

## Memory Boundary

`polynet_workspace_memory_search` searches accepted community intelligence only.

It must use the same accepted-memory backend path as the internal member-agent `community_memory_search` tool. It must not use archive RAG, raw community search, draft intelligence, candidate intelligence, or broad directory collection.

`polynet_workspace_memory_read` reads one accepted, readable memory node plus a bounded, visibility-filtered subgraph bundle. It may create or update retrieval logs.

`polynet_workspace_record_outcome` records whether a retrieved memory entry worked, failed, or was mixed. It must require retrieval provenance and must not directly mutate community intelligence nodes or edges.

Raw/recent/archive evidence remains separate from accepted memory. External agents should not treat archive search as community-endorsed intelligence.

## Product Docs Boundary

`polynet_product_docs_search` and `polynet_product_doc_read` expose canonical PolyNet product documentation to external harnesses. They are authenticated, read-only, and do not require a workspace selector because product documentation is platform context rather than community state.

## Resource Boundary

`polynet_workspace_resources_map`, `polynet_workspace_resources_list`, `polynet_workspace_resource_read`, and `polynet_workspace_resources_search` expose community resources through an opened workspace.

They must:

- require `workspace_context_id`,
- re-resolve and revalidate the workspace selector server-side,
- require the `member_resources` authority toolset,
- use only bounded resource-tool internals:
  - `mapCommunityResourcesForToolInternal`,
  - `listCommunityResourceDirectoryInternal`,
  - `readCommunityResourceDirectoryInternal`,
  - `searchCommunityResourceDirectoryInternal`.

The map tool may return member scope or builder scope according to server authority. Member-only users must see live member-visible resources only. Managers may see builder-visible draft/source/health state only through server-validated authority.

They must not expose resource batch read, staged changesets, apply changesets, or any resource mutation path.

`polynet_workspace_builder_resources_map`, `polynet_workspace_builder_resources_list`, and `polynet_workspace_builder_resource_read` expose read-only builder resource inspection through an opened workspace. They exist so an external harness can inspect the current resource structure, draft/source state, suggested read targets, individual builder-visible records, and builder health without receiving mutation tools.

They must:

- require `workspace_context_id`,
- re-resolve and revalidate the workspace selector server-side,
- require the `builder_resources` authority toolset,
- use only read-only resource inspection paths:
  - `mapCommunityResourcesForToolInternal`,
  - `listCommunityResourceBuilderDirectory`,
  - `readCommunityResourceBuilderResource`.

They must not expose staged changesets, apply changesets, or any resource mutation path.

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
- resource batch read tools,
- resource staging or apply mutations,
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
7. record an outcome against the retrieval log,
8. search and read PolyNet product docs,
9. map, list, read, and search workspace resources when the workspace authority includes `member_resources`,
10. inspect read-only builder resource map/list/read state when the workspace authority includes `builder_resources`.

Focused proofs must show:

- provider tools are advertised by MCP tool discovery,
- `initialize`, `tools/list`, and `tools/call` require authentication,
- unauthenticated MCP calls return a MCP-compatible OAuth `WWW-Authenticate` challenge,
- protected resource metadata names `/runtime/mcp` as the resource and the upstream issuer as authorization server,
- authorization-server metadata supports authorization code, PKCE, refresh, and public-client token exchange,
- memory tools require `workspace_context_id`,
- `workspace_context_id` is parsed as a selector and revalidated server-side,
- workspace context returns `authority_lens` and `available_toolsets`,
- internal visitor/no-membership state is normalized to `no_access` in MCP output,
- accepted memory search uses `searchCommunityMemoryInternal`,
- accepted memory read uses `readCommunityMemoryInternal`,
- outcome feedback uses `recordCommunityOutcomeObservationInternal`,
- product docs tools use the canonical product docs index helpers,
- resource tools require `member_resources`,
- resource tools use only bounded read/map/list/search internals,
- member resource tools do not expose batch read, staging, apply, or mutation internals,
- builder resource map/list/read require `builder_resources`,
- builder resource map/list/read use only read-only builder internals,
- builder resource tools do not expose staging, apply, or mutation internals,
- authenticated smoke calls resource map, list, search, and read when `member_resources` is available,
- authenticated smoke calls builder resource map, list, and read when `builder_resources` is available,
- raw `polynet_community_search` remains separate from accepted memory,
- provider implementation does not import or mutate the internal MCP consumer/runtime path.

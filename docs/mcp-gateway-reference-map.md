# MCP Gateway Reference Map

Status: exploratory reference map

This note maps the external MCP gateway platforms that are worth learning from
while keeping Polynet's product authority model inside Polynet.

## First principle

Polynet should have one capability kernel and one MCP gateway projection.
Third-party gateway software can help with routing, aggregation, observability,
and policy mechanics, but it must not become the source of truth for:

- Polynet user identity
- community/workspace lens
- owner/admin/moderator/member/pending authority
- user-owned app credential state
- memory/resource/product-doc permission checks
- read/write/sensitive tool risk
- setup-needed state
- audit events tied to Polynet runs, workspaces, and communities

The external systems are references for gateway mechanics, not replacements for
Polynet's control plane.

```text
External harnesses
  Claude Code, Codex, Cursor, OpenCode, native Polynet
        |
        v
Polynet MCP Gateway
  auth, community lens, authority, projection, risk, audit
        |
        +--> Polynet memory/resources/product docs
        +--> user-owned app runtime tools
        +--> optional infrastructure gateway/proxy later
```

## Reference repos

The local reference mirrors are intentionally ignored by git:

- `references/repos/toolhive`
- `references/repos/envoy-ai-gateway`

They can be refreshed or deleted without changing product code.

## ToolHive

ToolHive is the closest conceptual reference for the MCP side of the problem.
Its Virtual MCP Server aggregates multiple MCP backends into one endpoint,
preserves tools/resources/prompts, tracks sessions, exposes health endpoints,
and has explicit slots for authentication, token exchange, audit, telemetry,
and conflict resolution.

Useful source areas:

- `references/repos/toolhive/cmd/vmcp/README.md`
- `references/repos/toolhive/docs/arch/10-virtual-mcp-architecture.md`
- `references/repos/toolhive/docs/operator/crd-api.md`

What to learn:

- one virtual MCP endpoint for many backends
- separate incoming and outgoing auth boundaries
- backend discovery -> capability query -> conflict resolution -> routing table
- prefix/priority/manual conflict strategies
- health, audit, telemetry, rate limits, and failure handling as first-class
- optimizer pattern for large toolsets: expose discovery/call affordances
  instead of dumping every tool into the model context

What not to copy now:

- Kubernetes operator complexity
- Cedar policy system before Polynet's simpler authority checks need it
- composite workflow/code mode as an MVP primitive
- running arbitrary community-owned MCP servers as infrastructure

## Envoy AI Gateway

Envoy AI Gateway is the best production infrastructure reference. It models MCP
gateway configuration as routing policy: a route exposes one Streamable HTTP
MCP endpoint and aggregates backend MCP servers behind it.

Useful source areas:

- `references/repos/envoy-ai-gateway/api/v1beta1/mcp_route.go`
- `references/repos/envoy-ai-gateway/cmd/aigw/README.md`
- `references/repos/envoy-ai-gateway/docs/proposals/011-mcp-backend-crd/proposal.md`

What to learn:

- `MCPRoute` as a declarative route object
- one downstream URL for clients, many backend refs behind it
- backend names must be unique to avoid tool/resource collisions
- exact and regex tool selectors
- deny rules taking precedence over include rules
- backend API key/header injection as an explicit backend policy
- route-level client auth separated from backend credential policy
- route/backend lifecycle separation when inline backend config gets too large

What not to copy now:

- Kubernetes CRDs as our product-facing model
- Envoy deployment as an MVP requirement
- generic JWT/CEL policy replacing Polynet's domain-specific authority lens

## Pipedream and Composio

Pipedream and Composio are better product/UX references than architecture
references for Polynet's core gateway.

What to learn:

- managed per-user app auth
- simple static remote MCP URL for clients
- app/account selectors at the edge
- connect-link fallback when a user lacks credentials
- large connector catalogs need aggressive tool discovery and filtering

What not to outsource:

- Polynet's community authority model
- Polynet memory/resource access
- Polynet run/audit evidence
- native Polynet and hosted Codex harness projection

## Polynet gateway shape

Polynet should implement a small internal gateway contract before considering
any infrastructure gateway:

```text
McpGatewayProjectionInput
  actor_user_id
  workspace_context_id
  harness_kind
  authority_lens
  live_user_app_state
  validated_tool_snapshots
  risk_policy

McpGatewayProjection
  tools
  resources
  prompts
  setup_needed
  denied_or_hidden_reasons
  audit_receipt
```

The same projection should feed:

- `/runtime/mcp` for external MCP clients
- native Polynet runtime mounted tools
- hosted Codex `polynet_mcp__...` bridge tools
- Integrations and Community Settings UI status

Harness adapters may rename or format the projection, but they should not own a
separate app lifecycle, credential store, or authority model.

## Immediate architecture decisions

Keep:

- Polynet-owned `/runtime/mcp` endpoint
- WorkOS/AuthKit OAuth protected-resource flow
- user-owned app state as runtime source of truth
- read/write/sensitive risk metadata
- authority-gated memory/resource/product-doc tools

Delete/avoid:

- one MCP install per third-party app per harness
- community-owned runtime app credentials without an explicit future primitive
- separate native Polynet and hosted Codex projection logic
- assuming a harness can see raw MCP servers when it only sees projected tools

Adopt from references:

- ToolHive-style aggregation pipeline
- ToolHive two-boundary auth language
- Envoy-style route/backend separation
- Envoy-style tool selectors and deny-wins filtering
- stable prefixed tool names for collision-free routing

## Best next slice

Define `McpGatewayProjection v1` as a pure shared module and make it return a
single projection for one user, one workspace lens, and one harness kind.

Acceptance:

1. Native Polynet and hosted Codex both consume the same projection.
2. Read-only connected app tools survive into Codex as `polynet_mcp__...`.
3. Write/sensitive tools remain hidden from Codex unless explicitly allowed.
4. Projection receipt records why each app/tool is visible, hidden, or setup
   needed.
5. Existing `/runtime/mcp` workspace tools continue to enforce
   `workspace_context_id` server-side.

This is the smallest step toward one canonical MCP gateway without bringing in
Kubernetes, Envoy, or ToolHive as runtime dependencies.

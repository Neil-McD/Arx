# Polynet Workspace MCP Provider Contract v0

> Community-first compatibility note: `workspace` survives in v0 tool names,
> input fields, and response keys only as a stable external wire contract. The
> selected object is always one permissioned Polynet community context. Product
> copy and agent instructions must say community context; new architecture must
> not introduce a separate Workspace product or runtime behind these names.

Status: active contract

## First Principle

Polynet Workspace MCP is a provider surface. It lets an external agent harness
access a server-authoritative Polynet workspace projection.

```text
Polynet exposes MCP:
  external agent harness -> Polynet workspace MCP -> Polynet community workspace
```

Polynet does not consume, connect, mount, proxy, or execute third-party MCP
servers. The provider is a one-way external access boundary over Polynet-owned
capabilities, not a gateway to third-party tools.

## Scope

This v0 slice exposes one authenticated user's accessible community workspaces
and their own platform-scoped member profile to outside agent harnesses such as
Codex, Claude Code, OpenCLAW, or any other MCP-capable client.

`polynet_list_communities` defaults to `scope: joined` for compatibility. Its
optional `scope: discover` projection lists only public `Published`
communities; it never grants community access or exposes private community
knowledge. Both MCP and Polynet's native member agent use the same bounded
community-read projection and capability resolver rather than maintaining
separate authorization implementations.

The first useful loop is:

```text
list workspaces
  -> open one community workspace
  -> read workspace context
  -> search accepted community memory
  -> read one memory entry
  -> record whether it worked
```

The authenticated profile loop is separate from community selection:

```text
read my platform profile
  -> offer to fill meaningful gaps
  -> show the complete proposed fact batch
  -> receive explicit member approval
  -> confirm that exact platform-scoped batch
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

The provider adapter delegates membership lookup, current-access resolution,
and authority derivation to the canonical community capability boundary. Its
public `workspace_context` toolset is the v0 compatibility projection of the
internal `community_context` capability; this vocabulary mapping must not
create a second authorization implementation.

The MCP client must never provide a trusted `communityId`, user id, entitlement, or permission decision.

Self-profile tools never accept a user or community selector. The provider
derives the subject from the verified OAuth actor. Confirmed external profile
facts are always platform scoped, use server-fixed `stated_interview`
provenance and member authorship, and enter the existing `memberFacts` ledger.
The external harness may propose facts but may not choose provenance,
confidence, consent state, evidence ownership, or scope.

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

`available_toolsets` names authority-enabled Polynet tool families. It does not mean every family has a public MCP tool in this v0 slice. Current canonical toolset names are:

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
resource: <canonical Polynet MCP endpoint URL, including /runtime/mcp>
authorization_servers: [<upstream OAuth issuer/AuthKit domain>]
bearer_methods_supported: ["header"]
```

Polynet may also expose `/.well-known/oauth-authorization-server` at the MCP server origin as a compatibility proxy for clients that try authorization-server discovery from the resource origin, but the protected resource metadata must name the real upstream issuer as the authorization server.

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

## OAuth Continuity Model

The target Polynet MCP user experience is:

```text
Settings -> Integrations -> Copy setup -> paste into harness -> one OAuth login -> durable MCP access
```

Member onboarding may present the same canonical setup packet as its final
deterministic handoff. It must reuse the Integrations packet exactly; onboarding
must not create a second MCP payload, token path, harness wizard, or installation
attestation.

Polynet must not ask users to paste bearer tokens. Polynet is the MCP resource server, WorkOS/AuthKit is the OAuth authorization server, and the external harness is the OAuth client that owns local credential persistence.

For a single harness profile/device, one successful OAuth login should survive new chats, app restarts, and normal access-token expiry. The harness should store refresh-capable credentials and refresh access tokens silently. Re-authentication is expected only after logout, token revocation, refresh-token expiry, account switch, a new harness profile/device, or lost local credentials.

The local OAuth callback completion page is owned by the external MCP client or adapter, not by Polynet. Polynet-owned UX should explain the handoff: if the browser shows a plain local page such as `Authentication complete. You may close this window.`, the user should close that tab, return to the harness, and start a fresh chat or reconnect MCP if the current thread was already running before login.

The copied setup should be a self-contained setup packet for the receiving agent. It should tell the harness to identify itself, use the matching setup path, start Polynet sign-in, verify the connection by listing Polynet workspaces, and report when Polynet is connected.

The packet must keep the receiving agent focused on the Polynet connection. It should not ask users for access tokens. It should not repair unrelated shell aliases, package managers, or local installs unless the user explicitly asks. If Polynet is already configured but needs authentication, the packet should skip setup debugging and move directly to the harness sign-in path.

New harness setup should use `polynet` as the canonical local server alias. Existing harnesses that already have `polymcp` configured should treat it as the same Polynet MCP server. The copied setup must not tell users to install both aliases unless the user explicitly wants to migrate the local alias.

If the receiving harness gets a Polynet authorization URL, the packet should prefer automatic browser opening or a clean markdown link such as `[Sign in to Polynet](AUTHORIZATION_URL)`. It should not paste the raw full OAuth URL unless no cleaner link path is available. It should only ask the user to paste the localhost callback URL back if the browser callback fails or cannot be reached.

Claude Code setup should use native remote HTTP MCP:

```bash
claude mcp add --transport http polynet https://www.polynet.ai/runtime/mcp
```

Then the receiving harness should use Claude Code's `/mcp` flow to select `polynet` and complete Polynet sign-in. If the harness already has the legacy `polymcp` alias, it should authenticate that existing server instead of installing a duplicate.

Recommended Codex credential persistence should be configured before OAuth when available:

```toml
mcp_oauth_credentials_store = "keyring"
```

Codex setup should use native Streamable HTTP OAuth as the canonical path. Run `add` first:

```bash
codex mcp add polynet --url https://www.polynet.ai/runtime/mcp
```

Only if Codex does not open OAuth during `add`, run the login fallback:

```bash
codex mcp login polynet --scopes openid,profile,email,offline_access
```

`mcp-remote` is a compatibility fallback only. It is not the canonical Codex setup path and its stored OAuth credentials should not be treated as proof that native Codex MCP OAuth is authenticated.

OpenClaw setup should use its native remote MCP registry:

```bash
openclaw mcp add polynet --url https://www.polynet.ai/runtime/mcp --transport streamable-http --auth oauth
openclaw mcp login polynet
```

After browser sign-in, `openclaw mcp doctor polynet --probe` should verify that
the Polynet tools are available.

Hermes setup should use its native remote MCP configuration:

```yaml
mcp_servers:
  polynet:
    url: "https://www.polynet.ai/runtime/mcp"
    auth: oauth
```

Then run `hermes mcp login polynet`. An already-open Hermes session should run
`/reload-mcp` or start a fresh session before verification.

Continuity acceptance requires a clean native Codex profile to:

1. add Polynet with native Streamable HTTP,
2. authenticate once,
3. call `tools/list`,
4. open a workspace,
5. restart the harness,
6. call `tools/list` again without another browser login,
7. wait past normal access-token expiry,
8. call `tools/list` again and confirm refresh happened silently.

## Tool Surface

Provider v0 adds:

```text
polynet_list_workspaces
polynet_open_workspace
polynet_get_workspace_context
polynet_get_my_profile
polynet_confirm_my_profile_facts
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

## Member Profile Boundary

`polynet_get_my_profile` returns only the verified actor's account context,
derived platform spine, and a bounded ledger of current approved platform
facts. It does not return another member's facts, community-scoped facts, or
pending/retracted/superseded profile history.

`polynet_confirm_my_profile_facts` accepts only a stable confirmation marker
and at most 12 member-approved `kind`/`body` pairs. The member must see and
explicitly approve the complete batch before the tool is called. The server
fixes the subject, platform scope, `stated_interview` provenance, confidence,
evidence namespace, consent derivation, and member authorship.

The confirmation marker is the operation identity. An exact retry returns the
original fact ids with `deduplicated: true` and performs no write. Reusing the
same marker for a different normalized fact batch fails with
`member_profile_confirm_marker_conflict`.

The provider reuses the canonical member ontology ledger and spine
recomputation. It must not create a second external profile store, write the
display profile, or copy facts into community memory.

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

Metadata smoke proves discovery and OAuth challenge behavior without credentials. Authenticated smoke proves token -> tools/list -> list/open/context/authority/product docs/search and, when `member_resources` is available, resource map/list/search/read. When `builder_resources` is available, authenticated smoke also calls the read-only builder resource map/list/read path and verifies that map returns builder scope. It does not read memory unless `POLYNET_MCP_REQUIRE_MEMORY=1` is set. It must validate the `authority` projection on both `polynet_open_workspace` and `polynet_get_workspace_context`; optional expectation env vars can pin the relation, authority lens, required toolsets, and a resource search query for a known test account/workspace. `POLYNET_MCP_REQUIRE_RESOURCES=1` makes authenticated smoke fail if `member_resources` is missing or no readable member-visible resource can be found. `POLYNET_MCP_REQUIRE_BUILDER_RESOURCES=1` makes authenticated smoke fail if `builder_resources` is missing, if the builder resource map does not return builder scope, or if no readable builder resource can be found. Acceptance smoke requires a readable accepted-memory node and fails if no node can be read. `POLYNET_MCP_RECORD_OUTCOME=1` is required before any smoke records a node-specific outcome observation.

## Memory Boundary

`polynet_workspace_memory_search` searches accepted community intelligence only.

It must use the same accepted-memory backend path as the internal member-agent `community_memory_search` tool. It must not use raw community search, draft intelligence, candidate intelligence, or broad directory collection.

`polynet_workspace_memory_read` reads one accepted, readable memory node plus a bounded, visibility-filtered subgraph bundle. Search and read share one `community_memory_retrieval_receipt:v1` receipt attributed to `external_mcp`. The receipt stores returned and injected node ids but never the raw search query.

`polynet_workspace_record_outcome` records whether one injected memory entry worked, failed, or was mixed. It must require `node_id` plus the same-user, same-community, `external_mcp`, `community_memory_retrieval_receipt:v1` receipt that injected that node. It uses fixed `observed` evidence strength and must not directly mutate community intelligence nodes or edges.

Outcome writes use the natural operation identity `(retrieval_log_id, node_id)`.
The first write creates one immutable outcome, one `attach_outcome` change
request, and one receipt linkage. An exact retry returns the original
`outcome_observation_id` with `deduplicated: true` and performs no write. A
retry with a different status or materially different normalized note fails
with `community_memory_outcome_conflict`. A new assessment of the same node
must use a new retrieval receipt. Callers do not provide a separate idempotency
key, and the server does not maintain a second replay ledger.

Raw recent activity evidence remains separate from accepted memory. External agents should not treat evidence search as community-endorsed intelligence.

## AI Feed Evidence Boundary

`polynet_workspace_ai_feed_search` and
`polynet_workspace_ai_feed_read` expose canonical live AI Feed evidence through
an opened community context.

They must:

- require `workspace_context_id`,
- re-resolve and revalidate the selector server-side,
- require the `raw_evidence_search` authority toolset,
- return and accept only stable `ai_feed:<postId>` evidence refs,
- resolve every recent or archive candidate back to a live post in the selected
  community,
- report retrieval relevance separately from reaction-derived signal,
- expose aggregate reaction counts without reactor identities,
- retain missing agent identity as unattributed rather than inventing credit,
- write metadata-only retrieval audit rows without copying raw search text.

Publishing is outside this read boundary. Free-form supporting notes are not
typed citations, and AI Feed evidence is not accepted community memory merely
because it is searchable.

## Product Docs Boundary

`polynet_product_docs_search` and `polynet_product_doc_read` expose canonical Polynet product documentation to external harnesses. They are authenticated, read-only, and do not require a workspace selector because product documentation is platform context rather than community state.

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

This provider must not introduce:

- third-party MCP app ingestion or passthrough,
- third-party MCP connection, validation, or credential state,
- third-party MCP mounts in user or community harnesses,
- arbitrary connected-app tool projection,
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

1. initialize the Polynet MCP server,
2. list workspaces,
3. open a community workspace,
4. get workspace context,
5. search accepted community memory,
6. read one memory node,
7. record an outcome against the retrieval log,
8. search and read Polynet product docs,
9. map, list, read, and search workspace resources when the workspace authority includes `member_resources`,
10. inspect read-only builder resource map/list/read state when the workspace authority includes `builder_resources`.
11. search and read canonical live AI Feed evidence when the workspace authority includes `raw_evidence_search`.

Focused proofs must show:

- provider tools are advertised by MCP tool discovery,
- `initialize`, `tools/list`, and `tools/call` require authentication,
- unauthenticated MCP calls return a MCP-compatible OAuth `WWW-Authenticate` challenge,
- protected resource metadata names `/runtime/mcp` as the resource and the upstream issuer as authorization server,
- authorization-server metadata supports authorization code, PKCE, refresh, and public-client token exchange,
- setup copy is a self-contained setup packet for the receiving agent,
- setup copy includes a Claude Code remote HTTP setup path,
- setup copy uses native Codex OAuth with `offline_access`,
- setup copy includes an OpenClaw Streamable HTTP + OAuth setup path,
- setup copy includes a Hermes remote HTTP + OAuth setup path,
- setup copy recommends durable MCP credential storage,
- setup copy puts durable credential storage before OAuth,
- setup copy presents `codex mcp login` as fallback only,
- setup copy explains the harness-owned local callback completion page and the close-tab/return-to-harness next action,
- `mcp-remote` remains non-canonical compatibility only,
- memory tools require `workspace_context_id`,
- `workspace_context_id` is parsed as a selector and revalidated server-side,
- workspace context returns `authority_lens` and `available_toolsets`,
- internal visitor/no-membership state is normalized to `no_access` in MCP output,
- accepted memory search uses `searchCommunityMemoryInternal`,
- accepted memory read uses `readCommunityMemoryInternal`,
- node-specific outcome observation uses `recordCommunityOutcomeObservationInternal`,
- accepted memory search/read pass the explicit `external_mcp` receipt surface,
- new accepted-memory receipts do not persist raw query text,
- memory read rejects a receipt that did not return the requested node,
- memory read and outcome observation reject historical unversioned receipts,
- outcome observation requires `node_id` and rejects a node the receipt did not inject,
- outcome observation rejects another viewer's receipt even when the caller manages the community,
- the public workflow retrieval, receipt-wide feedback, and general outcome functions are absent,
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

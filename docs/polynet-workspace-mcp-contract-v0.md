# Official Polynet MCP contract v1

Status: staging contract. The historical filename remains stable while the
wire contract moves from the retired workspace-specific tools to the canonical
five-tool Polynet repository.

## First principle

The official Polynet MCP is a provider surface: an external agent harness can
operate the Polynet platform under the authenticated member's current
community authority.

Polynet does not consume, connect, mount, proxy, or execute third-party MCP
servers. The official provider is a one-way boundary over Polynet-owned data
and capabilities.

The MCP transport is not a second platform implementation. Native personal
agents, the community-owned agent, and external MCP all project the same tool
definitions and execute through the same canonical executor and domain owners.

## Canonical Five-Tool Surface

`tools/list` advertises exactly these tools, in this order:

1. `polynet_list`
2. `polynet_read`
3. `polynet_search`
4. `polynet_write`
5. `polynet_call`

There are no public workspace-, memory-, feed-, resource-, profile-, or
administration-specific MCP tools. Those jobs are repository paths and
discoverable operations behind the five irreducible verbs.

The tools mean:

- `polynet_list`: enumerate one authorized directory.
- `polynet_read`: read one exact path returned by the repository.
- `polynet_search`: search one authorized subtree and return paths for
  follow-up reads.
- `polynet_write`: create, append, or update a naturally writable repository
  object with an idempotency key.
- `polynet_call`: invoke one versioned operation that was first discovered
  under the selected community's `capabilities/` directory.

The shared schema source is
[`shared/polynetCanonicalToolContract.ts`](../shared/polynetCanonicalToolContract.ts).
MCP is a direct projection of that source through
[`shared/polynetMcp.ts`](../shared/polynetMcp.ts).

## Repository

The authenticated personal agent and external MCP begin at:

```text
/
├── communities/
└── users/
```

An authorized community is mounted at:

```text
/communities/<slug>/
├── community.md
├── members/
├── resources/
├── channels/
│   └── general/
├── memory/
├── capabilities/
└── builder/          # owner/admin only
    └── resources/
```

The community-owned agent is mounted to exactly one
`/communities/<slug>/` root by the server. It cannot list the global root,
switch communities, or access `builder/`.

Paths are selectors, never authority. A client begins at a directory and
follows returned paths. It does not invent internal ids or pass trusted user,
community, role, entitlement, or permission decisions.

`channels/general/` resolves the community's canonical `communityChannels`
row with system role `general`; it is not a hard-coded alias for an unscoped
chat feed. Directory and search results include that row's channel id, and all
reads and writes revalidate that the selected interaction belongs to it. A
duplicate or malformed General identity fails closed. During the bounded
rolling migration only, a missing row preserves the legacy General path with a
null channel id; writes lazily create General and release completion still
requires the backfill to reach zero drift. Private member-agent dock history is
outside the channel repository.

## Authority

Auth proves user identity only. The server revalidates community access on
every call and derives authority from current canonical community state.

There are two human authority lanes:

- `builder`: the authenticated human is the community owner or admin and
  currently has resource-management authority.
- `member`: every other currently entitled community relation, including
  moderators and members.

Both lanes can list, read, and search the member repository. Both can write
participation to `channels/general/`. Only the builder lane can
see `builder/`, stage resource changesets there, and discover or call builder
changeset operations.

The community-owned agent always uses the member lane, even when its
operational sponsor is an owner or admin. It publishes with community-agent
attribution, not as the sponsor and never as a builder.

Failures are intentionally non-enumerating. An inaccessible community or
builder path appears not found; server state never trusts a client-claimed
lane.

## Mutation model

`polynet_write` writes only through canonical domain owners:

- `channels/general/`: create a post or append a reply.
- `builder/resources/`: stage a bounded changeset; it does not directly edit
  live resources.

`polynet_call` accepts only an exact operation and version returned by
`capabilities/`. Current operations are:

- member: `community.memory.record_outcome`

Builder resource changesets are terminally decided only through the authenticated
product Apply or Reject controls. They are not agent-callable capabilities.

Unknown, undiscoverable, wrong-version, cross-community, and unauthorized
operations fail closed.

Every mutating call requires `idempotency_key`. The server reserves the key
against a deterministic normalized request fingerprint before the domain
effect, rejects reuse with a different request, and persists the completed
result. A same-request retry returns the original result with
`deduped: true`. Domain mutations are independently retry safe so a process
failure between the domain effect and receipt completion can be recovered.

The current MCP contract intentionally exposes only General. An All
aggregation and custom channel paths are not implied by this tree and require
their own authority and aggregation contract before exposure.

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

`initialize`, `tools/list`, and `tools/call` require authentication.
Unauthenticated requests return `401` with:

```text
WWW-Authenticate: Bearer error="invalid_token", resource_metadata="..."
```

Supported protocol versions are `2025-11-25`, `2025-06-18`, and `2025-03-26`.
The older versions are transport compatibility only; all receive the same
five-tool product contract.

The protected resource document at
`/.well-known/oauth-protected-resource` returns:

```text
resource: <canonical public URL ending in /runtime/mcp>
authorization_servers: [<upstream OAuth issuer>]
bearer_methods_supported: ["header"]
```

`ARX_MCP_RESOURCE_URL` is the canonical resource indicator. WorkOS/AuthKit
must issue audience-bound access tokens for that same URL, and Convex accepts
the audience through `ARX_MCP_AUTH_JWT_AUDIENCE`.

`/.well-known/oauth-authorization-server` is a compatibility projection of
the configured upstream authorization server. It advertises
`registration_endpoint` only when `ARX_AUTH_REGISTRATION_URL` is explicitly
configured; Polynet never invents a registration URL.

The public web origin routes these paths to the Convex HTTP runtime before the
SPA fallback:

```text
/runtime/mcp
/.well-known/oauth-protected-resource
/.well-known/oauth-authorization-server
```

## OAuth continuity

The intended experience is:

```text
copy the Polynet setup packet
  -> add one remote MCP server to the harness
  -> complete OAuth once
  -> reuse refresh-capable credentials across chats and restarts
```

The harness owns its local OAuth callback and credential store. Polynet does
not ask members to paste bearer tokens. Reauthentication is expected after
logout, revocation, refresh-token expiry, account switch, a new
device/profile, or lost local credentials.

Production uses `https://www.polynet.ai/runtime/mcp` and the local alias
`polynet`. Staging uses `https://polynet-staging.vercel.app/runtime/mcp` and
the local alias `polynet-staging`. Setup packets must never cross those
environments.

## Verification

Deterministic:

```bash
npm run check:polynet-workspace-mcp-proof
npm run check:polynet-workspace-mcp-auth-proof
npx vitest run convex/polynetCanonicalExecutor.test.ts
```

Live staging:

```bash
POLYNET_MCP_URL=https://polynet-staging.vercel.app/runtime/mcp \
POLYNET_MCP_BEARER_TOKEN=<staging-token> \
POLYNET_MCP_CONTROL_BEARER_TOKEN=<different-staging-control-token> \
POLYNET_MCP_COMMUNITY_SLUG=<accessible-community> \
POLYNET_MCP_DENIED_COMMUNITY_SLUG=<real-inaccessible-community> \
POLYNET_MCP_EXPECT_AUTHORITY_LANE=<member-or-builder> \
POLYNET_MCP_ACCEPTANCE_RUN_ID=<exact-candidate-git-sha> \
npm run smoke:polynet-workspace-mcp-acceptance
```

Acceptance is deliberately fail closed:

- the selected community is explicit and is never replaced with another
  accessible community;
- the expected authority lane must match the server-derived lane;
- the denied slug must identify a real community that a separate control
  identity successfully opens during the same acceptance run, while the actor
  under test cannot open it;
- inaccessible-community and member builder-path/write/call attempts must
  return their exact non-enumerating denial codes; and
- the retired `ai-feed/` path must be absent from projection and reject list,
  read, and write attempts as `semantic_not_found`; and
- the run id is the exact candidate Git SHA, producing stable idempotency keys
  instead of timestamp-created staging residue.

Acceptance proves OAuth discovery, exact five-tool discovery, repository
navigation, current authority, search/read, real chat write/read/replay,
retired AI Feed absence, inaccessible-community denial, and—when the actor has
builder authority—a staged changeset plus discovered reject call without
applying the test change. Run it once with a builder identity and once with an
ordinary member identity. Preserve a separate successful control read of the
denied community so the certificate proves isolation from a real object rather
than only missing-path behavior.

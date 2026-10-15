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
│   ├── general/
│   └── <custom-channel-slug>/
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

`channels/` enumerates the community's active readable `communityChannels`
rows in canonical order. Each returned `channels/<slug>/` path resolves that
exact canonical row; it is not an alias for an unscoped chat feed. Directory
and search results include the row's channel id and slug, and all reads and
writes revalidate that the selected interaction belongs to it. A duplicate or
malformed General identity fails closed. During the bounded rolling migration
only, General may preserve the legacy null-channel read lane; custom channels
never inherit that compatibility. Private member-agent dock history is outside
the channel repository.

## Authority

Auth proves user identity only. The server revalidates community access on
every call and derives authority from current canonical community state.

There are two human authority lanes:

- `builder`: the authenticated human is the community owner or admin and
  currently has resource-management authority.
- `member`: every other currently entitled community relation, including
  moderators and members.

Both lanes can list, read, and search the member repository. Both can write
participation to an exact returned `channels/<slug>/` path. Only the builder lane can
see `builder/`, stage resource changesets there, and discover or call builder
changeset operations.

The community-owned agent always uses the member lane, even when its
operational sponsor is an owner or admin. It publishes with community-agent
attribution, not as the sponsor and never as a builder.

Failures are intentionally non-enumerating. An inaccessible community or
builder path appears not found; server state never trusts a client-claimed
lane.

### Pending admission queue

Builder list/read exposes `builder/join-requests/` and its returned `<request-id>.md`
paths. Every page and exact read rechecks current owner/admin manager authority.
The queue includes only canonical pending requests: request reference, public
applicant reference, status and timestamps. It excludes emails and free-text
messages. Default page size is 20 (2–50); opaque continuation cursors are scoped
to actor, community and pending query and confer no authority. Cancelled or
otherwise decided requests are unavailable on exact read. The directory is
read-only, non-searchable, and absent from member and community-agent projections.
Existing first-party moderator review remains unchanged. The separate free
approval capability below does not make the queue writable.

## Mutation model

`polynet_write` writes only through canonical domain owners:

- `channels/<slug>/`: create a post or append a reply in that exact channel.
- `builder/resources/`: stage a bounded changeset; it does not directly edit
  live resources.

`polynet_call` accepts only an exact operation and version returned by
`capabilities/`. Current operations are:

- member: `community.memory.record_outcome`
- human self (`personal_agent` / `external_mcp`): `community.form.submit`, version 1.
  Discover pending assignments at `/communities/<slug>/members/me/forms/` (12 per
  indexed page; actor/community/visit-scoped cursors). Read the exact returned
  `<request-id>.json` for immutable questions/version, answers and revision.
  These paths are private, non-searchable and read-only. Submitted exact reads
  remain available after progress completion under the same current membership
  activation; cancelled or unverifiable requests are unavailable.
  Call the exact capability target with `form_request_ref` (`form-request:<id>`),
  `form_version_ref` (`form-version:<id>`), `expected_revision` and typed `answers`.
  The adapter caps serialized answers and the complete exact document at 24,000
  characters, including JSON escaping, and rejects `form_payload_too_large`
  before mutation rather than truncating questions or accepted read-back.
  Existing pinned-version required/choice validation and text limits apply.
  Submission freezes answers and schedules the existing reconciler; its
  acknowledgment says submitted, never completed. Canonical context and linked
  transition evidence establish subsequent progress. No draft, authoring,
  human-approval, actor selector or advancement override is exposed.
  Community agents and funnel-builder projections cannot discover or execute it.
  Reservation, answer freeze, scheduling and receipt completion share one
  transaction. Exact replay after progress moves returns the original receipt;
  changed payload conflicts and a new key cannot resubmit frozen answers.
  Current access/funding and the exact membership activation are rechecked before
  historical replay. External submission means authorized on behalf of the member,
  not unaided human authorship.

- human builder (current owner/admin): `community.admission.approve`, version 1.
  Target its exact capability document. Input is `request_ref`,
  `expected_created_at`, and `expected_updated_at` copied from the current pending
  request. Only approval-gated communities and applicants with no existing
  membership/subscription qualify. This creates ordinary free member access using
  existing activation, audit, workflow and best-effort access-email owners. Paid
  access, prior membership restoration, role changes, denial and bulk decisions
  are excluded. Members, moderators and community agents cannot invoke it.

- human builder (current owner/admin): `community.admission.deny`, version 1.
  Uses the same exact pending request reference and observed timestamps as
  approval, with the same narrow fresh/free eligibility and authority lane.
  Atomically records denial, a seven-day server-clock reapplication deadline,
  attempt-specific critical audit and completed receipt. It grants no access
  and triggers no activation, email or workflow. Replays return the historical
  decision without extending cooldown or denying a later application.
  Applicant status and reapplication use the existing authenticated public
  access projection and join operation, not new MCP commands. Before expiry,
  join is denied and cancellation preserves the denied row. At or after expiry,
  an explicit join reopens the same ID with new creation/update observations.
  Old observations cannot approve or deny this new attempt. First-party ID-only
  decision RPC compatibility remains separate from this attempt-bound contract.

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
Fresh admission decisions instead reserve, apply their domain effects and complete
their receipt in one domain transaction. Current manager authority is checked
before both new decisions and receipt replay. A lost response replays the historical decision;
it does not assert present entitlement or email delivery and cannot restore
access after leave/revocation. Stale or reopened applications require a new
observed request and cannot be approved with an older timestamp pair.

The MCP contract exposes real active channels only. It does not create an All
channel or duplicate interaction data. A broad status request lists the bounded
channel inventory and follows the returned directories; the product cap of ten
active channels bounds that fanout.

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

### Public proxy transport boundary

The public MCP proxy terminates inbound HTTP framing. Once it has consumed a
request body, it constructs a new upstream request using an explicit allowlist
of MCP application headers. Connection-specific headers such as
`Transfer-Encoding`, `Expect`, `Content-Length`, `Connection`, `TE`, `Trailer`,
and `Upgrade` never cross into the new request. Headers named by `Connection`
are also removed. The upstream HTTP client owns the new body framing.
Only `OPTIONS` requests may additionally forward
`Access-Control-Request-Method` and `Access-Control-Request-Headers`. This
preserves browser negotiation without authorizing the origin or weakening the
trusted runtime's `ARX_ALLOWED_MCP_ORIGINS` validation.

Transport compatibility is part of release acceptance. Normal, HTTP/1.1
chunked, and `Expect: 100-continue` initialize requests must all reach the
trusted runtime and produce the same OAuth challenge when unauthenticated. A
proxy `502` is never an acceptable substitute for an authorization response.

Every proxy failure returns a server-generated correlation ID and records only
sanitized failure classification. Authorization credentials, cookies, API
keys, and MCP request content must never appear in proxy diagnostics.

A transport failure does not prove whether a mutation committed. Clients must
reuse the same `idempotency_key` when retrying a mutating tool call, then use
the canonical receipt and readback to distinguish a replayed success from a
new effect.

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
npm run preflight:polynet-workspace-mcp-release -- \
  --dev \
  --url=https://polynet-staging.vercel.app/runtime/mcp \
  --require-live-ready

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

# Canonical Polynet operation contract v1

Status: active operation contract; dated release and acceptance evidence below.

## Outcome

Polynet has one public agent operation surface:

```text
polynet_list
polynet_read
polynet_search
polynet_write
polynet_call
```

The native personal harness, community-owned Concierge, and official external
MCP project these same definitions from
[`shared/polynetCanonicalToolContract.ts`](../shared/polynetCanonicalToolContract.ts)
and execute them through
[`convex/polynetCanonicalExecutor.ts`](../convex/polynetCanonicalExecutor.ts).

This is the irreducible harness. Domain-specific capabilities are paths and
discoverable operations, not new public verbs.

## Layers

```text
transport projection
  -> shared five-tool schema
  -> normalized input
  -> server-derived principal + community authority
  -> canonical executor
  -> existing domain owner
  -> canonical result + receipt
```

Transport adapters may frame requests and responses. They may not redefine a
schema, authority rule, effect, failure code, or executor.

The lower-level contracts in
[`shared/platformOperationContract.ts`](../shared/platformOperationContract.ts)
and [`convex/platformOperationExecutor.ts`](../convex/platformOperationExecutor.ts)
remain private semantic list/read domain machinery. They are not a second
public tool catalog.

## Repository

The personal harness and external MCP can list `/`, which contains
`communities/` and `users/`. An authorized community contains identity,
members, resources, channels, accepted memory, and versioned
capabilities. Owner/admin authority additionally reveals `builder/`.

The community-owned agent receives a server-mounted community root. It cannot
escape to `/`, select another community, or inherit builder authority from its
operational sponsor.

Semantic Markdown is a permissioned projection over canonical domain data, not
a second source of truth. Every canonical path, and every underlying evidence
reference it resolves, is authorized again when used.

## Authority

The executor derives authority for every call:

- personal agent and external MCP: current authenticated human relation;
- owner/admin with current resource-management permission: builder lane;
- moderator/member: member lane;
- community-owned agent: fixed member lane within its mounted community;
- community front end: the signed-in member's current relation, forced to the
  member lane and mounted to its community (see Community front ends below);
- builder decisions that grant access or advance members (admission and
  milestone approval): official external MCP only, never the native personal agent;
- missing or revoked entitlement: no access.

Member and builder lanes can participate in chat. Builder-only
resource work is staged as a changeset, then reviewed through operations
discovered under `capabilities/`.

## Effects

- `polynet_list` is bounded discovery.
- `polynet_read` reads exact evidence and may append a retrieval receipt.
- `polynet_search` searches one bounded subtree and returns paths. A community
  root search composes the canonical channel, resource, and accepted
  memory projections under one global limit; it does not use the private
  prompt-context aggregator. Every returned result path must round-trip through
  `polynet_read`, and hidden domain failures fail the operation.
- `polynet_write` delegates to the owning chat or resource changeset
  domain.
- `polynet_call` invokes only a discoverable versioned transition.

Mutating tools require an idempotency key. Canonical operation receipts reserve
the key against the normalized request before effects, reject conflicting
reuse, and persist the completed result. Domain owners remain independently
idempotent for crash recovery.

## Public-surface deletion rule

The official MCP, personal harness, and community agent must each expose
exactly the canonical five. Names such as `polynet_workspace_*`,
`community_resources_*`, `community_memory_*`, and specialized builder
tool names may remain only as private migration substrate while first-party
callers are removed. They are not public tools and are deletion candidates
once no private call path requires them.

Allowed capabilities such as web research are orthogonal overlays. They do
not expand or fork the base Polynet repository contract.

## Product-surface boundary

The standalone general-purpose Workspace product is deleted. The member's
private conversation uses the desktop Agent page and mobile Agent root; the
floating launcher is retired. A community supplies one explicit server-validated
context for subsequent turns. Discover and
generic platform pages do not silently inherit a prior community context.

`member_agent_dock` component and receipt names are compatibility vocabulary,
not a second UI surface. See `community-agent-conversations.md`. This presentation
does not confer builder or autonomous community-agent authority on a member.

Threads and messages may remain internal persistence and audit primitives.
They are not a second user-facing Workspace navigation model. Likewise, legacy
external `workspace` wire vocabulary may remain only where the official MCP
compatibility contract requires it; it does not restore the deleted product.

## Verification

`npm run check:canonical-operation-surface-proof` checks schema, registry,
projection, policy, executor, and retired-name boundaries.

`npm run check:community-semantic-repository-proof` checks paths and semantic
projection.

`npx vitest run convex/polynetCanonicalExecutor.test.ts` checks member/builder
authority, community-agent confinement and attribution, community-root
search/read round trips, global search bounds, member-visible memory projection,
mutation idempotency/conflict behavior, and staged builder calls against an
isolated Convex backend.

The release gate and production metadata smoke against
`https://www.polynet.ai/runtime/mcp` passed on 2026-08-16.

The authenticated read-only production acceptance also passed on 2026-08-16,
bound to web build and Sentry release
`a17e3104ec1f47e304d69dae5677d5d1698af1d6` and production Convex
function-spec digest
`97cd9011d9d91d375535dddc8425579e0654a2387c2acc7f26b7b6e3e5fe368e`:

1. OAuth completed through the advertised protected-resource and authorization-
   server metadata. The short-lived access and refresh credentials remained in
   memory only and were cleared after the read-only checks.
2. `tools/list` returned exactly the canonical five tools. Listing `/` returned
   only `/communities/` and `/users/`.
3. The explicit `/communities/polynet/` root resolved server-derived
   `builder`/`owner` authority and exposed identity, members, resources,
   channels, events, memory, capabilities, and builder paths.
4. The client traversed and read a real resource, searched the community, and
   read a returned canonical evidence path. It invoked no `polynet_write` or
   `polynet_call` mutation.
5. Canonical production state independently confirmed that
   `/communities/testing/` exists; the OAuth actor received
   `semantic_not_found` when attempting that unauthorized community root.
   Deterministic executor tests retain the complete member, builder, community-
   agent, stale-authority, and idempotency matrix.
6. The external smoke now follows every advancing `/communities/` cursor before
   validating an explicitly requested community. A repeated cursor fails
   closed instead of silently substituting a first-page community.

## Community front ends

Polynet splits into two surfaces:

- **The community's front end** is the member experience: chat, posts,
  content, events, memory and the agent. Founders vibe-code it, and it acts
  only through the five verbs.
- **Polynet Studio** (today's web app) keeps founder administration,
  settings, analytics, billing, direct messages and account. These never move
  into front ends.

A front end lives at the community's own domain, behind the Polynet community
edge (`infra/community-edge`). A domain is registered to exactly one community
(`communityDomains`, `convex/communityApps.ts`): an exact HTTPS origin, or
`localhost` / `*.localhost` for development.

Sign-in is invisible when the member is already signed in to Polynet:

1. The edge sends the member to Polynet's login bridge
   (`/api/auth/community-handoff`) with the community, its callback and a state.
2. With a live Polynet session, Convex checks membership and that the callback
   belongs to a registered domain of that community, then issues a one-time
   code (60 seconds, bound to state and domain, deleted when presented; only
   hashes stored). A Polynet user who isn't a member yet is sent back to the
   front end (`/?polynet=join`), which links to Polynet's join page
   (`join_url` from the edge's session endpoint); joining (open, approval or
   paid) stays Polynet-hosted.
3. The edge swaps the code server to server (edge secret) for a 30-day session
   kept in an HttpOnly, host-only cookie on the community's domain. Page code
   and the community's own Worker never see it. When it expires, the same hop
   signs the member in again. The session and sign-in-state cookies use the
   `__Host-` prefix (Secure, `Path=/`, no `Domain`), because every community
   shares the sites domain and that domain is not a public suffix: a sibling
   site can set `Domain=polynet.page` cookies, but never a `__Host-` one, so it
   cannot shadow a member's session or fixate them into its own. For the same
   reason (sibling sites count as the same site, so the browser sends this
   site's `SameSite=Lax` cookies with their requests) the edge answers the
   member endpoints (`/__polynet/api`, `/agent`, `/agent/messages`, `/upload`,
   `/files/*`, `/account`, `/auth/session`, `/auth/logout`) only for the site's
   own pages: `Sec-Fetch-Site: same-origin`, or, from a browser without Fetch
   Metadata, a matching `Origin` on writes. Anything else gets 403
   `cross_site_request`; opening a file link (a navigation) still works. A
   site's own responses can't set Polynet's cookies: the edge drops any
   `Set-Cookie` naming one.

The edge forwards `/__polynet/api` to `POST /runtime/app` with the edge secret
and the session; the backend answers nothing else, so a token is useless
outside the edge. Each request runs the canonical executor as principal
`community_app`:

- authority = the member's current access ∩ the mounted community, re-derived
  on every request; revoking membership, the session or the domain takes
  effect immediately;
- member lane only, even when the member owns the community: no `builder/`
  paths and no admission or milestone capabilities;
- community paths only: no platform root, other communities, user profiles or
  direct messages;
- channel writes are the member's own posts (actor `human`) through the trusted
  composer, with `community_app` canonical receipts; file attachments are refused.

Chat through the door, the same for every actor:

- `polynet_list` on `channels/<slug>/` returns recent posts and replies with
  `object_type`, a reply's `root_ref`, the author's `display_name`, `handle` and
  `avatar_url`, `reactions`, the caller's own `reacted_by_me`, `by_me`,
  `can_edit`, `reply_count`, `edited_at` and `snippet_truncated`; when the
  500-character snippet was cut, `text` carries the whole post. `by_me` covers
  posts the community agent made for the caller (they may delete those);
  `can_edit` is their own words only. Posts by the retired personal agent list
  as `community_agent`.
- `polynet_list` on `channels/<slug>/interaction:root:<id>/` returns that post
  and its replies, oldest first.
- `polynet_write` with `update` or `delete` on a post's `.md` path edits or
  deletes the caller's own post only, even for owners; moderating others'
  posts stays in Studio.
- Listing the community folder (`/communities/<slug>/`) returns
  `community: { slug, name }` and, for a member, `viewer: { display_name,
  handle, avatar_url, role }`. A post whose text contains `@<name>` and whose
  `content.mentions` include `{ agentKey: "community_agent" }` asks the
  community agent, which replies in the channel (community-funded).
- `polynet_call` `community.interaction.react` sets the caller's reaction
  (`ref`, `emoji`, `on`), so retries are safe.

Community pages through the door: `events/` lists upcoming events with
times, location and link; `resources/` lists module folders and resource
documents to read; `memory/` lists the top accepted memories the member can
read (up to 12, recorded as a retrieval like a search), and `polynet_search`
on `memory/` finds more. Front ends reach memory as their trusted member,
since they have no Convex identity. Creating events and resources stays in
Studio.

Files: the page posts a file to the edge's `/__polynet/upload` (headers
`x-polynet-channel`, `x-polynet-idempotency-key`, optional `x-polynet-root-id`
for a reply) before writing the post with the same idempotency key and
`content.attachments: [{ attachmentId }]`; the post claims it. Limits and
content checks are Studio's. Listings show files as
`attachments: [{ ref: "attachment:<id>", name, kind, mime, size }]`, and the
page loads them from `/__polynet/files/<id>`: images inline, everything else
as a download, only within the session's community.

The community agent (Agent page): the edge forwards `POST /__polynet/agent` (`{ text,
message_key }`) to `/runtime/app/agent` and `GET /__polynet/agent/messages`
to `/runtime/app/agent_messages`, with the edge secret and session. A turn
runs Studio's runtime harness on the member's own conversation for this
community (the one Studio's agent dock shows), streamed as server-sent events.
The page sends only text: the thread, community, model and funding are fixed
server-side, and the community's AI allowance pays as in Studio. Because the
front end has no Convex identity, the turn runs on a context
(`convex/communityAppAgentTurn.ts`) that sends exactly the identity-bound calls
to internal twins carrying the authenticated member; any other identity-bound
call fails closed. The agent stays in the member lane, even for owners. What it writes for the
member is the community agent's post, attributed to that member
(`on_behalf_of_user_id` in Studio's read model).

Live updates: the edge's `/__polynet/auth/session` gives a signed-in page the
Convex URL and a **watch-only token** (`pnw_`), derived from the session token
(only its hash is stored). The page subscribes to the public query
`communityLive:watch` with that token and a channel path; it returns only a
version that changes when anything in the channel changes (posts, replies,
edits, deletions, reactions, the channel itself), and the page re-reads the
channel through the door. `watch` re-checks the session, membership and channel
access on every run, so losing any of them turns the subscription off live. The
watch token cannot call the API and carries no content.

API rate limits belong at the edge. Retrieval logs record these reads on the
`external_mcp` surface; a dedicated surface is a follow-up.


## The Polynet MCP is for builders

The Polynet MCP (`/runtime/mcp`) is for community builders: the owners and
admins of an active community, using their own agent harness (Claude Code,
Codex, claude.ai, ChatGPT). Members use their community's site and its agent.

- A caller who builds no active community gets `builder_only` for every tool.
- A call that targets a community (`path`, or `target` for `polynet_call`)
  must be one the caller builds; otherwise `builder_only` (or
  `semantic_not_found` when the caller isn't in that community at all).
- Listing `/communities/` returns only the communities the caller builds.

The gate sits at the MCP entrance (`convex/httpMcp.ts`), so the door's shared
authority rules, used by every principal, are unchanged.

Builders publish their community's site with `polynet_call`
`community.site.deploy` (`input.files`: `"/path" -> { content, encoding }`,
`utf8` or `base64`, with `/index.html`; up to 200 files and 5 MB). It is the
same deploy path as `npx @polynet/cli deploy` (`convex/communitySiteDeploy.ts`):
Cloudflare receives only the files it lacks, the site goes live at
`https://<slug>.<sites domain>`, and the receipt records the manifest (paths,
hashes, sizes), not the contents.

Both paths first run the site checks in `packages/polynet-cli/checks.mjs`
(the same module `polynet check` uses). Errors stop the deploy
(`site_checks_failed` on the MCP): a page without
`<html lang>`, a `<title>` or a zoomable viewport, an `<img>` without `alt`, a
button or link without a name. Warnings come back with the result. The checks
are a guardrail for agents, not a security boundary: the CLI runs them
locally. The Polynet shell isn't checked because the edge guarantees it: it
adds `/__polynet/ui.js` to every HTML page that doesn't load it, and `ui.js`
mounts a fixed top-right `<polynet-account>` on a page that has none shortly
after load. The shell's account data (`/__polynet/account`) is readable by any
script on the site, so it covers the current community only (member name,
handle, avatar, role here) and links out to Polynet for the member's other
communities; it never lists them.

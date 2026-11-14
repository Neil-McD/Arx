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

The community agent (Agent page and Concierge mention replies), community sites
and the official external MCP project these same definitions from
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

External MCP can list `/`, which contains `communities/` and `users/`. The
community agent's conversations with a member (Agent page, a site's `/ask`) are
mounted to that conversation's community. An authorized community contains identity,
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

- the community agent acting for a member and external MCP: current
  authenticated human relation, in the lens of that relation;
- owner/admin with current resource-management permission: builder lane;
- moderator/member: member lane; through the external MCP, moderators (and
  owners and admins) also have the moderator lens: join review and removing posts;
- community-owned agent: fixed member lane within its mounted community;
- community front end: the signed-in member's current relation, forced to the
  member lane and mounted to its community (see Community front ends below);
- builder decisions that grant access or advance members (admission and
  milestone approval): official external MCP only, never the native community agent;
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

The official MCP and the community agent (Agent page, mentions, sites) must each
expose exactly the canonical five. Names such as `polynet_workspace_*`,
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

## Community front ends (removed)

Community sites and their edge were removed on Nov 13, 2026. A community's
public page is `/c/<slug>` in the app (`convex/communityLanding.ts`), where
people join; members use the app. A builder's own app connects through
connected apps (`convex/connectedApps.ts`), which ask Polynet, server to
server, what a person may do.

## The Polynet MCP: every role, in its own lens

The Polynet MCP (`/runtime/mcp`) is for anyone signed in, using their own
agent harness (Claude Code, Codex, claude.ai, ChatGPT). In each community the
door gives the caller the lens of their role there
([community-lens-contract-v1.md](community-lens-contract-v1.md)):

- **member:** reads what members see; writes their own posts and replies,
  edits and deletes their own posts, reacts, marks lessons done;
- **moderator** (owners, admins, moderators): also `builder/join-requests/`,
  `community.admission.approve` / `.deny`, and `community.interaction.remove`;
- **builder** (owners and admins who manage resources): also the rest of
  `builder/` and workflow decisions.

A post or reply written through someone's own AI (`external_mcp`), like one
from their site (`community_app`), is that person's own post: stored as a
human post by them, with no marker, and theirs to edit or delete. A reply can
be appended on the channel with `content.root_id` or on the post's own thread
path (`channels/<slug>/interaction:root:<id>/`). Refusals carry the domain's
own code and a plain sentence (for example `interaction_edit_forbidden`: "You
can only edit your own posts."), never a raw server error.

A community the caller isn't an entitled member of is `semantic_not_found`.
Listing `/communities/` returns the communities the caller belongs to, with
their role. There is no gate at the MCP entrance: the door's shared authority
rules decide every call (`derivePolynetHumanAuthority`, `shared/polynetAuthority.ts`).

Decisions about people and posts take a selection: `requests` (approve, deny)
or `refs` (remove), 1 to 50 distinct items. Each item is decided on its own
and has its own receipt (the call's idempotency key plus the item's id, so
the key is at most 135 characters); the result lists each item's outcome
with `succeeded` and `failed` counts. Removing a post that is already
removed still counts as removed. Every selection runs through one runner
(`runSelection`): the call's key is bound to the whole selection (a retry
replays the answer; the same key with another selection is
`idempotency_key_conflict`), then each item is decided on its own.

Owners and admins run the community itself through their own AI (builder
lens): `builder/community.json` holds the profile, visibility, join mode,
agent instructions, handbook and `settings_revision`. `community.settings.update`
takes `expected_revision` and any of `name`, `slug`, `visibility` (owner) and
`one_liner`, `about` (owners and admins); only the fields given change, and
pricing and pictures are carried over (`updateCommunityProfileForTrustedUserInternal`
over Studio's save). A stale revision is `community_settings_conflict`; an
admin changing an owner field is `owner_only`. `community.join_mode.set`
(`open` approves waiting requests), `community.agent.instructions.set`,
`community.handbook.save_draft` and `community.handbook.approve` (exactly this
text; empty withdraws) call Studio's own functions. Each call has a receipt.
`community.member_experience.request` was retired with custom sites (Nov 13
2026): Settings no longer has the screen an owner approved it on, so it is
`operation_not_found`. `builder/community.json` still shows `member_experience`
(`members_use`, `has_custom_site`).

People (builder lens): `community.members.set_role` (`members`,
`role`), `.remove`, `.ban` (`reason` optional) and `.unban` take a selection of
`user:<id>` refs and run Studio's own functions per person
(`communityPeople.applyPersonActionForTrustedUserInternal`): only the owner
makes, unmakes or removes admins; the owner can't change. A paying member is
refused with `paid_member_use_studio` (removal cancels their subscription;
a person does it in Studio). Each is a state, so a retried item changes
nothing.

Every `polynet_call` answers in the published output shape:
`{ ok, operation, result, receipt }`. A test lists every role's actions and
fails if any input they accept is missing from the published call schema, or
an answer lacks a required output field.

Writes a person makes through their own AI (`external_mcp`) share one budget of 60 a minute
(`convex/memberWriteRateLimit.ts`). Over it, the call is `rate_limited`
with `retry_after_ms`. Reads, presence, typing and read positions don't
count; the community agent is bounded by AI quota instead.

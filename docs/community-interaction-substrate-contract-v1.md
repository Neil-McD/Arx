# Community Interaction Substrate Contract v1

Status: active
Scope: canonical backend substrate for community chat, posts, replies, reactions, embeds, and agent signals

## Decision

Community communication is not modeled as Slack, X, Telegram, or Skool. Those are UI projections.

The backend canonical object is a community interaction:

```txt
interaction root
  -> one-level reply drawer
  -> typed content blocks
  -> attachments and embeds
  -> mentions and reactions
  -> read/follow/moderation state
  -> optional permissioned source trace
```

Slack, post, Telegram, and Skool are UI projections over the same substrate. No separate Slack backend. No separate post backend.

## Deletions

These requirements are deleted before implementation. Do not optimize them.

### Delete UI-style Backends

There must not be separate backend tables or APIs for Slack-style chat, X-style posts, Skool-style posts, or Telegram-style messages.

Allowed:

- UI projection preferences.
- Query shapes optimized for a projection.
- Presentation metadata derived from canonical records.

Not allowed:

- Separate post and chat source-of-truth models.
- Divergent reaction, reply, mention, unread, embed, or moderation systems per UI style.

### Delete Recursive Drawers

Threads are one drawer deep.

A reply may quote or target another reply inside the same drawer, but it must not open a second nested drawer. This keeps Slack-style interaction fast while preserving enough context for X-style conversation projection.

### Delete Untyped Message Payloads

`contentJson: v.any()` is migration compatibility only.

The future write contract uses typed content blocks. Renderers may turn those blocks into compact chat rows, post cards, agent signal cards, or archive text, but the stored payload must be typed.

### Delete All-Chat Memory

Raw chat is not community intelligence.

Most activity should remain ephemeral or archival. Only selected, high-signal, permissioned, or promoted interactions become source traces for the compiler. The community cognition loop learns from evidence, outcomes, and validated operational patterns, not from dumping every message into memory.

### Delete Hard Delete As Normal Moderation

Normal deletion is a tombstone plus moderation event.

Hard purge is a separate privacy/legal operation with explicit policy. Product moderation should preserve provenance, reply continuity, and auditability.

### Delete Accidental Workspace Sharing

Pasted workspace content must not silently become shared community data.

Workspace embeds require explicit permissioned references. A preview can reveal only what the posting user is allowed to share and what the viewer is allowed to read.

### Delete Synchronous Unfurls

Link previews and workspace previews are async derived records.

The message send path must not block on external fetches, scraping, media processing, or workspace preview generation.

### Delete Human-Only Room Assumption

The current chat table stores only user-authored messages. The future substrate must model actors explicitly:

- human
- personal agent
- community agent
- system

Agent participation still needs permission, provenance, and policy gates. This deletion does not mean agents can impersonate humans or publish ungoverned community truth.

### Delete Post-Versus-Chat Fork

Post mode changes the feed projection, density, ranking, and root card rendering. It does not change the root/reply/reaction/mention/embed substrate.

## Irreducible Model

### `interactionRoots`

Top-level community interaction.

Required properties:

- community id
- actor type and actor id
- interaction kind: `discussion`, `announcement`, `question`, `resource_share`, or `agent_signal`
- status: `live`, `hidden`, `deleted`
- visibility scope
- typed content summary
- reply count
- reaction summary
- idempotency key
- created/updated timestamps

### `interactionReplies`

One-level drawer replies under a root.

Required properties:

- root id
- actor type and actor id
- optional target reply id for quote/context only
- typed content summary
- status: `live`, `hidden`, `deleted`
- reaction summary
- idempotency key
- created/updated timestamps

### `interactionContentBlocks`

Typed content attached to a root or reply.

Initial block types:

- markdown_text
- image
- video
- file
- link
- workspace_ref
- mention

### `interactionAttachments`

Normalized file/media records.

Attachments are referenced by content blocks. The root/reply row may keep bounded summaries, but not arbitrary untyped blobs.

### `interactionEmbeds`

Async link and workspace preview records.

Embeds have fetch state, source URL or workspace reference, visibility, preview payload, and error state.

### `interactionMentions`

Canonical mention records for people, personal agents, community agents, roles, and later groups.

Mentions drive notifications and access-sensitive rendering. They are not just markdown text.

### `interactionReactions`

Shared reaction model for roots and replies.

Reaction summaries may be denormalized onto roots/replies for feed speed, but the reaction event remains canonical.

### `interactionReadState`

Per-user state for unread roots, unread drawer replies, followed interactions, muted interactions, and last-read positions.

### `interactionModerationEvents`

Append-only events for edit, hide, unhide, tombstone, lock, pin, unpin, and privacy purge requests.

### `interactionSourceTraceBridge`

Optional bridge from interaction to community cognition.

Rules:

- Creating an interaction does not automatically create community truth.
- High-signal or promoted interactions may create permissioned `communitySourceTraces`.
- Source traces must preserve actor, visibility, evidence, and provenance.
- Directory truth is still created only through compiler and policy gates.

## Migration Rule

The existing community chat implementation is a live-room adapter, not the final substrate.

Migration should be additive first:

1. Add canonical interaction tables and read/write APIs.
2. Let current chat UI write roots and one-level replies through an adapter.
3. Project existing chat messages into interaction roots/replies for compatibility.
4. Move reactions, embeds, mentions, unread, and moderation onto canonical tables.
5. Delete legacy chat writes after parity.
6. Delete legacy chat reads after backfill and UI projection are stable.

No big-bang rewrite. No duplicated product truth.

## Current Additive Schema Slice

The first backend slice adds canonical tables beside legacy chat:

- `communityInteractionRoots`
- `communityInteractionReplies`
- `communityInteractionContentBlocks`
- `communityInteractionAttachments`
- `communityInteractionEmbeds`
- `communityInteractionMentions`
- `communityInteractionReactions`
- `communityInteractionReadStates`
- `communityInteractionModerationEvents`
- `communityInteractionSourceTraceLinks`
- `communityInteractionLegacyChatLinks`

It also adds `interaction` as a product-owned `communitySourceTraces.sourceType`. Public source-trace writes must still be limited to `manual` and `external`; interaction traces are created only through trusted product bridges.

## Current Write-Core Slice

The first write API slice exposes:

- `createCommunityInteractionRoot`
- `createCommunityInteractionReply`

Rules:

- first slice writes are human-authored only
- human-authored writes cannot create `agent_signal` roots
- every write requires `idempotencyKey`
- duplicate root writes return the existing root bundle
- duplicate reply writes return the existing reply bundle when the key belongs to the same root
- reply writes create a flat one-level drawer under the root
- `targetReplyId` is quote/context only and must belong to the same root
- reply visibility cannot be broader than root visibility
- typed content blocks are normalized before storage
- link and workspace reference blocks create pending `communityInteractionEmbeds`
- mention blocks create canonical `communityInteractionMentions`
- write paths do not fetch URLs, scrape pages, process media, or resolve workspace previews synchronously

## Current Read-Model Slice

The first read API slice exposes:

- `listCommunityInteractionRoots`
- `listCommunityInteractionReplies`

Rules:

- root reads are access-gated by community membership
- root reads use bounded indexed reads over live roots
- root reads may hydrate content blocks, embeds, mentions, and reaction summaries
- root reads do not hydrate drawer replies inline
- reply reads are access-gated through the root community
- reply reads use bounded indexed reads by `rootId + seq`
- reply reads return only one-level drawer replies
- read APIs do not use legacy chat tables as source-of-truth
- migration-only legacy attachment hydration may resolve linked legacy chat attachments until canonical attachment backfill is complete
- migration-only legacy attachment hydration lives outside the canonical interaction core in `communityInteractionLegacyAttachments`
- viewer reaction state must be loaded only for the visible root/reply target ids, never by scanning all reactions for a viewer
- reaction summary updates must not rescan every reaction on a target
- read APIs do not read compiler, source-trace, archive, or memory tables
- read APIs do not mutate unread, notification, or moderation state

## Current UI Projection Slice

The first web UI slice projects the canonical interaction read model into the existing community chat panel behind `VITE_ENABLE_COMMUNITY_INTERACTION_PROJECTION`.

Rules:

- the flag is enabled only in the active staging/dev chat-substrate lane
- when disabled, the existing legacy chat timeline remains the rendered surface
- the projection reads roots with `listCommunityInteractionRoots`
- the projection opens exactly one drawer with replies from `listCommunityInteractionReplies`
- canonical interaction read bundles expose public actor user ids for UI identity/profile hydration
- text-only top-level composer sends may use the canonical composer bridge
- text-only drawer reply sends may use the canonical composer bridge when the reply target has a canonical root id
- attachment sends and ambiguous legacy reply sends remain on the legacy chat writer during this migration slice
- successful legacy sends may refresh the projection after the canonical adapter dual-write completes
- stale interaction reads must not overwrite the projection after a community switch or reset
- post-style and Slack-style presentation remain UI decisions over the same root/reply data

## Current Canonical Composer Bridge Slice

The first composer migration slice adds `createCommunityInteractionComposerMessage`.

Rules:

- composer text writes create canonical roots/replies before legacy compatibility rows
- the compatibility row is written to `communityChatMessages` in the same Convex transaction
- `communityInteractionLegacyChatLinks` maps the compatibility message to the canonical root/reply
- the compatibility row keeps old readers, realtime subscribers, archive documents, digests, and recent-context consumers alive
- the mutation returns the existing legacy chat row shape to preserve optimistic UI replacement behavior
- drawer replies require a canonical `rootId` and a valid legacy reply target message id
- attachment upload migration is deferred; attachment sends stay on `createThreadUserMessage`
- ambiguous legacy timeline replies stay on `createThreadUserMessage`
- idempotency keys use a composer namespace, not `legacy_chat_message:*`
- the bridge does not call public root/reply mutations
- the bridge may schedule async link-embed enrichment after creating pending embed records
- the bridge does not fetch URLs, scrape pages, process media, promote source traces, or call the compiler synchronously

## Current Async Link Embed Enrichment Slice

Link previews are async projections over canonical interaction content, not part of the message write contract.

Rules:

- composer writes may create pending link embed records from eligible pasted URLs
- unsafe or unsupported URLs remain as plain message text and do not create fetchable preview embeds
- eligible preview URLs must pass the shared community source URL policy before storage and again before enrichment
- preview URLs must be HTTPS, public-shaped, credential-free, custom-port-free, hashless, and not local/private/reserved/metadata/internal-shaped hosts
- Convex never fetches the user-provided source URL directly
- the internal enrichment action may only POST bounded requests to the configured first-party source URL fetcher endpoint
- the configured fetcher endpoint must itself be HTTPS, credential-free, custom-port-free, hashless, and public-shaped
- the source URL fetcher remains authoritative for DNS resolution checks, public-address pinning, and redirect target revalidation
- enrichment requests must include byte, character, timeout, redirect, and accept-header bounds
- fetcher responses must be read with a bounded response cap before JSON parsing
- returned preview image URLs must pass the same shared community source URL policy or be omitted
- enrichment failures patch the embed to `failed`; they do not fail or mutate the canonical root/reply text

## Current Legacy Chat Adapter Slice

The first compatibility adapter keeps the existing chat mutation alive while dual-writing canonical interactions:

- `createThreadUserMessage` remains the legacy write entrypoint for the current chat UI
- top-level chat messages are translated into `communityInteractionRoots`
- chat replies are translated into `communityInteractionReplies`
- legacy reply targets map to one drawer root; reply-to-reply targets become `targetReplyId` quote/context only
- deterministic idempotency keys use the legacy message id
- `communityInteractionLegacyChatLinks` stores legacy message to interaction root/reply mappings
- adapter validation failures are skipped without failing the legacy chat send path
- adapter write/materialization failures are not swallowed after writes begin; Convex must abort the transaction instead of committing partial canonical rows
- adapter writes do not call the public interaction mutations
- adapter writes do not fetch URLs, scrape pages, process media, or resolve workspace previews synchronously
- adapter writes do not promote source traces, write archive truth, or call the compiler
- attachment upload migration is deferred
- attachment-only legacy messages become bounded markdown summaries so projection does not silently drop them
- legacy chat response shape is unchanged

## Current Legacy Chat Backfill Slice

The first repair/backfill API is a bounded batch tool for migrating old legacy chat rows into canonical interaction rows.

Rules:

- `backfillCommunityInteractionsFromLegacyChatBatch` is moderator-gated
- `dryRun` defaults to true
- each batch processes one legacy chat thread
- when no `threadId` is supplied, the canonical first community chat thread is used
- reads are bounded by `limit` and ordered by legacy message `seq`
- `afterSeq` is the forward cursor
- dry-run predicts links created earlier in the same batch before counting reply outcomes
- top-level legacy messages become interaction roots
- legacy replies become one-level interaction replies only when their target mapping exists
- missing target mappings are counted as `unresolved_replies`, not guessed
- running the batch repeatedly must not duplicate roots or replies
- backfill write/materialization failures are not caught after writes begin
- backfill does not migrate reactions, edits, deletes, or moderation state
- backfill does not promote source traces, write archive truth, call the compiler, schedule jobs, or change UI behavior

## Current Demo Seed Tooling

Demo seed and unseed helpers are internal-only operational tooling, not canonical substrate behavior.

Rules:

- `seedPolynetChatDemo` and `unseedPolynetChatDemo` live outside `communityInteractions`
- demo seed data must not be imported by public read/write paths
- demo cleanup may use broad deletes because it is an internal maintenance tool, not a product read model
- production chat behavior must not depend on seeded demo rows

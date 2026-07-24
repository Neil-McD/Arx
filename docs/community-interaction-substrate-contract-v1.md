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

Every readable interaction may become a governed source trace, but a source
trace is evidence rather than retained community intelligence. The compiler
must explicitly retain, carry forward, or dismiss that evidence; most activity
should never become memory.

Canonical readability does not itself authorize retroactive cognition. New or
edited interactions enter the existing write-driven evidence sync. Historical
migration rows remain readable through their canonical interaction refs unless
a separately authorized, bounded decision admits them into compiler evidence.

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

Unread projection is currently derived from the community-level
`communityMemberSettings.chatLastSeenAt` boundary. There is no separate
interaction read-state table until the product requires independently persisted
per-root follow, mute, or drawer-read state.

### `interactionModerationEvents`

Append-only events for edit, hide, unhide, tombstone, lock, pin, unpin, and privacy purge requests.

### `interactionSourceTraceBridge`

Derived projection from canonical interaction evidence into community
cognition. Interaction source traces are keyed directly by their canonical
evidence reference; there is no intermediate source-trace link table.

Rules:

- Creating an interaction does not automatically create community truth.
- Community/public interactions may enter a permissioned retrieval archive without
  becoming compiler input.
- Every invoked live write-driven interaction sync creates or updates one permissioned
  `communitySourceTraces` row keyed by its canonical evidence reference.
- There is no recursive bulk historical interaction-trace replay. Historical
  migration completeness is audited without converting the full backlog into
  compiler-pending work.
- Archive synchronization and source-trace projection are separate idempotent
  derived records. Neither one directly creates retained memory.
- Source traces must preserve actor, visibility, evidence, and provenance.
- Directory truth is still created only through compiler and policy gates.

## Migration Rule

The legacy community chat implementation is a migration adapter, not the final substrate.

Migration order:

1. Add canonical interaction tables and read/write APIs.
2. Project existing chat messages into interaction roots/replies for compatibility.
3. Route web UI reads and writes through the canonical projection/composer.
4. Move reactions, embeds, mentions, and moderation onto canonical tables; keep
   the community unread boundary in `communityMemberSettings`.
5. Delete live legacy chat writes and browser reads after parity.
6. Retain the digest on canonical interactions and delete the optional
   featured-message system rather than migrating it.
7. Backfill retained attachment state, observe zero remaining compatibility
   reads/writes, then delete migration links, helpers, and legacy tables.

No big-bang rewrite. No duplicated product truth.

The active migration residue inventory lives in `docs/community-interaction-migration-residue-map.md`.
Anything touching legacy chat tables during the interaction migration must be classified there as
`KEEP TEMPORARILY`, `DELETE CANDIDATE`, or `DECISION REQUIRED`. A parity gap is
a deletion gate, not a separate classification.

## Current Additive Schema Slice

The first backend slice adds canonical tables beside legacy chat:

- `communityInteractionRoots`
- `communityInteractionReplies`
- `communityInteractionContentBlocks`
- `communityInteractionAttachments`
- `communityInteractionEmbeds`
- `communityInteractionMentions`
- `communityInteractionReactions`
- `communityInteractionModerationEvents`
- `communityInteractionLegacyChatLinks`

Unread state remains on the existing `communityMemberSettings.chatLastSeenAt`
boundary rather than a duplicate interaction read-state table. Interaction
source traces use canonical evidence references directly rather than a
duplicate link ledger.

The slice also adds `interaction` as a product-owned
`communitySourceTraces.sourceType`. Public source-trace writes must still be
limited to `manual` and `external`; interaction traces are created only through
trusted product bridges.

## Current Write-Core Slice

The current public write API exposes:

- `createCommunityInteractionComposerMessage`

Rules:

- member-visible writes are human-authored only
- the composer creates canonical roots and replies directly; generic public root/reply mutations are not exposed
- new composer roots are `discussion` roots with `community` visibility
- composer replies inherit the root visibility and cannot broaden it
- every write requires `idempotencyKey`
- duplicate root writes return the existing root bundle
- duplicate reply writes return the existing reply bundle when the key belongs to the same root
- reply writes create a flat one-level drawer under the root
- `replyToMessageId` is quote/context only and must resolve inside the same root when present
- composer text is normalized into typed canonical content blocks before storage
- link blocks create pending `communityInteractionEmbeds`
- user mentions are capped, deduped, resolved to existing users, and must pass community chat access
- community-agent mentions store the canonical `community_agent` key, but v0
  writes require the visible current-community-name token in the final text
- mention rows create canonical `communityInteractionMentions`
- prepared attachments create canonical `communityInteractionAttachments`
- write paths do not fetch URLs, scrape pages, process media, or resolve workspace previews synchronously

## Current Read-Model Slice

The first read API slice exposes:

- `listCommunityInteractionRoots`
- `listCommunityInteractionReplies`

Rules:

- root reads are access-gated by community membership
- root reads use bounded indexed reads over live roots
- root reads return only `community` and `public` roots; `private` and `admin` scopes require a separate future/admin read API
- root reads may hydrate content blocks, embeds, mentions, and reaction summaries
- root reads do not hydrate drawer replies inline
- reply reads are access-gated through the root community
- reply reads require a live community/public-readable root
- reply reads use bounded indexed reads by `rootId + seq`
- reply reads return only live `community` and `public` replies
- reply reads return only one-level drawer replies
- read APIs do not use legacy chat tables as source-of-truth
- root/reply read bundles expose canonical interaction ids only; they do not
  resolve or emit legacy thread/message/target ids
- read bundles load attachments only from canonical `communityInteractionAttachments` rows
- the four exact historical attachment payloads are preserved as four canonical rows that reference their existing storage objects
- the legacy attachment read fallback is deleted after the expectation-locked four-row cutover and zero-work replay
- canonical attachment row reads and storage URL resolution live outside the canonical interaction core in `communityInteractionAttachmentBridge`
- viewer reaction state must be loaded only for the visible root/reply target ids, never by scanning all reactions for a viewer
- reaction summary updates must not rescan every reaction on a target
- read APIs do not read compiler, source-trace, archive, or memory tables
- read APIs do not mutate unread, notification, or moderation state

## Current UI Projection Slice

The web UI projects the canonical interaction read model into the existing community chat panel by default. Production must not depend on `VITE_ENABLE_COMMUNITY_INTERACTION_PROJECTION` or any other deployment env flag to select the canonical thread drawer.

Rules:

- canonical projection is the normal production and staging chat surface
- the legacy chat timeline is not a production UI routing option
- the projection reads roots with `listCommunityInteractionRoots`
- the projection opens exactly one drawer with replies from `listCommunityInteractionReplies`
- the projection subscribes to canonical interaction roots and replies directly
- legacy chat realtime is deleted from the normal web chat UI
- canonical interaction read bundles expose public actor user ids for UI identity/profile hydration
- top-level composer sends use the canonical composer bridge, including prepared attachments
- drawer reply sends use the canonical composer bridge when the reply target has a canonical root id, including prepared attachments
- a missing canonical writer fails closed instead of falling back to the legacy chat writer
- successful sends may request a canonical projection reload; canonical projection does not rely on legacy chat realtime
- stale interaction reads must not overwrite the projection after a community switch or reset
- post-style and Slack-style presentation remain UI decisions over the same root/reply data

## Current Canonical Composer Bridge Slice

The staging clean-room composer slice uses `createCommunityInteractionComposerMessage` as the canonical chat writer.

Rules:

- composer writes create canonical roots/replies only
- composer writes must not create legacy `communityChatMessages`
- composer writes must not create `communityInteractionLegacyChatLinks`
- composer writes may include bounded, already-prepared attachment metadata
- composer attachment rows are written to `communityInteractionAttachments`
- composer user mentions are limited to existing users who can access the target community chat
- composer community-agent mentions remain structural (`community_agent`) and
  fail closed unless the visible current-community-name token is present
- the mutation returns an empty legacy `rows` array; canonical projection completion depends on canonical mutation success and idempotency-key reconciliation
- pending canonical projection overlays reconcile by canonical idempotency keys, not legacy chat row replacement
- drawer replies require a live, community-readable canonical `rootId`
- an optional `targetReplyId` is a typed canonical
  `communityInteractionReplies` id; it must belong to the same community and
  root and remain live and community-readable
- a root write carrying `targetReplyId`, or an invalid, hidden, deleted,
  cross-root, cross-community, missing, or wrong-table target, fails closed
- idempotent reply retries must preserve the originally requested canonical
  target; changing it under the same key is an idempotency conflict
- canonical projection reply targets without a canonical `rootId` fail closed instead of falling back to legacy sends
- idempotency keys use a composer namespace, not `legacy_chat_message:*`
- the bridge does not call public root/reply mutations
- the bridge may schedule async link-embed enrichment after creating pending embed records
- the bridge does not generate upload URLs, fetch URLs, scrape pages, process media, write source traces, or call the compiler synchronously; it schedules the idempotent derived-evidence sync

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
- interaction embed requests may opt into one additional bounded oEmbed fetch only when the source provider, discovered endpoint, final response endpoint after redirects, and returned player host/path are all on the explicit Loom, YouTube, or X allowlist
- ordinary resource/source ingestion does not opt into interaction oEmbed resolution and keeps its existing single-fetch behavior
- oEmbed contributes normalized fields only (`video`, `social_post`, or `link` plus bounded author, title, body, provenance, media, and approved player URL); raw provider HTML and scripts are never persisted or rendered
- content-specific oEmbed fields win over platform-level Open Graph marketing fields; unsupported providers and failed or malformed oEmbed responses fall back to the existing Open Graph link card
- known Loom and X marketing descriptions or artwork are suppressed when content-specific resolution is unavailable, leaving a compact non-promotional fallback instead of recreating the original ad-like card
- returned preview image URLs must pass the same shared community source URL policy or be omitted
- an X-styled `social_post` requires the broker, cloud, and browser to independently validate an exact HTTPS `x.com` or `twitter.com/{handle}/status/{numericId}` source and the same provider post id; any mismatch degrades to the generic link card
- X social metadata is a bounded snapshot containing only author identity, post text, post id, publication time, and optional `reply` or `quote` context; attached media, engagement metrics, action chrome, provider HTML, and provider JavaScript are excluded
- X post text and identity strip direction-control and C0 control characters at broker and cloud boundaries while preserving ordinary RTL text; the browser renders them with automatic direction and plaintext Unicode isolation
- X profile images are optional and must match the exact `pbs.twimg.com/profile_images/{numericId}/{bounded-image-name}` contract; the browser loads them only through the bounded same-origin `/api/x-avatar` proxy, which pins public DNS, rejects redirects and non-image MIME types, caps bytes/time, and sends `nosniff`
- fresh enrichment failures patch the embed to `failed`; they do not fail or mutate the canonical root/reply text
- one indexed, bounded, leased refresh queue owns missed pending work, resolver upgrades, scheduled freshness checks, and failed retries; there is no separate version-only refresh path
- enrichment applies only when the row still carries the lease value read by that worker, so a delayed older worker cannot overwrite a newer result
- successful preview resolution records `fetchedAt`, resets failures, and schedules the next verification after seven days
- transient refresh failures preserve an existing usable ready snapshot, leave its last successful `fetchedAt` unchanged, and retry with bounded exponential backoff; the browser labels snapshots older than the freshness interval
- explicit X source `401`, `403`, `404`, or `410` responses mark the embed unavailable, clear impersonable derived identity/body fields, and leave the canonical authored URL as the fallback
- redacted and unavailable embeds are never revived by the refresh queue
- renderers treat link blocks as derived preview metadata when canonical `markdown_text` already contains the URL; they must not append the URL a second time
- failed preview embeds render no fallback card when the canonical message text already preserves the clickable URL
- renderers show at most one rich preview per message; additional links remain visible in canonical message text
- a ready rich preview replaces its matching exact standalone URL line at that authored position; it must not move surrounding copy or remove the same URL when it appears inside prose
- previews without an exact ready standalone URL match retain the trailing position after canonical attachments, preserving pending, inline-link, workspace-reference, and attachment ordering
- exact consecutive standalone duplicates collapse at presentation time without mutating stored message text
- tracking-only URL differences are ignored for exact standalone replacement, while content-bearing parameters such as video start time remain significant
- approved video players are click-to-activate, sandboxed, and retain a direct provider link; the browser revalidates stored source, media, and player URLs before rendering; preview images send no referrer; social previews render normalized identity, provenance, and text without loading attached media or third-party widget JavaScript
- preview refresh batches clamp operator input to at most 100 rows, query the provider/status/next-refresh index, lease rows before scheduling, and run only internal work
- default dark and Polynet dark share one semantic chat-link treatment while their surface tokens continue to theme embed cards

Bounded chat formatting rules:

- human, community-agent, and personal-agent messages use the same deterministic presentation path in feed roots, selected thread roots, replies, and visitor previews
- the supported block grammar is paragraphs, deliberate line breaks, three compact heading levels, ordered and unordered lists with at most two nested levels, blockquotes, exact-line dividers, and fenced code
- the supported inline grammar is bold, italic, strikethrough, inline code, safe labeled links, bare web links, email links, phone links, and canonical mention chips
- labeled links fail closed to literal text unless their target is a valid HTTP, HTTPS, `mailto`, or normalized `tel` target; raw HTML is never interpreted
- tables, task lists, images, math, artifacts, and syntax highlighting remain outside the community-chat grammar
- direct messages retain their existing inline-only grammar and do not opt into this community-chat slice
- formatting and contact linking are derived presentation only; they do not mutate canonical message text, composer behavior, content blocks, mentions, or embed records
- fenced code protects matching standalone URL lines from in-flow embed replacement

## Retired Legacy Live Chat Surface

C3.2C removes the live legacy browser and public mutation surface. Historical
rows remain migration input; they do not require a live product API.

Rules:

- the browser has no legacy chat preload, data controller, realtime controller,
  viewport controller, message timeline, edit/delete/reaction actions, or
  fallback send branch
- the public community API does not expose legacy thread ensure/list,
  message create/edit/delete, or legacy reaction create/delete/list operations
- the community send controller always uses the canonical composer and fails
  closed when its writer or canonical reply root is unavailable
- canonical edit/delete/reaction operations remain the visible product actions
- canonical edits update canonical interaction content only; they do not mirror
  content into historical `communityChatMessages`
- authenticated typing presence and attachment upload URL generation remain
  because the canonical composer still uses them
- canonical root and reply reads load attachments only from
  `communityInteractionAttachments`; historical attachment payloads remain
  migration input but have no live read fallback
- the unconsumed ambient activity timeline, read API, browser gateway, and
  best-effort writers are deleted; its historical table remains reachable only
  through lifecycle policy until retention is decided
- no historical message, mapping, attachment, activity, or remaining lifecycle
  rows are deleted by the live-surface slice
- migration-only legacy planning/materialization helpers remain owned by the
  bounded backfill, not by a live dual-write path
- `communityInteractionLegacyChatLinks` access remains isolated in
  `communityInteractionLegacyBridge`

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
- already-linked historical messages are counted and skipped; they do not
  schedule evidence sync or retroactive cognition
- backfill write/materialization failures are not caught after writes begin
- backfill does not migrate reactions, edits, deletes, or moderation state
- backfill does not write source traces, archive truth, or compiler state synchronously; materialized interactions schedule idempotent derived-evidence sync and do not change UI behavior

## Canonical Interaction Evidence Spine

Canonical roots and replies are the only chat evidence identity used by memory retrieval and agents.

Published Resources use a parallel evidence boundary:

- `resource:<communityResourceId>` is the stable evidence reference; directory paths and `resources://` URIs are moveable location projections
- generic personal-agent, Concierge, and external-MCP tools expose only page rows in live modules, even when the caller is a community owner
- draft modules, source-inbox rows, ingestion state, and source linkage remain behind explicit builder tools
- resource search combines a bounded recent-source scan with the permissioned resource archive, then revalidates canonical visibility before returning every result
- retrieval logs record actor, surface, capability, and returned refs, but never copy the raw query
- published resources are community-authoritative and may name an accountable recorder, but do not infer human contribution credit
- the canonical live-resource memory lifecycle maintains both the archive projection and one versioned resource source trace; the retrieval-only evidence search module never creates a second trace
Attribution, episode, and profile-discoverability semantics are defined by
`docs/community-lineage-ontology-contract-v0.md`.

Rules:

- stable refs are `interaction:root:<id>` and `interaction:reply:<id>`
- recent chat retrieval reads `communityInteractionRoots` and `communityInteractionReplies`, never `communityChatMessages`
- `community_chat_search` returns bounded, authorized evidence summaries and stable refs
- `community_chat_read` reads one stable ref and rechecks community access, status, visibility, and root readability
- search/read return a deterministic lineage envelope containing actor, authority, credit, origin, root episode, reply target, and `source_only` profile projection
- current direct-human evidence credits the human; current community-agent evidence credits the agent; personal-agent evidence never infers human credit from user authority
- the interaction root is the conversation episode; replies point to their targeted reply when present and otherwise to the root
- personal-agent dock and community Concierge calls stay bound to the active community; external MCP calls select a community by slug and the server validates access
- every search/read appends a `communityEvidenceRetrievalLogs` row with actor, surface, capability, and returned refs
- every invoked live write-driven interaction sync creates or updates one exact source trace; related root and reply traces share an episode scheduling key without collapsing identity
- the recursive historical trace backfill is absent; canonical historical refs
  remain readable without becoming compiler-pending by migration side effect
- private, admin-only, hidden, deleted, missing, or parent-hidden evidence is excluded or redacted and fails closed at read time even if a derived index is stale
- interaction writes do not wait for compiler work; idempotent derived synchronization is scheduled after canonical mutation success
- legacy chat tables and links remain migration substrate for unrelated compatibility consumers, but they are no longer memory/evidence search authority

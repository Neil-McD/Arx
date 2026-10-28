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

### Delete Hard Delete As Normal Moderation

Normal deletion is a tombstone plus moderation event.

Hard purge is a separate privacy/legal operation with explicit policy. Product moderation should preserve provenance, reply continuity, and auditability.

### Delete Accidental Workspace Sharing

Pasted workspace content must not silently become shared community data.

Workspace embeds require explicit permissioned references. A preview can reveal only what the posting user is allowed to share and what the viewer is allowed to read.

### Delete Synchronous Unfurls

Community chat does not unfurl ordinary links. Workspace previews remain async
derived records.

The message send path must not block on external fetches, scraping, media
processing, or workspace preview generation.

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

### `communityChannels`

#### Channel authority foundation (staging, not private-room availability)

The storage schema now reserves `restricted` access, `managers` posting, and
`members | managers | disabled` reply policies. An omitted reply policy retains
the existing member-reply behavior. `communityChannelParticipants` stores one
active/revoked grant per channel/principal, indexed by that pair and by
community/principal/status. No public policy or participant mutation is exposed.

`communityChannelAccess.ts` owns effective read/post/reply/manage capabilities.
Interactive handlers authenticate the caller before resolving a channel actor;
actor resolution reuses the canonical community entitlement, blocking, and
builder-access checks. A channel grant cannot replace those checks. Owner/admin
oversight is explicit; moderator status alone grants no restricted-room access.
Personal agents and official MCP use their authenticated user's participation
identity, without channel-management authority. The community agent uses its
own `community_agent` principal: its sponsor grants neither room membership nor
manager authority. Duplicate grant rows fail closed rather than selecting one.

Channel lists expose effective capabilities. Canonical channel message reads,
posts, replies, direct-ID edits/deletes/reactions, and repository channel
resolution use the shared authority foundation. Community-agent finalization
revalidates the channel and permission before materializing a reply; a channel
that becomes unavailable terminates through the existing error receipt path.

Public creation still accepts only a name and creates an all-member channel.
Existing channel entry points still reject restricted rooms. Unscoped background
reads are explicitly shared-community reads: `listSharedCommunityChannels`
selects active `all_members` channels by index before the ten-channel limit;
`listSharedChannelReadableRows` reads those exact lanes before the message limit.
Restricted-room volume cannot crowd out shared messages. Shared announcement
rooms remain readable independently of who may post or reply. Reply aggregates
also validate the current root and matching room.

Recent context, public interaction counts, attention, evidence search and fresh
weekly digest snapshots use this shared scope. Canonical interaction evidence
resolves the live source room, not just a captured visibility flag. Compiler
measurement and settlement recheck that source; the existing pending-trace drain
now excludes both self-authored and no-longer-shared traces. A revoked digest
item is excluded without rolling back other valid decisions. No second queue,
memory store, or scheduler is introduced.

The policy/grant model is exercised with isolated
test fixtures only: schema support is NOT authorization to create restricted
rooms in staging or production. Do not relax this deployment boundary until
search, attachments, notifications, presence, digests, public projections,
agent context and shared memory have complete audience enforcement. Previously
captured digest email snapshots remain a separate gate. In particular,
directly inserting a restricted row is not a supported rollout.

#### Notification audience (staging foundation)

`communityNotificationAccess.ts` resolves the canonical live message/root,
source room, and current recipient together. It reuses community entitlement,
blocking, and channel capability authority. Mention/channel IDs are provenance,
not grants. Direct mention insertion validates recipients in the same mutation
as the message write; invalid targets roll back that write. Delayed `@everybody`
fanout checks each recipient, including existing overlapping direct mentions.
Inaccessible existing recipients are suppressed without stopping other work.
Attention ignores inaccessible sources using bounded recent mention windows.

Mention emails retain `sourceMentionId` plus existing community lifecycle and
recipient fields in `emailOutbox`. Queued jobs contain no copied message preview.
Source access, preferences, verified delivery address, read state, and community
lifecycle are checked at admission, claim, and immediately before provider
dispatch as applicable. Untraceable legacy mention jobs fail closed; unrelated
outbox templates retain their existing behavior. Delivery links use the source
channel route. Retries retain the same dedupe key; the first prepared body is
fingerprinted so changed content cannot reuse that key with a different body.
The fingerprint is not an authorization grant and contains no message text.

The existing mention ledger, outbox, broadcast pagination, cooldowns, preferences,
and provider receipts remain canonical. Mention `sent` still means notification
processing has settled, not proof of provider delivery; the outbox owns that
receipt. Suppression does not remove the member's underlying message.

Database authorization and an external provider send are not one transaction.
Revocation before the final dispatch check prevents delivery; a provider request
already dispatched cannot be recalled. No real email sends, scheduling activation,
private-room creation, or deployment are part of this foundation slice.

The current ten-channel cap, ordering, General backfill compatibility, and UI
remain unchanged. This slice does not implement private-room discovery,
participant management, room instructions, or workflow destination routing.

#### Attachment ownership (staging foundation)

New composer writes accept only `{ attachmentId }` references. Neither a raw
storage ID nor an inline data URL grants write authority. Uploads use the
authenticated `/runtime/community_attachment_upload` route; its storage upload
URL stays server-side. The route streams bounded bytes to storage, classifies
media from a bounded byte prefix, and finalizes against provider metadata.
Generic unknown files are opaque downloads, not trusted inline content. This
is format classification, not malware scanning or a full media decoder.

`communityInteractionAttachments` is the single attachment ledger. A pending
row binds uploader, community, channel, optional reply parent, and composer
message key. Current profile, community access, and channel posting/reply policy
are checked before upload, after upload, and when the composer atomically claims
the row for a root/reply. Idempotent sends reuse the canonical message and claim;
cross-member, cross-community, cross-channel, parent, or message-key reuse fails
closed. Uploaded bytes supply size, storage hash, and canonical media metadata.

Existing limits remain 8 files per message, 25 MiB per image, 50 MiB per media
file, and 5 MiB per generic file. An indexed cap allows at most 16 pending files
per uploader and 8 per composer key. Pending rows expire after 30 minutes using
one-shot scheduled cleanup, not a new cron. If storage has not returned when a
reservation expires or is cancelled, its row becomes unclaimable (`failed`) and
retains ownership until 30 minutes after its original expiry. One additional
scheduled cleanup bounds this retention; repeated cleanup does not reschedule.
The authenticated HTTP handler can reconcile its late storage response against
that retained reservation and remove the unclaimed blob. Cleanup removes only
unclaimed uploads; it cannot delete a claimed or historically shared blob, or
delete a caller-supplied blob without a matching reservation owner. A process loss
between provider upload completion and recording its returned storage ID can
still leave an untracked orphan; this slice does not claim transactional storage
and database writes or run a historical storage sweep.

The old thread chat and its ticketed upload route are deleted (POL-26). The
composer still accepts the old inline attachment shape from the cached
production web and refuses it with a reattach message; only uploaded attachment
ids are honored. Deleted attachment rows stay tombstones and are never listed.

Deployment must coordinate backend and web changes; stale raw-ID upload clients
must refresh rather than use an insecure compatibility shim. Local streaming
and fixture tests do not prove deployed-provider upload behavior. Verify a small
file, a large media upload, reply upload, and revoked access on the exact staging
deployment before accepting the live flow. The provider's general HTTP upload
guide and its limits reference differ about request size; the streaming route
avoids full-body buffering, but the large-upload staging gate remains explicit.
References: [HTTP upload guide](https://docs.convex.dev/file-storage/upload-files),
[runtime limits](https://docs.convex.dev/production/state/limits).

Read projections still resolve storage URLs. This slice protects attachment
ownership, not per-request download access or revocation of previously issued
URLs. Protected byte delivery remains a prerequisite for private-room rollout.
See [Convex storage security](https://docs.convex.dev/file-storage/overview).
Member-agent attachments, DMs, resources, and profile/branding storage are not
migrated here. Private-room creation and production releases remain disabled
for this work.

#### Composer recovery identity

Each new composer root/reply stores `composerPayloadHash`: a versioned SHA-256
fingerprint of normalized full text, canonical channel/root/reply destination,
ordered attachment claim IDs, and canonical committed mentions. The existing
idempotency key and actor identity locate the attempt; the fingerprint rejects
different payloads under that key. Editable/truncated summaries are not replay
authority. Current access checks still apply on every request.

Human, personal-agent, and community-agent sends share this contract. Historical
ordinary composer rows without a fingerprint fail closed on replay; no hash is
guessed from potentially edited history. The existing server-generated founder
welcome bootstrap retains its explicit once-per-community contract.

Before an optimistic attempt exists, failure restores the composer draft. After
it exists, failure marks that same attempt for retry, without also restoring a
competing draft. Retry retains the original key, destination, text, attachment
claims, and committed mentions. This is in-memory recovery, not a new durable
client queue; reloading the browser does not preserve unsent attempts. Local
regression tests are not a substitute for a response-loss staging browser canary.

#### Currently available shared-channel behavior

A channel is an addressable community interaction stream, not a second message
model. Public Channels V1 permits at most ten active channels per community,
including exactly one system-identified General channel:

- system role: `general`
- slug: `general`
- access: all current community members
- posting: current community members
- status: active

`systemRole=general` and `slug=general` are the canonical identity. The initial
display name is `General`, but presentation text is not database identity and
may change without moving interactions or breaking evidence lineage.

New communities receive General at creation. Existing communities remain
readable through a synthetic General selection until either a canonical write
creates the durable row or the bounded, manager-authorized migration applies
it. Read-only compatibility never mutates storage. A colliding `general` slug
or duplicate General system role fails closed.

Owners and entitled admins may create additional channels. Creation accepts a
display name only; the server normalizes the name, assigns a collision-safe
slug and stable position, enforces the ten-active-channel limit in the same
transaction, and stores the fixed `all_members`/`members` policy. Entitled
members may list every active channel. V1 has no per-channel ACL, invite,
visibility, posting-policy, tier, or role configuration.

Owners and entitled admins may rename or delete custom channels. Rename changes
only the display name; channel id, slug, position, access policy, and all
interaction lineage remain stable. Delete is a soft archive: the channel leaves
active navigation and all new read/write paths, releases one active-channel
slot, and retains its interaction, mention, broadcast, cursor, typing, evidence,
and memory lineage. Archive is idempotent so a lost mutation response is safe to
retry. General is immutable and cannot be renamed or archived.

Every community/public interaction root belongs to one channel and every reply
inherits its root's channel. Mention rows and `@everybody` broadcast ledgers
derive that same source channel so attention and recipient fanout never infer
channel identity by scanning interaction targets. Private member-agent dock
interactions are not channel activity and intentionally remain unchanneled. During rolling
migration only, a missing channel on a legacy community/public interaction is
read as General; that fallback ends after the backfill reaches zero drift.

The selected-channel checkpoint exposes list/create operations and makes the
canonical feed, composer, typing, unread, attention, evidence, and recent
community context channel-aware. An omitted channel from an older client
continues to mean General during rolling deployment. The web frontend lists
authorized channels, keeps General on the legacy-compatible `/chat` route, and
uses `/chat/:channelSlug` for an explicitly selected custom channel.

Public Channels V1 does not add an All aggregation, channel ACLs, private
channels, restore, permanent deletion, or policy settings. It does add two
manager-controlled channel presentation operations without creating a second
interaction substrate:

- Every active channel may point to at most one live root in that same channel.
  The channel owns the pointer; the root does not own pin state. Pin, replace,
  and unpin are owner/admin operations, write moderation evidence, and fail
  closed for foreign, hidden, deleted, non-channel, or wrong-channel roots.
  Tombstoning the root or archiving its channel clears the pointer and records
  the automatic unpin reason. Legacy unchanneled community/public roots may be
  pinned only through the temporary General migration lane.
- General remains fixed at position zero. An owner/admin may reorder the exact
  current set of active custom-channel ids; missing, duplicate, foreign, stale,
  archived, or General ids are rejected. The server writes contiguous custom
  positions beginning at one, and concurrent valid reorders resolve through
  the database transaction order rather than a second client-side authority.

The web projection reads a pinned root through the same canonical root bundle
and renders it with the chronological feed's canonical content primitives. The
pinned wrapper is a bounded teaser, not a second message renderer: it may clamp
long body text when needed to keep real attachments or YouTube media visible,
hide nested feed actions, and add one open-post action plus manager controls.
The teaser ends with a narrow chat-canvas-colored separation band rather than a
standard divider border.
The teaser itself is non-interactive and opens the authorized root-by-id thread;
reactions, links, attachments, and other message actions remain fully available
in that thread. Short text-only pins retain their natural height.

The public community funnel's messages-today metadata aggregates all active
all-member channels. It includes only live `community`/`public` rows plus the
temporary unchanneled General legacy lane. Private dock, admin-only,
hidden/deleted, and inactive-channel rows never contribute. An eventual All
surface is a virtual authorized aggregation, not a stored channel and not
duplicated interaction data.

### `interactionRoots`

Top-level community interaction.

Required properties:

- community id
- channel id for community/public roots
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
- channel id derived from the root
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

Workspace-preview compatibility records. Historical link-preview rows may remain
until the bounded data cleanup, but current interaction paths neither create nor
consume them.

### `interactionMentions`

Canonical mention records for people, personal agents, community agents, roles, and later groups.

Mentions drive notifications and access-sensitive rendering. They are not just markdown text.

### `interactionReactions`

Shared reaction model for roots and replies.

Reaction summaries may be denormalized onto roots/replies for feed speed, but the reaction event remains canonical.

### `interactionReadState`

Unread projection is derived from one member-and-channel stream position in
`communityReadCursors`. Each cursor binds to the explicitly selected active
channel. The position is a monotonic server-authorized
`seenThroughAt` watermark: the client may submit only the newest server-issued
interaction timestamp it actually rendered while caught up, and the server
clamps that request to the current readable head. Legacy
`communityMemberSettings.chatLastSeenAt` and `mentionsLastSeenAt` fields are
lazy-migration fallbacks only. Pre-channel cursor rows are upgraded in place to
General. There is no per-root follow, mute, or drawer-read state.

### Typing presence

Typing presence is an ephemeral server-issued lease, never durable message or
read state. Community chat keeps one channel-user row whose optional root
identifies the user's current typing scope. The selected-channel checkpoint
requires the explicit active channel while omission remains a General-only
rolling-compatibility adapter.
Channel and thread composers share one client renewal owner, one renewal
interval, and one active scope. Pre-channel leases remain readable only during
rolling migration and are upgraded in place when safely unique.

Every renewal is authenticated, reauthorized, server-timed, and bounded by the
canonical lease duration. Thread roots must be live, member-visible roots owned
by the selected community. Active read projections reauthorize candidate users,
use the `displayUntil` index, and disclose when their bounded count is capped.
A scope-aware clear may delete only the same scope it observed, so a delayed
channel clear cannot erase a newer thread signal. Explicit clear handles empty
inputs, blur, send, navigation, and scope changes; lease expiry remains the
crash-safe fallback. Reauthenticating the live subscription does not own scope
cleanup and therefore cannot erase an in-progress typing lease.

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
- Every readable interaction sync creates or updates one permissioned
  `communitySourceTraces` row keyed by its canonical evidence reference.
- Archive synchronization and source-trace projection are separate idempotent
  derived records. Neither one directly creates retained memory.
- Source traces must preserve actor, channel, visibility, evidence, and provenance.
- Directory truth is still created only through compiler and policy gates.

## Migration Rule

The legacy community chat implementation is a migration adapter, not the final substrate.

Migration order:

1. Add canonical interaction tables and read/write APIs.
2. Project existing chat messages into interaction roots/replies for compatibility.
3. Route web UI reads and writes through the canonical projection/composer.
4. Keep the legacy chat writer only for compatibility consumers and migration/backfill.
5. Move reactions, embeds, mentions, and moderation onto canonical tables; keep
   the community unread boundary in `communityMemberSettings`.
6. Delete legacy chat writes after parity. Done Oct 28, 2026 (POL-26).
7. Delete legacy chat reads after backfill and UI projection are stable. Done
   Oct 28, 2026 (POL-26); the old tables drop in the table-drop release.

No big-bang rewrite. No duplicated product truth.

The General-channel migration is independently bounded and inventory-first.
The additive schema, compatibility functions, and read-only internal audit are
deployed before any data mutation. The audit enumerates community ids and then
inspects one community and phase per call without returning message content.
The entrypoints are
`communityChannelAudit.listGeneralChannelAuditCommunitiesInternal` and
`communityChannelAudit.auditGeneralChannelMigrationBatchInternal`.
It reports General identity/slug collisions, missing or unexpected channel
assignments, source phase-order blockers, cursor/typing projection collisions,
and the number of evidence-sync jobs an apply would schedule. Existing active
custom-channel assignments are canonical, not migration drift. Every inventory
and migration batch is capped at 100 rows regardless of caller input.

Only a clean inventory may advance to the manager-authorized, dry-run-first
mutation. Each community is applied one phase at a time: roots, replies,
mentions, mention broadcasts, read cursors, then typing presence. Legacy
community/public roots acquire General; replies and notification projections
inherit their canonical source root channel. Private dock rows remain
unchanneled. Cursor or typing collisions —
including two legacy rows with the same semantic key — leave every collided
legacy row untouched instead of selecting a winner. Any invalid, projection
collision, or phase-order blocker stops that phase. Completion requires two
consecutive dry audits with `wouldUpdate=0` and `invalid=0` for every phase.
The preceding read-only inventory must also report `migration_blocked=false`
and `projection_collision_rows=0` before the corresponding mutation phase.

The active migration residue inventory lives in `docs/community-interaction-migration-residue-map.md`.
Anything touching legacy chat tables during the interaction migration must be classified there as
`KEEP TEMPORARILY`, `BLOCKED BY PARITY`, or `DELETE CANDIDATE`.

## Current Additive Schema Slice

The first backend slice adds canonical tables beside legacy chat:

- `communityChannels`
- `communityInteractionRoots`
- `communityInteractionReplies`
- `communityInteractionContentBlocks`
- `communityInteractionAttachments`
- `communityInteractionEmbeds`
- `communityInteractionMentions`
- `communityInteractionReactions`
- `communityInteractionModerationEvents`
- `communityReadCursors`

Channel identity is carried by interaction roots, replies, read cursors,
typing leases, and interaction source traces. It also participates in evidence
lineage hashes so moving evidence across channels cannot be silent.

Unread state has one canonical community-chat cursor rather than duplicate
screen-open events or per-root read rows. Interaction source traces use
canonical evidence references directly rather than a duplicate link ledger.

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
- new composer roots bind to the authenticated caller's explicit active channel; omission binds General for rolling compatibility
- composer replies inherit the root visibility and cannot broaden it
- composer replies inherit the root channel and cannot cross it
- every write requires `idempotencyKey`
- duplicate root writes return the existing root bundle only when actor, content, and channel still match
- duplicate reply writes return the existing reply bundle when the key belongs to the same root
- reply writes create a flat one-level drawer under the root
- `replyToMessageId` must resolve inside the same root and persists as the flat
  `targetReplyId` address/context pointer; it never creates nested persistence.
  The community-agent conversation contract may use that pointer as explicit
  direct-address evidence.
- composer text is normalized into typed canonical content blocks before storage
- link blocks store bounded canonical URLs without creating preview records
- user mentions are capped, deduped, resolved to existing users, and must pass community chat access
- community-agent mentions store the canonical `community_agent` key, but v0
  writes require the visible current-community-name token in the final text
- mention rows create canonical `communityInteractionMentions` bound to the
  source interaction channel; `@everybody` broadcast and recipient rows inherit
  that exact channel
- prepared upload claims bind canonical `communityInteractionAttachments`
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
- read bundles return canonical `communityInteractionAttachments` rows only
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
- the normal web chat UI does not mount legacy preload, realtime, or scroll-pagination lifecycles
- canonical interaction read bundles expose public actor user ids for UI identity/profile hydration
- top-level composer sends use the canonical composer bridge, including prepared attachments
- drawer reply sends use the canonical composer bridge when the reply target has a canonical root id, including prepared attachments
- a missing canonical writer fails closed instead of falling back to the legacy chat writer
- successful sends may request a canonical projection reload; canonical projection does not rely on any legacy chat client lifecycle
- stale interaction reads must not overwrite the projection after a community switch or reset
- General is the default navigation channel and continues to omit a channel id at the client boundary for rolling compatibility
- custom-channel URLs carry an authorized slug while server reads and writes carry the resolved channel id
- an unresolved or failed custom-channel slug never falls through to General; channel reads, writes, typing, and read acknowledgements remain disabled until resolution succeeds
- roots, pagination, subscriptions, optimistic sends, retries, selected drawer state, typing, unread dividers, and read acknowledgements share one community-and-channel boundary
- channel switching clears transient composer/reply state and cannot expose roots or pending sends from another channel
- only community managers see Add Channel; the dialog accepts one display name and the server remains authoritative for normalization, authorization, and the ten-channel limit
- every resolved member channel renders one canonical conversation header so the active scope remains explicit independently of sidebar or mobile-drawer state
- main-channel and drawer-reply composers share one canonical writing surface: desktop retains the raised editor and full utility row, while mobile collapses attachment, editor, dictation, and send into one compact row; mobile mention entry remains available through typed `@` autocomplete and emoji entry through the native keyboard rather than duplicate visible controls
- the visible mention control inserts at the current caret and opens the same authorized autocomplete used by typed `@`; reply candidates continue to exclude role broadcasts such as `@everybody`
- `+` opens the existing bounded attachment input directly; it is not a generalized add menu
- emoji insertion returns focus to the native textarea; supported formatting remains authored as canonical plain text through typed syntax and bounded keyboard behavior rather than a visible formatting toolbar
- Enter sends, Shift+Enter inserts a newline and continues an active list marker, and Tab or Shift+Tab changes indentation only while the selection contains a list item; mention autocomplete retains priority for Enter and Tab
- reply context, queued attachments, and emoji-picker visibility remain transient composer state; emoji state resets when the community, channel, or selected thread context changes
- message overflow menus open below triggers in the top half of the viewport and above triggers in the bottom half so edit, pin, and delete actions remain clear of the floating composer
- only community managers see the active-channel options trigger; custom-channel rename preserves the canonical slug and delete archives without deleting interaction history
- the sidebar owns channel selection and creation only; it does not duplicate edit or delete controls on channel rows
- General's options menu identifies it as the protected default channel without exposing rename or delete; both server mutations still reject General if called outside the UI
- archived channels are unavailable to active navigation and new reads/writes while remaining valid historical lineage for audit, backfill, evidence, and memory integrity
- an unavailable channel slug falls back to General after the authorized channel list resolves
- post-style and Slack-style presentation remain UI decisions over the same root/reply data

## Current Canonical Composer Bridge Slice

The staging clean-room composer slice uses `createCommunityInteractionComposerMessage` as the canonical chat writer.

Rules:

- composer writes create canonical roots/replies only
- composer writes must not create legacy `communityChatMessages`
- composer writes must not create `communityInteractionLegacyChatLinks`
- composer writes may include bounded, server-issued attachment claim IDs; metadata is loaded server-side
- composer attachment rows are claimed in `communityInteractionAttachments` in the same transaction as the message
- composer user mentions are limited to existing users who can access the target community chat
- composer community-agent mentions remain structural (`community_agent`) and
  fail closed unless the visible current-community-name token is present
- the mutation returns an empty legacy `rows` array; canonical projection completion depends on canonical mutation success and idempotency-key reconciliation
- pending canonical projection overlays reconcile by canonical idempotency keys, not legacy chat row replacement
- drawer replies require a canonical `rootId`; optional reply targets may resolve through canonical reply ids or pre-existing legacy links
- a supplied reply target must resolve to a live, channel-addressable reply in the same community, channel, and root; stale or invalid targets fail closed and never degrade into untargeted replies
- reply idempotency binds the resolved canonical target, so a retry cannot silently change who was addressed
- legacy root-message ids explicitly mean an untargeted reply under that root during rolling compatibility; new canonical root replies omit `replyToMessageId`
- canonical projection reply targets without a canonical `rootId` fail closed instead of falling back to legacy sends
- legacy timeline replies stay on `createThreadUserMessage`
- idempotency keys use a composer namespace, not `legacy_chat_message:*`
- the bridge does not call public root/reply mutations
- the bridge does not schedule link enrichment or create link-preview records
- the bridge does not generate upload URLs, fetch URLs, scrape pages, process media, write source traces, or call the compiler synchronously; it schedules the idempotent derived-evidence sync

## Current Link Presentation Slice

Authored interaction text is canonical. Link presentation does not fetch, persist,
refresh, or replace third-party metadata.

Rules:

- ordinary links render as authored blue links through the shared semantic chat-link token
- links remain visible, copyable, keyboard-focusable, and stable in optimistic and persisted messages
- generic websites, meeting links, extensionless document links, Descript, Loom, Vimeo, Wistia, and social posts do not create interaction preview cards
- typed `link` content blocks retain bounded canonical URL semantics without creating `communityInteractionEmbeds` rows
- YouTube videos and explicit HTTPS PDF links are the bounded URL-derived rich media exceptions in community chat
- up to 12 distinct YouTube videos and 12 distinct PDF URLs render in authored order beneath still-visible links; additional URLs remain links
- YouTube URL parsing accepts exact approved hosts and known video paths, rejects credentials and custom ports, and preserves validated start times
- URLs inside inline or fenced code never create media
- native YouTube iframes mount near the viewport without autoplay; YouTube owns titles, branding, and playback controls. Mounted players survive scrolling and ordinary rerenders
- players retain sandbox, referrer, fullscreen, and inline playback permissions, need at least 200 by 200 pixels, and do not depend on custom thumbnails, OpenGraph, oEmbed, or persisted preview state
- authored links remain available when a provider refuses playback; PDF cards share the lazy reader described in `message-media-reading-v1.md`
- uploaded images, video, audio, and files remain canonical attachments and do not share the URL-derived media path
- historical link embed rows are ignored by interaction and evidence read models pending a separate bounded data cleanup
- workspace-reference embed compatibility remains unchanged until its protected migration substrate receives an explicit census and decision
- the general source URL fetcher remains available for resource ingestion; community chat does not invoke an interaction-preview mode

Bounded chat formatting rules:

- human, community-agent, and personal-agent messages use the same deterministic presentation path in feed roots, selected thread roots, replies, and visitor previews
- the supported block grammar is paragraphs, deliberate line breaks, three compact heading levels, ordered and unordered lists with at most two nested levels, blockquotes, exact-line dividers, and fenced code
- the supported inline grammar is bold, italic, strikethrough, inline code, safe labeled links, bare web links, email links, phone links, and canonical mention chips
- labeled links fail closed to literal text unless their target is a valid HTTP, HTTPS, `mailto`, or normalized `tel` target; raw HTML is never interpreted
- tables, task lists, images, math, artifacts, and syntax highlighting remain outside the community-chat grammar
- direct messages retain their existing inline-only grammar and do not opt into this community-chat slice
- formatting and contact linking remain canonical plain text plus derived presentation: typed syntax and bounded keyboard behavior do not introduce HTML, alternate message storage, new content blocks, mention mutation, or embed records
- fenced code protects matching standalone URL lines from in-flow embed replacement

## Old Thread Chat (retired)

The old thread chat (`communityChat` writes, reads, reactions and uploads), its
dual-write adapter and the one-time backfill are deleted (POL-26). Production had
92 of 92 old messages backfilled and none carried attachments. Read bundles no
longer return `legacy_*` ids. `communityChat` keeps typing presence only. The old
tables leave the schema in the table-drop release.

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
- every readable interaction sync creates or updates one exact source trace; related root and reply traces share an episode scheduling key without collapsing identity
- private, admin-only, hidden, deleted, missing, or parent-hidden evidence is excluded or redacted and fails closed at read time even if a derived index is stale
- interaction writes do not wait for compiler work; idempotent derived synchronization is scheduled after canonical mutation success
- the retired legacy chat tables are not memory/evidence search authority

### Composer text visibility

Native textarea text is transparent only when its field contains a mention
highlight layer. Plain agent composers retain the theme text color, including
while disabled, so drafts remain visible without an overlay.

# Private channels V1

## Product contract

One channel model, one chat surface. Owners/admins create a channel with
`All community members` or `Invite-only`, then use the existing header's
Channel settings to rename it, change access, and add/remove existing members.
General is always shared and occupies one of ten shared-channel slots. V1 also
allows 100 active invite-only channels per community. Archived rooms use no slot.

## Directory capacity foundation

The web directory now subscribes to `listCommunityChannelPage`, with at most 50
stored rows per query. Shared rooms use the audience index; member private rooms
use that member's active-grant index, followed by canonical capability checks.
Managers page through restricted rooms directly. Other clients' private-room
volume does not consume a member's grant page. Empty filtered pages still carry
their continuation cursor; no private names or room totals are returned to an
unauthorized member.

The existing sidebar assembles reactive pages without a new UI. A changed page
invalidates all following pages before publication; errors clear the directory.
Selection and reorder wait for a complete directory, avoiding false not-found
decisions while later pages are loading. This is bounded per query, not a claim
that rendering every authorized room is constant-cost.

Capacity checks use the audience/status index, not a total-directory cap. Creation
and access-mode conversion share the same transactional check. General's slot is
reserved even before its legacy fallback is materialized. Concurrent requests
cannot overfill either audience. This is not automatic service-channel provisioning.

Exact room resolution by ID/slug and channel-scoped evidence search no longer
enumerate the community directory. Both use canonical room lineage and current
capabilities; supplying conflicting ID and slug fails closed. The broad community
agent repository remains shared-only even for an explicitly granted private room.
Automated fixtures verify these exact paths with 120 unrelated private rooms.
Creation and rename use an indexed normalized name; creation appends after the
indexed last position. Capacity scans stop at the selected audience's limit.
Mutations remain transactional, so concurrent names and append positions conflict
and retry rather than creating duplicates.

The existing drag UI sends one moved channel, its expected position, and its two
destination neighbors. The server validates current adjacency and changes only
that row. General stays at zero. Fractional positions avoid directory rewrites;
an exhausted numeric gap fails explicitly, without a hidden rebalance. Stale,
foreign, archived, or duplicate neighbors are rejected. The old full-array write
implementation is deleted; its cached-client endpoint only asks for a refresh.

Deployment prerequisite: run `communityChannels:backfillChannelNamesInternal`
with `paginationOpts` (cursor starts null, at most 100 rows), following returned
cursors until `isDone`. It is internal-only, idempotent, preserves names/content,
and rejects existing duplicate active names. Communities with missing normalized
names fail closed for creation/rename until backfilled. This slice targets only
`dev:quick-porcupine-949`; production migration is not authorized.

Directory, attention, and agent discovery now share the same authorized page
reader. Attention reads at most 10 stored rooms/grants per query; directory reads
at most 50. The existing synthetic General fallback may add one row. Members'
private pages scan only their own indexed grants. Permissions are rechecked on
every page. No new tables, counters, scheduled jobs, or read-cursor writes exist.

Web directory and attention share one reactive-page lifecycle. Changes invalidate
descendant pages before publication. Attention publishes a community only when
both shared and private sections finish; missing rows mean unknown, not all-read.
Errors discard old private results. Per-channel read acknowledgements are unchanged.
Total work remains proportional to authorized rooms; paging bounds each query,
not the number of subscriptions across a large account.

The canonical agent `/channels/` directory returns `next_cursor` and `truncated`.
Continue until the cursor is null, including when a filtered page is empty.
Cursor envelopes bind community, principal, actor kind, and membership activation.
Community-agent directory discovery stays shared-only. The old internal full-list
endpoint is deleted. Old public list/attention endpoints remain solely for
cached clients; above ten total active rooms they return an explicit refresh
error, never a truncated list or a false all-read result. Current web code does
not call them. Their legacy read bound is independent of product capacity.

Shared-context readers retain a deliberate ten-shared-room fanout. Private-room
growth does not consume that window. Slug collision attempts have their own bound.
The Add Channel dialog disables full audiences and defaults to invite-only when
shared capacity is full; settings report audience-specific conversion errors.

Next: automatic member-join service rooms, using these existing channel and
permission primitives. Increasing shared-room capacity is not part of this V1.

Invite-only rooms are visible to invited active members and community
owners/admins. Personal agents and external MCP inherit the authenticated
member's current access; the community agent requires its own explicit grant.
This is not a new DM, membership, identity, or agent system.

## Canonical authority

- `communityChannels` owns policy; `communityChannelParticipants` owns grants.
- One transactional indexed upsert per channel/principal prevents duplicates.
- Human grants bind to membership ID and activation sequence. Leaving or being
  removed invalidates access; rejoining requires a fresh invitation. Legacy
  unbound grants fail closed. Community-agent grants never borrow sponsor admin rights.
- The channel capability evaluator governs discovery, reads, posts, replies,
  reactions, pins, attention, typing, files, notifications, and agent sources.
- Direct IDs do not bypass channel checks. Archive and revocation fail closed;
  the live UI clears inaccessible cached roots, replies, and selected content.
- Changing audience requires expected current policy and explicit acknowledgement
  of history exposure. Previously downloaded content and formerly shared file
  links cannot be recalled by changing a channel's policy.

## Files

Private projections contain attachment metadata, never provider URLs, storage
IDs or inline bytes. The authenticated download route validates exact source
lineage and current access, fetches storage server-side, rechecks after the
provider wait, and streams bytes without redirect with `private, no-store`.
The UI uses temporary object URLs for selected media and downloads other files.
Revocation prevents new downloads; bytes already delivered cannot be recalled.

## Agent and workflow boundary

Private contributions use the same workflow receipt and idempotency path.
Stage movement follows verified action outcomes and the stage's goal/approval
policy; a private contribution alone does not move the member.
`prompt_agent` requires both the triggering member and community agent to retain
source access. Intake, context assembly, snapshot, every model step/tool call,
and final response check current authority and the current request attempt.

A private community-agent run receives its originating thread plus shared
community knowledge and answers only in that thread. Its generic write/call
tools are disabled to prevent private context becoming a public announcement or
shared-memory write. Community-wide cognition, compiler, summaries, and broad
community-agent retrieval remain shared-only. Personal/external agents can
explicitly read authorized private channel paths through the canonical executor.

## Acceptance / release boundary

Release only to `quick-porcupine-949` and Git `staging` / Vercel
`polynet-staging`. Never deploy this work directly to production.

Automated gates cover grants, leave/rejoin, current permission, exact IDs,
protected download races, private agent responses/revocation, deterministic
workflow replay, shared-consumer isolation, typechecks, and the existing UI
contract/build. Live acceptance must separately prove owner creation/settings,
invited member chat/reply/file use, uninvited denial, and revocation in Chrome.
Passing local tests or deploying does not by itself complete that last gate.

Not included: arbitrary agent registries, per-channel task stores, new workflow
triggers, per-channel knowledge ingestion, or public access without membership.

## Staging evidence — 2026-09-04

- Candidate `7c478db398620dea8d2543cbd8a7fdf830387fa0`; staging web
  `/version.json` returned that SHA and `environment: staging`.
- Convex deployed explicitly to `dev:quick-porcupine-949`; Vercel Git deployment
  `dpl_4kxo3tVgq53p2Jo55HDdF6X9NQ7W` reached READY for `polynet-staging`.
- All 934 Vitest tests (130 files), web/backend typechecks, UI contract proof,
  and web build passed. No production push or production backend deployment.
- Chrome, authenticated as Neil: created invite-only room, added `test` and the
  community agent, reopened persisted settings, then renamed the room to
  `Private channel QA` without changing its slug or losing thread content.
- Synthetic root `j97mspmbq965wdrf0jwrns1bv98dv6fj` and attachment
  `h57s3q086yp1rvb34dxxsypqs98dtqp7` were posted through the real composer.
  The authenticated Chrome download matched the 155-byte fixture exactly.
  An unauthenticated HTTP download returned 401.
- Agent request `kx7vvasfxr70qjds3131ra416n8dv4x0` reached `responded` with
  reply `j57nnksep8gz3y0w5wfmjz9s518dvcd4`; Chrome showed
  `Private room reply confirmed.` in the same private thread.
- Removing `test` in Chrome changed deployed download authorization and channel
  lookup from allowed to denied. Restoring its invitation restored access.
  These are live backend authorization checks, not an authenticated member UI
  session. Unscoped recent evidence did not include the private root or marker.
- No captured Chrome console errors during this acceptance pass.
- **Outstanding acceptance gate:** a real ordinary-member Chrome session must
  prove invited chat/replies/files and immediate UI clearing on revocation.
  The available session was Neil (owner). Do not label this gate passed.
- Canary retained at
  `https://polynet-staging.vercel.app/c/concierge-welcome-canary-2026-08-20-b/chat/private-channel-canary`.
  It contains only synthetic test messages/files. `test` and the community agent
  remain invited for the remaining acceptance run.

### Production migration preparation

Before production deployment, use the staged bridge sequence in
[attachment-compatibility-and-channel-migration-20260916.md](archive/attachment-compatibility-and-channel-migration-20260916.md).
`inspectChannelNamesInternal` is read-only and paginated; aggregate every page with
`scripts/channelNameMigrationPreflight.ts` before authorizing the backfill.
Installing the full candidate before backfill is not the migration bridge.

# Private channels V1

## Product contract

One channel model, one chat surface. Owners/admins create a channel with
`All community members` or `Invite-only`, then use the existing header's
Channel settings to rename it, change access, and add/remove existing members.
General is always shared. The existing ten-active-channel limit is unchanged.

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
`move_member` is deterministic and does not require a model or agent grant.
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

# Community agent conversation migration

## Target

One Agent entry above Resources opens a private conversation in the center panel.
The community supplies agent identity and instructions; the requesting member
does not inherit builder permissions. Workflow execution remains separately authorized.

## Slice 1: storage foundation (not UI or inference rollout)

- `threads.ensureCommunityAgentConversation` derives the owner from verified auth
  and rechecks active community access before resolving anything.
- Reuse memberAgentChannels -> memberAgentEpisodes -> threads. A new compound
  index resolves exactly (owner, community scope, community); creation occurs in
  one Convex transaction. No per-member agent configuration table is added.
- The reserved thread key binds community identity permanently. Context setters
  reject clearing or changing it. Generic thread creation cannot claim these keys.
- Owned thread/message readers recheck community access for the new conversations.
- Generic historical thread listing excludes new conversations; their scoped
  resolver is the entry point. No mixed-community history is copied or deleted.
- Runtime admission explicitly rejects these threads until identity/context and
  funding integration is verified. Creating an empty conversation spends nothing.
- Existing global dock remains unchanged during this foundational slice.

## Slice 2: conversation lifecycle

- `shared/communityConversationIdentity.ts` owns reserved-key construction and
  parsing. Reads validate the thread, episode ordinal, and member/community
  container relationship, not just the key text.
- `startNewCommunityAgentConversation` requires the expected active episode ID.
  Closing the old episode and creating its replacement is atomic. A stale or
  duplicate rollover returns `member_agent_active_episode_changed`; the caller
  should resolve the current conversation rather than blindly retrying.
- New writes to closed sessions are rejected. An exact existing-message retry
  can still return its existing receipt; it does not append another message.
- Both generic archive entry points reject active scoped sessions. Use new
  conversation to close them. Historical records remain intact.
- `listCommunityAgentConversations` reads the selected member/community index,
  newest first, with Convex pagination capped at 50 entries per page. It never
  adopts global or other-community history. Access is rechecked on every call.
- Local tests exercise concurrent creation/rollover, scoped paginated history,
  closed-session writes, archive guards, revoked membership and corrupted links.
  These are executable local tests, not a live concurrent staging proof.

## Next gate

Wire community identity/instructions and scoped context into canonical runtime
admission, verify community funding receipts and tool permissions, and support
attachments before replacing the dock. Retain the existing
execution substrate and approval UI. Migrate Resources' agent entry point too.

## Acceptance

Test member/community isolation, repeated resolution, immutable scope, revocation,
unauthenticated access, reserved-key creation and preservation of global history.
Local tests are not staging proof. No production deployment is authorized.

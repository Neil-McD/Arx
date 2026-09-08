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

## Next gate

Wire community identity/instructions and scoped context into canonical runtime
admission, verify community funding receipts and tool permissions, and support
episode rollover and attachments before replacing the dock. Retain the existing
execution substrate and approval UI. Migrate Resources' agent entry point too.

## Acceptance

Test member/community isolation, repeated resolution, immutable scope, revocation,
unauthenticated access, reserved-key creation and preservation of global history.
Local tests are not staging proof. No production deployment is authorized.

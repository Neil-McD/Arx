# Community agent conversation migration

## Target

One Agent entry above Knowledge opens a private conversation in the center panel.
The community supplies agent identity and instructions; the requesting member
does not inherit builder permissions. Workflow execution remains separately authorized.

## Current UI contract

Desktop uses the center-panel Agent page; mobile uses the existing Agent root.
There is no floating launcher or independent open/close state. Shell navigation
controls visibility. Desktop DMs overlay the mounted conversation without
discarding its draft; mobile DM and voice suppression remain unchanged.
There is no separate Resources navigation entry into Agent. Component names and
the internal `member_agent_dock` receipt label remain for compatibility, not as
an additional UI surface. Permissions, stored history, and funding are unchanged.
The slice notes below describe historical implementation checkpoints, not current
deployment status. Automated checks do not substitute for live visual acceptance.

## Slice 1: storage foundation (historical)

- `threads.ensureCommunityAgentConversation` derives the owner from verified auth
  and rechecks active community access before resolving anything.
- Reuse memberAgentChannels -> memberAgentEpisodes -> threads. A new compound
  index resolves exactly (owner, community scope, community); creation occurs in
  one Convex transaction. No per-community agent configuration table is added.
- The reserved thread key binds community identity permanently. Context setters
  reject clearing or changing it. Generic thread creation cannot claim these keys.
- Owned thread/message readers recheck community access for the new conversations.
- Generic historical thread listing excludes new conversations; their scoped
  resolver is the entry point. No mixed-community history is copied or deleted.
- Slice 1 initially blocked runtime admission; slice 3 below replaces that block.
  Creating an empty conversation spends nothing.
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

## Slice 3: existing runtime integration (historical)

- The persisted scoped thread is recognized by existing interactive runtime
  routing. `member_agent_dock` remains the internal invocation/funding receipt
  label during migration; no historical billing records or principal enums change.
- Only the server derives `community_conversation` after resolving the stored
  thread. Client context normalization discards that field. Scoped prompts describe
  the community agent, skip global personal-identity context, and retain existing
  community instructions and the requesting user's permission boundary.
- Canonical tool execution is mounted to the bound community. Root listing
  resolves to that community; platform paths and foreign community paths cannot
  be used to escape the mount. The delegated user principal is intentionally
  retained: switching to the autonomous community principal would change authority.
- Existing community inference admission, claims, provider-start checks and
  settlement remain the funding path. No model request was made for this slice.
- Existing attachment claims and provider-context attestation recognize scoped
  threads. Runtime history reads recheck active-session and membership authority.
- Rollover rejects running turns. Stop/finish the existing turn before starting a
  replacement session, preserving the destination for the final response.
- Tests cover scoped tool reads/denials, server-only context selection, runtime
  community binding and provider-context receipt compatibility. These checks do
  not establish live provider, billing settlement, or UI acceptance.

## Original acceptance gate

Prove a staged end-to-end turn, funding receipt and attachment path before release.
The center-panel Agent interface and Resources entry point are implemented locally
in slice 4; rendered acceptance and staging integration remain outstanding.

## Slice 4: Agent page candidate (historical)

- `/c/:slug/agent` is a member-accessible conversation destination above Resources.
  `/c/:slug/settings/agent` remains builder configuration; `/ai_agent` retains its
  historical settings redirect.
- The existing conversation component renders in the desktop center workspace,
  without its floating launcher. The mobile root uses the existing mobile agent
  presentation with the same community-scoped storage gateway.
- Resources opens the Agent destination using the existing composer handle.
  The conversation stays mounted across desktop tab changes so that a resource
  launch and an unsent draft are not discarded by navigation.
- Global channel selection and mutable lens switching are removed from this
  component. Shared runtime thread lookup accepts only already-created scoped
  threads; generic creation of reserved thread keys remains forbidden.
- Dock-specific CSS/component naming is retained until rendered acceptance,
  particularly for mobile and both themes. No new chat engine is introduced.
- Mac lock prevented rendered verification. This candidate needs layout,
  navigation, voice, attachment, Resources approval and live staging checks.

## Acceptance

Desktop Agent page visibility does not depend on the DM overlay being closed.
Opening DMs leaves its scoped conversation, draft, and runtime view mounted.
The mobile Agent surface still hides for DMs; voice input is cancelled
independently when DMs take focus. Auth, community, and onboarding gates remain.

Agent page layout reuses the channel header height, identity typography, surface,
and divider. A labeled icon button retains New conversation, with clearance for
the shell DM control. The page has no secondary header subtitle. It uses a shared 800px maximum conversation/
composer column. Empty and ongoing conversations both retain the bottom composer,
with slightly increased vertical padding. Pending proposals keep their normal
scrollable layout. Existing theme tokens and legacy mobile/dock presentation remain.

Recovered resource proposals use pending-only presentation: a server-confirmed
applied or rejected proposal disappears from the active recovery area. Historical
runtime cards retain their result; database receipts are unchanged. Pending,
unverified and failed proposals are not silently dismissed.

### Slice 4 follow-up: isolation and visibility fixes

- Conversation components are keyed by member and community, not navigation tab.
  Switching scope resets the mounted session; navigating within a community keeps
  drafts and Resources handoffs intact.
- Primary content and the Agent workspace share one visibility decision. When
  onboarding suppresses the Agent, its primary content host remains visible.
- The command-line contract proof recognizes community-scoped conversations and
  the server-selected runtime identity. Its native Node import is explicit.
- These are local fixes, not evidence of a deployment or rendered acceptance.
- Full release-gate review caught mobile Agent routing in composition-only
  `App.tsx`; routing synchronization now belongs to the existing mobile-shell
  controller and respects forced community navigation.

Test member/community isolation, repeated resolution, immutable scope, revocation,
unauthenticated access, reserved-key creation and preservation of global history.
Local tests are not staging proof. No production deployment is authorized.

# Community Chat Execution Plan v1

Status: active
Worktree: `/Users/neilmcdevitt/code/arx/.worktrees/daytona`
Scope: stabilize and harden community chat without changing the existing visual UI style

## 1) Product Rule

Community chat should be one excellent live room per community.

It is not:

1. a channel system
2. a DM system
3. a mixed human+agent room
4. a public-read / private-write hybrid
5. a second workspace surface

For this hardening cycle, the canonical rule is:

1. one canonical room per community
2. member-gated read/write access to the real room
3. human-authored messages only
4. optimistic local UX with truthful server-backed state
5. Convex-native live delivery
6. storage-backed attachments, not inline payload blobs

## 2) Non-Negotiable Constraints

1. Keep the current visual chat UI style.
2. Do not redesign `/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web/src/components/WebCommunityChatPanel.tsx`.
3. Do not redesign `/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/CommunityChatMessageRow.tsx`.
4. Backend and controller changes may alter behavior only where the current UI is misleading, inconsistent, or not live.
5. Do not add channels, DMs, or assistant/system room participants during this cycle.

## 3) Current Drift

There are seven meaningful drifts in the current implementation:

1. Access drift
   - Real chat access is entitlement-gated in `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/communityCore.ts`.
   - The UI can still fall into generic empty-state behavior instead of rendering a truthful join-required state.

2. Message contract drift
   - The composer allows attachment-only sends.
   - The backend currently rejects empty text.

3. Identity drift
   - The frontend message model currently overloads `community_id` with inconsistent meanings across optimistic and persisted rows.

4. Realtime drift
   - The current “realtime” lane is polling.
   - Typing broadcast is intentionally disabled.

5. Storage drift
   - Image attachments are currently shipped as inline `data_url` blobs.

6. Schema/runtime drift
   - The schema allows `assistant` and `system` roles in community chat.
   - The active UI path only renders `user` messages.

7. Scale drift
   - Some backend paths still scan too much data for delete and reaction hydration.

There is also one adjacent membership drift that must be treated as in-scope because chat and members share the same entitlement plane:

8. Members-plane drift
   - The members surface is a projection of `communityMemberships`, join requests, invites, and paid-plan state.
   - The current members UI carries plan/status-oriented affordances that are richer than the canonical admin membership row shape.
   - Chat hardening must not invent a separate access model from the members surface.

## 4) Canonical Contracts

### 0. Membership Plane Contract

Rule:

Community membership is the canonical entitlement substrate for the entire community surface.

That means:

1. chat access
2. resource access
3. members-page roster
4. invite acceptance
5. join-request approval
6. paid checkout redemption

must all converge on the same underlying membership truth.

Canonical truth:

1. `communityMemberships` is the durable entitlement row.
2. Community owners are entitled even when represented synthetically in manager-facing lists.
3. Join requests are not entitlement.
4. Invites are not entitlement.
5. Purchase claims are not entitlement.
6. Each of those paths becomes entitlement only when a membership row exists.

Known membership creation paths:

1. free/public join in `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/communityExperience.ts`
2. join-request approval in `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/communityAdmin.ts`
3. invite acceptance in `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/communityAdmin.ts`
4. paid-claim redemption in `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/billing.ts`

Implementation targets:

1. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/communityCore.ts`
2. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/communityExperience.ts`
3. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/communityAdmin.ts`
4. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/billing.ts`
5. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/useWebCommunityAccessController.ts`
6. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/useCommunityAdminController.ts`
7. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/useCommunityMembersReviewController.ts`

Required outcome:

1. Chat uses the same canonical entitlement rule as the members surface.
2. Members/admin views do not imply richer access semantics than chat actually enforces.
3. Role management, invite acceptance, request approval, free join, and paid join all produce one consistent membership truth.

### A. Access Contract

Rule:

1. The real community room is member-only.
2. Non-members do not load or render the real message log.
3. Owners/admins are members for chat purposes.
4. Public discovery is a separate surface and must not masquerade as the real room.

Implementation targets:

1. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/communityCore.ts`
2. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/useCommunityChatDataController.ts`
3. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web/src/controllers/useWebThreadDiscoverChatLifecycle.ts`
4. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web/src/App.tsx`

Required outcome:

1. Join-required is a first-class state.
2. Unauthorized chat fetches are not silently rendered as empty chat.
3. Access-state UI in chat must align with the same access-state logic used by the members surface.

### B. Room Contract

Rule:

1. Each community has exactly one canonical chat thread.
2. The app must never depend on “first matching thread” semantics.

Implementation targets:

1. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/communityChat.ts`
2. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/schema.ts`

Required outcome:

1. `ensureCommunityChatThread` remains the only creation path.
2. Duplicate-thread drift is detected and guarded against.
3. All read/write paths assume one canonical thread per community.

### C. Message Contract

Rule:

A valid community message must contain:

1. non-empty text, or
2. one or more attachments, or
3. both

And it may optionally include:

1. `replyToMessageId`

The room itself should be human-only for this cycle.

Implementation targets:

1. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/communityChat.ts`
2. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/schema.ts`
3. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/communityTypes.ts`
4. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/communityMessageParsing.ts`
5. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/useCommunityChatMutationController.ts`

Required outcome:

1. UI validation and backend validation match.
2. The frontend message type has separate `communityId` and `threadId`.
3. Community room messages are stored as `user` rows only.
4. Reply targets remain within the same thread.

### D. Delivery Contract

Rule:

1. Local optimistic send stays.
2. Server confirmation is authoritative.
3. Chat updates arrive through a true Convex live lane, not polling.
4. Typing and presence are ephemeral and separate from durable chat history.

Implementation targets:

1. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/useCommunityChatRealtime.ts`
2. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/useCommunityChatDataController.ts`
3. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/useCommunityChatMutationController.ts`
4. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web/src/App.tsx`

Required outcome:

1. Polling is removed from the canonical room path.
2. Pending, confirmed, and failed local message states are explicit in controller state.
3. Typing UI is either real or removed.

### E. Storage Contract

Rule:

1. Attachments are stored by reference.
2. Chat payloads must not contain large inline image bodies.
3. Preview metadata may be stored in message content; file payloads must not.

Implementation targets:

1. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/schema.ts`
2. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/communityChat.ts`
3. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/communityMessageParsing.ts`
4. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web/src/App.tsx`
5. attachment input and upload helpers currently used by community chat

Required outcome:

1. Messages store attachment refs plus metadata.
2. The existing attachment preview UI remains visually the same.
3. Upload failures produce explicit send failure state.

### F. Performance Contract

Rule:

1. Read paths must be page-based and index-backed.
2. Delete must not require scanning the entire room.
3. Reaction hydration must not degrade linearly with message count.

Implementation targets:

1. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/communityChat.ts`
2. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/schema.ts`

Required outcome:

1. The canonical view loads the latest page quickly.
2. Older-history pagination remains stable.
3. Reaction fetches are batched or aggregated.

### G. Members Projection Contract

Rule:

The members page is not a separate source of truth.

It is a projection over:

1. membership rows
2. owner identity
3. join-request state
4. invite state
5. pricing/plan state

Implementation targets:

1. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/communityAdmin.ts`
2. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/useCommunityAdminController.ts`
3. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/useCommunityMembersReviewController.ts`
4. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web/src/components/WebCommunityMembersSection.tsx`
5. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web/src/App.tsx`

Required outcome:

1. The members page shows data that the backend actually provides.
2. Plan filters and access badges are either fully backed by canonical member rows or removed as semantic assumptions.
3. Owner handling is consistent between chat access, member management, and roster display.
4. The members page remains visually unchanged while its data contract becomes truthful.

## 5) Required Schema Direction

Keep the table split:

1. `communityChatThreads`
2. `communityChatMessages`
3. `communityMessageReactions`

Keep community membership as its own canonical table:

4. `communityMemberships`
5. `communityJoinRequests`
6. `communityInvites`
7. `communityPlans`

Do not add new chat surface tables unless necessary.

Change direction:

1. Keep `threadId` as the real room identity.
2. Add a typed message content envelope instead of unconstrained `v.any()` semantics.
3. Store attachment references and metadata, not inline file/image bodies.
4. Keep sequence-based ordering as the canonical sort path.
5. Treat non-`user` chat roles as out of scope for the room during this cycle.
6. Do not create a second entitlement store for chat.

## 6) Frontend Scope

Allowed frontend changes:

1. truthful access states
2. truthful delivery states
3. true live subscriptions
4. attachment upload behavior changes
5. removal of dead or fake chat states

Not allowed in this cycle:

1. visual redesign
2. new community navigation
3. new chat layout
4. new channel architecture
5. new room concepts

## 7) Execution Phases

### Phase 1: Contract Correction

Goal: stop the UI and backend from disagreeing.

Tasks:

1. Make `join required` a first-class chat state.
2. Remove silent unauthorized empty-state fallback.
3. Align frontend/backend send validation for text-only, attachment-only, and mixed messages.
4. Replace overloaded `community_id` semantics with explicit `communityId` and `threadId` in shared message types.
5. Keep community room messages human-only and make that explicit in code.
6. Align chat access-state logic with the members/access plane.
7. Audit members UI assumptions against the actual admin member row contract.

Success criteria:

1. No attachment-only send mismatch remains.
2. No unauthorized real-room load renders as empty chat.
3. Optimistic and persisted message objects share one stable shape.
4. Members and chat derive entitlement from the same backend truth.

### Phase 2: Canonical Thread Hardening

Goal: one room means one room.

Tasks:

1. Harden `ensureCommunityChatThread` as the canonical room creator.
2. Add duplicate-thread detection and remediation rules.
3. Make all room read/write paths route through the canonical thread resolver.

Success criteria:

1. The room identity is deterministic for every community.
2. Retrieval and visible chat consume the same canonical room assumption.

### Phase 3: Live Convex Lane

Goal: replace polling with real live updates.

Tasks:

1. Replace the current polling loop in `/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/useCommunityChatRealtime.ts`.
2. Subscribe to the active room reactively through Convex-native data flow.
3. Preserve optimistic sends, but reconcile them against the live confirmed stream.
4. Remove or defer typing UI until presence is truly implemented.

Success criteria:

1. Polling is no longer the primary update mechanism.
2. New messages appear live.
3. Local pending messages reconcile cleanly when the server confirms them.

### Phase 4: Attachment Hardening

Goal: make media/file handling production-safe.

Tasks:

1. Move image/file payloads to storage-backed references.
2. Keep image preview support and file chips visually unchanged.
3. Preserve lightweight preview metadata for rendering.
4. Ensure failed upload and failed send are distinguishable.

Success criteria:

1. Chat payload size no longer scales with inline image bodies.
2. Existing composer and message-row visuals remain intact.

### Phase 5: Performance Hardening

Goal: keep the room fast as communities grow.

Tasks:

1. Remove delete paths that rescan the full room.
2. Batch or aggregate reaction hydration.
3. Keep latest-page reads and older-page reads strictly index-backed.

Success criteria:

1. Large rooms still open quickly.
2. Reaction loading does not become the dominant cost.

### Phase 6: Members/Admin Contract Hardening

Goal: make the members surface a truthful management projection over the same access model chat uses.

Tasks:

1. Decide whether member rows should be minimal roster rows or enriched plan/status rows.
2. If enriched rows are required, make the backend return those fields canonically.
3. If enriched rows are not required, remove the semantic assumptions from filters and badges while preserving the current visual shell.
4. Keep owner synthesis explicit and consistent across roster, permissions, and chat access.
5. Ensure join-request and invite flows refresh both the members roster and active access state deterministically.

Success criteria:

1. The members page does not depend on fields that are not canonically produced.
2. Chat access and members management cannot drift into contradictory entitlement behavior.

## 8) File-by-File Execution Order

Implement in this order:

1. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/communityTypes.ts`
2. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/communityMessageParsing.ts`
3. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/schema.ts`
4. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/communityCore.ts`
5. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/communityExperience.ts`
6. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/communityAdmin.ts`
7. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/billing.ts`
8. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/convex/communityChat.ts`
9. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/cloudCommunityChatGateway.ts`
10. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/useWebCommunityAccessController.ts`
11. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/useCommunityAdminController.ts`
12. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/useCommunityMembersReviewController.ts`
13. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/useCommunityChatDataController.ts`
14. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/useCommunityChatMutationController.ts`
15. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/useCommunityChatRealtime.ts`
16. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web/src/controllers/useWebThreadDiscoverChatLifecycle.ts`
17. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web/src/App.tsx`
18. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web/src/components/WebCommunityChatPanel.tsx`
19. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web/src/components/WebCommunityMembersSection.tsx`
20. `/Users/neilmcdevitt/code/arx/.worktrees/daytona/shared/CommunityChatMessageRow.tsx`

Reason:

1. shared contracts first
2. community entitlement truth second
3. chat truth third
4. gateway/controller wiring fourth
5. UI behavior correction last

## 9) Verification

After each material phase:

1. `npm run convex:codegen`
2. `npm run build` in `/Users/neilmcdevitt/code/arx/.worktrees/daytona/apps/web`

Add targeted checks for this work:

1. community chat contract guard
   - validates message shape
   - validates attachment-only send support
   - validates canonical room resolution
   - validates unauthorized room load behavior
2. live lane guard
   - ensures polling is not the canonical update path after the live lane lands

## 10) What Not To Do

Do not spend this cycle on:

1. channels
2. DMs
3. assistant/system chat participants
4. visual redesign
5. durable unread semantics across devices
6. speculative chat-feed unification

## 11) Recommended First Slice

The best first implementation slice is:

1. fix access-state truth
2. fix attachment-only send contract
3. fix message type semantics
4. align chat access with membership truth
5. audit members page field assumptions against canonical backend rows
6. remove fake typing state

That slice has the best leverage because it makes both chat and members truthful before live/subscription and storage work begin.

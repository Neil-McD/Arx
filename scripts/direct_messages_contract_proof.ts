import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const schema = read("convex/schema.ts");
const directMessages = read("convex/directMessages.ts");
const directMessageReadCore = read("convex/directMessageReadCore.ts");
const profileCore = read("convex/profileCore.ts");
const relationshipCore = read("convex/profileRelationshipCore.ts");
const communityChatGateway = read("shared/cloudCommunityChatGateway.ts");
const convexRealtimeAuth = read("shared/convexRealtimeAuth.ts");
const authSession = read("shared/authSession.ts");
const convexAuthenticatedClient = read("shared/convexAuthenticatedClient.ts");
const authSessions = read("convex/authSessions.ts");
const webAuthController = read("apps/web/src/controllers/useWebAppAuthController.ts");
const communityTypes = read("shared/communityTypes.ts");
const typingPresenceContract = read("shared/typingPresenceContract.ts");
const account = read("convex/account.ts");
const anonymousCleanup = read("convex/anonymousUserCleanup.ts");
const chatPanel = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const profilePanel = read("apps/web/src/components/WebCommunityProfilePanel.tsx");
const interactionFeed = read("apps/web/src/components/communityInteractionFeed.tsx");
const projection = read("apps/web/src/controllers/buildWebCommunitySurfaceProjection.ts");
const desktopHeader = read("apps/web/src/components/WebDesktopShellHeader.tsx");
const shellChromeShared = read("apps/web/src/components/webShellChromeShared.ts");
const shellChromeProps = read("apps/web/src/controllers/buildWebShellChromeHostProps.ts");
const indexCss = read("apps/web/src/index.css");
const app = read("apps/web/src/App.tsx");
const appCompositionRoot = read(
  "apps/web/src/components/WebAppCompositionRoot.tsx",
);
const css = [read("apps/web/src/base.css"), read("apps/web/src/styles/shell-and-onboarding.css"), read("apps/web/src/styles/community-and-content.css"), read("apps/web/src/styles/settings-runtime-and-theme-overrides.css")].join("\n");
const packageJson = read("package.json");
const dmCandidateHelper = directMessages.slice(
  directMessages.indexOf("async function listDirectMessageCandidateUserIdsForCommunity"),
  directMessages.indexOf("export const ensureDirectConversationFromCommunity"),
);
const dmEnsureUserParticipantHelper = directMessages.slice(
  directMessages.indexOf("async function ensureUserParticipant"),
  directMessages.indexOf("async function touchActiveConversationParticipantsActivity"),
);
const dmEnsureConversationMutation = directMessages.slice(
  directMessages.indexOf("export const ensureDirectConversationFromCommunity"),
  directMessages.indexOf("export const listNetworkPeopleForViewer"),
);
// Each Studio function is a thin wrapper over a helper that the private
// twin's Messages runs too; each slice is the helper and its wrapper.
const dmInboxQuery = directMessages.slice(
  directMessages.indexOf("export async function listMyDirectConversationsForUser"),
  directMessages.indexOf("export const listDirectMessagePeerPresenceForViewer"),
);
const dmListMessagesQuery = directMessages.slice(
  directMessages.indexOf("async function listDirectMessagesForUser"),
  directMessages.indexOf("async function sendDirectMessageForUser"),
);
const dmExistingConversationSendMutation = directMessages.slice(
  directMessages.indexOf("async function sendDirectMessageForUser"),
  directMessages.indexOf("async function sendDirectMessageToTargetForUser"),
);
const dmFirstSendMutation = directMessages.slice(
  directMessages.indexOf("async function sendDirectMessageToTargetForUser"),
  directMessages.indexOf("async function setDirectMessageBlockForUser"),
);
const dmSetTypingMutation = directMessages.slice(
  directMessages.indexOf("async function setDirectTypingForUser"),
  directMessages.indexOf("async function clearDirectTypingForUser"),
);
const dmClearTypingMutation = directMessages.slice(
  directMessages.indexOf("async function clearDirectTypingForUser"),
  directMessages.indexOf("async function listDirectTypingForUser"),
);
const dmListTypingQuery = directMessages.slice(
  directMessages.indexOf("async function listDirectTypingForUser"),
  directMessages.indexOf("async function listDirectMessagesForUser"),
);
const dmAppendMessageHelper = directMessages.slice(
  directMessages.indexOf("async function appendDirectMessageFromUser"),
  directMessages.indexOf("async function scheduleDirectMessageEmailNotification"),
);
const dmSendMutation = directMessages.slice(
  directMessages.indexOf("export const sendDirectMessage"),
);

assert.match(schema, /dmConversations: defineTable\(\{[\s\S]*kind: v\.literal\("direct"\)[\s\S]*canonicalKey: v\.string\(\)[\s\S]*createdFromCommunityId: v\.id\("communities"\)/, "DM conversations must be direct rooms created from community context");
assert.match(schema, /dmParticipants: defineTable\(\{[\s\S]*participantType: v\.union\(v\.literal\("user"\), v\.literal\("agent"\)\)/, "DM participants must support users and future agents");
assert.match(schema, /dmParticipants: defineTable\(\{[\s\S]*lastReadSeq: v\.number\(\)/, "DM participants must store per-user read position");
assert.match(schema, /dmParticipants: defineTable\(\{[\s\S]*lastActivityAt: v\.optional\(v\.number\(\)\)/, "DM participants must store optional inbox activity ordering");
assert.match(schema, /dmMessages: defineTable\(\{[\s\S]*conversationId: v\.id\("dmConversations"\)[\s\S]*senderType: v\.union\(v\.literal\("user"\), v\.literal\("agent"\), v\.literal\("system"\)\)/, "DM messages must be conversation-scoped and agent-native");
assert.doesNotMatch(schema, /dmAttachments:/, "first DM attachment slice must not introduce a separate attachment table");
assert.match(schema, /dmTypingPresence: defineTable\(\{[\s\S]*conversationId: v\.id\("dmConversations"\)[\s\S]*userId: v\.id\("users"\)[\s\S]*displayUntil: v\.number\(\)/, "DM typing presence must be conversation-scoped ephemeral presence");
assert.match(schema, /\.index\("by_canonicalKey", \["canonicalKey"\]\)/, "direct conversations must have a canonical pair key");
assert.match(schema, /\.index\("by_user_status", \["userId", "status"\]\)/, "participants must support a current-user inbox query");
assert.match(schema, /\.index\("by_user_status_lastActivityAt", \["userId", "status", "lastActivityAt"\]\)/, "participants must support bounded inbox activity ordering");
assert.match(schema, /\.index\("by_conversation_user", \["conversationId", "userId"\]\)[\s\S]*\.index\("by_conversation_displayUntil", \["conversationId", "displayUntil"\]\)/, "DM typing presence must support per-user upsert and bounded live queries");

assert.match(directMessages, /ensureDirectConversationFromCommunity = mutation/, "backend must expose community-context DM creation");
assert.match(directMessages, /targetUserId: v\.string\(\)/, "DM creation must target a public user id");
assert.match(directMessages, /resolveViewerDirectMessageRelationship/, "DM backend must reuse the canonical viewer relationship resolver");
assert.match(relationshipCore, /export async function resolveViewerDirectMessageRelationship/, "profile relationship core must expose a DM-specific relationship helper");
assert.match(relationshipCore, /resolvePreferredDirectMessageCommunity[\s\S]*requireCommunityChatAccess[\s\S]*userId: args\.viewerUserId[\s\S]*requireCommunityChatAccess[\s\S]*userId: args\.targetUserId/, "DM relationship helper must fast-path a valid preferred community");
assert.match(directMessages, /async function requireDirectMessageRelationshipAccess/, "DM backend must centralize shared-community relationship authorization");
assert.match(directMessages, /requiredCommunityId\?: any \| null/, "DM creation must be able to require a specific source community for new rooms");
assert.match(directMessages, /requiredCommunityId: isNewConversation \? args\.communityId : null/, "new DM rooms must require the requested community while existing rooms can reopen through any current mutual community");
assert.match(directMessages, /throw new Error\("dm_target_self"\)/, "users must not open self-DMs");
assert.doesNotMatch(directMessages, /requireProfileSetupCompleteForUser|accountSetupCore/, "DM authorization must stay independent of public-profile completion");
assert.match(dmEnsureConversationMutation, /requireDirectMessageRelationshipAccess/, "DM opens must retain current shared-community relationship access");
assert.match(directMessages, /listMyDirectConversations = query/, "backend must expose current-user DM inbox query even if UI inbox is deferred");
assert.doesNotMatch(directMessages, /listEligibleDirectMessageRecipients = query/, "backend must not keep the deleted community-scoped recipient lookup");
assert.doesNotMatch(directMessages, /listEligibleDirectMessageRecipientsForViewer = query/, "backend must not keep the deleted eager global recipient lookup");
assert.match(directMessages, /listNetworkPeopleForViewer = query/, "backend must expose viewer-wide network people for the global inbox");
assert.match(directMessages, /listDirectMessageSourceCommunitiesForViewer/, "network people lookup must compile the viewer's communities");
assert.match(schema, /\.index\("by_owner_createdAt", \["ownerId", "createdAt"\]\)/, "communities must support bounded recent owner-community discovery");
assert.match(schema, /\.index\("by_user_createdAt", \["userId", "createdAt"\]\)/, "community memberships must support bounded recent viewer-community discovery");
assert.match(schema, /\.index\("by_normalizedHandle", \["normalizedHandle"\]\)/, "users must support exact normalized-handle recipient lookup");
assert.match(directMessages, /withIndex\("by_owner_createdAt"[\s\S]*ownerId/, "viewer-wide DM recipient lookup must include recent communities the viewer owns");
assert.match(directMessages, /withIndex\("by_user_createdAt"[\s\S]*userId/, "viewer-wide DM recipient lookup must include recent communities the viewer belongs to");
assert.match(directMessages, /findUserByNormalizedHandle[\s\S]*getUniqueUserByNormalizedHandle/, "viewer-wide DM recipient lookup must delegate exact-handle resolution to the canonical helper");
assert.match(profileCore, /getUniqueUserByNormalizedHandle[\s\S]*withIndex\("by_normalizedHandle"[\s\S]*normalizedHandle/, "canonical exact-handle lookup must use the normalized-handle index");
assert.match(directMessages, /exactHandleUser[\s\S]*mapEligibleDirectMessageRecipient\(\{[\s\S]*community,[\s\S]*viewerUserId,[\s\S]*userId: exactHandleUser\._id,[\s\S]*search/, "exact-handle DM recipient result must still pass shared-community recipient mapping and access checks");
assert.match(directMessages, /MAX_DM_GLOBAL_OWNED_COMMUNITY_ROWS/, "viewer-wide DM source discovery must bound owned-community reads");
assert.match(directMessages, /MAX_DM_GLOBAL_SOURCE_MEMBERSHIP_ROWS/, "viewer-wide DM source discovery must bound viewer-membership reads");
assert.match(directMessages, /listDirectMessageSourceCommunitiesForViewer[\s\S]*\.take\(MAX_DM_GLOBAL_OWNED_COMMUNITY_ROWS\)[\s\S]*\.take\(MAX_DM_GLOBAL_SOURCE_MEMBERSHIP_ROWS\)/, "viewer-wide DM source discovery must use bounded indexed reads");
assert.doesNotMatch(directMessages, /listDirectMessageSourceCommunitiesForViewer[\s\S]*?\.collect\(\)[\s\S]*?async function listDirectMessageCandidateUserIdsForCommunity/, "viewer-wide DM source discovery must not collect all owned or joined communities");
assert.match(directMessages, /listDirectMessageCandidateUserIdsForCommunity/, "viewer-wide DM recipient lookup must gather owners and members from each source community");
assert.match(directMessages, /MAX_DM_GLOBAL_SOURCE_COMMUNITIES/, "viewer-wide DM recipient lookup must bound source-community fanout");
assert.match(directMessages, /MAX_DM_GLOBAL_RECIPIENT_MEMBERSHIP_ROWS/, "viewer-wide DM recipient lookup must bound per-community membership reads");
assert.match(dmCandidateHelper, /\.take\(Math\.min\(maxUserIds, MAX_DM_GLOBAL_RECIPIENT_MEMBERSHIP_ROWS\)\)/, "viewer-wide DM recipient lookup must use one bounded indexed membership read per source community");
assert.doesNotMatch(dmCandidateHelper, /\.paginate\(/, "viewer-wide DM recipient lookup must not run paginated queries inside the global picker helper");
assert.doesNotMatch(dmCandidateHelper, /\.collect\(\)/, "viewer-wide DM recipient lookup must not collect every member in a source community");
assert.doesNotMatch(directMessages, /paginationOptsValidator/, "DM backend must not keep pagination machinery for the deleted community-scoped recipient API");
assert.doesNotMatch(directMessages, /\.paginate\(/, "DM backend must not keep the deleted paginated community-scoped recipient lookup");
assert.doesNotMatch(directMessages, /MAX_DM_RECIPIENT_SCAN_ROWS/, "DM recipient lookup must not hide members behind a fixed scan cap");
assert.doesNotMatch(directMessages, /MAX_DM_RECIPIENT_SEARCH_PAGE_ROWS|MAX_DM_RECIPIENT_SEARCH_PAGES|pagesScanned/, "DM backend must not keep deleted community-scoped search paging constants");
assert.match(directMessages, /communityMembershipRowIsActive/, "DM recipient lookup must use active community memberships");
assert.match(directMessages, /userKey === viewerUserKey/, "network people lookup must exclude the viewer");
assert.match(directMessages, /requireCommunityChatAccess\(\{[\s\S]*communityId: args\.community\._id,[\s\S]*userId: args\.userId/, "global DM recipient lookup must verify recipient community access");
assert.match(directMessages, /existing_conversation_id/, "network people lookup must surface existing canonical conversation ids");
assert.doesNotMatch(directMessages, /continueCursor|isDone: rawPage\.isDone/, "DM backend must not expose cursor metadata for the deleted community-scoped recipient lookup");
assert.match(directMessages, /viewer_last_read_seq/, "conversation projection must expose the viewer read cursor");
assert.match(directMessages, /unread_count/, "conversation projection must expose unread count");
assert.match(directMessages, /has_unread/, "conversation projection must expose unread state");
assert.match(directMessages, /MAX_DM_PREVIEW_CHARS/, "conversation projection must keep inbox previews bounded");
assert.match(directMessages, /readDirectMessageTextPreview/, "conversation projection must extract a safe latest-message preview");
assert.match(directMessages, /lastSeq > 0[\s\S]*query\("dmMessages" as any\)[\s\S]*withIndex\("by_conversation_seq"[\s\S]*eq\("conversationId", row\._id\)\.eq\("seq", lastSeq\)/, "conversation projection must read the latest message by conversation and sequence");
assert.match(directMessages, /last_message_preview: \(\(\) => \{[\s\S]*readDirectMessageTextPreview\(lastMessage\.contentJson\)[\s\S]*`You: \$\{preview\}`/, "conversation projection must expose the latest text preview and identify viewer sends");
assert.match(communityTypes, /last_message_preview: string \| null/, "shared DM conversation type must expose the latest text preview");
assert.match(communityTypes, /export type DirectMessageAttachment/, "shared DM types must expose the DM attachment shape");
assert.match(communityTypes, /export type DirectMessageTypingPresenceUser/, "shared DM types must expose typing presence users");
assert.match(communityTypes, /export type DirectMessageTypingPresenceBundle/, "shared DM types must expose typing presence bundles");
assert.match(dmEnsureUserParticipantHelper, /touchActivity: boolean/, "participant ensure helper must distinguish creation/send activity from open-only access");
assert.match(dmEnsureUserParticipantHelper, /fallbackActivityAt\?: number/, "participant ensure helper must support historical activity initialization");
assert.match(dmEnsureUserParticipantHelper, /if \(args\.touchActivity\) \{[\s\S]*patch\.lastActivityAt = args\.nowMs[\s\S]*fallbackActivityAt/, "participant ensure helper must only bump existing activity when explicitly requested");
assert.doesNotMatch(dmEnsureUserParticipantHelper, /if \(existing\) \{[\s\S]*lastActivityAt: args\.nowMs[\s\S]*return;/, "opening an existing DM must not blindly bump participant activity to now");
assert.match(dmEnsureConversationMutation, /const isNewConversation = !conversation/, "DM creation must track whether the canonical room is new");
assert.match(dmEnsureConversationMutation, /const participantFallbackActivityAt = isNewConversation \? nowMs : conversation\.updatedAt/, "existing DM opens must use historical conversation activity as fallback");
assert.match(dmEnsureConversationMutation, /ensureUserParticipant\(\{[\s\S]*touchActivity: isNewConversation,[\s\S]*fallbackActivityAt: participantFallbackActivityAt[\s\S]*ensureUserParticipant\(\{[\s\S]*touchActivity: isNewConversation,[\s\S]*fallbackActivityAt: participantFallbackActivityAt/, "DM creation must only touch participant activity for newly created conversations");
assert.match(dmInboxQuery, /withIndex\("by_user_status_lastActivityAt"[\s\S]*userId[\s\S]*status/, "inbox query must use the bounded participant activity index");
assert.match(dmInboxQuery, /\.order\("desc"\)[\s\S]*\.take\(safeLimit\)/, "inbox query must read only the visible participant window");
assert.doesNotMatch(dmInboxQuery, /\.collect\(\)/, "inbox query must not collect every participant row for a user");
assert.match(directMessages, /async function touchActiveConversationParticipantsActivity/, "DM writes must have a helper for participant inbox activity");
assert.match(directMessages, /touchActiveConversationParticipantsActivity[\s\S]*lastActivityAt: args\.nowMs/, "participant activity helper must update lastActivityAt");
assert.match(directMessages, /markDirectConversationRead = mutation/, "backend must expose an authoritative read mutation");
assert.match(directMessages, /throughSeq: v\.optional\(v\.number\(\)\)/, "read mutation must accept the exact visible sequence while older deployed clients roll forward");
assert.match(directMessages, /typeof args\.throughSeq === "undefined" \? lastSeq : args\.throughSeq/, "read mutation must reserve mark-current-head behavior for old clients that omit throughSeq");
assert.match(directMessages, /nextDirectMessageReadSeq\([\s\S]*currentLastReadSeq,[\s\S]*requestedThroughSeq,[\s\S]*lastSeq/, "read mutation must advance from the requested visible sequence against the readable server head");
assert.match(directMessages, /ctx\.db\.patch\(participant\._id,[\s\S]*lastReadSeq: nextLastReadSeq/, "read mutation must persist only the resolved monotonic cursor");
assert.match(directMessages, /touchActiveConversationParticipantsActivity[\s\S]*nextDirectMessageReadSeq\([\s\S]*currentLastReadSeq,[\s\S]*senderLastReadSeq,[\s\S]*senderLastReadSeq/, "sender auto-read must use the same monotonic cursor contract");
assert.match(directMessageReadCore, /return Math\.min\(requested, latest\)/, "DM read cursor requests must clamp to the current readable server head");
assert.match(directMessageReadCore, /return Math\.max\([\s\S]*normalizeDirectMessageReadSeq\(currentThroughSeq\),[\s\S]*clampDirectMessageReadSeq\(requestedThroughSeq, latestReadableSeq\)/, "DM read cursor settlement must never regress");
assert.match(directMessages, /Active participants can read existing DM history; current relationship is rechecked before each send\./, "DM read/send policy must be explicit");
assert.match(dmListMessagesQuery, /requireActiveUserParticipant/, "DM history reads must require active conversation participation");
assert.doesNotMatch(dmListMessagesQuery, /requireDirectConversationSendAccess|requireDirectMessageRelationshipAccess/, "DM history reads must not require current mutual access once someone is an active participant");
assert.match(directMessages, /setDirectTyping = mutation/, "backend must expose a DM typing heartbeat mutation");
assert.match(directMessages, /clearDirectTyping = mutation/, "backend must expose a DM typing clear mutation");
assert.match(directMessages, /listDirectTyping = query/, "backend must expose a live DM typing query");
assert.match(dmSetTypingMutation, /requireActiveUserParticipant/, "typing writes must require active conversation participation");
assert.doesNotMatch(dmSetTypingMutation, /requireProfileSetupCompleteForUser|profile_setup_required/, "typing writes must not depend on public-profile completion");
assert.match(dmSetTypingMutation, /requireDirectConversationSendAccess/, "typing writes must require current DM send access");
assert.match(dmSetTypingMutation, /TYPING_PRESENCE_LEASE_DURATION_MS/, "typing writes must use the canonical bounded display TTL");
assert.match(dmSetTypingMutation, /query\("dmTypingPresence" as any\)[\s\S]*withIndex\("by_conversation_user"/, "typing writes must upsert by conversation and user");
assert.match(dmClearTypingMutation, /requireActiveUserParticipant/, "typing clears must require active conversation participation");
assert.doesNotMatch(dmClearTypingMutation, /requireDirectConversationSendAccess|requireProfileSetupCompleteForUser|requireDirectMessageRelationshipAccess/, "typing clears must not require current send access");
assert.match(dmClearTypingMutation, /query\("dmTypingPresence" as any\)[\s\S]*withIndex\("by_conversation_user"/, "typing clears must target the viewer row by conversation and user");
assert.match(dmClearTypingMutation, /ctx\.db\.delete\(existing\._id\)/, "typing clears must delete only the viewer's active row");
assert.match(dmListTypingQuery, /requireActiveUserParticipant/, "typing reads must require active conversation participation");
assert.doesNotMatch(dmListTypingQuery, /requireDirectConversationSendAccess\(\{[\s\S]*viewerUserId/, "typing reads must not require current send access from the viewer");
assert.match(dmListTypingQuery, /withIndex\("by_conversation_displayUntil"[\s\S]*gt\("displayUntil", nowMs\)/, "typing reads must query only non-expired rows through the displayUntil index");
assert.match(dmListTypingQuery, /normalizeIdValue\(row\.userId\) !== normalizeIdValue\(viewerUserId\)/, "typing reads must exclude the viewer");
assert.match(dmListTypingQuery, /DIRECT_MESSAGE_TYPING_PRESENCE_SCAN_LIMIT/, "typing reads must stay bounded");
assert.match(directMessages, /directTypingCandidateRemainsAuthorized[\s\S]*requireDirectConversationSendAccess/, "typing candidates must retain current relationship and send access before projection");
assert.match(dmListTypingQuery, /directTypingCandidateRemainsAuthorized[\s\S]*authorizedRows[\s\S]*mapDirectTypingPresence/, "typing reads must project only reauthorized candidates");
assert.match(
  account,
  /ACCOUNT_DELETION_QUARANTINE_CODE[\s\S]*account_delete_lifecycle_migration_blocked[\s\S]*throw new ConvexError/,
  "account deletion must remain quarantined until its full cross-domain cleanup contract is restored",
);
assert.match(anonymousCleanup, /dmTypingPresence/, "anonymous cleanup must include DM typing presence rows");
assert.match(directMessages, /sendDirectMessage = mutation/, "backend must expose direct message sending");
assert.match(directMessages, /sendDirectMessageToUser = mutation/, "backend must support a first send without eagerly creating an empty conversation");
assert.match(dmExistingConversationSendMutation, /requireActiveUserParticipant[\s\S]*requireDirectConversationSendAccess/, "existing-conversation sends must require active participation and current relationship access");
assert.doesNotMatch(dmExistingConversationSendMutation, /requireProfileSetupCompleteForUser|profile_setup_required/, "existing-conversation sends must not depend on public-profile completion");
assert.match(dmFirstSendMutation, /requireDirectMessageRelationshipAccess/, "first sends must require current shared-community relationship access");
assert.doesNotMatch(dmFirstSendMutation, /requireProfileSetupCompleteForUser|profile_setup_required/, "first sends must not depend on public-profile completion");
assert.match(directMessages, /async function requireDirectConversationSendAccess/, "DM sends must have a continuous access guard");
assert.match(directMessages, /requireDirectConversationSendAccess[\s\S]*throw new Error\("dm_conversation_access_required"\)/, "DM send access guard must fail closed with a named policy error");
assert.match(directMessages, /requireDirectConversationSendAccess[\s\S]*listConversationParticipants[\s\S]*participantType === "user"[\s\S]*peerParticipants\.length !== 1/, "DM send access guard must require exactly one active human peer");
assert.match(directMessages, /requireDirectConversationSendAccess[\s\S]*requireDirectMessageRelationshipAccess\(\{[\s\S]*targetUserId: peerUserId,[\s\S]*preferredCommunityId: args\.conversation\.createdFromCommunityId/, "DM send access guard must prefer the original community while allowing any current mutual community");
assert.doesNotMatch(directMessages, /requireDirectConversationSendAccess[\s\S]*requiredCommunityId: args\.conversation\.createdFromCommunityId/, "DM sends must not treat createdFromCommunityId as the only permanent authorization source");
assert.match(dmExistingConversationSendMutation, /requireDirectConversationSendAccess\(\{[\s\S]*conversation,[\s\S]*viewerUserId[\s\S]*appendDirectMessageFromUser/, "send mutation must enforce continuous shared-community access before appending");
assert.match(dmExistingConversationSendMutation, /export const sendDirectMessage = mutation[\s\S]*sendDirectMessageForUser\(ctx, viewerUserId/, "Studio's send must run the shared send helper");
assert.match(dmSendMutation, /attachments: v\.optional\(v\.array\(v\.any\(\)\)\)/, "send mutation must accept bounded attachment metadata");
assert.match(dmAppendMessageHelper, /dm_message_payload_required/, "shared send append must allow attachment-only messages but reject empty payloads");
assert.doesNotMatch(directMessages, /data_url/, "DM backend must not store raw attachment data URLs");
assert.match(dmAppendMessageHelper, /touchActiveConversationParticipantsActivity\(\{[\s\S]*nowMs,[\s\S]*senderParticipantId: args\.senderParticipantId,[\s\S]*senderLastReadSeq: seq/, "shared send append must update participant inbox activity and mark the sender read through their own message");
assert.doesNotMatch(directMessages, /follow|follower|following/i, "first DM slice must not introduce follow graph semantics");

assert.doesNotMatch(communityTypes, /DirectMessageRecipientPage/, "shared community types must not expose deleted recipient pagination metadata");
assert.match(authSession, /function resolveConvexRuntimeToken[\s\S]*access_token[\s\S]*id_token/, "Convex runtime auth must prefer the rotating access token over the ID-token fallback");
assert.match(convexAuthenticatedClient, /resolveConvexRuntimeToken[\s\S]*client\.setAuth\(runtimeToken\)/, "one-shot Convex requests must use the rotating runtime token");
assert.match(communityChatGateway, /acquireAuthenticatedConvexRealtimeClient/, "community subscriptions must lease the same refresh-aware realtime transport");
assert.doesNotMatch(communityChatGateway, /createAuthenticatedConvexRealtimeClient/, "community gateway must not construct a domain-local realtime transport");
assert.doesNotMatch(communityChatGateway, /\.setAuth\(/, "community gateway must not implement a second raw auth callback");
assert.match(convexRealtimeAuth, /forceRefreshToken[\s\S]*forceRefresh: true/, "realtime auth must honor the Convex SDK's forced token refresh signal");
assert.match(convexRealtimeAuth, /initialAuthTokenReuse: true/, "realtime auth must avoid redundant refreshes immediately after a cached token is accepted");
assert.match(convexRealtimeAuth, /REAUTH_RETRY_DELAYS_MS[\s\S]*applyAuth\(\)/, "realtime auth must retry transient refresh failures while a local session remains");
assert.match(webAuthController, /options\?\.forceRefresh[\s\S]*refreshAuthSessionLockedResult\(\)/, "forced realtime refreshes must reuse the app's central refresh lock");
assert.doesNotMatch(authSessions, /\["id_token", "idToken"\]\) \?\? options\.fallback\?\.idToken/, "refresh normalization must not preserve a stale ID token when the provider omits it");
assert.match(
  typingPresenceContract,
  /TYPING_PRESENCE_RENEW_INTERVAL_MS = 2_000/,
  "typing renewal timing must have one shared owner",
);

assert.match(projection, /activeCommunity:[\s\S]*id: params\.activeCommunity\.id/, "chat panel must receive active community id for DM source context");
assert.match(projection, /onOpenDirectMessageFromCommunity: params\.onOpenDirectMessageFromCommunity/, "community projection must pass profile DM launch requests to the app shell");
assert.match(chatPanel, /onOpenDirectMessageFromCommunity\?: \(targetUserId: string, communityId: string\) => void/, "community chat panel must expose profile DM launch requests");
assert.match(chatPanel, /onOpenDirectMessageFromCommunity\(normalizedTargetUserId, sourceCommunityId\)/, "profile message actions must hand the member and community to the app shell");
assert.doesNotMatch(chatPanel, /ensureCloudDirectConversationFromCommunity/, "community chat panel must not create DMs directly");
assert.doesNotMatch(chatPanel, /subscribeCloudDirectMessages/, "community chat panel must not own DM live subscriptions");
assert.doesNotMatch(chatPanel, /sendCloudDirectMessage/, "community chat panel must not own DM sends");
assert.doesNotMatch(chatPanel, /cloudDirectMessagesGateway/, "community chat panel must not import the DM gateway directly");
assert.doesNotMatch(chatPanel, /messages: \[\.\.\.previous\.messages, message\]/, "DM sends must not use local append as the source of truth");
assert.match(chatPanel, /onMessageUser=\{canOpenDirectMessageFromCommunity \? openDirectMessage : undefined\}/, "profile hover message button must open the DM flow only when community context is available");
assert.doesNotMatch(chatPanel, /<WebDirectMessagePanel/, "community chat panel must not render a duplicate right-side DM panel");
assert.doesNotMatch(chatPanel, /follow|follower|following/i, "DM UI slice must not add follow controls");

assert.match(profilePanel, /onMessage\?: \(\) => void \| Promise<void>/, "right profile card must expose a message action");
assert.match(profilePanel, /canMessageProfile = !isSelfProfile && communityContext\.can_message && !isMessageDisabled && Boolean\(onMessage\)/, "right profile message action must be disabled for self or unavailable contexts");
assert.match(profilePanel, /disabled=\{!canMessageProfile\}/, "right profile message button must use resolved profile message eligibility");
assert.match(interactionFeed, /onMessageUser\?: \(userId: string\) => void/, "hover profile card must expose a message action");
assert.match(interactionFeed, /disabled=\{!canMessage\}/, "hover profile message action must be disabled until DM context is available");

assert.match(shellChromeShared, /directMessagesButton: ReactNode/, "desktop shell props must expose the global DM button");
assert.match(shellChromeProps, /directMessagesButton: params\.directMessagesButton/, "shell prop builder must pass the global DM button through");
assert.match(desktopHeader, /props\.isPublicCommunityFunnel \? null : props\.directMessagesButton/, "desktop header must render the global DM button without Workspace chrome");
assert.doesNotMatch(desktopHeader, /workspaceRightPanelToggle|hasWorkspaceRightPanelControl/);
assert.doesNotMatch(desktopHeader, /communityHomeButton/, "desktop header must not retain the redundant community home control");
assert.doesNotMatch(app, /activeCommunityId=\{activeCommunity\?\.id \?\? null\}/, "app shell must not scope the global DM picker to the active community");
assert.doesNotMatch(app, /activeCommunityName=\{activeCommunity\?\.name \?\? null\}/, "app shell must not label the global DM picker as the active community");
assert.doesNotMatch(app, /directMessageProfileSetupComplete|openDirectMessageProfileSetup|isIdentityOnlyOnboarding|identityOnly:/, "app shell must not couple DMs to account-setup state");
assert.doesNotMatch(css.match(/\.community-dm-panel \{[\s\S]*?\n\}/)?.[0] ?? "", /backdrop-filter/, "the stable DM context panel must not blur its own content surface");
assert.match(css, /\.app-topbar \.icon-button\.direct-messages-topbar-button \{[^}]*position: relative;[^}]*width: 34px;[^}]*height: 34px;/, "top-right DM button must anchor the unread badge in a modestly enlarged target with enough specificity to beat the generic app-topbar icon-button size");
assert.match(css, /\.app-topbar \.icon-button\.direct-messages-topbar-button svg \{[^}]*width: 20px;[^}]*height: 20px;/, "top-right DM glyph must scale with its enlarged target with enough specificity to beat the generic app-topbar icon-button glyph size");
assert.match(
  indexCss,
  /--web-topbar-right-action-safe-inset:\s*66px;/,
  "the shell must expose one explicit safe inset for content rendered beneath the floating DM action",
);
assert.match(
  css,
  /\.app-root:has\(\.app-topbar \.direct-messages-topbar-button\) \.community-context-rail-head\s*\{[^}]*padding-right:\s*var\(--web-topbar-right-action-safe-inset\);/,
  "the community context header must reserve the DM action footprint only when that action is rendered",
);
assert.match(
  css,
  /\.community-context-rail-name\s*\{[^}]*min-width:\s*0;[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/,
  "long community names must truncate before the reserved DM action safe area",
);
// Studio has no inbox (Nov 6): its Messages button and a profile's "Message"
// open Messages on a community site's private pages, which runs the helpers above.
const siteMessages = read("apps/web/src/controllers/useWebSiteMessagesController.tsx");
assert.match(app, /onOpenDirectMessageFromCommunity: siteMessages\.messageMember/, "Studio's Message action must open the community site's Messages");
assert.match(siteMessages, /\/new\?to=\$\{encodeURIComponent\(to\)\}/, "Message @handle must open the site's new-conversation page");
assert.doesNotMatch(app, /WebDirectMessagesHost|directMessagesHostProps/, "Studio must not mount its own DM inbox");
assert.match(packageJson, /check:direct-messages-contract-proof/, "package scripts must expose the DM contract proof");

console.log("PASS: direct messages are community-origin, participant-based, and follow-free.");

// Nov 5: direct messages are text only. Nothing uploads a DM file, and any
// attachment a send carries (an older page) is refused.
assert.match(dmAppendMessageHelper, /dm_attachments_not_supported/, "DM send must refuse any attachment");
assert.doesNotMatch(directMessages, /ctx\.storage\.generateUploadUrl/, "DM backend must not hand out upload URLs");

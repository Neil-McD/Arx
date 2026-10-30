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
const gateway = read("shared/cloudDirectMessagesGateway.ts");
const communityChatGateway = read("shared/cloudCommunityChatGateway.ts");
const convexRealtimeAuth = read("shared/convexRealtimeAuth.ts");
const authSession = read("shared/authSession.ts");
const convexAuthenticatedClient = read("shared/convexAuthenticatedClient.ts");
const authSessions = read("convex/authSessions.ts");
const webAuthController = read("apps/web/src/controllers/useWebAppAuthController.ts");
const communityTypes = read("shared/communityTypes.ts");
const directTypingHook = read("shared/useDirectMessageTypingPresence.ts");
const directTypingCoordinator = read("shared/directMessageTypingWriteCoordinator.ts");
const typingPresenceContract = read("shared/typingPresenceContract.ts");
const account = read("convex/account.ts");
const anonymousCleanup = read("convex/anonymousUserCleanup.ts");
const chatPanel = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const profilePanel = read("apps/web/src/components/WebCommunityProfilePanel.tsx");
const interactionFeed = read("apps/web/src/components/communityInteractionFeed.tsx");
const projection = read("apps/web/src/controllers/buildWebCommunitySurfaceProjection.ts");
const dmPanel = read("apps/web/src/components/WebDirectMessagePanel.tsx");
const dmHost = read("apps/web/src/components/WebDirectMessagesHost.tsx");
const dmInboxPanel = read("apps/web/src/components/WebDirectMessageInboxPanel.tsx");
const desktopHeader = read("apps/web/src/components/WebDesktopShellHeader.tsx");
const shellChromeShared = read("apps/web/src/components/webShellChromeShared.ts");
const shellChromeProps = read("apps/web/src/controllers/buildWebShellChromeHostProps.ts");
const indexCss = read("apps/web/src/index.css");
const app = read("apps/web/src/App.tsx");
const appCompositionRoot = read(
  "apps/web/src/components/WebAppCompositionRoot.tsx",
);
const dmChromeController = read(
  "apps/web/src/controllers/useWebDirectMessagesChromeController.tsx",
);
const dmController = read("apps/web/src/controllers/useWebDirectMessagesController.ts");
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
  directMessages.indexOf("async function generateDirectMessageAttachmentUploadUrlForConversation"),
);
const dmAttachmentUploadMutation = directMessages.slice(
  directMessages.indexOf("async function generateDirectMessageAttachmentUploadUrlForConversation"),
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
const dmFirstAttachmentUploadMutation = directMessages.slice(
  directMessages.indexOf("async function generateDirectMessageAttachmentUploadUrlForTarget"),
  directMessages.indexOf("const SITE_DM_UPLOAD_MAX_AGE_MS"),
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
const dmHostSerializeAttachments = dmHost.slice(
  dmHost.indexOf("function serializeDirectAttachmentsForWrite"),
  dmHost.indexOf("export function WebDirectMessagesHost"),
);
const dmHostUploadAttachmentDraft = dmHost.slice(
  dmHost.indexOf("const uploadDirectAttachmentDraft = useCallback"),
  dmHost.indexOf("const sendDirectMessage = useCallback"),
);
const dmPanelComposerAttachmentStatus = dmPanel.slice(
  dmPanel.indexOf("function getComposerAttachmentUploadStatus"),
  dmPanel.indexOf("function getComposerAttachmentUploadLabel"),
);
const dmInternalChromeCss = css.slice(
  css.indexOf(".community-dm-panel-header,"),
  css.indexOf(".community-dm-panel-header {"),
);
const dmPanelMessagesCss = css.slice(
  css.indexOf(".community-dm-panel-messages {"),
  css.indexOf(".community-dm-panel-empty"),
);
const dmInboxListCss = css.slice(
  css.indexOf(".community-dm-inbox-list {"),
  css.indexOf(".community-dm-inbox-panel .community-dm-panel-empty"),
);
const dmRecipientListCss = css.slice(
  css.indexOf(".community-dm-recipient-list {"),
  css.indexOf(".community-dm-inbox-row {", css.indexOf(".community-dm-recipient-list {")),
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
assert.match(directMessages, /Sent an image[\s\S]*Sent a file[\s\S]*Sent attachments/, "DM inbox preview must summarize attachment-only messages");
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
assert.match(directMessages, /generateDirectMessageAttachmentUploadUrl = mutation/, "backend must expose a DM attachment upload URL mutation");
assert.match(dmAttachmentUploadMutation, /requireActiveUserParticipant/, "DM attachment upload must require active conversation participation");
assert.doesNotMatch(dmAttachmentUploadMutation, /requireProfileSetupCompleteForUser|profile_setup_required/, "DM attachment upload must not depend on public-profile completion");
assert.match(dmAttachmentUploadMutation, /requireDirectConversationSendAccess/, "DM attachment upload must require current send access");
assert.match(dmAttachmentUploadMutation, /ctx\.storage\.generateUploadUrl/, "DM attachment upload must use Convex storage upload URLs");
assert.match(dmFirstAttachmentUploadMutation, /requireDirectMessageRelationshipAccess/, "first-message attachment uploads must require current shared-community relationship access");
assert.doesNotMatch(dmFirstAttachmentUploadMutation, /requireProfileSetupCompleteForUser|profile_setup_required/, "first-message attachment uploads must not depend on public-profile completion");
assert.match(directMessages, /async function requireDirectConversationSendAccess/, "DM sends must have a continuous access guard");
assert.match(directMessages, /requireDirectConversationSendAccess[\s\S]*throw new Error\("dm_conversation_access_required"\)/, "DM send access guard must fail closed with a named policy error");
assert.match(directMessages, /requireDirectConversationSendAccess[\s\S]*listConversationParticipants[\s\S]*participantType === "user"[\s\S]*peerParticipants\.length !== 1/, "DM send access guard must require exactly one active human peer");
assert.match(directMessages, /requireDirectConversationSendAccess[\s\S]*requireDirectMessageRelationshipAccess\(\{[\s\S]*targetUserId: peerUserId,[\s\S]*preferredCommunityId: args\.conversation\.createdFromCommunityId/, "DM send access guard must prefer the original community while allowing any current mutual community");
assert.doesNotMatch(directMessages, /requireDirectConversationSendAccess[\s\S]*requiredCommunityId: args\.conversation\.createdFromCommunityId/, "DM sends must not treat createdFromCommunityId as the only permanent authorization source");
assert.match(dmExistingConversationSendMutation, /requireDirectConversationSendAccess\(\{[\s\S]*conversation,[\s\S]*viewerUserId[\s\S]*appendDirectMessageFromUser/, "send mutation must enforce continuous shared-community access before appending");
assert.match(dmExistingConversationSendMutation, /export const sendDirectMessage = mutation[\s\S]*sendDirectMessageForUser\(ctx, viewerUserId/, "Studio's send must run the shared send helper");
assert.match(dmSendMutation, /attachments: v\.optional\(v\.array\(v\.any\(\)\)\)/, "send mutation must accept bounded attachment metadata");
assert.match(dmAppendMessageHelper, /normalizeStoredDirectMessageAttachments\(args\.attachments,[\s\S]*enforceWritePolicy: true/, "shared send append must normalize DM attachments with write policy enforcement");
assert.match(dmAppendMessageHelper, /dm_message_payload_required/, "shared send append must allow attachment-only messages but reject empty payloads");
assert.match(directMessages, /MAX_DM_STORED_ATTACHMENTS = 8/, "DM attachments must keep a small per-message count limit");
assert.match(directMessages, /MAX_DM_ATTACHMENT_BYTES = 10 \* 1024 \* 1024/, "DM attachments must enforce a 10MB per-file metadata limit");
assert.match(directMessages, /MAX_DM_ATTACHMENT_TOTAL_BYTES = 25 \* 1024 \* 1024/, "DM attachments must enforce a 25MB total metadata limit");
assert.match(directMessages, /dm_attachment_storage_required/, "DM attachments must require uploaded storage ids instead of inline payloads");
assert.doesNotMatch(directMessages, /data_url/, "DM backend must not store raw attachment data URLs");
assert.match(directMessages, /maybeResolveDirectMessageStorageUrl[\s\S]*ctx\.storage\.getUrl[\s\S]*mapDirectMessageContentJsonForRead/, "DM read mapping must resolve stored attachment URLs only after participant-gated reads");
assert.match(dmAppendMessageHelper, /contentJson = attachments\.length > 0 \? \{ text, attachments \} : \{ text \}/, "DM send must keep attachments embedded in the message payload");
assert.match(dmAppendMessageHelper, /touchActiveConversationParticipantsActivity\(\{[\s\S]*nowMs,[\s\S]*senderParticipantId: args\.senderParticipantId,[\s\S]*senderLastReadSeq: seq/, "shared send append must update participant inbox activity and mark the sender read through their own message");
assert.doesNotMatch(directMessages, /follow|follower|following/i, "first DM slice must not introduce follow graph semantics");

assert.match(gateway, /ensureCloudDirectConversationFromCommunity/, "web gateway must open or create direct conversations");
assert.match(gateway, /listCloudDirectConversations/, "web gateway must expose the current user's direct conversation list");
assert.doesNotMatch(gateway, /export async function listCloudEligibleDirectMessageRecipients</, "web gateway must not expose the deleted community-scoped recipient lookup");
assert.doesNotMatch(gateway, /directMessages:listEligibleDirectMessageRecipients"/, "web gateway must not call the deleted community-scoped recipient query");
assert.doesNotMatch(gateway, /listCloudEligibleDirectMessageRecipientsForViewer/, "web gateway must not keep the deleted eager global recipient lookup");
assert.match(gateway, /listCloudNetworkPeople/, "web gateway must expose global network people lookup");
assert.match(gateway, /directMessages:listNetworkPeopleForViewer/, "web gateway network people lookup must use the canonical backend query");
assert.doesNotMatch(gateway, /DirectMessageRecipientPage|paginationOpts|continueCursor/, "web gateway must not keep deleted recipient pagination contract");
assert.doesNotMatch(communityTypes, /DirectMessageRecipientPage/, "shared community types must not expose deleted recipient pagination metadata");
assert.doesNotMatch(gateway, /export async function listCloudDirectMessages/, "web gateway must not keep a duplicate snapshot message reader beside the live subscription");
assert.match(gateway, /subscribeCloudDirectConversations/, "web gateway must expose live direct conversation subscriptions");
assert.match(gateway, /subscribeCloudDirectConversations[\s\S]*watchQuery\([\s\S]*directMessages:listMyDirectConversations/, "live DM inbox subscription must watch the canonical inbox query");
assert.match(gateway, /subscribeCloudDirectMessages/, "web gateway must expose live direct message subscriptions");
assert.match(gateway, /sendCloudDirectMessage/, "web gateway must send direct messages");
assert.match(gateway, /sendCloudDirectMessageToUser/, "web gateway must support first-send conversation creation");
assert.match(gateway, /directMessages:sendDirectMessageToUser[\s\S]*clientMessageId/, "first-send gateway path must preserve client-message idempotency");
assert.match(gateway, /uploadCloudDirectMessageAttachmentFile/, "web gateway must upload direct message attachments");
assert.match(gateway, /directMessages:generateDirectMessageAttachmentUploadUrl/, "web gateway must request DM attachment upload URLs from the canonical backend mutation");
assert.match(gateway, /directMessages:sendDirectMessage[\s\S]*attachments: params\.attachments \?\? \[\]/, "web gateway must pass attachment metadata through the canonical send mutation");
assert.match(gateway, /markCloudDirectConversationRead/, "web gateway must expose direct conversation read mutation");
assert.match(gateway, /directMessages:markDirectConversationRead/, "web gateway read mutation must use the canonical backend mutation");
assert.match(gateway, /markCloudDirectConversationRead[\s\S]*throughSeq: number/, "web gateway read mutation must require an exact visible sequence");
assert.match(gateway, /directMessages:markDirectConversationRead[\s\S]*throughSeq: Math\.floor\(params\.throughSeq\)/, "web gateway must preserve the exact visible read position");
assert.match(gateway, /subscribeCloudDirectTyping/, "web gateway must expose live DM typing subscriptions");
assert.match(gateway, /directMessages:listDirectTyping/, "web gateway typing subscription must watch the canonical backend query");
assert.match(gateway, /setCloudDirectTyping/, "web gateway must expose a DM typing heartbeat");
assert.match(gateway, /directMessages:setDirectTyping/, "web gateway typing heartbeat must use the canonical backend mutation");
assert.match(gateway, /clearCloudDirectTyping/, "web gateway must expose a DM typing clear");
assert.match(gateway, /directMessages:clearDirectTyping/, "web gateway typing clear must use the canonical backend mutation");
assert.match(authSession, /function resolveConvexRuntimeToken[\s\S]*access_token[\s\S]*id_token/, "Convex runtime auth must prefer the rotating access token over the ID-token fallback");
assert.match(convexAuthenticatedClient, /resolveConvexRuntimeToken[\s\S]*client\.setAuth\(runtimeToken\)/, "one-shot Convex requests must use the rotating runtime token");
assert.match(gateway, /acquireAuthenticatedConvexRealtimeClient/, "DM subscriptions must lease the shared refresh-aware realtime transport");
assert.match(communityChatGateway, /acquireAuthenticatedConvexRealtimeClient/, "community subscriptions must lease the same refresh-aware realtime transport");
assert.doesNotMatch(gateway, /createAuthenticatedConvexRealtimeClient/, "DM gateway must not construct a domain-local realtime transport");
assert.doesNotMatch(communityChatGateway, /createAuthenticatedConvexRealtimeClient/, "community gateway must not construct a domain-local realtime transport");
assert.doesNotMatch(gateway, /\.setAuth\(/, "DM gateway must not implement a second raw auth callback");
assert.doesNotMatch(communityChatGateway, /\.setAuth\(/, "community gateway must not implement a second raw auth callback");
assert.match(convexRealtimeAuth, /forceRefreshToken[\s\S]*forceRefresh: true/, "realtime auth must honor the Convex SDK's forced token refresh signal");
assert.match(convexRealtimeAuth, /initialAuthTokenReuse: true/, "realtime auth must avoid redundant refreshes immediately after a cached token is accepted");
assert.match(convexRealtimeAuth, /REAUTH_RETRY_DELAYS_MS[\s\S]*applyAuth\(\)/, "realtime auth must retry transient refresh failures while a local session remains");
assert.match(webAuthController, /options\?\.forceRefresh[\s\S]*refreshAuthSessionLockedResult\(\)/, "forced realtime refreshes must reuse the app's central refresh lock");
assert.doesNotMatch(authSessions, /\["id_token", "idToken"\]\) \?\? options\.fallback\?\.idToken/, "refresh normalization must not preserve a stale ID token when the provider omits it");
assert.match(directTypingHook, /useDirectMessageTypingPresence/, "web must have a dedicated DM typing hook");
assert.match(
  typingPresenceContract,
  /TYPING_PRESENCE_RENEW_INTERVAL_MS = 2_000/,
  "typing renewal timing must have one shared owner",
);
assert.match(directTypingHook, /TYPING_PRESENCE_RENEW_INTERVAL_MS/, "DM typing heartbeat must use the canonical throttle");
assert.match(directTypingHook, /subscribeCloudDirectTyping/, "DM typing hook must subscribe to live backend typing state");
assert.match(directTypingHook, /setCloudDirectTyping/, "DM typing hook must publish typing heartbeats through the backend");
assert.match(directTypingHook, /clearCloudDirectTyping/, "DM typing hook must own typing clear writes");
assert.match(directTypingHook, /row\.display_until_ms > nowMs/, "DM typing hook must drop expired presence locally");
assert.match(directTypingHook, /capturedConversationId[\s\S]*writeCoordinatorRef\.current\?\.clearTyping/, "DM typing lifecycle cleanup must capture the conversation it is leaving");
assert.match(directTypingHook, /\}, \[args\.conversationId, args\.isEnabled\]\);/, "DM typing lifecycle ownership must not reset on auth refresh");
assert.match(directTypingCoordinator, /let writeQueue: Promise<void> = Promise\.resolve\(\)/, "DM typing writes and clears must share one ordered queue");
assert.match(directTypingCoordinator, /activeConversationId !== conversationId/, "DM typing renewal must recheck its captured conversation after session resolution");
assert.match(directTypingCoordinator, /if \(wasActive\) activeConversationId = null;[\s\S]*enqueue\(async \(\) =>/, "DM typing clear must invalidate renewal before entering the write queue");

assert.match(projection, /activeCommunity:[\s\S]*id: params\.activeCommunity\.id/, "chat panel must receive active community id for DM source context");
assert.match(projection, /onOpenDirectMessageFromCommunity: params\.onOpenDirectMessageFromCommunity/, "community projection must pass profile DM launch requests to the app shell");
assert.match(chatPanel, /onOpenDirectMessageFromCommunity\?: \(targetUserId: string, communityId: string\) => void/, "community chat panel must expose profile DM launch requests");
assert.match(chatPanel, /onOpenDirectMessageFromCommunity\(normalizedTargetUserId, sourceCommunityId\)/, "profile message actions must route to the global DM host with community context");
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

assert.match(dmPanel, /From \{communityName\}/, "DM panel must surface source community context");
assert.match(dmPanel, /participant_type === "user"/, "DM panel must resolve the human peer from participants");
assert.match(dmPanel, /Start a direct message from this shared community/, "empty DM state must explain the community-origin model");
assert.match(dmPanel, /import \{[^}]*ArrowLeft[^}]*MessageCircle[^}]*Paperclip[^}]*RotateCcw[^}]*\} from "lucide-react"/, "DM conversation panel must use lucide icons for back, empty, attachment, and retry actions");
assert.match(dmPanel, /DM_AUTO_SCROLL_THRESHOLD_PX/, "DM panel must keep chat-like auto-scroll constrained by a bottom threshold");
assert.match(dmPanel, /scrollMessagesToBottom/, "DM panel must scroll opened or followed conversations to the newest message");
assert.match(dmPanel, /onScroll=\{\(event\) =>/, "DM panel must track whether the viewer is reading older messages before auto-following");
assert.match(dmPanel, /onBackToInbox\?: \(\) => void/, "DM conversation panel must support returning to the inbox when opened globally");
assert.match(dmPanel, /onReadThroughSeq\?: \(seq: number\) => void \| Promise<void>/, "DM conversation panel must report read-through sequence");
assert.match(dmPanel, /props\.onReadThroughSeq\?\.\(lastMessageSeq\)/, "DM conversation panel must mark visible newest messages read");
assert.match(dmPanel, /const isNearBottom = distanceFromBottom <= DM_AUTO_SCROLL_THRESHOLD_PX;[\s\S]*if \(isNearBottom && lastMessageSeq > 0\) \{[\s\S]*props\.onReadThroughSeq\?\.\(lastMessageSeq\)/, "DM panel must settle read state only when the newest message is within the viewer's followed window");
assert.match(dmPanel, /typingPresence: DirectMessageTypingPresenceBundle/, "DM panel must receive typing presence as data");
assert.match(dmPanel, /parseMessageAttachments/, "DM panel must reuse the canonical message attachment parser");
assert.match(dmPanel, /partitionCommunityAttachments/, "DM panel must reuse the canonical attachment partitioning helper");
assert.match(dmPanel, /AttachmentChipButton/, "DM panel must reuse the canonical file attachment chip");
assert.match(dmPanel, /CommunityChatMediaGrid/, "DM panel must reuse the canonical image grid");
assert.match(dmPanel, /type DirectMessageAttachmentFileInput = FileList \| readonly File\[\]/, "DM panel must accept file picker and drag-drop attachment file inputs");
assert.match(dmPanel, /onAttachmentFilesSelected\?: \(files: DirectMessageAttachmentFileInput\) => void \| Promise<void>/, "DM panel must expose attachment selection");
assert.match(dmPanel, /uploadStatus\?: "queued" \| "uploading" \| "ready" \| "failed"/, "DM composer attachment views must understand upload lifecycle state");
assert.match(dmPanel, /onRetryAttachment\?: \(id: string\) => void/, "DM composer must expose attachment retry actions");
assert.match(dmPanel, /getComposerAttachmentUploadStatus/, "DM composer must resolve upload state before rendering attachment previews");
assert.match(dmPanelComposerAttachmentStatus, /return "failed";/, "malformed composer attachment state must fail closed instead of appearing ready");
assert.match(dmPanel, /canSendDirectMessage =[\s\S]*!props\.isSending && hasComposerPayload && !hasAttachmentBlockers && !isPeerBlocked/, "DM composer send button must block while attachments are not ready or the peer is blocked");
assert.match(dmPanel, /community-dm-attachment-state-overlay/, "DM image composer previews must surface queued, uploading, and failed states");
assert.match(dmPanel, /hasDragFiles[\s\S]*getDragFiles/, "DM panel must detect dropped files without depending only on populated FileList during dragenter");
assert.match(dmPanel, /onDrop=\{canAcceptAttachmentDrop \? onAttachmentDrop : undefined\}/, "DM panel must accept file drops across the panel");
assert.match(dmPanel, /onPaste=\{onComposerPaste\}/, "DM composer must attach pasted images and files");
assert.match(dmPanel, /community-dm-attachment-drop-surface[\s\S]*community-dm-drop-overlay/, "DM panel must expose a scoped drag-over surface and overlay");
assert.match(dmPanel, /community-dm-panel-file-input[\s\S]*type="file"[\s\S]*multiple/, "DM composer must use a real multi-file input");
assert.match(dmPanel, /Paperclip/, "DM composer must expose an attachment button");
assert.match(dmPanel, /onComposerBlur\?: \(\) => void \| Promise<void>/, "DM panel must let the host clear typing presence on composer blur");
assert.match(dmPanel, /onBlur=\{\(\) => \{[\s\S]*props\.onComposerBlur/, "DM panel composer blur must call the host typing clear hook");
assert.match(dmPanel, /formatDirectTypingLabel/, "DM panel must format typing labels locally");
assert.match(dmPanel, /community-dm-panel-typing/, "DM panel must render a reserved typing indicator row");
assert.match(dmHost, /listCloudDirectConversations/, "global DM host must load the current user's inbox");
assert.match(dmHost, /subscribeCloudDirectConversations<DirectMessageConversation>/, "global DM host must keep inbox rows live");
assert.match(dmHost, /hasInboxLiveSubscriptionRef/, "global DM host must avoid duplicate snapshot loads when the live inbox subscription is active");
assert.match(dmHost, /onUnreadCountChange/, "global DM host must project unread count to the app shell");
assert.doesNotMatch(dmHost, /activeCommunityId: string \| null/, "global DM host new-message picker must not depend on active community scope");
assert.doesNotMatch(dmHost, /normalizedActiveCommunityId/, "global DM host recipient loading must not depend on active community scope");
assert.match(dmHost, /listCloudNetworkPeople/, "global DM host must load people across the viewer's communities");
assert.match(dmHost, /canBrowsePeople=\{Boolean\(session\)\}/, "global DM host must expose people from any signed-in page");
assert.doesNotMatch(dmHost, /recipientCursor/, "global DM host must not project fake recipient pagination cursor state");
assert.match(dmHost, /const excludeUserIds = networkPeople[\s\S]*listCloudNetworkPeople/, "global DM host must page network people without duplicating loaded users");
assert.match(dmHost, /VIRTUAL_DM_CONVERSATION_ID_PREFIX/, "global DM host must model an unsent recipient selection without persisting an empty room");
assert.match(dmHost, /sendCloudDirectMessageToUser\(\{[\s\S]*targetUserId,[\s\S]*communityId,[\s\S]*clientMessageId: echo\.local_id/, "first send must create and append through the idempotent user-targeted mutation");
assert.match(dmHost, /ensureCloudDirectConversationFromCommunity\(\{[\s\S]*targetUserId,[\s\S]*communityId/, "existing recipient conversations must reopen through the canonical community-origin access check");
assert.match(dmHost, /markCloudDirectConversationRead/, "global DM host must own read-state mutations");
assert.match(dmHost, /markCloudDirectConversationRead\(\{[\s\S]*conversationId: normalizedConversationId,[\s\S]*throughSeq: seq/, "global DM host must pass the panel's exact visible sequence to the canonical mutation");
assert.match(dmHost, /onReadThroughSeq=\{\(seq\) =>/, "global DM host must connect visible messages to read-state mutations");
assert.match(dmHost, /ensureCloudDirectConversationFromCommunity/, "global DM host must create DMs from profile launch requests");
assert.match(dmHost, /openRequest: DirectMessageOpenRequest/, "global DM host must accept canonical open requests from profile actions");
assert.match(dmHost, /subscribeCloudDirectMessages<DirectMessage>/, "global DM host must own live direct message subscriptions");
assert.match(dmHost, /useDirectMessageTypingPresence/, "global DM host must own DM typing presence");
assert.match(dmHost, /clearDirectTypingForConversation/, "global DM host must centralize DM typing clear calls");
assert.doesNotMatch(dmHost, /clearCloudDirectTyping/, "global DM host must delegate ordered typing clears to the dedicated hook");
assert.match(dmHost, /typingPresence=\{directTypingPresence\}/, "global DM host must pass typing presence into the DM panel");
assert.match(dmHost, /MAX_DM_ATTACHMENTS_PER_MESSAGE = 8/, "global DM host must keep the same per-message attachment count limit");
assert.match(dmHost, /MAX_DM_ATTACHMENT_BYTES = 10 \* 1024 \* 1024/, "global DM host must enforce the 10MB per-file attachment limit");
assert.match(dmHost, /MAX_DM_ATTACHMENT_TOTAL_BYTES = 25 \* 1024 \* 1024/, "global DM host must enforce the 25MB total attachment limit");
assert.match(dmHost, /isAllowedDirectAttachmentFile/, "global DM host must filter unsupported DM attachment types before upload");
assert.match(dmHost, /uploadCloudDirectMessageAttachmentFile/, "global DM host must upload DM attachments through the DM gateway");
assert.match(dmHost, /uploadStatus\?: "queued" \| "uploading" \| "ready" \| "failed"/, "global DM host must model attachment upload lifecycle state");
assert.match(dmHost, /uploadStatus: "queued"/, "new DM attachment drafts must start queued");
assert.match(dmHost, /uploadDirectAttachmentDraft/, "global DM host must upload attachment drafts before send");
assert.match(dmHostUploadAttachmentDraft, /shouldClearPanelError = currentUploadError\.length > 0 && previous\.error === currentUploadError/, "DM upload start must clear only the current attachment upload error");
assert.match(dmHostUploadAttachmentDraft, /error: shouldClearPanelError \? null : previous\.error/, "DM upload start must preserve unrelated validation errors");
assert.doesNotMatch(dmHostUploadAttachmentDraft, /error: nextHasFailedAttachment \? previous\.error : null/, "DM upload success must not erase unrelated validation errors");
assert.match(dmHost, /hasUnreadyDirectAttachments/, "global DM host must block sends while attachments are queued, uploading, or failed");
assert.match(dmHostSerializeAttachments, /getDirectAttachmentUploadStatus\(attachment\) !== "ready"[\s\S]*continue/, "global DM host must serialize only ready uploaded attachments");
assert.match(dmHostSerializeAttachments, /storageId/, "global DM host must serialize uploaded storage ids for DM attachment sends");
assert.doesNotMatch(dmHostSerializeAttachments, /data_url|text:/, "global DM host must not serialize inline attachment payloads for DMs");
assert.doesNotMatch(dmHost, /prepareDirectAttachmentsForSend/, "DM send path must not upload implicitly during send");
assert.match(dmHost, /attachments=\{directMessagePanel\.attachments\}/, "global DM host must pass composer attachments into the DM panel");
assert.match(dmHost, /onAttachmentFilesSelected=\{handleDirectAttachmentFilesSelected\}/, "global DM host must wire file selection to the DM panel");
assert.match(dmHost, /onRetryAttachment=\{retryDirectAttachmentUpload\}/, "global DM host must wire failed attachment retry to the DM panel");
assert.match(dmHost, /onRemoveAttachment=\{removeDirectAttachment\}/, "global DM host must wire attachment removal to the DM panel");
assert.match(dmHost, /void clearDirectTypingForConversation\(conversationId\)/, "global DM host must clear typing presence immediately after send submission");
assert.match(dmHost, /onComposerBlur=\{\(\) => \{[\s\S]*clearDirectTypingForConversation\(directMessagePanel\.conversation\.id\)/, "global DM host must clear typing presence on composer blur");
assert.match(dmHost, /onBackToInbox=\{\(\) => \{[\s\S]*clearDirectTypingForConversation\(directMessagePanel\.conversation\.id\)/, "global DM host must clear typing presence when leaving a conversation");
assert.match(dmHost, /value\.trim\(\)\.length === 0[\s\S]*clearDirectTypingForConversation\(directMessagePanel\.conversation\.id\)/, "global DM host must clear typing presence when the composer becomes empty");
assert.match(dmHost, /WebDirectMessageInboxPanel/, "global DM host must render the inbox panel");
assert.match(dmHost, /WebDirectMessagePanel/, "global DM host must open existing conversations into the live DM panel");
assert.match(dmInboxPanel, /Direct messages/, "DM inbox panel must identify the inbox");
assert.match(dmInboxPanel, /conversation\.last_message_preview/, "DM inbox rows must prefer the latest message preview");
assert.match(dmInboxPanel, /Started in \$\{communityName\}/, "DM inbox rows must preserve community-origin provenance as the no-message fallback");
assert.match(dmInboxPanel, /People from your communities/, "DM inbox must explain the global community-network scope");
assert.match(dmInboxPanel, /formatPersonPresenceLabel/, "network people rows must show presence and shared-community provenance");
assert.match(dmInboxPanel, /Search people and messages/, "DM inbox search must span both people and messages");
assert.match(dmInboxPanel, /onSelectPerson/, "DM inbox must select an eligible network person");
assert.match(dmInboxPanel, /props\.hasMorePeople[\s\S]*props\.onLoadMorePeople/, "DM inbox must load additional network people at the scroll boundary");
assert.doesNotMatch(dmInboxPanel, /No matches loaded yet/, "DM recipient picker must not expose partial-search copy");
assert.match(dmInboxPanel, /No matches\./, "DM recipient search empty state must honestly say no loaded matches");
assert.match(dmInboxPanel, /conversation\.unread_count/, "DM inbox rows must consume unread count");
assert.match(dmInboxPanel, /is-unread/, "DM inbox rows must expose unread state for styling");
assert.match(dmInboxPanel, /community-dm-inbox-row-unread/, "DM inbox rows must render an unread badge");
assert.match(shellChromeShared, /directMessagesButton: ReactNode/, "desktop shell props must expose the global DM button");
assert.match(shellChromeProps, /directMessagesButton: params\.directMessagesButton/, "shell prop builder must pass the global DM button through");
assert.match(desktopHeader, /props\.isPublicCommunityFunnel \? null : props\.directMessagesButton/, "desktop header must render the global DM button without Workspace chrome");
assert.doesNotMatch(desktopHeader, /workspaceRightPanelToggle|hasWorkspaceRightPanelControl/);
assert.doesNotMatch(desktopHeader, /communityHomeButton/, "desktop header must not retain the redundant community home control");
assert.match(dmChromeController, /className=\{`icon-button direct-messages-topbar-button/, "the DM chrome controller must render a top-right direct messages button");
assert.match(dmController, /openFromCommunity[\s\S]*targetUserId[\s\S]*communityId/, "direct-message controller must own profile-to-DM launch requests");
assert.match(app, /openRequest: directMessageOpenRequest/, "app composition must pass canonical open requests to the global DM host");
assert.doesNotMatch(app, /activeCommunityId=\{activeCommunity\?\.id \?\? null\}/, "app shell must not scope the global DM picker to the active community");
assert.doesNotMatch(app, /activeCommunityName=\{activeCommunity\?\.name \?\? null\}/, "app shell must not label the global DM picker as the active community");
assert.match(dmController, /const \[unreadCount, setUnreadCount\] = useState\(0\)/, "direct-message controller must own top-bar unread count");
assert.match(app, /onUnreadCountChange: setDirectMessagesUnreadCount/, "global DM host must feed top-bar unread state");
assert.match(appCompositionRoot, /<WebDirectMessagesHost \{\.\.\.props\.directMessagesHostProps\} \/>/, "the application composition root must mount the global direct messages host");
assert.doesNotMatch(dmHost, /onProfileSetupRequired|isProfileSetupComplete|DIRECT_MESSAGE_PROFILE_SETUP_REQUIRED|directMessageSendRequiresProfileSetup|profile_setup_required/, "DM host must not preflight or recover through public-profile setup");
assert.doesNotMatch(app, /directMessageProfileSetupComplete|openDirectMessageProfileSetup|isIdentityOnlyOnboarding|identityOnly:/, "app shell must not couple DMs to account-setup state");
assert.match(css, /\.community-dm-panel/, "DM panel must have canonical context-panel styling");
assert.doesNotMatch(css, /\.community-dm-panel::before|\.community-dm-panel::after/, "DM panel must not cover readable inbox or chat content with global pseudo-element scrims");
assert.match(css, /\.community-dm-panel \{[\s\S]*border: 1px solid var\(--web-context-panel-border\);[\s\S]*background: var\(--web-context-panel-surface\);[\s\S]*box-shadow: var\(--web-context-panel-shadow\);/, "DM panel root must share the canonical context-panel material");
assert.doesNotMatch(css.match(/\.community-dm-panel \{[\s\S]*?\n\}/)?.[0] ?? "", /backdrop-filter/, "the stable DM context panel must not blur its own content surface");
assert.match(dmInternalChromeCss, /\.community-dm-panel-header,[\s\S]*\.community-dm-inbox-header,[\s\S]*\.community-dm-recipient-search \{[\s\S]*position: relative;[\s\S]*z-index: 2;[\s\S]*border-radius: 14px;[\s\S]*background: transparent;/, "DM fixed headers must inherit the stable context-panel surface");
assert.doesNotMatch(dmInternalChromeCss, /backdrop-filter/, "DM fixed chrome must not create nested blur layers");
assert.doesNotMatch(dmInternalChromeCss, /\.community-dm-panel-composer/, "DM composer must not inherit the translucent fixed-header material");
assert.match(css, /\.community-dm-panel-composer \{[\s\S]*background: var\(--composer-surface\);/, "DM composer must preserve the canonical composer surface");
assert.match(css, /\.community-dm-composer-float::before \{[\s\S]*linear-gradient\([\s\S]*var\(--web-context-panel-surface\) 100%/, "DM floating composer fade must end in the canonical context-panel surface");
assert.doesNotMatch(dmInternalChromeCss, /box-shadow:|border: 1px solid/, "DM fixed chrome must not become nested glass cards");
assert.match(dmPanelMessagesCss, /overflow: auto;[\s\S]*margin: -8px -12px -14px 0;[\s\S]*padding: 10px 14px calc\(var\(--community-dm-composer-float-height, 62px\) \+ 26px\) 2px;[\s\S]*mask-image: linear-gradient/, "DM conversation messages must use an edge-aligned viewport with measured floating-composer clearance");
assert.doesNotMatch(dmPanelMessagesCss, /padding: 10px 14px 12px 2px|padding: 56px 14px 50px 2px/, "DM conversation messages must not fall back to fixed-footer clearance");
assert.match(dmInboxListCss, /overflow: auto;[\s\S]*margin: -10px -12px -14px 0;[\s\S]*padding: 10px 14px 14px 2px;[\s\S]*mask-image: linear-gradient/, "DM inbox rows must align the scrollbar with the panel edge and fade at the fixed chrome boundary");
assert.doesNotMatch(dmInboxListCss, /margin: -50px -12px 0 0|padding: 52px 14px 2px 2px/, "DM inbox rows must not scroll underneath the header");
assert.match(dmRecipientListCss, /overflow: auto;[\s\S]*padding: 2px/, "DM recipient rows must preserve the original list viewport");
assert.doesNotMatch(dmRecipientListCss, /margin-top: -46px|padding: 48px 2px 2px/, "DM recipient rows must not scroll underneath the search field");
assert.match(css, /\.community-dm-panel-back \{[\s\S]*border: 0;[\s\S]*background: transparent/, "DM conversation back control must stay flat, not circular");
assert.match(css, /\.community-dm-panel-typing/, "DM conversation panel must style typing presence");
assert.match(css, /\.community-dm-panel-typing\.is-empty \{[\s\S]*display: none/, "empty DM typing row must not steal vertical message space");
assert.match(css, /\.community-dm-attachment-state-overlay/, "DM composer images must style attachment upload state overlays");
assert.match(css, /\.community-dm-attachment-retry/, "DM composer must style failed attachment retry controls");
assert.match(css, /\.community-dm-attachment-item\.is-failed/, "DM composer file chips must style failed attachment state");
assert.match(css, /\.community-dm-inbox-panel/, "DM inbox panel must use the shared context-panel styling");
assert.match(css, /\.community-dm-inbox-panel \{[\s\S]*height: auto/, "DM inbox must size to content instead of forcing full conversation-panel height");
assert.match(css, /\.community-dm-inbox-avatar \{[\s\S]*position: relative/, "DM inbox avatars must provide the canonical positioned frame for focused avatar crops");
assert.match(css, /\.community-dm-inbox-icon-button/, "DM inbox must style the new-message icon button");
assert.match(css, /\.community-dm-recipient-search/, "DM recipient picker must style member search");
assert.match(css, /\.community-dm-recipient-row/, "DM recipient picker must style recipient rows");
assert.doesNotMatch(css, /\.community-dm-recipient-more/, "DM recipient picker must not keep CSS for deleted fake pagination control");
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
assert.match(css, /\.community-dm-inbox-row-unread/, "DM inbox must style unread badges");
assert.match(css, /\.community-dm-panel-title \{[^}]*color: var\(--chat-author-text\);[^}]*font-size: 16px;[^}]*font-weight: 650;/, "DM panel identity must use the canonical conversation author role");
assert.match(css, /\.community-dm-panel-context \{[^}]*color: var\(--chat-meta-text\);/, "DM panel context must use the canonical conversation metadata role");
assert.match(css, /\.community-dm-day \{[^}]*color: var\(--chat-system-text\);[^}]*font-size: 11px;/, "DM day separators must use the canonical system-text role");
assert.match(css, /\.community-dm-panel-message-time \{[^}]*font-size: 11px;[^}]*color: var\(--chat-system-text\);/, "DM timestamps must remain quiet but readable");
assert.match(css, /\.community-dm-panel-message-bubble \{[^}]*color: var\(--chat-body-text\);[^}]*font-size: 14px;/, "incoming DM messages must use the canonical conversation body role");
assert.match(css, /\.community-dm-inbox-row-name \{[^}]*color: var\(--chat-author-text\);[^}]*font-size: 14px;[^}]*font-weight: 600;/, "DM inbox identity must match the canonical author hierarchy");
assert.match(css, /\.community-dm-inbox-row-time \{[^}]*color: var\(--chat-system-text\);[^}]*font-size: 11px;/, "DM inbox timestamps must use the canonical system-text role");
assert.match(css, /\.community-dm-inbox-row-meta \{[^}]*color: var\(--chat-meta-text\);[^}]*font-size: 12px;/, "DM inbox previews must use the canonical metadata role");
assert.match(css, /\.community-dm-inbox-row\.is-unread \.community-dm-inbox-row-meta \{[\s\S]*color: var\(--chat-author-text\)[\s\S]*font-weight: 600/, "unread DM inbox previews must read as new without overpowering conversation content");
assert.match(css, /\.community-dm-inbox-row-unread \{[\s\S]*width: 8px[\s\S]*height: 8px/, "DM inbox unread indicator must be a small dot");
assert.match(packageJson, /check:direct-messages-contract-proof/, "package scripts must expose the DM contract proof");

console.log("PASS: direct messages are community-origin, participant-based, and follow-free.");

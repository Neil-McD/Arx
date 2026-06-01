import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const schema = read("convex/schema.ts");
const directMessages = read("convex/directMessages.ts");
const relationshipCore = read("convex/profileRelationshipCore.ts");
const gateway = read("shared/cloudDirectMessagesGateway.ts");
const communityTypes = read("shared/communityTypes.ts");
const directTypingHook = read("shared/useDirectMessageTypingPresence.ts");
const account = read("convex/account.ts");
const anonymousCleanup = read("convex/anonymousUserCleanup.ts");
const chatPanel = read("apps/web/src/components/WebCommunityChatPanel.tsx");
const profilePanel = read("apps/web/src/components/WebCommunityProfilePanel.tsx");
const messageRow = read("shared/CommunityChatMessageRow.tsx");
const projection = read("apps/web/src/controllers/buildWebCommunitySurfaceProjection.ts");
const dmPanel = read("apps/web/src/components/WebDirectMessagePanel.tsx");
const dmHost = read("apps/web/src/components/WebDirectMessagesHost.tsx");
const dmInboxPanel = read("apps/web/src/components/WebDirectMessageInboxPanel.tsx");
const desktopHeader = read("apps/web/src/components/WebDesktopShellHeader.tsx");
const shellChromeShared = read("apps/web/src/components/webShellChromeShared.ts");
const shellChromeProps = read("apps/web/src/controllers/buildWebShellChromeHostProps.ts");
const app = read("apps/web/src/App.tsx");
const css = read("apps/web/src/base.css");
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
  directMessages.indexOf("export const listEligibleDirectMessageRecipientsForViewer"),
);
const dmInboxQuery = directMessages.slice(
  directMessages.indexOf("export const listMyDirectConversations"),
  directMessages.indexOf("export const markDirectConversationRead"),
);
const dmListMessagesQuery = directMessages.slice(
  directMessages.indexOf("export const listDirectMessages"),
  directMessages.indexOf("export const generateDirectMessageAttachmentUploadUrl"),
);
const dmAttachmentUploadMutation = directMessages.slice(
  directMessages.indexOf("export const generateDirectMessageAttachmentUploadUrl"),
  directMessages.indexOf("export const sendDirectMessage"),
);
const dmSetTypingMutation = directMessages.slice(
  directMessages.indexOf("export const setDirectTyping"),
  directMessages.indexOf("export const clearDirectTyping"),
);
const dmClearTypingMutation = directMessages.slice(
  directMessages.indexOf("export const clearDirectTyping"),
  directMessages.indexOf("export const listDirectTyping"),
);
const dmListTypingQuery = directMessages.slice(
  directMessages.indexOf("export const listDirectTyping"),
  directMessages.indexOf("export const listDirectMessages"),
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
assert.match(directMessages, /requireProfileSetupCompleteForUser\(ctx, viewerUserId\)/, "DM writes must require profile setup");
assert.match(directMessages, /listMyDirectConversations = query/, "backend must expose current-user DM inbox query even if UI inbox is deferred");
assert.doesNotMatch(directMessages, /listEligibleDirectMessageRecipients = query/, "backend must not keep the deleted community-scoped recipient lookup");
assert.match(directMessages, /listEligibleDirectMessageRecipientsForViewer = query/, "backend must expose viewer-wide DM recipient lookup for the global inbox picker");
assert.match(directMessages, /listDirectMessageSourceCommunitiesForViewer/, "viewer-wide DM recipient lookup must compile the viewer's communities");
assert.match(schema, /\.index\("by_owner_createdAt", \["ownerId", "createdAt"\]\)/, "communities must support bounded recent owner-community discovery");
assert.match(schema, /\.index\("by_user_createdAt", \["userId", "createdAt"\]\)/, "community memberships must support bounded recent viewer-community discovery");
assert.match(schema, /\.index\("by_normalizedHandle", \["normalizedHandle"\]\)/, "users must support exact normalized-handle recipient lookup");
assert.match(directMessages, /withIndex\("by_owner_createdAt"[\s\S]*ownerId/, "viewer-wide DM recipient lookup must include recent communities the viewer owns");
assert.match(directMessages, /withIndex\("by_user_createdAt"[\s\S]*userId/, "viewer-wide DM recipient lookup must include recent communities the viewer belongs to");
assert.match(directMessages, /findUserByNormalizedHandle[\s\S]*withIndex\("by_normalizedHandle"[\s\S]*normalizedHandle/, "viewer-wide DM recipient lookup must use indexed exact-handle search");
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
assert.match(directMessages, /userKey === normalizeIdValue\(viewerUserId\)/, "DM recipient lookup must exclude the viewer");
assert.match(directMessages, /requireCommunityChatAccess\(\{[\s\S]*communityId: args\.community\._id,[\s\S]*userId: args\.userId/, "global DM recipient lookup must verify recipient community access");
assert.match(directMessages, /existing_conversation_id/, "DM recipient lookup must surface existing canonical conversation ids");
assert.doesNotMatch(directMessages, /continueCursor|isDone: rawPage\.isDone/, "DM backend must not expose cursor metadata for the deleted community-scoped recipient lookup");
assert.match(directMessages, /viewer_last_read_seq/, "conversation projection must expose the viewer read cursor");
assert.match(directMessages, /unread_count/, "conversation projection must expose unread count");
assert.match(directMessages, /has_unread/, "conversation projection must expose unread state");
assert.match(directMessages, /MAX_DM_PREVIEW_CHARS/, "conversation projection must keep inbox previews bounded");
assert.match(directMessages, /readDirectMessageTextPreview/, "conversation projection must extract a safe latest-message preview");
assert.match(directMessages, /lastSeq > 0[\s\S]*query\("dmMessages" as any\)[\s\S]*withIndex\("by_conversation_seq"[\s\S]*eq\("conversationId", row\._id\)\.eq\("seq", lastSeq\)/, "conversation projection must read the latest message by conversation and sequence");
assert.match(directMessages, /last_message_preview: lastMessage \? readDirectMessageTextPreview\(lastMessage\.contentJson\) : null/, "conversation projection must expose the latest text preview");
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
assert.match(directMessages, /ctx\.db\.patch\(participant\._id,[\s\S]*lastReadSeq: lastSeq/, "read mutation must advance the participant read cursor");
assert.match(directMessages, /Active participants can read existing DM history; current relationship is rechecked before each send\./, "DM read/send policy must be explicit");
assert.match(dmListMessagesQuery, /requireActiveUserParticipant/, "DM history reads must require active conversation participation");
assert.doesNotMatch(dmListMessagesQuery, /requireDirectConversationSendAccess|requireDirectMessageRelationshipAccess/, "DM history reads must not require current mutual access once someone is an active participant");
assert.match(directMessages, /setDirectTyping = mutation/, "backend must expose a DM typing heartbeat mutation");
assert.match(directMessages, /clearDirectTyping = mutation/, "backend must expose a DM typing clear mutation");
assert.match(directMessages, /listDirectTyping = query/, "backend must expose a live DM typing query");
assert.match(dmSetTypingMutation, /requireActiveUserParticipant/, "typing writes must require active conversation participation");
assert.match(dmSetTypingMutation, /requireProfileSetupCompleteForUser\(ctx, viewerUserId\)/, "typing writes must require profile setup like message sends");
assert.match(dmSetTypingMutation, /requireDirectConversationSendAccess/, "typing writes must require current DM send access");
assert.match(dmSetTypingMutation, /DM_TYPING_DISPLAY_WINDOW_MS/, "typing writes must set a bounded display TTL");
assert.match(dmSetTypingMutation, /query\("dmTypingPresence" as any\)[\s\S]*withIndex\("by_conversation_user"/, "typing writes must upsert by conversation and user");
assert.match(dmClearTypingMutation, /requireActiveUserParticipant/, "typing clears must require active conversation participation");
assert.doesNotMatch(dmClearTypingMutation, /requireDirectConversationSendAccess|requireProfileSetupCompleteForUser|requireDirectMessageRelationshipAccess/, "typing clears must not require current send access");
assert.match(dmClearTypingMutation, /query\("dmTypingPresence" as any\)[\s\S]*withIndex\("by_conversation_user"/, "typing clears must target the viewer row by conversation and user");
assert.match(dmClearTypingMutation, /ctx\.db\.delete\(existing\._id\)/, "typing clears must delete only the viewer's active row");
assert.match(dmListTypingQuery, /requireActiveUserParticipant/, "typing reads must require active conversation participation");
assert.doesNotMatch(dmListTypingQuery, /requireDirectConversationSendAccess|requireDirectMessageRelationshipAccess/, "typing reads must not require current send access");
assert.match(dmListTypingQuery, /withIndex\("by_conversation_displayUntil"[\s\S]*gt\("displayUntil", nowMs\)/, "typing reads must query only non-expired rows through the displayUntil index");
assert.match(dmListTypingQuery, /normalizeIdValue\(row\.userId\) !== normalizeIdValue\(viewerUserId\)/, "typing reads must exclude the viewer");
assert.match(dmListTypingQuery, /MAX_DM_TYPING_PRESENCE_SCAN_ROWS/, "typing reads must stay bounded");
assert.match(account, /dmTypingPresence/, "account deletion must clean DM typing presence rows");
assert.match(anonymousCleanup, /dmTypingPresence/, "anonymous cleanup must include DM typing presence rows");
assert.match(directMessages, /sendDirectMessage = mutation/, "backend must expose direct message sending");
assert.match(directMessages, /generateDirectMessageAttachmentUploadUrl = mutation/, "backend must expose a DM attachment upload URL mutation");
assert.match(dmAttachmentUploadMutation, /requireActiveUserParticipant/, "DM attachment upload must require active conversation participation");
assert.match(dmAttachmentUploadMutation, /requireProfileSetupCompleteForUser\(ctx, viewerUserId\)/, "DM attachment upload must require profile setup");
assert.match(dmAttachmentUploadMutation, /requireDirectConversationSendAccess/, "DM attachment upload must require current send access");
assert.match(dmAttachmentUploadMutation, /ctx\.storage\.generateUploadUrl/, "DM attachment upload must use Convex storage upload URLs");
assert.match(directMessages, /async function requireDirectConversationSendAccess/, "DM sends must have a continuous access guard");
assert.match(directMessages, /requireDirectConversationSendAccess[\s\S]*throw new Error\("dm_conversation_access_required"\)/, "DM send access guard must fail closed with a named policy error");
assert.match(directMessages, /requireDirectConversationSendAccess[\s\S]*listConversationParticipants[\s\S]*participantType === "user"[\s\S]*peerParticipants\.length !== 1/, "DM send access guard must require exactly one active human peer");
assert.match(directMessages, /requireDirectConversationSendAccess[\s\S]*requireDirectMessageRelationshipAccess\(\{[\s\S]*targetUserId: peerUserId,[\s\S]*preferredCommunityId: args\.conversation\.createdFromCommunityId/, "DM send access guard must prefer the original community while allowing any current mutual community");
assert.doesNotMatch(directMessages, /requireDirectConversationSendAccess[\s\S]*requiredCommunityId: args\.conversation\.createdFromCommunityId/, "DM sends must not treat createdFromCommunityId as the only permanent authorization source");
assert.match(directMessages, /sendDirectMessage = mutation[\s\S]*requireDirectConversationSendAccess\(\{[\s\S]*conversation,[\s\S]*viewerUserId/, "send mutation must enforce continuous shared-community access before appending");
assert.match(dmSendMutation, /attachments: v\.optional\(v\.array\(v\.any\(\)\)\)/, "send mutation must accept bounded attachment metadata");
assert.match(dmSendMutation, /normalizeStoredDirectMessageAttachments\(args\.attachments,[\s\S]*enforceWritePolicy: true/, "send mutation must normalize DM attachments with write policy enforcement");
assert.match(dmSendMutation, /dm_message_payload_required/, "send mutation must allow attachment-only messages but reject empty payloads");
assert.match(directMessages, /MAX_DM_STORED_ATTACHMENTS = 8/, "DM attachments must keep a small per-message count limit");
assert.match(directMessages, /MAX_DM_ATTACHMENT_BYTES = 10 \* 1024 \* 1024/, "DM attachments must enforce a 10MB per-file metadata limit");
assert.match(directMessages, /MAX_DM_ATTACHMENT_TOTAL_BYTES = 25 \* 1024 \* 1024/, "DM attachments must enforce a 25MB total metadata limit");
assert.match(directMessages, /dm_attachment_storage_required/, "DM attachments must require uploaded storage ids instead of inline payloads");
assert.doesNotMatch(directMessages, /data_url/, "DM backend must not store raw attachment data URLs");
assert.match(directMessages, /maybeResolveDirectMessageStorageUrl[\s\S]*ctx\.storage\.getUrl[\s\S]*mapDirectMessageContentJsonForRead/, "DM read mapping must resolve stored attachment URLs only after participant-gated reads");
assert.match(dmSendMutation, /contentJson = attachments\.length > 0 \? \{ text, attachments \} : \{ text \}/, "DM send must keep attachments embedded in the message payload");
assert.match(dmSendMutation, /touchActiveConversationParticipantsActivity\(\{[\s\S]*nowMs,[\s\S]*senderParticipantId: participant\._id,[\s\S]*senderLastReadSeq: seq/, "send mutation must update participant inbox activity and mark the sender read through their own message");
assert.doesNotMatch(directMessages, /follow|follower|following/i, "first DM slice must not introduce follow graph semantics");

assert.match(gateway, /ensureCloudDirectConversationFromCommunity/, "web gateway must open or create direct conversations");
assert.match(gateway, /listCloudDirectConversations/, "web gateway must expose the current user's direct conversation list");
assert.doesNotMatch(gateway, /export async function listCloudEligibleDirectMessageRecipients</, "web gateway must not expose the deleted community-scoped recipient lookup");
assert.doesNotMatch(gateway, /directMessages:listEligibleDirectMessageRecipients"/, "web gateway must not call the deleted community-scoped recipient query");
assert.match(gateway, /listCloudEligibleDirectMessageRecipientsForViewer/, "web gateway must expose global viewer-wide recipient lookup");
assert.match(gateway, /directMessages:listEligibleDirectMessageRecipientsForViewer/, "web gateway global recipient lookup must use the canonical backend query");
assert.doesNotMatch(gateway, /DirectMessageRecipientPage|paginationOpts|continueCursor/, "web gateway must not keep deleted recipient pagination contract");
assert.doesNotMatch(communityTypes, /DirectMessageRecipientPage/, "shared community types must not expose deleted recipient pagination metadata");
assert.match(gateway, /listCloudDirectMessages/, "web gateway must list direct messages");
assert.match(gateway, /subscribeCloudDirectConversations/, "web gateway must expose live direct conversation subscriptions");
assert.match(gateway, /subscribeCloudDirectConversations[\s\S]*watchQuery\([\s\S]*directMessages:listMyDirectConversations/, "live DM inbox subscription must watch the canonical inbox query");
assert.match(gateway, /subscribeCloudDirectMessages/, "web gateway must expose live direct message subscriptions");
assert.match(gateway, /sendCloudDirectMessage/, "web gateway must send direct messages");
assert.match(gateway, /uploadCloudDirectMessageAttachmentFile/, "web gateway must upload direct message attachments");
assert.match(gateway, /directMessages:generateDirectMessageAttachmentUploadUrl/, "web gateway must request DM attachment upload URLs from the canonical backend mutation");
assert.match(gateway, /directMessages:sendDirectMessage[\s\S]*attachments: params\.attachments \?\? \[\]/, "web gateway must pass attachment metadata through the canonical send mutation");
assert.match(gateway, /markCloudDirectConversationRead/, "web gateway must expose direct conversation read mutation");
assert.match(gateway, /directMessages:markDirectConversationRead/, "web gateway read mutation must use the canonical backend mutation");
assert.match(gateway, /subscribeCloudDirectTyping/, "web gateway must expose live DM typing subscriptions");
assert.match(gateway, /directMessages:listDirectTyping/, "web gateway typing subscription must watch the canonical backend query");
assert.match(gateway, /setCloudDirectTyping/, "web gateway must expose a DM typing heartbeat");
assert.match(gateway, /directMessages:setDirectTyping/, "web gateway typing heartbeat must use the canonical backend mutation");
assert.match(gateway, /clearCloudDirectTyping/, "web gateway must expose a DM typing clear");
assert.match(gateway, /directMessages:clearDirectTyping/, "web gateway typing clear must use the canonical backend mutation");
assert.match(directTypingHook, /useDirectMessageTypingPresence/, "web must have a dedicated DM typing hook");
assert.match(directTypingHook, /DEFAULT_TYPING_THROTTLE_MS = 2000/, "DM typing heartbeat must be throttled");
assert.match(directTypingHook, /subscribeCloudDirectTyping/, "DM typing hook must subscribe to live backend typing state");
assert.match(directTypingHook, /setCloudDirectTyping/, "DM typing hook must publish typing heartbeats through the backend");
assert.match(directTypingHook, /row\.display_until_ms > nowMs/, "DM typing hook must drop expired presence locally");
assert.match(directTypingHook, /lastSentAtRef\.current = 0/, "DM typing hook must reset heartbeat throttle when conversations change");

assert.match(projection, /activeCommunity:[\s\S]*id: params\.activeCommunity\.id/, "chat panel must receive active community id for DM source context");
assert.match(projection, /onOpenDirectMessageFromCommunity: params\.onOpenDirectMessageFromCommunity/, "community projection must pass profile DM launch requests to the app shell");
assert.match(chatPanel, /onOpenDirectMessageFromCommunity\?: \(targetUserId: string, communityId: string\) => void/, "community chat panel must expose profile DM launch requests");
assert.match(chatPanel, /onOpenDirectMessageFromCommunity\(normalizedTargetUserId, sourceCommunityId\)/, "profile message actions must route to the global DM host with community context");
assert.doesNotMatch(chatPanel, /ensureCloudDirectConversationFromCommunity/, "community chat panel must not create DMs directly");
assert.doesNotMatch(chatPanel, /subscribeCloudDirectMessages/, "community chat panel must not own DM live subscriptions");
assert.doesNotMatch(chatPanel, /sendCloudDirectMessage/, "community chat panel must not own DM sends");
assert.doesNotMatch(chatPanel, /cloudDirectMessagesGateway/, "community chat panel must not import the DM gateway directly");
assert.doesNotMatch(chatPanel, /messages: \[\.\.\.previous\.messages, message\]/, "DM sends must not use local append as the source of truth");
assert.match(chatPanel, /onMessageSender=\{canOpenDirectMessageFromCommunity \? openDirectMessage : undefined\}/, "profile hover message button must open the DM flow only when community context is available");
assert.doesNotMatch(chatPanel, /<WebDirectMessagePanel/, "community chat panel must not render a duplicate right-side DM panel");
assert.doesNotMatch(chatPanel, /follow|follower|following/i, "DM UI slice must not add follow controls");

assert.match(profilePanel, /onMessage\?: \(\) => void \| Promise<void>/, "right profile card must expose a message action");
assert.match(profilePanel, /canMessageProfile = !isSelfProfile && communityContext\.can_message && !isMessageDisabled && Boolean\(onMessage\)/, "right profile message action must be disabled for self or unavailable contexts");
assert.match(profilePanel, /disabled=\{!canMessageProfile\}/, "right profile message button must use resolved profile message eligibility");
assert.match(messageRow, /onMessageSender\?: \(userId: string\) => void \| Promise<void>/, "hover profile card must expose a message action");
assert.match(messageRow, /disabled=\{!canMessageSender\}/, "hover profile message action must be disabled until DM context is available");

assert.match(dmPanel, /From \{communityName\}/, "DM panel must surface source community context");
assert.match(dmPanel, /participant_type === "user"/, "DM panel must resolve the human peer from participants");
assert.match(dmPanel, /Start a direct message from this shared community/, "empty DM state must explain the community-origin model");
assert.match(dmPanel, /import \{ ArrowLeft, MessageCircle, Paperclip, RotateCcw \} from "lucide-react"/, "DM conversation panel must use lucide icons for back, empty, attachment, and retry actions");
assert.match(dmPanel, /DM_AUTO_SCROLL_THRESHOLD_PX/, "DM panel must keep chat-like auto-scroll constrained by a bottom threshold");
assert.match(dmPanel, /scrollMessagesToBottom/, "DM panel must scroll opened or followed conversations to the newest message");
assert.match(dmPanel, /onScroll=\{\(event\) =>/, "DM panel must track whether the viewer is reading older messages before auto-following");
assert.match(dmPanel, /onBackToInbox\?: \(\) => void/, "DM conversation panel must support returning to the inbox when opened globally");
assert.match(dmPanel, /onReadThroughSeq\?: \(seq: number\) => void \| Promise<void>/, "DM conversation panel must report read-through sequence");
assert.match(dmPanel, /props\.onReadThroughSeq\?\.\(lastMessageSeq\)/, "DM conversation panel must mark visible newest messages read");
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
assert.match(dmPanel, /canSendDirectMessage = !props\.isSending && hasComposerPayload && !hasAttachmentBlockers/, "DM composer send button must block while attachments are not ready");
assert.match(dmPanel, /community-dm-attachment-state-overlay/, "DM image composer previews must surface queued, uploading, and failed states");
assert.match(dmPanel, /hasDragFiles[\s\S]*getDragFiles/, "DM panel must detect dropped files without depending only on populated FileList during dragenter");
assert.match(dmPanel, /onDrop=\{canAcceptAttachmentDrop \? onAttachmentDrop : undefined\}/, "DM panel must accept file drops across the panel");
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
assert.match(dmHost, /listCloudEligibleDirectMessageRecipientsForViewer/, "global DM host must load eligible recipients across the viewer's communities");
assert.match(dmHost, /canStartConversation=\{Boolean\(session\)\}/, "global DM host must allow new-message picker from any signed-in page");
assert.doesNotMatch(dmHost, /recipientCursor/, "global DM host must not project fake recipient pagination cursor state");
assert.doesNotMatch(dmHost, /recipientsHasMore/, "global DM host must not project fake recipient pagination availability");
assert.doesNotMatch(dmHost, /mergeDirectMessageRecipients/, "global DM host must not append fake-paged global recipient results");
assert.doesNotMatch(dmHost, /onLoadMoreRecipients|loadMoreRecipients/, "global DM host must not wire fake recipient pagination to the inbox picker");
assert.match(dmHost, /isNewMessageMode/, "global DM host must own the new-message picker mode");
assert.match(dmHost, /ensureCloudDirectConversationFromCommunity\(\{[\s\S]*targetUserId,[\s\S]*communityId/, "new-message picker must open through canonical community-origin DM creation");
assert.match(dmHost, /markCloudDirectConversationRead/, "global DM host must own read-state mutations");
assert.match(dmHost, /onReadThroughSeq=\{\(seq\) =>/, "global DM host must connect visible messages to read-state mutations");
assert.match(dmHost, /ensureCloudDirectConversationFromCommunity/, "global DM host must create DMs from profile launch requests");
assert.match(dmHost, /openRequest: DirectMessageOpenRequest/, "global DM host must accept canonical open requests from profile actions");
assert.match(dmHost, /subscribeCloudDirectMessages<DirectMessage>/, "global DM host must own live direct message subscriptions");
assert.match(dmHost, /useDirectMessageTypingPresence/, "global DM host must own DM typing presence");
assert.match(dmHost, /clearCloudDirectTyping/, "global DM host must clear stale DM typing presence explicitly");
assert.match(dmHost, /clearDirectTypingForConversation/, "global DM host must centralize DM typing clear calls");
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
assert.match(dmHost, /await clearDirectTypingForConversation\(current\.conversation\.id\)/, "global DM host must clear typing presence after a successful send");
assert.match(dmHost, /onComposerBlur=\{\(\) => \{[\s\S]*clearDirectTypingForConversation\(directMessagePanel\.conversation\.id\)/, "global DM host must clear typing presence on composer blur");
assert.match(dmHost, /onBackToInbox=\{\(\) => \{[\s\S]*clearDirectTypingForConversation\(directMessagePanel\.conversation\.id\)/, "global DM host must clear typing presence when leaving a conversation");
assert.match(dmHost, /!nextHasText && typingInputHadTextRef\.current[\s\S]*clearDirectTypingForConversation\(directMessagePanel\.conversation\.id\)/, "global DM host must clear typing presence when the composer becomes empty");
assert.match(dmHost, /WebDirectMessageInboxPanel/, "global DM host must render the inbox panel");
assert.match(dmHost, /WebDirectMessagePanel/, "global DM host must open existing conversations into the live DM panel");
assert.match(dmInboxPanel, /Direct messages/, "DM inbox panel must identify the inbox");
assert.match(dmInboxPanel, /conversation\.last_message_preview/, "DM inbox rows must prefer the latest message preview");
assert.match(dmInboxPanel, /Started in \$\{communityName\}/, "DM inbox rows must preserve community-origin provenance as the no-message fallback");
assert.match(dmInboxPanel, /New message/, "DM inbox must expose a new-message picker view");
assert.match(dmInboxPanel, /Your communities/, "DM recipient picker must be global across viewer communities");
assert.match(dmInboxPanel, /Shared in \$\{communityName\}/, "DM recipient rows must show chosen shared community provenance");
assert.match(dmInboxPanel, /Search members/, "DM recipient picker must be search-oriented");
assert.match(dmInboxPanel, /onSelectRecipient/, "DM recipient picker must select an eligible recipient");
assert.doesNotMatch(dmInboxPanel, /recipientsHasMore/, "DM recipient picker must not render fake global pagination state");
assert.doesNotMatch(dmInboxPanel, /Show more|Search more/, "DM recipient picker must not render fake global pagination controls");
assert.doesNotMatch(dmInboxPanel, /No matches loaded yet/, "DM recipient picker must not expose partial-search copy for an unpaged global list");
assert.match(dmInboxPanel, /No matches\./, "DM recipient search empty state must honestly say no loaded matches");
assert.match(dmInboxPanel, /conversation\.unread_count/, "DM inbox rows must consume unread count");
assert.match(dmInboxPanel, /is-unread/, "DM inbox rows must expose unread state for styling");
assert.match(dmInboxPanel, /community-dm-inbox-row-unread/, "DM inbox rows must render an unread badge");
assert.match(shellChromeShared, /directMessagesButton: ReactNode/, "desktop shell props must expose the global DM button");
assert.match(shellChromeProps, /directMessagesButton: params\.directMessagesButton/, "shell prop builder must pass the global DM button through");
assert.match(desktopHeader, /workspaceRightPanelToggle\}[\s\S]*directMessagesButton\}[\s\S]*communityHomeButton\}/, "desktop header order must be panel, DM, community");
assert.match(app, /className=\{`icon-button direct-messages-topbar-button/, "app shell must render a top-right direct messages button");
assert.match(app, /handleOpenDirectMessageFromCommunity/, "app shell must own the profile-to-DM launch handler");
assert.match(app, /openRequest=\{directMessageOpenRequest\}/, "app shell must pass canonical open requests to the global DM host");
assert.doesNotMatch(app, /activeCommunityId=\{activeCommunity\?\.id \?\? null\}/, "app shell must not scope the global DM picker to the active community");
assert.doesNotMatch(app, /activeCommunityName=\{activeCommunity\?\.name \?\? null\}/, "app shell must not label the global DM picker as the active community");
assert.match(app, /directMessagesUnreadCount/, "app shell must own top-bar DM unread count");
assert.match(app, /onUnreadCountChange=\{setDirectMessagesUnreadCount\}/, "global DM host must feed top-bar unread state");
assert.match(app, /<WebDirectMessagesHost/, "app shell must mount the global direct messages host");
assert.match(css, /\.community-dm-panel/, "DM panel must have glass side-panel styling");
assert.doesNotMatch(css, /\.community-dm-panel::before|\.community-dm-panel::after/, "DM panel must not cover readable inbox or chat content with global pseudo-element scrims");
assert.match(css, /\.community-dm-panel-messages \{[\s\S]*overflow: auto/, "DM conversation messages must own scrolling without a readability-blocking overlay");
assert.match(css, /\.community-dm-inbox-list \{[\s\S]*overflow: auto/, "DM inbox rows must own scrolling without a readability-blocking overlay");
assert.match(css, /\.community-dm-recipient-list \{[\s\S]*overflow: auto/, "DM recipient rows must own scrolling without a readability-blocking overlay");
assert.match(css, /\.community-dm-panel-back \{[\s\S]*border: 0;[\s\S]*background: transparent/, "DM conversation back control must stay flat, not circular");
assert.match(css, /\.community-dm-panel-typing/, "DM conversation panel must style typing presence");
assert.match(css, /\.community-dm-panel-typing\.is-empty \{[\s\S]*display: none/, "empty DM typing row must not steal vertical message space");
assert.match(css, /\.community-dm-attachment-state-overlay/, "DM composer images must style attachment upload state overlays");
assert.match(css, /\.community-dm-attachment-retry/, "DM composer must style failed attachment retry controls");
assert.match(css, /\.community-dm-attachment-item\.is-failed/, "DM composer file chips must style failed attachment state");
assert.match(css, /\.community-dm-inbox-panel/, "DM inbox panel must use the shared glass side-panel styling");
assert.match(css, /\.community-dm-inbox-panel \{[\s\S]*height: auto/, "DM inbox must size to content instead of forcing full conversation-panel height");
assert.match(css, /\.community-dm-inbox-avatar \{[\s\S]*position: relative/, "DM inbox avatars must provide the canonical positioned frame for focused avatar crops");
assert.match(css, /\.community-dm-inbox-icon-button/, "DM inbox must style the new-message icon button");
assert.match(css, /\.community-dm-recipient-search/, "DM recipient picker must style member search");
assert.match(css, /\.community-dm-recipient-row/, "DM recipient picker must style recipient rows");
assert.doesNotMatch(css, /\.community-dm-recipient-more/, "DM recipient picker must not keep CSS for deleted fake pagination control");
assert.match(css, /\.direct-messages-topbar-button \{[\s\S]*position: relative/, "top-right DM button must anchor the unread badge");
assert.match(css, /\.community-dm-inbox-row-unread/, "DM inbox must style unread badges");
assert.match(css, /\.community-dm-inbox-row\.is-unread \.community-dm-inbox-row-meta \{[\s\S]*color: var\(--text-primary\)[\s\S]*font-weight: 720/, "unread DM inbox previews must read as new");
assert.match(css, /\.community-dm-inbox-row-unread \{[\s\S]*width: 8px[\s\S]*height: 8px/, "DM inbox unread indicator must be a small dot");
assert.match(packageJson, /check:direct-messages-contract-proof/, "package scripts must expose the DM contract proof");

console.log("PASS: direct messages are community-origin, participant-based, and follow-free.");

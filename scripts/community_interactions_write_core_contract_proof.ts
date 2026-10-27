import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const interactions = readFileSync(join(root, "convex/communityInteractions.ts"), "utf8");
const channelAccess = readFileSync(join(root, "convex/communityChannelAccess.ts"), "utf8");
assert.match(channelAccess, /resolveCommunityChannelActor[\s\S]*await requireCommunityChatAccess\(args\)/,
  "channel actors must retain the canonical community access gate");
const crons = readFileSync(join(root, "convex/crons.ts"), "utf8");
const sourceUrlPolicy = readFileSync(join(root, "convex/communitySourceUrlPolicy.ts"), "utf8");
const contract = readFileSync(join(root, "docs/community-interaction-substrate-contract-v1.md"), "utf8");
const packageJson = readFileSync(join(root, "package.json"), "utf8");

function section(source: string, heading: string): string {
  const startToken = `## ${heading}`;
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${heading} section should exist`);
  const next = source.indexOf("\n## ", start + startToken.length);
  return source.slice(start, next < 0 ? source.length : next);
}

function exportedConstBlock(source: string, exportName: string): string {
  const startToken = `export const ${exportName}`;
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${exportName} should exist`);
  const next = source.indexOf("\nexport const ", start + startToken.length);
  const block = source.slice(start, next < 0 ? source.length : next);
  // Public functions delegate to a shared core (`handler: (ctx, args) => xCore(...)`);
  // read the core too, so checks follow the behavior rather than the wrapper.
  const core = block.match(/handler:\s*(?:async\s*)?\([^)]*\)\s*=>\s*(\w+Core)\(/)?.[1];
  return core ? `${block}\n${functionBlock(source, core)}` : block;
}

function functionBlock(source: string, functionName: string): string {
  const startTokens = [`async function ${functionName}`, `function ${functionName}`];
  const startCandidate = startTokens
    .map((token) => source.indexOf(token))
    .filter((value) => value >= 0)
    .sort((a, b) => a - b)[0];
  assert.notEqual(startCandidate, undefined, `${functionName} should exist`);
  const start = startCandidate as number;
  const nextFunction = source.indexOf("\nfunction ", start + functionName.length);
  const nextAsyncFunction = source.indexOf("\nasync function ", start + functionName.length);
  const nextExportConst = source.indexOf("\nexport const ", start + functionName.length);
  const candidates = [nextFunction, nextAsyncFunction, nextExportConst].filter((value) => value >= 0);
  const end = candidates.length > 0 ? Math.min(...candidates) : source.length;
  return source.slice(start, end);
}

function assertNoExportedConst(source: string, exportName: string): void {
  assert.equal(
    source.indexOf(`export const ${exportName}`),
    -1,
    `${exportName} should not be publicly exported`,
  );
}

assert.match(
  packageJson,
  /"check:community-interactions-write-core-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_interactions_write_core_contract_proof\.ts"/,
  "package scripts should expose the community interactions write-core proof",
);

const writeCoreSection = section(contract, "Current Write-Core Slice");
assert.match(
  writeCoreSection,
  /createCommunityInteractionComposerMessage[\s\S]*generic public root\/reply mutations are not exposed[\s\S]*user mentions are capped, deduped, resolved to existing users, and must pass community chat access/,
  "contract should document the composer-only public write boundary",
);
assert.doesNotMatch(
  writeCoreSection,
  /createCommunityInteractionRoot|createCommunityInteractionReply/,
  "contract should not present generic root/reply mutations as active public write APIs",
);
assert.match(
  contract,
  /Current Canonical Composer Bridge Slice[\s\S]*createCommunityInteractionComposerMessage[\s\S]*canonical chat writer[\s\S]*must not create legacy `communityChatMessages`/,
  "contract should document the active canonical composer bridge slice",
);
assert.match(
  contract,
  /supplied reply target must resolve to a live, channel-addressable reply in the same community, channel, and root[\s\S]*stale or invalid targets fail closed[\s\S]*reply idempotency binds the resolved canonical target/,
  "contract should document fail-closed target authorization and target-bound idempotency",
);
assert.match(
  contract,
  /write paths do not fetch URLs, scrape pages, process media, or resolve workspace previews synchronously/,
  "contract should delete synchronous unfurls from interaction writes",
);
assert.match(
  contract,
  /Current Link Presentation Slice[\s\S]*ordinary links render as authored blue links[\s\S]*YouTube videos and explicit HTTPS PDF links[\s\S]*community chat does not invoke an interaction-preview mode/,
  "contract should document the deterministic simple-link boundary",
);

assertNoExportedConst(interactions, "createCommunityInteractionRoot");
assertNoExportedConst(interactions, "createCommunityInteractionReply");

assert.doesNotMatch(
  interactions,
  /contentBlockInputValidator|visibilityScopeValidator|workspaceRefKindValidator|mentionKindValidator/,
  "generic write validators should stay deleted with the public generic write API",
);
assert.doesNotMatch(
  interactions,
  /v\.any\(\)|payloadJson/,
  "interaction write core should not reintroduce untyped message payloads",
);
assert.doesNotMatch(
  interactions,
  /parentReplyId|childReply|replyDepth|depth:/,
  "interaction write core should not model recursive reply drawers",
);
assert.doesNotMatch(
  interactions,
  /httpAction|scrape|crawler|processMedia/,
  "interaction writes should not introduce synchronous scraping or media-processing paths",
);
assert.doesNotMatch(
  interactions,
  /generateUploadUrl/,
  "interaction writes should not create upload URLs inline",
);
assert.doesNotMatch(
  interactions,
  /upsertCommunitySourceTrace|recordTrustedCommunitySourceTraceCore|communitySourceTraces" as any/,
  "first write-core slice should not promote interactions into community memory",
);
assert.match(
  interactions,
  /MAX_INTERACTION_BLOCKS_PER_WRITE/,
  "write core should bound canonical content block hydration",
);
assert.match(
  interactions,
  /normalizeIdempotencyKey[\s\S]*interaction_idempotency_key_required/,
  "write core should require idempotency keys",
);
assert.match(
  interactions,
  /getExistingRootByIdempotencyKey[\s\S]*by_community_idempotencyKey/,
  "root writes should read existing roots by community idempotency key",
);
assert.match(
  interactions,
  /getExistingReplyByIdempotencyKey[\s\S]*by_community_idempotencyKey/,
  "reply writes should read existing replies by community idempotency key",
);

// The public mutation and its trusted-member twin share one argument shape and
// one core; read them together as the composer write path.
const composerArgsStart = interactions.indexOf("const communityInteractionComposerArgs = {");
assert.notEqual(composerArgsStart, -1, "communityInteractionComposerArgs should exist");
const createComposerMessage =
  interactions.slice(composerArgsStart, interactions.indexOf("\n  };", composerArgsStart) + 5) +
  functionBlock(interactions, "createCommunityInteractionComposerMessageCore");
const canonicalReplyTargetResolver = functionBlock(
  interactions,
  "resolveOptionalReplyTargetForCanonicalComposer",
);
assert.match(
  createComposerMessage,
  /resolveUserIdForAuthenticatedRequest[\s\S]*resolveCommunityChannelActor[\s\S]*requireProfileSetupCompleteForUser/,
  "composer bridge should reuse authenticated community chat/profile gates",
);
assert.match(
  createComposerMessage,
  /idempotencyKey: v\.string\(\)[\s\S]*text: v\.string\(\)[\s\S]*rootId: v\.optional[\s\S]*replyToMessageId: v\.optional[\s\S]*mentions: v\.optional\([\s\S]*userId: v\.optional\(v\.string\(\)\)[\s\S]*agentKey: v\.optional\(v\.string\(\)\)[\s\S]*roleKey: v\.optional\(v\.string\(\)\)[\s\S]*\)/,
  "composer bridge should expose only the canonical composer write shape",
);
assert.doesNotMatch(
  createComposerMessage,
  /kind: v\.|visibilityScope: v\.|contentBlocks: v\./,
  "composer bridge should not expose root kind, visibility, or typed block inputs to members",
);
assert.match(
  createComposerMessage,
  /attachments: args\.attachments \?\? \[\][\s\S]*resolveInteractionAttachmentClaims\([\s\S]*!text && attachments\.length === 0[\s\S]*interaction_content_required/,
  "composer bridge should allow attachment-only sends while rejecting empty payloads",
);
assert.match(
  createComposerMessage,
  /const contentBlocks: NormalizedContentBlock\[\] = text[\s\S]*blockType: "markdown_text"[\s\S]*extractLinkBlocksFromText\(text\)/,
  "composer bridge should normalize text into canonical typed blocks and async link blocks",
);
assert.match(
  createComposerMessage,
  /resolveMentionedUserIdsForInteractionWrite\(\{[\s\S]*communityId: args\.communityId[\s\S]*mentions: args\.mentions \?\? \[\]/,
  "composer bridge should validate mentioned users before inserting mention rows",
);
assert.match(
  createComposerMessage,
  /const actorType = forMember \? "community_agent" : "human"[\s\S]*resolveAuthorizedCommunityChannel\(\{[\s\S]*actor: channelActor[\s\S]*capability: "canPost"[\s\S]*channelId: args\.channelId[\s\S]*ensureGeneralForWrite: true[\s\S]*communityInteractionRoots" as any[\s\S]*channelId: requestedChannel\._id[\s\S]*actorType,[\s\S]*actorUserId: userId[\s\S]*kind: "discussion"[\s\S]*status: "live"[\s\S]*visibilityScope: "community"/,
  "composer root writes should bind the authorized requested channel and retain explicit human or community-agent-for-member attribution",
);
assert.match(
  createComposerMessage,
  /existingChannel[\s\S]*normalizeIdValue\(existingChannel\._id\)[\s\S]*normalizeIdValue\(requestedChannel\._id\)[\s\S]*interaction_idempotency_key_conflict/,
  "composer root idempotency must bind the original channel",
);
assert.match(createComposerMessage, /root\.composerPayloadHash !== composerPayloadHash/,
  "root retries must compare the original full payload fingerprint");
assert.match(createComposerMessage, /reply\.composerPayloadHash !== composerPayloadHash/,
  "reply retries must compare the original full payload fingerprint");
assert.doesNotMatch(createComposerMessage, /contentSummary !== summary/,
  "editable and truncated summaries must not determine retry identity");
assert.match(
  createComposerMessage,
  /const idempotencyKey = composerIdempotencyKey\([\s\S]*normalizeIdempotencyKey\(args\.idempotencyKey\),[\s\S]*"root",[\s\S]*actorType,[\s\S]*\)[\s\S]*getExistingRootByIdempotencyKey/,
  "composer root writes should be idempotent in the actor-specific root namespace",
);
assert.match(
  createComposerMessage,
  /if \(normalizeIdValue\(root\.communityId\) !== normalizeIdValue\(args\.communityId\)\)[\s\S]*interaction_root_community_mismatch[\s\S]*root\.status !== "live" \|\| root\.lockedAt[\s\S]*interaction_root_closed/,
  "composer reply writes should verify root community and live/open state",
);
assert.match(
  createComposerMessage,
  /resolveOptionalReplyTargetForCanonicalComposer\(\{[\s\S]*rootChannel,[\s\S]*replyToMessageId: args\.replyToMessageId \?\? null/,
  "composer reply targets should resolve through the channel-aware canonical helper",
);
assert.match(
  canonicalReplyTargetResolver,
  /candidate\.status !== "live"[\s\S]*!interactionIsChannelAddressable\(candidate\)[\s\S]*candidate\.communityId[\s\S]*candidate\.rootId[\s\S]*!interactionBelongsToChannel\(candidate, args\.rootChannel\)[\s\S]*interaction_target_reply_invalid/,
  "canonical reply targets must fail closed across status, visibility, community, root, and channel boundaries",
);
assert.match(
  createComposerMessage,
  /resolveReplyVisibilityScope\(root\.visibilityScope, root\.visibilityScope\)/,
  "composer replies should inherit root visibility without a member-supplied broader scope",
);
assert.match(
  createComposerMessage,
  /requireChannelForAddressableRoot\(\{ ctx, root, actor: channelActor \}\)[\s\S]*normalizeIdValue\(requestedChannel\._id\)[\s\S]*interaction_channel_mismatch[\s\S]*communityInteractionReplies" as any[\s\S]*channelId: rootChannel\._id/,
  "composer replies should inherit the server-validated channel from their root and reject a caller mismatch",
);
assert.match(
  createComposerMessage,
  /const seq = await nextReplySeq\(ctx, root\._id\)/,
  "composer reply writes should use the indexed one-level drawer sequence helper",
);
assert.match(
  createComposerMessage,
  /ctx\.db\.patch\(root\._id as any,[\s\S]*replyCount: Math\.max\(0, Math\.floor\(root\.replyCount \?\? 0\)\) \+ 1[\s\S]*lastReplyAt: nowMs/,
  "composer reply writes should update root reply count and last reply timestamp",
);
assert.match(
  createComposerMessage,
  /if \([\s\S]*reply &&[\s\S]*normalizeIdValue\(reply\.rootId\) !== normalizeIdValue\(root\._id\)[\s\S]*normalizeIdValue\(reply\.targetReplyId\) !==[\s\S]*normalizeIdValue\(replyTarget\.targetReplyId\)[\s\S]*interaction_idempotency_key_conflict/,
  "composer reply idempotency must bind both the root and exact canonical target",
);
assert.match(
  createComposerMessage,
  /claimInteractionAttachmentsForTarget\(\{[\s\S]*rootId: root\._id[\s\S]*attachments[\s\S]*claimInteractionAttachmentsForTarget\(\{[\s\S]*replyId: reply\._id[\s\S]*attachments/,
  "composer bridge should claim canonical attachment rows for roots and replies",
);
assert.match(
  createComposerMessage,
  /rows:\s*\[\]/,
  "composer bridge should return an empty legacy rows array",
);
assert.doesNotMatch(
  createComposerMessage,
  /createLegacyCompatibilityChatMessageForInteraction|ensureLegacyCompatibilityChatThread|insertLegacyChatLinkIfMissing|mapLegacyCompatibilityMessageRow|communityChatMessages" as any|communityChatThreads" as any|communityInteractionLegacyChatLinks" as any/,
  "composer bridge should not create legacy compatibility rows or links",
);
assert.doesNotMatch(
  createComposerMessage,
  /legacyChatIdempotencyKey|legacy_chat_message:/,
  "composer bridge should not use the legacy chat adapter idempotency namespace",
);
assert.doesNotMatch(
  createComposerMessage,
  /createCommunityInteractionRoot|createCommunityInteractionReply/,
  "composer bridge should not call public root or reply mutations",
);
assert.doesNotMatch(
  createComposerMessage,
  /scheduleEmbedEnrichment|enrichInteractionEmbed|communityInteractionEmbedRefresh/,
  "composer bridge should not schedule or enrich generic link previews",
);
assert.doesNotMatch(
  createComposerMessage,
  /\bfetch\s*\(|ctx\.runAction|ctx\.storage\.getUrl|generateUploadUrl|scrape|crawler|processMedia/,
  "composer bridge should not synchronously fetch URLs, run actions, resolve storage URLs, generate upload URLs, scrape, or process media",
);

const mentionResolver = functionBlock(interactions, "resolveMentionedUserIdsForInteractionWrite");
assert.match(
  mentionResolver,
  /MAX_INTERACTION_MENTIONS_PER_WRITE[\s\S]*interaction_mentions_limit_exceeded/,
  "mention resolver should cap mentions per write",
);
assert.match(
  mentionResolver,
  /normalizeId\("users" as any, rawUserId\)[\s\S]*withIndex\("by_authSubject"[\s\S]*interaction_mention_user_not_found/,
  "mention resolver should resolve existing users by canonical id or auth subject",
);
assert.match(
  functionBlock(interactions, "insertCommunityInteractionMentionRows"),
  /resolveNotificationRecipientSource\([\s\S]*interaction_mention_user_not_allowed/,
  "mention insertion must authorize recipients against the persisted source room in the write transaction",
);
assert.match(
  mentionResolver,
  /interactionTextContainsHandleMention\(args\.text, user\.handle \?\? user\.normalizedHandle\)[\s\S]*interaction_mention_token_missing/,
  "mention resolver should reject user mentions whose @handle token is missing from final text",
);
assert.match(
  mentionResolver,
  /agentKey !== "community_agent"[\s\S]*interactionTextContainsCommunityAgentMention\(\{[\s\S]*communityId: args\.communityId[\s\S]*text: args\.text[\s\S]*interaction_mention_token_missing[\s\S]*out\.push\(\{ kind: "community_agent", agentKey \}\)/,
  "mention resolver should reject canonical community-agent mentions unless the community agent token is visible in final text",
);

const targetLoader = functionBlock(interactions, "loadCommunityInteractionTarget");
assert.match(
  targetLoader,
  /ctx\.db\.get\(args\.targetId as any\)[\s\S]*interaction_target_not_found[\s\S]*isInteractionRootRow[\s\S]*isInteractionReplyRow[\s\S]*interaction_target_type_mismatch/,
  "target loader should reject missing or wrong-table target ids",
);

for (const exportName of ["toggleCommunityInteractionReaction", "editCommunityInteractionMessage"] as const) {
  const block = exportedConstBlock(interactions, exportName);
  assert.match(
    block,
    /loadCommunityInteractionTarget\([\s\S]*assertLiveInteractionTarget\(target\)[\s\S]*requireCommunityChatAccess/,
    `${exportName} should validate target type, live state, and community access`,
  );
}

const deleteMessage = exportedConstBlock(interactions, "deleteCommunityInteractionMessage");
assert.match(
  deleteMessage,
  /loadCommunityInteractionTarget\([\s\S]*requireCommunityChatAccess[\s\S]*requireCommunityModerator/,
  "delete should validate target type/community and require owner or moderator authority",
);

assert.match(
  sourceUrlPolicy,
  /COMMUNITY_SOURCE_URL_DENIED_HOSTNAME_SUFFIXES[\s\S]*"\.localhost"[\s\S]*"\.internal"[\s\S]*"\.arpa"[\s\S]*"\.invalid"/,
  "shared source URL policy should deny local-only hostname suffixes",
);
assert.match(
  sourceUrlPolicy,
  /function isPrivateOrReservedIpv4[\s\S]*10\.0\.0\.0[\s\S]*127\.0\.0\.0[\s\S]*169\.254\.0\.0[\s\S]*172\.16\.0\.0[\s\S]*192\.168\.0\.0/,
  "shared source URL policy should classify private and link-local IPv4 ranges",
);
assert.match(
  sourceUrlPolicy,
  /isDeniedCommunitySourceHostname[\s\S]*localhost[\s\S]*metadata\.google\.internal[\s\S]*isLiteralIpv4[\s\S]*hasEmbeddedPrivateIpv4/,
  "shared source URL policy should reject local, literal IP, and embedded-private-IP hosts",
);
assert.match(
  sourceUrlPolicy,
  /requireSafeCommunitySourceUrl[\s\S]*parsed\.protocol !== "https:"[\s\S]*community_source_url_https_required[\s\S]*parsed\.username \|\| parsed\.password[\s\S]*community_source_url_credentials_not_supported[\s\S]*parsed\.port && parsed\.port !== "443"[\s\S]*community_source_url_port_not_supported/,
  "shared source URL policy should allow only public-shaped HTTPS source URLs",
);
assert.match(
  sourceUrlPolicy,
  /requireSafeCommunitySourceFetcherEndpoint[\s\S]*community_source_url_fetcher_not_configured[\s\S]*parsed\.protocol !== "https:"[\s\S]*community_source_url_fetcher_invalid[\s\S]*isDeniedCommunitySourceHostname/,
  "shared source URL policy should validate first-party fetcher endpoints",
);

assert.match(
  interactions,
  /function extractLinkBlocksFromText\(text: string\)[\s\S]*extractCommunityInteractionLinkSources\([\s\S]*requireSafeCommunitySourceUrl\(rawUrl, MAX_INTERACTION_URL_CHARS\)/,
  "link block normalization should share extraction with optimistic messages and require the safe source URL policy",
);

assert.doesNotMatch(
  interactions,
  /scheduleEmbedEnrichment|enrichInteractionEmbed|applyInteractionEmbedEnrichment|interaction_embed_v2/,
  "interaction writes should retain no generic link-preview producer or enrichment machinery",
);
assert.doesNotMatch(
  crons,
  /community interaction previews|scheduleDueInteractionEmbedPreviewRefresh/,
  "the removed preview state machine should not retain a repair cron",
);
assert.match(
  interactions,
  /insertContentBlocksForTarget[\s\S]*block\.blockType === "workspace_ref"[\s\S]*embedKind: "workspace_ref"[\s\S]*block\.blockType === "link" \? \{ url: block\.url \} : \{\}/,
  "content blocks should store link URL semantics while reserving embed rows for protected workspace references",
);
assert.match(
  interactions,
  /editCommunityInteractionTargetCore[\s\S]*blockType: "markdown_text"[\s\S]*extractLinkBlocksFromText\(args\.text\)[\s\S]*insertContentBlocksForTarget/,
  "editing should rebuild typed link blocks from current text so removed URLs cannot leave stale projection state",
);
assert.match(
  interactions,
  /communityInteractionMentions" as any[\s\S]*mentionKind: spec\.kind[\s\S]*spec\.kind === "user"[\s\S]*mentionedUserId[\s\S]*spec\.kind === "community_agent"[\s\S]*mentionedAgentKey[\s\S]*notifyState: "pending"/,
  "validated user and canonical community-agent mentions should create pending mention rows",
);
assert.doesNotMatch(
  interactions,
  /block\.blockType === "mention"/,
  "content blocks must not act as a second mention-row writer",
);
assert.match(
  interactions,
  /args\.mentions\?\.some\(\(mention\) => Boolean\(String\(mention\.agentKey[\s\S]*interaction_mention_agent_self_reference/,
  "community-agent-authored turns must reject community-agent self-mentions",
);
console.log("community_interactions_write_core_contract_proof: ok");

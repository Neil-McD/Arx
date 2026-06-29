import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const interactions = readFileSync(join(root, "convex/communityInteractions.ts"), "utf8");
const sourceUrlPolicy = readFileSync(join(root, "convex/communitySourceUrlPolicy.ts"), "utf8");
const communityFacade = readFileSync(join(root, "convex/community.ts"), "utf8");
const contract = readFileSync(join(root, "docs/community-interaction-substrate-contract-v1.md"), "utf8");
const packageJson = readFileSync(join(root, "package.json"), "utf8");

function exportedConstBlock(source: string, exportName: string): string {
  const startToken = `export const ${exportName}`;
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${exportName} should exist`);
  const next = source.indexOf("\nexport const ", start + startToken.length);
  return source.slice(start, next < 0 ? source.length : next);
}

assert.match(
  packageJson,
  /"check:community-interactions-write-core-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_interactions_write_core_contract_proof\.ts"/,
  "package scripts should expose the community interactions write-core proof",
);

assert.match(
  contract,
  /Current Write-Core Slice[\s\S]*createCommunityInteractionRoot[\s\S]*createCommunityInteractionReply/,
  "contract should document the active write-core slice",
);
assert.match(
  contract,
  /Current Canonical Composer Bridge Slice[\s\S]*createCommunityInteractionComposerMessage[\s\S]*canonical roots\/replies before legacy compatibility rows/,
  "contract should document the active canonical composer bridge slice",
);
assert.match(
  contract,
  /write paths do not fetch URLs, scrape pages, process media, or resolve workspace previews synchronously/,
  "contract should delete synchronous unfurls from interaction writes",
);
assert.match(
  contract,
  /Current Async Link Embed Enrichment Slice[\s\S]*Convex never fetches the user-provided source URL directly[\s\S]*source URL fetcher remains authoritative for DNS resolution checks/,
  "contract should document the async link embed fetch boundary",
);
assert.match(
  contract,
  /human-authored writes cannot create `agent_signal` roots[\s\S]*reply visibility cannot be broader than root visibility/,
  "contract should constrain first-slice human writes and reply visibility",
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
  /communityInteractionAttachments" as any[\s\S]*insert|generateUploadUrl/,
  "first write-core slice should not migrate attachment upload creation yet",
);
assert.doesNotMatch(
  interactions,
  /upsertCommunitySourceTrace|recordTrustedCommunitySourceTraceCore|communitySourceTraces" as any/,
  "first write-core slice should not promote interactions into community memory",
);

assert.match(
  interactions,
  /const contentBlockInputValidator = v\.union\([\s\S]*v\.literal\("markdown_text"\)[\s\S]*v\.literal\("link"\)[\s\S]*v\.literal\("workspace_ref"\)[\s\S]*v\.literal\("mention"\)/,
  "write core should accept only typed first-slice content blocks",
);
assert.match(
  interactions,
  /MAX_INTERACTION_BLOCKS_PER_WRITE/,
  "write core should bound content block count",
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

const createRoot = exportedConstBlock(interactions, "createCommunityInteractionRoot");
assert.doesNotMatch(
  createRoot,
  /contentJson|v\.any\(\)|payloadJson/,
  "public root write should not accept untyped legacy chat payloads",
);
assert.match(
  createRoot,
  /resolveUserIdForAuthenticatedRequest[\s\S]*requireCommunityChatAccess[\s\S]*requireProfileSetupCompleteForUser/,
  "root write should reuse authenticated community chat/profile gates",
);
assert.match(
  createRoot,
  /const existing = await getExistingRootByIdempotencyKey[\s\S]*if \(existing\) return await mapRootBundle\(ctx, existing, true\)/,
  "root write should return existing root bundle on duplicate idempotency key",
);
assert.match(
  createRoot,
  /actorType: "human"[\s\S]*actorUserId: userId/,
  "first root write slice should be human-authored only",
);
assert.match(
  createRoot,
  /args\.kind === "agent_signal"[\s\S]*interaction_agent_signal_actor_required/,
  "first human root write slice should reject agent_signal roots",
);
assert.doesNotMatch(
  createRoot,
  /actorType: v\.|actorAgentKey: v\.|actorType: args\.actorType/,
  "public root write args should not accept autonomous actor attribution in this slice",
);
assert.match(
  createRoot,
  /insertContentBlocksForTarget\([\s\S]*rootId[\s\S]*blocks: contentBlocks/,
  "root write should write normalized content blocks after root creation",
);
assert.doesNotMatch(
  createRoot,
  /\bfetch\s*\(|ctx\.scheduler|ctx\.runAction|ctx\.storage\.getUrl|scheduleEmbedEnrichment/,
  "public root write should not fetch URLs, schedule enrichment, run actions, or resolve storage URLs",
);

const createReply = exportedConstBlock(interactions, "createCommunityInteractionReply");
assert.doesNotMatch(
  createReply,
  /contentJson|v\.any\(\)|payloadJson/,
  "public reply write should not accept untyped legacy chat payloads",
);
assert.match(
  createReply,
  /rootId: v\.id\("communityInteractionRoots"\)/,
  "reply write should attach directly to a root",
);
assert.match(
  createReply,
  /targetReplyId: v\.optional\(v\.union\(v\.id\("communityInteractionReplies"\), v\.null\(\)\)\)/,
  "reply target should be optional quote/context only",
);
assert.match(
  createReply,
  /targetReply[\s\S]*normalizeIdValue\(targetReply\.rootId\) !== normalizeIdValue\(root\._id\)[\s\S]*interaction_target_reply_invalid/,
  "reply write should reject target replies outside the same root",
);
assert.match(
  interactions,
  /resolveReplyVisibilityScope[\s\S]*interaction_reply_visibility_exceeds_root/,
  "reply writes should not allow broader visibility than the root",
);
assert.match(
  interactions,
  /async function nextReplySeq\(ctx: any, rootId: any\)[\s\S]*withIndex\("by_root_seq"[\s\S]*\.order\("desc"\)[\s\S]*\.first\(\)[\s\S]*Math\.max\(0, Math\.floor\(last\?\.seq \?\? 0\)\) \+ 1/,
  "reply writes should derive one-level drawer sequence from the latest indexed reply seq",
);
assert.match(
  createReply,
  /const seq = await nextReplySeq\(ctx, root\._id\)/,
  "reply write should use the indexed one-level drawer sequence helper",
);
assert.match(
  createReply,
  /ctx\.db\.patch\(root\._id as any,[\s\S]*replyCount: Math\.max\(0, Math\.floor\(root\.replyCount \?\? 0\)\) \+ 1[\s\S]*lastReplyAt: nowMs/,
  "reply write should update root reply count and last reply timestamp",
);
assert.match(
  createReply,
  /if \(existing\) \{[\s\S]*normalizeIdValue\(existing\.rootId\) !== normalizeIdValue\(root\._id\)[\s\S]*interaction_idempotency_key_conflict[\s\S]*return await mapReplyBundle\(ctx, existing, true\)/,
  "reply write should be idempotent only within the same root",
);
assert.match(
  createReply,
  /actorType: "human"[\s\S]*actorUserId: userId/,
  "first reply write slice should be human-authored only",
);
assert.match(
  createReply,
  /insertContentBlocksForTarget\([\s\S]*replyId[\s\S]*blocks: contentBlocks/,
  "reply write should write normalized content blocks against the reply target",
);
assert.doesNotMatch(
  createReply,
  /insertContentBlocksForTarget\([\s\S]{0,220}rootId: root\._id[\s\S]{0,220}replyId/,
  "reply content blocks should not also be tagged as root content blocks",
);
assert.doesNotMatch(
  createReply,
  /parentReplyId|replyDepth|depth:/,
  "reply write should not create recursive reply hierarchy fields",
);
assert.doesNotMatch(
  createReply,
  /\bfetch\s*\(|ctx\.scheduler|ctx\.runAction|ctx\.storage\.getUrl|scheduleEmbedEnrichment/,
  "public reply write should not fetch URLs, schedule enrichment, run actions, or resolve storage URLs",
);

const createComposerMessage = exportedConstBlock(interactions, "createCommunityInteractionComposerMessage");
assert.match(
  createComposerMessage,
  /communityInteractionRoots" as any[\s\S]*createLegacyCompatibilityChatMessageForInteraction/,
  "composer bridge should create canonical roots before legacy compatibility rows",
);
assert.match(
  createComposerMessage,
  /communityInteractionReplies" as any[\s\S]*createLegacyCompatibilityChatMessageForInteraction/,
  "composer bridge should create canonical replies before legacy compatibility rows",
);
assert.match(
  createComposerMessage,
  /insertLegacyChatLinkIfMissing[\s\S]*linkKind: "root"[\s\S]*insertLegacyChatLinkIfMissing[\s\S]*linkKind: "reply"/,
  "composer bridge should persist root and reply legacy compatibility links",
);
assert.match(
  createComposerMessage,
  /rows:\s*\[await mapLegacyCompatibilityMessageRow/,
  "composer bridge should preserve the legacy chat response row shape",
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
assert.match(
  createComposerMessage,
  /scheduleEmbedEnrichment\(ctx, inserted\.embedIds\)[\s\S]*scheduleEmbedEnrichment\(ctx, insertedReply\.embedIds\)/,
  "composer bridge should hand pending link embeds to async enrichment after canonical writes",
);
assert.doesNotMatch(
  createComposerMessage,
  /\bfetch\s*\(|ctx\.runAction|ctx\.storage\.getUrl|scrape|crawler|processMedia/,
  "composer bridge should not synchronously fetch URLs, run actions, resolve storage URLs, scrape, or process media",
);

const scheduleEmbedEnrichment = interactions.slice(
  interactions.indexOf("async function scheduleEmbedEnrichment"),
  interactions.indexOf("export const getInteractionEmbedForEnrichment"),
);
assert.match(
  scheduleEmbedEnrichment,
  /ctx\.scheduler\.runAfter\(0, internal\.communityInteractions\.enrichInteractionEmbed/,
  "embed enrichment handoff should be an internal scheduled action",
);
assert.doesNotMatch(
  scheduleEmbedEnrichment,
  /\bfetch\s*\(|ctx\.runAction|ctx\.storage\.getUrl/,
  "embed enrichment scheduler should not do the enrichment work inline",
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
  /function normalizeUrl\(raw: unknown\)[\s\S]*requireSafeCommunitySourceUrl\(raw, MAX_INTERACTION_URL_CHARS\)/,
  "link block normalization should require shared safe source URL policy",
);

const fetchEmbedOpenGraph = interactions.slice(
  interactions.indexOf("async function fetchEmbedOpenGraph"),
  interactions.indexOf("export const enrichInteractionEmbed"),
);
assert.match(
  fetchEmbedOpenGraph,
  /const requestedUrl = requireSafeCommunitySourceUrl\(sourceUrl, MAX_INTERACTION_URL_CHARS\)/,
  "embed enrichment should revalidate the source URL before broker handoff",
);
assert.match(
  fetchEmbedOpenGraph,
  /fetchInteractionEmbedWithTimeout\(resolveInteractionEmbedSourceFetcherEndpoint\(\),[\s\S]*headers: interactionEmbedSourceFetcherHeaders\(\)/,
  "embed enrichment should only call the configured first-party fetcher endpoint",
);
assert.doesNotMatch(
  fetchEmbedOpenGraph,
  /\bfetch\s*\(\s*(sourceUrl|requestedUrl)|process\.env/,
  "embed enrichment must not directly fetch user URLs or read raw process env",
);
assert.match(
  fetchEmbedOpenGraph,
  /max_bytes: INTERACTION_EMBED_SOURCE_FETCHER_MAX_BYTES[\s\S]*max_chars: INTERACTION_EMBED_SOURCE_FETCHER_MAX_CHARS[\s\S]*timeout_ms: INTERACTION_EMBED_SOURCE_FETCHER_TIMEOUT_MS[\s\S]*max_redirects: INTERACTION_EMBED_SOURCE_FETCHER_MAX_REDIRECTS/,
  "embed enrichment should send bounded fetcher limits",
);
assert.match(
  interactions,
  /const INTERACTION_EMBED_SOURCE_FETCHER_MAX_REDIRECTS = 3/,
  "embed enrichment redirect cap should not exceed the first-party broker hard cap",
);
assert.match(
  fetchEmbedOpenGraph,
  /readEmbedFetcherJsonBounded\(response\)[\s\S]*sanitizeEmbedImageUrl\(payload\.og_image\)/,
  "embed enrichment should bound fetcher JSON and sanitize returned image URLs",
);

const enrichInteractionEmbed = exportedConstBlock(interactions, "enrichInteractionEmbed");
assert.match(
  enrichInteractionEmbed,
  /internalAction\(\{[\s\S]*fetchEmbedOpenGraph/,
  "external URL fetching should be isolated to the internal embed enrichment action",
);
assert.match(
  enrichInteractionEmbed,
  /const sourceUrl = requireSafeCommunitySourceUrl\(embed\.sourceUrl, MAX_INTERACTION_URL_CHARS\)[\s\S]*fetchEmbedOpenGraph\(sourceUrl\)[\s\S]*error: boundedEmbedError/,
  "internal embed enrichment action should fail closed on unsafe URLs and bounded errors",
);

assert.match(
  interactions,
  /embedKind: "link"[\s\S]*status: "pending"[\s\S]*normalizedSourceUrl/,
  "link blocks should create pending async embed records",
);
assert.match(
  interactions,
  /embedKind: "workspace_ref"[\s\S]*status: "pending"[\s\S]*workspaceRefKind[\s\S]*workspaceRefId/,
  "workspace reference blocks should create pending async embed records",
);
assert.match(
  interactions,
  /communityInteractionMentions" as any[\s\S]*notifyState: "pending"/,
  "mention blocks should create canonical pending mention records",
);

assert.match(
  communityFacade,
  /createCommunityInteractionReply as createCommunityInteractionReplyImpl[\s\S]*createCommunityInteractionRoot as createCommunityInteractionRootImpl|createCommunityInteractionRoot as createCommunityInteractionRootImpl[\s\S]*createCommunityInteractionReply as createCommunityInteractionReplyImpl/,
  "community facade should import interaction write functions",
);
assert.match(
  communityFacade,
  /export const createCommunityInteractionRoot = createCommunityInteractionRootImpl;[\s\S]*export const createCommunityInteractionReply = createCommunityInteractionReplyImpl;/,
  "community facade should export interaction write functions",
);

console.log("community_interactions_write_core_contract_proof: ok");

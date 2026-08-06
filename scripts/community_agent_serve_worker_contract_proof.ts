import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const worker = readFileSync(join(root, "convex/communityAgentServeWorker.ts"), "utf8");
const conciergeTools = readFileSync(join(root, "shared/communityAgentConciergeTools.ts"), "utf8");
const context = readFileSync(join(root, "convex/communityAgentContext.ts"), "utf8");
const boundary = readFileSync(join(root, "shared/communityAgentRuntimeBoundary.ts"), "utf8");
const crons = readFileSync(join(root, "convex/crons.ts"), "utf8");
const packageJson = readFileSync(join(root, "package.json"), "utf8");
const docs = readFileSync(join(root, "docs/community-agent-cognition-contract-v1.md"), "utf8");

function exportedFunctionBlock(source: string, exportName: string): string {
  const startToken = `export const ${exportName} =`;
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${exportName} should exist`);
  const nextConst = source.indexOf("\nexport const ", start + startToken.length);
  return source.slice(start, nextConst === -1 ? source.length : nextConst);
}

const claimBlock = exportedFunctionBlock(worker, "claimNextCommunityAgentServeRequestInternal");
const readBlock = exportedFunctionBlock(worker, "readCommunityAgentServeRequestContextInternal");
const failBlock = exportedFunctionBlock(worker, "failCommunityAgentServeRequestInternal");
const finalizeBlock = exportedFunctionBlock(worker, "finalizeCommunityAgentServeReplyInternal");
const actionBlock = exportedFunctionBlock(worker, "processQueuedCommunityAgentServeRequestsInternal");

assert.match(
  packageJson,
  /"check:community-agent-serve-worker-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_agent_serve_worker_contract_proof\.ts"/,
  "package scripts should expose the community-agent serve worker proof",
);

assert.match(
  claimBlock,
  /internalMutation[\s\S]*query\("communityAgentServeRequests" as any\)[\s\S]*withIndex\("by_status_createdAt"[\s\S]*q\.eq\("status", "queued"\)[\s\S]*status: "running"/,
  "serve worker should claim queued requests by moving them to running",
);
assert.match(
  claimBlock,
  /requestId: v\.optional\(v\.id\("communityAgentServeRequests"\)\)[\s\S]*ctx\.db\.get\(args\.requestId as any\)[\s\S]*status: "running"/,
  "serve worker should support claiming one explicitly scheduled request",
);
assert.match(
  claimBlock,
  /query\("communityAgentServeRequests" as any\)[\s\S]*q\.eq\("status", "running"\)[\s\S]*SERVE_WORKER_STALE_RUNNING_MS[\s\S]*status: "queued"/,
  "serve worker should retry stale running requests instead of leaving dead rows",
);
assert.match(
  worker,
  /serveRequestIsClaimable[\s\S]*agentKey === CANONICAL_COMMUNITY_AGENT_KEY[\s\S]*intakeReason === "accepted"[\s\S]*normalizeIdValue\(request\.requesterUserId\) === normalizeIdValue\(request\.sponsorUserId\)/,
  "serve requests should be canonical-agent accepted rows sponsored by the requester",
);

assert.match(
  readBlock,
  /requireCommunityChatAccess\(\{[\s\S]*communityId: request\.communityId[\s\S]*userId: request\.requesterUserId/,
  "serve context should require current requester community chat access",
);
assert.match(
  readBlock,
  /resolveCommunityInferenceFundingAdmission[\s\S]*founder_subscription_inactive[\s\S]*founder_plan_required/,
  "serve context should fail closed until hosted community funding is current",
);
assert.doesNotMatch(readBlock, /OpenAI API key|owner_credential|owner_funding_choice/);
assert.doesNotMatch(readBlock, /legacy_requester_chatgpt|requesterHasChatgptConnection/);
assert.match(
  readBlock,
  /readCanonicalCommunityAgentContext[\s\S]*!canonicalContext\.agentEnabled[\s\S]*agent_disabled/,
  "serve context should respect the community agent off switch",
);
assert.match(
  readBlock,
  /agent:\s*\{[\s\S]*displayName: canonicalContext\.agentDisplayName[\s\S]*systemPrompt: boundedText\(canonicalContext\.communitySystemPrompt, 4_000\)/,
  "serve context should load the AI Agent community-wide instructions from communityAgentConfigs.systemPrompt",
);
assert.match(context, /communityAgentConfigs[\s\S]*by_community_updatedAt[\s\S]*\.order\("desc"\)[\s\S]*\.first\(\)/);
assert.doesNotMatch(worker, /query\("communityAgentConfigs"/);
assert.match(boundary, /member_concierge[\s\S]*sponsor: "requester"[\s\S]*toolAuthority: "member_repository"/);
assert.match(
  worker,
  /buildCommunityAgentIdentityPrompt\(\{[\s\S]*surface: "member_concierge"/,
  "member-facing turns should identify the canonical agent through the shared runtime boundary",
);
assert.match(
  readBlock,
  /root\.status !== "live"[\s\S]*source_not_live[\s\S]*reply\.status !== "live"/,
  "serve context should fail closed on non-live source roots or replies",
);
assert.match(
  worker,
  /requesterCanReadSourceVisibility[\s\S]*visibilityScope === "private"[\s\S]*sourceActorUserId[\s\S]*visibilityScope === "admin"[\s\S]*requireCommunityManager/,
  "serve worker should enforce source visibility readability for private and admin scopes",
);
assert.match(
  readBlock,
  /requesterCanReadSourceVisibility[\s\S]*source_not_readable/,
  "serve context should not load prompt text if the requester cannot currently read the source visibility",
);

assert.match(
  actionBlock,
  /requestId: v\.optional\(v\.id\("communityAgentServeRequests"\)\)[\s\S]*iterationLimit = args\.requestId \? 1 : limit[\s\S]*claimCommunityInferenceReceiptInternal[\s\S]*expectedFounderSubscriptionId[\s\S]*runNativeRuntimeKernel<CommunityAgentConciergeToolName>\(\{[\s\S]*runOpenAiNativeToolCompletion\(\{[\s\S]*modelId: COMMUNITY_OWNER_FUNDED_MODEL_ID/,
  "serve action should use fixed Luna only after hosted community funding is claimed",
);
assert.doesNotMatch(actionBlock, /owner_api_key|ownerApiKey|runChatgptNativeToolCompletion|apiKeyOverride/);
assert.match(
  worker,
  /executeConciergeTool[\s\S]*executeRetrievalHarnessTool\(\{[\s\S]*userId: normalizeIdValue\(args\.context\.request\.sponsorUserId\)[\s\S]*authSubject: normalizeIdValue\(args\.context\.request\.authSubject\)[\s\S]*communityId: normalizeIdValue\(args\.context\.request\.communityId\)[\s\S]*toolName: args\.toolName/,
  "serve worker tools should execute as the server-resolved requester and within the single serve-request community",
);
assert.match(
  worker,
  /isCommunityAgentConciergeToolName[\s\S]*unsupported_concierge_tool[\s\S]*normalizeCommunityAgentConciergeToolArguments/,
  "serve worker should reject model-requested tools outside the Concierge allowlist before execution",
);
assert.match(
  conciergeTools,
  /COMMUNITY_AGENT_CONCIERGE_TOOL_NAMES = \[[\s\S]*"polynet_list"[\s\S]*"polynet_read"[\s\S]*"polynet_search"[\s\S]*"polynet_write"[\s\S]*"polynet_call"[\s\S]*\] as const satisfies readonly RetrievalToolName\[\]/,
  "Concierge must expose exactly the canonical five Polynet tools",
);
assert.doesNotMatch(
  conciergeTools,
  /community_memory_|community_chat_|community_ai_feed_|community_resources_|search_product_docs|get_product_doc|web_research|web_crawl|bash|terminal_|computer_/i,
  "Concierge allowlist must exclude specialized duplicate, premium, filesystem, terminal, and computer tools",
);
assert.match(
  worker,
  /communityWideInstructions[\s\S]*context\.agent\.systemPrompt[\s\S]*Community-wide instructions from the AI Agent settings:/,
  "serve prompt should augment the base community-agent prompt with AI Agent community-wide instructions",
);
assert.match(
  worker,
  /The five Polynet tools are your only platform operations[\s\S]*restricted to \$\{communityRoot\}[\s\S]*Use polynet_list to navigate, polynet_search on an exact returned subtree, and polynet_read on exact returned paths[\s\S]*Use polynet_write only when the member explicitly requests[\s\S]*Use polynet_call only for a versioned operation returned under capabilities\/[\s\S]*member authority, never builder authority/,
  "serve prompt should orient the Concierge to the canonical five and fixed member authority",
);
assert.match(
  worker,
  /direct community-agent mention request[\s\S]*member's community-agent mention request/,
  "serve prompt should refer to the canonical community-agent mention rather than a legacy literal token",
);
assert.match(
  worker,
  /Format for a narrow chat thread:[\s\S]*compact Markdown is okay[\s\S]*2-5 short bullets[\s\S]*avoid tables and large headings/,
  "serve prompt should keep community-agent replies formatted for compact thread markdown",
);
assert.doesNotMatch(
  worker,
  /@Polynet/,
  "serve prompt must not hard-code the legacy @Polynet visible token",
);
assert.doesNotMatch(
  worker,
  /buildCommunityAgentFunctionTools|communityAgentFilesystem|createCommunityAgentRunInternal|runCommunityAgentCycleInternal|community_write|web_research|web_crawl|community_search/,
  "serve worker must not use memory-cycle tools, community write, web research, or broad community evidence search",
);

assert.match(
  finalizeBlock,
  /ctx\.db\.insert\("communityInteractionReplies" as any,[\s\S]*actorType: "community_agent"[\s\S]*actorAgentKey: CANONICAL_COMMUNITY_AGENT_KEY[\s\S]*targetReplyId: request\.sourceReplyId/,
  "serve finalization should insert a community-agent reply targeted to the source reply when present",
);
assert.match(
  finalizeBlock,
  /ctx\.db\.insert\("communityInteractionContentBlocks" as any,[\s\S]*replyId[\s\S]*blockType: "markdown_text"/,
  "serve finalization should materialize reply content as a canonical markdown content block",
);
assert.match(
  finalizeBlock,
  /idempotencyKey = `community_agent_serve:\$\{normalizeIdValue\(request\._id\)\}`[\s\S]*withIndex\("by_community_idempotencyKey"[\s\S]*responseReplyId: existingReply\._id/,
  "serve finalization should be idempotent by request id",
);
assert.match(
  finalizeBlock,
  /responseRootId: root\._id[\s\S]*responseReplyId: replyId[\s\S]*respondedAt: nowMs/,
  "serve finalization should record the response reply on the serve request",
);
assert.match(
  finalizeBlock,
  /narrowVisibility\(request\.responseVisibilityScope, sourceVisibilityScope\)/,
  "serve finalization should not widen response visibility beyond the captured/current source boundary",
);
assert.match(
  finalizeBlock,
  /requireCommunityChatAccess\(\{[\s\S]*communityId: request\.communityId[\s\S]*userId: request\.requesterUserId/,
  "serve finalization should re-check requester access after the model call before writing a reply",
);
assert.match(
  finalizeBlock,
  /requesterCanReadSourceVisibility[\s\S]*source_not_readable/,
  "serve finalization should re-check source visibility after the model call before writing a reply",
);
assert.doesNotMatch(
  finalizeBlock,
  /insert\("communityInteractionRoots" as any/,
  "serve finalization must never create a main chat/root post",
);
assert.doesNotMatch(
  worker,
  /communitySourceTraces|communityCompilerDigests|communityIntelligenceNodes|communityIntelligenceEdges|communityIntelligenceChangeRequests|communityIntelligenceMutations|communityRetrievalLogs|communityOutcomeObservations/,
  "serve worker must not write or touch memory, compiler, retrieval, or outcome tables",
);

assert.match(
  worker,
  /async function failServeRequest[\s\S]*status: "error"[\s\S]*errorCode[\s\S]*errorMessage[\s\S]*export const failCommunityAgentServeRequestInternal[\s\S]*failServeRequest\(ctx, request, args\.errorCode, args\.errorMessage, nowMs\)/,
  "serve worker should persist deterministic error state on failed serve requests",
);
assert.match(
  actionBlock,
  /catch \(error\)[\s\S]*errorCode: "provider_exception"[\s\S]*catch \(error\)[\s\S]*errorCode: "serve_finalize_exception"/,
  "serve worker should mark provider and finalize exceptions as deterministic request errors",
);
assert.match(
  crons,
  /"process queued community agent serve requests",\s*\{ minutes: 1 \},[\s\S]*communityAgentServeWorker\.processQueuedCommunityAgentServeRequestsInternal[\s\S]*\{ limit: 3 \}/,
  "serve worker should keep a bounded cron repair drain",
);
assert.match(
  docs,
  /Concierge Serve Worker v0/,
  "architecture docs should include the serve worker section",
);
assert.match(
  docs,
  /schedule immediate serve worker for that request[\s\S]*authorize one privacy-bounded funding receipt[\s\S]*run GPT 5\.6 Luna through the community's canonical owner funding authority[\s\S]*insert one community-agent reply in that source thread/,
  "architecture docs should describe the event-driven canonical tool serve path",
);
assert.match(
  docs,
  /does not write source traces, compiler digests[\s\S]*never create `communityInteractionRoots`/,
  "architecture docs should describe the serve worker boundary",
);
assert.match(
  docs,
  /canonical five-tool[\s\S]*`polynet_list`[\s\S]*`polynet_read`[\s\S]*`polynet_search`[\s\S]*`polynet_write`[\s\S]*`polynet_call`[\s\S]*never receives[\s\S]*builder authority/,
  "architecture docs should describe the Concierge canonical five and member-only authority",
);
assert.match(
  docs,
  /Source visibility must be readable by the requester at serve time[\s\S]*private scope requires the source\s+author[\s\S]*admin scope requires owner\/admin manager access/,
  "architecture docs should describe source visibility checks",
);
assert.match(
  docs,
  /Serve is event-driven primary, cron-repaired secondary[\s\S]*schedule the serve worker immediately with `requestId`[\s\S]*leftover\/stale request drain/,
  "architecture docs should state that cron is repair, not primary serve",
);

console.log("community_agent_serve_worker_contract_proof: ok");

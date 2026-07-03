import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const worker = readFileSync(join(root, "convex/communityAgentServeWorker.ts"), "utf8");
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
  /requesterHasChatgptConnection[\s\S]*request\.requesterUserId/,
  "serve context should require the requester's own ChatGPT connection before spending tokens",
);
assert.match(
  readBlock,
  /latestCommunityAgentConfig[\s\S]*config\?\.agentEnabled === false[\s\S]*agent_disabled/,
  "serve context should respect the community agent off switch",
);
assert.match(
  readBlock,
  /agent:\s*\{[\s\S]*displayName: boundedText\(config\?\.agentDisplayName, 120\) \|\| "Polynet"[\s\S]*systemPrompt: boundedText\(config\?\.systemPrompt, 4_000\)/,
  "serve context should load the AI Agent community-wide instructions from communityAgentConfigs.systemPrompt",
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
  /requestId: v\.optional\(v\.id\("communityAgentServeRequests"\)\)[\s\S]*iterationLimit = args\.requestId \? 1 : limit[\s\S]*requestId: args\.requestId[\s\S]*runChatgptCompletion\(\{[\s\S]*userId: normalizeIdValue\(context\.request\.sponsorUserId\)[\s\S]*modelId: DEFAULT_ACTIVE_MODEL_ID[\s\S]*messages: buildServeMessages\(context\)/,
  "serve action should spend the requester sponsor lane through plain ChatGPT completion",
);
assert.match(
  worker,
  /communityWideInstructions[\s\S]*context\.agent\.systemPrompt[\s\S]*Community-wide instructions from the AI Agent settings:/,
  "serve prompt should augment the base community-agent prompt with AI Agent community-wide instructions",
);
assert.match(
  worker,
  /direct community-agent mention request[\s\S]*member's community-agent mention request/,
  "serve prompt should refer to the canonical community-agent mention rather than a legacy literal token",
);
assert.doesNotMatch(
  worker,
  /@Polynet/,
  "serve prompt must not hard-code the legacy @Polynet visible token",
);
assert.doesNotMatch(
  worker,
  /runChatgptNativeToolCompletion|runNativeRuntimeKernel|buildCommunityAgentFunctionTools|communityAgentFilesystem|createCommunityAgentRunInternal|runCommunityAgentCycleInternal/,
  "serve worker v0 must not use the tool runtime, filesystem, or memory-cycle runs",
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
  /schedule immediate serve worker for that request[\s\S]*spend requester ChatGPT connection[\s\S]*insert one community-agent reply in that source thread/,
  "architecture docs should describe the event-driven serve path",
);
assert.match(
  docs,
  /does not write source traces, compiler digests[\s\S]*never create `communityInteractionRoots`/,
  "architecture docs should describe the serve worker boundary",
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

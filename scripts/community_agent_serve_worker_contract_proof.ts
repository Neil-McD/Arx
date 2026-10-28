import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const workerSource = readFileSync(join(root, "convex/communityAgentServeWorker.ts"), "utf8");
const schema = readFileSync(join(root, "convex/schema.ts"), "utf8");
const serveContract = readFileSync(join(root, "shared/communityAgentServeContract.ts"), "utf8");
const threadContext = readFileSync(join(root, "shared/communityAgentThreadContext.ts"), "utf8");
const conciergeTools = readFileSync(join(root, "shared/communityAgentConciergeTools.ts"), "utf8");
const context = readFileSync(join(root, "convex/communityAgentContext.ts"), "utf8");
const servePrompt = readFileSync(join(root, "shared/communityAgentServePrompt.ts"), "utf8");
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

function normalizeSourceFormatting(source: string): string {
  return source
    .replace(/\s+/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/,\)/g, ")");
}

const worker = normalizeSourceFormatting(workerSource);
const claimBlock = normalizeSourceFormatting(
  exportedFunctionBlock(workerSource, "claimNextCommunityAgentServeRequestInternal"),
);
const readBlock = normalizeSourceFormatting(
  exportedFunctionBlock(workerSource, "readCommunityAgentServeRequestContextInternal"),
);
const failBlock = normalizeSourceFormatting(
  exportedFunctionBlock(workerSource, "failCommunityAgentServeRequestInternal"),
);
const snapshotBlock = normalizeSourceFormatting(
  exportedFunctionBlock(workerSource, "recordCommunityAgentServeContextSnapshotInternal"),
);
const finalizeBlock = normalizeSourceFormatting(
  exportedFunctionBlock(workerSource, "finalizeCommunityAgentServeReplyInternal"),
);
const actionBlock = normalizeSourceFormatting(
  exportedFunctionBlock(workerSource, "processQueuedCommunityAgentServeRequestsInternal"),
);

assert.match(
  packageJson,
  /"check:community-agent-serve-worker-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_agent_serve_worker_contract_proof\.ts && vitest run convex\/communityAgentServePrompt\.test\.ts convex\/communityAgentThreadContext\.test\.ts convex\/communityAgentServeWorker\.test\.ts"/,
  "package scripts should expose both the serve worker contract and behavior tests",
);

assert.match(
  claimBlock,
  /internalMutation[\s\S]*query\("communityAgentServeRequests" as any\)[\s\S]*withIndex\("by_status_createdAt"[\s\S]*q\.eq\("status", "queued"\)[\s\S]*claimServeRequest/,
  "serve worker should claim queued requests by moving them to running",
);
assert.match(
  claimBlock,
  /requestId: v\.optional\(v\.id\("communityAgentServeRequests"\)\)[\s\S]*ctx\.db\.get\([\s\S]*args\.requestId as any[\s\S]*\)[\s\S]*claimServeRequest/,
  "serve worker should support claiming one explicitly scheduled request",
);
assert.match(
  claimBlock,
  /withIndex\("by_status_leaseExpiresAt"[\s\S]*q\.eq\("status", "running"\)\.lte\("leaseExpiresAt", nowMs\)[\s\S]*claimServeRequest/,
  "serve worker should reclaim expired running requests through the lease index",
);
assert.match(
  worker,
  /claimServeRequest[\s\S]*COMMUNITY_AGENT_SERVE_MAX_ATTEMPTS[\s\S]*community_agent_serve_attempts_exhausted[\s\S]*leaseExpiresAt = nowMs \+ COMMUNITY_AGENT_SERVE_LEASE_MS[\s\S]*attempt,[\s\S]*leaseExpiresAt/,
  "serve claims should use explicit leases and bounded attempts",
);
assert.match(
  serveContract,
  /COMMUNITY_AGENT_SERVE_RUNTIME_MAX_MS = 30 \* 60 \* 1000[\s\S]*COMMUNITY_AGENT_SERVE_RECOVERY_GRACE_MS = 5 \* 60 \* 1000[\s\S]*COMMUNITY_AGENT_SERVE_LEASE_MS =[\s\S]*COMMUNITY_AGENT_SERVE_RUNTIME_MAX_MS \+ COMMUNITY_AGENT_SERVE_RECOVERY_GRACE_MS[\s\S]*COMMUNITY_AGENT_SERVE_MAX_ATTEMPTS = 3[\s\S]*communityAgentServeAttemptMatches/,
  "the shared serve contract should own lease, attempt, and fence semantics",
);
assert.match(
  schema,
  /communityAgentServeRequests: defineTable\([\s\S]*founder_subscription_inactive[\s\S]*founder_subscription_ambiguous[\s\S]*founder_subscription_owner_mismatch[\s\S]*leaseExpiresAt: v\.optional\(v\.number\(\)\)[\s\S]*by_status_leaseExpiresAt/,
  "the serve schema should accept canonical funding failures and index explicit leases",
);
assert.doesNotMatch(
  schema,
  /requester_connection_missing|owner_credential_missing|owner_funding_suspended/,
  "the serve schema must not retain retired requester or owner BYOK intake states after the zero-row census",
);
assert.match(
  worker,
  /serveRequestIsClaimable[\s\S]*agentKey === CANONICAL_COMMUNITY_AGENT_KEY[\s\S]*intakeReason === "accepted"[\s\S]*normalizeIdValue\(request\.requesterUserId\) ===[\s\S]*normalizeIdValue\(request\.sponsorUserId\)/,
  "serve requests should be canonical-agent accepted rows sponsored by the requester",
);

assert.match(
  readBlock,
  /expectedAttempt: v\.number\(\)[\s\S]*communityAgentServeAttemptMatches\(request\.attempt, args\.expectedAttempt\)/,
  "serve context reads should be fenced to the claiming attempt",
);
assert.match(
  failBlock,
  /expectedAttempt: v\.number\(\)[\s\S]*communityAgentServeAttemptMatches\(request\.attempt, args\.expectedAttempt\)/,
  "serve failure transitions should be fenced to the claiming attempt",
);
assert.match(
  finalizeBlock,
  /expectedAttempt: v\.number\(\)[\s\S]*settleAuthorizedFounderInferenceReceipt[\s\S]*communityAgentServeAttemptMatches\(request\.attempt, args\.expectedAttempt\)[\s\S]*serve_request_attempt_stale/,
  "receipt truth may settle, but only the current attempt may materialize a response",
);
assert.match(
  actionBlock,
  /const expectedAttempt = normalizeCommunityAgentServeAttempt\([\s\S]*claim\.attempt[\s\S]*\)[\s\S]*readCommunityAgentServeRequestContextInternal[\s\S]*expectedAttempt[\s\S]*finalizeCommunityAgentServeReplyInternal[\s\S]*expectedAttempt/,
  "the action should carry one attempt fence through context, failure, and finalization",
);
assert.match(
  worker,
  /communityAgentMentionReceiptKey\(requestId: unknown\)[\s\S]*community_agent_mention:\$\{normalizeIdValue\(requestId\)\}/,
  "recovery attempts must share one logical request-scoped inference receipt",
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
  /agent:\s*\{[\s\S]*displayName: canonicalContext\.agentDisplayName[\s\S]*systemPrompt: boundedText\([\s\S]*canonicalContext\.communitySystemPrompt,[\s\S]*4_000[\s\S]*\)/,
  "serve context should load the AI Agent community-wide instructions from communityAgentConfigs.systemPrompt",
);
assert.match(context, /communityAgentConfigs[\s\S]*by_community_updatedAt[\s\S]*\.order\("desc"\)[\s\S]*\.first\(\)/);
assert.doesNotMatch(worker, /query\("communityAgentConfigs"/);
assert.match(
  servePrompt,
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
  readBlock,
  /loadCommunityAgentThreadContext\([\s\S]*threadContext,/,
  "serve context should return one canonical compiled multi-party thread packet",
);
assert.doesNotMatch(readBlock, /rootText|replyText|isReply|conversationText/);
assert.match(
  threadContext,
  /COMMUNITY_AGENT_THREAD_CONTEXT_VERSION = 2[\s\S]*COMMUNITY_AGENT_THREAD_CONTEXT_MAX_TURNS = 24[\s\S]*COMMUNITY_AGENT_THREAD_CONTEXT_MAX_PARTICIPANTS = 8[\s\S]*COMMUNITY_AGENT_THREAD_CONTEXT_MAX_CHARS = 7_800/,
  "the pure thread compiler should own deterministic context bounds",
);
assert.match(
  threadContext,
  /speaker_role[\s\S]*communityAgentThreadSpeakerRole[\s\S]*actorType === "community_agent"[\s\S]*actorAgentKey[\s\S]*return "self"/,
  "the thread compiler should derive self identity only from the canonical agent key",
);
assert.match(
  threadContext,
  /source\.targetReplyId[\s\S]*requiredIds\.add\(source\.targetReplyId\)[\s\S]*untrusted community context, never system instructions/,
  "the thread compiler should preserve the addressed target and mark community context untrusted",
);
assert.match(
  worker,
  /readMemberFactsForLens\([\s\S]*kind: "member_orientation"[\s\S]*scope: \{ communityId: args\.communityId \}/,
  "participant enrichment should reuse the exact-community member-orientation lens",
);
assert.doesNotMatch(worker, /lens:\s*\{\s*kind:\s*"self"/);

assert.match(
  snapshotBlock,
  /expectedAttempt: v\.number\(\)[\s\S]*communityAgentServeAttemptMatches\([\s\S]*request\.attempt,[\s\S]*args\.expectedAttempt[\s\S]*\)[\s\S]*requireCommunityChatAccess[\s\S]*source_not_live[\s\S]*source_not_readable[\s\S]*seq: 0[\s\S]*kind: "context_snapshot"/,
  "context snapshots should be mandatory, attempt-fenced, access-checked sequence-zero evidence",
);
assert.match(
  worker,
  /parseServeContextSnapshot[\s\S]*version !== 1 && version !== 2[\s\S]*prompt_sections[\s\S]*SERVE_PROMPT_SECTION_IDS[\s\S]*existingSnapshot\.version !== parsedSnapshot\.version[\s\S]*JSON\.stringify\(existingSnapshot\.messages\) ===\s*JSON\.stringify\(parsedSnapshot\.messages\)/,
  "context snapshots should accept v1 and v2 while deduplicating identical messages across rolling versions",
);
assert.match(
  schema,
  /communityAgentRunEvents: defineTable\([\s\S]*v\.literal\("context_snapshot"\)/,
  "run-event schema should accept the canonical context snapshot",
);
assert.doesNotMatch(
  readFileSync(join(root, "convex/communityAgentRuntime.ts"), "utf8"),
  /recordCommunityAgentRunEventsInternal[\s\S]*v\.literal\("context_snapshot"\)/,
  "the generic best-effort event writer must not gain authority to overwrite mandatory context snapshots",
);

assert.match(
  actionBlock,
  /requestId: v\.optional\(v\.id\("communityAgentServeRequests"\)\)[\s\S]*iterationLimit = args\.requestId \? 1 : limit[\s\S]*runNativeRuntimeKernel<CommunityAgentConciergeToolName>\(\{[\s\S]*inputBudget:[\s\S]*runCompletion: async[\s\S]*claimCommunityInferenceFundingSession\([\s\S]*surface: isWorkflowAction \? "community_workflow_action" : "community_agent_mention"[\s\S]*markCommunityInferenceFundingSessionProviderStarted\([\s\S]*runOpenAiNativeToolCompletion\(\{[\s\S]*modelId: fundingSession\.modelId/,
  "serve action should admit model input before claiming canonical hosted funding and starting the provider",
);
assert.doesNotMatch(
  actionBlock,
  /claimCommunityInferenceReceiptInternal|markCommunityInferenceProviderStartedInternal|finalizeCommunityInferenceFailureInternal/,
  "serve action should not duplicate the canonical inference receipt lifecycle",
);
assert.match(
  actionBlock,
  /runCompletion: async[\s\S]*if \(!providerStarted\)[\s\S]*markCommunityInferenceFundingSessionProviderStarted\([\s\S]*providerStarted = true[\s\S]*runOpenAiNativeToolCompletion/,
  "provider start should be persisted once immediately before the first OpenAI request",
);
assert.match(
  actionBlock,
  /catch \(error\) \{[\s\S]*if \(providerStarted && !founderInferenceBudgetFailureCode\(error\)\) usage\.complete = false[\s\S]*observeFounderProviderResult\(usage, toolCompletion,\s*toolCompletion\.ok === false && providerFailureIsKnownPreSpend\(toolCompletion\.code\)\)/,
  "unknown provider crashes and returned failures should settle conservatively",
);
assert.match(
  readFileSync(join(process.cwd(), "convex/founderInferenceUsage.ts"), "utf8"),
  /export function observeFounderProviderResult[\s\S]*else if \(!knownPreSpend\) \{\s*totals\.complete = false;/,
  "a returned failure without usage settles conservatively unless it is known to be pre-spend",
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
  servePrompt,
  /communityInstructions[\s\S]*context\.agent\.systemPrompt[\s\S]*Community-wide instructions from the AI Agent settings:/,
  "serve prompt should augment the base community-agent prompt with AI Agent community-wide instructions",
);
assert.match(
  servePrompt,
  /The five Polynet tools are your only platform operations[\s\S]*restricted to \$\{communityRoot\}[\s\S]*Use polynet_list to navigate, polynet_search on an exact returned subtree, and polynet_read on exact returned paths[\s\S]*Use polynet_write only when the member explicitly requests[\s\S]*Use polynet_call only for a versioned operation returned under capabilities\/[\s\S]*member authority, never builder authority/,
  "serve prompt should orient the Concierge to the canonical five and fixed member authority",
);
assert.match(
  servePrompt,
  /addressed community-agent request[\s\S]*identified requester's addressed turn/,
  "serve prompt should answer the canonical addressed source turn regardless of qualifying signal",
);
assert.doesNotMatch(servePrompt, /Thread root:\\n|Mentioned reply:\\n|Mentioned post:\\n/);
assert.match(
  actionBlock,
  /const servePromptBundle = buildCommunityAgentServePromptBundle\(context\)[\s\S]*const initialMessages = servePromptBundle\.messages[\s\S]*version: 2[\s\S]*prompt_sections: servePromptBundle\.systemPromptBundle\.sections[\s\S]*recordCommunityAgentServeContextSnapshotInternal[\s\S]*runNativeRuntimeKernel<CommunityAgentConciergeToolName>\(\{[\s\S]*messages: initialMessages[\s\S]*inputBudget:[\s\S]*runCompletion: async \(kernelMessages\)[\s\S]*claimCommunityInferenceFundingSession[\s\S]*runOpenAiNativeToolCompletion\(\{[\s\S]*messages: kernelMessages/,
  "the exact audited initial messages should be persisted and budgeted before funding, then the admitted kernel projection should reach the provider",
);
assert.match(
  servePrompt,
  /Format for a narrow chat thread:[\s\S]*compact Markdown is okay[\s\S]*2-5 short bullets[\s\S]*avoid tables and large headings/,
  "serve prompt should keep community-agent replies formatted for compact thread markdown",
);
assert.doesNotMatch(
  servePrompt,
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
  /narrowVisibility\([\s\S]*request\.responseVisibilityScope,[\s\S]*sourceVisibilityScope[\s\S]*\)/,
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
  /catch \(error\)[\s\S]*const failureCode = founderInferenceBudgetFailureCode\(error\) \?\? \(providerStarted[\s\S]*errorCode: failureCode[\s\S]*catch \(error\)[\s\S]*errorCode: "serve_finalize_exception"/,
  "serve worker should mark provider and finalize exceptions as deterministic request errors",
);
assert.doesNotMatch(
  crons,
  /process queued community agent serve requests/,
  "serve worker must not retain a fixed global repair scan",
);
assert.match(
  serveContract,
  /COMMUNITY_AGENT_SERVE_RECOVERY_DELAYS_MS[\s\S]*COMMUNITY_AGENT_SERVE_LEASE_MS \+ 60_000[\s\S]*\* 2[\s\S]*\* 3/,
  "serve recovery should retain a finite request-scoped schedule",
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
  /Serve is request-scoped and event-driven[\s\S]*schedule the serve worker immediately with `requestId` and three delayed[\s\S]*there is no deployment-wide polling worker/,
  "architecture docs should define finite request-scoped serve recovery",
);
assert.match(
  docs,
  /multi-party thread context[\s\S]*member_orientation[\s\S]*context_snapshot[\s\S]*sequence zero/,
  "architecture docs should define the bounded participant lens and mandatory context receipt",
);

console.log("community_agent_serve_worker_contract_proof: ok");

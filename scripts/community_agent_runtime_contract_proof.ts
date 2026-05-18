import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const runtime = readFileSync(join(root, "convex/communityAgentRuntime.ts"), "utf8");
const filesystem = readFileSync(join(root, "convex/communityAgentFilesystem.ts"), "utf8");
const protocol = readFileSync(join(root, "shared/communityAgentToolProtocol.ts"), "utf8");
const schema = readFileSync(join(root, "convex/schema.ts"), "utf8");
const packageJson = readFileSync(join(root, "package.json"), "utf8");
const docs = readFileSync(join(root, "docs/community-agent-cognition-contract-v1.md"), "utf8");

assert.match(
  packageJson,
  /"check:community-agent-runtime-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/community_agent_runtime_contract_proof\.ts"/,
  "package scripts should expose the community agent runtime proof",
);

assert.match(protocol, /export const CANONICAL_COMMUNITY_AGENT_KEY = "community_agent" as const/);
assert.match(runtime, /export const runCommunityAgentLoopInternal = internalAction/);
assert.match(runtime, /export const resolveCommunityAgentRunContextInternal = internalQuery/);
assert.match(runtime, /export const createCommunityAgentRunInternal = internalMutation/);
assert.match(runtime, /export const recordCommunityAgentSkippedRunInternal = internalMutation/);
assert.match(runtime, /export const finishCommunityAgentRunInternal = internalMutation/);
assert.doesNotMatch(runtime, /export const runCommunityAgentLoop = action\(|export const .* = action\(/);
assert.doesNotMatch(runtime, /userPrompt|prompt: v\.string|authSubject|userId: v\.optional/);
assert.doesNotMatch(runtime, /agentKey: v\.(?:optional\()?string/, "runtime actions and run creation must not accept caller-supplied agentKey");

assert.match(
  schema,
  /communityAgentRuns: defineTable\(\{[\s\S]*communityId: v\.id\("communities"\)[\s\S]*agentKey: v\.string\(\)[\s\S]*triggerType: v\.union\([\s\S]*v\.literal\("manual_internal"\)[\s\S]*v\.literal\("heartbeat"\)[\s\S]*v\.literal\("event"\)[\s\S]*heartbeatId: v\.optional\(v\.string\(\)\)[\s\S]*sponsorUserId: v\.id\("users"\)[\s\S]*status: v\.union\([\s\S]*v\.literal\("skipped"\)[\s\S]*v\.literal\("running"\)[\s\S]*v\.literal\("ok"\)[\s\S]*v\.literal\("error"\)[\s\S]*wakeReason: v\.optional\(v\.string\(\)\)[\s\S]*wakeEvidence: v\.optional\(v\.object[\s\S]*candidateProposalIds: v\.array\(v\.string\(\)\)[\s\S]*\.index\("by_community_createdAt", \["communityId", "createdAt"\]\)/,
  "schema should include a single-community agent run ledger",
);

assert.match(
  runtime,
  /const sponsorUserId = community\.ownerId[\s\S]*community_agent_runtime_owner_required[\s\S]*community_agent_runtime_owner_not_found/,
  "runtime context should derive sponsor from the community owner",
);
assert.match(
  runtime,
  /normalizeIdValue\(community\.ownerId\) !== normalizeIdValue\(args\.sponsorUserId\)[\s\S]*community_agent_runtime_sponsor_must_be_owner/,
  "run creation should fail closed if sponsor is not the community owner",
);
assert.match(
  runtime,
  /ctx\.db\.insert\("communityAgentRuns"[\s\S]*agentKey: CANONICAL_COMMUNITY_AGENT_KEY/,
  "run creation should derive the canonical community-agent identity",
);
assert.match(
  runtime,
  /recordCommunityAgentSkippedRunInternal[\s\S]*status: "skipped"[\s\S]*wakeReason[\s\S]*wakeEvidence[\s\S]*toolStepCount: 0/,
  "runtime should persist skipped heartbeat runs without creating a tool loop",
);
assert.match(
  runtime,
  /createCommunityAgentRunInternal[\s\S]*heartbeatId: v\.optional\(v\.string\(\)\)[\s\S]*wakeReason: v\.optional\(v\.string\(\)\)[\s\S]*wakeEvidence: v\.optional\(communityAgentWakeEvidenceValidator\)[\s\S]*ctx\.db\.insert\("communityAgentRuns"[\s\S]*heartbeatId:[\s\S]*wakeReason:[\s\S]*wakeEvidence:/,
  "runtime should persist heartbeat id and wake evidence on actual runs",
);
assert.match(
  runtime,
  /buildCommunityAgentMessages[\s\S]*Wake reason:[\s\S]*Evidence state:/,
  "runtime should pass wake diagnostics into the bounded community-agent loop",
);
assert.match(runtime, /runChatgptNativeToolCompletion\([\s\S]*userId: normalizeIdValue\(resolved\.sponsorUserId\)[\s\S]*modelId/);
assert.doesNotMatch(runtime, /runOpenRouterNativeToolCompletion|runOpenAi|OPENAI_API_KEY|platform.*fallback|demo_public/);

assert.match(protocol, /export type CommunityAgentToolName = "list" \| "read" \| "search" \| "write"/);
assert.match(protocol, /COMMUNITY_AGENT_TOOL_NAMES = \["list", "read", "search", "write"\] as const/);
assert.match(protocol, /buildCommunityAgentFunctionTools\(\)[\s\S]*COMMUNITY_AGENT_TOOL_NAMES\.map/);
assert.match(protocol, /operation:[\s\S]*enum: \["propose_directory_candidate_from_digest_item"\]/);
assert.doesNotMatch(protocol, /activity|communityId|authSubject|userId|crossCommunity|globalMemory/);

assert.match(
  runtime,
  /const agentKey = CANONICAL_COMMUNITY_AGENT_KEY[\s\S]*filesystemContext: CommunityAgentFilesystemContext = \{[\s\S]*communityId: args\.communityId[\s\S]*agentKey[\s\S]*runId[\s\S]*heartbeatId/,
  "tool loop should bind every tool call to one filesystem context",
);
assert.match(runtime, /internalRefs\.communityAgentFilesystem\.listCommunityAgentFilesystemInternal/);
assert.match(runtime, /internalRefs\.communityAgentFilesystem\.readCommunityAgentFilesystemInternal/);
assert.match(runtime, /internalRefs\.communityAgentFilesystem\.searchCommunityAgentFilesystemInternal/);
assert.match(runtime, /internalRefs\.communityAgentFilesystem\.writeCommunityAgentFilesystemInternal/);
assert.match(runtime, /runNativeRuntimeKernel<CommunityAgentToolName>/);
assert.match(runtime, /parallelToolCalls: false/);

assert.doesNotMatch(
  runtime,
  /ctx\.db\.insert\("communityIntelligenceNodes"|ctx\.db\.insert\("communityIntelligenceEdges"|ctx\.db\.patch\([^)]*communityIntelligenceNodes|ctx\.db\.patch\([^)]*communityIntelligenceEdges/,
  "community agent runtime must not mutate directory truth directly",
);
assert.doesNotMatch(runtime, /listThreadMessages|listCommunityAiFeedBundle|listCommunityResources|listCommunityEvents|\/activity/);

assert.match(
  filesystem,
  /writeCommunityAgentFilesystemInternal = internalMutation\([\s\S]*operation: v\.union\(v\.literal\("propose_directory_candidate_from_digest_item"\)\)[\s\S]*proposeCommunityIntelligenceFromDigestItemCore/,
  "runtime write tool should land on the existing filesystem airlock",
);
assert.match(
  docs,
  /Ninth Implementation Slice[\s\S]*internal community-agent runtime loop[\s\S]*owner-sponsored ChatGPT inference[\s\S]*canonical `agentKey`: `community_agent`[\s\S]*must not accept `agentKey` as caller input[\s\S]*list`, `read`, `search`, and `write`[\s\S]*must not directly insert or patch `communityIntelligenceNodes` or `communityIntelligenceEdges`[\s\S]*missing owner auth[\s\S]*must finish the run as an error/,
  "docs should describe the first internal community-agent runtime slice",
);

console.log("community_agent_runtime_contract_proof: ok");

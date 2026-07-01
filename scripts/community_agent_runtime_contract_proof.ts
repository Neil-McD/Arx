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

assert.match(protocol, /export type CommunityAgentToolName = "list" \| "read" \| "search" \| "note" \| "write"/);
assert.match(protocol, /COMMUNITY_AGENT_TOOL_NAMES = \["list", "read", "search", "note", "write"\] as const/);
assert.match(
  protocol,
  /buildCommunityAgentFunctionTools\([\s\S]*toolNames\?: readonly CommunityAgentToolName\[\]/,
  "tool builder should accept a role allowlist (authority by absence)",
);
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

// Observability: every run persists a reconstructable event trail (prompts,
// reasoning summaries, tool calls/results, final outcome), written
// incrementally so even crashed runs leave their trace. Best-effort only —
// event persistence must never fail the run itself.
assert.match(
  runtime,
  /recordCommunityAgentRunEventsInternal = internalMutation/,
  "runtime should persist run events for post-hoc reconstruction",
);
assert.match(
  runtime,
  /onReasoningSummaryTextDelta/,
  "runtime should capture the reasoning summaries the transport already requests",
);
assert.match(
  runtime,
  /onToolStepFinish: async[\s\S]*kind: "tool_call"[\s\S]*kind: "tool_result"/,
  "runtime should record tool calls and results incrementally, not only post-run",
);
assert.match(
  runtime,
  /catch \{[\s\S]*ignore: observability is best-effort/,
  "run-event persistence failures must never fail the run",
);

// Role harness (Amendment v1.1): one agent entity, role prompts on the same
// harness, chained per heartbeat cycle over a shared ledger. Authority is
// structural: only the steward's tool list contains the airlock write tool.
const roles = readFileSync(join(root, "shared/communityAgentRoles.ts"), "utf8");
assert.match(
  roles,
  /observer:[\s\S]*toolNames: \["list", "read", "search", "note"\][\s\S]*questioner:[\s\S]*toolNames: \["list", "read", "search", "note"\][\s\S]*steward:[\s\S]*toolNames: \["list", "read", "search", "note", "write"\]/,
  "only the steward role may carry the airlock write tool",
);
assert.match(
  roles,
  /COMMUNITY_AGENT_NO_SIGNAL_MARKER = "NO_SIGNAL"/,
  "observer short-circuit convention should be a shared constant",
);
assert.match(
  runtime,
  /runCommunityAgentCycleInternal = internalAction[\s\S]*COMMUNITY_AGENT_CYCLE_ROLES[\s\S]*observer_no_signal/,
  "heartbeat cycles should chain roles and short-circuit on a no-signal observer pass",
);
assert.match(
  runtime,
  /appendCommunityAgentCycleLedgerNoteInternal = internalMutation/,
  "cycle ledger appends must be a separate mutation from the directory airlock write",
);
assert.match(
  runtime,
  /buildCommunityAgentFunctionTools\(roleDefinition\?\.toolNames\)/,
  "the loop must send only the active role's tool schemas",
);
assert.match(
  runtime,
  /reasoningEffort: roleDefinition\?\.reasoningEffort/,
  "roles should control their own reasoning effort",
);

const heartbeat = readFileSync(join(root, "convex/communityAgentHeartbeat.ts"), "utf8");
assert.match(
  heartbeat,
  /runCommunityAgentCycleInternal/,
  "a woken heartbeat should run the role cycle, not a single pass",
);

// Steward auto-apply policy (Amendment v1.1): the current cycle's own proposals
// land at promising through the trusted airlock cores with an agent actor —
// capped, title-deduped, visibility gated by privacy risk. Never a sweep of
// older pending candidates.
const directory = readFileSync(join(root, "convex/communityIntelligenceDirectory.ts"), "utf8");
assert.match(
  directory,
  /autoApplyCommunityAgentProposalsInternal = internalMutation/,
  "steward auto-apply must be an internal mutation",
);
assert.match(
  directory,
  /STEWARD_AUTO_APPLY_LANDING_STATUS = "promising"/,
  "agent proposals land at promising, never higher",
);
assert.match(
  directory,
  /STEWARD_AUTO_APPLY_MAX_PER_CYCLE = 3/,
  "auto-apply is capped per cycle",
);
assert.match(
  directory,
  /privacyRisk <= STEWARD_AUTO_APPLY_COMMUNITY_VISIBILITY_MAX_PRIVACY_RISK[\s\S]*"community"[\s\S]*"admin"/,
  "privacy risk gates the visibility ceiling",
);
assert.match(
  directory,
  /duplicate_title/,
  "auto-apply must dedupe against existing node titles",
);
assert.match(
  directory,
  /normalizePolicyDecisionActor\(\{[\s\S]*actorType: "agent",[\s\S]*actorAgentKey: "community_agent",/,
  "auto-apply decisions are attributed to the community agent actor",
);
assert.match(
  runtime,
  /roleKey === "steward" && result\.candidate_proposal_ids\.length > 0[\s\S]*autoApplyCommunityAgentProposalsInternal[\s\S]*changeRequestIds: result\.candidate_proposal_ids/,
  "the cycle auto-applies only the steward's own proposals",
);

console.log("community_agent_runtime_contract_proof: ok");

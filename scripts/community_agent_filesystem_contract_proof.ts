import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const filesystem = readFileSync(join(root, "convex/communityAgentFilesystem.ts"), "utf8");
const candidates = readFileSync(join(root, "convex/communityCompilerCandidates.ts"), "utf8");
const communityExports = readFileSync(join(root, "convex/community.ts"), "utf8");
const protocol = readFileSync(join(root, "shared/communityAgentToolProtocol.ts"), "utf8");
const docs = readFileSync(join(root, "docs/community-agent-cognition-contract-v1.md"), "utf8");

assert.match(protocol, /export const CANONICAL_COMMUNITY_AGENT_KEY = "community_agent" as const/);
assert.match(filesystem, /import \{ CANONICAL_COMMUNITY_AGENT_KEY \} from "\.\.\/shared\/communityAgentToolProtocol"/);
assert.match(filesystem, /export const listCommunityAgentFilesystemInternal = internalQuery/);
assert.match(filesystem, /export const readCommunityAgentFilesystemInternal = internalQuery/);
assert.match(filesystem, /export const searchCommunityAgentFilesystemInternal = internalQuery/);
assert.match(filesystem, /export const writeCommunityAgentFilesystemInternal = internalMutation/);
assert.match(filesystem, /function isDigestRow\(row: unknown\): row is DigestRow/);
assert.match(filesystem, /function isNodeRow\(row: unknown\): row is NodeRow/);
assert.match(filesystem, /function isEdgeRow\(row: unknown\): row is EdgeRow/);
assert.match(filesystem, /function isChangeRequestRow\(row: unknown\): row is ChangeRequestRow/);
assert.match(filesystem, /async function readExpectedRow[\s\S]*isExpectedRow: \(row: unknown\) => row is T/);
assert.match(filesystem, /try \{[\s\S]*ctx\.db\.get\(id as any\)[\s\S]*\} catch \{[\s\S]*throw new Error\(errorCode\)/);
assert.match(filesystem, /if \(!isExpectedRow\(row\)\) throw new Error\(errorCode\)/);
assert.doesNotMatch(filesystem, /async function readById/);
assert.doesNotMatch(
  communityExports,
  /listCommunityAgentFilesystem|readCommunityAgentFilesystem|writeCommunityAgentFilesystem|searchCommunityAgentFilesystem/,
  "community agent filesystem should not be exported as a public prompt surface",
);
assert.match(
  filesystem,
  /const communityAgentFilesystemContextValidator = v\.object\(\{[\s\S]*communityId: v\.id\("communities"\)[\s\S]*agentKey: v\.string\(\)[\s\S]*runId: v\.optional\(v\.string\(\)\)[\s\S]*heartbeatId: v\.optional\(v\.string\(\)\)/,
  "filesystem tools should be bound to a single community-agent context",
);
assert.match(
  filesystem,
  /async function resolveFilesystemContext\([\s\S]*ctx: any[\s\S]*context: CommunityAgentFilesystemContext[\s\S]*ctx\.db\.get\(communityId\)[\s\S]*community_not_found[\s\S]*community_agent_filesystem_context_agent_required[\s\S]*agentKey !== CANONICAL_COMMUNITY_AGENT_KEY[\s\S]*community_agent_filesystem_context_agent_not_canonical/,
  "filesystem context resolution should fail closed without an existing community and canonical agent identity",
);
assert.match(
  filesystem,
  /function normalizeContextToken\(raw: unknown, maxLength: number\)[\s\S]*value\.slice\(0, maxLength\)/,
  "filesystem context metadata should be bounded before attribution",
);
assert.match(
  filesystem,
  /const agentKey = normalizeContextToken\(context\.agentKey, 120\)[\s\S]*runId: normalizeContextToken\(context\.runId, 200\)[\s\S]*heartbeatId: normalizeContextToken\(context\.heartbeatId, 200\)/,
  "agent/run heartbeat context should be normalized and bounded",
);
assert.match(
  filesystem,
  /function contextMetadata\(context: ResolvedCommunityAgentFilesystemContext\)[\s\S]*run_id: context\.runId \?\? null[\s\S]*heartbeat_id: context\.heartbeatId \?\? null/,
  "filesystem responses should preserve run and heartbeat provenance metadata",
);
assert.equal(
  (filesystem.match(/await resolveFilesystemContext\(ctx, args\.context\)/g) ?? []).length,
  4,
  "every filesystem operation should resolve and validate context before reading or writing",
);
assert.match(
  filesystem,
  /listCommunityAgentFilesystemInternal = internalQuery\([\s\S]*args: \{[\s\S]*context: communityAgentFilesystemContextValidator/,
  "list should inherit community scope from filesystem context",
);
assert.match(
  filesystem,
  /readCommunityAgentFilesystemInternal = internalQuery\([\s\S]*args: \{[\s\S]*context: communityAgentFilesystemContextValidator/,
  "read should inherit community scope from filesystem context",
);
assert.match(
  filesystem,
  /searchCommunityAgentFilesystemInternal = internalQuery\([\s\S]*args: \{[\s\S]*context: communityAgentFilesystemContextValidator/,
  "search should inherit community scope from filesystem context",
);
assert.match(
  filesystem,
  /writeCommunityAgentFilesystemInternal = internalMutation\([\s\S]*args: \{[\s\S]*context: communityAgentFilesystemContextValidator/,
  "write should inherit community scope from filesystem context",
);
assert.doesNotMatch(filesystem, /args\.communityId/, "filesystem operations should not accept community id as a loose operation argument");
assert.doesNotMatch(filesystem, /userId: v\.optional|authSubject: v\.optional|communityIds|crossCommunity|globalMemory/);
assert.match(filesystem, /"\/compiler"[\s\S]*"\/directory"/, "root should expose compiler and directory only");
assert.doesNotMatch(filesystem, /"\/activity"|\/activity|listThreadMessages|listCommunityAiFeedBundle|listCommunityResources|listCommunityEvents/);
assert.match(filesystem, /"\/compiler\/digests"[\s\S]*"\/compiler\/candidates"/);
assert.match(filesystem, /"\/directory\/nodes"[\s\S]*"\/directory\/edges"[\s\S]*"\/directory\/change-requests"/);
assert.match(filesystem, /"compiler"[\s\S]*"digests"[\s\S]*readExpectedRow\([\s\S]*"community_compiler_digest_not_found"[\s\S]*isDigestRow/);
assert.match(filesystem, /"compiler"[\s\S]*"candidates"[\s\S]*readExpectedRow\([\s\S]*"community_compiler_candidate_not_found"[\s\S]*isChangeRequestRow/);
assert.match(filesystem, /"directory"[\s\S]*"nodes"[\s\S]*readExpectedRow\([\s\S]*"community_intelligence_node_not_found"[\s\S]*isNodeRow/);
assert.match(filesystem, /"directory"[\s\S]*"edges"[\s\S]*readExpectedRow\([\s\S]*"community_intelligence_edge_not_found"[\s\S]*isEdgeRow/);
assert.match(filesystem, /"directory"[\s\S]*"change-requests"[\s\S]*readExpectedRow\([\s\S]*"community_intelligence_change_request_not_found"[\s\S]*isChangeRequestRow/);
assert.match(filesystem, /communityIntelligenceEdges[\s\S]*by_community[\s\S]*\.take\(Math\.max\(100, limit \* 4\)\)/);
assert.match(
  filesystem,
  /operation: v\.literal\("retain_compiler_digest_item"\)/,
  "write should expose one atomic compiler-memory operation",
);
assert.match(
  protocol,
  /enum: \["retain_compiler_digest_item"\]/,
  "tool schema should expose only the atomic compiler-memory operation",
);
assert.doesNotMatch(
  `${filesystem}\n${protocol}`,
  /decide_change_request|apply_accepted_change_request|same_run_self_review/,
  "the autonomous memory surface should not retain acceptance choreography",
);
assert.match(candidates, /export async function retainCommunityIntelligenceFromDigestItemCore/);
assert.match(
  filesystem,
  /retainCommunityIntelligenceFromDigestItemCore\([\s\S]*communityId: context\.communityId[\s\S]*actorType: "agent"[\s\S]*actorAgentKey: context\.agentKey[\s\S]*proposedByCommunityAgentRunId: context\.runId[\s\S]*proposedByCommunityAgentHeartbeatId: context\.heartbeatId/,
);
assert.match(
  candidates,
  /proposedByCommunityAgentRunId\?: string[\s\S]*proposedByCommunityAgentHeartbeatId\?: string[\s\S]*proposedByCommunityAgentRunId:[\s\S]*proposedByCommunityAgentHeartbeatId:/,
  "agent-proposed memory should retain run provenance for auditability",
);
assert.match(
  candidates,
  /retainCompilerCandidateAutonomously[\s\S]*AUTONOMOUS_MEMORY_COMMUNITY_VISIBILITY_MAX_PRIVACY_RISK = 0\.3|AUTONOMOUS_MEMORY_COMMUNITY_VISIBILITY_MAX_PRIVACY_RISK = 0\.3[\s\S]*retainCompilerCandidateAutonomously/,
  "compiler memory should be atomically retained under a bounded privacy policy",
);
assert.doesNotMatch(
  candidates,
  /status: "accepted"|decideTrustedCommunityIntelligenceChangeRequestCore/,
  "compiler memory should not synthesize an acceptance state",
);
assert.doesNotMatch(
  filesystem,
  /ctx\.db\.insert\("communityIntelligenceNodes"|ctx\.db\.insert\("communityIntelligenceEdges"|ctx\.db\.patch\([^)]*communityIntelligenceNodes|ctx\.db\.patch\([^)]*communityIntelligenceEdges/,
  "filesystem write should not mutate directory truth directly",
);
assert.match(
  docs,
  /Seventh Implementation Slice[\s\S]*internal single-community filesystem[\s\S]*list\/read\/search\/write[\s\S]*compiler and directory only/,
);
assert.match(
  docs,
  /filesystem context must include the canonical `communityId` and canonical `agentKey`[\s\S]*only accepted v0 community-agent identity is `community_agent`[\s\S]*must reject non-canonical agent keys[\s\S]*must not accept `communityId` as a loose per-operation argument/,
  "docs should describe community-agent filesystem context binding",
);

console.log("community_agent_filesystem_contract_proof: ok");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const filesystem = readFileSync(join(root, "convex/communityAgentFilesystem.ts"), "utf8");
const compilerEvidence = readFileSync(join(root, "convex/communityAgentCompilerEvidence.ts"), "utf8");
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
assert.doesNotMatch(protocol, /communityId/, "filesystem tools should inherit community id from runtime context, never tool arguments");
assert.doesNotMatch(filesystem, /userId: v\.optional|authSubject: v\.optional|communityIds|crossCommunity|globalMemory/);
assert.match(filesystem, /"\/compiler"[\s\S]*"\/directory"/, "root should expose compiler and directory only");
assert.doesNotMatch(filesystem, /"\/activity"|\/activity|listThreadMessages|listCommunityAiFeedBundle|listCommunityResources|listCommunityEvents/);
assert.match(filesystem, /"\/compiler\/digests"[\s\S]*"\/compiler\/evidence"[\s\S]*"\/compiler\/candidates"/);
assert.match(
  compilerEvidence,
  /COMPILER_EVIDENCE_RECORD_LIMIT = 8[\s\S]*COMPILER_EVIDENCE_EXCERPT_LIMIT = 1_200[\s\S]*COMPILER_EVIDENCE_CONTENT_BOUNDARY/,
  "compiler evidence files should be bounded and carry an explicit untrusted-content boundary",
);
assert.match(
  compilerEvidence,
  /buildCommunityCompilerEvidenceBundle[\s\S]*normalizeIdValue\(args\.digest\.communityId\)[\s\S]*findArchiveEvidence[\s\S]*findOutcomeEvidence[\s\S]*findSourceTraceEvidence/,
  "evidence bundles should resolve existing same-community evidence substrates",
);
assert.match(
  filesystem,
  /parts\[1\] === "evidence"[\s\S]*readExpectedRow\([\s\S]*context\.communityId[\s\S]*buildCommunityCompilerEvidenceBundle/,
  "evidence reads should inherit and enforce the canonical filesystem community",
);
assert.match(
  filesystem,
  /function mapDigest[\s\S]*evidencePath:[\s\S]*digestItemCanExposeLearningEvidence[\s\S]*compilerEvidencePath/,
  "digest items should provide exact evidence paths so roles never need to probe the filesystem",
);
assert.match(
  filesystem,
  /function changeRequestIsActionableCompilerCandidate[\s\S]*pending_decision[\s\S]*accepted[\s\S]*filter\(changeRequestIsActionableCompilerCandidate\)/,
  "the compiler candidate directory should exclude applied and unrelated change requests",
);
assert.match(filesystem, /"\/directory\/nodes"[\s\S]*"\/directory\/edges"[\s\S]*"\/directory\/change-requests"/);
assert.match(filesystem, /"compiler"[\s\S]*"digests"[\s\S]*readExpectedRow\([\s\S]*"community_compiler_digest_not_found"[\s\S]*isDigestRow/);
assert.match(filesystem, /"compiler"[\s\S]*"candidates"[\s\S]*readExpectedRow\([\s\S]*"community_compiler_candidate_not_found"[\s\S]*isChangeRequestRow/);
assert.match(filesystem, /"directory"[\s\S]*"nodes"[\s\S]*readExpectedRow\([\s\S]*"community_intelligence_node_not_found"[\s\S]*isNodeRow/);
assert.match(filesystem, /"directory"[\s\S]*"edges"[\s\S]*readExpectedRow\([\s\S]*"community_intelligence_edge_not_found"[\s\S]*isEdgeRow/);
assert.match(filesystem, /"directory"[\s\S]*"change-requests"[\s\S]*readExpectedRow\([\s\S]*"community_intelligence_change_request_not_found"[\s\S]*isChangeRequestRow/);
assert.match(filesystem, /communityIntelligenceEdges[\s\S]*by_community[\s\S]*\.take\(Math\.max\(100, limit \* 4\)\)/);
assert.match(
  filesystem,
  /operation: v\.union\([\s\S]*v\.literal\("propose_directory_candidate_from_digest_item"\)[\s\S]*v\.literal\("decide_change_request"\)[\s\S]*v\.literal\("apply_accepted_change_request"\)/,
  "write should expose proposal, decision, and apply as narrow operations on the same filesystem tool",
);
assert.match(
  protocol,
  /enum: \[[\s\S]*"propose_directory_candidate_from_digest_item"[\s\S]*"decide_change_request"[\s\S]*"apply_accepted_change_request"/,
  "tool schema should expose decision/apply without adding new tools",
);
assert.match(
  protocol,
  /LEARNING_ENVELOPE_SCHEMA[\s\S]*learningQuestion[\s\S]*candidateClaim[\s\S]*rejectedAlternative[\s\S]*preferenceReason[\s\S]*evidenceSummary[\s\S]*uncertainty[\s\S]*falsificationCriteria/,
  "the existing write tool should carry the complete semantic learning envelope",
);
assert.match(candidates, /export async function proposeCommunityIntelligenceFromDigestItemCore/);
assert.match(
  filesystem,
  /proposeCommunityIntelligenceFromDigestItemCore\([\s\S]*communityId: context\.communityId[\s\S]*learningEnvelope: payload\.learningEnvelope[\s\S]*actorType: "agent"[\s\S]*actorAgentKey: context\.agentKey[\s\S]*proposedByCommunityAgentRunId: context\.runId[\s\S]*proposedByCommunityAgentHeartbeatId: context\.heartbeatId/,
);
assert.match(
  candidates,
  /proposedByCommunityAgentRunId\?: string[\s\S]*proposedByCommunityAgentHeartbeatId\?: string[\s\S]*proposedByCommunityAgentRunId:[\s\S]*proposedByCommunityAgentHeartbeatId:/,
  "agent-proposed candidates should carry run provenance for same-run self-review guards",
);
assert.match(
  filesystem,
  /function changeRequestIsCompilerCandidate[\s\S]*payload\.source === COMPILER_CANDIDATE_PAYLOAD_SOURCE[\s\S]*row\.createdByActorType === "agent" \|\| row\.createdByActorType === "compiler"/,
  "decision/apply should only touch compiler-derived candidates",
);
assert.match(
  filesystem,
  /async function getWritableCompilerCandidate[\s\S]*expectedStatus: "pending_decision" \| "accepted"[\s\S]*community_agent_filesystem_compiler_candidate_required[\s\S]*community_agent_filesystem_same_run_self_review_forbidden/,
  "decision/apply should resolve same-community compiler candidates and fail same-run self-review",
);
assert.match(
  filesystem,
  /decideTrustedCommunityIntelligenceChangeRequestCore\([\s\S]*status: args\.decision[\s\S]*actorType: "agent"[\s\S]*actorAgentKey: args\.context\.agentKey/,
  "decision writes should reuse the trusted directory decision core with agent attribution",
);
assert.match(
  filesystem,
  /applyTrustedCommunityIntelligenceChangeRequestCore\([\s\S]*changeRequestId: row\._id[\s\S]*actorType: "agent"[\s\S]*actorAgentKey: args\.context\.agentKey/,
  "apply writes should reuse the trusted directory apply core with agent attribution",
);
assert.match(
  filesystem,
  /COMPILER_CANDIDATE_COMMUNITY_VISIBILITY_MAX_PRIVACY_RISK = 0\.3[\s\S]*visibilityScope =[\s\S]*\? "community"[\s\S]*: "admin"[\s\S]*requestedPayload: \{[\s\S]*\.\.\.payload[\s\S]*status: "promising"[\s\S]*visibilityScope/,
  "applied compiler candidates should land no higher than promising with privacy-gated visibility",
);
assert.doesNotMatch(
  filesystem,
  /if \(payload\.status === undefined \|\| payload\.status === "candidate"\)/,
  "apply should always force compiler candidates to promising, not trust payload status",
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

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const candidates = readFileSync(join(root, "convex/communityCompilerCandidates.ts"), "utf8");
const directory = readFileSync(join(root, "convex/communityIntelligenceDirectory.ts"), "utf8");
const schema = readFileSync(join(root, "convex/schema.ts"), "utf8");
const communityExports = readFileSync(join(root, "convex/community.ts"), "utf8");
const docs = readFileSync(join(root, "docs/community-agent-cognition-contract-v1.md"), "utf8");

assert.match(
  directory,
  /export async function createOrReuseTrustedCommunityIntelligenceChangeRequest/,
  "directory should expose a trusted helper for compiler-owned audit records",
);
assert.match(
  directory,
  /createOrReuseTrustedCommunityIntelligenceChangeRequest[\s\S]*requireTraceIdsBelongToCommunity[\s\S]*insertChangeRequest/,
  "trusted audit helper should validate evidence and reuse the change request path",
);
assert.match(
  candidates,
  /export async function retainCommunityIntelligenceFromDigestItemCore/,
  "compiler candidate core should exist for the internal community-agent filesystem",
);
assert.match(
  candidates,
  /workKey: string[\s\S]*matchingItems = digest\.items\.filter\(\(candidate\) => candidate\.workKey === workKey\)[\s\S]*buildCommunityMemoryWorkKey[\s\S]*expectedWorkKey !== workKey/,
  "compiler memory should locate by canonical key and re-derive it before writing",
);
assert.doesNotMatch(
  candidates,
  /itemIndex|digestItemIndex|findExistingDigestItemCandidate|candidatePayloadMatchesDigestItem|\.take\(500\)/,
  "compiler memory should not retain positional identity or bounded payload scans",
);
assert.match(
  schema,
  /communityIntelligenceChangeRequests: defineTable\(\{[\s\S]*workKey: v\.optional\(v\.string\(\)\)[\s\S]*\.index\("by_community_workKey", \["communityId", "workKey"\]\)/,
  "audit rows should support indexed community-scoped work identity",
);
assert.match(
  directory,
  /withIndex\("by_community_workKey"[\s\S]*\.take\(2\)[\s\S]*community_intelligence_work_key_duplicate[\s\S]*reusedExisting: true/,
  "trusted audit creation should detect duplicate keys and reuse one existing row",
);
assert.doesNotMatch(
  candidates,
  /export const retainCommunityIntelligenceFromDigestItem = mutation/,
  "compiler candidate proposal should not be a public manager mutation",
);
assert.doesNotMatch(
  candidates,
  /listCommunityCompilerCandidateProposals|requireCommunityManager|authSubject/,
  "the dead manager proposal queue should not remain beside the canonical audit ledger",
);
assert.match(
  candidates,
  /actorType\?: "compiler" \| "agent"[\s\S]*actorAgentKey\?: string/,
  "digest-to-candidate writes should be attributed by trusted compiler or community-agent callers",
);
assert.match(
  candidates,
  /ctx\.db\.get\(digestId as any\)|ctx\.db\.get\(args\.digestId as any\)/,
  "candidate mutation should read a specific communityCompilerDigests row",
);
assert.match(
  candidates,
  /const actorType = args\.actorType \?\? "compiler"[\s\S]*createOrReuseTrustedCommunityIntelligenceChangeRequest\([\s\S]*operation: "create_node"[\s\S]*actorType,/,
  "candidate core should create compiler-attributed change requests unless a trusted community-agent caller is supplied",
);
assert.match(
  candidates,
  /retainCompilerCandidateAutonomously[\s\S]*applicationMode: "autonomous_compiler_memory"[\s\S]*status !== "applied"/,
  "compiler memory should validate and apply atomically without a later acceptance operation",
);
assert.match(
  directory,
  /applicationMode\?: "accepted_request" \| "autonomous_compiler_memory"[\s\S]*community_intelligence_autonomous_memory_policy_forbidden/,
  "the canonical apply core should narrowly authorize only compiler-derived create-node autonomy",
);
assert.match(
  directory,
  /autonomousCompilerMemory[\s\S]*captureCommunityEvidenceCitationsForSourceTracesCore[\s\S]*evidencePolicyVersion = COMMUNITY_EVIDENCE_POLICY_VERSION/,
  "legacy compiler candidates should recapture current evidence instead of remaining stuck behind the old queue",
);
assert.match(
  candidates,
  /communitySourceTraces[\s\S]*by_community_source[\s\S]*resolveSourceTraceIdsForDigestItem|resolveSourceTraceIdsForDigestItem[\s\S]*communitySourceTraces[\s\S]*by_community_source/,
  "candidate mutation should resolve digest source ids into formal community source traces",
);
assert.match(
  candidates,
  /RESOLVABLE_SOURCE_TRACE_TYPES[\s\S]*"workflow_run"[\s\S]*"artifact"[\s\S]*"outcome"[\s\S]*"feedback"[\s\S]*"transcript"/,
  "candidate mutation should resolve workflow, artifact, outcome, feedback, and transcript source traces",
);
assert.match(
  candidates,
  /sourceTraceResolution[\s\S]*resolvedSourceReferences[\s\S]*unresolvedSourceReferences/,
  "candidate payload should preserve source-trace resolution diagnostics",
);
assert.match(
  candidates,
  /sourceVisibility:[\s\S]*sourceTraceResolution\.allResolvedTracesCommunityVisible[\s\S]*"redacted"/,
  "candidate payload should keep unresolved or redacted evidence visibly redacted",
);
assert.match(
  candidates,
  /evidenceStrength: sourceTraceIds\.length > 0 \? "observed" : "anecdotal"/,
  "candidate payload should downgrade evidence strength when formal trace evidence is missing",
);
assert.match(
  candidates,
  /needs_trace_resolution/,
  "candidate payload should tag proposals that still need trace resolution",
);
assert.doesNotMatch(
  candidates,
  /humanOverride|overrideByUserId|originalCompilerTitle|originalCompilerSummary|titleOverride|bodyMdOverride/,
  "candidate payloads should not carry public manager override metadata",
);
for (const fieldName of [
  "learningQuestion",
  "candidateClaim",
  "rejectedAlternative",
  "preferenceReason",
  "evidenceSummary",
  "uncertainty",
  "falsificationCriteria",
]) {
  assert.match(
    candidates,
    new RegExp(`${fieldName}: learningEnvelope\\.${fieldName}`),
    `candidate payload should include ${fieldName} from the learning envelope`,
  );
}
assert.match(
  candidates,
  /type LearningEnvelope[\s\S]*version: "compiler_learning_envelope_v1"/,
  "candidate generation should define a versioned learning envelope scaffold",
);
assert.match(
  candidates,
  /buildLearningEnvelope[\s\S]*sourceTraceResolution[\s\S]*resolvedCount[\s\S]*unresolvedCount/,
  "learning envelope should preserve evidence resolution context",
);
assert.match(
  candidates,
  /sourceTraceIds: sourceTraceResolution\.sourceTraceIds/,
  "candidate change request should use resolved formal source trace ids as evidence",
);
assert.doesNotMatch(
  candidates,
  /ctx\.db\.insert\("communityIntelligenceNodes"|ctx\.db\.insert\("communityIntelligenceEdges"|ctx\.db\.patch\([^)]*communityIntelligenceNodes|ctx\.db\.patch\([^)]*communityIntelligenceEdges/,
  "candidate mutation should not write directory truth directly",
);
assert.match(
  candidates,
  /evidenceFullyResolved[\s\S]*retainForCommunity[\s\S]*status: retainForCommunity \? "promising" : "candidate"[\s\S]*visibilityScope: retainForCommunity \? "community" : "admin"/,
  "autonomous memory should use evidence and privacy to select retained versus forming status",
);
assert.doesNotMatch(
  candidates,
  /pending_directory_decision|community_compiler_digest_item_already_in_airlock/,
  "autonomous memory should not retain the superseded pending-decision digest category",
);
assert.match(
  candidates,
  /event_activity[\s\S]*member_state[\s\S]*community_compiler_digest_item_not_learning_signal/,
  "event/member-state digest items should not create learning candidates",
);
assert.doesNotMatch(
  candidates,
  /person_expertise|trustScore|qualityScore|reliabilityScore|privateProfile|behavioralJudgment/,
  "compiler candidates should not introduce people scoring or expertise nodes",
);
assert.doesNotMatch(
  communityExports,
  /listCommunityCompilerCandidateProposals/,
  "community exports should not expose the deleted proposal queue",
);
assert.doesNotMatch(
  communityExports,
  /retainCommunityIntelligenceFromDigestItemImpl|export const retainCommunityIntelligenceFromDigestItem/,
  "community module should not expose public digest-to-candidate mutation",
);
assert.match(
  docs,
  /compiler-memory path[\s\S]*Compiler digest[\s\S]*atomic audit-ledger record plus directory apply[\s\S]*learningQuestion[\s\S]*falsificationCriteria/,
  "architecture doc should capture autonomous digest-to-memory retention",
);
assert.match(
  docs,
  /Fifth Implementation Slice[\s\S]*feedback[\s\S]*transcripts[\s\S]*trusted product\/runtime bridge code/,
  "docs should describe feedback and transcript evidence bridge ownership",
);
assert.match(
  docs,
  /Canonical Memory Work Identity[\s\S]*community_memory_work:v1:<sha256>[\s\S]*digestId \+ workKey[\s\S]*Array position is not an API/,
  "architecture docs should make canonical work identity and non-positional writes explicit",
);

console.log("community_compiler_candidates_contract_proof: ok");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const candidates = readFileSync(join(root, "convex/communityCompilerCandidates.ts"), "utf8");
const directory = readFileSync(join(root, "convex/communityIntelligenceDirectory.ts"), "utf8");
const communityExports = readFileSync(join(root, "convex/community.ts"), "utf8");
const docs = readFileSync(join(root, "docs/community-agent-cognition-contract-v1.md"), "utf8");

assert.match(
  directory,
  /export async function createTrustedCommunityIntelligenceChangeRequest/,
  "directory should expose a trusted helper for compiler-owned airlock requests",
);
assert.match(
  directory,
  /createTrustedCommunityIntelligenceChangeRequest[\s\S]*requireTraceIdsBelongToCommunity[\s\S]*insertChangeRequest/,
  "trusted airlock helper should validate evidence and reuse the change request path",
);
assert.match(
  candidates,
  /export async function proposeCommunityIntelligenceFromDigestItemCore/,
  "compiler candidate core should exist for the internal community-agent filesystem",
);
assert.doesNotMatch(
  candidates,
  /export const proposeCommunityIntelligenceFromDigestItem = mutation/,
  "compiler candidate proposal should not be a public manager mutation",
);
assert.match(
  candidates,
  /export const listCommunityCompilerCandidateProposals = query/,
  "compiler candidate proposal list query should exist",
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
  /createTrustedCommunityIntelligenceChangeRequest\([\s\S]*operation: "create_node"[\s\S]*actorType: args\.actorType \?\? "compiler"/,
  "candidate core should create compiler-attributed change requests unless a trusted community-agent caller is supplied",
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
  /!sourceTraceResolution\.allResolvedTracesCommunityVisible \? 0\.15 : 0/,
  "restricted evidence should raise privacy risk so apply cannot make the candidate community-visible",
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
  /normalizeCommunityCompilerLearningEnvelope[\s\S]*requireLearningEnvelopeField[\s\S]*candidateClaim[\s\S]*falsificationCriteria/,
  "learning envelope should be model-authored, complete, and bounded before persistence",
);
assert.doesNotMatch(
  candidates,
  /function buildLearningEnvelope|learningQuestionForItem|rejectedAlternativeForItem|falsificationCriteriaForItem/,
  "generic digest metadata should not manufacture semantic learning claims",
);
assert.match(
  candidates,
  /title: buildCandidateTitle\(learningEnvelope\)/,
  "candidate titles should come from the semantic claim instead of aggregate digest titles",
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
  /status: "candidate"[\s\S]*visibilityScope: "admin"/,
  "digest candidates should default to admin-visible candidate nodes",
);
assert.match(
  candidates,
  /pending_directory_decision[\s\S]*community_compiler_digest_item_already_in_airlock/,
  "pending-directory-decision digest items should not create another candidate",
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
assert.match(
  communityExports,
  /listCommunityCompilerCandidateProposalsImpl[\s\S]*export const listCommunityCompilerCandidateProposals = listCommunityCompilerCandidateProposalsImpl/,
  "community module should re-export compiler candidate list query",
);
assert.doesNotMatch(
  communityExports,
  /proposeCommunityIntelligenceFromDigestItemImpl|export const proposeCommunityIntelligenceFromDigestItem/,
  "community module should not expose public digest-to-candidate mutation",
);
assert.match(
  docs,
  /Sixth Implementation Slice[\s\S]*Compiler digest[\s\S]*candidate change request[\s\S]*Directory truth is still untouched[\s\S]*learningQuestion[\s\S]*falsificationCriteria/,
  "architecture doc should capture digest-to-candidate learning-envelope slice",
);
assert.match(
  docs,
  /Fifth Implementation Slice[\s\S]*feedback[\s\S]*transcripts[\s\S]*trusted product\/runtime bridge code/,
  "docs should describe feedback and transcript evidence bridge ownership",
);

console.log("community_compiler_candidates_contract_proof: ok");

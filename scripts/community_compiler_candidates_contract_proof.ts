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
  /export const proposeCommunityIntelligenceFromDigestItem = mutation/,
  "compiler candidate mutation should exist",
);
assert.match(
  candidates,
  /export const listCommunityCompilerCandidateProposals = query/,
  "compiler candidate proposal list query should exist",
);
assert.match(
  candidates,
  /requireCommunityManager\(\{ ctx, communityId: args\.communityId, userId \}\)/,
  "digest-to-candidate functions should be manager-scoped in this slice",
);
assert.match(
  candidates,
  /ctx\.db\.get\(digestId as any\)|ctx\.db\.get\(args\.digestId as any\)/,
  "candidate mutation should read a specific communityCompilerDigests row",
);
assert.match(
  candidates,
  /createTrustedCommunityIntelligenceChangeRequest\([\s\S]*operation: "create_node"[\s\S]*actorType: "compiler"/,
  "candidate mutation should create a compiler-attributed create_node change request",
);
assert.match(
  candidates,
  /communitySourceTraces[\s\S]*by_community_source[\s\S]*resolveSourceTraceIdsForDigestItem|resolveSourceTraceIdsForDigestItem[\s\S]*communitySourceTraces[\s\S]*by_community_source/,
  "candidate mutation should resolve digest source ids into formal community source traces",
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
assert.match(
  candidates,
  /humanOverride[\s\S]*overrideByUserId[\s\S]*originalCompilerTitle[\s\S]*originalCompilerSummary/,
  "candidate payload should audit manager edits separately from compiler output",
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
  /member_state[\s\S]*open_question[\s\S]*community_compiler_member_state_candidate_must_be_open_question/,
  "member-state digest items should only create open-question candidates",
);
assert.doesNotMatch(
  candidates,
  /person_expertise|trustScore|qualityScore|reliabilityScore|privateProfile|behavioralJudgment/,
  "compiler candidates should not introduce people scoring or expertise nodes",
);
assert.match(
  communityExports,
  /proposeCommunityIntelligenceFromDigestItemImpl[\s\S]*export const proposeCommunityIntelligenceFromDigestItem = proposeCommunityIntelligenceFromDigestItemImpl/,
  "community module should re-export digest-to-candidate mutation",
);
assert.match(
  communityExports,
  /listCommunityCompilerCandidateProposalsImpl[\s\S]*export const listCommunityCompilerCandidateProposals = listCommunityCompilerCandidateProposalsImpl/,
  "community module should re-export compiler candidate list query",
);
assert.match(
  docs,
  /Sixth Implementation Slice[\s\S]*Compiler digest[\s\S]*candidate change request[\s\S]*Directory truth is still untouched/,
  "architecture doc should capture digest-to-candidate slice",
);

console.log("community_compiler_candidates_contract_proof: ok");

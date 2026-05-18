import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const schema = readFileSync(join(root, "convex/schema.ts"), "utf8");
const digest = readFileSync(join(root, "convex/communityCompilerDigest.ts"), "utf8");
const communityExports = readFileSync(join(root, "convex/community.ts"), "utf8");
const docs = readFileSync(join(root, "docs/community-agent-cognition-contract-v1.md"), "utf8");

assert.match(schema, /communityCompilerDigests: defineTable/, "compiler digest table should exist");
assert.match(
  schema,
  /communityCompilerDigests: defineTable\([\s\S]*dedupeKey: v\.string\(\)[\s\S]*items: v\.array\([\s\S]*category: v\.union\([\s\S]*v\.literal\("chat_activity"\)[\s\S]*v\.literal\("pending_directory_decision"\)/,
  "compiler digest table should store bounded typed non-canonical digest items",
);
assert.match(
  schema,
  /communityCompilerDigests: defineTable\([\s\S]*signalCounts: v\.object\([\s\S]*newMembers: v\.number\(\)[\s\S]*aiFeedReactingMembers: v\.number\(\)/,
  "compiler digest table should persist aggregate signal counts",
);
assert.match(
  schema,
  /\.index\("by_community_dedupeKey", \["communityId", "dedupeKey"\]\)/,
  "compiler digest table should support idempotent per-community digest upserts",
);
assert.match(
  digest,
  /const COMMUNITY_COMPILER_DIGEST_WINDOW_DAYS = 30;/,
  "compiler digest pass should use one fixed 30-day horizon",
);
assert.doesNotMatch(
  digest,
  /windowDays|window_days|days:\s*v\.|startAt|startedAt:\s*v\.|fromDate|toDate/,
  "compiler digest pass should not expose a user-selectable date window",
);
assert.match(
  digest,
  /export const runCommunityCompilerDigestPass = mutation/,
  "compiler digest pass should be a mutation that persists non-canonical output",
);
assert.match(
  digest,
  /export const listCommunityCompilerDigests = query/,
  "compiler digests should have a manager-scoped read path",
);
assert.match(
  digest,
  /function activeCompilerTrace[\s\S]*visibilityScope === "admin"[\s\S]*visibilityScope === "community"[\s\S]*visibilityScope === "public"/,
  "compiler digest should include trusted non-private source traces, including redacted/admin evidence",
);
assert.match(
  digest,
  /requireCommunityManager\(\{ ctx, communityId: args\.communityId, userId \}\)/,
  "compiler digest pass should require community manager authority in this slice",
);
for (const tableName of [
  "communityArchiveDocuments",
  "communitySourceTraces",
  "communityAiFeedPosts",
  "communityOutcomeObservations",
  "communityIntelligenceChangeRequests",
]) {
  assert.match(
    digest,
    new RegExp(`query\\("${tableName}"[\\s\\S]*\\.take\\(`),
    `compiler digest pass should read ${tableName} through a bounded query`,
  );
}
for (const tableName of [
  "communityEvents",
  "communityMemberships",
  "communityPresence",
  "communityAiFeedReactions",
]) {
  assert.doesNotMatch(
    digest,
    new RegExp(`query\\("${tableName}"`),
    `compiler digest pass should exclude ${tableName} from learning-signal digests`,
  );
}
assert.match(
  digest,
  /dedupeKey = `community_compiler_digest:v1:/,
  "compiler digest pass should use a deterministic digest dedupe key",
);
assert.match(
  digest,
  /ctx\.db\.patch\(existing\._id[\s\S]*ctx\.db\.insert\("communityCompilerDigests"/,
  "compiler digest pass should upsert one digest per dedupe key",
);
{
  const payloadStart = digest.indexOf("const payload = {");
  assert.notEqual(payloadStart, -1, "compiler digest pass should build a patch payload");
  const payloadEnd = digest.indexOf("\n    let digestId", payloadStart);
  assert.notEqual(payloadEnd, -1, "compiler digest patch payload should end before upsert branching");
  const patchPayload = digest.slice(payloadStart, payloadEnd);
  assert.doesNotMatch(
    patchPayload,
    /createdByActorType|createdByUserId|createdByAgentKey|createdAt/,
    "compiler digest reruns should not rewrite original creation attribution",
  );
  assert.match(
    digest,
    /ctx\.db\.insert\("communityCompilerDigests"[\s\S]*createdByActorType: "compiler" as const[\s\S]*createdByAgentKey: COMMUNITY_COMPILER_DIGEST_AGENT_KEY[\s\S]*createdAt: nowMs/,
    "new compiler digests should still record creation attribution",
  );
}
assert.match(
  digest,
  /This digest is non-canonical compiler output/,
  "compiler digest summary should label itself as non-canonical",
);
assert.match(
  digest,
  /Events, member joins, presence, reactions, and generic activity are excluded from learning digests/,
  "compiler digest summary should make the learning-signal boundary explicit",
);
assert.doesNotMatch(
  digest,
  /category: "event_activity"|category: "member_state"/,
  "compiler digest pass should not emit event/member-state learning items",
);
assert.doesNotMatch(
  digest,
  /ctx\.db\.insert\("communityIntelligenceNodes"|ctx\.db\.insert\("communityIntelligenceEdges"|ctx\.db\.insert\("communityIntelligenceChangeRequests"|createCommunityIntelligenceChangeRequest/,
  "compiler digest pass should not mutate directory truth or create policy requests in this slice",
);
assert.doesNotMatch(
  digest,
  /trustScore|qualityScore|reliabilityScore|privateProfile|behavioralJudgment/,
  "compiler digest pass should not introduce hidden member scoring",
);
assert.match(
  communityExports,
  /runCommunityCompilerDigestPassImpl[\s\S]*export const runCommunityCompilerDigestPass = runCommunityCompilerDigestPassImpl/,
  "community module should re-export digest pass mutation",
);
assert.match(
  communityExports,
  /listCommunityCompilerDigestsImpl[\s\S]*export const listCommunityCompilerDigests = listCommunityCompilerDigestsImpl/,
  "community module should re-export digest list query",
);
assert.match(
  docs,
  /Fourth Implementation Slice[\s\S]*communityCompilerDigests[\s\S]*Compiler digests are not directory truth/,
  "architecture doc should capture the non-canonical compiler digest slice",
);

console.log("community_compiler_digest_contract_proof: ok");

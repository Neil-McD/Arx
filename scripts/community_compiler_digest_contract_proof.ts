import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const schema = readFileSync(join(root, "convex/schema.ts"), "utf8");
const digest = readFileSync(join(root, "convex/communityCompilerDigest.ts"), "utf8");
const evidenceCore = readFileSync(join(root, "convex/communityCompilerEvidenceCore.ts"), "utf8");
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
  evidenceCore,
  /COMPILER_EVIDENCE_VISIBILITY_SCOPES = \["admin", "community", "public"\] as const[\s\S]*isCommunityCompilerEligibleVisibility/,
  "shared compiler evidence selection should include trusted non-private source traces, including redacted/admin evidence",
);
assert.match(
  digest,
  /requireCommunityManager\(\{ ctx, communityId: args\.communityId, userId \}\)/,
  "compiler digest pass should require community manager authority in this slice",
);
for (const tableName of [
  "communityArchiveDocuments",
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
assert.match(
  digest,
  /measureCommunityCompilerEvidenceForCommunity[\s\S]*selectedSourceTraceRows = compilerEvidence\.selectedRows/,
  "compiler digest pass should consume the shared pending-evidence selector",
);
assert.match(
  evidenceCore,
  /\.query\("communitySourceTraces"[\s\S]*\.withIndex\("by_community_compilerState_visibility_pendingSince"[\s\S]*\.eq\("visibilityScope", visibilityScope\)[\s\S]*\.take\(COMPILER_EVIDENCE_SCAN_LIMIT \+ 1\)/,
  "source trace reads for digest consumption should come from the shared pending-evidence core",
);
assert.doesNotMatch(
  digest,
  /MAX_SOURCE_TRACE_FETCH|traceRowsRaw/,
  "compiler digest should not reintroduce broad source trace fetch aliases",
);
for (const match of digest.matchAll(/query\("communitySourceTraces"[\s\S]{0,700}/g)) {
  assert.doesNotMatch(
    match[0],
    /by_community_createdAt|gte\("createdAt", windowStartedAtMs\)/,
    "compiler digest should not consume broad 30-day source traces as handled evidence",
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
  /function bridgeSourceTypeForDigestCategory[\s\S]*category === "chat_activity"[\s\S]*return "chat"[\s\S]*category === "ai_feed_signal"[\s\S]*return "ai_feed"[\s\S]*category === "resource_activity"[\s\S]*return "resource"[\s\S]*category === "outcome_signal"[\s\S]*return "outcome"/,
  "compiler digest bridge should map only learning digest categories to product source trace types",
);
assert.match(
  digest,
  /function digestSignalSourceId[\s\S]*COMPILER_DIGEST_SIGNAL_SOURCE_ID_PREFIX[\s\S]*"v1"[\s\S]*args\.dayKey[\s\S]*args\.item\.category/,
  "compiler digest bridge should use deterministic per-day source ids",
);
assert.match(
  digest,
  /async function attachDigestSignalSourceTraces[\s\S]*upsertCommunitySourceTrace[\s\S]*actorType: "compiler"[\s\S]*actorAgentKey: COMMUNITY_COMPILER_DIGEST_AGENT_KEY[\s\S]*allowExistingUpdate: true/,
  "compiler digest bridge should upsert source traces as compiler-owned idempotent evidence",
);
assert.match(
  digest,
  /item\.category === "ai_feed_signal"[\s\S]*communityAgentAiFeedSourceIds\.has/,
  "compiler digest bridge should not re-open community-agent-authored AI feed output as evidence",
);
assert.match(
  digest,
  /communityAgentAiFeedSourceIds = new Set\([\s\S]*COMMUNITY_AGENT_SELF_AUTHORED_TRACE_AGENT_KEY[\s\S]*authorLabel[\s\S]*community agent/,
  "compiler digest bridge should classify canonical and legacy community-agent AI feed sources before bridging",
);
assert.match(
  digest,
  /eligibleAiFeedRows = aiFeedRows\.filter\([\s\S]*!communityAgentAiFeedSourceIds\.has[\s\S]*for \(const post of eligibleAiFeedRows\.slice/,
  "self-authored AI feed rows should be removed before digest items are created, not only skipped at the bridge",
);
assert.match(
  digest,
  /selectedSourceTraceRows = compilerEvidence\.selectedRows\.filter\([\s\S]*COMPILER_DIGEST_SIGNAL_SOURCE_ID_PREFIX/,
  "digest bridge traces should stay on their originating digest items instead of being duplicated as direct source-trace items",
);
assert.doesNotMatch(
  digest,
  /markSelectedSourceTracesCompiled|compilerState: "compiled" as const/,
  "compiler digest must package pending evidence without settling cognition-owned lifecycle state",
);
assert.match(
  digest,
  /attachDigestSignalSourceTraces[\s\S]*ctx\.db\.patch\(digestId as any,[\s\S]*items: bridgeResult\.items/,
  "compiler digest bridge should attach created source trace ids back to digest items",
);
assert.match(
  digest,
  /ctx\.db\.patch\(existing\._id[\s\S]*ctx\.db\.insert\("communityCompilerDigests"/,
  "compiler digest pass should upsert one digest per dedupe key",
);
assert.match(
  digest,
  /MAX_SOURCE_TRACE_IDS_PER_ITEM = 500/,
  "compiler digest should preserve the full selected evidence batch in the source-trace digest item",
);
assert.doesNotMatch(
  digest,
  /mergeSourceTraceDigestItem|existingSourceTraceItem/,
  "digest refreshes should represent current pending evidence, not retain settled historical batches",
);
assert.match(
  digest,
  /selectedSourceTraceRows\.length > 0[\s\S]*category: "source_trace_signal"[\s\S]*sourceTraceIds: sourceTraceIds\(selectedSourceTraceRows\)/,
  "compiler digest should represent selected pending traces in a source_trace_signal item",
);
assert.match(
  digest,
  /selected pending source traces available for cognition[\s\S]*remain pending until a community cognition cycle handles them/,
  "compiler digest should label selected traces as available without claiming they were handled",
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
  /Fourth Implementation Slice[\s\S]*Compiler digests are not directory truth[\s\S]*bridge-owned[\s\S]*Digest-signal source traces are wake evidence/,
  "architecture doc should capture the non-canonical compiler digest slice",
);
assert.match(
  docs,
  /Twelfth Implementation Slice[\s\S]*Pending source traces[\s\S]*remain pending[\s\S]*community cognition cycle[\s\S]*idempotent bridge upserts must not reopen/,
  "architecture doc should assign source-trace settlement to cognition rather than the digest",
);

console.log("community_compiler_digest_contract_proof: ok");

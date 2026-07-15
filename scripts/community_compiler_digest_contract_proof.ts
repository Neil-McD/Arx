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
  /communityCompilerDigests: defineTable\([\s\S]*dedupeKey: v\.string\(\)[\s\S]*items: v\.array\([\s\S]*workKey: v\.optional\(v\.string\(\)\)[\s\S]*category: v\.union\([\s\S]*v\.literal\("chat_activity"\)[\s\S]*v\.literal\("source_trace_signal"\)/,
  "compiler digest table should store bounded typed non-canonical digest items",
);
assert.match(
  schema,
  /communityCompilerDigests: defineTable\([\s\S]*versionKey: v\.optional\(v\.string\(\)\)[\s\S]*agentHandoffState: v\.optional\([\s\S]*v\.literal\("pending"\)[\s\S]*v\.literal\("running"\)[\s\S]*v\.literal\("handled"\)/,
  "compiler digest table should carry autonomous handoff state without an approval queue",
);
assert.match(
  schema,
  /communityCompilerDigests: defineTable\([\s\S]*signalCounts: v\.object\([\s\S]*newMembers: v\.number\(\)[\s\S]*aiFeedReactingMembers: v\.number\(\)/,
  "compiler digest table should persist aggregate signal counts",
);
assert.match(
  schema,
  /\.index\("by_community_versionKey", \["communityId", "versionKey"\]\)/,
  "compiler digest table should support idempotent immutable work-set lookup",
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
]) {
  assert.match(
    digest,
    new RegExp(`query\\("${tableName}"[\\s\\S]*\\.take\\(`),
    `compiler digest pass should read ${tableName} through a bounded query`,
  );
}
assert.doesNotMatch(
  digest,
  /pending_directory_decision|pendingChangeRequests|pending directory decisions|policy airlock/,
  "compiler digests should not ingest the superseded approval plane",
);
assert.match(
  digest,
  /measureCommunityCompilerEvidenceForCommunity[\s\S]*selectedSourceTraceRows = compilerEvidence\.selectedRows/,
  "compiler digest pass should consume the shared pending-evidence selector",
);
assert.match(
  digest,
  /runCommunityCompilerDigestPassInternal[\s\S]*requireTrigger: v\.optional\(v\.boolean\(\)\)[\s\S]*args\.requireTrigger && !compilerEvidence\.measurement\.should_run[\s\S]*skipped: true/,
  "heartbeat compiler retries should no-op when another transaction already consumed the trigger",
);
assert.match(
  evidenceCore,
  /\.query\("communitySourceTraces"[\s\S]*\.withIndex\("by_community_compilerState_visibility_pendingSince"[\s\S]*\.eq\("visibilityScope", visibilityScope\)[\s\S]*\.take\(COMPILER_EVIDENCE_SCAN_LIMIT \+ 1\)/,
  "source trace reads for digest consumption should come from the shared pending-evidence core",
);
assert.doesNotMatch(
  digest,
  /MAX_SOURCE_TRACE_FETCH|traceRowsRaw|query\("communitySourceTraces"[\s\S]*by_community_createdAt"[\s\S]*gte\("createdAt", windowStartedAtMs\)/,
  "compiler digest should not consume broad 30-day source traces as handled evidence",
);
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
  /buildCommunityMemoryDigestVersionKey\([\s\S]*workKeys: sortedItems\.map[\s\S]*dedupeKey = `community_compiler_digest:v2:/,
  "compiler digest pass should derive immutable version identity from canonical work keys",
);
assert.match(
  digest,
  /contentRevisions:[\s\S]*sortedItems\.map\(digestItemContentRevision\)[\s\S]*row\.updatedAt \?\? row\.createdAt/,
  "digest version identity should change when the same evidence is materially revised",
);
assert.match(
  digest,
  /withIndex\("by_community_versionKey"[\s\S]*existing\?\._id \?\? await ctx\.db\.insert\("communityCompilerDigests"/,
  "compiler digest pass should reuse or insert immutable digest content by version",
);
assert.doesNotMatch(
  digest,
  /ctx\.db\.patch\(existing\._id|mergeSourceTraceDigestItem|existingSourceTraceItem/,
  "new compiler passes must not mutate daily digest content or merge snapshots",
);
assert.match(
  digest,
  /buildCommunityMemoryWorkKey\([\s\S]*communityId: args\.communityId[\s\S]*category: item\.category[\s\S]*sourceTraceIds: item\.sourceTraceIds/,
  "every new digest item should receive a community-scoped evidence work key",
);
assert.match(
  digest,
  /seenWorkKeys[\s\S]*seenWorkKeys\.has\(item\.workKey\)[\s\S]*seenWorkKeys\.add\(item\.workKey\)/,
  "one digest should collapse duplicate work keys before persistence",
);
assert.match(
  digest,
  /MAX_SOURCE_TRACE_IDS_PER_ITEM = 500/,
  "compiler digest should preserve the full selected evidence batch in the source-trace digest item",
);
assert.match(
  digest,
  /selectedDistinctSourceTraceRows\.length > 0[\s\S]*category: "source_trace_signal"[\s\S]*sourceTraceIds: sourceTraceIds\(selectedDistinctSourceTraceRows\)/,
  "compiler digest should represent distinct selected pending traces in a source_trace_signal item",
);
assert.match(
  digest,
  /representedSourceTraceIds[\s\S]*representedAiFeedSourceIds[\s\S]*representedSelectedSourceTraceRows = selectedSourceTraceRows\.filter[\s\S]*traceRows: representedSelectedSourceTraceRows/,
  "compiler digest should mark distinct trace-item evidence and deduplicated AI Feed promotion traces only after semantic representation",
);
assert.match(
  digest,
  /const row = \(await ctx\.db\.get\(digestId\)\)[\s\S]*community_compiler_digest_write_failed[\s\S]*markSelectedSourceTracesCompiled/,
  "selected source traces should only be marked compiled after the digest write is confirmed",
);
assert.match(
  digest,
  /markSelectedSourceTracesCompiled[\s\S]*normalizeIdValue\(fresh\.communityId\) !== normalizeIdValue\(args\.communityId\)[\s\S]*fresh\.compilerState !== undefined && fresh\.compilerState !== "pending"[\s\S]*compilerState: "compiled" as const[\s\S]*compilerLastHandledAt: args\.nowMs[\s\S]*compilerLastDigestId: args\.digestId/,
  "compiled marking should stay same-community and only close still-pending traces",
);
assert.match(
  digest,
  /ctx\.db\.insert\("communityCompilerDigests"[\s\S]*agentHandoffState: sortedItems\.length > 0 \? "pending" as const : "handled" as const[\s\S]*createdByActorType: "compiler" as const[\s\S]*createdByAgentKey: COMMUNITY_COMPILER_DIGEST_AGENT_KEY[\s\S]*createdAt: nowMs/,
  "new non-empty digest versions should create pending autonomous handoffs with compiler attribution",
);
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
assert.match(
  docs,
  /Twelfth Implementation Slice[\s\S]*Pending source traces[\s\S]*marked `compiled`[\s\S]*only after the digest row exists[\s\S]*Unselected source traces remain `pending`/,
  "architecture doc should capture source-trace evidence consumption",
);

console.log("community_compiler_digest_contract_proof: ok");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const compilerWindow = readFileSync(join(root, "convex/communityCompilerWindow.ts"), "utf8");
const communityExports = readFileSync(join(root, "convex/community.ts"), "utf8");
const docs = readFileSync(join(root, "docs/community-agent-cognition-contract-v1.md"), "utf8");

assert.match(
  compilerWindow,
  /const COMMUNITY_COMPILER_WINDOW_DAYS = 30;/,
  "compiler window should use one fixed 30-day horizon",
);
assert.doesNotMatch(
  compilerWindow,
  /windowDays|window_days|days:\s*v\.|startAt|startedAt:\s*v\.|fromDate|toDate/,
  "compiler window should not expose a user-selectable date window",
);
assert.match(
  compilerWindow,
  /export const readCommunityCompilerWindow = query/,
  "compiler window should be a read-only Convex query",
);
assert.match(
  compilerWindow,
  /requireCommunityManager\(\{ ctx, communityId: args\.communityId, userId \}\)/,
  "compiler window should be manager-scoped in this backend slice",
);
for (const tableName of [
  "communityArchiveDocuments",
  "communitySourceTraces",
  "communityAiFeedPosts",
  "communityEvents",
  "communityOutcomeObservations",
  "communityIntelligenceChangeRequests",
  "communityMemberships",
  "communityPresence",
  "communityAiFeedReactions",
]) {
  assert.match(
    compilerWindow,
    new RegExp(`query\\("${tableName}"[\\s\\S]*\\.take\\(`),
    `compiler window should read ${tableName} through a bounded query`,
  );
}
assert.match(
  compilerWindow,
  /query\("communityArchiveDocuments"[\s\S]*withIndex\("by_community_createdAt"[\s\S]*gte\("createdAt", windowStartedAtMs\)[\s\S]*\.take\(/,
  "archive-backed chat/resource/feed activity should be bounded to the fixed compiler window",
);
assert.match(
  compilerWindow,
  /COMPILER_EVIDENCE_VISIBILITY_SCOPES\.map\(\(visibilityScope\)[\s\S]*query\("communitySourceTraces"[\s\S]*withIndex\("by_community_visibility_createdAt"[\s\S]*eq\("visibilityScope", visibilityScope\)[\s\S]*gte\("createdAt", windowStartedAtMs\)[\s\S]*\.take\(/,
  "source traces should be visibility-aware and bounded to the fixed compiler window",
);
assert.match(
  compilerWindow,
  /isCommunityCompilerEvidenceTrace/,
  "compiler window should include trusted non-private source traces while excluding community-agent self-authored evidence",
);
assert.match(
  compilerWindow,
  /query\("communityAiFeedPosts"[\s\S]*withIndex\("by_community_status_createdAt"[\s\S]*eq\("status", "live"\)[\s\S]*gte\("createdAt", windowStartedAtMs\)[\s\S]*\.take\(/,
  "AI feed signal read should use live posts inside the compiler window",
);
assert.match(
  compilerWindow,
  /query\("communityMemberships"[\s\S]*withIndex\("by_community_createdAt"[\s\S]*gte\("createdAt", windowStartedAtMs\)[\s\S]*\.take\(MAX_NEW_MEMBER_FETCH\)/,
  "member joins should be read as a bounded 30-day aggregate input",
);
assert.match(
  compilerWindow,
  /query\("communityPresence"[\s\S]*withIndex\("by_community_lastSeenAt"[\s\S]*gte\("lastSeenAt", windowStartedAtMs\)[\s\S]*\.take\(MAX_ACTIVE_MEMBER_FETCH\)/,
  "active member presence should be read as a bounded 30-day aggregate input",
);
assert.match(
  compilerWindow,
  /member_state:[\s\S]*new_members_count[\s\S]*active_members_count[\s\S]*posting_members_in_activity_count[\s\S]*ai_feed_reacting_members_count[\s\S]*latest_new_members/,
  "compiler window should expose aggregate member state without making members canonical memory",
);
assert.match(
  compilerWindow,
  /aggregate_only: true[\s\S]*no_hidden_scoring: true/,
  "member state should carry explicit aggregate/no-hidden-scoring boundaries",
);
assert.doesNotMatch(
  compilerWindow,
  /trustScore|qualityScore|reliabilityScore|privateProfile|behavioralJudgment/,
  "member state should not add hidden people scoring or private behavioral judgment fields",
);
assert.match(
  compilerWindow,
  /rankedAiFeedSignals[\s\S]*Number\(b\.score/,
  "compiler window should expose AI feed signal ranking within the window",
);
assert.doesNotMatch(
  compilerWindow,
  /\.collect\(\)/,
  "compiler window should not use unbounded collects",
);
assert.doesNotMatch(
  compilerWindow,
  /ctx\.db\.(insert|patch|delete|replace)/,
  "compiler window should not mutate data",
);
assert.doesNotMatch(
  compilerWindow,
  /query\("communityIntelligenceNodes"|createCommunityIntelligenceNode|updateCommunityIntelligenceNode/,
  "compiler window should not read or mutate canonical directory nodes in this slice",
);
assert.match(
  communityExports,
  /readCommunityCompilerWindowImpl[\s\S]*export const readCommunityCompilerWindow = readCommunityCompilerWindowImpl/,
  "community module should re-export the compiler window read model",
);
assert.match(
  docs,
  /0-30 days = compiler window \/ community working memory[\s\S]*30\+ days = long-term memory retrieval only/,
  "architecture doc should capture the 0-30 day compiler window boundary",
);
assert.match(
  docs,
  /member_state:[\s\S]*new_members_count[\s\S]*active_members_count[\s\S]*latest_new_members, capped[\s\S]*must not include inferred personality, hidden quality scores, private profiles, or behavioral judgments/,
  "architecture doc should capture member-state aggregate boundaries",
);

console.log("community_compiler_window_contract_proof: ok");

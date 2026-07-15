import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const aiFeed = readFileSync(join(root, "convex/communityAiFeed.ts"), "utf8");
const compilerInputs = readFileSync(join(root, "convex/communityCompilerInputs.ts"), "utf8");
const directory = readFileSync(join(root, "convex/communityIntelligenceDirectory.ts"), "utf8");
const communityExports = readFileSync(join(root, "convex/community.ts"), "utf8");

function exportedFunctionBlock(source: string, exportName: string): string {
  const startToken = `export const ${exportName}`;
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${exportName} should exist`);
  const next = source.indexOf("\nexport const ", start + startToken.length);
  return source.slice(start, next === -1 ? source.length : next);
}

function namedFunctionBlock(source: string, functionName: string): string {
  const startToken = `async function ${functionName}`;
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextAsync = source.indexOf("\nasync function ", start + startToken.length);
  const nextExport = source.indexOf("\nexport const ", start + startToken.length);
  const candidates = [nextAsync, nextExport].filter((index) => index !== -1);
  const end = candidates.length > 0 ? Math.min(...candidates) : source.length;
  return source.slice(start, end);
}

assert.match(
  directory,
  /export async function upsertCommunitySourceTrace[\s\S]*by_community_source[\s\S]*communitySourceTraces/,
  "directory substrate should expose an idempotent source-trace upsert helper",
);
assert.match(
  aiFeed,
  /import \{ upsertCommunitySourceTrace \} from "\.\/communityIntelligenceDirectory";/,
  "AI feed should bridge into the source-trace substrate",
);
assert.match(
  aiFeed,
  /upsertSourceTraceForAiFeedPost[\s\S]*sourceType: "ai_feed"[\s\S]*actorType: "agent"/,
  "AI feed trace bridge should create agent-attributed ai_feed traces",
);
{
  const block = namedFunctionBlock(aiFeed, "publishCommunityAiFeedAgentPostForUser");
  assert.match(
    block,
    /requireCommunityModerator\(\{/,
    "AI feed agent publication helper should require governance authority before it can create compiler evidence",
  );
  assert.doesNotMatch(
    block,
    /requireCommunityChatAccess\(\{/,
    "AI feed agent publication helper should not be member-callable through chat access alone",
  );
}
assert.match(
  aiFeed,
  /upsertHiddenSourceTraceForAiFeedPost[\s\S]*visibilityScope: "admin"[\s\S]*sourceVisibility: "redacted"/,
  "hidden AI feed posts should retain restricted trace evidence",
);
assert.match(
  aiFeed,
  /hideCommunityAiFeedPost[\s\S]*upsertHiddenSourceTraceForAiFeedPost/,
  "moderator-hidden AI feed posts should update the source trace policy",
);
assert.match(
  aiFeed,
  /upsertHiddenSourceTraceForAiFeedPost[\s\S]*Redaction changes readability, not source authorship[\s\S]*actorUserId: args\.post\.authorUserId[\s\S]*actorAgentKey: args\.post\.agentKey[\s\S]*hideFeedPost[\s\S]*upsertHiddenSourceTraceForAiFeedPost/,
  "hidden or pruned AI feed posts should narrow visibility without replacing source attribution",
);
assert.match(
  aiFeed,
  /const existing = existingRows\.find[\s\S]*await upsertSourceTraceForAiFeedPost\(args\.ctx, existing, args\.nowMs\)/,
  "novelty-key reuse should still ensure the AI feed source trace exists",
);
assert.match(
  aiFeed,
  /const created = await getFeedPostOrThrow[\s\S]*await upsertArchiveDocumentForAiFeedPost\(args\.ctx, created\);[\s\S]*await upsertSourceTraceForAiFeedPost\(args\.ctx, created, args\.nowMs\);/,
  "new AI feed posts should ensure archive evidence and source trace evidence",
);
assert.match(
  compilerInputs,
  /export const listCommunityCompilerInputs = query/,
  "compiler input read model should be exposed as a query",
);
assert.match(
  compilerInputs,
  /requireCommunityManager\(\{ ctx, communityId: args\.communityId, userId \}\)/,
  "compiler input read model should be manager-scoped",
);
assert.match(
  compilerInputs,
  /COMPILER_EVIDENCE_VISIBILITY_SCOPES[\s\S]*by_community_visibility_createdAt[\s\S]*isCommunityCompilerEvidenceTrace/,
  "compiler input read model should use visibility-aware source trace reads for trusted non-private non-self-authored evidence",
);
for (const tableName of [
  "communitySourceTraces",
  "communityAiFeedPosts",
  "communityOutcomeObservations",
]) {
  assert.match(
    compilerInputs,
    new RegExp(`query\\("${tableName}"`),
    `compiler input read model should read ${tableName}`,
  );
}
assert.doesNotMatch(
  compilerInputs,
  /communityIntelligenceChangeRequests|pending_change_requests|pendingChangeRequests/,
  "compiler inputs should not restore the deleted approval-plane backlog",
);
assert.match(
  compilerInputs,
  /query\("communityAiFeedPosts"[\s\S]*withIndex\("by_community_status_score_createdAt"[\s\S]*\.take\(aiFeedFetchLimit\)/,
  "compiler input read model should use a bounded indexed AI feed read",
);
assert.doesNotMatch(
  compilerInputs,
  /query\("communityAiFeedPosts"[\s\S]*\.collect\(\)/,
  "compiler input read model should not collect all live AI feed posts",
);
assert.match(
  compilerInputs,
  /rankedAiFeedSignals[\s\S]*Number\(b\.score/,
  "compiler input read model should expose ranked AI feed signal",
);
assert.doesNotMatch(
  compilerInputs,
  /communityIntelligenceNodes|createCommunityIntelligenceNode|updateCommunityIntelligenceNode/,
  "compiler input read model should not mutate or read directory truth nodes in this slice",
);
assert.match(
  communityExports,
  /listCommunityCompilerInputsImpl[\s\S]*export const listCommunityCompilerInputs = listCommunityCompilerInputsImpl/,
  "community module should re-export compiler input read model",
);

console.log("community_compiler_inputs_contract_proof: ok");

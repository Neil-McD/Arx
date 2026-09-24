import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(join(root, relativePath), "utf8");

assert.equal(existsSync(join(root, "convex/communityArchiveDocuments.ts")), false);
assert.equal(existsSync(join(root, "convex/communityArchive.ts")), false);
assert.equal(existsSync(join(root, "convex/communityArchiveRetrieval.ts")), false);

const excludedRuntimeFiles = new Set([
  "communityCognitionCleanupCore.ts",
  "schema.ts",
]);
const activeConvexSources = readdirSync(join(root, "convex"))
  .filter((file) => file.endsWith(".ts") && !file.endsWith(".d.ts"))
  .filter((file) => !excludedRuntimeFiles.has(file))
  .map((file) => ({ file, source: read(`convex/${file}`) }));

for (const { file, source } of activeConvexSources) {
  assert.doesNotMatch(
    source,
    /from "\.\/communityArchiveDocuments"|query\("communityArchiveDocuments"|insert\("communityArchiveDocuments"/,
    `${file} must not read, write, or import the dormant archive`,
  );
}

const communityMaintenance = read("convex/communityMaintenance.ts");
const adminGateway = read("shared/cloudCommunityAdminGateway.ts");
const schema = read("convex/schema.ts");
const cleanup = read("convex/communityCognitionCleanupCore.ts");
assert.equal(existsSync(join(root, "convex/communityRecentContext.ts")), false);
const runtimeAgentLoop = read("convex/runtimeAgentLoop.ts");
const httpMcp = read("convex/httpMcp.ts");
const canonicalExecutor = read("convex/polynetCanonicalExecutor.ts");
const mcp = read("shared/polynetMcp.ts");
assert.doesNotMatch(read("convex/_generated/api.d.ts"), /communityArchiveDocuments/);

for (const source of [communityMaintenance, adminGateway]) {
  assert.doesNotMatch(source, /requestCommunityArchiveBackfill|backfillCommunityArchiveInternal/);
}
assert.match(schema, /communityArchiveDocuments: defineTable/);
assert.match(schema, /\.vectorIndex\("by_embedding"/);
assert.match(cleanup, /table: "communityArchiveDocuments"/);
assert.match(communityMaintenance, /purgeOrphanedCommunityUserArtifactsInternal/);
assert.doesNotMatch(read("convex/_generated/api.d.ts"), /communityRecentContext/);
assert.match(runtimeAgentLoop, /executePolynetCanonicalTool/);
assert.doesNotMatch(
  runtimeAgentLoop,
  /communityRecentContext\.readCommunityRecentContextInternal/,
  "native runtime must not restore the retired community_search wrapper",
);
assert.match(httpMcp, /executePolynetCanonicalTool/);
assert.match(canonicalExecutor, /searchCommunityRepositoryInternal/);
assert.doesNotMatch(runtimeAgentLoop, /communityArchive\.searchCommunityKnowledgeInternal/);
for (const source of [httpMcp, canonicalExecutor, mcp]) {
  assert.doesNotMatch(source, /communityArchive\.searchCommunityKnowledgeInternal|archive_context/);
}

console.log("community_archive_runtime_severance_contract_proof: ok");

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(join(root, relativePath), "utf8");

const retainedArchiveModule = "convex/communityArchiveDocuments.ts";
assert.equal(existsSync(join(root, retainedArchiveModule)), true);

const excludedRuntimeFiles = new Set([
  "communityArchiveDocuments.ts",
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

const communityArchive = read("convex/communityArchive.ts");
const communityBarrel = read("convex/community.ts");
const adminGateway = read("shared/cloudCommunityAdminGateway.ts");
const emailDigests = read("convex/emailDigests.ts");
const digestCore = read("shared/weeklyDigestCore.ts");
const schema = read("convex/schema.ts");
const cleanup = read("convex/communityCognitionCleanupCore.ts");
const retrieval = read("convex/communityArchiveRetrieval.ts");
const mcp = read("shared/polynetMcp.ts");

for (const source of [communityArchive, communityBarrel, adminGateway]) {
  assert.doesNotMatch(source, /requestCommunityArchiveBackfill|backfillCommunityArchiveInternal/);
}
assert.doesNotMatch(emailDigests, /communityArchiveDocuments|archiveDocuments|archiveDocumentCount/);
assert.doesNotMatch(digestCore, /archiveDocumentCount|knowledge artifact/);

assert.match(schema, /communityArchiveDocuments: defineTable/);
assert.match(schema, /\.vectorIndex\("by_embedding"/);
assert.match(cleanup, /table: "communityArchiveDocuments"/);
assert.match(retrieval, /archive_context: \[\]/);
assert.match(mcp, /required: \["community", "query", "recent_context", "archive_context"\]/);

console.log("community_archive_runtime_severance_contract_proof: ok");

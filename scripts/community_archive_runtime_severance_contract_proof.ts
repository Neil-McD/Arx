import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(join(root, relativePath), "utf8");

const retainedArchiveModule = "convex/communityArchiveDocuments.ts";
assert.equal(existsSync(join(root, retainedArchiveModule)), true);
assert.equal(existsSync(join(root, "convex/communityArchive.ts")), false);
assert.equal(existsSync(join(root, "convex/communityArchiveRetrieval.ts")), false);

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

const communityMaintenance = read("convex/communityMaintenance.ts");
const adminGateway = read("shared/cloudCommunityAdminGateway.ts");
const emailDigests = read("convex/emailDigests.ts");
const digestCore = read("shared/weeklyDigestCore.ts");
const schema = read("convex/schema.ts");
const cleanup = read("convex/communityCognitionCleanupCore.ts");
const recentContext = read("convex/communityRecentContext.ts");
const runtimeAgentLoop = read("convex/runtimeAgentLoop.ts");
const httpMcp = read("convex/httpMcp.ts");
const canonicalExecutor = read("convex/polynetCanonicalExecutor.ts");
const capabilityContext = read("convex/communityCapabilityContext.ts");
const lifecycleCore = read("convex/communityLifecycleCore.ts");
const email = read("convex/email.ts");
const concierge = read("convex/communityAgentConciergeCore.ts");
const serveWorker = read("convex/communityAgentServeWorker.ts");
const compilerDigest = read("convex/communityCompilerDigest.ts");
const heartbeat = read("convex/communityAgentHeartbeat.ts");
const communityAgentRuntime = read("convex/communityAgentRuntime.ts");
const interactions = read("convex/communityInteractions.ts");
const mentionBroadcasts = read("convex/communityMentionBroadcasts.ts");
const mentionEmails = read("convex/communityMentionEmails.ts");
const communityResources = read("convex/communityResources.ts");

for (const source of [communityMaintenance, adminGateway]) {
  assert.doesNotMatch(source, /requestCommunityArchiveBackfill|backfillCommunityArchiveInternal/);
}
assert.doesNotMatch(emailDigests, /communityArchiveDocuments|archiveDocuments|archiveDocumentCount/);
assert.doesNotMatch(digestCore, /archiveDocumentCount|knowledge artifact/);

assert.match(schema, /communityArchiveDocuments: defineTable/);
assert.match(schema, /\.vectorIndex\("by_embedding"/);
assert.match(cleanup, /table: "communityArchiveDocuments"/);
assert.match(communityMaintenance, /purgeOrphanedCommunityUserArtifactsInternal/);
assert.match(recentContext, /readCommunityRecentContextInternal = internalQuery/);
assert.match(runtimeAgentLoop, /communityRecentContext\.readCommunityRecentContextInternal/);
assert.match(httpMcp, /import \{ executePolynetCanonicalTool \} from "\.\/polynetCanonicalExecutor\.ts"/);
assert.match(httpMcp, /await executePolynetCanonicalTool\(/);
assert.match(
  canonicalExecutor,
  /communityCapabilityContext[\s\S]*resolveCommunityCapabilityContextInternal/,
);
assert.match(capabilityContext, /communityIsOperational\(community\)/);
for (const source of [runtimeAgentLoop, httpMcp, canonicalExecutor]) {
  assert.doesNotMatch(
    source,
    /communityArchive\.searchCommunityKnowledgeInternal|communityArchiveDocuments/,
  );
}

assert.match(
  lifecycleCore,
  /resolveCommunityWorkAdmissionErrorCode[\s\S]*COMMUNITY_LIFECYCLE_GENERATION_STALE_ERROR/,
);
for (const table of [
  "emailOutbox",
  "communityInteractionMentions",
  "communityMentionBroadcasts",
  "communityAgentServeRequests",
  "communityCompilerDigests",
  "communitySourceCrawlJobs",
]) {
  assert.match(
    schema,
    new RegExp(`${table}: defineTable\\(\\{[\\s\\S]*?communityLifecycleGeneration: v\\.optional\\(v\\.number\\(\\)\\)`),
    `${table} must retain lifecycle-generation provenance`,
  );
}
assert.match(
  email,
  /communityLifecycleGeneration[\s\S]*resolveCommunityWorkAdmissionErrorCode[\s\S]*status: "suppressed"/,
);
assert.match(
  concierge,
  /status === "queued"[\s\S]*communityLifecycleGeneration === undefined[\s\S]*normalizeCommunityLifecycleGeneration/,
);
assert.match(
  serveWorker,
  /suppressServeRequestOutsideLifecycleEpoch[\s\S]*resolveCommunityWorkAdmissionErrorCode[\s\S]*status: "skipped"/,
);
assert.match(
  compilerDigest,
  /communityLifecycleGeneration[\s\S]*normalizeCommunityLifecycleGeneration[\s\S]*communityCompilerDigests/,
);
assert.match(
  heartbeat,
  /communityLifecycleGeneration[\s\S]*ctx\.scheduler\.runAfter[\s\S]*communityLifecycleGeneration[\s\S]*COMMUNITY_LIFECYCLE_GENERATION_STALE_ERROR/,
);
assert.match(
  communityAgentRuntime,
  /resolveCommunityAgentRunContextInternal[\s\S]*requireMatchingCommunityLifecycleGeneration[\s\S]*createCommunityAgentRunInternal[\s\S]*requireMatchingCommunityLifecycleGeneration/,
);
assert.match(
  interactions,
  /communityInteractionMentions[\s\S]*communityLifecycleGeneration/,
);
assert.match(
  mentionBroadcasts,
  /communityMentionBroadcasts[\s\S]*communityLifecycleGeneration[\s\S]*resolveCommunityWorkAdmissionErrorCode/,
);
assert.match(
  mentionEmails,
  /mention\.communityLifecycleGeneration[\s\S]*communityLifecycleGeneration: job\.communityLifecycleGeneration/,
);
assert.match(
  communityResources,
  /createCommunitySourceCrawlJobInternal[\s\S]*communityLifecycleGeneration[\s\S]*claimCommunitySourceCrawlJobInternal[\s\S]*resolveCommunityWorkAdmissionErrorCode/,
);
assert.match(
  communityResources,
  /saveCommunitySourceCrawlPagesInternal[\s\S]*resolveCommunityWorkAdmissionErrorCode/,
);
assert.match(
  communityResources,
  /processCommunitySourceCrawlJobInternal[\s\S]*claimCommunitySourceCrawlJobInternal[\s\S]*crawlSourceRootWithConfiguredProvider/,
);

console.log("community_archive_runtime_severance_contract_proof: ok");

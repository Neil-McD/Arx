import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const projection = read("convex/communityResourceMemoryProjection.ts");
const resources = read("convex/communityResources.ts");
const wikiArchitect = read("convex/communityWikiArchitect.ts");
const directory = read("convex/communityIntelligenceDirectory.ts");
const compiler = read("convex/communityCompilerDigest.ts");
const gateway = read("shared/cloudCommunityPolynetGateway.ts");
const lineageContract = read("docs/community-lineage-ontology-contract-v0.md");
const cognitionContract = read("docs/community-agent-cognition-contract-v1.md");
const packageJson = read("package.json");

assert.match(packageJson, /"check:community-resource-memory-node-proof"/);

assert.match(projection, /export async function syncCommunityResourceMemoryProjection/);
assert.match(projection, /export async function revokeCommunityResourceMemoryProjection/);
assert.match(projection, /resolveCommunityResourceEvidenceSource/);
assert.match(projection, /if \(!resolved\)[\s\S]*redactCommunityResourceSourceTrace/);
assert.match(projection, /recordTrustedCommunitySourceTraceCore/);
assert.match(projection, /resolveCommunityEvidenceRefCore/);
assert.match(projection, /contentHash: evidence\.contentHash/);
assert.match(projection, /provenanceHash: evidence\.provenanceHash/);
assert.match(projection, /sourceType: "resource"/);
assert.match(projection, /buildCommunityResourceEvidenceRef/);
assert.match(projection, /visibilityScope: "community"[\s\S]*sourceVisibility: "community"/);
assert.match(projection, /actorType: "system"/);
assert.match(projection, /actorUserId: canonicalResource\.createdByUserId/);
assert.match(projection, /community_resource_memory_projection/);
assert.doesNotMatch(projection, /actorAgentKey: "community_agent"/);
assert.doesNotMatch(projection, /credit|confidence|accept|approve|inference|generateText|embedGemini/);
assert.match(
  projection,
  /buildCommunityResourceTraceSummary[\s\S]*resource\.title[\s\S]*resource\.bodyMd[\s\S]*resource\.url/,
  "semantic revision input should be title, body, and URL",
);
assert.doesNotMatch(
  projection.match(/export function buildCommunityResourceTraceSummary[\s\S]*?\n\}/)?.[0] ?? "",
  /pinned|sortOrder|moduleId|updatedAt/,
  "pinning, ordering, and transport clocks must not create summary-only revisions",
);
assert.match(
  projection,
  /resolveCommunityEvidenceRefCore[\s\S]*community_resource_memory_evidence_resolution_failed/,
  "module context and full content must come from the canonical evidence resolver",
);
assert.match(projection, /COMMUNITY_RESOURCE_TRACE_SUMMARY_MAX_CHARS = 4_000/);

assert.match(projection, /const existing = await readCommunityResourceSourceTrace/);
assert.match(projection, /if \(!existing\) return false/);
assert.match(projection, /visibilityScope: "admin"[\s\S]*sourceVisibility: "redacted"/);
assert.doesNotMatch(projection, /communityArchiveDocuments|upsertArchive|deleteArchive/);
assert.match(projection, /return \{ visible: false, traced, sourceRef \}/);
assert.match(projection, /return \{ visible: true, traced: true, sourceRef \}/);

assert.match(resources, /from "\.\/communityResourceMemoryProjection"/);
assert.doesNotMatch(resources, /from "\.\/communityArchiveDocuments"/);
assert.doesNotMatch(resources, /upsertArchiveDocumentForResource|deleteArchiveDocumentBySource/);
assert.ok(
  (resources.match(/syncCommunityResourceMemoryProjection/g) ?? []).length >= 12,
  "all canonical resource write families should converge on one memory lifecycle",
);
assert.match(resources, /moduleStatusChanged[\s\S]*syncResourceMemoryProjectionsForModule/);
assert.match(
  resources,
  /revokeCommunityResourceMemoryProjection\(ctx, resource\)[\s\S]*deleteCommunityResourceBodyContent[\s\S]*ctx\.db\.delete/,
  "deletion should revoke projections before deleting source truth",
);
assert.match(wikiArchitect, /from "\.\/communityResourceMemoryProjection"/);
assert.doesNotMatch(wikiArchitect, /upsertArchiveDocumentForResource/);
assert.ok(
  (wikiArchitect.match(/syncCommunityResourceMemoryProjection/g) ?? []).length >= 5,
  "wiki architect writes should use the same canonical resource memory lifecycle",
);

assert.match(directory, /kind: "resource_node"/);
assert.match(directory, /lineage_id: resourceMemoryLineageId\(row\._id\)/);
assert.match(directory, /status: "source"/);
assert.match(directory, /readPolynetOverviewResources/);
assert.match(directory, /communityResourceIsLiveModulePage/);
assert.match(directory, /selectPolynetOverviewItems/);
assert.match(directory, /kind: "resource_edge"[\s\S]*type: "contains_resource"/);
assert.doesNotMatch(
  projection,
  /db\.insert\("communityIntelligenceNodes"|db\.patch\([^\n]*communityIntelligenceNodes/,
  "resource publication should not duplicate source truth into the learned directory table",
);
assert.match(gateway, /kind: "community" \| "directory_node" \| "resource_node"/);
assert.match(gateway, /learned_node_count: number[\s\S]*source_node_count: number/);

assert.match(compiler, /selectedSourceTraceRows/);
assert.match(compiler, /row\.sourceType === "resource"/);
assert.doesNotMatch(compiler, /communityArchiveDocuments/);

assert.match(lineageContract, /published resource[\s\S]*source trace/i);
assert.match(lineageContract, /credit = null/);
assert.match(cognitionContract, /canonical resource source node/i);
assert.match(cognitionContract, /does not create or update `communityIntelligenceNodes`/);

console.log("community_resource_memory_node_contract_proof: ok");

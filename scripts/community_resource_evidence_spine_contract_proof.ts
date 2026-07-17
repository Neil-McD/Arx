import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  buildCommunityResourceEvidenceRef,
  deriveCommunityResourceLineageEnvelope,
  parseCommunityResourceEvidenceRef,
} from "../shared/communityEvidenceContract.ts";
import { resolveCommunityResourceEvidenceSource } from "../convex/communityResourceEvidenceCore.ts";

const root = process.cwd();

async function read(relativePath: string): Promise<string> {
  return await readFile(path.join(root, relativePath), "utf8");
}

const [
  schema,
  resources,
  evidence,
  evidenceCore,
  audit,
  runtimeLoop,
  concierge,
  mcp,
  httpMcp,
  lineageContract,
  interactionContract,
] = await Promise.all([
  read("convex/schema.ts"),
  read("convex/communityResources.ts"),
  read("convex/communityResourceEvidence.ts"),
  read("convex/communityResourceEvidenceCore.ts"),
  read("convex/communityEvidenceAudit.ts"),
  read("convex/runtimeAgentLoop.ts"),
  read("convex/communityAgentServeWorker.ts"),
  read("shared/polynetMcp.ts"),
  read("convex/httpMcp.ts"),
  read("docs/community-lineage-ontology-contract-v0.md"),
  read("docs/community-interaction-substrate-contract-v1.md"),
]);

assert.match(schema, /communityEvidenceRetrievalLogs: defineTable/);
assert.match(schema, /v\.literal\("community_resources_search"\)/);
assert.match(schema, /v\.literal\("community_resources_read"\)/);
assert.match(schema, /v\.literal\("community_resource_read"\)/);

assert.match(resources, /ref: buildCommunityResourceEvidenceRef\(resourceId\)/);
assert.match(resources, /lineage: deriveCommunityResourceLineageEnvelope/);
assert.match(resources, /recordedByUserId: row\.createdByUserId/);
assert.match(resources, /const typedResourceId = parseCommunityResourceEvidenceRef\(ref\)/);
assert.match(resources, /export const mapCommunityResourcesForToolInternal[\s\S]*scope: "member"/);
assert.match(resources, /export const readCommunityResourcesForToolInternal[\s\S]*builder: false/);
assert.match(resources, /export const readCommunityResourceDirectoryInternal[\s\S]*source: null/);
assert.doesNotMatch(resources, /export const searchCommunityResourceDirectoryInternal/);

assert.match(evidence, /const RECENT_RESOURCE_SCAN_LIMIT = 80/);
assert.match(evidence, /\.take\(RECENT_RESOURCE_SCAN_LIMIT\)/);
assert.doesNotMatch(evidence, /\.take\(5000\)/);
assert.match(evidence, /q\.eq\("communityId", args\.communityId\)/);
assert.match(evidence, /readCommunityResourceEvidenceItemsInternal/);
assert.match(evidence, /resolveCommunityResourceEvidenceSource/);
assert.match(evidence, /recordCommunityEvidenceRetrievalInternal/);
assert.match(evidence, /const matches = recent\.matches/);
assert.match(evidence, /strategy: "bounded_lexical"/);
assert.doesNotMatch(evidence, /vectorSearch|embedGemini|archiveAvailable|archiveError/);
assert.match(evidence, /recordedByUserId: args\.resource\.createdByUserId/);
assert.doesNotMatch(evidence, /recordTrustedCommunitySourceTraceCore/);
assert.doesNotMatch(evidence, /communitySourceTraces/);

assert.match(audit, /surface: communityEvidenceSurfaceValidator/);
assert.match(audit, /resultRefs: v\.array\(v\.string\(\)\)/);
assert.doesNotMatch(audit, /query: v\./);
assert.doesNotMatch(audit, /args\.query/);

assert.match(runtimeLoop, /communityResourceEvidence\.searchCommunityResourceEvidenceInternal/);
assert.match(runtimeLoop, /communityResourceEvidence\.readCommunityResourceEvidenceForToolInternal/);
assert.match(runtimeLoop, /communityResourceEvidence\.readCommunityResourcesEvidenceForToolInternal/);
assert.match(runtimeLoop, /surface: params\.evidenceSurface \?\? "member_agent_dock"/);
assert.match(concierge, /evidenceSurface: "community_concierge"/);
assert.match(mcp, /stable resource ref/);
assert.match(httpMcp, /communityResourceEvidence\.searchCommunityResourceEvidenceInternal/);
assert.match(httpMcp, /communityResourceEvidence\.readCommunityResourceEvidenceForToolInternal/);
assert.match(httpMcp, /surface: "external_mcp"/);

assert.match(lineageContract, /resource:<communityResourceId>/);
assert.match(lineageContract, /createdByUserId[\s\S]*accountable recorder/);
assert.match(lineageContract, /credit = null/);
assert.match(lineageContract, /eligible for bounded compiler interpretation/);
assert.match(lineageContract, /No duplicate `communityIntelligenceNodes` row/);
assert.match(interactionContract, /Published Resources use a parallel evidence boundary/);

const resourceId = "resource_1";
const sourceId = "resource_source_1";
const draftResourceId = "resource_draft_1";
const foreignResourceId = "resource_foreign_1";
const liveModuleId = "module_live_1";
const draftModuleId = "module_draft_1";
const foreignModuleId = "module_foreign_1";
const rows = new Map<string, any>([
  [
    resourceId,
    {
      _id: resourceId,
      communityId: "community_1",
      moduleId: liveModuleId,
      createdByUserId: "user_1",
      role: "page",
      status: "draft",
      title: "Visible page",
      bodyChars: 12,
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  [
    sourceId,
    {
      _id: sourceId,
      communityId: "community_1",
      moduleId: liveModuleId,
      role: "source",
      status: "review",
      title: "Builder source",
      bodyChars: 12,
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  [
    draftResourceId,
    {
      _id: draftResourceId,
      communityId: "community_1",
      moduleId: draftModuleId,
      role: "page",
      status: "draft",
      title: "Draft module page",
      bodyChars: 12,
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  [
    foreignResourceId,
    {
      _id: foreignResourceId,
      communityId: "community_2",
      moduleId: foreignModuleId,
      role: "page",
      status: "draft",
      title: "Foreign page",
      bodyChars: 12,
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  [liveModuleId, { _id: liveModuleId, communityId: "community_1", status: "live" }],
  [draftModuleId, { _id: draftModuleId, communityId: "community_1", status: "draft" }],
  [foreignModuleId, { _id: foreignModuleId, communityId: "community_2", status: "live" }],
]);
const mockCtx = {
  db: {
    normalizeId(table: string, id: string) {
      const prefix = table === "communityResources" ? "resource_" : "module_";
      return String(id).startsWith(prefix) ? id : null;
    },
    async get(id: string) {
      return rows.get(id) ?? null;
    },
  },
};

const resolved = await resolveCommunityResourceEvidenceSource({
  ctx: mockCtx,
  communityId: "community_1",
  resourceId,
});
assert.ok(resolved);
assert.equal(resolved.resource._id, resourceId);
assert.equal(
  await resolveCommunityResourceEvidenceSource({
    ctx: mockCtx,
    communityId: "community_1",
    resourceId: liveModuleId,
  }),
  null,
  "wrong-table ids must fail closed",
);
for (const hiddenId of [sourceId, draftResourceId, foreignResourceId]) {
  assert.equal(
    await resolveCommunityResourceEvidenceSource({
      ctx: mockCtx,
      communityId: "community_1",
      resourceId: hiddenId,
    }),
    null,
    `${hiddenId} must fail the canonical member-evidence boundary`,
  );
}

const ref = buildCommunityResourceEvidenceRef(resourceId);
assert.equal(ref, `resource:${resourceId}`);
assert.equal(parseCommunityResourceEvidenceRef(ref), resourceId);
assert.equal(parseCommunityResourceEvidenceRef(`resource:${liveModuleId}:extra`), null);
const lineage = deriveCommunityResourceLineageEnvelope({
  communityId: "community_1",
  resourceId,
  recordedByUserId: "user_1",
});
assert.deepEqual(lineage.authority, { type: "community", community_id: "community_1" });
assert.deepEqual(lineage.recorded_by, { type: "user", user_id: "user_1" });
assert.equal(lineage.credit, null);
assert.equal(lineage.profile_projection, "none");

console.log("community_resource_evidence_spine_contract_proof: ok");

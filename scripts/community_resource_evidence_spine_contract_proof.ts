import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  buildCommunityResourceEvidenceRef,
  deriveCommunityResourceLineageEnvelope,
  parseCommunityResourceEvidenceRef,
} from "../shared/communityEvidenceContract.ts";
import {
  resolveCommunityResourceEvidenceSource,
  resolveExactCommunityResourceEvidenceSelector,
} from "../convex/communityResourceEvidenceCore.ts";

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
  semanticContext,
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
  // The agent tool path: the loop plus the canonical executors it delegates to.
  Promise.all(["convex/runtimeAgentLoop.ts", "convex/polynetCanonicalExecutor.ts", "convex/platformOperationExecutor.ts"].map(read)).then((parts) => parts.join("\n")),
  read("convex/communityCapabilityContext.ts"),
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
assert.doesNotMatch(resources, /export const (map|read)CommunityResourcesForToolInternal/);
assert.match(resources, /buildCommunityResourceDirectoryReadPayload[\s\S]*source: null/);
assert.doesNotMatch(resources, /export const searchCommunityResourceDirectoryInternal/);
assert.match(
  evidenceCore,
  /resolveExactCommunityResourceEvidenceSelector[\s\S]*resolveCommunityResourceEvidenceSource/,
);
const memberReadBlock =
  resources.match(
    /export const readCommunityResourceDirectoryInternal = internalQuery\([\s\S]*?\n\}\);\n/,
  )?.[0] ?? "";
assert.ok(memberReadBlock, "member resource read implementation should be present");
assert.ok(
  memberReadBlock.indexOf("resolveExactCommunityResourceEvidenceSelector") <
    memberReadBlock.indexOf("listResourceDirectoryLiveModules"),
  "stable refs and exact resource URIs must resolve before directory scans",
);

assert.match(evidence, /const RECENT_RESOURCE_SCAN_LIMIT = 80/);
assert.match(evidence, /\.take\(RECENT_RESOURCE_SCAN_LIMIT\)/);
assert.doesNotMatch(evidence, /\.take\(5000\)/);
assert.match(evidence, /q\.eq\("communityId", args\.communityId\)/);
assert.doesNotMatch(evidence, /export const readCommunityResourceEvidenceItemsInternal/);
assert.match(evidence, /recordCommunityEvidenceRetrievalInternal/);
assert.match(evidence, /const matches = recent\.matches/);
assert.match(evidence, /strategy: "bounded_lexical"/);
assert.doesNotMatch(evidence, /vectorSearch|embedGemini|archiveAvailable|archiveError/);
assert.match(evidence, /const recordedByUserId = args\.resource\.createdByUserId/);
assert.doesNotMatch(evidence, /recordTrustedCommunitySourceTraceCore/);
assert.doesNotMatch(evidence, /communitySourceTraces/);

assert.match(audit, /surface: communityEvidenceSurfaceValidator/);
assert.match(audit, /resultRefs: v\.array\(v\.string\(\)\)/);
assert.doesNotMatch(audit, /query: v\./);
assert.doesNotMatch(audit, /args\.query/);

assert.match(runtimeLoop, /communityResourceEvidence\s*\.searchCommunityResourceEvidenceInternal/);
assert.match(
  runtimeLoop,
  /operationId:[\s\S]*"community\.semantic\.read"/,
  "native semantic reads should route through the canonical operation executor",
);
assert.match(runtimeLoop, /evidenceSurface \?\? "member_agent_dock"/);
assert.match(
  semanticContext,
  /readCommunitySemanticRepositoryInternal[\s\S]*communityResourceEvidence[\s\S]*readCommunityResourceEvidenceForToolInternal/,
  "semantic exact reads should reuse the canonical audited resource action",
);
assert.match(concierge, /evidenceSurface: "community_concierge"/);
// The MCP reaches resource evidence through the same canonical executor as the
// agent (asserted on the agent tool path above), as an external_mcp principal.
assert.match(httpMcp, /executePolynetCanonicalTool\(/);
assert.match(httpMcp, /principalKind: "external_mcp"/);

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
const orphanResourceId = "resource_orphan_1";
const missingResourceId = "resource_missing_1";
const liveModuleId = "module_live_1";
const draftModuleId = "module_draft_1";
const foreignModuleId = "module_foreign_1";
const missingModuleId = "module_missing_1";
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
  [
    orphanResourceId,
    {
      _id: orphanResourceId,
      communityId: "community_1",
      moduleId: missingModuleId,
      role: "page",
      status: "draft",
      title: "Orphan page",
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
    query() {
      throw new Error("directory_scan_must_not_run_for_exact_selectors");
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
assert.equal(
  await resolveCommunityResourceEvidenceSource({
    ctx: mockCtx,
    communityId: "community_1",
    resourceId: orphanResourceId,
  }),
  null,
  "resources whose module is missing must fail closed",
);

const ref = buildCommunityResourceEvidenceRef(resourceId);
assert.equal(ref, `resource:${resourceId}`);
assert.equal(parseCommunityResourceEvidenceRef(ref), resourceId);
assert.equal(parseCommunityResourceEvidenceRef(`resource:${liveModuleId}:extra`), null);
const exactTyped = await resolveExactCommunityResourceEvidenceSelector({
  ctx: mockCtx,
  communityId: "community_1",
  ref,
});
assert.equal(exactTyped?.resource._id, resourceId);
const exactUri = await resolveExactCommunityResourceEvidenceSelector({
  ctx: mockCtx,
  communityId: "community_1",
  ref: `resources://community/community_1/modules/${liveModuleId}/resources/${resourceId}`,
});
assert.equal(exactUri?.resource._id, resourceId);
assert.equal(
  await resolveExactCommunityResourceEvidenceSelector({
    ctx: mockCtx,
    communityId: "community_1",
    ref: "/visible-page",
  }),
  null,
  "readable paths must remain on the compatibility lookup",
);
for (const [invalidRef, expectedError] of [
  ["resource:bad:id", "community_resource_evidence_ref_invalid"],
  ["resources://malformed", "community_resource_directory_uri_invalid"],
  [
    `resources://community/community_2/modules/${liveModuleId}/resources/${resourceId}`,
    "community_resource_directory_community_mismatch",
  ],
  [
    `resources://community/community_1/modules/${draftModuleId}/resources/${resourceId}`,
    "community_resource_directory_module_mismatch",
  ],
  [
    `resources://community/community_1/modules/${liveModuleId}/source-inbox/resources/${resourceId}`,
    "community_resource_directory_scope_mismatch",
  ],
  [
    `resources://community/community_1/modules/${liveModuleId}`,
    "community_resource_directory_path_not_readable",
  ],
] as const) {
  await assert.rejects(
    () =>
      resolveExactCommunityResourceEvidenceSelector({
        ctx: mockCtx,
        communityId: "community_1",
        ref: invalidRef,
      }),
    new RegExp(expectedError),
  );
}
for (const hiddenId of [
  sourceId,
  draftResourceId,
  foreignResourceId,
  orphanResourceId,
  missingResourceId,
]) {
  await assert.rejects(
    () =>
      resolveExactCommunityResourceEvidenceSelector({
        ctx: mockCtx,
        communityId: "community_1",
        ref: buildCommunityResourceEvidenceRef(hiddenId),
      }),
    /community_resource_not_found/,
    `${hiddenId} must fail exact member-visible resolution`,
  );
}
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

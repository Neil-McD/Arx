import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { normalizeCommunityLensAuthority } from "../shared/communityLensAuthority.ts";
import {
  buildPolynetPlatformToolNames,
  buildPolynetPlatformToolSpecs,
} from "../shared/polynetPlatformToolSurface.ts";
import { buildRuntimeTurnEnvelope } from "../shared/runtimeTurnEnvelope.ts";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const packageJson = read("package.json");
const workerServerSource = read("services/polynet-codex-worker/src/server.ts");
const workerBridgeSource = read("convex/polynetCodexWorkerTool.ts");
const runtimeAgentLoopSource = read("convex/runtimeAgentLoop.ts");

const productDocTools = ["search_product_docs", "get_product_doc"] as const;
const communityReadTools = [
  "get_active_community_context",
  "community_search",
  "community_resources_map",
  "community_resources_read",
  "community_resources_list",
  "community_resource_read",
  "community_resources_search",
] as const;
const builderStageTools = [
  "community_resource_builder_list",
  "community_resource_builder_read",
  "community_resource_builder_stage_changeset",
] as const;
const communityWriteTools = ["community_write"] as const;

function projectedToolNames(authority: unknown, hasCommunity = true): string[] {
  const communityLensAuthority = normalizeCommunityLensAuthority(authority);
  return buildPolynetPlatformToolNames({
    hasCommunity,
    communityLensAuthority,
    communityResourceLane: communityLensAuthority?.communityResourceLane ?? null,
  });
}

function projectedToolPolicies(authority: unknown, hasCommunity = true) {
  const communityLensAuthority = normalizeCommunityLensAuthority(authority);
  return buildPolynetPlatformToolSpecs({
    hasCommunity,
    communityLensAuthority,
    communityResourceLane: communityLensAuthority?.communityResourceLane ?? null,
  });
}

function assertToolNames(
  label: string,
  actual: string[],
  expected: readonly string[],
) {
  assert.deepEqual(actual, [...expected], `${label} must project the exact Codex PolyNet tool surface`);
}

assert.match(
  packageJson,
  /"check:daytona-codex-tool-role-matrix-proof": "node --experimental-strip-types --experimental-specifier-resolution=node scripts\/daytona_codex_tool_role_matrix_proof\.ts"/,
  "package.json must expose the Daytona Codex tool role matrix proof",
);

assertToolNames(
  "no community lens",
  buildPolynetPlatformToolNames({ hasCommunity: false }),
  productDocTools,
);
assertToolNames(
  "member lens",
  projectedToolNames({
    relation: "member",
    effectiveRole: "member",
  }),
  [...communityReadTools, ...productDocTools],
);
assertToolNames(
  "moderator lens",
  projectedToolNames({
    relation: "moderator",
    effectiveRole: "moderator",
    canModerate: true,
    canReviewJoinRequests: true,
  }),
  [...communityReadTools, ...communityWriteTools, ...productDocTools],
);
assertToolNames(
  "admin without resource management",
  projectedToolNames({
    relation: "admin",
    effectiveRole: "admin",
    canManage: true,
    canModerate: true,
    canManageResources: false,
    canReviewJoinRequests: true,
  }),
  [...communityReadTools, ...communityWriteTools, ...productDocTools],
);
assertToolNames(
  "admin with resource management",
  projectedToolNames({
    relation: "admin",
    effectiveRole: "admin",
    canManage: true,
    canModerate: true,
    canManageResources: true,
    canReviewJoinRequests: true,
  }),
  [
    ...communityReadTools,
    ...builderStageTools,
    ...communityWriteTools,
    ...productDocTools,
  ],
);
assertToolNames(
  "owner with resource management",
  projectedToolNames({
    relation: "owner",
    effectiveRole: "owner",
    canManage: true,
    canModerate: true,
    canManageResources: true,
    canReviewJoinRequests: true,
  }),
  [
    ...communityReadTools,
    ...builderStageTools,
    ...communityWriteTools,
    ...productDocTools,
  ],
);
assertToolNames(
  "forged builder lane on member lens",
  projectedToolNames({
    relation: "member",
    effectiveRole: "member",
    canManageResources: false,
    communityResourceLane: {
      lane: "builder",
      can_read_live_resources: true,
      can_use_resource_builder: true,
    },
  }),
  [...communityReadTools, ...productDocTools],
);
assertToolNames(
  "forged builder lane on moderator lens",
  projectedToolNames({
    relation: "moderator",
    effectiveRole: "moderator",
    canModerate: true,
    canManageResources: false,
    communityResourceLane: {
      lane: "builder",
      can_read_live_resources: true,
      can_use_resource_builder: true,
    },
  }),
  [...communityReadTools, ...communityWriteTools, ...productDocTools],
);

const moderatorPolicies = projectedToolPolicies({
  relation: "moderator",
  effectiveRole: "moderator",
  canModerate: true,
});
assert.equal(
  moderatorPolicies.find((tool) => tool.name === "community_write")
    ?.required_community_authority,
  "moderator",
  "community_write must require moderator authority",
);
assert.equal(
  moderatorPolicies.find((tool) => tool.name === "community_write")
    ?.risk_level,
  "write",
  "community_write must remain marked write-risk",
);
assert.equal(
  moderatorPolicies.some((tool) => tool.name === "community_resource_builder_stage_changeset"),
  false,
  "moderator without resource management must not receive builder staging tools",
);

const ownerEnvelope = buildRuntimeTurnEnvelope({
  latestUserText: "post this to the community",
  threadId: "thread_role_matrix",
  communityId: "community_role_matrix",
  communityLensAuthority: {
    relation: "owner",
    effectiveRole: "owner",
    canManage: true,
    canModerate: true,
    canManageResources: true,
    canReviewJoinRequests: true,
    communityResourceLane: {
      lane: "builder",
      can_read_live_resources: true,
      can_use_resource_builder: true,
    },
  },
  allowedToolNames: [
    ...communityReadTools,
    ...builderStageTools,
    ...communityWriteTools,
    ...productDocTools,
  ],
});
assert.equal(ownerEnvelope.authority.communityRelation, "owner");
assert.equal(ownerEnvelope.authority.canModerate, true);
assert.equal(ownerEnvelope.authority.canManageResources, true);
assert.equal(
  ownerEnvelope.authority.allowedToolNames.includes("community_write"),
  true,
  "runtime envelope must carry the exact projected tool names",
);

for (const forbiddenToolName of [
  "community_resource_builder_apply_changeset",
  "web_research",
  "web_crawl",
  "terminal_start",
  "terminal_read",
  "computer_open_url",
  "list_dir",
  "read",
  "write",
  "bash",
]) {
  for (const authority of [
    null,
    { relation: "member", effectiveRole: "member" },
    { relation: "moderator", effectiveRole: "moderator", canModerate: true },
    {
      relation: "owner",
      effectiveRole: "owner",
      canManage: true,
      canModerate: true,
      canManageResources: true,
    },
  ]) {
    assert.equal(
      projectedToolNames(authority, authority !== null).includes(forbiddenToolName),
      false,
      `${forbiddenToolName} must not be projected through the PolyNet Codex platform bridge`,
    );
  }
}

assert.match(
  workerBridgeSource,
  /readRunCommunityAuthority[\s\S]*runAuthorityAllowsRequiredAuthority[\s\S]*readRunCommunityResourceLane[\s\S]*runAuthorityAllowsRequiredLane/,
  "worker bridge must enforce canonical run-snapshot authority before dispatching tools",
);
assert.match(
  runtimeAgentLoopSource,
  /params\.toolName === "community_write"[\s\S]*publishCommunityAiFeedAgentPostInternal/,
  "community_write must use the trusted internal publish path for runtime calls",
);
assert.match(
  workerServerSource,
  /String\(params\.namespace \?\? ""\)\.trim\(\) === "polynet"[\s\S]*handlePlatformToolCall/,
  "worker server must route only the polynet namespace to the PolyNet platform bridge",
);
assert.match(
  workerServerSource,
  /toolName !== "workspace_bash"[\s\S]*unsupported dynamic tool/,
  "worker server must not expose duplicate workspace or web tools through the PolyNet platform bridge",
);

console.log("daytona_codex_tool_role_matrix_proof: ok");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { normalizeCommunityLensAuthority } from "../shared/communityLensAuthority.ts";
import {
  CODEX_NATIVE_WORKSPACE_FORBIDDEN_TOOL_NAMES,
  CODEX_RUNTIME_ADAPTER_TOOL_NAMES,
  buildCodexHarnessToolPolicyReceipt,
  resolveCodexHarnessToolPolicy,
} from "../shared/harnessToolPolicy.ts";
import {
  buildPolynetPlatformToolNames,
  buildPolynetPlatformToolSpecs,
} from "../shared/polynetPlatformToolSurface.ts";
import { buildRuntimeTurnEnvelope } from "../shared/runtimeTurnEnvelope.ts";

function read(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const packageJson = read("package.json");
const harnessToolPolicySource = read("shared/harnessToolPolicy.ts");
const workerServerSource = read("services/polynet-codex-worker/src/server.ts");
const workerBridgeSource = read("convex/polynetCodexWorkerTool.ts");
const runtimeAgentLoopSource = read("convex/runtimeAgentLoop.ts");
const runtimeTurnHandlersSource = read("convex/runtimeTurnHandlers.ts");

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
assert.match(
  harnessToolPolicySource,
  /CodexHarnessToolPolicy[\s\S]*workspaceAccess[\s\S]*polynetPlatformToolNames[\s\S]*runtimeAdapterToolNames/,
  "shared harness policy must model Codex workspace, PolyNet platform, and runtime adapter tools separately",
);
assert.match(
  harnessToolPolicySource,
  /CODEX_NATIVE_WORKSPACE_FORBIDDEN_TOOL_NAMES = \[[\s\S]*"workspace_bash"[\s\S]*terminal_stop/,
  "shared harness policy must name the duplicate workspace tools that native Daytona Codex must not receive",
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

const daytonaCodexHarnessPolicy = resolveCodexHarnessToolPolicy({
  polynetPlatformToolProjection: {
    hasCommunity: true,
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
    communityResourceLane: {
      lane: "builder",
      can_read_live_resources: true,
      can_use_resource_builder: true,
    },
  },
  workspaceServeAvailable: true,
  computerAdaptersAvailable: true,
});
assert.equal(daytonaCodexHarnessPolicy.harnessKind, "codex");
assert.deepEqual(daytonaCodexHarnessPolicy.workspaceAccess, {
  mode: "native_codex",
  nativeCodex: true,
  duplicateShellTool: false,
  shellTool: null,
});
assert.deepEqual(
  daytonaCodexHarnessPolicy.runtimeAdapterToolNames,
  [...CODEX_RUNTIME_ADAPTER_TOOL_NAMES],
);
assert.deepEqual(daytonaCodexHarnessPolicy.polynetPlatformToolNames, [
  ...communityReadTools,
  ...builderStageTools,
  ...communityWriteTools,
  ...productDocTools,
]);
const daytonaCodexPolicyReceipt =
  buildCodexHarnessToolPolicyReceipt(daytonaCodexHarnessPolicy);
assert.deepEqual(
  daytonaCodexPolicyReceipt["runtime_adapter_tool_names"],
  [...CODEX_RUNTIME_ADAPTER_TOOL_NAMES],
  "Codex harness receipt must classify preview/computer tools as runtime adapters",
);
for (const forbiddenToolName of CODEX_NATIVE_WORKSPACE_FORBIDDEN_TOOL_NAMES) {
  assert.equal(
    daytonaCodexHarnessPolicy.polynetPlatformToolNames.includes(forbiddenToolName as any),
    false,
    `${forbiddenToolName} must not be projected as a Codex PolyNet platform tool`,
  );
  assert.equal(
    daytonaCodexHarnessPolicy.runtimeAdapterToolNames.includes(forbiddenToolName as any),
    false,
    `${forbiddenToolName} must not be projected as a Codex runtime adapter`,
  );
}
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
  "workspace_bash",
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
  /dynamicTools: codexDynamicTools\.dynamicTools/,
  "worker server must pass the actual Codex dynamic tool array into thread/start",
);
assert.doesNotMatch(
  workerServerSource,
  /buildWorkspaceBashDynamicToolSpec|CODEX_WORKSPACE_BASH_TOOL_NAME|toolName !== CODEX_WORKSPACE_BASH_TOOL_NAME/,
  "worker server must not retain a duplicate workspace_bash advertisement or handler branch",
);
assert.match(
  workerServerSource,
  /CODEX_NATIVE_WORKSPACE_FORBIDDEN_TOOL_NAMES[\s\S]*CODEX_RUNTIME_ADAPTER_TOOL_NAMES[\s\S]*from "\.\.\/\.\.\/\.\.\/shared\/harnessToolPolicy\.ts"/,
  "worker server must import Codex tool-policy constants from the shared harness policy",
);
assert.doesNotMatch(
  workerServerSource,
  /const CODEX_NATIVE_WORKSPACE_FORBIDDEN_TOOL_NAMES = \[/,
  "worker server must not define a duplicate Codex native workspace forbidden tool list",
);
assert.match(
  workerServerSource,
  /CODEX_NATIVE_WORKSPACE_FORBIDDEN_TOOL_NAMES[\s\S]*forbidden_tool_names_present/,
  "worker server must summarize forbidden duplicate workspace tools from the actual advertised dynamic tools",
);
assert.match(
  workerServerSource,
  /emitWorkerEvent\("codex_dynamic_tools_advertised"[\s\S]*codexDynamicTools\.receipt[\s\S]*dynamicTools: codexDynamicTools\.dynamicTools/,
  "worker server must emit the actual Codex dynamic tool receipt before thread/start uses that same tool array",
);
assert.match(
  workerServerSource,
  /String\(params\.namespace \?\? ""\)\.trim\(\) === "polynet"[\s\S]*this\.client\.respondError\(message\.id, -32601, "unsupported dynamic tool"\)/,
  "worker server must reject all non-advertised dynamic tools, including workspace_bash",
);
assert.match(
  runtimeTurnHandlersSource,
  /resolveCodexHarnessToolPolicy[\s\S]*codex_harness_tool_policy_resolved[\s\S]*buildCodexHarnessToolPolicyReceipt/,
  "runtime handler must emit a first-class Codex harness tool policy receipt",
);
assert.match(
  runtimeTurnHandlersSource,
  /runtime_tool_names: codexHarnessToolPolicy\.runtimeAdapterToolNames/,
  "runtime handler must project Codex runtime adapter tools from the Codex harness policy",
);

console.log("daytona_codex_tool_role_matrix_proof: ok");

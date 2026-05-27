import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  RETRIEVAL_TOOL_NAMES,
  requiresWorkspaceSandbox,
  type RetrievalToolName,
} from "../shared/retrievalTools.ts";
import {
  buildRuntimeToolPolicySurface,
  getFixedRuntimeToolPolicy,
  getMountedRuntimeToolPolicy,
  getUnknownRuntimeToolPolicy,
  isRuntimeToolPolicyParallelEligible,
} from "../shared/runtimeToolPolicy.ts";

const rootDir = process.cwd();

async function readRepoFile(relativePath: string): Promise<string> {
  return await readFile(path.join(rootDir, relativePath), "utf8");
}

function proveFixedPolicyCoverage() {
  for (const toolName of RETRIEVAL_TOOL_NAMES) {
    const policy = getFixedRuntimeToolPolicy(toolName);
    assert.equal(policy.toolName, toolName);
    assert.equal(policy.source, "fixed");
    assert.equal(
      policy.parallelSafe,
      isRuntimeToolPolicyParallelEligible(policy),
      `${toolName} parallelSafe must mean read-only and non-exclusive`,
    );
  }
  console.log("PASS: every fixed runtime tool has an explicit policy");
}

function proveDefensiveMutationDefaults() {
  const unknown = getUnknownRuntimeToolPolicy("vendor__mystery_tool");
  assert.equal(unknown.readOnly, false);
  assert.equal(unknown.mutatesState, true);
  assert.equal(unknown.parallelSafe, false);
  assert.equal(unknown.exclusive, true);
  assert.equal(unknown.riskLevel, "sensitive");
  console.log("PASS: unknown tools default to mutating, exclusive, full-access audit");
}

function proveFixedPolicyBoundaries() {
  const parallelReadTools: RetrievalToolName[] = [
    "search_product_docs",
    "get_product_doc",
    "get_active_community_context",
    "community_resources_map",
    "community_resources_read",
    "community_resources_list",
    "community_resource_read",
    "community_resources_search",
    "community_resource_builder_list",
    "community_resource_builder_read",
    "community_search",
    "web_research",
    "list_dir",
    "read",
    "glob",
    "grep",
    "sha256",
  ];
  for (const toolName of parallelReadTools) {
    const policy = getFixedRuntimeToolPolicy(toolName);
    assert.equal(policy.readOnly, true, `${toolName} should be read-only`);
    assert.equal(policy.parallelSafe, true, `${toolName} should be parallel-safe`);
    assert.equal(policy.exclusive, false, `${toolName} should not be exclusive`);
  }

  const exclusiveTools: RetrievalToolName[] = [
    "community_write",
    "community_resource_builder_stage_changeset",
    "community_resource_builder_apply_changeset",
    "write",
    "edit",
    "bash",
    "terminal_start",
    "terminal_read",
    "terminal_write",
    "terminal_stop",
    "computer_open_url",
    "computer_screenshot",
    "computer_click",
    "computer_type",
    "computer_keypress",
    "computer_scroll",
    "computer_stop",
  ];
  for (const toolName of exclusiveTools) {
    const policy = getFixedRuntimeToolPolicy(toolName);
    assert.equal(policy.parallelSafe, false, `${toolName} should not be parallel-safe`);
    assert.equal(policy.exclusive, true, `${toolName} should be exclusive`);
  }

  assert.equal(getFixedRuntimeToolPolicy("terminal_read").readOnly, true);
  assert.equal(getFixedRuntimeToolPolicy("search_product_docs").category, "docs");
  assert.equal(getFixedRuntimeToolPolicy("search_product_docs").requiresWorkspace, false);
  assert.equal(getFixedRuntimeToolPolicy("get_product_doc").category, "docs");
  assert.equal(getFixedRuntimeToolPolicy("get_product_doc").requiresCommunity, false);
  assert.equal(
    getFixedRuntimeToolPolicy("get_active_community_context").category,
    "community",
  );
  assert.equal(
    getFixedRuntimeToolPolicy("get_active_community_context").requiresCommunity,
    true,
  );
  for (const toolName of [
    "community_resources_map",
    "community_resources_read",
    "community_resources_list",
    "community_resource_read",
    "community_resources_search",
    "community_resource_builder_list",
    "community_resource_builder_read",
  ] as const satisfies readonly RetrievalToolName[]) {
    assert.equal(getFixedRuntimeToolPolicy(toolName).category, "community");
    assert.equal(getFixedRuntimeToolPolicy(toolName).requiresCommunity, true);
    assert.equal(getFixedRuntimeToolPolicy(toolName).readOnly, true);
  }
  assert.equal(getFixedRuntimeToolPolicy("community_write").mutatesState, true);
  assert.equal(getFixedRuntimeToolPolicy("community_write").requiresCommunity, true);
  for (const toolName of [
    "community_resource_builder_stage_changeset",
    "community_resource_builder_apply_changeset",
  ] as const satisfies readonly RetrievalToolName[]) {
    const policy = getFixedRuntimeToolPolicy(toolName);
    assert.equal(policy.mutatesState, true, `${toolName} should mutate state`);
    assert.equal(policy.requiresCommunity, true, `${toolName} should require community`);
    assert.equal(policy.readOnly, false, `${toolName} should not be read-only`);
  }
  assert.equal(
    getFixedRuntimeToolPolicy("terminal_read").exclusive,
    true,
    "terminal reads are stateful and remain exclusive despite being read-only",
  );
  assert.equal(getFixedRuntimeToolPolicy("computer_screenshot").readOnly, true);
  assert.equal(
    getFixedRuntimeToolPolicy("computer_screenshot").exclusive,
    true,
    "computer screenshots are stateful and remain exclusive despite being read-only",
  );
  for (const toolName of [
    "terminal_start",
    "terminal_read",
    "terminal_write",
    "terminal_stop",
  ] as const satisfies readonly RetrievalToolName[]) {
    assert.equal(
      requiresWorkspaceSandbox(toolName),
      true,
      `${toolName} should be classified as workspace-bound`,
    );
  }
  console.log("PASS: fixed tool policies separate parallel reads from stateful exclusives");
}

function proveMountedPolicyBoundaries() {
  const readMounted = getMountedRuntimeToolPolicy({
    scope: "community",
    runtime_tool_name: "drive__read_file",
    risk_level: "read",
  });
  assert.equal(readMounted.readOnly, true);
  assert.equal(readMounted.requiresCommunity, true);
  assert.equal(readMounted.requiresMcpSession, true);
  assert.equal(readMounted.parallelSafe, false);
  assert.equal(readMounted.exclusive, true);

  const writeMounted = getMountedRuntimeToolPolicy({
    scope: "user",
    runtime_tool_name: "github__create_issue",
    risk_level: "write",
  });
  assert.equal(writeMounted.readOnly, false);
  assert.equal(writeMounted.mutatesState, true);
  assert.equal(writeMounted.requiresCommunity, false);
  assert.equal(writeMounted.requiresMcpSession, true);
  assert.equal(writeMounted.parallelSafe, false);
  assert.equal(writeMounted.exclusive, true);
  console.log("PASS: mounted MCP tools stay session-bound and exclusive");
}

function provePolicySurfaceSummary() {
  const surface = buildRuntimeToolPolicySurface({
    fixedToolNames: ["community_search", "read", "bash"],
    includeResolver: true,
    resolverToolName: "resolve_mounted_tools",
    mountedTools: [
      {
        scope: "community",
        runtime_tool_name: "drive__read_file",
        risk_level: "read",
      },
      {
        scope: "user",
        runtime_tool_name: "github__create_issue",
        risk_level: "write",
      },
    ],
  });
  assert.equal(surface.policies.length, 6);
  assert.equal(surface.summary.total, 6);
  assert.equal(surface.summary.parallelSafe, 2);
  assert.equal(surface.summary.exclusive, 4);
  assert.equal(surface.summary.requiresMcpSession, 2);
  assert.equal(surface.summary.requiresCommunity, 2);
  assert.equal(surface.summary.byRiskLevel.read, 4);
  assert.equal(surface.summary.byRiskLevel.write, 1);
  assert.equal(surface.summary.byRiskLevel.sensitive, 1);
  assert.equal(surface.summary.byCategory.community, 1);
  assert.equal(surface.summary.byCategory.workspace_fs, 1);
  assert.equal(surface.summary.byCategory.workspace_shell, 1);
  assert.equal(surface.summary.byCategory.resolver, 1);
  assert.equal(surface.summary.byCategory.mcp, 2);
  console.log("PASS: active runtime tool surfaces produce scheduler-ready summaries");
}

async function provePolicySurfaceIsWiredIntoRuntimeEvidence() {
  const executionSessionSource = await readRepoFile("convex/runtimeExecutionSession.ts");
  const daytonaSource = await readRepoFile("convex/httpDaytona.ts");
  assert.match(
    executionSessionSource,
    /buildRuntimeToolPolicySurface/,
    "expected execution session to build tool policy surfaces next to provider tools",
  );
  assert.match(
    executionSessionSource,
    /activeToolPolicySummary/,
    "expected execution session to return a provider-surface policy summary",
  );
  assert.match(
    daytonaSource,
    /tool_policy_summary: initialProviderTools\.activeToolPolicySummary/,
    "expected initial provider tool surface event to include policy summary",
  );
  assert.match(
    daytonaSource,
    /tool_policy_enforcement: "full_access_audit"/,
    "expected provider tool surface events to state that full-access execution is audited",
  );
  assert.match(
    daytonaSource,
    /tool_policy_summary:\s*providerToolSurface\.activeToolPolicySummary/,
    "expected mounted-tool exposure event to include refreshed policy summary",
  );
  console.log("PASS: runtime tool policy metadata is wired into run evidence");
}

async function proveApprovalBlocksAreRemovedFromRuntimeHarness() {
  const policySource = await readRepoFile("shared/runtimeToolPolicy.ts");
  const daytonaSource = await readRepoFile("convex/httpDaytona.ts");
  const personalMountSource = await readRepoFile("convex/userPlatformAppMounts.ts");
  const promptSource = await readRepoFile("convex/runtimeHarnessShaping.ts");
  const integrationSettingsSource = await readRepoFile(
    "apps/web/src/components/WebIntegrationsSettingsSection.tsx",
  );
  const runtimeSources = [
    daytonaSource,
    personalMountSource,
    promptSource,
    integrationSettingsSource,
  ].join("\n");
  assert.doesNotMatch(
    runtimeSources,
    /approval|approval_required|user_platform_app_tool_approval_required|blocked until/i,
    "runtime harness should not contain approval-era mounted tool blockers or copy",
  );
  assert.doesNotMatch(
    policySource,
    /requiresApproval|requires_approval/i,
    "runtime tool policy should not carry approval metadata",
  );
  assert.match(
    runtimeSources,
    /full-access mode|full_access_audit/,
    "runtime harness should describe mounted tool execution as full-access with audit",
  );
  console.log("PASS: mounted runtime tools use full-access execution, not approvals");
}

proveFixedPolicyCoverage();
proveDefensiveMutationDefaults();
proveFixedPolicyBoundaries();
proveMountedPolicyBoundaries();
provePolicySurfaceSummary();
await provePolicySurfaceIsWiredIntoRuntimeEvidence();
await proveApprovalBlocksAreRemovedFromRuntimeHarness();

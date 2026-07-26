import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  COMPUTER_USE_TOOL_NAMES,
  NON_SANDBOX_TOOL_NAMES,
  PROJECT_WORKSPACE_RUNTIME_TOOL_NAMES,
  RETRIEVAL_TOOL_NAMES,
  SANDBOX_FILE_SHELL_TOOL_NAMES,
  SANDBOX_TOOL_NAMES,
  isComputerUseToolName,
  requiresSandboxSession,
  type RetrievalToolName,
} from "../shared/retrievalTools.ts";
import {
  buildRuntimeToolPolicySurface,
  getFixedRuntimeToolPolicy,
  getMountedRuntimeToolPolicy,
  getUnknownRuntimeToolPolicy,
  isRuntimeToolPolicyParallelEligible,
  type RuntimeToolCategory,
} from "../shared/runtimeToolPolicy.ts";

const rootDir = process.cwd();

type FixedRuntimeToolCategory = Exclude<
  RuntimeToolCategory,
  "mcp" | "resolver" | "unknown"
>;

const FIXED_TOOL_FAMILIES = {
  docs: ["search_product_docs", "get_product_doc"],
  community: [
    "polynet_list",
    "polynet_read",
    "member_conversations_list",
    "member_conversation_read",
    "polynet_list_communities",
    "polynet_get_community",
    "community_resources_read",
    "community_resources_search",
    "community_resource_builder_list",
    "community_resource_builder_read",
    "community_resource_builder_stage_changeset",
    "community_resource_builder_apply_changeset",
    "community_search",
    "community_memory_search",
    "community_memory_read",
    "community_chat_search",
    "community_chat_read",
    "community_ai_feed_search",
    "community_ai_feed_read",
    "community_write",
    "member_profile_confirm_facts",
  ],
  web: ["web_research", "web_crawl"],
  workspace_fs: ["list_dir", "read", "glob", "grep", "sha256", "write", "edit"],
  workspace_shell: ["bash"],
  terminal: ["terminal_start", "terminal_read", "terminal_write", "terminal_stop"],
  computer: COMPUTER_USE_TOOL_NAMES,
} as const satisfies Record<FixedRuntimeToolCategory, readonly RetrievalToolName[]>;

const WORKSPACE_FAMILY_NAMES = [
  "workspace_fs",
  "workspace_shell",
  "terminal",
  "computer",
] as const;

const NON_WORKSPACE_FAMILY_NAMES = ["docs", "community", "web"] as const;

async function readRepoFile(relativePath: string): Promise<string> {
  return await readFile(path.join(rootDir, relativePath), "utf8");
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function familyTools(
  familyNames: readonly FixedRuntimeToolCategory[],
): RetrievalToolName[] {
  return familyNames.flatMap((familyName) => [...FIXED_TOOL_FAMILIES[familyName]]);
}

function proveFixedToolsHaveSingleCapabilityFamily() {
  const familyCounts = new Map<RetrievalToolName, number>();
  const expectedCategories = new Map<RetrievalToolName, FixedRuntimeToolCategory>();

  for (const [category, toolNames] of Object.entries(FIXED_TOOL_FAMILIES) as Array<
    [FixedRuntimeToolCategory, readonly RetrievalToolName[]]
  >) {
    for (const toolName of toolNames) {
      familyCounts.set(toolName, (familyCounts.get(toolName) ?? 0) + 1);
      expectedCategories.set(toolName, category);
    }
  }

  for (const toolName of RETRIEVAL_TOOL_NAMES) {
    assert.equal(
      familyCounts.get(toolName),
      1,
      `${toolName} must belong to exactly one fixed capability family`,
    );
    assert.equal(
      getFixedRuntimeToolPolicy(toolName).category,
      expectedCategories.get(toolName),
      `${toolName} policy category must match its capability family`,
    );
  }

  assert.deepEqual(
    sorted(familyTools(WORKSPACE_FAMILY_NAMES)),
    sorted(SANDBOX_TOOL_NAMES),
    "sandbox-backed tools must match sandbox-bound capability families",
  );
  assert.deepEqual(
    sorted(familyTools(NON_WORKSPACE_FAMILY_NAMES)),
    sorted(NON_SANDBOX_TOOL_NAMES),
    "non-sandbox tools must match platform/community/web capability families",
  );

  assert.deepEqual(
    sorted(familyTools(["workspace_fs", "workspace_shell"])),
    sorted(SANDBOX_FILE_SHELL_TOOL_NAMES),
    "file and shell tools should be the authenticated scratch-sandbox tool slice",
  );
  assert.deepEqual(
    sorted(familyTools(["terminal", "computer"])),
    sorted(PROJECT_WORKSPACE_RUNTIME_TOOL_NAMES),
    "terminal and computer tools should remain project-workspace runtime tools",
  );

  for (const toolName of SANDBOX_TOOL_NAMES) {
    assert.equal(
      requiresSandboxSession(toolName),
      true,
      `${toolName} must lazily require a sandbox session`,
    );
  }
  for (const toolName of NON_SANDBOX_TOOL_NAMES) {
    assert.equal(
      requiresSandboxSession(toolName),
      false,
      `${toolName} must not wake a sandbox`,
    );
  }
  for (const toolName of COMPUTER_USE_TOOL_NAMES) {
    assert.equal(isComputerUseToolName(toolName), true);
    assert.equal(
      PROJECT_WORKSPACE_RUNTIME_TOOL_NAMES.includes(toolName),
      true,
      `${toolName} must stay workspace-bound`,
    );
  }

  console.log("PASS: fixed tool capability families match policy and sandbox boundaries");
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
    "polynet_list",
    "polynet_read",
    "community_resources_read",
    "community_resources_search",
    "community_resource_builder_list",
    "community_resource_builder_read",
    "community_search",
    "community_memory_search",
    "community_chat_search",
    "community_chat_read",
    "community_ai_feed_search",
    "community_ai_feed_read",
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
  const serializedMemoryRead = getFixedRuntimeToolPolicy("community_memory_read");
  assert.equal(serializedMemoryRead.readOnly, true);
  assert.equal(serializedMemoryRead.parallelSafe, false);
  assert.equal(serializedMemoryRead.exclusive, false);

  const exclusiveTools: RetrievalToolName[] = [
    "community_write",
    "member_profile_confirm_facts",
    "community_resource_builder_stage_changeset",
    "community_resource_builder_apply_changeset",
    "web_crawl",
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
    getFixedRuntimeToolPolicy("polynet_list").category,
    "community",
  );
  assert.equal(
    getFixedRuntimeToolPolicy("polynet_list").requiresCommunity,
    true,
  );
  assert.equal(getFixedRuntimeToolPolicy("polynet_read").category, "community");
  assert.equal(getFixedRuntimeToolPolicy("polynet_read").requiresCommunity, true);
  for (const toolName of [
    "community_resources_read",
    "community_resources_search",
    "community_resource_builder_list",
    "community_resource_builder_read",
    "community_chat_search",
    "community_chat_read",
    "community_ai_feed_search",
    "community_ai_feed_read",
  ] as const satisfies readonly RetrievalToolName[]) {
    assert.equal(getFixedRuntimeToolPolicy(toolName).category, "community");
    assert.equal(getFixedRuntimeToolPolicy(toolName).requiresCommunity, true);
    assert.equal(getFixedRuntimeToolPolicy(toolName).readOnly, true);
  }
  assert.equal(getFixedRuntimeToolPolicy("community_write").mutatesState, true);
  assert.equal(getFixedRuntimeToolPolicy("community_write").requiresCommunity, true);
  assert.equal(getFixedRuntimeToolPolicy("member_profile_confirm_facts").mutatesState, true);
  assert.equal(getFixedRuntimeToolPolicy("member_profile_confirm_facts").requiresCommunity, true);
  assert.equal(getFixedRuntimeToolPolicy("member_profile_confirm_facts").requiresWorkspace, false);
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
      requiresSandboxSession(toolName),
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
  const runtimeAgentLoopSource = await readRepoFile("convex/runtimeAgentLoop.ts");
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
    runtimeAgentLoopSource,
    /tool_policy_summary: initialProviderTools\.activeToolPolicySummary/,
    "expected initial provider tool surface event to include policy summary",
  );
  assert.match(
    runtimeAgentLoopSource,
    /tool_policy_enforcement: "full_access_audit"/,
    "expected provider tool surface events to state that full-access execution is audited",
  );
  assert.match(
    runtimeAgentLoopSource,
    /tool_policy_summary:\s*providerToolSurface\.activeToolPolicySummary/,
    "expected mounted-tool exposure event to include refreshed policy summary",
  );
  console.log("PASS: runtime tool policy metadata is wired into run evidence");
}

async function proveApprovalBlocksAreRemovedFromRuntimeHarness() {
  const policySource = await readRepoFile("shared/runtimeToolPolicy.ts");
  const runtimeAgentLoopSource = await readRepoFile("convex/runtimeAgentLoop.ts");
  const personalMountSource = await readRepoFile("convex/userPlatformAppMounts.ts");
  const promptSource = await readRepoFile("convex/runtimeHarnessShaping.ts");
  const integrationSettingsSource = await readRepoFile(
    "apps/web/src/components/WebIntegrationsSettingsSection.tsx",
  );
  const runtimeSources = [
    runtimeAgentLoopSource,
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

proveFixedToolsHaveSingleCapabilityFamily();
proveFixedPolicyCoverage();
proveDefensiveMutationDefaults();
proveFixedPolicyBoundaries();
proveMountedPolicyBoundaries();
provePolicySurfaceSummary();
await provePolicySurfaceIsWiredIntoRuntimeEvidence();
await proveApprovalBlocksAreRemovedFromRuntimeHarness();

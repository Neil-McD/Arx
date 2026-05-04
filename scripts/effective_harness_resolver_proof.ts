import assert from "node:assert/strict";
import {
  composeResolvedRuntimeHarness,
  resolveEffectiveMountedToolCatalog,
} from "../convex/runtimeHarnessComposition.ts";
import type { RuntimeMountedMcpTool } from "../convex/runtimeMcpManager.ts";
import type { RuntimeSkillResolution } from "../convex/runtimeHarnessShaping.ts";

function tool(
  patch: Partial<RuntimeMountedMcpTool> & {
    scope: "user" | "community";
    runtime_tool_name: string;
    tool_name: string;
  },
): RuntimeMountedMcpTool {
  const appName = patch.app_name ?? "Example";
  return {
    scope: patch.scope,
    mount_id: patch.mount_id ?? `${patch.scope}:${patch.runtime_tool_name}`,
    runtime_tool_name: patch.runtime_tool_name,
    developer_app_id: patch.developer_app_id ?? `${patch.scope}:developer-app`,
    catalog_app_id: patch.catalog_app_id ?? null,
    app_name: appName,
    endpoint_url: patch.endpoint_url ?? `https://example.test/${appName.toLowerCase()}`,
    auth_type: patch.auth_type ?? "bearer",
    tool_name: patch.tool_name,
    namespaced_tool_name: patch.namespaced_tool_name ?? patch.runtime_tool_name.replace(/^me__/, ""),
    description: patch.description ?? null,
    input_schema: patch.input_schema ?? {},
    risk_level: patch.risk_level ?? "read",
  };
}

const personalLinear = tool({
  scope: "user",
  runtime_tool_name: "me__linear__search_issues",
  catalog_app_id: "linear",
  app_name: "Linear",
  endpoint_url: "https://mcp.example.test/linear",
  tool_name: "search_issues",
  namespaced_tool_name: "linear__search_issues",
});

const personalNotion = tool({
  scope: "user",
  runtime_tool_name: "me__notion__search_pages",
  catalog_app_id: "notion",
  app_name: "Notion",
  endpoint_url: "https://mcp.example.test/notion",
  tool_name: "search_pages",
  namespaced_tool_name: "notion__search_pages",
});

const emptySkillResolution: RuntimeSkillResolution = {
  requested_mention_tokens: [],
  ambiguous_mention_tokens: [],
  user_platform_skill_inventory: [],
  selected_user_platform_skills: [],
  community_skill_inventory: [],
  selected_community_skills: [],
};

function runtimeToolNames(tools: RuntimeMountedMcpTool[]): string[] {
  return tools.map((entry) => entry.runtime_tool_name).sort();
}

function provePersonalOnlyCatalog() {
  const resolved = resolveEffectiveMountedToolCatalog([
    personalLinear,
    personalNotion,
  ]);

  assert.deepEqual(runtimeToolNames(resolved.executableTools), [
    "me__linear__search_issues",
    "me__notion__search_pages",
  ]);
  assert.deepEqual(runtimeToolNames(resolved.defaultDiscoveryTools), [
    "me__linear__search_issues",
    "me__notion__search_pages",
  ]);
  assert.deepEqual(resolved.shadowedRuntimeToolNames, []);
  assert.equal(resolved.capabilityGroups.length, 2);
  assert.equal(
    resolved.capabilityGroups.find((group) => group.capability_key === "catalog:linear")
      ?.default_scope,
    "user",
  );
  console.log("PASS: personal-only tools remain default-visible");
}

function proveComposedHarnessUsesResolverAliases() {
  const resolvedWithoutCommunity = composeResolvedRuntimeHarness({
    personalMountedTools: [personalLinear],
    skillResolution: emptySkillResolution,
  });
  assert.deepEqual(runtimeToolNames(resolvedWithoutCommunity.runtimeMountedTools), [
    "me__linear__search_issues",
  ]);
  assert.deepEqual(runtimeToolNames(resolvedWithoutCommunity.discoveryMountedTools), [
    "me__linear__search_issues",
  ]);
  assert.deepEqual(resolvedWithoutCommunity.shadowedRuntimeToolNames, []);
  assert.equal(resolvedWithoutCommunity.activeCommunityModule, null);
  console.log("PASS: composed harness keeps MCP runtime canonical to personal tools");
}

function proveCommunitySkillsStillActivateWithoutCommunityMcpRuntime() {
  const resolved = composeResolvedRuntimeHarness({
    personalMountedTools: [personalLinear],
    skillResolution: {
      ...emptySkillResolution,
      community_skill_inventory: [
        {
          community_skill_attachment_id: "community-skill-1",
          skill_package_id: "linear-triage",
          catalog_skill_id: "linear-triage",
          name: "Linear triage",
          mention_token: "linear-triage",
          description: "Triage Linear issues for this community.",
        },
      ],
      selected_community_skills: [
        {
          community_skill_attachment_id: "community-skill-1",
          skill_package_id: "linear-triage",
          catalog_skill_id: "linear-triage",
          name: "Linear triage",
          mention_token: "linear-triage",
          description: "Triage Linear issues for this community.",
          skill_revision_id: "linear-triage-revision-1",
          instructions_md: "Use the user's connected Linear tools when needed.",
        },
      ],
    },
  });

  assert.deepEqual(runtimeToolNames(resolved.runtimeMountedTools), [
    "me__linear__search_issues",
  ]);
  assert.deepEqual(
    resolved.activeCommunityModule?.selectedSkills.map(
      (skill) => skill.mention_token,
    ),
    ["linear-triage"],
  );
  assert.ok(
    resolved.systemPromptSuffix.includes("COMMUNITY_SKILL_PACKAGE: Linear triage"),
  );
  assert.ok(!resolved.systemPromptSuffix.includes("Community-mounted app tools"));
  console.log("PASS: community skills still activate without community MCP runtime");
}

provePersonalOnlyCatalog();
proveComposedHarnessUsesResolverAliases();
proveCommunitySkillsStillActivateWithoutCommunityMcpRuntime();

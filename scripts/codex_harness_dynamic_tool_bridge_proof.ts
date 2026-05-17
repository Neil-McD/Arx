import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  CODEX_HARNESS_DYNAMIC_TOOL_BRIDGE_ROUTE,
  CODEX_HARNESS_READ_ONLY_DYNAMIC_TOOL_NAMES,
  buildCodexHarnessDynamicToolSpecs,
  buildCodexHarnessMountedMcpDynamicToolSpecs,
  isCodexAppServerNativeToolName,
  normalizeCodexHarnessDynamicToolArguments,
} from "../shared/codexHarnessDynamicTools.ts";
import type { CodexMcpProjectionMountedTool } from "../shared/codexMcpProjection.ts";

const rootDir = process.cwd();

function readText(filePath: string): string {
  return readFileSync(path.join(rootDir, filePath), "utf8");
}

function proveReadOnlyDynamicToolSurface() {
  assert.deepEqual(CODEX_HARNESS_READ_ONLY_DYNAMIC_TOOL_NAMES, [
    "get_active_community_context",
    "community_search",
  ]);

  const specs = buildCodexHarnessDynamicToolSpecs([
    "get_active_community_context",
    "community_search",
    "community_write",
    "read",
    "write",
    "bash",
  ]);
	  assert.deepEqual(
	    specs.map((tool) => tool.name),
	    ["get_active_community_context", "community_search"],
	    "Codex platform dynamic bridge should expose only read-only PolyNet platform tools",
	  );
  assert.equal(specs[0]?.inputSchema.type, "object");
  assert.equal(specs[1]?.inputSchema.type, "object");
  assert.deepEqual(
    normalizeCodexHarnessDynamicToolArguments("get_active_community_context", {
      ignored: "model-selected input",
    }),
    {},
    "active community context should stay server-selected",
  );
  assert.deepEqual(
    normalizeCodexHarnessDynamicToolArguments("community_search", {
      query: "community memory",
    }),
    { query: "community memory" },
  );

  for (const toolName of [
    "read",
    "write",
    "edit",
    "bash",
    "apply_patch",
    "exec",
    "process",
    "update_plan",
  ]) {
    assert.equal(
      isCodexAppServerNativeToolName(toolName),
      true,
      `${toolName} should remain Codex-native, not a PolyNet dynamic bridge tool`,
    );
  }
  assert.equal(isCodexAppServerNativeToolName("community_search"), false);

  const mountedMcpSpecs = buildCodexHarnessMountedMcpDynamicToolSpecs({
    eligibleRuntimeToolNames: ["me__github__search_repositories"],
    mountedTools: [
      {
        scope: "user",
        mount_id: "mount:github",
        runtime_tool_name: "me__github__search_repositories",
        developer_app_id: "developer-app-github",
        catalog_app_id: "github",
        app_name: "GitHub",
        endpoint_url: "https://api.githubcopilot.com/mcp/readonly",
        auth_type: "bearer",
        tool_name: "search_repositories",
        namespaced_tool_name: "github__search_repositories",
        description: "Search repositories.",
        input_schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            query: { type: "string" },
          },
          required: ["query"],
        },
        risk_level: "read",
      } satisfies CodexMcpProjectionMountedTool,
      {
        scope: "user",
        mount_id: "mount:github",
        runtime_tool_name: "me__github__create_issue",
        developer_app_id: "developer-app-github",
        catalog_app_id: "github",
        app_name: "GitHub",
        endpoint_url: "https://api.githubcopilot.com/mcp/readonly",
        auth_type: "bearer",
        tool_name: "create_issue",
        namespaced_tool_name: "github__create_issue",
        description: "Create an issue.",
        input_schema: {
          type: "object",
          additionalProperties: true,
          properties: {},
        },
        risk_level: "write",
      } satisfies CodexMcpProjectionMountedTool,
    ],
  });
  assert.deepEqual(
    mountedMcpSpecs.map((tool) => tool.name),
    ["me__github__search_repositories"],
    "Codex dynamic bridge should expose only projection-eligible read-only mounted MCP tools",
  );
}

function proveDaytonaSidecarBridgeHandling() {
  const probeScript = readText("shared/codexHarnessProbeScript.ts");
  assert.match(
    probeScript,
    /POLYNET_CODEX_DYNAMIC_TOOLS_JSON/,
    "sidecar script should accept dynamic tool specs from Convex",
  );
  assert.match(
    probeScript,
    /dynamicTools: dynamicToolSpecs/,
    "Codex thread/start should receive dynamic tool specs",
  );
  assert.match(
    probeScript,
    /message\.method === "item\/tool\/call"/,
    "sidecar script should handle Codex dynamic tool calls",
  );
  assert.match(
    probeScript,
    /readAndRemoveDynamicToolBridgeConfig/,
    "sidecar should read and unlink dynamic bridge config from a temp file",
  );
  assert.match(
    probeScript,
    /POLYNET_CODEX_DYNAMIC_TOOL_BRIDGE_FILE/,
    "sidecar should receive only a bridge config file path through env",
  );
  assert.match(
    probeScript,
    /unlinkSync\(bridgeConfigFile\)/,
    "sidecar should remove the bridge config file after reading it",
  );
  assert.match(
    probeScript,
    /failedDynamicToolResponse\("This dynamic tool is not available for this Codex run\."/,
    "unknown dynamic tools should fail closed",
  );
}

function proveConvexBridgeAndRoute() {
  const bridge = readText("convex/codexHarnessBridge.ts");
  const route = readText("convex/httpCodexHarnessBridge.ts");
  const http = readText("convex/http.ts");
  const schema = readText("convex/schema.ts");
  const platformTools = readText("convex/codexHarnessPlatformTools.ts");
  const stagingMaintenance = readText("convex/stagingMaintenance.ts");

  assert.match(
    bridge,
    /buildCodexHarnessDynamicToolSpecs\(\s*turn\.fixedAllowedToolNames/,
    "primary Codex harness should derive platform dynamic tools from the existing runtime tool policy",
  );
  assert.match(
    bridge,
    /buildCodexHarnessMountedMcpDynamicToolSpecs\(\{/,
    "primary Codex harness should project eligible read-only mounted MCP tools into Codex dynamic tools",
  );
  assert.match(
    bridge,
    /params\.executionSession\.getMountedTools\(\)/,
    "primary Codex harness should source mounted MCP dynamic tools from PolyNet's resolved harness",
  );
  assert.match(
    bridge,
    /createCodexHarnessBridgeSessionInternal/,
    "primary Codex harness should create a short-lived bridge session",
  );
  assert.match(
    bridge,
    /authSubject: params\.authSubject \?\? undefined/,
    "primary Codex bridge sessions should carry the authenticated subject for platform tools and audit events",
  );
  assert.match(
    bridge,
    /bridgeConfigUpload/,
    "primary Codex harness should upload bridge credentials as a chmod 600 temp file",
  );
  assert.doesNotMatch(
    bridge,
    /POLYNET_CODEX_DYNAMIC_TOOL_BRIDGE_TOKEN=\$\{shellQuote/,
    "primary Codex harness must not place bridge tokens in the shell command environment",
  );
  assert.match(
    bridge,
    /POLYNET_CODEX_DYNAMIC_TOOL_BRIDGE_FILE=\$\{shellQuote\(bridgeConfigPath\)\}/,
    "primary Codex harness should pass only the bridge config file path through env",
  );
  assert.match(
    bridge,
    /finally[\s\S]*revokeCodexHarnessBridgeSessionBestEffort/,
    "primary Codex harness should revoke bridge sessions after the turn finishes",
  );
  assert.match(
    bridge,
    /codex_harness_primary_dynamic_tool_event/,
    "dynamic bridge calls should be projected back into runtime evidence",
  );
  assert.match(
    bridge,
    /Codex primary canary requirement:[\s\S]*get_active_community_context[\s\S]*community_search/,
    "Codex primary canary should explicitly force both read-only PolyNet dynamic tools before the final answer",
  );
  assert.match(
    bridge,
    /codex_native_workspace_tools_v0_plus_polynet_readonly_dynamic_tools_v1/,
    "tool projection should make the Codex-native plus PolyNet-read-only split explicit",
  );

  assert.match(
    route,
    /CODEX_HARNESS_DYNAMIC_TOOL_BRIDGE_ROUTE/,
    "HTTP route should use the shared bridge path",
  );
  assert.equal(
    CODEX_HARNESS_DYNAMIC_TOOL_BRIDGE_ROUTE,
    "/runtime/codex_harness_dynamic_tool",
  );
  assert.match(route, /readBearerToken/, "bridge route should require bearer auth");
  assert.match(
    route,
    /const authSubject = readString\(params\.session \?\? \{\}, "authSubject"\)/,
    "bridge audit should require authenticated subject context before appending runtime events",
  );
  assert.match(
    route,
    /appendTrustedCloudRuntimeRunEventInternal/,
    "bridge audit should use a trusted internal event appender instead of the public auth-gated mutation",
  );
  assert.match(
    platformTools,
    /resolveCodexHarnessTrustedCommunityContextInternal/,
    "bridge platform tools should use a trusted community-context query that validates the bridge actor",
  );
  assert.match(
    platformTools,
    /searchCodexHarnessTrustedCommunityKnowledgeInternal/,
    "bridge community_search should use a trusted search action that validates the bridge actor",
  );
  assert.match(
    route,
    /resolveCodexHarnessBridgeSessionForCallInternal/,
    "bridge route should validate the short-lived bridge session before execution",
  );
  assert.match(
    route,
    /executeCodexHarnessReadOnlyPlatformTool/,
    "bridge route should execute through the PolyNet-owned read-only dynamic tool adapter",
  );
  assert.match(
    route,
    /codex_harness_dynamic_tool_bridge_call_started/,
    "bridge route should audit server-observed bridge call starts",
  );
  assert.match(
    route,
    /codex_harness_dynamic_tool_bridge_call_finished/,
    "bridge route should audit server-observed bridge call finishes",
  );
  assert.match(
    route,
    /codex_harness_dynamic_tool_bridge_call_denied/,
    "bridge route should audit bridge call denials when run context is known",
  );
  assert.match(
    stagingMaintenance,
    /codex_harness_dynamic_tool_bridge_call_finished/,
    "staging evidence should include server-observed bridge call finishes",
  );
  assert.match(
    stagingMaintenance,
    /codex_harness_dynamic_tool_bridge_call_denied/,
    "staging evidence should include server-observed bridge call denials",
  );
  assert.match(
    http,
    /registerCodexHarnessBridgeRoutes/,
    "Codex bridge HTTP route should be registered",
  );
  assert.match(
    schema,
    /codexHarnessBridgeSessions: defineTable/,
    "bridge sessions should have a first-party persistence boundary",
  );
  assert.match(
    schema,
    /revokedReason: v\.optional\(v\.string\(\)\)/,
    "bridge sessions should record revoke reason",
  );
  const dynamicBridge = readText("convex/codexHarnessDynamicToolBridge.ts");
  assert.match(
    dynamicBridge,
    /revokeCodexHarnessBridgeSessionInternal/,
    "bridge sessions should have an explicit revoke mutation",
  );
  assert.match(
    dynamicBridge,
    /cleanupExpiredCodexHarnessBridgeSessionsInternal/,
    "bridge sessions should have expired-session cleanup",
  );
  assert.doesNotMatch(
    dynamicBridge,
    /isCodexHarnessReadOnlyDynamicToolName\(toolName\)/,
    "bridge session authorization should be driven by the per-run allowed tool list, including read-only MCP tools",
  );
  assert.match(
    platformTools,
    /executeCodexHarnessReadOnlyMountedMcpTool/,
    "bridge platform adapter should route projection-eligible mounted MCP tools through PolyNet's MCP manager",
  );
  assert.match(
    platformTools,
    /buildCodexMcpProjection\(\{ mountedTools \}\)/,
    "mounted MCP bridge calls should re-check current projection eligibility before execution",
  );
  assert.match(
    platformTools,
    /createRuntimeMcpManager\(/,
    "mounted MCP bridge calls should reuse PolyNet's canonical MCP manager",
  );
  assert.match(
    platformTools,
    /appendRunEvent: params\.appendRunEvent/,
    "mounted MCP bridge calls should preserve canonical MCP manager runtime telemetry",
  );
  assert.match(
    route,
    /appendBridgeRuntimeRunEventBestEffort/,
    "Codex bridge route should attach MCP manager telemetry to the active runtime run",
  );
  assert.doesNotMatch(
    platformTools,
    /publishCommunityAiFeedAgentPost|community_write/,
    "first Codex dynamic bridge slice must not expose community write behavior",
  );
}

proveReadOnlyDynamicToolSurface();
proveDaytonaSidecarBridgeHandling();
proveConvexBridgeAndRoute();

console.log("codex_harness_dynamic_tool_bridge_proof: ok");

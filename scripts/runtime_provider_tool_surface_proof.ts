import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  createRuntimeMountedToolExposureState,
  normalizeResolveMountedToolsArguments,
  RESOLVE_MOUNTED_TOOLS_TOOL_NAME,
} from "../convex/runtimeMountedToolExposure.ts";
import type { RuntimeMountedMcpTool } from "../convex/runtimeMcpManager.ts";

const rootDir = process.cwd();

const mountedTools: RuntimeMountedMcpTool[] = [
  {
    scope: "user",
    mount_id: "mount-1",
    runtime_tool_name: "me__notion_search",
    developer_app_id: "app-1",
    app_name: "Notion",
    endpoint_url: "https://example.test/notion",
    auth_type: "bearer",
    tool_name: "search_pages",
    namespaced_tool_name: "notion__search_pages",
    description: "Search Notion pages",
    input_schema: {},
    risk_level: "read",
  },
  {
    scope: "community",
    mount_id: "mount-2",
    runtime_tool_name: "drive__read_file",
    developer_app_id: "app-2",
    app_name: "Drive",
    endpoint_url: "https://example.test/drive",
    auth_type: "none",
    tool_name: "read_file",
    namespaced_tool_name: "drive__read_file",
    description: "Read a community Drive file",
    input_schema: {},
    risk_level: "read",
  },
];

function buildActiveToolNames(params: {
  allowedToolNames: readonly string[];
  exposureState: ReturnType<typeof createRuntimeMountedToolExposureState>;
}): string[] {
  const exposedMountedTools = params.exposureState.getExposedTools();
  const includeResolver = params.exposureState.hasMountedTools();
  return [
    ...params.allowedToolNames,
    ...(includeResolver ? [RESOLVE_MOUNTED_TOOLS_TOOL_NAME] : []),
    ...exposedMountedTools.map((tool) => tool.runtime_tool_name),
  ];
}

async function proveSourceUsesExposedMountedTools() {
  const source = await readFile(
    path.join(rootDir, "convex/runtimeExecutionSession.ts"),
    "utf8",
  );
  assert.match(
    source,
    /const exposedMountedTools = mountedToolExposureState\.getExposedTools\(\);/,
    "expected execution session to derive provider tools from the exposed mounted-tool set",
  );
  assert.match(
    source,
    /\.\.\.params\.buildMountedOpenAiTools\(exposedMountedTools\)/,
    "expected OpenAI tool surface to include only exposed mounted tools",
  );
  assert.match(
    source,
    /\.\.\.params\.buildMountedResponsesTools\(exposedMountedTools\)/,
    "expected Responses tool surface to include only exposed mounted tools",
  );
  assert.match(
    source,
    /\.\.\.exposedMountedTools\.map\(\(tool\) => tool\.runtime_tool_name\)/,
    "expected active tool names to expand from exposed mounted tools",
  );
}

async function proveResolutionRefreshesNextProviderSurface() {
  const exposureState = createRuntimeMountedToolExposureState({
    mountedTools,
  });
  const allowedToolNames = ["community_search", "read"];

  const initial = buildActiveToolNames({
    allowedToolNames,
    exposureState,
  });
  assert.deepEqual(initial, [
    "community_search",
    "read",
    RESOLVE_MOUNTED_TOOLS_TOOL_NAME,
  ]);

  const resolution = exposureState.resolve(
    normalizeResolveMountedToolsArguments({
      query: "notion",
      scope: "user",
      limit: 2,
    }),
  );
  assert.deepEqual(
    resolution.resolution.newlyExposedTools.map((tool) => tool.runtime_tool_name),
    ["me__notion_search"],
  );

  const refreshed = buildActiveToolNames({
    allowedToolNames,
    exposureState,
  });
  assert.deepEqual(refreshed, [
    "community_search",
    "read",
    RESOLVE_MOUNTED_TOOLS_TOOL_NAME,
    "me__notion_search",
  ]);
  assert.equal(
    refreshed.includes("drive__read_file"),
    false,
    "expected unresolved mounted tools to remain absent from the next provider surface",
  );
}

await proveSourceUsesExposedMountedTools();
await proveResolutionRefreshesNextProviderSurface();
console.log("PASS: mounted tool resolution refreshes the next provider tool surface");

import assert from "node:assert/strict";
import {
  createRuntimeMountedToolExposureState,
  normalizeResolveMountedToolsArguments,
} from "../convex/runtimeMountedToolExposure.ts";

const mountedTools = [
  {
    scope: "user" as const,
    mount_id: "u1",
    runtime_tool_name: "me__notion_search",
    developer_app_id: "app-1",
    app_name: "Notion",
    endpoint_url: "https://example.test/notion",
    auth_type: "bearer",
    tool_name: "search_pages",
    namespaced_tool_name: "notion__search_pages",
    description: "Search Notion pages",
    input_schema: {},
    risk_level: "read" as const,
  },
  {
    scope: "community" as const,
    mount_id: "c1",
    runtime_tool_name: "drive__read_file",
    developer_app_id: "app-2",
    app_name: "Drive",
    endpoint_url: "https://example.test/drive",
    auth_type: "none",
    tool_name: "read_file",
    namespaced_tool_name: "drive__read_file",
    description: "Read a file from community Drive",
    input_schema: {},
    risk_level: "read" as const,
  },
  {
    scope: "community" as const,
    mount_id: "c2",
    runtime_tool_name: "github__create_issue",
    developer_app_id: "app-3",
    app_name: "GitHub",
    endpoint_url: "https://example.test/github",
    auth_type: "bearer",
    tool_name: "create_issue",
    namespaced_tool_name: "github__create_issue",
    description: "Create a GitHub issue",
    input_schema: {},
    risk_level: "write" as const,
  },
];

async function proveInitialExposureIsEmpty() {
  const state = createRuntimeMountedToolExposureState({
    mountedTools,
  });
  assert.equal(state.hasMountedTools(), true);
  assert.deepEqual(
    state.getExposedTools().map((tool) => tool.runtime_tool_name),
    [],
  );
  console.log("PASS: mounted tool exposure starts empty");
}

async function proveResolutionExposesMatches() {
  const state = createRuntimeMountedToolExposureState({
    mountedTools,
  });
  const normalizedArgs = normalizeResolveMountedToolsArguments({
    query: "notion",
    limit: 2,
  });
  const result = state.resolve(normalizedArgs);
  const payload = JSON.parse(result.outputText) as {
    newlyExposedTools: Array<{
      runtime_tool_name: string;
      scope: "user" | "community";
      risk_level: "read" | "write" | "sensitive";
    }>;
    totalExposedCount: number;
  };
  assert.deepEqual(
    payload.newlyExposedTools.map((tool) => tool.runtime_tool_name),
    ["me__notion_search"],
  );
  assert.equal(payload.newlyExposedTools[0]?.runtime_tool_name, "me__notion_search");
  assert.equal(payload.newlyExposedTools[0]?.scope, "user");
  assert.equal(payload.newlyExposedTools[0]?.risk_level, "read");
  assert.equal(payload.totalExposedCount, 1);
  assert.deepEqual(
    state.getExposedTools().map((tool) => tool.runtime_tool_name),
    ["me__notion_search"],
  );
  console.log("PASS: mounted tool resolution exposes matching tools");
}

async function proveScopeFilteringAndPersistence() {
  const state = createRuntimeMountedToolExposureState({
    mountedTools,
  });
  state.resolve(
    normalizeResolveMountedToolsArguments({
      query: "drive",
      scope: "community",
    }),
  );
  state.resolve(
    normalizeResolveMountedToolsArguments({
      query: "github",
      scope: "community",
    }),
  );
  assert.deepEqual(
    state.getExposedTools().map((tool) => tool.runtime_tool_name).sort(),
    ["drive__read_file", "github__create_issue"],
  );
  console.log("PASS: mounted tool exposure respects scope and persists within the run");
}

await proveInitialExposureIsEmpty();
await proveResolutionExposesMatches();
await proveScopeFilteringAndPersistence();

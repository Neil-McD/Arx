import assert from "node:assert/strict";
import { createRuntimeMcpManager } from "../convex/runtimeMcpManager.ts";

async function proveLazyAuthAndSessionReuse() {
  let connectionBundleLoads = 0;
  let sessionInitializations = 0;
  let initializedNotifications = 0;
  let toolCalls = 0;
  const seenSessionIds: string[] = [];

  const manager = createRuntimeMcpManager({
    runId: "run-mcp-proof-1",
    mountedTools: [
      {
        scope: "user",
        mount_id: "mount-1",
        runtime_tool_name: "me__drive_read",
        developer_app_id: "app-1",
        app_name: "Drive",
        endpoint_url: "https://mcp.example.test",
        auth_type: "bearer",
        tool_name: "read_file",
        namespaced_tool_name: "drive__read_file",
        description: "Read a file",
        input_schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            path: { type: "string" },
          },
        },
        risk_level: "read",
      },
    ],
    loadConnectionBundle: async () => {
      connectionBundleLoads += 1;
      return {
        app: {
          _id: "app-1",
          ownerUserId: "user-1",
          name: "Drive",
          slug: "drive",
          endpointUrl: "https://mcp.example.test",
          authType: "bearer",
          status: "valid",
          createdAt: 0,
          updatedAt: 0,
        },
        connection: null,
        secret: "secret-token",
      };
    },
    transport: {
      buildAuthHeaders: () => ({
        Authorization: "Bearer secret-token",
      }),
      initializeSession: async () => {
        sessionInitializations += 1;
        return {
          protocolVersion: "2025-06-18",
          sessionId: `session-${sessionInitializations}`,
        };
      },
      sendInitializedNotification: async () => {
        initializedNotifications += 1;
      },
      callTool: async (params) => {
        toolCalls += 1;
        seenSessionIds.push(String(params.sessionId ?? ""));
        return {
          content: [
            {
              type: "text",
              text: `ok:${toolCalls}`,
            },
          ],
        };
      },
      formatToolResultOutput: (value) =>
        JSON.stringify(value),
    },
  });

  const first = await manager.execute({
    runtimeToolName: "me__drive_read",
    argumentsObject: { path: "/alpha.txt" },
  });
  const second = await manager.execute({
    runtimeToolName: "me__drive_read",
    argumentsObject: { path: "/beta.txt" },
  });

  assert.equal(first.status, "ok");
  assert.equal(second.status, "ok");
  assert.equal(connectionBundleLoads, 1);
  assert.equal(sessionInitializations, 1);
  assert.equal(initializedNotifications, 1);
  assert.equal(toolCalls, 2);
  assert.deepEqual(seenSessionIds, ["session-1", "session-1"]);

  console.log("PASS: runtime MCP manager lazy auth + session reuse proof");
}

async function proveReadToolSessionRefreshRetry() {
  let connectionBundleLoads = 0;
  let sessionInitializations = 0;
  let toolCalls = 0;
  const seenSessionIds: string[] = [];

  const manager = createRuntimeMcpManager({
    runId: "run-mcp-proof-2",
    mountedTools: [
      {
        scope: "community",
        mount_id: "mount-2",
        runtime_tool_name: "docs__search",
        developer_app_id: "app-2",
        app_name: "Docs",
        endpoint_url: "https://mcp.example.test",
        auth_type: "none",
        tool_name: "search_docs",
        namespaced_tool_name: "docs__search_docs",
        description: "Search docs",
        input_schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            query: { type: "string" },
          },
        },
        risk_level: "read",
      },
    ],
    loadConnectionBundle: async () => {
      connectionBundleLoads += 1;
      return {
        app: {
          _id: "app-2",
          ownerUserId: "user-1",
          name: "Docs",
          slug: "docs",
          endpointUrl: "https://mcp.example.test",
          authType: "none",
          status: "valid",
          createdAt: 0,
          updatedAt: 0,
        },
        connection: null,
        secret: null,
      };
    },
    transport: {
      buildAuthHeaders: () => ({}),
      initializeSession: async () => {
        sessionInitializations += 1;
        return {
          protocolVersion: "2025-06-18",
          sessionId: `retry-session-${sessionInitializations}`,
        };
      },
      sendInitializedNotification: async () => {},
      callTool: async (params) => {
        toolCalls += 1;
        seenSessionIds.push(String(params.sessionId ?? ""));
        if (toolCalls === 1) {
          throw new Error("unknown session");
        }
        return {
          content: [
            {
              type: "text",
              text: "retry-ok",
            },
          ],
        };
      },
      formatToolResultOutput: (value) =>
        JSON.stringify(value),
    },
  });

  const result = await manager.execute({
    runtimeToolName: "docs__search",
    argumentsObject: { query: "pricing" },
  });

  assert.equal(result.status, "ok");
  assert.equal(connectionBundleLoads, 1);
  assert.equal(sessionInitializations, 2);
  assert.equal(toolCalls, 2);
  assert.deepEqual(seenSessionIds, [
    "retry-session-1",
    "retry-session-2",
  ]);

  console.log("PASS: runtime MCP manager read-session refresh proof");
}

await proveLazyAuthAndSessionReuse();
await proveReadToolSessionRefreshRetry();

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
        catalog_app_id: "linear",
        app_name: "Linear",
        endpoint_url: "https://mcp.linear.app/mcp",
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
          catalogAppId: "linear",
          name: "Linear",
          slug: "linear",
          endpointUrl: "https://mcp.linear.app/mcp",
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
        catalog_app_id: "shopify",
        app_name: "demo-store Shopify",
        endpoint_url: "https://demo-store.myshopify.com/api/mcp",
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
          catalogAppId: "shopify",
          name: "demo-store Shopify",
          slug: "demo-store-shopify",
          endpointUrl: "https://demo-store.myshopify.com/api/mcp",
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

async function proveOptionalNullArgumentsArePruned() {
  let seenArguments: Record<string, unknown> | null = null;

  const manager = createRuntimeMcpManager({
    runId: "run-mcp-proof-3",
    mountedTools: [
      {
        scope: "user",
        mount_id: "mount-3",
        runtime_tool_name: "me__linear_labels",
        developer_app_id: "app-3",
        catalog_app_id: "linear",
        app_name: "Linear",
        endpoint_url: "https://mcp.linear.app/mcp",
        auth_type: "bearer",
        tool_name: "list_issue_labels",
        namespaced_tool_name: "linear__list_issue_labels",
        description: "List labels",
        input_schema: {
          type: "object",
          additionalProperties: false,
          required: ["query", "required_nullable"],
          properties: {
            query: { type: "string" },
            cursor: { type: "string" },
            required_nullable: { type: ["string", "null"] },
            filters: {
              type: "object",
              additionalProperties: false,
              required: ["state"],
              properties: {
                owner: { type: "string" },
                state: { type: "string" },
              },
            },
          },
        },
        risk_level: "read",
      },
    ],
    loadConnectionBundle: async () => ({
      app: {
        _id: "app-3",
        ownerUserId: "user-1",
        catalogAppId: "linear",
        name: "Linear",
        slug: "linear",
        endpointUrl: "https://mcp.linear.app/mcp",
        authType: "bearer",
        status: "valid",
        createdAt: 0,
        updatedAt: 0,
      },
      connection: null,
      secret: "secret-token",
    }),
    transport: {
      buildAuthHeaders: () => ({
        Authorization: "Bearer secret-token",
      }),
      initializeSession: async () => ({
        protocolVersion: "2025-06-18",
        sessionId: "session-optional-null",
      }),
      sendInitializedNotification: async () => {},
      callTool: async (params) => {
        seenArguments = params.argumentsObject;
        return {
          content: [{ type: "text", text: "ok" }],
        };
      },
      formatToolResultOutput: (value) => JSON.stringify(value),
    },
  });

  const result = await manager.execute({
    runtimeToolName: "me__linear_labels",
    argumentsObject: {
      query: "bug",
      cursor: null,
      required_nullable: null,
      filters: {
        owner: null,
        state: "open",
      },
    },
  });

  assert.equal(result.status, "ok");
  assert.deepEqual(seenArguments, {
    query: "bug",
    required_nullable: null,
    filters: {
      state: "open",
    },
  });

  console.log("PASS: runtime MCP manager optional-null argument pruning proof");
}

async function proveProviderBlockedToolDoesNotExecute() {
  let sessionInitializations = 0;
  let toolCalls = 0;

  const manager = createRuntimeMcpManager({
    runId: "run-mcp-proof-4",
    mountedTools: [
      {
        scope: "user",
        mount_id: "mount-4",
        runtime_tool_name: "me__stripe_create_customer",
        developer_app_id: "app-4",
        catalog_app_id: "stripe",
        app_name: "Stripe",
        endpoint_url: "https://mcp.stripe.com/",
        auth_type: "bearer",
        tool_name: "create_customer",
        namespaced_tool_name: "stripe__create_customer",
        description: "Create a customer",
        input_schema: {
          type: "object",
          properties: {
            email: { type: "string" },
          },
        },
        risk_level: "sensitive",
      },
    ],
    loadConnectionBundle: async () => ({
      app: {
        _id: "app-4",
        ownerUserId: "user-1",
        catalogAppId: "stripe",
        name: "Stripe",
        slug: "stripe",
        endpointUrl: "https://mcp.stripe.com/",
        authType: "bearer",
        status: "valid",
        createdAt: 0,
        updatedAt: 0,
      },
      connection: null,
      secret: "rk_test_123",
    }),
    transport: {
      buildAuthHeaders: () => ({
        Authorization: "Bearer rk_test_123",
      }),
      initializeSession: async () => {
        sessionInitializations += 1;
        return {
          protocolVersion: "2025-06-18",
          sessionId: "session-blocked",
        };
      },
      sendInitializedNotification: async () => {},
      callTool: async () => {
        toolCalls += 1;
        return { content: [{ type: "text", text: "unexpected" }] };
      },
      formatToolResultOutput: (value) => JSON.stringify(value),
    },
  });

  const result = await manager.execute({
    runtimeToolName: "me__stripe_create_customer",
    argumentsObject: { email: "a@example.com" },
  });

  assert.equal(result.status, "error");
  assert.equal(result.errorCode, "mounted_app_tool_blocked_by_policy");
  assert.match(String(result.errorMessage ?? ""), /Stripe MCP mutation tools are disabled/);
  assert.equal(sessionInitializations, 0);
  assert.equal(toolCalls, 0);

  console.log("PASS: runtime MCP manager provider-blocked tool proof");
}

async function proveProviderRejectedSecretDoesNotExecute() {
  let connectionBundleLoads = 0;
  let sessionInitializations = 0;
  let toolCalls = 0;

  const manager = createRuntimeMcpManager({
    runId: "run-mcp-proof-5",
    mountedTools: [
      {
        scope: "user",
        mount_id: "mount-5",
        runtime_tool_name: "me__stripe_list_customers",
        developer_app_id: "app-5",
        catalog_app_id: "stripe",
        app_name: "Stripe",
        endpoint_url: "https://mcp.stripe.com/",
        auth_type: "bearer",
        tool_name: "list_customers",
        namespaced_tool_name: "stripe__list_customers",
        description: "List customers",
        input_schema: {
          type: "object",
          properties: {},
        },
        risk_level: "sensitive",
      },
    ],
    loadConnectionBundle: async () => {
      connectionBundleLoads += 1;
      return {
        app: {
          _id: "app-5",
          ownerUserId: "user-1",
          catalogAppId: "stripe",
          name: "Stripe",
          slug: "stripe",
          endpointUrl: "https://mcp.stripe.com/",
          authType: "bearer",
          status: "valid",
          createdAt: 0,
          updatedAt: 0,
        },
        connection: null,
        secret: "sk_test_123",
      };
    },
    transport: {
      buildAuthHeaders: () => ({
        Authorization: "Bearer sk_test_123",
      }),
      initializeSession: async () => {
        sessionInitializations += 1;
        return {
          protocolVersion: "2025-06-18",
          sessionId: "session-secret-policy",
        };
      },
      sendInitializedNotification: async () => {},
      callTool: async () => {
        toolCalls += 1;
        return { content: [{ type: "text", text: "unexpected" }] };
      },
      formatToolResultOutput: (value) => JSON.stringify(value),
    },
  });

  const result = await manager.execute({
    runtimeToolName: "me__stripe_list_customers",
    argumentsObject: {},
  });

  assert.equal(result.status, "error");
  assert.equal(result.errorCode, "mounted_app_connection_secret_policy_rejected");
  assert.match(String(result.errorMessage ?? ""), /restricted API key/);
  assert.equal(connectionBundleLoads, 1);
  assert.equal(sessionInitializations, 0);
  assert.equal(toolCalls, 0);

  console.log("PASS: runtime MCP manager provider-secret policy proof");
}

await proveLazyAuthAndSessionReuse();
await proveReadToolSessionRefreshRetry();
await proveOptionalNullArgumentsArePruned();
await proveProviderBlockedToolDoesNotExecute();
await proveProviderRejectedSecretDoesNotExecute();

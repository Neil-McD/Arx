import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  buildCodexMcpProjection,
  buildCodexMcpProjectionAuditPayload,
  type CodexMcpProjectionMountedTool,
} from "../shared/codexMcpProjection.ts";

const rootDir = process.cwd();

function readText(filePath: string): string {
  return readFileSync(path.join(rootDir, filePath), "utf8");
}

function tool(
  patch: Partial<CodexMcpProjectionMountedTool> & {
    runtime_tool_name: string;
    tool_name: string;
  },
): CodexMcpProjectionMountedTool {
  const hasPatchKey = (key: keyof CodexMcpProjectionMountedTool) =>
    Object.prototype.hasOwnProperty.call(patch, key);
  return {
    scope: patch.scope ?? "user",
    mount_id: patch.mount_id ?? `mount:${patch.runtime_tool_name}`,
    runtime_tool_name: patch.runtime_tool_name,
    developer_app_id: patch.developer_app_id ?? "developer-app-github",
    catalog_app_id: hasPatchKey("catalog_app_id")
      ? patch.catalog_app_id ?? null
      : "github",
    app_name: patch.app_name ?? "GitHub",
    endpoint_url:
      patch.endpoint_url ?? "https://api.githubcopilot.com/mcp/readonly",
    auth_type: patch.auth_type ?? "bearer",
    tool_name: patch.tool_name,
    namespaced_tool_name:
      patch.namespaced_tool_name ?? `github__${patch.tool_name}`,
    description: patch.description ?? null,
    input_schema: patch.input_schema ?? {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
    risk_level: patch.risk_level ?? "read",
  };
}

function assertAuditHasNoSecretOrEndpointUrl(payload: Record<string, unknown>) {
  const raw = JSON.stringify(payload);
  assert.ok(!raw.includes("endpoint_url\":\""), "audit payload must not include raw endpoint URLs");
  assert.ok(!raw.includes("super-secret"), "audit payload must not include secrets from tool metadata");
  assert.ok(!raw.includes("Authorization"), "audit payload must not include auth headers");
}

async function proveEligibleAlreadyRiskFlooredReadOnlyRemoteMcpProjection() {
  // Projection consumes already-resolved runtime tools. The live validation path
  // applies catalog risk floors before tools reach this descriptor.
  const projection = await buildCodexMcpProjection({
    mountedTools: [
      tool({
        runtime_tool_name: "me__github__search_repositories",
        tool_name: "search_repositories",
        description: "Search repos without leaking super-secret metadata.",
      }),
    ],
  });

  assert.equal(projection.version, "codex_mcp_projection_v0");
  assert.equal(projection.mode, "read_only_remote_mcp_descriptor_v0");
  assert.match(projection.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(projection.eligible_tool_count, 1);
  assert.equal(projection.blocked_tool_count, 0);
  assert.equal(projection.server_count, 1);
  assert.equal(projection.servers[0]?.developer_app_id, "developer-app-github");
  assert.match(
    String(projection.servers[0]?.server_key ?? ""),
    /developer:developer-app-github/,
  );
  assert.deepEqual(projection.servers[0]?.runtime_tool_names, [
    "me__github__search_repositories",
  ]);
  assert.equal(projection.tools[0]?.status, "eligible");

  const audit = buildCodexMcpProjectionAuditPayload(projection);
  assert.deepEqual(audit.eligible_runtime_tool_names, [
    "me__github__search_repositories",
  ]);
  assertAuditHasNoSecretOrEndpointUrl(audit);
}

async function proveFailClosedBlockedReasons() {
  const projection = await buildCodexMcpProjection({
    mountedTools: [
      tool({
        scope: "community",
        runtime_tool_name: "community__github__search_repositories",
        tool_name: "search_repositories",
      }),
      tool({
        runtime_tool_name: "me__github__create_issue",
        tool_name: "create_issue",
        risk_level: "write",
      }),
      tool({
        runtime_tool_name: "me__unknown__search",
        tool_name: "search",
        catalog_app_id: null,
      }),
      tool({
        runtime_tool_name: "me__vercel__list_deployments",
        tool_name: "list_deployments",
        catalog_app_id: "vercel",
        app_name: "Vercel",
        endpoint_url: "https://mcp.vercel.com",
        auth_type: "oauth",
      }),
      tool({
        runtime_tool_name: "me__hyperframes__render",
        tool_name: "render",
        catalog_app_id: "hyperframes",
        app_name: "HyperFrames",
        endpoint_url: "https://example.com/mcp",
        auth_type: "none",
      }),
      tool({
        runtime_tool_name: "me__stripe__create_customer",
        tool_name: "create_customer",
        catalog_app_id: "stripe",
        app_name: "Stripe",
        endpoint_url: "https://mcp.stripe.com",
      }),
      tool({
        runtime_tool_name: "me__github__query_endpoint",
        tool_name: "search_repositories",
        endpoint_url:
          "https://api.githubcopilot.com/mcp/readonly?token=super-secret",
      }),
      tool({
        runtime_tool_name: "me__github__evil_endpoint",
        tool_name: "search_repositories",
        endpoint_url: "https://evil.example.com/mcp",
      }),
      tool({
        runtime_tool_name: "me__github__wrong_auth",
        tool_name: "search_repositories",
        auth_type: "api_key",
      }),
    ],
  });

  assert.equal(projection.eligible_tool_count, 0);
  assert.equal(projection.server_count, 0);
  const reasonsByName = new Map(
    projection.tools.map((entry) => [
      entry.runtime_tool_name,
      entry.blocked_reasons,
    ]),
  );
  assert.ok(
    reasonsByName
      .get("community__github__search_repositories")
      ?.includes("user_scope_required"),
  );
  assert.ok(
    reasonsByName.get("me__github__create_issue")?.includes("read_risk_required"),
  );
  assert.ok(
    reasonsByName.get("me__unknown__search")?.includes("catalog_profile_required"),
  );
  assert.ok(
    reasonsByName
      .get("me__vercel__list_deployments")
      ?.includes("ready_remote_mcp_profile_required"),
  );
  assert.ok(
    reasonsByName
      .get("me__hyperframes__render")
      ?.includes("server_http_execution_surface_required"),
  );
  assert.ok(
    reasonsByName
      .get("me__stripe__create_customer")
      ?.includes("catalog_tool_policy_disabled"),
  );
  assert.ok(
    reasonsByName
      .get("me__github__query_endpoint")
      ?.includes("remote_https_endpoint_required"),
  );
  assert.ok(
    reasonsByName
      .get("me__github__evil_endpoint")
      ?.includes("catalog_endpoint_mismatch"),
  );
  assert.ok(
    reasonsByName
      .get("me__github__wrong_auth")
      ?.includes("catalog_auth_mismatch"),
  );
  const policyCodesByName = new Map(
    projection.tools.map((entry) => [
      entry.runtime_tool_name,
      entry.catalog_connection_policy_code,
    ]),
  );
  assert.equal(
    policyCodesByName.get("me__github__evil_endpoint"),
    "catalog_app_endpoint_mismatch",
  );
  assert.equal(
    policyCodesByName.get("me__github__wrong_auth"),
    "catalog_app_auth_mismatch",
  );
}

async function proveDeveloperAppIdentitySeparatesProjectedServers() {
  const projection = await buildCodexMcpProjection({
    mountedTools: [
      tool({
        developer_app_id: "developer-app-github-a",
        runtime_tool_name: "me__github_a__search_repositories",
        tool_name: "search_repositories",
      }),
      tool({
        developer_app_id: "developer-app-github-b",
        runtime_tool_name: "me__github_b__search_repositories",
        tool_name: "search_repositories",
      }),
    ],
  });

  assert.equal(projection.eligible_tool_count, 2);
  assert.equal(
    projection.server_count,
    2,
    "same endpoint/auth/catalog must not collapse credentials across developer apps",
  );
  assert.deepEqual(
    projection.servers.map((server) => server.developer_app_id).sort(),
    ["developer-app-github-a", "developer-app-github-b"],
  );
}

async function proveFingerprintStabilityAndRotation() {
  const first = await buildCodexMcpProjection({
    mountedTools: [
      tool({
        runtime_tool_name: "me__github__search_repositories",
        tool_name: "search_repositories",
      }),
    ],
  });
  const second = await buildCodexMcpProjection({
    mountedTools: [
      tool({
        runtime_tool_name: "me__github__search_repositories",
        tool_name: "search_repositories",
      }),
    ],
  });
  const changed = await buildCodexMcpProjection({
    mountedTools: [
      tool({
        runtime_tool_name: "me__github__search_repositories",
        tool_name: "search_repositories",
      }),
      tool({
        runtime_tool_name: "me__github__search_issues",
        tool_name: "search_issues",
      }),
    ],
  });

  assert.equal(first.fingerprint, second.fingerprint);
  assert.notEqual(first.fingerprint, changed.fingerprint);
}

function proveRiskFloorGroundTruthIsUpstream() {
  const appValidation = readText("convex/appValidation.ts");
  const userPlatformAppMounts = readText("convex/userPlatformAppMounts.ts");
  assert.match(
    appValidation,
    /applyDiscoverAppDefaultToolRiskFloor\(\s*app\.catalogAppId,\s*classifyToolRisk/s,
    "catalog risk floors should be applied before tools are stored",
  );
  assert.match(
    userPlatformAppMounts,
    /risk_level: tool\.risk_level/,
    "runtime mounted tools should carry the stored risk level into projection",
  );
}

function proveHarnessWiring() {
  const httpDaytona = readText("convex/httpDaytona.ts");
  const runtimeAgentHarness = readText("shared/runtimeAgentHarness.ts");
  const codexBridge = readText("convex/codexHarnessBridge.ts");

  assert.match(
    httpDaytona,
    /buildCodexMcpProjection\(\{\s*mountedTools: resolvedHarness\.runtimeMountedTools/s,
    "Codex MCP projection should derive from the already resolved PolyNet harness tools",
  );
  assert.match(
    httpDaytona,
    /eventType: "codex_mcp_projection_resolved"/,
    "Codex MCP projection should emit a first-party runtime evidence event",
  );
  assert.match(
    httpDaytona,
    /buildCodexMcpProjectionAuditPayload\(codexMcpProjection\)/,
    "Codex MCP projection event should use the redacted audit payload",
  );
  assert.match(
    runtimeAgentHarness,
    /codexMcpProjection: \{/,
    "prepared Codex turns should carry the projection fingerprint and counts",
  );
  assert.match(
    codexBridge,
    /codex_mcp_projection_execution: "descriptor_only"/,
    "first slice should be explicit that native MCP execution is not wired yet",
  );
  assert.match(
    codexBridge,
    /PolyNet MCP projection descriptor:/,
    "Codex instructions should receive the projection descriptor as context",
  );
}

await proveEligibleAlreadyRiskFlooredReadOnlyRemoteMcpProjection();
await proveFailClosedBlockedReasons();
await proveDeveloperAppIdentitySeparatesProjectedServers();
await proveFingerprintStabilityAndRotation();
proveRiskFloorGroundTruthIsUpstream();
proveHarnessWiring();

console.log("PASS: Codex MCP projection descriptor is read-only, fail-closed, fingerprinted, and wired into harness evidence.");

import {
  findDiscoverAppCatalogEntryById,
  getDiscoverAppDisabledToolReason,
  hasExplicitDiscoverAppIntegrationProfile,
  resolveDiscoverAppCatalogConnectPolicy,
  resolveDiscoverAppExecutionSurface,
  resolveDiscoverAppIntegrationProfile,
} from "./discoverCatalog.ts";
import type { DeveloperAppAuthType } from "./communityAppMountTypes.ts";

export const CODEX_MCP_PROJECTION_VERSION = "codex_mcp_projection_v0";
export const CODEX_MCP_PROJECTION_MODE = "read_only_remote_mcp_descriptor_v0";

export type CodexMcpProjectionScope = "user" | "community";
export type CodexMcpProjectionRiskLevel = "read" | "write" | "sensitive";

export type CodexMcpProjectionMountedTool = {
  scope: CodexMcpProjectionScope;
  mount_id: string;
  runtime_tool_name: string;
  developer_app_id: string;
  catalog_app_id: string | null;
  app_name: string;
  endpoint_url: string;
  auth_type: string;
  tool_name: string;
  namespaced_tool_name: string;
  description: string | null;
  input_schema: unknown;
  risk_level: CodexMcpProjectionRiskLevel;
};

export type CodexMcpProjectionBlockedReason =
  | "user_scope_required"
  | "catalog_profile_required"
  | "explicit_integration_profile_required"
  | "ready_remote_mcp_profile_required"
  | "server_http_execution_surface_required"
  | "read_risk_required"
  | "catalog_connection_policy_failed"
  | "catalog_endpoint_mismatch"
  | "catalog_auth_mismatch"
  | "catalog_custom_endpoint_invalid"
  | "remote_https_endpoint_required"
  | "auth_type_required"
  | "developer_app_id_required"
  | "runtime_tool_name_required"
  | "tool_name_required"
  | "catalog_tool_policy_disabled";

export type CodexMcpProjectedTool = {
  status: "eligible" | "blocked";
  mount_id: string;
  runtime_tool_name: string;
  developer_app_id: string;
  catalog_app_id: string | null;
  app_name: string;
  endpoint_url: string;
  endpoint_url_sha256: string;
  auth_type: string;
  tool_name: string;
  namespaced_tool_name: string;
  risk_level: CodexMcpProjectionRiskLevel;
  scope: CodexMcpProjectionScope;
  blocked_reasons: CodexMcpProjectionBlockedReason[];
  catalog_connection_policy_code: string | null;
};

export type CodexMcpProjectedServer = {
  server_key: string;
  transport: "streamable_http";
  developer_app_id: string;
  catalog_app_id: string;
  app_name: string;
  endpoint_url: string;
  endpoint_url_sha256: string;
  auth_type: string;
  runtime_tool_names: string[];
};

export type CodexMcpProjection = {
  version: typeof CODEX_MCP_PROJECTION_VERSION;
  mode: typeof CODEX_MCP_PROJECTION_MODE;
  fingerprint: string;
  eligible_tool_count: number;
  blocked_tool_count: number;
  server_count: number;
  servers: CodexMcpProjectedServer[];
  tools: CodexMcpProjectedTool[];
};

function normalizeString(value: unknown, max = 1_000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeCatalogAppId(value: unknown): string | null {
  const normalized = normalizeString(value, 120).toLowerCase();
  return normalized || null;
}

function normalizeEndpointUrl(value: unknown): string {
  const raw = normalizeString(value, 2_000);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return "";
    if (url.username || url.password) return "";
    if (url.search || url.hash) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function isRemoteMcpAdapter(adapterKind: string): boolean {
  return (
    adapterKind === "remote_mcp_token" ||
    adapterKind === "remote_mcp_oauth" ||
    adapterKind === "remote_mcp_no_auth" ||
    adapterKind === "custom_remote_mcp"
  );
}

function isReadyRemoteMcpProfile(readiness: string): boolean {
  return (
    readiness === "ready_token" ||
    readiness === "ready_oauth" ||
    readiness === "ready_no_auth" ||
    readiness === "custom_endpoint"
  );
}

function appendReason(
  reasons: CodexMcpProjectionBlockedReason[],
  reason: CodexMcpProjectionBlockedReason,
): void {
  if (!reasons.includes(reason)) reasons.push(reason);
}

function appendCatalogConnectionPolicyReason(
  reasons: CodexMcpProjectionBlockedReason[],
  code: string,
): void {
  if (code === "catalog_app_endpoint_mismatch") {
    appendReason(reasons, "catalog_endpoint_mismatch");
    return;
  }
  if (code === "catalog_app_auth_mismatch") {
    appendReason(reasons, "catalog_auth_mismatch");
    return;
  }
  if (code === "catalog_app_custom_endpoint_invalid") {
    appendReason(reasons, "catalog_custom_endpoint_invalid");
    return;
  }
  appendReason(reasons, "catalog_connection_policy_failed");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function projectTool(
  tool: CodexMcpProjectionMountedTool,
): Promise<CodexMcpProjectedTool> {
  const blockedReasons: CodexMcpProjectionBlockedReason[] = [];
  const catalogAppId = normalizeCatalogAppId(tool.catalog_app_id);
  const runtimeToolName = normalizeString(tool.runtime_tool_name, 240);
  const toolName = normalizeString(tool.tool_name, 240);
  const endpointUrl = normalizeEndpointUrl(tool.endpoint_url);
  const authType = normalizeString(tool.auth_type, 80);
  const developerAppId = normalizeString(tool.developer_app_id, 240);
  let appName = normalizeString(tool.app_name, 160) || "MCP app";
  let canonicalEndpointUrl = endpointUrl;
  let canonicalAuthType = authType;
  let catalogConnectionPolicyCode: string | null = null;

  if (tool.scope !== "user") appendReason(blockedReasons, "user_scope_required");
  if (!runtimeToolName) {
    appendReason(blockedReasons, "runtime_tool_name_required");
  }
  if (!toolName) appendReason(blockedReasons, "tool_name_required");
  if (!endpointUrl) {
    appendReason(blockedReasons, "remote_https_endpoint_required");
  }
  if (!authType) appendReason(blockedReasons, "auth_type_required");
  if (!developerAppId) appendReason(blockedReasons, "developer_app_id_required");
  if (tool.risk_level !== "read") {
    appendReason(blockedReasons, "read_risk_required");
  }

  const catalogApp = findDiscoverAppCatalogEntryById(catalogAppId);
  if (!catalogApp || !catalogAppId) {
    appendReason(blockedReasons, "catalog_profile_required");
  } else {
    const catalogConnectionPolicy = resolveDiscoverAppCatalogConnectPolicy({
      catalogAppId,
      name: appName,
      endpointUrl: tool.endpoint_url,
      authType: authType as DeveloperAppAuthType,
    });
    if (catalogConnectionPolicy.ok) {
      const policyEndpointUrl = normalizeEndpointUrl(
        catalogConnectionPolicy.endpointUrl,
      );
      canonicalEndpointUrl = policyEndpointUrl || endpointUrl;
      canonicalAuthType = catalogConnectionPolicy.authType;
      appName = normalizeString(catalogConnectionPolicy.name, 160) || appName;
    } else {
      catalogConnectionPolicyCode = catalogConnectionPolicy.code;
      appendCatalogConnectionPolicyReason(
        blockedReasons,
        catalogConnectionPolicy.code,
      );
    }
    if (!hasExplicitDiscoverAppIntegrationProfile(catalogApp)) {
      appendReason(blockedReasons, "explicit_integration_profile_required");
    }
    const profile = resolveDiscoverAppIntegrationProfile(catalogApp);
    if (
      !isRemoteMcpAdapter(profile.adapterKind) ||
      !isReadyRemoteMcpProfile(profile.readiness)
    ) {
      appendReason(blockedReasons, "ready_remote_mcp_profile_required");
    }
    if (resolveDiscoverAppExecutionSurface(profile) !== "server_http") {
      appendReason(blockedReasons, "server_http_execution_surface_required");
    }
    if (getDiscoverAppDisabledToolReason(catalogAppId, toolName)) {
      appendReason(blockedReasons, "catalog_tool_policy_disabled");
    }
  }

  return {
    status: blockedReasons.length === 0 ? "eligible" : "blocked",
    mount_id: normalizeString(tool.mount_id, 240),
    runtime_tool_name: runtimeToolName,
    developer_app_id: developerAppId,
    catalog_app_id: catalogAppId,
    app_name: appName,
    endpoint_url: canonicalEndpointUrl,
    endpoint_url_sha256: canonicalEndpointUrl
      ? await sha256Hex(canonicalEndpointUrl)
      : "",
    auth_type: canonicalAuthType,
    tool_name: toolName,
    namespaced_tool_name: normalizeString(tool.namespaced_tool_name, 240),
    risk_level: tool.risk_level,
    scope: tool.scope,
    blocked_reasons: blockedReasons,
    catalog_connection_policy_code: catalogConnectionPolicyCode,
  };
}

function buildServerKey(tool: CodexMcpProjectedTool): string {
  return [
    "catalog",
    tool.catalog_app_id ?? "unknown",
    "developer",
    tool.developer_app_id,
    "endpoint",
    tool.endpoint_url_sha256,
    "auth",
    tool.auth_type,
  ].join(":");
}

export async function buildCodexMcpProjection(params: {
  mountedTools: readonly CodexMcpProjectionMountedTool[];
}): Promise<CodexMcpProjection> {
  const tools = (
    await Promise.all(params.mountedTools.map((tool) => projectTool(tool)))
  ).sort((left, right) =>
    `${left.status}:${left.runtime_tool_name}`.localeCompare(
      `${right.status}:${right.runtime_tool_name}`,
    ),
  );
  const serverByKey = new Map<string, CodexMcpProjectedServer>();
  for (const tool of tools) {
    if (tool.status !== "eligible" || !tool.catalog_app_id) continue;
    const serverKey = buildServerKey(tool);
    const existing = serverByKey.get(serverKey) ?? {
      server_key: serverKey,
      transport: "streamable_http" as const,
      developer_app_id: tool.developer_app_id,
      catalog_app_id: tool.catalog_app_id,
      app_name: tool.app_name,
      endpoint_url: tool.endpoint_url,
      endpoint_url_sha256: tool.endpoint_url_sha256,
      auth_type: tool.auth_type,
      runtime_tool_names: [],
    };
    existing.runtime_tool_names.push(tool.runtime_tool_name);
    existing.runtime_tool_names = [...new Set(existing.runtime_tool_names)].sort();
    serverByKey.set(serverKey, existing);
  }
  const servers = [...serverByKey.values()].sort((left, right) =>
    left.server_key.localeCompare(right.server_key),
  );
  const fingerprint = await sha256Hex(
    stableJson({
      version: CODEX_MCP_PROJECTION_VERSION,
      mode: CODEX_MCP_PROJECTION_MODE,
      servers,
      tools: tools.map((tool) => ({
        status: tool.status,
        mount_id: tool.mount_id,
        runtime_tool_name: tool.runtime_tool_name,
        developer_app_id: tool.developer_app_id,
        catalog_app_id: tool.catalog_app_id,
        endpoint_url: tool.endpoint_url,
        auth_type: tool.auth_type,
        tool_name: tool.tool_name,
        namespaced_tool_name: tool.namespaced_tool_name,
        risk_level: tool.risk_level,
        scope: tool.scope,
        blocked_reasons: tool.blocked_reasons,
        catalog_connection_policy_code: tool.catalog_connection_policy_code,
      })),
    }),
  );
  return {
    version: CODEX_MCP_PROJECTION_VERSION,
    mode: CODEX_MCP_PROJECTION_MODE,
    fingerprint,
    eligible_tool_count: tools.filter((tool) => tool.status === "eligible").length,
    blocked_tool_count: tools.filter((tool) => tool.status === "blocked").length,
    server_count: servers.length,
    servers,
    tools,
  };
}

export function buildCodexMcpProjectionAuditPayload(
  projection: CodexMcpProjection,
): Record<string, unknown> {
  return {
    version: projection.version,
    mode: projection.mode,
    fingerprint: projection.fingerprint,
    eligible_tool_count: projection.eligible_tool_count,
    blocked_tool_count: projection.blocked_tool_count,
    server_count: projection.server_count,
    eligible_runtime_tool_names: projection.tools
      .filter((tool) => tool.status === "eligible")
      .map((tool) => tool.runtime_tool_name),
    blocked_tools: projection.tools
      .filter((tool) => tool.status === "blocked")
      .map((tool) => ({
        runtime_tool_name: tool.runtime_tool_name,
        catalog_app_id: tool.catalog_app_id,
        app_name: tool.app_name,
        scope: tool.scope,
        risk_level: tool.risk_level,
        blocked_reasons: tool.blocked_reasons,
        catalog_connection_policy_code: tool.catalog_connection_policy_code,
      })),
    servers: projection.servers.map((server) => ({
      server_key: server.server_key,
      developer_app_id: server.developer_app_id,
      catalog_app_id: server.catalog_app_id,
      app_name: server.app_name,
      auth_type: server.auth_type,
      endpoint_url_sha256: server.endpoint_url_sha256,
      tool_count: server.runtime_tool_names.length,
      runtime_tool_names: server.runtime_tool_names,
    })),
  };
}

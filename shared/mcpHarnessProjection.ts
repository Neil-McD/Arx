import {
  buildMcpAppIdentityAliases,
  type EffectiveMcpApp,
  type McpAppIdentitySource,
} from "./effectiveMcpApps.ts";

export type McpHarnessProjectionSourceLabel =
  | "personal"
  | "community"
  | "personal_plus_community";

export type PolynetMcpHarnessToolSelector = {
  scope: "user";
  source_mount_id: string;
  runtime_tool_name: string;
  catalog_app_id: string | null;
  app_name: string;
  endpoint_url: string;
  auth_type: string;
  tool_name: string;
  namespaced_tool_name: string;
  description: string | null;
  input_schema: unknown;
  risk_level: "read" | "write" | "sensitive";
  app_identity_key: string;
  source_label: McpHarnessProjectionSourceLabel;
};

export type McpHarnessRuntimeMountedTool = {
  scope: "user" | "community";
  mount_id: string;
  runtime_tool_name: string;
  developer_app_id: string | null;
  catalog_app_id: string | null;
  app_name: string;
  endpoint_url: string;
  auth_type: string;
  tool_name: string;
  namespaced_tool_name: string;
  description: string | null;
  input_schema: unknown;
  risk_level: "read" | "write" | "sensitive";
};

export type CodexMcpHarnessBridgeTool = {
  bridge_tool_name: string;
  runtime_tool_name: string;
  connector_name: string;
  app_identity_key: string;
  catalog_app_id: string | null;
  tool_name: string;
  namespaced_tool_name: string;
  description: string | null;
  input_schema: unknown;
  risk_level: "read" | "write" | "sensitive";
  source_label: McpHarnessProjectionSourceLabel;
  execution: {
    mode: "polynet_runtime_mcp_manager";
    credential_owner: "user";
    credential_boundary: "server_only";
  };
};

export type McpHarnessSetupPacketHint = {
  app_identity_key: string;
  app_name: string;
  catalog_app_id: string | null;
  credential_state: EffectiveMcpApp["credential_state"];
  setup_reason: string | null;
  primary_action: EffectiveMcpApp["primary_action"];
  source_label: McpHarnessProjectionSourceLabel;
};

export type McpHarnessCapabilityProjection = {
  app_identity_key: string;
  app_name: string;
  catalog_app_id: string | null;
  live_for_current_user: boolean;
  source_label: McpHarnessProjectionSourceLabel;
  effective_tool_count: number;
  polynet_tool_count: number;
  codex_bridge_tool_count: number;
};

export type McpHarnessProjection = {
  capabilities: McpHarnessCapabilityProjection[];
  polynetMountedTools: PolynetMcpHarnessToolSelector[];
  codexBridgeTools: CodexMcpHarnessBridgeTool[];
  setupPacketHints: McpHarnessSetupPacketHint[];
};

export type McpHarnessProjectionInput = {
  effectiveApps: readonly EffectiveMcpApp[];
  runtimeMountedTools: readonly McpHarnessRuntimeMountedTool[];
};

type EffectiveAppIndexEntry = {
  app: EffectiveMcpApp;
  sourceLabel: McpHarnessProjectionSourceLabel;
};

type RuntimeToolProjectionCandidate = {
  app: EffectiveMcpApp;
  sourceLabel: McpHarnessProjectionSourceLabel;
  tool: McpHarnessRuntimeMountedTool;
};

function sourceLabelForEffectiveApp(
  app: EffectiveMcpApp,
): McpHarnessProjectionSourceLabel {
  if (app.personal_mount && app.community_mount) return "personal_plus_community";
  if (app.personal_mount) return "personal";
  return "community";
}

function normalizeBridgeToolNamePart(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "tool";
}

function buildCodexBridgeToolBaseName(tool: McpHarnessRuntimeMountedTool): string {
  const appPart = normalizeBridgeToolNamePart(tool.catalog_app_id ?? tool.app_name);
  const toolPart = normalizeBridgeToolNamePart(
    tool.tool_name || tool.namespaced_tool_name || tool.runtime_tool_name,
  );
  return `polynet_mcp__${appPart}__${toolPart}`;
}

function stableBridgeToolSuffix(tool: McpHarnessRuntimeMountedTool): string {
  const value = `${tool.scope}:${tool.mount_id}:${tool.runtime_tool_name}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function buildCodexBridgeToolName(params: {
  tool: McpHarnessRuntimeMountedTool;
  baseNameCounts: ReadonlyMap<string, number>;
  usedBridgeNames: Set<string>;
}): string {
  const baseName = buildCodexBridgeToolBaseName(params.tool);
  const needsSuffix = (params.baseNameCounts.get(baseName) ?? 0) > 1;
  const suffix = stableBridgeToolSuffix(params.tool);
  let candidate = needsSuffix ? `${baseName}__${suffix}` : baseName;
  let collisionIndex = 2;
  while (params.usedBridgeNames.has(candidate)) {
    candidate = `${baseName}__${suffix}_${collisionIndex}`;
    collisionIndex += 1;
  }
  params.usedBridgeNames.add(candidate);
  return candidate;
}

function isRuntimeToolEnabledForEffectiveApp(
  app: EffectiveMcpApp,
  tool: McpHarnessRuntimeMountedTool,
): boolean {
  const enabled = new Set(app.effective_enabled_tools);
  if (enabled.size === 0) return false;
  return enabled.has(tool.tool_name) || enabled.has(tool.namespaced_tool_name);
}

function identitySourceForEffectiveApp(app: EffectiveMcpApp): McpAppIdentitySource {
  return {
    id:
      app.personal_mount?.source_mount_id ??
      app.community_mount?.source_mount_id ??
      app.app_identity_key,
    app: app.app,
  };
}

function identitySourceForRuntimeTool(
  tool: McpHarnessRuntimeMountedTool,
): McpAppIdentitySource {
  return {
    id: tool.developer_app_id ?? tool.mount_id,
    app: {
      catalog_app_id: tool.catalog_app_id,
      endpoint_url: tool.endpoint_url,
      auth_type: tool.auth_type,
      name: tool.app_name,
    },
  };
}

function buildEffectiveAppIndex(
  effectiveApps: readonly EffectiveMcpApp[],
): Map<string, EffectiveAppIndexEntry> {
  const index = new Map<string, EffectiveAppIndexEntry>();
  for (const app of effectiveApps) {
    const entry = {
      app,
      sourceLabel: sourceLabelForEffectiveApp(app),
    };
    for (const alias of buildMcpAppIdentityAliases(identitySourceForEffectiveApp(app))) {
      index.set(alias, entry);
    }
  }
  return index;
}

function resolveEffectiveAppForRuntimeTool(
  tool: McpHarnessRuntimeMountedTool,
  index: ReadonlyMap<string, EffectiveAppIndexEntry>,
): EffectiveAppIndexEntry | null {
  for (const alias of buildMcpAppIdentityAliases(identitySourceForRuntimeTool(tool))) {
    const entry = index.get(alias);
    if (entry) return entry;
  }
  return null;
}

function canProjectRuntimeTool(candidate: RuntimeToolProjectionCandidate): boolean {
  const { app, tool } = candidate;
  if (tool.scope !== "user") return false;
  if (!app.live_for_current_user) return false;
  if (app.personal_mount?.live_status !== "live") return false;
  if (app.personal_mount.source_mount_id !== tool.mount_id) return false;
  return isRuntimeToolEnabledForEffectiveApp(app, tool);
}

function projectPolynetTool(params: {
  app: EffectiveMcpApp;
  tool: McpHarnessRuntimeMountedTool;
  sourceLabel: McpHarnessProjectionSourceLabel;
}): PolynetMcpHarnessToolSelector {
  return {
    scope: "user",
    source_mount_id: params.tool.mount_id,
    runtime_tool_name: params.tool.runtime_tool_name,
    catalog_app_id: params.tool.catalog_app_id,
    app_name: params.tool.app_name,
    endpoint_url: params.tool.endpoint_url,
    auth_type: params.tool.auth_type,
    tool_name: params.tool.tool_name,
    namespaced_tool_name: params.tool.namespaced_tool_name,
    description: params.tool.description,
    input_schema: params.tool.input_schema,
    risk_level: params.tool.risk_level,
    app_identity_key: params.app.app_identity_key,
    source_label: params.sourceLabel,
  };
}

function projectCodexBridgeTool(params: {
  app: EffectiveMcpApp;
  bridgeToolName: string;
  tool: McpHarnessRuntimeMountedTool;
  sourceLabel: McpHarnessProjectionSourceLabel;
}): CodexMcpHarnessBridgeTool {
  return {
    bridge_tool_name: params.bridgeToolName,
    runtime_tool_name: params.tool.runtime_tool_name,
    connector_name: params.tool.app_name,
    app_identity_key: params.app.app_identity_key,
    catalog_app_id: params.tool.catalog_app_id,
    tool_name: params.tool.tool_name,
    namespaced_tool_name: params.tool.namespaced_tool_name,
    description: params.tool.description,
    input_schema: params.tool.input_schema,
    risk_level: params.tool.risk_level,
    source_label: params.sourceLabel,
    execution: {
      mode: "polynet_runtime_mcp_manager",
      credential_owner: "user",
      credential_boundary: "server_only",
    },
  };
}

function compareProjectedToolNames(
  left: { runtime_tool_name: string },
  right: { runtime_tool_name: string },
): number {
  return left.runtime_tool_name.localeCompare(right.runtime_tool_name);
}

function compareRuntimeToolCandidates(
  left: RuntimeToolProjectionCandidate,
  right: RuntimeToolProjectionCandidate,
): number {
  return (
    left.tool.runtime_tool_name.localeCompare(right.tool.runtime_tool_name) ||
    left.tool.mount_id.localeCompare(right.tool.mount_id)
  );
}

export function buildMcpHarnessProjection(
  input: McpHarnessProjectionInput,
): McpHarnessProjection {
  const { effectiveApps, runtimeMountedTools } = input;
  const capabilities: McpHarnessCapabilityProjection[] = [];
  const polynetMountedTools: PolynetMcpHarnessToolSelector[] = [];
  const codexBridgeTools: CodexMcpHarnessBridgeTool[] = [];
  const setupPacketHints: McpHarnessSetupPacketHint[] = [];
  const effectiveAppIndex = buildEffectiveAppIndex(effectiveApps);
  const runtimeToolCandidates = runtimeMountedTools
    .map((tool): RuntimeToolProjectionCandidate | null => {
      const entry = resolveEffectiveAppForRuntimeTool(tool, effectiveAppIndex);
      if (!entry) return null;
      return {
        app: entry.app,
        sourceLabel: entry.sourceLabel,
        tool,
      };
    })
    .filter((candidate): candidate is RuntimeToolProjectionCandidate =>
      Boolean(candidate),
    )
    .filter(canProjectRuntimeTool)
    .sort(compareRuntimeToolCandidates);
  const baseNameCounts = new Map<string, number>();
  for (const candidate of runtimeToolCandidates) {
    const baseName = buildCodexBridgeToolBaseName(candidate.tool);
    baseNameCounts.set(baseName, (baseNameCounts.get(baseName) ?? 0) + 1);
  }
  const usedBridgeNames = new Set<string>();
  const toolCountsByAppIdentityKey = new Map<
    string,
    { polynet: number; codex: number }
  >();

  for (const candidate of runtimeToolCandidates) {
    polynetMountedTools.push(
      projectPolynetTool({
        app: candidate.app,
        tool: candidate.tool,
        sourceLabel: candidate.sourceLabel,
      }),
    );
    codexBridgeTools.push(
      projectCodexBridgeTool({
        app: candidate.app,
        bridgeToolName: buildCodexBridgeToolName({
          tool: candidate.tool,
          baseNameCounts,
          usedBridgeNames,
        }),
        tool: candidate.tool,
        sourceLabel: candidate.sourceLabel,
      }),
    );
    const counts =
      toolCountsByAppIdentityKey.get(candidate.app.app_identity_key) ??
      { polynet: 0, codex: 0 };
    counts.polynet += 1;
    counts.codex += 1;
    toolCountsByAppIdentityKey.set(candidate.app.app_identity_key, counts);
  }

  for (const app of effectiveApps) {
    const sourceLabel = sourceLabelForEffectiveApp(app);
    const canProjectRuntimeTools =
      app.live_for_current_user && app.personal_mount?.live_status === "live";
    const counts = toolCountsByAppIdentityKey.get(app.app_identity_key);

    capabilities.push({
      app_identity_key: app.app_identity_key,
      app_name: app.app.name,
      catalog_app_id: app.app.catalog_app_id,
      live_for_current_user: app.live_for_current_user,
      source_label: sourceLabel,
      effective_tool_count: app.effective_tool_count,
      polynet_tool_count: counts?.polynet ?? 0,
      codex_bridge_tool_count: counts?.codex ?? 0,
    });

    if (!canProjectRuntimeTools) {
      setupPacketHints.push({
        app_identity_key: app.app_identity_key,
        app_name: app.app.name,
        catalog_app_id: app.app.catalog_app_id,
        credential_state: app.credential_state,
        setup_reason: app.setup_reason,
        primary_action: app.primary_action,
        source_label: sourceLabel,
      });
    }
  }

  return {
    capabilities: capabilities.sort((left, right) =>
      left.app_identity_key.localeCompare(right.app_identity_key),
    ),
    polynetMountedTools: polynetMountedTools.sort(compareProjectedToolNames),
    codexBridgeTools: codexBridgeTools.sort(compareProjectedToolNames),
    setupPacketHints: setupPacketHints.sort((left, right) =>
      left.app_identity_key.localeCompare(right.app_identity_key),
    ),
  };
}

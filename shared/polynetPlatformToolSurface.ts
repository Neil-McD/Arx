import { getToolDefinition } from "./toolRegistry";
import type { RetrievalToolName } from "./retrievalTools";

// Codex receives only PolyNet-native capabilities through the first-party
// polynet.* bridge. Generic workspace, terminal, browser, and web-search tools
// stay native to Codex so we do not expose duplicate tool surfaces. The only
// write-risk tool projected today stages a builder changeset; applying live
// changes remains outside this bridge.
export type PolynetPlatformToolBillingPolicy = "free";
export type PolynetPlatformToolRiskLevel = "read" | "write" | "sensitive";
export type PolynetPlatformToolRequiredCommunityResourceLane =
  | "none"
  | "member"
  | "builder";

export type PolynetPlatformToolSurfaceEntry = {
  toolName: RetrievalToolName;
  billingPolicy: PolynetPlatformToolBillingPolicy;
  requiresCommunity: boolean;
  riskLevel: PolynetPlatformToolRiskLevel;
  requiredCommunityResourceLane: PolynetPlatformToolRequiredCommunityResourceLane;
};

export const POLYNET_PLATFORM_TOOL_SURFACE: readonly PolynetPlatformToolSurfaceEntry[] = [
  {
    toolName: "get_active_community_context",
    billingPolicy: "free",
    requiresCommunity: true,
    riskLevel: "read",
    requiredCommunityResourceLane: "member",
  },
  {
    toolName: "community_search",
    billingPolicy: "free",
    requiresCommunity: true,
    riskLevel: "read",
    requiredCommunityResourceLane: "member",
  },
  {
    toolName: "community_resources_map",
    billingPolicy: "free",
    requiresCommunity: true,
    riskLevel: "read",
    requiredCommunityResourceLane: "member",
  },
  {
    toolName: "community_resources_read",
    billingPolicy: "free",
    requiresCommunity: true,
    riskLevel: "read",
    requiredCommunityResourceLane: "member",
  },
  {
    toolName: "community_resources_list",
    billingPolicy: "free",
    requiresCommunity: true,
    riskLevel: "read",
    requiredCommunityResourceLane: "member",
  },
  {
    toolName: "community_resource_read",
    billingPolicy: "free",
    requiresCommunity: true,
    riskLevel: "read",
    requiredCommunityResourceLane: "member",
  },
  {
    toolName: "community_resources_search",
    billingPolicy: "free",
    requiresCommunity: true,
    riskLevel: "read",
    requiredCommunityResourceLane: "member",
  },
  {
    toolName: "community_resource_builder_list",
    billingPolicy: "free",
    requiresCommunity: true,
    riskLevel: "read",
    requiredCommunityResourceLane: "builder",
  },
  {
    toolName: "community_resource_builder_read",
    billingPolicy: "free",
    requiresCommunity: true,
    riskLevel: "read",
    requiredCommunityResourceLane: "builder",
  },
  {
    toolName: "community_resource_builder_stage_changeset",
    billingPolicy: "free",
    requiresCommunity: true,
    riskLevel: "write",
    requiredCommunityResourceLane: "builder",
  },
  {
    toolName: "search_product_docs",
    billingPolicy: "free",
    requiresCommunity: false,
    riskLevel: "read",
    requiredCommunityResourceLane: "none",
  },
  {
    toolName: "get_product_doc",
    billingPolicy: "free",
    requiresCommunity: false,
    riskLevel: "read",
    requiredCommunityResourceLane: "none",
  },
];

export type PolynetPlatformToolSpec = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  billing_policy: PolynetPlatformToolBillingPolicy;
  risk_level: PolynetPlatformToolRiskLevel;
  required_community_resource_lane: PolynetPlatformToolRequiredCommunityResourceLane;
};

export function findPolynetPlatformToolSurfaceEntry(
  name: string,
): PolynetPlatformToolSurfaceEntry | null {
  // The wire carries namespace and tool name separately; this always receives
  // the bare tool name.
  return POLYNET_PLATFORM_TOOL_SURFACE.find((entry) => entry.toolName === name) ?? null;
}

function buildSpecs(params: { hasCommunity: boolean }): PolynetPlatformToolSpec[] {
  return POLYNET_PLATFORM_TOOL_SURFACE.filter(
    (entry) => params.hasCommunity || !entry.requiresCommunity,
  ).map((entry) => {
    const definition = getToolDefinition(entry.toolName);
    if (!definition) {
      // Fails the Convex push / worker boot, so a surface row naming an
      // unregistered tool can never reach a live turn.
      throw new Error(
        `polynet platform tool surface names an unregistered tool: ${entry.toolName}`,
      );
    }
    return {
      name: definition.name,
      description: definition.description,
      input_schema: definition.inputSchema as Record<string, unknown>,
      billing_policy: entry.billingPolicy,
      risk_level: entry.riskLevel,
      required_community_resource_lane: entry.requiredCommunityResourceLane,
    };
  });
}

// Precomputed at module load — this is also the registration guard above
// running once per deploy instead of per turn.
const SPECS_WITH_COMMUNITY = buildSpecs({ hasCommunity: true });
const SPECS_WITHOUT_COMMUNITY = buildSpecs({ hasCommunity: false });

export function buildPolynetPlatformToolSpecs(params: {
  hasCommunity: boolean;
}): PolynetPlatformToolSpec[] {
  return params.hasCommunity ? SPECS_WITH_COMMUNITY : SPECS_WITHOUT_COMMUNITY;
}

export function buildPolynetPlatformToolNames(params: {
  hasCommunity: boolean;
}): RetrievalToolName[] {
  return POLYNET_PLATFORM_TOOL_SURFACE.filter(
    (entry) => params.hasCommunity || !entry.requiresCommunity,
  ).map((entry) => entry.toolName);
}

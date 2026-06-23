import { getToolDefinition } from "./toolRegistry.ts";
import type { RetrievalToolName } from "./retrievalTools.ts";
import {
  normalizeCommunityResourceRuntimeLaneState,
  type CommunityResourceRuntimeLaneState,
} from "./communityResourceLane.ts";

export type PolynetPlatformToolBillingPolicy = "free";
export type PolynetPlatformToolRiskLevel = "read" | "write" | "sensitive";
export type PolynetPlatformToolRequiredCommunityResourceLane =
  | "none"
  | "member"
  | "builder";
export type PolynetPlatformToolRequiredCommunityAuthority =
  | "none"
  | "member"
  | "moderator"
  | "admin";

export type PolynetPlatformToolSurfaceEntry = {
  toolName: RetrievalToolName;
  billingPolicy: PolynetPlatformToolBillingPolicy;
  requiresCommunity: boolean;
  riskLevel: PolynetPlatformToolRiskLevel;
  requiredCommunityResourceLane: PolynetPlatformToolRequiredCommunityResourceLane;
  requiredCommunityAuthority: PolynetPlatformToolRequiredCommunityAuthority;
};

export const POLYNET_PLATFORM_TOOL_SURFACE: readonly PolynetPlatformToolSurfaceEntry[] = [
  {
    toolName: "get_active_community_context",
    billingPolicy: "free",
    requiresCommunity: true,
    riskLevel: "read",
    requiredCommunityResourceLane: "member",
    requiredCommunityAuthority: "member",
  },
  {
    toolName: "community_search",
    billingPolicy: "free",
    requiresCommunity: true,
    riskLevel: "read",
    requiredCommunityResourceLane: "member",
    requiredCommunityAuthority: "member",
  },
  {
    toolName: "community_resources_map",
    billingPolicy: "free",
    requiresCommunity: true,
    riskLevel: "read",
    requiredCommunityResourceLane: "member",
    requiredCommunityAuthority: "member",
  },
  {
    toolName: "community_resources_read",
    billingPolicy: "free",
    requiresCommunity: true,
    riskLevel: "read",
    requiredCommunityResourceLane: "member",
    requiredCommunityAuthority: "member",
  },
  {
    toolName: "community_resources_list",
    billingPolicy: "free",
    requiresCommunity: true,
    riskLevel: "read",
    requiredCommunityResourceLane: "member",
    requiredCommunityAuthority: "member",
  },
  {
    toolName: "community_resource_read",
    billingPolicy: "free",
    requiresCommunity: true,
    riskLevel: "read",
    requiredCommunityResourceLane: "member",
    requiredCommunityAuthority: "member",
  },
  {
    toolName: "community_resources_search",
    billingPolicy: "free",
    requiresCommunity: true,
    riskLevel: "read",
    requiredCommunityResourceLane: "member",
    requiredCommunityAuthority: "member",
  },
  {
    toolName: "community_resource_builder_list",
    billingPolicy: "free",
    requiresCommunity: true,
    riskLevel: "read",
    requiredCommunityResourceLane: "builder",
    requiredCommunityAuthority: "member",
  },
  {
    toolName: "community_resource_builder_read",
    billingPolicy: "free",
    requiresCommunity: true,
    riskLevel: "read",
    requiredCommunityResourceLane: "builder",
    requiredCommunityAuthority: "member",
  },
  {
    toolName: "community_resource_builder_stage_changeset",
    billingPolicy: "free",
    requiresCommunity: true,
    riskLevel: "write",
    requiredCommunityResourceLane: "builder",
    requiredCommunityAuthority: "member",
  },
  {
    toolName: "community_write",
    billingPolicy: "free",
    requiresCommunity: true,
    riskLevel: "write",
    requiredCommunityResourceLane: "member",
    requiredCommunityAuthority: "moderator",
  },
  {
    toolName: "search_product_docs",
    billingPolicy: "free",
    requiresCommunity: false,
    riskLevel: "read",
    requiredCommunityResourceLane: "none",
    requiredCommunityAuthority: "none",
  },
  {
    toolName: "get_product_doc",
    billingPolicy: "free",
    requiresCommunity: false,
    riskLevel: "read",
    requiredCommunityResourceLane: "none",
    requiredCommunityAuthority: "none",
  },
];

export type PolynetPlatformToolSpec = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  billing_policy: PolynetPlatformToolBillingPolicy;
  risk_level: PolynetPlatformToolRiskLevel;
  required_community_resource_lane: PolynetPlatformToolRequiredCommunityResourceLane;
  required_community_authority: PolynetPlatformToolRequiredCommunityAuthority;
};

export type PolynetPlatformToolProjectionParams = {
  hasCommunity: boolean;
  communityResourceLane?: CommunityResourceRuntimeLaneState | null;
  canModerateCommunity?: boolean | null;
  canManageCommunity?: boolean | null;
  canManageResources?: boolean | null;
};

function communityAuthorityAllowsRequiredAuthority(
  params: PolynetPlatformToolProjectionParams,
  requiredAuthority: PolynetPlatformToolRequiredCommunityAuthority,
): boolean {
  if (requiredAuthority === "none") return true;
  if (!params.hasCommunity) return false;
  if (requiredAuthority === "member") return true;
  if (requiredAuthority === "moderator") {
    return params.canModerateCommunity === true || params.canManageCommunity === true;
  }
  return params.canManageCommunity === true;
}

export function findPolynetPlatformToolSurfaceEntry(
  name: string,
): PolynetPlatformToolSurfaceEntry | null {
  return POLYNET_PLATFORM_TOOL_SURFACE.find((entry) => entry.toolName === name) ?? null;
}

export function canProjectPolynetPlatformTool(
  entry: PolynetPlatformToolSurfaceEntry,
  params: PolynetPlatformToolProjectionParams,
): boolean {
  if (entry.requiresCommunity && !params.hasCommunity) return false;
  if (!communityAuthorityAllowsRequiredAuthority(params, entry.requiredCommunityAuthority)) {
    return false;
  }
  if (entry.requiredCommunityResourceLane === "none") return true;

  const lane = params.hasCommunity
    ? normalizeCommunityResourceRuntimeLaneState(params.communityResourceLane)
    : normalizeCommunityResourceRuntimeLaneState(null);
  if (entry.requiredCommunityResourceLane === "member") {
    return lane.lane === "member" || lane.lane === "builder";
  }
  if (entry.requiredCommunityResourceLane === "builder") {
    return (
      lane.lane === "builder" &&
      (lane.can_use_resource_builder === true || params.canManageResources === true)
    );
  }
  return false;
}

function buildToolSpecForSurfaceEntry(
  entry: PolynetPlatformToolSurfaceEntry,
): PolynetPlatformToolSpec {
  const definition = getToolDefinition(entry.toolName);
  if (!definition) {
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
    required_community_authority: entry.requiredCommunityAuthority,
  };
}

POLYNET_PLATFORM_TOOL_SURFACE.forEach(buildToolSpecForSurfaceEntry);

export function buildPolynetPlatformToolSpecs(
  params: PolynetPlatformToolProjectionParams,
): PolynetPlatformToolSpec[] {
  return POLYNET_PLATFORM_TOOL_SURFACE.filter((entry) =>
    canProjectPolynetPlatformTool(entry, params),
  ).map(buildToolSpecForSurfaceEntry);
}

export function buildPolynetPlatformToolNames(
  params: PolynetPlatformToolProjectionParams,
): RetrievalToolName[] {
  return POLYNET_PLATFORM_TOOL_SURFACE.filter((entry) =>
    canProjectPolynetPlatformTool(entry, params),
  ).map((entry) => entry.toolName);
}

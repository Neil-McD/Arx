import { getToolDefinition } from "./toolRegistry.ts";
import type { RetrievalToolName } from "./retrievalTools.ts";
import {
  normalizeCommunityResourceRuntimeLaneState,
  type CommunityResourceRuntimeLaneState,
} from "./communityResourceLane.ts";
import {
  normalizeCommunityLensAuthority,
  type CommunityLensAuthority,
} from "./communityLensAuthority.ts";

// Codex receives only PolyNet-native capabilities through the first-party
// polynet.* bridge. Generic workspace, terminal, browser, and web-search tools
// stay native to Codex so we do not expose duplicate tool surfaces. The write
// surface stays narrow: Codex can stage builder resource changesets and publish
// moderator-gated community posts. Applying resource changes remains outside
// this bridge.
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
  | "admin"
  | "owner";

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
  communityLensAuthority?: CommunityLensAuthority | null;
};

function authorityRoleRank(value: unknown): number {
  const role = String(value ?? "").trim().toLowerCase();
  if (role === "owner") return 4;
  if (role === "admin") return 3;
  if (role === "moderator") return 2;
  if (role === "member") return 1;
  return 0;
}

function communityAuthorityAllowsRequiredAuthority(
  authority: CommunityLensAuthority | null,
  requiredAuthority: PolynetPlatformToolRequiredCommunityAuthority,
): boolean {
  if (requiredAuthority === "none") return true;
  if (!authority) return false;
  const rank = Math.max(
    authorityRoleRank(authority.effectiveRole),
    authorityRoleRank(authority.relation),
  );
  if (requiredAuthority === "member") return rank >= 1;
  if (requiredAuthority === "moderator") {
    return rank >= 2 || authority.canModerate;
  }
  if (requiredAuthority === "admin") {
    return rank >= 3 || authority.canManage;
  }
  return rank >= 4 || authority.relation === "owner" || authority.effectiveRole === "owner";
}

export function findPolynetPlatformToolSurfaceEntry(
  name: string,
): PolynetPlatformToolSurfaceEntry | null {
  // The wire carries namespace and tool name separately; this always receives
  // the bare tool name.
  return POLYNET_PLATFORM_TOOL_SURFACE.find((entry) => entry.toolName === name) ?? null;
}

export function canProjectPolynetPlatformTool(
  entry: PolynetPlatformToolSurfaceEntry,
  params: PolynetPlatformToolProjectionParams,
): boolean {
  if (entry.requiresCommunity && !params.hasCommunity) return false;
  const authority = normalizeCommunityLensAuthority(params.communityLensAuthority);
  if (
    !communityAuthorityAllowsRequiredAuthority(
      authority,
      entry.requiredCommunityAuthority,
    )
  ) {
    return false;
  }
  if (entry.requiredCommunityResourceLane === "none") return true;

  const lane = params.hasCommunity
    ? normalizeCommunityResourceRuntimeLaneState(params.communityResourceLane).lane
    : "none";
  if (entry.requiredCommunityResourceLane === "member") {
    return lane === "member" || lane === "builder";
  }
  if (entry.requiredCommunityResourceLane === "builder") {
    return lane === "builder" && authority?.canManageResources === true;
  }
  return false;
}

function buildToolSpecForSurfaceEntry(
  entry: PolynetPlatformToolSurfaceEntry,
): PolynetPlatformToolSpec {
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
    required_community_authority: entry.requiredCommunityAuthority,
  };
}

POLYNET_PLATFORM_TOOL_SURFACE.forEach(buildToolSpecForSurfaceEntry);

function buildSpecs(
  params: PolynetPlatformToolProjectionParams,
): PolynetPlatformToolSpec[] {
  return POLYNET_PLATFORM_TOOL_SURFACE.filter((entry) =>
    canProjectPolynetPlatformTool(entry, params),
  ).map(buildToolSpecForSurfaceEntry);
}

export function buildPolynetPlatformToolSpecs(
  params: PolynetPlatformToolProjectionParams,
): PolynetPlatformToolSpec[] {
  return buildSpecs(params);
}

export function buildPolynetPlatformToolNames(
  params: PolynetPlatformToolProjectionParams,
): RetrievalToolName[] {
  return POLYNET_PLATFORM_TOOL_SURFACE.filter((entry) =>
    canProjectPolynetPlatformTool(entry, params),
  ).map((entry) => entry.toolName);
}

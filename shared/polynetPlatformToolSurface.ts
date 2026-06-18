import { getToolDefinition } from "./toolRegistry";
import type { RetrievalToolName } from "./retrievalTools";

// Slice 1 of the capability registry: read-only community lens + product
// docs, all free. Write tools, premium (usage-billed) tools, and dynamically
// mounted tools join in later slices; every entry carries a billing policy so
// activating a paid tool is a row change, not new architecture.
export type PolynetPlatformToolBillingPolicy = "free";

export type PolynetPlatformToolSurfaceEntry = {
  toolName: RetrievalToolName;
  billingPolicy: PolynetPlatformToolBillingPolicy;
  requiresCommunity: boolean;
};

export const POLYNET_PLATFORM_TOOL_SURFACE: readonly PolynetPlatformToolSurfaceEntry[] = [
  { toolName: "get_active_community_context", billingPolicy: "free", requiresCommunity: true },
  { toolName: "community_search", billingPolicy: "free", requiresCommunity: true },
  { toolName: "community_resources_map", billingPolicy: "free", requiresCommunity: true },
  { toolName: "community_resources_list", billingPolicy: "free", requiresCommunity: true },
  { toolName: "community_resource_read", billingPolicy: "free", requiresCommunity: true },
  { toolName: "community_resources_search", billingPolicy: "free", requiresCommunity: true },
  { toolName: "search_product_docs", billingPolicy: "free", requiresCommunity: false },
  { toolName: "get_product_doc", billingPolicy: "free", requiresCommunity: false },
];

export type PolynetPlatformToolSpec = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
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

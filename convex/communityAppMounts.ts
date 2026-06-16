import { internal } from "./_generated/api";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { v } from "convex/values";
import {
  type AppConnectionRow,
  type AppToolSnapshotRow,
  type DeveloperAppAuthType,
  type DeveloperAppRow,
  type DeveloperAppSetupStatus,
  mapAppConnectionReadModel,
  mapDeveloperAppReadModel,
  normalizeDeveloperAppEndpointUrl,
  normalizeString,
} from "./appCore";
import {
  normalizeStoredSnapshotTools,
} from "./mcpSnapshotCodec";
import {
  requireCommunityChatAccess,
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";
import {
  isDiscoverAppCatalogSingletonIdentity,
  resolveDiscoverAppCatalogConnectPolicy,
} from "../shared/discoverCatalog";
import {
  COMMUNITY_WORKFLOW_IMPORT_MCP_REGISTRY,
  findCommunityWorkflowImportMcpRegistryEntryById,
  resolveCommunityWorkflowImportMcpRegistryConnectPolicy,
  type CommunityWorkflowImportMcpRegistryEntry,
} from "../shared/communityWorkflowImportMcpRegistry";
import {
  compilePrivateCommunityPluginManifest,
  PRIVATE_COMMUNITY_PLUGIN_SCHEMA,
  type PrivateCommunityPluginMcpAppPlan,
} from "../shared/privateCommunityPluginManifest";

type CommunityAppMountRow = {
  _id: any;
  communityId: any;
  developerAppId: any;
  toolSnapshotId?: any;
  mountedByUserId: any;
  enabled: boolean;
  enabledTools?: string[];
  createdAt: number;
  updatedAt: number;
};

type CommunityAppGrantRecipientRow = {
  userId: any;
  active?: boolean;
  revokedAt?: number;
};

type CommunityRow = {
  _id: any;
  ownerId: any;
};

type CommunityAppMountLiveStatus = "live" | "not_live";

type CommunityAppMountNotLiveReason =
  | "disabled"
  | "needs_auth"
  | "needs_config"
  | "needs_runtime"
  | "validation_failed"
  | "no_tools_discovered"
  | "missing_snapshot";

type PrivateCommunityMcpAddStatus =
  | "ready"
  | "needs_auth"
  | "needs_config"
  | "not_available";

type PrivateCommunityMcpProductAddStatus =
  | "connected"
  | "staged"
  | "reused"
  | "rejected"
  | "failed";

type PrivateCommunityMcpProductSetupReason = "needs_auth" | "needs_config" | null;

function normalizeSetupStatus(value: unknown): DeveloperAppSetupStatus | null {
  if (
    value === "needs_auth" ||
    value === "needs_config" ||
    value === "needs_runtime"
  ) {
    return value;
  }
  return null;
}

function normalizeStringList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const values: string[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    const value = normalizeString(item, 200);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }
  return values;
}

function derivePrivateCommunityPluginMcpSetupStatus(
  appPlan: PrivateCommunityPluginMcpAppPlan,
): DeveloperAppSetupStatus | null {
  if (appPlan.authType !== "none") return "needs_auth";
  if (
    appPlan.setupKind === "needs_nonsecret_config" ||
    appPlan.registryStatus === "needs_config"
  ) {
    return "needs_config";
  }
  if (appPlan.setupKind === "needs_managed_runtime") return "needs_runtime";
  return null;
}

function summarizePrivateCommunityPluginMcpApplyResult(args: {
  appPlan: PrivateCommunityPluginMcpAppPlan;
  status: "staged" | "connected" | "reused";
  mount: unknown;
}) {
  const mountRecord =
    args.mount && typeof args.mount === "object" && !Array.isArray(args.mount)
      ? (args.mount as Record<string, unknown>)
      : {};
  return {
    source_index: args.appPlan.sourceIndex,
    status: args.status,
    mcp_registry_id: args.appPlan.mcpRegistryId,
    catalog_app_id: args.appPlan.catalogAppId,
    name: args.appPlan.name,
    endpoint_url: args.appPlan.endpointUrl,
    auth_type: args.appPlan.authType,
    setup_kind: args.appPlan.setupKind,
    community_app_mount_id:
      typeof mountRecord.id === "string" ? mountRecord.id : null,
    live_status:
      typeof mountRecord.live_status === "string" ? mountRecord.live_status : null,
    not_live_reason:
      typeof mountRecord.not_live_reason === "string"
        ? mountRecord.not_live_reason
        : null,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstRecordFromField(
  record: Record<string, unknown>,
  field: string,
): Record<string, unknown> | null {
  const value = record[field];
  if (!Array.isArray(value)) return null;
  const first = value[0];
  return first && typeof first === "object" && !Array.isArray(first)
    ? (first as Record<string, unknown>)
    : null;
}

function derivePrivateCommunityMcpProductSetupReason(
  item: Record<string, unknown> | null,
): PrivateCommunityMcpProductSetupReason {
  const notLiveReason = normalizeString(item?.not_live_reason, 80);
  if (notLiveReason === "needs_auth") return "needs_auth";
  if (notLiveReason === "needs_config") return "needs_config";

  const setupKind = normalizeString(item?.setup_kind, 80);
  if (setupKind === "needs_user_auth") return "needs_auth";
  if (setupKind === "needs_nonsecret_config") return "needs_config";
  return null;
}

function mapPrivateCommunityMcpProductAddResult(args: {
  mcpRegistryId: string;
  result: unknown;
}) {
  const result = asRecord(args.result);
  const registryEntry = findCommunityWorkflowImportMcpRegistryEntryById(
    args.mcpRegistryId,
  );
  const fallbackName =
    (registryEntry?.name ?? normalizeString(args.mcpRegistryId, 120)) || null;
  const rejection = firstRecordFromField(result, "rejections");
  const failure = firstRecordFromField(result, "failures");
  const connected = firstRecordFromField(result, "connected");
  const staged = firstRecordFromField(result, "staged");
  const reused = firstRecordFromField(result, "reused");
  const item = connected ?? staged ?? reused ?? failure;
  let status: PrivateCommunityMcpProductAddStatus = "failed";
  if (rejection) {
    status = "rejected";
  } else if (connected) {
    status = "connected";
  } else if (staged) {
    status = "staged";
  } else if (reused) {
    status = "reused";
  }

  const setupReason =
    status === "failed" || status === "rejected"
      ? null
      : derivePrivateCommunityMcpProductSetupReason(item);
  const errorMessage =
    normalizeString(rejection?.message, 500) ||
    normalizeString(failure?.error, 500) ||
    (status === "failed" ? "Private MCP could not be added." : null);

  return {
    ok: status !== "failed" && status !== "rejected",
    status,
    mcp_registry_id:
      normalizeString(item?.mcp_registry_id, 120) ||
      normalizeString(args.mcpRegistryId, 120) ||
      null,
    name: normalizeString(item?.name, 200) || fallbackName,
    community_app_mount_id:
      normalizeString(item?.community_app_mount_id, 120) || null,
    setup_required: setupReason !== null,
    setup_reason: setupReason,
    error_message: errorMessage,
  };
}

function buildPrivateCommunityMcpRegistryManifest(args: {
  mcpRegistryId: string;
}) {
  const registryEntry = findCommunityWorkflowImportMcpRegistryEntryById(
    args.mcpRegistryId,
  );
  const name =
    (registryEntry?.name ?? normalizeString(args.mcpRegistryId, 120)) ||
    "Private MCP";
  return {
    schema: PRIVATE_COMMUNITY_PLUGIN_SCHEMA,
    name: `${name} Private MCP`,
    visibility: "private_community",
    mcpServers: [{ mcpRegistryId: args.mcpRegistryId }],
  };
}

function mapPrivateCommunityMcpOption(
  entry: CommunityWorkflowImportMcpRegistryEntry,
) {
  if (entry.connectionClass !== "hosted_remote") return null;

  const defaultEndpointUrl = normalizeString(entry.defaultEndpointUrl, 500);
  const defaultAuthType = entry.defaultAuthType;
  const policy =
    defaultEndpointUrl && defaultAuthType
      ? resolveCommunityWorkflowImportMcpRegistryConnectPolicy({
          mcpRegistryId: entry.id,
          name: entry.name,
          endpointUrl: defaultEndpointUrl,
          authType: defaultAuthType,
        })
      : {
          ok: false as const,
          message: "This MCP does not have a reviewed hosted setup path yet.",
        };
  const addable = policy.ok === true;
  let addStatus: PrivateCommunityMcpAddStatus = "not_available";
  if (addable) {
    if (
      entry.setupKind === "needs_nonsecret_config" ||
      entry.status === "needs_config"
    ) {
      addStatus = "needs_config";
    } else if (
      entry.setupKind === "needs_user_auth" ||
      entry.status === "needs_auth" ||
      defaultAuthType !== "none"
    ) {
      addStatus = "needs_auth";
    } else {
      addStatus = "ready";
    }
  }

  return {
    mcp_registry_id: entry.id,
    catalog_app_id: entry.catalogAppId,
    name: entry.name,
    description: entry.reason,
    logo_url: entry.reviewLogoUrl,
    docs_urls: entry.docsUrls,
    add_status: addStatus,
    setup_kind: entry.setupKind,
    addable,
    add_blocked_reason: addable ? null : policy.message,
    requires_member_auth: addStatus === "needs_auth",
    requires_nonsecret_config: addStatus === "needs_config",
  };
}

function normalizeSnapshotTools(
  snapshot: AppToolSnapshotRow | null,
): Array<{
  tool_name: string;
  namespaced_tool_name: string;
  description: string | null;
  risk_level: "read" | "write" | "sensitive";
}> {
  return normalizeStoredSnapshotTools(snapshot?.toolsJson).map((tool) => ({
    tool_name: tool.tool_name,
    namespaced_tool_name: tool.namespaced_tool_name,
    description: tool.description,
    risk_level: tool.risk_level,
  }));
}

function computeSelectedToolNames(
  mount: CommunityAppMountRow,
  tools: Array<{ tool_name: string }>,
): string[] {
  const allToolNames = tools.map((tool) => tool.tool_name);
  if (!Array.isArray(mount.enabledTools)) return allToolNames;
  const enabled = normalizeStringList(mount.enabledTools);
  return enabled.filter((toolName) => allToolNames.includes(toolName));
}

function deriveCommunityMountLiveState(args: {
  mount: CommunityAppMountRow;
  app: DeveloperAppRow;
  connection: AppConnectionRow | null;
  snapshot: AppToolSnapshotRow | null;
  enabledTools: string[];
}): {
  live_status: CommunityAppMountLiveStatus;
  not_live_reason: CommunityAppMountNotLiveReason | null;
} {
  if (!args.mount.enabled) {
    return { live_status: "not_live", not_live_reason: "disabled" };
  }
  const setupStatus = normalizeSetupStatus(args.app.setupStatus);
  if (setupStatus === "needs_runtime") {
    return { live_status: "not_live", not_live_reason: "needs_runtime" };
  }
  if (setupStatus === "needs_config") {
    return { live_status: "not_live", not_live_reason: "needs_config" };
  }
  if (setupStatus === "needs_auth") {
    return { live_status: "not_live", not_live_reason: "needs_auth" };
  }
  if (
    args.app.authType !== "none" &&
    args.connection?.connectionStatus !== "connected"
  ) {
    return { live_status: "not_live", not_live_reason: "needs_auth" };
  }
  if (!args.snapshot) {
    return { live_status: "not_live", not_live_reason: "missing_snapshot" };
  }
  if (args.app.status !== "valid" || args.snapshot.validationStatus !== "ok") {
    return { live_status: "not_live", not_live_reason: "validation_failed" };
  }
  if (args.enabledTools.length === 0) {
    return { live_status: "not_live", not_live_reason: "no_tools_discovered" };
  }
  return { live_status: "live", not_live_reason: null };
}

function mapCommunityAppMountReadModel(args: {
  mount: CommunityAppMountRow;
  app: DeveloperAppRow;
  connection: AppConnectionRow | null;
  snapshot: AppToolSnapshotRow | null;
}) {
  const tools = normalizeSnapshotTools(args.snapshot);
  const selectedToolNames = new Set(computeSelectedToolNames(args.mount, tools));
  const enabledTools = Array.from(selectedToolNames);
  const liveState = deriveCommunityMountLiveState({
    mount: args.mount,
    app: args.app,
    connection: args.connection,
    snapshot: args.snapshot,
    enabledTools,
  });
  return {
    id: String(args.mount._id),
    enabled: args.mount.enabled === true,
    enabled_tools: enabledTools,
    ...liveState,
    app: mapDeveloperAppReadModel(args.app),
    connection: mapAppConnectionReadModel(args.app, args.connection),
    tools: tools.map((tool) => ({
      ...tool,
      enabled: selectedToolNames.has(tool.tool_name),
    })),
  };
}

async function getCommunityAppMountById(
  ctx: any,
  communityAppMountId: any,
): Promise<CommunityAppMountRow | null> {
  return ((await ctx.db.get(communityAppMountId)) as CommunityAppMountRow | null) ?? null;
}

async function getDeveloperAppById(ctx: any, developerAppId: any): Promise<DeveloperAppRow | null> {
  return ((await ctx.db.get(developerAppId)) as DeveloperAppRow | null) ?? null;
}

async function getAppConnectionByDeveloperAppId(
  ctx: any,
  developerAppId: any,
): Promise<AppConnectionRow | null> {
  return ((await ctx.db
    .query("appConnections")
    .withIndex("by_app", (q: any) => q.eq("developerAppId", developerAppId))
    .first()) as AppConnectionRow | null) ?? null;
}

async function getAppToolSnapshotById(
  ctx: any,
  toolSnapshotId: any,
): Promise<AppToolSnapshotRow | null> {
  return toolSnapshotId
    ? ((await ctx.db.get(toolSnapshotId)) as AppToolSnapshotRow | null) ?? null
    : null;
}

async function listCommunityAppMountRows(
  ctx: any,
  communityId: any,
): Promise<CommunityAppMountRow[]> {
  return (await ctx.db
    .query("communityAppMounts")
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .collect()) as CommunityAppMountRow[];
}

export const findExistingCommunityAppMountByIdentityInternal = internalQuery({
  args: {
    communityId: v.id("communities"),
    catalogAppId: v.optional(v.string()),
    endpointUrl: v.string(),
    authType: v.union(
      v.literal("none"),
      v.literal("api_key"),
      v.literal("bearer"),
      v.literal("oauth"),
    ),
  },
  handler: async (ctx, args) => {
    const normalizedCatalogAppId = normalizeString(args.catalogAppId, 120).toLowerCase();
    const normalizedEndpointUrl = normalizeDeveloperAppEndpointUrl(args.endpointUrl);
    const useCatalogSingletonIdentity =
      isDiscoverAppCatalogSingletonIdentity(normalizedCatalogAppId);
    const mounts = await listCommunityAppMountRows(ctx, args.communityId);
    mounts.sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt);
    let endpointMatch: {
      mount: CommunityAppMountRow;
      app: DeveloperAppRow;
    } | null = null;
    for (const mount of mounts) {
      const app = await getDeveloperAppById(ctx, mount.developerAppId);
      if (!app) continue;
      if (
        useCatalogSingletonIdentity &&
        normalizedCatalogAppId &&
        normalizeString(app.catalogAppId, 120).toLowerCase() ===
          normalizedCatalogAppId
      ) {
        return { mount, app };
      }
      if (
        !endpointMatch &&
        normalizedEndpointUrl &&
        app.endpointUrl === normalizedEndpointUrl &&
        app.authType === args.authType
      ) {
        endpointMatch = { mount, app };
      }
    }
    return endpointMatch;
  },
});

async function requireExistingCommunityMount(args: {
  ctx: any;
  communityId: any;
  communityAppMountId: any;
}): Promise<CommunityAppMountRow> {
  const row = await getCommunityAppMountById(args.ctx, args.communityAppMountId);
  if (!row || String(row.communityId) !== String(args.communityId)) {
    throw new Error("community_app_mount_not_found");
  }
  return row;
}

function buildValidatedMountPatch(args: {
  mount: CommunityAppMountRow;
  snapshot: AppToolSnapshotRow | null;
  enabled?: boolean;
  enabledTools?: unknown;
  nowMs?: number;
}) {
  const tools = normalizeSnapshotTools(args.snapshot);
  const allToolNames = tools.map((tool) => tool.tool_name);
  const nextEnabledTools = Array.isArray(args.enabledTools)
    ? normalizeStringList(args.enabledTools).filter((toolName) => allToolNames.includes(toolName))
    : computeSelectedToolNames(args.mount, tools);
  return {
    enabled: args.enabled ?? args.mount.enabled,
    enabledTools: nextEnabledTools,
    updatedAt: args.nowMs ?? Date.now(),
  };
}

async function resolveAuthenticatedActionUser(args: {
  ctx: any;
  authSubject?: string | null;
}): Promise<{ userId: any; authSubject: string }> {
  const actor = (await args.ctx.runQuery(internal.authActor.resolveAuthenticatedActorInternal as any, {
    authSubject: args.authSubject ?? undefined,
  })) as { authSubject?: unknown; dbUserId?: unknown } | null;
  const authSubject = normalizeString(actor?.authSubject, 200);
  const userId = actor?.dbUserId;
  if (!authSubject || !userId) throw new Error("authenticated_user_required");
  return {
    userId,
    authSubject,
  };
}

async function mountDeveloperAppForCommunity(args: {
  ctx: any;
  userId: any;
  communityId: any;
  developerAppId: any;
  toolSnapshotId?: any;
  enabledTools?: string[];
  nowMs: number;
}): Promise<unknown> {
  const communityAppMountId = (await args.ctx.runMutation(
    internal.communityAppMounts.upsertCommunityAppMountInternal,
    {
      communityId: args.communityId,
      developerAppId: args.developerAppId,
      toolSnapshotId: args.toolSnapshotId,
      mountedByUserId: args.userId,
      enabled: true,
      enabledTools: args.enabledTools,
      nowMs: args.nowMs,
    },
  )) as any;

  const mount = await args.ctx.runQuery(
    internal.communityAppMounts.getCommunityAppMountReadModelInternal,
    {
      userId: args.userId,
      communityId: args.communityId,
      communityAppMountId,
    },
  );

  let personalSeedResult: unknown = null;
  try {
    personalSeedResult = await args.ctx.runAction(
      internal.userPlatformAppMounts.seedCommunityAppGrantIntoUserHarnessInternal,
      {
        userId: args.userId,
        communityAppMountId,
        nowMs: args.nowMs,
      },
    );
  } catch (error) {
    console.warn("community_app_personal_seed_failed", {
      community_app_mount_id: String(communityAppMountId),
      user_id: String(args.userId),
      error: error instanceof Error ? error.message : String(error ?? ""),
    });
  }

  let existingMemberSeedResult: unknown = null;
  try {
    await args.ctx.scheduler.runAfter(
      0,
      internal.userPlatformAppMounts.seedCommunityAppGrantForExistingMembersInternal,
      {
        communityId: args.communityId,
        communityAppMountId,
        skipUserId: args.userId,
        nowMs: args.nowMs,
      },
    );
    existingMemberSeedResult = { scheduled: true };
  } catch (error) {
    existingMemberSeedResult = {
      scheduled: false,
      error: error instanceof Error ? error.message : String(error ?? ""),
    };
    console.warn("community_app_existing_member_seed_schedule_failed", {
      community_app_mount_id: String(communityAppMountId),
      community_id: String(args.communityId),
      user_id: String(args.userId),
      error: error instanceof Error ? error.message : String(error ?? ""),
    });
  }

  return mount && typeof mount === "object" && !Array.isArray(mount)
    ? {
        ...(mount as Record<string, unknown>),
        personal_seed_result: personalSeedResult,
        existing_member_seed_result: existingMemberSeedResult,
      }
    : mount;
}

export const assertCommunityManagerAccessInternal = internalQuery({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const { community } = await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    return {
      community_id: String(community._id),
      community_name: normalizeString(community.name, 200) || null,
    };
  },
});

export const getCommunityAppMountReadModelInternal = internalQuery({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    communityAppMountId: v.id("communityAppMounts"),
  },
  handler: async (ctx, args) => {
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const mount = await requireExistingCommunityMount({
      ctx,
      communityId: args.communityId,
      communityAppMountId: args.communityAppMountId,
    });
    const app = await getDeveloperAppById(ctx, mount.developerAppId);
    const snapshot = await getAppToolSnapshotById(ctx, mount.toolSnapshotId);
    if (!app) throw new Error("community_app_mount_missing_dependency");
    const connection = await getAppConnectionByDeveloperAppId(ctx, mount.developerAppId);
    return mapCommunityAppMountReadModel({
      mount,
      app,
      connection,
      snapshot,
    });
  },
});

export const getCommunityAppMountLifecycleContextInternal = internalQuery({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    communityAppMountId: v.id("communityAppMounts"),
  },
  handler: async (ctx, args) => {
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const mount = await requireExistingCommunityMount({
      ctx,
      communityId: args.communityId,
      communityAppMountId: args.communityAppMountId,
    });
    const app = await getDeveloperAppById(ctx, mount.developerAppId);
    if (!app) throw new Error("community_app_mount_missing_dependency");
    return {
      mountId: mount._id,
      developerAppId: mount.developerAppId,
      authType: app.authType,
    };
  },
});

export const getCommunityAppMountSeedSourceInternal = internalQuery({
  args: {
    communityAppMountId: v.id("communityAppMounts"),
  },
  handler: async (ctx, args) => {
    const mount = await getCommunityAppMountById(ctx, args.communityAppMountId);
    if (!mount) return null;
    const app = await getDeveloperAppById(ctx, mount.developerAppId);
    if (!app) return null;
    return {
      mount,
      app,
    };
  },
});

export const listCommunityAppGrantSeedSourcesInternal = internalQuery({
  args: {
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const mounts = await listCommunityAppMountRows(ctx, args.communityId);
    const out = [];
    for (const mount of mounts) {
      if (mount.enabled === false) continue;
      const app = await getDeveloperAppById(ctx, mount.developerAppId);
      if (!app) continue;
      out.push({
        mount: {
          _id: mount._id,
          communityId: mount.communityId,
          enabled: mount.enabled,
          enabledTools: mount.enabledTools,
        },
        app,
      });
    }
    return out;
  },
});

export const listCommunityAppGrantRecipientUserIdsInternal = internalQuery({
  args: {
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const community = (await ctx.db.get(args.communityId)) as CommunityRow | null;
    if (!community) return [];
    const recipientUserIds: any[] = [];
    const seen = new Set<string>();
    const addRecipient = (userId: any) => {
      const key = String(userId ?? "");
      if (!key || seen.has(key)) return;
      seen.add(key);
      recipientUserIds.push(userId);
    };

    addRecipient(community.ownerId);
    const memberships = (await ctx.db
      .query("communityMemberships")
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunityAppGrantRecipientRow[];
    for (const membership of memberships) {
      if (membership.active === false) continue;
      if (typeof membership.revokedAt === "number") continue;
      addRecipient(membership.userId);
    }
    return recipientUserIds;
  },
});

export const listCommunityAppMounts = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const mounts = await listCommunityAppMountRows(ctx, args.communityId);
    mounts.sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt);
    const results = [];
    for (const mount of mounts) {
      const app = await getDeveloperAppById(ctx, mount.developerAppId);
      const snapshot = await getAppToolSnapshotById(ctx, mount.toolSnapshotId);
      if (!app) continue;
      const connection = await getAppConnectionByDeveloperAppId(ctx, mount.developerAppId);
      results.push(
        mapCommunityAppMountReadModel({
          mount,
          app,
          connection,
          snapshot,
        }),
      );
    }
    return results;
  },
});

export const patchCommunityAppMountsForDeveloperAppSnapshotInternal = internalMutation({
  args: {
    developerAppId: v.id("developerApps"),
    toolSnapshotId: v.id("appToolSnapshots"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const snapshot = await getAppToolSnapshotById(ctx, args.toolSnapshotId);
    if (!snapshot) throw new Error("community_app_snapshot_not_found");
    const mounts = (await ctx.db
      .query("communityAppMounts")
      .withIndex("by_app", (q: any) => q.eq("developerAppId", args.developerAppId))
      .collect()) as CommunityAppMountRow[];
    const nowMs = args.nowMs ?? Date.now();
    for (const mount of mounts) {
      const patch = buildValidatedMountPatch({
        mount,
        snapshot,
        nowMs,
      });
      await ctx.db.patch(mount._id, {
        ...patch,
        toolSnapshotId: args.toolSnapshotId,
      });
    }
    return {
      updatedMountCount: mounts.length,
    };
  },
});

export const connectCommunityApp = action({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    catalogAppId: v.optional(v.string()),
    name: v.string(),
    endpointUrl: v.string(),
    authType: v.union(
      v.literal("none"),
      v.literal("api_key"),
      v.literal("bearer"),
      v.literal("oauth"),
    ),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const { userId } = await resolveAuthenticatedActionUser({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    await ctx.runQuery(internal.communityAppMounts.assertCommunityManagerAccessInternal, {
      userId,
      communityId: args.communityId,
    });

    const connectPolicy = resolveDiscoverAppCatalogConnectPolicy({
      catalogAppId: args.catalogAppId,
      name: args.name,
      endpointUrl: args.endpointUrl,
      authType: args.authType,
    });
    if (!connectPolicy.ok) {
      throw new Error(connectPolicy.message);
    }
    const catalogAppId = connectPolicy.catalogAppId;
    const appName = connectPolicy.name;
    const endpointUrl = connectPolicy.endpointUrl;
    const authType = connectPolicy.authType;
    const nowMs = Date.now();
    const existingGrant = (await ctx.runQuery(
      internal.communityAppMounts.findExistingCommunityAppMountByIdentityInternal,
      {
        communityId: args.communityId,
        catalogAppId,
        endpointUrl,
        authType,
      },
    )) as {
      mount: CommunityAppMountRow;
      app: DeveloperAppRow;
    } | null;
    if (existingGrant) {
      return await mountDeveloperAppForCommunity({
        ctx,
        userId,
        communityId: args.communityId,
        developerAppId: existingGrant.app._id,
        toolSnapshotId: existingGrant.mount.toolSnapshotId,
        enabledTools: existingGrant.mount.enabledTools,
        nowMs,
      });
    }

    let developerAppId: any = null;
    try {
      developerAppId = (await ctx.runMutation(internal.developerApps.createDeveloperAppInternal, {
        ownerUserId: userId,
        catalogAppId,
        name: appName,
        slug: undefined,
        description: args.description,
        endpointUrl,
        authType,
        nowMs,
      })) as any;

      const validation = (await ctx.runAction(internal.appValidation.validateDeveloperAppInternal, {
        developerAppId,
      })) as {
        validation_status?: unknown;
        validation_error?: unknown;
        snapshot?: { tools?: unknown };
      };
      if (String(validation.validation_status ?? "") !== "ok") {
        const app = (await ctx.runQuery(internal.developerApps.getDeveloperAppByIdInternal, {
          developerAppId,
        })) as DeveloperAppRow | null;
        return await mountDeveloperAppForCommunity({
          ctx,
          userId,
          communityId: args.communityId,
          developerAppId,
          toolSnapshotId: app?.activeSnapshotId,
          nowMs,
        });
      }

      const app = (await ctx.runQuery(internal.developerApps.getDeveloperAppForOwnerInternal, {
        userId,
        developerAppId,
      })) as DeveloperAppRow;
      if (!app.activeSnapshotId) {
        return await mountDeveloperAppForCommunity({
          ctx,
          userId,
          communityId: args.communityId,
          developerAppId,
          nowMs,
        });
      }
      const mountedTools = Array.isArray(validation.snapshot?.tools)
        ? (validation.snapshot?.tools as Array<{ tool_name?: unknown }>)
        : [];
      const enabledTools = mountedTools
        .map((tool) => normalizeString(tool.tool_name, 200))
        .filter(Boolean);
      if (enabledTools.length === 0) {
        return await mountDeveloperAppForCommunity({
          ctx,
          userId,
          communityId: args.communityId,
          developerAppId,
          toolSnapshotId: app.activeSnapshotId,
          enabledTools: [],
          nowMs,
        });
      }

      return await mountDeveloperAppForCommunity({
        ctx,
        userId,
        communityId: args.communityId,
        developerAppId,
        toolSnapshotId: app.activeSnapshotId,
        enabledTools,
        nowMs,
      });
    } catch (error) {
      if (developerAppId) {
        try {
          return await mountDeveloperAppForCommunity({
            ctx,
            userId,
            communityId: args.communityId,
            developerAppId,
            nowMs,
          });
        } catch {
          throw error;
        }
      }
      throw error;
    }
  },
});

export const stageCommunityMcpAppForSetupInternal = internalAction({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    catalogAppId: v.optional(v.string()),
    name: v.string(),
    endpointUrl: v.optional(v.string()),
    authType: v.optional(
      v.union(
        v.literal("none"),
        v.literal("api_key"),
        v.literal("bearer"),
        v.literal("oauth"),
      ),
    ),
    description: v.optional(v.string()),
    setupStatus: v.union(
      v.literal("needs_auth"),
      v.literal("needs_config"),
      v.literal("needs_runtime"),
    ),
    setupReason: v.optional(v.string()),
    mcpRegistryId: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    await ctx.runQuery(
      internal.communityAppMounts.assertCommunityManagerAccessInternal,
      {
        userId: args.userId,
        communityId: args.communityId,
      },
    );

    const nowMs = args.nowMs ?? Date.now();
    const developerAppId = (await ctx.runMutation(
      (internal as any).developerApps.upsertImportedMcpDeveloperAppInternal,
      {
        ownerUserId: args.userId,
        catalogAppId: args.catalogAppId,
        name: args.name,
        description: args.description,
        endpointUrl: args.endpointUrl,
        authType: args.authType as DeveloperAppAuthType | undefined,
        setupStatus: args.setupStatus,
        setupReason: args.setupReason,
        mcpRegistryId: args.mcpRegistryId,
        nowMs,
      },
    )) as any;

    return await mountDeveloperAppForCommunity({
      ctx,
      userId: args.userId,
      communityId: args.communityId,
      developerAppId,
      enabledTools: [],
      nowMs,
    });
  },
});

export const connectImportedCommunityMcpAppInternal = internalAction({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    catalogAppId: v.optional(v.string()),
    name: v.string(),
    endpointUrl: v.string(),
    authType: v.union(
      v.literal("none"),
      v.literal("api_key"),
      v.literal("bearer"),
      v.literal("oauth"),
    ),
    description: v.optional(v.string()),
    mcpRegistryId: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    await ctx.runQuery(
      internal.communityAppMounts.assertCommunityManagerAccessInternal,
      {
        userId: args.userId,
        communityId: args.communityId,
      },
    );

    const policy = resolveCommunityWorkflowImportMcpRegistryConnectPolicy({
      mcpRegistryId: args.mcpRegistryId,
      name: args.name,
      endpointUrl: args.endpointUrl,
      authType: args.authType,
    });
    if (!policy.ok) throw new Error(policy.message);
    if (policy.authType !== "none") {
      throw new Error(
        `${policy.name} needs member authentication before it can be live.`,
      );
    }

    const nowMs = args.nowMs ?? Date.now();
    const existingGrant = (await ctx.runQuery(
      internal.communityAppMounts.findExistingCommunityAppMountByIdentityInternal,
      {
        communityId: args.communityId,
        catalogAppId: args.catalogAppId,
        endpointUrl: policy.endpointUrl,
        authType: policy.authType,
      },
    )) as {
      mount: CommunityAppMountRow;
      app: DeveloperAppRow;
    } | null;
    if (existingGrant) {
      return await mountDeveloperAppForCommunity({
        ctx,
        userId: args.userId,
        communityId: args.communityId,
        developerAppId: existingGrant.app._id,
        toolSnapshotId: existingGrant.mount.toolSnapshotId,
        enabledTools: existingGrant.mount.enabledTools,
        nowMs,
      });
    }

    const developerAppId = (await ctx.runMutation(
      internal.developerApps.createDeveloperAppInternal,
      {
        ownerUserId: args.userId,
        catalogAppId: args.catalogAppId,
        mcpRegistryId: policy.mcpRegistryId,
        name: policy.name,
        slug: undefined,
        description: args.description,
        endpointUrl: policy.endpointUrl,
        authType: policy.authType,
        nowMs,
      },
    )) as any;

    const validation = (await ctx.runAction(
      internal.appValidation.validateDeveloperAppInternal,
      {
        developerAppId,
      },
    )) as {
      validation_status?: unknown;
      snapshot?: { tools?: unknown };
    };
    const app = (await ctx.runQuery(
      internal.developerApps.getDeveloperAppByIdInternal,
      {
        developerAppId,
      },
    )) as DeveloperAppRow | null;

    if (String(validation.validation_status ?? "") !== "ok" || !app?.activeSnapshotId) {
      return await mountDeveloperAppForCommunity({
        ctx,
        userId: args.userId,
        communityId: args.communityId,
        developerAppId,
        toolSnapshotId: app?.activeSnapshotId,
        nowMs,
      });
    }

    const mountedTools = Array.isArray(validation.snapshot?.tools)
      ? (validation.snapshot?.tools as Array<{ tool_name?: unknown }>)
      : [];
    const enabledTools = mountedTools
      .map((tool) => normalizeString(tool.tool_name, 200))
      .filter(Boolean);

    return await mountDeveloperAppForCommunity({
      ctx,
      userId: args.userId,
      communityId: args.communityId,
      developerAppId,
      toolSnapshotId: app.activeSnapshotId,
      enabledTools,
      nowMs,
    });
  },
});

async function applyPrivateCommunityPluginManifestForManager(args: {
  ctx: any;
  userId: any;
  communityId: any;
  manifest: unknown;
  nowMs?: number;
}): Promise<unknown> {
  const plan = compilePrivateCommunityPluginManifest(args.manifest);
  const warnings = [...plan.warnings];
  if (plan.skillsToAttach.length > 0) {
    warnings.push({
      code: "private_plugin_skills_ignored",
      path: "$.skills",
      message:
        "Skill attachment writes are not part of this apply path yet; only MCP apps are applied.",
    });
  }

  if (plan.rejections.length > 0) {
    return {
      ok: false,
      applied: false,
      plugin: plan.normalizedPlugin,
      rejections: plan.rejections,
      warnings,
      skills_ignored_count: plan.skillsToAttach.length,
      mcp_app_count: plan.mcpAppsToStage.length,
      staged_count: 0,
      reused_count: 0,
      connected_count: 0,
      failed_count: 0,
      staged: [],
      reused: [],
      connected: [],
      failures: [],
    };
  }

  const nowMs = args.nowMs ?? Date.now();
  const staged = [];
  const reused = [];
  const connected = [];
  const failures = [];

  for (const appPlan of plan.mcpAppsToStage) {
    const existingMount = (await args.ctx.runQuery(
      internal.communityAppMounts.findExistingCommunityAppMountByIdentityInternal,
      {
        communityId: args.communityId,
        catalogAppId: appPlan.catalogAppId ?? undefined,
        endpointUrl: appPlan.endpointUrl,
        authType: appPlan.authType,
      },
    )) as {
      mount: CommunityAppMountRow;
      app: DeveloperAppRow;
    } | null;
    if (existingMount) {
      const mount = await mountDeveloperAppForCommunity({
        ctx: args.ctx,
        userId: args.userId,
        communityId: args.communityId,
        developerAppId: existingMount.app._id,
        toolSnapshotId: existingMount.mount.toolSnapshotId,
        enabledTools: existingMount.mount.enabledTools,
        nowMs,
      });
      reused.push(
        summarizePrivateCommunityPluginMcpApplyResult({
          appPlan,
          status: "reused",
          mount,
        }),
      );
      continue;
    }

    const setupStatus = derivePrivateCommunityPluginMcpSetupStatus(appPlan);
    try {
      if (setupStatus) {
        const mount = await args.ctx.runAction(
          internal.communityAppMounts.stageCommunityMcpAppForSetupInternal,
          {
            userId: args.userId,
            communityId: args.communityId,
            catalogAppId: appPlan.catalogAppId ?? undefined,
            name: appPlan.name,
            endpointUrl: appPlan.endpointUrl,
            authType: appPlan.authType,
            setupStatus,
            setupReason: appPlan.reason,
            mcpRegistryId: appPlan.mcpRegistryId,
            nowMs,
          },
        );
        staged.push(
          summarizePrivateCommunityPluginMcpApplyResult({
            appPlan,
            status: "staged",
            mount,
          }),
        );
        continue;
      }

      const mount = await args.ctx.runAction(
        internal.communityAppMounts.connectImportedCommunityMcpAppInternal,
        {
          userId: args.userId,
          communityId: args.communityId,
          catalogAppId: appPlan.catalogAppId ?? undefined,
          name: appPlan.name,
          endpointUrl: appPlan.endpointUrl,
          authType: appPlan.authType,
          description: appPlan.reason,
          mcpRegistryId: appPlan.mcpRegistryId,
          nowMs,
        },
      );
      connected.push(
        summarizePrivateCommunityPluginMcpApplyResult({
          appPlan,
          status: "connected",
          mount,
        }),
      );
    } catch (error) {
      failures.push({
        source_index: appPlan.sourceIndex,
        mcp_registry_id: appPlan.mcpRegistryId,
        name: appPlan.name,
        endpoint_url: appPlan.endpointUrl,
        auth_type: appPlan.authType,
        error: error instanceof Error ? error.message : String(error ?? ""),
      });
    }
  }

  return {
    ok: failures.length === 0,
    applied: staged.length > 0 || reused.length > 0 || connected.length > 0,
    plugin: plan.normalizedPlugin,
    rejections: [],
    warnings,
    skills_ignored_count: plan.skillsToAttach.length,
    mcp_app_count: plan.mcpAppsToStage.length,
    staged_count: staged.length,
    reused_count: reused.length,
    connected_count: connected.length,
    failed_count: failures.length,
    staged,
    reused,
    connected,
    failures,
  };
}

export const listPrivateCommunityMcpOptions = query({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    return COMMUNITY_WORKFLOW_IMPORT_MCP_REGISTRY
      .map(mapPrivateCommunityMcpOption)
      .filter((option): option is NonNullable<typeof option> => Boolean(option))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const addPrivateCommunityMcpApp = action({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    mcpRegistryId: v.string(),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const { userId } = await resolveAuthenticatedActionUser({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    await ctx.runQuery(
      internal.communityAppMounts.assertCommunityManagerAccessInternal,
      {
        userId,
        communityId: args.communityId,
      },
    );
    const result = await applyPrivateCommunityPluginManifestForManager({
      ctx,
      userId,
      communityId: args.communityId,
      manifest: buildPrivateCommunityMcpRegistryManifest({
        mcpRegistryId: args.mcpRegistryId,
      }),
    });
    return mapPrivateCommunityMcpProductAddResult({
      mcpRegistryId: args.mcpRegistryId,
      result,
    });
  },
});

export const applyPrivateCommunityPluginManifest = action({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    manifest: v.any(),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const { userId } = await resolveAuthenticatedActionUser({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    await ctx.runQuery(
      internal.communityAppMounts.assertCommunityManagerAccessInternal,
      {
        userId,
        communityId: args.communityId,
      },
    );
    return await applyPrivateCommunityPluginManifestForManager({
      ctx,
      userId,
      communityId: args.communityId,
      manifest: args.manifest,
    });
  },
});

export const refreshCommunityApp = action({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    communityAppMountId: v.id("communityAppMounts"),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const { userId } = await resolveAuthenticatedActionUser({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const lifecycle = (await ctx.runQuery(
      internal.communityAppMounts.getCommunityAppMountLifecycleContextInternal,
      {
        userId,
        communityId: args.communityId,
        communityAppMountId: args.communityAppMountId,
      },
    )) as {
      mountId: any;
      developerAppId: any;
      authType: string;
    };

    await ctx.runAction(internal.appValidation.validateDeveloperAppInternal, {
      developerAppId: lifecycle.developerAppId,
    });

    const app = (await ctx.runQuery(internal.developerApps.getDeveloperAppByIdInternal, {
      developerAppId: lifecycle.developerAppId,
    })) as DeveloperAppRow | null;
    const activeSnapshotId = app?.activeSnapshotId ?? null;
    if (activeSnapshotId) {
      await ctx.runMutation(
        internal.communityAppMounts.patchCommunityAppMountsForDeveloperAppSnapshotInternal,
        {
        developerAppId: lifecycle.developerAppId,
        toolSnapshotId: activeSnapshotId,
        },
      );
    }

    return await ctx.runQuery(internal.communityAppMounts.getCommunityAppMountReadModelInternal, {
      userId,
      communityId: args.communityId,
      communityAppMountId: args.communityAppMountId,
    });
  },
});

export const setupImportedCommunityMcpApp = action({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    communityAppMountId: v.id("communityAppMounts"),
    endpointUrl: v.string(),
    authType: v.union(
      v.literal("none"),
      v.literal("api_key"),
      v.literal("bearer"),
      v.literal("oauth"),
    ),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const { userId } = await resolveAuthenticatedActionUser({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const lifecycle = (await ctx.runQuery(
      internal.communityAppMounts.getCommunityAppMountLifecycleContextInternal,
      {
        userId,
        communityId: args.communityId,
        communityAppMountId: args.communityAppMountId,
      },
    )) as {
      mountId: any;
      developerAppId: any;
      authType: string;
    };
    const app = (await ctx.runQuery(
      internal.developerApps.getDeveloperAppByIdInternal,
      {
        developerAppId: lifecycle.developerAppId,
      },
    )) as DeveloperAppRow | null;
    if (!app) throw new Error("community_app_mount_missing_dependency");
    const policy = resolveCommunityWorkflowImportMcpRegistryConnectPolicy({
      mcpRegistryId: app.mcpRegistryId,
      name: app.name,
      endpointUrl: args.endpointUrl,
      authType: args.authType,
    });
    if (!policy.ok) throw new Error(policy.message);
    const nowMs = Date.now();
    await ctx.runMutation(
      internal.developerApps.configureImportedMcpDeveloperAppInternal,
      {
        developerAppId: lifecycle.developerAppId,
        endpointUrl: policy.endpointUrl,
        authType: policy.authType,
        clearSetupStatus: policy.authType === "none",
        nowMs,
      },
    );

    if (policy.authType === "none") {
      await ctx.runAction(internal.appValidation.validateDeveloperAppInternal, {
        developerAppId: lifecycle.developerAppId,
      });

      const refreshedApp = (await ctx.runQuery(
        internal.developerApps.getDeveloperAppByIdInternal,
        {
          developerAppId: lifecycle.developerAppId,
        },
      )) as DeveloperAppRow | null;
      if (refreshedApp?.activeSnapshotId) {
        await ctx.runMutation(
          internal.communityAppMounts
            .patchCommunityAppMountsForDeveloperAppSnapshotInternal,
          {
            developerAppId: lifecycle.developerAppId,
            toolSnapshotId: refreshedApp.activeSnapshotId,
            nowMs,
          },
        );
      }

      try {
        await ctx.runAction(
          internal.userPlatformAppMounts
            .seedCommunityAppGrantIntoUserHarnessInternal,
          {
            userId,
            communityAppMountId: args.communityAppMountId,
            nowMs,
          },
        );
      } catch {
        // The canonical community app mount is still the source of truth; personal
        // seeding can be retried through the existing grant seed path.
      }
    }

    return await ctx.runQuery(
      internal.communityAppMounts.getCommunityAppMountReadModelInternal,
      {
        userId,
        communityId: args.communityId,
        communityAppMountId: args.communityAppMountId,
      },
    );
  },
});

export const updateCommunityAppMount = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    communityAppMountId: v.id("communityAppMounts"),
    enabled: v.optional(v.boolean()),
    enabledTools: v.optional(v.array(v.string())),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const mount = await requireExistingCommunityMount({
      ctx,
      communityId: args.communityId,
      communityAppMountId: args.communityAppMountId,
    });
    const snapshot = await getAppToolSnapshotById(ctx, mount.toolSnapshotId);
    const patch = buildValidatedMountPatch({
      mount,
      snapshot,
      enabled: args.enabled,
      enabledTools: args.enabledTools,
      nowMs: args.nowMs,
    });
    await ctx.db.patch(mount._id, patch);
    const updated = await getCommunityAppMountById(ctx, mount._id);
    const app = await getDeveloperAppById(ctx, mount.developerAppId);
    const connection = await getAppConnectionByDeveloperAppId(ctx, mount.developerAppId);
    const updatedSnapshot = await getAppToolSnapshotById(
      ctx,
      updated?.toolSnapshotId ?? mount.toolSnapshotId,
    );
    if (!updated || !app) {
      throw new Error("community_app_mount_not_found");
    }
    return mapCommunityAppMountReadModel({
      mount: updated,
      app,
      connection,
      snapshot: updatedSnapshot,
    });
  },
});

export const unmountCommunityApp = action({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    communityAppMountId: v.id("communityAppMounts"),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const { userId } = await resolveAuthenticatedActionUser({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    await ctx.runQuery(internal.communityAppMounts.assertCommunityManagerAccessInternal, {
      userId,
      communityId: args.communityId,
    });
    await ctx.runQuery(
      internal.communityAppMounts.getCommunityAppMountLifecycleContextInternal,
      {
        userId,
        communityId: args.communityId,
        communityAppMountId: args.communityAppMountId,
      },
    );
    const personalHarnessPromotion = await ctx.runMutation(
      internal.userPlatformAppMounts.promoteCommunityAppGrantSourcesToPersonalInternal,
      {
        communityAppMountId: args.communityAppMountId,
      },
    );
    const removed = await ctx.runMutation(
      internal.communityAppMounts.deleteCommunityAppMountInternal,
      {
        communityId: args.communityId,
        communityAppMountId: args.communityAppMountId,
      },
    );
    return {
      ...(removed && typeof removed === "object" && !Array.isArray(removed)
        ? (removed as Record<string, unknown>)
        : { removed: true, id: String(args.communityAppMountId) }),
      personal_harness_promotion: personalHarnessPromotion,
    };
  },
});

export const deleteCommunityAppMountInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    communityAppMountId: v.id("communityAppMounts"),
  },
  handler: async (ctx, args) => {
    const mount = await requireExistingCommunityMount({
      ctx,
      communityId: args.communityId,
      communityAppMountId: args.communityAppMountId,
    });
    await ctx.db.delete(mount._id);
    return {
      removed: true,
      id: String(mount._id),
    };
  },
});

export const upsertCommunityAppMountInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    developerAppId: v.id("developerApps"),
    toolSnapshotId: v.optional(v.id("appToolSnapshots")),
    mountedByUserId: v.id("users"),
    enabled: v.boolean(),
    enabledTools: v.optional(v.array(v.string())),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const existing = await ctx.db
      .query("communityAppMounts")
      .withIndex("by_community_app", (q: any) =>
        q.eq("communityId", args.communityId).eq("developerAppId", args.developerAppId),
      )
      .first();
    if (existing) {
      const patch: Record<string, unknown> = {
        mountedByUserId: args.mountedByUserId,
        enabled: args.enabled,
        updatedAt: nowMs,
      };
      if (args.toolSnapshotId !== undefined) {
        patch.toolSnapshotId = args.toolSnapshotId;
      }
      if (args.enabledTools !== undefined) {
        patch.enabledTools = args.enabledTools;
      }
      await ctx.db.patch(existing._id, patch as any);
      return existing._id;
    }
    return await ctx.db.insert("communityAppMounts", {
      communityId: args.communityId,
      developerAppId: args.developerAppId,
      ...(args.toolSnapshotId ? { toolSnapshotId: args.toolSnapshotId } : {}),
      mountedByUserId: args.mountedByUserId,
      enabled: args.enabled,
      enabledTools: args.enabledTools,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
  },
});

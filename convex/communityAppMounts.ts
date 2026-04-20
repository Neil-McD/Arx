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
  type DeveloperAppRow,
  mapAppConnectionReadModel,
  mapDeveloperAppReadModel,
  normalizeString,
} from "./appCore";
import {
  buildStoredMcpToolSchemaTransport,
  normalizeStoredSnapshotTools,
} from "./mcpSnapshotCodec";
import {
  requireCommunityChatAccess,
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";
import {
  buildDeveloperAppAuthHeaders,
  callMcpTool,
  formatMcpToolResultOutput,
  initializeStreamableHttpMcpSession,
  sendInitializedNotification,
} from "./mcpHttpClient";
import { encryptSecret } from "./providerConnections";

type CommunityAppMountRow = {
  _id: any;
  communityId: any;
  developerAppId: any;
  toolSnapshotId: any;
  mountedByUserId: any;
  enabled: boolean;
  enabledTools?: string[];
  createdAt: number;
  updatedAt: number;
};

type RuntimeMountedCommunityAppTool = {
  community_app_mount_id: any;
  developer_app_id: any;
  app_name: string;
  endpoint_url: string;
  auth_type: string;
  tool_name: string;
  namespaced_tool_name: string;
  description: string | null;
  input_schema_json: string | null;
  input_schema_kind: "object" | "boolean" | "missing" | "invalid";
  risk_level: "read" | "write" | "sensitive";
};

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

function normalizeRuntimeSnapshotTools(
  snapshot: AppToolSnapshotRow | null,
): Array<{
  tool_name: string;
  namespaced_tool_name: string;
  description: string | null;
  input_schema_json: string | null;
  input_schema_kind: "object" | "boolean" | "missing" | "invalid";
  risk_level: "read" | "write" | "sensitive";
}> {
  return normalizeStoredSnapshotTools(snapshot?.toolsJson).map((tool) => ({
    tool_name: tool.tool_name,
    namespaced_tool_name: tool.namespaced_tool_name,
    description: tool.description,
    ...buildStoredMcpToolSchemaTransport(tool),
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

function mapCommunityAppMountReadModel(args: {
  mount: CommunityAppMountRow;
  app: DeveloperAppRow;
  connection: AppConnectionRow | null;
  snapshot: AppToolSnapshotRow | null;
}) {
  const tools = normalizeSnapshotTools(args.snapshot);
  const selectedToolNames = new Set(computeSelectedToolNames(args.mount, tools));
  return {
    id: String(args.mount._id),
    enabled: args.mount.enabled === true,
    enabled_tools: Array.from(selectedToolNames),
    app: mapDeveloperAppReadModel(args.app),
    connection: mapAppConnectionReadModel(args.app, args.connection),
    tools: tools.map((tool) => ({
      ...tool,
      enabled: selectedToolNames.has(tool.tool_name),
    })),
  };
}

function resolveRuntimeMountedCommunityAppTools(args: {
  mount: CommunityAppMountRow;
  app: DeveloperAppRow;
  connection: AppConnectionRow | null;
  snapshot: AppToolSnapshotRow | null;
}): RuntimeMountedCommunityAppTool[] {
  if (!args.mount.enabled) return [];
  if (args.app.status !== "valid") return [];
  if (
    args.app.authType !== "none" &&
    args.connection?.connectionStatus !== "connected"
  ) {
    return [];
  }
  const tools = normalizeRuntimeSnapshotTools(args.snapshot);
  const selectedToolNames = new Set(computeSelectedToolNames(args.mount, tools));
  return tools
    .filter((tool) => selectedToolNames.has(tool.tool_name))
    .map((tool) => ({
      community_app_mount_id: args.mount._id,
      developer_app_id: args.app._id,
      app_name: args.app.name,
      endpoint_url: args.app.endpointUrl,
      auth_type: args.app.authType,
      tool_name: tool.tool_name,
      namespaced_tool_name: tool.namespaced_tool_name,
      description: tool.description,
      input_schema_json: tool.input_schema_json,
      input_schema_kind: tool.input_schema_kind,
      risk_level: tool.risk_level,
    }));
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
  return ((await ctx.db.get(toolSnapshotId)) as AppToolSnapshotRow | null) ?? null;
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
    if (!app || !snapshot) throw new Error("community_app_mount_missing_dependency");
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

export const listRuntimeCommunityMountedToolsInternal = internalQuery({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const mounts = await listCommunityAppMountRows(ctx, args.communityId);
    const resolved: RuntimeMountedCommunityAppTool[] = [];
    for (const mount of mounts) {
      const app = await getDeveloperAppById(ctx, mount.developerAppId);
      const snapshot = await getAppToolSnapshotById(ctx, mount.toolSnapshotId);
      if (!app || !snapshot) continue;
      const connection = await getAppConnectionByDeveloperAppId(
        ctx,
        mount.developerAppId,
      );
      resolved.push(
        ...resolveRuntimeMountedCommunityAppTools({
          mount,
          app,
          connection,
          snapshot,
        }),
      );
    }
    return resolved;
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
    await requireCommunityManager({
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
      if (!app || !snapshot) continue;
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

export const executeCommunityMountedAppToolInternal = internalAction({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    namespacedToolName: v.string(),
    argsJson: v.any(),
  },
  handler: async (ctx, args) => {
    const runtimeTools = (await ctx.runQuery(
      internal.communityAppMounts.listRuntimeCommunityMountedToolsInternal,
      {
        userId: args.userId,
        communityId: args.communityId,
      },
    )) as RuntimeMountedCommunityAppTool[];
    const mountedTool = runtimeTools.find(
      (tool) => tool.namespaced_tool_name === args.namespacedToolName,
    );
    if (!mountedTool) {
      return {
        status: "error" as const,
        exitCode: null,
        outputText: "",
        errorCode: "community_app_tool_not_found",
        errorMessage: "Mounted community app tool not found.",
        details: null,
      };
    }

    if (mountedTool.risk_level !== "read") {
      await ctx.runQuery(
        internal.communityAppMounts.assertCommunityManagerAccessInternal,
        {
          userId: args.userId,
          communityId: args.communityId,
        },
      );
    }

    const connectionBundle = (await ctx.runQuery(
      internal.appConnections.getDecryptedDeveloperAppConnectionBundleInternal,
      {
        developerAppId: mountedTool.developer_app_id,
      },
    )) as {
      app: DeveloperAppRow;
      connection: AppConnectionRow | null;
      secret: string | null;
    } | null;
    if (!connectionBundle) {
      return {
        status: "error" as const,
        exitCode: null,
        outputText: "",
        errorCode: "community_app_not_found",
        errorMessage: "Mounted community app not found.",
        details: null,
      };
    }

    try {
      const headers = buildDeveloperAppAuthHeaders({
        app: connectionBundle.app,
        secret: connectionBundle.secret,
      });
      const { protocolVersion, sessionId } =
        await initializeStreamableHttpMcpSession({
          url: mountedTool.endpoint_url,
          headers,
          clientName: "polynet-runtime",
          clientVersion: "0.1.0",
        });
      await sendInitializedNotification({
        url: mountedTool.endpoint_url,
        headers,
        protocolVersion,
        sessionId,
      });
      const callResult = await callMcpTool({
        url: mountedTool.endpoint_url,
        headers,
        protocolVersion,
        sessionId,
        toolName: mountedTool.tool_name,
        argumentsObject:
          args.argsJson &&
          typeof args.argsJson === "object" &&
          !Array.isArray(args.argsJson)
            ? (args.argsJson as Record<string, unknown>)
            : {},
      });
      const record =
        callResult && typeof callResult === "object" && !Array.isArray(callResult)
          ? (callResult as Record<string, unknown>)
          : null;
      const isError = record?.isError === true;
      const outputText = formatMcpToolResultOutput(callResult);
      return {
        status: isError ? ("error" as const) : ("ok" as const),
        exitCode: isError ? null : 0,
        outputText,
        errorCode: isError ? "community_app_tool_failed" : null,
        errorMessage: isError ? outputText || "Community app tool failed." : null,
        details: {
          community_app: {
            community_app_mount_id: String(mountedTool.community_app_mount_id),
            developer_app_id: String(mountedTool.developer_app_id),
            app_name: mountedTool.app_name,
            tool_name: mountedTool.tool_name,
            namespaced_tool_name: mountedTool.namespaced_tool_name,
            risk_level: mountedTool.risk_level,
          },
        },
      };
    } catch (error) {
      const message =
        error instanceof Error ? normalizeString(error.message, 2_000) : "community_app_tool_failed";
      return {
        status: "error" as const,
        exitCode: null,
        outputText: "",
        errorCode: "community_app_tool_failed",
        errorMessage: message || "Community app tool failed.",
        details: {
          community_app: {
            community_app_mount_id: String(mountedTool.community_app_mount_id),
            developer_app_id: String(mountedTool.developer_app_id),
            app_name: mountedTool.app_name,
            tool_name: mountedTool.tool_name,
            namespaced_tool_name: mountedTool.namespaced_tool_name,
            risk_level: mountedTool.risk_level,
          },
        },
      };
    }
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
    name: v.string(),
    endpointUrl: v.string(),
    authType: v.union(v.literal("none"), v.literal("api_key"), v.literal("bearer")),
    description: v.optional(v.string()),
    secret: v.optional(v.string()),
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

    const nowMs = Date.now();
    let developerAppId: any = null;
    try {
      developerAppId = (await ctx.runMutation(internal.developerApps.createDeveloperAppInternal, {
        ownerUserId: userId,
        name: args.name,
        slug: undefined,
        description: args.description,
        endpointUrl: args.endpointUrl,
        authType: args.authType,
        nowMs,
      })) as any;

      if (args.authType !== "none") {
        const secret = normalizeString(args.secret, 10_000);
        if (!secret) throw new Error("developer_app_connection_secret_required");
        const encryptedSecret = await encryptSecret(secret);
        await ctx.runMutation(internal.appConnections.upsertAppConnectionInternal, {
          developerAppId,
          connectionStatus: "connected",
          encryptedSecretHex: encryptedSecret.encryptedSecretHex,
          secretIvHex: encryptedSecret.secretIvHex,
          secretVersion: encryptedSecret.secretVersion,
          nowMs,
        });
      }

      const validation = (await ctx.runAction(internal.appValidation.validateDeveloperAppInternal, {
        developerAppId,
      })) as {
        validation_status?: unknown;
        validation_error?: unknown;
        snapshot?: { tools?: unknown };
      };
      if (String(validation.validation_status ?? "") !== "ok") {
        throw new Error(
          normalizeString(validation.validation_error, 2_000) || "developer_app_validation_failed",
        );
      }

      const app = (await ctx.runQuery(internal.developerApps.getDeveloperAppForOwnerInternal, {
        userId,
        developerAppId,
      })) as DeveloperAppRow;
      if (!app.activeSnapshotId) throw new Error("developer_app_snapshot_missing");
      const mountedTools = Array.isArray(validation.snapshot?.tools)
        ? (validation.snapshot?.tools as Array<{ tool_name?: unknown }>)
        : [];
      const enabledTools = mountedTools
        .map((tool) => normalizeString(tool.tool_name, 200))
        .filter(Boolean);
      if (enabledTools.length === 0) {
        throw new Error("developer_app_no_tools_discovered");
      }

      const communityAppMountId = (await ctx.runMutation(
        internal.communityAppMounts.upsertCommunityAppMountInternal,
        {
          communityId: args.communityId,
          developerAppId,
          toolSnapshotId: app.activeSnapshotId,
          mountedByUserId: userId,
          enabled: true,
          enabledTools,
          nowMs,
        },
      )) as any;

      return await ctx.runQuery(internal.communityAppMounts.getCommunityAppMountReadModelInternal, {
        userId,
        communityId: args.communityId,
        communityAppMountId,
      });
    } catch (error) {
      if (developerAppId) {
        await ctx.runMutation(internal.developerApps.deleteDeveloperAppCascadeInternal, {
          developerAppId,
        });
      }
      throw error;
    }
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

export const reconnectCommunityApp = action({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    communityAppMountId: v.id("communityAppMounts"),
    secret: v.string(),
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

    if (lifecycle.authType === "none") {
      throw new Error("developer_app_connection_not_required");
    }
    const secret = normalizeString(args.secret, 10_000);
    if (!secret) throw new Error("developer_app_connection_secret_required");
    const encryptedSecret = await encryptSecret(secret);
    await ctx.runMutation(internal.appConnections.upsertAppConnectionInternal, {
      developerAppId: lifecycle.developerAppId,
      connectionStatus: "connected",
      encryptedSecretHex: encryptedSecret.encryptedSecretHex,
      secretIvHex: encryptedSecret.secretIvHex,
      secretVersion: encryptedSecret.secretVersion,
      nowMs: Date.now(),
    });

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
    if (!updated || !app || !updatedSnapshot) {
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

export const unmountCommunityApp = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    communityAppMountId: v.id("communityAppMounts"),
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
    toolSnapshotId: v.id("appToolSnapshots"),
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
      await ctx.db.patch(existing._id, {
        toolSnapshotId: args.toolSnapshotId,
        mountedByUserId: args.mountedByUserId,
        enabled: args.enabled,
        enabledTools: args.enabledTools ?? existing.enabledTools,
        updatedAt: nowMs,
      });
      return existing._id;
    }
    return await ctx.db.insert("communityAppMounts", {
      communityId: args.communityId,
      developerAppId: args.developerAppId,
      toolSnapshotId: args.toolSnapshotId,
      mountedByUserId: args.mountedByUserId,
      enabled: args.enabled,
      enabledTools: args.enabledTools,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
  },
});

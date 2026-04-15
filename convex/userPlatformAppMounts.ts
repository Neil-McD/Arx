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
  normalizeDeveloperAppEndpointUrl,
  normalizeString,
} from "./appCore";
import {
  buildDeveloperAppAuthHeaders,
  callMcpTool,
  formatMcpToolResultOutput,
  initializeStreamableHttpMcpSession,
  sendInitializedNotification,
} from "./mcpHttpClient";
import { encryptSecret } from "./providerConnections";
import { resolveUserIdForAuthenticatedRequest } from "./communityCore";

type UserPlatformAppMountRow = {
  _id: any;
  userId: any;
  developerAppId: any;
  toolSnapshotId: any;
  enabled: boolean;
  enabledTools?: string[];
  createdAt: number;
  updatedAt: number;
};

type SnapshotToolRow = {
  tool_name?: unknown;
  namespaced_tool_name?: unknown;
  description?: unknown;
  input_schema?: unknown;
  risk_level?: unknown;
};

type RuntimeMountedUserPlatformAppTool = {
  user_platform_app_mount_id: any;
  developer_app_id: any;
  app_name: string;
  endpoint_url: string;
  auth_type: string;
  tool_name: string;
  namespaced_tool_name: string;
  description: string | null;
  input_schema: unknown;
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

function normalizeSnapshotTools(snapshot: AppToolSnapshotRow | null) {
  if (!snapshot || !Array.isArray(snapshot.toolsJson)) return [];
  const tools = [];
  const seen = new Set<string>();
  for (const rawTool of snapshot.toolsJson) {
    if (!rawTool || typeof rawTool !== "object" || Array.isArray(rawTool)) {
      continue;
    }
    const tool = rawTool as SnapshotToolRow;
    const toolName = normalizeString(tool.tool_name, 200);
    if (!toolName || seen.has(toolName)) continue;
    seen.add(toolName);
    tools.push({
      tool_name: toolName,
      namespaced_tool_name:
        normalizeString(tool.namespaced_tool_name, 240) || toolName,
      description: normalizeString(tool.description, 2_000) || null,
      risk_level:
        tool.risk_level === "write" || tool.risk_level === "sensitive"
          ? tool.risk_level
          : "read",
    });
  }
  return tools;
}

function normalizeRuntimeSnapshotTools(snapshot: AppToolSnapshotRow | null) {
  if (!snapshot || !Array.isArray(snapshot.toolsJson)) return [];
  const tools = [];
  const seen = new Set<string>();
  for (const rawTool of snapshot.toolsJson) {
    if (!rawTool || typeof rawTool !== "object" || Array.isArray(rawTool)) {
      continue;
    }
    const tool = rawTool as SnapshotToolRow;
    const toolName = normalizeString(tool.tool_name, 200);
    if (!toolName || seen.has(toolName)) continue;
    seen.add(toolName);
    tools.push({
      tool_name: toolName,
      namespaced_tool_name:
        normalizeString(tool.namespaced_tool_name, 240) || toolName,
      description: normalizeString(tool.description, 2_000) || null,
      input_schema:
        tool.input_schema !== undefined ? tool.input_schema : {},
      risk_level:
        tool.risk_level === "write" || tool.risk_level === "sensitive"
          ? tool.risk_level
          : "read",
    });
  }
  return tools;
}

function computeSelectedToolNames(
  mount: UserPlatformAppMountRow,
  tools: Array<{ tool_name: string }>,
): string[] {
  const allToolNames = tools.map((tool) => tool.tool_name);
  if (!Array.isArray(mount.enabledTools)) return allToolNames;
  const enabled = normalizeStringList(mount.enabledTools);
  return enabled.filter((toolName) => allToolNames.includes(toolName));
}

function mapUserPlatformAppMountReadModel(args: {
  mount: UserPlatformAppMountRow;
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

function resolveRuntimeMountedUserPlatformAppTools(args: {
  mount: UserPlatformAppMountRow;
  app: DeveloperAppRow;
  connection: AppConnectionRow | null;
  snapshot: AppToolSnapshotRow | null;
}): RuntimeMountedUserPlatformAppTool[] {
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
      user_platform_app_mount_id: args.mount._id,
      developer_app_id: args.app._id,
      app_name: args.app.name,
      endpoint_url: args.app.endpointUrl,
      auth_type: args.app.authType,
      tool_name: tool.tool_name,
      namespaced_tool_name: tool.namespaced_tool_name,
      description: tool.description,
      input_schema: tool.input_schema,
      risk_level: tool.risk_level,
    }));
}

async function getUserPlatformAppMountById(
  ctx: any,
  userPlatformAppMountId: any,
): Promise<UserPlatformAppMountRow | null> {
  return (
    ((await ctx.db.get(userPlatformAppMountId)) as UserPlatformAppMountRow | null) ??
    null
  );
}

async function getDeveloperAppById(
  ctx: any,
  developerAppId: any,
): Promise<DeveloperAppRow | null> {
  return ((await ctx.db.get(developerAppId)) as DeveloperAppRow | null) ?? null;
}

async function getAppConnectionByDeveloperAppId(
  ctx: any,
  developerAppId: any,
): Promise<AppConnectionRow | null> {
  return (
    ((await ctx.db
      .query("appConnections")
      .withIndex("by_app", (q: any) => q.eq("developerAppId", developerAppId))
      .first()) as AppConnectionRow | null) ?? null
  );
}

async function getAppToolSnapshotById(
  ctx: any,
  toolSnapshotId: any,
): Promise<AppToolSnapshotRow | null> {
  return ((await ctx.db.get(toolSnapshotId)) as AppToolSnapshotRow | null) ?? null;
}

async function listUserPlatformAppMountRows(
  ctx: any,
  userId: any,
): Promise<UserPlatformAppMountRow[]> {
  return (await ctx.db
    .query("userPlatformAppMounts")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect()) as UserPlatformAppMountRow[];
}

async function findExistingUserPlatformMountByEndpoint(args: {
  ctx: any;
  userId: any;
  endpointUrl: string;
  authType: string;
}): Promise<{
  mount: UserPlatformAppMountRow;
  app: DeveloperAppRow;
  connection: AppConnectionRow | null;
} | null> {
  const normalizedEndpointUrl = normalizeDeveloperAppEndpointUrl(args.endpointUrl);
  if (!normalizedEndpointUrl) return null;
  const mounts = await listUserPlatformAppMountRows(args.ctx, args.userId);
  mounts.sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt);
  for (const mount of mounts) {
    const app = await getDeveloperAppById(args.ctx, mount.developerAppId);
    if (!app) continue;
    if (app.endpointUrl !== normalizedEndpointUrl || app.authType !== args.authType) {
      continue;
    }
    const connection = await getAppConnectionByDeveloperAppId(
      args.ctx,
      mount.developerAppId,
    );
    return {
      mount,
      app,
      connection,
    };
  }
  return null;
}

async function requireExistingUserPlatformMount(args: {
  ctx: any;
  userId: any;
  userPlatformAppMountId: any;
}): Promise<UserPlatformAppMountRow> {
  const row = await getUserPlatformAppMountById(
    args.ctx,
    args.userPlatformAppMountId,
  );
  if (!row || String(row.userId) !== String(args.userId)) {
    throw new Error("user_platform_app_mount_not_found");
  }
  return row;
}

function buildValidatedMountPatch(args: {
  mount: UserPlatformAppMountRow;
  snapshot: AppToolSnapshotRow | null;
  enabled?: boolean;
  enabledTools?: unknown;
  nowMs?: number;
}) {
  const tools = normalizeSnapshotTools(args.snapshot);
  const allToolNames = tools.map((tool) => tool.tool_name);
  const nextEnabledTools = Array.isArray(args.enabledTools)
    ? normalizeStringList(args.enabledTools).filter((toolName) =>
        allToolNames.includes(toolName),
      )
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
  const actor = (await args.ctx.runQuery(
    internal.authActor.resolveAuthenticatedActorInternal as any,
    {
      authSubject: args.authSubject ?? undefined,
    },
  )) as { authSubject?: unknown; dbUserId?: unknown } | null;
  const authSubject = normalizeString(actor?.authSubject, 200);
  const userId = actor?.dbUserId;
  if (!authSubject || !userId) throw new Error("authenticated_user_required");
  return {
    userId,
    authSubject,
  };
}

export const getUserPlatformAppMountReadModelInternal = internalQuery({
  args: {
    userId: v.id("users"),
    userPlatformAppMountId: v.id("userPlatformAppMounts"),
  },
  handler: async (ctx, args) => {
    const mount = await requireExistingUserPlatformMount({
      ctx,
      userId: args.userId,
      userPlatformAppMountId: args.userPlatformAppMountId,
    });
    const app = await getDeveloperAppById(ctx, mount.developerAppId);
    const snapshot = await getAppToolSnapshotById(ctx, mount.toolSnapshotId);
    if (!app || !snapshot) {
      throw new Error("user_platform_app_mount_missing_dependency");
    }
    const connection = await getAppConnectionByDeveloperAppId(
      ctx,
      mount.developerAppId,
    );
    return mapUserPlatformAppMountReadModel({
      mount,
      app,
      connection,
      snapshot,
    });
  },
});

export const getUserPlatformAppMountLifecycleContextInternal = internalQuery({
  args: {
    userId: v.id("users"),
    userPlatformAppMountId: v.id("userPlatformAppMounts"),
  },
  handler: async (ctx, args) => {
    const mount = await requireExistingUserPlatformMount({
      ctx,
      userId: args.userId,
      userPlatformAppMountId: args.userPlatformAppMountId,
    });
    const app = await getDeveloperAppById(ctx, mount.developerAppId);
    if (!app) throw new Error("user_platform_app_mount_missing_dependency");
    return {
      mountId: mount._id,
      developerAppId: mount.developerAppId,
      authType: app.authType,
    };
  },
});

export const listRuntimeUserPlatformMountedToolsInternal = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const mounts = await listUserPlatformAppMountRows(ctx, args.userId);
    mounts.sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt);
    const resolved: RuntimeMountedUserPlatformAppTool[] = [];
    for (const mount of mounts) {
      const app = await getDeveloperAppById(ctx, mount.developerAppId);
      const snapshot = await getAppToolSnapshotById(ctx, mount.toolSnapshotId);
      if (!app || !snapshot) continue;
      const connection = await getAppConnectionByDeveloperAppId(
        ctx,
        mount.developerAppId,
      );
      resolved.push(
        ...resolveRuntimeMountedUserPlatformAppTools({
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

export const listUserPlatformAppMounts = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const mounts = await listUserPlatformAppMountRows(ctx, userId);
    mounts.sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt);
    const results = [];
    for (const mount of mounts) {
      const app = await getDeveloperAppById(ctx, mount.developerAppId);
      const snapshot = await getAppToolSnapshotById(ctx, mount.toolSnapshotId);
      if (!app || !snapshot) continue;
      const connection = await getAppConnectionByDeveloperAppId(
        ctx,
        mount.developerAppId,
      );
      results.push(
        mapUserPlatformAppMountReadModel({
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

export const executeUserPlatformMountedAppToolInternal = internalAction({
  args: {
    userId: v.id("users"),
    namespacedToolName: v.string(),
    argsJson: v.any(),
  },
  handler: async (ctx, args) => {
    const runtimeTools = (await ctx.runQuery(
      internal.userPlatformAppMounts.listRuntimeUserPlatformMountedToolsInternal,
      {
        userId: args.userId,
      },
    )) as RuntimeMountedUserPlatformAppTool[];
    const mountedTool = runtimeTools.find(
      (tool) => tool.namespaced_tool_name === args.namespacedToolName,
    );
    if (!mountedTool) {
      return {
        status: "error" as const,
        exitCode: null,
        outputText: "",
        errorCode: "user_platform_app_tool_not_found",
        errorMessage: "Mounted platform app tool not found.",
        details: null,
      };
    }

    if (mountedTool.risk_level !== "read") {
      const message =
        "Personal write and sensitive app tools still require the upcoming approval flow. This tool was not executed.";
      return {
        status: "error" as const,
        exitCode: null,
        outputText: message,
        errorCode: "user_platform_app_tool_approval_required",
        errorMessage: message,
        details: {
          approval_required: true,
          user_platform_app: {
            user_platform_app_mount_id: String(
              mountedTool.user_platform_app_mount_id,
            ),
            developer_app_id: String(mountedTool.developer_app_id),
            app_name: mountedTool.app_name,
            tool_name: mountedTool.tool_name,
            namespaced_tool_name: mountedTool.namespaced_tool_name,
            risk_level: mountedTool.risk_level,
          },
        },
      };
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
        errorCode: "user_platform_app_not_found",
        errorMessage: "Mounted platform app not found.",
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
        status: (isError ? "error" : "ok") as const,
        exitCode: isError ? null : 0,
        outputText,
        errorCode: isError ? "user_platform_app_tool_failed" : null,
        errorMessage:
          isError ? outputText || "Platform app tool failed." : null,
        details: {
          user_platform_app: {
            user_platform_app_mount_id: String(
              mountedTool.user_platform_app_mount_id,
            ),
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
        error instanceof Error
          ? normalizeString(error.message, 2_000)
          : "user_platform_app_tool_failed";
      return {
        status: "error" as const,
        exitCode: null,
        outputText: "",
        errorCode: "user_platform_app_tool_failed",
        errorMessage: message || "Platform app tool failed.",
        details: {
          user_platform_app: {
            user_platform_app_mount_id: String(
              mountedTool.user_platform_app_mount_id,
            ),
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

export const patchUserPlatformAppMountsForDeveloperAppSnapshotInternal =
  internalMutation({
    args: {
      developerAppId: v.id("developerApps"),
      toolSnapshotId: v.id("appToolSnapshots"),
      nowMs: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
      const snapshot = await getAppToolSnapshotById(ctx, args.toolSnapshotId);
      if (!snapshot) throw new Error("user_platform_app_snapshot_not_found");
      const mounts = (await ctx.db
        .query("userPlatformAppMounts")
        .withIndex("by_app", (q: any) =>
          q.eq("developerAppId", args.developerAppId),
        )
        .collect()) as UserPlatformAppMountRow[];
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

export const connectUserPlatformApp = action({
  args: {
    authSubject: v.optional(v.string()),
    name: v.string(),
    endpointUrl: v.string(),
    authType: v.union(
      v.literal("none"),
      v.literal("api_key"),
      v.literal("bearer"),
    ),
    description: v.optional(v.string()),
    secret: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveAuthenticatedActionUser({
      ctx,
      authSubject: args.authSubject ?? null,
    });

    const nowMs = Date.now();
    const normalizedSecret = normalizeString(args.secret, 10_000);
    const existingMount = await findExistingUserPlatformMountByEndpoint({
      ctx,
      userId,
      endpointUrl: args.endpointUrl,
      authType: args.authType,
    });
    if (existingMount) {
      if (args.authType !== "none") {
        if (normalizedSecret) {
          const encryptedSecret = await encryptSecret(normalizedSecret);
          await ctx.runMutation(internal.appConnections.upsertAppConnectionInternal, {
            developerAppId: existingMount.app._id,
            connectionStatus: "connected",
            encryptedSecretHex: encryptedSecret.encryptedSecretHex,
            secretIvHex: encryptedSecret.secretIvHex,
            secretVersion: encryptedSecret.secretVersion,
            nowMs,
          });
        } else if (existingMount.connection?.connectionStatus !== "connected") {
          throw new Error("developer_app_connection_secret_required");
        }
      }

      const validation = (await ctx.runAction(
        internal.appValidation.validateDeveloperAppInternal,
        {
          developerAppId: existingMount.app._id,
        },
      )) as {
        validation_status?: unknown;
        validation_error?: unknown;
      };
      if (String(validation.validation_status ?? "") !== "ok") {
        throw new Error(
          normalizeString(validation.validation_error, 2_000) ||
            "developer_app_validation_failed",
        );
      }

      const refreshedApp = (await ctx.runQuery(
        internal.developerApps.getDeveloperAppByIdInternal,
        {
          developerAppId: existingMount.app._id,
        },
      )) as DeveloperAppRow | null;
      if (!refreshedApp?.activeSnapshotId) {
        throw new Error("developer_app_snapshot_missing");
      }
      await ctx.runMutation(
        internal.userPlatformAppMounts.upsertUserPlatformAppMountInternal,
        {
          userId,
          developerAppId: existingMount.app._id,
          toolSnapshotId: refreshedApp.activeSnapshotId,
          enabled: true,
          enabledTools: existingMount.mount.enabledTools,
          nowMs,
        },
      );

      return await ctx.runQuery(
        internal.userPlatformAppMounts.getUserPlatformAppMountReadModelInternal,
        {
          userId,
          userPlatformAppMountId: existingMount.mount._id,
        },
      );
    }

    let developerAppId: any = null;
    try {
      developerAppId = (await ctx.runMutation(
        internal.developerApps.createDeveloperAppInternal,
        {
          ownerUserId: userId,
          name: args.name,
          slug: undefined,
          description: args.description,
          endpointUrl: args.endpointUrl,
          authType: args.authType,
          nowMs,
        },
      )) as any;

      if (args.authType !== "none") {
        if (!normalizedSecret) {
          throw new Error("developer_app_connection_secret_required");
        }
        const encryptedSecret = await encryptSecret(normalizedSecret);
        await ctx.runMutation(internal.appConnections.upsertAppConnectionInternal, {
          developerAppId,
          connectionStatus: "connected",
          encryptedSecretHex: encryptedSecret.encryptedSecretHex,
          secretIvHex: encryptedSecret.secretIvHex,
          secretVersion: encryptedSecret.secretVersion,
          nowMs,
        });
      }

      const validation = (await ctx.runAction(
        internal.appValidation.validateDeveloperAppInternal,
        {
          developerAppId,
        },
      )) as {
        validation_status?: unknown;
        validation_error?: unknown;
        snapshot?: { tools?: unknown };
      };
      if (String(validation.validation_status ?? "") !== "ok") {
        throw new Error(
          normalizeString(validation.validation_error, 2_000) ||
            "developer_app_validation_failed",
        );
      }

      const app = (await ctx.runQuery(
        internal.developerApps.getDeveloperAppForOwnerInternal,
        {
          userId,
          developerAppId,
        },
      )) as DeveloperAppRow;
      if (!app.activeSnapshotId) {
        throw new Error("developer_app_snapshot_missing");
      }
      const mountedTools = Array.isArray(validation.snapshot?.tools)
        ? (validation.snapshot?.tools as Array<{ tool_name?: unknown }>)
        : [];
      const enabledTools = mountedTools
        .map((tool) => normalizeString(tool.tool_name, 200))
        .filter(Boolean);
      if (enabledTools.length === 0) {
        throw new Error("developer_app_no_tools_discovered");
      }

      const userPlatformAppMountId = (await ctx.runMutation(
        internal.userPlatformAppMounts.upsertUserPlatformAppMountInternal,
        {
          userId,
          developerAppId,
          toolSnapshotId: app.activeSnapshotId,
          enabled: true,
          enabledTools,
          nowMs,
        },
      )) as any;

      return await ctx.runQuery(
        internal.userPlatformAppMounts.getUserPlatformAppMountReadModelInternal,
        {
          userId,
          userPlatformAppMountId,
        },
      );
    } catch (error) {
      if (developerAppId) {
        await ctx.runMutation(
          internal.developerApps.deleteDeveloperAppCascadeInternal,
          {
            developerAppId,
          },
        );
      }
      throw error;
    }
  },
});

export const refreshUserPlatformApp = action({
  args: {
    authSubject: v.optional(v.string()),
    userPlatformAppMountId: v.id("userPlatformAppMounts"),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveAuthenticatedActionUser({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const lifecycle = (await ctx.runQuery(
      internal.userPlatformAppMounts.getUserPlatformAppMountLifecycleContextInternal,
      {
        userId,
        userPlatformAppMountId: args.userPlatformAppMountId,
      },
    )) as {
      mountId: any;
      developerAppId: any;
      authType: string;
    };

    await ctx.runAction(internal.appValidation.validateDeveloperAppInternal, {
      developerAppId: lifecycle.developerAppId,
    });

    const app = (await ctx.runQuery(
      internal.developerApps.getDeveloperAppByIdInternal,
      {
        developerAppId: lifecycle.developerAppId,
      },
    )) as DeveloperAppRow | null;
    const activeSnapshotId = app?.activeSnapshotId ?? null;
    if (activeSnapshotId) {
      await ctx.runMutation(
        internal.userPlatformAppMounts
          .patchUserPlatformAppMountsForDeveloperAppSnapshotInternal,
        {
          developerAppId: lifecycle.developerAppId,
          toolSnapshotId: activeSnapshotId,
        },
      );
    }

    return await ctx.runQuery(
      internal.userPlatformAppMounts.getUserPlatformAppMountReadModelInternal,
      {
        userId,
        userPlatformAppMountId: args.userPlatformAppMountId,
      },
    );
  },
});

export const reconnectUserPlatformApp = action({
  args: {
    authSubject: v.optional(v.string()),
    userPlatformAppMountId: v.id("userPlatformAppMounts"),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId } = await resolveAuthenticatedActionUser({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    const lifecycle = (await ctx.runQuery(
      internal.userPlatformAppMounts.getUserPlatformAppMountLifecycleContextInternal,
      {
        userId,
        userPlatformAppMountId: args.userPlatformAppMountId,
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

    const app = (await ctx.runQuery(
      internal.developerApps.getDeveloperAppByIdInternal,
      {
        developerAppId: lifecycle.developerAppId,
      },
    )) as DeveloperAppRow | null;
    const activeSnapshotId = app?.activeSnapshotId ?? null;
    if (activeSnapshotId) {
      await ctx.runMutation(
        internal.userPlatformAppMounts
          .patchUserPlatformAppMountsForDeveloperAppSnapshotInternal,
        {
          developerAppId: lifecycle.developerAppId,
          toolSnapshotId: activeSnapshotId,
        },
      );
    }

    return await ctx.runQuery(
      internal.userPlatformAppMounts.getUserPlatformAppMountReadModelInternal,
      {
        userId,
        userPlatformAppMountId: args.userPlatformAppMountId,
      },
    );
  },
});

export const updateUserPlatformAppMount = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    userPlatformAppMountId: v.id("userPlatformAppMounts"),
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
    const mount = await requireExistingUserPlatformMount({
      ctx,
      userId,
      userPlatformAppMountId: args.userPlatformAppMountId,
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
    const updated = await getUserPlatformAppMountById(ctx, mount._id);
    const app = await getDeveloperAppById(ctx, mount.developerAppId);
    const connection = await getAppConnectionByDeveloperAppId(
      ctx,
      mount.developerAppId,
    );
    const updatedSnapshot = await getAppToolSnapshotById(
      ctx,
      updated?.toolSnapshotId ?? mount.toolSnapshotId,
    );
    if (!updated || !app || !updatedSnapshot) {
      throw new Error("user_platform_app_mount_not_found");
    }
    return mapUserPlatformAppMountReadModel({
      mount: updated,
      app,
      connection,
      snapshot: updatedSnapshot,
    });
  },
});

export const unmountUserPlatformApp = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    userPlatformAppMountId: v.id("userPlatformAppMounts"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const mount = await requireExistingUserPlatformMount({
      ctx,
      userId,
      userPlatformAppMountId: args.userPlatformAppMountId,
    });
    await ctx.db.delete(mount._id);
    return {
      removed: true,
      id: String(mount._id),
    };
  },
});

export const upsertUserPlatformAppMountInternal = internalMutation({
  args: {
    userId: v.id("users"),
    developerAppId: v.id("developerApps"),
    toolSnapshotId: v.id("appToolSnapshots"),
    enabled: v.boolean(),
    enabledTools: v.optional(v.array(v.string())),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const existing = await ctx.db
      .query("userPlatformAppMounts")
      .withIndex("by_user_app", (q: any) =>
        q.eq("userId", args.userId).eq("developerAppId", args.developerAppId),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        toolSnapshotId: args.toolSnapshotId,
        enabled: args.enabled,
        enabledTools: args.enabledTools ?? existing.enabledTools,
        updatedAt: nowMs,
      });
      return existing._id;
    }
    return await ctx.db.insert("userPlatformAppMounts", {
      userId: args.userId,
      developerAppId: args.developerAppId,
      toolSnapshotId: args.toolSnapshotId,
      enabled: args.enabled,
      enabledTools: args.enabledTools,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
  },
});

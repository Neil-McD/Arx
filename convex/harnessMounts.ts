import { v } from "convex/values";
import { query } from "./_generated/server";
import {
  type AppConnectionRow,
  type AppToolSnapshotRow,
  type DeveloperAppRow,
  mapAppConnectionReadModel,
  mapDeveloperAppReadModel,
} from "./appCore";
import {
  requireCommunityChatAccess,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";
import { normalizeStoredSnapshotTools } from "./mcpSnapshotCodec";

type UserPlatformAppMountRow = {
  _id: any;
  userId: any;
  developerAppId: any;
  toolSnapshotId?: any;
  enabled: boolean;
  enabledTools?: string[];
  createdAt: number;
  updatedAt: number;
};

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

function normalizeStringList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const values: string[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    if (typeof item !== "string") continue;
    const value = item.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }
  return values;
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
  return toolSnapshotId
    ? ((await ctx.db.get(toolSnapshotId)) as AppToolSnapshotRow | null) ?? null
    : null;
}

function mapHarnessTools(args: {
  mountEnabledTools: unknown;
  snapshot: AppToolSnapshotRow | null;
}) {
  const tools = normalizeStoredSnapshotTools(args.snapshot?.toolsJson);
  const selectedNames = Array.isArray(args.mountEnabledTools)
    ? normalizeStringList(args.mountEnabledTools).filter((toolName) =>
        tools.some((tool) => tool.tool_name === toolName),
      )
    : tools.map((tool) => tool.tool_name);
  const selectedToolNames = new Set(
    selectedNames,
  );
  return tools.map((tool) => ({
    tool_name: tool.tool_name,
    namespaced_tool_name: tool.namespaced_tool_name,
    description: tool.description,
    risk_level: tool.risk_level,
    enabled: selectedToolNames.has(tool.tool_name),
  }));
}

function deriveHarnessLiveState(args: {
  enabled: boolean;
  app: DeveloperAppRow;
  connection: AppConnectionRow | null;
  snapshot: AppToolSnapshotRow | null;
  enabledTools: string[];
}) {
  if (!args.enabled) {
    return {
      live_status: "not_live" as const,
      not_live_reason: "disabled" as const,
    };
  }
  if (
    args.app.authType !== "none" &&
    args.connection?.connectionStatus !== "connected"
  ) {
    return {
      live_status: "not_live" as const,
      not_live_reason: "needs_auth" as const,
    };
  }
  if (!args.snapshot) {
    return {
      live_status: "not_live" as const,
      not_live_reason: "missing_snapshot" as const,
    };
  }
  if (args.app.status !== "valid" || args.snapshot.validationStatus !== "ok") {
    return {
      live_status: "not_live" as const,
      not_live_reason: "validation_failed" as const,
    };
  }
  if (args.enabledTools.length === 0) {
    return {
      live_status: "not_live" as const,
      not_live_reason: "no_tools_discovered" as const,
    };
  }
  return {
    live_status: "live" as const,
    not_live_reason: null,
  };
}

function mapHarnessMount(args: {
  scope: "user" | "community";
  ownerId: any;
  addedByUserId: any | null;
  mount: UserPlatformAppMountRow | CommunityAppMountRow;
  app: DeveloperAppRow;
  connection: AppConnectionRow | null;
  snapshot: AppToolSnapshotRow | null;
}) {
  const tools = mapHarnessTools({
    mountEnabledTools: args.mount.enabledTools,
    snapshot: args.snapshot,
  });
  const enabledTools = tools
    .filter((tool) => tool.enabled)
    .map((tool) => tool.tool_name);
  const liveState = deriveHarnessLiveState({
    enabled: args.mount.enabled,
    app: args.app,
    connection: args.connection,
    snapshot: args.snapshot,
    enabledTools,
  });
  return {
    id: `${args.scope}:${String(args.mount._id)}`,
    source_mount_id: String(args.mount._id),
    scope: args.scope,
    owner_id: String(args.ownerId),
    added_by_user_id: args.addedByUserId ? String(args.addedByUserId) : null,
    enabled: args.mount.enabled === true,
    enabled_tools: enabledTools,
    ...liveState,
    app: mapDeveloperAppReadModel(args.app),
    connection: mapAppConnectionReadModel(args.app, args.connection),
    tools,
  };
}

async function listUserHarnessMounts(ctx: any, userId: any) {
  const rows = (await ctx.db
    .query("userPlatformAppMounts")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect()) as UserPlatformAppMountRow[];
  rows.sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt);
  const mounts = [];
  for (const row of rows) {
    const app = await getDeveloperAppById(ctx, row.developerAppId);
    if (!app) continue;
    const connection = await getAppConnectionByDeveloperAppId(
      ctx,
      row.developerAppId,
    );
    const snapshot = await getAppToolSnapshotById(ctx, row.toolSnapshotId);
    mounts.push(
      mapHarnessMount({
        scope: "user",
        ownerId: row.userId,
        addedByUserId: row.userId,
        mount: row,
        app,
        connection,
        snapshot,
      }),
    );
  }
  return mounts;
}

async function listCommunityHarnessMounts(ctx: any, communityId: any) {
  const rows = (await ctx.db
    .query("communityAppMounts")
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .collect()) as CommunityAppMountRow[];
  rows.sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt);
  const mounts = [];
  for (const row of rows) {
    const app = await getDeveloperAppById(ctx, row.developerAppId);
    if (!app) continue;
    const connection = await getAppConnectionByDeveloperAppId(
      ctx,
      row.developerAppId,
    );
    const snapshot = await getAppToolSnapshotById(ctx, row.toolSnapshotId);
    mounts.push(
      mapHarnessMount({
        scope: "community",
        ownerId: row.communityId,
        addedByUserId: row.mountedByUserId,
        mount: row,
        app,
        connection,
        snapshot,
      }),
    );
  }
  return mounts;
}

export const listHarnessMounts = query({
  args: {
    authSubject: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    communityId: v.optional(v.id("communities")),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const personalMounts = await listUserHarnessMounts(ctx, userId);
    if (!args.communityId) return personalMounts;
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const communityMounts = await listCommunityHarnessMounts(
      ctx,
      args.communityId,
    );
    return [...personalMounts, ...communityMounts];
  },
});

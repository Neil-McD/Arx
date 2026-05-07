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
  buildStoredMcpToolSchemaTransport,
  normalizeStoredSnapshotTools,
} from "./mcpSnapshotCodec";
import {
  buildDeveloperAppAuthHeaders,
  callMcpTool,
  formatMcpToolResultOutput,
  initializeStreamableHttpMcpSession,
  sendInitializedNotification,
} from "./mcpHttpClient";
import {
  applyDiscoverAppResultPolicyToText,
  isDiscoverAppCatalogSingletonIdentity,
  resolveDiscoverAppCatalogConnectPolicy,
} from "../shared/discoverCatalog";

function coerceValidationReport(
  rawReport: unknown,
): {
  validation_status: "ok" | "error";
  validation_error: string | null;
  tool_count: number;
  stages: Array<{
    id: string;
    label: string;
    status: "ok" | "error" | "skipped";
    detail: string | null;
  }>;
} | null {
  if (!rawReport || typeof rawReport !== "object" || Array.isArray(rawReport)) {
    return null;
  }
  const report = rawReport as Record<string, unknown>;
  const rawStages = Array.isArray(report.stages) ? report.stages : [];
  return {
    validation_status:
      report.validation_status === "ok" ? "ok" : "error",
    validation_error: normalizeString(report.validation_error, 2_000) || null,
    tool_count:
      typeof report.tool_count === "number" && Number.isFinite(report.tool_count)
        ? Math.max(0, Math.floor(report.tool_count))
        : 0,
    stages: rawStages
      .map((rawStage) => {
        if (!rawStage || typeof rawStage !== "object" || Array.isArray(rawStage)) {
          return null;
        }
        const stage = rawStage as Record<string, unknown>;
        const status =
          stage.status === "ok" || stage.status === "error" || stage.status === "skipped"
            ? stage.status
            : "skipped";
        return {
          id: normalizeString(stage.id, 80),
          label: normalizeString(stage.label, 120),
          status,
          detail: normalizeString(stage.detail, 500) || null,
        };
      })
      .filter(
        (
          stage,
        ): stage is {
          id: string;
          label: string;
          status: "ok" | "error" | "skipped";
          detail: string | null;
        } => Boolean(stage?.id && stage.label),
      ),
  };
}

type ValidationReportRecord = NonNullable<ReturnType<typeof coerceValidationReport>>;

function withMountedStage(
  report: ReturnType<typeof coerceValidationReport>,
  status: "ok" | "error" | "skipped",
  detail: string | null,
): ValidationReportRecord {
  const stages = [
    ...(report?.stages ?? []),
    {
      id: "mounted",
      label: "Mounted into your personal layer",
      status,
      detail,
    },
  ];
  const validationStatus: "ok" | "error" =
    report?.validation_status === "ok" && status !== "error" ? "ok" : "error";
  return {
    validation_status: validationStatus,
    validation_error:
      status === "error"
        ? detail
        : (report?.validation_error ?? null),
    tool_count: report?.tool_count ?? 0,
    stages,
  };
}
import { encryptSecret } from "./providerConnections";
import { resolveUserIdForAuthenticatedRequest } from "./communityCore";

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

type UserPlatformAppMountSourceType = "personal" | "community";

type UserPlatformAppMountSourceRow = {
  _id: any;
  userId: any;
  userPlatformAppMountId: any;
  sourceType: UserPlatformAppMountSourceType;
  sourceKey: string;
  communityId?: any;
  communityAppMountId?: any;
  createdAt: number;
  updatedAt: number;
};

type UserHarnessAppSourceInput = {
  sourceType: UserPlatformAppMountSourceType;
  communityId?: any;
  communityAppMountId?: any;
};

type UserPlatformAppMountLiveStatus = "live" | "not_live";

type UserPlatformAppMountNotLiveReason =
  | "disabled"
  | "needs_auth"
  | "validation_failed"
  | "no_tools_discovered"
  | "missing_snapshot";

type RuntimeMountedUserPlatformAppTool = {
  user_platform_app_mount_id: any;
  developer_app_id: any;
  catalog_app_id: string | null;
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

type ConnectUserPlatformAppErrorCode =
  | "authenticated_user_required"
  | "connect_lookup_failed"
  | "developer_app_connection_secret_required"
  | "developer_app_create_failed"
  | "developer_app_secret_store_failed"
  | "developer_app_validation_failed"
  | "developer_app_snapshot_missing"
  | "developer_app_no_tools_discovered"
  | "developer_app_mount_failed"
  | "developer_app_connect_failed"
  | "developer_app_catalog_connect_rejected"
  | "developer_app_oauth_flow_required"
  | "server_unavailable";

type ConnectUserPlatformAppResultRecord = {
  ok: boolean;
  mount: unknown;
  validation_report: ReturnType<typeof coerceValidationReport> | null;
  error_code: ConnectUserPlatformAppErrorCode | null;
  error_message: string | null;
  connect_attempt_id: string | null;
};

function normalizeConnectAttemptId(value: unknown, nowMs: number): string {
  return normalizeString(value, 120) || `connect-${nowMs}`;
}

function resolveEndpointHost(value: string): string | null {
  try {
    return new URL(value).hostname || null;
  } catch {
    return null;
  }
}

function buildUserPlatformAppMountSourceKey(args: {
  sourceType: UserPlatformAppMountSourceType;
  userPlatformAppMountId: any;
  communityAppMountId?: any;
}): string {
  if (args.sourceType === "personal") {
    return `personal:${String(args.userPlatformAppMountId)}`;
  }
  const communityAppMountId = args.communityAppMountId
    ? String(args.communityAppMountId)
    : "";
  if (!communityAppMountId) throw new Error("community_app_mount_source_required");
  return `community:${communityAppMountId}`;
}

async function recordUserHarnessAppSource(args: {
  ctx: any;
  userId: any;
  userPlatformAppMountId: any;
  source: UserHarnessAppSourceInput;
  nowMs: number;
}): Promise<void> {
  await args.ctx.runMutation(
    internal.userPlatformAppMounts.upsertUserPlatformAppMountSourceInternal,
    {
      userId: args.userId,
      userPlatformAppMountId: args.userPlatformAppMountId,
      sourceType: args.source.sourceType,
      communityId: args.source.communityId,
      communityAppMountId: args.source.communityAppMountId,
      nowMs: args.nowMs,
    },
  );
}

async function listUserHarnessAppSourcesForMount(args: {
  ctx: any;
  userId: any;
  userPlatformAppMountId: any;
}): Promise<UserPlatformAppMountSourceRow[]> {
  return (await args.ctx.db
    .query("userPlatformAppMountSources")
    .withIndex("by_user_mount", (q: any) =>
      q
        .eq("userId", args.userId)
        .eq("userPlatformAppMountId", args.userPlatformAppMountId),
    )
    .collect()) as UserPlatformAppMountSourceRow[];
}

function buildConnectErrorMessage(
  code: ConnectUserPlatformAppErrorCode,
  appName: string,
): string {
  switch (code) {
    case "authenticated_user_required":
      return "Sign in before connecting a personal app.";
    case "connect_lookup_failed":
      return "Couldn't check your existing personal apps right now. Try again.";
    case "developer_app_connection_secret_required":
      return `Paste your ${appName} secret and try again.`;
    case "developer_app_create_failed":
      return `Couldn't prepare ${appName} for connection right now. Try again.`;
    case "developer_app_secret_store_failed":
      return `Couldn't store your ${appName} secret right now. Try again.`;
    case "developer_app_validation_failed":
      return `We couldn't validate ${appName}. Check the validation stages and try again.`;
    case "developer_app_snapshot_missing":
      return `Validation succeeded, but we couldn't save ${appName}'s discovered tools.`;
    case "developer_app_no_tools_discovered":
      return `${appName} responded, but no MCP tools were discovered.`;
    case "developer_app_mount_failed":
      return `Validation succeeded, but we couldn't mount ${appName} into your personal layer.`;
    case "developer_app_catalog_connect_rejected":
      return `${appName} is not ready for this connection path.`;
    case "developer_app_oauth_flow_required":
      return `Connect ${appName} through OAuth instead.`;
    case "server_unavailable":
      return "The personal app service is unavailable right now. Try again.";
    case "developer_app_connect_failed":
    default:
      return `We couldn't connect ${appName} right now. Try again.`;
  }
}

function buildConnectFailure(args: {
  code: ConnectUserPlatformAppErrorCode;
  appName: string;
  connectAttemptId: string;
  mount?: unknown;
  validationReport?: ReturnType<typeof coerceValidationReport> | null;
  errorMessage?: string | null;
}): ConnectUserPlatformAppResultRecord {
  return {
    ok: false,
    mount: args.mount ?? null,
    validation_report: args.validationReport ?? null,
    error_code: args.code,
    error_message:
      normalizeString(args.errorMessage, 2_000) ||
      buildConnectErrorMessage(args.code, args.appName),
    connect_attempt_id: args.connectAttemptId,
  };
}

function emitPersonalAppConnectTrace(
  event: string,
  args: {
    connectAttemptId: string;
    appName: string;
    endpointUrl: string;
    authType: string;
    code?: string | null;
    ok?: boolean;
    toolCount?: number;
  },
): void {
  console.log(event, {
    connect_attempt_id: args.connectAttemptId,
    app_name: args.appName,
    endpoint_host: resolveEndpointHost(args.endpointUrl),
    auth_type: args.authType,
    code: args.code ?? null,
    ok: args.ok ?? null,
    tool_count: args.toolCount ?? null,
  });
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
  mount: UserPlatformAppMountRow,
  tools: Array<{ tool_name: string }>,
): string[] {
  const allToolNames = tools.map((tool) => tool.tool_name);
  if (!Array.isArray(mount.enabledTools)) return allToolNames;
  const enabled = normalizeStringList(mount.enabledTools);
  return enabled.filter((toolName) => allToolNames.includes(toolName));
}

function deriveUserPlatformMountLiveState(args: {
  mount: UserPlatformAppMountRow;
  app: DeveloperAppRow;
  connection: AppConnectionRow | null;
  snapshot: AppToolSnapshotRow | null;
  enabledTools: string[];
}): {
  live_status: UserPlatformAppMountLiveStatus;
  not_live_reason: UserPlatformAppMountNotLiveReason | null;
} {
  if (!args.mount.enabled) {
    return { live_status: "not_live", not_live_reason: "disabled" };
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

function mapUserPlatformAppMountReadModel(args: {
  mount: UserPlatformAppMountRow;
  app: DeveloperAppRow;
  connection: AppConnectionRow | null;
  snapshot: AppToolSnapshotRow | null;
}) {
  const tools = normalizeSnapshotTools(args.snapshot);
  const selectedToolNames = new Set(computeSelectedToolNames(args.mount, tools));
  const enabledTools = Array.from(selectedToolNames);
  const liveState = deriveUserPlatformMountLiveState({
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
      catalog_app_id: args.app.catalogAppId ?? null,
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
  return toolSnapshotId
    ? ((await ctx.db.get(toolSnapshotId)) as AppToolSnapshotRow | null) ?? null
    : null;
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

export const findExistingUserPlatformMountByIdentityInternal = internalQuery({
  args: {
    userId: v.id("users"),
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
    const mounts = await listUserPlatformAppMountRows(ctx, args.userId);
    mounts.sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt);
    let endpointMatch: {
      mount: UserPlatformAppMountRow;
      app: DeveloperAppRow;
      connection: AppConnectionRow | null;
    } | null = null;
    for (const mount of mounts) {
      const app = await getDeveloperAppById(ctx, mount.developerAppId);
      if (!app) continue;
      const connection = await getAppConnectionByDeveloperAppId(
        ctx,
        mount.developerAppId,
      );
      if (
        useCatalogSingletonIdentity &&
        normalizedCatalogAppId &&
        normalizeString(app.catalogAppId, 120).toLowerCase() ===
          normalizedCatalogAppId
      ) {
        return { mount, app, connection };
      }
      if (
        !endpointMatch &&
        normalizedEndpointUrl &&
        app.endpointUrl === normalizedEndpointUrl &&
        app.authType === args.authType
      ) {
        endpointMatch = { mount, app, connection };
      }
    }
    return endpointMatch;
  },
});

async function resolveExistingMountForConnect(args: {
  ctx: any;
  userId: any;
  catalogAppId?: string;
  endpointUrl: string;
  authType: "none" | "api_key" | "bearer" | "oauth";
}): Promise<{
  mount: UserPlatformAppMountRow;
  app: DeveloperAppRow;
  connection: AppConnectionRow | null;
} | null> {
  return (await args.ctx.runQuery(
    internal.userPlatformAppMounts.findExistingUserPlatformMountByIdentityInternal,
    {
      userId: args.userId,
      catalogAppId: args.catalogAppId,
      endpointUrl: args.endpointUrl,
      authType: args.authType,
    },
  )) as {
    mount: UserPlatformAppMountRow;
    app: DeveloperAppRow;
    connection: AppConnectionRow | null;
  } | null;
}

async function upsertConnectedSecretForConnect(args: {
  ctx: any;
  developerAppId: any;
  secret: string;
  nowMs: number;
}): Promise<void> {
  const encryptedSecret = await encryptSecret(args.secret);
  await args.ctx.runMutation(internal.appConnections.upsertAppConnectionInternal, {
    developerAppId: args.developerAppId,
    connectionStatus: "connected",
    authKind: "secret",
    encryptedSecretHex: encryptedSecret.encryptedSecretHex,
    secretIvHex: encryptedSecret.secretIvHex,
    secretVersion: encryptedSecret.secretVersion,
    nowMs: args.nowMs,
  });
}

async function validateDeveloperAppForConnect(args: {
  ctx: any;
  developerAppId: any;
}): Promise<{
  validationStatus: string;
  validationError: string | null;
  validationReport: ReturnType<typeof coerceValidationReport> | null;
  snapshotTools: Array<{ tool_name?: unknown }>;
}> {
  const validation = (await args.ctx.runAction(
    internal.appValidation.validateDeveloperAppInternal,
    {
      developerAppId: args.developerAppId,
    },
  )) as {
    validation_status?: unknown;
    validation_error?: unknown;
    snapshot?: { tools?: unknown };
    validation_report?: unknown;
  };
  return {
    validationStatus: String(validation.validation_status ?? ""),
    validationError: normalizeString(validation.validation_error, 2_000) || null,
    validationReport: coerceValidationReport(validation.validation_report),
    snapshotTools: Array.isArray(validation.snapshot?.tools)
      ? (validation.snapshot?.tools as Array<{ tool_name?: unknown }>)
      : [],
  };
}

async function mountValidatedDeveloperAppForUser(args: {
  ctx: any;
  userId: any;
  developerAppId: any;
  toolSnapshotId?: any;
  enabledTools?: string[];
  source?: UserHarnessAppSourceInput;
  nowMs: number;
}): Promise<{ mountId: any; mount: unknown }> {
  const mountId = (await args.ctx.runMutation(
    internal.userPlatformAppMounts.upsertUserPlatformAppMountInternal,
    {
      userId: args.userId,
      developerAppId: args.developerAppId,
      toolSnapshotId: args.toolSnapshotId,
      enabled: true,
      enabledTools: args.enabledTools,
      nowMs: args.nowMs,
    },
  )) as any;
  await recordUserHarnessAppSource({
    ctx: args.ctx,
    userId: args.userId,
    userPlatformAppMountId: mountId,
    source: args.source ?? { sourceType: "personal" },
    nowMs: args.nowMs,
  });
  const mount = await args.ctx.runQuery(
    internal.userPlatformAppMounts.getUserPlatformAppMountReadModelInternal,
    {
      userId: args.userId,
      userPlatformAppMountId: mountId,
    },
  );
  return { mountId, mount };
}

async function mountSetupNeededDeveloperAppForUser(args: {
  ctx: any;
  userId: any;
  developerAppId: any;
  toolSnapshotId?: any;
  enabledTools?: string[];
  source?: UserHarnessAppSourceInput;
  nowMs: number;
}): Promise<unknown> {
  const mounted = await mountValidatedDeveloperAppForUser({
    ctx: args.ctx,
    userId: args.userId,
    developerAppId: args.developerAppId,
    toolSnapshotId: args.toolSnapshotId,
    enabledTools: args.enabledTools,
    source: args.source,
    nowMs: args.nowMs,
  });
  return mounted.mount;
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
    if (!app) {
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
      if (!app) continue;
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

    const connectionBundle = (await ctx.runAction(
      internal.appOAuth.getFreshDeveloperAppConnectionBundleInternal,
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
      const boundedOutput = applyDiscoverAppResultPolicyToText(
        mountedTool.catalog_app_id,
        formatMcpToolResultOutput(callResult),
      );
      const outputText = boundedOutput.outputText;
      return {
        status: isError ? ("error" as const) : ("ok" as const),
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
            result_truncated: boundedOutput.truncated,
            max_result_bytes: boundedOutput.maxResultBytes,
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
    secret: v.optional(v.string()),
    connectAttemptId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const nowMs = Date.now();
    const connectAttemptId = normalizeConnectAttemptId(
      args.connectAttemptId,
      nowMs,
    );
    emitPersonalAppConnectTrace("personal_app_connect.start", {
      connectAttemptId,
      appName: args.name,
      endpointUrl: args.endpointUrl,
      authType: args.authType,
    });

    let userId: any;
    try {
      ({ userId } = await resolveAuthenticatedActionUser({
        ctx,
        authSubject: args.authSubject ?? null,
      }));
    } catch (error) {
      emitPersonalAppConnectTrace("personal_app_connect.auth_failed", {
        connectAttemptId,
        appName: args.name,
        endpointUrl: args.endpointUrl,
        authType: args.authType,
        ok: false,
        code: "authenticated_user_required",
      });
      return buildConnectFailure({
        code: "authenticated_user_required",
        appName: args.name,
        connectAttemptId,
      });
    }

    if (args.authType === "oauth") {
      emitPersonalAppConnectTrace("personal_app_connect.oauth_rejected", {
        connectAttemptId,
        appName: args.name,
        endpointUrl: args.endpointUrl,
        authType: args.authType,
        ok: false,
        code: "developer_app_oauth_flow_required",
      });
      return buildConnectFailure({
        code: "developer_app_oauth_flow_required",
        appName: args.name,
        connectAttemptId,
      });
    }

    const connectPolicy = resolveDiscoverAppCatalogConnectPolicy({
      catalogAppId: args.catalogAppId,
      name: args.name,
      endpointUrl: args.endpointUrl,
      authType: args.authType,
    });
    if (!connectPolicy.ok) {
      emitPersonalAppConnectTrace("personal_app_connect.policy_rejected", {
        connectAttemptId,
        appName: args.name,
        endpointUrl: args.endpointUrl,
        authType: args.authType,
        ok: false,
        code: connectPolicy.code,
      });
      return buildConnectFailure({
        code: "developer_app_catalog_connect_rejected",
        appName: args.name,
        connectAttemptId,
        errorMessage: connectPolicy.message,
      });
    }
    const catalogAppId = connectPolicy.catalogAppId;
    const appName = connectPolicy.name;
    const endpointUrl = connectPolicy.endpointUrl;
    const authType = connectPolicy.authType;
    const normalizedSecret = normalizeString(args.secret, 10_000);
    let existingMount: {
      mount: UserPlatformAppMountRow;
      app: DeveloperAppRow;
      connection: AppConnectionRow | null;
    } | null = null;
    try {
      existingMount = await resolveExistingMountForConnect({
        ctx,
        userId,
        catalogAppId,
        endpointUrl,
        authType,
      });
      emitPersonalAppConnectTrace("personal_app_connect.lookup_existing", {
        connectAttemptId,
        appName,
        endpointUrl,
        authType,
        ok: true,
      });
    } catch (error) {
      emitPersonalAppConnectTrace("personal_app_connect.lookup_existing", {
        connectAttemptId,
        appName,
        endpointUrl,
        authType,
        ok: false,
        code: "connect_lookup_failed",
      });
      return buildConnectFailure({
        code: "connect_lookup_failed",
        appName,
        connectAttemptId,
      });
    }

    if (existingMount) {
      try {
        if (authType !== "none") {
          if (normalizedSecret) {
            await upsertConnectedSecretForConnect({
              ctx,
              developerAppId: existingMount.app._id,
              secret: normalizedSecret,
              nowMs,
            });
          } else if (existingMount.connection?.connectionStatus !== "connected") {
            const mount = await mountSetupNeededDeveloperAppForUser({
              ctx,
              userId,
              developerAppId: existingMount.app._id,
              toolSnapshotId: existingMount.mount.toolSnapshotId,
              enabledTools: existingMount.mount.enabledTools,
              nowMs,
            });
            return buildConnectFailure({
              code: "developer_app_connection_secret_required",
              appName,
              connectAttemptId,
              mount,
            });
          }
        }

        emitPersonalAppConnectTrace("personal_app_connect.validate.start", {
          connectAttemptId,
          appName,
          endpointUrl,
          authType,
        });
        const validation = await validateDeveloperAppForConnect({
          ctx,
          developerAppId: existingMount.app._id,
        });
        if (validation.validationStatus !== "ok") {
          const mount = await mountSetupNeededDeveloperAppForUser({
            ctx,
            userId,
            developerAppId: existingMount.app._id,
            toolSnapshotId: existingMount.mount.toolSnapshotId,
            enabledTools: existingMount.mount.enabledTools,
            nowMs,
          });
          emitPersonalAppConnectTrace("personal_app_connect.validate.failure", {
            connectAttemptId,
            appName,
            endpointUrl,
            authType,
            ok: false,
            code: "developer_app_validation_failed",
            toolCount: validation.validationReport?.tool_count ?? 0,
          });
          return buildConnectFailure({
            code: "developer_app_validation_failed",
            appName,
            connectAttemptId,
            mount,
            validationReport: withMountedStage(
              validation.validationReport,
              "skipped",
              "Mounting was skipped because validation failed.",
            ),
            errorMessage: validation.validationError,
          });
        }
        emitPersonalAppConnectTrace("personal_app_connect.validate.success", {
          connectAttemptId,
          appName,
          endpointUrl,
          authType,
          ok: true,
          toolCount: validation.validationReport?.tool_count ?? 0,
        });

        const refreshedApp = (await ctx.runQuery(
          internal.developerApps.getDeveloperAppByIdInternal,
          {
            developerAppId: existingMount.app._id,
          },
        )) as DeveloperAppRow | null;
        if (!refreshedApp?.activeSnapshotId) {
          const mount = await mountSetupNeededDeveloperAppForUser({
            ctx,
            userId,
            developerAppId: existingMount.app._id,
            toolSnapshotId: existingMount.mount.toolSnapshotId,
            enabledTools: existingMount.mount.enabledTools,
            nowMs,
          });
          return buildConnectFailure({
            code: "developer_app_snapshot_missing",
            appName,
            connectAttemptId,
            mount,
            validationReport: withMountedStage(
              validation.validationReport,
              "error",
              "Validation succeeded, but no active tool snapshot was available.",
            ),
          });
        }

        const mounted = await mountValidatedDeveloperAppForUser({
          ctx,
          userId,
          developerAppId: existingMount.app._id,
          toolSnapshotId: refreshedApp.activeSnapshotId,
          enabledTools: existingMount.mount.enabledTools,
          nowMs,
        });
        emitPersonalAppConnectTrace("personal_app_connect.mount.success", {
          connectAttemptId,
          appName,
          endpointUrl,
          authType,
          ok: true,
          toolCount: validation.validationReport?.tool_count ?? 0,
        });
        return {
          ok: true,
          mount: mounted.mount,
          validation_report: withMountedStage(
            validation.validationReport,
            "ok",
            "Personal tools were mounted successfully.",
          ),
          error_code: null,
          error_message: null,
          connect_attempt_id: connectAttemptId,
        };
      } catch (error) {
        emitPersonalAppConnectTrace("personal_app_connect.mount.failure", {
          connectAttemptId,
          appName,
          endpointUrl,
          authType,
          ok: false,
          code: "developer_app_mount_failed",
        });
        return buildConnectFailure({
          code: "developer_app_mount_failed",
          appName,
          connectAttemptId,
        });
      }
    }

    let developerAppId: any = null;
    try {
      emitPersonalAppConnectTrace("personal_app_connect.create_app", {
        connectAttemptId,
        appName,
        endpointUrl,
        authType,
      });
      developerAppId = (await ctx.runMutation(
        internal.developerApps.createDeveloperAppInternal,
        {
          ownerUserId: userId,
          catalogAppId,
          name: appName,
          slug: undefined,
          description: args.description,
          endpointUrl,
          authType,
          nowMs,
        },
      )) as any;

      if (authType !== "none") {
        if (!normalizedSecret) {
          const mount = await mountSetupNeededDeveloperAppForUser({
            ctx,
            userId,
            developerAppId,
            nowMs,
          });
          return buildConnectFailure({
            code: "developer_app_connection_secret_required",
            appName,
            connectAttemptId,
            mount,
          });
        }
        try {
          emitPersonalAppConnectTrace("personal_app_connect.store_secret", {
            connectAttemptId,
            appName,
            endpointUrl,
            authType,
          });
          await upsertConnectedSecretForConnect({
            ctx,
            developerAppId,
            secret: normalizedSecret,
            nowMs,
          });
        } catch (error) {
          emitPersonalAppConnectTrace("personal_app_connect.store_secret.failure", {
            connectAttemptId,
            appName,
            endpointUrl,
            authType,
            ok: false,
            code: "developer_app_secret_store_failed",
          });
          const mount = await mountSetupNeededDeveloperAppForUser({
            ctx,
            userId,
            developerAppId,
            nowMs,
          });
          return buildConnectFailure({
            code: "developer_app_secret_store_failed",
            appName,
            connectAttemptId,
            mount,
          });
        }
      }

      emitPersonalAppConnectTrace("personal_app_connect.validate.start", {
        connectAttemptId,
        appName,
        endpointUrl,
        authType,
      });
      const validation = await validateDeveloperAppForConnect({
        ctx,
        developerAppId,
      });
      if (validation.validationStatus !== "ok") {
        const app = (await ctx.runQuery(
          internal.developerApps.getDeveloperAppByIdInternal,
          {
            developerAppId,
          },
        )) as DeveloperAppRow | null;
        const mount = await mountSetupNeededDeveloperAppForUser({
          ctx,
          userId,
          developerAppId,
          toolSnapshotId: app?.activeSnapshotId,
          nowMs,
        });
        emitPersonalAppConnectTrace("personal_app_connect.validate.failure", {
          connectAttemptId,
          appName,
          endpointUrl,
          authType,
          ok: false,
          code: "developer_app_validation_failed",
          toolCount: validation.validationReport?.tool_count ?? 0,
        });
        return buildConnectFailure({
          code: "developer_app_validation_failed",
          appName,
          connectAttemptId,
          mount,
          validationReport: withMountedStage(
            validation.validationReport,
            "skipped",
            "Mounting was skipped because validation failed.",
          ),
          errorMessage: validation.validationError,
        });
      }
      emitPersonalAppConnectTrace("personal_app_connect.validate.success", {
        connectAttemptId,
        appName,
        endpointUrl,
        authType,
        ok: true,
        toolCount: validation.validationReport?.tool_count ?? 0,
      });

      const app = (await ctx.runQuery(
        internal.developerApps.getDeveloperAppForOwnerInternal,
        {
          userId,
          developerAppId,
        },
      )) as DeveloperAppRow;
      if (!app.activeSnapshotId) {
        const mount = await mountSetupNeededDeveloperAppForUser({
          ctx,
          userId,
          developerAppId,
          nowMs,
        });
        return buildConnectFailure({
          code: "developer_app_snapshot_missing",
          appName,
          connectAttemptId,
          mount,
          validationReport: withMountedStage(
            validation.validationReport,
            "error",
            "Validation succeeded, but no active tool snapshot was available.",
          ),
        });
      }
      const enabledTools = validation.snapshotTools
        .map((tool) => normalizeString(tool.tool_name, 200))
        .filter(Boolean);
      if (enabledTools.length === 0) {
        const mount = await mountSetupNeededDeveloperAppForUser({
          ctx,
          userId,
          developerAppId,
          toolSnapshotId: app.activeSnapshotId,
          enabledTools: [],
          nowMs,
        });
        return buildConnectFailure({
          code: "developer_app_no_tools_discovered",
          appName,
          connectAttemptId,
          mount,
          validationReport: withMountedStage(
            validation.validationReport,
            "skipped",
            "Mounting was skipped because no tools were discovered.",
          ),
        });
      }

      const mounted = await mountValidatedDeveloperAppForUser({
        ctx,
        userId,
        developerAppId,
        toolSnapshotId: app.activeSnapshotId,
        enabledTools,
        nowMs,
      });
      emitPersonalAppConnectTrace("personal_app_connect.mount.success", {
        connectAttemptId,
        appName,
        endpointUrl,
        authType,
        ok: true,
        toolCount: validation.validationReport?.tool_count ?? 0,
      });
      return {
        ok: true,
        mount: mounted.mount,
        validation_report: withMountedStage(
          validation.validationReport,
          "ok",
          "Personal tools were mounted successfully.",
        ),
        error_code: null,
        error_message: null,
        connect_attempt_id: connectAttemptId,
      };
    } catch (error) {
      let mount: unknown = null;
      if (developerAppId) {
        try {
          mount = await mountSetupNeededDeveloperAppForUser({
            ctx,
            userId,
            developerAppId,
            nowMs,
          });
        } catch {
          mount = null;
        }
      }
      const errorCode: ConnectUserPlatformAppErrorCode = developerAppId
        ? "developer_app_connect_failed"
        : "developer_app_create_failed";
      emitPersonalAppConnectTrace(
        developerAppId
          ? "personal_app_connect.mount.failure"
          : "personal_app_connect.create_app.failure",
        {
        connectAttemptId,
        appName,
        endpointUrl,
        authType,
        ok: false,
        code: errorCode,
        },
      );
      return buildConnectFailure({
        code: errorCode,
        appName,
        connectAttemptId,
        mount,
      });
    }
  },
});

export const refreshUserPlatformApp = action({
  args: {
    authSubject: v.optional(v.string()),
    userPlatformAppMountId: v.id("userPlatformAppMounts"),
  },
  handler: async (ctx, args): Promise<unknown> => {
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
  handler: async (ctx, args): Promise<unknown> => {
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
    if (!updated || !app) {
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
    const mount = await getUserPlatformAppMountById(
      ctx,
      args.userPlatformAppMountId,
    );
    if (!mount) {
      return {
        removed: true,
        id: String(args.userPlatformAppMountId),
      };
    }
    if (String(mount.userId) !== String(userId)) {
      throw new Error("user_platform_app_mount_not_found");
    }
    const sourceRows = await listUserHarnessAppSourcesForMount({
      ctx,
      userId,
      userPlatformAppMountId: mount._id,
    });
    for (const source of sourceRows) {
      await ctx.db.delete(source._id);
    }
    await ctx.db.delete(mount._id);
    return {
      removed: true,
      id: String(mount._id),
    };
  },
});

export const promoteCommunityAppGrantSourcesToPersonalInternal = internalMutation({
  args: {
    communityAppMountId: v.id("communityAppMounts"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = args.nowMs ?? Date.now();
    const sourceRows = (await ctx.db
      .query("userPlatformAppMountSources")
      .withIndex("by_community_mount", (q: any) =>
        q.eq("communityAppMountId", args.communityAppMountId),
      )
      .collect()) as UserPlatformAppMountSourceRow[];
    let removedCommunitySourceCount = 0;
    let promotedPersonalSourceCount = 0;
    let existingPersonalSourceCount = 0;
    let skippedMissingMountCount = 0;

    for (const source of sourceRows) {
      const mount = await getUserPlatformAppMountById(
        ctx,
        source.userPlatformAppMountId,
      );
      await ctx.db.delete(source._id);
      removedCommunitySourceCount += 1;

      if (!mount) {
        skippedMissingMountCount += 1;
        continue;
      }

      const sourceKey = buildUserPlatformAppMountSourceKey({
        sourceType: "personal",
        userPlatformAppMountId: mount._id,
      });
      const existingPersonalSource = await ctx.db
        .query("userPlatformAppMountSources")
        .withIndex("by_user_sourceKey", (q: any) =>
          q.eq("userId", mount.userId).eq("sourceKey", sourceKey),
        )
        .first();
      if (existingPersonalSource) {
        await ctx.db.patch(existingPersonalSource._id, {
          userPlatformAppMountId: mount._id,
          sourceType: "personal",
          sourceKey,
          updatedAt: nowMs,
        });
        existingPersonalSourceCount += 1;
        continue;
      }

      await ctx.db.insert("userPlatformAppMountSources", {
        userId: mount.userId,
        userPlatformAppMountId: mount._id,
        sourceType: "personal",
        sourceKey,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      promotedPersonalSourceCount += 1;
    }

    return {
      removed_community_source_count: removedCommunitySourceCount,
      promoted_personal_source_count: promotedPersonalSourceCount,
      existing_personal_source_count: existingPersonalSourceCount,
      skipped_missing_mount_count: skippedMissingMountCount,
    };
  },
});

export const upsertUserPlatformAppMountSourceInternal = internalMutation({
  args: {
    userId: v.id("users"),
    userPlatformAppMountId: v.id("userPlatformAppMounts"),
    sourceType: v.union(v.literal("personal"), v.literal("community")),
    communityId: v.optional(v.id("communities")),
    communityAppMountId: v.optional(v.id("communityAppMounts")),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (
      args.sourceType === "community" &&
      (!args.communityId || !args.communityAppMountId)
    ) {
      throw new Error("community_app_mount_source_required");
    }
    const nowMs = args.nowMs ?? Date.now();
    const sourceKey = buildUserPlatformAppMountSourceKey({
      sourceType: args.sourceType,
      userPlatformAppMountId: args.userPlatformAppMountId,
      communityAppMountId: args.communityAppMountId,
    });
    const existing = await ctx.db
      .query("userPlatformAppMountSources")
      .withIndex("by_user_sourceKey", (q: any) =>
        q.eq("userId", args.userId).eq("sourceKey", sourceKey),
      )
      .first();
    const patch = {
      userId: args.userId,
      userPlatformAppMountId: args.userPlatformAppMountId,
      sourceType: args.sourceType,
      sourceKey,
      ...(args.sourceType === "community"
        ? {
            communityId: args.communityId,
            communityAppMountId: args.communityAppMountId,
          }
        : {}),
      updatedAt: nowMs,
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return await ctx.db.insert("userPlatformAppMountSources", {
      ...patch,
      createdAt: nowMs,
    });
  },
});

export const upsertUserPlatformAppMountInternal = internalMutation({
  args: {
    userId: v.id("users"),
    developerAppId: v.id("developerApps"),
    toolSnapshotId: v.optional(v.id("appToolSnapshots")),
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
        toolSnapshotId: args.toolSnapshotId ?? undefined,
        enabled: args.enabled,
        enabledTools: args.enabledTools ?? existing.enabledTools,
        updatedAt: nowMs,
      });
      return existing._id;
    }
    return await ctx.db.insert("userPlatformAppMounts", {
      userId: args.userId,
      developerAppId: args.developerAppId,
      ...(args.toolSnapshotId ? { toolSnapshotId: args.toolSnapshotId } : {}),
      enabled: args.enabled,
      enabledTools: args.enabledTools,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
  },
});

export const ensureUserHarnessAppInternal = internalAction({
  args: {
    userId: v.id("users"),
    catalogAppId: v.optional(v.string()),
    name: v.string(),
    description: v.optional(v.string()),
    endpointUrl: v.string(),
    authType: v.union(
      v.literal("none"),
      v.literal("api_key"),
      v.literal("bearer"),
      v.literal("oauth"),
    ),
    toolSnapshotId: v.optional(v.id("appToolSnapshots")),
    enabled: v.optional(v.boolean()),
    enabledTools: v.optional(v.array(v.string())),
    sourceType: v.union(v.literal("personal"), v.literal("community")),
    communityId: v.optional(v.id("communities")),
    communityAppMountId: v.optional(v.id("communityAppMounts")),
    updateExistingMount: v.optional(v.boolean()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    if (
      args.sourceType === "community" &&
      (!args.communityId || !args.communityAppMountId)
    ) {
      throw new Error("community_app_mount_source_required");
    }
    const nowMs = args.nowMs ?? Date.now();
    const source: UserHarnessAppSourceInput = {
      sourceType: args.sourceType,
      communityId: args.communityId,
      communityAppMountId: args.communityAppMountId,
    };
    const existing = (await ctx.runQuery(
      internal.userPlatformAppMounts.findExistingUserPlatformMountByIdentityInternal,
      {
        userId: args.userId,
        catalogAppId: args.catalogAppId,
        endpointUrl: args.endpointUrl,
        authType: args.authType,
      },
    )) as {
      mount: UserPlatformAppMountRow;
      app: DeveloperAppRow;
      connection: AppConnectionRow | null;
    } | null;

    if (existing) {
      let mountId = existing.mount._id;
      if (args.updateExistingMount === true) {
        mountId = (await ctx.runMutation(
          internal.userPlatformAppMounts.upsertUserPlatformAppMountInternal,
          {
            userId: args.userId,
            developerAppId: existing.app._id,
            toolSnapshotId: args.toolSnapshotId ?? existing.mount.toolSnapshotId,
            enabled: args.enabled ?? existing.mount.enabled,
            enabledTools: args.enabledTools ?? existing.mount.enabledTools,
            nowMs,
          },
        )) as any;
      }
      await recordUserHarnessAppSource({
        ctx,
        userId: args.userId,
        userPlatformAppMountId: mountId,
        source,
        nowMs,
      });
      const mount = await ctx.runQuery(
        internal.userPlatformAppMounts.getUserPlatformAppMountReadModelInternal,
        {
          userId: args.userId,
          userPlatformAppMountId: mountId,
        },
      );
      return {
        ok: true,
        ensured: true,
        created: false,
        reused: true,
        source_type: args.sourceType,
        mount,
      };
    }

    const developerAppId = (await ctx.runMutation(
      internal.developerApps.createDeveloperAppInternal,
      {
        ownerUserId: args.userId,
        catalogAppId: args.catalogAppId,
        name: args.name,
        slug: undefined,
        description: args.description,
        endpointUrl: args.endpointUrl,
        authType: args.authType,
        nowMs,
      },
    )) as any;
    const mountId = (await ctx.runMutation(
      internal.userPlatformAppMounts.upsertUserPlatformAppMountInternal,
      {
        userId: args.userId,
        developerAppId,
        toolSnapshotId: args.toolSnapshotId,
        enabled: args.enabled ?? true,
        enabledTools: args.enabledTools,
        nowMs,
      },
    )) as any;
    await recordUserHarnessAppSource({
      ctx,
      userId: args.userId,
      userPlatformAppMountId: mountId,
      source,
      nowMs,
    });
    const mount = await ctx.runQuery(
      internal.userPlatformAppMounts.getUserPlatformAppMountReadModelInternal,
      {
        userId: args.userId,
        userPlatformAppMountId: mountId,
      },
    );
    return {
      ok: true,
      ensured: true,
      created: true,
      reused: false,
      source_type: args.sourceType,
      mount,
    };
  },
});

export const seedCommunityAppGrantIntoUserHarnessInternal = internalAction({
  args: {
    userId: v.id("users"),
    communityAppMountId: v.id("communityAppMounts"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const seedSource = (await ctx.runQuery(
      internal.communityAppMounts.getCommunityAppMountSeedSourceInternal,
      {
        communityAppMountId: args.communityAppMountId,
      },
    )) as {
      mount: {
        _id: any;
        communityId: any;
        enabled?: boolean;
        enabledTools?: string[];
      };
      app: DeveloperAppRow;
    } | null;
    if (!seedSource) {
      return {
        ok: false,
        seeded: false,
        reason: "community_app_grant_not_found",
        mount: null,
      };
    }

    const ensured = (await ctx.runAction(
      internal.userPlatformAppMounts.ensureUserHarnessAppInternal,
      {
        userId: args.userId,
        catalogAppId: seedSource.app.catalogAppId,
        name: seedSource.app.name,
        description: seedSource.app.description,
        endpointUrl: seedSource.app.endpointUrl,
        authType: seedSource.app.authType,
        enabled: seedSource.mount.enabled !== false,
        enabledTools: Array.isArray(seedSource.mount.enabledTools)
          ? seedSource.mount.enabledTools
          : undefined,
        sourceType: "personal",
        updateExistingMount: false,
        nowMs: args.nowMs,
      },
    )) as {
      ok?: boolean;
      created?: boolean;
      reused?: boolean;
      mount?: unknown;
    } | null;
    return {
      ok: ensured?.ok === true,
      seeded: ensured?.created === true,
      reason: ensured?.reused
        ? "existing_user_app_reused"
        : "user_app_installed_from_community",
      mount: ensured?.mount ?? null,
    };
  },
});

export const seedCommunityAppGrantForExistingMembersInternal = internalAction({
  args: {
    communityId: v.id("communities"),
    communityAppMountId: v.id("communityAppMounts"),
    skipUserId: v.optional(v.id("users")),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const recipientUserIds = (await ctx.runQuery(
      internal.communityAppMounts.listCommunityAppGrantRecipientUserIdsInternal,
      {
        communityId: args.communityId,
      },
    )) as any[];
    let scheduledCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const failures: Array<{
      user_id: string;
      error: string;
    }> = [];

    for (const userId of recipientUserIds) {
      if (args.skipUserId && String(userId) === String(args.skipUserId)) {
        skippedCount += 1;
        continue;
      }
      try {
        await ctx.scheduler.runAfter(
          0,
          internal.userPlatformAppMounts.seedCommunityAppGrantIntoUserHarnessInternal,
          {
            userId,
            communityAppMountId: args.communityAppMountId,
            nowMs: args.nowMs,
          },
        );
        scheduledCount += 1;
      } catch (error) {
        failedCount += 1;
        failures.push({
          user_id: String(userId),
          error: error instanceof Error ? error.message : String(error ?? ""),
        });
      }
    }

    return {
      ok: failedCount === 0,
      community_id: String(args.communityId),
      community_app_mount_id: String(args.communityAppMountId),
      recipient_count: recipientUserIds.length,
      scheduled_count: scheduledCount,
      skipped_count: skippedCount,
      failed_count: failedCount,
      failures,
    };
  },
});

export const seedCommunityAppGrantsForUserInternal = internalAction({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const seedSources = (await ctx.runQuery(
      internal.communityAppMounts.listCommunityAppGrantSeedSourcesInternal,
      {
        communityId: args.communityId,
      },
    )) as Array<{
      mount: {
        _id: any;
        communityId: any;
        enabled?: boolean;
        enabledTools?: string[];
      };
      app: DeveloperAppRow;
    }>;
    let createdCount = 0;
    let reusedCount = 0;
    let failedCount = 0;
    const failures: Array<{
      community_app_mount_id: string;
      error: string;
    }> = [];

    for (const seedSource of seedSources) {
      try {
        const ensured = (await ctx.runAction(
          internal.userPlatformAppMounts.ensureUserHarnessAppInternal,
          {
            userId: args.userId,
            catalogAppId: seedSource.app.catalogAppId,
            name: seedSource.app.name,
            description: seedSource.app.description,
            endpointUrl: seedSource.app.endpointUrl,
            authType: seedSource.app.authType,
            enabled: seedSource.mount.enabled !== false,
            enabledTools: Array.isArray(seedSource.mount.enabledTools)
              ? seedSource.mount.enabledTools
              : undefined,
            sourceType: "personal",
            updateExistingMount: false,
            nowMs: args.nowMs,
          },
        )) as {
          created?: boolean;
          reused?: boolean;
        } | null;
        if (ensured?.created) {
          createdCount += 1;
        } else {
          reusedCount += 1;
        }
      } catch (error) {
        failedCount += 1;
        failures.push({
          community_app_mount_id: String(seedSource.mount._id),
          error: error instanceof Error ? error.message : String(error ?? ""),
        });
      }
    }

    return {
      ok: failedCount === 0,
      community_id: String(args.communityId),
      user_id: String(args.userId),
      grant_count: seedSources.length,
      created_count: createdCount,
      reused_count: reusedCount,
      failed_count: failedCount,
      failures,
    };
  },
});

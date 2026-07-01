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
  buildDiscoverAppDefaultEnabledToolNames,
  filterDiscoverAppEnabledToolNames,
  isDiscoverAppCatalogSingletonIdentity,
  resolveDiscoverAppCatalogConnectPolicy,
  resolveDiscoverAppProjectedToolRisk,
  validateDiscoverAppSecretForCatalogAppId,
} from "../shared/discoverCatalog";
import {
  resolveCommunityWorkflowImportMcpRegistryConnectPolicy,
} from "../shared/communityWorkflowImportMcpRegistry";

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
import {
  requireCommunityChatAccess,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";

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

type CommunityAppGrantRecipientRow = {
  userId: any;
  active?: boolean;
  revokedAt?: number;
};

type CommunityAppSourceProvenanceFinding = {
  code:
    | "missing_community_source"
    | "missing_user_harness_app"
    | "missing_community"
    | "missing_developer_app";
  communityAppMountId: string;
  communityId: string;
  developerAppId: string;
  userId?: string;
  userPlatformAppMountId?: string;
  appName?: string;
  sourceTypes?: string[];
  repaired?: boolean;
};

type UserPlatformAppMountLiveStatus = "live" | "not_live";

type UserPlatformAppMountNotLiveReason =
  | "disabled"
  | "needs_auth"
  | "needs_config"
  | "needs_runtime"
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
  | "developer_app_connection_secret_policy_rejected"
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

function normalizeProvenanceAuditLimit(
  value: number | undefined,
  fallback: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(value)));
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

async function listCommunityAppSourceProvenanceRecipientUserIds(
  ctx: any,
  communityId: any,
  maxRecipients: number,
): Promise<{ userIds: any[]; truncated: boolean }> {
  const community = (await ctx.db.get(communityId)) as { ownerId?: any } | null;
  if (!community) return { userIds: [], truncated: false };
  const recipients: any[] = [];
  const seen = new Set<string>();
  let truncated = false;
  const addRecipient = (userId: any) => {
    const key = String(userId ?? "");
    if (!key || seen.has(key)) return;
    if (recipients.length >= maxRecipients) {
      truncated = true;
      return;
    }
    seen.add(key);
    recipients.push(userId);
  };

  addRecipient(community.ownerId);
  const membershipRows = (await ctx.db
    .query("communityMemberships")
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .take(maxRecipients + 1)) as CommunityAppGrantRecipientRow[];
  if (membershipRows.length > maxRecipients) {
    truncated = true;
  }
  for (const membership of membershipRows.slice(0, maxRecipients)) {
    if (membership.active === false) continue;
    if (typeof membership.revokedAt === "number") continue;
    addRecipient(membership.userId);
  }
  return { userIds: recipients, truncated };
}

async function collectCommunityAppSourceProvenanceAudit(args: {
  ctx: any;
  limit: number;
  maxPairs: number;
  maxCommunityAppMounts: number;
  maxRecipientsPerCommunity: number;
  repair: boolean;
  nowMs: number;
}): Promise<{
  summary: {
    communityAppMountsScanned: number;
    disabledCommunityAppMountsSkipped: number;
    recipientPairsScanned: number;
    existingCommunitySourcePairs: number;
    missingCommunitySourcePairs: number;
    missingUserHarnessAppPairs: number;
    missingCommunityRecords: number;
    missingDeveloperAppRecords: number;
    repairedCommunitySourcePairs: number;
  };
  findings: CommunityAppSourceProvenanceFinding[];
  limits: {
    findingLimit: number;
    maxPairs: number;
    maxCommunityAppMounts: number;
    maxRecipientsPerCommunity: number;
  };
  truncated: boolean;
  dry_run: boolean;
  computedAt: number;
}> {
  const summary = {
    communityAppMountsScanned: 0,
    disabledCommunityAppMountsSkipped: 0,
    recipientPairsScanned: 0,
    existingCommunitySourcePairs: 0,
    missingCommunitySourcePairs: 0,
    missingUserHarnessAppPairs: 0,
    missingCommunityRecords: 0,
    missingDeveloperAppRecords: 0,
    repairedCommunitySourcePairs: 0,
  };
  const findings: CommunityAppSourceProvenanceFinding[] = [];
  let truncated = false;
  const pushFinding = (finding: CommunityAppSourceProvenanceFinding) => {
    if (findings.length < args.limit) {
      findings.push(finding);
    } else {
      truncated = true;
    }
  };

  const communityAppMountRows = (await args.ctx.db
    .query("communityAppMounts")
    .order("asc")
    .take(args.maxCommunityAppMounts + 1)) as Array<{
    _id: any;
    communityId: any;
    developerAppId: any;
    enabled?: boolean;
  }>;
  if (communityAppMountRows.length > args.maxCommunityAppMounts) {
    truncated = true;
  }
  const communityAppMounts = communityAppMountRows.slice(
    0,
    args.maxCommunityAppMounts,
  );

  for (const communityAppMount of communityAppMounts) {
    summary.communityAppMountsScanned += 1;
    if (communityAppMount.enabled === false) {
      summary.disabledCommunityAppMountsSkipped += 1;
      continue;
    }

    const community = await args.ctx.db.get(communityAppMount.communityId);
    if (!community) {
      summary.missingCommunityRecords += 1;
      pushFinding({
        code: "missing_community",
        communityAppMountId: String(communityAppMount._id),
        communityId: String(communityAppMount.communityId),
        developerAppId: String(communityAppMount.developerAppId),
      });
      continue;
    }

    const developerApp = (await args.ctx.db.get(
      communityAppMount.developerAppId,
    )) as DeveloperAppRow | null;
    if (!developerApp) {
      summary.missingDeveloperAppRecords += 1;
      pushFinding({
        code: "missing_developer_app",
        communityAppMountId: String(communityAppMount._id),
        communityId: String(communityAppMount.communityId),
        developerAppId: String(communityAppMount.developerAppId),
      });
      continue;
    }

    const recipientScan = await listCommunityAppSourceProvenanceRecipientUserIds(
      args.ctx,
      communityAppMount.communityId,
      args.maxRecipientsPerCommunity,
    );
    if (recipientScan.truncated) {
      truncated = true;
    }
    for (const userId of recipientScan.userIds) {
      if (summary.recipientPairsScanned >= args.maxPairs) {
        truncated = true;
        break;
      }
      summary.recipientPairsScanned += 1;
      const existingUserHarnessApp =
        await findExistingUserPlatformMountByDeveloperAppIdentity(
          args.ctx,
          userId,
          developerApp,
        );
      const userPlatformAppMount = existingUserHarnessApp?.mount ?? null;
      if (!userPlatformAppMount) {
        summary.missingUserHarnessAppPairs += 1;
        pushFinding({
          code: "missing_user_harness_app",
          communityAppMountId: String(communityAppMount._id),
          communityId: String(communityAppMount.communityId),
          developerAppId: String(communityAppMount.developerAppId),
          userId: String(userId),
          appName: String(developerApp.name ?? ""),
        });
        continue;
      }

      const sourceRows = await listUserHarnessAppSourcesForMount({
        ctx: args.ctx,
        userId,
        userPlatformAppMountId: userPlatformAppMount._id,
      });
      const hasCommunitySource = sourceRows.some(
        (source) =>
          source.sourceType === "community" &&
          String(source.communityAppMountId) === String(communityAppMount._id),
      );
      if (hasCommunitySource) {
        summary.existingCommunitySourcePairs += 1;
        continue;
      }

      summary.missingCommunitySourcePairs += 1;
      let repaired = false;
      if (args.repair) {
        const sourceKey = buildUserPlatformAppMountSourceKey({
          sourceType: "community",
          userPlatformAppMountId: userPlatformAppMount._id,
          communityAppMountId: communityAppMount._id,
        });
        const existingSourceForKey = await args.ctx.db
          .query("userPlatformAppMountSources")
          .withIndex("by_user_sourceKey", (q: any) =>
            q.eq("userId", userId).eq("sourceKey", sourceKey),
          )
          .first();
        const patch = {
          userId,
          userPlatformAppMountId: userPlatformAppMount._id,
          sourceType: "community" as const,
          sourceKey,
          communityId: communityAppMount.communityId,
          communityAppMountId: communityAppMount._id,
          updatedAt: args.nowMs,
        };
        if (existingSourceForKey) {
          await args.ctx.db.patch(existingSourceForKey._id, patch);
        } else {
          await args.ctx.db.insert("userPlatformAppMountSources", {
            ...patch,
            createdAt: args.nowMs,
          });
        }
        summary.repairedCommunitySourcePairs += 1;
        repaired = true;
      }
      pushFinding({
        code: "missing_community_source",
        communityAppMountId: String(communityAppMount._id),
        communityId: String(communityAppMount.communityId),
        developerAppId: String(communityAppMount.developerAppId),
        userId: String(userId),
        userPlatformAppMountId: String(userPlatformAppMount._id),
        appName: String(developerApp.name ?? ""),
        sourceTypes: Array.from(
          new Set(sourceRows.map((source) => String(source.sourceType))),
        ),
        repaired,
      });
    }
    if (summary.recipientPairsScanned >= args.maxPairs) break;
  }

  return {
    summary,
    findings,
    limits: {
      findingLimit: args.limit,
      maxPairs: args.maxPairs,
      maxCommunityAppMounts: args.maxCommunityAppMounts,
      maxRecipientsPerCommunity: args.maxRecipientsPerCommunity,
    },
    truncated,
    dry_run: !args.repair,
    computedAt: args.nowMs,
  };
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
    case "developer_app_connection_secret_policy_rejected":
      return `Use a valid ${appName} secret for this connection path.`;
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
  catalogAppId?: string | null,
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
    risk_level: resolveDiscoverAppProjectedToolRisk({
      catalogAppId: catalogAppId ?? null,
      storedRisk: tool.risk_level,
      toolName: tool.tool_name,
    }),
  }));
}

function normalizeRuntimeSnapshotTools(
  snapshot: AppToolSnapshotRow | null,
  catalogAppId?: string | null,
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
    risk_level: resolveDiscoverAppProjectedToolRisk({
      catalogAppId: catalogAppId ?? null,
      storedRisk: tool.risk_level,
      toolName: tool.tool_name,
    }),
  }));
}

function computeSelectedToolNames(
  mount: UserPlatformAppMountRow,
  tools: Array<{ tool_name: string }>,
  catalogAppId?: string | null,
): string[] {
  const allToolNames = tools.map((tool) => tool.tool_name);
  if (!Array.isArray(mount.enabledTools)) {
    return buildDiscoverAppDefaultEnabledToolNames(
      catalogAppId ?? null,
      tools,
    );
  }
  const enabled = normalizeStringList(mount.enabledTools);
  return filterDiscoverAppEnabledToolNames(
    catalogAppId ?? null,
    enabled.filter((toolName) => allToolNames.includes(toolName)),
  );
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
  if (args.app.setupStatus === "needs_runtime") {
    return { live_status: "not_live", not_live_reason: "needs_runtime" };
  }
  if (args.app.setupStatus === "needs_config") {
    return { live_status: "not_live", not_live_reason: "needs_config" };
  }
  if (args.app.setupStatus === "needs_auth") {
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

function mapUserPlatformAppMountReadModel(args: {
  mount: UserPlatformAppMountRow;
  app: DeveloperAppRow;
  connection: AppConnectionRow | null;
  snapshot: AppToolSnapshotRow | null;
}) {
  const tools = normalizeSnapshotTools(
    args.snapshot,
    args.app.catalogAppId ?? null,
  );
  const selectedToolNames = new Set(
    computeSelectedToolNames(args.mount, tools, args.app.catalogAppId ?? null),
  );
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
  const tools = normalizeRuntimeSnapshotTools(
    args.snapshot,
    args.app.catalogAppId ?? null,
  );
  const selectedToolNames = new Set(
    computeSelectedToolNames(args.mount, tools, args.app.catalogAppId ?? null),
  );
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

function developerAppsSharePersonalIdentity(
  left: DeveloperAppRow,
  right: DeveloperAppRow,
): boolean {
  const leftCatalogAppId = normalizeString(left.catalogAppId, 120).toLowerCase();
  const rightCatalogAppId = normalizeString(right.catalogAppId, 120).toLowerCase();
  if (
    leftCatalogAppId &&
    rightCatalogAppId &&
    leftCatalogAppId === rightCatalogAppId &&
    isDiscoverAppCatalogSingletonIdentity(leftCatalogAppId)
  ) {
    return true;
  }
  const leftEndpoint = normalizeDeveloperAppEndpointUrl(left.endpointUrl);
  const rightEndpoint = normalizeDeveloperAppEndpointUrl(right.endpointUrl);
  return (
    Boolean(leftEndpoint && rightEndpoint) &&
    leftEndpoint === rightEndpoint &&
    left.authType === right.authType
  );
}

async function findExistingUserPlatformMountByDeveloperAppIdentity(
  ctx: any,
  userId: any,
  targetApp: DeveloperAppRow,
): Promise<{
  mount: UserPlatformAppMountRow;
  app: DeveloperAppRow;
  connection: AppConnectionRow | null;
} | null> {
  const mounts = await listUserPlatformAppMountRows(ctx, userId);
  mounts.sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt);
  for (const mount of mounts) {
    const app = await getDeveloperAppById(ctx, mount.developerAppId);
    if (!app) continue;
    if (!developerAppsSharePersonalIdentity(targetApp, app)) continue;
    const connection = await getAppConnectionByDeveloperAppId(
      ctx,
      mount.developerAppId,
    );
    return { mount, app, connection };
  }
  return null;
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
  catalogAppId?: string | null;
  snapshot: AppToolSnapshotRow | null;
  enabled?: boolean;
  enabledTools?: unknown;
  nowMs?: number;
}) {
  const tools = normalizeSnapshotTools(args.snapshot);
  const allToolNames = tools.map((tool) => tool.tool_name);
  const nextEnabledTools = Array.isArray(args.enabledTools)
    ? filterDiscoverAppEnabledToolNames(
        args.catalogAppId ?? null,
        normalizeStringList(args.enabledTools).filter((toolName) =>
          allToolNames.includes(toolName),
        ),
      )
    : computeSelectedToolNames(args.mount, tools, args.catalogAppId ?? null);
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
      catalogAppId: app.catalogAppId ?? null,
      appName: app.name,
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
      const app = await getDeveloperAppById(ctx, args.developerAppId);
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
          catalogAppId: app?.catalogAppId ?? null,
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
    const secretPolicy = validateDiscoverAppSecretForCatalogAppId(
      catalogAppId,
      normalizedSecret,
    );
    if (!secretPolicy.ok) {
      emitPersonalAppConnectTrace("personal_app_connect.secret_policy_rejected", {
        connectAttemptId,
        appName,
        endpointUrl,
        authType,
        ok: false,
        code: "developer_app_connection_secret_policy_rejected",
      });
      return buildConnectFailure({
        code: "developer_app_connection_secret_policy_rejected",
        appName,
        connectAttemptId,
        errorMessage: secretPolicy.message,
      });
    }
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
      const enabledTools = buildDiscoverAppDefaultEnabledToolNames(
        catalogAppId,
        validation.snapshotTools.map((tool) => ({
          tool_name: normalizeString(tool.tool_name, 200),
        })),
      );
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

export const connectImportedCommunityMcpUserHarnessInternal = internalAction({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    communityAppMountId: v.id("communityAppMounts"),
    catalogAppId: v.optional(v.string()),
    mcpRegistryId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    endpointUrl: v.string(),
    authType: v.union(
      v.literal("none"),
      v.literal("api_key"),
      v.literal("bearer"),
      v.literal("oauth"),
    ),
    secret: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const nowMs = args.nowMs ?? Date.now();
    const policy = resolveCommunityWorkflowImportMcpRegistryConnectPolicy({
      mcpRegistryId: args.mcpRegistryId,
      name: args.name,
      endpointUrl: args.endpointUrl,
      authType: args.authType,
    });
    if (!policy.ok) {
      return {
        ok: false,
        mount: null,
        error_message: policy.message,
      };
    }
    const normalizedSecret = normalizeString(args.secret, 10_000);
    if (policy.authType !== "none" && !normalizedSecret) {
      return {
        ok: false,
        mount: null,
        error_message: `${policy.name} requires a token or API key.`,
      };
    }
    const secretPolicy = validateDiscoverAppSecretForCatalogAppId(
      args.catalogAppId,
      normalizedSecret,
    );
    if (!secretPolicy.ok) {
      return {
        ok: false,
        mount: null,
        error_message: secretPolicy.message,
      };
    }

    const source: UserHarnessAppSourceInput = {
      sourceType: "community",
      communityId: args.communityId,
      communityAppMountId: args.communityAppMountId,
    };
    const existingMount = await resolveExistingMountForConnect({
      ctx,
      userId: args.userId,
      endpointUrl: policy.endpointUrl,
      authType: policy.authType,
    });
    let developerAppId = existingMount?.app._id ?? null;
    if (!developerAppId) {
      developerAppId = (await ctx.runMutation(
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
    }

    if (policy.authType !== "none") {
      await upsertConnectedSecretForConnect({
        ctx,
        developerAppId,
        secret: normalizedSecret,
        nowMs,
      });
    }

    const validation = await validateDeveloperAppForConnect({
      ctx,
      developerAppId,
    });
    const app = (await ctx.runQuery(
      internal.developerApps.getDeveloperAppByIdInternal,
      {
        developerAppId,
      },
    )) as DeveloperAppRow | null;
    if (validation.validationStatus !== "ok" || !app?.activeSnapshotId) {
      const mount = await mountSetupNeededDeveloperAppForUser({
        ctx,
        userId: args.userId,
        developerAppId,
        toolSnapshotId: app?.activeSnapshotId,
        source,
        nowMs,
      });
      return {
        ok: false,
        mount,
        error_message:
          validation.validationError ||
          "The imported MCP endpoint could not be validated.",
      };
    }

    const enabledTools = buildDiscoverAppDefaultEnabledToolNames(
      args.catalogAppId,
      validation.snapshotTools.map((tool) => ({
        tool_name: normalizeString(tool.tool_name, 200),
      })),
    );
    if (enabledTools.length === 0) {
      const mount = await mountSetupNeededDeveloperAppForUser({
        ctx,
        userId: args.userId,
        developerAppId,
        toolSnapshotId: app.activeSnapshotId,
        enabledTools: [],
        source,
        nowMs,
      });
      return {
        ok: false,
        mount,
        error_message: "The imported MCP endpoint did not expose usable tools.",
      };
    }

    const mounted = await mountValidatedDeveloperAppForUser({
      ctx,
      userId: args.userId,
      developerAppId,
      toolSnapshotId: app.activeSnapshotId,
      enabledTools,
      source,
      nowMs,
    });
    return {
      ok: true,
      mount: mounted.mount,
      error_message: null,
    };
  },
});

export const setupImportedCommunityMcpUserHarness = action({
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
    secret: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const { userId } = await resolveAuthenticatedActionUser({
      ctx,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const seedSource = (await ctx.runQuery(
      internal.communityAppMounts.getCommunityAppMountSeedSourceInternal,
      {
        communityAppMountId: args.communityAppMountId,
      },
    )) as {
      mount: {
        _id: any;
        communityId: any;
      };
      app: DeveloperAppRow;
    } | null;
    if (
      !seedSource ||
      String(seedSource.mount.communityId) !== String(args.communityId) ||
      !seedSource.app.mcpRegistryId
    ) {
      return {
        ok: false,
        mount: null,
        validation_report: null,
        error_code: "developer_app_connect_failed",
        error_message: "Imported MCP community app not found.",
        connect_attempt_id: null,
      };
    }
    const result = (await ctx.runAction(
      internal.userPlatformAppMounts.connectImportedCommunityMcpUserHarnessInternal,
      {
        userId,
        communityId: args.communityId,
        communityAppMountId: args.communityAppMountId,
        catalogAppId: seedSource.app.catalogAppId,
        mcpRegistryId: seedSource.app.mcpRegistryId,
        name: seedSource.app.name,
        description: seedSource.app.description,
        endpointUrl: args.endpointUrl,
        authType: args.authType,
        secret: args.secret,
        nowMs: Date.now(),
      },
    )) as {
      ok?: boolean;
      mount?: unknown;
      error_message?: string | null;
    } | null;
    return {
      ok: result?.ok === true,
      mount: result?.mount ?? null,
      validation_report: null,
      error_code: result?.ok === true ? null : "developer_app_connect_failed",
      error_message:
        result?.ok === true
          ? null
          : result?.error_message ||
            "The imported MCP could not be connected to your harness.",
      connect_attempt_id: null,
    };
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
      catalogAppId: string | null;
      appName: string;
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
      catalogAppId: string | null;
      appName: string;
      authType: string;
    };

    if (lifecycle.authType === "none") {
      throw new Error("developer_app_connection_not_required");
    }
    const secret = normalizeString(args.secret, 10_000);
    if (!secret) throw new Error("developer_app_connection_secret_required");
    const secretPolicy = validateDiscoverAppSecretForCatalogAppId(
      lifecycle.catalogAppId,
      secret,
    );
    if (!secretPolicy.ok) {
      throw new Error(secretPolicy.message);
    }
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
    const app = await getDeveloperAppById(ctx, mount.developerAppId);
    if (!app) {
      throw new Error("user_platform_app_mount_missing_dependency");
    }
    const snapshot = await getAppToolSnapshotById(ctx, mount.toolSnapshotId);
    const patch = buildValidatedMountPatch({
      mount,
      catalogAppId: app.catalogAppId ?? null,
      snapshot,
      enabled: args.enabled,
      enabledTools: args.enabledTools,
      nowMs: args.nowMs,
    });
    await ctx.db.patch(mount._id, patch);
    const updated = await getUserPlatformAppMountById(ctx, mount._id);
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
    const app = await getDeveloperAppById(ctx, mount.developerAppId);
    const matchedMounts = [];
    if (app) {
      const allUserMounts = await listUserPlatformAppMountRows(ctx, userId);
      for (const candidate of allUserMounts) {
        const candidateApp = await getDeveloperAppById(
          ctx,
          candidate.developerAppId,
        );
        if (!candidateApp) continue;
        if (developerAppsSharePersonalIdentity(app, candidateApp)) {
          matchedMounts.push(candidate);
        }
      }
    }
    if (matchedMounts.length === 0) matchedMounts.push(mount);
    for (const matchedMount of matchedMounts) {
      const sourceRows = await listUserHarnessAppSourcesForMount({
        ctx,
        userId,
        userPlatformAppMountId: matchedMount._id,
      });
      for (const source of sourceRows) {
        await ctx.db.delete(source._id);
      }
      await ctx.db.delete(matchedMount._id);
    }
    return {
      removed: true,
      id: String(mount._id),
      removed_count: matchedMounts.length,
    };
  },
});

export const listCommunityAppSourceProvenanceAuditInternal = internalQuery({
  args: {
    limit: v.optional(v.number()),
    maxPairs: v.optional(v.number()),
    maxCommunityAppMounts: v.optional(v.number()),
    maxRecipientsPerCommunity: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await collectCommunityAppSourceProvenanceAudit({
      ctx,
      limit: normalizeProvenanceAuditLimit(args.limit, 100, 500),
      maxPairs: normalizeProvenanceAuditLimit(args.maxPairs, 1_000, 5_000),
      maxCommunityAppMounts: normalizeProvenanceAuditLimit(
        args.maxCommunityAppMounts,
        500,
        1_000,
      ),
      maxRecipientsPerCommunity: normalizeProvenanceAuditLimit(
        args.maxRecipientsPerCommunity,
        1_000,
        5_000,
      ),
      repair: false,
      nowMs: Date.now(),
    });
  },
});

export const backfillCommunityAppSourceProvenanceInternal = internalMutation({
  args: {
    limit: v.optional(v.number()),
    maxPairs: v.optional(v.number()),
    maxCommunityAppMounts: v.optional(v.number()),
    maxRecipientsPerCommunity: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const shouldRepair = args.dryRun === false;
    return await collectCommunityAppSourceProvenanceAudit({
      ctx,
      limit: normalizeProvenanceAuditLimit(args.limit, 100, 500),
      maxPairs: normalizeProvenanceAuditLimit(args.maxPairs, 250, 1_000),
      maxCommunityAppMounts: normalizeProvenanceAuditLimit(
        args.maxCommunityAppMounts,
        250,
        1_000,
      ),
      maxRecipientsPerCommunity: normalizeProvenanceAuditLimit(
        args.maxRecipientsPerCommunity,
        250,
        1_000,
      ),
      repair: shouldRepair,
      nowMs: Date.now(),
    });
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
    mcpRegistryId: v.optional(v.string()),
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
        mcpRegistryId: args.mcpRegistryId,
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
        mcpRegistryId: seedSource.app.mcpRegistryId,
        enabled: seedSource.mount.enabled !== false,
        enabledTools: Array.isArray(seedSource.mount.enabledTools)
          ? seedSource.mount.enabledTools
          : undefined,
        sourceType: "community",
        communityId: seedSource.mount.communityId,
        communityAppMountId: seedSource.mount._id,
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
            mcpRegistryId: seedSource.app.mcpRegistryId,
            enabled: seedSource.mount.enabled !== false,
            enabledTools: Array.isArray(seedSource.mount.enabledTools)
              ? seedSource.mount.enabledTools
              : undefined,
            sourceType: "community",
            communityId: seedSource.mount.communityId,
            communityAppMountId: seedSource.mount._id,
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

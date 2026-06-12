"use node";

import { createHash, randomUUID } from "node:crypto";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import {
  destroyBlaxelWorkspaceComputer,
  ensureBlaxelWorkspaceComputer,
  executeBlaxelWorkspaceCommand,
  prepareBlaxelWorkspaceBridgeFiles,
  readBlaxelWorkspaceFile,
  readBlaxelWorkspaceProcess,
  stopBlaxelWorkspaceProcess,
} from "./blaxelWorkspaceComputerProvider.ts";
import {
  destroyBlaxelWorkspaceVolume,
  loadBlaxelWorkspaceConfig,
} from "./blaxelWorkspaceClient.ts";
import {
  buildBridgeCleanupCommand,
  buildCodexBlaxelExternalAuthPayload,
  buildCodexWebSocketAppServerStartCommand,
  buildCodexWebSocketRuntimeBridgeClientCommand,
  CODEX_APP_SERVER_RUNTIME_VOLUME_SIZE_MB,
  EXPECTED_CODEX_RUNTIME_IMAGE_PREFIX,
  safeResourceName,
  shellQuote,
} from "./codexBlaxelAppServerBridge.ts";
import { getFreshChatgptAuthForUser } from "./chatgptAuth.ts";
import { readAuthenticatedIdentityProfile } from "./authIdentity";
import { resolveWorkspaceComputerProviderFromServerEnv } from "./workspaceComputerProviderPolicy.ts";
import { mintCodexBridgeRunToken } from "./codexBridgeToken";
import {
  USER_CANCELLED_RUNTIME_CODE,
  isRuntimeRunCancelledError,
  throwIfRuntimeRunCancelled,
} from "./runtimeCancellation";
import { normalizeCodexBridgeBaseUrlOrigin } from "../shared/codexBridgeContract";
import {
  buildRuntimeTurnContextSnapshot,
  renderRuntimeTurnContextForPrompt,
} from "../shared/runtimeTurnContextPacket";
import {
  buildRuntimeContextCapsule,
  buildRuntimeContextCapsuleMetadata,
  renderRuntimeContextCapsuleForPrompt,
  type RuntimeContextCapsuleMetadataV1,
} from "../shared/runtimeContextCapsule.ts";
import { loadRuntimeTurnContextPacketForRun } from "./runtimeTurnContext";
import {
  composeResolvedRuntimeHarness,
  type ResolvedEffectiveHarness,
} from "./runtimeHarnessComposition.ts";
import {
  buildMountedAppToolDescription,
  normalizeRuntimeMountedUserPlatformAppTools,
  normalizeRuntimeSkillResolution,
} from "./runtimeHarnessShaping.ts";
import type { RuntimeMountedMcpTool } from "./runtimeMcpManager.ts";
import { normalizeComputerDisplayName } from "../shared/projectNaming";
import {
  CODEX_BLAXEL_RUNTIME_COST_MULTIPLIER,
  CODEX_BLAXEL_RUNTIME_PRICING_POLICY,
  PAID_TOOL_PRICING_VERSION,
  creditsToUsd,
  estimateWorkspaceComputeUsd,
  priceCodexBlaxelRuntimeCredits,
  priceCodexBlaxelRuntimeUsd,
} from "../shared/workspaceCredits";

type RuntimeTurnFailure = {
  code: string;
  message: string;
};

type CodexRuntimeMcpMountMode =
  | "none"
  | "inherited_base"
  | "runtime_projected";

type CodexNativeMcpProjectedTool = {
  name: string;
  namespacedToolName: string;
  description: string;
  inputSchema: unknown;
  riskLevel: "read" | "write" | "sensitive";
  appName: string;
  catalogAppId: string | null;
};

type CodexNativeMcpProjectionV1 = {
  version: 1;
  enabled: boolean;
  serverName: "polynet_user_harness";
  fingerprint: string;
  tools: CodexNativeMcpProjectedTool[];
};

type CodexRuntimeProjectionV1 = {
  version: 1;
  source: "polynet_convex_runtime";
  bridgeRuntime: "codex_blaxel_app_server";
  contextCapsuleHash: string;
  contextCapsuleByteSize: number;
  developerInstructionsHash: string;
  developerInstructionsChars: number;
  mcpMountMode: CodexRuntimeMcpMountMode;
  codexConfigSource: "base_image_copy";
  inheritedBaseCodexConfig: boolean;
  projectedMcpServerCount: number;
  nativeMcpProjectionFingerprint: string;
  runtimeMountedToolCount: number;
  discoveryMountedToolCount: number;
  shadowedMountedToolCount: number;
  selectedSkillRefs: Array<{
    scope: "platform" | "personal" | "community";
    name: string;
    mentionToken: string | null;
  }>;
  mountedToolCapabilityRefs: Array<{
    appName: string;
    catalogAppId: string | null;
    authType: string | null;
    scopes: Array<"user" | "community">;
    defaultScope: "user" | "community";
    toolCount: number;
    defaultRuntimeToolNames: string[];
    executableRuntimeToolNames: string[];
  }>;
  defaultMountedRuntimeToolNames: string[];
  executableMountedRuntimeToolNames: string[];
  warning: string | null;
};

const CODEX_APP_SERVER_CONTEXT_TOOL_NAMES = [
  "bash",
  "read",
  "write",
  "edit",
  "grep",
  "glob",
  "web_search",
] as const;

type CodexRuntimePhaseEventArgs = {
  ctx: any;
  ownerId: any;
  threadId: any;
  runId: string;
  projectId?: unknown;
  communityId?: unknown;
  eventType: string;
  eventKey: string;
  phase: string;
  startedAt?: number | null;
  endedAt?: number | null;
  payload?: Record<string, unknown>;
};

type QueuedCodexRuntimePhaseEventArgs = Omit<
  CodexRuntimePhaseEventArgs,
  "ctx" | "ownerId" | "threadId" | "runId" | "projectId" | "communityId"
>;

function readEnv(name: string): string {
  try {
    const value = (globalThis as typeof globalThis & {
      process?: { env?: Record<string, string | undefined> };
    }).process?.env?.[name];
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

function normalizeString(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = normalizeString(value);
  return normalized || null;
}

function sha256HexText(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableJsonValue(child)]),
  );
}

function sha256HexJson(value: unknown): string {
  return sha256HexText(JSON.stringify(stableJsonValue(value)));
}

function compactProjectionText(value: unknown, maxChars: number): string | null {
  const normalized = normalizeOptionalString(value);
  if (!normalized) return null;
  return normalized.length <= maxChars
    ? normalized
    : `${normalized.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function buildCodexRuntimeProjectionInstructions(params: {
  mcpMountMode: CodexRuntimeMcpMountMode;
  projectedMcpServerCount: number;
  runtimeMountedToolCount: number;
  discoveryMountedToolCount: number;
}): string {
  return [
    "CODEX_RUNTIME_PROJECTION",
    `mcp_mount_mode: ${params.mcpMountMode}`,
    `projected_mcp_server_count: ${params.projectedMcpServerCount}`,
    `polynet_runtime_mounted_tool_count: ${params.runtimeMountedToolCount}`,
    `polynet_default_discovery_tool_count: ${params.discoveryMountedToolCount}`,
    params.projectedMcpServerCount === 0
      ? "Do not claim PolyNet connected app or MCP tools are directly callable inside Codex unless this Codex thread actually exposes them or a tool call proves availability."
      : "PolyNet connected app tools are available only through the projected `polynet_user_harness` Codex-native MCP server. Only claim and call tools that this Codex thread exposes in its native MCP tool surface.",
  ].join("\n");
}

function selectedSkillProjectionRefs(
  scope: "platform" | "personal" | "community",
  skills: Array<{ name?: unknown; mention_token?: unknown }>,
): CodexRuntimeProjectionV1["selectedSkillRefs"] {
  return skills
    .map((skill) => {
      const name =
        compactProjectionText(skill.name, 100) ??
        compactProjectionText(skill.mention_token, 80);
      if (!name) return null;
      return {
        scope,
        name,
        mentionToken: compactProjectionText(skill.mention_token, 80),
      };
    })
    .filter((skill): skill is CodexRuntimeProjectionV1["selectedSkillRefs"][number] =>
      Boolean(skill),
    )
    .slice(0, 20);
}

function normalizeProjectedMcpInputSchema(value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  return {
    type: "object",
    additionalProperties: true,
    properties: {},
  };
}

function buildCodexNativeMcpProjection(
  resolvedHarness: ResolvedEffectiveHarness,
): CodexNativeMcpProjectionV1 {
  const tools = resolvedHarness.runtimeMountedTools
    .map((tool) => ({
      name: tool.runtime_tool_name,
      namespacedToolName: tool.namespaced_tool_name,
      description: buildMountedAppToolDescription(tool),
      inputSchema: normalizeProjectedMcpInputSchema(tool.input_schema),
      riskLevel: tool.risk_level,
      appName: tool.app_name,
      catalogAppId: tool.catalog_app_id,
    }))
    .filter((tool) => tool.name && tool.namespacedToolName)
    .slice(0, 80);
  const fingerprint = sha256HexJson({
    serverName: "polynet_user_harness",
    tools: tools.map((tool) => ({
      name: tool.name,
      namespacedToolName: tool.namespacedToolName,
      inputSchema: tool.inputSchema,
      riskLevel: tool.riskLevel,
      catalogAppId: tool.catalogAppId,
    })),
  });
  return {
    version: 1,
    enabled: tools.length > 0,
    serverName: "polynet_user_harness",
    fingerprint,
    tools,
  };
}

function buildCodexRuntimeProjection(params: {
  runtimeContextCapsuleMetadata: RuntimeContextCapsuleMetadataV1;
  developerInstructions: string;
  resolvedHarness: ResolvedEffectiveHarness;
  nativeMcpProjection: CodexNativeMcpProjectionV1;
}): CodexRuntimeProjectionV1 {
  const projectedMcpServerCount = params.nativeMcpProjection.enabled ? 1 : 0;
  const mcpMountMode: CodexRuntimeMcpMountMode =
    projectedMcpServerCount > 0 ? "runtime_projected" : "inherited_base";
  const runtimeMountedToolCount = params.resolvedHarness.runtimeMountedTools.length;
  const discoveryMountedToolCount = params.resolvedHarness.discoveryMountedTools.length;
  const selectedSkillRefs = [
    ...selectedSkillProjectionRefs(
      "platform",
      params.resolvedHarness.selectedPlatformSkills,
    ),
    ...selectedSkillProjectionRefs(
      "personal",
      params.resolvedHarness.selectedPersonalSkills,
    ),
    ...selectedSkillProjectionRefs(
      "community",
      params.resolvedHarness.activeCommunityModule?.selectedSkills ?? [],
    ),
  ].slice(0, 40);
  const mountedToolCapabilityRefs = params.resolvedHarness.capabilityGroups
    .map((group) => ({
      appName: compactProjectionText(group.app_name, 120) ?? "connected app",
      catalogAppId: compactProjectionText(group.catalog_app_id, 120),
      authType: compactProjectionText(group.auth_type, 80),
      scopes: group.scopes.slice(0, 2),
      defaultScope: group.default_scope,
      toolCount: Math.max(0, Math.floor(group.tool_count)),
      defaultRuntimeToolNames: group.default_runtime_tool_names.slice(0, 12),
      executableRuntimeToolNames: group.executable_runtime_tool_names.slice(0, 25),
    }))
    .slice(0, 20);

  return {
    version: 1,
    source: "polynet_convex_runtime",
    bridgeRuntime: "codex_blaxel_app_server",
    contextCapsuleHash: params.runtimeContextCapsuleMetadata.hash,
    contextCapsuleByteSize: params.runtimeContextCapsuleMetadata.byteSize,
    developerInstructionsHash: sha256HexText(params.developerInstructions),
    developerInstructionsChars: params.developerInstructions.length,
    mcpMountMode,
    codexConfigSource: "base_image_copy",
    inheritedBaseCodexConfig: true,
    projectedMcpServerCount,
    nativeMcpProjectionFingerprint: params.nativeMcpProjection.fingerprint,
    runtimeMountedToolCount,
    discoveryMountedToolCount,
    shadowedMountedToolCount: params.resolvedHarness.shadowedMountedTools.length,
    selectedSkillRefs,
    mountedToolCapabilityRefs,
    defaultMountedRuntimeToolNames: params.resolvedHarness.discoveryMountedTools
      .map((tool) => tool.runtime_tool_name)
      .slice(0, 50),
    executableMountedRuntimeToolNames: params.resolvedHarness.runtimeMountedTools
      .map((tool) => tool.runtime_tool_name)
      .slice(0, 100),
    warning:
      runtimeMountedToolCount > 0 && projectedMcpServerCount === 0
        ? "PolyNet mounted app tools are projected as context only for this Codex app-server turn; they are not Codex-native MCP mounts yet."
        : null,
  };
}

function durationMs(startedAt?: number | null, endedAt?: number | null): number | null {
  if (
    typeof startedAt !== "number" ||
    typeof endedAt !== "number" ||
    !Number.isFinite(startedAt) ||
    !Number.isFinite(endedAt)
  ) {
    return null;
  }
  return Math.max(0, Math.floor(endedAt) - Math.floor(startedAt));
}

async function appendCodexRuntimePhaseEventBestEffort(params: CodexRuntimePhaseEventArgs): Promise<void> {
  const nowMs = Date.now();
  const startedAt = typeof params.startedAt === "number" && Number.isFinite(params.startedAt)
    ? Math.floor(params.startedAt)
    : null;
  const endedAt = typeof params.endedAt === "number" && Number.isFinite(params.endedAt)
    ? Math.floor(params.endedAt)
    : null;
  try {
    await params.ctx.runMutation(internal.threads.appendCloudRuntimeRunEventByBridgeClaimsInternal as any, {
      ownerId: params.ownerId,
      threadId: params.threadId,
      runId: params.runId,
      claimProjectId: normalizeString(params.projectId) || undefined,
      claimCommunityId: normalizeString(params.communityId) || undefined,
      eventType: params.eventType,
      eventKey: params.eventKey,
      createdAt: endedAt ?? startedAt ?? nowMs,
      nowMs,
      payload: {
        phase: params.phase,
        phase_started_at: startedAt,
        phase_ended_at: endedAt,
        phase_duration_ms: durationMs(startedAt, endedAt),
        ...params.payload,
      },
    });
  } catch (error) {
    console.warn("codex_runtime_phase_event_record_failed", {
      runId: params.runId,
      eventType: params.eventType,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function recordHeadlessCodexOperationEvent(params: {
  ctx: any;
  ownerId: any;
  threadId: any;
  runId: string;
  projectId?: unknown;
  communityId?: unknown;
  eventType: string;
  eventKey: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const nowMs = Date.now();
  try {
    await params.ctx.runMutation(internal.threads.appendCloudRuntimeRunEventByBridgeClaimsInternal as any, {
      ownerId: params.ownerId,
      threadId: params.threadId,
      runId: params.runId,
      claimProjectId: normalizeString(params.projectId) || undefined,
      claimCommunityId: normalizeString(params.communityId) || undefined,
      eventType: params.eventType,
      eventKey: params.eventKey,
      payload: {
        run_id: params.runId,
        ...params.payload,
      },
      createdAt: nowMs,
      nowMs,
    });
  } catch {
    // Best-effort operator evidence must never fail the user-visible Codex run.
  }
}

function normalizeDeploymentKind(value: unknown): string {
  return normalizeString(value).toLowerCase();
}

function safeNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : undefined;
}

function mbToGiB(value: unknown): number {
  const mb = Math.max(0, Number(value) || 0);
  return mb / 1024;
}

function redactSensitiveText(value: string): string {
  const clipped = String(value ?? "").slice(0, 1000);
  if (/(authorization|api[_-]?key|x-api-key|token|secret|headers|config|bearer\s+)/i.test(clipped)) {
    return "[redacted_sensitive_output]";
  }
  return clipped
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[redacted_api_key]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted_jwt]");
}

function safeFailure(code: string, message: string): RuntimeTurnFailure {
  return {
    code,
    message: redactSensitiveText(message),
  };
}

function buildResourceNames(runId: string) {
  const suffix = safeResourceName(`${runId}-${randomUUID().slice(0, 8)}`).slice(-25);
  return {
    bridgeId: safeResourceName(`runtime-${suffix}`),
    sandboxName: safeResourceName(`polynet-codex-runtime-${suffix}`),
    volumeName: safeResourceName(`polynet-codex-runtime-${suffix}-v`),
  };
}

function resolveCallbackBaseUrl(): string | null {
  return (
    normalizeCodexBridgeBaseUrlOrigin(readEnv("POLYNET_CODEX_BRIDGE_CALLBACK_BASE_URL")) ||
    normalizeCodexBridgeBaseUrlOrigin(readEnv("CONVEX_SITE_URL")) ||
    normalizeCodexBridgeBaseUrlOrigin(readEnv("VITE_CONVEX_SITE_URL")) ||
    normalizeCodexBridgeBaseUrlOrigin(readEnv("PUBLIC_CONVEX_SITE_URL"))
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isWorkspaceProcessTerminalStatus(value: unknown): boolean {
  const status = normalizeString(value).toLowerCase();
  return ["completed", "failed", "killed", "exited", "terminated", "stopped"].includes(status);
}

async function throwIfCancelledAndStopBridgeProcess(params: {
  ctx: any;
  ownerId: any;
  runId: string;
  sandboxName: string;
  processName: string;
}): Promise<void> {
  try {
    await throwIfRuntimeRunCancelled({
      ctx: params.ctx,
      ownerId: params.ownerId,
      runId: params.runId,
    });
  } catch (error) {
    if (isRuntimeRunCancelledError(error)) {
      await stopBlaxelWorkspaceProcess({
        sandboxName: params.sandboxName,
        processName: params.processName,
      }).catch(() => null);
    }
    throw error;
  }
}

async function waitForBridgeProcessCompletion(params: {
  ctx: any;
  ownerId: any;
  runId: string;
  sandboxName: string;
  processName: string;
  statusPath: string;
  timeoutMs: number;
  intervalMs: number;
}) {
  const startedAt = Date.now();
  let latest: any = null;
  while (Date.now() - startedAt < params.timeoutMs) {
    await throwIfCancelledAndStopBridgeProcess(params);
    await sleep(params.intervalMs);
    await throwIfCancelledAndStopBridgeProcess(params);
    const current = await readBlaxelWorkspaceProcess({
      sandboxName: params.sandboxName,
      processName: params.processName,
    });
    if (!current.ok) return current;
    latest = current;
    const exitCode = safeNumber(current.exitCode);
    if (isWorkspaceProcessTerminalStatus(current.status) || (exitCode !== undefined && !normalizeString(current.status))) {
      const statusRead = await readBlaxelWorkspaceFile({
        sandboxName: params.sandboxName,
        path: params.statusPath,
      });
      return {
        ...current,
        stdout: [
          normalizeString(current.stdout ?? current.logs),
          statusRead.ok ? normalizeString(statusRead.content) : "",
        ].filter(Boolean).join("\n"),
      };
    }
  }
  await throwIfCancelledAndStopBridgeProcess(params);
  return {
    ok: true as const,
    providerId: "blaxel" as const,
    providerSandboxId: params.sandboxName,
    providerProcessId: params.processName,
    status: "timeout",
    exitCode: null,
    stdout: latest?.stdout ?? latest?.logs ?? null,
    stderr: latest?.stderr ?? null,
    logs: latest?.logs ?? null,
  };
}

async function resolveActionActor(ctx: any, explicitAuthSubject: string): Promise<
  | { ok: true; authSubject: string; userId: string }
  | { ok: false; failure: RuntimeTurnFailure }
> {
  const deploymentKind = normalizeDeploymentKind(readEnv("POLYNET_DEPLOYMENT_KIND"));
  const identity = await readAuthenticatedIdentityProfile(ctx).catch(() => null);
  if (identity?.authSubject && explicitAuthSubject && identity.authSubject !== explicitAuthSubject) {
    return {
      ok: false,
      failure: safeFailure("auth_subject_mismatch", "Authenticated user does not match requested subject."),
    };
  }
  const authSubject =
    identity?.authSubject ||
    (deploymentKind === "staging" ? explicitAuthSubject : "");
  if (!authSubject) {
    return {
      ok: false,
      failure: safeFailure("verified_identity_required", "Verified identity is required for Codex runtime turns."),
    };
  }
  const user = (await ctx.runQuery(internal.threads.getUserByAuthSubjectInternal as any, {
    authSubject,
  })) as { _id?: unknown } | null;
  const userId = normalizeString(user?._id);
  if (!userId) {
    return {
      ok: false,
      failure: safeFailure("authenticated_user_required", "Authenticated user is not available."),
    };
  }
  return { ok: true, authSubject, userId };
}

function mapRuntimeMountedUserPlatformAppToolsToMcpTools(
  value: unknown,
): RuntimeMountedMcpTool[] {
  return normalizeRuntimeMountedUserPlatformAppTools(value).map((tool) => ({
    scope: "user",
    mount_id: tool.user_platform_app_mount_id,
    runtime_tool_name: `me__${tool.namespaced_tool_name}`,
    developer_app_id: tool.developer_app_id,
    catalog_app_id: tool.catalog_app_id,
    app_name: tool.app_name,
    endpoint_url: tool.endpoint_url,
    auth_type: tool.auth_type,
    tool_name: tool.tool_name,
    namespaced_tool_name: tool.namespaced_tool_name,
    description: tool.description,
    input_schema: tool.input_schema,
    risk_level: tool.risk_level,
  }));
}

async function resolveCodexRuntimeProjectContext(params: {
  ctx: any;
  projectId?: string | null;
  authSubject: string;
}): Promise<{ label: string | null; description: string | null }> {
  if (!params.projectId) return { label: null, description: null };
  const row = await params.ctx
    .runQuery(api.projects.getCloudProjectById as any, {
      projectId: params.projectId as any,
      authSubject: params.authSubject,
    })
    .catch(() => null);
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return { label: null, description: null };
  }
  const record = row as Record<string, unknown>;
  return {
    label: normalizeComputerDisplayName(
      typeof record.name === "string" ? record.name : null,
    ),
    description: normalizeOptionalString(record.description),
  };
}

async function resolveCodexRuntimeCommunityContext(params: {
  ctx: any;
  userId: string;
  authSubject: string;
  communityId?: string | null;
}): Promise<{
  name: string | null;
  slug: string | null;
  oneLiner: string | null;
  about: string | null;
  systemPrompt: string | null;
}> {
  if (!params.communityId) {
    return { name: null, slug: null, oneLiner: null, about: null, systemPrompt: null };
  }
  const row = await params.ctx
    .runQuery(internal.communityAgent.resolveRuntimeCommunityPromptContextForResolvedUserInternal as any, {
      userId: params.userId as any,
      communityId: params.communityId as any,
    })
    .catch(() => null);
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return { name: null, slug: null, oneLiner: null, about: null, systemPrompt: null };
  }
  const record = row as Record<string, unknown>;
  return {
    name: normalizeOptionalString(record.community_name),
    slug: normalizeOptionalString(record.community_slug),
    oneLiner: normalizeOptionalString(record.community_one_liner),
    about: normalizeOptionalString(record.community_about),
    systemPrompt:
      normalizeOptionalString(record.community_system_prompt) ??
      normalizeOptionalString(record.system_prompt),
  };
}

function buildDeveloperInstructions(
  contextPrompt: string,
  projectionInstructions: string,
): string {
  return [
    "You are Codex running headlessly inside a Blaxel sandbox for PolyNet.",
    "Use the PolyNet runtime context as orientation. Do not treat it as a deterministic route; gather additional context with your normal Codex tools when useful.",
    "Default execution posture inside this sandbox is full access with no approval prompts.",
    "Do not include secrets or raw credentials in the final answer.",
    projectionInstructions,
    contextPrompt ? `POLYNET_RUNTIME_CONTEXT\n${contextPrompt}` : "",
  ].filter(Boolean).join("\n\n");
}

async function recordTrackedCodexBlaxelRuntimeProviderCostBestEffort(params: {
  ctx: any;
  ownerId: any;
  projectId?: any;
  communityId?: any;
  runId: string;
  sandboxName: string;
  volumeName?: string | null;
  startedAt: number | null;
  endedAt: number;
  sandboxCpu: number;
  sandboxMemoryGiB: number;
  sandboxDiskGiB: number;
  destroyedAfterRun: boolean;
  bridgeCleanupAttempted: boolean;
  bridgeCleanupSucceeded: boolean;
  bridgeCleanupFailureCode?: string | null;
  sandboxDestroyAttempted: boolean;
  sandboxDestroySucceeded: boolean;
  sandboxDestroyFailureCode?: string | null;
  volumeDestroyAttempted: boolean;
  volumeDestroySucceeded: boolean;
  volumeDestroyFailureCode?: string | null;
  outcome: "succeeded" | "failed" | "cancelled";
  failureCode?: string | null;
}): Promise<void> {
  if (!(typeof params.startedAt === "number" && Number.isFinite(params.startedAt))) return;
  const startedAt = Math.floor(params.startedAt);
  const endedAt = Math.max(startedAt, Math.floor(params.endedAt));
  const durationSeconds = Math.max(0, (endedAt - startedAt) / 1000);
  const sandboxMemoryGiB = Math.max(0, Number(params.sandboxMemoryGiB) || 0);
  const rawVendorCostUsd = estimateWorkspaceComputeUsd({
    durationSeconds,
    sandboxCpu: params.sandboxCpu,
    sandboxMemoryGiB,
  });
  if (!(rawVendorCostUsd > 0)) return;

  const polynetPriceUsd = priceCodexBlaxelRuntimeUsd({ rawVendorCostUsd });
  const polynetPriceCredits = priceCodexBlaxelRuntimeCredits({ rawVendorCostUsd });
  try {
    await params.ctx.runMutation(internal.workspaceCredits.recordProviderCostInternal as any, {
      costKey: `codex_blaxel_runtime:${params.runId}:provider_cost`,
      userId: params.ownerId,
      projectId: params.projectId ?? null,
      communityId: params.communityId ?? null,
      runId: params.runId,
      category: "workspace",
      component: "blaxel_active_runtime",
      provider: "blaxel",
      resourceId: params.sandboxName,
      periodStart: startedAt,
      periodEnd: endedAt,
      quantityKind: "memory_gib_seconds",
      quantity: durationSeconds * sandboxMemoryGiB,
      rawVendorCostUsd,
      evidence: "estimated",
      billingDisposition: "tracked_only",
      metadata: {
        pricing_version: PAID_TOOL_PRICING_VERSION,
        pricing_policy: CODEX_BLAXEL_RUNTIME_PRICING_POLICY,
        cost_multiplier: CODEX_BLAXEL_RUNTIME_COST_MULTIPLIER,
        provider_cost_source: "codex_blaxel_runtime_turn",
        provider_cost_user_charge_disposition: "tracked_only",
        billing_disposition: "tracked_only",
        raw_vendor_cost_usd: rawVendorCostUsd,
        polynet_price_usd: polynetPriceUsd,
        polynet_price_credits: polynetPriceCredits,
        polynet_price_credits_usd: creditsToUsd(polynetPriceCredits),
        duration_seconds: durationSeconds,
        sandbox_started_at: startedAt,
        sandbox_finished_at: endedAt,
        sandbox_cpu: params.sandboxCpu,
        sandbox_memory_gib: sandboxMemoryGiB,
        sandbox_disk_gib: params.sandboxDiskGiB,
        sandbox_name: params.sandboxName,
        volume_name: params.volumeName,
        destroyed_after_run: params.destroyedAfterRun,
        bridge_cleanup_attempted: params.bridgeCleanupAttempted,
        bridge_cleanup_succeeded: params.bridgeCleanupSucceeded,
        bridge_cleanup_failure_code: normalizeString(params.bridgeCleanupFailureCode),
        sandbox_destroy_attempted: params.sandboxDestroyAttempted,
        sandbox_destroy_succeeded: params.sandboxDestroySucceeded,
        sandbox_destroy_failure_code: normalizeString(params.sandboxDestroyFailureCode),
        volume_destroy_attempted: params.volumeDestroyAttempted,
        volume_destroy_succeeded: params.volumeDestroySucceeded,
        volume_destroy_failure_code: normalizeString(params.volumeDestroyFailureCode),
        outcome: params.outcome,
        failure_code: normalizeString(params.failureCode),
      },
      nowMs: endedAt,
    });
  } catch (error) {
    console.warn("codex_blaxel_runtime_provider_cost_record_failed", {
      run_id: params.runId,
      sandbox_name: params.sandboxName,
      error: error instanceof Error ? error.message : String(error ?? ""),
    });
  }
}

export const runBlaxelCodexRuntimeTurn = action({
  args: {
    authSubject: v.optional(v.string()),
    threadId: v.id("threads"),
    prompt: v.string(),
    runId: v.optional(v.string()),
    modelId: v.optional(v.string()),
    destroyAfterRun: v.optional(v.boolean()),
    persistUserPrompt: v.optional(v.boolean()),
    userMessageKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const prompt = normalizeString(args.prompt);
    if (!prompt) {
      return {
        ok: false,
        failure: safeFailure("prompt_required", "Codex runtime turn prompt is required."),
      };
    }
    const actor = await resolveActionActor(ctx, normalizeString(args.authSubject));
    if (!actor.ok) {
      return {
        ok: false,
        failure: actor.failure,
      };
    }

    const callbackBaseUrl = resolveCallbackBaseUrl();
    if (!callbackBaseUrl) {
      return {
        ok: false,
        failure: safeFailure("codex_bridge_callback_base_url_missing", "Codex bridge callback base URL is not configured."),
      };
    }

    const policy = resolveWorkspaceComputerProviderFromServerEnv();
    const imageRef = readEnv("BLAXEL_WORKSPACE_IMAGE");
    if (policy.providerId !== "blaxel") {
      return {
        ok: false,
        failure: safeFailure("blaxel_policy_not_selected", "Workspace computer provider is not Blaxel."),
      };
    }
    if (!imageRef.startsWith(EXPECTED_CODEX_RUNTIME_IMAGE_PREFIX)) {
      return {
        ok: false,
        failure: safeFailure("custom_codex_image_not_configured", "Blaxel Codex runtime image is not configured."),
      };
    }

    const thread = (await ctx.runQuery(internal.threads.getCloudThreadByOwnerThreadIdInternal as any, {
      ownerId: actor.userId as any,
      threadId: args.threadId,
    })) as {
      _id?: unknown;
      threadKey?: unknown;
      projectId?: unknown;
      communityId?: unknown;
      contextVersion?: unknown;
      workingState?: unknown;
    } | null;
    if (!thread?._id) {
      return {
        ok: false,
        failure: safeFailure("thread_not_found", "Thread not found."),
      };
    }
    const threadCommunityId = normalizeString(thread.communityId);

    const auth = await getFreshChatgptAuthForUser({ ctx, userId: actor.userId });
    if (!auth?.accessToken) {
      return {
        ok: false,
        failure: safeFailure("provider_connection_required", "ChatGPT connection is required for Codex runtime turns."),
      };
    }
    const chatgptAccountId = normalizeString(auth.accountId);
    if (!chatgptAccountId) {
      return {
        ok: false,
        failure: safeFailure("provider_connection_account_required", "ChatGPT account id is required."),
      };
    }

    const runId = normalizeString(args.runId) || `codex_blaxel:${randomUUID()}`;
    const modelId = normalizeString(args.modelId) || "gpt-5.5";
    const startedAt = Date.now();
    const run = (await ctx.runMutation(internal.threads.ensureCloudRuntimeRunStartedByOwnerInternal as any, {
      ownerId: actor.userId as any,
      threadId: args.threadId,
      runId,
      lane: "chatgpt",
      visibility: "user_visible",
      projectId: thread.projectId || undefined,
      communityId: threadCommunityId || undefined,
      communityContextVersion: threadCommunityId && Number.isFinite(Number(thread.contextVersion))
        ? Math.max(0, Math.floor(Number(thread.contextVersion)))
        : undefined,
      modelId,
      engineId: "codex_blaxel_app_server",
      executionMode: "codex_app_server",
      sandboxMode: "danger-full-access",
      contractName: "codex_blaxel_app_server_runtime_v1",
      contractVersion: "v1",
      harnessProfile: "codex_app_server_full_access",
      harnessProfileSource: "codex_blaxel_runtime_bridge_v1",
      capabilityFamilies: ["codex_app_server", "workspace", "community_context"],
      latestUserText: prompt,
      startedAt,
      nowMs: startedAt,
    })) as { projectId?: unknown; communityId?: unknown } | null;
    const claimProjectId = normalizeString(run?.projectId ?? thread.projectId) || undefined;
    const claimCommunityId = normalizeString(run?.communityId ?? threadCommunityId) || undefined;
    if (args.persistUserPrompt === true) {
      const userMessageKey =
        normalizeString(args.userMessageKey) ||
        `user:${normalizeString(thread.threadKey) || String(args.threadId)}:${runId}`;
      try {
        await ctx.runMutation((internal as any).threads.addCloudThreadMessageByOwnerInternal as any, {
          ownerId: actor.userId as any,
          threadId: args.threadId,
          messageKey: userMessageKey,
          role: "user",
          contentJson: { text: prompt },
          engineId: "codex_blaxel_app_server",
          modelId,
          runId,
          nowMs: startedAt,
        });
      } catch {
        await ctx.runMutation(internal.threads.finishCloudRuntimeRunByBridgeClaimsInternal as any, {
          ownerId: actor.userId as any,
          threadId: args.threadId,
          runId,
          claimProjectId,
          claimCommunityId,
          status: "error",
          reason: "user_message_persist_failed",
          errorCode: "user_message_persist_failed",
          errorMessage: "Failed to persist the Codex runtime user prompt.",
          nowMs: Date.now(),
        }).catch(() => null);
        return {
          ok: false,
          runId,
          failure: safeFailure(
            "user_message_persist_failed",
            "Failed to persist the Codex runtime user prompt.",
          ),
        };
      }
    }
    const [
      projectContext,
      communityContext,
      runtimeMountedUserPlatformAppTools,
      skillResolution,
    ] = await Promise.all([
      resolveCodexRuntimeProjectContext({
        ctx,
        projectId: claimProjectId ?? null,
        authSubject: actor.authSubject,
      }),
      resolveCodexRuntimeCommunityContext({
        ctx,
        userId: actor.userId,
        authSubject: actor.authSubject,
        communityId: claimCommunityId ?? null,
      }),
      ctx
        .runQuery(
          internal.userPlatformAppMounts.listRuntimeUserPlatformMountedToolsInternal,
          {
            userId: actor.userId as any,
          },
        )
        .then(mapRuntimeMountedUserPlatformAppToolsToMcpTools),
      ctx
        .runQuery(
          internal.runtimeSkillResolution.resolveRuntimeSkillSelectionForResolvedUserInternal,
          {
            userId: actor.userId as any,
            communityId: claimCommunityId ? (claimCommunityId as any) : undefined,
            messages: [
              {
                role: "user",
                content: prompt,
              },
            ],
          },
        )
        .then(normalizeRuntimeSkillResolution),
    ]);
    const resolvedHarness = composeResolvedRuntimeHarness({
      personalMountedTools: runtimeMountedUserPlatformAppTools,
      skillResolution,
    });
    const phaseTelemetryWrites: Promise<void>[] = [];
    const queueCodexRuntimePhaseEvent = (event: QueuedCodexRuntimePhaseEventArgs): void => {
      phaseTelemetryWrites.push(appendCodexRuntimePhaseEventBestEffort({
        ctx,
        ownerId: actor.userId as any,
        threadId: args.threadId,
        runId,
        projectId: claimProjectId,
        communityId: claimCommunityId,
        ...event,
      }));
    };
    const flushCodexRuntimePhaseTelemetry = async (): Promise<void> => {
      if (phaseTelemetryWrites.length === 0) return;
      const writes = phaseTelemetryWrites.splice(0);
      await Promise.allSettled(writes);
    };

    const contextLoadStartedAt = Date.now();
    const loadedContext = await loadRuntimeTurnContextPacketForRun({
      ctx,
      ownerId: actor.userId,
      threadId: args.threadId,
      projectId: claimProjectId || null,
      runId,
      latestUserText: prompt,
      threadWorkingState: (thread.workingState as any) ?? null,
      summarizeCurrentRunEvents: false,
      runtimeStop: null,
    });
    const contextLoadedAt = Date.now();
    const loadedContextPacket = loadedContext.packet;
    const runtimeContextCapsule = buildRuntimeContextCapsule({
      latestUserText: prompt,
      threadId: String(args.threadId),
      projectId: claimProjectId || null,
      projectLabel: projectContext.label,
      projectDescription: projectContext.description,
      communityId: claimCommunityId || null,
      communityName: communityContext.name,
      communitySlug: communityContext.slug,
      communityOneLiner: communityContext.oneLiner,
      communityAbout: communityContext.about,
      communityResourceLane: resolvedHarness.communityResourceLane,
      allowedToolNames: CODEX_APP_SERVER_CONTEXT_TOOL_NAMES,
      runtimeTurnContext: loadedContextPacket,
      mountedToolCapabilityGroups: resolvedHarness.capabilityGroups,
      runtimeMountedToolCount: resolvedHarness.runtimeMountedTools.length,
      defaultDiscoveryMountedToolCount: resolvedHarness.discoveryMountedTools.length,
      shadowedMountedToolCount: resolvedHarness.shadowedMountedTools.length,
      platformSkillInventory: resolvedHarness.platformSkillInventory,
      selectedPlatformSkills: resolvedHarness.selectedPlatformSkills,
      personalSkillInventory: resolvedHarness.personalSkillInventory,
      selectedPersonalSkills: resolvedHarness.selectedPersonalSkills,
      communitySkillInventory:
        resolvedHarness.activeCommunityModule?.attachedSkills ?? [],
      selectedCommunitySkills:
        resolvedHarness.activeCommunityModule?.selectedSkills ?? [],
      requestedSkillMentionTokens: resolvedHarness.requestedSkillMentionTokens,
      ambiguousSkillMentionTokens: resolvedHarness.ambiguousSkillMentionTokens,
    });
    const runtimeContextCapsuleMetadata =
      buildRuntimeContextCapsuleMetadata(runtimeContextCapsule);
    const contextSnapshot = buildRuntimeTurnContextSnapshot({
      packet: loadedContextPacket,
      capturedAt: contextLoadedAt,
      runtimeContextCapsule,
      runtimeContextCapsuleMetadata,
      runtimeContextCapsulePhase: "started",
    });
    await ctx.runMutation(internal.threads.setCloudRuntimeRunContextSnapshotInternal as any, {
      ownerId: actor.userId as any,
      threadId: args.threadId,
      runId,
      phase: "started",
      snapshot: contextSnapshot,
      nowMs: contextLoadedAt,
    });
    queueCodexRuntimePhaseEvent({
      eventType: "codex_runtime_context_loaded",
      eventKey: "codex_runtime_context_loaded",
      phase: "context_loaded",
      startedAt: contextLoadStartedAt,
      endedAt: contextLoadedAt,
      payload: {
        context_packet_present: Boolean(loadedContext.packet),
        context_capsule_present: true,
        capsule_metadata: runtimeContextCapsuleMetadata,
      },
    });
    queueCodexRuntimePhaseEvent({
      eventType: "runtime_context_capsule_prepared",
      eventKey: "runtime_context_capsule_prepared",
      phase: "context_capsule_prepared",
      startedAt: contextLoadStartedAt,
      endedAt: contextLoadedAt,
      payload: {
        capsule_metadata: runtimeContextCapsuleMetadata,
        bridge_runtime: "codex_blaxel_app_server",
      },
    });
    if (
      resolvedHarness.runtimeMountedTools.length > 0 ||
      resolvedHarness.personalSkillInventory.length > 0 ||
      (resolvedHarness.activeCommunityModule?.attachedSkills.length ?? 0) > 0
    ) {
      queueCodexRuntimePhaseEvent({
        eventType: "effective_harness_resolved",
        eventKey: "effective_harness_resolved",
        phase: "effective_harness_resolved",
        startedAt: contextLoadStartedAt,
        endedAt: contextLoadedAt,
        payload: {
          user_scope_id: actor.userId,
          community_scope_id: claimCommunityId ?? null,
          requested_skill_mention_tokens:
            resolvedHarness.requestedSkillMentionTokens,
          ambiguous_skill_mention_tokens:
            resolvedHarness.ambiguousSkillMentionTokens,
          selected_personal_skill_mention_tokens:
            resolvedHarness.selectedPersonalSkills.map((skill) => skill.mention_token),
          selected_community_skill_mention_tokens:
            resolvedHarness.activeCommunityModule?.selectedSkills.map(
              (skill) => skill.mention_token,
            ) ?? [],
          runtime_mounted_tool_names:
            resolvedHarness.runtimeMountedTools.map((tool) => tool.runtime_tool_name),
          discovery_mounted_tool_names:
            resolvedHarness.discoveryMountedTools.map((tool) => tool.runtime_tool_name),
          shadowed_mounted_tool_names:
            resolvedHarness.shadowedRuntimeToolNames,
        },
      });
    }
    const capsulePrompt = renderRuntimeContextCapsuleForPrompt(runtimeContextCapsule) ?? "";
    const detailedContextPrompt = renderRuntimeTurnContextForPrompt(loadedContextPacket) ?? "";
    const contextPrompt = [
      capsulePrompt,
      resolvedHarness.systemPromptSuffix,
      communityContext.systemPrompt
        ? `COMMUNITY_SYSTEM_PROMPT\n${communityContext.systemPrompt}`
        : "",
      detailedContextPrompt,
    ]
      .filter((block) => block.trim().length > 0)
      .join("\n\n")
      .slice(0, 24_000);
    const codexNativeMcpProjection =
      buildCodexNativeMcpProjection(resolvedHarness);
    const projectionInstructions = buildCodexRuntimeProjectionInstructions({
      mcpMountMode: codexNativeMcpProjection.enabled
        ? "runtime_projected"
        : "inherited_base",
      projectedMcpServerCount: codexNativeMcpProjection.enabled ? 1 : 0,
      runtimeMountedToolCount: resolvedHarness.runtimeMountedTools.length,
      discoveryMountedToolCount: resolvedHarness.discoveryMountedTools.length,
    });
    const developerInstructions = buildDeveloperInstructions(
      contextPrompt,
      projectionInstructions,
    );
    const codexRuntimeProjection = buildCodexRuntimeProjection({
      runtimeContextCapsuleMetadata,
      developerInstructions,
      resolvedHarness,
      nativeMcpProjection: codexNativeMcpProjection,
    });
    queueCodexRuntimePhaseEvent({
      eventType: "codex_runtime_projection_prepared",
      eventKey: "codex_runtime_projection_prepared",
      phase: "codex_runtime_projection_prepared",
      startedAt: contextLoadStartedAt,
      endedAt: Date.now(),
      payload: {
        projection_version: codexRuntimeProjection.version,
        bridge_runtime: codexRuntimeProjection.bridgeRuntime,
        mcp_mount_mode: codexRuntimeProjection.mcpMountMode,
        codex_config_source: codexRuntimeProjection.codexConfigSource,
        inherited_base_codex_config:
          codexRuntimeProjection.inheritedBaseCodexConfig,
        projected_mcp_server_count:
          codexRuntimeProjection.projectedMcpServerCount,
        native_mcp_projection_fingerprint:
          codexRuntimeProjection.nativeMcpProjectionFingerprint,
        runtime_mounted_tool_count:
          codexRuntimeProjection.runtimeMountedToolCount,
        discovery_mounted_tool_count:
          codexRuntimeProjection.discoveryMountedToolCount,
        shadowed_mounted_tool_count:
          codexRuntimeProjection.shadowedMountedToolCount,
        selected_skill_count: codexRuntimeProjection.selectedSkillRefs.length,
        mounted_tool_capability_count:
          codexRuntimeProjection.mountedToolCapabilityRefs.length,
        context_capsule_hash: codexRuntimeProjection.contextCapsuleHash,
        developer_instructions_hash:
          codexRuntimeProjection.developerInstructionsHash,
        warning: codexRuntimeProjection.warning,
      },
    });

    const token = await mintCodexBridgeRunToken({
      runId,
      ownerId: actor.userId,
      threadId: String(args.threadId),
      projectId: claimProjectId || null,
      communityId: claimCommunityId || null,
      operations: ["event", "finish", "mcp_tool"],
      ttlMs: 15 * 60 * 1000,
    });
    if (!token.ok) {
      await flushCodexRuntimePhaseTelemetry().catch(() => null);
      await ctx.runMutation(internal.threads.finishCloudRuntimeRunByBridgeClaimsInternal as any, {
        ownerId: actor.userId as any,
        threadId: args.threadId,
        runId,
        status: "error",
        reason: token.code,
        errorCode: token.code,
        errorMessage: token.message,
        nowMs: Date.now(),
      }).catch(() => null);
      return {
        ok: false,
        runId,
        failure: safeFailure(token.code, token.message),
      };
    }

    const names = buildResourceNames(runId);
    const destroyAfterRun = args.destroyAfterRun !== false;
    const runtimeVolumeName = destroyAfterRun ? null : names.volumeName;
    const bridgeDir = `.polynet/codex-runtime-bridge/${names.bridgeId}`;
    const authPayloadPath = `${bridgeDir}/auth-payload.json`;
    const runtimePayloadPath = `${bridgeDir}/runtime-payload.json`;
    const bridgeStatusPath = `${bridgeDir}/bridge-status.out`;
    const eventUrl = `${callbackBaseUrl}/runtime/codex_bridge/event`;
    const finishUrl = `${callbackBaseUrl}/runtime/codex_bridge/finish`;
    const mcpToolUrl = `${callbackBaseUrl}/runtime/codex_bridge/mcp_tool`;
    let workspaceRoot = "/workspace";
    let webSocketProcessName: string | null = null;
    let clientProcessName: string | null = null;
    const loadedBlaxelConfig = loadBlaxelWorkspaceConfig();
    const sandboxCpu = 0;
    const sandboxMemoryGiB = loadedBlaxelConfig.ok ? mbToGiB(loadedBlaxelConfig.config.memoryMb) : 0;
    const sandboxDiskGiB = runtimeVolumeName ? mbToGiB(CODEX_APP_SERVER_RUNTIME_VOLUME_SIZE_MB) : 0;
    let sandboxStartedAt: number | null = null;
    let costOutcome: "succeeded" | "failed" | "cancelled" = "failed";
    let costFailureCode: string | null = null;
    let sandboxEnsured = false;

    try {
      const sandboxStartRequestedAt = Date.now();
      await recordHeadlessCodexOperationEvent({
        ctx,
        ownerId: actor.userId as any,
        threadId: args.threadId,
        runId,
        projectId: claimProjectId,
        communityId: claimCommunityId,
        eventType: "headless_sandbox_ensure_started",
        eventKey: `${runId}:headless_sandbox_ensure_started:${names.sandboxName}`,
        payload: {
          sandbox_id: names.sandboxName,
          volume_name: runtimeVolumeName,
          provider_id: "blaxel",
          status: "started",
          destroy_after_run: destroyAfterRun,
        },
      });
      queueCodexRuntimePhaseEvent({
        eventType: "codex_sandbox_ensure_started",
        eventKey: "codex_sandbox_ensure_started",
        phase: "sandbox_ensure",
        startedAt: sandboxStartRequestedAt,
        payload: {
          sandbox_name: names.sandboxName,
          volume_name: runtimeVolumeName,
          destroy_after_run: destroyAfterRun,
          memory_mb: loadedBlaxelConfig.ok ? loadedBlaxelConfig.config.memoryMb : null,
        },
      });
      const ensured = await ensureBlaxelWorkspaceComputer({
        sandboxName: names.sandboxName,
        volumeName: runtimeVolumeName,
        volumeSizeMb: runtimeVolumeName ? CODEX_APP_SERVER_RUNTIME_VOLUME_SIZE_MB : null,
        lifecycleIntent: "agent_run",
        labels: {
          purpose: "codex-runtime-turn",
        },
      });
      const sandboxEnsureCompletedAt = Date.now();
      if (!ensured.ok) {
        await recordHeadlessCodexOperationEvent({
          ctx,
          ownerId: actor.userId as any,
          threadId: args.threadId,
          runId,
          projectId: claimProjectId,
          communityId: claimCommunityId,
          eventType: "headless_sandbox_ensure_completed",
          eventKey: `${runId}:headless_sandbox_ensure_completed:error`,
          payload: {
            sandbox_id: names.sandboxName,
            volume_name: runtimeVolumeName,
            provider_id: "blaxel",
            status: "error",
            latency_ms: sandboxEnsureCompletedAt - sandboxStartRequestedAt,
            code: ensured.code || null,
          },
        });
        queueCodexRuntimePhaseEvent({
          eventType: "codex_sandbox_ensure_completed",
          eventKey: "codex_sandbox_ensure_completed",
          phase: "sandbox_ensure",
          startedAt: sandboxStartRequestedAt,
          endedAt: sandboxEnsureCompletedAt,
          payload: {
            ok: false,
            sandbox_name: names.sandboxName,
            failure_code: ensured.code || null,
          },
        });
        throw new Error(`sandbox_ensure_failed:${ensured.code || ensured.message}`);
      }
      queueCodexRuntimePhaseEvent({
        eventType: "codex_sandbox_ensure_completed",
        eventKey: "codex_sandbox_ensure_completed",
        phase: "sandbox_ensure",
        startedAt: sandboxStartRequestedAt,
        endedAt: sandboxEnsureCompletedAt,
        payload: {
          ok: true,
          sandbox_name: names.sandboxName,
          workspace_root_present: Boolean(ensured.workspaceRoot),
        },
      });
      sandboxEnsured = true;
      sandboxStartedAt = sandboxStartRequestedAt;
      workspaceRoot = ensured.workspaceRoot;
      await ctx.runMutation(internal.threads.setCloudRuntimeRunWorkspaceSessionInternal as any, {
        ownerId: actor.userId as any,
        runId,
        state: "active",
        providerSandboxId: names.sandboxName,
        region: normalizeString((ensured as { region?: unknown }).region) || undefined,
        nowMs: sandboxEnsureCompletedAt,
      }).catch(() => null);
      await recordHeadlessCodexOperationEvent({
        ctx,
        ownerId: actor.userId as any,
        threadId: args.threadId,
        runId,
        projectId: claimProjectId,
        communityId: claimCommunityId,
        eventType: "headless_sandbox_ensure_completed",
        eventKey: `${runId}:headless_sandbox_ensure_completed:ok`,
        payload: {
          sandbox_id: names.sandboxName,
          volume_name: runtimeVolumeName,
          provider_id: "blaxel",
          status: "ok",
          latency_ms: sandboxEnsureCompletedAt - sandboxStartRequestedAt,
        },
      });

      const bridgeFilesStartedAt = Date.now();
      const authPayloadContent = `${JSON.stringify(buildCodexBlaxelExternalAuthPayload({
        accessToken: auth.accessToken,
        chatgptAccountId,
        chatgptPlanType: null,
      }))}\n`;
      const runtimePayloadContent = `${JSON.stringify({
        runId,
        bridgeToken: token.token,
        eventUrl,
        finishUrl,
        mcpToolUrl,
        prompt,
        developerInstructions,
        codexRuntimeProjection,
        codexNativeMcpProjection,
        modelId,
      })}\n`;
      const bridgePrep = await prepareBlaxelWorkspaceBridgeFiles({
        sandboxName: names.sandboxName,
        bridgeDir,
        files: [
          {
            label: "auth_payload",
            path: authPayloadPath,
            content: authPayloadContent,
          },
          {
            label: "runtime_payload",
            path: runtimePayloadPath,
            content: runtimePayloadContent,
          },
        ],
      });
      if (!bridgePrep.ok) {
        queueCodexRuntimePhaseEvent({
          eventType: "codex_bridge_files_prepared",
          eventKey: "codex_bridge_files_prepared",
          phase: "bridge_files_prepared",
          startedAt: bridgeFilesStartedAt,
          endedAt: Date.now(),
          payload: {
            ok: false,
            sandbox_name: names.sandboxName,
            failure_code: bridgePrep.code || null,
          },
        });
        throw new Error(`bridge_files_prepare_failed:${bridgePrep.code || bridgePrep.message}`);
      }

      queueCodexRuntimePhaseEvent({
        eventType: "codex_bridge_dir_prepare_completed",
        eventKey: "codex_bridge_dir_prepare_completed",
        phase: "bridge_dir_prepare",
        startedAt: bridgePrep.directoryPrepareStartedAt,
        endedAt: bridgePrep.directoryPrepareCompletedAt,
        payload: {
          ok: true,
          sandbox_name: names.sandboxName,
          bridge_dir: bridgeDir,
          directory_mode_applied: bridgePrep.directoryModeApplied,
          directory_mode_method: bridgePrep.directoryModeMethod,
          chmod_provider_command_id: bridgePrep.chmodProviderCommandId,
        },
      });
      const authPayloadWrite = bridgePrep.files.find((file) => file.label === "auth_payload");
      if (authPayloadWrite) {
        queueCodexRuntimePhaseEvent({
          eventType: "codex_bridge_auth_payload_write_completed",
          eventKey: "codex_bridge_auth_payload_write_completed",
          phase: "bridge_auth_payload_write",
          startedAt: authPayloadWrite.writeStartedAt,
          endedAt: authPayloadWrite.writeCompletedAt,
          payload: {
            ok: true,
            sandbox_name: names.sandboxName,
            bytes: authPayloadWrite.bytes,
          },
        });
      }
      const runtimePayloadWrite = bridgePrep.files.find((file) => file.label === "runtime_payload");
      if (runtimePayloadWrite) {
        queueCodexRuntimePhaseEvent({
          eventType: "codex_bridge_runtime_payload_write_completed",
          eventKey: "codex_bridge_runtime_payload_write_completed",
          phase: "bridge_runtime_payload_write",
          startedAt: runtimePayloadWrite.writeStartedAt,
          endedAt: runtimePayloadWrite.writeCompletedAt,
          payload: {
            ok: true,
            sandbox_name: names.sandboxName,
            bytes: runtimePayloadWrite.bytes,
          },
        });
      }
      queueCodexRuntimePhaseEvent({
        eventType: "codex_bridge_files_prepared",
        eventKey: "codex_bridge_files_prepared",
        phase: "bridge_files_prepared",
        startedAt: bridgeFilesStartedAt,
        endedAt: Date.now(),
        payload: {
          ok: true,
          sandbox_name: names.sandboxName,
          bridge_dir: bridgeDir,
          auth_payload_written: Boolean(authPayloadWrite),
          runtime_payload_written: Boolean(runtimePayloadWrite),
          provider_sandbox_id: bridgePrep.providerSandboxId,
          directory_mode_method: bridgePrep.directoryModeMethod,
        },
      });

      webSocketProcessName = safeResourceName(`polynet-codex-runtime-ws-${names.bridgeId}`);
      const appServerLaunchStartedAt = Date.now();
      const webSocketStart = await executeBlaxelWorkspaceCommand({
        sandboxName: names.sandboxName,
        cwd: ".",
        command: `bash -lc ${shellQuote(
          buildCodexWebSocketAppServerStartCommand({
            workspaceRoot,
            bridgeDir,
          }),
        )}`,
        processName: webSocketProcessName,
        waitForCompletion: false,
        timeoutSeconds: 60,
      });
      queueCodexRuntimePhaseEvent({
        eventType: "codex_app_server_launch_requested",
        eventKey: "codex_app_server_launch_requested",
        phase: "app_server_launch_requested",
        startedAt: appServerLaunchStartedAt,
        endedAt: Date.now(),
        payload: {
          ok: webSocketStart.ok,
          sandbox_name: names.sandboxName,
          process_name: webSocketProcessName,
          failure_code: webSocketStart.ok ? null : webSocketStart.code,
        },
      });
      if (!webSocketStart.ok) throw new Error(`codex_websocket_app_server_start_failed:${webSocketStart.code}`);

      clientProcessName = safeResourceName(`polynet-codex-runtime-client-${names.bridgeId}`);
      const bridgeClientLaunchStartedAt = Date.now();
      const clientStarted = await executeBlaxelWorkspaceCommand({
        sandboxName: names.sandboxName,
        cwd: ".",
        command: `bash -lc ${shellQuote(
          buildCodexWebSocketRuntimeBridgeClientCommand({
            workspaceRoot,
            bridgeDir,
            authPayloadPath,
            runtimePayloadPath,
          }),
        )}`,
        processName: clientProcessName,
        waitForCompletion: false,
        timeoutSeconds: 360,
      });
      queueCodexRuntimePhaseEvent({
        eventType: "codex_bridge_client_launch_requested",
        eventKey: "codex_bridge_client_launch_requested",
        phase: "bridge_client_launch_requested",
        startedAt: bridgeClientLaunchStartedAt,
        endedAt: Date.now(),
        payload: {
          ok: clientStarted.ok,
          sandbox_name: names.sandboxName,
          process_name: clientProcessName,
          failure_code: clientStarted.ok ? null : clientStarted.code,
        },
      });
      await recordHeadlessCodexOperationEvent({
        ctx,
        ownerId: actor.userId as any,
        threadId: args.threadId,
        runId,
        projectId: claimProjectId,
        communityId: claimCommunityId,
        eventType: "headless_codex_bridge_worker_started",
        eventKey: `${runId}:headless_codex_bridge_worker_started:${clientProcessName}`,
        payload: {
          sandbox_id: names.sandboxName,
          provider_id: "blaxel",
          process_name: clientProcessName,
          websocket_process_name: webSocketProcessName,
          status: clientStarted.ok ? "ok" : "error",
          code: clientStarted.ok ? null : clientStarted.code ?? null,
        },
      });
      await flushCodexRuntimePhaseTelemetry();
      const commandResult = clientStarted.ok
        ? await waitForBridgeProcessCompletion({
            ctx,
            ownerId: actor.userId as any,
            runId,
            sandboxName: names.sandboxName,
            processName: clientProcessName,
            statusPath: bridgeStatusPath,
            timeoutMs: 360_000,
            intervalMs: 3_000,
          })
        : clientStarted;
      if (!commandResult.ok) {
        queueCodexRuntimePhaseEvent({
          eventType: "codex_bridge_client_failed",
          eventKey: "codex_bridge_client_failed",
          phase: "bridge_client_failed",
          startedAt: bridgeClientLaunchStartedAt,
          endedAt: Date.now(),
          payload: {
            ok: false,
            sandbox_name: names.sandboxName,
            process_name: clientProcessName,
            failure_code: commandResult.code,
          },
        });
        await flushCodexRuntimePhaseTelemetry();
        throw new Error(redactSensitiveText(`codex_runtime_bridge_failed:${commandResult.message || commandResult.code}`));
      }
      const stdout = normalizeString(commandResult.stdout);
      const okMarker = stdout.includes("POLYNET_CODEX_RUNTIME_BRIDGE_OK");
      const payloadsRemoved = stdout.includes("POLYNET_CODEX_RUNTIME_PAYLOADS_REMOVED");
      if (commandResult.exitCode !== 0 || !okMarker || !payloadsRemoved) {
        throw new Error(redactSensitiveText(`codex_runtime_bridge_failed:${stdout || commandResult.stderr || commandResult.status}`));
      }

      await ctx.runMutation(internal.threads.setCloudRuntimeRunContextSnapshotInternal as any, {
        ownerId: actor.userId as any,
        threadId: args.threadId,
        runId,
        phase: "finished",
        snapshot: buildRuntimeTurnContextSnapshot({
          packet: loadedContextPacket,
          capturedAt: Date.now(),
          runtimeContextCapsule,
          runtimeContextCapsuleMetadata,
          runtimeContextCapsulePhase: "started",
        }),
        nowMs: Date.now(),
      }).catch(() => null);

      const events = (await ctx.runQuery(internal.threads.listRuntimeRunEventsByOwnerRunIdInternal as any, {
        ownerId: actor.userId as any,
        runId,
      }).catch(() => [])) as Array<{ eventType?: unknown; payload?: unknown }>;
      const eventTypes = events.map((event) => normalizeString(event.eventType)).filter(Boolean);
      const assistantTextChars = events
        .filter((event) => normalizeString(event.eventType) === "assistant_text_delta")
        .reduce((total, event) => {
          const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
            ? (event.payload as Record<string, unknown>)
            : {};
          return total + String(payload.delta ?? "").length;
        }, 0);

      costOutcome = "succeeded";
      return {
        ok: true,
        runId,
        modelId,
        sandboxName: names.sandboxName,
        volumeName: runtimeVolumeName,
        destroyedAfterRun: destroyAfterRun,
        eventSummary: {
          eventCount: events.length,
          eventTypes,
          assistantTextChars,
          hasAssistantTextDelta: eventTypes.includes("assistant_text_delta"),
          hasRunFinished: eventTypes.includes("run_finished"),
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const wasCancelled = isRuntimeRunCancelledError(error);
      const failureCode = wasCancelled
        ? USER_CANCELLED_RUNTIME_CODE
        : "codex_blaxel_runtime_turn_failed";
      costOutcome = wasCancelled ? "cancelled" : "failed";
      costFailureCode = failureCode;
      await ctx.runMutation(internal.threads.finishCloudRuntimeRunByBridgeClaimsInternal as any, {
        ownerId: actor.userId as any,
        threadId: args.threadId,
        runId,
        claimProjectId: normalizeString(run?.projectId ?? thread.projectId) || undefined,
        claimCommunityId: normalizeString(run?.communityId ?? thread.communityId) || undefined,
        status: wasCancelled ? "cancelled" : "error",
        reason: failureCode,
        errorCode: failureCode,
        errorMessage: redactSensitiveText(message),
        nowMs: Date.now(),
      }).catch(() => null);
      return {
        ok: false,
        runId,
        sandboxName: names.sandboxName,
        volumeName: runtimeVolumeName,
        failure: safeFailure(failureCode, message),
      };
    } finally {
      await flushCodexRuntimePhaseTelemetry().catch(() => null);
      if (clientProcessName) {
        await stopBlaxelWorkspaceProcess({
          sandboxName: names.sandboxName,
          processName: clientProcessName,
        }).catch(() => null);
      }
      if (webSocketProcessName) {
        await stopBlaxelWorkspaceProcess({
          sandboxName: names.sandboxName,
          processName: webSocketProcessName,
        }).catch(() => null);
      }
      let bridgeCleanupAttempted = false;
      let bridgeCleanupSucceeded = false;
      let bridgeCleanupFailureCode: string | null = null;
      let sandboxDestroyAttempted = false;
      let sandboxDestroySucceeded = false;
      let sandboxDestroyFailureCode: string | null = null;
      let volumeDestroyAttempted = false;
      let volumeDestroySucceeded = false;
      let volumeDestroyFailureCode: string | null = null;

      bridgeCleanupAttempted = true;
      try {
        const cleanupResult = await executeBlaxelWorkspaceCommand({
          sandboxName: names.sandboxName,
          cwd: ".",
          command: `bash -lc ${shellQuote(
            buildBridgeCleanupCommand({
              workspaceRoot,
              bridgeDir,
              authPayloadPath,
            }),
          )}`,
          waitForCompletion: true,
          timeoutSeconds: 30,
        });
        bridgeCleanupSucceeded = cleanupResult.ok === true && cleanupResult.exitCode === 0;
        if (!bridgeCleanupSucceeded) {
          bridgeCleanupFailureCode = cleanupResult.ok === false
            ? normalizeString(cleanupResult.code) || "bridge_cleanup_failed"
            : `bridge_cleanup_exit_${cleanupResult.exitCode ?? "unknown"}`;
        }
      } catch (error) {
        bridgeCleanupFailureCode = error instanceof Error ? error.message : String(error ?? "bridge_cleanup_failed");
      }
      if (destroyAfterRun) {
        sandboxDestroyAttempted = true;
        try {
          const sandboxDestroy = await destroyBlaxelWorkspaceComputer({
            sandboxName: names.sandboxName,
            volumeName: runtimeVolumeName,
            workspaceRoot,
          });
          if (sandboxDestroy.ok === true) {
            sandboxDestroySucceeded = true;
          } else {
            sandboxDestroyFailureCode = normalizeString(sandboxDestroy.code) || "sandbox_destroy_failed";
          }
        } catch (error) {
          sandboxDestroyFailureCode = error instanceof Error ? error.message : String(error ?? "sandbox_destroy_failed");
        }
        if (runtimeVolumeName) {
          volumeDestroyAttempted = true;
          try {
            const volumeDestroy = await destroyBlaxelWorkspaceVolume({
              volumeName: runtimeVolumeName,
            });
            if (volumeDestroy.ok === true) {
              volumeDestroySucceeded = true;
            } else {
              volumeDestroyFailureCode = normalizeString(volumeDestroy.code) || "volume_destroy_failed";
            }
          } catch (error) {
            volumeDestroyFailureCode = error instanceof Error ? error.message : String(error ?? "volume_destroy_failed");
          }
        }
      }
      if (sandboxEnsured) {
        await ctx.runMutation(internal.threads.setCloudRuntimeRunWorkspaceSessionInternal as any, {
          ownerId: actor.userId as any,
          runId,
          state: destroyAfterRun
            ? sandboxDestroySucceeded
              ? "released"
              : "failed"
            : "active",
          providerSandboxId: names.sandboxName,
          nowMs: Date.now(),
        }).catch(() => null);
      }
      await recordTrackedCodexBlaxelRuntimeProviderCostBestEffort({
        ctx,
        ownerId: actor.userId as any,
        projectId: (run?.projectId ?? thread.projectId) || null,
        communityId: (run?.communityId ?? thread.communityId) || null,
        runId,
        sandboxName: names.sandboxName,
        volumeName: runtimeVolumeName,
        startedAt: sandboxStartedAt,
        endedAt: Date.now(),
        sandboxCpu,
        sandboxMemoryGiB,
        sandboxDiskGiB,
        destroyedAfterRun: destroyAfterRun,
        bridgeCleanupAttempted,
        bridgeCleanupSucceeded,
        bridgeCleanupFailureCode,
        sandboxDestroyAttempted,
        sandboxDestroySucceeded,
        sandboxDestroyFailureCode,
        volumeDestroyAttempted,
        volumeDestroySucceeded,
        volumeDestroyFailureCode,
        outcome: costOutcome,
        failureCode: costFailureCode,
      });
    }
  },
});

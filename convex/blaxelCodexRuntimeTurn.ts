"use node";

import { randomUUID } from "node:crypto";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  destroyBlaxelWorkspaceComputer,
  ensureBlaxelWorkspaceComputer,
  executeBlaxelWorkspaceCommand,
  readBlaxelWorkspaceFile,
  readBlaxelWorkspaceProcess,
  stopBlaxelWorkspaceProcess,
  writeBlaxelWorkspaceFile,
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
import { loadRuntimeTurnContextPacketForRun } from "./runtimeTurnContext";
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

function buildDeveloperInstructions(contextPrompt: string): string {
  return [
    "You are Codex running headlessly inside a Blaxel sandbox for PolyNet.",
    "Use the PolyNet runtime context as orientation. Do not treat it as a deterministic route; gather additional context with your normal Codex tools when useful.",
    "Default execution posture inside this sandbox is full access with no approval prompts.",
    "Do not include secrets or raw credentials in the final answer.",
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
    const contextSnapshot = buildRuntimeTurnContextSnapshot({
      packet: loadedContext.packet,
      capturedAt: contextLoadedAt,
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
      },
    });
    const contextPrompt = (renderRuntimeTurnContextForPrompt(loadedContext.packet) ?? "").slice(0, 24_000);
    const developerInstructions = buildDeveloperInstructions(contextPrompt);

    const token = await mintCodexBridgeRunToken({
      runId,
      ownerId: actor.userId,
      threadId: String(args.threadId),
      projectId: claimProjectId || null,
      communityId: claimCommunityId || null,
      operations: ["event", "finish"],
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

    try {
      const sandboxStartRequestedAt = Date.now();
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
      sandboxStartedAt = sandboxStartRequestedAt;
      workspaceRoot = ensured.workspaceRoot;

      const bridgePath = `${workspaceRoot}/${bridgeDir}`;
      const bridgeFilesStartedAt = Date.now();
      const prepareDir = await executeBlaxelWorkspaceCommand({
        sandboxName: names.sandboxName,
        cwd: ".",
        command: `bash -lc ${shellQuote(`mkdir -p ${shellQuote(bridgePath)} && chmod 700 ${shellQuote(bridgePath)}`)}`,
        waitForCompletion: true,
        timeoutSeconds: 30,
      });
      if (!prepareDir.ok || prepareDir.exitCode !== 0) {
        queueCodexRuntimePhaseEvent({
          eventType: "codex_bridge_files_prepared",
          eventKey: "codex_bridge_files_prepared",
          phase: "bridge_files_prepared",
          startedAt: bridgeFilesStartedAt,
          endedAt: Date.now(),
          payload: {
            ok: false,
            sandbox_name: names.sandboxName,
            exit_code: prepareDir.ok ? prepareDir.exitCode ?? null : null,
          },
        });
        throw new Error("bridge_directory_prepare_failed");
      }

      const authPayloadWrite = await writeBlaxelWorkspaceFile({
        sandboxName: names.sandboxName,
        path: authPayloadPath,
        content: `${JSON.stringify(buildCodexBlaxelExternalAuthPayload({
          accessToken: auth.accessToken,
          chatgptAccountId,
          chatgptPlanType: null,
        }))}\n`,
      });
      if (!authPayloadWrite.ok) throw new Error(`auth_payload_write_failed:${authPayloadWrite.code}`);

      const runtimePayloadWrite = await writeBlaxelWorkspaceFile({
        sandboxName: names.sandboxName,
        path: runtimePayloadPath,
        content: `${JSON.stringify({
          runId,
          bridgeToken: token.token,
          eventUrl,
          finishUrl,
          prompt,
          developerInstructions,
          modelId,
        })}\n`,
      });
      if (!runtimePayloadWrite.ok) throw new Error(`runtime_payload_write_failed:${runtimePayloadWrite.code}`);
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
          auth_payload_written: true,
          runtime_payload_written: true,
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
      queueCodexRuntimePhaseEvent({
        eventType: "codex_bridge_client_completed",
        eventKey: "codex_bridge_client_completed",
        phase: "bridge_client_completed",
        startedAt: bridgeClientLaunchStartedAt,
        endedAt: Date.now(),
        payload: {
          ok: commandResult.ok,
          sandbox_name: names.sandboxName,
          process_name: clientProcessName,
          failure_code: commandResult.ok ? null : commandResult.code,
        },
      });
      await flushCodexRuntimePhaseTelemetry();
      if (!commandResult.ok) {
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
          packet: loadedContext.packet,
          capturedAt: Date.now(),
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

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
import { destroyBlaxelWorkspaceVolume } from "./blaxelWorkspaceClient.ts";
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

type RuntimeTurnFailure = {
  code: string;
  message: string;
};

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

function normalizeDeploymentKind(value: unknown): string {
  return normalizeString(value).toLowerCase();
}

function safeNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : undefined;
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
    const modelId = normalizeString(args.modelId) || "gpt-5.3-codex-spark";
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

    const contextLoadedAt = Date.now();
    const loadedContext = await loadRuntimeTurnContextPacketForRun({
      ctx,
      ownerId: actor.userId,
      threadId: args.threadId,
      projectId: normalizeString(run?.projectId ?? thread.projectId) || null,
      runId,
      latestUserText: prompt,
      threadWorkingState: (thread.workingState as any) ?? null,
      summarizeCurrentRunEvents: false,
      runtimeStop: null,
    });
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
    const contextPrompt = renderRuntimeTurnContextForPrompt(loadedContext.packet).slice(0, 24_000);
    const developerInstructions = buildDeveloperInstructions(contextPrompt);

    const token = await mintCodexBridgeRunToken({
      runId,
      ownerId: actor.userId,
      threadId: String(args.threadId),
      projectId: normalizeString(run?.projectId ?? thread.projectId) || null,
      communityId: normalizeString(run?.communityId ?? thread.communityId) || null,
      operations: ["event", "finish"],
      ttlMs: 15 * 60 * 1000,
    });
    if (!token.ok) {
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
    const bridgeDir = `.polynet/codex-runtime-bridge/${names.bridgeId}`;
    const authPayloadPath = `${bridgeDir}/auth-payload.json`;
    const runtimePayloadPath = `${bridgeDir}/runtime-payload.json`;
    const bridgeStatusPath = `${bridgeDir}/bridge-status.out`;
    const eventUrl = `${callbackBaseUrl}/runtime/codex_bridge/event`;
    const finishUrl = `${callbackBaseUrl}/runtime/codex_bridge/finish`;
    const destroyAfterRun = args.destroyAfterRun !== false;
    let workspaceRoot = "/workspace";
    let webSocketProcessName: string | null = null;
    let clientProcessName: string | null = null;

    try {
      const ensured = await ensureBlaxelWorkspaceComputer({
        sandboxName: names.sandboxName,
        volumeName: names.volumeName,
        volumeSizeMb: CODEX_APP_SERVER_RUNTIME_VOLUME_SIZE_MB,
        lifecycleIntent: "agent_run",
        labels: {
          purpose: "codex-runtime-turn",
        },
      });
      if (!ensured.ok) {
        throw new Error(`sandbox_ensure_failed:${ensured.code || ensured.message}`);
      }
      workspaceRoot = ensured.workspaceRoot;

      const bridgePath = `${workspaceRoot}/${bridgeDir}`;
      const prepareDir = await executeBlaxelWorkspaceCommand({
        sandboxName: names.sandboxName,
        cwd: ".",
        command: `bash -lc ${shellQuote(`mkdir -p ${shellQuote(bridgePath)} && chmod 700 ${shellQuote(bridgePath)}`)}`,
        waitForCompletion: true,
        timeoutSeconds: 30,
      });
      if (!prepareDir.ok || prepareDir.exitCode !== 0) {
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

      webSocketProcessName = safeResourceName(`polynet-codex-runtime-ws-${names.bridgeId}`);
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
      if (!webSocketStart.ok) throw new Error(`codex_websocket_app_server_start_failed:${webSocketStart.code}`);

      clientProcessName = safeResourceName(`polynet-codex-runtime-client-${names.bridgeId}`);
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
      const stdout = normalizeString(commandResult.stdout);
      const okMarker = stdout.includes("POLYNET_CODEX_RUNTIME_BRIDGE_OK");
      const payloadsRemoved = stdout.includes("POLYNET_CODEX_RUNTIME_PAYLOADS_REMOVED");
      if (!commandResult.ok || commandResult.exitCode !== 0 || !okMarker || !payloadsRemoved) {
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

      return {
        ok: true,
        runId,
        modelId,
        sandboxName: names.sandboxName,
        volumeName: names.volumeName,
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
        volumeName: names.volumeName,
        failure: safeFailure(failureCode, message),
      };
    } finally {
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
      await executeBlaxelWorkspaceCommand({
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
      }).catch(() => null);
      if (destroyAfterRun) {
        await destroyBlaxelWorkspaceComputer({
          sandboxName: names.sandboxName,
          volumeName: names.volumeName,
          workspaceRoot,
        }).catch(() => null);
        await destroyBlaxelWorkspaceVolume({
          volumeName: names.volumeName,
        }).catch(() => null);
      }
    }
  },
});

import {
  buildRuntimeCodexPromptProjection,
  type RuntimeCodexPromptProjection,
} from "../shared/runtimeCodexPromptProjection";
import { DEFAULT_RUNTIME_KERNEL_BUDGET } from "../shared/runtimeKernelTypes";
import type { RuntimeTurnContextPacket } from "../shared/runtimeTurnContextPacket";
import type { RetrievalToolName } from "../shared/retrievalTools";
import type { CommunityLensAuthority } from "../shared/communityLensAuthority";
import {
  RUNTIME_ENGINE_CODEX,
  RUNTIME_ENGINE_POLYNET,
  type RuntimeEngine,
} from "../shared/runtimeEngine";

export const POLYNET_CODEX_WORKER_ENGINE_ID = "polynet_codex_worker";
export const POLYNET_RUNTIME_ENGINE_ID = "runtime_convex";
export const POLYNET_CODEX_WORKER_CONTRACT_NAME = "polynet_codex_runtime_daytona_v1";
export const POLYNET_CODEX_WORKER_CONTRACT_VERSION = "v1";
const POLYNET_CODEX_WORKER_ALLOWED_DEPLOYMENT_KINDS = new Set([
  "staging",
  "production",
] as const);

type JsonRecord = Record<string, unknown>;
type PolynetCodexWorkerDeploymentKind = "staging" | "production";
type PolynetCodexWorkerTransportProvider = "daytona_direct";

export type PolynetCodexWorkerResolvedTarget = {
  provider: "daytona";
  targetId: string;
  sandboxId: string | null;
  workerUrl: string;
  authToken: string;
  signedPreviewExpiresAt: number | null;
};

export type PolynetCodexWorkerSseEvent = {
  event: string;
  data: JsonRecord;
};

export type PolynetCodexWorkerBridgeResult =
  | {
      ok: true;
      assistantText: string;
      timing: JsonRecord | null;
      proof: JsonRecord | null;
      finalPayload: JsonRecord | null;
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      assistantText: string;
      timing: JsonRecord | null;
      proof: JsonRecord | null;
    };

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // Convex exposes environment variables through process.env in actions.
  }
  return "";
}

function readBooleanEnv(name: string): boolean {
  const raw = readEnv(name).toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function hasDaytonaCredentials(): boolean {
  return Boolean(readEnv("DAYTONA_API_KEY") || readEnv("DAYTONA_JWT_TOKEN"));
}

function readWorkerDeploymentKind(): PolynetCodexWorkerDeploymentKind | null {
  const raw = readEnv("POLYNET_DEPLOYMENT_KIND");
  return POLYNET_CODEX_WORKER_ALLOWED_DEPLOYMENT_KINDS.has(
    raw as PolynetCodexWorkerDeploymentKind,
  )
    ? (raw as PolynetCodexWorkerDeploymentKind)
    : null;
}

export function getPolynetCodexWorkerBridgeConfig(): {
  enabled: boolean;
  provider: PolynetCodexWorkerTransportProvider;
  baseUrl: string | null;
  authToken: string | null;
  disabledReason: string | null;
} {
  const provider = "daytona_direct";
  if (!readBooleanEnv("POLYNET_CODEX_WORKER_RUNTIME_ENABLED")) {
    return {
      enabled: false,
      provider,
      baseUrl: null,
      authToken: null,
      disabledReason: "polynet_codex_worker_runtime_disabled",
    };
  }
  const deploymentKind = readWorkerDeploymentKind();
  if (!deploymentKind) {
    return {
      enabled: false,
      provider,
      baseUrl: null,
      authToken: null,
      disabledReason: "polynet_codex_worker_deployment_kind_invalid",
    };
  }
  const authToken = readEnv("POLYNET_CODEX_WORKER_AUTH_TOKEN");
  if (!authToken) {
    return {
      enabled: false,
      provider,
      baseUrl: null,
      authToken: null,
      disabledReason: "polynet_codex_worker_auth_token_missing",
    };
  }
  if (!hasDaytonaCredentials()) {
    return {
      enabled: false,
      provider,
      baseUrl: null,
      authToken,
      disabledReason: "daytona_direct_credentials_missing",
    };
  }
  return {
    enabled: true,
    provider,
    baseUrl: null,
    authToken,
    disabledReason: null,
  };
}

export type PolynetRuntimeEngineResolution =
  | {
      ok: true;
      requestedRuntimeEngine: RuntimeEngine | null;
      resolvedRuntimeEngine: RuntimeEngine;
      runtimeEngineSource: "request" | "legacy_inference";
      engineId: string;
      usePolynetCodexWorkerBridge: boolean;
      disabledReason: string | null;
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      requestedRuntimeEngine: RuntimeEngine;
      resolvedRuntimeEngine: null;
      runtimeEngineSource: "request";
      engineId: null;
      usePolynetCodexWorkerBridge: false;
      disabledReason: string | null;
    };

function resolveExplicitCodexWorkerFailure(params: {
  runtimeExecutionMode: "agentic" | "chat";
  stream: boolean;
  inferenceSource: "free" | "platform" | "user_key" | "chatgpt";
}): {
  status: number;
  code: string;
  message: string;
  disabledReason: string | null;
} | null {
  if (params.runtimeExecutionMode !== "agentic") {
    return {
      status: 400,
      code: "polynet_codex_worker_requires_agentic_runtime",
      message: "Codex runtime requires agentic workspace tools.",
      disabledReason: null,
    };
  }
  if (!params.stream) {
    return {
      status: 400,
      code: "polynet_codex_worker_requires_streaming",
      message: "Codex runtime requires streaming turns.",
      disabledReason: null,
    };
  }
  if (params.inferenceSource !== "chatgpt") {
    return {
      status: 403,
      code: "polynet_codex_worker_requires_chatgpt",
      message: "Codex runtime requires a connected ChatGPT account.",
      disabledReason: null,
    };
  }
  const config = getPolynetCodexWorkerBridgeConfig();
  if (!config.enabled) {
    return {
      status: 503,
      code: config.disabledReason ?? "polynet_codex_worker_env_missing",
      message: "PolyNet Codex worker is not configured for this deployment.",
      disabledReason: config.disabledReason,
    };
  }
  return null;
}

export function resolvePolynetRuntimeEngine(params: {
  requestedRuntimeEngine: RuntimeEngine | null;
  runtimeExecutionMode: "agentic" | "chat";
  stream: boolean;
  inferenceSource: "free" | "platform" | "user_key" | "chatgpt";
}): PolynetRuntimeEngineResolution {
  if (params.requestedRuntimeEngine === RUNTIME_ENGINE_POLYNET) {
    return {
      ok: true,
      requestedRuntimeEngine: params.requestedRuntimeEngine,
      resolvedRuntimeEngine: RUNTIME_ENGINE_POLYNET,
      runtimeEngineSource: "request",
      engineId: POLYNET_RUNTIME_ENGINE_ID,
      usePolynetCodexWorkerBridge: false,
      disabledReason: null,
    };
  }

  if (params.requestedRuntimeEngine === RUNTIME_ENGINE_CODEX) {
    const failure = resolveExplicitCodexWorkerFailure(params);
    if (failure) {
      return {
        ok: false,
        ...failure,
        requestedRuntimeEngine: params.requestedRuntimeEngine,
        resolvedRuntimeEngine: null,
        runtimeEngineSource: "request",
        engineId: null,
        usePolynetCodexWorkerBridge: false,
      };
    }
    return {
      ok: true,
      requestedRuntimeEngine: params.requestedRuntimeEngine,
      resolvedRuntimeEngine: RUNTIME_ENGINE_CODEX,
      runtimeEngineSource: "request",
      engineId: POLYNET_CODEX_WORKER_ENGINE_ID,
      usePolynetCodexWorkerBridge: true,
      disabledReason: null,
    };
  }

  return {
    ok: true,
    requestedRuntimeEngine: null,
    resolvedRuntimeEngine: RUNTIME_ENGINE_POLYNET,
    runtimeEngineSource: "legacy_inference",
    engineId: POLYNET_RUNTIME_ENGINE_ID,
    usePolynetCodexWorkerBridge: false,
    disabledReason: null,
  };
}

export type PolynetCodexWorkerChatgptAuth = {
  accessToken: string;
  accountId: string;
  planType: string | null;
};

export type PolynetCodexWorkerTurnInputs = RuntimeCodexPromptProjection;

export function buildPolynetCodexWorkerTurnInputs(params: {
  conversationMessages: Array<{ role: "user" | "assistant"; content: string }>;
  latestUserText: string;
  communityName: string | null;
  communitySlug: string | null;
  communityOneLiner: string | null;
  communityAbout: string | null;
  communitySystemPrompt: string | null;
  communityLensAuthority: CommunityLensAuthority | null;
  agentName: string | null;
  agentSoul: string | null;
  runtimeTurnContext: RuntimeTurnContextPacket;
  codexVisiblePolynetToolNames: readonly RetrievalToolName[];
  currentDateTimeIso: string | null;
  currentDateLabel: string | null;
  currentTimeZone: string | null;
}): PolynetCodexWorkerTurnInputs {
  const projectContext = params.runtimeTurnContext.projectContext ?? null;
  return buildRuntimeCodexPromptProjection({
    loopBudget: DEFAULT_RUNTIME_KERNEL_BUDGET,
    allowedToolNames: params.codexVisiblePolynetToolNames,
    harnessName: "chat_tools",
    communityId: params.runtimeTurnContext.runtimeTurnEnvelope?.authority.communityId ?? null,
    communityName: params.communityName,
    communitySlug: params.communitySlug,
    communityOneLiner: params.communityOneLiner,
    communityAbout: params.communityAbout,
    communitySystemPrompt: params.communitySystemPrompt,
    communityLensAuthority: params.communityLensAuthority,
    communityResourceLane: params.communityLensAuthority?.communityResourceLane ?? null,
    agentName: params.agentName,
    agentSoul: params.agentSoul,
    projectLabel: projectContext?.label ?? null,
    projectDescription: projectContext?.description ?? null,
    runtimeTurnContext: params.runtimeTurnContext,
    currentDateTimeIso: params.currentDateTimeIso,
    currentDateLabel: params.currentDateLabel,
    currentTimeZone: params.currentTimeZone,
    conversationMessages: params.conversationMessages,
    latestUserText: params.latestUserText,
  });
}

function parseSseBlock(block: string): PolynetCodexWorkerSseEvent | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }
  if (dataLines.length === 0) return null;
  const parsed = asRecord(JSON.parse(dataLines.join("\n"))) ?? {};
  return { event, data: parsed };
}

async function readResponseJson(response: Response): Promise<JsonRecord> {
  try {
    return asRecord(await response.json()) ?? {};
  } catch {
    return {};
  }
}

function normalizeWorkerErrorPayload(payload: JsonRecord, fallbackStatus: number): {
  code: string;
  message: string;
} {
  const code =
    String(payload.code ?? payload.error ?? "").trim() ||
    (fallbackStatus === 409 ? "worker_busy" : "polynet_codex_worker_failed");
  const message =
    String(payload.message ?? payload.error ?? "").trim() ||
    (fallbackStatus === 409
      ? "PolyNet Codex worker is busy."
      : "PolyNet Codex worker request failed.");
  return { code, message };
}

function resolveWorkerTransport(params?: {
  target?: PolynetCodexWorkerResolvedTarget | null;
}): {
  enabled: boolean;
  baseUrl: string | null;
  authToken: string | null;
  disabledReason: string | null;
} {
  if (params?.target?.workerUrl && params.target.authToken) {
    return {
      enabled: true,
      baseUrl: params.target.workerUrl.replace(/\/+$/, ""),
      authToken: params.target.authToken,
      disabledReason: null,
    };
  }
  const config = getPolynetCodexWorkerBridgeConfig();
  return {
    enabled: config.enabled,
    baseUrl: config.baseUrl,
    authToken: config.authToken,
    disabledReason: config.enabled
      ? "daytona_direct_target_missing"
      : config.disabledReason,
  };
}

export async function cancelPolynetCodexWorkerTurn(params: {
  runId: string;
  machineId?: string | null;
  target?: PolynetCodexWorkerResolvedTarget | null;
}): Promise<{ ok: boolean; status: number }> {
  const config = resolveWorkerTransport({ target: params.target ?? null });
  if (!config.enabled || !config.baseUrl || !config.authToken) {
    return { ok: false, status: 503 };
  }
  try {
    const response = await fetch(`${config.baseUrl}/v1/codex/turn/cancel`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ run_id: params.runId }),
    });
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false, status: 502 };
  }
}

export async function steerPolynetCodexWorkerTurn(params: {
  runId: string;
  machineId?: string | null;
  text: string;
  target?: PolynetCodexWorkerResolvedTarget | null;
}): Promise<{ ok: boolean; status: number }> {
  const config = resolveWorkerTransport({ target: params.target ?? null });
  if (!config.enabled || !config.baseUrl || !config.authToken) {
    return { ok: false, status: 503 };
  }
  try {
    const response = await fetch(`${config.baseUrl}/v1/codex/turn/steer`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ run_id: params.runId, text: params.text }),
    });
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false, status: 502 };
  }
}

export async function streamPolynetCodexWorkerTurn(params: {
  runId: string;
  prompt: string;
  developerInstructions?: string | null;
  model: string;
  sandboxName?: string | null;
  destroyAfterRun?: boolean;
  chatgptAuth: PolynetCodexWorkerChatgptAuth;
  ingest?: {
    url: string;
    token: string;
    run_token?: string | null;
    tool_run_token?: string | null;
    tool_url?: string | null;
    context: Record<string, unknown>;
  } | null;
  platformTools?: Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }> | null;
  mcpBridgeTools?: Array<{
    bridge_tool_name: string;
    runtime_tool_name: string;
    connector_name: string;
    app_identity_key: string;
    catalog_app_id: string | null;
    tool_name: string;
    namespaced_tool_name: string;
    description: string | null;
    input_schema: unknown;
    risk_level: "read" | "write" | "sensitive";
  }> | null;
  target?: PolynetCodexWorkerResolvedTarget | null;
  onEvent: (event: PolynetCodexWorkerSseEvent) => Promise<void> | void;
}): Promise<PolynetCodexWorkerBridgeResult> {
  const config = resolveWorkerTransport({ target: params.target ?? null });
  if (!config.enabled || !config.baseUrl || !config.authToken) {
    return {
      ok: false,
      status: 503,
      code: config.disabledReason ?? "polynet_codex_worker_env_missing",
      message: "PolyNet Codex worker is not configured for this deployment.",
      assistantText: "",
      timing: null,
      proof: null,
    };
  }

  // A 409 means the runtime target is mid-turn or the Daytona target is still
  // warming, so retry briefly before declaring capacity unavailable. 409 is
  // safe to retry: the turn never started.
  const WORKER_BUSY_RETRY_DELAYS_MS = [1_500, 3_000, 4_500, 6_000];
  let busyAttempt = 0;
  let response: Response;
  // eslint-disable-next-line no-constant-condition
  while (true) {
  try {
    response = await fetch(`${config.baseUrl}/v1/codex/turn?stream=1`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      run_id: params.runId,
      model: params.model,
      prompt: params.prompt,
      ...(String(params.developerInstructions ?? "").trim()
        ? { developer_instructions: String(params.developerInstructions ?? "").trim() }
        : {}),
      stream: true,
      ...(String(params.sandboxName ?? "").trim()
        ? { sandbox_name: String(params.sandboxName ?? "").trim() }
        : {}),
      destroy_after_run: params.destroyAfterRun ?? true,
      chatgpt_auth: {
        access_token: params.chatgptAuth.accessToken,
        chatgpt_account_id: params.chatgptAuth.accountId,
        chatgpt_plan_type: params.chatgptAuth.planType,
      },
      ...(params.ingest
        ? {
            ingest: {
              url: params.ingest.url,
              token: params.ingest.token,
              run_token: params.ingest.run_token ?? null,
              tool_run_token: params.ingest.tool_run_token ?? null,
              tool_url: params.ingest.tool_url ?? null,
              context: params.ingest.context,
            },
          }
        : {}),
      ...(Array.isArray(params.platformTools) && params.platformTools.length > 0
        ? { platform_tools: params.platformTools }
        : {}),
      ...(Array.isArray(params.mcpBridgeTools) && params.mcpBridgeTools.length > 0
        ? { mcp_bridge_tools: params.mcpBridgeTools }
        : {}),
    }),
    });
  } catch (error) {
    return {
      ok: false,
      status: 502,
      code: "polynet_codex_worker_unreachable",
      message: error instanceof Error ? error.message : "PolyNet Codex worker is unreachable.",
      assistantText: "",
      timing: null,
      proof: null,
    };
  }
  if (response.status === 409 && busyAttempt < WORKER_BUSY_RETRY_DELAYS_MS.length) {
    await new Promise((resolve) =>
      setTimeout(resolve, WORKER_BUSY_RETRY_DELAYS_MS[busyAttempt]),
    );
    busyAttempt += 1;
    continue;
  }
  break;
  }

  if (!response.ok) {
    const payload = await readResponseJson(response);
    const error = normalizeWorkerErrorPayload(payload, response.status);
    return {
      ok: false,
      status: response.status,
      code: error.code,
      message: error.message,
      assistantText: "",
      timing: asRecord(payload.timing) ?? null,
      proof: asRecord(payload.proof) ?? null,
    };
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return {
      ok: false,
      status: 502,
      code: "polynet_codex_worker_stream_missing",
      message: "PolyNet Codex worker response did not include a stream.",
      assistantText: "",
      timing: null,
      proof: null,
    };
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let assistantText = "";
  let finalPayload: JsonRecord | null = null;
  let timing: JsonRecord | null = null;
  let proof: JsonRecord | null = null;
  const streamState: {
    errorPayload: { code: string; message: string } | null;
  } = {
    errorPayload: null,
  };

  const handleEvent = async (event: PolynetCodexWorkerSseEvent): Promise<void> => {
    if (event.event === "delta") {
      const full = typeof event.data.full_content === "string" ? event.data.full_content : null;
      const delta = typeof event.data.delta === "string" ? event.data.delta : "";
      if (full !== null) assistantText = full;
      else if (delta) assistantText += delta;
    } else if (event.event === "done") {
      if (typeof event.data.full_content === "string") assistantText = event.data.full_content;
      timing = asRecord(event.data.timing) ?? timing;
      proof = asRecord(event.data.proof) ?? proof;
      finalPayload = event.data;
    } else if (event.event === "run_finalized") {
      timing = asRecord(event.data.timing) ?? timing;
      proof = asRecord(event.data.proof) ?? proof;
      finalPayload = event.data;
      if (event.data.ok === false) {
        const workerError = asRecord(event.data.error);
        streamState.errorPayload = {
          code: String(workerError?.code ?? "polynet_codex_worker_turn_failed"),
          message:
            String(workerError?.message ?? workerError?.name ?? "").trim() ||
            "PolyNet Codex worker turn failed.",
        };
      }
    } else if (event.event === "error") {
      streamState.errorPayload = normalizeWorkerErrorPayload(event.data, 502);
    }
    await params.onEvent(event);
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let separatorIndex = buffer.indexOf("\n\n");
      while (separatorIndex >= 0) {
        const rawBlock = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        const parsed = parseSseBlock(rawBlock);
        if (parsed) await handleEvent(parsed);
        separatorIndex = buffer.indexOf("\n\n");
      }
    }
    if (buffer.trim()) {
      const parsed = parseSseBlock(buffer);
      if (parsed) await handleEvent(parsed);
    }
  } catch (error) {
    // A dropped stream or a failing event callback must become a structured
    // result so the caller settles leases and finishes the run.
    return {
      ok: false,
      status: 502,
      code: "polynet_codex_worker_stream_failed",
      message: error instanceof Error ? error.message : "Worker stream failed.",
      assistantText,
      timing,
      proof,
    };
  }

  if (streamState.errorPayload) {
    return {
      ok: false,
      status: 502,
      code: streamState.errorPayload.code,
      message: streamState.errorPayload.message,
      assistantText,
      timing,
      proof,
    };
  }
  return {
    ok: true,
    assistantText,
    timing,
    proof,
    finalPayload,
  };
}

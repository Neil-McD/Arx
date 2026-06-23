import {
  buildRuntimeCodexPromptProjection,
  type RuntimeCodexPromptProjection,
  type RuntimeCodexPromptProjectionMessage,
} from "../shared/runtimeCodexPromptProjection.ts";
import {
  normalizeCommunityResourceRuntimeLaneState,
  type CommunityResourceRuntimeLaneState,
} from "../shared/communityResourceLane.ts";
import type { RetrievalToolName } from "../shared/retrievalTools.ts";
import type { RuntimeEngine } from "../shared/runtimeEngine.ts";
import type { RuntimePlatformHarnessPromptParams } from "../shared/runtimePrompt.ts";

export const POLYNET_CODEX_WORKER_ENGINE_ID = "polynet_codex_worker";
export const POLYNET_CODEX_WORKER_CONTRACT_NAME =
  "polynet_codex_worker_bridge_v1";
export const POLYNET_CODEX_WORKER_CONTRACT_VERSION = "v1";

const WORKER_RUNTIME_ENABLED_ENV = "POLYNET_CODEX_WORKER_RUNTIME_ENABLED";
const WORKER_URL_ENV = "POLYNET_CODEX_WORKER_URL";
const WORKER_AUTH_TOKEN_ENV = "POLYNET_CODEX_WORKER_AUTH_TOKEN";
const WORKER_TIMEOUT_MS_ENV = "POLYNET_CODEX_WORKER_TIMEOUT_MS";
const DEFAULT_WORKER_TIMEOUT_MS = 60_000;
const MIN_WORKER_TIMEOUT_MS = 1_000;
const MAX_WORKER_TIMEOUT_MS = 120_000;

export type PolynetCodexWorkerBridgeConfig = {
  workerBridgeConfigured: boolean;
  enabled: boolean;
  url: string | null;
  authToken: string | null;
  timeoutMs: number;
  disabledReason: string | null;
};

export type PolynetCodexWorkerBridgeRequest = {
  ownerId: string;
  threadId: string;
  runId: string;
  requestId: string;
  runtimeEngine: RuntimeEngine;
  modelId: string;
  maxTokens: number;
  lane: string;
  inferenceSource: string;
  allowedToolNames: readonly RetrievalToolName[];
  conversationMessages: readonly RuntimeCodexPromptProjectionMessage[];
  latestUserText: string;
  promptProjection: RuntimeCodexPromptProjection;
};

export type PolynetCodexWorkerTransportPayload = {
  contract_name: typeof POLYNET_CODEX_WORKER_CONTRACT_NAME;
  contract_version: typeof POLYNET_CODEX_WORKER_CONTRACT_VERSION;
  engine_id: typeof POLYNET_CODEX_WORKER_ENGINE_ID;
  run_id: string;
  thread_id: string;
  request_id: string;
  runtime_engine: RuntimeEngine;
  model_id: string;
  max_tokens: number;
  lane: string;
  inference_source: string;
  developer_instructions: string;
  prompt: string;
  polynet_platform_tool_names: readonly RetrievalToolName[];
  community_resource_lane: CommunityResourceRuntimeLaneState;
  prompt_projection_receipt: RuntimeCodexPromptProjection["receipt"];
};

export type PolynetCodexWorkerBridgeSuccess = {
  ok: true;
  workerBridgeConfigured: true;
  request: PolynetCodexWorkerBridgeRequest;
  assistantText: string;
  promptTokens: number | null;
  completionTokens: number | null;
};

export type PolynetCodexWorkerBridgeFailure = {
  ok: false;
  status: number;
  code:
    | "codex_worker_unavailable"
    | "codex_worker_transport_failed"
    | "codex_worker_invalid_response";
  message: string;
  retryable: boolean;
  workerBridgeConfigured: boolean;
  disabledReason: string | null;
  engineId: typeof POLYNET_CODEX_WORKER_ENGINE_ID;
  contractName: typeof POLYNET_CODEX_WORKER_CONTRACT_NAME;
  contractVersion: typeof POLYNET_CODEX_WORKER_CONTRACT_VERSION;
  promptProjectionReceipt: RuntimeCodexPromptProjection["receipt"];
};

export type PolynetCodexWorkerBridgeResult =
  | PolynetCodexWorkerBridgeSuccess
  | PolynetCodexWorkerBridgeFailure;

type WorkerFetchFn = (
  input: string,
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}>;

type AppendRunEventFn = (params: {
  eventType: string;
  eventKey?: string;
  payload: Record<string, unknown>;
}) => Promise<void>;

function readEnvValue(
  env: Record<string, string | undefined>,
  name: string,
): string | null {
  const value = String(env[name] ?? "").trim();
  return value || null;
}

function readRuntimeEnv(): Record<string, string | undefined> {
  try {
    return typeof process !== "undefined" ? process.env : {};
  } catch {
    return {};
  }
}

function envFlagEnabled(value: string | null): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  return (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "on"
  );
}

function normalizeWorkerTimeoutMs(value: string | null): number {
  const parsed = Number(value ?? "");
  if (!Number.isFinite(parsed)) return DEFAULT_WORKER_TIMEOUT_MS;
  return Math.max(
    MIN_WORKER_TIMEOUT_MS,
    Math.min(MAX_WORKER_TIMEOUT_MS, Math.floor(parsed)),
  );
}

function isValidWorkerUrl(value: string | null): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

export function getPolynetCodexWorkerBridgeConfig(
  env: Record<string, string | undefined> = readRuntimeEnv(),
): PolynetCodexWorkerBridgeConfig {
  const enabled = envFlagEnabled(readEnvValue(env, WORKER_RUNTIME_ENABLED_ENV));
  const url = readEnvValue(env, WORKER_URL_ENV);
  const authToken = readEnvValue(env, WORKER_AUTH_TOKEN_ENV);
  const timeoutMs = normalizeWorkerTimeoutMs(readEnvValue(env, WORKER_TIMEOUT_MS_ENV));
  if (!enabled) {
    return {
      workerBridgeConfigured: false,
      enabled,
      url,
      authToken,
      timeoutMs,
      disabledReason: `${WORKER_RUNTIME_ENABLED_ENV} is not enabled.`,
    };
  }
  if (!url) {
    return {
      workerBridgeConfigured: false,
      enabled,
      url: null,
      authToken,
      timeoutMs,
      disabledReason: `${WORKER_URL_ENV} is not configured.`,
    };
  }
  if (!isValidWorkerUrl(url)) {
    return {
      workerBridgeConfigured: false,
      enabled,
      url,
      authToken,
      timeoutMs,
      disabledReason: `${WORKER_URL_ENV} must be an https URL.`,
    };
  }
  return {
    workerBridgeConfigured: true,
    enabled,
    url,
    authToken,
    timeoutMs,
    disabledReason: null,
  };
}

export function isPolynetCodexWorkerBridgeConfigured(
  env: Record<string, string | undefined> = readRuntimeEnv(),
): boolean {
  return getPolynetCodexWorkerBridgeConfig(env).workerBridgeConfigured;
}

function buildPolynetCodexWorkerTransportPayload(
  request: PolynetCodexWorkerBridgeRequest,
  communityResourceLane: CommunityResourceRuntimeLaneState,
): PolynetCodexWorkerTransportPayload {
  return {
    contract_name: POLYNET_CODEX_WORKER_CONTRACT_NAME,
    contract_version: POLYNET_CODEX_WORKER_CONTRACT_VERSION,
    engine_id: POLYNET_CODEX_WORKER_ENGINE_ID,
    run_id: request.runId,
    thread_id: request.threadId,
    request_id: request.requestId,
    runtime_engine: request.runtimeEngine,
    model_id: request.modelId,
    max_tokens: request.maxTokens,
    lane: request.lane,
    inference_source: request.inferenceSource,
    developer_instructions: request.promptProjection.developerInstructions,
    prompt: request.promptProjection.prompt,
    polynet_platform_tool_names: request.allowedToolNames,
    community_resource_lane: communityResourceLane,
    prompt_projection_receipt: request.promptProjection.receipt,
  };
}

function normalizeTokenCount(value: unknown): number | null {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) return null;
  return Math.floor(numberValue);
}

function readWorkerResponseObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseWorkerResponseText(value: string): Record<string, unknown> | null {
  try {
    return readWorkerResponseObject(JSON.parse(value));
  } catch {
    return null;
  }
}

function parsePolynetCodexWorkerTransportResponse(
  params: {
    status: number;
    ok: boolean;
    bodyText: string;
    request: PolynetCodexWorkerBridgeRequest;
  },
): PolynetCodexWorkerBridgeResult {
  const body = parseWorkerResponseText(params.bodyText);
  if (!body) {
    return {
      ok: false,
      status: params.ok ? 502 : params.status || 502,
      code: "codex_worker_invalid_response",
      message: "Codex worker returned a non-JSON response.",
      retryable: true,
      workerBridgeConfigured: true,
      disabledReason: null,
      engineId: POLYNET_CODEX_WORKER_ENGINE_ID,
      contractName: POLYNET_CODEX_WORKER_CONTRACT_NAME,
      contractVersion: POLYNET_CODEX_WORKER_CONTRACT_VERSION,
      promptProjectionReceipt: params.request.promptProjection.receipt,
    };
  }
  if (params.ok && body.ok === true) {
    const assistantText =
      typeof body.assistant_text === "string"
        ? body.assistant_text
        : typeof body.assistantText === "string"
          ? body.assistantText
          : "";
    if (!assistantText.trim()) {
      return {
        ok: false,
        status: 502,
        code: "codex_worker_invalid_response",
        message: "Codex worker success response did not include assistant text.",
        retryable: true,
        workerBridgeConfigured: true,
        disabledReason: null,
        engineId: POLYNET_CODEX_WORKER_ENGINE_ID,
        contractName: POLYNET_CODEX_WORKER_CONTRACT_NAME,
        contractVersion: POLYNET_CODEX_WORKER_CONTRACT_VERSION,
        promptProjectionReceipt: params.request.promptProjection.receipt,
      };
    }
    return {
      ok: true,
      workerBridgeConfigured: true,
      request: params.request,
      assistantText,
      promptTokens: normalizeTokenCount(body.prompt_tokens ?? body.promptTokens),
      completionTokens: normalizeTokenCount(
        body.completion_tokens ?? body.completionTokens,
      ),
    };
  }
  const code = String(body.code ?? body.error ?? "").trim() ||
    "codex_worker_transport_failed";
  const message = String(body.message ?? "").trim() ||
    `Codex worker request failed with HTTP ${params.status || 502}.`;
  return {
    ok: false,
    status:
      params.status >= 400 && params.status < 600
        ? params.status
        : 502,
    code: "codex_worker_transport_failed",
    message: `${code}: ${message}`,
    retryable: body.retryable !== false,
    workerBridgeConfigured: true,
    disabledReason: null,
    engineId: POLYNET_CODEX_WORKER_ENGINE_ID,
    contractName: POLYNET_CODEX_WORKER_CONTRACT_NAME,
    contractVersion: POLYNET_CODEX_WORKER_CONTRACT_VERSION,
    promptProjectionReceipt: params.request.promptProjection.receipt,
  };
}

async function appendWorkerBridgeEventBestEffort(
  appendRunEvent: AppendRunEventFn | null | undefined,
  params: Parameters<AppendRunEventFn>[0],
): Promise<void> {
  if (!appendRunEvent) return;
  try {
    await appendRunEvent(params);
  } catch {
    // Transport evidence is operational metadata; worker execution should still
    // return its structured result if event persistence fails.
  }
}

async function postPolynetCodexWorkerTransport(params: {
  config: PolynetCodexWorkerBridgeConfig;
  request: PolynetCodexWorkerBridgeRequest;
  payload: PolynetCodexWorkerTransportPayload;
  fetchFn?: WorkerFetchFn | null;
  appendRunEvent?: AppendRunEventFn | null;
}): Promise<PolynetCodexWorkerBridgeResult> {
  const fetchFn =
    params.fetchFn ??
    (typeof fetch === "function" ? (fetch as WorkerFetchFn) : null);
  const config = params.config;
  if (!fetchFn) {
    return {
      ok: false,
      status: 503,
      code: "codex_worker_unavailable",
      message: "Codex worker transport is unavailable in this runtime.",
      retryable: true,
      workerBridgeConfigured: false,
      disabledReason: "fetch is not available.",
      engineId: POLYNET_CODEX_WORKER_ENGINE_ID,
      contractName: POLYNET_CODEX_WORKER_CONTRACT_NAME,
      contractVersion: POLYNET_CODEX_WORKER_CONTRACT_VERSION,
      promptProjectionReceipt: params.request.promptProjection.receipt,
    };
  }
  if (!config.url) {
    return {
      ok: false,
      status: 503,
      code: "codex_worker_unavailable",
      message: "Codex worker URL is unavailable.",
      retryable: true,
      workerBridgeConfigured: false,
      disabledReason: config.disabledReason,
      engineId: POLYNET_CODEX_WORKER_ENGINE_ID,
      contractName: POLYNET_CODEX_WORKER_CONTRACT_NAME,
      contractVersion: POLYNET_CODEX_WORKER_CONTRACT_VERSION,
      promptProjectionReceipt: params.request.promptProjection.receipt,
    };
  }
  await appendWorkerBridgeEventBestEffort(params.appendRunEvent, {
    eventType: "codex_worker_transport_started",
    eventKey: `${params.request.runId}:codex_worker_transport_started:1`,
    payload: {
      run_id: params.request.runId,
      runtime_engine: params.request.runtimeEngine,
      engine_id: POLYNET_CODEX_WORKER_ENGINE_ID,
      contract_name: POLYNET_CODEX_WORKER_CONTRACT_NAME,
      contract_version: POLYNET_CODEX_WORKER_CONTRACT_VERSION,
      worker_bridge_configured: true,
      timeout_ms: config.timeoutMs,
      auth_header_configured: Boolean(config.authToken),
      polynet_platform_tool_count: params.request.allowedToolNames.length,
      prompt_projection_receipt: params.request.promptProjection.receipt,
    },
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-polynet-worker-engine-id": POLYNET_CODEX_WORKER_ENGINE_ID,
      "x-polynet-worker-contract": POLYNET_CODEX_WORKER_CONTRACT_NAME,
      "x-polynet-worker-contract-version": POLYNET_CODEX_WORKER_CONTRACT_VERSION,
      "x-polynet-run-id": params.request.runId,
      "x-polynet-request-id": params.request.requestId,
    };
    if (config.authToken) {
      headers.authorization = `Bearer ${config.authToken}`;
    }
    const response = await fetchFn(config.url, {
      method: "POST",
      headers,
      body: JSON.stringify(params.payload),
      signal: controller.signal,
    });
    const bodyText = await response.text();
    const result = parsePolynetCodexWorkerTransportResponse({
      status: response.status,
      ok: response.ok,
      bodyText,
      request: params.request,
    });
    await appendWorkerBridgeEventBestEffort(params.appendRunEvent, {
      eventType: result.ok
        ? "codex_worker_transport_finished"
        : "codex_worker_transport_failed",
      eventKey: `${params.request.runId}:${
        result.ok ? "codex_worker_transport_finished" : "codex_worker_transport_failed"
      }:1`,
      payload: {
        run_id: params.request.runId,
        runtime_engine: params.request.runtimeEngine,
        engine_id: POLYNET_CODEX_WORKER_ENGINE_ID,
        contract_name: POLYNET_CODEX_WORKER_CONTRACT_NAME,
        contract_version: POLYNET_CODEX_WORKER_CONTRACT_VERSION,
        http_status: response.status,
        ok: result.ok,
        error_code: result.ok ? null : result.code,
        retryable: result.ok ? null : result.retryable,
        prompt_tokens: result.ok ? result.promptTokens : null,
        completion_tokens: result.ok ? result.completionTokens : null,
      },
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const result: PolynetCodexWorkerBridgeFailure = {
      ok: false,
      status: 504,
      code: "codex_worker_transport_failed",
      message: message || "Codex worker transport failed.",
      retryable: true,
      workerBridgeConfigured: true,
      disabledReason: null,
      engineId: POLYNET_CODEX_WORKER_ENGINE_ID,
      contractName: POLYNET_CODEX_WORKER_CONTRACT_NAME,
      contractVersion: POLYNET_CODEX_WORKER_CONTRACT_VERSION,
      promptProjectionReceipt: params.request.promptProjection.receipt,
    };
    await appendWorkerBridgeEventBestEffort(params.appendRunEvent, {
      eventType: "codex_worker_transport_failed",
      eventKey: `${params.request.runId}:codex_worker_transport_failed:1`,
      payload: {
        run_id: params.request.runId,
        runtime_engine: params.request.runtimeEngine,
        engine_id: POLYNET_CODEX_WORKER_ENGINE_ID,
        contract_name: POLYNET_CODEX_WORKER_CONTRACT_NAME,
        contract_version: POLYNET_CODEX_WORKER_CONTRACT_VERSION,
        ok: false,
        error_code: result.code,
        retryable: result.retryable,
      },
    });
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

export async function startPolynetCodexWorkerRun(params: {
  ownerId: string;
  threadId: string;
  runId: string;
  requestId: string;
  runtimeEngine: RuntimeEngine;
  modelId: string;
  maxTokens: number;
  lane: string;
  inferenceSource: string;
  allowedToolNames: readonly RetrievalToolName[];
  conversationMessages: readonly RuntimeCodexPromptProjectionMessage[];
  latestUserText: string;
  promptParams: RuntimePlatformHarnessPromptParams & {
    conversationMessages: readonly RuntimeCodexPromptProjectionMessage[];
    latestUserText: string;
  };
  env?: Record<string, string | undefined>;
  fetchFn?: WorkerFetchFn | null;
  appendRunEvent?: AppendRunEventFn | null;
}): Promise<PolynetCodexWorkerBridgeResult> {
  const promptProjection = buildRuntimeCodexPromptProjection(params.promptParams);
  const request: PolynetCodexWorkerBridgeRequest = {
    ownerId: params.ownerId,
    threadId: params.threadId,
    runId: params.runId,
    requestId: params.requestId,
    runtimeEngine: params.runtimeEngine,
    modelId: params.modelId,
    maxTokens: params.maxTokens,
    lane: params.lane,
    inferenceSource: params.inferenceSource,
    allowedToolNames: params.allowedToolNames,
    conversationMessages: params.conversationMessages,
    latestUserText: params.latestUserText,
    promptProjection,
  };
  const config = getPolynetCodexWorkerBridgeConfig(params.env);
  if (!config.workerBridgeConfigured) {
    return {
      ok: false,
      status: 503,
      code: "codex_worker_unavailable",
      message:
        "Codex runtime routing is enabled, but the Codex worker bridge is not configured yet.",
      retryable: true,
      workerBridgeConfigured: false,
      disabledReason: config.disabledReason,
      engineId: POLYNET_CODEX_WORKER_ENGINE_ID,
      contractName: POLYNET_CODEX_WORKER_CONTRACT_NAME,
      contractVersion: POLYNET_CODEX_WORKER_CONTRACT_VERSION,
      promptProjectionReceipt: request.promptProjection.receipt,
    };
  }
  const payload = buildPolynetCodexWorkerTransportPayload(
    request,
    normalizeCommunityResourceRuntimeLaneState(
      params.promptParams.communityResourceLane,
    ),
  );
  return await postPolynetCodexWorkerTransport({
    config,
    request,
    payload,
    fetchFn: params.fetchFn,
    appendRunEvent: params.appendRunEvent,
  });
}

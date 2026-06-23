import {
  buildRuntimeCodexPromptProjection,
  type RuntimeCodexPromptProjection,
  type RuntimeCodexPromptProjectionMessage,
} from "../shared/runtimeCodexPromptProjection";
import type { RetrievalToolName } from "../shared/retrievalTools";
import type { RuntimeEngine } from "../shared/runtimeEngine";
import type { RuntimePlatformHarnessPromptParams } from "../shared/runtimePrompt";

export const POLYNET_CODEX_WORKER_ENGINE_ID = "polynet_codex_worker";
export const POLYNET_CODEX_WORKER_CONTRACT_NAME =
  "polynet_codex_worker_bridge_v1";
export const POLYNET_CODEX_WORKER_CONTRACT_VERSION = "v1";

const WORKER_RUNTIME_ENABLED_ENV = "POLYNET_CODEX_WORKER_RUNTIME_ENABLED";
const WORKER_URL_ENV = "POLYNET_CODEX_WORKER_URL";

export type PolynetCodexWorkerBridgeConfig = {
  workerBridgeConfigured: boolean;
  enabled: boolean;
  url: string | null;
  disabledReason: string | null;
};

export type PolynetCodexWorkerBridgeRequest = {
  ownerId: string;
  threadId: string;
  runId: string;
  requestId: string;
  runtimeEngine: RuntimeEngine;
  modelId: string;
  lane: string;
  inferenceSource: string;
  allowedToolNames: readonly RetrievalToolName[];
  conversationMessages: readonly RuntimeCodexPromptProjectionMessage[];
  latestUserText: string;
  promptProjection: RuntimeCodexPromptProjection;
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
  code: "codex_worker_unavailable" | "codex_worker_transport_not_implemented";
  message: string;
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

export function getPolynetCodexWorkerBridgeConfig(
  env: Record<string, string | undefined> = readRuntimeEnv(),
): PolynetCodexWorkerBridgeConfig {
  const enabled = envFlagEnabled(readEnvValue(env, WORKER_RUNTIME_ENABLED_ENV));
  const url = readEnvValue(env, WORKER_URL_ENV);
  if (!enabled) {
    return {
      workerBridgeConfigured: false,
      enabled,
      url,
      disabledReason: `${WORKER_RUNTIME_ENABLED_ENV} is not enabled.`,
    };
  }
  if (!url) {
    return {
      workerBridgeConfigured: false,
      enabled,
      url: null,
      disabledReason: `${WORKER_URL_ENV} is not configured.`,
    };
  }
  return {
    workerBridgeConfigured: true,
    enabled,
    url,
    disabledReason: null,
  };
}

export async function startPolynetCodexWorkerRun(params: {
  ownerId: string;
  threadId: string;
  runId: string;
  requestId: string;
  runtimeEngine: RuntimeEngine;
  modelId: string;
  lane: string;
  inferenceSource: string;
  allowedToolNames: readonly RetrievalToolName[];
  conversationMessages: readonly RuntimeCodexPromptProjectionMessage[];
  latestUserText: string;
  promptParams: RuntimePlatformHarnessPromptParams & {
    conversationMessages: readonly RuntimeCodexPromptProjectionMessage[];
    latestUserText: string;
  };
}): Promise<PolynetCodexWorkerBridgeResult> {
  const promptProjection = buildRuntimeCodexPromptProjection(params.promptParams);
  const request: PolynetCodexWorkerBridgeRequest = {
    ownerId: params.ownerId,
    threadId: params.threadId,
    runId: params.runId,
    requestId: params.requestId,
    runtimeEngine: params.runtimeEngine,
    modelId: params.modelId,
    lane: params.lane,
    inferenceSource: params.inferenceSource,
    allowedToolNames: params.allowedToolNames,
    conversationMessages: params.conversationMessages,
    latestUserText: params.latestUserText,
    promptProjection,
  };
  const config = getPolynetCodexWorkerBridgeConfig();
  if (!config.workerBridgeConfigured) {
    return {
      ok: false,
      status: 503,
      code: "codex_worker_unavailable",
      message:
        "Codex runtime routing is enabled, but the Codex worker bridge is not configured yet.",
      workerBridgeConfigured: false,
      disabledReason: config.disabledReason,
      engineId: POLYNET_CODEX_WORKER_ENGINE_ID,
      contractName: POLYNET_CODEX_WORKER_CONTRACT_NAME,
      contractVersion: POLYNET_CODEX_WORKER_CONTRACT_VERSION,
      promptProjectionReceipt: request.promptProjection.receipt,
    };
  }
  return {
    ok: false,
    status: 501,
    code: "codex_worker_transport_not_implemented",
    message:
      "Codex worker bridge configuration exists, but transport is not implemented in this release slice.",
    workerBridgeConfigured: true,
    disabledReason: null,
    engineId: POLYNET_CODEX_WORKER_ENGINE_ID,
    contractName: POLYNET_CODEX_WORKER_CONTRACT_NAME,
    contractVersion: POLYNET_CODEX_WORKER_CONTRACT_VERSION,
    promptProjectionReceipt: request.promptProjection.receipt,
  };
}

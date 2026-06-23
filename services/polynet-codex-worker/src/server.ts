import http, { type IncomingMessage, type ServerResponse } from "node:http";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  POLYNET_CODEX_WORKER_CONTRACT_NAME,
  POLYNET_CODEX_WORKER_CONTRACT_VERSION,
  POLYNET_CODEX_WORKER_ENGINE_ID,
  type PolynetCodexWorkerTransportPayload,
} from "../../../convex/polynetCodexWorkerBridge.ts";
import {
  runCodexAppServerRequest,
  type CodexAppServerClientConfig,
} from "./codexAppServerClient.ts";

type JsonRecord = Record<string, unknown>;

export type PolynetCodexWorkerExecutionMode =
  | "disabled"
  | "static"
  | "app_server";

export type PolynetCodexWorkerServiceConfig = {
  authToken: string | null;
  executionMode: PolynetCodexWorkerExecutionMode;
  staticAssistantText: string | null;
  appServer: CodexAppServerClientConfig | null;
  maxBodyBytes: number;
};

export type PolynetCodexWorkerServiceResponse = {
  status: number;
  body: JsonRecord;
};

const DEFAULT_MAX_BODY_BYTES = 1_000_000;
const DEFAULT_APP_SERVER_TIMEOUT_MS = 120_000;
const MIN_APP_SERVER_TIMEOUT_MS = 1_000;
const MAX_APP_SERVER_TIMEOUT_MS = 300_000;

function jsonResponse(
  response: ServerResponse,
  status: number,
  body: JsonRecord,
): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function readEnvValue(name: string): string | null {
  const value = String(process.env[name] ?? "").trim();
  return value || null;
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const parsed = Number(readEnvValue(name) ?? "");
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function normalizeBoundedMs(value: string | null, fallback: number): number {
  const parsed = Number(value ?? "");
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(
    MIN_APP_SERVER_TIMEOUT_MS,
    Math.min(MAX_APP_SERVER_TIMEOUT_MS, Math.floor(parsed)),
  );
}

function normalizeExecutionMode(raw: string | null): PolynetCodexWorkerExecutionMode {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "static") return "static";
  if (value === "app_server") return "app_server";
  return "disabled";
}

function isValidHttpUrl(value: string | null): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function readPolynetCodexWorkerServiceConfig(): PolynetCodexWorkerServiceConfig {
  const appServerUrl = readEnvValue("POLYNET_CODEX_APP_SERVER_URL");
  return {
    authToken: readEnvValue("POLYNET_CODEX_WORKER_AUTH_TOKEN"),
    executionMode: normalizeExecutionMode(
      readEnvValue("POLYNET_CODEX_WORKER_EXECUTION_MODE"),
    ),
    staticAssistantText: readEnvValue("POLYNET_CODEX_WORKER_STATIC_ASSISTANT_TEXT"),
    appServer: isValidHttpUrl(appServerUrl)
      ? {
          url: appServerUrl as string,
          authToken: readEnvValue("POLYNET_CODEX_APP_SERVER_AUTH_TOKEN"),
          timeoutMs: normalizeBoundedMs(
            readEnvValue("POLYNET_CODEX_APP_SERVER_TIMEOUT_MS"),
            DEFAULT_APP_SERVER_TIMEOUT_MS,
          ),
        }
      : null,
    maxBodyBytes: readPositiveIntegerEnv(
      "POLYNET_CODEX_WORKER_MAX_BODY_BYTES",
      DEFAULT_MAX_BODY_BYTES,
    ),
  };
}

function isAuthorized(
  request: IncomingMessage,
  config: PolynetCodexWorkerServiceConfig,
): boolean {
  if (!config.authToken) return true;
  const authorization = String(request.headers.authorization ?? "").trim();
  return authorization === `Bearer ${config.authToken}`;
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function readRequestBody(
  request: IncomingMessage,
  maxBytes: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let totalBytes = 0;
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      totalBytes += Buffer.byteLength(chunk, "utf8");
      if (totalBytes > maxBytes) {
        reject(new Error("request_body_too_large"));
        request.destroy();
        return;
      }
      body += chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function parseJsonBody(rawBody: string): JsonRecord | null {
  try {
    return asRecord(JSON.parse(rawBody));
  } catch {
    return null;
  }
}

export function validatePolynetCodexWorkerPayload(
  body: JsonRecord,
): { ok: true; payload: PolynetCodexWorkerTransportPayload } | {
  ok: false;
  status: number;
  code: string;
  message: string;
} {
  if (body.contract_name !== POLYNET_CODEX_WORKER_CONTRACT_NAME) {
    return {
      ok: false,
      status: 400,
      code: "unsupported_contract_name",
      message: "Unsupported Codex worker contract name.",
    };
  }
  if (body.contract_version !== POLYNET_CODEX_WORKER_CONTRACT_VERSION) {
    return {
      ok: false,
      status: 400,
      code: "unsupported_contract_version",
      message: "Unsupported Codex worker contract version.",
    };
  }
  if (body.engine_id !== POLYNET_CODEX_WORKER_ENGINE_ID) {
    return {
      ok: false,
      status: 400,
      code: "unsupported_engine_id",
      message: "Unsupported Codex worker engine id.",
    };
  }
  const requiredStrings = [
    "run_id",
    "thread_id",
    "request_id",
    "runtime_engine",
    "model_id",
    "lane",
    "inference_source",
    "developer_instructions",
    "prompt",
  ];
  for (const field of requiredStrings) {
    if (!isNonEmptyString(body[field])) {
      return {
        ok: false,
        status: 400,
        code: "invalid_worker_payload",
        message: `Missing required string field: ${field}.`,
      };
    }
  }
  if (body.runtime_engine !== "codex") {
    return {
      ok: false,
      status: 400,
      code: "unsupported_runtime_engine",
      message: "Codex worker only accepts codex runtime turns.",
    };
  }
  const maxTokens = Number(body.max_tokens);
  if (!Number.isFinite(maxTokens) || maxTokens <= 0) {
    return {
      ok: false,
      status: 400,
      code: "invalid_worker_payload",
      message: "max_tokens must be a positive number.",
    };
  }
  if (!isStringArray(body.polynet_platform_tool_names)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_worker_payload",
      message: "polynet_platform_tool_names must be an array of strings.",
    };
  }
  if (!asRecord(body.community_resource_lane)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_worker_payload",
      message: "community_resource_lane must be an object.",
    };
  }
  if (!asRecord(body.prompt_projection_receipt)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_worker_payload",
      message: "prompt_projection_receipt must be an object.",
    };
  }
  return {
    ok: true,
    payload: {
      contract_name: POLYNET_CODEX_WORKER_CONTRACT_NAME,
      contract_version: POLYNET_CODEX_WORKER_CONTRACT_VERSION,
      engine_id: POLYNET_CODEX_WORKER_ENGINE_ID,
      run_id: String(body.run_id),
      thread_id: String(body.thread_id),
      request_id: String(body.request_id),
      runtime_engine: "codex",
      model_id: String(body.model_id),
      max_tokens: Math.floor(maxTokens),
      lane: String(body.lane),
      inference_source: String(body.inference_source),
      developer_instructions: String(body.developer_instructions),
      prompt: String(body.prompt),
      polynet_platform_tool_names: body.polynet_platform_tool_names,
      community_resource_lane: body.community_resource_lane as any,
      prompt_projection_receipt: body.prompt_projection_receipt as any,
    },
  };
}

export async function runPolynetCodexWorkerRequest(
  payload: PolynetCodexWorkerTransportPayload,
  config: PolynetCodexWorkerServiceConfig,
): Promise<PolynetCodexWorkerServiceResponse> {
  if (config.executionMode === "static" && config.staticAssistantText) {
    return {
      status: 200,
      body: {
        ok: true,
        assistant_text: config.staticAssistantText,
        prompt_tokens: null,
        completion_tokens: null,
        engine_id: POLYNET_CODEX_WORKER_ENGINE_ID,
        contract_name: POLYNET_CODEX_WORKER_CONTRACT_NAME,
        contract_version: POLYNET_CODEX_WORKER_CONTRACT_VERSION,
        run_id: payload.run_id,
        request_id: payload.request_id,
      },
    };
  }
  if (config.executionMode === "app_server") {
    if (!config.appServer) {
      return {
        status: 503,
        body: {
          ok: false,
          code: "codex_app_server_not_configured",
          message:
            "Codex worker app-server mode is enabled, but POLYNET_CODEX_APP_SERVER_URL is missing or invalid.",
          retryable: false,
          engine_id: POLYNET_CODEX_WORKER_ENGINE_ID,
          contract_name: POLYNET_CODEX_WORKER_CONTRACT_NAME,
          contract_version: POLYNET_CODEX_WORKER_CONTRACT_VERSION,
          run_id: payload.run_id,
          request_id: payload.request_id,
        },
      };
    }
    const result = await runCodexAppServerRequest({
      payload,
      config: config.appServer,
    });
    if (result.ok) {
      return {
        status: 200,
        body: {
          ok: true,
          assistant_text: result.assistantText,
          prompt_tokens: result.promptTokens,
          completion_tokens: result.completionTokens,
          engine_id: POLYNET_CODEX_WORKER_ENGINE_ID,
          contract_name: POLYNET_CODEX_WORKER_CONTRACT_NAME,
          contract_version: POLYNET_CODEX_WORKER_CONTRACT_VERSION,
          run_id: payload.run_id,
          request_id: payload.request_id,
        },
      };
    }
    return {
      status: result.status,
      body: {
        ok: false,
        code: result.code,
        message: result.message,
        retryable: result.retryable,
        engine_id: POLYNET_CODEX_WORKER_ENGINE_ID,
        contract_name: POLYNET_CODEX_WORKER_CONTRACT_NAME,
        contract_version: POLYNET_CODEX_WORKER_CONTRACT_VERSION,
        run_id: payload.run_id,
        request_id: payload.request_id,
      },
    };
  }
  return {
    status: 503,
    body: {
      ok: false,
      code: "codex_execution_not_configured",
      message:
        "Codex worker endpoint is reachable, but the execution adapter is not configured.",
      retryable: false,
      engine_id: POLYNET_CODEX_WORKER_ENGINE_ID,
      contract_name: POLYNET_CODEX_WORKER_CONTRACT_NAME,
      contract_version: POLYNET_CODEX_WORKER_CONTRACT_VERSION,
      run_id: payload.run_id,
      request_id: payload.request_id,
    },
  };
}

async function handleRuntimeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  config: PolynetCodexWorkerServiceConfig,
): Promise<void> {
  if (!isAuthorized(request, config)) {
    jsonResponse(response, 401, {
      ok: false,
      code: "unauthorized",
      message: "Unauthorized.",
      retryable: false,
    });
    return;
  }
  let rawBody = "";
  try {
    rawBody = await readRequestBody(request, config.maxBodyBytes);
  } catch (error) {
    jsonResponse(response, 413, {
      ok: false,
      code: "request_body_too_large",
      message:
        error instanceof Error && error.message === "request_body_too_large"
          ? "Request body is too large."
          : "Could not read request body.",
      retryable: false,
    });
    return;
  }
  const parsed = parseJsonBody(rawBody);
  if (!parsed) {
    jsonResponse(response, 400, {
      ok: false,
      code: "invalid_json",
      message: "Request body must be a JSON object.",
      retryable: false,
    });
    return;
  }
  const validation = validatePolynetCodexWorkerPayload(parsed);
  if (!validation.ok) {
    jsonResponse(response, validation.status, {
      ok: false,
      code: validation.code,
      message: validation.message,
      retryable: false,
      engine_id: POLYNET_CODEX_WORKER_ENGINE_ID,
      contract_name: POLYNET_CODEX_WORKER_CONTRACT_NAME,
      contract_version: POLYNET_CODEX_WORKER_CONTRACT_VERSION,
    });
    return;
  }
  const result = await runPolynetCodexWorkerRequest(validation.payload, config);
  jsonResponse(response, result.status, result.body);
}

export function createPolynetCodexWorkerServer(
  config: PolynetCodexWorkerServiceConfig = readPolynetCodexWorkerServiceConfig(),
): http.Server {
  return http.createServer((request, response) => {
    void (async () => {
      const method = String(request.method ?? "").toUpperCase();
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (method === "GET" && url.pathname === "/healthz") {
        jsonResponse(response, 200, {
          ok: true,
          service: "polynet_codex_worker",
          engine_id: POLYNET_CODEX_WORKER_ENGINE_ID,
          contract_name: POLYNET_CODEX_WORKER_CONTRACT_NAME,
          contract_version: POLYNET_CODEX_WORKER_CONTRACT_VERSION,
          auth_required: Boolean(config.authToken),
          execution_mode: config.executionMode,
          execution_configured:
            config.executionMode === "static"
              ? Boolean(config.staticAssistantText)
              : config.executionMode === "app_server"
                ? Boolean(config.appServer)
                : false,
        });
        return;
      }
      if (method === "POST" && url.pathname === "/runtime") {
        await handleRuntimeRequest(request, response, config);
        return;
      }
      jsonResponse(response, 404, {
        ok: false,
        code: "not_found",
        message: "Not found.",
        retryable: false,
      });
    })().catch((error) => {
      jsonResponse(response, 500, {
        ok: false,
        code: "worker_internal_error",
        message: error instanceof Error ? error.message : "Worker internal error.",
        retryable: true,
      });
    });
  });
}

export async function startPolynetCodexWorkerServerFromEnv(): Promise<http.Server> {
  const port = readPositiveIntegerEnv("PORT", 8787);
  const host = readEnvValue("HOST") ?? "127.0.0.1";
  const server = createPolynetCodexWorkerServer();
  await new Promise<void>((resolve) => {
    server.listen(port, host, resolve);
  });
  console.log(
    JSON.stringify({
      kind: "polynet_codex_worker_service_event",
      event: "worker_http_ready",
      host,
      port,
      engine_id: POLYNET_CODEX_WORKER_ENGINE_ID,
      contract_name: POLYNET_CODEX_WORKER_CONTRACT_NAME,
      contract_version: POLYNET_CODEX_WORKER_CONTRACT_VERSION,
    }),
  );
  return server;
}

const mainUrl = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : null;

if (mainUrl && import.meta.url === mainUrl) {
  void startPolynetCodexWorkerServerFromEnv();
}

import type { PolynetCodexWorkerTransportPayload } from "../../../convex/polynetCodexWorkerBridge.ts";

type JsonRecord = Record<string, unknown>;

export type CodexAppServerClientConfig = {
  url: string;
  authToken: string | null;
  timeoutMs: number;
};

export type CodexAppServerRunSuccess = {
  ok: true;
  assistantText: string;
  promptTokens: number | null;
  completionTokens: number | null;
};

export type CodexAppServerRunFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
  retryable: boolean;
};

export type CodexAppServerRunResult =
  | CodexAppServerRunSuccess
  | CodexAppServerRunFailure;

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

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function normalizeTokenCount(value: unknown): number | null {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) return null;
  return Math.floor(numberValue);
}

function parseJsonObject(text: string): JsonRecord | null {
  try {
    return asRecord(JSON.parse(text));
  } catch {
    return null;
  }
}

function buildCodexAppServerRequest(
  payload: PolynetCodexWorkerTransportPayload,
): JsonRecord {
  return {
    run_id: payload.run_id,
    thread_id: payload.thread_id,
    request_id: payload.request_id,
    model_id: payload.model_id,
    max_tokens: payload.max_tokens,
    developer_instructions: payload.developer_instructions,
    prompt: payload.prompt,
    metadata: {
      runtime_engine: payload.runtime_engine,
      lane: payload.lane,
      inference_source: payload.inference_source,
      polynet_platform_tool_names: payload.polynet_platform_tool_names,
      community_resource_lane: payload.community_resource_lane,
      prompt_projection_receipt: payload.prompt_projection_receipt,
    },
  };
}

function parseCodexAppServerResponse(params: {
  ok: boolean;
  status: number;
  text: string;
}): CodexAppServerRunResult {
  const body = parseJsonObject(params.text);
  if (!body) {
    return {
      ok: false,
      status: params.ok ? 502 : params.status || 502,
      code: "codex_app_server_invalid_response",
      message: "Codex app-server returned a non-JSON response.",
      retryable: true,
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
        code: "codex_app_server_invalid_response",
        message: "Codex app-server success response did not include assistant text.",
        retryable: true,
      };
    }
    return {
      ok: true,
      assistantText,
      promptTokens: normalizeTokenCount(body.prompt_tokens ?? body.promptTokens),
      completionTokens: normalizeTokenCount(
        body.completion_tokens ?? body.completionTokens,
      ),
    };
  }
  const status = params.status >= 400 && params.status < 600
    ? params.status
    : 502;
  const code = String(body.code ?? body.error ?? "").trim() ||
    "codex_app_server_failed";
  return {
    ok: false,
    status,
    code,
    message: `Codex app-server request failed with code ${code}.`,
    retryable: body.retryable !== false,
  };
}

export async function runCodexAppServerRequest(params: {
  payload: PolynetCodexWorkerTransportPayload;
  config: CodexAppServerClientConfig;
  fetchFn?: WorkerFetchFn | null;
}): Promise<CodexAppServerRunResult> {
  const fetchFn =
    params.fetchFn ??
    (typeof fetch === "function" ? (fetch as WorkerFetchFn) : null);
  if (!fetchFn) {
    return {
      ok: false,
      status: 503,
      code: "codex_app_server_fetch_unavailable",
      message: "Codex app-server fetch transport is unavailable.",
      retryable: true,
    };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.config.timeoutMs);
  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-polynet-codex-worker-run-id": params.payload.run_id,
      "x-polynet-codex-worker-request-id": params.payload.request_id,
    };
    if (params.config.authToken) {
      headers.authorization = `Bearer ${params.config.authToken}`;
    }
    const response = await fetchFn(params.config.url, {
      method: "POST",
      headers,
      body: JSON.stringify(buildCodexAppServerRequest(params.payload)),
      signal: controller.signal,
    });
    const text = await response.text();
    return parseCodexAppServerResponse({
      ok: response.ok,
      status: response.status,
      text,
    });
  } catch (error) {
    return {
      ok: false,
      status: 504,
      code: "codex_app_server_transport_failed",
      message: error instanceof Error ? error.message : "Codex app-server transport failed.",
      retryable: true,
    };
  } finally {
    clearTimeout(timeout);
  }
}

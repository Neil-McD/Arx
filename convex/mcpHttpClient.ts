import {
  type DeveloperAppRow,
  normalizeString,
} from "./appCore.ts";
import {
  resolveDiscoverAppMcpRequestHeadersForCatalogAppId,
} from "../shared/discoverCatalog.ts";

export type JsonRpcSuccess = {
  result?: any;
};

export type JsonRpcError = {
  error?: {
    message?: unknown;
  };
};

const MCP_HTTP_TIMEOUT_MS = 10_000;
const MCP_HTTP_MAX_RESPONSE_BYTES = 1_000_000;

function parseSseJsonPayload(
  rawText: string,
): JsonRpcSuccess | JsonRpcError | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;
  const eventChunks = trimmed.split(/\r?\n\r?\n+/);
  for (const chunk of eventChunks) {
    const dataLines = chunk
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart());
    if (dataLines.length === 0) continue;
    const dataText = dataLines.join("\n").trim();
    if (!dataText) continue;
    try {
      return JSON.parse(dataText) as JsonRpcSuccess | JsonRpcError;
    } catch {
      continue;
    }
  }
  return null;
}

function parseMcpPayload(rawText: string): JsonRpcSuccess | JsonRpcError | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as JsonRpcSuccess | JsonRpcError;
  } catch {
    return parseSseJsonPayload(trimmed);
  }
}

async function readMcpResponseText(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get("content-length") ?? "");
  if (
    Number.isFinite(contentLength) &&
    contentLength > MCP_HTTP_MAX_RESPONSE_BYTES
  ) {
    throw new Error("mcp_response_too_large");
  }
  const body = response.body;
  if (!body) return "";
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > MCP_HTTP_MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("mcp_response_too_large");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

export function buildJsonRpcBody(
  id: string,
  method: string,
  params: Record<string, unknown>,
): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id,
    method,
    params,
  });
}

export function buildJsonRpcNotification(
  method: string,
  params: Record<string, unknown>,
): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    method,
    params,
  });
}

export async function postMcpJson(params: {
  url: string;
  headers: Record<string, string>;
  body: string;
  protocolVersion?: string;
  sessionId?: string | null;
  signal?: AbortSignal;
}): Promise<{
  status: number;
  sessionId: string | null;
  payload: JsonRpcSuccess | JsonRpcError | null;
  rawText: string;
}> {
  const controller = new AbortController();
  const abortFromExternalSignal = () => {
    controller.abort(params.signal?.reason);
  };
  if (params.signal) {
    if (params.signal.aborted) {
      abortFromExternalSignal();
    } else {
      params.signal.addEventListener("abort", abortFromExternalSignal, {
        once: true,
      });
    }
  }
  const timeout = setTimeout(() => controller.abort(), MCP_HTTP_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(params.url, {
      method: "POST",
      redirect: "manual",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        ...(params.protocolVersion
          ? { "MCP-Protocol-Version": params.protocolVersion }
          : {}),
        ...(params.sessionId ? { "Mcp-Session-Id": params.sessionId } : {}),
        ...params.headers,
      },
      body: params.body,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      if (params.signal?.aborted) {
        throw params.signal.reason instanceof Error
          ? params.signal.reason
          : new Error("mcp_request_aborted");
      }
      throw new Error("mcp_request_timed_out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    params.signal?.removeEventListener("abort", abortFromExternalSignal);
  }
  if (response.status >= 300 && response.status < 400) {
    return {
      status: response.status,
      sessionId: null,
      payload: null,
      rawText: "MCP endpoint redirects are not allowed.",
    };
  }
  const rawText = await readMcpResponseText(response);
  const payload = parseMcpPayload(rawText);
  return {
    status: response.status,
    sessionId:
      normalizeString(response.headers.get("Mcp-Session-Id")) ||
      normalizeString(response.headers.get("mcp-session-id")) ||
      null,
    payload,
    rawText,
  };
}

export function errorMessageFromRpc(response: {
  status: number;
  payload: JsonRpcSuccess | JsonRpcError | null;
  rawText: string;
}): string {
  const rpcMessage = normalizeString(
    (response.payload as JsonRpcError | null)?.error?.message,
    1_500,
  );
  if (rpcMessage) return rpcMessage;
  const rawText = normalizeString(response.rawText, 1_500);
  if (rawText) return rawText;
  return `MCP request failed (${response.status}).`;
}

export function buildDeveloperAppAuthHeaders(params: {
  app: Pick<DeveloperAppRow, "authType" | "catalogAppId">;
  secret: string | null;
}): Record<string, string> {
  const merged: Record<string, string> = {
    ...resolveDiscoverAppMcpRequestHeadersForCatalogAppId(params.app.catalogAppId),
  };
  if (params.app.authType === "bearer" || params.app.authType === "oauth") {
    if (!params.secret) throw new Error("developer_app_connection_secret_required");
    merged.Authorization = `Bearer ${params.secret}`;
  } else if (params.app.authType === "api_key") {
    if (!params.secret) throw new Error("developer_app_connection_secret_required");
    merged["x-api-key"] = params.secret;
  }
  return merged;
}

export async function initializeStreamableHttpMcpSession(params: {
  url: string;
  headers: Record<string, string>;
  clientName: string;
  clientVersion: string;
  signal?: AbortSignal;
}): Promise<{
  protocolVersion: string;
  sessionId: string | null;
}> {
  const initializeResponse = await postMcpJson({
    url: params.url,
    headers: params.headers,
    body: buildJsonRpcBody("initialize", "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: {
        name: params.clientName,
        version: params.clientVersion,
      },
    }),
    signal: params.signal,
  });
  if (initializeResponse.status < 200 || initializeResponse.status >= 300) {
    throw new Error(errorMessageFromRpc(initializeResponse));
  }
  const initializeError = normalizeString(
    (initializeResponse.payload as JsonRpcError | null)?.error?.message,
    1_500,
  );
  if (initializeError) throw new Error(initializeError);
  return {
    protocolVersion:
      normalizeString(
        (initializeResponse.payload as JsonRpcSuccess | null)?.result
          ?.protocolVersion,
      ) || "2025-06-18",
    sessionId: initializeResponse.sessionId,
  };
}

export async function sendInitializedNotification(params: {
  url: string;
  headers: Record<string, string>;
  protocolVersion: string;
  sessionId?: string | null;
  signal?: AbortSignal;
}): Promise<void> {
  try {
    await postMcpJson({
      url: params.url,
      headers: params.headers,
      protocolVersion: params.protocolVersion,
      sessionId: params.sessionId ?? null,
      body: buildJsonRpcNotification("notifications/initialized", {}),
      signal: params.signal,
    });
  } catch {
    // Best-effort only.
  }
}

export async function listMcpTools(params: {
  url: string;
  headers: Record<string, string>;
  protocolVersion: string;
  sessionId?: string | null;
  signal?: AbortSignal;
}): Promise<unknown> {
  const response = await postMcpJson({
    url: params.url,
    headers: params.headers,
    protocolVersion: params.protocolVersion,
    sessionId: params.sessionId ?? null,
    body: buildJsonRpcBody("tools-list", "tools/list", {}),
    signal: params.signal,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(errorMessageFromRpc(response));
  }
  const toolsError = normalizeString(
    (response.payload as JsonRpcError | null)?.error?.message,
    1_500,
  );
  if (toolsError) throw new Error(toolsError);
  return (response.payload as JsonRpcSuccess | null)?.result?.tools ?? [];
}

export async function callMcpTool(params: {
  url: string;
  headers: Record<string, string>;
  protocolVersion: string;
  sessionId?: string | null;
  toolName: string;
  argumentsObject: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<unknown> {
  const response = await postMcpJson({
    url: params.url,
    headers: params.headers,
    protocolVersion: params.protocolVersion,
    sessionId: params.sessionId ?? null,
    body: buildJsonRpcBody("tool-call", "tools/call", {
      name: params.toolName,
      arguments: params.argumentsObject,
    }),
    signal: params.signal,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(errorMessageFromRpc(response));
  }
  const callError = normalizeString(
    (response.payload as JsonRpcError | null)?.error?.message,
    1_500,
  );
  if (callError) throw new Error(callError);
  return (response.payload as JsonRpcSuccess | null)?.result ?? null;
}

export function formatMcpToolResultOutput(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return String(value ?? "");
  }
  const record = value as Record<string, unknown>;
  const contentParts = Array.isArray(record.content) ? record.content : [];
  const textParts: string[] = [];
  for (const part of contentParts) {
    if (!part || typeof part !== "object" || Array.isArray(part)) continue;
    const typed = part as Record<string, unknown>;
    if (typed.type === "text") {
      const text = normalizeString(typed.text, 20_000);
      if (text) textParts.push(text);
      continue;
    }
    const serialized = normalizeString(JSON.stringify(typed), 20_000);
    if (serialized) textParts.push(serialized);
  }
  if (textParts.length > 0) return textParts.join("\n\n");
  const structured = record.structuredContent;
  if (structured !== undefined) {
    try {
      return JSON.stringify(structured, null, 2);
    } catch {
      return String(structured);
    }
  }
  try {
    return JSON.stringify(record, null, 2);
  } catch {
    return String(value);
  }
}

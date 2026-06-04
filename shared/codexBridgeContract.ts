export const CODEX_BRIDGE_CONTRACT_VERSION = 1 as const;
export const CODEX_BRIDGE_TOKEN_ISSUER = "polynet-codex-bridge-v1" as const;
export const CODEX_BRIDGE_TOKEN_ENV_NAME = "POLYNET_CODEX_BRIDGE_TOKEN" as const;
export const CODEX_BRIDGE_RUN_ID_ENV_NAME = "POLYNET_CODEX_BRIDGE_RUN_ID" as const;
export const CODEX_BRIDGE_EVENT_URL_ENV_NAME = "POLYNET_CODEX_BRIDGE_EVENT_URL" as const;
export const CODEX_BRIDGE_FINISH_URL_ENV_NAME = "POLYNET_CODEX_BRIDGE_FINISH_URL" as const;
export const CODEX_BRIDGE_CONTEXT_URL_ENV_NAME = "POLYNET_CODEX_BRIDGE_CONTEXT_URL" as const;
export const CODEX_BRIDGE_OPERATOR_SECRET_ENV_NAME = "POLYNET_CODEX_BRIDGE_OPERATOR_SECRET" as const;
export const CODEX_BRIDGE_CALLBACK_MAX_BYTES = 64_000;
export const CODEX_BRIDGE_CONTEXT_PROMPT_MAX_CHARS = 24_000;

export type CodexBridgeAllowedOperation = "event" | "finish" | "context";

export type CodexBridgeRunTokenClaimsV1 = {
  version: typeof CODEX_BRIDGE_CONTRACT_VERSION;
  issuer: typeof CODEX_BRIDGE_TOKEN_ISSUER;
  runId: string;
  ownerId: string;
  threadId: string;
  projectId?: string | null;
  communityId?: string | null;
  operations: CodexBridgeAllowedOperation[];
  issuedAt: number;
  expiresAt: number;
  nonce: string;
};

export type CodexBridgeRunEventSource =
  | "bridge_echo"
  | "codex_exec_jsonl"
  | "bridge_worker"
  | "polynet_tool";

export type CodexBridgeRunEventRequestV1 = {
  version: typeof CODEX_BRIDGE_CONTRACT_VERSION;
  runId: string;
  eventType: string;
  eventKey?: string | null;
  source?: CodexBridgeRunEventSource | null;
  payload?: unknown;
  createdAt?: number | null;
};

export type CodexBridgeRunFinishStatus =
  | "succeeded"
  | "failed"
  | "cancelled"
  | "timed_out";

export type CodexBridgeRunFinishRequestV1 = {
  version: typeof CODEX_BRIDGE_CONTRACT_VERSION;
  runId: string;
  status: CodexBridgeRunFinishStatus;
  reason?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  finishedAt?: number | null;
};

export type CodexBridgeContextRequestV1 = {
  version: typeof CODEX_BRIDGE_CONTRACT_VERSION;
  runId: string;
  includePrompt?: boolean | null;
  latestUserText?: string | null;
};

export type CodexBridgeContextResponseV1 = {
  version: typeof CODEX_BRIDGE_CONTRACT_VERSION;
  runId: string;
  capturedAt: number;
  contextPrompt: string | null;
  contextSnapshot: unknown;
  limits: {
    contextPromptMaxChars: typeof CODEX_BRIDGE_CONTEXT_PROMPT_MAX_CHARS;
  };
};

export type CodexBridgeContextHttpResponseV1 = {
  ok: true;
  context: CodexBridgeContextResponseV1;
};

export function isCodexBridgeAllowedOperation(
  value: unknown,
): value is CodexBridgeAllowedOperation {
  return value === "event" || value === "finish" || value === "context";
}

export function normalizeCodexBridgeEventType(raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (!value) throw new Error("codex_bridge_event_type_required");
  return value.slice(0, 160);
}

export function normalizeCodexBridgeEventKey(raw: unknown): string | undefined {
  const value = String(raw ?? "").trim();
  return value ? value.slice(0, 240) : undefined;
}

export function normalizeCodexBridgeFinishStatus(
  raw: unknown,
): CodexBridgeRunFinishStatus {
  const value = String(raw ?? "").trim().toLowerCase();
  if (
    value === "succeeded" ||
    value === "failed" ||
    value === "cancelled" ||
    value === "timed_out"
  ) {
    return value;
  }
  throw new Error("codex_bridge_finish_status_invalid");
}

export function mapCodexBridgeFinishStatusToRuntimeStatus(
  status: CodexBridgeRunFinishStatus,
): "ok" | "error" | "cancelled" {
  if (status === "succeeded") return "ok";
  if (status === "cancelled") return "cancelled";
  return "error";
}

export function normalizeCodexBridgeBaseUrlOrigin(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

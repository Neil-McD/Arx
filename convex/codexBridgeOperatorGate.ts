import {
  CODEX_BRIDGE_OPERATOR_SECRET_ENV_NAME,
  normalizeCodexBridgeBaseUrlOrigin,
} from "../shared/codexBridgeContract.ts";

type OperatorSecretResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "codex_bridge_operator_secret_missing"
        | "codex_bridge_operator_secret_invalid"
        | "codex_bridge_operator_secret_misconfigured";
      message: string;
    };

type OperatorTokenMintResult =
  | { ok: true; token: string }
  | {
      ok: false;
      code:
        | "codex_bridge_operator_secret_invalid"
        | "codex_bridge_operator_secret_misconfigured";
      message: string;
    };

type CodexBridgeOperatorAction =
  | "codex_bridge_echo_smoke"
  | "codex_bridge_codex_exec_smoke";

const CODEX_BRIDGE_OPERATOR_TOKEN_ISSUER = "polynet-codex-bridge-operator-v1";
const CODEX_BRIDGE_OPERATOR_TOKEN_VERSION = "v1";
const CODEX_BRIDGE_OPERATOR_TOKEN_MAX_TTL_MS = 5 * 60 * 1000;

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

function encodeBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function encodeBase64UrlText(value: string): string {
  return encodeBase64Url(new TextEncoder().encode(value));
}

function decodeBase64Url(raw: string): Buffer {
  const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  return Buffer.from(padded, "base64");
}

function decodeBase64UrlJson(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(decodeBase64Url(raw).toString("utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function signOperatorPayload(secret: string, signedPayload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload)),
  );
  return encodeBase64Url(signature);
}

function fixedTimeEqual(left: string, right: string): boolean {
  const leftLength = left.length;
  const rightLength = right.length;
  const maxLength = Math.max(leftLength, rightLength, 1);
  let diff = leftLength ^ rightLength;
  for (let index = 0; index < maxLength; index += 1) {
    const leftCode = index < leftLength ? left.charCodeAt(index) : 0;
    const rightCode = index < rightLength ? right.charCodeAt(index) : 0;
    diff |= leftCode ^ rightCode;
  }
  return diff === 0;
}

export async function verifyCodexBridgeOperatorToken(
  raw: unknown,
  params: {
    action: CodexBridgeOperatorAction;
    runId: string;
    projectId: string;
    threadId: string;
    baseUrl?: string | null;
    nowMs?: number | null;
  },
): Promise<OperatorSecretResult> {
  const expected = readEnv(CODEX_BRIDGE_OPERATOR_SECRET_ENV_NAME);
  if (expected.length < 32) {
    return {
      ok: false,
      code: "codex_bridge_operator_secret_misconfigured",
      message: "Codex bridge operator secret is not configured.",
    };
  }
  const token = String(raw ?? "").trim();
  if (!token) {
    return {
      ok: false,
      code: "codex_bridge_operator_secret_missing",
      message: "Missing Codex bridge operator token.",
    };
  }
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== CODEX_BRIDGE_OPERATOR_TOKEN_VERSION) {
    return {
      ok: false,
      code: "codex_bridge_operator_secret_invalid",
      message: "Invalid Codex bridge operator token.",
    };
  }
  const payload = decodeBase64UrlJson(parts[1]);
  const nowMs =
    typeof params.nowMs === "number" && Number.isFinite(params.nowMs)
      ? Math.floor(params.nowMs)
      : Date.now();
  const issuedAt = Number(payload?.issuedAt);
  const expiresAt = Number(payload?.expiresAt);
  const ttlMs = expiresAt - issuedAt;
  const rawBaseUrl = String(params.baseUrl ?? "").trim();
  const expectedBaseUrlOrigin = normalizeCodexBridgeBaseUrlOrigin(rawBaseUrl);
  if (rawBaseUrl && !expectedBaseUrlOrigin) {
    return {
      ok: false,
      code: "codex_bridge_operator_secret_invalid",
      message: "Invalid Codex bridge operator token.",
    };
  }
  if (
    !payload ||
    payload.issuer !== CODEX_BRIDGE_OPERATOR_TOKEN_ISSUER ||
    payload.action !== params.action ||
    payload.runId !== params.runId ||
    payload.projectId !== params.projectId ||
    payload.threadId !== params.threadId ||
    payload.baseUrlOrigin !== expectedBaseUrlOrigin ||
    !Number.isFinite(issuedAt) ||
    !Number.isFinite(expiresAt) ||
    issuedAt > nowMs + 30_000 ||
    ttlMs <= 0 ||
    ttlMs > CODEX_BRIDGE_OPERATOR_TOKEN_MAX_TTL_MS
  ) {
    return {
      ok: false,
      code: "codex_bridge_operator_secret_invalid",
      message: "Invalid Codex bridge operator token.",
    };
  }
  if (expiresAt <= nowMs) {
    return {
      ok: false,
      code: "codex_bridge_operator_secret_invalid",
      message: "Expired Codex bridge operator token.",
    };
  }
  const expectedSignature = await signOperatorPayload(expected, `${parts[0]}.${parts[1]}`);
  if (!fixedTimeEqual(parts[2], expectedSignature)) {
    return {
      ok: false,
      code: "codex_bridge_operator_secret_invalid",
      message: "Invalid Codex bridge operator token.",
    };
  }
  return { ok: true };
}

export async function mintCodexBridgeOperatorTokenForServer(params: {
  action: CodexBridgeOperatorAction;
  runId: string;
  projectId: string;
  threadId: string;
  baseUrl?: string | null;
  nowMs?: number | null;
}): Promise<OperatorTokenMintResult> {
  const secret = readEnv(CODEX_BRIDGE_OPERATOR_SECRET_ENV_NAME);
  if (secret.length < 32) {
    return {
      ok: false,
      code: "codex_bridge_operator_secret_misconfigured",
      message: "Codex bridge operator secret is not configured.",
    };
  }
  const projectId = String(params.projectId ?? "").trim();
  const threadId = String(params.threadId ?? "").trim();
  const runId = String(params.runId ?? "").trim();
  const rawBaseUrl = String(params.baseUrl ?? "").trim();
  const baseUrlOrigin = normalizeCodexBridgeBaseUrlOrigin(rawBaseUrl);
  if (!projectId || !threadId || !runId || (rawBaseUrl && !baseUrlOrigin)) {
    return {
      ok: false,
      code: "codex_bridge_operator_secret_invalid",
      message: "Codex bridge operator token scope is invalid.",
    };
  }
  const issuedAt =
    typeof params.nowMs === "number" && Number.isFinite(params.nowMs)
      ? Math.floor(params.nowMs)
      : Date.now();
  const payload = encodeBase64UrlText(
    JSON.stringify({
      issuer: CODEX_BRIDGE_OPERATOR_TOKEN_ISSUER,
      action: params.action,
      runId,
      projectId,
      threadId,
      baseUrlOrigin,
      issuedAt,
      expiresAt: issuedAt + CODEX_BRIDGE_OPERATOR_TOKEN_MAX_TTL_MS,
      nonce: crypto.randomUUID(),
    }),
  );
  const signedPayload = `${CODEX_BRIDGE_OPERATOR_TOKEN_VERSION}.${payload}`;
  const signature = await signOperatorPayload(secret, signedPayload);
  return {
    ok: true,
    token: `${signedPayload}.${signature}`,
  };
}

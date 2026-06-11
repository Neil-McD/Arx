import { POLYNET_CODEX_WORKER_ENGINE_ID } from "./polynetCodexWorkerBridge";

export const POLYNET_CODEX_WORKER_RUN_TOKEN_SECRET_ENV =
  "POLYNET_CODEX_WORKER_RUN_TOKEN_SECRET";
export const POLYNET_CODEX_WORKER_RUN_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

export type PolynetCodexWorkerRunTokenAudience = "ingest" | "terminal" | "tool";

export type PolynetCodexWorkerRunTokenContext = {
  owner_id: string;
  thread_id: string;
  run_id: string;
};

type JsonRecord = Record<string, unknown>;

export type PolynetCodexWorkerRunTokenPayload = {
  v: number;
  aud: PolynetCodexWorkerRunTokenAudience;
  engine_id: string;
  owner_id: string;
  thread_id: string;
  run_id: string;
  iat: number;
  exp: number;
  nonce: string;
};

export type PolynetCodexWorkerRunTokenFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
};

export type PolynetCodexWorkerRunTokenVerification =
  | { ok: true; payload: PolynetCodexWorkerRunTokenPayload }
  | PolynetCodexWorkerRunTokenFailure;

const RUN_TOKEN_AUDIENCES = new Set<PolynetCodexWorkerRunTokenAudience>([
  "ingest",
  "terminal",
  "tool",
]);

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

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

function getRunTokenSecret():
  | { ok: true; secret: string }
  | PolynetCodexWorkerRunTokenFailure {
  const secret = readEnv(POLYNET_CODEX_WORKER_RUN_TOKEN_SECRET_ENV);
  if (!secret) {
    return {
      ok: false,
      status: 503,
      code: "polynet_codex_worker_run_token_secret_missing",
      message: `${POLYNET_CODEX_WORKER_RUN_TOKEN_SECRET_ENV} is required for worker run tokens.`,
    };
  }
  return { ok: true, secret };
}

function cryptoApi(): Crypto | null {
  return typeof globalThis.crypto === "object" && globalThis.crypto
    ? globalThis.crypto
    : null;
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecodeBytes(value: string): Uint8Array | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

function base64UrlEncodeJson(value: JsonRecord): string {
  return base64UrlEncodeBytes(textEncoder.encode(JSON.stringify(value)));
}

function base64UrlDecodeJson(value: string): JsonRecord | null {
  const bytes = base64UrlDecodeBytes(value);
  if (!bytes) return null;
  try {
    return asRecord(JSON.parse(textDecoder.decode(bytes)));
  } catch {
    return null;
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = textEncoder.encode(a);
  const bBytes = textEncoder.encode(b);
  let diff = aBytes.length ^ bBytes.length;
  const length = Math.max(aBytes.length, bBytes.length);
  for (let index = 0; index < length; index += 1) {
    diff |= (aBytes[index] ?? 0) ^ (bBytes[index] ?? 0);
  }
  return diff === 0;
}

async function signPayload(secret: string, encodedPayload: string): Promise<string> {
  const api = cryptoApi();
  if (!api?.subtle) throw new Error("polynet_codex_worker_run_token_crypto_missing");
  const key = await api.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await api.subtle.sign("HMAC", key, textEncoder.encode(encodedPayload));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

function makeNonce(): string {
  const api = cryptoApi();
  if (!api?.getRandomValues) throw new Error("polynet_codex_worker_run_token_crypto_missing");
  const bytes = new Uint8Array(16);
  api.getRandomValues(bytes);
  return base64UrlEncodeBytes(bytes);
}

function normalizeContext(params: {
  ownerId?: string;
  threadId?: string;
  runId?: string;
  context?: PolynetCodexWorkerRunTokenContext;
}): PolynetCodexWorkerRunTokenContext {
  return {
    owner_id: String(params.context?.owner_id ?? params.ownerId ?? "").trim(),
    thread_id: String(params.context?.thread_id ?? params.threadId ?? "").trim(),
    run_id: String(params.context?.run_id ?? params.runId ?? "").trim(),
  };
}

async function mintPolynetCodexWorkerRunToken(params: {
  audience: PolynetCodexWorkerRunTokenAudience;
  context: PolynetCodexWorkerRunTokenContext;
  nowMs?: number;
  ttlMs?: number;
}): Promise<{ ok: true; token: string } | PolynetCodexWorkerRunTokenFailure> {
  const secret = getRunTokenSecret();
  if (!secret.ok) return secret;
  if (!RUN_TOKEN_AUDIENCES.has(params.audience)) {
    return {
      ok: false,
      status: 500,
      code: "polynet_codex_worker_run_token_invalid_audience",
      message: "Invalid worker run-token audience.",
    };
  }
  const now = Math.floor(params.nowMs ?? Date.now());
  const payload: PolynetCodexWorkerRunTokenPayload = {
    v: 1,
    aud: params.audience,
    engine_id: POLYNET_CODEX_WORKER_ENGINE_ID,
    owner_id: params.context.owner_id,
    thread_id: params.context.thread_id,
    run_id: params.context.run_id,
    iat: now,
    exp: now + Math.max(1, Math.floor(params.ttlMs ?? POLYNET_CODEX_WORKER_RUN_TOKEN_TTL_MS)),
    nonce: "",
  };
  try {
    payload.nonce = makeNonce();
  } catch {
    return {
      ok: false,
      status: 503,
      code: "polynet_codex_worker_run_token_crypto_missing",
      message: "Worker run-token crypto is unavailable.",
    };
  }
  const encodedPayload = base64UrlEncodeJson(payload);
  let signature = "";
  try {
    signature = await signPayload(secret.secret, encodedPayload);
  } catch {
    return {
      ok: false,
      status: 503,
      code: "polynet_codex_worker_run_token_crypto_missing",
      message: "Worker run-token crypto is unavailable.",
    };
  }
  return { ok: true, token: `${encodedPayload}.${signature}` };
}

export async function mintPolynetCodexWorkerRunTokenSet(params: {
  ownerId: string;
  threadId: string;
  runId: string;
  nowMs?: number;
}): Promise<
  | {
      ok: true;
      tokens: {
        ingest: string;
        terminal: string;
        tool: string;
      };
    }
  | PolynetCodexWorkerRunTokenFailure
> {
  const context = normalizeContext(params);
  if (!context.owner_id || !context.thread_id || !context.run_id) {
    return {
      ok: false,
      status: 500,
      code: "polynet_codex_worker_run_token_context_missing",
      message: "Worker run-token context is missing required coordinates.",
    };
  }
  const [ingest, terminal, tool] = await Promise.all([
    mintPolynetCodexWorkerRunToken({ audience: "ingest", context, nowMs: params.nowMs }),
    mintPolynetCodexWorkerRunToken({ audience: "terminal", context, nowMs: params.nowMs }),
    mintPolynetCodexWorkerRunToken({ audience: "tool", context, nowMs: params.nowMs }),
  ]);
  if (!ingest.ok) return ingest;
  if (!terminal.ok) return terminal;
  if (!tool.ok) return tool;
  return {
    ok: true,
    tokens: {
      ingest: ingest.token,
      terminal: terminal.token,
      tool: tool.token,
    },
  };
}

export async function verifyPolynetCodexWorkerRunToken(params: {
  token: string;
  expectedAudience: PolynetCodexWorkerRunTokenAudience;
  context: PolynetCodexWorkerRunTokenContext;
  nowMs?: number;
}): Promise<PolynetCodexWorkerRunTokenVerification> {
  const secret = getRunTokenSecret();
  if (!secret.ok) return secret;
  const token = String(params.token ?? "").trim();
  if (!token) {
    return {
      ok: false,
      status: 401,
      code: "polynet_codex_worker_run_token_required",
      message: "Worker run token is required.",
    };
  }
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return {
      ok: false,
      status: 401,
      code: "polynet_codex_worker_run_token_malformed",
      message: "Worker run token is malformed.",
    };
  }
  let expectedSignature = "";
  try {
    expectedSignature = await signPayload(secret.secret, parts[0]);
  } catch {
    return {
      ok: false,
      status: 503,
      code: "polynet_codex_worker_run_token_crypto_missing",
      message: "Worker run-token crypto is unavailable.",
    };
  }
  if (!timingSafeEqual(expectedSignature, parts[1])) {
    return {
      ok: false,
      status: 401,
      code: "polynet_codex_worker_run_token_invalid_signature",
      message: "Worker run token signature is invalid.",
    };
  }
  const payload = base64UrlDecodeJson(parts[0]);
  if (!payload) {
    return {
      ok: false,
      status: 401,
      code: "polynet_codex_worker_run_token_malformed",
      message: "Worker run token payload is malformed.",
    };
  }
  const audience = String(payload.aud ?? "") as PolynetCodexWorkerRunTokenAudience;
  const normalizedPayload: PolynetCodexWorkerRunTokenPayload = {
    v: Number(payload.v),
    aud: audience,
    engine_id: String(payload.engine_id ?? ""),
    owner_id: String(payload.owner_id ?? ""),
    thread_id: String(payload.thread_id ?? ""),
    run_id: String(payload.run_id ?? ""),
    iat: Number(payload.iat),
    exp: Number(payload.exp),
    nonce: String(payload.nonce ?? ""),
  };
  if (
    normalizedPayload.v !== 1 ||
    !RUN_TOKEN_AUDIENCES.has(audience) ||
    !Number.isFinite(normalizedPayload.iat) ||
    !Number.isFinite(normalizedPayload.exp) ||
    !normalizedPayload.nonce
  ) {
    return {
      ok: false,
      status: 401,
      code: "polynet_codex_worker_run_token_malformed",
      message: "Worker run token claims are malformed.",
    };
  }
  const now = Math.floor(params.nowMs ?? Date.now());
  if (normalizedPayload.exp <= now) {
    return {
      ok: false,
      status: 401,
      code: "polynet_codex_worker_run_token_expired",
      message: "Worker run token has expired.",
    };
  }
  if (normalizedPayload.aud !== params.expectedAudience) {
    return {
      ok: false,
      status: 403,
      code: "polynet_codex_worker_run_token_audience_mismatch",
      message: "Worker run token audience does not match this endpoint.",
    };
  }
  if (
    normalizedPayload.engine_id !== POLYNET_CODEX_WORKER_ENGINE_ID ||
    normalizedPayload.owner_id !== params.context.owner_id ||
    normalizedPayload.thread_id !== params.context.thread_id ||
    normalizedPayload.run_id !== params.context.run_id
  ) {
    return {
      ok: false,
      status: 403,
      code: "polynet_codex_worker_run_token_context_mismatch",
      message: "Worker run token context does not match the request.",
    };
  }
  return { ok: true, payload: normalizedPayload };
}

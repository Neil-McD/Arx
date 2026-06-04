import {
  CODEX_BRIDGE_CONTRACT_VERSION,
  CODEX_BRIDGE_TOKEN_ISSUER,
  isCodexBridgeAllowedOperation,
  type CodexBridgeAllowedOperation,
  type CodexBridgeRunTokenClaimsV1,
} from "../shared/codexBridgeContract.ts";

export const CODEX_BRIDGE_SIGNING_SECRET_ENV_NAME = "ARX_CODEX_BRIDGE_SIGNING_SECRET";
const CODEX_BRIDGE_DEFAULT_TOKEN_TTL_MS = 10 * 60 * 1000;
const CODEX_BRIDGE_MAX_TOKEN_TTL_MS = 15 * 60 * 1000;

type BridgeTokenFailureCode =
  | "codex_bridge_token_missing"
  | "codex_bridge_token_invalid"
  | "codex_bridge_token_expired"
  | "codex_bridge_token_operation_denied"
  | "codex_bridge_token_misconfigured";

type BridgeTokenFailure = {
  ok: false;
  status: number;
  code: BridgeTokenFailureCode;
  message: string;
};

type BridgeTokenSuccess = {
  ok: true;
  claims: CodexBridgeRunTokenClaimsV1;
};

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // ignore env access failures
  }
  return "";
}

export function readCodexBridgeSigningSecret(): string {
  return readEnv(CODEX_BRIDGE_SIGNING_SECRET_ENV_NAME);
}

function textBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function encodeBase64Url(bytes: Uint8Array): string {
  const bufferCtor = (globalThis as any).Buffer;
  if (bufferCtor) {
    return bufferCtor
      .from(bytes)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }
  const btoaFn = (globalThis as any).btoa;
  if (typeof btoaFn !== "function") throw new Error("codex_bridge_base64_unavailable");
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoaFn(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(raw: string): Uint8Array {
  const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const bufferCtor = (globalThis as any).Buffer;
  if (bufferCtor) return new Uint8Array(bufferCtor.from(padded, "base64"));
  const atobFn = (globalThis as any).atob;
  if (typeof atobFn !== "function") throw new Error("codex_bridge_base64_unavailable");
  const binary = atobFn(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function decodeBase64UrlJson(raw: string): Record<string, unknown> | null {
  try {
    const decoded = new TextDecoder().decode(decodeBase64Url(raw));
    const parsed = JSON.parse(decoded);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    textBytes(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signTokenPayload(secret: string, signedPayload: string): Promise<string> {
  const key = await importHmacKey(secret);
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, textBytes(signedPayload)),
  );
  return encodeBase64Url(signature);
}

async function verifyTokenSignature(args: {
  secret: string;
  signedPayload: string;
  encodedSignature: string;
}): Promise<boolean> {
  try {
    const key = await importHmacKey(args.secret);
    const signature = decodeBase64Url(args.encodedSignature);
    return await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      textBytes(args.signedPayload),
    );
  } catch {
    return false;
  }
}

function randomNonce(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return encodeBase64Url(bytes);
}

function normalizeRequiredString(value: unknown, maxLength: number): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function normalizeOptionalString(value: unknown, maxLength: number): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizeClaims(raw: Record<string, unknown>): CodexBridgeRunTokenClaimsV1 | null {
  if (raw.version !== CODEX_BRIDGE_CONTRACT_VERSION) return null;
  if (raw.issuer !== CODEX_BRIDGE_TOKEN_ISSUER) return null;
  const runId = normalizeRequiredString(raw.runId, 200);
  const ownerId = normalizeRequiredString(raw.ownerId, 200);
  const threadId = normalizeRequiredString(raw.threadId, 200);
  const nonce = normalizeRequiredString(raw.nonce, 200);
  if (!runId || !ownerId || !threadId || !nonce) return null;
  if (!Array.isArray(raw.operations)) return null;
  const operations = raw.operations
    .filter(isCodexBridgeAllowedOperation)
    .filter((value, index, list) => list.indexOf(value) === index);
  if (operations.length === 0) return null;
  const issuedAt = Number(raw.issuedAt);
  const expiresAt = Number(raw.expiresAt);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) return null;
  return {
    version: CODEX_BRIDGE_CONTRACT_VERSION,
    issuer: CODEX_BRIDGE_TOKEN_ISSUER,
    runId,
    ownerId,
    threadId,
    projectId: normalizeOptionalString(raw.projectId, 200),
    communityId: normalizeOptionalString(raw.communityId, 200),
    operations,
    issuedAt: Math.floor(issuedAt),
    expiresAt: Math.floor(expiresAt),
    nonce,
  };
}

function secretFailure(): BridgeTokenFailure {
  return {
    ok: false,
    status: 503,
    code: "codex_bridge_token_misconfigured",
    message: "Codex bridge signing secret is not configured.",
  };
}

export async function mintCodexBridgeRunToken(params: {
  runId: string;
  ownerId: string;
  threadId: string;
  projectId?: string | null;
  communityId?: string | null;
  operations: CodexBridgeAllowedOperation[];
  ttlMs?: number | null;
  nowMs?: number | null;
  secret?: string | null;
}): Promise<{ ok: true; token: string; claims: CodexBridgeRunTokenClaimsV1 } | BridgeTokenFailure> {
  const secret = String(params.secret ?? readCodexBridgeSigningSecret()).trim();
  if (secret.length < 32) return secretFailure();
  const nowMs =
    typeof params.nowMs === "number" && Number.isFinite(params.nowMs)
      ? Math.floor(params.nowMs)
      : Date.now();
  const ttlMs =
    typeof params.ttlMs === "number" && Number.isFinite(params.ttlMs)
      ? Math.min(CODEX_BRIDGE_MAX_TOKEN_TTL_MS, Math.max(1_000, Math.floor(params.ttlMs)))
      : CODEX_BRIDGE_DEFAULT_TOKEN_TTL_MS;
  const operations = params.operations
    .filter(isCodexBridgeAllowedOperation)
    .filter((value, index, list) => list.indexOf(value) === index);
  if (operations.length === 0) {
    return {
      ok: false,
      status: 400,
      code: "codex_bridge_token_invalid",
      message: "Codex bridge token requires at least one allowed operation.",
    };
  }
  const claims = normalizeClaims({
    version: CODEX_BRIDGE_CONTRACT_VERSION,
    issuer: CODEX_BRIDGE_TOKEN_ISSUER,
    runId: params.runId,
    ownerId: params.ownerId,
    threadId: params.threadId,
    projectId: params.projectId ?? null,
    communityId: params.communityId ?? null,
    operations,
    issuedAt: nowMs,
    expiresAt: nowMs + ttlMs,
    nonce: randomNonce(),
  });
  if (!claims) {
    return {
      ok: false,
      status: 400,
      code: "codex_bridge_token_invalid",
      message: "Codex bridge token claims are invalid.",
    };
  }
  const header = encodeBase64Url(
    textBytes(JSON.stringify({ alg: "HS256", typ: "JWT", kid: CODEX_BRIDGE_TOKEN_ISSUER })),
  );
  const payload = encodeBase64Url(textBytes(JSON.stringify(claims)));
  const signedPayload = `${header}.${payload}`;
  const signature = await signTokenPayload(secret, signedPayload);
  return {
    ok: true,
    token: `${signedPayload}.${signature}`,
    claims,
  };
}

export async function verifyCodexBridgeRunToken(params: {
  token: string;
  requiredOperation?: CodexBridgeAllowedOperation | null;
  nowMs?: number | null;
  secret?: string | null;
}): Promise<BridgeTokenSuccess | BridgeTokenFailure> {
  const token = String(params.token ?? "").trim();
  if (!token) {
    return {
      ok: false,
      status: 401,
      code: "codex_bridge_token_missing",
      message: "Missing Codex bridge token.",
    };
  }
  const secret = String(params.secret ?? readCodexBridgeSigningSecret()).trim();
  if (secret.length < 32) return secretFailure();
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) {
    return {
      ok: false,
      status: 401,
      code: "codex_bridge_token_invalid",
      message: "Invalid Codex bridge token.",
    };
  }
  const header = decodeBase64UrlJson(parts[0]);
  if (
    header?.alg !== "HS256" ||
    header?.typ !== "JWT" ||
    header?.kid !== CODEX_BRIDGE_TOKEN_ISSUER
  ) {
    return {
      ok: false,
      status: 401,
      code: "codex_bridge_token_invalid",
      message: "Invalid Codex bridge token.",
    };
  }
  const signatureOk = await verifyTokenSignature({
    secret,
    signedPayload: `${parts[0]}.${parts[1]}`,
    encodedSignature: parts[2],
  });
  if (!signatureOk) {
    return {
      ok: false,
      status: 401,
      code: "codex_bridge_token_invalid",
      message: "Invalid Codex bridge token.",
    };
  }
  const claims = normalizeClaims(decodeBase64UrlJson(parts[1]) ?? {});
  if (!claims) {
    return {
      ok: false,
      status: 401,
      code: "codex_bridge_token_invalid",
      message: "Invalid Codex bridge token claims.",
    };
  }
  const nowMs =
    typeof params.nowMs === "number" && Number.isFinite(params.nowMs)
      ? Math.floor(params.nowMs)
      : Date.now();
  if (claims.expiresAt <= nowMs) {
    return {
      ok: false,
      status: 401,
      code: "codex_bridge_token_expired",
      message: "Codex bridge token is expired.",
    };
  }
  if (claims.issuedAt > nowMs + 5 * 60 * 1000) {
    return {
      ok: false,
      status: 401,
      code: "codex_bridge_token_invalid",
      message: "Codex bridge token is not valid yet.",
    };
  }
  if (params.requiredOperation && !claims.operations.includes(params.requiredOperation)) {
    return {
      ok: false,
      status: 403,
      code: "codex_bridge_token_operation_denied",
      message: "Codex bridge token is not allowed to perform this operation.",
    };
  }
  return { ok: true, claims };
}

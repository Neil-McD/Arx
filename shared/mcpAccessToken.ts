// An outside AI's access token, checked at the MCP door and nowhere else.
//
// The backend's own sign-in (convex/auth.config.ts) does not know the MCP
// audience, so a token minted for someone's AI app (aud = the /runtime/mcp
// address) is refused by every other function. Only /runtime/mcp accepts it,
// after this check: signed by the sign-in provider's key, from its issuer,
// for this resource, and in date. Everything after the door runs as the
// verified person through server-side reads that take their user explicitly.

export type McpAccessTokenConfig = {
  issuer: string;
  jwksUrl: string;
  audience: string;
  algorithm: "RS256" | "ES256";
};

export type McpAccessTokenResult =
  | { ok: true; claims: Record<string, unknown> }
  | { ok: false; reason: string };

type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string };

// Seconds of clock difference allowed on exp and nbf.
const CLOCK_SKEW_SECONDS = 60;
// How long fetched keys are trusted before they are fetched again.
const KEYS_TTL_MS = 10 * 60 * 1000;
// An unknown key id triggers at most one refetch in this window.
const REFETCH_MIN_MS = 30 * 1000;

const keyCache = new Map<string, { keys: Jwk[]; fetchedAt: number }>();

function base64UrlBytes(part: string): Uint8Array {
  const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlJson(part: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(new TextDecoder().decode(base64UrlBytes(part)));
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function bearerToken(req: Request): string {
  const raw = String(req.headers.get("authorization") ?? "").trim();
  return raw.toLowerCase().startsWith("bearer ") ? raw.slice(7).trim() : "";
}

async function fetchKeys(jwksUrl: string, fetcher: typeof fetch): Promise<Jwk[]> {
  const response = await fetcher(jwksUrl, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`jwks_http_${response.status}`);
  const body = await response.json() as { keys?: unknown };
  return Array.isArray(body.keys) ? body.keys.filter((key): key is Jwk => Boolean(key) && typeof key === "object") : [];
}

async function keyFor(kid: string, config: McpAccessTokenConfig, fetcher: typeof fetch, nowMs: number): Promise<Jwk | null> {
  const cached = keyCache.get(config.jwksUrl);
  const find = (keys: Jwk[]) => keys.find((key) => key.kid === kid && (!key.use || key.use === "sig")) ?? null;
  if (cached && nowMs - cached.fetchedAt < KEYS_TTL_MS) {
    const hit = find(cached.keys);
    if (hit || nowMs - cached.fetchedAt < REFETCH_MIN_MS) return hit;
  }
  const keys = await fetchKeys(config.jwksUrl, fetcher);
  keyCache.set(config.jwksUrl, { keys, fetchedAt: nowMs });
  return find(keys);
}

function importParams(algorithm: McpAccessTokenConfig["algorithm"]) {
  return algorithm === "ES256"
    ? { importAlg: { name: "ECDSA", namedCurve: "P-256" }, verifyAlg: { name: "ECDSA", hash: "SHA-256" } }
    : { importAlg: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, verifyAlg: { name: "RSASSA-PKCS1-v1_5" } };
}

export async function verifyMcpAccessToken(
  token: string,
  config: McpAccessTokenConfig,
  options: { fetcher?: typeof fetch; nowMs?: number } = {},
): Promise<McpAccessTokenResult> {
  // Fail closed when the door is not configured.
  if (!config.issuer || !config.jwksUrl || !config.audience) return { ok: false, reason: "not_configured" };
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) return { ok: false, reason: "malformed" };
  const header = base64UrlJson(parts[0]!);
  const claims = base64UrlJson(parts[1]!);
  if (!header || !claims) return { ok: false, reason: "malformed" };
  // Only the one algorithm the provider is configured for; never "none".
  if (header.alg !== config.algorithm) return { ok: false, reason: "wrong_algorithm" };
  const kid = typeof header.kid === "string" ? header.kid : "";
  if (!kid) return { ok: false, reason: "no_key_id" };

  const nowMs = options.nowMs ?? Date.now();
  let jwk: Jwk | null;
  try {
    jwk = await keyFor(kid, config, options.fetcher ?? fetch, nowMs);
  } catch {
    return { ok: false, reason: "keys_unavailable" };
  }
  if (!jwk) return { ok: false, reason: "unknown_key" };
  if (jwk.alg && jwk.alg !== config.algorithm) return { ok: false, reason: "wrong_algorithm" };

  const { importAlg, verifyAlg } = importParams(config.algorithm);
  let valid = false;
  try {
    const { kid: _kid, alg: _alg, use: _use, key_ops: _ops, ...material } = jwk as Jwk & { key_ops?: unknown };
    const key = await crypto.subtle.importKey("jwk", material, importAlg, false, ["verify"]);
    valid = await crypto.subtle.verify(verifyAlg, key, base64UrlBytes(parts[2]!) as BufferSource,
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`) as BufferSource);
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: "bad_signature" };

  const trim = (value: string) => value.replace(/\/+$/, "");
  if (typeof claims.iss !== "string" || trim(claims.iss) !== trim(config.issuer)) return { ok: false, reason: "wrong_issuer" };
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(config.audience)) return { ok: false, reason: "wrong_audience" };
  const nowSeconds = nowMs / 1000;
  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_SECONDS < nowSeconds) return { ok: false, reason: "expired" };
  if (typeof claims.nbf === "number" && claims.nbf - CLOCK_SKEW_SECONDS > nowSeconds) return { ok: false, reason: "not_yet_valid" };
  if (typeof claims.sub !== "string" || !claims.sub.trim()) return { ok: false, reason: "no_subject" };
  return { ok: true, claims };
}

// Which AI app a token was issued to, as a person would name it: its OAuth
// client (client_id, or azp) by the address it is published at (Claude's and
// ChatGPT's published client documents), else null and the card says "Your
// AI app". Only a label on the Yes/No card; nothing is allowed by it.
const AI_APPS: Array<[RegExp, string]> = [
  [/(^|\.)(claude\.ai|anthropic\.com)$/i, "Claude"],
  [/(^|\.)(chatgpt\.com|openai\.com)$/i, "ChatGPT"],
  [/(^|\.)cursor\.(com|sh)$/i, "Cursor"],
  [/(^|\.)(github\.com|visualstudio\.com)$/i, "VS Code"],
];
export function aiAppNameFromClaims(claims: Record<string, unknown>): string | null {
  const client = String(claims.client_id ?? claims.azp ?? "").trim();
  let host = "";
  try { host = new URL(client).hostname; } catch { return null; }
  const path = (() => { try { return new URL(client).pathname.toLowerCase(); } catch { return ""; } })();
  if (/(^|\.)openai\.com$/i.test(host) && path.includes("codex")) return "Codex";
  if (/(^|\.)claude\.ai$/i.test(host) && path.includes("claude-code")) return "Claude Code";
  return AI_APPS.find(([pattern]) => pattern.test(host))?.[1] ?? null;
}

// Tests start from an empty key cache.
export function resetMcpAccessTokenKeysForTest() {
  keyCache.clear();
}

import { getEnv } from "./env.ts";

const CORS_ALLOW_METHODS = "GET,POST,OPTIONS";
const CORS_ALLOW_HEADERS = "content-type,authorization,apikey,x-client-info";

export type StrictCorsResult = {
  headers: Record<string, string>;
  allowed: boolean;
};

function baseCorsHeaders(headers: Record<string, string>): Record<string, string> {
  return {
    ...headers,
    Vary: "Origin",
    "Access-Control-Allow-Methods": CORS_ALLOW_METHODS,
    // Supabase clients commonly send `apikey` + `x-client-info` in addition to `authorization`.
    "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
  };
}

function normalizeCorsOrigin(rawOrigin: string): string | null {
  const origin = rawOrigin.trim();
  if (!origin) return null;
  if (origin === "tauri://localhost") return origin;

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  return url.origin;
}

function parseAllowedCorsOrigins(): string[] {
  const raw = getEnv("ARX_ALLOWED_APP_ORIGINS");
  if (!raw) return [];

  const out: string[] = [];
  for (const part of raw.split(",")) {
    const normalized = normalizeCorsOrigin(part);
    if (!normalized) continue;
    out.push(normalized);
  }
  return Array.from(new Set(out));
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    const hostname = (url.hostname ?? "").trim().toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

export function jsonResponse(
  body: unknown,
  init: ResponseInit & { headers?: Record<string, string> } = { status: 200 },
): Response {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    ...(init.headers ?? {}),
  };
  return new Response(JSON.stringify(body, null, 2), { ...init, headers });
}

export function noStoreHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", ...extra };
}

export function parseBearerToken(header: string | null): string | null {
  const value = (header ?? "").trim();
  if (!value) return null;
  const lower = value.toLowerCase();
  if (!lower.startsWith("bearer ")) return null;
  const token = value.slice(7).trim();
  return token || null;
}

export function handleCorsPreflightAndMethod(
  req: Request,
  headers: Record<string, string>,
  method: string,
): Response | null {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== method) {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, { status: 405, headers });
  }
  return null;
}

// CORS policy map (MVP):
// - Public endpoints (public_* + checkout_start/finalize) use withCors.
// - Private/auth endpoints use withStrictCors and ARX_ALLOWED_APP_ORIGINS allowlist.
export function withCors(
  headers: Record<string, string>,
  req: Request,
): Record<string, string> {
  const origin = normalizeCorsOrigin(req.headers.get("origin") ?? "") ?? "*";
  return {
    ...baseCorsHeaders(headers),
    "Access-Control-Allow-Origin": origin,
  };
}

export function withStrictCors(
  headers: Record<string, string>,
  req: Request,
): StrictCorsResult {
  const rawOrigin = (req.headers.get("origin") ?? "").trim();
  const baseHeaders = baseCorsHeaders(headers);

  // Non-browser clients may omit Origin; CORS only applies to browser callers.
  if (!rawOrigin) return { headers: baseHeaders, allowed: true };

  const origin = normalizeCorsOrigin(rawOrigin);
  if (!origin) return { headers: baseHeaders, allowed: false };
  if (isLoopbackOrigin(origin)) {
    return {
      headers: { ...baseHeaders, "Access-Control-Allow-Origin": origin },
      allowed: true,
    };
  }

  const allowedOrigins = parseAllowedCorsOrigins();
  if (!allowedOrigins.includes(origin)) return { headers: baseHeaders, allowed: false };

  return {
    headers: { ...baseHeaders, "Access-Control-Allow-Origin": origin },
    allowed: true,
  };
}

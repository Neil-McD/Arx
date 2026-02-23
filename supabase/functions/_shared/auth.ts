import { getSupabaseAdmin } from "./supabase_admin.ts";

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

export type AuthApiErrorCode =
  | "auth_missing_bearer_token"
  | "auth_invalid_bearer_token"
  | "auth_invalid_user"
  | "auth_verifier_misconfigured"
  | "auth_verification_unavailable";

export type AuthApiError = Error & {
  code: AuthApiErrorCode;
  status: number;
  details?: Record<string, unknown>;
};

function createAuthApiError(
  code: AuthApiErrorCode,
  message: string,
  status: number,
  details?: Record<string, unknown>,
): AuthApiError {
  const err = new Error(message) as AuthApiError;
  err.code = code;
  err.status = status;
  if (details) err.details = details;
  return err;
}

export function isAuthApiError(error: unknown): error is AuthApiError {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      "status" in error &&
      typeof (error as { code?: unknown }).code === "string" &&
      typeof (error as { status?: unknown }).status === "number",
  );
}

function includesJwtFailureText(value: string): boolean {
  const lower = (value ?? "").trim().toLowerCase();
  if (!lower) return false;
  return (
    lower.includes("jwt expired") ||
    lower.includes("invalid jwt") ||
    lower.includes("jwt malformed") ||
    lower.includes("failed to decode jwt") ||
    lower.includes("invalid bearer token") ||
    lower.includes("missing bearer token")
  );
}

function parseJwtIssuerOrigin(token: string): string | null {
  const parts = String(token ?? "").trim().split(".");
  if (parts.length !== 3) return null;
  const payloadRaw = parts[1] ?? "";
  if (!payloadRaw) return null;
  const padded = payloadRaw.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payloadRaw.length / 4) * 4, "=");
  let decoded = "";
  try {
    decoded = atob(padded);
  } catch {
    return null;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(decoded);
  } catch {
    return null;
  }
  const iss = payload && typeof payload === "object" ? (payload as { iss?: unknown }).iss : null;
  if (typeof iss !== "string" || !iss.trim()) return null;
  try {
    return new URL(iss).origin.toLowerCase();
  } catch {
    return null;
  }
}

async function readAuthErrorBody(response: Response): Promise<string> {
  try {
    const json = (await response.clone().json()) as { message?: unknown; error?: unknown };
    const message = typeof json?.message === "string" ? json.message.trim() : "";
    if (message) return message;
    const error = typeof json?.error === "string" ? json.error.trim() : "";
    if (error) return error;
  } catch {
    // ignore
  }
  try {
    const text = (await response.clone().text()).trim();
    if (text) return text;
  } catch {
    // ignore
  }
  return "";
}

export function extractBearerToken(req: Request): string {
  const header = (req.headers.get("Authorization") ?? "").trim();
  const [kind, token] = header.split(/\s+/);
  if (!kind || kind.toLowerCase() !== "bearer" || !token) {
    throw createAuthApiError("auth_missing_bearer_token", "Missing bearer token", 401);
  }
  return token;
}

export async function requireVerifiedUserId(req: Request): Promise<string> {
  const token = extractBearerToken(req);
  const admin = getSupabaseAdmin();
  let verifierOrigin: string | null = null;
  try {
    verifierOrigin = new URL(admin.url).origin.toLowerCase();
  } catch {
    verifierOrigin = null;
  }
  const tokenIssuerOrigin = parseJwtIssuerOrigin(token);

  // Fail closed: verify the JWT against Supabase Auth, even if a function is
  // accidentally deployed with verify_jwt=false.
  let res: Response;
  try {
    res = await fetch(`${admin.url}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: admin.serviceRoleKey,
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (error) {
    throw createAuthApiError("auth_verification_unavailable", "Auth verification unavailable.", 503, {
      verify_status: "network_error",
      verify_error: error instanceof Error ? error.message : String(error),
    });
  }

  if (!res.ok) {
    const verifyError = await readAuthErrorBody(res);
    // Only explicit JWT/bearer failures map to 401. All other verifier
    // failures are treated as infrastructure/config drift (503), never auth.
    if (includesJwtFailureText(verifyError)) {
      if (tokenIssuerOrigin && verifierOrigin && tokenIssuerOrigin !== verifierOrigin) {
        throw createAuthApiError("auth_verifier_misconfigured", "Auth verification misconfigured.", 503, {
          verify_status: res.status,
        });
      }
      throw createAuthApiError("auth_invalid_bearer_token", "Invalid bearer token", 401, {
        verify_status: res.status,
      });
    }
    throw createAuthApiError("auth_verifier_misconfigured", "Auth verification misconfigured.", 503, {
      verify_status: res.status,
      ...(verifyError ? { verify_error: verifyError } : null),
    });
  }

  const data = (await res.json()) as { id?: unknown; user?: { id?: unknown } };
  const userId = typeof data?.id === "string" ? data.id : typeof data?.user?.id === "string" ? data.user.id : "";
  if (!UUID_RE.test(userId)) throw createAuthApiError("auth_invalid_user", "Invalid user", 401);
  return userId;
}

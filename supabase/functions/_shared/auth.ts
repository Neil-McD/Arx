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

function includesVerifierMisconfiguredText(value: string): boolean {
  const lower = (value ?? "").trim().toLowerCase();
  if (!lower) return false;
  return (
    lower.includes("invalid api key") ||
    lower.includes("apikey") ||
    lower.includes("service role") ||
    lower.includes("service_role") ||
    lower.includes("project not found")
  );
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
    if (includesJwtFailureText(verifyError) || (res.status === 401 && !includesVerifierMisconfiguredText(verifyError))) {
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

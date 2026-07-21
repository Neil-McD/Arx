export const AUTH_SECURE_RANDOM_UNAVAILABLE = "auth_secure_random_unavailable" as const;

export const AUTH_SESSION_ABSOLUTE_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
export const AUTH_SESSION_TERMINAL_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;
export const AUTH_SESSION_REFRESH_LEASE_MS = 30_000;
export const AUTH_PROVIDER_LOGOUT_TIMEOUT_MS = 5_000;
export const AUTH_SESSION_SECRET_VERSION = 1;

const SECURE_AUTH_SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AuthProviderLogoutOutcome = "succeeded" | "failed" | "skipped";

export type ConfirmedAuthSessionLogoutResult =
  | { status: "ok"; providerLogoutOutcome: AuthProviderLogoutOutcome }
  | { status: "transient_failure"; reason: string };

export type AuthSessionLifecycleRow = {
  expiresAt?: number | null;
  revokedAt?: number | null;
};

export type AuthSessionLifecycleDecision =
  | { status: "active"; expiresAt: number }
  | { status: "terminal"; reason: "auth_session_expired" | "auth_session_revoked" };

export function createSecureAuthSessionId(
  randomUuid: () => string = () => crypto.randomUUID(),
): string {
  try {
    const sessionId = randomUuid();
    if (typeof sessionId !== "string" || !SECURE_AUTH_SESSION_ID_PATTERN.test(sessionId)) {
      throw new Error(AUTH_SECURE_RANDOM_UNAVAILABLE);
    }
    return sessionId;
  } catch {
    throw new Error(AUTH_SECURE_RANDOM_UNAVAILABLE);
  }
}

export async function hashAuthSessionCredential(credential: string): Promise<string> {
  const normalized = String(credential ?? "").trim();
  if (!normalized) throw new Error("auth_session_missing");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export function resolveAuthSessionLifecycle(
  row: AuthSessionLifecycleRow,
  nowMs: number,
): AuthSessionLifecycleDecision {
  if (typeof row.revokedAt === "number" && Number.isFinite(row.revokedAt)) {
    return { status: "terminal", reason: "auth_session_revoked" };
  }
  const expiresAt =
    typeof row.expiresAt === "number" && Number.isFinite(row.expiresAt)
      ? Math.floor(row.expiresAt)
      : 0;
  if (expiresAt <= nowMs) {
    return { status: "terminal", reason: "auth_session_expired" };
  }
  return { status: "active", expiresAt };
}

export function computeAuthSessionPurgeAfter(terminalAt: number): number {
  return Math.floor(terminalAt) + AUTH_SESSION_TERMINAL_RETENTION_MS;
}

export function classifyAuthSessionLogoutResolutionFailure(
  reason: "auth_session_missing" | "auth_session_invalid",
): { status: "ok" } | { status: "transient_failure"; reason: "auth_session_invalid" } {
  return reason === "auth_session_missing"
    ? { status: "ok" }
    : { status: "transient_failure", reason: "auth_session_invalid" };
}

export async function completeConfirmedAuthSessionLogout(params: {
  revokeLocalSession: () => Promise<void>;
  logoutProvider?: () => Promise<AuthProviderLogoutOutcome>;
}): Promise<ConfirmedAuthSessionLogoutResult> {
  try {
    await params.revokeLocalSession();
  } catch (error) {
    return {
      status: "transient_failure",
      reason: error instanceof Error ? error.message : String(error ?? "auth_session_logout_unavailable"),
    };
  }

  if (!params.logoutProvider) {
    return { status: "ok", providerLogoutOutcome: "skipped" };
  }
  try {
    return {
      status: "ok",
      providerLogoutOutcome: await params.logoutProvider(),
    };
  } catch {
    return { status: "ok", providerLogoutOutcome: "failed" };
  }
}

export function normalizeAuthSessionBatchLimit(raw: unknown, fallback = 100): number {
  const parsed = Number(raw ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(500, Math.floor(parsed));
}

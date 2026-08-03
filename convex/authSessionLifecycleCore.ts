export const AUTH_SESSION_IDLE_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
export const AUTH_SESSION_ABSOLUTE_TTL_MS = 90 * 24 * 60 * 60 * 1_000;
export const AUTH_SESSION_REFRESH_LEASE_MS = 30_000;
export const AUTH_SESSION_REFRESH_COALESCE_MS = 10_000;
export const AUTH_SESSION_REFRESH_WAIT_INTERVAL_MS = 100;
export const AUTH_SESSION_REFRESH_WAIT_ATTEMPTS = 50;

type SessionLifecycleRow = {
  createdAt: number;
  revokedAt?: number | null;
  refreshGeneration?: number | null;
  refreshLeaseId?: string | null;
  refreshLeaseExpiresAt?: number | null;
  lastUsedAt?: number | null;
  idleExpiresAt?: number | null;
  absoluteExpiresAt?: number | null;
};

function finitePositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

export function normalizeAuthSessionRefreshGeneration(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

export function resolveAuthSessionLifetime(
  row: SessionLifecycleRow,
  nowMs: number,
):
  | {
      ok: true;
      absoluteExpiresAt: number;
      idleExpiresAt: number;
      lastUsedAt: number;
    }
  | {
      ok: false;
      reason: "auth_session_idle_expired" | "auth_session_absolute_expired";
    } {
  const now = finitePositiveInteger(nowMs);
  if (now === null) throw new Error("auth_session_now_invalid");

  // Existing production rows predate explicit server expiry. Their first use
  // starts the new policy window instead of unexpectedly signing everyone out.
  const absoluteExpiresAt =
    finitePositiveInteger(row.absoluteExpiresAt) ??
    now + AUTH_SESSION_ABSOLUTE_TTL_MS;
  const idleExpiresAt =
    finitePositiveInteger(row.idleExpiresAt) ??
    Math.min(now + AUTH_SESSION_IDLE_TTL_MS, absoluteExpiresAt);

  if (now >= absoluteExpiresAt) {
    return { ok: false, reason: "auth_session_absolute_expired" };
  }
  if (now >= idleExpiresAt) {
    return { ok: false, reason: "auth_session_idle_expired" };
  }

  return {
    ok: true,
    absoluteExpiresAt,
    idleExpiresAt: Math.min(now + AUTH_SESSION_IDLE_TTL_MS, absoluteExpiresAt),
    lastUsedAt: now,
  };
}

export function resolveAuthSessionRefreshClaim(
  row: SessionLifecycleRow,
  args: { leaseId: string; nowMs: number },
):
  | {
      status: "terminal_failure";
      reason:
        | "auth_session_revoked"
        | "auth_session_idle_expired"
        | "auth_session_absolute_expired";
    }
  | {
      status: "waiting";
      generation: number;
      leaseExpiresAt: number;
    }
  | {
      status: "leader";
      generation: number;
      leaseExpiresAt: number;
      leaseTakeover: boolean;
      lifetime: {
        absoluteExpiresAt: number;
        idleExpiresAt: number;
        lastUsedAt: number;
      };
    } {
  if (finitePositiveInteger(row.revokedAt) !== null) {
    return { status: "terminal_failure", reason: "auth_session_revoked" };
  }
  const lifetime = resolveAuthSessionLifetime(row, args.nowMs);
  if (!lifetime.ok) {
    return { status: "terminal_failure", reason: lifetime.reason };
  }

  const generation = normalizeAuthSessionRefreshGeneration(
    row.refreshGeneration,
  );
  const currentLeaseId = String(row.refreshLeaseId ?? "").trim();
  const currentLeaseExpiresAt =
    finitePositiveInteger(row.refreshLeaseExpiresAt) ?? 0;
  if (
    currentLeaseId &&
    currentLeaseId !== args.leaseId &&
    currentLeaseExpiresAt > args.nowMs
  ) {
    return {
      status: "waiting",
      generation,
      leaseExpiresAt: currentLeaseExpiresAt,
    };
  }

  return {
    status: "leader",
    generation,
    leaseExpiresAt: args.nowMs + AUTH_SESSION_REFRESH_LEASE_MS,
    leaseTakeover: Boolean(currentLeaseId && currentLeaseExpiresAt <= args.nowMs),
    lifetime,
  };
}

export function authSessionRefreshFinalizerOwnsLease(
  row: SessionLifecycleRow,
  args: { leaseId: string; expectedGeneration: number },
): boolean {
  return (
    finitePositiveInteger(row.revokedAt) === null &&
    String(row.refreshLeaseId ?? "").trim() === args.leaseId &&
    normalizeAuthSessionRefreshGeneration(row.refreshGeneration) ===
      normalizeAuthSessionRefreshGeneration(args.expectedGeneration)
  );
}

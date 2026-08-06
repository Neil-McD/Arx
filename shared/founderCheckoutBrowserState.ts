const PENDING_FOUNDER_CHECKOUT_STORAGE_KEY = "polynet_pending_founder_checkout_v1";
const PENDING_FOUNDER_CHECKOUT_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const FOUNDER_CHECKOUT_START_LOCK_NAME = "polynet_founder_checkout_start_v1";

export type PendingFounderCheckout = {
  v: 1;
  checkout_attempt_id: string | null;
  claim_token: string | null;
  session_id: string | null;
  created_at_ms: number;
  expires_at_ms: number;
};

export type FounderCheckoutReturn = {
  kind: "success" | "recover" | "canceled";
  session_id: string | null;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function normalizeOpaqueValue(value: unknown, maxLength: number): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.length > maxLength) return null;
  return normalized;
}

function resolveBrowserStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function normalizePendingFounderCheckout(
  value: unknown,
  nowMs = Date.now(),
): PendingFounderCheckout | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const createdAtMs = Number(row.created_at_ms ?? 0);
  const expiresAtMs = Number(row.expires_at_ms ?? 0);
  if (
    row.v !== 1 ||
    !Number.isFinite(createdAtMs) ||
    !Number.isFinite(expiresAtMs) ||
    createdAtMs <= 0 ||
    expiresAtMs <= nowMs ||
    expiresAtMs - createdAtMs > PENDING_FOUNDER_CHECKOUT_TTL_MS
  ) return null;

  const checkoutAttemptId = normalizeOpaqueValue(row.checkout_attempt_id, 200);
  const claimToken = normalizeOpaqueValue(row.claim_token, 300);
  const sessionId = normalizeOpaqueValue(row.session_id, 300);
  if ((!checkoutAttemptId || !claimToken) && !sessionId) return null;

  return {
    v: 1,
    checkout_attempt_id: checkoutAttemptId,
    claim_token: claimToken,
    session_id: sessionId,
    created_at_ms: createdAtMs,
    expires_at_ms: expiresAtMs,
  };
}

export function createPendingFounderCheckout(params?: {
  nowMs?: number;
  checkoutAttemptId?: string;
  claimToken?: string;
}): PendingFounderCheckout {
  const nowMs = params?.nowMs ?? Date.now();
  const randomValue = (): string => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `${nowMs.toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  };
  return {
    v: 1,
    checkout_attempt_id: normalizeOpaqueValue(params?.checkoutAttemptId ?? randomValue(), 200),
    claim_token: normalizeOpaqueValue(params?.claimToken ?? randomValue(), 300),
    session_id: null,
    created_at_ms: nowMs,
    expires_at_ms: nowMs + PENDING_FOUNDER_CHECKOUT_TTL_MS,
  };
}

export function resolveFounderCheckoutStartReceipt(
  existing: PendingFounderCheckout | null,
  params?: Parameters<typeof createPendingFounderCheckout>[0],
): PendingFounderCheckout | null {
  if (existing) {
    return existing.checkout_attempt_id && existing.claim_token ? existing : null;
  }
  return createPendingFounderCheckout(params);
}

export function readPendingFounderCheckout(
  nowMs = Date.now(),
  storage: StorageLike | null = resolveBrowserStorage(),
): PendingFounderCheckout | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(PENDING_FOUNDER_CHECKOUT_STORAGE_KEY);
    if (!raw) return null;
    const normalized = normalizePendingFounderCheckout(JSON.parse(raw), nowMs);
    if (normalized) return normalized;
    storage.removeItem(PENDING_FOUNDER_CHECKOUT_STORAGE_KEY);
    return null;
  } catch {
    try {
      storage.removeItem(PENDING_FOUNDER_CHECKOUT_STORAGE_KEY);
    } catch {
      // Ignore unavailable browser storage.
    }
    return null;
  }
}

export function storePendingFounderCheckout(
  value: PendingFounderCheckout,
  storage: StorageLike | null = resolveBrowserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(PENDING_FOUNDER_CHECKOUT_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Browser storage is a convenience receipt, never payment authority.
  }
}

export function clearPendingFounderCheckout(
  storage: StorageLike | null = resolveBrowserStorage(),
): void {
  if (!storage) return;
  try {
    storage.removeItem(PENDING_FOUNDER_CHECKOUT_STORAGE_KEY);
  } catch {
    // Ignore unavailable browser storage.
  }
}

export function pendingFounderCheckoutMatchesSession(
  pending: PendingFounderCheckout | null,
  sessionId: string | null,
): boolean {
  const normalizedSessionId = normalizeOpaqueValue(sessionId, 300);
  return Boolean(
    pending?.session_id &&
    normalizedSessionId &&
    pending.session_id === normalizedSessionId,
  );
}

export async function runWithFounderCheckoutStartLock<T>(
  task: () => Promise<T>,
): Promise<T> {
  const lockManager = typeof navigator === "undefined"
    ? null
    : (navigator as Navigator & {
        locks?: {
          request: <Result>(name: string, callback: () => Promise<Result>) => Promise<Result>;
        };
      }).locks;
  if (!lockManager?.request) return await task();
  return await lockManager.request(FOUNDER_CHECKOUT_START_LOCK_NAME, task);
}

export function attachFounderCheckoutSession(
  value: PendingFounderCheckout,
  sessionId: string,
): PendingFounderCheckout {
  const normalizedSessionId = normalizeOpaqueValue(sessionId, 300);
  if (!normalizedSessionId) throw new Error("founder_checkout_session_id_invalid");
  return { ...value, session_id: normalizedSessionId };
}

export function recoverPendingFounderCheckout(params: {
  sessionId: string;
  nowMs?: number;
}): PendingFounderCheckout {
  const nowMs = params.nowMs ?? Date.now();
  const sessionId = normalizeOpaqueValue(params.sessionId, 300);
  if (!sessionId) throw new Error("founder_checkout_session_id_invalid");
  return {
    v: 1,
    checkout_attempt_id: null,
    claim_token: null,
    session_id: sessionId,
    created_at_ms: nowMs,
    expires_at_ms: nowMs + PENDING_FOUNDER_CHECKOUT_TTL_MS,
  };
}

export function parseFounderCheckoutReturn(search: string): FounderCheckoutReturn | null {
  const params = new URLSearchParams(String(search ?? "").replace(/^\?/, ""));
  const kind = String(params.get("founder_checkout") ?? "").trim();
  if (kind !== "success" && kind !== "recover" && kind !== "canceled") return null;
  return {
    kind,
    session_id: normalizeOpaqueValue(params.get("session_id"), 300),
  };
}

export function buildFounderCheckoutReturnUrls(origin: string): {
  successUrl: string;
  cancelUrl: string;
} {
  const normalizedOrigin = new URL(origin).origin;
  return {
    successUrl: `${normalizedOrigin}/settings/billing?founder_checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${normalizedOrigin}/settings/billing?founder_checkout=canceled&session_id={CHECKOUT_SESSION_ID}`,
  };
}

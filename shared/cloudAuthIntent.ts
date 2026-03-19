import {
  normalizeCreateCommunityIntentDraft,
  type CreateCommunityIntentDraft,
} from "./createCommunityIntent";

const PENDING_AUTH_INTENT_STORAGE_KEY = "arx_pending_auth_intent_v1";
const PENDING_AUTH_INTENT_TTL_MS = 24 * 60 * 60 * 1000;
const AUTH_RETURN_TO_STORAGE_KEY = "arx_auth_return_to_v1";

export type BuilderUpgradeContext = "builder" | "create_community";
export type BuilderCheckoutTier = "builder" | "architect";

export type PendingAuthIntent =
  | {
      v: 1;
      reason: "select_model";
      return_to: string;
      created_at_ms: number;
      payload: { model_id: string };
    }
  | {
      v: 1;
      reason: "connect_provider";
      return_to: string;
      created_at_ms: number;
      payload: { provider: "chatgpt" | "openrouter" };
    }
  | {
      v: 1;
      reason: "create_community";
      return_to: string;
      created_at_ms: number;
      payload: { draft: CreateCommunityIntentDraft | null };
    }
  | {
      v: 1;
      reason: "redeem_purchase_claim";
      return_to: string;
      created_at_ms: number;
      payload: { token: string };
    }
  | {
      v: 1;
      reason: "join_public_community";
      return_to: string;
      created_at_ms: number;
      payload: { community_id: string | null; community_slug: string | null; brandos_aid: string | null };
    }
  | {
      v: 1;
      reason: "start_builder_checkout";
      return_to: string;
      created_at_ms: number;
      payload: { tier: BuilderCheckoutTier; context: BuilderUpgradeContext };
    }
  | {
      v: 1;
      reason: "redeem_pending_purchases";
      return_to: string;
      created_at_ms: number;
      payload: { navigate: boolean; silent_noop: boolean };
    };

export type PendingAuthIntentInput = PendingAuthIntent extends infer T
  ? T extends { v: 1; return_to: string; created_at_ms: number }
    ? Omit<T, "v" | "return_to" | "created_at_ms">
    : never
  : never;

function normalizePendingAuthIntent(
  reasonRaw: unknown,
  payloadRaw: unknown,
  returnToRaw: unknown,
  createdAtMsRaw: unknown,
): PendingAuthIntent | null {
  if (typeof reasonRaw !== "string") return null;
  if (typeof returnToRaw !== "string") return null;
  if (typeof createdAtMsRaw !== "number" || !Number.isFinite(createdAtMsRaw)) return null;
  if (!payloadRaw || typeof payloadRaw !== "object") return null;

  const reason = reasonRaw;
  const payload = payloadRaw as Record<string, unknown>;
  const return_to = returnToRaw;
  const created_at_ms = createdAtMsRaw;

  if (reason === "select_model") {
    const model_id = typeof payload.model_id === "string" ? payload.model_id.trim() : "";
    if (!model_id) return null;
    return { v: 1, reason, return_to, created_at_ms, payload: { model_id } };
  }

  if (reason === "connect_provider") {
    const provider = payload.provider;
    if (provider !== "chatgpt" && provider !== "openrouter") return null;
    return { v: 1, reason, return_to, created_at_ms, payload: { provider } };
  }

  if (reason === "create_community") {
    const draft = payload.draft === null || payload.draft === undefined
      ? null
      : normalizeCreateCommunityIntentDraft(payload.draft);
    if (payload.draft !== null && payload.draft !== undefined && !draft) return null;
    return { v: 1, reason, return_to, created_at_ms, payload: { draft } };
  }

  if (reason === "redeem_purchase_claim") {
    const token = typeof payload.token === "string" ? payload.token.trim() : "";
    if (!token) return null;
    return { v: 1, reason, return_to, created_at_ms, payload: { token } };
  }

  if (reason === "join_public_community") {
    const community_id = typeof payload.community_id === "string" ? payload.community_id.trim() || null : null;
    const community_slug = typeof payload.community_slug === "string" ? payload.community_slug.trim() || null : null;
    const brandos_aid = typeof payload.brandos_aid === "string" ? payload.brandos_aid.trim() || null : null;
    if (!community_id && !community_slug) return null;
    return { v: 1, reason, return_to, created_at_ms, payload: { community_id, community_slug, brandos_aid } };
  }

  if (reason === "start_builder_checkout") {
    const rawTier = payload.tier;
    const context = payload.context;
    const tier =
      rawTier === "builder"
        ? "builder"
        : rawTier === "architect" || rawTier === "pro"
          ? "architect"
          : null;
    if (!tier) return null;
    if (context !== "builder" && context !== "create_community") return null;
    return { v: 1, reason, return_to, created_at_ms, payload: { tier, context } };
  }

  if (reason === "redeem_pending_purchases") {
    const navigate = payload.navigate;
    const silent_noop = payload.silent_noop;
    if (typeof navigate !== "boolean") return null;
    if (typeof silent_noop !== "boolean") return null;
    return { v: 1, reason, return_to, created_at_ms, payload: { navigate, silent_noop } };
  }

  return null;
}

export function parsePendingAuthIntentInput(input: unknown): PendingAuthIntentInput | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const normalized = normalizePendingAuthIntent(record.reason, record.payload, "/", Date.now());
  if (!normalized) return null;
  return { reason: normalized.reason, payload: normalized.payload } as PendingAuthIntentInput;
}

export function readPendingAuthIntent(nowMs = Date.now()): PendingAuthIntent | null {
  try {
    const raw = localStorage.getItem(PENDING_AUTH_INTENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== "object") return null;
    const createdAtMsRaw = parsed.created_at_ms;
    if (typeof createdAtMsRaw !== "number" || !Number.isFinite(createdAtMsRaw)) return null;
    if (nowMs - createdAtMsRaw > PENDING_AUTH_INTENT_TTL_MS) {
      localStorage.removeItem(PENDING_AUTH_INTENT_STORAGE_KEY);
      return null;
    }
    return normalizePendingAuthIntent(parsed.reason, parsed.payload, parsed.return_to, createdAtMsRaw);
  } catch {
    return null;
  }
}

export function buildPendingAuthIntent(input: PendingAuthIntentInput, returnTo: string, nowMs = Date.now()): PendingAuthIntent {
  const normalized = normalizePendingAuthIntent(input.reason, input.payload, returnTo, nowMs);
  if (!normalized) {
    throw new Error("invalid_pending_auth_intent_input");
  }
  return normalized;
}

export function storePendingAuthIntent(intent: PendingAuthIntent): void {
  try {
    localStorage.setItem(PENDING_AUTH_INTENT_STORAGE_KEY, JSON.stringify(intent));
  } catch {
    // ignore
  }
}

export function clearPendingAuthIntent(): void {
  try {
    localStorage.removeItem(PENDING_AUTH_INTENT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function storeAuthReturnTo(returnTo: string, nowMs = Date.now()): void {
  const trimmed = returnTo.trim();
  if (!trimmed) return;
  try {
    localStorage.setItem(
      AUTH_RETURN_TO_STORAGE_KEY,
      JSON.stringify({ v: 1, return_to: trimmed, created_at_ms: nowMs }),
    );
  } catch {
    // ignore
  }
}

export function clearAuthReturnTo(): void {
  try {
    localStorage.removeItem(AUTH_RETURN_TO_STORAGE_KEY);
  } catch {
    // ignore
  }
}

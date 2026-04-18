import {
  normalizeCreateCommunityIntentDraft,
  type CreateCommunityIntentDraft,
} from "./createCommunityIntent";

const AUTH_RESUME_STATE_STORAGE_KEY = "arx_auth_resume_state_v1";
const AUTH_RESUME_STATE_TTL_MS = 24 * 60 * 60 * 1000;

export type BuilderUpgradeContext = "builder" | "create_community";
export type BuilderCheckoutTier = "builder";

export type PendingAuthIntent =
  | {
      reason: "select_model";
      payload: { model_id: string };
    }
  | {
      reason: "connect_provider";
      payload: { provider: "chatgpt" | "openrouter" };
    }
  | {
      reason: "create_community";
      payload: { draft: CreateCommunityIntentDraft | null };
    }
  | {
      reason: "redeem_purchase_claim";
      payload: { token: string };
    }
  | {
      reason: "join_public_community";
      payload: { community_id: string | null; community_slug: string | null };
    }
  | {
      reason: "start_builder_checkout";
      payload: { tier: BuilderCheckoutTier; context: BuilderUpgradeContext };
    }
  | {
      reason: "redeem_pending_purchases";
      payload: { navigate: boolean; silent_noop: boolean };
    };

export type PendingAuthIntentInput = PendingAuthIntent;

export type AuthResumeState = {
  v: 1;
  created_at_ms: number;
  return_to: string;
  intent: PendingAuthIntent | null;
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizePendingAuthIntent(
  reasonRaw: unknown,
  payloadRaw: unknown,
): PendingAuthIntent | null {
  if (typeof reasonRaw !== "string") return null;
  if (!payloadRaw || typeof payloadRaw !== "object") return null;

  const reason = reasonRaw;
  const payload = payloadRaw as Record<string, unknown>;

  if (reason === "select_model") {
    const model_id = typeof payload.model_id === "string" ? payload.model_id.trim() : "";
    if (!model_id) return null;
    return { reason, payload: { model_id } };
  }

  if (reason === "connect_provider") {
    const provider = payload.provider;
    if (provider !== "chatgpt" && provider !== "openrouter") return null;
    return { reason, payload: { provider } };
  }

  if (reason === "create_community") {
    const draft =
      payload.draft === null || payload.draft === undefined
        ? null
        : normalizeCreateCommunityIntentDraft(payload.draft);
    if (payload.draft !== null && payload.draft !== undefined && !draft) return null;
    return { reason, payload: { draft } };
  }

  if (reason === "redeem_purchase_claim") {
    const token = typeof payload.token === "string" ? payload.token.trim() : "";
    if (!token) return null;
    return { reason, payload: { token } };
  }

  if (reason === "join_public_community") {
    const community_id = typeof payload.community_id === "string" ? payload.community_id.trim() || null : null;
    const community_slug = typeof payload.community_slug === "string" ? payload.community_slug.trim() || null : null;
    if (!community_id && !community_slug) return null;
    return { reason, payload: { community_id, community_slug } };
  }

  if (reason === "start_builder_checkout") {
    const rawTier = payload.tier;
    const context = payload.context;
    const tier = rawTier === "builder" || rawTier === "architect" || rawTier === "pro" ? "builder" : null;
    if (!tier) return null;
    if (context !== "builder" && context !== "create_community") return null;
    return { reason, payload: { tier, context } };
  }

  if (reason === "redeem_pending_purchases") {
    const navigate = payload.navigate;
    const silent_noop = payload.silent_noop;
    if (typeof navigate !== "boolean") return null;
    if (typeof silent_noop !== "boolean") return null;
    return { reason, payload: { navigate, silent_noop } };
  }

  return null;
}

function normalizeAuthResumeState(value: unknown, nowMs = Date.now()): AuthResumeState | null {
  const record = asObject(value);
  if (!record) return null;
  const createdAtMs = Number(record.created_at_ms ?? 0);
  if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) return null;
  if (nowMs - createdAtMs > AUTH_RESUME_STATE_TTL_MS) return null;

  const returnTo = typeof record.return_to === "string" ? record.return_to.trim() : "";
  if (!returnTo) return null;

  const intentRecord = asObject(record.intent);
  const intent = intentRecord ? normalizePendingAuthIntent(intentRecord.reason, intentRecord.payload) : null;

  return {
    v: 1,
    created_at_ms: createdAtMs,
    return_to: returnTo,
    intent,
  };
}

export function parsePendingAuthIntentInput(input: unknown): PendingAuthIntentInput | null {
  const record = asObject(input);
  if (!record) return null;
  return normalizePendingAuthIntent(record.reason, record.payload);
}

export function readAuthResumeState(nowMs = Date.now()): AuthResumeState | null {
  try {
    const raw = localStorage.getItem(AUTH_RESUME_STATE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    const normalized = normalizeAuthResumeState(parsed, nowMs);
    if (normalized) return normalized;
    localStorage.removeItem(AUTH_RESUME_STATE_STORAGE_KEY);
    return null;
  } catch {
    return null;
  }
}

export function storeAuthResumeState(
  params: {
    returnTo: string;
    intent?: PendingAuthIntentInput | PendingAuthIntent | null;
  },
  nowMs = Date.now(),
): void {
  const returnTo = params.returnTo.trim();
  if (!returnTo) return;
  const existing = readAuthResumeState(nowMs);
  const intent =
    params.intent === undefined
      ? existing?.intent ?? null
      : params.intent === null
        ? null
        : normalizePendingAuthIntent(params.intent.reason, params.intent.payload);
  try {
    localStorage.setItem(
      AUTH_RESUME_STATE_STORAGE_KEY,
      JSON.stringify({
        v: 1,
        created_at_ms: nowMs,
        return_to: returnTo,
        intent,
      } satisfies AuthResumeState),
    );
  } catch {
    // ignore
  }
}

export function clearAuthResumeState(): void {
  try {
    localStorage.removeItem(AUTH_RESUME_STATE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

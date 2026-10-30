import { readCommunityReferral } from "./communityReferralCapture";
import { bootstrapConvexAuthenticatedClient, type ConvexClient } from "./convexAuthenticatedClient";

const PENDING_PURCHASE_CLAIM_TOKEN_KEY = "arx_pending_purchase_claim_token";
const PENDING_PUBLIC_JOIN_COMMUNITY_ID_KEY = "arx_pending_public_join_community_id";
const PENDING_PUBLIC_JOIN_COMMUNITY_SLUG_KEY = "arx_pending_public_join_community_slug";
const PENDING_PURCHASE_CLAIM_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;

type PendingPurchaseClaimTokenStorageV1 = {
  v: 1;
  token: string;
  stored_at: number;
  expires_at: number;
};

function isUuid(value: string): boolean {
  return /^[0-9a-fA-F-]{36}$/.test(value);
}

function safeLocalStorageGet(key: string): string {
  try {
    return (localStorage.getItem(key) ?? "").trim();
  } catch {
    return "";
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function safeLocalStorageRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function storePendingPurchaseClaimToken(token: string): void {
  const trimmed = token.trim();
  if (!trimmed) return;
  const nowMs = Date.now();
  const record: PendingPurchaseClaimTokenStorageV1 = {
    v: 1,
    token: trimmed,
    stored_at: nowMs,
    expires_at: nowMs + PENDING_PURCHASE_CLAIM_TOKEN_TTL_MS,
  };
  safeLocalStorageSet(PENDING_PURCHASE_CLAIM_TOKEN_KEY, JSON.stringify(record));
}

export function readPendingPurchaseClaimToken(): string {
  const raw = safeLocalStorageGet(PENDING_PURCHASE_CLAIM_TOKEN_KEY);
  if (!raw) return "";
  const nowMs = Date.now();
  try {
    const parsed = JSON.parse(raw) as Partial<PendingPurchaseClaimTokenStorageV1> | null;
    const token = typeof parsed?.token === "string" ? parsed.token.trim() : "";
    const expiresAt = Number(parsed?.expires_at ?? 0);
    if (!token || !Number.isFinite(expiresAt) || expiresAt <= nowMs) {
      clearPendingPurchaseClaimToken();
      return "";
    }
    return token;
  } catch {
    // Legacy raw-token storage: preserve one in-flight purchase and migrate it to TTL storage.
    const token = raw.trim();
    if (!token) return "";
    storePendingPurchaseClaimToken(token);
    return token;
  }
}

export function clearPendingPurchaseClaimToken(): void {
  safeLocalStorageRemove(PENDING_PURCHASE_CLAIM_TOKEN_KEY);
}

export function storePendingPublicJoin(communityId: string): void {
  const trimmed = communityId.trim();
  if (trimmed) {
    if (isUuid(trimmed)) {
      safeLocalStorageSet(PENDING_PUBLIC_JOIN_COMMUNITY_ID_KEY, trimmed);
      safeLocalStorageRemove(PENDING_PUBLIC_JOIN_COMMUNITY_SLUG_KEY);
    } else {
      safeLocalStorageSet(PENDING_PUBLIC_JOIN_COMMUNITY_SLUG_KEY, trimmed.toLowerCase());
      safeLocalStorageRemove(PENDING_PUBLIC_JOIN_COMMUNITY_ID_KEY);
    }
  }
}

export function readPendingPublicJoinCommunityId(): string {
  return safeLocalStorageGet(PENDING_PUBLIC_JOIN_COMMUNITY_ID_KEY);
}

export function readPendingPublicJoinCommunitySlug(): string {
  return safeLocalStorageGet(PENDING_PUBLIC_JOIN_COMMUNITY_SLUG_KEY);
}

export function clearPendingPublicJoin(): void {
  safeLocalStorageRemove(PENDING_PUBLIC_JOIN_COMMUNITY_ID_KEY);
  safeLocalStorageRemove(PENDING_PUBLIC_JOIN_COMMUNITY_SLUG_KEY);
}

export type PendingPurchaseClaim = {
  community_id: string;
  community_slug: string;
  community_name: string;
  expires_at: string;
};

export type SessionLike = {
  access_token: string;
};

async function bootstrapConvexUserForPayFirst(sessionRaw: unknown): Promise<{
  client: ConvexClient;
  authSubject: string;
}> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(sessionRaw);
  return { client, authSubject };
}

function normalizeErrorToken(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function collectStructuredErrorFields(error: unknown, collect: (value: unknown) => void): void {
  if (!error || typeof error !== "object") return;
  const record = error as Record<string, unknown>;
  collect(record.code);
  collect(record.message);
  collect(record.details);
  collect(record.hint);
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export type PublicCommunityJoinErrorKind =
  | "paid_plan_required"
  | "approval_pending"
  | "approval_denied"
  | "authentication_required"
  | "community_not_found"
  | "forbidden"
  | null;

export function classifyPublicCommunityJoinError(error: unknown): PublicCommunityJoinErrorKind {
  const values: string[] = [];
  const collect = (value: unknown) => {
    const normalized = normalizeErrorToken(value);
    if (normalized) values.push(normalized);
  };

  collectStructuredErrorFields(error, collect);
  if (error instanceof Error) {
    collect(error.message);
  } else if (!error || typeof error !== "object") {
    collect(error);
  }

  const has = (token: string): boolean =>
    values.some((value) => value === token || value.includes(token));

  if (has("paid_plan_required")) return "paid_plan_required";
  if (has("approval_pending")) return "approval_pending";
  if (has("approval_denied")) return "approval_denied";
  if (has("approval_required")) return "approval_pending";
  if (has("community_not_found") || has("community not found")) return "community_not_found";
  if (has("forbidden") || has("42501")) return "forbidden";
  if (has("authentication required") || has("28000")) return "authentication_required";

  return null;
}

export async function redeemPurchaseClaimRpc<S extends SessionLike>(opts: {
  session: S;
  token: string;
}): Promise<{ community_id: string; community_slug: string | null }> {
  const { client, authSubject } = await bootstrapConvexUserForPayFirst(opts.session);
  const rows =
    ((await client.mutation("communityCommerce:redeemPurchaseClaim" as any, {
      authSubject,
      token: opts.token,
    })) as Array<{ community_id?: string; community_slug?: string | null }> | null) ?? [];
  const claim = rows[0] ?? null;
  const communityId = claim?.community_id;
  if (!communityId) throw new Error("Redeem succeeded but community missing.");
  return {
    community_id: communityId,
    community_slug: typeof claim?.community_slug === "string" ? claim.community_slug : null,
  };
}

export async function listPendingPurchaseClaimsRpc<S extends SessionLike>(opts: {
  session: S;
}): Promise<PendingPurchaseClaim[]> {
  const { client, authSubject } = await bootstrapConvexUserForPayFirst(opts.session);
  const rows = (await client.query("communityCommerce:listPendingPurchaseClaims" as any, {
    authSubject,
  })) as PendingPurchaseClaim[] | null;
  return Array.isArray(rows) ? rows : [];
}

export async function redeemPendingPurchaseClaimsRpc<S extends SessionLike>(opts: {
  session: S;
}): Promise<Array<{ community_id: string; community_slug: string | null }>> {
  const { client, authSubject } = await bootstrapConvexUserForPayFirst(opts.session);
  const rows = (await client.mutation("communityCommerce:redeemPendingPurchaseClaims" as any, {
    authSubject,
  })) as Array<{ community_id: string; community_slug?: string | null }> | null;
  return Array.isArray(rows)
    ? rows.map((row) => ({
        community_id: row.community_id,
        community_slug: row.community_slug ?? null,
      }))
    : [];
}

export async function joinPublicCommunityRpc<S extends SessionLike>(opts: {
  session: S;
  communityId?: string;
  communitySlug?: string;
}): Promise<{
  outcome: "joined" | "approval_pending" | "approval_denied" | "paid_plan_required";
  community_id: string;
  reapply_at?: string | null;
}> {
  const { client } = await bootstrapConvexUserForPayFirst(opts.session);
  const slug = (opts.communitySlug ?? "").trim();
  const id = (opts.communityId ?? "").trim();
  let result:
    | {
        outcome: "joined" | "approval_pending" | "approval_denied" | "paid_plan_required";
        community_id: string;
        reapply_at?: string | null;
      }
    | null = null;
  if (slug) {
    const ref = readCommunityReferral(slug);
    result = ((await client.mutation("communityPublic:joinPublicCommunityBySlug" as any, {
      communitySlug: slug,
      ...(ref ? { ref } : {}),
    })) as {
      outcome: "joined" | "approval_pending" | "approval_denied" | "paid_plan_required";
      community_id: string;
      reapply_at?: string | null;
    } | null) ?? null;
  } else if (id) {
    result = ((await client.mutation("communityPublic:joinPublicCommunity" as any, {
      communityId: id,
    })) as {
      outcome: "joined" | "approval_pending" | "approval_denied" | "paid_plan_required";
      community_id: string;
      reapply_at?: string | null;
    } | null) ?? null;
  } else {
    throw new Error("Missing community");
  }
  return result ?? {
    outcome: "joined",
    community_id: id,
  };
}

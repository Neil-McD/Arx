export const PENDING_PURCHASE_CLAIM_TOKEN_KEY = "arx_pending_purchase_claim_token";
export const PENDING_PUBLIC_JOIN_COMMUNITY_ID_KEY = "arx_pending_public_join_community_id";
export const PENDING_PUBLIC_JOIN_BRANDOS_AID_KEY = "arx_pending_public_join_brandos_aid";
export const BRANDOS_AID_LAST_KEY = "arx_brandos_aid_last";
export const BRANDOS_AID_SLUG_PREFIX = "arx_brandos_aid_slug:";

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
  safeLocalStorageSet(PENDING_PURCHASE_CLAIM_TOKEN_KEY, trimmed);
}

export function readPendingPurchaseClaimToken(): string {
  return safeLocalStorageGet(PENDING_PURCHASE_CLAIM_TOKEN_KEY);
}

export function clearPendingPurchaseClaimToken(): void {
  safeLocalStorageRemove(PENDING_PURCHASE_CLAIM_TOKEN_KEY);
}

export function storePendingPublicJoin(communityId: string, brandosAid?: string | null): void {
  const trimmed = communityId.trim();
  if (trimmed) safeLocalStorageSet(PENDING_PUBLIC_JOIN_COMMUNITY_ID_KEY, trimmed);
  const aid = (brandosAid ?? "").trim();
  if (aid) safeLocalStorageSet(PENDING_PUBLIC_JOIN_BRANDOS_AID_KEY, aid);
}

export function readPendingPublicJoinCommunityId(): string {
  return safeLocalStorageGet(PENDING_PUBLIC_JOIN_COMMUNITY_ID_KEY);
}

export function readPendingPublicJoinBrandosAid(): string {
  return safeLocalStorageGet(PENDING_PUBLIC_JOIN_BRANDOS_AID_KEY);
}

export function clearPendingPublicJoin(): void {
  safeLocalStorageRemove(PENDING_PUBLIC_JOIN_COMMUNITY_ID_KEY);
  safeLocalStorageRemove(PENDING_PUBLIC_JOIN_BRANDOS_AID_KEY);
}

export function captureBrandosAidFromLocation(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = (params.get("bid") ?? params.get("brandos_aid") ?? params.get("aid") ?? "").trim();
    if (!raw || !isUuid(raw)) return;

    safeLocalStorageSet(BRANDOS_AID_LAST_KEY, raw);

    const path = window.location.pathname || "/";
    if (path.startsWith("/c/")) {
      const slug = decodeURIComponent(path.slice(3).split("/")[0] ?? "").trim();
      if (slug) safeLocalStorageSet(`${BRANDOS_AID_SLUG_PREFIX}${slug}`, raw);
    }
  } catch {
    // ignore
  }
}

export function getBrandosAidForCommunitySlug(slug: string | null): string | null {
  try {
    if (slug) {
      const scoped = safeLocalStorageGet(`${BRANDOS_AID_SLUG_PREFIX}${slug}`);
      if (scoped && isUuid(scoped)) return scoped;
      return null;
    }
    const last = safeLocalStorageGet(BRANDOS_AID_LAST_KEY);
    if (last && isUuid(last)) return last;
  } catch {
    // ignore
  }
  return null;
}

export type PendingPurchaseClaim = {
  community_id: string;
  community_slug: string;
  community_name: string;
  expires_at: string;
};

export type SupabaseSessionLike = {
  access_token: string;
};

export type FetchWithSupabaseAuth<S extends SupabaseSessionLike> = (
  url: string,
  init: RequestInit,
  session: S,
) => Promise<Response>;

export type ReadSupabaseError = (response: Response) => Promise<string>;

export async function redeemPurchaseClaimRpc<S extends SupabaseSessionLike>(opts: {
  url: string;
  session: S;
  token: string;
  fetchWithSupabaseAuth: FetchWithSupabaseAuth<S>;
  readSupabaseError: ReadSupabaseError;
}): Promise<string> {
  const response = await opts.fetchWithSupabaseAuth(
    `${opts.url}/rest/v1/rpc/redeem_purchase_claim`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ p_token: opts.token }),
    },
    opts.session,
  );
  if (!response.ok) throw new Error(await opts.readSupabaseError(response));
  const rows = (await response.json()) as Array<{ community_id: string }>;
  const communityId = rows[0]?.community_id;
  if (!communityId) throw new Error("Redeem succeeded but community missing.");
  return communityId;
}

export async function listPendingPurchaseClaimsRpc<S extends SupabaseSessionLike>(opts: {
  url: string;
  session: S;
  fetchWithSupabaseAuth: FetchWithSupabaseAuth<S>;
  readSupabaseError: ReadSupabaseError;
}): Promise<PendingPurchaseClaim[]> {
  const response = await opts.fetchWithSupabaseAuth(
    `${opts.url}/rest/v1/rpc/list_pending_purchase_claims`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    },
    opts.session,
  );
  if (!response.ok) throw new Error(await opts.readSupabaseError(response));
  const rows = (await response.json()) as PendingPurchaseClaim[];
  return Array.isArray(rows) ? rows : [];
}

export async function redeemPendingPurchaseClaimsRpc<S extends SupabaseSessionLike>(opts: {
  url: string;
  session: S;
  fetchWithSupabaseAuth: FetchWithSupabaseAuth<S>;
  readSupabaseError: ReadSupabaseError;
}): Promise<Array<{ community_id: string }>> {
  const response = await opts.fetchWithSupabaseAuth(
    `${opts.url}/rest/v1/rpc/redeem_pending_purchase_claims`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    },
    opts.session,
  );
  if (!response.ok) throw new Error(await opts.readSupabaseError(response));
  const rows = (await response.json()) as Array<{ community_id: string }>;
  return Array.isArray(rows) ? rows : [];
}

export async function joinPublicCommunityRpc<S extends SupabaseSessionLike>(opts: {
  url: string;
  session: S;
  communityId: string;
  brandosAid?: string | null;
  fetchWithSupabaseAuth: FetchWithSupabaseAuth<S>;
  readSupabaseError: ReadSupabaseError;
}): Promise<string> {
  const body: Record<string, unknown> = { p_community_id: opts.communityId };
  const aid = (opts.brandosAid ?? "").trim();
  if (aid) body.p_brandos_aid = aid;

  const response = await opts.fetchWithSupabaseAuth(
    `${opts.url}/rest/v1/rpc/join_public_community`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    opts.session,
  );
  if (!response.ok) throw new Error(await opts.readSupabaseError(response));
  const rows = (await response.json()) as Array<{ community_id: string }>;
  return rows[0]?.community_id ?? opts.communityId;
}


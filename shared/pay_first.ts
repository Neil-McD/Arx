const PENDING_PURCHASE_CLAIM_TOKEN_KEY = "arx_pending_purchase_claim_token";
const PENDING_PUBLIC_JOIN_COMMUNITY_ID_KEY = "arx_pending_public_join_community_id";
const PENDING_PUBLIC_JOIN_COMMUNITY_SLUG_KEY = "arx_pending_public_join_community_slug";
const PENDING_PUBLIC_JOIN_BRANDOS_AID_KEY = "arx_pending_public_join_brandos_aid";
const BRANDOS_AID_LAST_KEY = "arx_brandos_aid_last";
const BRANDOS_AID_SLUG_PREFIX = "arx_brandos_aid_slug:";

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
  if (trimmed) {
    if (isUuid(trimmed)) {
      safeLocalStorageSet(PENDING_PUBLIC_JOIN_COMMUNITY_ID_KEY, trimmed);
      safeLocalStorageRemove(PENDING_PUBLIC_JOIN_COMMUNITY_SLUG_KEY);
    } else {
      safeLocalStorageSet(PENDING_PUBLIC_JOIN_COMMUNITY_SLUG_KEY, trimmed.toLowerCase());
      safeLocalStorageRemove(PENDING_PUBLIC_JOIN_COMMUNITY_ID_KEY);
    }
  }
  const aid = (brandosAid ?? "").trim();
  if (aid) safeLocalStorageSet(PENDING_PUBLIC_JOIN_BRANDOS_AID_KEY, aid);
}

export function readPendingPublicJoinCommunityId(): string {
  return safeLocalStorageGet(PENDING_PUBLIC_JOIN_COMMUNITY_ID_KEY);
}

export function readPendingPublicJoinCommunitySlug(): string {
  return safeLocalStorageGet(PENDING_PUBLIC_JOIN_COMMUNITY_SLUG_KEY);
}

export function readPendingPublicJoinBrandosAid(): string {
  return safeLocalStorageGet(PENDING_PUBLIC_JOIN_BRANDOS_AID_KEY);
}

export function clearPendingPublicJoin(): void {
  safeLocalStorageRemove(PENDING_PUBLIC_JOIN_COMMUNITY_ID_KEY);
  safeLocalStorageRemove(PENDING_PUBLIC_JOIN_COMMUNITY_SLUG_KEY);
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

type SupabaseErrorBody = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  error?: unknown;
  error_description?: unknown;
};

type ParsedSupabaseError = {
  status: number;
  code: string | null;
  message: string | null;
  details: string | null;
  hint: string | null;
};

function normalizeErrorToken(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

async function parseSupabaseErrorResponse(response: Response): Promise<ParsedSupabaseError> {
  const fallback: ParsedSupabaseError = {
    status: response.status,
    code: null,
    message: null,
    details: null,
    hint: null,
  };
  try {
    const json = (await response.clone().json()) as SupabaseErrorBody;
    return {
      status: response.status,
      code: readNonEmptyString(json?.code),
      message:
        readNonEmptyString(json?.message) ??
        readNonEmptyString(json?.error_description) ??
        readNonEmptyString(json?.error),
      details: readNonEmptyString(json?.details),
      hint: readNonEmptyString(json?.hint),
    };
  } catch {
    return fallback;
  }
}

export class SupabaseRpcError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details: string | null;
  readonly hint: string | null;

  constructor(input: {
    message: string;
    status: number;
    code: string | null;
    details: string | null;
    hint: string | null;
  }) {
    super(input.message);
    this.name = "SupabaseRpcError";
    this.status = input.status;
    this.code = input.code;
    this.details = input.details;
    this.hint = input.hint;
  }
}

function isSupabaseRpcError(error: unknown): error is SupabaseRpcError {
  return error instanceof SupabaseRpcError;
}

async function toSupabaseRpcError(response: Response, readSupabaseError: ReadSupabaseError): Promise<SupabaseRpcError> {
  const parsed = await parseSupabaseErrorResponse(response);
  let message = parsed.message;
  if (!message) {
    try {
      message = await readSupabaseError(response);
    } catch {
      message = null;
    }
  }
  if (!message) message = `Supabase error (${response.status})`;
  return new SupabaseRpcError({
    message,
    status: parsed.status,
    code: parsed.code,
    details: parsed.details,
    hint: parsed.hint,
  });
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export type PublicCommunityJoinErrorKind =
  | "paid_plan_required"
  | "approval_required"
  | "paid_communities_do_not_use_request_access"
  | "request_access_not_required"
  | "authentication_required"
  | "community_not_found"
  | "forbidden"
  | null;

export type InviteAcceptErrorKind = "invite_expired" | null;

export type AcceptCommunityInviteResult = {
  community_id: string;
  community_slug: string;
  community_name: string;
};

export function classifyInviteAcceptError(error: unknown): InviteAcceptErrorKind {
  const values: string[] = [];
  const collect = (value: unknown) => {
    const normalized = normalizeErrorToken(value);
    if (normalized) values.push(normalized);
  };

  if (isSupabaseRpcError(error)) {
    collect(error.code);
    collect(error.message);
    collect(error.details);
    collect(error.hint);
  } else if (error instanceof Error) {
    collect(error.message);
  } else {
    collect(error);
  }

  const has = (token: string): boolean =>
    values.some((value) => value === token || value.includes(token));

  if (has("invite_expired")) return "invite_expired";
  if (has("invite has expired")) return "invite_expired";
  if (has("invite expired")) return "invite_expired";
  if (has("expired invite")) return "invite_expired";

  return null;
}

export function classifyPublicCommunityJoinError(error: unknown): PublicCommunityJoinErrorKind {
  const values: string[] = [];
  const collect = (value: unknown) => {
    const normalized = normalizeErrorToken(value);
    if (normalized) values.push(normalized);
  };

  if (isSupabaseRpcError(error)) {
    collect(error.code);
    collect(error.message);
    collect(error.details);
    collect(error.hint);
  } else if (error instanceof Error) {
    collect(error.message);
  } else {
    collect(error);
  }

  const has = (token: string): boolean =>
    values.some((value) => value === token || value.includes(token));

  if (has("paid_plan_required")) return "paid_plan_required";
  if (has("approval_required")) return "approval_required";
  if (has("paid_communities_do_not_use_request_access")) return "paid_communities_do_not_use_request_access";
  if (has("request_access_not_required")) return "request_access_not_required";
  if (has("community_not_found") || has("community not found")) return "community_not_found";
  if (has("forbidden") || has("42501")) return "forbidden";
  if (has("authentication required") || has("28000")) return "authentication_required";

  return null;
}

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
  if (!response.ok) throw await toSupabaseRpcError(response, opts.readSupabaseError);
  const rows = (await response.json()) as Array<{ community_id: string }>;
  const communityId = rows[0]?.community_id;
  if (!communityId) throw new Error("Redeem succeeded but community missing.");
  return communityId;
}

export async function acceptCommunityInviteRpc<S extends SupabaseSessionLike>(opts: {
  url: string;
  session: S;
  inviteCode: string;
  fetchWithSupabaseAuth: FetchWithSupabaseAuth<S>;
  readSupabaseError: ReadSupabaseError;
}): Promise<AcceptCommunityInviteResult> {
  const inviteCode = opts.inviteCode.trim();
  if (!inviteCode) throw new Error("Invite code is required.");

  const response = await opts.fetchWithSupabaseAuth(
    `${opts.url}/rest/v1/rpc/accept_community_invite`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite_code: inviteCode }),
    },
    opts.session,
  );
  if (!response.ok) throw await toSupabaseRpcError(response, opts.readSupabaseError);

  const rows = (await response.json()) as AcceptCommunityInviteResult[];
  const first = rows[0];
  if (!first) throw new Error("Failed to join community.");
  return first;
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
  if (!response.ok) throw await toSupabaseRpcError(response, opts.readSupabaseError);
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
  if (!response.ok) throw await toSupabaseRpcError(response, opts.readSupabaseError);
  const rows = (await response.json()) as Array<{ community_id: string }>;
  return Array.isArray(rows) ? rows : [];
}

export async function joinPublicCommunityRpc<S extends SupabaseSessionLike>(opts: {
  url: string;
  session: S;
  communityId?: string;
  communitySlug?: string;
  brandosAid?: string | null;
  fetchWithSupabaseAuth: FetchWithSupabaseAuth<S>;
  readSupabaseError: ReadSupabaseError;
}): Promise<string> {
  const slug = (opts.communitySlug ?? "").trim();
  const id = (opts.communityId ?? "").trim();
  const body: Record<string, unknown> = {};
  const rpc = slug ? "join_public_community_by_slug" : "join_public_community";

  if (slug) {
    body.p_community_slug = slug;
  } else if (id) {
    body.p_community_id = id;
  } else {
    throw new Error("Missing community");
  }
  const aid = (opts.brandosAid ?? "").trim();
  if (aid) body.p_brandos_aid = aid;

  const response = await opts.fetchWithSupabaseAuth(
    `${opts.url}/rest/v1/rpc/${rpc}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    opts.session,
  );
  if (!response.ok) throw await toSupabaseRpcError(response, opts.readSupabaseError);
  const rows = (await response.json()) as Array<{ community_id: string }>;
  return rows[0]?.community_id ?? id;
}

// What a member can use, and until when. One rule decides it for the owner's
// Clients list, the member's own Membership page, the access webhook and the
// lookup API, so they can never disagree. The rule reads records Polynet
// already keeps (membership, subscription, price point) plus the owner's dated
// access grants; nothing here stores a second copy of access.
//
// A member is entitled to the community while their membership is active.
// An outside service (an access integration such as a paid MCP server) sees a
// member as entitled only while the membership is active AND it comes from a
// paid plan the integration covers, an owner grant (when the integration takes
// grants) or the community owner. Free members are never entitled outside.

export type CommunityAccessSource = "paid_subscription" | "manual_grant" | "free_grant" | "owner";
export type CommunityAccessStatus =
  | "active"
  | "past_due"
  | "cancelling"
  | "granted"
  | "free"
  | "owner"
  | "ended"
  | "none";

export type CommunityAccessPricePoint = {
  id: string;
  name: string;
  billingPeriod: string;
  amountBaseUnits: number;
  currency: string;
  currencyDecimals: number;
};

export type CommunityAccessGrantInput = {
  endsAt: number | null;
  reason: string;
  createdAt: number;
};

export type CommunityAccessIntegrationInput = {
  id: string;
  name: string;
  pricePointIds: string[];
  includeOwnerGrants: boolean;
};

export type CommunityAccessInputs = {
  nowMs: number;
  isOwner: boolean;
  communityActive: boolean;
  membership: {
    active: boolean;
    accessSource: string | null;
    activatedAt?: number | null;
    revokedAt?: number | null;
    revokedReason?: string | null;
  } | null;
  subscription: {
    status: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodEndAt?: number | null;
  } | null;
  pricePoint: CommunityAccessPricePoint | null;
  grant: CommunityAccessGrantInput | null;
  /** Test members (Workflows → Test run) never reach an outside service. */
  isTestMember?: boolean;
  integrations: CommunityAccessIntegrationInput[];
};

export type CommunityAccessPlan =
  | {
      kind: "price_point";
      id: string;
      name: string;
      billing_period: string;
      amount_base_units: number;
      currency: string;
      currency_decimals: number;
    }
  | { kind: "grant"; reason: string; ends_at: string | null; granted_at: string }
  | { kind: "free" }
  | { kind: "owner" };

export type CommunityAccessUse = {
  key: string;
  label: string;
  included: boolean;
  why: string | null;
};

export type CommunityMemberAccess = {
  entitled: boolean;
  source: CommunityAccessSource | null;
  status: CommunityAccessStatus;
  plan: CommunityAccessPlan | null;
  /** The next charge, for a paid plan that will renew. */
  renews_at: string | null;
  /** When access stops unless something changes: a cancelling plan or a dated grant. */
  ends_at: string | null;
  /** When access stopped, for a member who no longer has it. */
  ended_at: string | null;
  ended_reason: string | null;
  can_use: CommunityAccessUse[];
};

export const COMMUNITY_ACCESS_GRANT_REASON_MAX = 200;
export const COMMUNITY_ACCESS_INTEGRATION_NAME_MAX = 60;
export const COMMUNITY_ACCESS_INTEGRATION_LIMIT = 5;
export const COMMUNITY_ACCESS_WEBHOOK_URL_MAX = 500;
/** Grants end at most ten years out; "no end date" is its own choice. */
export const COMMUNITY_ACCESS_GRANT_MAX_DAYS = 3650;
const DAY_MS = 24 * 60 * 60 * 1000;

export class CommunityAccessError extends Error {
  constructor(readonly code: string, message?: string) {
    super(message ? `${code}: ${message}` : code);
  }
}

const toIso = (ms: number | null | undefined) => (typeof ms === "number" && Number.isFinite(ms) ? new Date(ms).toISOString() : null);

function normalizeSource(raw: string | null | undefined): CommunityAccessSource | null {
  const value = String(raw ?? "").trim().toLowerCase();
  return value === "paid_subscription" || value === "manual_grant" || value === "free_grant" ? value : null;
}

function subscriptionGrantsAccess(status: string): boolean {
  return status === "active" || status === "past_due" || status === "cancel_at_period_end";
}

function planFromPricePoint(pricePoint: CommunityAccessPricePoint): CommunityAccessPlan {
  return {
    kind: "price_point",
    id: pricePoint.id,
    name: pricePoint.name,
    billing_period: pricePoint.billingPeriod,
    amount_base_units: pricePoint.amountBaseUnits,
    currency: pricePoint.currency,
    currency_decimals: pricePoint.currencyDecimals,
  };
}

/** Whether one outside service should treat this member as entitled. */
export function communityIntegrationCoversAccess(
  access: Pick<CommunityMemberAccess, "entitled" | "source" | "plan">,
  integration: Pick<CommunityAccessIntegrationInput, "pricePointIds" | "includeOwnerGrants">,
  options: { isTestMember?: boolean } = {},
): boolean {
  if (!access.entitled || options.isTestMember) return false;
  if (access.source === "owner") return true;
  if (access.source === "manual_grant") return integration.includeOwnerGrants;
  if (access.source === "paid_subscription") {
    if (!integration.pricePointIds.length) return true;
    return access.plan?.kind === "price_point" && integration.pricePointIds.includes(access.plan.id);
  }
  return false;
}

export function deriveCommunityMemberAccess(input: CommunityAccessInputs): CommunityMemberAccess {
  const membership = input.membership;
  const memberActive = Boolean(membership?.active) && input.communityActive;
  let source: CommunityAccessSource | null = input.isOwner ? "owner" : normalizeSource(membership?.accessSource);
  let entitled = input.isOwner ? input.communityActive : memberActive;
  let status: CommunityAccessStatus = "none";
  let plan: CommunityAccessPlan | null = null;
  let renewsAt: number | null = null;
  let endsAt: number | null = null;
  let endedAt: number | null = null;
  let endedReason: string | null = null;

  if (input.isOwner) {
    status = entitled ? "owner" : "ended";
    plan = { kind: "owner" };
  } else if (!membership) {
    status = "none";
    source = null;
  } else if (!memberActive) {
    status = "ended";
    endedAt = membership.revokedAt ?? null;
    endedReason = input.communityActive ? membership.revokedReason ?? null : "community_archived";
    if (source === "paid_subscription" && input.pricePoint) plan = planFromPricePoint(input.pricePoint);
  } else if (source === "paid_subscription") {
    plan = input.pricePoint ? planFromPricePoint(input.pricePoint) : null;
    const sub = input.subscription;
    const subStatus = String(sub?.status ?? "active").trim().toLowerCase();
    const periodEnd = typeof sub?.currentPeriodEndAt === "number" ? sub.currentPeriodEndAt : null;
    if (sub && !subscriptionGrantsAccess(subStatus)) {
      // The lifecycle revokes the membership in the same write, so this only
      // shows between reads; it still must never read as entitled.
      entitled = false;
      status = "ended";
      endedAt = periodEnd;
    } else if (subStatus === "cancel_at_period_end" || sub?.cancelAtPeriodEnd) {
      status = "cancelling";
      endsAt = periodEnd;
    } else if (subStatus === "past_due") {
      status = "past_due";
      renewsAt = periodEnd;
    } else {
      status = "active";
      renewsAt = periodEnd;
    }
  } else if (source === "manual_grant") {
    status = "granted";
    if (input.grant) {
      plan = { kind: "grant", reason: input.grant.reason, ends_at: toIso(input.grant.endsAt), granted_at: toIso(input.grant.createdAt)! };
      endsAt = input.grant.endsAt;
      if (typeof endsAt === "number" && endsAt <= input.nowMs) {
        // The end job runs at the end date; never read as entitled after it.
        entitled = false;
        status = "ended";
        endedAt = endsAt;
        endedReason = "access_grant_ended";
        endsAt = null;
      }
    } else {
      plan = { kind: "grant", reason: "", ends_at: null, granted_at: toIso(membership.activatedAt) ?? new Date(input.nowMs).toISOString() };
    }
  } else {
    status = "free";
    plan = { kind: "free" };
  }

  const canUse: CommunityAccessUse[] = [
    { key: "community", label: "Community", included: entitled, why: entitled ? null : "No active membership" },
    { key: "courses", label: "Courses", included: entitled, why: entitled ? null : "No active membership" },
  ];
  const partial = { entitled, source, plan };
  for (const integration of input.integrations) {
    const included = communityIntegrationCoversAccess(partial, integration, { isTestMember: input.isTestMember });
    let why: string | null = null;
    if (!included) {
      why = !entitled ? "No active membership"
        : input.isTestMember ? "Test members never reach outside services"
        : source === "free_grant" ? "Free members aren't included"
        : source === "manual_grant" ? "Owner grants aren't included"
        : "Their plan isn't included";
    }
    canUse.push({ key: `integration:${integration.id}`, label: integration.name, included, why });
  }

  return {
    entitled,
    source,
    status,
    plan,
    renews_at: toIso(renewsAt),
    ends_at: toIso(endsAt),
    ended_at: toIso(endedAt),
    ended_reason: endedReason,
    can_use: canUse,
  };
}

/** The access object an outside service receives, for one integration. */
export function communityAccessForIntegration(
  access: CommunityMemberAccess,
  integration: Pick<CommunityAccessIntegrationInput, "id" | "pricePointIds" | "includeOwnerGrants">,
  options: { isTestMember?: boolean } = {},
) {
  const entitled = communityIntegrationCoversAccess(access, integration, options);
  const plan = access.plan;
  return {
    entitled,
    source: access.source,
    status: access.status,
    price_point: plan?.kind === "price_point" ? plan.id : null,
    plan_name: plan?.kind === "price_point" ? plan.name : plan?.kind === "grant" ? "Owner grant" : plan?.kind === "owner" ? "Owner" : plan?.kind === "free" ? "Free" : null,
    billing_period: plan?.kind === "price_point" ? plan.billing_period : null,
    current_period_end: access.renews_at ?? (access.status === "cancelling" ? access.ends_at : null),
    renews_at: access.renews_at,
    ends_at: access.ends_at,
    ended_at: access.ended_at,
  };
}
export type CommunityIntegrationAccess = ReturnType<typeof communityAccessForIntegration>;

/** A short line for a badge or a table cell. */
export function describeCommunityAccess(access: CommunityMemberAccess, formatDate: (iso: string) => string = (iso) => iso.slice(0, 10)): string {
  const plan = access.plan;
  switch (access.status) {
    case "owner": return "Owner";
    case "active": return plan?.kind === "price_point" ? `Paid · ${plan.name}` : "Paid";
    case "past_due": return "Payment failed · retrying";
    case "cancelling": return access.ends_at ? `Cancelling · ends ${formatDate(access.ends_at)}` : "Cancelling";
    case "granted": return access.ends_at ? `Free access until ${formatDate(access.ends_at)}` : "Free access · no end date";
    case "free": return "Free member";
    case "ended": return access.ended_at ? `Ended ${formatDate(access.ended_at)}` : "Ended";
    default: return "No access";
  }
}

export function normalizeCommunityAccessGrantReason(value: unknown): string {
  const reason = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!reason) throw new CommunityAccessError("access_grant_reason_required");
  if (reason.length > COMMUNITY_ACCESS_GRANT_REASON_MAX) throw new CommunityAccessError("access_grant_reason_too_long");
  return reason;
}

/**
 * A grant's end: null for no end date, else a future instant no more than ten
 * years out. A bare date ("2027-02-22") ends at the end of that day, UTC.
 */
export function normalizeCommunityAccessGrantEnd(value: unknown, nowMs: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  let ms: number;
  if (typeof value === "number") ms = value;
  else if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    const day = value.trim();
    ms = Date.parse(`${day}T23:59:59.999Z`);
    if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== day) throw new CommunityAccessError("access_grant_end_invalid");
  } else if (typeof value === "string") ms = Date.parse(value);
  else throw new CommunityAccessError("access_grant_end_invalid");
  if (!Number.isFinite(ms)) throw new CommunityAccessError("access_grant_end_invalid");
  if (ms <= nowMs) throw new CommunityAccessError("access_grant_end_in_past");
  if (ms > nowMs + COMMUNITY_ACCESS_GRANT_MAX_DAYS * DAY_MS) throw new CommunityAccessError("access_grant_end_too_far");
  return Math.floor(ms);
}

export function normalizeCommunityAccessIntegrationName(value: unknown): string {
  const name = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!name || name.length > COMMUNITY_ACCESS_INTEGRATION_NAME_MAX) throw new CommunityAccessError("access_integration_name_invalid");
  return name;
}

function isLoopbackOrPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1" || host === "0.0.0.0") return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  return host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:");
}

/**
 * Webhook URLs are HTTPS on a public host. A local Polynet (the developer
 * stack) may also post to plain-HTTP loopback, so a local MCP can be tested.
 */
export function normalizeCommunityAccessWebhookUrl(value: unknown, options: { allowLoopback?: boolean } = {}): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || raw.length > COMMUNITY_ACCESS_WEBHOOK_URL_MAX) throw new CommunityAccessError("access_webhook_url_invalid");
  let url: URL;
  try { url = new URL(raw); } catch { throw new CommunityAccessError("access_webhook_url_invalid"); }
  if (url.username || url.password || url.hash) throw new CommunityAccessError("access_webhook_url_invalid");
  const local = isLoopbackOrPrivateHost(url.hostname);
  if (local) {
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname.toLowerCase());
    if (!options.allowLoopback || !loopback) throw new CommunityAccessError("access_webhook_url_not_public");
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new CommunityAccessError("access_webhook_url_invalid");
  } else if (url.protocol !== "https:") {
    throw new CommunityAccessError("access_webhook_url_https_required");
  }
  return url.toString();
}

// Keys and ids. Every secret is shown once and stored only as a SHA-256 hash,
// except the webhook signing secret, which Polynet needs in order to sign and
// keeps encrypted.
const KEY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export function randomCommunityAccessToken(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  // 256 % 57 bias is negligible next to 32+ characters of entropy, but reject
  // the top of the range anyway so every character is uniform.
  let i = 0;
  while (out.length < length) {
    if (i >= bytes.length) { crypto.getRandomValues(bytes); i = 0; }
    const byte = bytes[i++]!;
    if (byte < 228) out += KEY_ALPHABET[byte % KEY_ALPHABET.length];
  }
  return out;
}

export function communityLicenseKeySlug(slug: string): string {
  return String(slug ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 16) || "community";
}

export function newCommunityLicenseKey(communitySlug: string): string {
  return `pnk_${communityLicenseKeySlug(communitySlug)}_${randomCommunityAccessToken(32)}`;
}

export function communityLicenseKeyLooksValid(value: unknown): value is string {
  return typeof value === "string" && /^pnk_[a-z0-9]{1,16}_[A-Za-z0-9]{32}$/.test(value);
}

export function newCommunityAccessApiKey(): string {
  return `pna_${randomCommunityAccessToken(40)}`;
}

export function communityAccessApiKeyLooksValid(value: unknown): value is string {
  return typeof value === "string" && /^pna_[A-Za-z0-9]{40}$/.test(value);
}

export function newCommunityAccessSigningSecret(): string {
  return `pnws_${randomCommunityAccessToken(40)}`;
}

// "Continue with Polynet": a one-time code the member's browser carries back to
// the service, which redeems it server to server with its API key.
export const COMMUNITY_ACCESS_SIGN_IN_CODE_TTL_MS = 5 * 60_000;

export function newCommunityAccessSignInCode(): string {
  return `pnc_${randomCommunityAccessToken(40)}`;
}

export function communityAccessSignInCodeLooksValid(value: unknown): value is string {
  return typeof value === "string" && /^pnc_[A-Za-z0-9]{40}$/.test(value);
}

/**
 * Where a sign-in may send the member back: an address on the same site as the
 * integration's webhook (so only the service the owner connected can receive a
 * code), https unless both are on this machine, with no user info or fragment.
 */
export function communityAccessReturnUrlFor(value: unknown, webhookUrl: string): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || raw.length > COMMUNITY_ACCESS_WEBHOOK_URL_MAX) return null;
  let url: URL;
  let hook: URL;
  try { url = new URL(raw); hook = new URL(webhookUrl); } catch { return null; }
  if (url.username || url.password || url.hash) return null;
  if (url.origin !== hook.origin) return null;
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname.toLowerCase());
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) return null;
  return url.toString();
}

export function newCommunityAccessMemberId(): string {
  return `pm_${randomCommunityAccessToken(20)}`;
}

export function newCommunityAccessEventId(): string {
  return `evt_${randomCommunityAccessToken(24)}`;
}

export async function sha256HexOf(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * The webhook signature: HMAC-SHA256 over "<unix seconds>.<raw body>", sent as
 * `Polynet-Signature: t=<unix seconds>,v1=<hex>`. Receivers recompute it with
 * the signing secret and reject a timestamp older than five minutes.
 */
export async function signCommunityAccessWebhook(secret: string, timestampSeconds: number, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestampSeconds}.${body}`));
  const hex = Array.from(new Uint8Array(mac), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `t=${timestampSeconds},v1=${hex}`;
}

/** Retry delays for a failed delivery; deliveries stop 72 hours after the change. */
export const COMMUNITY_ACCESS_DELIVERY_WINDOW_MS = 72 * 60 * 60 * 1000;
export function communityAccessRetryDelayMs(attemptCount: number): number {
  const steps = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 3 * 60 * 60_000, 6 * 60 * 60_000];
  return steps[Math.min(Math.max(0, attemptCount - 1), steps.length - 1)]!;
}
export function communityAccessDeliveryShouldRetry(status: number | null): boolean {
  return status === null || status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

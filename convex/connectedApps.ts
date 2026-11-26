// Connected apps (one door, slice 2a; docs/specs/builder-modalities-v0.md).
// A builder registers their own app with their community. The app asks one
// question, server to server with its secret: what does this person (by
// verified email) have here? It gets { allowed, tier, grants }, the answer
// worked out from billing when asked (communityTiers.resolveMemberGrants).
// When that may have changed, Polynet sends the app a signed, thin
// "access.changed" webhook and the app asks again. Grants never ride in a
// token, so nothing goes stale.
//
// Secrets: the app's secret is stored only as its SHA-256; the webhook signing
// secret is stored as Polynet must sign with it (as Stripe does). Both are
// shown to the builder once.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { getActiveCommunityBlock, requireCommunityChatAccess, requireCommunityManager } from "./communityCore";
import { sha256Hex, verifiedUserIdForEmail } from "./communityCheckoutBuyer";
import { resolveMemberGrants } from "./communityTiers";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import { communityIsActive } from "../shared/communityLifecycle";

const APPS_MAX = 3;
const NAME_MAX = 60;
const REDIRECT_URLS_MAX = 5;
const REDIRECT_URL_MAX_CHARS = 512;
const AUTH_CODE_TTL_MS = 5 * 60_000;
const AUTH_CODE_RATE_WINDOW_MS = 60_000;
const AUTH_CODE_RATE_MAX = 20;
const PKCE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;
const PKCE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;
// Retries: 1 min, 5 min, 30 min, 2 h, 6 h, 24 h; then the delivery is kept as failed.
const RETRY_DELAYS_MS = [60_000, 300_000, 1_800_000, 7_200_000, 21_600_000, 86_400_000];
const DELIVERY_TIMEOUT_MS = 10_000;

function randomToken(bytes = 24): string {
  const raw = new Uint8Array(bytes);
  crypto.getRandomValues(raw);
  return Array.from(raw, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function newAppSecret(): string { return `psk_${randomToken(24)}`; }
function newSigningSecret(): string { return `whsec_${btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))))}`; }
function newAuthCode(): string { return `pcode_${randomToken(24)}`; }

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function pkceS256Challenge(codeVerifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  const binary = Array.from(new Uint8Array(digest), (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function isValidPkceChallenge(raw: string): boolean {
  return PKCE_CHALLENGE_PATTERN.test(raw);
}

export function isValidPkceVerifier(raw: string): boolean {
  return PKCE_VERIFIER_PATTERN.test(raw);
}

// Webhooks go to the builder's own server: https only, and never a local or
// private address (so Polynet can't be pointed at its own network).
export function webhookUrlIsAllowed(raw: string): boolean {
  let url: URL;
  try { url = new URL(raw); } catch { return false; }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  // "localhost." is localhost: trailing dots are dropped before any check.
  const host = url.hostname.toLowerCase().replace(/\.+$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") || host.startsWith("[") || /^0x|^\d+$/.test(host)) return false;
  // The resolved address can't be checked from here (no DNS in this runtime).
  // What limits that: the body is fixed (an event id and an email), only the
  // status is read, and redirects are never followed.
  return host.includes(".");
}

// OAuth 2.1 callback URLs ("Sign in with Polynet"): browser redirects only.
// Public https URLs (no fragment, no credentials), plus loopback http for local dev.
export function redirectUrlIsAllowed(raw: string): boolean {
  const value = String(raw ?? "").trim();
  if (!value || value.length > REDIRECT_URL_MAX_CHARS) return false;
  if (/[\u0000-\u001f\u007f#]/.test(value)) return false;
  if (/^https?:\/\/[^/?#]*\.(?:[:/?#]|$)/i.test(value)) return false;
  let url: URL;
  try { url = new URL(value); } catch { return false; }
  if (url.username || url.password || url.hash) return false;
  if (url.searchParams.has("code") || url.searchParams.has("state") || url.searchParams.has("error")) return false;
  const rawHost = url.hostname.toLowerCase();
  if (url.protocol === "http:") {
    return rawHost === "localhost" || rawHost === "127.0.0.1" || rawHost === "[::1]";
  }
  if (url.protocol !== "https:") return false;
  const host = rawHost.replace(/\.+$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") || host.startsWith("[") || /^0x|^\d+$/.test(host)) return false;
  return host.includes(".");
}

function normalizeRedirectUrls(rawList: string[] | undefined): string[] | undefined {
  if (rawList === undefined) return undefined;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of rawList) {
    const trimmed = String(item ?? "").trim();
    if (!trimmed) continue;
    if (!redirectUrlIsAllowed(trimmed)) throw new Error("connected_app_redirect_url_invalid");
    const canonical = new URL(trimmed).toString();
    if (!seen.has(canonical)) {
      seen.add(canonical);
      out.push(canonical);
    }
    if (out.length > REDIRECT_URLS_MAX) throw new Error("connected_app_redirect_urls_full");
  }
  return out;
}

// The app's own address, linked from the community: public https only.
function normalizeAppUrl(raw: string | undefined | null): string | undefined {
  const value = String(raw ?? "").trim();
  if (!value) return undefined;
  if (!webhookUrlIsAllowed(value)) throw new Error("connected_app_url_invalid");
  return value;
}

function normalizeWebhookUrl(raw: string | undefined | null): string | undefined {
  const value = String(raw ?? "").trim();
  if (!value) return undefined;
  if (!webhookUrlIsAllowed(value)) throw new Error("connected_app_webhook_url_invalid");
  return value;
}

async function manager(ctx: any, args: { authSubject?: string; communityId: any }) {
  const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
  await requireCommunityManager({ ctx, communityId: args.communityId, userId });
  return userId;
}

async function appsOf(ctx: any, communityId: any) {
  return (await ctx.db.query("connectedApps").withIndex("by_community", (q: any) => q.eq("communityId", communityId)).collect())
    .filter((row: any) => !row.revokedAt);
}

function appView(row: any) {
  return {
    app_id: row.appId, name: row.name, webhook_url: row.webhookUrl ?? null, app_url: row.appUrl ?? null,
    redirect_urls: Array.isArray(row.redirectUrls) ? row.redirectUrls : [],
    secret_hint: row.secretHint, created_at: new Date(row.createdAt).toISOString(),
  };
}

export const listConnectedApps = query({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities") },
  handler: async (ctx, args) => {
    await manager(ctx, args);
    return { apps: (await appsOf(ctx, args.communityId)).map(appView) };
  },
});

// Register an app. The secret and signing secret are returned this once.
export const registerConnectedApp = mutation({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    name: v.string(),
    webhookUrl: v.optional(v.string()),
    appUrl: v.optional(v.string()),
    redirectUrls: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await manager(ctx, args);
    const appUrl = normalizeAppUrl(args.appUrl);
    const redirectUrls = normalizeRedirectUrls(args.redirectUrls);
    const name = args.name.replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
    if (!name) throw new Error("connected_app_name_required");
    if ((await appsOf(ctx, args.communityId)).length >= APPS_MAX) throw new Error("connected_apps_full");
    const webhookUrl = normalizeWebhookUrl(args.webhookUrl);
    const secret = newAppSecret();
    const signingSecret = newSigningSecret();
    const appId = `app_${randomToken(10)}`;
    const nowMs = Date.now();
    await ctx.db.insert("connectedApps", {
      communityId: args.communityId, appId, name, secretHash: await sha256Hex(secret), secretHint: secret.slice(-4),
      signingSecret, ...(webhookUrl ? { webhookUrl } : {}), ...(appUrl ? { appUrl } : {}),
      ...(redirectUrls?.length ? { redirectUrls } : {}),
      createdByUserId: userId, createdAt: nowMs, updatedAt: nowMs,
    });
    return { app_id: appId, secret, webhook_signing_secret: signingSecret };
  },
});

async function ownApp(ctx: any, communityId: any, appId: string) {
  const row = await ctx.db.query("connectedApps").withIndex("by_appId", (q: any) => q.eq("appId", appId)).first();
  if (!row || row.revokedAt || String(row.communityId) !== String(communityId)) throw new Error("connected_app_not_found");
  return row;
}

export const updateConnectedApp = mutation({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    appId: v.string(),
    name: v.optional(v.string()),
    webhookUrl: v.optional(v.string()),
    appUrl: v.optional(v.string()),
    redirectUrls: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await manager(ctx, args);
    const row = await ownApp(ctx, args.communityId, args.appId);
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) {
      const name = args.name.replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
      if (!name) throw new Error("connected_app_name_required");
      patch.name = name;
    }
    if (args.webhookUrl !== undefined) patch.webhookUrl = normalizeWebhookUrl(args.webhookUrl);
    if (args.appUrl !== undefined) patch.appUrl = normalizeAppUrl(args.appUrl);
    if (args.redirectUrls !== undefined) patch.redirectUrls = normalizeRedirectUrls(args.redirectUrls);
    await ctx.db.patch(row._id, patch);
    return null;
  },
});

// A new secret; the old one stops working at once. Returned this once.
export const rotateConnectedAppSecret = mutation({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities"), appId: v.string() },
  handler: async (ctx, args) => {
    await manager(ctx, args);
    const row = await ownApp(ctx, args.communityId, args.appId);
    const secret = newAppSecret();
    await ctx.db.patch(row._id, { secretHash: await sha256Hex(secret), secretHint: secret.slice(-4), updatedAt: Date.now() });
    return { secret };
  },
});

// Disconnect: its secret stops working and nothing more is sent to it.
export const revokeConnectedApp = mutation({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities"), appId: v.string() },
  handler: async (ctx, args) => {
    await manager(ctx, args);
    const row = await ownApp(ctx, args.communityId, args.appId);
    await ctx.db.patch(row._id, { revokedAt: Date.now(), updatedAt: Date.now() });
    return null;
  },
});

// The community's apps, for its members: a name and where to open it. Never
// the app's id, secrets or webhook.
export const listCommunityAppLinks = query({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
    return { apps: (await appsOf(ctx, args.communityId)).filter((row: any) => row.appUrl).map((row: any) => ({ name: row.name, url: row.appUrl })) };
  },
});

// ---- The app's own calls (server to server, with its secret).

export const resolveConnectedAppBySecretInternal = internalQuery({
  args: { secretHash: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("connectedApps").withIndex("by_secretHash", (q: any) => q.eq("secretHash", args.secretHash)).first();
    if (!row || row.revokedAt) return null;
    const community = await ctx.db.get(row.communityId) as any;
    if (!community || (community.lifecycleStatus && community.lifecycleStatus !== "active")) return null;
    return { appId: row.appId, communityId: row.communityId };
  },
});

// What this person has in the app's community: only for a verified email,
// and the same "not allowed" for someone unknown as for a non-member, so the
// check never reveals who has an account.
export const accessForEmailInternal = internalQuery({
  args: { communityId: v.id("communities"), email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const userId = email ? await verifiedUserIdForEmail(ctx, email) : null;
    if (!userId) return { allowed: false, tier: null, grants: [] as string[] };
    return await resolveMemberGrants(ctx, args.communityId, userId);
  },
});

// ---- Sign in with Polynet (OAuth 2.1 + PKCE S256, per connected app)

async function resolveActiveAppForOAuth(ctx: any, clientId: string, rawRedirectUri: string) {
  const app = await ctx.db.query("connectedApps").withIndex("by_appId", (q: any) => q.eq("appId", clientId)).first();
  if (!app || app.revokedAt) return { ok: false as const, error: "invalid_client" as const };
  const community = await ctx.db.get(app.communityId) as any;
  if (!community || !communityIsActive(community)) return { ok: false as const, error: "invalid_client" as const };
  const registered: string[] = Array.isArray(app.redirectUrls) ? app.redirectUrls : [];
  let canonicalRedirect = "";
  try {
    canonicalRedirect = redirectUrlIsAllowed(rawRedirectUri) ? new URL(rawRedirectUri.trim()).toString() : "";
  } catch {
    canonicalRedirect = "";
  }
  if (!canonicalRedirect || !registered.includes(canonicalRedirect)) {
    return { ok: false as const, error: "invalid_redirect_uri" as const };
  }
  return { ok: true as const, app, community, redirectUri: canonicalRedirect };
}

export const getConnectedAppAuthorizeContext = query({
  args: {
    authSubject: v.optional(v.string()),
    clientId: v.string(),
    redirectUri: v.string(),
    codeChallenge: v.string(),
    codeChallengeMethod: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
    if (args.codeChallengeMethod !== "S256" || !isValidPkceChallenge(args.codeChallenge)) {
      return { ok: false as const, error: "invalid_pkce" as const };
    }
    const resolved = await resolveActiveAppForOAuth(ctx, args.clientId.trim(), args.redirectUri);
    if (!resolved.ok) return resolved;
    const { app, community, redirectUri } = resolved;
    const [user, profile, block, access] = await Promise.all([
      ctx.db.get(userId),
      resolveUserProfileDisplayProjection(ctx, userId),
      getActiveCommunityBlock({ ctx, communityId: community._id, userId }),
      resolveMemberGrants(ctx, community._id, userId),
    ]);
    const email = typeof (user as any)?.email === "string" ? (user as any).email.trim().toLowerCase() : null;
    const emailVerified = Boolean(email && (user as any)?.emailVerifiedAt);
    return {
      ok: true as const,
      redirect_uri: redirectUri,
      app: {
        app_id: app.appId as string,
        name: app.name as string,
        app_url: (app.appUrl as string | undefined) ?? null,
      },
      community: {
        slug: String(community.slug ?? ""),
        name: String(community.name ?? ""),
      },
      user: {
        email: emailVerified ? email : null,
        email_verified: emailVerified,
        display_name: profile?.display_name ?? (String((user as any)?.displayName ?? "").trim() || null),
        is_blocked: Boolean(block),
      },
      access,
    };
  },
});

export const approveConnectedAppAuthorization = mutation({
  args: {
    authSubject: v.optional(v.string()),
    clientId: v.string(),
    redirectUri: v.string(),
    codeChallenge: v.string(),
    codeChallengeMethod: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
    if (args.codeChallengeMethod !== "S256" || !isValidPkceChallenge(args.codeChallenge)) {
      throw new Error("oauth_invalid_pkce");
    }
    const resolved = await resolveActiveAppForOAuth(ctx, args.clientId.trim(), args.redirectUri);
    if (!resolved.ok) throw new Error(`oauth_${resolved.error}`);
    const { app, community, redirectUri } = resolved;
    const user: any = await ctx.db.get(userId);
    const email = typeof user?.email === "string" ? user.email.trim().toLowerCase() : "";
    if (!email || !user?.emailVerifiedAt) throw new Error("oauth_verified_email_required");
    const block = await getActiveCommunityBlock({ ctx, communityId: community._id, userId });
    if (block) throw new Error("oauth_community_user_blocked");

    const nowMs = Date.now();
    const recentCodes = await ctx.db
      .query("connectedAppAuthCodes")
      .withIndex("by_user_createdAt", (q: any) => q.eq("userId", userId).gte("createdAt", nowMs - AUTH_CODE_RATE_WINDOW_MS))
      .take(AUTH_CODE_RATE_MAX);
    if (recentCodes.length >= AUTH_CODE_RATE_MAX) {
      throw new Error("oauth_rate_limited");
    }

    const code = newAuthCode();
    await ctx.db.insert("connectedAppAuthCodes", {
      codeHash: await sha256Hex(code),
      appId: app.appId,
      communityId: community._id,
      userId,
      redirectUri,
      codeChallenge: args.codeChallenge,
      codeChallengeMethod: "S256",
      expiresAt: nowMs + AUTH_CODE_TTL_MS,
      createdAt: nowMs,
    });
    return { code, redirect_uri: redirectUri };
  },
});

export const exchangeConnectedAppAuthCodeInternal = internalMutation({
  args: {
    appId: v.string(),
    communityId: v.id("communities"),
    codeHash: v.string(),
    redirectUri: v.string(),
    codeVerifier: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("connectedAppAuthCodes")
      .withIndex("by_codeHash", (q: any) => q.eq("codeHash", args.codeHash))
      .first();
    if (!row) return { ok: false as const, error: "invalid_grant" as const };
    const nowMs = Date.now();
    let canonicalRedirect = "";
    try {
      canonicalRedirect = redirectUrlIsAllowed(args.redirectUri) ? new URL(args.redirectUri.trim()).toString() : "";
    } catch {
      canonicalRedirect = "";
    }
    if (
      row.usedAt !== undefined ||
      nowMs > row.expiresAt ||
      row.appId !== args.appId ||
      String(row.communityId) !== String(args.communityId) ||
      !canonicalRedirect ||
      !constantTimeEqual(row.redirectUri, canonicalRedirect)
    ) {
      return { ok: false as const, error: "invalid_grant" as const };
    }
    if (!isValidPkceVerifier(args.codeVerifier)) {
      return { ok: false as const, error: "invalid_grant" as const };
    }
    const computedChallenge = await pkceS256Challenge(args.codeVerifier);
    if (!constantTimeEqual(computedChallenge, row.codeChallenge)) {
      return { ok: false as const, error: "invalid_grant" as const };
    }
    // Atomically mark used before returning so concurrent replays always fail closed.
    await ctx.db.patch(row._id, { usedAt: nowMs });

    const app = await ctx.db
      .query("connectedApps")
      .withIndex("by_appId", (q: any) => q.eq("appId", row.appId))
      .first();
    if (!app || app.revokedAt || String(app.communityId) !== String(row.communityId)) {
      return { ok: false as const, error: "invalid_grant" as const };
    }
    const community: any = await ctx.db.get(row.communityId);
    if (!community || !communityIsActive(community)) {
      return { ok: false as const, error: "invalid_grant" as const };
    }
    const block = await getActiveCommunityBlock({ ctx, communityId: row.communityId, userId: row.userId });
    if (block) {
      return { ok: false as const, error: "invalid_grant" as const };
    }
    const user: any = await ctx.db.get(row.userId);
    const email = typeof user?.email === "string" ? user.email.trim().toLowerCase() : "";
    if (!user || !email || !user.emailVerifiedAt) {
      return { ok: false as const, error: "invalid_grant" as const };
    }
    const [profile, access, pairwiseHash] = await Promise.all([
      resolveUserProfileDisplayProjection(ctx, row.userId),
      resolveMemberGrants(ctx, row.communityId, row.userId),
      sha256Hex(`${args.appId}:${String(row.userId)}`),
    ]);
    return {
      ok: true as const,
      user: {
        id: `pusr_${pairwiseHash.slice(0, 32)}`,
        email,
        email_verified: true as const,
        name: profile?.display_name ?? (String(user.displayName ?? "").trim() || null),
        avatar_url: profile?.avatar_url ?? null,
      },
      access,
    };
  },
});

// ---- access.changed webhooks

export const getDeliveryInternal = internalQuery({
  args: { deliveryId: v.id("connectedAppDeliveries") },
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery || delivery.status !== "pending") return null;
    const app = await ctx.db.query("connectedApps").withIndex("by_appId", (q: any) => q.eq("appId", delivery.appId)).first();
    if (!app || app.revokedAt || !app.webhookUrl) return { delivery, app: null };
    return { delivery, app: { webhookUrl: app.webhookUrl as string, signingSecret: app.signingSecret as string } };
  },
});

export const recordDeliveryInternal = internalMutation({
  args: { deliveryId: v.id("connectedAppDeliveries"), ok: v.boolean(), lastError: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) return null;
    const nowMs = Date.now();
    const attempts = delivery.attempts + 1;
    if (args.ok) {
      await ctx.db.patch(delivery._id, { status: "delivered", attempts, updatedAt: nowMs, lastError: undefined });
      return null;
    }
    const delay = RETRY_DELAYS_MS[attempts - 1];
    if (delay === undefined) {
      await ctx.db.patch(delivery._id, { status: "failed", attempts, updatedAt: nowMs, lastError: args.lastError });
      return null;
    }
    await ctx.db.patch(delivery._id, { attempts, nextAttemptAt: nowMs + delay, updatedAt: nowMs, lastError: args.lastError });
    await ctx.scheduler.runAfter(delay, internal.connectedApps.deliverConnectedAppWebhookInternal, { deliveryId: delivery._id });
    return null;
  },
});

export const dropDeliveryInternal = internalMutation({
  args: { deliveryId: v.id("connectedAppDeliveries") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.deliveryId, { status: "failed", lastError: "app_disconnected", updatedAt: Date.now() });
    return null;
  },
});

// Standard Webhooks: webhook-id, webhook-timestamp and webhook-signature
// ("v1," + base64 HMAC-SHA256 of "id.timestamp.body" with the signing secret).
export async function signStandardWebhook(signingSecret: string, id: string, timestampSeconds: number, body: string): Promise<string> {
  const keyBytes = Uint8Array.from(atob(signingSecret.replace(/^whsec_/, "")), (char) => char.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestampSeconds}.${body}`));
  return `v1,${btoa(String.fromCharCode(...new Uint8Array(mac)))}`;
}

export const deliverConnectedAppWebhookInternal = internalAction({
  args: { deliveryId: v.id("connectedAppDeliveries") },
  handler: async (ctx, args): Promise<{ ok?: boolean; skipped?: boolean }> => {
    const found: { delivery: any; app: { webhookUrl: string; signingSecret: string } | null } | null =
      await ctx.runQuery(internal.connectedApps.getDeliveryInternal, { deliveryId: args.deliveryId });
    if (!found) return { skipped: true };
    if (!found.app) { await ctx.runMutation(internal.connectedApps.dropDeliveryInternal, { deliveryId: args.deliveryId }); return { skipped: true }; }
    const { delivery, app } = found;
    const body = JSON.stringify({ type: delivery.type, data: { email: delivery.email }, occurred_at: new Date(delivery.createdAt).toISOString() });
    // A fresh timestamp and signature on every attempt; the id stays the same (the app's duplicate guard).
    const timestamp = Math.floor(Date.now() / 1000);
    let ok = false;
    let lastError: string | undefined;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
      const response = await fetch(app.webhookUrl, {
        method: "POST", redirect: "manual", signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "webhook-id": delivery.eventId,
          "webhook-timestamp": String(timestamp),
          "webhook-signature": await signStandardWebhook(app.signingSecret, delivery.eventId, timestamp, body),
        },
        body,
      });
      clearTimeout(timer);
      ok = response.status >= 200 && response.status < 300;
      if (!ok) lastError = `http_${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.name : "fetch_failed";
    }
    await ctx.runMutation(internal.connectedApps.recordDeliveryInternal, { deliveryId: args.deliveryId, ok, ...(lastError ? { lastError } : {}) });
    return { ok };
  },
});

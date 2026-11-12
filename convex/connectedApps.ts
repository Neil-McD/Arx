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
import { requireCommunityChatAccess, requireCommunityManager } from "./communityCore";
import { sha256Hex, verifiedUserIdForEmail } from "./communityCheckoutBuyer";
import { resolveMemberGrants } from "./communityTiers";

const APPS_MAX = 3;
const NAME_MAX = 60;
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
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities"), name: v.string(), webhookUrl: v.optional(v.string()), appUrl: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await manager(ctx, args);
    const appUrl = normalizeAppUrl(args.appUrl);
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
      signingSecret, ...(webhookUrl ? { webhookUrl } : {}), ...(appUrl ? { appUrl } : {}), createdByUserId: userId, createdAt: nowMs, updatedAt: nowMs,
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
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities"), appId: v.string(), name: v.optional(v.string()), webhookUrl: v.optional(v.string()), appUrl: v.optional(v.string()) },
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

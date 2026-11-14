// A community's landing page in Polynet's app, /c/<slug> (Neil, Nov 13: custom
// sites are being removed, so the page that sells a community and lets people
// in lives in the app). Every section comes from what the community already
// has; an empty one is left out by the page. Joining runs the same cores the
// sites' join page ran (communityAppJoin.ts): Studio's join decision, its
// cancel, its paid checkout (signed in, or cash first before signing in), and
// the verified finalization. The browser is told only what this projection says.
import { v } from "convex/values";
import { action, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { resolveAuthenticatedActor } from "./authActor";
import { communityAppJoinProjection } from "./communityAppJoin";
import { communityAgentIsOn } from "./communityApps";
import { sha256Hex } from "./communityCheckoutBuyer";
import { startCommunityJoinCheckoutCore } from "./communityCommerce";
import { communityIsActive } from "../shared/communityLifecycle";
import type { CommunityLike } from "./communityCore";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import { recordCommunityJoinStarted } from "./communityFunnelEvents";
import { cancelPendingCommunityJoinRequest } from "./communityJoinRequestCore";
import { joinPublicCommunityInternal } from "./communityPublic";
import { readCanonicalPublicAppOrigin } from "./publicAppUrl";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;
const UPCOMING_EVENTS = 3;
const NOTE_COUNT_CAP = 1000;
const VISIT_DEDUPE_WINDOW_MS = 30 * 60 * 1000;

function cleanSlug(raw: string): string {
  const slug = String(raw ?? "").trim().toLowerCase();
  return SLUG_PATTERN.test(slug) ? slug : "";
}

async function activeCommunityBySlug(ctx: any, raw: string): Promise<CommunityLike | null> {
  const slug = cleanSlug(raw);
  if (!slug) return null;
  const community = (await ctx.db.query("communities").withIndex("by_slug", (q: any) => q.eq("slug", slug)).first()) as CommunityLike | null;
  return community && communityIsActive(community) ? community : null;
}

// The signed-in caller, or null when signed out (a wrong subject reads as signed out).
async function optionalUserId(ctx: any, authSubject: string | undefined): Promise<any | null> {
  if (!authSubject) return null;
  try {
    return (await resolveAuthenticatedActor({ ctx, authSubject })).dbUserId ?? null;
  } catch {
    return null;
  }
}

async function requiredUserId(ctx: any, authSubject: string | undefined): Promise<any> {
  const userId = await optionalUserId(ctx, authSubject);
  if (!userId) throw new Error("auth_subject_required");
  return userId;
}

// The page: the community, its join card, and what's inside it.
export const getCommunityLandingPage = query({
  args: { communitySlug: v.string(), authSubject: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const community = await activeCommunityBySlug(ctx, args.communitySlug);
    if (!community) return { ok: false as const };
    const userId = await optionalUserId(ctx, args.authSubject);
    const join = await communityAppJoinProjection(ctx, community, userId);
    const nowMs = Date.now();
    const ownerId = (community as any).ownerId;

    const [hostFace, hostDetail, events, noteRows, apps, agentOn] = await Promise.all([
      ownerId ? resolveUserProfileDisplayProjection(ctx, ownerId) : null,
      ownerId ? ctx.db.query("userProfileDetails").withIndex("by_user", (q: any) => q.eq("userId", ownerId)).first() : null,
      ctx.db.query("communityEvents")
        .withIndex("by_community_status_startsAt", (q: any) => q.eq("communityId", community._id).eq("status", "live").gte("startsAt", nowMs))
        .take(20),
      ctx.db.query("communityNotes").withIndex("by_community_slug", (q: any) => q.eq("communityId", community._id)).take(NOTE_COUNT_CAP),
      ctx.db.query("connectedApps").withIndex("by_community", (q: any) => q.eq("communityId", community._id)).collect(),
      communityAgentIsOn(ctx, community._id),
    ]);
    const host = join.community.host
      ? {
        name: join.community.host.name,
        avatar_url: (hostFace as any)?.avatar_url ?? null,
        bio: typeof (hostDetail as any)?.bio === "string" && (hostDetail as any).bio.trim() ? (hostDetail as any).bio.trim().slice(0, 400) : null,
      }
      : null;
    // The community's own app, where members open it (Settings → Your app).
    const app = (apps as any[]).find((row) => !row.revokedAt && typeof row.appUrl === "string" && /^https:\/\//.test(row.appUrl)) ?? null;
    let appHost: string | null = null;
    try { appHost = app ? new URL(app.appUrl).host : null; } catch { appHost = null; }

    return {
      ok: true as const,
      ...join,
      listed: (community as any).visibility === "published",
      is_owner: Boolean(userId && ownerId && String(userId) === String(ownerId)),
      signed_in: Boolean(userId),
      host,
      events: (events as any[])
        // Public, and not a pod's call (only that pod's people may see those).
        .filter((row) => row.visibility === "public" && !row.podChannelId)
        .slice(0, UPCOMING_EVENTS)
        .map((row) => ({
          title: String(row.title ?? "").slice(0, 120),
          starts_at: new Date(row.startsAt).toISOString(),
          place: row.locationType === "online" ? "Online" : typeof row.locationLabel === "string" ? row.locationLabel.slice(0, 80) : null,
          repeats: row.recurrenceFrequency && row.recurrenceFrequency !== "none" ? row.recurrenceFrequency : null,
        })),
      guide: agentOn ? { notes: (noteRows as any[]).length } : null,
      app: app && appHost ? { name: String(app.name ?? "").slice(0, 80), url: app.appUrl, host: appHost } : null,
    };
  },
});

// Join (an open community) or ask to (approval): Studio's own decision.
export const joinCommunityFromLanding = mutation({
  args: { communitySlug: v.string(), authSubject: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requiredUserId(ctx, args.authSubject);
    const community = await activeCommunityBySlug(ctx, args.communitySlug);
    if (!community) throw new Error("community_unavailable");
    const nowMs = Date.now();
    const result = await joinPublicCommunityInternal({ ctx, community, userId, nowMs });
    await recordCommunityJoinStarted(ctx, { communityId: community._id, userId, nowMs });
    return result;
  },
});

export const cancelCommunityJoinRequestFromLanding = mutation({
  args: { communitySlug: v.string(), authSubject: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requiredUserId(ctx, args.authSubject);
    const community = await activeCommunityBySlug(ctx, args.communitySlug);
    if (!community) throw new Error("community_unavailable");
    return await cancelPendingCommunityJoinRequest({ ctx, communityId: community._id, userId });
  },
});

// A paid plan, signed in: Stripe's checkout, coming back only to this page.
// Signed out (cash first) goes through the app's server function instead
// (httpCommunityLanding.ts), so each visitor's checkouts are limited.
export const startCommunityLandingCheckout = action({
  args: {
    communitySlug: v.string(),
    billingPeriod: v.union(v.literal("monthly"), v.literal("annual")),
    plan: v.optional(v.string()),
    authSubject: v.string(),
  },
  handler: async (ctx, args): Promise<{ checkout_url: string; session_id: string; buyer_secret: string | null }> => {
    const slug = cleanSlug(args.communitySlug);
    if (!slug) throw new Error("community_unavailable");
    const plan = args.plan ?? null;
    if (plan !== null && (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(plan) || args.billingPeriod !== "monthly")) throw new Error("invalid_request");
    const origin = readCanonicalPublicAppOrigin();
    const page = `${origin}/c/${encodeURIComponent(slug)}`;
    const started = await startCommunityJoinCheckoutCore(ctx, {
      communitySlug: slug,
      billingPeriod: args.billingPeriod,
      successUrl: `${page}?checkout={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${page}?checkout=canceled`,
      ...(plan ? { tierKey: plan } : {}),
      authSubject: args.authSubject,
    });
    return { checkout_url: started.checkout_url, session_id: started.session_id, buyer_secret: started.buyer_secret ?? null };
  },
});

export const landingCommunityIdInternal = internalQuery({
  args: { communitySlug: v.string() },
  handler: async (ctx, args) => {
    const community = await activeCommunityBySlug(ctx, args.communitySlug);
    return community ? community._id : null;
  },
});

// Back from Stripe: membership only once Stripe's verified notice says so. Not
// heard from Stripe yet? Ask it directly, so nobody waits on the notice.
export const finishCommunityLandingCheckout = action({
  args: {
    communitySlug: v.string(),
    sessionId: v.string(),
    buyerSecret: v.optional(v.string()),
    authSubject: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ status: "joined" | "pending" | "expired" | "not_found" }> => {
    if (!/^chk_[a-f0-9]{32}$/.test(args.sessionId)) return { status: "not_found" };
    const actor = (await ctx.runQuery(internal.authActor.resolveAuthenticatedActorInternal as any, {
      authSubject: args.authSubject,
    })) as { dbUserId?: any } | null;
    const userId = actor?.dbUserId ?? null;
    if (!userId) throw new Error("auth_subject_required");
    const communityId = await ctx.runQuery(internal.communityLanding.landingCommunityIdInternal, { communitySlug: args.communitySlug });
    if (!communityId) return { status: "not_found" };
    try {
      await ctx.runAction(internal.httpBilling.confirmCommunityCheckoutWithStripeInternal, { sessionId: args.sessionId });
    } catch (error) {
      console.error("community_checkout_confirm_failed", { error: error instanceof Error ? error.message : String(error) });
    }
    const buyerSecret = typeof args.buyerSecret === "string" && /^buyer_[a-f0-9]{32}$/.test(args.buyerSecret) ? args.buyerSecret : undefined;
    return (await ctx.runMutation(internal.communityAppJoin.finishCommunityAppCheckoutInternal, {
      userId, communityId, sessionId: args.sessionId, ...(buyerSecret ? { buyerSecret } : {}),
    })) as { status: "joined" | "pending" | "expired" | "not_found" };
  },
});

// A visit, for the founder's Analytics: the browser's own random key (never
// who it is), hashed; one per visitor per community per half hour.
export const recordCommunityLandingVisit = mutation({
  args: { communitySlug: v.string(), visitorKey: v.string() },
  handler: async (ctx, args) => {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(args.visitorKey)) return { ok: false };
    const community = await activeCommunityBySlug(ctx, args.communitySlug);
    if (!community) return { ok: false };
    const visitorHash = await sha256Hex(`landing:${String(community._id)}:${args.visitorKey}`);
    const nowMs = Date.now();
    const latest = await ctx.db.query("communityAnalyticsEvents")
      .withIndex("by_community_visitor_hash_event", (q: any) =>
        q.eq("communityId", community._id).eq("visitorKeyHash", visitorHash).eq("eventType", "funnel_visit"))
      .order("desc")
      .first();
    if (latest && latest.createdAt >= nowMs - VISIT_DEDUPE_WINDOW_MS) return { ok: true };
    await ctx.db.insert("communityAnalyticsEvents", {
      communityId: community._id, eventType: "funnel_visit", visitorKeyHash: visitorHash, createdAt: nowMs,
    });
    return { ok: true };
  },
});

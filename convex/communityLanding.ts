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
import { communityWideEvents } from "./communityEventAudience";
import { findNextLiveOccurrenceStartsAt } from "./communityEvents";
import { sha256Hex } from "./communityCheckoutBuyer";
import { startCommunityJoinCheckoutCore } from "./communityCommerce";
import { communityIsActive } from "../shared/communityLifecycle";
import type { CommunityLike } from "./communityCore";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import { recordCommunityJoinStarted } from "./communityFunnelEvents";
import { incrementCommunityDailyAnalytics } from "./communityAnalyticsRollups";
import { cancelPendingCommunityJoinRequest } from "./communityJoinRequestCore";
import { joinPublicCommunityInternal } from "./communityPublic";
import { webhookUrlIsAllowed } from "./connectedApps";
import { communityAcquisitionAttributionValidator } from "./distributionAttributionCore";
import { readCanonicalPublicAppOrigin } from "./publicAppUrl";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;
const APP_ID_PATTERN = /^app_[a-f0-9]{20}$/;
const UPCOMING_EVENTS = 3;
const VISIT_DEDUPE_WINDOW_MS = 30 * 60 * 1000;

function cleanAppId(raw: unknown): string | null {
  const value = typeof raw === "string" ? raw.trim() : "";
  return APP_ID_PATTERN.test(value) ? value : null;
}

export function buildLandingCheckoutReturnQuery(args: {
  plan?: string | null;
  billingPeriod?: "monthly" | "annual";
  appId?: string | null;
}): string {
  const parts: string[] = [];
  if (args.plan) parts.push(`plan=${encodeURIComponent(args.plan)}`);
  else if (args.billingPeriod === "annual") parts.push("period=annual");
  if (args.appId) parts.push(`app=${encodeURIComponent(args.appId)}`);
  return parts.length ? `&${parts.join("&")}` : "";
}

export const resolveReturnAppForLandingInternal = internalQuery({
  args: { communitySlug: v.string(), appId: v.string() },
  handler: async (ctx, args) => {
    const appId = cleanAppId(args.appId);
    if (!appId) return null;
    const community = await activeCommunityBySlug(ctx, args.communitySlug);
    if (!community) return null;
    const row = await ctx.db
      .query("connectedApps")
      .withIndex("by_appId", (q: any) => q.eq("appId", appId))
      .first();
    if (!row || row.revokedAt || String(row.communityId) !== String(community._id)) return null;
    if (typeof row.appUrl !== "string" || !webhookUrlIsAllowed(row.appUrl)) return null;
    return { app_id: row.appId as string, name: String(row.name ?? "").slice(0, 80), url: row.appUrl as string };
  },
});

function cleanSlug(raw: string): string {
  const slug = String(raw ?? "").trim().toLowerCase();
  return SLUG_PATTERN.test(slug) ? slug : "";
}

// For an action: a missing community is unavailable, an archived one says so.
async function actionableCommunityBySlug(ctx: any, raw: string): Promise<CommunityLike> {
  const slug = cleanSlug(raw);
  const community = slug
    ? (await ctx.db.query("communities").withIndex("by_slug", (q: any) => q.eq("slug", slug)).first()) as CommunityLike | null
    : null;
  if (!community) throw new Error("community_unavailable");
  if (!communityIsActive(community)) throw new Error("community_archived");
  return community;
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
  args: { communitySlug: v.string(), authSubject: v.optional(v.string()), appId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const community = await activeCommunityBySlug(ctx, args.communitySlug);
    if (!community) return { ok: false as const };
    const userId = await optionalUserId(ctx, args.authSubject);
    const join = await communityAppJoinProjection(ctx, community, userId);
    const nowMs = Date.now();
    const ownerId = (community as any).ownerId;

    const [hostFace, hostDetail, upcomingEvents, earlierEvents, apps, agentOn] = await Promise.all([
      ownerId ? resolveUserProfileDisplayProjection(ctx, ownerId) : null,
      ownerId ? ctx.db.query("userProfileDetails").withIndex("by_user", (q: any) => q.eq("userId", ownerId)).first() : null,
      ctx.db.query("communityEvents")
        .withIndex("by_community_status_startsAt", (q: any) => q.eq("communityId", community._id).eq("status", "live").gte("startsAt", nowMs))
        .take(20),
      ctx.db.query("communityEvents")
        .withIndex("by_community_status_startsAt", (q: any) => q.eq("communityId", community._id).eq("status", "live").lt("startsAt", nowMs))
        .order("desc")
        .take(50),
      ctx.db.query("connectedApps").withIndex("by_community", (q: any) => q.eq("communityId", community._id)).collect(),
      communityAgentIsOn(ctx, community._id),
    ]);
    const seenEventIds = new Set<string>();
    const events: any[] = [];
    for (const row of upcomingEvents as any[]) {
      const id = String(row._id);
      if (seenEventIds.has(id)) continue;
      seenEventIds.add(id);
      events.push(row);
    }
    for (const row of earlierEvents as any[]) {
      if (!row.recurrenceFrequency || row.recurrenceFrequency === "none") continue;
      const id = String(row._id);
      if (seenEventIds.has(id)) continue;
      seenEventIds.add(id);
      events.push(row);
    }
    const host = join.community.host
      ? {
        name: join.community.host.name,
        avatar_url: (hostFace as any)?.avatar_url ?? null,
        avatar_focus_x: (hostFace as any)?.avatar_focus_x ?? 0.5,
        avatar_focus_y: (hostFace as any)?.avatar_focus_y ?? 0.5,
        avatar_zoom: (hostFace as any)?.avatar_zoom ?? 1,
        bio: typeof (hostDetail as any)?.bio === "string" && (hostDetail as any).bio.trim() ? (hostDetail as any).bio.trim().slice(0, 400) : null,
      }
      : null;
    // The community's own app, where members open it (Settings → Your app).
    const activeApps = (apps as any[]).filter((row) => !row.revokedAt && typeof row.appUrl === "string" && webhookUrlIsAllowed(row.appUrl));
    const app = activeApps[0] ?? null;
    let appHost: string | null = null;
    try { appHost = app ? new URL(app.appUrl).host : null; } catch { appHost = null; }
    const requestedAppId = cleanAppId(args.appId);
    const returnAppRow = requestedAppId ? activeApps.find((row) => row.appId === requestedAppId) ?? null : null;

    return {
      ok: true as const,
      ...join,
      listed: (community as any).visibility === "published",
      is_owner: Boolean(userId && ownerId && String(userId) === String(ownerId)),
      signed_in: Boolean(userId),
      host,
      // Public, and never a pod's call (only that pod's people may see those).
      // Advance past any individually cancelled date on a live recurring event.
      events: communityWideEvents(events as any[])
        .filter((row) => row.visibility === "public")
        .map((row) => {
          const nextStartsAt = findNextLiveOccurrenceStartsAt(row, nowMs);
          if (nextStartsAt === null) return null;
          return {
            title: String(row.title ?? "").slice(0, 120),
            startsAtMs: nextStartsAt,
            starts_at: new Date(nextStartsAt).toISOString(),
            place: row.locationType === "online" ? "Online" : typeof row.locationLabel === "string" ? row.locationLabel.slice(0, 80) : null,
            repeats: row.recurrenceFrequency && row.recurrenceFrequency !== "none" ? row.recurrenceFrequency : null,
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
        .sort((a, b) => a.startsAtMs - b.startsAtMs)
        .slice(0, UPCOMING_EVENTS)
        .map(({ startsAtMs: _startsAtMs, ...entry }) => entry),
      // That there is a guide, and nothing about what it knows: notes are its
      // memory, not something the page counts for visitors.
      guide: agentOn ? {} : null,
      app: app && appHost ? { name: String(app.name ?? "").slice(0, 80), url: app.appUrl, host: appHost } : null,
      return_app: returnAppRow
        ? { app_id: String(returnAppRow.appId), name: String(returnAppRow.name ?? "").slice(0, 80), url: String(returnAppRow.appUrl) }
        : null,
    };
  },
});

// Join (an open community) or ask to (approval): Studio's own decision.
export const joinCommunityFromLanding = mutation({
  args: {
    communitySlug: v.string(),
    authSubject: v.optional(v.string()),
    distributionAttribution: v.optional(communityAcquisitionAttributionValidator),
  },
  handler: async (ctx, args) => {
    const userId = await requiredUserId(ctx, args.authSubject);
    const community = await actionableCommunityBySlug(ctx, args.communitySlug);
    const nowMs = Date.now();
    const result = await joinPublicCommunityInternal({
      ctx,
      community,
      userId,
      nowMs,
      distributionAttribution: args.distributionAttribution,
    });
    await recordCommunityJoinStarted(ctx, { communityId: community._id, userId, nowMs });
    return result;
  },
});

export const cancelCommunityJoinRequestFromLanding = mutation({
  args: { communitySlug: v.string(), authSubject: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requiredUserId(ctx, args.authSubject);
    const community = await actionableCommunityBySlug(ctx, args.communitySlug);
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
    appId: v.optional(v.string()),
    authSubject: v.string(),
    distributionAttribution: v.optional(communityAcquisitionAttributionValidator),
  },
  handler: async (ctx, args): Promise<{ checkout_url: string; session_id: string; buyer_secret: string | null }> => {
    const slug = cleanSlug(args.communitySlug);
    if (!slug) throw new Error("community_unavailable");
    const plan = args.plan ?? null;
    if (plan !== null && (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(plan) || args.billingPeriod !== "monthly")) throw new Error("invalid_request");
    const requestedAppId = cleanAppId(args.appId);
    const verifiedApp = requestedAppId
      ? await ctx.runQuery(internal.communityLanding.resolveReturnAppForLandingInternal, { communitySlug: slug, appId: requestedAppId })
      : null;
    const returnQuery = buildLandingCheckoutReturnQuery({
      plan,
      billingPeriod: args.billingPeriod,
      appId: verifiedApp?.app_id ?? null,
    });
    const origin = readCanonicalPublicAppOrigin();
    const page = `${origin}/c/${encodeURIComponent(slug)}`;
    const started = await startCommunityJoinCheckoutCore(ctx, {
      communitySlug: slug,
      billingPeriod: args.billingPeriod,
      successUrl: `${page}?checkout={CHECKOUT_SESSION_ID}${returnQuery}`,
      cancelUrl: `${page}?checkout=canceled${returnQuery}`,
      ...(plan ? { tierKey: plan } : {}),
      ...(args.distributionAttribution ? { distributionAttribution: args.distributionAttribution } : {}),
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
    await incrementCommunityDailyAnalytics(ctx, { communityId: community._id, nowMs, visitsDelta: 1 });
    return { ok: true };
  },
});

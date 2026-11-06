import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { communityIsActive } from "../shared/communityLifecycle";
import { normalizeCommunityAppOrigin } from "../shared/communityAppSession";
import {
  deriveCommunityFunnelAction,
  derivePublicCommunityAdmissionProjection,
  type CommunityFunnelAction,
} from "../shared/communityJoinPolicy";
import { buildCommunityFunnelPrimaryActionView, deriveCommunityFunnelUiMode } from "../shared/communityFunnelUi";
import {
  type CommunityLike,
  type CommunityMembershipLike,
  type PublicPlanSummaryLike,
  mapCommunityAccessRow,
  pickMostRelevantCommunityMembership,
  resolveCommunityBrandingFields,
  resolveCommunityEntryPolicy,
} from "./communityCore";
import { resolveCommunityBuilderAccess } from "./communityBuilderAccessCore";
import { joinPublicCommunityInternal, listCurrentCommunitySellablePlans } from "./communityPublic";
import { cancelPendingCommunityJoinRequest } from "./communityJoinRequestCore";
import { loadAccountSetupStatusForUserId } from "./accountSetupCore";
import { accountSetupBlocksJoining } from "../shared/accountSetup";
import { readCanonicalPublicAppOrigin } from "./publicAppUrl";
import { PRIVACY_AI_DATA_POLICY_DOCUMENT, TERMS_OF_SERVICE_DOCUMENT, legalDocumentPublicUrl } from "../shared/legalDocuments";
import { attachCommunityCheckoutToUser, sha256Hex } from "./communityCheckoutBuyer";
import { resolveCheckoutSessionFinalization } from "./communityCommerce";
import { recordCommunityJoinStarted } from "./communityFunnelEvents";
import { communityResourceIsMemberVisiblePage, communityResourceModuleIsMemberLive } from "../shared/communityResourceVisibility";
import { formatPlanPrice } from "../shared/accountCommerce";

// Join on a community site's private twin (<slug>--me<suffix>.<sites domain>/join).
// The page shows what Studio's public funnel (/c/<slug>) shows and decides, from
// the same projections (shared/communityJoinPolicy.ts, shared/communityFunnelUi.ts)
// and through the same cores: Studio's join decision (joinPublicCommunityInternal),
// its cancel, and its paid checkout, finalization and claim. Signed out it is a
// read-only public projection; every action needs a session minted on the twin
// (httpCommunityApps enforces that). Access to a paid community comes only from
// the provider's verified webhook, never from Stripe's redirect back.

// The doorstep's "What you get": the courses members see (live ones, in the
// founder's order), each with its lesson count, bounded so a signed-out read
// stays cheap. A course with more lessons than the scan shows the scan's count.
const DOORSTEP_COURSES = 6;
const DOORSTEP_MODULE_SCAN = 50;
const DOORSTEP_LESSON_SCAN = 200;

// A course's first paragraph as plain text, for one line under its title.
export function doorstepSummary(markdown: unknown): string | null {
  const first = String(markdown ?? "").split(/\n\s*\n/).map((part) => part.trim()).find(Boolean) ?? "";
  const plain = first
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^[#>\s-]+/gm, "")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return null;
  if (plain.length <= 180) return plain;
  const cut = plain.slice(0, 180);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 120)).trim()}…`;
}

async function doorstepCourses(ctx: any, communityId: any) {
  const modules = await ctx.db.query("communityResourceModules")
    .withIndex("by_community_sortOrder", (q: any) => q.eq("communityId", communityId))
    .take(DOORSTEP_MODULE_SCAN);
  const courses: Array<{ title: string; summary: string | null; lessons: number }> = [];
  for (const module of modules) {
    if (courses.length >= DOORSTEP_COURSES) break;
    if (!communityResourceModuleIsMemberLive(module)) continue;
    const live = new Set([String(module._id)]);
    const rows = await ctx.db.query("communityResources")
      .withIndex("by_community_module", (q: any) => q.eq("communityId", communityId).eq("moduleId", module._id))
      .take(DOORSTEP_LESSON_SCAN);
    const lessons = rows.filter((row: any) => communityResourceIsMemberVisiblePage(row, live)).length;
    if (!lessons) continue;
    courses.push({ title: String(module.name ?? "").trim().slice(0, 120) || "Course", summary: doorstepSummary(module.descriptionMd), lessons });
  }
  return courses;
}

// Who runs it, by the name they go by.
async function doorstepHost(ctx: any, ownerId: any): Promise<{ name: string } | null> {
  if (!ownerId) return null;
  const user: any = await ctx.db.get(ownerId);
  if (!user) return null;
  const detail: any = await ctx.db.query("userProfileDetails").withIndex("by_user", (q: any) => q.eq("userId", ownerId)).first();
  const name = String(detail?.displayName ?? user.displayName ?? "").trim().slice(0, 80);
  return name ? { name } : null;
}

export type CommunityAppJoinViewerState = "member" | "pending" | "denied" | "blocked" | "visitor";

// Studio's funnel sells one plan per billing period: the newest current one,
// which is the one checkout charges (resolveCheckoutPricePoint). Monthly first,
// as Studio picks it.
function plansByPeriod(plans: PublicPlanSummaryLike[]): PublicPlanSummaryLike[] {
  const latest = new Map<string, PublicPlanSummaryLike>();
  for (const plan of plans) latest.set(plan.billing_period, plan);
  return ["monthly", "annual"].flatMap((period) => (latest.has(period) ? [latest.get(period)!] : []));
}

export async function communityAppJoinProjection(ctx: any, community: CommunityLike, userId: any | null) {
  const builder = await resolveCommunityBuilderAccess({ ctx, community });
  const gate: CommunityFunnelAction = deriveCommunityFunnelAction({ entry_policy: resolveCommunityEntryPolicy(community) });
  const plans = gate === "checkout" ? plansByPeriod(await listCurrentCommunitySellablePlans(ctx, community._id)) : [];
  let viewer: null | {
    state: CommunityAppJoinViewerState; can_request_again: boolean; reapply_at: string | null; setup_required: boolean;
  } = null;
  let admission = derivePublicCommunityAdmissionProjection({ access: null });
  if (userId) {
    const memberships = (await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q: any) => q.eq("communityId", community._id).eq("userId", userId))
      .collect()) as CommunityMembershipLike[];
    const access = await mapCommunityAccessRow({ ctx, community, membership: pickMostRelevantCommunityMembership(memberships), userId });
    admission = derivePublicCommunityAdmissionProjection({ access });
    const setup = await loadAccountSetupStatusForUserId(ctx, userId);
    // A request (or a manager's reapproval, after a removal) counts unless the
    // community now sells a plan: a community that went paid shows checkout.
    const approvalGate = gate !== "checkout";
    const state: CommunityAppJoinViewerState = access.is_blocked
      ? "blocked"
      : admission.canEnterCommunity
        ? "member"
        : approvalGate && admission.approvalPending
          ? "pending"
          : approvalGate && admission.approvalDenied
            ? "denied"
            : "visitor";
    viewer = { state, can_request_again: admission.canRequestAgain, reapply_at: admission.approvalReapplyAtIso, setup_required: accountSetupBlocksJoining(setup) };
  }
  // Studio's own button wording for this state (and each plan's price).
  const mode = deriveCommunityFunnelUiMode({
    canEnterCommunity: admission.canEnterCommunity,
    canJoinWithCheckout: gate === "checkout",
    canJoinWithApproval: gate === "request_access",
    canJoinForFree: gate === "join",
  });
  const action = buildCommunityFunnelPrimaryActionView({
    mode, plan: plans[0] ?? null, approvalPending: admission.approvalPending,
    approvalDenied: admission.approvalDenied, canRequestAgain: admission.canRequestAgain,
  });
  const [branding, courses, host] = await Promise.all([
    resolveCommunityBrandingFields(ctx, community),
    doorstepCourses(ctx, community._id),
    doorstepHost(ctx, (community as any).ownerId),
  ]);
  const legalOrigin = (() => { try { return readCanonicalPublicAppOrigin(); } catch { return null; } })();
  const text = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);
  return {
    community: {
      slug: String(community.slug ?? ""),
      name: text(community.name, 120) ?? String(community.slug ?? ""),
      one_liner: text((community as any).oneLiner, 500),
      about: text((community as any).about, 4000),
      member_count: Math.max(0, Math.floor(Number((community as any).activeMemberCount) || 0)),
      avatar_url: branding.avatar_url ?? null,
      banner_url: branding.banner_url ?? null,
      host,
      courses,
    },
    gate,
    available: builder.operational,
    action_label: action.label,
    // Only plans Studio would sell (a valid price); each with Studio's "Join $10/month".
    plans: plans.flatMap((plan) => {
      const view = buildCommunityFunnelPrimaryActionView({ mode: "checkout", plan });
      // The price on its own ("$29"), for the doorstep's join card.
      const price = formatPlanPrice({ ...plan, billing_period: null });
      return view.hasValidPaidPlan ? [{ billing_period: plan.billing_period, name: plan.name, label: view.label, price }] : [];
    }),
    viewer,
    // Join's click accepts these (acceptCommunityJoin records it); the page links them.
    terms_url: legalOrigin ? legalDocumentPublicUrl(TERMS_OF_SERVICE_DOCUMENT, legalOrigin) : null,
    privacy_url: legalOrigin ? legalDocumentPublicUrl(PRIVACY_AI_DATA_POLICY_DOCUMENT, legalOrigin) : null,
  };
}

async function communityAtOrigin(ctx: any, originRaw: string): Promise<{ community: CommunityLike; domain: any } | null> {
  const origin = normalizeCommunityAppOrigin(originRaw);
  if (!origin) return null;
  const domain = await ctx.db.query("communityDomains").withIndex("by_origin", (q: any) => q.eq("origin", origin)).first();
  const community = domain ? ((await ctx.db.get(domain.communityId)) as CommunityLike | null) : null;
  return community && communityIsActive(community) ? { community, domain } : null;
}

// The join page's read: anyone (userId absent) gets the public projection; a
// twin session's user also gets where they stand. Only a private twin's origin.
export const getCommunityAppJoinInternal = internalQuery({
  args: { origin: v.string(), userId: v.optional(v.id("users")), communityId: v.optional(v.id("communities")) },
  handler: async (ctx, args) => {
    const found = await communityAtOrigin(ctx, args.origin);
    if (!found || found.domain.kind !== "private") return null;
    if (args.communityId && String(found.community._id) !== String(args.communityId)) return null;
    return await communityAppJoinProjection(ctx, found.community, args.userId ?? null);
  },
});

// Join (open) or ask to (approval): Studio's own decision, whichever it is.
// Either way someone acted on the doorstep, which the founder's analytics count.
export const joinCommunityAppVisitorInternal = internalMutation({
  args: { userId: v.id("users"), communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const community = (await ctx.db.get(args.communityId)) as CommunityLike | null;
    if (!community) throw new Error("community_not_found");
    const nowMs = Date.now();
    const result = await joinPublicCommunityInternal({ ctx, community, userId: args.userId, nowMs });
    await recordCommunityJoinStarted(ctx, { communityId: community._id, userId: args.userId, nowMs });
    return result;
  },
});

// Withdraw a pending request, as Studio's funnel does.
export const cancelCommunityAppJoinRequestInternal = internalMutation({
  args: { userId: v.id("users"), communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const community = (await ctx.db.get(args.communityId)) as CommunityLike | null;
    if (!community) throw new Error("community_not_found");
    if (!communityIsActive(community)) throw new Error("community_archived");
    return await cancelPendingCommunityJoinRequest({ ctx, communityId: community._id, userId: args.userId });
  },
});

// A page view on a community's public site, for its founder's analytics: the
// edge sends the site's origin and a keyed hash of the visitor's address (never
// the address). One visit per visitor per community per half hour, as Studio's
// funnel counted them; nothing for a private twin or an archived community.
const SITE_VISIT_DEDUPE_WINDOW_MS = 30 * 60 * 1000;
export const recordCommunitySiteVisitInternal = internalMutation({
  args: { origin: v.string(), visitorHash: v.string() },
  handler: async (ctx, args) => {
    if (!/^[0-9a-f]{64}$/.test(args.visitorHash)) return { ok: false };
    const found = await communityAtOrigin(ctx, args.origin);
    if (!found || found.domain.kind === "private") return { ok: false };
    const nowMs = Date.now();
    const latest = await ctx.db
      .query("communityAnalyticsEvents")
      .withIndex("by_community_visitor_hash_event", (q) =>
        q.eq("communityId", found.community._id).eq("visitorKeyHash", args.visitorHash).eq("eventType", "funnel_visit"),
      )
      .order("desc")
      .first();
    if (latest && latest.createdAt >= nowMs - SITE_VISIT_DEDUPE_WINDOW_MS) return { ok: true, deduped: true };
    await ctx.db.insert("communityAnalyticsEvents", {
      communityId: found.community._id,
      eventType: "funnel_visit",
      visitorKeyHash: args.visitorHash,
      createdAt: nowMs,
    });
    return { ok: true };
  },
});

// The community a site's private twin belongs to: where a signed-out buyer's
// checkout may start. Nothing for a site's public origin or an archived community.
export const privateOriginCommunityInternal = internalQuery({
  args: { origin: v.string() },
  handler: async (ctx, args) => {
    const found = await communityAtOrigin(ctx, args.origin);
    if (!found || found.domain.kind !== "private") return null;
    return { communityId: found.community._id, communitySlug: String(found.community.slug ?? "") };
  },
});

// Back from Stripe on the twin: Studio's finalization, a read of what Stripe's
// verified notice recorded (never the redirect); the notice itself granted the
// membership. Only the buyer's own checkout for this community; anything else
// reads as none at all.
export const finishCommunityAppCheckoutInternal = internalMutation({
  args: { userId: v.id("users"), communityId: v.id("communities"), sessionId: v.string(), buyerSecret: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ status: "joined" | "pending" | "expired" | "not_found" }> => {
    const row = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_sessionId", (q: any) => q.eq("sessionId", args.sessionId))
      .first();
    if (!row || row.mode !== "community_join" || String(row.communityId) !== String(args.communityId)) {
      return { status: "not_found" };
    }
    // Paid before signing in: this browser's secret (only the edge sends it,
    // from the buyer's HttpOnly cookie) makes it this member's.
    if (!row.ownerUserId && args.buyerSecret && row.buyerSecretHash
      && (await sha256Hex(args.buyerSecret)) === row.buyerSecretHash) {
      await attachCommunityCheckoutToUser(ctx, row.sessionId, args.userId, Date.now());
    }
    const current = await ctx.db.get(row._id);
    if (String(current?.ownerUserId ?? "") !== String(args.userId)) return { status: "not_found" };
    const finalization = (await resolveCheckoutSessionFinalization(ctx, args.userId, args.sessionId)) as { status: string };
    if (finalization.status === "pending") return { status: "pending" };
    if (finalization.status !== "succeeded") return { status: "expired" };
    return { status: "joined" };
  },
});

// Stripe's return addresses for a checkout started on a site's private twin:
// its own /join, nothing else. The caller has already checked that the origin
// is this community's private twin (isCommunityPrivateOriginInternal).
export function twinCheckoutReturnUrls(origin: string): { successUrl: string; cancelUrl: string } | null {
  const normalized = normalizeCommunityAppOrigin(origin);
  if (!normalized || normalized !== origin) return null;
  return { successUrl: `${normalized}/join?checkout={CHECKOUT_SESSION_ID}`, cancelUrl: `${normalized}/join?checkout=canceled` };
}

export const isCommunityPrivateOriginInternal = internalQuery({
  args: { communityId: v.id("communities"), origin: v.string() },
  handler: async (ctx, args) => {
    const found = await communityAtOrigin(ctx, args.origin);
    return Boolean(found && found.domain.kind === "private" && String(found.community._id) === String(args.communityId));
  },
});

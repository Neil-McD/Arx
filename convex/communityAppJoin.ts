import { v } from "convex/values";
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
import { redeemPurchaseClaimForUser, resolveCheckoutSessionFinalization } from "./communityCommerce";

// Join on a community site's private twin (<slug>--me<suffix>.<sites domain>/join).
// The page shows what Studio's public funnel (/c/<slug>) shows and decides, from
// the same projections (shared/communityJoinPolicy.ts, shared/communityFunnelUi.ts)
// and through the same cores: Studio's join decision (joinPublicCommunityInternal),
// its cancel, and its paid checkout, finalization and claim. Signed out it is a
// read-only public projection; every action needs a session minted on the twin
// (httpCommunityApps enforces that). Access to a paid community comes only from
// the provider's verified webhook, never from Stripe's redirect back.

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
    // An earlier request only counts while the community still asks for
    // approval (as Studio's funnel): a community that went paid shows checkout.
    const approvalGate = gate === "request_access";
    const state: CommunityAppJoinViewerState = access.is_blocked
      ? "blocked"
      : admission.canEnterCommunity
        ? "member"
        : approvalGate && admission.approvalPending
          ? "pending"
          : approvalGate && admission.approvalDenied
            ? "denied"
            : "visitor";
    viewer = { state, can_request_again: admission.canRequestAgain, reapply_at: admission.approvalReapplyAtIso, setup_required: !setup.completed };
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
  const branding = await resolveCommunityBrandingFields(ctx, community);
  const text = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);
  return {
    community: {
      slug: String(community.slug ?? ""),
      name: text(community.name, 120) ?? String(community.slug ?? ""),
      one_liner: text((community as any).oneLiner, 500),
      about: text((community as any).about, 4000),
      member_count: Math.max(0, Math.floor(Number((community as any).activeMemberCount) || 0)),
      avatar_url: branding.avatar_url ?? null,
    },
    gate,
    available: builder.operational,
    action_label: action.label,
    // Only plans Studio would sell (a valid price); each with Studio's "Join $10/month".
    plans: plans.flatMap((plan) => {
      const view = buildCommunityFunnelPrimaryActionView({ mode: "checkout", plan });
      return view.hasValidPaidPlan ? [{ billing_period: plan.billing_period, name: plan.name, label: view.label }] : [];
    }),
    viewer,
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
export const joinCommunityAppVisitorInternal = internalMutation({
  args: { userId: v.id("users"), communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const community = (await ctx.db.get(args.communityId)) as CommunityLike | null;
    if (!community) throw new Error("community_not_found");
    return await joinPublicCommunityInternal({ ctx, community, userId: args.userId, nowMs: Date.now() });
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

// Back from Stripe on the twin: Studio's finalization (the webhook's record,
// never the redirect) and, once it grants access, Studio's claim. Only the
// buyer's own checkout for this community; anything else reads as none at all.
export const finishCommunityAppCheckoutInternal = internalMutation({
  args: { userId: v.id("users"), communityId: v.id("communities"), sessionId: v.string() },
  handler: async (ctx, args): Promise<{ status: "joined" | "pending" | "expired" | "not_found" }> => {
    const row = await ctx.db
      .query("checkoutSessions")
      .withIndex("by_sessionId", (q: any) => q.eq("sessionId", args.sessionId))
      .first();
    if (!row || row.mode !== "community_join" || String(row.communityId) !== String(args.communityId)
      || String(row.ownerUserId ?? "") !== String(args.userId)) {
      return { status: "not_found" };
    }
    const finalization = (await resolveCheckoutSessionFinalization(ctx, args.userId, args.sessionId)) as {
      status: string; claim?: { token: string };
    };
    if (finalization.status === "pending") return { status: "pending" };
    if (finalization.status !== "succeeded" || !finalization.claim?.token) return { status: "expired" };
    await redeemPurchaseClaimForUser(ctx, args.userId, finalization.claim.token);
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

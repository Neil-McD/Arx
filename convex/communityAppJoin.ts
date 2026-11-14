import { canReceiveCommunityRevenue } from "./stripeConnectAccountCore";
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { communityIsActive } from "../shared/communityLifecycle";
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
  hasActiveAppGrant,
  mapActivePlanSummaries,
  mapCommunityAccessRow,
  pickMostRelevantCommunityMembership,
  resolveCommunityBrandingFields,
  resolveCommunityEntryPolicy,
} from "./communityCore";
import { joinPublicCommunityInternal, listCurrentCommunitySellablePlans, rejoinsOnAppPurchase } from "./communityPublic";
import { loadAccountSetupStatusForUserId } from "./accountSetupCore";
import { accountSetupBlocksJoining } from "../shared/accountSetup";
import { readCanonicalPublicAppOrigin } from "./publicAppUrl";
import { PRIVACY_AI_DATA_POLICY_DOCUMENT, TERMS_OF_SERVICE_DOCUMENT, legalDocumentPublicUrl } from "../shared/legalDocuments";
import { attachCommunityCheckoutToUser, sha256Hex } from "./communityCheckoutBuyer";
import { resolveCheckoutSessionFinalization } from "./communityCommerce";
import { communityResourceIsMemberVisiblePage, communityResourceModuleIsMemberLive } from "../shared/communityResourceVisibility";
import { formatPlanPrice } from "../shared/accountCommerce";

// Joining, as the community's landing page shows and runs it (/c/<slug>,
// convex/communityLanding.ts): the same projections as Studio
// (shared/communityJoinPolicy.ts, shared/communityFunnelUi.ts) and the same
// cores: Studio's join decision (joinPublicCommunityInternal), its cancel, and
// its paid checkout, finalization and claim. Access to a paid community comes
// only from the provider's verified webhook, never from Stripe's redirect back.

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

export async function doorstepCourses(ctx: any, communityId: any) {
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
// Every other plan on sale (Manage → Plans), in order: its monthly price, its
// name, and the pods it includes. Tiers are monthly only.
const PLAN_KEY = /^[a-z0-9][a-z0-9-]{0,31}$/;
async function tierPlans(ctx: any, communityId: any) {
  const tiers = (await ctx.db.query("communityTiers").withIndex("by_community_key", (q: any) => q.eq("communityId", communityId)).collect())
    .filter((tier: any) => !tier.archivedAt).sort((a: any, b: any) => a.rank - b.rank);
  const prices = (await ctx.db.query("communityPricePoints")
    .withIndex("by_community_current", (q: any) => q.eq("communityId", communityId).eq("isCurrent", true)).collect())
    .filter((row: any) => !row.archivedAt && row.tierKey && row.billingPeriod === "monthly");
  const out: Array<{ key: string | null; title: string; summary: PublicPlanSummaryLike; includes: string[] }> = [];
  for (const tier of tiers) {
    if (tier.key === "member") continue;
    const price = prices.filter((row: any) => row.tierKey === tier.key).sort((a: any, b: any) => b.updatedAt - a.updatedAt)[0];
    if (!price || !PLAN_KEY.test(tier.key)) continue;
    out.push({ key: tier.key, title: tier.name, summary: mapActivePlanSummaries([price])[0]!, includes: await podNames(ctx, communityId, tier.podChannelIds) });
  }
  return out;
}

async function podNames(ctx: any, communityId: any, channelIds: any[] | undefined): Promise<string[]> {
  const names: string[] = [];
  for (const channelId of channelIds ?? []) {
    const room = await ctx.db.get(channelId) as any;
    if (room && String(room.communityId) === String(communityId) && room.status === "active" && room.accessMode === "restricted") names.push(String(room.name ?? "").slice(0, 60));
  }
  return names.filter(Boolean).slice(0, 4);
}

function plansByPeriod(plans: PublicPlanSummaryLike[]): PublicPlanSummaryLike[] {
  const latest = new Map<string, PublicPlanSummaryLike>();
  for (const plan of plans) latest.set(plan.billing_period, plan);
  return ["monthly", "annual"].flatMap((period) => (latest.has(period) ? [latest.get(period)!] : []));
}

export async function communityAppJoinProjection(ctx: any, community: CommunityLike, userId: any | null) {
  const policyGate: CommunityFunnelAction = deriveCommunityFunnelAction({ entry_policy: resolveCommunityEntryPolicy(community) });
  // One door: someone who left while the community's app still reports their
  // purchase is offered Join, not a second payment (joinPublicCommunityInternal).
  const rejoinOnApp = userId && policyGate !== "join"
    ? rejoinsOnAppPurchase(
      pickMostRelevantCommunityMembership((await ctx.db.query("communityMemberships")
        .withIndex("by_community_user", (q: any) => q.eq("communityId", community._id).eq("userId", userId)).collect()) as CommunityMembershipLike[]),
      await hasActiveAppGrant(ctx, community._id, userId))
    : false;
  const gate: CommunityFunnelAction = rejoinOnApp ? "join" : policyGate;
  // A plan is on sale only while the owner's Stripe account can take the payment;
  // otherwise the join card says checkout is unavailable instead of failing on click.
  const ownerConnectAccount = gate === "checkout"
    ? await ctx.db.query("userStripeConnectAccounts").withIndex("by_user", (q: any) => q.eq("userId", community.ownerId)).first()
    : null;
  const selling = gate === "checkout" && canReceiveCommunityRevenue(ownerConnectAccount);
  const plans = selling ? plansByPeriod(await listCurrentCommunitySellablePlans(ctx, community._id)) : [];
  // The base membership's own name and pods (Manage → Plans), and every other plan on sale.
  const baseTier = selling ? await ctx.db.query("communityTiers")
    .withIndex("by_community_key", (q: any) => q.eq("communityId", community._id).eq("key", "member")).first() : null;
  const baseIncludes = baseTier ? await podNames(ctx, community._id, baseTier.podChannelIds) : [];
  const tiers = selling && plans.length ? await tierPlans(ctx, community._id) : [];
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
  // The owner's sales sections were removed (Nov 13, with custom sites): the
  // join page shows the community, its plans and Join. Stored copy is kept.
  const page = null;
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
      // The sales sections the owner filled in (empty ones don't show).
      page,
    },
    gate,
    available: communityIsActive(community),
    action_label: action.label,
    // Only plans Studio would sell (a valid price); each with Studio's "Join $10/month".
    // Each with what the card needs: a title (the plan's name), the price on its own ("$29"), Studio's "Join $10/month",
    // what it includes, and its key (null for the base membership). Tiers come after the base, monthly.
    plans: [
      ...plans.map((plan) => ({ plan, key: null as string | null, title: baseTier?.name ?? plan.name, includes: baseIncludes })),
      ...tiers.map((tier) => ({ plan: tier.summary, key: tier.key, title: tier.title, includes: tier.includes })),
    ].flatMap(({ plan, key, title, includes }) => {
      const view = buildCommunityFunnelPrimaryActionView({ mode: "checkout", plan });
      const price = formatPlanPrice({ ...plan, billing_period: null });
      return view.hasValidPaidPlan ? [{ billing_period: plan.billing_period, name: plan.name, label: view.label, price, plan: key, title, includes }] : [];
    }),
    viewer,
    // Join's click accepts these (acceptCommunityJoin records it); the page links them.
    terms_url: legalOrigin ? legalDocumentPublicUrl(TERMS_OF_SERVICE_DOCUMENT, legalOrigin) : null,
    privacy_url: legalOrigin ? legalDocumentPublicUrl(PRIVACY_AI_DATA_POLICY_DOCUMENT, legalOrigin) : null,
  };
}

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

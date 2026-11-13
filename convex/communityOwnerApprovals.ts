// Changes the owner's own AI asks for and the owner approves in Studio (Nov 6).
// The AI can't approve its own request: only a click in Studio, from the owner's
// signed-in session, makes the change. One kind so far: where members spend
// time (Polynet's app or the community's own site).
import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { requireCommunityOwner } from "./communityCore";
import { applyCommunityMemberExperience } from "./communityLifecycle";
import { communityHasCustomSite, communityMemberExperience } from "./communitySites";
import { readCanonicalPublicAppOrigin } from "./publicAppUrl";

export const OWNER_APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;
const KIND = "member_experience" as const;
type Experience = "app" | "site";

async function pendingRequest(ctx: any, communityId: any) {
  return await ctx.db
    .query("communityOwnerApprovals")
    .withIndex("by_community_kind_status", (q: any) => q.eq("communityId", communityId).eq("kind", KIND).eq("status", "pending"))
    .first();
}

function publicRequest(row: any) {
  return row ? { request_id: String(row._id), from: row.fromValue, to: row.toValue, expires_at: new Date(row.expiresAt).toISOString() } : null;
}

// Requests were made by the owner's AI (community.member_experience.request),
// retired with custom sites (Nov 13 2026). The cached production app still
// reads and decides any request left waiting, so those stay until it updates.

// What the owner's (or an admin's) AI reads in builder/community.json.
export const readMemberExperienceForTrustedManagerInternal = internalQuery({
  args: { userId: v.id("users"), communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const community = await ctx.db.get(args.communityId);
    if (!community) throw new Error("community_not_found");
    const waiting = await pendingRequest(ctx, community._id);
    return {
      members_use: await communityMemberExperience(ctx, community as any),
      has_custom_site: await communityHasCustomSite(ctx, community._id),
      waiting_for_owner_approval: waiting && waiting.expiresAt > Date.now() ? publicRequest(waiting) : null,
    };
  },
});

// Studio's own owner guard, checked again at decision time: an archived
// community, or one whose builder access lapsed, can't be changed this way.
async function requireOwner(ctx: any, authSubject: string | undefined, communityId: any) {
  const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: authSubject ?? null });
  const { community } = await requireCommunityOwner({ ctx, communityId, userId });
  return { userId, community };
}

// Studio's Settings: the request waiting for the owner, if any (owner only).
export const getMyPendingMemberExperienceRequest = query({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const { community } = await requireOwner(ctx, args.authSubject, args.communityId);
    const waiting = await pendingRequest(ctx, community._id);
    return waiting && waiting.expiresAt > Date.now() ? publicRequest(waiting) : null;
  },
});

// The owner's click. Approving makes the change only if the request is still
// waiting, unexpired, and members still use what it was asked from.
export const decideMemberExperienceRequest = mutation({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    requestId: v.id("communityOwnerApprovals"),
    decision: v.union(v.literal("approve"), v.literal("decline")),
  },
  handler: async (ctx, args) => {
    const { userId, community } = await requireOwner(ctx, args.authSubject, args.communityId);
    const row = await ctx.db.get(args.requestId);
    if (!row || String(row.communityId) !== String(community._id) || row.status !== "pending") {
      throw new Error("community_approval_not_found");
    }
    const nowMs = Date.now();
    const close = (status: "approved" | "declined" | "expired" | "stale") =>
      ctx.db.patch(row._id, { status, decidedByUserId: userId, decidedAt: nowMs });
    if (row.expiresAt <= nowMs) {
      await close("expired");
      return { status: "expired", members_use: await communityMemberExperience(ctx, community as any) };
    }
    if (args.decision === "decline") {
      await close("declined");
      return { status: "declined", members_use: await communityMemberExperience(ctx, community as any) };
    }
    const current = await communityMemberExperience(ctx, community as any);
    if (current !== row.fromValue) {
      await close("stale");
      return { status: "stale", members_use: current };
    }
    const applied = await applyCommunityMemberExperience(ctx, {
      community: community as any, userId, experience: row.toValue as Experience, via: "owner_ai_approved",
    });
    await close("approved");
    return { status: "approved", members_use: applied };
  },
});

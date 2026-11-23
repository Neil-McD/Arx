// Changes the owner's own AI asks for and the owner approves in Studio (Nov 6).
// The AI can't approve its own request: only a click in Studio, from the owner's
// signed-in session, makes the change. One kind so far: where members spend
// time (Polynet's app or the community's own site).
import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { communityHasCustomSite, storedCommunityMemberExperience } from "./communitySites";

export const OWNER_APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;
const KIND = "member_experience" as const;

async function pendingRequest(ctx: any, communityId: any) {
  return await ctx.db
    .query("communityOwnerApprovals")
    .withIndex("by_community_kind_status", (q: any) => q.eq("communityId", communityId).eq("kind", KIND).eq("status", "pending"))
    .first();
}

function publicRequest(row: any) {
  return row ? { request_id: String(row._id), from: row.fromValue, to: row.toValue, expires_at: new Date(row.expiresAt).toISOString() } : null;
}

// What the owner's (or an admin's) AI reads in builder/community.json.
export const readMemberExperienceForTrustedManagerInternal = internalQuery({
  args: { userId: v.id("users"), communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const community = await ctx.db.get(args.communityId);
    if (!community) throw new Error("community_not_found");
    const waiting = await pendingRequest(ctx, community._id);
    return {
      members_use: await storedCommunityMemberExperience(ctx, community as any),
      has_custom_site: await communityHasCustomSite(ctx, community._id),
      waiting_for_owner_approval: waiting && waiting.expiresAt > Date.now() ? publicRequest(waiting) : null,
    };
  },
});

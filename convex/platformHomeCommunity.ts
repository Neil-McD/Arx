import {
  type CommunityLike,
  type CommunityMembershipLike,
  communityMembershipRowIsActive,
  normalizeCommunityRoleForOutput,
  pickMostRelevantCommunityMembership,
  resolveCommunityEntryPolicy,
} from "./communityCore";

const PLATFORM_HOME_COMMUNITY_SLUG = "polynet";

export async function ensurePlatformHomeCommunityMembership(args: {
  ctx: any;
  userId: any;
  nowMs: number;
}): Promise<{
  status:
    | "disabled"
    | "missing"
    | "owner"
    | "not_open"
    | "already_member"
    | "reactivated"
    | "joined";
  communityId: string | null;
}> {
  const slug = String(PLATFORM_HOME_COMMUNITY_SLUG ?? "")
    .trim()
    .toLowerCase();
  if (!slug) {
    return { status: "disabled", communityId: null };
  }

  const community = (await args.ctx.db
    .query("communities")
    .withIndex("by_slug", (q: any) => q.eq("slug", slug))
    .first()) as CommunityLike | null;
  if (!community) {
    return { status: "missing", communityId: null };
  }

  const communityId = String(community._id);
  if (String(community.ownerId) === String(args.userId)) {
    return { status: "owner", communityId };
  }

  if (resolveCommunityEntryPolicy(community) !== "open") {
    return { status: "not_open", communityId };
  }

  const membershipRows = (await args.ctx.db
    .query("communityMemberships")
    .withIndex("by_community_user", (q: any) => q.eq("communityId", community._id).eq("userId", args.userId))
    .collect()) as CommunityMembershipLike[];
  const existingMembership = pickMostRelevantCommunityMembership(membershipRows);
  if (existingMembership && communityMembershipRowIsActive(existingMembership)) {
    return { status: "already_member", communityId };
  }

  await args.ctx.db.insert("communityMemberships", {
    communityId: community._id,
    userId: args.userId,
    role: existingMembership ? normalizeCommunityRoleForOutput(existingMembership.role) || "member" : "member",
    accessSource: "free_grant",
    active: true,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });

  return {
    status: existingMembership ? "reactivated" : "joined",
    communityId,
  };
}

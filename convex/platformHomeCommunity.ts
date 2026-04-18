import {
  type CommunityLike,
  type CommunityJoinRequestLike,
  type CommunityMembershipLike,
  COMMUNITY_JOIN_REAPPLY_COOLDOWN_MS,
  communityMembershipRowIsActive,
  normalizeCommunityRoleForOutput,
  pickMostRelevantCommunityJoinRequest,
  pickMostRelevantCommunityMembership,
  resolveCommunityEntryPolicy,
} from "./communityCore";

const PLATFORM_HOME_COMMUNITY_SLUG = "polynet";
const PLATFORM_HOME_AUTOJOIN_OPT_OUT_MESSAGE = "platform_home_autojoin_opt_out";

export function isPlatformHomeCommunity(args: {
  communitySlug?: string | null;
}): boolean {
  return String(args.communitySlug ?? "")
    .trim()
    .toLowerCase() === PLATFORM_HOME_COMMUNITY_SLUG;
}

async function readPlatformHomeAutojoinOptOutRequest(args: {
  ctx: any;
  communityId: any;
  userId: any;
}): Promise<CommunityJoinRequestLike | null> {
  const joinRequestRows = (await args.ctx.db
    .query("communityJoinRequests")
    .withIndex("by_community_user", (q: any) => q.eq("communityId", args.communityId).eq("userId", args.userId))
    .collect()) as CommunityJoinRequestLike[];
  const joinRequest = pickMostRelevantCommunityJoinRequest(joinRequestRows);
  if (!joinRequest) return null;
  if (String(joinRequest.message ?? "").trim() !== PLATFORM_HOME_AUTOJOIN_OPT_OUT_MESSAGE) return null;
  return joinRequest;
}

export async function clearPlatformHomeCommunityAutojoinOptOut(args: {
  ctx: any;
  communityId: any;
  userId: any;
}): Promise<void> {
  const joinRequest = await readPlatformHomeAutojoinOptOutRequest(args);
  if (!joinRequest) return;
  await args.ctx.db.delete(joinRequest._id as any);
}

export async function upsertPlatformHomeCommunityAutojoinOptOut(args: {
  ctx: any;
  communityId: any;
  userId: any;
  nowMs: number;
  kind: "left" | "removed";
}): Promise<void> {
  const existing = await readPlatformHomeAutojoinOptOutRequest(args);
  const patch =
    args.kind === "removed"
      ? {
          status: "denied",
          message: PLATFORM_HOME_AUTOJOIN_OPT_OUT_MESSAGE,
          deniedAt: args.nowMs,
          reapplyAt: args.nowMs + COMMUNITY_JOIN_REAPPLY_COOLDOWN_MS,
          updatedAt: args.nowMs,
        }
      : {
          status: "canceled",
          message: PLATFORM_HOME_AUTOJOIN_OPT_OUT_MESSAGE,
          updatedAt: args.nowMs,
        };
  if (existing) {
    await args.ctx.db.patch(existing._id as any, patch);
    return;
  }
  await args.ctx.db.insert("communityJoinRequests", {
    communityId: args.communityId,
    userId: args.userId,
    createdAt: args.nowMs,
    ...patch,
  });
}

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

  const autojoinOptOut = await readPlatformHomeAutojoinOptOutRequest({
    ctx: args.ctx,
    communityId: community._id,
    userId: args.userId,
  });
  if (autojoinOptOut) {
    return { status: "disabled", communityId };
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

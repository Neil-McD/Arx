import { internal } from "./_generated/api";
import {
  adjustCommunityActiveMemberCountForMembershipTransition,
  type CommunityLike,
  type CommunityJoinRequestLike,
  type CommunityMembershipLike,
  COMMUNITY_REMOVAL_REAPPLY_COOLDOWN_MS,
  communityMembershipRowIsActive,
  normalizeCommunityRoleForOutput,
  pickMostRelevantCommunityJoinRequest,
  pickMostRelevantCommunityMembership,
  resolveCommunityEntryPolicy,
} from "./communityCore";

const PLATFORM_HOME_COMMUNITY_SLUG = "polynet";
const PLATFORM_HOME_AUTOJOIN_OPT_OUT_MESSAGE = "platform_home_autojoin_opt_out";

async function scheduleCommunityAppGrantSeedingBestEffort(args: {
  ctx: any;
  communityId: any;
  userId: any;
  nowMs: number;
  reason: string;
}): Promise<void> {
  try {
    await args.ctx.scheduler.runAfter(
      0,
      internal.userPlatformAppMounts.seedCommunityAppGrantsForUserInternal,
      {
        communityId: args.communityId,
        userId: args.userId,
        nowMs: args.nowMs,
      },
    );
  } catch (error) {
    console.warn("community_app_grant_seed_schedule_failed", {
      community_id: String(args.communityId),
      user_id: String(args.userId),
      reason: args.reason,
      error: error instanceof Error ? error.message : String(error ?? ""),
    });
  }
}

export type PlatformHomeAutojoinOptOutKind = "left" | "removed";

export type PlatformHomeAutojoinOptOut = {
  kind: PlatformHomeAutojoinOptOutKind;
  request: CommunityJoinRequestLike;
};

export function isPlatformHomeCommunity(args: {
  communitySlug?: string | null;
}): boolean {
  return String(args.communitySlug ?? "")
    .trim()
    .toLowerCase() === PLATFORM_HOME_COMMUNITY_SLUG;
}

function normalizePlatformHomeAutojoinOptOutKind(
  row: CommunityJoinRequestLike | null | undefined,
): PlatformHomeAutojoinOptOutKind | null {
  if (!row) return null;
  if (
    String(row.message ?? "").trim() !== PLATFORM_HOME_AUTOJOIN_OPT_OUT_MESSAGE
  ) {
    return null;
  }
  const status = String(row.status ?? "")
    .trim()
    .toLowerCase();
  if (status === "canceled") return "left";
  if (status === "denied") return "removed";
  return null;
}

export function isPlatformHomeAutojoinOptOutRequest(
  row: CommunityJoinRequestLike | null | undefined,
): boolean {
  return normalizePlatformHomeAutojoinOptOutKind(row) !== null;
}

async function listPlatformHomeAutojoinOptOutRequests(args: {
  ctx: any;
  communityId: any;
  userId: any;
}): Promise<CommunityJoinRequestLike[]> {
  const joinRequestRows = (await args.ctx.db
    .query("communityJoinRequests")
    .withIndex("by_community_user", (q: any) => q.eq("communityId", args.communityId).eq("userId", args.userId))
    .collect()) as CommunityJoinRequestLike[];
  return joinRequestRows
    .filter((row) => isPlatformHomeAutojoinOptOutRequest(row))
    .sort((a, b) => {
      if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
      return b.createdAt - a.createdAt;
    });
}

export async function readPlatformHomeAutojoinOptOut(args: {
  ctx: any;
  communityId: any;
  userId: any;
}): Promise<PlatformHomeAutojoinOptOut | null> {
  const joinRequest = (
    await listPlatformHomeAutojoinOptOutRequests(args)
  )[0] ?? null;
  const kind = normalizePlatformHomeAutojoinOptOutKind(joinRequest);
  if (!joinRequest || !kind) return null;
  return {
    kind,
    request: joinRequest,
  };
}

export async function clearPlatformHomeCommunityAutojoinOptOut(args: {
  ctx: any;
  communityId: any;
  userId: any;
}): Promise<void> {
  const joinRequests = await listPlatformHomeAutojoinOptOutRequests(args);
  await Promise.all(
    joinRequests.map((joinRequest) => args.ctx.db.delete(joinRequest._id as any)),
  );
}

export async function upsertPlatformHomeCommunityAutojoinOptOut(args: {
  ctx: any;
  communityId: any;
  userId: any;
  nowMs: number;
  kind: "left" | "removed";
}): Promise<void> {
  const existing = (
    await listPlatformHomeAutojoinOptOutRequests(args)
  )[0] ?? null;
  const patch =
    args.kind === "removed"
      ? {
          status: "denied",
          message: PLATFORM_HOME_AUTOJOIN_OPT_OUT_MESSAGE,
          deniedAt: args.nowMs,
          reapplyAt: args.nowMs + COMMUNITY_REMOVAL_REAPPLY_COOLDOWN_MS,
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

  const autojoinOptOut = await readPlatformHomeAutojoinOptOut({
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
    await scheduleCommunityAppGrantSeedingBestEffort({
      ctx: args.ctx,
      communityId: community._id,
      userId: args.userId,
      nowMs: args.nowMs,
      reason: "platform_home_autojoin_already_member",
    });
    return { status: "already_member", communityId };
  }

  const membershipId = await args.ctx.db.insert("communityMemberships", {
    communityId: community._id,
    userId: args.userId,
    role: existingMembership ? normalizeCommunityRoleForOutput(existingMembership.role) || "member" : "member",
    accessSource: "free_grant",
    active: true,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  await adjustCommunityActiveMemberCountForMembershipTransition({
    ctx: args.ctx,
    communityId: community._id,
    before: null,
    after: {
      _id: membershipId,
      communityId: community._id,
      userId: args.userId,
      role: existingMembership ? normalizeCommunityRoleForOutput(existingMembership.role) || "member" : "member",
      accessSource: "free_grant",
      active: true,
      createdAt: args.nowMs,
      updatedAt: args.nowMs,
    },
  });
  await scheduleCommunityAppGrantSeedingBestEffort({
    ctx: args.ctx,
    communityId: community._id,
    userId: args.userId,
    nowMs: args.nowMs,
    reason: "platform_home_autojoin_joined",
  });

  return {
    status: existingMembership ? "reactivated" : "joined",
    communityId,
  };
}

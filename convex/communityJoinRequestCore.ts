export const COMMUNITY_JOIN_REAPPLY_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
export const COMMUNITY_REMOVAL_REAPPLY_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

export type CommunityJoinRequestStatus = "pending" | "denied";

export type CommunityJoinRequestLike = {
  _id: any;
  communityId: any;
  userId: any;
  status: string;
  deniedAt?: number;
  reapplyAt?: number;
  createdAt: number;
  updatedAt: number;
};

export function normalizeCommunityJoinRequestStatus(
  raw: unknown,
): CommunityJoinRequestStatus | null {
  const status = String(raw ?? "").trim().toLowerCase();
  return status === "pending" || status === "denied" ? status : null;
}

export function assertCanonicalCommunityJoinRequest(
  request: CommunityJoinRequestLike,
): CommunityJoinRequestStatus {
  const status = normalizeCommunityJoinRequestStatus(request.status);
  if (!status) throw new Error("community_join_request_status_invalid");
  if (status === "pending") {
    if (request.deniedAt !== undefined || request.reapplyAt !== undefined) {
      throw new Error("community_join_request_pending_fields_invalid");
    }
    return status;
  }
  if (
    typeof request.deniedAt !== "number" ||
    !Number.isFinite(request.deniedAt) ||
    typeof request.reapplyAt !== "number" ||
    !Number.isFinite(request.reapplyAt) ||
    request.reapplyAt <= request.deniedAt
  ) {
    throw new Error("community_join_request_denial_fields_invalid");
  }
  return status;
}

export async function getUniqueCommunityJoinRequestByPair(args: {
  ctx: any;
  communityId: any;
  userId: any;
}): Promise<CommunityJoinRequestLike | null> {
  try {
    return (await args.ctx.db
      .query("communityJoinRequests")
      .withIndex("by_community_user", (q: any) =>
        q.eq("communityId", args.communityId).eq("userId", args.userId),
      )
      .unique()) as CommunityJoinRequestLike | null;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith(
        "unique() query returned more than one result from table communityJoinRequests",
      )
    ) {
      throw new Error("community_join_request_pair_not_unique");
    }
    throw error;
  }
}

export function communityJoinRequestCanReapply(
  request: CommunityJoinRequestLike,
  nowMs: number,
): boolean {
  const status = assertCanonicalCommunityJoinRequest(request);
  return status === "denied" && request.reapplyAt! <= nowMs;
}

export async function ensurePendingCommunityJoinRequest(args: {
  ctx: any;
  communityId: any;
  userId: any;
  nowMs: number;
}): Promise<CommunityJoinRequestLike> {
  const existing = await getUniqueCommunityJoinRequestByPair(args);
  if (!existing) {
    const id = await args.ctx.db.insert("communityJoinRequests", {
      communityId: args.communityId,
      userId: args.userId,
      status: "pending",
      createdAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    const created = (await args.ctx.db.get(id)) as CommunityJoinRequestLike | null;
    if (!created) throw new Error("join_request_create_failed");
    return created;
  }

  const status = assertCanonicalCommunityJoinRequest(existing);
  if (status === "pending" || !communityJoinRequestCanReapply(existing, args.nowMs)) {
    return existing;
  }
  await args.ctx.db.patch(existing._id, {
    status: "pending",
    deniedAt: undefined,
    reapplyAt: undefined,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  const reopened = (await args.ctx.db.get(existing._id)) as CommunityJoinRequestLike | null;
  if (!reopened) throw new Error("join_request_reopen_failed");
  return reopened;
}

export async function denyCommunityJoinRequest(args: {
  ctx: any;
  request: CommunityJoinRequestLike;
  nowMs: number;
  cooldownMs: number;
}): Promise<{ request: CommunityJoinRequestLike; changed: boolean }> {
  const status = assertCanonicalCommunityJoinRequest(args.request);
  if (status === "denied") {
    return { request: args.request, changed: false };
  }
  await args.ctx.db.patch(args.request._id, {
    status: "denied",
    deniedAt: args.nowMs,
    reapplyAt: args.nowMs + args.cooldownMs,
    updatedAt: args.nowMs,
  });
  const denied = (await args.ctx.db.get(args.request._id)) as CommunityJoinRequestLike | null;
  if (!denied) throw new Error("join_request_deny_failed");
  return { request: denied, changed: true };
}

export async function ensureDeniedCommunityJoinRequest(args: {
  ctx: any;
  communityId: any;
  userId: any;
  nowMs: number;
  cooldownMs: number;
}): Promise<{ request: CommunityJoinRequestLike; changed: boolean }> {
  const existing = await getUniqueCommunityJoinRequestByPair(args);
  if (existing) {
    return await denyCommunityJoinRequest({
      ctx: args.ctx,
      request: existing,
      nowMs: args.nowMs,
      cooldownMs: args.cooldownMs,
    });
  }
  const id = await args.ctx.db.insert("communityJoinRequests", {
    communityId: args.communityId,
    userId: args.userId,
    status: "denied",
    deniedAt: args.nowMs,
    reapplyAt: args.nowMs + args.cooldownMs,
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  const denied = (await args.ctx.db.get(id)) as CommunityJoinRequestLike | null;
  if (!denied) throw new Error("join_request_deny_failed");
  return { request: denied, changed: true };
}

export async function deleteCommunityJoinRequestByPair(args: {
  ctx: any;
  communityId: any;
  userId: any;
}): Promise<boolean> {
  const existing = await getUniqueCommunityJoinRequestByPair(args);
  if (!existing) return false;
  await args.ctx.db.delete(existing._id);
  return true;
}

export async function cancelPendingCommunityJoinRequest(args: {
  ctx: any;
  communityId: any;
  userId: any;
}): Promise<{ outcome: "none" | "canceled" | "ignored"; status?: CommunityJoinRequestStatus }> {
  const existing = await getUniqueCommunityJoinRequestByPair(args);
  if (!existing) return { outcome: "none" };
  const status = assertCanonicalCommunityJoinRequest(existing);
  if (status === "denied") return { outcome: "ignored", status };
  await args.ctx.db.delete(existing._id);
  return { outcome: "canceled" };
}

export async function deletePendingCommunityJoinRequestsBatch(args: {
  ctx: any;
  communityId: any;
  limit: number;
}): Promise<{ deletedCount: number; hasMore: boolean }> {
  const rows = (await args.ctx.db
    .query("communityJoinRequests")
    .withIndex("by_community_status_createdAt", (q: any) =>
      q.eq("communityId", args.communityId).eq("status", "pending"),
    )
    .order("asc")
    .take(args.limit + 1)) as CommunityJoinRequestLike[];
  const batch = rows.slice(0, args.limit);
  for (const row of batch) {
    assertCanonicalCommunityJoinRequest(row);
    const unique = await getUniqueCommunityJoinRequestByPair({
      ctx: args.ctx,
      communityId: row.communityId,
      userId: row.userId,
    });
    if (!unique || String(unique._id) !== String(row._id)) {
      throw new Error("community_join_request_pair_not_unique");
    }
    await args.ctx.db.delete(unique._id);
  }
  return { deletedCount: batch.length, hasMore: rows.length > args.limit };
}

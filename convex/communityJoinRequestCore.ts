export const COMMUNITY_JOIN_REAPPLY_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
export const COMMUNITY_REMOVAL_REAPPLY_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

export type CommunityJoinRequestStatus = "pending" | "denied";

export type CommunityJoinRequestLike = {
  _id: any;
  communityId: any;
  userId: any;
  status: string;
  message?: string;
  deniedAt?: number;
  reapplyAt?: number;
  createdAt: number;
  updatedAt: number;
};

const COMMUNITY_JOIN_REQUEST_PAIR_READ_LIMIT = 4;

type CommunityJoinRequestPairState = {
  rows: CommunityJoinRequestLike[];
  current: CommunityJoinRequestLike | null;
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
  if (request.message !== undefined) {
    throw new Error("community_join_request_message_invalid");
  }
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

function resolveCompatibleCommunityJoinRequestPair(
  rows: CommunityJoinRequestLike[],
): CommunityJoinRequestLike | null {
  const current: CommunityJoinRequestLike[] = [];
  for (const row of rows) {
    const rawStatus = String(row.status ?? "").trim().toLowerCase();
    if (rawStatus === "approved" || rawStatus === "canceled") continue;
    if (rawStatus !== "pending" && rawStatus !== "denied") {
      throw new Error("community_join_request_state_ambiguous");
    }
    assertCanonicalCommunityJoinRequest(row);
    current.push(row);
  }
  if (current.length === 0) return null;
  if (current.length === 1) return current[0]!;
  if (current.length !== 2) {
    throw new Error("community_join_request_state_ambiguous");
  }
  const pending = current.find(
    (row) => normalizeCommunityJoinRequestStatus(row.status) === "pending",
  ) ?? null;
  const denied = current.find(
    (row) => normalizeCommunityJoinRequestStatus(row.status) === "denied",
  ) ?? null;
  if (
    pending &&
    denied &&
    typeof denied.reapplyAt === "number" &&
    pending.createdAt >= denied.reapplyAt &&
    pending.updatedAt >= denied.updatedAt
  ) {
    return pending;
  }
  throw new Error("community_join_request_state_ambiguous");
}

async function loadCompatibleCommunityJoinRequestPair(args: {
  ctx: any;
  communityId: any;
  userId: any;
}): Promise<CommunityJoinRequestPairState> {
  const rows = (await args.ctx.db
    .query("communityJoinRequests")
    .withIndex("by_community_user", (q: any) =>
      q.eq("communityId", args.communityId).eq("userId", args.userId),
    )
    .order("desc")
    .take(COMMUNITY_JOIN_REQUEST_PAIR_READ_LIMIT)) as CommunityJoinRequestLike[];
  if (rows.length === COMMUNITY_JOIN_REQUEST_PAIR_READ_LIMIT) {
    throw new Error("community_join_request_state_ambiguous");
  }
  return { rows, current: resolveCompatibleCommunityJoinRequestPair(rows) };
}

export async function getCurrentCommunityJoinRequestByPair(args: {
  ctx: any;
  communityId: any;
  userId: any;
}): Promise<CommunityJoinRequestLike | null> {
  return (await loadCompatibleCommunityJoinRequestPair(args)).current;
}

async function deletePairRowsExcept(args: {
  ctx: any;
  rows: CommunityJoinRequestLike[];
  keepId?: any;
}): Promise<void> {
  for (const row of args.rows) {
    if (args.keepId && String(row._id) === String(args.keepId)) continue;
    await args.ctx.db.delete(row._id);
  }
}

export function communityJoinRequestCanReapply(
  request: CommunityJoinRequestLike,
  nowMs: number,
): boolean {
  const status = assertCanonicalCommunityJoinRequest(request);
  return status === "denied" && request.reapplyAt! <= nowMs;
}

export function resolveCommunityJoinRequestReapplyAtMs(
  request: CommunityJoinRequestLike | null | undefined,
): number | null {
  if (!request) return null;
  return assertCanonicalCommunityJoinRequest(request) === "denied"
    ? request.reapplyAt!
    : null;
}

export async function ensurePendingCommunityJoinRequest(args: {
  ctx: any;
  communityId: any;
  userId: any;
  nowMs: number;
}): Promise<CommunityJoinRequestLike> {
  const pair = await loadCompatibleCommunityJoinRequestPair(args);
  const existing = pair.current;
  if (!existing) {
    await deletePairRowsExcept({ ctx: args.ctx, rows: pair.rows });
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

  await deletePairRowsExcept({
    ctx: args.ctx,
    rows: pair.rows,
    keepId: existing._id,
  });

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

export async function denyCommunityJoinRequestCore(args: {
  ctx: any;
  request: CommunityJoinRequestLike;
  nowMs: number;
  cooldownMs: number;
}): Promise<{ request: CommunityJoinRequestLike; changed: boolean }> {
  const pair = await loadCompatibleCommunityJoinRequestPair({
    ctx: args.ctx,
    communityId: args.request.communityId,
    userId: args.request.userId,
  });
  if (!pair.current || String(pair.current._id) !== String(args.request._id)) {
    throw new Error("community_join_request_state_ambiguous");
  }
  await deletePairRowsExcept({
    ctx: args.ctx,
    rows: pair.rows,
    keepId: args.request._id,
  });
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
  const pair = await loadCompatibleCommunityJoinRequestPair(args);
  const existing = pair.current;
  if (existing) {
    await deletePairRowsExcept({
      ctx: args.ctx,
      rows: pair.rows,
      keepId: existing._id,
    });
    return await denyCommunityJoinRequestCore({
      ctx: args.ctx,
      request: existing,
      nowMs: args.nowMs,
      cooldownMs: args.cooldownMs,
    });
  }
  await deletePairRowsExcept({ ctx: args.ctx, rows: pair.rows });
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
  const pair = await loadCompatibleCommunityJoinRequestPair(args);
  if (pair.rows.length === 0) return false;
  await deletePairRowsExcept({ ctx: args.ctx, rows: pair.rows });
  return true;
}

export async function cancelPendingCommunityJoinRequest(args: {
  ctx: any;
  communityId: any;
  userId: any;
}): Promise<{
  outcome: "none" | "canceled" | "ignored";
  status?: CommunityJoinRequestStatus;
}> {
  const pair = await loadCompatibleCommunityJoinRequestPair(args);
  const existing = pair.current;
  if (!existing) {
    await deletePairRowsExcept({ ctx: args.ctx, rows: pair.rows });
    return { outcome: "none" };
  }
  const status = assertCanonicalCommunityJoinRequest(existing);
  if (status === "denied") {
    await deletePairRowsExcept({
      ctx: args.ctx,
      rows: pair.rows,
      keepId: existing._id,
    });
    return { outcome: "ignored", status };
  }
  await deletePairRowsExcept({ ctx: args.ctx, rows: pair.rows });
  return { outcome: "canceled" };
}

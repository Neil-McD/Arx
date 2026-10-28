export type CommunityFunnelAction = "join" | "request_access" | "checkout";
export type CommunityEntryPolicy = "open" | "approval" | "paid_subscription";
export type CommunityMembersJoinReviewMode = "paid" | "free_auto" | "free_approval";
export type CommunityJoinRequestStatus = "pending" | "denied";

export type PublicCommunityAdmissionProjection = {
  canEnterCommunity: boolean;
  joinRequestStatus: CommunityJoinRequestStatus | null;
  approvalPending: boolean;
  approvalDenied: boolean;
  approvalReapplyAtIso: string | null;
  approvalReapplyAtMs: number | null;
  canRequestAgain: boolean;
};

export function isCommunityEntryPolicy(value: unknown): value is CommunityEntryPolicy {
  return value === "open" || value === "approval" || value === "paid_subscription";
}

export function deriveCommunityFunnelAction(args: {
  entry_policy?: unknown;
}): CommunityFunnelAction {
  if (isCommunityEntryPolicy(args.entry_policy)) {
    if (args.entry_policy === "paid_subscription") return "checkout";
    if (args.entry_policy === "approval") return "request_access";
    return "join";
  }
  return "request_access";
}

export function deriveCommunityMembersJoinReviewMode(args: {
  entry_policy?: unknown;
}): CommunityMembersJoinReviewMode {
  if (isCommunityEntryPolicy(args.entry_policy)) {
    if (args.entry_policy === "paid_subscription") return "paid";
    if (args.entry_policy === "approval") return "free_approval";
    return "free_auto";
  }
  return "free_approval";
}

export function derivePublicCommunityAdmissionProjection(args: {
  access?: {
    can_enter_community?: boolean;
    is_owner?: boolean;
    join_request_status?: unknown;
    join_request_reapply_at?: unknown;
  } | null;
  nowMs?: number;
}): PublicCommunityAdmissionProjection {
  const canEnterCommunity = Boolean(
    args.access && (args.access.can_enter_community || args.access.is_owner),
  );
  const rawStatus = !canEnterCommunity
    ? args.access?.join_request_status
    : null;
  const joinRequestStatus: CommunityJoinRequestStatus | null =
    rawStatus === "pending" || rawStatus === "denied" ? rawStatus : null;
  const approvalPending = joinRequestStatus === "pending";
  const approvalDenied = joinRequestStatus === "denied";
  const rawReapplyAt = approvalDenied
    ? args.access?.join_request_reapply_at
    : null;
  const approvalReapplyAtIso =
    typeof rawReapplyAt === "string" && rawReapplyAt.trim()
      ? rawReapplyAt.trim()
      : null;
  const parsedReapplyAtMs = approvalReapplyAtIso
    ? Date.parse(approvalReapplyAtIso)
    : Number.NaN;
  const approvalReapplyAtMs = Number.isFinite(parsedReapplyAtMs)
    ? parsedReapplyAtMs
    : null;
  const nowMs = Number.isFinite(args.nowMs) ? Number(args.nowMs) : Date.now();
  return {
    canEnterCommunity,
    joinRequestStatus,
    approvalPending,
    approvalDenied,
    approvalReapplyAtIso,
    approvalReapplyAtMs,
    canRequestAgain: Boolean(
      approvalDenied &&
        approvalReapplyAtMs !== null &&
        approvalReapplyAtMs <= nowMs,
    ),
  };
}

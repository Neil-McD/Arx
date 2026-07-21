export type CommunityFunnelAction = "join" | "request_access" | "checkout";
export type CommunityEntryPolicy = "open" | "approval" | "paid_subscription";
export type CommunityMembersJoinReviewMode = "paid" | "free_auto" | "free_approval";
export type CommunityJoinRequestStatus = "pending" | "denied";
export type PublicCommunityAdmissionStatus = "ready" | "verifying" | "blocked" | "unavailable";
export type PublicCommunityAccessResolution =
  | {
      status: "not_required";
      communitySlug: null;
      authSubject: null;
    }
  | {
      status: "verifying" | "ready";
      communitySlug: string;
      authSubject: string;
    }
  | {
      status: "unavailable";
      communitySlug: string;
      authSubject: string | null;
    };

export type PublicCommunityLoadSnapshot = {
  generation: number;
  communitySlug: string;
  authSubject: string | null;
};

export type PublicCommunityAdmissionProjection = {
  status: PublicCommunityAdmissionStatus;
  canEnterCommunity: boolean;
  joinRequestStatus: CommunityJoinRequestStatus | null;
  approvalPending: boolean;
  approvalDenied: boolean;
  approvalReapplyAtIso: string | null;
  approvalReapplyAtMs: number | null;
  canRequestAgain: boolean;
};

function normalizeAuthorityValue(value: unknown): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

export function isPublicCommunityLoadSnapshotCurrent(args: {
  snapshot: PublicCommunityLoadSnapshot;
  current: PublicCommunityLoadSnapshot;
}): boolean {
  return (
    args.snapshot.generation === args.current.generation &&
    normalizeAuthorityValue(args.snapshot.communitySlug) ===
      normalizeAuthorityValue(args.current.communitySlug) &&
    normalizeAuthorityValue(args.snapshot.authSubject) ===
      normalizeAuthorityValue(args.current.authSubject)
  );
}

function publicCommunityAccessResolutionIsCurrent(args: {
  accessResolution: PublicCommunityAccessResolution;
  communitySlug: string | null;
  authSubject: string | null;
}): boolean {
  if (args.accessResolution.status === "not_required") return false;
  return (
    normalizeAuthorityValue(args.accessResolution.communitySlug) ===
      normalizeAuthorityValue(args.communitySlug) &&
    normalizeAuthorityValue(args.accessResolution.authSubject) ===
      normalizeAuthorityValue(args.authSubject)
  );
}

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
    is_blocked?: unknown;
    join_request_status?: unknown;
    join_request_reapply_at?: unknown;
  } | null;
  accessResolution: PublicCommunityAccessResolution;
  authSubject: string | null;
  communitySlug: string | null;
  isSignedIn: boolean;
  isPreviewMode?: boolean;
  nowMs?: number;
}): PublicCommunityAdmissionProjection {
  const isPreviewMode = args.isPreviewMode === true;
  let status: PublicCommunityAdmissionStatus = "ready";
  if (!isPreviewMode && args.isSignedIn) {
    const authSubject = normalizeAuthorityValue(args.authSubject);
    if (!authSubject) {
      status = "unavailable";
    } else if (
      !publicCommunityAccessResolutionIsCurrent({
        accessResolution: args.accessResolution,
        communitySlug: args.communitySlug,
        authSubject,
      }) || args.accessResolution.status === "verifying"
    ) {
      status = "verifying";
    } else if (
      args.accessResolution.status === "unavailable" ||
      !args.access ||
      typeof args.access.is_blocked !== "boolean"
    ) {
      status = "unavailable";
    } else if (args.access.is_blocked) {
      status = "blocked";
    }
  }

  const canProjectAuthenticatedAccess =
    !isPreviewMode && args.isSignedIn && status === "ready";
  const canEnterCommunity = canProjectAuthenticatedAccess && Boolean(
    args.access && (args.access.can_enter_community || args.access.is_owner),
  );
  const rawStatus = canProjectAuthenticatedAccess && !canEnterCommunity
    ? args.access?.join_request_status
    : null;
  const joinRequestStatus: CommunityJoinRequestStatus | null =
    rawStatus === "pending" || rawStatus === "denied" ? rawStatus : null;
  const approvalPending = joinRequestStatus === "pending";
  const approvalDenied = joinRequestStatus === "denied";
  const rawReapplyAt = approvalDenied ? args.access?.join_request_reapply_at : null;
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
    status,
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

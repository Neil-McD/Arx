import { memberAccessChanged } from "./communityPlanPods";
import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { schedulePodBillingCheck } from "./communityPodBillingCheck";
import { removeUserFromPodHosts } from "./communityPods";
import {
  maybeScheduleMemberSearchBackfill,
  syncCommunityMemberSearchEntry,
} from "./communityMemberSearch";
import { communityHasCustomSite, communityMemberExperience } from "./communitySites";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { communitySubscriptionStatusFields, endCommunitySubscription } from "./communitySubscriptionLifecycle";
import {
  type CommunityBlockLike,
  type CommunityLike,
  type CommunityMemberSettingsLike,
  type CommunityMembershipLike,
  type CommunitySubscriptionLike,
  adjustCommunityActiveMemberCountForMembershipTransition,
  communityMembershipRowIsActive,
  communityMembershipState,
  communitySubscriptionStatusGrantsAccess,
  countCanonicalCommunityMembers,
  getCommunityAndMembership,
  getActiveCommunityBlock,
  getUniqueCommunityMembershipByPair,
  listCanonicalCommunityMemberMembershipRows,
  listCommunityMembershipRowsForManager,
  mapCommunityMemberSettingsRow,
  normalizeCommunityRoleForOutput,
  normalizeRoleAssignment,
  parseIsoMs,
  pickMostRelevantCommunityMembership,
  readCommunityActiveMemberCount,
  requireCommunityChatAccess,
  requireCommunityModerator,
  requireCommunityManager,
  requireCommunityUserNotBlocked,
  resolveCommunityLens,
  resolveCommunityEntryPolicy,
  resolveCommunityBrandingFields,
  buildCommunityVisualIdentity,
  resolvePublicUserId,
  resolveUserIdForAuthenticatedRequest,
  syncCommunityActiveMemberCount,
  toIsoString,
} from "./communityCore";
import {
  COMMUNITY_JOIN_REAPPLY_COOLDOWN_MS,
  COMMUNITY_REMOVAL_REAPPLY_COOLDOWN_MS,
  type CommunityJoinRequestLike,
  assertCanonicalCommunityJoinRequest,
  deleteCommunityJoinRequestByPair,
  denyCommunityJoinRequestCore,
  ensureDeniedCommunityJoinRequest,
  getCurrentCommunityJoinRequestByPair,
} from "./communityJoinRequestCore";
import { logStructuredError } from "./errorLogging";
import { cancelStripeSubscriptionAtPeriodEnd, cancelStripeSubscriptionIfActive } from "./stripeSubscriptionCancellation";
import {
  endedCommunityMembershipFields,
  COMMUNITY_MEMBER_LEFT_REASON,
} from "./communityMembershipLifecycle";
import { deleteCommunityReadCursorsForUserCommunity } from "./communityReadCursorCore";
import { deleteCommunityPresenceForUser } from "./communityPresenceCore";
import { communityIsActive } from "../shared/communityLifecycle";
import { recordCriticalAuditEvent } from "./criticalAudit";
import { markCommunityMemberViewCountsStale } from "./communityMemberRecords";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import {
  type AnalyticsRangeValue,
  communityAnalyticsDocument,
  computeCommunityAnalyticsSnapshot,
  normalizeAnalyticsRange,
  tryComputeCommunityAnalyticsFromRollups,
} from "./communityAdminAnalyticsCore";
import {
  buildCommunityMemberBillingHistory,
  normalizeBillingHistoryLimit,
} from "./communityAdminBillingHistoryCore";
import {
  approveCommunityJoinRequestForFreeAccess,
  approvePendingJoinRequestsForOpenAccessBatch,
  resolveCommunityJoinRequestDecision,
  scheduleOpenAccessPendingApprovalContinuation,
} from "./communityAdminAdmissionsCore";

export { communityAnalyticsDocument };

const OPEN_ACCESS_PENDING_APPROVAL_BATCH_LIMIT = 100;

async function resolveCommunityAdminMembersContext(args: {
  ctx: any;
  userId?: any;
  authSubject?: string | null;
  communityId: any;
}): Promise<{
  userId: any;
  community: CommunityLike;
  viewerCanManageMembers: boolean;
}> {
  const userId = await resolveUserIdForAuthenticatedRequest({
    ctx: args.ctx,
    userId: args.userId,
    authSubject: args.authSubject ?? null,
  });
  const { community, membership: viewerMembership } = await getCommunityAndMembership({
    ctx: args.ctx,
    communityId: args.communityId,
    userId,
  });
  const lens = await resolveCommunityLens({ ctx: args.ctx, community, membership: viewerMembership, userId });
  if (lens.unavailableCode) throw new Error(lens.unavailableCode);
  if (lens.isBlocked) throw new Error("community_user_blocked");
  if (!lens.can.readChat) throw new Error("community_entitlement_required");
  return {
    userId,
    community,
    viewerCanManageMembers: lens.can.manageMembers,
  };
}

async function endCommunitySubscriptionsForMembership(args: {
  ctx: any;
  membershipId: any;
  nowMs: number;
}): Promise<void> {
  const rows = await args.ctx.db
    .query("communitySubscriptions" as any)
    .withIndex("by_membership", (q: any) =>
      q.eq("membershipId", args.membershipId),
    )
    .collect();
  for (const row of rows) await endCommunitySubscription(args.ctx, row, args.nowMs);
}

async function listCommunitySubscriptionRowsForMembership(args: {
  ctx: any;
  membershipId: any;
}): Promise<CommunitySubscriptionLike[]> {
  return (await args.ctx.db
    .query("communitySubscriptions" as any)
    .withIndex("by_membership", (q: any) =>
      q.eq("membershipId", args.membershipId),
    )
    .collect()) as CommunitySubscriptionLike[];
}

function isCommunityOwnerUser(community: CommunityLike, userId: any): boolean {
  return String(community.ownerId) === String(userId);
}

function requireOwnerForAdminAuthorityChange(args: {
  community: CommunityLike;
  actorUserId: any;
  targetMembership: CommunityMembershipLike;
  nextRole?: "admin" | "moderator" | "member" | null;
}): void {
  const currentRole = normalizeCommunityRoleForOutput(args.targetMembership.role) || "member";
  const nextRole = args.nextRole ?? currentRole;
  if (
    (currentRole === "admin" || nextRole === "admin") &&
    !isCommunityOwnerUser(args.community, args.actorUserId)
  ) {
    throw new Error("community_owner_required_for_admin_role");
  }
}

async function runLoggedCommunityAdminMutation<T>(params: {
  operation: string;
  context: Record<string, unknown>;
  handler: () => Promise<T>;
}): Promise<T> {
  try {
    return await params.handler();
  } catch (error) {
    const errorMessage =
      error instanceof Error && typeof error.message === "string"
        ? error.message.trim()
        : "";
    const expectedDomainErrors = new Set([
      "join_request_not_found",
      "community_membership_not_found",
      "community_owner_role_fixed",
      "community_owner_remove_forbidden",
      "community_free_access_mode_invalid",
      "community_not_found",
      "community_owner_cannot_leave",
      "community_paid_checkout_required",
      "join_request_already_decided",
      "community_forbidden",
      "community_owner_required",
      "community_entitlement_required",
    ]);
    if (expectedDomainErrors.has(errorMessage)) {
      throw error;
    }
    logStructuredError("community_admin_mutation_failed", {
      error,
      operation: params.operation,
      ...params.context,
    });
    throw error;
  }
}

export const listCommunityMemberships = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    selectMode: v.optional(v.union(v.literal("full"), v.literal("minimal"))),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const selectMode = args.selectMode ?? "full";
    const membershipRows = (await ctx.db
      .query("communityMemberships")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()) as CommunityMembershipLike[];
    const membershipRowsByCommunityId = new Map<
      string,
      CommunityMembershipLike[]
    >();
    for (const row of membershipRows) {
      const key = String(row.communityId);
      const existing = membershipRowsByCommunityId.get(key);
      if (existing) {
        existing.push(row);
      } else {
        membershipRowsByCommunityId.set(key, [row]);
      }
    }
    const effectiveRows = Array.from(membershipRowsByCommunityId.values())
      .map((rows) => pickMostRelevantCommunityMembership(rows))
      .filter((row): row is CommunityMembershipLike => Boolean(row))
      .sort((a, b) => a.createdAt - b.createdAt);
    const ownedCommunities = (await ctx.db
      .query("communities")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .collect()) as CommunityLike[];
    const userIdCache = new Map<string, string | null>();

    const buildCommunityProjection = async (community: CommunityLike, role: string) => {
      const branding = await resolveCommunityBrandingFields(ctx, community);
      const base = {
        id: String(community._id),
        slug: community.slug,
        name: community.name,
        owner_id:
          (await resolvePublicUserId(ctx, community.ownerId, userIdCache)) ??
          String(community.ownerId),
        created_at: toIsoString(community.createdAt),
        branding_revision: community.brandingRevision ?? community.updatedAt,
        visual_identity: buildCommunityVisualIdentity(community, branding),
        // Its own site (null where it has none); where its members spend time,
        // the owner's switch; and whether a site of its own is deployed (the
        // switch's "site" choice needs one).
      };
      return selectMode === "minimal"
        ? base
        : {
            ...base,
            one_liner: community.oneLiner ?? null,
            about: community.about ?? null,
            avatar_url: branding.avatar_url,
            avatar_storage_id: branding.avatar_storage_id,
            avatar_focus_x: branding.avatar_focus_x,
            avatar_focus_y: branding.avatar_focus_y,
            avatar_zoom: branding.avatar_zoom,
            banner_url: branding.banner_url,
            banner_storage_id: branding.banner_storage_id,
            banner_focus_x: branding.banner_focus_x,
            banner_focus_y: branding.banner_focus_y,
            banner_zoom: branding.banner_zoom,
            visibility: community.visibility,
            entry_policy: resolveCommunityEntryPolicy(community),
            builder_knowledge_setup_pending:
              role === "owner" && community.builderKnowledgeSetupPending === true,
            updated_at: toIsoString(community.updatedAt),
          };
    };

    const out: Array<{
      sort_ms: number;
      community_id: string;
      role: string;
      communities: Record<string, unknown>;
    }> = [];
    for (const community of ownedCommunities
      .filter((row) => communityIsActive(row))
      .slice()
      .sort((a, b) => a.createdAt - b.createdAt)) {
      out.push({
        sort_ms: community.createdAt,
        community_id: String(community._id),
        role: "owner",
        communities: await buildCommunityProjection(community, "owner"),
      });
    }
    for (const row of effectiveRows) {
      const community = (await ctx.db.get(
        row.communityId,
      )) as CommunityLike | null;
      if (!community || !communityIsActive(community)) continue;
      if (String(community.ownerId) === String(row.userId)) continue;
      const lens = await resolveCommunityLens({ ctx, community, membership: row, userId: row.userId });
      if (!lens.membershipEntitled) continue;
      if (out.some((entry) => entry.community_id === String(row.communityId)))
        continue;
      const role = normalizeCommunityRoleForOutput(row.role) || "member";
      out.push({
        sort_ms: row.createdAt,
        community_id: String(row.communityId),
        role,
        communities: await buildCommunityProjection(community, role),
      });
    }
    return out
      .sort((a, b) => a.sort_ms - b.sort_ms)
      .map(({ sort_ms: _sortMs, ...row }) => row);
  },
});

export const getCommunityMemberBillingHistory = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    targetMembershipId: v.id("communityMemberships"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = normalizeBillingHistoryLimit(args.limit);
    const { community, viewerCanManageMembers } =
      await resolveCommunityAdminMembersContext({
        ctx,
        userId: args.userId,
        authSubject: args.authSubject ?? null,
        communityId: args.communityId,
      });
    if (!viewerCanManageMembers) throw new Error("community_forbidden");

    const membership = (await ctx.db.get(
      args.targetMembershipId,
    )) as CommunityMembershipLike | null;
    if (!membership || String(membership.communityId) !== String(args.communityId)) {
      throw new Error("community_membership_not_found");
    }

    const subscriptions = await listCommunitySubscriptionRowsForMembership({
      ctx,
      membershipId: membership._id,
    });
    return await buildCommunityMemberBillingHistory({
      ctx,
      communityId: community._id,
      membershipId: membership._id,
      subscriptions,
      limit,
    });
  },
});

export const countCommunityMemberships = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    sinceIso: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const sinceMs = parseIsoMs(args.sinceIso);
    const { community } = await resolveCommunityAdminMembersContext({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
      communityId: args.communityId,
    });
    if (sinceMs === null) {
      return await countCanonicalCommunityMembers({
        ctx,
        communityId: args.communityId,
        community,
      });
    }
    const rows = (await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_createdAt", (q) =>
        q.eq("communityId", args.communityId),
      )
      .collect()) as CommunityMembershipLike[];
    const ownerIncluded =
      sinceMs === null || community.createdAt >= sinceMs ? 1 : 0;
    return (
      ownerIncluded +
      rows.reduce((count, row) => {
        if (String(row.userId) === String(community.ownerId)) return count;
        if (!communityMembershipRowIsActive(row)) return count;
        if (sinceMs !== null && row.createdAt < sinceMs) return count;
        return count + 1;
      }, 0)
    );
  },
});

export const syncCommunityMembershipCount = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const { community, viewerCanManageMembers } = await resolveCommunityAdminMembersContext({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
      communityId: args.communityId,
    });
    if (!viewerCanManageMembers) {
      throw new Error("community_manager_required");
    }
    await maybeScheduleMemberSearchBackfill(ctx, community as any, Date.now());
    return await syncCommunityActiveMemberCount({
      ctx,
      communityId: args.communityId,
      community,
    });
  },
});

// Read-only founder projection. The existing moderator RPC below retains its contract.
async function mapPendingAdmissionRequest(ctx: any, row: CommunityJoinRequestLike) {
  if (assertCanonicalCommunityJoinRequest(row) !== "pending" ||
      !Number.isFinite(row.createdAt) || !Number.isFinite(row.updatedAt)) {
    throw new Error("community_join_request_unavailable");
  }
  const current = await getCurrentCommunityJoinRequestByPair({
    ctx, communityId: row.communityId, userId: row.userId,
  });
  if (!current || String(current._id) !== String(row._id)) {
    throw new Error("community_join_request_unavailable");
  }
  // Who is asking, as a host sees them in the app: their name, handle and
  // what they wrote about themselves. A request itself carries no message.
  const applicant: any = await ctx.db.get(row.userId);
  const details: any = await ctx.db.query("userProfileDetails").withIndex("by_user", (q: any) => q.eq("userId", row.userId)).first();
  const bio = String(details?.bio ?? "").replace(/\s+/g, " ").trim().slice(0, 400);
  return {
    ref: `join-request:${row._id}`,
    applicant_ref: `user:${(await resolvePublicUserId(ctx, row.userId)) ?? String(row.userId)}`,
    applicant: {
      name: String(details?.displayName ?? applicant?.displayName ?? "").trim() || null,
      handle: String(applicant?.handle ?? "").trim() || null,
      about: bio || null,
    },
    status: "pending" as const,
    created_at: toIsoString(row.createdAt),
    updated_at: toIsoString(row.updatedAt),
  };
}

export const listPendingAdmissionRequestsInternal = internalQuery({
  args: {
    userId: v.id("users"), communityId: v.id("communities"),
    cursor: v.optional(v.string()), limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCommunityModerator({ ctx, communityId: args.communityId, userId: args.userId });
    const limit = args.limit ?? 20;
    if (!Number.isInteger(limit) || limit < 2 || limit > 50) {
      throw new Error("community_join_request_limit_invalid");
    }
    const scope = JSON.stringify([args.userId, args.communityId, "pending", "createdAt:desc", 1]);
    let cursor: string | null = null;
    if (args.cursor !== undefined) {
      let decoded;
      try { decoded = JSON.parse(args.cursor); } catch { throw new Error("community_join_request_cursor_invalid"); }
      if (args.cursor.length > 2048 || decoded?.scope !== scope ||
          typeof decoded.cursor !== "string" || !decoded.cursor) {
        throw new Error("community_join_request_cursor_invalid");
      }
      cursor = decoded.cursor;
    }
    const result = await ctx.db.query("communityJoinRequests")
      .withIndex("by_community_status_createdAt", q => q.eq("communityId", args.communityId).eq("status", "pending"))
      .order("desc").paginate({ cursor, numItems: limit });
    return {
      requests: await Promise.all(result.page.map(row => mapPendingAdmissionRequest(ctx, row))),
      next_cursor: result.isDone ? null : JSON.stringify({ scope, cursor: result.continueCursor }),
    };
  },
});

export const readPendingAdmissionRequestInternal = internalQuery({
  args: { userId: v.id("users"), communityId: v.id("communities"), requestId: v.id("communityJoinRequests") },
  handler: async (ctx, args) => {
    await requireCommunityModerator({ ctx, communityId: args.communityId, userId: args.userId });
    const row = await ctx.db.get(args.requestId);
    if (!row || row.communityId !== args.communityId) throw new Error("community_join_request_unavailable");
    return await mapPendingAdmissionRequest(ctx, row);
  },
});

// Reservation, domain effects and completed result share one transaction.
const freshAdmissionArgs = {
  userId: v.id("users"), communityId: v.id("communities"),
  // A person's own AI, or the guide in their private talk when told to.
  principalKind: v.union(v.literal("external_mcp"), v.literal("community_agent_for_member")),
  requestId: v.id("communityJoinRequests"),
  expectedCreatedAt: v.number(), expectedUpdatedAt: v.number(),
  idempotencyKey: v.string(),
};

type FreshAdmissionArgs = {
  userId: Id<"users">; communityId: Id<"communities">;
  principalKind: "external_mcp" | "community_agent_for_member"; requestId: Id<"communityJoinRequests">;
  expectedCreatedAt: number; expectedUpdatedAt: number; idempotencyKey: string;
};

async function decideFreshAdmission(ctx: MutationCtx, args: FreshAdmissionArgs,
  operation: "community.admission.approve" | "community.admission.deny"): Promise<Record<string, any>> {
  const { community, relation } = await requireCommunityModerator({ ctx, communityId: args.communityId, userId: args.userId });
  if (!args.idempotencyKey.trim() || args.idempotencyKey.length > 200 ||
      !Number.isSafeInteger(args.expectedCreatedAt) || !Number.isSafeInteger(args.expectedUpdatedAt)) {
    throw new Error("invalid_tool_args");
  }
  const scope = { communityId: args.communityId, userId: args.userId,
    principalKind: args.principalKind, toolName: "polynet_call" as const, idempotencyKey: args.idempotencyKey };
  const requestFingerprint = JSON.stringify([operation, 1, args.requestId,
    args.expectedCreatedAt, args.expectedUpdatedAt]);
  const reservation = await ctx.runMutation(internal.polynetCanonicalReceipts.reserveCanonicalOperationReceiptInternal,
    { ...scope, requestFingerprint });
  if (!reservation.ok) return reservation;
  if (reservation.status === "completed") {
    const value = reservation.result;
    return { ...value, deduped: true, receipt: { ...value.receipt, deduped: true } };
  }
  const nowMs = Date.now();
  if (!reservation.attemptToken || !reservation.leaseExpiresAt || reservation.leaseExpiresAt <= nowMs) {
    throw new Error("operation_in_progress");
  }
  const request = await ctx.db.get(args.requestId);
  if (!request || request.communityId !== args.communityId ||
      request.createdAt !== args.expectedCreatedAt || request.updatedAt !== args.expectedUpdatedAt ||
      resolveCommunityEntryPolicy(community) !== "approval") {
    throw new Error("admission_request_unavailable");
  }
  // Validates pending fields and the canonical pair; never repairs a read.
  const projection = await mapPendingAdmissionRequest(ctx, request);
  const membership = await getUniqueCommunityMembershipByPair({ ctx, communityId: args.communityId, userId: request.userId });
  const subscription = await ctx.db.query("communitySubscriptions")
    .withIndex("by_community_user", q => q.eq("communityId", args.communityId).eq("userId", request.userId)).first();
  if (membership || subscription) throw new Error("admission_request_unavailable");
  let result: Record<string, unknown>;
  if (operation === "community.admission.approve") {
    const activation = await approveCommunityJoinRequestForFreeAccess({ ctx, community, request,
      nowMs, grantReason: "join_request_approved" });
    result = { status: "approved", request_ref: projection.ref, applicant_ref: projection.applicant_ref,
      membership_ref: `membership:${activation.membership._id}`, decided_at: toIsoString(nowMs) };
  } else {
    if (community.ownerId === request.userId) throw new Error("admission_request_unavailable");
    await requireCommunityUserNotBlocked({ ctx, communityId: args.communityId, userId: request.userId });
    const denied = await denyCommunityJoinRequestCore({ ctx, request, nowMs,
      cooldownMs: COMMUNITY_JOIN_REAPPLY_COOLDOWN_MS });
    result = { status: "denied", request_ref: projection.ref, applicant_ref: projection.applicant_ref,
      denied_at: toIsoString(denied.request.deniedAt!), reapply_at: toIsoString(denied.request.reapplyAt!) };
  }
  const eventType = operation === "community.admission.approve"
    ? "community_join_request_approved" : "community_join_request_denied";
  const eventKey = operation === "community.admission.approve"
    ? `${eventType}:${request._id}`
    : `${eventType}:${request._id}:${args.expectedCreatedAt}:${args.expectedUpdatedAt}`;
  await recordCriticalAuditEvent(ctx, {
    eventKey, eventType, severity: "info", status: "succeeded",
    actorUserId: args.userId, subjectUserId: request.userId, communityId: args.communityId,
    provider: "polynet", providerObjectId: String(request._id), createdAt: nowMs,
  });
  const value = { ok: true, operation, result,
    deduped: false,
    receipt: { contract: "polynet.canonical.operation:v1", tool: "polynet_call",
      principal_kind: args.principalKind, community_id: String(args.communityId), community_slug: community.slug,
      // The decider's actual relation: owner, admin or moderator, in the moderator lens.
      authority_lane: "moderator", relation,
      idempotency_key: args.idempotencyKey, deduped: false } };
  await ctx.runMutation(internal.polynetCanonicalReceipts.completeCanonicalOperationReceiptInternal,
    { ...scope, requestFingerprint, attemptToken: reservation.attemptToken, result: value });
  return value;

}

export const approveFreshAdmissionInternal = internalMutation({
  args: freshAdmissionArgs,
  handler: (ctx, args): Promise<Record<string, any>> => decideFreshAdmission(ctx, args, "community.admission.approve"),
});

export const denyFreshAdmissionInternal = internalMutation({
  args: freshAdmissionArgs,
  handler: (ctx, args): Promise<Record<string, any>> => decideFreshAdmission(ctx, args, "community.admission.deny"),
});

export const listCommunityJoinRequests = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    limit: v.optional(v.number()),
    includeStatuses: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    await requireCommunityModerator({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const statuses = Array.from(new Set(
      (args.includeStatuses ?? ["pending"])
        .map((status) =>
          String(status ?? "")
            .trim()
            .toLowerCase(),
        )
        .filter((status) => status === "pending" || status === "denied"),
    ));
    if (statuses.length === 0) return [];
    const limit = Math.max(1, Math.min(5000, Math.floor(args.limit ?? 200)));
    const rows = (
      await Promise.all(
        statuses.map(async (status) =>
          (await ctx.db
            .query("communityJoinRequests")
            .withIndex("by_community_status_createdAt", (q: any) =>
              q.eq("communityId", args.communityId).eq("status", status),
            )
            .order("desc")
            .take(limit)) as CommunityJoinRequestLike[],
        ),
      )
    ).flat();
    const userIdCache = new Map<string, string | null>();
    return await Promise.all(
      rows
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit)
        .map(async (row) => {
          const status = assertCanonicalCommunityJoinRequest(row);
          return {
            id: String(row._id),
            community_id: String(row.communityId),
            user_id:
              (await resolvePublicUserId(ctx, row.userId, userIdCache)) ??
              String(row.userId),
            status,
            created_at: toIsoString(row.createdAt),
            updated_at: toIsoString(row.updatedAt),
          };
        }),
    );
  },
});

export const approveCommunityJoinRequest = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    requestId: v.id("communityJoinRequests"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const logContext: Record<string, unknown> = {
      actorUserId: args.userId,
      requestId: args.requestId,
    };
    return await approveCommunityJoinRequestCore(ctx, { requestId: args.requestId, userId: args.userId, logContext });
  },
});

// Approving a join request, for Studio and for a site's private twin: the
// reviewer must moderate this community (owner, admin or moderator).
async function approveCommunityJoinRequestCore(ctx: any, args: {
  requestId: any;
  userId: any;
  logContext: Record<string, unknown>;
  communityId?: any;
}) {
  const logContext = args.logContext;
    return await runLoggedCommunityAdminMutation({
      operation: "approve_join_request",
      context: logContext,
      handler: async () => {
        const nowMs = Date.now();
        const approvalReceiptKey = `community_join_request_approved:${String(args.requestId)}`;
        const request = (await ctx.db.get(args.requestId)) as CommunityJoinRequestLike | null;
        if (!request) {
          const receipt = await ctx.db
            .query("criticalAuditEvents")
            .withIndex("by_eventKey", (q: any) => q.eq("eventKey", approvalReceiptKey))
            .unique();
          if (
            receipt?.status === "succeeded" &&
            String(receipt.actorUserId ?? "") === String(args.userId)
          ) {
            return { ok: true };
          }
          throw new Error("join_request_not_found");
        }
        logContext.communityId = String(request.communityId);
        logContext.targetUserId = String(request.userId);
        if (args.communityId && String(args.communityId) !== String(request.communityId)) {
          throw new Error("join_request_not_found");
        }
        const { community } = await requireCommunityModerator({
          ctx,
          communityId: request.communityId,
          userId: args.userId,
        });
        if (assertCanonicalCommunityJoinRequest(request) !== "pending") {
          throw new Error("join_request_already_decided");
        }
        if (resolveCommunityEntryPolicy(community) === "paid_subscription") {
          throw new Error("community_paid_checkout_required");
        }
        await approveCommunityJoinRequestForFreeAccess({
          ctx,
          community,
          request,
          nowMs,
          grantReason: "join_request_approved",
        });
        await recordCriticalAuditEvent(ctx, {
          eventKey: approvalReceiptKey,
          eventType: "community_join_request_approved",
          severity: "info",
          status: "succeeded",
          actorUserId: args.userId,
          subjectUserId: request.userId,
          communityId: request.communityId,
          provider: "polynet",
          providerObjectId: String(args.requestId),
          createdAt: nowMs,
        });
        return { ok: true };
      },
    });
}

export const denyCommunityJoinRequest = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    requestId: v.id("communityJoinRequests"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const logContext: Record<string, unknown> = {
      actorUserId: args.userId,
      requestId: args.requestId,
    };
    return await denyCommunityJoinRequestForReviewerCore(ctx, { requestId: args.requestId, userId: args.userId, logContext });
  },
});

// Denying a join request, for Studio and for a site's private twin.
async function denyCommunityJoinRequestForReviewerCore(ctx: any, args: {
  requestId: any;
  userId: any;
  logContext: Record<string, unknown>;
  communityId?: any;
}) {
  const logContext = args.logContext;
    return await runLoggedCommunityAdminMutation({
      operation: "deny_join_request",
      context: logContext,
      handler: async () => {
        const nowMs = Date.now();
        const request = (await ctx.db.get(args.requestId)) as CommunityJoinRequestLike | null;
        if (!request) throw new Error("join_request_not_found");
        if (args.communityId && String(args.communityId) !== String(request.communityId)) {
          throw new Error("join_request_not_found");
        }
        logContext.communityId = String(request.communityId);
        logContext.targetUserId = String(request.userId);
        const { community } = await requireCommunityModerator({
          ctx,
          communityId: request.communityId,
          userId: args.userId,
        });
        if (String(community.ownerId) === String(request.userId)) {
          throw new Error("community_owner_join_request_forbidden");
        }
        if (resolveCommunityJoinRequestDecision(request, "denied") === "already_applied") {
          return { ok: true };
        }
        await denyCommunityJoinRequestCore({
          ctx,
          request,
          nowMs,
          cooldownMs: COMMUNITY_JOIN_REAPPLY_COOLDOWN_MS,
        });
        await markCommunityMemberViewCountsStale(ctx, request.communityId, nowMs);
        return { ok: true };
      },
    });
}

// A request id from outside (the twin): a join request's, or refused.
function requireJoinRequestId(ctx: any, raw: string) {
  const id = ctx.db.normalizeId("communityJoinRequests", raw);
  if (!id) throw new Error("join_request_not_found");
  return id;
}

export const setCommunityMemberRole = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    targetMembershipId: v.id("communityMemberships"),
    role: v.union(
      v.literal("admin"),
      v.literal("moderator"),
      v.literal("member"),
    ),
  },
  handler: async (ctx, args) => await setCommunityMemberRoleForUser(ctx, {
    ...args,
    userId: await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null }),
  }),
});

// Studio's role change, for a person already verified by the caller (the
// Members page above, or an AI's request through communityPeople).
export async function setCommunityMemberRoleForUser(ctx: any, args: {
  userId: any; communityId: any; targetMembershipId: any; role: "admin" | "moderator" | "member";
}) {
  return await runLoggedCommunityAdminMutation({
    operation: "set_member_role",
    context: {
      actorUserId: args.userId,
      communityId: String(args.communityId),
      targetMembershipId: String(args.targetMembershipId),
      nextRole: args.role,
    },
    handler: async () => {
      const nowMs = Date.now();
      const role = normalizeRoleAssignment(args.role);
      const { community } = await requireCommunityManager({
        ctx,
        communityId: args.communityId,
        userId: args.userId,
      });
      const membership = (await ctx.db.get(
        args.targetMembershipId,
      )) as CommunityMembershipLike | null;
      if (!membership) throw new Error("community_membership_not_found");
      if (String(membership.communityId) !== String(args.communityId)) {
        throw new Error("community_membership_not_found");
      }
      if (String(community.ownerId) === String(membership.userId)) {
        throw new Error("community_owner_role_fixed");
      }
      requireOwnerForAdminAuthorityChange({
        community,
        actorUserId: args.userId,
        targetMembership: membership,
        nextRole: role,
      });
      await ctx.db.patch(membership._id as any, {
        role,
        updatedAt: nowMs,
      });
      await syncCommunityMemberSearchEntry(ctx, {
        communityId: args.communityId,
        userId: membership.userId,
        role,
        active: communityMembershipRowIsActive(membership),
        nowMs,
      });
      // The member's record shows who did this, and when.
      await recordCriticalAuditEvent(ctx, {
        eventKey: `community_member_role_set:${membership._id}:${nowMs}`, eventType: "community_member_role_set",
        severity: "info", status: "succeeded", actorUserId: args.userId, subjectUserId: membership.userId,
        communityId: args.communityId, provider: "polynet", providerObjectId: String(membership._id), metadata: { role }, createdAt: nowMs,
      });
      return { ok: true };
    },
  });
}

export const prepareCommunityMemberRemovalInternal = internalQuery({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    targetMembershipId: v.id("communityMemberships"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const { community } = await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const membership = (await ctx.db.get(
      args.targetMembershipId,
    )) as CommunityMembershipLike | null;
    if (!membership) {
      return {
        ok: true,
        noop: true,
        provider_subscription_targets: [],
      };
    }
    if (String(membership.communityId) !== String(args.communityId)) {
      return {
        ok: true,
        noop: true,
        provider_subscription_targets: [],
      };
    }
    if (String(community.ownerId) === String(membership.userId)) {
      throw new Error("community_owner_remove_forbidden");
    }
    requireOwnerForAdminAuthorityChange({
      community,
      actorUserId: userId,
      targetMembership: membership,
    });
    const subscriptionRows = await listCommunitySubscriptionRowsForMembership({
      ctx,
      membershipId: membership._id,
    });
    const providerSubscriptionTargets = Array.from(
      new Map(
        subscriptionRows
          .map((row) => ({
            provider_subscription_id: String(row.providerSubscriptionId ?? "").trim(),
            provider_account_id: String(row.providerAccountId ?? "").trim() || null,
          }))
          .filter((target) => target.provider_subscription_id)
          .map((target) => [
            `${target.provider_account_id ?? "platform"}:${target.provider_subscription_id}`,
            target,
          ]),
      ).values(),
    );
    if (providerSubscriptionTargets.some((target) => !target.provider_account_id)) {
      throw new Error("community_subscription_provider_account_missing");
    }
    return {
      ok: true,
      noop: false,
      community_slug: community.slug,
      target_user_id: membership.userId,
      provider_subscription_targets: providerSubscriptionTargets,
    };
  },
});

export const revokeCommunityMemberInternal = internalMutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    targetMembershipId: v.id("communityMemberships"),
    revokedReason: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    return await runLoggedCommunityAdminMutation({
      operation: "remove_member",
      context: {
        actorUserId: userId,
        communityId: String(args.communityId),
        targetMembershipId: String(args.targetMembershipId),
      },
      handler: async () => {
        const nowMs = args.nowMs ?? Date.now();
        const { community } = await requireCommunityManager({
          ctx,
          communityId: args.communityId,
          userId,
        });
        const membership = (await ctx.db.get(
          args.targetMembershipId,
        )) as CommunityMembershipLike | null;
        if (!membership) return { ok: true };
        if (String(membership.communityId) !== String(args.communityId)) {
          return { ok: true };
        }
        if (String(community.ownerId) === String(membership.userId)) {
          throw new Error("community_owner_remove_forbidden");
        }
        requireOwnerForAdminAuthorityChange({
          community,
          actorUserId: userId,
          targetMembership: membership,
        });
        const alreadyManagerRevoked = communityMembershipState(membership) === "removed";
        if (!communityMembershipRowIsActive(membership) && !alreadyManagerRevoked) {
          return { ok: true };
        }
        const revokedAt = alreadyManagerRevoked && typeof membership.revokedAt === "number"
          ? membership.revokedAt
          : nowMs;
        const revokedReason = alreadyManagerRevoked
          ? String(membership.revokedReason)
          : String(args.revokedReason ?? "").trim() || "removed_by_manager";
        if (!alreadyManagerRevoked) {
          await endCommunitySubscriptionsForMembership({
            ctx,
            membershipId: membership._id,
            nowMs,
          });
        }
        const removal = alreadyManagerRevoked
          ? null
          : endedCommunityMembershipFields({ membership, to: "removed", reason: revokedReason, nowMs });
        const revokedMembership = { ...membership, ...removal } as CommunityMembershipLike;
        if (removal) {
          await ctx.db.patch(membership._id as any, removal);
          await removeUserFromPodHosts(ctx, { communityId: args.communityId, userId: membership.userId });
          await schedulePodBillingCheck(ctx, { communityId: args.communityId, userId: membership.userId });
          await memberAccessChanged(ctx, args.communityId, membership.userId);
          await recordCriticalAuditEvent(ctx, {
            eventKey: `community_member_removed:${membership._id}:${nowMs}`, eventType: "community_member_removed",
            severity: "info", status: "succeeded", actorUserId: userId, subjectUserId: membership.userId,
            communityId: args.communityId, provider: "polynet", providerObjectId: String(membership._id), createdAt: nowMs,
          });
          await adjustCommunityActiveMemberCountForMembershipTransition({
            ctx,
            communityId: args.communityId,
            before: membership,
            after: revokedMembership,
          });
          await syncCommunityMemberSearchEntry(ctx, {
            communityId: args.communityId,
            userId: membership.userId,
            role: membership.role,
            active: false,
            nowMs,
          });
          await markCommunityMemberViewCountsStale(ctx, args.communityId, nowMs);
        }
        const memberSettings = (await ctx.db
          .query("communityMemberSettings" as any)
          .withIndex("by_community_user", (q: any) =>
            q
              .eq("communityId", args.communityId)
              .eq("userId", membership.userId),
          )
          .first()) as CommunityMemberSettingsLike | null;
        if (memberSettings) {
          await ctx.db.delete(memberSettings._id as any);
        }
        await deleteCommunityReadCursorsForUserCommunity(
          ctx,
          args.communityId,
          membership.userId,
        );
        await deleteCommunityPresenceForUser({
          ctx,
          communityId: args.communityId,
          userId: membership.userId,
        });

        await ensureDeniedCommunityJoinRequest({
          ctx,
          communityId: args.communityId,
          userId: membership.userId,
          nowMs: revokedAt,
          cooldownMs: COMMUNITY_REMOVAL_REAPPLY_COOLDOWN_MS,
        });
        return { ok: true };
      },
    });
  },
});

export const removeCommunityMember = action({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    targetMembershipId: v.id("communityMemberships"),
  },
  handler: async (ctx, args) => {
    const prepared = (await ctx.runQuery(
      internal.communityAdmin.prepareCommunityMemberRemovalInternal as any,
      {
        userId: args.userId,
        authSubject: args.authSubject ?? undefined,
        communityId: args.communityId,
        targetMembershipId: args.targetMembershipId,
      },
    )) as {
      noop?: boolean;
      provider_subscription_targets?: Array<{
        provider_subscription_id: string;
        provider_account_id: string | null;
      }>;
    } | null;
    if (prepared?.noop) return { ok: true, stripe_canceled_count: 0 };

    const providerSubscriptionTargets = Array.isArray(prepared?.provider_subscription_targets)
      ? prepared.provider_subscription_targets
      : [];
    let stripeCanceledCount = 0;
    for (const target of providerSubscriptionTargets) {
      await cancelStripeSubscriptionIfActive({
        providerSubscriptionId: target.provider_subscription_id,
        providerAccountId: target.provider_account_id,
      });
      stripeCanceledCount += 1;
    }

    await ctx.runMutation(
      internal.communityAdmin.revokeCommunityMemberInternal as any,
      {
        userId: args.userId,
        authSubject: args.authSubject ?? undefined,
        communityId: args.communityId,
        targetMembershipId: args.targetMembershipId,
        revokedReason: providerSubscriptionTargets.length > 0
          ? "removed_by_manager_stripe_canceled"
          : "removed_by_manager",
        nowMs: Date.now(),
      },
    );
    return {
      ok: true,
      stripe_canceled_count: stripeCanceledCount,
    };
  },
});

export const banCommunityMember = action({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    targetMembershipId: v.id("communityMemberships"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const prepared = (await ctx.runQuery(
      internal.communityAdmin.prepareCommunityMemberRemovalInternal as any,
      {
        userId: args.userId,
        authSubject: args.authSubject ?? undefined,
        communityId: args.communityId,
        targetMembershipId: args.targetMembershipId,
      },
    )) as {
      noop?: boolean;
      target_user_id?: any;
      provider_subscription_targets?: Array<{
        provider_subscription_id: string;
        provider_account_id: string | null;
      }>;
    } | null;
    if (prepared?.noop || !prepared?.target_user_id) return { ok: true, stripe_canceled_count: 0 };

    const providerSubscriptionTargets = Array.isArray(prepared?.provider_subscription_targets)
      ? prepared.provider_subscription_targets
      : [];
    let stripeCanceledCount = 0;
    for (const target of providerSubscriptionTargets) {
      await cancelStripeSubscriptionIfActive({
        providerSubscriptionId: target.provider_subscription_id,
        providerAccountId: target.provider_account_id,
      });
      stripeCanceledCount += 1;
    }

    const nowMs = Date.now();
    await ctx.runMutation(
      internal.communityAdmin.revokeCommunityMemberInternal as any,
      {
        userId: args.userId,
        authSubject: args.authSubject ?? undefined,
        communityId: args.communityId,
        targetMembershipId: args.targetMembershipId,
        revokedReason: providerSubscriptionTargets.length > 0
          ? "banned_by_manager_stripe_canceled"
          : "banned_by_manager",
        nowMs,
      },
    );
    await ctx.runMutation(
      internal.communityAdmin.blockCommunityUserInternal as any,
      {
        userId: args.userId,
        authSubject: args.authSubject ?? undefined,
        communityId: args.communityId,
        targetUserId: prepared.target_user_id,
        reason: args.reason,
        nowMs,
      },
    );
    return {
      ok: true,
      stripe_canceled_count: stripeCanceledCount,
    };
  },
});

export const blockCommunityUserInternal = internalMutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    targetUserId: v.id("users"),
    reason: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const nowMs = args.nowMs ?? Date.now();
    const { community } = await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    if (String(community.ownerId) === String(args.targetUserId)) {
      throw new Error("community_owner_ban_forbidden");
    }
    const targetMembershipRows = (await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q: any) =>
        q.eq("communityId", args.communityId).eq("userId", args.targetUserId),
      )
      .collect()) as CommunityMembershipLike[];
    const targetMembership = pickMostRelevantCommunityMembership(targetMembershipRows);
    if (targetMembership) {
      requireOwnerForAdminAuthorityChange({
        community,
        actorUserId: userId,
        targetMembership,
      });
    }
    const existing = await getActiveCommunityBlock({
      ctx,
      communityId: args.communityId,
      userId: args.targetUserId,
    });
    const reason = String(args.reason ?? "").trim().slice(0, 1000) || undefined;
    if (existing) {
      await ctx.db.patch(existing._id as any, {
        reason,
        updatedAt: nowMs,
      });
      return { ok: true };
    }
    await ctx.db.insert("communityBlocks" as any, {
      communityId: args.communityId,
      userId: args.targetUserId,
      createdByUserId: userId,
      reason,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await syncCommunityMemberSearchEntry(ctx, {
      communityId: args.communityId,
      userId: args.targetUserId,
      role: targetMembership?.role ?? "member",
      active: false,
      nowMs,
    });
    await markCommunityMemberViewCountsStale(ctx, args.communityId, nowMs);
    await recordCriticalAuditEvent(ctx, {
      eventKey: `community_member_blocked:${args.targetUserId}:${nowMs}`, eventType: "community_member_blocked",
      severity: "info", status: "succeeded", actorUserId: userId, subjectUserId: args.targetUserId,
      communityId: args.communityId, provider: "polynet", createdAt: nowMs,
    });
    return { ok: true };
  },
});

// Lifting a ban, for a person already verified by the caller (an AI's request
// through communityPeople; nothing in the app calls it directly).
export async function unbanCommunityUserForUser(ctx: any, args: { userId: any; communityId: any; targetUserId: any }) {
  const userId = args.userId;
  const nowMs = Date.now();
  await requireCommunityManager({
    ctx,
    communityId: args.communityId,
    userId,
  });
  const block = (await getActiveCommunityBlock({
    ctx,
    communityId: args.communityId,
    userId: args.targetUserId,
  })) as CommunityBlockLike | null;
  if (!block) return { ok: true };
  await ctx.db.patch(block._id as any, {
    liftedAt: nowMs,
    updatedAt: nowMs,
  });
  await markCommunityMemberViewCountsStale(ctx, args.communityId, nowMs);
  return { ok: true };
}

export const getCommunityMemberSettings = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    return await readCommunityMemberSettingsForUser(ctx, { communityId: args.communityId, userId });
  },
});

// A member's own settings in one community (mute), for Studio and a site's private twin.
async function readCommunityMemberSettingsForUser(ctx: any, args: { communityId: any; userId: any }) {
  await requireCommunityChatAccess({
    ctx,
    communityId: args.communityId,
    userId: args.userId,
  });
  const row = (await ctx.db
    .query("communityMemberSettings" as any)
    .withIndex("by_community_user", (q: any) =>
      q.eq("communityId", args.communityId).eq("userId", args.userId),
    )
    .first()) as CommunityMemberSettingsLike | null;
  return row ? await mapCommunityMemberSettingsRow(ctx, row) : null;
}

export const saveCommunityMemberSettings = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    muted: v.boolean(),
    mutedUntilIso: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    return await saveCommunityMemberSettingsForUser(ctx, { ...args, userId });
  },
});

// The one write of a member's own settings in a community, for Studio's
// signed-in user and a community site's private twin.
async function saveCommunityMemberSettingsForUser(
  ctx: any,
  args: { userId: any; communityId: any; muted: boolean; mutedUntilIso?: string | null },
) {
  return await runLoggedCommunityAdminMutation({
    operation: "save_member_settings",
    context: {
      actorUserId: args.userId,
      communityId: String(args.communityId),
      targetUserId: String(args.userId),
      muted: Boolean(args.muted),
    },
    handler: async () => {
      const nowMs = Date.now();
      await requireCommunityChatAccess({
        ctx,
        communityId: args.communityId,
        userId: args.userId,
      });
      const mutedUntil = parseIsoMs(args.mutedUntilIso);
      const existing = (await ctx.db
        .query("communityMemberSettings" as any)
        .withIndex("by_community_user", (q: any) =>
          q.eq("communityId", args.communityId).eq("userId", args.userId),
        )
        .first()) as CommunityMemberSettingsLike | null;
      if (existing) {
        await ctx.db.patch(existing._id as any, {
          muted: Boolean(args.muted),
          mutedUntil: typeof mutedUntil === "number" ? mutedUntil : undefined,
          updatedAt: nowMs,
        });
        const updated = (await ctx.db.get(
          existing._id as any,
        )) as CommunityMemberSettingsLike | null;
        if (!updated) throw new Error("community_member_settings_not_found");
        return await mapCommunityMemberSettingsRow(ctx, updated);
      }
      const id = await ctx.db.insert("communityMemberSettings" as any, {
        communityId: args.communityId,
        userId: args.userId,
        muted: Boolean(args.muted),
        mutedUntil: typeof mutedUntil === "number" ? mutedUntil : undefined,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      const created = (await ctx.db.get(
        id as any,
      )) as CommunityMemberSettingsLike | null;
      if (!created)
        throw new Error("community_member_settings_create_failed");
      return await mapCommunityMemberSettingsRow(ctx, created);
    },
  });
}

// After a paid member leaves: tell Stripe not to renew. Stripe's own notice
// ends the subscription (and with it the member's access) when the period ends.
// A failed call is retried with growing gaps (about a day in all); the
// subscription row also remembers the request (cancelRequestedAt), so a renewal
// Stripe reports later is re-cancelled (syncCommunitySubscriptionLifecycleInternal).
export const LEAVE_CANCEL_RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 6 * 3_600_000, 12 * 3_600_000];
const leaveCancelTarget = v.object({ providerSubscriptionId: v.string(), providerAccountId: v.union(v.string(), v.null()) });
export const cancelCommunitySubscriptionsAtPeriodEndInternal = internalAction({
  args: { targets: v.array(leaveCancelTarget), attempt: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const attempt = args.attempt ?? 0;
    const failed: typeof args.targets = [];
    for (const target of args.targets) {
      try {
        await cancelStripeSubscriptionAtPeriodEnd(target);
      } catch (error) {
        failed.push(target);
        console.error("community_leave_stripe_cancel_failed", {
          providerSubscriptionId: target.providerSubscriptionId, attempt,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (!failed.length) return { ok: true };
    const delay = LEAVE_CANCEL_RETRY_DELAYS_MS[attempt];
    if (delay === undefined) {
      // Out of retries: loud, and the next Stripe notice for it re-cancels.
      console.error("community_leave_stripe_cancel_gave_up", { providerSubscriptionIds: failed.map((target) => target.providerSubscriptionId) });
      return { ok: false };
    }
    await ctx.scheduler.runAfter(delay, internal.communityAdmin.cancelCommunitySubscriptionsAtPeriodEndInternal, { targets: failed, attempt: attempt + 1 });
    return { ok: false, retrying: true };
  },
});

export const approvePendingJoinRequestsForOpenAccessInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    actorUserId: v.optional(v.id("users")),
    startedAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await runLoggedCommunityAdminMutation({
      operation: "approve_pending_join_requests_for_open_access",
      context: {
        actorUserId: args.actorUserId ?? null,
        communityId: String(args.communityId),
        startedAt: args.startedAt,
      },
      handler: async () => {
        const community = (await ctx.db.get(args.communityId)) as CommunityLike | null;
        if (!community) throw new Error("community_not_found");
        if (resolveCommunityEntryPolicy(community) !== "open") {
          return {
            approved_pending_request_count: 0,
            pending_request_overflow: false,
          };
        }
        const batch = await approvePendingJoinRequestsForOpenAccessBatch({
          ctx,
          community,
          nowMs: Date.now(),
          limit: OPEN_ACCESS_PENDING_APPROVAL_BATCH_LIMIT,
        });
        if (batch.hasMore) {
          await scheduleOpenAccessPendingApprovalContinuation({
            ctx,
            communityId: community._id,
            actorUserId: args.actorUserId,
            startedAt: args.startedAt,
          });
        }
        return {
          approved_pending_request_count: batch.approvedCount,
          pending_request_overflow: batch.hasMore,
        };
      },
    });
  },
});

export const setCommunityFreeAccessMode = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    mode: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    return await setCommunityFreeAccessModeCore(ctx, { communityId: args.communityId, mode: args.mode, userId });
  },
});

// A person's own AI setting how people join (the MCP), with Studio's checks.
export const setCommunityFreeAccessModeForTrustedUserInternal = internalMutation({
  args: { userId: v.id("users"), communityId: v.id("communities"), mode: v.string() },
  handler: async (ctx, args) => await setCommunityFreeAccessModeCore(ctx, args),
});

// Open or by approval (a paid community stays paid). Opening approves the
// requests already waiting, in batches.
async function setCommunityFreeAccessModeCore(ctx: any, args: { userId: any; communityId: any; mode: string }) {
    return await runLoggedCommunityAdminMutation({
      operation: "set_free_access_mode",
      context: {
        actorUserId: args.userId,
        communityId: String(args.communityId),
        mode: String(args.mode ?? "")
          .trim()
          .toLowerCase(),
      },
      handler: async () => {
        const nowMs = Date.now();
        const { community } = await requireCommunityManager({
          ctx,
          communityId: args.communityId,
          userId: args.userId,
        });
        const nextMode = String(args.mode ?? "")
          .trim()
          .toLowerCase();
        if (nextMode !== "open" && nextMode !== "approval") {
          throw new Error("community_free_access_mode_invalid");
        }
        const currentEntryPolicy = resolveCommunityEntryPolicy(community);
        const nextEntryPolicy =
          currentEntryPolicy === "paid_subscription"
            ? currentEntryPolicy
            : nextMode;
        await ctx.db.patch(community._id as any, {
          entryPolicy: nextEntryPolicy,
          updatedAt: nowMs,
        });
        const updated = (await ctx.db.get(
          community._id as any,
        )) as CommunityLike | null;
        if (!updated) throw new Error("community_not_found");
        const entryPolicy = resolveCommunityEntryPolicy(updated);
        let approvedPendingRequestCount = 0;
        let pendingRequestOverflow = false;
        if (entryPolicy === "open" && currentEntryPolicy !== "paid_subscription") {
          const batch = await approvePendingJoinRequestsForOpenAccessBatch({
            ctx,
            community: updated,
            nowMs,
            limit: OPEN_ACCESS_PENDING_APPROVAL_BATCH_LIMIT,
          });
          approvedPendingRequestCount = batch.approvedCount;
          pendingRequestOverflow = batch.hasMore;
          if (batch.hasMore) {
            await scheduleOpenAccessPendingApprovalContinuation({
              ctx,
              communityId: updated._id,
              actorUserId: args.userId,
              startedAt: nowMs,
            });
          }
        }
        return {
          community_id: String(updated._id),
          entry_policy: entryPolicy,
          approved_pending_request_count: approvedPendingRequestCount,
          pending_request_overflow: pendingRequestOverflow,
          updated_at: toIsoString(updated.updatedAt),
        };
      },
    });
}

export const leaveCommunity = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    return await leaveCommunityForUser(ctx, { communityId: args.communityId, userId });
  },
});

// The one way a member leaves, for Studio's signed-in user and a community
// site's private twin. The owner can't.
async function leaveCommunityForUser(ctx: any, args: { communityId: any; userId: any }) {
  return await runLoggedCommunityAdminMutation({
    operation: "leave_community",
    context: {
      actorUserId: args.userId,
      communityId: String(args.communityId),
    },
    handler: async () => {
      const nowMs = Date.now();
      const community = (await ctx.db.get(
        args.communityId,
      )) as CommunityLike | null;
      if (!community) throw new Error("community_not_found");
      if (String(community.ownerId) === String(args.userId)) {
        throw new Error("community_owner_cannot_leave");
      }
      const membership = await getUniqueCommunityMembershipByPair({
        ctx,
        communityId: args.communityId,
        userId: args.userId,
      });
      // Paid: Stripe stops renewing and the member keeps access until the paid
      // period ends (the subscription reads "cancel_at_period_end", which still
      // grants access); Stripe's notice at the end ends it. Nothing else changes now.
      const paidRows = membership
        ? (await listCommunitySubscriptionRowsForMembership({ ctx, membershipId: membership._id }))
          .filter((row: any) => String(row.providerSubscriptionId ?? "").trim() && communitySubscriptionStatusGrantsAccess(row.status))
        : [];
      if (membership && paidRows.length > 0) {
        const targets: Array<{ providerSubscriptionId: string; providerAccountId: string | null }> = [];
        for (const row of paidRows as any[]) {
          if (row.status !== "cancel_at_period_end") {
            await ctx.db.patch(row._id, {
              ...communitySubscriptionStatusFields({ status: "cancel_at_period_end", current: row, nowMs }),
              cancelRequestedAt: nowMs,
              updatedAt: nowMs,
            });
          }
          targets.push({ providerSubscriptionId: String(row.providerSubscriptionId), providerAccountId: row.providerAccountId ?? null });
        }
        await ctx.scheduler.runAfter(0, internal.communityAdmin.cancelCommunitySubscriptionsAtPeriodEndInternal, { targets });
        const accessUntil = Math.max(0, ...paidRows.map((row: any) => Number(row.currentPeriodEndAt) || 0));
        return { ok: true, access_until: accessUntil > 0 ? new Date(accessUntil).toISOString() : null };
      }
      if (membership) {
        await endCommunitySubscriptionsForMembership({
          ctx,
          membershipId: membership._id,
          nowMs,
        });
        // The row stays as `left`. Only an active member leaves: someone already
        // gone stays as they are, so a retried leave changes nothing and a removed
        // member can't erase the removal by "leaving".
        const leaving = communityMembershipRowIsActive(membership)
          ? endedCommunityMembershipFields({ membership, to: "left", reason: COMMUNITY_MEMBER_LEFT_REASON, nowMs })
          : null;
        const after = { ...membership, ...leaving } as CommunityMembershipLike;
        if (leaving) await ctx.db.patch(membership._id as any, leaving);
        if (leaving) await removeUserFromPodHosts(ctx, { communityId: args.communityId, userId: membership.userId });
        if (leaving) await schedulePodBillingCheck(ctx, { communityId: args.communityId, userId: membership.userId });
        if (leaving) await memberAccessChanged(ctx, args.communityId, membership.userId);
        await adjustCommunityActiveMemberCountForMembershipTransition({
          ctx,
          communityId: args.communityId,
          before: membership,
          after,
        });
        if (leaving) {
          await syncCommunityMemberSearchEntry(ctx, {
            communityId: args.communityId,
            userId: membership.userId,
            role: membership.role,
            active: false,
            nowMs,
          });
          await markCommunityMemberViewCountsStale(ctx, args.communityId, nowMs);
        }
      }
      const memberSettings = (await ctx.db
        .query("communityMemberSettings" as any)
        .withIndex("by_community_user", (q: any) =>
          q.eq("communityId", args.communityId).eq("userId", args.userId),
        )
        .first()) as CommunityMemberSettingsLike | null;
      if (memberSettings) {
        await ctx.db.delete(memberSettings._id as any);
      }
      await deleteCommunityReadCursorsForUserCommunity(
        ctx,
        args.communityId,
        args.userId,
      );
      await deleteCommunityJoinRequestByPair({
        ctx,
        communityId: args.communityId,
        userId: args.userId,
      });
      return { ok: true };
    },
  });
}

export const getCommunityAnalyticsSnapshot = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    range: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const range = normalizeAnalyticsRange(args.range);
    const { community } = await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const nowMs = Date.now();
    const rolled = await tryComputeCommunityAnalyticsFromRollups(ctx, {
      communityId: args.communityId,
      community,
      range,
      nowMs,
    });
    if (rolled) return rolled;
    const { rows } = await listCanonicalCommunityMemberMembershipRows({
      ctx,
      communityId: args.communityId,
      community,
    });
    return await computeCommunityAnalyticsSnapshot(ctx, { communityId: args.communityId, community, rows, range, nowMs });
  },
});

// The Analytics page's numbers for a host's guide or own AI
// (builder/analytics.json): the same manager check and the same computation
// as the page, for the page's default range (30 days) and the last 7 days.
export const readCommunityAnalyticsForTrustedManagerInternal = internalQuery({
  args: { userId: v.id("users"), communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const { community } = await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
    const nowMs = Date.now();
    const [rolled30, rolled7] = await Promise.all([
      tryComputeCommunityAnalyticsFromRollups(ctx, { communityId: args.communityId, community, range: "30d", nowMs }),
      tryComputeCommunityAnalyticsFromRollups(ctx, { communityId: args.communityId, community, range: "7d", nowMs }),
    ]);
    if (rolled30 && rolled7) {
      return communityAnalyticsDocument({
        nowMs,
        communityCreatedAt: community.createdAt,
        last30Days: rolled30,
        last7Days: rolled7,
      });
    }
    const { rows } = await listCanonicalCommunityMemberMembershipRows({ ctx, communityId: args.communityId, community });
    const snapshot = (range: AnalyticsRangeValue) =>
      computeCommunityAnalyticsSnapshot(ctx, { communityId: args.communityId, community, rows, range, nowMs });
    return communityAnalyticsDocument({
      nowMs,
      communityCreatedAt: community.createdAt,
      last30Days: rolled30 ?? await snapshot("30d"),
      last7Days: rolled7 ?? await snapshot("7d"),
    });
  },
});

import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  COMMUNITY_JOIN_REAPPLY_COOLDOWN_MS,
  COMMUNITY_REMOVAL_REAPPLY_COOLDOWN_MS,
  type CommunityBlockLike,
  type CommunityJoinRequestLike,
  type CommunityLike,
  type CommunityMemberSettingsLike,
  type CommunityMembershipLike,
  type CommunityPricePointLike,
  type CommunitySubscriptionLike,
  type UserEntitlementLike,
  communityMembershipRowIsActive,
  getCommunityAndMembership,
  getActiveCommunityBlock,
  isActiveEntitlementWindow,
  listCommunityMembershipRowsForManager,
  mapCommunityMemberSettingsRow,
  mapCommunityPricingRow,
  normalizeCommunityRoleForOutput,
  normalizeRoleAssignment,
  parseIsoMs,
  pickMostRelevantCommunityMembership,
  requireCommunityChatAccess,
  requireCommunityModerator,
  requireCommunityManager,
  resolveCommunityMembershipEntitlementState,
  resolveCommunityEntryPolicy,
  resolveCommunityBrandingFields,
  resolvePublicUserId,
  resolveUserIdForAuthenticatedRequest,
  tierHasArchitectAccess,
  toIsoString,
} from "./communityCore";
import { logStructuredError } from "./errorLogging";
import { enqueueCommunityAccessGrantedEmailInternal } from "./emailEvents";
import {
  clearPlatformHomeCommunityAutojoinOptOut,
  isPlatformHomeAutojoinOptOutRequest,
  isPlatformHomeCommunity,
  upsertPlatformHomeCommunityAutojoinOptOut,
} from "./platformHomeCommunity";
import { getStripeClient } from "./stripeCore";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import { normalizeCommunityMemberOnboardingConfig } from "../shared/communityMemberOnboarding";

type AnalyticsRangeValue = "7d" | "30d" | "90d" | "1y" | "all";
type AnalyticsBucketValue = "day" | "week" | "month";
type AnalyticsPointOutput = {
  label: string;
  value: number;
};

const MAX_ANALYTICS_SNAPSHOT_EVENT_ROWS = 10_000;

const ACTIVE_RECURRING_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "past_due",
  "cancel_at_period_end",
]);

function mapCommunityMemberOnboardingForOutput(community: CommunityLike) {
  const config = community.memberOnboarding;
  return normalizeCommunityMemberOnboardingConfig(
    config
      ? {
          enabled: config.enabled,
          title: config.title,
          description: config.description,
          video_url: config.videoUrl ?? null,
          thumbnail_url: config.thumbnailUrl ?? null,
          primary_action: config.primaryAction,
          ai_guide_prompt: config.aiGuidePrompt,
        }
      : null,
    community.name,
  );
}

function canViewCommunityMemberOnboardingAdminConfig(role: string): boolean {
  return role === "owner" || role === "admin";
}
const COMMUNITY_ADMIN_MEMBERS_DEFAULT_PAGE_SIZE = 25;
const COMMUNITY_ADMIN_MEMBERS_MAX_PAGE_SIZE = 100;

function normalizeAnalyticsRange(rawRange: unknown): AnalyticsRangeValue {
  const range = String(rawRange ?? "30d").trim();
  return range === "7d" || range === "90d" || range === "1y" || range === "all"
    ? range
    : "30d";
}

function resolveAnalyticsWindowStartMs(params: {
  range: AnalyticsRangeValue;
  nowMs: number;
  communityCreatedAt: number;
}): number {
  if (params.range === "7d") return params.nowMs - 7 * 86400000;
  if (params.range === "90d") return params.nowMs - 90 * 86400000;
  if (params.range === "1y") return params.nowMs - 365 * 86400000;
  if (params.range === "all") return params.communityCreatedAt;
  return params.nowMs - 30 * 86400000;
}

function resolveAnalyticsBucket(range: AnalyticsRangeValue): AnalyticsBucketValue {
  return range === "7d" || range === "30d" ? "day" : range === "90d" ? "week" : "month";
}

function startOfAnalyticsBucket(ms: number, bucket: AnalyticsBucketValue): Date {
  const date = new Date(ms);
  if (bucket === "month") return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12));
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12));
  if (bucket === "week") {
    const day = start.getUTCDay();
    const diff = (day + 6) % 7;
    start.setUTCDate(start.getUTCDate() - diff);
  }
  return start;
}

function addAnalyticsBucket(date: Date, bucket: AnalyticsBucketValue): Date {
  if (bucket === "month") return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 12));
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + (bucket === "week" ? 7 : 1));
  return next;
}

function buildAnalyticsBucketStarts(params: {
  startMs: number;
  endMs: number;
  bucket: AnalyticsBucketValue;
}): Date[] {
  const starts: Date[] = [];
  for (
    let cursor = startOfAnalyticsBucket(params.startMs, params.bucket);
    cursor.getTime() <= params.endMs && starts.length < 500;
    cursor = addAnalyticsBucket(cursor, params.bucket)
  ) {
    starts.push(cursor);
  }
  return starts;
}

function analyticsBucketLabel(date: Date, bucket: AnalyticsBucketValue): string {
  if (bucket === "month") {
    return date.toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    });
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function buildAnalyticsCountSeries(params: {
  rows: Array<{ createdAt: number }>;
  bucketStarts: Date[];
  bucket: AnalyticsBucketValue;
}): AnalyticsPointOutput[] {
  const counts = new Map<number, number>();
  const firstBucketStartMs = params.bucketStarts[0]?.getTime() ?? 0;
  for (const row of params.rows) {
    if (!Number.isFinite(row.createdAt) || row.createdAt < firstBucketStartMs) continue;
    const bucketStartMs = startOfAnalyticsBucket(row.createdAt, params.bucket).getTime();
    counts.set(bucketStartMs, (counts.get(bucketStartMs) ?? 0) + 1);
  }
  return params.bucketStarts.map((bucketStart) => ({
    label: analyticsBucketLabel(bucketStart, params.bucket),
    value: counts.get(bucketStart.getTime()) ?? 0,
  }));
}

function buildAnalyticsRecurringRevenueSeries(params: {
  rows: Array<{
    createdAt: number;
    endedAt: number | null;
    amountBaseUnits: number;
  }>;
  bucketStarts: Date[];
  bucket: AnalyticsBucketValue;
  nowMs: number;
}): AnalyticsPointOutput[] {
  return params.bucketStarts.map((bucketStart, index) => {
    const nextBucketStart =
      params.bucketStarts[index + 1] ?? addAnalyticsBucket(bucketStart, params.bucket);
    const bucketStartMs = bucketStart.getTime();
    const bucketEndMs = Math.min(nextBucketStart.getTime() - 1, params.nowMs);
    const value = params.rows.reduce((sum, row) => {
      if (row.createdAt > bucketEndMs) return sum;
      if (row.endedAt != null && row.endedAt < bucketStartMs) return sum;
      return sum + row.amountBaseUnits;
    }, 0);
    return {
      label: analyticsBucketLabel(bucketStart, params.bucket),
      value,
    };
  });
}

async function resolveCommunityMemberIdentity(ctx: any, userRowId: any) {
  return await resolveUserProfileDisplayProjection(ctx, userRowId);
}

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
  const viewerEntitlement = await resolveCommunityMembershipEntitlementState({
    ctx: args.ctx,
    community,
    membership: viewerMembership,
    userId,
  });
  if (!viewerEntitlement.isEntitled) {
    throw new Error("community_entitlement_required");
  }
  const viewerRole = normalizeCommunityRoleForOutput(viewerMembership?.role);
  return {
    userId,
    community,
    viewerCanManageMembers:
      String(community.ownerId) === String(userId) || viewerRole === "admin",
  };
}

async function mapCommunityOwnerAdminMemberRow(args: {
  ctx: any;
  community: CommunityLike;
  userIdCache: Map<string, string | null>;
}) {
  return {
    id: `owner:${String(args.community._id)}`,
    community_id: String(args.community._id),
    user_id:
      (await resolvePublicUserId(args.ctx, args.community.ownerId, args.userIdCache)) ??
      String(args.community.ownerId),
    ...(await resolveCommunityMemberIdentity(args.ctx, args.community.ownerId)),
    role: "owner",
    price_point_id: null,
    billing_period: null,
    amount_base_units: null,
    currency: null,
    currency_decimals: null,
    created_at: toIsoString(args.community.createdAt),
  };
}

async function mapCommunityAdminMembershipRow(args: {
  ctx: any;
  row: CommunityMembershipLike;
  userIdCache: Map<string, string | null>;
  viewerCanManageMembers: boolean;
}) {
  let pricePoint: CommunityPricePointLike | null = null;
  const identity = await resolveCommunityMemberIdentity(args.ctx, args.row.userId);
  if (args.viewerCanManageMembers) {
    const subscription =
      (
        (await args.ctx.db
          .query("communitySubscriptions" as any)
          .withIndex("by_membership", (q: any) =>
            q.eq("membershipId", args.row._id),
          )
          .collect()) as CommunitySubscriptionLike[]
      ).sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
    const pricePointId = subscription?.pricePointId ?? args.row.pricePointId ?? null;
    pricePoint = pricePointId
      ? ((await args.ctx.db.get(pricePointId)) as CommunityPricePointLike | null)
      : null;
  }
  return {
    id: String(args.row._id),
    community_id: String(args.row.communityId),
    user_id:
      (await resolvePublicUserId(args.ctx, args.row.userId, args.userIdCache)) ??
      String(args.row.userId),
    ...identity,
    role: normalizeCommunityRoleForOutput(args.row.role) || "member",
    price_point_id: pricePoint ? String(pricePoint._id) : null,
    billing_period: pricePoint
      ? String(pricePoint.billingPeriod ?? "")
          .trim()
          .toLowerCase() === "annual"
        ? "annual"
        : "monthly"
      : null,
    amount_base_units: pricePoint
      ? Math.max(0, Math.floor(pricePoint.amountBaseUnits))
      : null,
    currency: pricePoint?.currency ?? null,
    currency_decimals: pricePoint
      ? Math.max(0, Math.floor(pricePoint.currencyDecimals))
      : null,
    created_at: toIsoString(args.row.createdAt),
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
  for (const row of rows) {
    await args.ctx.db.patch(row._id, {
      status: "ended",
      cancelAtPeriodEnd: false,
      endedAt: args.nowMs,
      updatedAt: args.nowMs,
    });
  }
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
            ...(canViewCommunityMemberOnboardingAdminConfig(role)
              ? { member_onboarding: mapCommunityMemberOnboardingForOutput(community) }
              : {}),
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
      if (!community) continue;
      if (String(community.ownerId) === String(row.userId)) continue;
      const entitlement = await resolveCommunityMembershipEntitlementState({
        ctx,
        community,
        membership: row,
        userId: row.userId,
      });
      if (!entitlement.isEntitled) continue;
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

export const listCommunityMembershipsAdmin = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(5000, Math.floor(args.limit ?? 200)));
    const { community, viewerCanManageMembers } =
      await resolveCommunityAdminMembersContext({
        ctx,
        userId: args.userId,
        authSubject: args.authSubject ?? null,
        communityId: args.communityId,
      });
    const userIdCache = new Map<string, string | null>();
    const ownerRow = await mapCommunityOwnerAdminMemberRow({
      ctx,
      community,
      userIdCache,
    });
    const memberLimit = Math.max(0, limit - 1);
    const scanLimit = Math.min(5000, Math.max(memberLimit, memberLimit * 3));
    const rows =
      scanLimit > 0
        ? ((await ctx.db
            .query("communityMemberships")
            .withIndex("by_community_createdAt", (q) =>
              q.eq("communityId", args.communityId),
            )
            .order("asc")
            .take(scanLimit)) as CommunityMembershipLike[])
        : [];
    const activeRows = rows
      .filter(
        (row) =>
          communityMembershipRowIsActive(row) &&
          String(row.userId) !== String(community.ownerId),
      )
      .slice(0, memberLimit);
    const memberRows = await Promise.all(
      activeRows.map((row) =>
        mapCommunityAdminMembershipRow({
          ctx,
          row,
          userIdCache,
          viewerCanManageMembers,
        }),
      ),
    );
    return [ownerRow, ...memberRows].slice(0, limit);
  },
});

export const listCommunityMembershipsAdminPage = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { community, viewerCanManageMembers } =
      await resolveCommunityAdminMembersContext({
        ctx,
        userId: args.userId,
        authSubject: args.authSubject ?? null,
        communityId: args.communityId,
      });
    const pageSize = Math.max(
      2,
      Math.min(
        COMMUNITY_ADMIN_MEMBERS_MAX_PAGE_SIZE,
        Math.floor(args.paginationOpts.numItems ?? COMMUNITY_ADMIN_MEMBERS_DEFAULT_PAGE_SIZE),
      ),
    );
    const isFirstPage = args.paginationOpts.cursor === null;
    const memberPageSize = isFirstPage ? pageSize - 1 : pageSize;
    const rawPage = await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_createdAt", (q) =>
        q.eq("communityId", args.communityId),
      )
      .order("asc")
      .paginate({
        ...args.paginationOpts,
        numItems: memberPageSize,
        maximumRowsRead: Math.max(
          args.paginationOpts.maximumRowsRead ?? memberPageSize * 3,
          memberPageSize,
        ),
      });
    const userIdCache = new Map<string, string | null>();
    const ownerRows = isFirstPage
      ? [
          await mapCommunityOwnerAdminMemberRow({
            ctx,
            community,
            userIdCache,
          }),
        ]
      : [];
    const pagedMemberRows = rawPage.page.filter(
      (row: CommunityMembershipLike) =>
        communityMembershipRowIsActive(row) &&
        String(row.userId) !== String(community.ownerId),
    );
    const memberRows = await Promise.all(
      pagedMemberRows.map((row: CommunityMembershipLike) =>
        mapCommunityAdminMembershipRow({
          ctx,
          row,
          userIdCache,
          viewerCanManageMembers,
        }),
      ),
    );
    return {
      ...rawPage,
      page: [...ownerRows, ...memberRows],
    };
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

export const listCommunityMembershipCreatedAtRows = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    sinceIso: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const sinceMs = parseIsoMs(args.sinceIso);
    const limit = Math.max(1, Math.min(10_000, Math.floor(args.limit ?? 5000)));
    const { rows } = await listCommunityMembershipRowsForManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    return rows
      .filter((row) => (sinceMs === null ? true : row.createdAt >= sinceMs))
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, limit)
      .map((row) => ({ created_at: toIsoString(row.createdAt) }));
  },
});

export const communityOwnerHasArchitectAccess = query({
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
    (args as { userId?: any }).userId = userId;
    const nowMs = Date.now();
    const { community } = await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const entitlements = (await ctx.db
      .query("userEntitlements")
      .withIndex("by_user", (q: any) => q.eq("userId", community.ownerId))
      .collect()) as UserEntitlementLike[];
    const active = entitlements
      .filter((row) =>
        isActiveEntitlementWindow(nowMs, row.startsAt, row.endsAt),
      )
      .sort((a, b) => b.startsAt - a.startsAt);
    return tierHasArchitectAccess(active[0]?.tier);
  },
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
    const statusSet = new Set(
      (args.includeStatuses ?? ["pending"]).map((status) =>
        String(status ?? "")
          .trim()
          .toLowerCase(),
      ),
    );
    const rows = (await ctx.db
      .query("communityJoinRequests")
      .withIndex("by_community", (q: any) =>
        q.eq("communityId", args.communityId),
      )
      .collect()) as CommunityJoinRequestLike[];
    const limit = Math.max(1, Math.min(5000, Math.floor(args.limit ?? 200)));
    const userIdCache = new Map<string, string | null>();
    return await Promise.all(
      rows
        .filter((row) => !isPlatformHomeAutojoinOptOutRequest(row))
        .filter((row) =>
          statusSet.has(
            String(row.status ?? "")
              .trim()
              .toLowerCase(),
          ),
        )
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit)
        .map(async (row) => ({
          id: String(row._id),
          user_id:
            (await resolvePublicUserId(ctx, row.userId, userIdCache)) ??
            String(row.userId),
          message: row.message ?? null,
          status:
            String(row.status ?? "")
              .trim()
              .toLowerCase() || "pending",
          created_at: toIsoString(row.createdAt),
          updated_at: toIsoString(row.updatedAt),
        })),
    );
  },
});

export const approveCommunityJoinRequest = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    requestId: v.string(),
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
    return await runLoggedCommunityAdminMutation({
      operation: "approve_join_request",
      context: logContext,
      handler: async () => {
        const nowMs = Date.now();
        const request = (await ctx.db.get(
          args.requestId as any,
        )) as CommunityJoinRequestLike | null;
        if (!request) throw new Error("join_request_not_found");
        logContext.communityId = String(request.communityId);
        logContext.targetUserId = String(request.userId);
        const { community } = await requireCommunityModerator({
          ctx,
          communityId: request.communityId,
          userId: args.userId,
        });
        if (resolveCommunityEntryPolicy(community) === "paid_subscription") {
          throw new Error("community_paid_checkout_required");
        }
        const existingMembershipRows = (await ctx.db
          .query("communityMemberships")
          .withIndex("by_community_user", (q: any) =>
            q
              .eq("communityId", request.communityId)
              .eq("userId", request.userId),
          )
          .collect()) as CommunityMembershipLike[];
        const existingMembership = pickMostRelevantCommunityMembership(
          existingMembershipRows,
        );
        let grantedMembershipMarker: string | null = null;
        if (!existingMembership) {
          const membershipId = await ctx.db.insert("communityMemberships", {
            communityId: request.communityId,
            userId: request.userId,
            role: "member",
            accessSource: "free_grant",
            active: true,
            createdAt: nowMs,
            updatedAt: nowMs,
          });
          grantedMembershipMarker = `${String(membershipId)}:${nowMs}`;
        } else if (!communityMembershipRowIsActive(existingMembership)) {
          await ctx.db.patch(existingMembership._id as any, {
            accessSource:
              existingMembership.accessSource === "paid_subscription" ||
              existingMembership.accessSource === "free_grant" ||
              existingMembership.accessSource === "manual_grant"
                ? existingMembership.accessSource
                : "free_grant",
            active: true,
            revokedAt: undefined,
            revokedReason: undefined,
            updatedAt: nowMs,
          });
          grantedMembershipMarker = `${String(existingMembership._id)}:${nowMs}`;
        }
        await ctx.db.patch(request._id as any, {
          status: "approved",
          deniedAt: undefined,
          reapplyAt: undefined,
          updatedAt: nowMs,
        });
        if (isPlatformHomeCommunity({ communitySlug: community?.slug })) {
          await clearPlatformHomeCommunityAutojoinOptOut({
            ctx,
            communityId: request.communityId,
            userId: request.userId,
          });
        }
        if (grantedMembershipMarker) {
          await scheduleCommunityAppGrantSeedingBestEffort({
            ctx,
            communityId: request.communityId,
            userId: request.userId,
            nowMs,
            reason: "join_request_approved",
          });
        }
        if (grantedMembershipMarker) {
          await enqueueCommunityAccessGrantedEmailInternal({
            ctx,
            userId: request.userId,
            communityId: request.communityId,
            grantMarker: grantedMembershipMarker,
            nowMs,
          });
        }
        return { ok: true };
      },
    });
  },
});

export const denyCommunityJoinRequest = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    requestId: v.string(),
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
    return await runLoggedCommunityAdminMutation({
      operation: "deny_join_request",
      context: logContext,
      handler: async () => {
        const nowMs = Date.now();
        const request = (await ctx.db.get(
          args.requestId as any,
        )) as CommunityJoinRequestLike | null;
        if (!request) throw new Error("join_request_not_found");
        logContext.communityId = String(request.communityId);
        logContext.targetUserId = String(request.userId);
        await requireCommunityModerator({
          ctx,
          communityId: request.communityId,
          userId: args.userId,
        });
        await ctx.db.patch(request._id as any, {
          status: "denied",
          deniedAt: nowMs,
          reapplyAt: nowMs + COMMUNITY_JOIN_REAPPLY_COOLDOWN_MS,
          updatedAt: nowMs,
        });
        return { ok: true };
      },
    });
  },
});

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
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
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
        await ctx.db.patch(membership._id as any, {
          role,
          updatedAt: nowMs,
        });
        return { ok: true };
      },
    });
  },
});

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
        provider_subscription_ids: [],
      };
    }
    if (String(membership.communityId) !== String(args.communityId)) {
      return {
        ok: true,
        noop: true,
        provider_subscription_ids: [],
      };
    }
    if (String(community.ownerId) === String(membership.userId)) {
      throw new Error("community_owner_remove_forbidden");
    }
    const subscriptionRows = await listCommunitySubscriptionRowsForMembership({
      ctx,
      membershipId: membership._id,
    });
    const providerSubscriptionIds = subscriptionRows
      .map((row) => String(row.providerSubscriptionId ?? "").trim())
      .filter((value, index, list) => value.length > 0 && list.indexOf(value) === index);
    return {
      ok: true,
      noop: false,
      community_slug: community.slug,
      target_user_id: membership.userId,
      provider_subscription_ids: providerSubscriptionIds,
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
        await endCommunitySubscriptionsForMembership({
          ctx,
          membershipId: membership._id,
          nowMs,
        });
        await ctx.db.patch(membership._id as any, {
          active: false,
          revokedAt: nowMs,
          revokedReason: String(args.revokedReason ?? "").trim() || "removed_by_manager",
          updatedAt: nowMs,
        });

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

        const joinRequest = (await ctx.db
          .query("communityJoinRequests")
          .withIndex("by_community_user", (q: any) =>
            q
              .eq("communityId", args.communityId)
              .eq("userId", membership.userId),
          )
          .first()) as CommunityJoinRequestLike | null;
        if (joinRequest) {
          await ctx.db.patch(joinRequest._id as any, {
            status: "denied",
            deniedAt: nowMs,
            reapplyAt: nowMs + COMMUNITY_REMOVAL_REAPPLY_COOLDOWN_MS,
            updatedAt: nowMs,
          });
        } else {
          await ctx.db.insert("communityJoinRequests", {
            communityId: args.communityId,
            userId: membership.userId,
            status: "denied",
            deniedAt: nowMs,
            reapplyAt: nowMs + COMMUNITY_REMOVAL_REAPPLY_COOLDOWN_MS,
            createdAt: nowMs,
            updatedAt: nowMs,
          });
        }
        if (isPlatformHomeCommunity({ communitySlug: community.slug })) {
          await upsertPlatformHomeCommunityAutojoinOptOut({
            ctx,
            communityId: args.communityId,
            userId: membership.userId,
            nowMs,
            kind: "removed",
          });
        }
        return { ok: true };
      },
    });
  },
});

async function cancelStripeSubscriptionIfActive(providerSubscriptionId: string): Promise<void> {
  const subscriptionId = providerSubscriptionId.trim();
  if (!subscriptionId) return;
  const stripe = getStripeClient();
  let subscription: Awaited<ReturnType<typeof stripe.subscriptions.retrieve>>;
  try {
    subscription = await stripe.subscriptions.retrieve(subscriptionId);
  } catch (error: any) {
    if (error?.statusCode === 404 || error?.code === "resource_missing") return;
    throw error;
  }
  const status = String((subscription as any)?.status ?? "").trim().toLowerCase();
  if (!status || status === "canceled") return;
  await stripe.subscriptions.cancel(subscriptionId);
}

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
      provider_subscription_ids?: string[];
    } | null;
    if (prepared?.noop) return { ok: true, stripe_canceled_count: 0 };

    const providerSubscriptionIds = Array.isArray(prepared?.provider_subscription_ids)
      ? prepared.provider_subscription_ids
      : [];
    let stripeCanceledCount = 0;
    for (const providerSubscriptionId of providerSubscriptionIds) {
      await cancelStripeSubscriptionIfActive(providerSubscriptionId);
      stripeCanceledCount += 1;
    }

    await ctx.runMutation(
      internal.communityAdmin.revokeCommunityMemberInternal as any,
      {
        userId: args.userId,
        authSubject: args.authSubject ?? undefined,
        communityId: args.communityId,
        targetMembershipId: args.targetMembershipId,
        revokedReason: providerSubscriptionIds.length > 0
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
      provider_subscription_ids?: string[];
    } | null;
    if (prepared?.noop || !prepared?.target_user_id) return { ok: true, stripe_canceled_count: 0 };

    const providerSubscriptionIds = Array.isArray(prepared?.provider_subscription_ids)
      ? prepared.provider_subscription_ids
      : [];
    let stripeCanceledCount = 0;
    for (const providerSubscriptionId of providerSubscriptionIds) {
      await cancelStripeSubscriptionIfActive(providerSubscriptionId);
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
        revokedReason: providerSubscriptionIds.length > 0
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
    return { ok: true };
  },
});

export const unbanCommunityUser = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    targetUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
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
    return { ok: true };
  },
});

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
    (args as { userId?: any }).userId = userId;
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
  },
});

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
    (args as { userId?: any }).userId = userId;
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
  },
});

export const listCommunityPricePoints = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const activeOnly = args.activeOnly ?? true;
    const rows = (await ctx.db
      .query("communityPricePoints" as any)
      .withIndex("by_community", (q: any) =>
        q.eq("communityId", args.communityId),
      )
      .collect()) as CommunityPricePointLike[];
    return rows
      .filter((row) =>
        activeOnly ? Boolean(row.isCurrent) && !row.archivedAt : true,
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((row) => mapCommunityPricingRow(row));
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
    (args as { userId?: any }).userId = userId;
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
        return {
          community_id: String(updated._id),
          entry_policy: entryPolicy,
          updated_at: toIsoString(updated.updatedAt),
        };
      },
    });
  },
});

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
    (args as { userId?: any }).userId = userId;
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
        const membership = (await ctx.db
          .query("communityMemberships")
          .withIndex("by_community_user", (q: any) =>
            q.eq("communityId", args.communityId).eq("userId", args.userId),
          )
          .first()) as CommunityMembershipLike | null;
        if (membership) {
          await endCommunitySubscriptionsForMembership({
            ctx,
            membershipId: membership._id,
            nowMs,
          });
          await ctx.db.delete(membership._id as any);
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
        const joinRequest = (await ctx.db
          .query("communityJoinRequests")
          .withIndex("by_community_user", (q: any) =>
            q.eq("communityId", args.communityId).eq("userId", args.userId),
          )
          .first()) as CommunityJoinRequestLike | null;
        if (joinRequest) {
          await ctx.db.delete(joinRequest._id as any);
        }
        if (isPlatformHomeCommunity({ communitySlug: community.slug })) {
          await upsertPlatformHomeCommunityAutojoinOptOut({
            ctx,
            communityId: args.communityId,
            userId: args.userId,
            nowMs,
            kind: "left",
          });
        }
        return { ok: true };
      },
    });
  },
});

export const listCommunityRevenueSeries = query({
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
    const { community } = await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const range = normalizeAnalyticsRange(args.range);
    const nowMs = Date.now();
    const startMs = resolveAnalyticsWindowStartMs({
      range,
      nowMs,
      communityCreatedAt: community.createdAt,
    });
    const bucket = resolveAnalyticsBucket(range);
    const bucketStarts = buildAnalyticsBucketStarts({
      startMs,
      endMs: nowMs,
      bucket,
    });

    const subscriptions = (await ctx.db
      .query("communitySubscriptions" as any)
      .withIndex("by_community_status", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunitySubscriptionLike[];
    const pricePointCache = new Map<string, CommunityPricePointLike | null>();
    const monthlyRows: Array<{
      createdAt: number;
      endedAt: number | null;
      amountBaseUnits: number;
      currency: string | null;
      currencyDecimals: number | null;
    }> = [];
    let currency: string | null = null;
    let currencyDecimals: number | null = null;
    let mixedCurrency = false;

    for (const subscription of subscriptions) {
      const status = String(subscription.status ?? "");
      const isCurrentRecurring = ACTIVE_RECURRING_SUBSCRIPTION_STATUSES.has(status);
      const endedAtRaw = Number(subscription.endedAt ?? NaN);
      const endedAt = Number.isFinite(endedAtRaw)
        ? endedAtRaw
        : isCurrentRecurring
          ? null
          : Number(subscription.updatedAt ?? NaN);
      if (!isCurrentRecurring && !Number.isFinite(Number(endedAt))) continue;

      const pricePointId = String(subscription.pricePointId);
      if (!pricePointCache.has(pricePointId)) {
        pricePointCache.set(
          pricePointId,
          (await ctx.db.get(subscription.pricePointId as any)) as CommunityPricePointLike | null,
        );
      }
      const pricePoint = pricePointCache.get(pricePointId);
      if (!pricePoint) continue;
      const rowCurrency = String(pricePoint.currency ?? "").trim().toUpperCase() || null;
      const rowDecimals = Math.max(0, Math.floor(pricePoint.currencyDecimals ?? 0));
      if (currency && rowCurrency && currency !== rowCurrency) mixedCurrency = true;
      currency = currency ?? rowCurrency;
      currencyDecimals = currencyDecimals ?? rowDecimals;
      const period = String(pricePoint.billingPeriod ?? "").trim().toLowerCase();
      const amountBaseUnits =
        period === "annual"
          ? Math.round(Math.max(0, pricePoint.amountBaseUnits) / 12)
          : Math.max(0, Math.floor(pricePoint.amountBaseUnits));
      monthlyRows.push({
        createdAt: subscription.createdAt,
        endedAt: endedAt == null ? null : endedAt,
        amountBaseUnits,
        currency: rowCurrency,
        currencyDecimals: rowDecimals,
      });
    }

    if (mixedCurrency) return [];

    return bucketStarts.map((bucketStart, index) => {
      const nextBucketStart = bucketStarts[index + 1] ?? addAnalyticsBucket(bucketStart, bucket);
      const bucketEndMs = Math.min(nextBucketStart.getTime() - 1, nowMs);
      const bucketStartMs = bucketStart.getTime();
      const netBaseUnits = monthlyRows.reduce((sum, row) => {
        if (row.createdAt > bucketEndMs) return sum;
        if (row.endedAt != null && row.endedAt < bucketStartMs) return sum;
        return sum + row.amountBaseUnits;
      }, 0);
      return {
        bucket_start: bucketStart.toISOString(),
        net_base_units: netBaseUnits,
        currency,
        currency_decimals: currencyDecimals,
      };
    });
  },
});

export const listCommunityFunnelVisitCreatedAtRows = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    sinceIso: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const sinceMs = parseIsoMs(args.sinceIso);
    const limit = Math.max(1, Math.min(10_000, Math.floor(args.limit ?? 5000)));
    const rows = (await ctx.db
      .query("communityAnalyticsEvents" as any)
      .withIndex("by_community_event_createdAt", (q: any) => {
        const indexed = q.eq("communityId", args.communityId).eq("eventType", "funnel_visit");
        return sinceMs == null ? indexed : indexed.gte("createdAt", sinceMs);
      })
      .take(limit)) as Array<{ createdAt: number }>;
    return rows
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((row) => ({ created_at: toIsoString(row.createdAt) }));
  },
});

export const getCommunityAnalyticsSummary = query({
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
    const { community, rows } = await listCommunityMembershipRowsForManager({
      ctx,
      communityId: args.communityId,
      userId,
      authSubject: args.authSubject ?? null,
    });

    const nowMs = Date.now();
    const sinceMs = resolveAnalyticsWindowStartMs({
      range,
      nowMs,
      communityCreatedAt: community.createdAt,
    });

    const totalMembers = 1 + rows.length;
    const newMembersWindow = rows.reduce(
      (count, row) => count + (row.createdAt >= sinceMs ? 1 : 0),
      0,
    );

    const visitRows = (await ctx.db
      .query("communityAnalyticsEvents" as any)
      .withIndex("by_community_event_createdAt", (q: any) =>
        q.eq("communityId", args.communityId).eq("eventType", "funnel_visit").gte("createdAt", sinceMs),
      )
      .collect()) as Array<{ createdAt: number }>;
    const pageVisitsWindow = visitRows.length;
    const conversionRateWindow =
      pageVisitsWindow > 0 ? newMembersWindow / pageVisitsWindow : null;

    const activeSubscriptions = (await ctx.db
      .query("communitySubscriptions" as any)
      .withIndex("by_community_status", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunitySubscriptionLike[];
    const pricePointCache = new Map<string, CommunityPricePointLike | null>();
    let mrrBaseUnits = 0;
    let currency: string | null = null;
    let currencyDecimals: number | null = null;
    let mixedCurrency = false;
    for (const subscription of activeSubscriptions) {
      if (!ACTIVE_RECURRING_SUBSCRIPTION_STATUSES.has(String(subscription.status))) continue;
      const pricePointId = String(subscription.pricePointId);
      if (!pricePointCache.has(pricePointId)) {
        pricePointCache.set(
          pricePointId,
          (await ctx.db.get(subscription.pricePointId as any)) as CommunityPricePointLike | null,
        );
      }
      const pricePoint = pricePointCache.get(pricePointId);
      if (!pricePoint) continue;
      const rowCurrency = String(pricePoint.currency ?? "").trim().toUpperCase() || null;
      const rowDecimals = Math.max(0, Math.floor(pricePoint.currencyDecimals ?? 0));
      if (currency && rowCurrency && currency !== rowCurrency) mixedCurrency = true;
      currency = currency ?? rowCurrency;
      currencyDecimals = currencyDecimals ?? rowDecimals;
      const period = String(pricePoint.billingPeriod ?? "").trim().toLowerCase();
      const monthlyBaseUnits =
        period === "annual"
          ? Math.round(Math.max(0, pricePoint.amountBaseUnits) / 12)
          : Math.max(0, Math.floor(pricePoint.amountBaseUnits));
      mrrBaseUnits += monthlyBaseUnits;
    }

    return {
      page_visits_window: pageVisitsWindow,
      total_members: totalMembers,
      new_members_window: newMembersWindow,
      conversion_rate_window: conversionRateWindow,
      mrr_base_units: mixedCurrency ? null : mrrBaseUnits,
      currency: mixedCurrency ? null : currency,
      currency_decimals: mixedCurrency ? null : currencyDecimals,
    };
  },
});

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
    const { community, rows } = await listCommunityMembershipRowsForManager({
      ctx,
      communityId: args.communityId,
      userId,
      authSubject: args.authSubject ?? null,
    });

    const nowMs = Date.now();
    const sinceMs = resolveAnalyticsWindowStartMs({
      range,
      nowMs,
      communityCreatedAt: community.createdAt,
    });
    const bucket = resolveAnalyticsBucket(range);
    const bucketStarts = buildAnalyticsBucketStarts({
      startMs: sinceMs,
      endMs: nowMs,
      bucket,
    });

    const memberRowsWindow = rows.filter((row) => row.createdAt >= sinceMs);
    const visitRows = (await ctx.db
      .query("communityAnalyticsEvents" as any)
      .withIndex("by_community_event_createdAt", (q: any) =>
        q
          .eq("communityId", args.communityId)
          .eq("eventType", "funnel_visit")
          .gte("createdAt", sinceMs),
      )
      .take(MAX_ANALYTICS_SNAPSHOT_EVENT_ROWS)) as Array<{ createdAt: number }>;

    const subscriptions = (await ctx.db
      .query("communitySubscriptions" as any)
      .withIndex("by_community_status", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunitySubscriptionLike[];
    const pricePointCache = new Map<string, CommunityPricePointLike | null>();
    const monthlyRows: Array<{
      createdAt: number;
      endedAt: number | null;
      amountBaseUnits: number;
    }> = [];
    let mrrBaseUnits = 0;
    let currency: string | null = null;
    let currencyDecimals: number | null = null;
    let mixedCurrency = false;

    for (const subscription of subscriptions) {
      const status = String(subscription.status ?? "");
      const isCurrentRecurring = ACTIVE_RECURRING_SUBSCRIPTION_STATUSES.has(status);
      const endedAtRaw = Number(subscription.endedAt ?? NaN);
      const endedAt = Number.isFinite(endedAtRaw)
        ? endedAtRaw
        : isCurrentRecurring
          ? null
          : Number(subscription.updatedAt ?? NaN);
      if (!isCurrentRecurring && !Number.isFinite(Number(endedAt))) continue;

      const pricePointId = String(subscription.pricePointId);
      if (!pricePointCache.has(pricePointId)) {
        pricePointCache.set(
          pricePointId,
          (await ctx.db.get(subscription.pricePointId as any)) as CommunityPricePointLike | null,
        );
      }
      const pricePoint = pricePointCache.get(pricePointId);
      if (!pricePoint) continue;
      const rowCurrency = String(pricePoint.currency ?? "").trim().toUpperCase() || null;
      const rowDecimals = Math.max(0, Math.floor(pricePoint.currencyDecimals ?? 0));
      if (currency && rowCurrency && currency !== rowCurrency) mixedCurrency = true;
      currency = currency ?? rowCurrency;
      currencyDecimals = currencyDecimals ?? rowDecimals;
      const period = String(pricePoint.billingPeriod ?? "").trim().toLowerCase();
      const monthlyBaseUnits =
        period === "annual"
          ? Math.round(Math.max(0, pricePoint.amountBaseUnits) / 12)
          : Math.max(0, Math.floor(pricePoint.amountBaseUnits));
      if (isCurrentRecurring) {
        mrrBaseUnits += monthlyBaseUnits;
      }
      monthlyRows.push({
        createdAt: subscription.createdAt,
        endedAt: endedAt == null ? null : endedAt,
        amountBaseUnits: monthlyBaseUnits,
      });
    }

    return {
      range,
      bucket,
      generated_at: toIsoString(nowMs),
      summary: {
        page_visits_window: visitRows.length,
        total_members: 1 + rows.length,
        new_members_window: memberRowsWindow.length,
        conversion_rate_window:
          visitRows.length > 0 ? memberRowsWindow.length / visitRows.length : null,
        mrr_base_units: mixedCurrency ? null : mrrBaseUnits,
        currency: mixedCurrency ? null : currency,
        currency_decimals: mixedCurrency ? null : currencyDecimals,
        active_members_window: null,
        retention_window: null,
        total_resources: null,
        resources_added_window: null,
      },
      series: {
        visits: buildAnalyticsCountSeries({
          rows: visitRows,
          bucketStarts,
          bucket,
        }),
        members: buildAnalyticsCountSeries({
          rows: memberRowsWindow,
          bucketStarts,
          bucket,
        }),
        revenue: mixedCurrency
          ? []
          : buildAnalyticsRecurringRevenueSeries({
            rows: monthlyRows,
            bucketStarts,
            bucket,
            nowMs,
          }),
      },
    };
  },
});

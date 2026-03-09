import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  type CommunityJoinRequestLike,
  type CommunityLike,
  type CommunityMemberSettingsLike,
  type CommunityMembershipLike,
  type CommunityPricePointLike,
  type CommunitySubscriptionLike,
  type UserEntitlementLike,
  communityMembershipRowIsActive,
  isActiveEntitlementWindow,
  listCommunityMembershipRowsForManager,
  mapCommunityMemberSettingsRow,
  mapCommunityPricingRow,
  normalizeCommunityRoleForOutput,
  normalizeRoleAssignment,
  parseIsoMs,
  requireCommunityChatAccess,
  requireCommunityModerator,
  requireCommunityManager,
  resolveCommunityEntryPolicy,
  resolveCommunityMembershipEntitlementState,
  resolveCommunityBrandingFields,
  resolvePublicUserId,
  resolveUserIdForAuthenticatedRequest,
  tierHasBuilderAccess,
  tierHasArchitectAccess,
  toIsoString,
} from "./communityCore";

async function endCommunitySubscriptionsForMembership(args: {
  ctx: any;
  membershipId: any;
  nowMs: number;
}): Promise<void> {
  const rows = await args.ctx.db
    .query("communitySubscriptions" as any)
    .withIndex("by_membership", (q: any) => q.eq("membershipId", args.membershipId))
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
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect()) as CommunityMembershipLike[];
    const activeRows = membershipRows
      .filter((row) => communityMembershipRowIsActive(row))
      .sort((a, b) => a.createdAt - b.createdAt);
    const ownedCommunities = (await ctx.db
      .query("communities")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.userId))
      .collect()) as CommunityLike[];
    const userIdCache = new Map<string, string | null>();

    const buildCommunityProjection = async (community: CommunityLike) => {
      const branding = await resolveCommunityBrandingFields(ctx, community);
      const base = {
        id: String(community._id),
        slug: community.slug,
        name: community.name,
        owner_id: (await resolvePublicUserId(ctx, community.ownerId, userIdCache)) ?? String(community.ownerId),
        created_at: toIsoString(community.createdAt),
      };
      return selectMode === "minimal"
        ? base
        : {
            ...base,
            description: community.description ?? null,
            avatar_url: branding.avatar_url,
            avatar_storage_id: branding.avatar_storage_id,
            banner_url: branding.banner_url,
            banner_storage_id: branding.banner_storage_id,
            banner_focus_x: branding.banner_focus_x,
            banner_focus_y: branding.banner_focus_y,
            banner_zoom: branding.banner_zoom,
            visibility: community.visibility,
            entry_policy: resolveCommunityEntryPolicy(community),
            updated_at: toIsoString(community.updatedAt),
          };
    };

    const out: Array<{
      sort_ms: number;
      community_id: string;
      role: string;
      communities: Record<string, unknown>;
    }> = [];
    for (const community of ownedCommunities.slice().sort((a, b) => a.createdAt - b.createdAt)) {
      out.push({
        sort_ms: community.createdAt,
        community_id: String(community._id),
        role: "owner",
        communities: await buildCommunityProjection(community),
      });
    }
    for (const row of activeRows) {
      const community = (await ctx.db.get(row.communityId)) as CommunityLike | null;
      if (!community) continue;
      if (String(community.ownerId) === String(row.userId)) continue;
      const entitlement = await resolveCommunityMembershipEntitlementState({
        ctx,
        community,
        membership: row,
        userId: row.userId,
      });
      if (!entitlement.isEntitled) continue;
      if (out.some((entry) => entry.community_id === String(row.communityId))) continue;
      out.push({
        sort_ms: row.createdAt,
        community_id: String(row.communityId),
        role: normalizeCommunityRoleForOutput(row.role) || "member",
        communities: await buildCommunityProjection(community),
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
    const { community, rows } = await listCommunityMembershipRowsForManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const userIdCache = new Map<string, string | null>();
    const ownerRow = {
      id: `owner:${String(community._id)}`,
      community_id: String(community._id),
      user_id: (await resolvePublicUserId(ctx, community.ownerId, userIdCache)) ?? String(community.ownerId),
      role: "owner",
      access_source: "manual_grant",
      is_entitled: true,
      entitlement_ends_at: null,
      subscription_status: null,
      subscription_cancel_at_period_end: null,
      billing_period: null,
      amount_base_units: null,
      currency: null,
      currency_decimals: null,
      created_at: toIsoString(community.createdAt),
    };
    const memberRows = await Promise.all(
      rows.slice(0, Math.max(0, limit - 1)).map(async (row) => {
        const entitlement = await resolveCommunityMembershipEntitlementState({
          ctx,
          community,
          membership: row,
          userId: row.userId,
        });
        const subscription = ((await ctx.db
          .query("communitySubscriptions" as any)
          .withIndex("by_membership", (q: any) => q.eq("membershipId", row._id))
          .collect()) as CommunitySubscriptionLike[])
          .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
        const pricePointId = subscription?.pricePointId ?? row.pricePointId ?? null;
        const pricePoint = pricePointId
          ? ((await ctx.db.get(pricePointId)) as CommunityPricePointLike | null)
          : null;
        return {
          id: String(row._id),
          community_id: String(row.communityId),
          user_id: (await resolvePublicUserId(ctx, row.userId, userIdCache)) ?? String(row.userId),
          role: normalizeCommunityRoleForOutput(row.role) || "member",
          access_source: row.accessSource ?? null,
          is_entitled: entitlement.isEntitled,
          entitlement_ends_at:
            typeof entitlement.subscriptionCurrentPeriodEndAt === "number"
              ? toIsoString(entitlement.subscriptionCurrentPeriodEndAt)
              : null,
          subscription_status: subscription ? String(subscription.status) : null,
          subscription_cancel_at_period_end: subscription ? Boolean(subscription.cancelAtPeriodEnd) : null,
          billing_period: pricePoint ? String(pricePoint.billingPeriod ?? "").trim().toLowerCase() || null : null,
          amount_base_units: pricePoint ? Math.max(0, Math.floor(pricePoint.amountBaseUnits)) : null,
          currency: pricePoint?.currency ?? null,
          currency_decimals: pricePoint ? Math.max(0, Math.floor(pricePoint.currencyDecimals)) : null,
          created_at: toIsoString(row.createdAt),
        };
      }),
    );
    return [ownerRow, ...memberRows].slice(0, limit);
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
    const { community, rows } = await listCommunityMembershipRowsForManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const ownerIncluded = sinceMs === null || community.createdAt >= sinceMs ? 1 : 0;
    return ownerIncluded + rows.reduce((count, row) => count + (sinceMs === null || row.createdAt >= sinceMs ? 1 : 0), 0);
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
    const { community, rows } = await listCommunityMembershipRowsForManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    return [{ createdAt: community.createdAt }, ...rows]
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
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const nowMs = args.nowMs ?? Date.now();
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
      .filter((row) => isActiveEntitlementWindow(nowMs, row.startsAt, row.endsAt))
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
      (args.includeStatuses ?? ["pending"]).map((status) => String(status ?? "").trim().toLowerCase()),
    );
    const rows = (await ctx.db
      .query("communityJoinRequests")
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunityJoinRequestLike[];
    const limit = Math.max(1, Math.min(5000, Math.floor(args.limit ?? 200)));
    const userIdCache = new Map<string, string | null>();
    return await Promise.all(
      rows
        .filter((row) => statusSet.has(String(row.status ?? "").trim().toLowerCase()))
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit)
        .map(async (row) => ({
          id: String(row._id),
          user_id: (await resolvePublicUserId(ctx, row.userId, userIdCache)) ?? String(row.userId),
          message: row.message ?? null,
          status: String(row.status ?? "").trim().toLowerCase() || "pending",
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
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const nowMs = args.nowMs ?? Date.now();
    const request = (await ctx.db.get(args.requestId as any)) as CommunityJoinRequestLike | null;
    if (!request) throw new Error("join_request_not_found");
    await requireCommunityModerator({
      ctx,
      communityId: request.communityId,
      userId: args.userId,
    });
    const existingMembership = (await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q: any) =>
        q.eq("communityId", request.communityId).eq("userId", request.userId),
      )
      .first()) as CommunityMembershipLike | null;
    if (!existingMembership) {
      await ctx.db.insert("communityMemberships", {
        communityId: request.communityId,
        userId: request.userId,
        role: "member",
        accessSource: "free_grant",
        active: true,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    } else if (!communityMembershipRowIsActive(existingMembership)) {
      await ctx.db.patch(existingMembership._id as any, {
        accessSource: existingMembership.accessSource ?? "free_grant",
        active: true,
        revokedAt: undefined,
        revokedReason: undefined,
        updatedAt: nowMs,
      });
    }
    await ctx.db.patch(request._id as any, {
      status: "approved",
      updatedAt: nowMs,
    });
    return { ok: true };
  },
});

export const denyCommunityJoinRequest = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    requestId: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const nowMs = args.nowMs ?? Date.now();
    const request = (await ctx.db.get(args.requestId as any)) as CommunityJoinRequestLike | null;
    if (!request) throw new Error("join_request_not_found");
    await requireCommunityModerator({
      ctx,
      communityId: request.communityId,
      userId: args.userId,
    });
    await ctx.db.patch(request._id as any, {
      status: "denied",
      updatedAt: nowMs,
    });
    return { ok: true };
  },
});

export const setCommunityMemberRole = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    targetUserId: v.id("users"),
    role: v.union(v.literal("admin"), v.literal("moderator"), v.literal("member")),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const nowMs = args.nowMs ?? Date.now();
    const role = normalizeRoleAssignment(args.role);
    const { community } = await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    if (String(community.ownerId) === String(args.targetUserId)) {
      throw new Error("community_owner_role_fixed");
    }
    const membership = (await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q: any) =>
        q.eq("communityId", args.communityId).eq("userId", args.targetUserId),
      )
      .first()) as CommunityMembershipLike | null;
    if (!membership) throw new Error("community_membership_not_found");
    await ctx.db.patch(membership._id as any, {
      role,
      updatedAt: nowMs,
    });
    return { ok: true };
  },
});

export const removeCommunityMember = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    targetUserId: v.id("users"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const nowMs = args.nowMs ?? Date.now();
    const { community } = await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    if (String(community.ownerId) === String(args.targetUserId)) {
      throw new Error("community_owner_remove_forbidden");
    }
    const membership = (await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q: any) =>
        q.eq("communityId", args.communityId).eq("userId", args.targetUserId),
      )
      .first()) as CommunityMembershipLike | null;
    if (!membership) return { ok: true };
    await endCommunitySubscriptionsForMembership({
      ctx,
      membershipId: membership._id,
      nowMs,
    });
    await ctx.db.delete(membership._id as any);

    const memberSettings = (await ctx.db
      .query("communityMemberSettings" as any)
      .withIndex("by_community_user", (q: any) =>
        q.eq("communityId", args.communityId).eq("userId", args.targetUserId),
      )
      .first()) as CommunityMemberSettingsLike | null;
    if (memberSettings) {
      await ctx.db.delete(memberSettings._id as any);
    }

    const joinRequest = (await ctx.db
      .query("communityJoinRequests")
      .withIndex("by_community_user", (q: any) =>
        q.eq("communityId", args.communityId).eq("userId", args.targetUserId),
      )
      .first()) as CommunityJoinRequestLike | null;
    if (joinRequest) {
      await ctx.db.patch(joinRequest._id as any, {
        status: "denied",
        updatedAt: nowMs,
      });
    }
    return { ok: true };
  },
});

export const getCommunityMemberSettings = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    targetUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const targetUserId = args.targetUserId ?? args.userId;
    if (String(targetUserId) === String(args.userId)) {
      await requireCommunityChatAccess({
        ctx,
        communityId: args.communityId,
        userId: args.userId,
      });
    } else {
      await requireCommunityModerator({
        ctx,
        communityId: args.communityId,
        userId: args.userId,
      });
    }
    const row = (await ctx.db
      .query("communityMemberSettings" as any)
      .withIndex("by_community_user", (q: any) => q.eq("communityId", args.communityId).eq("userId", targetUserId))
      .first()) as CommunityMemberSettingsLike | null;
    return row ? await mapCommunityMemberSettingsRow(ctx, row) : null;
  },
});

export const saveCommunityMemberSettings = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    targetUserId: v.optional(v.id("users")),
    muted: v.boolean(),
    mutedUntilIso: v.optional(v.union(v.string(), v.null())),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const nowMs = args.nowMs ?? Date.now();
    const targetUserId = args.targetUserId ?? args.userId;
    if (String(targetUserId) === String(args.userId)) {
      await requireCommunityChatAccess({
        ctx,
        communityId: args.communityId,
        userId: args.userId,
      });
    } else {
      await requireCommunityModerator({
        ctx,
        communityId: args.communityId,
        userId: args.userId,
      });
    }
    const mutedUntil = parseIsoMs(args.mutedUntilIso);
    const existing = (await ctx.db
      .query("communityMemberSettings" as any)
      .withIndex("by_community_user", (q: any) => q.eq("communityId", args.communityId).eq("userId", targetUserId))
      .first()) as CommunityMemberSettingsLike | null;
    if (existing) {
      await ctx.db.patch(existing._id as any, {
        muted: Boolean(args.muted),
        mutedUntil: typeof mutedUntil === "number" ? mutedUntil : undefined,
        updatedAt: nowMs,
      });
      const updated = (await ctx.db.get(existing._id as any)) as CommunityMemberSettingsLike | null;
      if (!updated) throw new Error("community_member_settings_not_found");
      return await mapCommunityMemberSettingsRow(ctx, updated);
    }
    const id = await ctx.db.insert("communityMemberSettings" as any, {
      communityId: args.communityId,
      userId: targetUserId,
      muted: Boolean(args.muted),
      mutedUntil: typeof mutedUntil === "number" ? mutedUntil : undefined,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const created = (await ctx.db.get(id as any)) as CommunityMemberSettingsLike | null;
    if (!created) throw new Error("community_member_settings_create_failed");
    return await mapCommunityMemberSettingsRow(ctx, created);
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
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunityPricePointLike[];
    return rows
      .filter((row) => (activeOnly ? Boolean(row.isCurrent) && !row.archivedAt : true))
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
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const nowMs = args.nowMs ?? Date.now();
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
      currentEntryPolicy === "paid_unlock" || currentEntryPolicy === "paid_subscription"
        ? currentEntryPolicy
        : nextMode;
    await ctx.db.patch(community._id as any, {
      entryPolicy: nextEntryPolicy,
      updatedAt: nowMs,
    });
    const updated = (await ctx.db.get(community._id as any)) as CommunityLike | null;
    if (!updated) throw new Error("community_not_found");
    const entryPolicy = resolveCommunityEntryPolicy(updated);
    return {
      community_id: String(updated._id),
      entry_policy: entryPolicy,
      updated_at: toIsoString(updated.updatedAt),
    };
  },
});

export const leaveCommunity = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const nowMs = args.nowMs ?? Date.now();
    const community = (await ctx.db.get(args.communityId)) as CommunityLike | null;
    if (!community) throw new Error("community_not_found");
    if (String(community.ownerId) === String(args.userId)) {
      throw new Error("community_owner_cannot_leave");
    }
    const membership = (await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q: any) => q.eq("communityId", args.communityId).eq("userId", args.userId))
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
      .withIndex("by_community_user", (q: any) => q.eq("communityId", args.communityId).eq("userId", args.userId))
      .first()) as CommunityMemberSettingsLike | null;
    if (memberSettings) {
      await ctx.db.delete(memberSettings._id as any);
    }
    const joinRequest = (await ctx.db
      .query("communityJoinRequests")
      .withIndex("by_community_user", (q: any) => q.eq("communityId", args.communityId).eq("userId", args.userId))
      .first()) as CommunityJoinRequestLike | null;
    if (joinRequest) {
      await ctx.db.patch(joinRequest._id as any, {
        status: "denied",
        updatedAt: nowMs,
      });
    }
    return { ok: true };
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
    void args.range;
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    return [] as Array<{
      bucket_start: string;
      net_base_units: number;
      currency: string;
      currency_decimals: number;
    }>;
  },
});

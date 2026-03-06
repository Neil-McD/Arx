import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  type CommunityInviteLike,
  type CommunityJoinRequestLike,
  type CommunityLike,
  type CommunityMemberSettingsLike,
  type CommunityMembershipLike,
  type CommunityPlanLike,
  type UserEntitlementLike,
  isActiveEntitlementWindow,
  inviteIsExpired,
  listCommunityMembershipRowsForManager,
  mapCommunityInviteRow,
  mapCommunityMemberSettingsRow,
  mapCommunityPricingRow,
  normalizeInviteCode,
  normalizeOptionalPositiveInt,
  normalizeRoleAssignment,
  parseIsoMs,
  requireCommunityChatAccess,
  requireCommunityInviteManager,
  requireCommunityManager,
  resolveCommunityBrandingFields,
  resolvePublicUserId,
  resolveUserIdForAuthenticatedRequest,
  tierHasProAccess,
  toIsoString,
} from "./communityCore";

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
    const rows = (await ctx.db
      .query("communityMemberships")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect()) as CommunityMembershipLike[];
    rows.sort((a, b) => a.createdAt - b.createdAt);

    const out: Array<{
      community_id: string;
      role: string;
      communities: Record<string, unknown>;
    }> = [];
    for (const row of rows) {
      const community = (await ctx.db.get(row.communityId)) as CommunityLike | null;
      if (!community) continue;
      const branding = await resolveCommunityBrandingFields(ctx, community);
      const userIdCache = new Map<string, string | null>();
      const base = {
        id: String(community._id),
        slug: community.slug,
        name: community.name,
        owner_id: (await resolvePublicUserId(ctx, community.ownerId, userIdCache)) ?? String(community.ownerId),
        created_at: toIsoString(community.createdAt),
      };
      const communities =
        selectMode === "minimal"
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
              free_join_requires_approval: Boolean(community.freeJoinRequiresApproval),
              updated_at: toIsoString(community.updatedAt),
            };
      out.push({
        community_id: String(row.communityId),
        role: row.role,
        communities,
      });
    }
    return out;
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
    const { rows } = await listCommunityMembershipRowsForManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const userIdCache = new Map<string, string | null>();
    return await Promise.all(
      rows.slice(0, limit).map(async (row) => ({
        id: String(row._id),
        community_id: String(row.communityId),
        user_id: (await resolvePublicUserId(ctx, row.userId, userIdCache)) ?? String(row.userId),
        role: row.role,
        created_at: toIsoString(row.createdAt),
      })),
    );
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
    const { rows } = await listCommunityMembershipRowsForManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    if (sinceMs === null) return rows.length;
    return rows.reduce((count, row) => count + (row.createdAt >= sinceMs ? 1 : 0), 0);
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
      .slice(0, limit)
      .map((row) => ({ created_at: toIsoString(row.createdAt) }));
  },
});

export const communityOwnerIsPro = query({
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
    return tierHasProAccess(active[0]?.tier);
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
    await requireCommunityManager({
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
    await requireCommunityManager({
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
        createdAt: nowMs,
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
    await requireCommunityManager({
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
    role: v.string(),
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
      await requireCommunityManager({
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
      await requireCommunityManager({
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

export const getCommunityPricing = query({
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
      .query("communityPlans")
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunityPlanLike[];
    return rows
      .filter((row) => (activeOnly ? Boolean(row.active) : true))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((row) => mapCommunityPricingRow(row));
  },
});

export const setCommunityFreeJoinRequiresApproval = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    requiresApproval: v.boolean(),
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
    const nextJoinMode =
      community.joinMode === "checkout" ? "checkout" : args.requiresApproval ? "request_access" : "join_free";
    await ctx.db.patch(community._id as any, {
      freeJoinRequiresApproval: Boolean(args.requiresApproval),
      joinMode: nextJoinMode,
      updatedAt: nowMs,
    });
    const updated = (await ctx.db.get(community._id as any)) as CommunityLike | null;
    if (!updated) throw new Error("community_not_found");
    return {
      community_id: String(updated._id),
      free_join_requires_approval: Boolean(updated.freeJoinRequiresApproval),
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

export const listCommunityInvites = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    await requireCommunityInviteManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const rows = (await ctx.db
      .query("communityInvites" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunityInviteLike[];
    const limit = Math.max(1, Math.min(500, Math.floor(args.limit ?? 200)));
    const userIdCache = new Map<string, string | null>();
    return await Promise.all(
      rows
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit)
        .map((row) => mapCommunityInviteRow(ctx, row, userIdCache)),
    );
  },
});

export const createCommunityInvite = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    code: v.string(),
    maxUses: v.optional(v.union(v.number(), v.null())),
    expiresAt: v.optional(v.union(v.string(), v.null())),
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
    await requireCommunityInviteManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const code = normalizeInviteCode(args.code);
    const maxUses = normalizeOptionalPositiveInt(args.maxUses);
    const expiresAtMs = parseIsoMs(args.expiresAt);
    if (typeof expiresAtMs === "number" && expiresAtMs <= nowMs) {
      throw new Error("invite_expired");
    }

    const existingByCode = (await ctx.db
      .query("communityInvites" as any)
      .withIndex("by_code", (q: any) => q.eq("code", code))
      .first()) as CommunityInviteLike | null;
    if (existingByCode) throw new Error("invite_code_taken");

    const inviteId = await ctx.db.insert("communityInvites" as any, {
      communityId: args.communityId,
      code,
      maxUses,
      usesCount: 0,
      ...(typeof expiresAtMs === "number" ? { expiresAt: expiresAtMs } : null),
      createdByUserId: args.userId,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const created = (await ctx.db.get(inviteId as any)) as CommunityInviteLike | null;
    if (!created) throw new Error("invite_create_failed");
    return await mapCommunityInviteRow(ctx, created);
  },
});

export const revokeCommunityInvite = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    inviteId: v.string(),
    revokedAtIso: v.optional(v.union(v.string(), v.null())),
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
    const invite = (await ctx.db.get(args.inviteId as any)) as CommunityInviteLike | null;
    if (!invite) throw new Error("invite_not_found");
    await requireCommunityInviteManager({
      ctx,
      communityId: invite.communityId,
      userId: args.userId,
    });
    const revokedAtMs = parseIsoMs(args.revokedAtIso) ?? nowMs;
    await ctx.db.patch(invite._id as any, {
      revokedAt: revokedAtMs,
      updatedAt: nowMs,
    });
    const updated = (await ctx.db.get(invite._id as any)) as CommunityInviteLike | null;
    if (!updated) throw new Error("invite_not_found");
    return await mapCommunityInviteRow(ctx, updated);
  },
});

export const deleteCommunityInvite = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    inviteId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const invite = (await ctx.db.get(args.inviteId as any)) as CommunityInviteLike | null;
    if (!invite) throw new Error("invite_not_found");
    await requireCommunityInviteManager({
      ctx,
      communityId: invite.communityId,
      userId: args.userId,
    });
    await ctx.db.delete(invite._id as any);
    return { ok: true };
  },
});

export const acceptCommunityInvite = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    inviteCode: v.string(),
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
    const inviteCode = normalizeInviteCode(args.inviteCode);
    const invite = (await ctx.db
      .query("communityInvites" as any)
      .withIndex("by_code", (q: any) => q.eq("code", inviteCode))
      .first()) as CommunityInviteLike | null;
    if (!invite) throw new Error("invite_not_found");
    if (inviteIsExpired(invite, nowMs)) throw new Error("invite_expired");

    const community = (await ctx.db.get(invite.communityId)) as CommunityLike | null;
    if (!community) throw new Error("community_not_found");

    const existingMembership = (await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q) => q.eq("communityId", community._id).eq("userId", args.userId))
      .first()) as CommunityMembershipLike | null;
    if (!existingMembership) {
      await ctx.db.insert("communityMemberships", {
        communityId: community._id,
        userId: args.userId,
        role: "member",
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      await ctx.db.patch(invite._id as any, {
        usesCount: Math.max(0, Math.floor(invite.usesCount)) + 1,
        updatedAt: nowMs,
      });
    }

    return {
      community_id: String(community._id),
      community_slug: community.slug,
      community_name: community.name,
    };
  },
});

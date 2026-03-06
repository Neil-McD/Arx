import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  type CommunityJoinRequestLike,
  type CommunityLike,
  type CommunityMemoryCandidateLike,
  type CommunityMembershipLike,
  type CommunityPlanLike,
  type CommunityResourceLike,
  type PublicPlanSummaryLike,
  canCreateCommunityResource,
  getCommunityAndMembership,
  mapActivePlanSummaries,
  mapCommunityAccessRow,
  mapCommunityMemoryCandidateRow,
  mapCommunityResourceRow,
  mapJoinRequestRow,
  normalizeName,
  normalizeOptionalFileKey,
  normalizeOptionalText,
  normalizeOptionalUrl,
  normalizeResourceType,
  normalizeSlug,
  parseIsoMs,
  pickPreferredActivePlan,
  requireCommunityChatAccess,
  requireCommunityManager,
  resolveCommunityBrandingFields,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";

export const listCommunityResources = query({
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
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const limit = Math.max(1, Math.min(5000, Math.floor(args.limit ?? 200)));
    const rows = (await ctx.db
      .query("communityResources" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunityResourceLike[];
    const userIdCache = new Map<string, string | null>();
    return await Promise.all(
      rows
        .slice()
        .sort((a, b) => {
          if (Boolean(a.pinned) !== Boolean(b.pinned)) return Boolean(a.pinned) ? -1 : 1;
          return b.createdAt - a.createdAt;
        })
        .slice(0, limit)
        .map((row) => mapCommunityResourceRow(ctx, row, userIdCache)),
    );
  },
});

export const countCommunityResources = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    sinceIso: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const sinceMs = parseIsoMs(args.sinceIso);
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const rows = (await ctx.db
      .query("communityResources" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunityResourceLike[];
    if (sinceMs === null) return rows.length;
    return rows.reduce((count, row) => count + (row.createdAt >= sinceMs ? 1 : 0), 0);
  },
});

export const saveCommunityResource = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    resourceId: v.optional(v.union(v.string(), v.null())),
    isPatch: v.optional(v.boolean()),
    payload: v.optional(v.any()),
    communityId: v.optional(v.id("communities")),
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
    const payload =
      args.payload && typeof args.payload === "object" && !Array.isArray(args.payload)
        ? (args.payload as Record<string, unknown>)
        : {};
    const resourceId = String(args.resourceId ?? "").trim();
    const isPatch = Boolean(args.isPatch) || resourceId.length > 0;

    if (isPatch) {
      if (!resourceId) throw new Error("community_resource_id_required");
      const existing = (await ctx.db.get(resourceId as any)) as CommunityResourceLike | null;
      if (!existing) throw new Error("community_resource_not_found");
      await requireCommunityManager({
        ctx,
        communityId: existing.communityId,
        userId: args.userId,
      });
      const nextTitleRaw = Object.prototype.hasOwnProperty.call(payload, "title") ? payload.title : existing.title;
      const nextTitle = normalizeName(nextTitleRaw);
      const nextTypeRaw = Object.prototype.hasOwnProperty.call(payload, "type") ? payload.type : existing.type;
      const nextBodyRaw = Object.prototype.hasOwnProperty.call(payload, "body_md") ? payload.body_md : existing.bodyMd;
      const nextUrlRaw = Object.prototype.hasOwnProperty.call(payload, "url") ? payload.url : existing.url;
      const nextFileKeyRaw = Object.prototype.hasOwnProperty.call(payload, "file_key")
        ? payload.file_key
        : existing.fileKey;
      const nextPinnedRaw = Object.prototype.hasOwnProperty.call(payload, "pinned") ? payload.pinned : existing.pinned;

      await ctx.db.patch(existing._id as any, {
        type: normalizeResourceType(nextTypeRaw),
        title: nextTitle,
        bodyMd: normalizeOptionalText(nextBodyRaw, 20_000),
        url: normalizeOptionalUrl(nextUrlRaw),
        fileKey: normalizeOptionalFileKey(nextFileKeyRaw),
        pinned: Boolean(nextPinnedRaw),
        updatedAt: nowMs,
      });
      const updated = (await ctx.db.get(existing._id as any)) as CommunityResourceLike | null;
      if (!updated) throw new Error("community_resource_not_found");
      return await mapCommunityResourceRow(ctx, updated);
    }

    const communityIdRaw = args.communityId ?? (payload.community_id as any);
    if (!communityIdRaw) throw new Error("community_id_required");
    const { community, membership } = await getCommunityAndMembership({
      ctx,
      communityId: communityIdRaw,
      userId: args.userId,
    });
    if (!canCreateCommunityResource({ community, membership, userId: args.userId })) {
      throw new Error("community_entitlement_required");
    }
    const type = normalizeResourceType(payload.type);
    const title = normalizeName(payload.title);
    const bodyMd = normalizeOptionalText(payload.body_md, 20_000);
    const url = normalizeOptionalUrl(payload.url);
    const fileKey = normalizeOptionalFileKey(payload.file_key);
    const pinned = Boolean(payload.pinned);

    const id = await ctx.db.insert("communityResources" as any, {
      communityId: community._id,
      createdByUserId: args.userId,
      type,
      title,
      bodyMd,
      url,
      fileKey,
      pinned,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const created = (await ctx.db.get(id as any)) as CommunityResourceLike | null;
    if (!created) throw new Error("community_resource_create_failed");
    return await mapCommunityResourceRow(ctx, created);
  },
});

export const deleteCommunityResource = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    resourceId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const resource = (await ctx.db.get(args.resourceId as any)) as CommunityResourceLike | null;
    if (!resource) return { ok: true };
    await requireCommunityManager({
      ctx,
      communityId: resource.communityId,
      userId: args.userId,
    });
    await ctx.db.delete(resource._id as any);
    return { ok: true };
  },
});

export const listCommunityMemoryCandidates = query({
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
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const limit = Math.max(1, Math.min(5000, Math.floor(args.limit ?? 100)));
    const rows = (await ctx.db
      .query("communityMemoryCandidates" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunityMemoryCandidateLike[];
    const userIdCache = new Map<string, string | null>();
    return await Promise.all(
      rows
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit)
        .map((row) => mapCommunityMemoryCandidateRow(ctx, row, userIdCache)),
    );
  },
});

export const proposeCommunityMemoryCandidate = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    title: v.optional(v.union(v.string(), v.null())),
    memoryText: v.string(),
    evidence: v.optional(v.any()),
    requestKey: v.optional(v.union(v.string(), v.null())),
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
    await requireCommunityChatAccess({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const title = normalizeOptionalText(args.title, 120);
    const memoryText = normalizeOptionalText(args.memoryText, 8000);
    if (!memoryText) throw new Error("memory_text_required");
    const requestKey = normalizeOptionalText(args.requestKey, 256);

    if (requestKey) {
      const existing = (await ctx.db
        .query("communityMemoryCandidates" as any)
        .withIndex("by_community_requestKey", (q: any) =>
          q.eq("communityId", args.communityId).eq("requestKey", requestKey),
        )
        .first()) as CommunityMemoryCandidateLike | null;
      if (existing) {
        return {
          candidate_id: String(existing._id),
          router_state: String(existing.routerState ?? "").trim().toLowerCase() || "proposed",
          signal_score: Number.isFinite(Number(existing.signalScore)) ? Number(existing.signalScore) : 0,
          router_reason: existing.routerReason ?? null,
          promoted_memory_id: existing.promotedMemoryId ?? null,
          created_at: toIsoString(existing.createdAt),
        };
      }
    }

    const candidateId = await ctx.db.insert("communityMemoryCandidates" as any, {
      communityId: args.communityId,
      proposerUserId: args.userId,
      title,
      memoryText,
      evidenceJson: args.evidence ?? null,
      routerState: "proposed",
      signalScore: 0,
      routerReason: undefined,
      promotedMemoryId: undefined,
      reviewedBy: undefined,
      reviewedAt: undefined,
      requestKey: requestKey ?? undefined,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return {
      candidate_id: String(candidateId),
      router_state: "proposed",
      signal_score: 0,
      router_reason: null,
      promoted_memory_id: null,
      created_at: toIsoString(nowMs),
    };
  },
});

export const promoteCommunityMemoryCandidate = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    candidateId: v.string(),
    title: v.optional(v.union(v.string(), v.null())),
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
    const candidate = (await ctx.db.get(args.candidateId as any)) as CommunityMemoryCandidateLike | null;
    if (!candidate) throw new Error("community_memory_candidate_not_found");
    await requireCommunityManager({
      ctx,
      communityId: candidate.communityId,
      userId: args.userId,
    });
    await ctx.db.patch(candidate._id as any, {
      title: normalizeOptionalText(args.title, 120) ?? candidate.title,
      routerState: "promoted",
      routerReason: null,
      promotedMemoryId: candidate.promotedMemoryId ?? String(candidate._id),
      reviewedBy: args.userId,
      reviewedAt: nowMs,
      updatedAt: nowMs,
    });
    return { ok: true };
  },
});

export const rejectCommunityMemoryCandidate = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    candidateId: v.string(),
    reason: v.optional(v.union(v.string(), v.null())),
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
    const candidate = (await ctx.db.get(args.candidateId as any)) as CommunityMemoryCandidateLike | null;
    if (!candidate) throw new Error("community_memory_candidate_not_found");
    await requireCommunityManager({
      ctx,
      communityId: candidate.communityId,
      userId: args.userId,
    });
    await ctx.db.patch(candidate._id as any, {
      routerState: "rejected",
      routerReason: normalizeOptionalText(args.reason, 2000) ?? null,
      reviewedBy: args.userId,
      reviewedAt: nowMs,
      updatedAt: nowMs,
    });
    return { ok: true };
  },
});

export const getMyCommunityAccess = query({
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
    const community = (await ctx.db.get(args.communityId)) as CommunityLike | null;
    if (!community) return null;
    const membership = (await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q) => q.eq("communityId", args.communityId).eq("userId", args.userId))
      .first()) as CommunityMembershipLike | null;
    return await mapCommunityAccessRow({
      ctx,
      community,
      membership,
      userId: args.userId,
    });
  },
});

export const getMyCommunityAccessBySlug = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communitySlug: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const slug = normalizeSlug(args.communitySlug);
    const community = (await ctx.db
      .query("communities")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first()) as CommunityLike | null;
    if (!community) return null;
    const membership = (await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_user", (q) => q.eq("communityId", community._id).eq("userId", args.userId))
      .first()) as CommunityMembershipLike | null;
    return await mapCommunityAccessRow({
      ctx,
      community,
      membership,
      userId: args.userId,
    });
  },
});

export const resolvePublicFunnelBySlug = query({
  args: {
    communitySlug: v.string(),
  },
  handler: async (ctx, args) => {
    const slug = normalizeSlug(args.communitySlug);
    const community = (await ctx.db
      .query("communities")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first()) as CommunityLike | null;
    if (!community) return { ok: false };

    const plans = (await ctx.db
      .query("communityPlans")
      .withIndex("by_community_active", (q) => q.eq("communityId", community._id).eq("active", true))
      .collect()) as CommunityPlanLike[];
    const mappedPlans = mapActivePlanSummaries(plans);
    const activePlan = pickPreferredActivePlan(mappedPlans);
    const branding = await resolveCommunityBrandingFields(ctx, community);

    return {
      ok: true,
      community: {
        slug: community.slug,
        name: community.name,
        description: community.description ?? null,
        avatar_url: branding.avatar_url,
        banner_url: branding.banner_url,
        banner_focus_x: branding.banner_focus_x,
        banner_focus_y: branding.banner_focus_y,
        banner_zoom: branding.banner_zoom,
        visibility: community.visibility,
        free_join_requires_approval: Boolean(community.freeJoinRequiresApproval),
        join_mode: community.joinMode,
        created_at: toIsoString(community.createdAt),
        updated_at: toIsoString(community.updatedAt),
      },
      active_plan: activePlan,
      active_plans: mappedPlans,
    };
  },
});

export const listPublicDiscoverCommunities = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(200, Math.floor(args.limit ?? 60)));
    const communities = (await ctx.db.query("communities").collect()) as CommunityLike[];
    const published = communities
      .filter((community) => community.visibility === "published")
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);

    const out: Array<{
      slug: string;
      name: string;
      description: string | null;
      avatar_url: string | null;
      banner_url: string | null;
      banner_focus_x: number;
      banner_focus_y: number;
      banner_zoom: number;
      visibility: string;
      free_join_requires_approval: boolean;
      join_mode: string;
      created_at: string;
      updated_at: string;
      active_plan: PublicPlanSummaryLike | null;
      active_plans: PublicPlanSummaryLike[];
    }> = [];

    for (const community of published) {
      const plans = (await ctx.db
        .query("communityPlans")
        .withIndex("by_community_active", (q) => q.eq("communityId", community._id).eq("active", true))
        .collect()) as CommunityPlanLike[];
      const mappedPlans = mapActivePlanSummaries(plans);
      const branding = await resolveCommunityBrandingFields(ctx, community);
      out.push({
        slug: community.slug,
        name: community.name,
        description: community.description ?? null,
        avatar_url: branding.avatar_url,
        banner_url: branding.banner_url,
        banner_focus_x: branding.banner_focus_x,
        banner_focus_y: branding.banner_focus_y,
        banner_zoom: branding.banner_zoom,
        visibility: community.visibility,
        free_join_requires_approval: Boolean(community.freeJoinRequiresApproval),
        join_mode: community.joinMode,
        created_at: toIsoString(community.createdAt),
        updated_at: toIsoString(community.updatedAt),
        active_plan: pickPreferredActivePlan(mappedPlans),
        active_plans: mappedPlans,
      });
    }

    return {
      ok: true,
      communities: out,
    };
  },
});

export const getMyJoinRequestBySlug = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communitySlug: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const slug = normalizeSlug(args.communitySlug);
    const community = (await ctx.db
      .query("communities")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first()) as CommunityLike | null;
    if (!community) return null;
    const row = (await ctx.db
      .query("communityJoinRequests")
      .withIndex("by_community_user", (q) => q.eq("communityId", community._id).eq("userId", args.userId))
      .first()) as CommunityJoinRequestLike | null;
    if (!row) return null;
    return mapJoinRequestRow({
      communityId: String(community._id),
      row,
    });
  },
});

export const requestCommunityAccessBySlug = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communitySlug: v.string(),
    message: v.optional(v.union(v.string(), v.null())),
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
    const slug = normalizeSlug(args.communitySlug);
    const community = (await ctx.db
      .query("communities")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first()) as CommunityLike | null;
    if (!community) throw new Error("community_not_found");

    if (community.joinMode === "checkout") {
      throw new Error("paid_communities_do_not_use_request_access");
    }
    if (community.joinMode === "join_free" || !community.freeJoinRequiresApproval) {
      throw new Error("request_access_not_required");
    }

    const existing = (await ctx.db
      .query("communityJoinRequests")
      .withIndex("by_community_user", (q) => q.eq("communityId", community._id).eq("userId", args.userId))
      .first()) as CommunityJoinRequestLike | null;
    const message = normalizeOptionalText(args.message, 5000);

    if (existing) {
      const nextStatus = String(existing.status ?? "").trim().toLowerCase() === "approved" ? "approved" : "pending";
      await ctx.db.patch(existing._id, {
        status: nextStatus,
        message,
        updatedAt: nowMs,
      });
      const refreshed = (await ctx.db.get(existing._id)) as CommunityJoinRequestLike | null;
      if (!refreshed) throw new Error("join_request_not_found");
      return mapJoinRequestRow({
        communityId: String(community._id),
        row: refreshed,
      });
    }

    const id = await ctx.db.insert("communityJoinRequests", {
      communityId: community._id,
      userId: args.userId,
      status: "pending",
      message,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const created = (await ctx.db.get(id)) as CommunityJoinRequestLike | null;
    if (!created) throw new Error("join_request_create_failed");
    return mapJoinRequestRow({
      communityId: String(community._id),
      row: created,
    });
  },
});

async function joinPublicCommunityInternal(args: {
  ctx: any;
  community: CommunityLike;
  userId: any;
  nowMs: number;
}): Promise<string> {
  const existingMembership = (await args.ctx.db
    .query("communityMemberships")
    .withIndex("by_community_user", (q: any) => q.eq("communityId", args.community._id).eq("userId", args.userId))
    .first()) as CommunityMembershipLike | null;
  if (existingMembership) return String(args.community._id);

  if (args.community.joinMode === "checkout") {
    throw new Error("paid_plan_required");
  }
  if (args.community.joinMode === "request_access" && args.community.freeJoinRequiresApproval) {
    const joinRequest = (await args.ctx.db
      .query("communityJoinRequests")
      .withIndex("by_community_user", (q: any) => q.eq("communityId", args.community._id).eq("userId", args.userId))
      .first()) as CommunityJoinRequestLike | null;
    const status = String(joinRequest?.status ?? "")
      .trim()
      .toLowerCase();
    if (status !== "approved") {
      throw new Error("approval_required");
    }
  }

  await args.ctx.db.insert("communityMemberships", {
    communityId: args.community._id,
    userId: args.userId,
    role: "member",
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  return String(args.community._id);
}

export const joinPublicCommunityBySlug = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communitySlug: v.string(),
    brandosAid: v.optional(v.union(v.string(), v.null())),
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
    const slug = normalizeSlug(args.communitySlug);
    const community = (await ctx.db
      .query("communities")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first()) as CommunityLike | null;
    if (!community) throw new Error("community_not_found");
    void args.brandosAid;
    const communityId = await joinPublicCommunityInternal({
      ctx,
      community,
      userId: args.userId,
      nowMs,
    });
    return [{ community_id: communityId }];
  },
});

export const joinPublicCommunity = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    brandosAid: v.optional(v.union(v.string(), v.null())),
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
    void args.brandosAid;
    const communityId = await joinPublicCommunityInternal({
      ctx,
      community,
      userId: args.userId,
      nowMs,
    });
    return [{ community_id: communityId }];
  },
});

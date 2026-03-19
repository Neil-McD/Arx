import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  type CommunityResourceLike,
  getCommunityAndMembership,
  mapCommunityResourceRow,
  normalizeIdValue,
  normalizeName,
  normalizeOptionalFileKey,
  normalizeOptionalText,
  normalizeOptionalUrl,
  normalizeResourceType,
  parseIsoMs,
  requireCommunityChatAccess,
  requireCommunityManager,
  requireCommunityModerator,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";
import {
  deleteArchiveDocumentBySource,
  upsertArchiveDocumentForResource,
} from "./communityArchiveDocuments";

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
      await requireCommunityModerator({
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
      await upsertArchiveDocumentForResource(ctx, updated);
      return await mapCommunityResourceRow(ctx, updated);
    }

    const communityIdRaw = args.communityId ?? (payload.community_id as any);
    if (!communityIdRaw) throw new Error("community_id_required");
    const { community } = await getCommunityAndMembership({
      ctx,
      communityId: communityIdRaw,
      userId: args.userId,
    });
    await requireCommunityModerator({
      ctx,
      communityId: community._id,
      userId: args.userId,
    });
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
    await upsertArchiveDocumentForResource(ctx, created);
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
    await requireCommunityModerator({
      ctx,
      communityId: resource.communityId,
      userId: args.userId,
    });
    await ctx.db.delete(resource._id as any);
    await deleteArchiveDocumentBySource(ctx, {
      communityId: resource.communityId,
      sourceType: "resource",
      sourceId: normalizeIdValue(resource._id),
    });
    return { ok: true };
  },
});

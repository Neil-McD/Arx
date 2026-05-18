import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  type CommunityResourceModuleLike,
  type CommunityResourceLike,
  getCommunityAndMembership,
  mapCommunityResourceModuleRow,
  mapCommunityResourceRow,
  maybeDeleteStorageAsset,
  normalizeIdValue,
  normalizeBannerFocus,
  normalizeBannerZoom,
  normalizeName,
  normalizeOptionalFileKey,
  normalizeOptionalText,
  normalizeOptionalUrl,
  normalizeResourceType,
  parseIsoMs,
  requireCommunityChatAccess,
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";
import {
  deleteArchiveDocumentBySource,
  upsertArchiveDocumentForResource,
} from "./communityArchiveDocuments";
import { recordCommunityActivityEventBestEffort } from "./communityActivity";

function normalizeOptionalModuleId(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  if (!value || value === "null" || value === "undefined") return null;
  return value;
}

function resourceModuleIdentity(raw: unknown): string {
  return normalizeOptionalModuleId(raw) ?? "";
}

function compareCommunityResources(a: CommunityResourceLike, b: CommunityResourceLike): number {
  const aSortOrder = typeof a.sortOrder === "number" && Number.isFinite(a.sortOrder) ? a.sortOrder : null;
  const bSortOrder = typeof b.sortOrder === "number" && Number.isFinite(b.sortOrder) ? b.sortOrder : null;
  if (aSortOrder !== null || bSortOrder !== null) {
    if (aSortOrder !== bSortOrder) {
      return (aSortOrder ?? Number.MAX_SAFE_INTEGER) - (bSortOrder ?? Number.MAX_SAFE_INTEGER);
    }
  } else if (Boolean(a.pinned) !== Boolean(b.pinned)) {
    return Boolean(a.pinned) ? -1 : 1;
  }
  return b.createdAt - a.createdAt;
}

async function requireValidResourceModule(args: {
  ctx: any;
  communityId: any;
  moduleId: string | null;
}): Promise<any | undefined> {
  if (!args.moduleId) return undefined;
  const module = (await args.ctx.db.get(args.moduleId as any)) as CommunityResourceModuleLike | null;
  if (!module || String(module.communityId) !== String(args.communityId)) {
    throw new Error("community_resource_module_not_found");
  }
  return module._id;
}

async function getNextResourceSortOrder(args: {
  ctx: any;
  communityId: any;
  moduleId: any | null | undefined;
  excludeResourceId?: any;
}): Promise<number> {
  const rows = (await args.ctx.db
    .query("communityResources" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
    .collect()) as CommunityResourceLike[];
  const targetModuleIdentity = resourceModuleIdentity(args.moduleId);
  const excludeResourceId = args.excludeResourceId ? normalizeIdValue(args.excludeResourceId) : null;
  return (
    rows
      .filter((row) => {
        if (excludeResourceId && normalizeIdValue(row._id) === excludeResourceId) return false;
        return resourceModuleIdentity(row.moduleId) === targetModuleIdentity;
      })
      .reduce((max, row) => Math.max(max, Number(row.sortOrder) || 0), 0) + 1000
  );
}

export const listCommunityResourceModules = query({
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
    const limit = Math.max(1, Math.min(500, Math.floor(args.limit ?? 200)));
    const rows = (await ctx.db
      .query("communityResourceModules" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunityResourceModuleLike[];
    return await Promise.all(
      rows
        .slice()
        .sort((a, b) => {
          if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
          return b.createdAt - a.createdAt;
        })
        .slice(0, limit)
        .map((row) => mapCommunityResourceModuleRow(ctx, row)),
    );
  },
});

export const saveCommunityResourceModule = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    moduleId: v.optional(v.union(v.string(), v.null())),
    isPatch: v.optional(v.boolean()),
    payload: v.optional(v.any()),
    communityId: v.optional(v.id("communities")),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const nowMs = Date.now();
    const payload =
      args.payload && typeof args.payload === "object" && !Array.isArray(args.payload)
        ? (args.payload as Record<string, unknown>)
        : {};
    const moduleId = String(args.moduleId ?? "").trim();
    const isPatch = Boolean(args.isPatch) || moduleId.length > 0;

    if (isPatch) {
      if (!moduleId) throw new Error("community_resource_module_id_required");
      const existing = (await ctx.db.get(moduleId as any)) as CommunityResourceModuleLike | null;
      if (!existing) throw new Error("community_resource_module_not_found");
      await requireCommunityManager({
        ctx,
        communityId: existing.communityId,
        userId: args.userId,
      });
      const nextNameRaw = Object.prototype.hasOwnProperty.call(payload, "name") ? payload.name : existing.name;
      const nextDescriptionRaw = Object.prototype.hasOwnProperty.call(payload, "description_md")
        ? payload.description_md
        : existing.descriptionMd;
      const nextBannerUrlRaw = Object.prototype.hasOwnProperty.call(payload, "banner_url")
        ? payload.banner_url
        : existing.bannerUrl;
      const nextBannerStorageId = Object.prototype.hasOwnProperty.call(payload, "banner_storage_id")
        ? (payload.banner_storage_id ?? undefined)
        : existing.bannerStorageId;
      const previousBannerStorageId = existing.bannerStorageId;
      await ctx.db.patch(existing._id as any, {
        name: normalizeName(nextNameRaw),
        descriptionMd: normalizeOptionalText(nextDescriptionRaw, 1200),
        bannerUrl: nextBannerStorageId ? undefined : normalizeOptionalUrl(nextBannerUrlRaw),
        bannerStorageId: nextBannerStorageId,
        bannerFocusX: normalizeBannerFocus(payload.banner_focus_x ?? existing.bannerFocusX),
        bannerFocusY: normalizeBannerFocus(payload.banner_focus_y ?? existing.bannerFocusY),
        bannerZoom: normalizeBannerZoom(payload.banner_zoom ?? existing.bannerZoom),
        updatedAt: nowMs,
      });
      if (previousBannerStorageId && String(previousBannerStorageId) !== String(nextBannerStorageId ?? "")) {
        await maybeDeleteStorageAsset(ctx, previousBannerStorageId);
      }
      const updated = (await ctx.db.get(existing._id as any)) as CommunityResourceModuleLike | null;
      if (!updated) throw new Error("community_resource_module_not_found");
      return await mapCommunityResourceModuleRow(ctx, updated);
    }

    const communityIdRaw = args.communityId ?? (payload.community_id as any);
    if (!communityIdRaw) throw new Error("community_id_required");
    const { community } = await getCommunityAndMembership({
      ctx,
      communityId: communityIdRaw,
      userId: args.userId,
    });
    await requireCommunityManager({
      ctx,
      communityId: community._id,
      userId: args.userId,
    });
    const rows = (await ctx.db
      .query("communityResourceModules" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", community._id))
      .collect()) as CommunityResourceModuleLike[];
    const nextSortOrder = rows.reduce((max, row) => Math.max(max, Number(row.sortOrder) || 0), 0) + 1000;
    const bannerStorageId = payload.banner_storage_id ?? undefined;
    const id = await ctx.db.insert("communityResourceModules" as any, {
      communityId: community._id,
      createdByUserId: args.userId,
      name: normalizeName(payload.name),
      descriptionMd: normalizeOptionalText(payload.description_md, 1200),
      bannerUrl: bannerStorageId ? undefined : normalizeOptionalUrl(payload.banner_url),
      bannerStorageId,
      bannerFocusX: normalizeBannerFocus(payload.banner_focus_x),
      bannerFocusY: normalizeBannerFocus(payload.banner_focus_y),
      bannerZoom: normalizeBannerZoom(payload.banner_zoom),
      sortOrder: nextSortOrder,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const created = (await ctx.db.get(id as any)) as CommunityResourceModuleLike | null;
    if (!created) throw new Error("community_resource_module_create_failed");
    return await mapCommunityResourceModuleRow(ctx, created);
  },
});

export const reorderCommunityResourceModules = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    moduleIds: v.array(v.id("communityResourceModules")),
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

    const rows = (await ctx.db
      .query("communityResourceModules" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunityResourceModuleLike[];
    const existingIds = new Set(rows.map((row) => normalizeIdValue(row._id)));
    const requestedIds = args.moduleIds.map((id) => normalizeIdValue(id));
    const requestedIdSet = new Set(requestedIds);

    if (requestedIds.length !== requestedIdSet.size) {
      throw new Error("community_resource_module_order_duplicate_id");
    }
    if (requestedIds.length !== existingIds.size) {
      throw new Error("community_resource_module_order_stale");
    }
    for (const moduleId of requestedIds) {
      if (!existingIds.has(moduleId)) {
        throw new Error("community_resource_module_not_found");
      }
    }

    const nowMs = Date.now();
    await Promise.all(
      requestedIds.map((moduleId, index) =>
        ctx.db.patch(moduleId as any, {
          sortOrder: (index + 1) * 1000,
          updatedAt: nowMs,
        }),
      ),
    );

    return { ok: true };
  },
});

export const deleteCommunityResourceModule = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    moduleId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const module = (await ctx.db.get(args.moduleId as any)) as CommunityResourceModuleLike | null;
    if (!module) return { ok: true, movedResources: 0 };

    await requireCommunityManager({
      ctx,
      communityId: module.communityId,
      userId: args.userId,
    });

    const nowMs = Date.now();
    const resources = (await ctx.db
      .query("communityResources" as any)
      .withIndex("by_community_module", (q: any) =>
        q.eq("communityId", module.communityId).eq("moduleId", module._id),
      )
      .collect()) as CommunityResourceLike[];

    const movedResources = resources.slice().sort(compareCommunityResources);
    const nextLegacySortOrder = await getNextResourceSortOrder({
      ctx,
      communityId: module.communityId,
      moduleId: null,
    });

    await Promise.all(
      movedResources.map(async (resource, index) => {
        await ctx.db.patch(resource._id as any, {
          moduleId: undefined,
          sortOrder: nextLegacySortOrder + index * 1000,
          updatedAt: nowMs,
        });
        const updated = (await ctx.db.get(resource._id as any)) as CommunityResourceLike | null;
        if (updated) await upsertArchiveDocumentForResource(ctx, updated);
      }),
    );

    if (module.bannerStorageId) {
      await maybeDeleteStorageAsset(ctx, module.bannerStorageId);
    }
    await ctx.db.delete(module._id as any);
    return { ok: true, movedResources: resources.length };
  },
});

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
        .sort(compareCommunityResources)
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
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    (args as { userId?: any }).userId = userId;
    const nowMs = Date.now();
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
      const nextModuleIdRaw = Object.prototype.hasOwnProperty.call(payload, "module_id")
        ? payload.module_id
        : existing.moduleId;
      const nextModuleId = await requireValidResourceModule({
        ctx,
        communityId: existing.communityId,
        moduleId: normalizeOptionalModuleId(nextModuleIdRaw),
      });
      const moduleChanged = resourceModuleIdentity(existing.moduleId) !== resourceModuleIdentity(nextModuleId);
      const nextSortOrder = moduleChanged
        ? await getNextResourceSortOrder({
            ctx,
            communityId: existing.communityId,
            moduleId: nextModuleId,
            excludeResourceId: existing._id,
          })
        : existing.sortOrder;

      await ctx.db.patch(existing._id as any, {
        ...(nextModuleId ? { moduleId: nextModuleId } : { moduleId: undefined }),
        type: normalizeResourceType(nextTypeRaw),
        title: nextTitle,
        bodyMd: normalizeOptionalText(nextBodyRaw, 20_000),
        url: normalizeOptionalUrl(nextUrlRaw),
        fileKey: normalizeOptionalFileKey(nextFileKeyRaw),
        pinned: Boolean(nextPinnedRaw),
        ...(typeof nextSortOrder === "number" ? { sortOrder: nextSortOrder } : {}),
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
    await requireCommunityManager({
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
    const moduleId = await requireValidResourceModule({
      ctx,
      communityId: community._id,
      moduleId: normalizeOptionalModuleId(payload.module_id),
    });
    const nextSortOrder = await getNextResourceSortOrder({
      ctx,
      communityId: community._id,
      moduleId,
    });

    const id = await ctx.db.insert("communityResources" as any, {
      communityId: community._id,
      ...(moduleId ? { moduleId } : {}),
      createdByUserId: args.userId,
      type,
      title,
      bodyMd,
      url,
      fileKey,
      pinned,
      sortOrder: nextSortOrder,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const created = (await ctx.db.get(id as any)) as CommunityResourceLike | null;
    if (!created) throw new Error("community_resource_create_failed");
    await upsertArchiveDocumentForResource(ctx, created);
    await recordCommunityActivityEventBestEffort({
      ctx,
      communityId: community._id,
      type: "resource_added",
      actorUserId: args.userId,
      targetType: "resource",
      targetId: created._id,
      targetTitle: created.title,
      dedupeKey: `resource_added:${normalizeIdValue(created._id)}`,
      nowMs,
    });
    return await mapCommunityResourceRow(ctx, created);
  },
});

export const reorderCommunityResources = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    moduleId: v.optional(v.union(v.id("communityResourceModules"), v.null())),
    resourceIds: v.array(v.id("communityResources")),
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

    const moduleId = args.moduleId ?? null;
    if (moduleId) {
      await requireValidResourceModule({
        ctx,
        communityId: args.communityId,
        moduleId: normalizeOptionalModuleId(moduleId),
      });
    }

    const rows = (await ctx.db
      .query("communityResources" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunityResourceLike[];
    const targetModuleIdentity = resourceModuleIdentity(moduleId);
    const scopedRows = rows.filter((row) => resourceModuleIdentity(row.moduleId) === targetModuleIdentity);
    const existingIds = new Set(scopedRows.map((row) => normalizeIdValue(row._id)));
    const requestedIds = args.resourceIds.map((id) => normalizeIdValue(id));
    const requestedIdSet = new Set(requestedIds);

    if (requestedIds.length !== requestedIdSet.size) {
      throw new Error("community_resource_order_duplicate_id");
    }
    if (requestedIds.length !== existingIds.size) {
      throw new Error("community_resource_order_stale");
    }
    for (const resourceId of requestedIds) {
      if (!existingIds.has(resourceId)) {
        throw new Error("community_resource_not_found");
      }
    }

    const nowMs = Date.now();
    await Promise.all(
      requestedIds.map((resourceId, index) =>
        ctx.db.patch(resourceId as any, {
          sortOrder: (index + 1) * 1000,
          updatedAt: nowMs,
        }),
      ),
    );

    return { ok: true };
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
    await deleteArchiveDocumentBySource(ctx, {
      communityId: resource.communityId,
      sourceType: "resource",
      sourceId: normalizeIdValue(resource._id),
    });
    return { ok: true };
  },
});

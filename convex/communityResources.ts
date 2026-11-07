import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  type CommunityResourceModuleLike,
  type CommunityResourceLike,
  communityResourceBodyChars,
  communityResourceIsLiveModulePage,
  communityResourceSourceHasReadyText,
  communityResourceModuleIsLive,
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
  normalizeResourceRole,
  normalizeResourceModuleStatus,
  normalizeResourceSourceIngestionKind,
  normalizeResourceSourceIngestionStatus,
  normalizeResourceStatus,
  normalizeResourceType,
  requireActiveCommunity,
  requireCommunityChatAccess,
  requireCommunityManager,
  requireResourceSourceIngestionKindForWrite,
  requireResourceSourceIngestionStatusForWrite,
  requireResourceModuleStatusForWrite,
  requireResourceStatusForWrite,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
} from "./communityCore";
import {
  deleteCommunityResourceBodyContent,
  hydrateCommunityResourceBody,
  normalizeCommunityResourceBodyMd,
  writeCommunityResourceBodyContent,
} from "./communityResourceContent";
import { recordCommunityActivityEventBestEffort } from "./communityActivity";
import { resolveExactCommunityResourceEvidenceSelector } from "./communityResourceEvidenceCore";
import type {
  CommunitySourceCrawlerExistingSource,
} from "../shared/communitySourceCrawler";
import {
  communitySourceCrawlerUrlAliases,
  planCommunitySourceCrawlerPageSave,
} from "../shared/communitySourceCrawler";
import {
  COMMUNITY_RESOURCE_SOURCE_CRAWLER_DEFAULT_MAX_DEPTH,
  COMMUNITY_RESOURCE_SOURCE_CRAWLER_DEFAULT_MAX_PAGES,
  COMMUNITY_RESOURCE_SOURCE_CRAWLER_MAX_DEPTH,
  COMMUNITY_RESOURCE_SOURCE_CRAWLER_MAX_PAGES,
  COMMUNITY_RESOURCE_SOURCE_INGESTION_LEASE_MS,
  COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_ATTEMPTS,
  COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BODY_CHARS,
} from "./communityResourceConstants";
import {
  type CommunityResourceBuilderChangesetRow,
  type CommunitySourceCrawlJobLike,
  boundedReadLimit,
  boundedReadOffset,
  canManageCommunityResources,
  compareCommunityResources,
  getNextResourceSortOrder,
  mapCommunityResourceRowWithBody,
  normalizeOptionalModuleId,
  requireCommunityManagerForAction,
  requireResourceModuleForRole,
  requireValidResourceModule,
  resolveAuthenticatedActionUserId,
  resourceModuleIdentity,
} from "./communityResourceShared";
import {
  applyCommunityResourceBuilderChangesetOperations,
  buildCommunityResourceBuilderChangesetPreflight,
  buildCommunityResourceBuilderChangesetPreview,
  buildCommunityResourceBuilderExpiredResult,
  communityResourceBuilderChangesetExpiresAt,
  communityResourceBuilderChangesetIsExpired,
  expireCommunityResourceBuilderChangesetIfNeeded,
  getCommunityResourceBuilderPreflightIssueCount,
  normalizeCommunityResourceBuilderChangesetOperations,
  readLatestCommunityResourceBuilderActionableRows,
  stageCommunityResourceBuilderChangesetCore,
} from "./communityResourceChangesets";
import {
  buildCommunityResourceDirectoryReadPayload,
  buildModuleNameMap,
  buildResourceDirectoryEntry,
  listCommunityResourceBuilderDirectoryCore,
  listCommunityResourceSemanticDirectoryCore,
  listResourceDirectoryLiveModules,
  listResourceDirectoryLivePageResources,
  mapCommunityLaunchKnowledgeSourceRow,
  readCommunityResourceBuilderResourceCore,
  readContentUnavailableReason,
  requireCommunityResourceDirectoryToolAccess,
  resolveResourceByRef,
} from "./communityResourceDirectory";
import {
  buildWebCrawlContextPayload,
  crawlSourceRootWithConfiguredProvider,
  getCommunitySourceCrawlerStatusValue,
  isIngestibleCommunitySource,
  isPlainFileSource,
  isPlainUrlSource,
  mapCommunitySourceCrawlJob,
  maybeSafeSourceCrawlerUrl,
  normalizeCommunitySourceIngestionAttempt,
  normalizeSourceCrawlerLimit,
  normalizeSourceCrawlerProvider,
  normalizeWebCrawlStrategyProvider,
  requireSafeSourceIngestionUrl,
  titleFromSourceCrawlerUrl,
} from "./communitySourceFetch";
import {
  deleteCommunitySourceUnitsForSourceResource,
  runCommunitySourceIngestion,
  saveCommunitySourceUnitsForPage,
} from "./communitySourceIngestion";

export const listCommunityResourceSemanticDirectoryInternal = internalQuery({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    moduleId: v.optional(v.id("communityResourceModules")),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) =>
    await listCommunityResourceSemanticDirectoryCore({
      ctx,
      userId: args.userId,
      communityId: args.communityId,
      moduleId: args.moduleId,
      cursor: args.cursor,
      limit: args.limit,
    }),
});

export const readCommunityResourceDirectoryInternal = internalQuery({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    ref: v.string(),
    offset: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCommunityResourceDirectoryToolAccess({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
      communityId: args.communityId,
    });
    const exact = await resolveExactCommunityResourceEvidenceSelector({
      ctx,
      communityId: args.communityId,
      ref: args.ref,
    });
    if (exact) {
      return await buildCommunityResourceDirectoryReadPayload({
        ctx,
        resource: exact.resource,
        moduleNameMap: buildModuleNameMap([exact.module]),
        offset: args.offset,
        limit: args.limit,
      });
    }

    const modules = await listResourceDirectoryLiveModules(ctx, args.communityId);
    const liveModuleIds = new Set(modules.map((module) => normalizeIdValue(module._id)));
    const resources = await listResourceDirectoryLivePageResources(ctx, args.communityId, liveModuleIds);
    const moduleNameMap = buildModuleNameMap(modules);
    const resolved = await resolveResourceByRef({
      ctx,
      communityId: args.communityId,
      ref: args.ref,
      resources,
      moduleNameMap,
    });
    if (!resolved.ok) {
      return {
        kind: "community_resource_read",
        ...resolved,
      };
    }

    const row = await hydrateCommunityResourceBody(ctx, resolved.resource) ?? resolved.resource;
    const body = String(row.bodyMd ?? "");
    const offset = boundedReadOffset(args.offset);
    const limit = boundedReadLimit(args.limit);
    const bodySlice = body ? body.slice(offset, offset + limit) : null;
    return {
      ok: true,
      kind: "community_resource_read",
      resource: buildResourceDirectoryEntry(row, moduleNameMap),
      source: null,
      content: {
        body_md: bodySlice,
        offset,
        limit,
        total_chars: body.length,
        truncated: Boolean(body && offset + (bodySlice?.length ?? 0) < body.length),
        unavailable_reason: readContentUnavailableReason(row),
      },
    };
  },
});

export const listCommunityResourceBuilderDirectory = query({
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
    return await listCommunityResourceBuilderDirectoryCore({
      ctx,
      userId,
      communityId: args.communityId,
      limit: args.limit,
    });
  },
});

export const listCommunityResourceBuilderDirectoryInternal = internalQuery({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) =>
    await listCommunityResourceBuilderDirectoryCore({
      ctx,
      userId: args.userId,
      communityId: args.communityId,
      limit: args.limit,
    }),
});

export const readCommunityResourceBuilderResource = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    ref: v.optional(v.string()),
    resourceId: v.optional(v.union(v.id("communityResources"), v.null())),
    moduleId: v.optional(v.union(v.id("communityResourceModules"), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    return await readCommunityResourceBuilderResourceCore({
      ctx,
      userId,
      communityId: args.communityId,
      ref: args.ref,
      resourceId: args.resourceId,
      moduleId: args.moduleId,
    });
  },
});

export const readCommunityResourceBuilderResourceInternal = internalQuery({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    ref: v.optional(v.string()),
    resourceId: v.optional(v.union(v.id("communityResources"), v.null())),
    moduleId: v.optional(v.union(v.id("communityResourceModules"), v.null())),
  },
  handler: async (ctx, args) =>
    await readCommunityResourceBuilderResourceCore({
      ctx,
      userId: args.userId,
      communityId: args.communityId,
      ref: args.ref,
      resourceId: args.resourceId,
      moduleId: args.moduleId,
    }),
});

export const stageCommunityResourceBuilderChangesetInternal = internalMutation({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    summary: v.string(),
    operations: v.array(v.any()),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) =>
    await stageCommunityResourceBuilderChangesetCore({
      ctx,
      userId: args.userId,
      communityId: args.communityId,
      summary: args.summary,
      operations: args.operations,
      idempotencyKey: args.idempotencyKey ?? null,
    }),
});

export const expireCommunityResourceBuilderChangesetInternal = internalMutation({
  args: {
    changesetId: v.id("communityResourceBuilderChangesets"),
  },
  handler: async (ctx, args) => {
    const changeset = (await ctx.db.get(
      args.changesetId as any,
    )) as CommunityResourceBuilderChangesetRow | null;
    if (!changeset) {
      return {
        ok: true,
        kind: "community_resource_builder_changeset_expiry_noop",
        status: "missing",
        changeset_id: normalizeIdValue(args.changesetId),
        deduped: true,
      };
    }
    if (changeset.status === "expired") {
      return buildCommunityResourceBuilderExpiredResult({
        changeset,
        changesetId: args.changesetId,
        communityId: changeset.communityId,
        deduped: true,
      });
    }
    const nowMs = Date.now();
    if (
      !(await expireCommunityResourceBuilderChangesetIfNeeded({
        ctx,
        changeset,
        nowMs,
      }))
    ) {
      return {
        ok: true,
        kind: "community_resource_builder_changeset_expiry_noop",
        status: changeset.status,
        changeset_id: normalizeIdValue(args.changesetId),
        community_id: normalizeIdValue(changeset.communityId),
        expires_at: toIsoString(
          communityResourceBuilderChangesetExpiresAt(changeset),
        ),
        deduped: true,
      };
    }
    return buildCommunityResourceBuilderExpiredResult({
      changeset,
      changesetId: args.changesetId,
      communityId: changeset.communityId,
      deduped: false,
    });
  },
});

export const getCommunityResourceBuilderChangesetStatus = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    changesetId: v.id("communityResourceBuilderChangesets"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const changeset = (await ctx.db.get(args.changesetId as any)) as CommunityResourceBuilderChangesetRow | null;
    if (!changeset || String(changeset.communityId) !== String(args.communityId)) {
      throw new Error("community_resource_changeset_not_found");
    }
    const nowMs = Date.now();
    const expired = communityResourceBuilderChangesetIsExpired(
      changeset,
      nowMs,
    );
    const operations = normalizeCommunityResourceBuilderChangesetOperations(changeset.operations);
    const preview = buildCommunityResourceBuilderChangesetPreview(operations);
    return {
      ok: true,
      kind: "community_resource_builder_changeset_status",
      changeset_id: normalizeIdValue(args.changesetId),
      community_id: normalizeIdValue(args.communityId),
      status: expired ? "expired" : changeset.status,
      summary: changeset.summary,
      operation_count: operations.length,
      preview_items: preview.preview_items,
      preview_total_count: preview.total_count,
      preview_limit: preview.preview_limit,
      approved_by_current_user: changeset.approvedByUserId
        ? String(changeset.approvedByUserId) === String(userId)
        : false,
      updated_at: toIsoString(changeset.updatedAt),
    };
  },
});

export const listPendingCommunityResourceBuilderChangesets = query({
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
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const rows = await readLatestCommunityResourceBuilderActionableRows({
      ctx,
      communityId: args.communityId,
    });
    const nowMs = Date.now();
    return rows
      .filter(
        (changeset) =>
          !communityResourceBuilderChangesetIsExpired(changeset, nowMs),
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 1)
      .map((changeset) => {
        const operations = normalizeCommunityResourceBuilderChangesetOperations(
          changeset.operations,
        );
        const preview = buildCommunityResourceBuilderChangesetPreview(operations);
        return {
          ok: true,
          kind: "community_resource_builder_changeset_pending",
          changeset_id: normalizeIdValue(changeset._id),
          community_id: normalizeIdValue(args.communityId),
          status: changeset.status,
          summary: changeset.summary,
          operation_count: operations.length,
          preview_items: preview.preview_items,
          preview_total_count: preview.total_count,
          preview_limit: preview.preview_limit,
          warning_count:
            getCommunityResourceBuilderPreflightIssueCount(changeset.preflight),
          approved_by_current_user: changeset.approvedByUserId
            ? String(changeset.approvedByUserId) === String(userId)
            : false,
          created_at: toIsoString(changeset.createdAt),
          updated_at: toIsoString(changeset.updatedAt),
        };
      });
  },
});

export const rejectCommunityResourceBuilderChangeset = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    changesetId: v.id("communityResourceBuilderChangesets"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const changeset = (await ctx.db.get(args.changesetId as any)) as CommunityResourceBuilderChangesetRow | null;
    if (!changeset || String(changeset.communityId) !== String(args.communityId)) {
      throw new Error("community_resource_changeset_not_found");
    }
    if (
      changeset.status === "rejected" &&
      changeset.rejectedByUserId &&
      String(changeset.rejectedByUserId) === String(userId) &&
      (changeset.error ?? null) ===
        (normalizeOptionalText(args.reason, 1000) ?? null)
    ) {
      return {
        ok: true,
        kind: "community_resource_builder_changeset_rejected",
        changeset_id: normalizeIdValue(args.changesetId),
        community_id: normalizeIdValue(args.communityId),
        status: "rejected",
        summary: changeset.summary,
        deduped: true,
      };
    }
    const nowMs = Date.now();
    if (changeset.status === "expired") {
      return buildCommunityResourceBuilderExpiredResult({
        changeset,
        changesetId: args.changesetId,
        communityId: args.communityId,
        deduped: true,
      });
    }
    if (
      await expireCommunityResourceBuilderChangesetIfNeeded({
        ctx,
        changeset,
        nowMs,
      })
    ) {
      return buildCommunityResourceBuilderExpiredResult({
        changeset,
        changesetId: args.changesetId,
        communityId: args.communityId,
        deduped: false,
      });
    }
    if (changeset.status !== "staged" && changeset.status !== "approved") {
      throw new Error("community_resource_changeset_not_rejectable");
    }
    await ctx.db.patch(args.changesetId as any, {
      status: "rejected",
      error: normalizeOptionalText(args.reason, 1000),
      updatedAt: nowMs,
      rejectedAt: nowMs,
      rejectedByUserId: userId,
    });
    return {
      ok: true,
      kind: "community_resource_builder_changeset_rejected",
      changeset_id: normalizeIdValue(args.changesetId),
      community_id: normalizeIdValue(args.communityId),
      status: "rejected",
      summary: changeset.summary,
      deduped: false,
    };
  },
});

export const applyCommunityResourceBuilderChangeset = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    changesetId: v.id("communityResourceBuilderChangesets"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const changeset = (await ctx.db.get(args.changesetId as any)) as CommunityResourceBuilderChangesetRow | null;
    if (!changeset || String(changeset.communityId) !== String(args.communityId)) {
      throw new Error("community_resource_changeset_not_found");
    }
    if (changeset.status === "applied") {
      const operations = normalizeCommunityResourceBuilderChangesetOperations(
        changeset.operations,
      );
      const preview = buildCommunityResourceBuilderChangesetPreview(operations);
      return {
        ok: true,
        kind: "community_resource_builder_changeset_applied",
        changeset_id: normalizeIdValue(args.changesetId),
        community_id: normalizeIdValue(args.communityId),
        status: "applied",
        summary: changeset.summary,
        operation_count: operations.length,
        preview_items: preview.preview_items,
        preview_total_count: preview.total_count,
        preview_limit: preview.preview_limit,
        result: changeset.result ?? null,
        deduped: true,
      };
    }
    const nowMs = Date.now();
    if (changeset.status === "expired") {
      return buildCommunityResourceBuilderExpiredResult({
        changeset,
        changesetId: args.changesetId,
        communityId: args.communityId,
        deduped: true,
      });
    }
    if (
      await expireCommunityResourceBuilderChangesetIfNeeded({
        ctx,
        changeset,
        nowMs,
      })
    ) {
      return buildCommunityResourceBuilderExpiredResult({
        changeset,
        changesetId: args.changesetId,
        communityId: args.communityId,
        deduped: false,
      });
    }
    if (changeset.status !== "staged" && changeset.status !== "approved") {
      throw new Error("community_resource_changeset_not_applicable");
    }
    const operations = normalizeCommunityResourceBuilderChangesetOperations(changeset.operations);
    const preflight = await buildCommunityResourceBuilderChangesetPreflight({
      ctx,
      communityId: args.communityId,
      operations,
      nowMs,
    });
    const preview = buildCommunityResourceBuilderChangesetPreview(operations);
    const result = await applyCommunityResourceBuilderChangesetOperations({
      ctx,
      communityId: args.communityId,
      userId,
      operations,
      nowMs,
    });
    await ctx.db.patch(args.changesetId as any, {
      status: "applied",
      preflight,
      result,
      updatedAt: nowMs,
      appliedAt: nowMs,
      appliedByUserId: userId,
    });
    return {
      ok: true,
      kind: "community_resource_builder_changeset_applied",
      changeset_id: normalizeIdValue(args.changesetId),
      community_id: normalizeIdValue(args.communityId),
      status: "applied",
      summary: changeset.summary,
      operation_count: operations.length,
      preview_items: preview.preview_items,
      preview_total_count: preview.total_count,
      preview_limit: preview.preview_limit,
      result,
      deduped: false,
    };
  },
});

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
    const canManageResources = await canManageCommunityResources({
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
        .filter((row) => canManageResources || communityResourceModuleIsLive(row))
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
      const nextModuleStatus = Object.prototype.hasOwnProperty.call(payload, "module_status")
        ? requireResourceModuleStatusForWrite(payload.module_status)
        : normalizeResourceModuleStatus(existing.status);
      await ctx.db.patch(existing._id as any, {
        name: normalizeName(nextNameRaw),
        descriptionMd: normalizeOptionalText(nextDescriptionRaw, 1200),
        ...(Object.prototype.hasOwnProperty.call(payload, "module_status")
          ? { status: nextModuleStatus }
          : {}),
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
      status: Object.prototype.hasOwnProperty.call(payload, "module_status")
        ? requireResourceModuleStatusForWrite(payload.module_status)
        : "draft",
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

    const resources = (await ctx.db
      .query("communityResources" as any)
      .withIndex("by_community_module", (q: any) =>
        q.eq("communityId", module.communityId).eq("moduleId", module._id),
      )
      .collect()) as CommunityResourceLike[];
    const lessons = resources.filter((resource) => normalizeResourceRole(resource.role) === "page");
    const ingestionSources = resources.filter((resource) => normalizeResourceRole(resource.role) === "source");

    for (const lesson of lessons) {
      await deleteCommunitySourceUnitsForSourceResource(ctx, lesson._id);
      await deleteCommunityResourceBodyContent(ctx, lesson._id);
      await ctx.db.delete(lesson._id as any);
    }

    const nowMs = Date.now();
    for (const source of ingestionSources) {
      await ctx.db.patch(source._id as any, {
        moduleId: undefined,
        updatedAt: nowMs,
      });
    }

    if (module.bannerStorageId) {
      await maybeDeleteStorageAsset(ctx, module.bannerStorageId);
    }
    await ctx.db.delete(module._id as any);
    return {
      ok: true,
      movedResources: 0,
      deletedLessons: lessons.length,
      detachedIngestionSources: ingestionSources.length,
    };
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
    const canManageResources = await canManageCommunityResources({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const limit = Math.max(1, Math.min(5000, Math.floor(args.limit ?? 200)));
    const rows = (await ctx.db
      .query("communityResources" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunityResourceLike[];
    const modules = canManageResources
      ? []
      : ((await ctx.db
          .query("communityResourceModules" as any)
          .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
          .collect()) as CommunityResourceModuleLike[]);
    const liveModuleIds = new Set(
      modules
        .filter(communityResourceModuleIsLive)
        .map((module) => normalizeIdValue(module._id)),
    );
    const userIdCache = new Map<string, string | null>();
    const moduleNameCache = new Map<string, string | null>();
    return await Promise.all(
      rows
        .slice()
        .filter((row) => canManageResources || communityResourceIsLiveModulePage(row, liveModuleIds))
        .sort(compareCommunityResources)
        .slice(0, limit)
        .map((row) => mapCommunityResourceRowWithBody(ctx, row, userIdCache, moduleNameCache)),
    );
  },
});

export const listCommunityLaunchKnowledgeSources = query({
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
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const limit = Math.max(1, Math.min(200, Math.floor(args.limit ?? 100)));
    const rows = (await ctx.db
      .query("communityResources" as any)
      .withIndex("by_community_role_status", (q: any) =>
        q.eq("communityId", args.communityId).eq("role", "source"),
      )
      .collect()) as CommunityResourceLike[];
    const sources = await Promise.all(
      rows
        .filter((row) => normalizeResourceRole(row.role) === "source")
        .filter((row) =>
          isPlainUrlSource(row) ||
          isPlainFileSource(row)
        )
        .sort(compareCommunityResources)
        .slice(0, limit)
        .map((row) => mapCommunityLaunchKnowledgeSourceRow(row)),
    );
    return {
      ok: true,
      kind: "community_launch_knowledge_sources",
      community_id: normalizeIdValue(args.communityId),
      sources,
    };
  },
});

export const requireCommunitySourceManagerInternal = internalQuery({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    return { ok: true };
  },
});

export const generateCommunityResourceSourceUploadUrl = mutation({
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
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    return {
      uploadUrl: await ctx.storage.generateUploadUrl(),
    };
  },
});

export const getCommunitySourceIngestionStateInternal = internalQuery({
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
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const rows = (await ctx.db
      .query("communityResources" as any)
      .withIndex("by_community_role_status", (q: any) =>
        q.eq("communityId", args.communityId).eq("role", "source"),
      )
      .collect()) as CommunityResourceLike[];
    const sources = rows.filter((row) => normalizeResourceRole(row.role) === "source");
    const readySources = sources.filter(communityResourceSourceHasReadyText);
    const urlSources = sources.filter(isPlainUrlSource);
    const fileSources = sources.filter(isPlainFileSource);
    const failedSources = sources.filter(
      (row) => isIngestibleCommunitySource(row) && normalizeResourceSourceIngestionStatus(row) === "failed",
    );
    const pendingSources = sources.filter((row) => {
      const status = normalizeResourceSourceIngestionStatus(row);
      return isIngestibleCommunitySource(row) && (status === "queued" || status === "processing");
    });
    return {
      ok: true,
      kind: "community_source_ingestion_state",
      total_sources: sources.length,
      ready_sources: readySources.length,
      url_sources: urlSources.length,
      file_sources: fileSources.length,
      failed_sources: failedSources.length,
      pending_sources: pendingSources.length,
      pending_url_sources: urlSources.filter((row) => {
        const status = normalizeResourceSourceIngestionStatus(row);
        return status === "queued" || status === "processing";
      }).length,
      pending_file_sources: fileSources.filter((row) => {
        const status = normalizeResourceSourceIngestionStatus(row);
        return status === "queued" || status === "processing";
      }).length,
    };
  },
});

export const claimNextCommunitySourceIngestionInternal = internalMutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    retryFailed: v.optional(v.boolean()),
    excludeResourceIds: v.optional(v.array(v.id("communityResources"))),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const nowMs = args.nowMs ?? Date.now();
    const excludedResourceIds = new Set(
      (args.excludeResourceIds ?? []).map((resourceId) => normalizeIdValue(resourceId)),
    );
    const rows = ((await ctx.db
      .query("communityResources" as any)
      .withIndex("by_community_role_status", (q: any) =>
        q.eq("communityId", args.communityId).eq("role", "source"),
      )
      .collect()) as CommunityResourceLike[])
      .filter((row) =>
        normalizeResourceRole(row.role) === "source" &&
        !excludedResourceIds.has(normalizeIdValue(row._id)) &&
        isIngestibleCommunitySource(row),
      )
      .sort((left, right) => left.updatedAt - right.updatedAt || left.createdAt - right.createdAt);

    for (const row of rows) {
      const status = normalizeResourceSourceIngestionStatus(row);
      const attempt = normalizeCommunitySourceIngestionAttempt(row.sourceIngestionAttempt);
      const leaseExpired = Number(row.sourceIngestionLeaseExpiresAt ?? 0) <= nowMs;
      const claimable =
        status === "queued" ||
        (status === "failed" && args.retryFailed === true) ||
        (status === "processing" && leaseExpired);
      if (!claimable) continue;
      const isExplicitFailedRetry = status === "failed" && args.retryFailed === true;
      if (attempt >= COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_ATTEMPTS && !isExplicitFailedRetry) {
        if (status === "processing") {
          await ctx.db.patch(row._id as any, {
            sourceIngestionStatus: "failed",
            sourceIngestionError: "community_source_ingestion_attempts_exhausted",
            sourceIngestionLeaseId: undefined,
            sourceIngestionLeaseExpiresAt: undefined,
            updatedAt: nowMs,
          });
        }
        continue;
      }

      const leaseId = crypto.randomUUID();
      const nextAttempt = isExplicitFailedRetry && attempt >= COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_ATTEMPTS
        ? 1
        : attempt + 1;
      const leaseExpiresAt = nowMs + COMMUNITY_RESOURCE_SOURCE_INGESTION_LEASE_MS;
      await ctx.db.patch(row._id as any, {
        sourceIngestionStatus: "processing",
        sourceIngestionError: undefined,
        sourceIngestionAttemptedAt: nowMs,
        sourceIngestionLeaseId: leaseId,
        sourceIngestionLeaseExpiresAt: leaseExpiresAt,
        sourceIngestionAttempt: nextAttempt,
        updatedAt: nowMs,
      });
      return {
        ok: true,
        claim: {
          resourceId: row._id,
          leaseId,
          leaseExpiresAt,
          attempt: nextAttempt,
          title: String(row.title ?? ""),
          url: String(row.url ?? "").trim(),
          fileKey: String(row.fileKey ?? "").trim(),
          sourceIngestionKind: normalizeResourceSourceIngestionKind(row),
        },
      };
    }
    return { ok: true, claim: null };
  },
});

export const finalizeCommunitySourceIngestionInternal = internalMutation({
  args: {
    resourceId: v.id("communityResources"),
    leaseId: v.string(),
    attempt: v.number(),
    status: v.union(v.literal("ready"), v.literal("failed")),
    kind: v.union(
      v.literal("url"),
      v.literal("file"),
    ),
    bodyMd: v.optional(v.union(v.string(), v.null())),
    url: v.optional(v.union(v.string(), v.null())),
    error: v.optional(v.union(v.string(), v.null())),
    sourceOriginalFilename: v.optional(v.union(v.string(), v.null())),
    sourceOriginalMimeType: v.optional(v.union(v.string(), v.null())),
    sourceOriginalBytes: v.optional(v.union(v.number(), v.null())),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = (await ctx.db.get(args.resourceId as any)) as CommunityResourceLike | null;
    if (!existing) return { ok: false, code: "community_source_not_found" };
    if (normalizeResourceRole(existing.role) !== "source") {
      throw new Error("community_source_resource_required");
    }
    const community = await ctx.db.get(existing.communityId as any);
    if (!community) {
      return { ok: false, code: "community_source_ingestion_community_inactive" };
    }
    try {
      requireActiveCommunity(community as any);
    } catch {
      return { ok: false, code: "community_source_ingestion_community_inactive" };
    }
    const nowMs = args.nowMs ?? Date.now();
    const ownsClaim =
      normalizeResourceSourceIngestionStatus(existing) === "processing" &&
      String(existing.sourceIngestionLeaseId ?? "") === args.leaseId &&
      normalizeCommunitySourceIngestionAttempt(existing.sourceIngestionAttempt) ===
        normalizeCommunitySourceIngestionAttempt(args.attempt) &&
      Number(existing.sourceIngestionLeaseExpiresAt ?? 0) > nowMs;
    if (!ownsClaim) {
      return { ok: false, code: "community_source_ingestion_claim_lost" };
    }
    const hasBody = Object.prototype.hasOwnProperty.call(args, "bodyMd");
    const normalizedBodyMd = hasBody
      ? normalizeCommunityResourceBodyMd(
          args.bodyMd,
          COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BODY_CHARS,
        )
      : null;
    if (args.status === "ready" && !String(normalizedBodyMd ?? "").trim()) {
      throw new Error("community_source_ingestion_body_required");
    }
    if (args.status === "failed" && hasBody) {
      throw new Error("community_source_ingestion_failed_body_forbidden");
    }
    const patch: Record<string, unknown> = {
      sourceIngestionStatus: args.status,
      sourceIngestionKind: args.kind,
      sourceIngestedAt: nowMs,
      sourceIngestionLeaseId: undefined,
      sourceIngestionLeaseExpiresAt: undefined,
      ...(Object.prototype.hasOwnProperty.call(args, "error")
        ? { sourceIngestionError: normalizeOptionalText(args.error, 1000) ?? undefined }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(args, "sourceOriginalFilename")
        ? { sourceOriginalFilename: normalizeOptionalText(args.sourceOriginalFilename, 240) ?? undefined }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(args, "sourceOriginalMimeType")
        ? { sourceOriginalMimeType: normalizeOptionalText(args.sourceOriginalMimeType, 180) ?? undefined }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(args, "sourceOriginalBytes")
        ? {
            sourceOriginalBytes:
              typeof args.sourceOriginalBytes === "number" && Number.isFinite(args.sourceOriginalBytes)
                ? Math.max(0, Math.floor(args.sourceOriginalBytes))
                : undefined,
          }
        : {}),
      updatedAt: nowMs,
    };
    if (hasBody) {
      patch.bodyChars = normalizedBodyMd ? normalizedBodyMd.trim().length : 0;
    }
    if (Object.prototype.hasOwnProperty.call(args, "url")) {
      patch.url = normalizeOptionalUrl(args.url);
    }
    await ctx.db.patch(existing._id as any, patch);
    const updated = (await ctx.db.get(existing._id as any)) as CommunityResourceLike | null;
    if (!updated) return { ok: false, code: "community_source_not_found" };
    if (hasBody) {
      await writeCommunityResourceBodyContent(ctx, {
        communityId: updated.communityId,
        resourceId: updated._id,
        bodyMd: normalizedBodyMd,
        nowMs,
        maxChars: COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BODY_CHARS,
      });
    }
    const hydrated = await hydrateCommunityResourceBody(ctx, updated) ?? updated;
    return { ok: true, resource: await mapCommunityResourceRow(ctx, hydrated) };
  },
});

const communitySourceIngestionActionArgs = {
  userId: v.optional(v.id("users")),
  authSubject: v.optional(v.string()),
  communityId: v.id("communities"),
  limit: v.optional(v.number()),
  retryFailed: v.optional(v.boolean()),
};

const communitySourceCrawlerPageArg = v.object({
  requested_url: v.string(),
  final_url: v.string(),
  canonical_url: v.string(),
  root_url: v.string(),
  parent_url: v.union(v.string(), v.null()),
  depth: v.number(),
  title: v.union(v.string(), v.null()),
  markdown: v.string(),
  links: v.array(v.object({
    url: v.string(),
    title: v.union(v.string(), v.null()),
  })),
  status: v.union(v.literal("ready"), v.literal("failed"), v.literal("skipped")),
  error: v.union(v.string(), v.null()),
  virtual_page_count: v.optional(v.number()),
  virtual_page_strategy: v.optional(v.union(v.string(), v.null())),
  source_units: v.optional(v.array(v.object({
    unit_key: v.optional(v.union(v.string(), v.null())),
    unit_kind: v.union(v.literal("page"), v.literal("virtual_section")),
    title: v.union(v.string(), v.null()),
    source_url: v.string(),
    root_url: v.string(),
    parent_url: v.union(v.string(), v.null()),
    path: v.union(v.string(), v.null()),
    order: v.number(),
    depth: v.number(),
    markdown: v.string(),
  status: v.union(
      v.literal("ready"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
    error: v.union(v.string(), v.null()),
    capture_method: v.optional(v.union(v.string(), v.null())),
  }))),
});

export const ingestCommunitySources: any = action({
  args: communitySourceIngestionActionArgs,
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    return await runCommunitySourceIngestion({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
      communityId: args.communityId,
      limit: args.limit,
      retryFailed: args.retryFailed,
    });
  },
});

export const getCommunitySourceCrawlerStatus = query({
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
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    return {
      ...getCommunitySourceCrawlerStatusValue(),
      community_id: normalizeIdValue(args.communityId),
    };
  },
});

export const listCommunitySourceCrawlJobs = query({
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
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const limit = Math.max(1, Math.min(25, Math.floor(args.limit ?? 10)));
    const rows = (await ctx.db
      .query("communitySourceCrawlJobs" as any)
      .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", args.communityId))
      .order("desc")
      .take(limit)) as CommunitySourceCrawlJobLike[];
    return {
      ok: true,
      kind: "community_source_crawl_jobs",
      community_id: normalizeIdValue(args.communityId),
      jobs: rows.map(mapCommunitySourceCrawlJob),
    };
  },
});

export const getCommunitySourceCrawlJob = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    crawlJobId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId,
    });
    const row = (await ctx.db.get(args.crawlJobId as any)) as CommunitySourceCrawlJobLike | null;
    if (!row || normalizeIdValue(row.communityId) !== normalizeIdValue(args.communityId)) {
      throw new Error("community_source_crawl_job_not_found");
    }
    return {
      ok: true,
      kind: "community_source_crawl_job",
      job: mapCommunitySourceCrawlJob(row),
    };
  },
});

export const getCommunitySourceCrawlJobInternal = internalQuery({
  args: {
    crawlJobId: v.string(),
  },
  handler: async (ctx, args) => {
    return ((await ctx.db.get(args.crawlJobId as any)) as CommunitySourceCrawlJobLike | null) ?? null;
  },
});

export const createCommunitySourceCrawlJobInternal = internalMutation({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    rootUrl: v.string(),
    provider: v.literal("simple"),
    maxPages: v.number(),
    maxDepth: v.number(),
  },
  handler: async (ctx, args) => {
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const nowMs = Date.now();
    const id = await ctx.db.insert("communitySourceCrawlJobs" as any, {
      communityId: args.communityId,
      createdByUserId: args.userId,
      provider: args.provider,
      rootUrl: requireSafeSourceIngestionUrl(args.rootUrl),
      status: "queued",
      maxPages: normalizeSourceCrawlerLimit(
        args.maxPages,
        COMMUNITY_RESOURCE_SOURCE_CRAWLER_DEFAULT_MAX_PAGES,
        COMMUNITY_RESOURCE_SOURCE_CRAWLER_MAX_PAGES,
      ),
      maxDepth: normalizeSourceCrawlerLimit(
        args.maxDepth,
        COMMUNITY_RESOURCE_SOURCE_CRAWLER_DEFAULT_MAX_DEPTH,
        COMMUNITY_RESOURCE_SOURCE_CRAWLER_MAX_DEPTH,
      ),
      pageCount: 0,
      readyPageCount: 0,
      failedPageCount: 0,
      savedSourceCount: 0,
      skippedSourceCount: 0,
      sourceResourceIds: [],
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const row = (await ctx.db.get(id as any)) as CommunitySourceCrawlJobLike | null;
    if (!row) throw new Error("community_source_crawl_job_create_failed");
    return mapCommunitySourceCrawlJob(row);
  },
});

export const patchCommunitySourceCrawlJobInternal = internalMutation({
  args: {
    crawlJobId: v.string(),
    status: v.optional(v.union(
      v.literal("queued"),
      v.literal("crawling"),
      v.literal("saving_sources"),
      v.literal("ready"),
      v.literal("failed"),
    )),
    pageCount: v.optional(v.number()),
    readyPageCount: v.optional(v.number()),
    failedPageCount: v.optional(v.number()),
    savedSourceCount: v.optional(v.number()),
    skippedSourceCount: v.optional(v.number()),
    sourceResourceIds: v.optional(v.array(v.string())),
    error: v.optional(v.union(v.string(), v.null())),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = (await ctx.db.get(args.crawlJobId as any)) as CommunitySourceCrawlJobLike | null;
    if (!existing) return null;
    const nowMs = Date.now();
    await ctx.db.patch(existing._id as any, {
      ...(args.status ? { status: args.status } : {}),
      ...(typeof args.pageCount === "number" && Number.isFinite(args.pageCount)
        ? { pageCount: Math.max(0, Math.floor(args.pageCount)) }
        : {}),
      ...(typeof args.readyPageCount === "number" && Number.isFinite(args.readyPageCount)
        ? { readyPageCount: Math.max(0, Math.floor(args.readyPageCount)) }
        : {}),
      ...(typeof args.failedPageCount === "number" && Number.isFinite(args.failedPageCount)
        ? { failedPageCount: Math.max(0, Math.floor(args.failedPageCount)) }
        : {}),
      ...(typeof args.savedSourceCount === "number" && Number.isFinite(args.savedSourceCount)
        ? { savedSourceCount: Math.max(0, Math.floor(args.savedSourceCount)) }
        : {}),
      ...(typeof args.skippedSourceCount === "number" && Number.isFinite(args.skippedSourceCount)
        ? { skippedSourceCount: Math.max(0, Math.floor(args.skippedSourceCount)) }
        : {}),
      ...(Array.isArray(args.sourceResourceIds)
        ? { sourceResourceIds: args.sourceResourceIds.map((id) => id as any) }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(args, "error")
        ? { error: normalizeOptionalText(args.error, 1000) ?? undefined }
        : {}),
      ...(typeof args.startedAt === "number" && Number.isFinite(args.startedAt)
        ? { startedAt: Math.floor(args.startedAt) }
        : {}),
      ...(typeof args.completedAt === "number" && Number.isFinite(args.completedAt)
        ? { completedAt: Math.floor(args.completedAt) }
        : {}),
      updatedAt: nowMs,
    });
    const updated = (await ctx.db.get(existing._id as any)) as CommunitySourceCrawlJobLike | null;
    return updated ? mapCommunitySourceCrawlJob(updated) : null;
  },
});

export const saveCommunitySourceCrawlPagesInternal = internalMutation({
  args: {
    crawlJobId: v.string(),
    communityId: v.id("communities"),
    userId: v.id("users"),
    rootUrl: v.string(),
    provider: v.literal("simple"),
    pages: v.array(communitySourceCrawlerPageArg),
  },
  handler: async (ctx, args) => {
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const job = (await ctx.db.get(args.crawlJobId as any)) as CommunitySourceCrawlJobLike | null;
    if (!job || normalizeIdValue(job.communityId) !== normalizeIdValue(args.communityId)) {
      throw new Error("community_source_crawl_job_not_found");
    }
    const nowMs = Date.now();
    const existingSources = (await ctx.db
      .query("communityResources" as any)
      .withIndex("by_community_role_status", (q: any) =>
        q.eq("communityId", args.communityId).eq("role", "source"),
      )
      .collect()) as CommunityResourceLike[];
    const existingByUrl = new Map<string, CommunitySourceCrawlerExistingSource<CommunityResourceLike>>();
    for (const source of existingSources) {
      for (const alias of communitySourceCrawlerUrlAliases(maybeSafeSourceCrawlerUrl, source.url)) {
        if (!existingByUrl.has(alias)) {
          existingByUrl.set(alias, {
            id: normalizeIdValue(source._id),
            hasReadyText: communityResourceSourceHasReadyText(source),
            payload: source,
          });
        }
      }
    }

    let saved = 0;
    let skipped = 0;
    let failed = 0;
    let savedUnits = 0;
    let skippedUnits = 0;
    let failedUnits = 0;
    const sourceResourceIds: string[] = [];
    const seenUrls = new Set<string>();

    for (const page of args.pages) {
      const decision = planCommunitySourceCrawlerPageSave({
        page,
        rootUrl: args.rootUrl,
        existingSourcesByAlias: existingByUrl,
        seenAliases: seenUrls,
        normalizeUrl: maybeSafeSourceCrawlerUrl,
        maxBodyChars: COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BODY_CHARS,
      });
      const finalUrl = decision.final_url;
      const bodyMd = decision.body_md;
      if (decision.action === "fail" || !finalUrl || !bodyMd.trim()) {
        failed += 1;
        continue;
      }
      if (decision.action === "skip") {
        skipped += 1;
        if (decision.source_id) {
          sourceResourceIds.push(decision.source_id);
          const unitResult = await saveCommunitySourceUnitsForPage(ctx, {
            crawlJobId: args.crawlJobId,
            communityId: args.communityId,
            sourceResourceId: decision.source_id,
            rootUrl: args.rootUrl,
            page,
            nowMs,
          });
          savedUnits += unitResult.saved;
          skippedUnits += unitResult.skipped;
          failedUnits += unitResult.failed;
        }
        continue;
      }
      const title = normalizeName(page.title || titleFromSourceCrawlerUrl(finalUrl));
      if (decision.action === "update_existing" && decision.source_id) {
        await ctx.db.patch(decision.source_id as any, {
          title,
          url: finalUrl,
          sourceIngestionStatus: "ready",
          sourceIngestionKind: "url",
          sourceIngestionError: undefined,
          sourceIngestionAttemptedAt: nowMs,
          sourceIngestedAt: nowMs,
          sourceIngestionLeaseId: undefined,
          sourceIngestionLeaseExpiresAt: undefined,
          sourceIngestionAttempt: undefined,
          updatedAt: nowMs,
        });
        await writeCommunityResourceBodyContent(ctx, {
          communityId: args.communityId,
          resourceId: decision.source_id as any,
          bodyMd,
          nowMs,
          maxChars: COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BODY_CHARS,
        });
        sourceResourceIds.push(decision.source_id);
        const unitResult = await saveCommunitySourceUnitsForPage(ctx, {
          crawlJobId: args.crawlJobId,
          communityId: args.communityId,
          sourceResourceId: decision.source_id,
          rootUrl: args.rootUrl,
          page,
          nowMs,
        });
        savedUnits += unitResult.saved;
        skippedUnits += unitResult.skipped;
        failedUnits += unitResult.failed;
        saved += 1;
        continue;
      }
      const id = await ctx.db.insert("communityResources" as any, {
        communityId: args.communityId,
        createdByUserId: args.userId,
        type: "link",
        role: "source",
        status: "review",
        title,
        url: finalUrl,
        fileKey: undefined,
        sourceIngestionStatus: "ready",
        sourceIngestionKind: "url",
        sourceIngestionError: undefined,
        sourceIngestionAttemptedAt: nowMs,
        sourceIngestedAt: nowMs,
        pinned: false,
        sortOrder: undefined,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
      await writeCommunityResourceBodyContent(ctx, {
        communityId: args.communityId,
        resourceId: id,
        bodyMd,
        nowMs,
        maxChars: COMMUNITY_RESOURCE_SOURCE_INGESTION_MAX_BODY_CHARS,
      });
      const sourceResourceId = normalizeIdValue(id);
      sourceResourceIds.push(sourceResourceId);
      const unitResult = await saveCommunitySourceUnitsForPage(ctx, {
        crawlJobId: args.crawlJobId,
        communityId: args.communityId,
        sourceResourceId,
        rootUrl: args.rootUrl,
        page,
        nowMs,
      });
      savedUnits += unitResult.saved;
      skippedUnits += unitResult.skipped;
      failedUnits += unitResult.failed;
      saved += 1;
    }

    return {
      ok: true,
      kind: "community_source_crawl_pages_saved",
      crawl_job_id: args.crawlJobId,
      provider: args.provider,
      page_count: args.pages.length,
      ready_page_count: args.pages.length - failed,
      failed_page_count: failed,
      saved_source_count: saved,
      skipped_source_count: skipped,
      saved_source_unit_count: savedUnits,
      skipped_source_unit_count: skippedUnits,
      failed_source_unit_count: failedUnits,
      source_resource_ids: sourceResourceIds,
    };
  },
});

export const processCommunitySourceCrawlJobInternal = internalAction({
  args: {
    crawlJobId: v.string(),
  },
  handler: async (ctx, args): Promise<Record<string, unknown> | null> => {
    const job = (await ctx.runQuery(
      (internal as any).communityResources.getCommunitySourceCrawlJobInternal,
      { crawlJobId: args.crawlJobId },
    )) as CommunitySourceCrawlJobLike | null;
    if (!job) return null;
    if (job.status === "ready") {
      return {
        ok: true,
        kind: "community_source_crawl_job_already_ready",
        job: mapCommunitySourceCrawlJob(job),
      };
    }
    await ctx.runMutation((internal as any).communityResources.patchCommunitySourceCrawlJobInternal, {
      crawlJobId: args.crawlJobId,
      status: "crawling",
      error: null,
      startedAt: Date.now(),
    });
    try {
      const crawl = await crawlSourceRootWithConfiguredProvider({
        rootUrl: job.rootUrl,
      });
      await ctx.runMutation((internal as any).communityResources.patchCommunitySourceCrawlJobInternal, {
        crawlJobId: args.crawlJobId,
        status: "saving_sources",
        pageCount: crawl.pages.length,
        readyPageCount: crawl.pages.filter((page) => page.status === "ready").length,
        failedPageCount: crawl.pages.filter((page) => page.status !== "ready").length,
        error: null,
      });
      const saved = (await ctx.runMutation(
        (internal as any).communityResources.saveCommunitySourceCrawlPagesInternal,
        {
          crawlJobId: args.crawlJobId,
          communityId: job.communityId,
          userId: job.createdByUserId,
          rootUrl: job.rootUrl,
          provider: crawl.provider,
          pages: crawl.pages,
        },
      )) as any;
      const completedAt = Date.now();
      const sourceResourceIds = Array.isArray(saved?.source_resource_ids) ? saved.source_resource_ids : [];
      if (sourceResourceIds.length === 0) {
        const failed = await ctx.runMutation((internal as any).communityResources.patchCommunitySourceCrawlJobInternal, {
          crawlJobId: args.crawlJobId,
          status: "failed",
          pageCount: Number(saved?.page_count ?? crawl.pages.length),
          readyPageCount: Number(saved?.ready_page_count ?? 0),
          failedPageCount: Number(saved?.failed_page_count ?? 0),
          savedSourceCount: Number(saved?.saved_source_count ?? 0),
          skippedSourceCount: Number(saved?.skipped_source_count ?? 0),
          sourceResourceIds,
          error: "community_source_crawl_no_usable_sources",
          completedAt,
        });
        return {
          ok: false,
          kind: "community_source_crawl_job_failed",
          job: failed,
          error: "community_source_crawl_no_usable_sources",
        };
      }
      const updated = await ctx.runMutation((internal as any).communityResources.patchCommunitySourceCrawlJobInternal, {
        crawlJobId: args.crawlJobId,
        status: "ready",
        pageCount: Number(saved?.page_count ?? crawl.pages.length),
        readyPageCount: Number(saved?.ready_page_count ?? 0),
        failedPageCount: Number(saved?.failed_page_count ?? 0),
        savedSourceCount: Number(saved?.saved_source_count ?? 0),
        skippedSourceCount: Number(saved?.skipped_source_count ?? 0),
        sourceResourceIds,
        error: null,
        completedAt,
      });
      return {
        ok: true,
        kind: "community_source_crawl_job_completed",
        job: updated,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "community_source_crawl_failed";
      const failed = await ctx.runMutation((internal as any).communityResources.patchCommunitySourceCrawlJobInternal, {
        crawlJobId: args.crawlJobId,
        status: "failed",
        error: message,
        completedAt: Date.now(),
      });
      return {
        ok: false,
        kind: "community_source_crawl_job_failed",
        job: failed,
        error: message,
      };
    }
  },
});

export const crawlWebRoot: any = internalAction({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    rootUrl: v.string(),
    strategy: v.optional(v.union(v.literal("auto"), v.literal("simple"), v.literal("crawl"))),
    destination: v.optional(v.union(v.literal("context"), v.literal("active_community_sources"))),
    maxPages: v.optional(v.number()),
    maxDepth: v.optional(v.number()),
    maxChars: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const userId = args.userId;
    const rootUrl = requireSafeSourceIngestionUrl(args.rootUrl);
    const destination = args.destination === "active_community_sources"
      ? "active_community_sources"
      : "context";
    const provider = normalizeWebCrawlStrategyProvider(args.strategy) ?? normalizeSourceCrawlerProvider();
    const maxPages = normalizeSourceCrawlerLimit(
      args.maxPages,
      COMMUNITY_RESOURCE_SOURCE_CRAWLER_DEFAULT_MAX_PAGES,
      COMMUNITY_RESOURCE_SOURCE_CRAWLER_MAX_PAGES,
    );
    const maxDepth = normalizeSourceCrawlerLimit(
      args.maxDepth,
      COMMUNITY_RESOURCE_SOURCE_CRAWLER_DEFAULT_MAX_DEPTH,
      COMMUNITY_RESOURCE_SOURCE_CRAWLER_MAX_DEPTH,
    );

    if (destination === "context") {
      const crawl = await crawlSourceRootWithConfiguredProvider({
        rootUrl,
      });
      return buildWebCrawlContextPayload({
        rootUrl,
        provider: crawl.provider,
        pages: crawl.pages,
        maxChars: args.maxChars,
      });
    }

    if (!args.communityId) throw new Error("web_crawl_active_community_required");
    await requireCommunityManagerForAction(ctx, userId, args.communityId);
    const job = await ctx.runMutation((internal as any).communityResources.createCommunitySourceCrawlJobInternal, {
      userId,
      communityId: args.communityId,
      rootUrl,
      provider,
      maxPages,
      maxDepth,
    });
    const crawlJobId = String(job?.id ?? "").trim();
    if (!crawlJobId) throw new Error("community_source_crawl_job_create_failed");
    const processed = (await ctx.runAction(
      (internal as any).communityResources.processCommunitySourceCrawlJobInternal,
      { crawlJobId },
    )) as any;
    const processedJob = processed?.job;
    if (!processedJob) throw new Error("community_source_crawl_job_processing_failed");
    if (processed?.ok === false && processed?.error !== "community_source_crawl_no_usable_sources") {
      throw new Error(String(processed?.error ?? "web_crawl_failed"));
    }
    const sourceResourceIds = Array.isArray(processedJob.source_resource_ids)
      ? processedJob.source_resource_ids.map((id: unknown) => String(id ?? "").trim()).filter(Boolean)
      : [];
    return {
      ok: processed?.ok === true && sourceResourceIds.length > 0,
      kind: "web_crawl",
      destination,
      provider: processedJob.provider,
      root_url: rootUrl,
      crawl_job_id: crawlJobId,
      page_count: Number(processedJob.page_count ?? 0),
      ready_page_count: Number(processedJob.ready_page_count ?? 0),
      failed_page_count: Number(processedJob.failed_page_count ?? 0),
      saved_source_count: Number(processedJob.saved_source_count ?? 0),
      skipped_source_count: Number(processedJob.skipped_source_count ?? 0),
      source_resource_ids: sourceResourceIds,
    };
  },
});

export const crawlCommunitySourceRoot: any = action({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    rootUrl: v.string(),
    maxPages: v.optional(v.number()),
    maxDepth: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const userId = await resolveAuthenticatedActionUserId(ctx, args.authSubject ?? null);
    await requireCommunityManagerForAction(ctx, userId, args.communityId);
    const rootUrl = requireSafeSourceIngestionUrl(args.rootUrl);
    const provider = normalizeSourceCrawlerProvider();
    const maxPages = normalizeSourceCrawlerLimit(
      args.maxPages,
      COMMUNITY_RESOURCE_SOURCE_CRAWLER_DEFAULT_MAX_PAGES,
      COMMUNITY_RESOURCE_SOURCE_CRAWLER_MAX_PAGES,
    );
    const maxDepth = normalizeSourceCrawlerLimit(
      args.maxDepth,
      COMMUNITY_RESOURCE_SOURCE_CRAWLER_DEFAULT_MAX_DEPTH,
      COMMUNITY_RESOURCE_SOURCE_CRAWLER_MAX_DEPTH,
    );
    const job = await ctx.runMutation((internal as any).communityResources.createCommunitySourceCrawlJobInternal, {
      userId,
      communityId: args.communityId,
      rootUrl,
      provider,
      maxPages,
      maxDepth,
    });
    const crawlJobId = String(job?.id ?? "").trim();
    if (!crawlJobId) throw new Error("community_source_crawl_job_create_failed");
    try {
      await ctx.scheduler.runAfter(
        0,
        (internal as any).communityResources.processCommunitySourceCrawlJobInternal,
        { crawlJobId },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "community_source_crawl_schedule_failed";
      await ctx.runMutation((internal as any).communityResources.patchCommunitySourceCrawlJobInternal, {
        crawlJobId,
        status: "failed",
        error: message,
        completedAt: Date.now(),
      });
      throw error;
    }
    return {
      ok: true,
      kind: "community_source_root_crawl_job",
      job,
    };
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
      const nextRoleRaw = Object.prototype.hasOwnProperty.call(payload, "resource_role")
        ? payload.resource_role
        : existing.role;
      const nextStatusRaw = Object.prototype.hasOwnProperty.call(payload, "resource_status")
        ? payload.resource_status
        : existing.status;
      const nextStatus = Object.prototype.hasOwnProperty.call(payload, "resource_status")
        ? requireResourceStatusForWrite(nextStatusRaw)
        : normalizeResourceStatus(nextStatusRaw);
      const nextUrlRaw = Object.prototype.hasOwnProperty.call(payload, "url") ? payload.url : existing.url;
      const nextFileKeyRaw = Object.prototype.hasOwnProperty.call(payload, "file_key")
        ? payload.file_key
        : existing.fileKey;
      const nextSourceIngestionStatusRaw = Object.prototype.hasOwnProperty.call(payload, "source_ingestion_status")
        ? payload.source_ingestion_status
        : existing.sourceIngestionStatus;
      const nextSourceIngestionKindRaw = Object.prototype.hasOwnProperty.call(payload, "source_ingestion_kind")
        ? payload.source_ingestion_kind
        : existing.sourceIngestionKind;
      const nextPinnedRaw = Object.prototype.hasOwnProperty.call(payload, "pinned") ? payload.pinned : existing.pinned;
      const nextModuleIdRaw = Object.prototype.hasOwnProperty.call(payload, "module_id")
        ? payload.module_id
        : existing.moduleId;
      const nextRole = normalizeResourceRole(nextRoleRaw);
      const bodyChanged = Object.prototype.hasOwnProperty.call(payload, "body_md");
      const nextBodyMd = bodyChanged ? normalizeCommunityResourceBodyMd(payload.body_md, 20_000) : null;
      const nextBodyChars = bodyChanged ? String(nextBodyMd ?? "").trim().length : communityResourceBodyChars(existing);
      const nextUrl = normalizeOptionalUrl(nextUrlRaw);
      const nextFileKey = normalizeOptionalFileKey(nextFileKeyRaw);
      const urlChanged = Object.prototype.hasOwnProperty.call(payload, "url") &&
        String(nextUrl ?? "") !== String(existing.url ?? "");
      const fileChanged = Object.prototype.hasOwnProperty.call(payload, "file_key") &&
        String(nextFileKey ?? "") !== String(existing.fileKey ?? "");
      const nextSourceIngestionStatus = Object.prototype.hasOwnProperty.call(payload, "source_ingestion_status")
        ? requireResourceSourceIngestionStatusForWrite(nextSourceIngestionStatusRaw)
        : nextRole !== "source"
          ? "not_required"
          : bodyChanged && nextBodyChars > 0
          ? "ready"
          : urlChanged || fileChanged
            ? "queued"
            : normalizeResourceSourceIngestionStatus({
                ...existing,
                role: nextRole,
                bodyMd: bodyChanged ? nextBodyMd ?? undefined : existing.bodyMd,
                bodyChars: nextBodyChars,
                url: nextUrl,
                fileKey: nextFileKey,
              });
      const nextSourceIngestionKind = Object.prototype.hasOwnProperty.call(payload, "source_ingestion_kind")
        ? requireResourceSourceIngestionKindForWrite(nextSourceIngestionKindRaw)
        : nextRole !== "source"
          ? "manual"
          : fileChanged
            ? "file"
            : urlChanged
              ? "url"
              : normalizeResourceSourceIngestionKind({
                  ...existing,
                  role: nextRole,
                  url: nextUrl,
                  fileKey: nextFileKey,
                });
      const sourceRevisionChanged =
        bodyChanged ||
        urlChanged ||
        fileChanged ||
        nextRole !== normalizeResourceRole(existing.role) ||
        nextSourceIngestionKind !== normalizeResourceSourceIngestionKind(existing);
      const nextModuleId = await requireResourceModuleForRole({
        ctx,
        communityId: existing.communityId,
        moduleId: normalizeOptionalModuleId(nextModuleIdRaw),
        role: nextRole,
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
        role: nextRole,
        status: nextStatus,
        title: nextTitle,
        url: nextUrl,
        fileKey: nextFileKey,
        sourceIngestionStatus: nextSourceIngestionStatus,
        sourceIngestionKind: nextSourceIngestionKind,
        ...(sourceRevisionChanged
          ? {
              sourceIngestionLeaseId: undefined,
              sourceIngestionLeaseExpiresAt: undefined,
              sourceIngestionAttempt: undefined,
            }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "source_ingestion_error")
          ? { sourceIngestionError: normalizeOptionalText(payload.source_ingestion_error, 1000) ?? undefined }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "source_original_filename")
          ? { sourceOriginalFilename: normalizeOptionalText(payload.source_original_filename, 240) ?? undefined }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "source_original_mime_type")
          ? { sourceOriginalMimeType: normalizeOptionalText(payload.source_original_mime_type, 180) ?? undefined }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(payload, "source_original_bytes")
          ? {
              sourceOriginalBytes:
                typeof payload.source_original_bytes === "number" && Number.isFinite(payload.source_original_bytes)
                  ? Math.max(0, Math.floor(payload.source_original_bytes))
                  : undefined,
            }
          : {}),
        pinned: Boolean(nextPinnedRaw),
        ...(typeof nextSortOrder === "number" ? { sortOrder: nextSortOrder } : {}),
        updatedAt: nowMs,
      });
      const updated = (await ctx.db.get(existing._id as any)) as CommunityResourceLike | null;
      if (!updated) throw new Error("community_resource_not_found");
      if (bodyChanged) {
        await writeCommunityResourceBodyContent(ctx, {
          communityId: updated.communityId,
          resourceId: updated._id,
          bodyMd: nextBodyMd,
          nowMs,
          maxChars: 20_000,
        });
      }
      const hydrated = await hydrateCommunityResourceBody(ctx, updated) ?? updated;
      return await mapCommunityResourceRow(ctx, hydrated);
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
    const role = normalizeResourceRole(payload.resource_role);
    const hasStatusPayload = Object.prototype.hasOwnProperty.call(payload, "resource_status");
    const status = hasStatusPayload
      ? requireResourceStatusForWrite(payload.resource_status)
      : role === "source"
        ? "review"
        : "draft";
    const title = normalizeName(payload.title);
    const bodyMd = normalizeCommunityResourceBodyMd(payload.body_md, 20_000);
    const url = normalizeOptionalUrl(payload.url);
    const fileKey = normalizeOptionalFileKey(payload.file_key);
    const sourceIngestionStatus = Object.prototype.hasOwnProperty.call(payload, "source_ingestion_status")
      ? requireResourceSourceIngestionStatusForWrite(payload.source_ingestion_status)
      : role === "source" && bodyMd
        ? "ready"
        : role === "source" && (url || fileKey)
          ? "queued"
          : "not_required";
    const sourceIngestionKind = Object.prototype.hasOwnProperty.call(payload, "source_ingestion_kind")
      ? requireResourceSourceIngestionKindForWrite(payload.source_ingestion_kind)
      : role === "source" && url
        ? "url"
        : role === "source" && fileKey
          ? "file"
          : "manual";
    const pinned = Boolean(payload.pinned);
    const moduleId = await requireResourceModuleForRole({
      ctx,
      communityId: community._id,
      moduleId: normalizeOptionalModuleId(payload.module_id),
      role,
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
      role,
      status,
      title,
      url,
      fileKey,
      sourceIngestionStatus,
      sourceIngestionKind,
      ...(Object.prototype.hasOwnProperty.call(payload, "source_ingestion_error")
        ? { sourceIngestionError: normalizeOptionalText(payload.source_ingestion_error, 1000) ?? undefined }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(payload, "source_original_filename")
        ? { sourceOriginalFilename: normalizeOptionalText(payload.source_original_filename, 240) ?? undefined }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(payload, "source_original_mime_type")
        ? { sourceOriginalMimeType: normalizeOptionalText(payload.source_original_mime_type, 180) ?? undefined }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(payload, "source_original_bytes")
        ? {
            sourceOriginalBytes:
              typeof payload.source_original_bytes === "number" && Number.isFinite(payload.source_original_bytes)
                ? Math.max(0, Math.floor(payload.source_original_bytes))
                : undefined,
          }
        : {}),
      pinned,
      sortOrder: nextSortOrder,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const created = (await ctx.db.get(id as any)) as CommunityResourceLike | null;
    if (!created) throw new Error("community_resource_create_failed");
    if (bodyMd) {
      await writeCommunityResourceBodyContent(ctx, {
        communityId: community._id,
        resourceId: created._id,
        bodyMd,
        nowMs,
        maxChars: 20_000,
      });
    }
    const hydrated = await hydrateCommunityResourceBody(ctx, created) ?? created;
    const createdModule = moduleId
      ? ((await ctx.db.get(moduleId as any)) as CommunityResourceModuleLike | null)
      : null;
    const liveModuleIds = new Set(
      createdModule && communityResourceModuleIsLive(createdModule)
        ? [normalizeIdValue(createdModule._id)]
        : [],
    );
    if (communityResourceIsLiveModulePage(hydrated, liveModuleIds)) {
      await recordCommunityActivityEventBestEffort({
        ctx,
        communityId: community._id,
        type: "resource_added",
        actorUserId: args.userId,
        targetType: "resource",
        targetId: hydrated._id,
        targetTitle: hydrated.title,
        dedupeKey: `resource_added:${normalizeIdValue(hydrated._id)}`,
        nowMs,
      });
    }
    return await mapCommunityResourceRow(ctx, hydrated);
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
    const scopedRows = rows.filter(
      (row) =>
        resourceModuleIdentity(row.moduleId) === targetModuleIdentity &&
        normalizeResourceRole(row.role) === "page",
    );
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

export const moveCommunityResourceToModule = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    resourceId: v.id("communityResources"),
    targetModuleId: v.optional(v.union(v.id("communityResourceModules"), v.null())),
    beforeResourceId: v.optional(v.union(v.id("communityResources"), v.null())),
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

    const resource = (await ctx.db.get(args.resourceId as any)) as CommunityResourceLike | null;
    if (!resource || String(resource.communityId) !== String(args.communityId)) {
      throw new Error("community_resource_not_found");
    }
    if (normalizeResourceRole(resource.role) !== "page") {
      throw new Error("community_resource_move_requires_page");
    }

    const targetModuleId = await requireResourceModuleForRole({
      ctx,
      communityId: args.communityId,
      moduleId: normalizeOptionalModuleId(args.targetModuleId ?? null),
      role: "page",
    });
    const targetModuleIdentity = resourceModuleIdentity(targetModuleId);
    const resourceId = normalizeIdValue(resource._id);
    const beforeResourceId = args.beforeResourceId ? normalizeIdValue(args.beforeResourceId) : null;

    const rows = (await ctx.db
      .query("communityResources" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", args.communityId))
      .collect()) as CommunityResourceLike[];
    const destinationRows = rows
      .filter(
        (row) =>
          normalizeIdValue(row._id) !== resourceId &&
          resourceModuleIdentity(row.moduleId) === targetModuleIdentity &&
          normalizeResourceRole(row.role) === "page",
      )
      .sort(compareCommunityResources);

    const insertIndex = beforeResourceId
      ? destinationRows.findIndex((row) => normalizeIdValue(row._id) === beforeResourceId)
      : -1;
    if (beforeResourceId && insertIndex < 0) {
      throw new Error("community_resource_move_before_not_found");
    }

    const orderedRows = destinationRows.slice();
    orderedRows.splice(insertIndex >= 0 ? insertIndex : orderedRows.length, 0, resource);
    const nowMs = Date.now();

    await Promise.all(
      orderedRows.map((row, index) => {
        const rowId = normalizeIdValue(row._id);
        return ctx.db.patch(row._id as any, {
          ...(rowId === resourceId
            ? targetModuleId
              ? { moduleId: targetModuleId }
              : { moduleId: undefined }
            : {}),
          sortOrder: (index + 1) * 1000,
          updatedAt: nowMs,
        });
      }),
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
    await deleteCommunitySourceUnitsForSourceResource(ctx, resource._id);
    await deleteCommunityResourceBodyContent(ctx, resource._id);
    await ctx.db.delete(resource._id as any);
    return { ok: true };
  },
});

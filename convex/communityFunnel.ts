import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { ConvexError, v } from "convex/values";
import {
  isSupportedCommunityFunnelVideoUrl,
  normalizeCommunityFunnelVslUrl,
  normalizeCommunityFunnelDocumentV1,
  resolveCommunityFunnelDocumentVslUrl,
  validateCommunityFunnelDocumentV1,
  withoutCommunityFunnelMediaSections,
} from "../shared/communityFunnel";
import {
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";
import { communityFunnelDocumentV1Validator } from "./communityFunnelValidators";

type CommunityFunnelRowLike = {
  _id: unknown;
  communityId: unknown;
  heroMediaUrl?: string | null;
  heroMediaKind?: "image" | "video" | null;
  draftVslUrl?: string | null;
  publishedVslUrl?: string | null;
  draftDocumentV1?: unknown;
  draftRevision?: number | null;
  draftUpdatedAt?: number | null;
  draftUpdatedByUserId?: unknown;
  publishedDocumentV1?: unknown;
  publishedDraftRevision?: number | null;
  publishedAt?: number | null;
  publishedByUserId?: unknown;
  createdAt: number;
  updatedAt: number;
};

function normalizeTrimmedString(
  raw: unknown,
  maxLength: number,
): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;
  return value.slice(0, maxLength);
}

function normalizeHeroMediaKind(raw: unknown): "image" | "video" {
  return raw === "video" ? "video" : "image";
}

function normalizeStoredVslUrl(raw: unknown): string | null {
  try {
    return normalizeCommunityFunnelVslUrl(raw);
  } catch {
    return null;
  }
}

function resolveLegacyVslUrl(
  row: CommunityFunnelRowLike | null,
  document: unknown,
): string | null {
  const documentUrl = resolveCommunityFunnelDocumentVslUrl(
    normalizeCommunityFunnelDocumentV1(document),
  );
  if (documentUrl) return documentUrl;
  return row?.heroMediaKind === "video"
    ? normalizeStoredVslUrl(row.heroMediaUrl)
    : null;
}

function resolveDraftVslUrl(row: CommunityFunnelRowLike | null): string | null {
  if (row?.draftVslUrl !== undefined) {
    return normalizeStoredVslUrl(row.draftVslUrl);
  }
  return resolveLegacyVslUrl(row, row?.draftDocumentV1);
}

function resolvePublishedVslUrl(
  row: CommunityFunnelRowLike | null,
): string | null {
  if (row?.publishedVslUrl !== undefined) {
    return normalizeStoredVslUrl(row.publishedVslUrl);
  }
  return resolveLegacyVslUrl(row, row?.publishedDocumentV1);
}

function buildCommunityFunnelConfig(row: CommunityFunnelRowLike | null) {
  return {
    hero_media_url: normalizeTrimmedString(row?.heroMediaUrl, 2_000),
    hero_media_kind: normalizeHeroMediaKind(row?.heroMediaKind),
    published_vsl_url: resolvePublishedVslUrl(row),
    published_document_v1: normalizeCommunityFunnelDocumentV1(
      row?.publishedDocumentV1,
    ),
  };
}

function buildCommunityFunnelManagerConfig(row: CommunityFunnelRowLike | null) {
  return {
    hero_media_url: normalizeTrimmedString(row?.heroMediaUrl, 2_000),
    hero_media_kind: normalizeHeroMediaKind(row?.heroMediaKind),
    published_vsl_url: resolvePublishedVslUrl(row),
    published_document_v1: normalizeCommunityFunnelDocumentV1(
      row?.publishedDocumentV1,
    ),
    draft_document_v1: normalizeCommunityFunnelDocumentV1(
      row?.draftDocumentV1,
    ),
    draft_vsl_url: resolveDraftVslUrl(row),
    draft_revision: Math.max(0, Math.floor(Number(row?.draftRevision ?? 0))),
    draft_updated_at: row?.draftUpdatedAt ?? null,
    published_draft_revision: Math.max(
      0,
      Math.floor(Number(row?.publishedDraftRevision ?? 0)),
    ),
    published_at: row?.publishedAt ?? null,
  };
}

export function normalizeCommunityFunnelConfigInput(raw: unknown) {
  const value =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const heroMediaKind = normalizeHeroMediaKind(value.hero_media_kind);
  const heroMediaUrl = normalizeTrimmedString(value.hero_media_url, 2_000);
  if (
    heroMediaUrl &&
    heroMediaKind === "video" &&
    !isSupportedCommunityFunnelVideoUrl(heroMediaUrl)
  ) {
    throw new Error(
      "Only YouTube, Vimeo, Loom, and Wistia links are supported for funnel media.",
    );
  }
  return {
    hero_media_url: heroMediaUrl,
    hero_media_kind: heroMediaKind,
  };
}

async function getCommunityFunnelRow(
  ctx: any,
  communityId: any,
): Promise<CommunityFunnelRowLike | null> {
  return (await ctx.db
    .query("communityFunnels" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .first()) as CommunityFunnelRowLike | null;
}

export async function saveCommunityFunnelConfigInternal(
  ctx: any,
  communityId: any,
  normalized: ReturnType<typeof normalizeCommunityFunnelConfigInput>,
  nowMs: number,
) {
  const existing = await getCommunityFunnelRow(ctx, communityId);
  const hasHeroMedia = Boolean(normalized?.hero_media_url);
  if (!hasHeroMedia) {
    if (
      existing &&
      !existing.draftDocumentV1 &&
      !existing.publishedDocumentV1 &&
      !resolveDraftVslUrl(existing) &&
      !resolvePublishedVslUrl(existing)
    ) {
      await ctx.db.delete(existing._id as any);
    } else if (existing) {
      await ctx.db.patch(existing._id as any, {
        heroMediaUrl: undefined,
        heroMediaKind: undefined,
        updatedAt: nowMs,
      });
    }
    return buildCommunityFunnelConfig(
      existing ? await getCommunityFunnelRow(ctx, communityId) : null,
    );
  }
  const nextFields = {
    heroMediaUrl: normalized.hero_media_url ?? undefined,
    heroMediaKind: normalized.hero_media_kind ?? "image",
    communityId,
    createdAt: existing?.createdAt ?? nowMs,
    updatedAt: nowMs,
  };
  if (existing) {
    await ctx.db.patch(existing._id as any, nextFields);
  } else {
    await ctx.db.insert("communityFunnels" as any, nextFields);
  }
  const saved = await getCommunityFunnelRow(ctx, communityId);
  return buildCommunityFunnelConfig(saved);
}

export async function resolveCommunityFunnelConfigByCommunityId(
  ctx: any,
  communityId: any,
) {
  const row = await getCommunityFunnelRow(ctx, communityId);
  return buildCommunityFunnelConfig(row);
}

export const getCommunityFunnelConfig = query({
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
    await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const row = await getCommunityFunnelRow(ctx, args.communityId);
    return buildCommunityFunnelManagerConfig(row);
  },
});

export const getCommunityFunnelDraftPreview = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const slug = args.slug.trim();
    const community = await ctx.db
      .query("communities")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (!community) throw new Error("community_not_found");
    await requireCommunityManager({ ctx, communityId: community._id, userId });
    return buildCommunityFunnelManagerConfig(
      await getCommunityFunnelRow(ctx, community._id),
    );
  },
});

export const getCommunityFunnelDraftInternal = internalQuery({
  args: { communityId: v.id("communities") },
  handler: async (ctx, args) =>
    buildCommunityFunnelManagerConfig(
      await getCommunityFunnelRow(ctx, args.communityId),
    ),
});

async function saveCommunityFunnelDraftForManager(args: {
  ctx: any;
  userId: any;
  communityId: any;
  expectedDraftRevision: number;
  document: unknown;
}) {
  await requireCommunityManager({
    ctx: args.ctx,
    communityId: args.communityId,
    userId: args.userId,
  });
  const existing = await getCommunityFunnelRow(args.ctx, args.communityId);
  const currentRevision = Math.max(
    0,
    Math.floor(Number(existing?.draftRevision ?? 0)),
  );
  if (Math.floor(args.expectedDraftRevision) !== currentRevision) {
    throw new ConvexError({
      code: "community_funnel_draft_conflict",
      expected_revision: args.expectedDraftRevision,
      current_revision: currentRevision,
    });
  }
  const nowMs = Date.now();
  const nextRevision = currentRevision + 1;
  const draftDocumentV1 = validateCommunityFunnelDocumentV1(args.document);
  const boundedDraftDocumentV1 = withoutCommunityFunnelMediaSections(
    draftDocumentV1,
  );
  const draftFields = {
    draftDocumentV1: boundedDraftDocumentV1,
    ...(existing?.draftVslUrl === undefined
      ? { draftVslUrl: resolveDraftVslUrl(existing) }
      : {}),
    draftRevision: nextRevision,
    draftUpdatedAt: nowMs,
    draftUpdatedByUserId: args.userId,
    updatedAt: nowMs,
  };
  if (existing) {
    await args.ctx.db.patch(existing._id as any, draftFields);
  } else {
    await args.ctx.db.insert("communityFunnels", {
      communityId: args.communityId,
      ...draftFields,
      createdAt: nowMs,
    });
  }
  return buildCommunityFunnelManagerConfig(
    await getCommunityFunnelRow(args.ctx, args.communityId),
  );
}

export const saveCommunityFunnelDraftInternal = internalMutation({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    expectedDraftRevision: v.number(),
    document: communityFunnelDocumentV1Validator,
  },
  handler: async (ctx, args) =>
    saveCommunityFunnelDraftForManager({
      ctx,
      userId: args.userId,
      communityId: args.communityId,
      expectedDraftRevision: args.expectedDraftRevision,
      document: args.document,
    }),
});

export const setCommunityFunnelDraftVsl = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    expectedDraftRevision: v.number(),
    url: v.union(v.string(), v.null()),
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
    const existing = await getCommunityFunnelRow(ctx, args.communityId);
    const currentRevision = Math.max(
      0,
      Math.floor(Number(existing?.draftRevision ?? 0)),
    );
    if (Math.floor(args.expectedDraftRevision) !== currentRevision) {
      throw new ConvexError({
        code: "community_funnel_draft_conflict",
        expected_revision: args.expectedDraftRevision,
        current_revision: currentRevision,
      });
    }
    let draftVslUrl: string | null = null;
    try {
      draftVslUrl = normalizeCommunityFunnelVslUrl(args.url);
    } catch {
      throw new ConvexError({ code: "community_funnel_vsl_url_unsupported" });
    }
    if (
      (!existing && draftVslUrl === null) ||
      (existing?.draftVslUrl !== undefined &&
        draftVslUrl === resolveDraftVslUrl(existing) &&
        !resolveCommunityFunnelDocumentVslUrl(
          normalizeCommunityFunnelDocumentV1(existing.draftDocumentV1),
        ))
    ) {
      return buildCommunityFunnelManagerConfig(existing);
    }
    const nowMs = Date.now();
    const nextFields = {
      draftVslUrl,
      ...(existing?.draftDocumentV1
        ? {
            draftDocumentV1: withoutCommunityFunnelMediaSections(
              validateCommunityFunnelDocumentV1(existing.draftDocumentV1),
            ),
          }
        : {}),
      draftRevision: currentRevision + 1,
      draftUpdatedAt: nowMs,
      draftUpdatedByUserId: userId,
      updatedAt: nowMs,
    };
    if (existing) {
      await ctx.db.patch(existing._id as any, nextFields);
    } else {
      await ctx.db.insert("communityFunnels", {
        communityId: args.communityId,
        ...nextFields,
        createdAt: nowMs,
      });
    }
    return buildCommunityFunnelManagerConfig(
      await getCommunityFunnelRow(ctx, args.communityId),
    );
  },
});

export const publishCommunityFunnelDraft = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    expectedDraftRevision: v.number(),
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
    const existing = await getCommunityFunnelRow(ctx, args.communityId);
    if (!existing?.draftDocumentV1) {
      throw new ConvexError({ code: "community_funnel_draft_missing" });
    }
    const currentRevision = Math.max(
      0,
      Math.floor(Number(existing.draftRevision ?? 0)),
    );
    if (Math.floor(args.expectedDraftRevision) !== currentRevision) {
      throw new ConvexError({
        code: "community_funnel_publish_conflict",
        expected_revision: args.expectedDraftRevision,
        current_revision: currentRevision,
      });
    }
    const draftDocumentV1 = withoutCommunityFunnelMediaSections(
      validateCommunityFunnelDocumentV1(existing.draftDocumentV1),
    );
    if (
      existing.publishedDocumentV1 &&
      Math.floor(Number(existing.publishedDraftRevision ?? 0)) ===
        currentRevision
    ) {
      return buildCommunityFunnelManagerConfig(existing);
    }
    const nowMs = Date.now();
    await ctx.db.patch(existing._id as any, {
      publishedDocumentV1: draftDocumentV1,
      publishedVslUrl: resolveDraftVslUrl(existing),
      publishedDraftRevision: currentRevision,
      publishedAt: nowMs,
      publishedByUserId: userId,
      updatedAt: nowMs,
    });
    return buildCommunityFunnelManagerConfig(
      await getCommunityFunnelRow(ctx, args.communityId),
    );
  },
});

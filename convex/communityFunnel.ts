import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import {
  isSupportedCommunityFunnelVideoUrl,
  normalizeCommunityFunnelVslUrl as normalizeSharedCommunityFunnelVslUrl,
  normalizeCommunityFunnelContentV2,
  validateCommunityFunnelContentV2,
} from "../shared/communityFunnel";
import type { CommunityFunnelContentV2 } from "../shared/communityTypes";
import {
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";
import { communityFunnelContentV2Validator } from "./communityFunnelValidators";

type CommunityFunnelRowLike = {
  _id: unknown;
  communityId: unknown;
  heroMediaUrl?: string | null;
  heroMediaKind?: "image" | "video" | null;
  liveMode?: "default" | "custom" | null;
  draftVslUrl?: string | null;
  publishedVslUrl?: string | null;
  draftContentV2?: unknown;
  publishedContentV2?: unknown;
  draftRevision?: number | null;
  draftUpdatedAt?: number | null;
  draftUpdatedByUserId?: unknown;
  publishedDraftRevision?: number | null;
  publishedAt?: number | null;
  publishedByUserId?: unknown;
  createdAt: number;
  updatedAt: number;
};

function normalizeTrimmedString(raw: unknown, maxLength: number): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;
  return value.slice(0, maxLength);
}

function normalizeHeroMediaKind(raw: unknown): "image" | "video" {
  return raw === "video" ? "video" : "image";
}

function normalizeRevision(raw: unknown): number {
  const revision = Math.floor(Number(raw));
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
}

function normalizeCommunityFunnelVslUrl(raw: unknown): string | null {
  try {
    return normalizeSharedCommunityFunnelVslUrl(raw);
  } catch {
    throw new ConvexError({ code: "community_funnel_vsl_url_unsupported" });
  }
}

function normalizeStoredVslUrl(raw: unknown): string | null {
  try {
    return normalizeCommunityFunnelVslUrl(raw);
  } catch {
    return null;
  }
}

function sameContent(
  left: CommunityFunnelContentV2 | null,
  right: CommunityFunnelContentV2,
): boolean {
  return left !== null && JSON.stringify(left) === JSON.stringify(right);
}

function storedPublishedContent(row: CommunityFunnelRowLike | null) {
  return normalizeCommunityFunnelContentV2(row?.publishedContentV2);
}

function resolvedLiveMode(row: CommunityFunnelRowLike | null) {
  // Compatibility: before the explicit selector existed, a published custom
  // snapshot was live. New writes persist the selector explicitly.
  return row?.liveMode !== "default" && storedPublishedContent(row)
    ? "custom"
    : "default";
}

/** Public projection: private draft state and inactive snapshots never escape. */
export function buildCommunityFunnelPublicConfig(
  row: CommunityFunnelRowLike | null,
) {
  const liveMode = resolvedLiveMode(row);
  return {
    hero_media_url: normalizeTrimmedString(row?.heroMediaUrl, 2_000),
    hero_media_kind: normalizeHeroMediaKind(row?.heroMediaKind),
    live_mode: liveMode,
    published_vsl_url:
      liveMode === "custom" ? normalizeStoredVslUrl(row?.publishedVslUrl) : null,
    published_content_v2:
      liveMode === "custom" ? storedPublishedContent(row) : null,
  };
}

/** Manager projection: the private draft and inactive published snapshot remain visible. */
export function buildCommunityFunnelManagerConfig(
  row: CommunityFunnelRowLike | null,
) {
  return {
    hero_media_url: normalizeTrimmedString(row?.heroMediaUrl, 2_000),
    hero_media_kind: normalizeHeroMediaKind(row?.heroMediaKind),
    live_mode: resolvedLiveMode(row),
    published_vsl_url: normalizeStoredVslUrl(row?.publishedVslUrl),
    published_content_v2: storedPublishedContent(row),
    draft_vsl_url: normalizeStoredVslUrl(row?.draftVslUrl),
    draft_content_v2: normalizeCommunityFunnelContentV2(row?.draftContentV2),
    draft_revision: normalizeRevision(row?.draftRevision),
    draft_updated_at: row?.draftUpdatedAt ?? null,
    published_draft_revision: normalizeRevision(row?.publishedDraftRevision),
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
  const rows = (await ctx.db
    .query("communityFunnels" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .take(2)) as CommunityFunnelRowLike[];
  if (rows.length > 1) {
    throw new ConvexError({ code: "community_funnel_duplicate_rows" });
  }
  return rows[0] ?? null;
}

function rowHasCanonicalState(row: CommunityFunnelRowLike): boolean {
  return Boolean(
    row.draftContentV2 ||
      row.publishedContentV2 ||
      row.draftVslUrl ||
      row.publishedVslUrl ||
      normalizeRevision(row.draftRevision) ||
      normalizeRevision(row.publishedDraftRevision) ||
      row.liveMode === "custom",
  );
}

/** Compatibility adapter for the existing profile-media editor. */
export async function saveCommunityFunnelConfigInternal(
  ctx: any,
  communityId: any,
  normalized: ReturnType<typeof normalizeCommunityFunnelConfigInput>,
  nowMs: number,
) {
  const existing = await getCommunityFunnelRow(ctx, communityId);
  if (!normalized.hero_media_url) {
    if (existing && rowHasCanonicalState(existing)) {
      await ctx.db.patch(existing._id as any, {
        heroMediaUrl: undefined,
        heroMediaKind: undefined,
        updatedAt: nowMs,
      });
      return buildCommunityFunnelPublicConfig(
        await getCommunityFunnelRow(ctx, communityId),
      );
    }
    if (existing) await ctx.db.delete(existing._id as any);
    return buildCommunityFunnelPublicConfig(null);
  }
  const fields = {
    heroMediaUrl: normalized.hero_media_url,
    heroMediaKind: normalized.hero_media_kind,
    updatedAt: nowMs,
  };
  if (existing) {
    await ctx.db.patch(existing._id as any, fields);
  } else {
    await ctx.db.insert("communityFunnels" as any, {
      communityId,
      ...fields,
      createdAt: nowMs,
    });
  }
  return buildCommunityFunnelPublicConfig(
    await getCommunityFunnelRow(ctx, communityId),
  );
}

export async function resolveCommunityFunnelConfigByCommunityId(
  ctx: any,
  communityId: any,
) {
  return buildCommunityFunnelPublicConfig(
    await getCommunityFunnelRow(ctx, communityId),
  );
}

async function requireManager(args: {
  ctx: any;
  userId?: any;
  authSubject?: string | null;
  communityId: any;
}) {
  const userId = await resolveUserIdForAuthenticatedRequest({
    ctx: args.ctx,
    userId: args.userId,
    authSubject: args.authSubject ?? null,
  });
  await requireCommunityManager({
    ctx: args.ctx,
    communityId: args.communityId,
    userId,
  });
  return userId;
}

export const getCommunityFunnelConfig = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    await requireManager({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject,
      communityId: args.communityId,
    });
    return buildCommunityFunnelManagerConfig(
      await getCommunityFunnelRow(ctx, args.communityId),
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
  content: unknown;
}) {
  await requireCommunityManager({
    ctx: args.ctx,
    communityId: args.communityId,
    userId: args.userId,
  });
  const content = validateCommunityFunnelContentV2(args.content);
  const existing = await getCommunityFunnelRow(args.ctx, args.communityId);
  const currentRevision = normalizeRevision(existing?.draftRevision);
  if (normalizeRevision(args.expectedDraftRevision) !== currentRevision) {
    throw new ConvexError({
      code: "community_funnel_draft_conflict",
      expected_revision: args.expectedDraftRevision,
      current_revision: currentRevision,
    });
  }
  const nowMs = Date.now();
  const fields = {
    draftContentV2: content,
    draftRevision: currentRevision + 1,
    draftUpdatedAt: nowMs,
    draftUpdatedByUserId: args.userId,
    updatedAt: nowMs,
  };
  if (existing) await args.ctx.db.patch(existing._id as any, fields);
  else await args.ctx.db.insert("communityFunnels", {
    communityId: args.communityId,
    ...fields,
    createdAt: nowMs,
  });
  return buildCommunityFunnelManagerConfig(
    await getCommunityFunnelRow(args.ctx, args.communityId),
  );
}

export const saveCommunityFunnelDraftInternal = internalMutation({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    expectedDraftRevision: v.number(),
    content: communityFunnelContentV2Validator,
  },
  handler: async (ctx, args) => saveCommunityFunnelDraftForManager({
    ctx,
    userId: args.userId,
    communityId: args.communityId,
    expectedDraftRevision: args.expectedDraftRevision,
    content: args.content,
  }),
});

export const saveCommunityFunnelDraft = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    expectedDraftRevision: v.number(),
    content: communityFunnelContentV2Validator,
  },
  handler: async (ctx, args) => {
    const userId = await requireManager({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject,
      communityId: args.communityId,
    });
    const content = validateCommunityFunnelContentV2(args.content);
    const existing = await getCommunityFunnelRow(ctx, args.communityId);
    const currentRevision = normalizeRevision(existing?.draftRevision);
    const expectedRevision = normalizeRevision(args.expectedDraftRevision);
    if (args.expectedDraftRevision !== expectedRevision) {
      throw new ConvexError({ code: "community_funnel_draft_revision_invalid" });
    }
    if (expectedRevision !== currentRevision) {
      const currentContent = normalizeCommunityFunnelContentV2(
        existing?.draftContentV2,
      );
      if (
        currentRevision === expectedRevision + 1 &&
        sameContent(currentContent, content)
      ) {
        return buildCommunityFunnelManagerConfig(existing);
      }
      throw new ConvexError({
        code: "community_funnel_draft_conflict",
        expected_revision: expectedRevision,
        current_revision: currentRevision,
      });
    }
    const nowMs = Date.now();
    const fields = {
      draftContentV2: content,
      draftRevision: currentRevision + 1,
      draftUpdatedAt: nowMs,
      draftUpdatedByUserId: userId,
      updatedAt: nowMs,
    };
    if (existing) {
      await ctx.db.patch(existing._id as any, fields);
    } else {
      await ctx.db.insert("communityFunnels", {
        communityId: args.communityId,
        ...fields,
        createdAt: nowMs,
      });
    }
    return buildCommunityFunnelManagerConfig(
      await getCommunityFunnelRow(ctx, args.communityId),
    );
  },
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
    const userId = await requireManager({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject,
      communityId: args.communityId,
    });
    const existing = await getCommunityFunnelRow(ctx, args.communityId);
    const currentRevision = normalizeRevision(existing?.draftRevision);
    const expectedRevision = normalizeRevision(args.expectedDraftRevision);
    if (
      args.expectedDraftRevision !== expectedRevision ||
      expectedRevision !== currentRevision
    ) {
      throw new ConvexError({
        code: "community_funnel_draft_conflict",
        expected_revision: args.expectedDraftRevision,
        current_revision: currentRevision,
      });
    }
    const draftVslUrl = normalizeCommunityFunnelVslUrl(args.url);
    if (normalizeStoredVslUrl(existing?.draftVslUrl) === draftVslUrl) {
      return buildCommunityFunnelManagerConfig(existing);
    }
    const nowMs = Date.now();
    const fields = {
      draftVslUrl,
      draftRevision: currentRevision + 1,
      draftUpdatedAt: nowMs,
      draftUpdatedByUserId: userId,
      updatedAt: nowMs,
    };
    if (existing) {
      await ctx.db.patch(existing._id as any, fields);
    } else {
      await ctx.db.insert("communityFunnels", {
        communityId: args.communityId,
        ...fields,
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
    const userId = await requireManager({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject,
      communityId: args.communityId,
    });
    const existing = await getCommunityFunnelRow(ctx, args.communityId);
    const draftContent = normalizeCommunityFunnelContentV2(
      existing?.draftContentV2,
    );
    if (!existing || !draftContent) {
      throw new ConvexError({ code: "community_funnel_draft_missing" });
    }
    const currentRevision = normalizeRevision(existing.draftRevision);
    if (
      args.expectedDraftRevision !== normalizeRevision(args.expectedDraftRevision) ||
      args.expectedDraftRevision !== currentRevision
    ) {
      throw new ConvexError({
        code: "community_funnel_publish_conflict",
        expected_revision: args.expectedDraftRevision,
        current_revision: currentRevision,
      });
    }
    if (
      normalizeRevision(existing.publishedDraftRevision) === currentRevision &&
      sameContent(storedPublishedContent(existing), draftContent)
    ) {
      return buildCommunityFunnelManagerConfig(existing);
    }
    const nowMs = Date.now();
    await ctx.db.patch(existing._id as any, {
      // New publication remains private until the manager explicitly selects it.
      liveMode: existing.liveMode ?? "default",
      publishedContentV2: draftContent,
      publishedVslUrl: normalizeStoredVslUrl(existing.draftVslUrl),
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

export const setCommunityFunnelLiveMode = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    mode: v.union(v.literal("default"), v.literal("custom")),
    expectedPublishedDraftRevision: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireManager({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject,
      communityId: args.communityId,
    });
    const existing = await getCommunityFunnelRow(ctx, args.communityId);
    if (args.mode === "custom") {
      if (!existing || !storedPublishedContent(existing)) {
        throw new ConvexError({
          code: "community_funnel_activation_requires_published",
        });
      }
      const currentRevision = normalizeRevision(
        existing.publishedDraftRevision,
      );
      if (
        args.expectedPublishedDraftRevision !== currentRevision ||
        args.expectedPublishedDraftRevision !==
          normalizeRevision(args.expectedPublishedDraftRevision)
      ) {
        throw new ConvexError({
          code: "community_funnel_activation_conflict",
          expected_revision: args.expectedPublishedDraftRevision,
          current_revision: currentRevision,
        });
      }
    }
    if (!existing) {
      if (args.mode === "default") {
        return buildCommunityFunnelManagerConfig(null);
      }
      throw new ConvexError({
        code: "community_funnel_activation_requires_published",
      });
    }
    if (existing.liveMode !== args.mode) {
      await ctx.db.patch(existing._id as any, {
        liveMode: args.mode,
        updatedAt: Date.now(),
      });
    }
    return buildCommunityFunnelManagerConfig(
      await getCommunityFunnelRow(ctx, args.communityId),
    );
  },
});

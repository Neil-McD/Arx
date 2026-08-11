import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { ConvexError, v } from "convex/values";
import {
  isSupportedCommunityFunnelVideoUrl,
  normalizeCommunityCustomFunnelSlot,
  normalizeCommunityFunnelSlot,
  normalizeCommunityFunnelVslUrl,
  normalizeCommunityFunnelContentV2,
  normalizeCommunityFunnelDocumentV1,
  resolveCommunityFunnelDocumentVslUrl,
  validateCommunityFunnelContentV2,
  validateCommunityFunnelDocumentV1,
  withoutCommunityFunnelMediaSections,
} from "../shared/communityFunnel";
import type {
  CommunityCustomFunnelSlot,
  CommunityFunnelSlot,
} from "../shared/communityTypes";
import {
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";
import { communityFunnelContentV2Validator } from "./communityFunnelValidators";

type CommunityFunnelRowLike = {
  _id: unknown;
  communityId: unknown;
  slot?: CommunityCustomFunnelSlot | null;
  heroMediaUrl?: string | null;
  heroMediaKind?: "image" | "video" | null;
  draftVslUrl?: string | null;
  publishedVslUrl?: string | null;
  draftContentV2?: unknown;
  publishedContentV2?: unknown;
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

const communityCustomFunnelSlotValidator = v.union(
  v.literal("custom_1"),
  v.literal("custom_2"),
);

const communityFunnelActivationTargetValidator = v.union(
  v.object({ slot: v.literal("default") }),
  v.object({
    slot: communityCustomFunnelSlotValidator,
    expectedPublishedDraftRevision: v.number(),
  }),
);

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
    published_content_v2: normalizeCommunityFunnelContentV2(
      row?.publishedContentV2,
    ),
    published_document_v1: normalizeCommunityFunnelDocumentV1(
      row?.publishedDocumentV1,
    ),
  };
}

function buildCommunityFunnelVariantConfig(
  row: CommunityFunnelRowLike | null,
  slot: CommunityCustomFunnelSlot,
) {
  if (!row) return null;
  return {
    slot,
    draft_vsl_url: resolveDraftVslUrl(row),
    draft_content_v2: normalizeCommunityFunnelContentV2(row.draftContentV2),
    draft_document_v1: normalizeCommunityFunnelDocumentV1(
      row.draftDocumentV1,
    ),
    draft_revision: Math.max(0, Math.floor(Number(row.draftRevision ?? 0))),
    draft_updated_at: row.draftUpdatedAt ?? null,
    published_vsl_url: resolvePublishedVslUrl(row),
    published_content_v2: normalizeCommunityFunnelContentV2(
      row.publishedContentV2,
    ),
    published_document_v1: normalizeCommunityFunnelDocumentV1(
      row.publishedDocumentV1,
    ),
    published_draft_revision: Math.max(
      0,
      Math.floor(Number(row.publishedDraftRevision ?? 0)),
    ),
    published_at: row.publishedAt ?? null,
  };
}

function buildLegacyManagerProjection(row: CommunityFunnelRowLike | null) {
  return {
    hero_media_url: normalizeTrimmedString(row?.heroMediaUrl, 2_000),
    hero_media_kind: normalizeHeroMediaKind(row?.heroMediaKind),
    published_vsl_url: resolvePublishedVslUrl(row),
    published_content_v2: normalizeCommunityFunnelContentV2(
      row?.publishedContentV2,
    ),
    published_document_v1: normalizeCommunityFunnelDocumentV1(
      row?.publishedDocumentV1,
    ),
    draft_content_v2: normalizeCommunityFunnelContentV2(row?.draftContentV2),
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

function buildCommunityFunnelManagerConfig(params: {
  rows: Record<CommunityCustomFunnelSlot, CommunityFunnelRowLike | null>;
  activeSlot: CommunityFunnelSlot;
}) {
  const customOne = params.rows.custom_1;
  return {
    ...buildLegacyManagerProjection(customOne),
    active_slot: params.activeSlot,
    custom_funnels: {
      custom_1: buildCommunityFunnelVariantConfig(customOne, "custom_1"),
      custom_2: buildCommunityFunnelVariantConfig(
        params.rows.custom_2,
        "custom_2",
      ),
    },
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

function resolveCommunityFunnelRowSlot(
  row: CommunityFunnelRowLike,
): CommunityCustomFunnelSlot {
  return normalizeCommunityCustomFunnelSlot(row.slot);
}

async function getCommunityFunnelRows(
  ctx: any,
  communityId: any,
): Promise<Record<CommunityCustomFunnelSlot, CommunityFunnelRowLike | null>> {
  const rows = (await ctx.db
    .query("communityFunnels" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .collect()) as CommunityFunnelRowLike[];
  const indexed: Record<
    CommunityCustomFunnelSlot,
    CommunityFunnelRowLike | null
  > = {
    custom_1: null,
    custom_2: null,
  };
  for (const row of rows) {
    const slot = resolveCommunityFunnelRowSlot(row);
    if (indexed[slot]) {
      throw new ConvexError({
        code: "community_funnel_slot_duplicate",
        slot,
      });
    }
    indexed[slot] = row;
  }
  return indexed;
}

async function getCommunityFunnelRow(
  ctx: any,
  communityId: any,
  slot: CommunityCustomFunnelSlot = "custom_1",
): Promise<CommunityFunnelRowLike | null> {
  return (await getCommunityFunnelRows(ctx, communityId))[slot];
}

function rowHasPublishedFunnel(row: CommunityFunnelRowLike | null): boolean {
  return Boolean(normalizeCommunityFunnelContentV2(row?.publishedContentV2));
}

function resolveActiveCommunityFunnelSlot(params: {
  storedSlot: unknown;
  rows: Record<CommunityCustomFunnelSlot, CommunityFunnelRowLike | null>;
}): CommunityFunnelSlot {
  const hasStoredSlot =
    params.storedSlot === "default" ||
    params.storedSlot === "custom_1" ||
    params.storedSlot === "custom_2";
  if (hasStoredSlot) {
    const slot = normalizeCommunityFunnelSlot(params.storedSlot);
    if (slot === "default") return slot;
    return rowHasPublishedFunnel(params.rows[slot]) ? slot : "default";
  }
  // Before activeFunnelSlot existed, any published singleton row was live.
  return rowHasPublishedFunnel(params.rows.custom_1) ? "custom_1" : "default";
}

async function resolveCommunityFunnelAuthorityState(ctx: any, communityId: any) {
  const [community, rows] = await Promise.all([
    ctx.db.get(communityId),
    getCommunityFunnelRows(ctx, communityId),
  ]);
  return {
    community,
    rows,
    activeSlot: resolveActiveCommunityFunnelSlot({
      storedSlot: community?.activeFunnelSlot,
      rows,
    }),
  };
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
      !existing.draftContentV2 &&
      !existing.publishedContentV2 &&
      !existing.draftDocumentV1 &&
      !existing.publishedDocumentV1 &&
      !resolveDraftVslUrl(existing) &&
      !resolvePublishedVslUrl(existing)
    ) {
      await ctx.db.delete(existing._id as any);
    } else if (existing) {
      await ctx.db.patch(existing._id as any, {
        slot: "custom_1",
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
    slot: "custom_1" as const,
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
  const state = await resolveCommunityFunnelAuthorityState(ctx, communityId);
  return state.activeSlot === "default"
    ? buildCommunityFunnelConfig(null)
    : buildCommunityFunnelConfig(state.rows[state.activeSlot]);
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
    const { community } = await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const rows = await getCommunityFunnelRows(ctx, args.communityId);
    return buildCommunityFunnelManagerConfig({
      rows,
      activeSlot: resolveActiveCommunityFunnelSlot({
        storedSlot: community.activeFunnelSlot,
        rows,
      }),
    });
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
    const rows = await getCommunityFunnelRows(ctx, community._id);
    return buildCommunityFunnelManagerConfig({
      rows,
      activeSlot: resolveActiveCommunityFunnelSlot({
        storedSlot: community.activeFunnelSlot,
        rows,
      }),
    });
  },
});

export const getCommunityFunnelDraftInternal = internalQuery({
  args: {
    communityId: v.id("communities"),
    slot: v.optional(communityCustomFunnelSlotValidator),
  },
  handler: async (ctx, args) => {
    const state = await resolveCommunityFunnelAuthorityState(
      ctx,
      args.communityId,
    );
    const requestedSlot = normalizeCommunityCustomFunnelSlot(args.slot);
    const requested = buildCommunityFunnelVariantConfig(
      state.rows[requestedSlot],
      requestedSlot,
    );
    return {
      ...buildCommunityFunnelManagerConfig({
        rows: state.rows,
        activeSlot: state.activeSlot,
      }),
      selected_slot: requestedSlot,
      selected_funnel: requested,
    };
  },
});

async function saveCommunityFunnelDraftForManager(args: {
  ctx: any;
  userId: any;
  communityId: any;
  slot: CommunityCustomFunnelSlot;
  expectedDraftRevision: number;
  content: unknown;
}) {
  const { community } = await requireCommunityManager({
    ctx: args.ctx,
    communityId: args.communityId,
    userId: args.userId,
  });
  const existing = await getCommunityFunnelRow(
    args.ctx,
    args.communityId,
    args.slot,
  );
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
  const draftContentV2 = validateCommunityFunnelContentV2(args.content);
  const draftFields = {
    slot: args.slot,
    draftContentV2,
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
  const rows = await getCommunityFunnelRows(args.ctx, args.communityId);
  return buildCommunityFunnelManagerConfig({
    rows,
    activeSlot: resolveActiveCommunityFunnelSlot({
      storedSlot: community.activeFunnelSlot,
      rows,
    }),
  });
}

export const saveCommunityFunnelDraftInternal = internalMutation({
  args: {
    userId: v.id("users"),
    communityId: v.id("communities"),
    slot: v.optional(communityCustomFunnelSlotValidator),
    expectedDraftRevision: v.number(),
    content: communityFunnelContentV2Validator,
  },
  handler: async (ctx, args) => {
    const slot = normalizeCommunityCustomFunnelSlot(args.slot);
    const managerConfig = await saveCommunityFunnelDraftForManager({
      ctx,
      userId: args.userId,
      communityId: args.communityId,
      slot,
      expectedDraftRevision: args.expectedDraftRevision,
      content: args.content,
    });
    return {
      ...managerConfig,
      selected_slot: slot,
      selected_funnel: managerConfig.custom_funnels[slot],
    };
  },
});

export const setCommunityFunnelDraftVsl = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    slot: v.optional(communityCustomFunnelSlotValidator),
    expectedDraftRevision: v.number(),
    url: v.union(v.string(), v.null()),
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
    const slot = normalizeCommunityCustomFunnelSlot(args.slot);
    const existing = await getCommunityFunnelRow(ctx, args.communityId, slot);
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
      const rows = await getCommunityFunnelRows(ctx, args.communityId);
      return buildCommunityFunnelManagerConfig({
        rows,
        activeSlot: resolveActiveCommunityFunnelSlot({
          storedSlot: community.activeFunnelSlot,
          rows,
        }),
      });
    }
    const nowMs = Date.now();
    const nextFields = {
      slot,
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
    const rows = await getCommunityFunnelRows(ctx, args.communityId);
    return buildCommunityFunnelManagerConfig({
      rows,
      activeSlot: resolveActiveCommunityFunnelSlot({
        storedSlot: community.activeFunnelSlot,
        rows,
      }),
    });
  },
});

export const publishCommunityFunnelDraft = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    slot: v.optional(communityCustomFunnelSlotValidator),
    expectedDraftRevision: v.number(),
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
    const legacySingletonPublish = args.slot === undefined;
    const slot = normalizeCommunityCustomFunnelSlot(args.slot);
    const existing = await getCommunityFunnelRow(ctx, args.communityId, slot);
    if (!existing?.draftContentV2) {
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
    const draftContentV2 = validateCommunityFunnelContentV2(
      existing.draftContentV2,
    );
    if (
      existing.publishedContentV2 &&
      Math.floor(Number(existing.publishedDraftRevision ?? 0)) ===
        currentRevision
    ) {
      if (legacySingletonPublish && community.activeFunnelSlot !== slot) {
        await ctx.db.patch(community._id, {
          activeFunnelSlot: slot,
          updatedAt: Date.now(),
        });
      }
      const rows = await getCommunityFunnelRows(ctx, args.communityId);
      return buildCommunityFunnelManagerConfig({
        rows,
        activeSlot: legacySingletonPublish
          ? slot
          : resolveActiveCommunityFunnelSlot({
              storedSlot: community.activeFunnelSlot,
              rows,
            }),
      });
    }
    const nowMs = Date.now();
    await ctx.db.patch(existing._id as any, {
      publishedContentV2: draftContentV2,
      ...(existing.draftDocumentV1
        ? {
            publishedDocumentV1: withoutCommunityFunnelMediaSections(
              validateCommunityFunnelDocumentV1(existing.draftDocumentV1),
            ),
          }
        : {}),
      publishedVslUrl: resolveDraftVslUrl(existing),
      publishedDraftRevision: currentRevision,
      publishedAt: nowMs,
      publishedByUserId: userId,
      updatedAt: nowMs,
    });
    if (legacySingletonPublish && community.activeFunnelSlot !== slot) {
      await ctx.db.patch(community._id, {
        activeFunnelSlot: slot,
        updatedAt: nowMs,
      });
    }
    const rows = await getCommunityFunnelRows(ctx, args.communityId);
    return buildCommunityFunnelManagerConfig({
      rows,
      activeSlot: legacySingletonPublish
        ? slot
        : resolveActiveCommunityFunnelSlot({
            storedSlot: community.activeFunnelSlot,
            rows,
          }),
    });
  },
});

export const setActiveCommunityFunnel = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    target: communityFunnelActivationTargetValidator,
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
    const slot = normalizeCommunityFunnelSlot(args.target.slot);
    const rows = await getCommunityFunnelRows(ctx, args.communityId);
    if (slot !== "default" && !rowHasPublishedFunnel(rows[slot])) {
      throw new ConvexError({
        code: "community_funnel_activation_requires_published",
        slot,
      });
    }
    if (args.target.slot !== "default") {
      const currentPublishedRevision = Math.max(
        0,
        Math.floor(
          Number(rows[args.target.slot]?.publishedDraftRevision ?? 0),
        ),
      );
      const expectedPublishedRevision =
        args.target.expectedPublishedDraftRevision;
      if (
        !Number.isSafeInteger(expectedPublishedRevision) ||
        expectedPublishedRevision < 0 ||
        expectedPublishedRevision !== currentPublishedRevision
      ) {
        throw new ConvexError({
          code: "community_funnel_activation_conflict",
          slot,
          expected_revision: expectedPublishedRevision,
          current_revision: currentPublishedRevision,
        });
      }
    }
    if (community.activeFunnelSlot !== slot) {
      await ctx.db.patch(community._id, {
        activeFunnelSlot: slot,
        updatedAt: Date.now(),
      });
    }
    return buildCommunityFunnelManagerConfig({
      rows,
      activeSlot: slot,
    });
  },
});

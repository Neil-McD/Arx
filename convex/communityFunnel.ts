import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import {
  isSupportedCommunityFunnelVideoUrl,
  normalizeCommunityCustomFunnelSlot,
  normalizeCommunityFunnelSlot,
  normalizeCommunityFunnelVslUrl as normalizeSharedCommunityFunnelVslUrl,
  normalizeCommunityFunnelContentV2,
  validateCommunityFunnelContentV2,
} from "../shared/communityFunnel";
import type {
  CommunityCustomFunnelSlot,
  CommunityFunnelContentV2,
  CommunityFunnelSlot,
} from "../shared/communityTypes";
import {
  normalizeSlug,
  requireActiveCommunity,
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
  type CommunityLike,
} from "./communityCore";
import { communityFunnelContentV2Validator } from "./communityFunnelValidators";
import {
  normalizeCommunityExternalFunnelUrl,
  readCommunityExternalFunnelUrl,
} from "../shared/communityExternalFunnel";

type CommunityFunnelRowLike = {
  _id: unknown;
  communityId: unknown;
  slot?: CommunityCustomFunnelSlot | null;
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

function rowHasPublishedFunnel(row: CommunityFunnelRowLike | null) {
  return Boolean(storedPublishedContent(row));
}

/** Public projection: private draft state and inactive snapshots never escape. */
export function buildCommunityFunnelPublicConfig(
  row: CommunityFunnelRowLike | null,
  activeSlot: CommunityFunnelSlot = "default",
) {
  return {
    hero_media_url: normalizeTrimmedString(row?.heroMediaUrl, 2_000),
    hero_media_kind: normalizeHeroMediaKind(row?.heroMediaKind),
    active_slot: activeSlot,
    published_vsl_url:
      activeSlot !== "default" ? normalizeStoredVslUrl(row?.publishedVslUrl) : null,
    published_content_v2:
      activeSlot !== "default" ? storedPublishedContent(row) : null,
  };
}

function buildCommunityFunnelVariantConfig(
  row: CommunityFunnelRowLike | null,
  slot: CommunityCustomFunnelSlot,
) {
  if (!row) return null;
  return {
    slot,
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

/** Manager projection: both private custom slots remain visible to managers. */
export function buildCommunityFunnelManagerConfig(params: {
  rows: Record<CommunityCustomFunnelSlot, CommunityFunnelRowLike | null>;
  activeSlot: CommunityFunnelSlot;
  community?: CommunityLike | null;
}) {
  const activeRow = params.activeSlot === "default" ? null : params.rows[params.activeSlot];
  return {
    ...buildCommunityFunnelPublicConfig(activeRow, params.activeSlot),
    external_funnel_url: readCommunityExternalFunnelUrl(params.community?.externalFunnelUrl),
    external_funnel_active: params.community?.externalFunnelActive === true && Boolean(readCommunityExternalFunnelUrl(params.community?.externalFunnelUrl)),
    settings_revision: normalizeRevision(params.community?.settingsRevision),
    custom_funnels: {
      custom_1: buildCommunityFunnelVariantConfig(params.rows.custom_1, "custom_1"),
      custom_2: buildCommunityFunnelVariantConfig(params.rows.custom_2, "custom_2"),
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
  const indexed: Record<CommunityCustomFunnelSlot, CommunityFunnelRowLike | null> = {
    custom_1: null,
    custom_2: null,
  };
  for (const row of rows) {
    const slot = resolveCommunityFunnelRowSlot(row);
    if (indexed[slot]) {
      throw new ConvexError({ code: "community_funnel_slot_duplicate", slot });
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
  // A legacy singleton custom row was live unless it explicitly selected default.
  const legacy = params.rows.custom_1;
  return legacy?.liveMode !== "default" && rowHasPublishedFunnel(legacy)
    ? "custom_1"
    : "default";
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
  const state = await resolveCommunityFunnelAuthorityState(ctx, communityId);
  return state.activeSlot === "default"
    ? buildCommunityFunnelPublicConfig(null, "default")
    : buildCommunityFunnelPublicConfig(
        state.rows[state.activeSlot],
        state.activeSlot,
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
    const state = await resolveCommunityFunnelAuthorityState(ctx, args.communityId);
    return buildCommunityFunnelManagerConfig(state);
  },
});

export const setCommunityExternalFunnelUrl = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    expectedSettingsRevision: v.number(),
    url: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    await requireManager({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject,
      communityId: args.communityId,
    });
    const community = (await ctx.db.get(args.communityId)) as CommunityLike | null;
    if (!community) throw new ConvexError({ code: "community_not_found" });
    const revision = normalizeRevision(community.settingsRevision);
    if (!Number.isSafeInteger(args.expectedSettingsRevision) || args.expectedSettingsRevision !== revision) {
      throw new ConvexError({ code: "community_settings_conflict" });
    }
    const url = normalizeCommunityExternalFunnelUrl(args.url);
    if (url !== readCommunityExternalFunnelUrl(community.externalFunnelUrl)) {
      await ctx.db.patch(args.communityId, {
        externalFunnelUrl: url ?? undefined,
        externalFunnelActive: false,
        settingsRevision: revision + 1,
        updatedAt: Date.now(),
      });
    }
    const state = await resolveCommunityFunnelAuthorityState(ctx, args.communityId);
    return buildCommunityFunnelManagerConfig(state);
  },
});

export const setCommunityExternalFunnelActive = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    expectedSettingsRevision: v.number(),
    expectedUrl: v.string(),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireManager({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject,
      communityId: args.communityId,
    });
    const community = (await ctx.db.get(args.communityId)) as CommunityLike | null;
    if (!community) throw new ConvexError({ code: "community_not_found" });
    const revision = normalizeRevision(community.settingsRevision);
    if (!Number.isSafeInteger(args.expectedSettingsRevision) || args.expectedSettingsRevision !== revision) {
      throw new ConvexError({ code: "community_settings_conflict" });
    }
    const savedUrl = readCommunityExternalFunnelUrl(community.externalFunnelUrl);
    if (!savedUrl || args.expectedUrl !== savedUrl) {
      throw new ConvexError({ code: "community_external_funnel_url_changed" });
    }
    if ((community.externalFunnelActive === true) !== args.active) {
      await ctx.db.patch(args.communityId, {
        externalFunnelActive: args.active,
        settingsRevision: revision + 1,
        updatedAt: Date.now(),
      });
    }
    const state = await resolveCommunityFunnelAuthorityState(ctx, args.communityId);
    return buildCommunityFunnelManagerConfig(state);
  },
});

/**
 * Manager-only projection used by the isolated public-shape draft preview.
 *
 * The preview route is slug-addressed, but private draft state remains bound
 * to the canonical community id and the existing manager authorization gate.
 */
export const getCommunityFunnelDraftPreview = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const slug = normalizeSlug(args.slug);
    const community = (await ctx.db
      .query("communities")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first()) as CommunityLike | null;
    if (!community) throw new ConvexError({ code: "community_not_found" });
    requireActiveCommunity(community);
    await requireManager({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject,
      communityId: community._id,
    });
    const state = await resolveCommunityFunnelAuthorityState(ctx, community._id);
    return buildCommunityFunnelManagerConfig(state);
  },
});

export const getCommunityFunnelDraftInternal = internalQuery({
  args: {
    communityId: v.id("communities"),
    slot: v.optional(communityCustomFunnelSlotValidator),
  },
  handler: async (ctx, args) => {
    const state = await resolveCommunityFunnelAuthorityState(ctx, args.communityId);
    const slot = normalizeCommunityCustomFunnelSlot(args.slot);
    return {
      ...buildCommunityFunnelManagerConfig(state),
      selected_slot: slot,
      selected_funnel: buildCommunityFunnelVariantConfig(state.rows[slot], slot),
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
  await requireCommunityManager({
    ctx: args.ctx,
    communityId: args.communityId,
    userId: args.userId,
  });
  const content = validateCommunityFunnelContentV2(args.content);
  const existing = await getCommunityFunnelRow(args.ctx, args.communityId, args.slot);
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
    slot: args.slot,
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
  const state = await resolveCommunityFunnelAuthorityState(args.ctx, args.communityId);
  return buildCommunityFunnelManagerConfig(state);
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
    const manager = await saveCommunityFunnelDraftForManager({
      ctx,
      userId: args.userId,
      communityId: args.communityId,
      slot,
      expectedDraftRevision: args.expectedDraftRevision,
      content: args.content,
    });
    return { ...manager, selected_slot: slot, selected_funnel: manager.custom_funnels[slot] };
  },
});

export const saveCommunityFunnelDraft = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    slot: v.optional(communityCustomFunnelSlotValidator),
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
    const slot = normalizeCommunityCustomFunnelSlot(args.slot);
    const existing = await getCommunityFunnelRow(ctx, args.communityId, slot);
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
        const state = await resolveCommunityFunnelAuthorityState(ctx, args.communityId);
        return buildCommunityFunnelManagerConfig(state);
      }
      throw new ConvexError({
        code: "community_funnel_draft_conflict",
        expected_revision: expectedRevision,
        current_revision: currentRevision,
      });
    }
    const nowMs = Date.now();
    const fields = {
      slot,
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
    const state = await resolveCommunityFunnelAuthorityState(ctx, args.communityId);
    return buildCommunityFunnelManagerConfig(state);
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
    const userId = await requireManager({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject,
      communityId: args.communityId,
    });
    const slot = normalizeCommunityCustomFunnelSlot(args.slot);
    const existing = await getCommunityFunnelRow(ctx, args.communityId, slot);
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
      const state = await resolveCommunityFunnelAuthorityState(ctx, args.communityId);
      return buildCommunityFunnelManagerConfig(state);
    }
    const nowMs = Date.now();
    const fields = {
      slot,
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
    const state = await resolveCommunityFunnelAuthorityState(ctx, args.communityId);
    return buildCommunityFunnelManagerConfig(state);
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
    const userId = await requireManager({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject,
      communityId: args.communityId,
    });
    const slot = normalizeCommunityCustomFunnelSlot(args.slot);
    const existing = await getCommunityFunnelRow(ctx, args.communityId, slot);
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
      const state = await resolveCommunityFunnelAuthorityState(ctx, args.communityId);
      return buildCommunityFunnelManagerConfig(state);
    }
    const nowMs = Date.now();
    await ctx.db.patch(existing._id as any, {
      publishedContentV2: draftContent,
      publishedVslUrl: normalizeStoredVslUrl(existing.draftVslUrl),
      publishedDraftRevision: currentRevision,
      publishedAt: nowMs,
      publishedByUserId: userId,
      updatedAt: nowMs,
    });
    const state = await resolveCommunityFunnelAuthorityState(ctx, args.communityId);
    return buildCommunityFunnelManagerConfig(state);
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
    await requireManager({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject,
      communityId: args.communityId,
    });
    const state = await resolveCommunityFunnelAuthorityState(ctx, args.communityId);
    const target = args.target;
    const slot = normalizeCommunityFunnelSlot(target.slot);
    if (target.slot !== "default") {
      const existing = state.rows[target.slot];
      if (!existing || !storedPublishedContent(existing)) {
        throw new ConvexError({
          code: "community_funnel_activation_requires_published",
          slot,
        });
      }
      const currentRevision = normalizeRevision(existing.publishedDraftRevision);
      if (
        target.expectedPublishedDraftRevision !== currentRevision ||
        target.expectedPublishedDraftRevision !==
          normalizeRevision(target.expectedPublishedDraftRevision)
      ) {
        throw new ConvexError({
          code: "community_funnel_activation_conflict",
          slot,
          expected_revision: target.expectedPublishedDraftRevision,
          current_revision: currentRevision,
        });
      }
    }
    if (state.community?.activeFunnelSlot !== slot) {
      await ctx.db.patch(args.communityId, {
        activeFunnelSlot: slot,
        updatedAt: Date.now(),
      });
    }
    return buildCommunityFunnelManagerConfig({ ...state, activeSlot: slot });
  },
});

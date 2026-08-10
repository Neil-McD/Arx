import { internalMutation, internalQuery, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import {
  isSupportedCommunityFunnelVideoUrl,
  normalizeCommunityFunnelDocumentV1,
  validateCommunityFunnelDocumentV1,
} from "../shared/communityFunnel";
import {
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";

type CommunityFunnelRowLike = {
  _id: unknown;
  communityId: unknown;
  heroMediaUrl?: string | null;
  heroMediaKind?: "image" | "video" | null;
  draftDocumentV1?: unknown;
  draftRevision?: number | null;
  draftUpdatedAt?: number | null;
  draftUpdatedByUserId?: unknown;
  createdAt: number;
  updatedAt: number;
};

const funnelThemeValidator = v.object({
  appearance: v.union(v.literal("light"), v.literal("dark")),
  character: v.union(
    v.literal("minimal"),
    v.literal("editorial"),
    v.literal("cinematic"),
  ),
  accent: v.union(
    v.literal("blue"),
    v.literal("violet"),
    v.literal("rose"),
    v.literal("amber"),
    v.literal("emerald"),
  ),
  density: v.union(
    v.literal("compact"),
    v.literal("balanced"),
    v.literal("airy"),
  ),
  radius: v.union(v.literal("subtle"), v.literal("soft")),
});
const funnelSectionValidator = v.union(
  v.object({
    id: v.string(),
    type: v.literal("hero"),
    eyebrow: v.union(v.string(), v.null()),
    headline: v.string(),
    body: v.string(),
    alignment: v.union(v.literal("left"), v.literal("center")),
  }),
  v.object({
    id: v.string(),
    type: v.literal("media"),
    media_url: v.union(v.string(), v.null()),
    caption: v.union(v.string(), v.null()),
  }),
  v.object({
    id: v.string(),
    type: v.literal("benefits"),
    heading: v.union(v.string(), v.null()),
    items: v.array(v.object({ title: v.string(), body: v.string() })),
  }),
  v.object({
    id: v.string(),
    type: v.literal("social_proof"),
    headline: v.union(v.string(), v.null()),
    body: v.union(v.string(), v.null()),
  }),
  v.object({
    id: v.string(),
    type: v.literal("testimonial"),
    quote: v.string(),
    attribution: v.string(),
  }),
  v.object({
    id: v.string(),
    type: v.literal("faq"),
    heading: v.union(v.string(), v.null()),
    items: v.array(v.object({ question: v.string(), answer: v.string() })),
  }),
  v.object({
    id: v.string(),
    type: v.literal("cta"),
    headline: v.string(),
    body: v.union(v.string(), v.null()),
  }),
);
const funnelDocumentV1Validator = v.object({
  version: v.literal(1),
  theme: funnelThemeValidator,
  sections: v.array(funnelSectionValidator),
});

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

async function buildCommunityFunnelConfig(
  ctx: any,
  communityId: any,
  row: CommunityFunnelRowLike | null,
) {
  return {
    hero_media_url: normalizeTrimmedString(row?.heroMediaUrl, 2_000),
    hero_media_kind: normalizeHeroMediaKind(row?.heroMediaKind),
  };
}

function buildCommunityFunnelManagerConfig(row: CommunityFunnelRowLike | null) {
  return {
    hero_media_url: normalizeTrimmedString(row?.heroMediaUrl, 2_000),
    hero_media_kind: normalizeHeroMediaKind(row?.heroMediaKind),
    draft_document_v1: normalizeCommunityFunnelDocumentV1(
      row?.draftDocumentV1,
    ),
    draft_revision: Math.max(0, Math.floor(Number(row?.draftRevision ?? 0))),
    draft_updated_at: row?.draftUpdatedAt ?? null,
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
    if (existing && !existing.draftDocumentV1) {
      await ctx.db.delete(existing._id as any);
    } else if (existing) {
      await ctx.db.patch(existing._id as any, {
        heroMediaUrl: undefined,
        heroMediaKind: undefined,
        updatedAt: nowMs,
      });
    }
    return await buildCommunityFunnelConfig(ctx, communityId, null);
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
  return await buildCommunityFunnelConfig(ctx, communityId, saved);
}

export async function resolveCommunityFunnelConfigByCommunityId(
  ctx: any,
  communityId: any,
) {
  const row = await getCommunityFunnelRow(ctx, communityId);
  return await buildCommunityFunnelConfig(ctx, communityId, row);
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
  const draftFields = {
    draftDocumentV1,
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
    document: funnelDocumentV1Validator,
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

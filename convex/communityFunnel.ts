import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import {
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";

type CommunityFunnelRowLike = {
  _id: unknown;
  communityId: unknown;
  heroMediaUrl?: string | null;
  heroMediaKind?: "image" | "video" | null;
  draftDocumentV1?: CommunityFunnelDocumentV1Like | null;
  draftRevision?: number | null;
  draftUpdatedAt?: number | null;
  draftUpdatedByUserId?: unknown;
  createdAt: number;
  updatedAt: number;
};

type CommunityFunnelDocumentV1Like = {
  version: 1;
  template: "editorial_vsl";
  headline: string;
  subheadline: string;
  intro_video_url: string | null;
  pillars: Array<{ title: string; body: string }>;
  founder_quote: string | null;
  faq: Array<{ question: string; answer: string }>;
};

const funnelPillarValidator = v.object({ title: v.string(), body: v.string() });
const funnelFaqValidator = v.object({ question: v.string(), answer: v.string() });
const funnelDocumentV1Validator = v.object({
  version: v.literal(1),
  template: v.literal("editorial_vsl"),
  headline: v.string(),
  subheadline: v.string(),
  intro_video_url: v.union(v.string(), v.null()),
  pillars: v.array(funnelPillarValidator),
  founder_quote: v.union(v.string(), v.null()),
  faq: v.array(funnelFaqValidator),
});

function normalizeTrimmedString(raw: unknown, maxLength: number): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;
  return value.slice(0, maxLength);
}

function normalizeHeroMediaKind(raw: unknown): "image" | "video" {
  return raw === "video" ? "video" : "image";
}

function normalizeExternalUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed);
  } catch {
    try {
      return new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }
}

function isSupportedCommunityFunnelVideoUrl(raw: string | null): boolean {
  if (!raw) return false;
  const url = normalizeExternalUrl(raw);
  if (!url) return false;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "youtu.be" && parts[0]) return true;
  if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
    if (url.pathname === "/watch" && url.searchParams.get("v")) return true;
    if (
      (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live" || parts[0] === "v") &&
      parts[1]
    ) {
      return true;
    }
  }

  if (host.includes("vimeo.com")) {
    return parts.some((part) => /^\d{6,}$/.test(part));
  }

  if ((host === "loom.com" || host === "www.loom.com") && (parts[0] === "share" || parts[0] === "embed") && parts[1]) {
    return true;
  }

  if (host.includes("wistia.com") || host.includes("wistia.net")) {
    if (url.searchParams.get("wvideo")) return true;
    return parts.some((part, index) => (part === "medias" || part === "iframe") && Boolean(parts[index + 1]));
  }

  return false;
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

function normalizeBoundedText(raw: unknown, maxLength: number): string {
  return typeof raw === "string" ? raw.trim().slice(0, maxLength) : "";
}

function normalizeFunnelDocumentV1(raw: CommunityFunnelDocumentV1Like): CommunityFunnelDocumentV1Like {
  if (raw.version !== 1 || raw.template !== "editorial_vsl") {
    throw new Error("community_funnel_draft_invalid_version");
  }
  if (!Array.isArray(raw.pillars) || raw.pillars.length !== 3) {
    throw new Error("community_funnel_draft_requires_three_pillars");
  }
  if (!Array.isArray(raw.faq) || raw.faq.length > 3) {
    throw new Error("community_funnel_draft_faq_limit_exceeded");
  }
  const introVideoUrl = normalizeTrimmedString(raw.intro_video_url, 2_000);
  if (introVideoUrl && !isSupportedCommunityFunnelVideoUrl(introVideoUrl)) {
    throw new Error("Only YouTube, Vimeo, Loom, and Wistia links are supported for funnel media.");
  }
  return {
    version: 1,
    template: "editorial_vsl",
    headline: normalizeBoundedText(raw.headline, 160),
    subheadline: normalizeBoundedText(raw.subheadline, 360),
    intro_video_url: introVideoUrl,
    pillars: raw.pillars.map((pillar) => ({
      title: normalizeBoundedText(pillar.title, 80),
      body: normalizeBoundedText(pillar.body, 280),
    })),
    founder_quote: normalizeTrimmedString(raw.founder_quote, 1_200),
    faq: raw.faq.map((item) => ({
      question: normalizeBoundedText(item.question, 160),
      answer: normalizeBoundedText(item.answer, 1_200),
    })),
  };
}

function buildCommunityFunnelManagerConfig(row: CommunityFunnelRowLike | null) {
  return {
    hero_media_url: normalizeTrimmedString(row?.heroMediaUrl, 2_000),
    hero_media_kind: normalizeHeroMediaKind(row?.heroMediaKind),
    draft_document_v1: row?.draftDocumentV1 ?? null,
    draft_revision: Math.max(0, Math.floor(Number(row?.draftRevision ?? 0))),
    draft_updated_at: row?.draftUpdatedAt ?? null,
  };
}

export function normalizeCommunityFunnelConfigInput(raw: unknown) {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const heroMediaKind = normalizeHeroMediaKind(value.hero_media_kind);
  const heroMediaUrl = normalizeTrimmedString(value.hero_media_url, 2_000);
  if (heroMediaUrl && heroMediaKind === "video" && !isSupportedCommunityFunnelVideoUrl(heroMediaUrl)) {
    throw new Error("Only YouTube, Vimeo, Loom, and Wistia links are supported for funnel media.");
  }
  return {
    hero_media_url: heroMediaUrl,
    hero_media_kind: heroMediaKind,
  };
}

async function getCommunityFunnelRow(ctx: any, communityId: any): Promise<CommunityFunnelRowLike | null> {
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

export async function resolveCommunityFunnelConfigByCommunityId(ctx: any, communityId: any) {
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
    return buildCommunityFunnelManagerConfig(await getCommunityFunnelRow(ctx, community._id));
  },
});

export const saveCommunityFunnelDraft = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    expectedDraftRevision: v.number(),
    document: funnelDocumentV1Validator,
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    await requireCommunityManager({ ctx, communityId: args.communityId, userId });
    const existing = await getCommunityFunnelRow(ctx, args.communityId);
    const currentRevision = Math.max(0, Math.floor(Number(existing?.draftRevision ?? 0)));
    if (Math.floor(args.expectedDraftRevision) !== currentRevision) {
      throw new ConvexError({
        code: "community_funnel_draft_conflict",
        expected_revision: args.expectedDraftRevision,
        current_revision: currentRevision,
      });
    }
    const nowMs = Date.now();
    const nextRevision = currentRevision + 1;
    const draftDocumentV1 = normalizeFunnelDocumentV1(args.document);
    const draftFields = {
      draftDocumentV1,
      draftRevision: nextRevision,
      draftUpdatedAt: nowMs,
      draftUpdatedByUserId: userId,
      updatedAt: nowMs,
    };
    if (existing) {
      await ctx.db.patch(existing._id as any, draftFields);
    } else {
      await ctx.db.insert("communityFunnels", {
        communityId: args.communityId,
        ...draftFields,
        createdAt: nowMs,
      });
    }
    return buildCommunityFunnelManagerConfig(await getCommunityFunnelRow(ctx, args.communityId));
  },
});

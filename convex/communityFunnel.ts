import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  normalizeOptionalText,
  maybeDeleteStorageAsset,
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
  toIsoString,
  type CommunityLike,
} from "./communityCore";

type CommunityFunnelRowLike = {
  _id: unknown;
  communityId: unknown;
  heroMediaUrl?: string | null;
  heroMediaStorageId?: unknown;
  heroMediaKind?: "image" | "video" | null;
  about?: string | null;
  createdAt: number;
  updatedAt: number;
};

async function maybeResolveStorageUrl(ctx: any, storageId: any): Promise<string | null> {
  if (!storageId) return null;
  const resolved = await ctx.storage.getUrl(storageId);
  return typeof resolved === "string" && resolved.trim() ? resolved.trim() : null;
}

function normalizeTrimmedString(raw: unknown, maxLength: number): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;
  return value.slice(0, maxLength);
}

function normalizeHeroMediaKind(raw: unknown): "image" | "video" {
  return raw === "video" ? "video" : "image";
}

async function mapCommunityFunnelRow(ctx: any, row: CommunityFunnelRowLike | null) {
  if (!row) return null;
  const resolvedHeroMediaUrl = row.heroMediaStorageId
    ? await maybeResolveStorageUrl(ctx, row.heroMediaStorageId)
    : null;
  return {
    hero_media_url: resolvedHeroMediaUrl ?? normalizeTrimmedString(row.heroMediaUrl, 2_000),
    hero_media_storage_id: row.heroMediaStorageId ? String(row.heroMediaStorageId) : null,
    hero_media_kind: normalizeHeroMediaKind(row.heroMediaKind),
    about: normalizeTrimmedString(row.about, 8_000),
  };
}

function normalizeCommunityFunnelConfigInput(raw: unknown) {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    hero_media_url: normalizeTrimmedString(value.hero_media_url, 2_000),
    hero_media_storage_id: normalizeTrimmedString(value.hero_media_storage_id, 256),
    hero_media_kind: normalizeHeroMediaKind(value.hero_media_kind),
    about: normalizeTrimmedString(value.about, 8_000),
  };
}

async function getCommunityFunnelRow(ctx: any, communityId: any): Promise<CommunityFunnelRowLike | null> {
  return (await ctx.db
    .query("communityFunnels" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .first()) as CommunityFunnelRowLike | null;
}

async function saveCommunityFunnelConfigInternal(
  ctx: any,
  communityId: any,
  normalized: ReturnType<typeof normalizeCommunityFunnelConfigInput>,
  nowMs: number,
) {
  const existing = await getCommunityFunnelRow(ctx, communityId);
  const nextHeroMediaStorageId =
    normalized?.hero_media_storage_id && normalized.hero_media_storage_id.trim()
      ? (normalized.hero_media_storage_id as any)
      : undefined;
  const nextFields = {
    heroMediaUrl: nextHeroMediaStorageId ? undefined : normalized?.hero_media_url ?? undefined,
    heroMediaStorageId: nextHeroMediaStorageId,
    heroMediaKind: normalized?.hero_media_kind ?? "image",
    about: normalized?.about ?? undefined,
    communityId,
    createdAt: existing?.createdAt ?? nowMs,
    updatedAt: nowMs,
  };
  if (existing) {
    if (
      existing.heroMediaStorageId &&
      (!nextHeroMediaStorageId || String(existing.heroMediaStorageId) !== String(nextHeroMediaStorageId))
    ) {
      await maybeDeleteStorageAsset(ctx, existing.heroMediaStorageId);
    }
    await ctx.db.replace(existing._id as any, nextFields);
  } else {
    await ctx.db.insert("communityFunnels" as any, {
      ...nextFields,
    });
  }
  const saved = await getCommunityFunnelRow(ctx, communityId);
  return await mapCommunityFunnelRow(ctx, saved);
}

export async function resolveCommunityFunnelConfigByCommunityId(ctx: any, communityId: any) {
  const row = await getCommunityFunnelRow(ctx, communityId);
  return await mapCommunityFunnelRow(ctx, row);
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
    return await mapCommunityFunnelRow(ctx, row);
  },
});

export const upsertCommunityFunnelConfig = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    config: v.any(),
    nowMs: v.optional(v.number()),
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
    const nowMs = args.nowMs ?? Date.now();
    const normalized = normalizeCommunityFunnelConfigInput(args.config);
    return await saveCommunityFunnelConfigInternal(ctx, args.communityId, normalized, nowMs);
  },
});

export const saveCommunityPublicPage = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    description: v.optional(v.union(v.string(), v.null())),
    config: v.any(),
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
    const { community } = await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: args.userId,
    });
    const nextDescription = normalizeOptionalText(args.description);
    await ctx.db.patch(community._id as any, {
      description: nextDescription,
      updatedAt: nowMs,
    });
    const funnel = await saveCommunityFunnelConfigInternal(
      ctx,
      args.communityId,
      normalizeCommunityFunnelConfigInput(args.config),
      nowMs,
    );
    const updated = (await ctx.db.get(community._id as any)) as CommunityLike | null;
    if (!updated) throw new Error("community_not_found");
    return {
      community_id: String(updated._id),
      description: updated.description ?? null,
      updated_at: toIsoString(updated.updatedAt),
      funnel,
    };
  },
});

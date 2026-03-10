import { query } from "./_generated/server";
import { v } from "convex/values";
import {
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
} from "./communityCore";

type CommunityFunnelRowLike = {
  _id: unknown;
  communityId: unknown;
  heroMediaUrl?: string | null;
  heroMediaKind?: "image" | "video" | null;
  about?: string | null;
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

async function mapCommunityFunnelRow(ctx: any, row: CommunityFunnelRowLike | null) {
  void ctx;
  if (!row) return null;
  return {
    hero_media_url: normalizeTrimmedString(row.heroMediaUrl, 2_000),
    hero_media_kind: normalizeHeroMediaKind(row.heroMediaKind),
    about: normalizeTrimmedString(row.about, 8_000),
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
    about: normalizeTrimmedString(value.about, 8_000),
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
  const nextFields = {
    heroMediaUrl: normalized?.hero_media_url ?? undefined,
    heroMediaKind: normalized?.hero_media_kind ?? "image",
    about: normalized?.about ?? undefined,
    communityId,
    createdAt: existing?.createdAt ?? nowMs,
    updatedAt: nowMs,
  };
  if (existing) {
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

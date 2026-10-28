import { sha256HexText } from "./secretCrypto";
import {
  type CommunityResourceLike,
  communityResourceBodyChars,
  normalizeIdValue,
  normalizeOptionalText,
} from "./communityCore";

export type CommunityResourceContentLike = {
  _id: any;
  communityId: any;
  resourceId: any;
  bodyMd: string;
  bodyChars: number;
  bodyHash: string;
  createdAt: number;
  updatedAt: number;
};

export const COMMUNITY_RESOURCE_BODY_DEFAULT_MAX_CHARS = 20_000;

export function normalizeCommunityResourceBodyMd(
  raw: unknown,
  maxChars = COMMUNITY_RESOURCE_BODY_DEFAULT_MAX_CHARS,
): string | null {
  return normalizeOptionalText(raw, maxChars) ?? null;
}

async function getCommunityResourceContentRow(
  ctx: { db: any },
  resourceId: any,
): Promise<CommunityResourceContentLike | null> {
  return ((await ctx.db
    .query("communityResourceContents" as any)
    .withIndex("by_resource", (q: any) => q.eq("resourceId", resourceId))
    .first()) as CommunityResourceContentLike | null) ?? null;
}

export async function hydrateCommunityResourceBody(
  ctx: { db: any },
  resource: CommunityResourceLike | null | undefined,
): Promise<CommunityResourceLike | null> {
  if (!resource) return null;
  const legacyBody = String(resource.bodyMd ?? "").trim();
  if (legacyBody) {
    return {
      ...resource,
      bodyChars: communityResourceBodyChars(resource),
    };
  }
  const content = await getCommunityResourceContentRow(ctx, resource._id);
  if (!content || normalizeIdValue(content.communityId) !== normalizeIdValue(resource.communityId)) {
    return resource;
  }
  const bodyMd = String(content.bodyMd ?? "");
  return {
    ...resource,
    bodyMd: bodyMd || undefined,
    bodyChars: Number.isFinite(content.bodyChars) ? Math.max(0, Math.floor(content.bodyChars)) : bodyMd.trim().length,
    bodyHash: String(content.bodyHash ?? "") || resource.bodyHash,
  };
}

export async function writeCommunityResourceBodyContent(
  ctx: { db: any },
  args: {
    communityId: any;
    resourceId: any;
    bodyMd: unknown;
    nowMs: number;
    maxChars?: number;
    resourceUpdatedAt?: number;
  },
): Promise<{
  bodyMd: string | null;
  bodyChars: number;
  bodyHash: string | null;
}> {
  const bodyMd = normalizeCommunityResourceBodyMd(
    args.bodyMd,
    args.maxChars ?? COMMUNITY_RESOURCE_BODY_DEFAULT_MAX_CHARS,
  );
  const resourceUpdatedAt = typeof args.resourceUpdatedAt === "number" && Number.isFinite(args.resourceUpdatedAt)
    ? Math.floor(args.resourceUpdatedAt)
    : args.nowMs;
  const existing = await getCommunityResourceContentRow(ctx, args.resourceId);
  if (!bodyMd) {
    if (existing) await ctx.db.delete(existing._id as any);
    await ctx.db.patch(args.resourceId as any, {
      bodyMd: undefined,
      bodyChars: 0,
      bodyHash: undefined,
      bodyMigratedAt: args.nowMs,
      updatedAt: resourceUpdatedAt,
    });
    return {
      bodyMd: null,
      bodyChars: 0,
      bodyHash: null,
    };
  }

  const bodyHash = await sha256HexText(bodyMd);
  const bodyChars = bodyMd.trim().length;
  if (existing) {
    await ctx.db.patch(existing._id as any, {
      communityId: args.communityId,
      resourceId: args.resourceId,
      bodyMd,
      bodyChars,
      bodyHash,
      updatedAt: args.nowMs,
    });
  } else {
    await ctx.db.insert("communityResourceContents" as any, {
      communityId: args.communityId,
      resourceId: args.resourceId,
      bodyMd,
      bodyChars,
      bodyHash,
      createdAt: args.nowMs,
      updatedAt: args.nowMs,
    });
  }
  await ctx.db.patch(args.resourceId as any, {
    bodyMd: undefined,
    bodyChars,
    bodyHash,
    bodyMigratedAt: args.nowMs,
    updatedAt: resourceUpdatedAt,
  });
  return {
    bodyMd,
    bodyChars,
    bodyHash,
  };
}

export async function deleteCommunityResourceBodyContent(
  ctx: { db: any },
  resourceId: any,
): Promise<void> {
  const existing = await getCommunityResourceContentRow(ctx, resourceId);
  if (existing) await ctx.db.delete(existing._id as any);
}

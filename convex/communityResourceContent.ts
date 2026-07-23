import { sha256HexText } from "./providerConnections";
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
  const rows = (await ctx.db
    .query("communityResourceContents" as any)
    .withIndex("by_resource", (q: any) => q.eq("resourceId", resourceId))
    .take(2)) as CommunityResourceContentLike[];
  if (rows.length > 1) throw new Error("community_resource_content_duplicate");
  return rows[0] ?? null;
}

function requireCommunityResourceContentMatchesResource(
  content: CommunityResourceContentLike,
  resource: CommunityResourceLike,
): void {
  if (
    normalizeIdValue(content.resourceId) !== normalizeIdValue(resource._id) ||
    normalizeIdValue(content.communityId) !== normalizeIdValue(resource.communityId)
  ) {
    throw new Error("community_resource_content_scope_mismatch");
  }
  const bodyMd = String(content.bodyMd ?? "");
  const bodyChars = bodyMd.trim().length;
  if (!bodyMd.trim() || content.bodyChars !== bodyChars) {
    throw new Error("community_resource_content_invalid");
  }
  if (communityResourceBodyChars(resource) !== content.bodyChars) {
    throw new Error("community_resource_content_projection_mismatch");
  }
}

export async function readCommunityResourceBodyMd(
  ctx: { db: any },
  resource: CommunityResourceLike | null | undefined,
): Promise<string | null> {
  if (!resource) return null;
  const content = await getCommunityResourceContentRow(ctx, resource._id);
  if (!content) {
    if (communityResourceBodyChars(resource) > 0) {
      throw new Error("community_resource_content_missing");
    }
    return null;
  }
  requireCommunityResourceContentMatchesResource(content, resource);
  return String(content.bodyMd);
}

export async function hydrateCommunityResourceBody(
  ctx: { db: any },
  resource: CommunityResourceLike | null | undefined,
): Promise<CommunityResourceLike | null> {
  if (!resource) return null;
  const content = await getCommunityResourceContentRow(ctx, resource._id);
  if (!content) {
    if (communityResourceBodyChars(resource) > 0) {
      throw new Error("community_resource_content_missing");
    }
    return resource;
  }
  requireCommunityResourceContentMatchesResource(content, resource);
  return {
    ...resource,
    bodyMd: content.bodyMd,
    bodyChars: content.bodyChars,
    bodyHash: content.bodyHash,
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
): Promise<CommunityResourceLike> {
  const bodyMd = normalizeCommunityResourceBodyMd(
    args.bodyMd,
    args.maxChars ?? COMMUNITY_RESOURCE_BODY_DEFAULT_MAX_CHARS,
  );
  const resourceUpdatedAt = typeof args.resourceUpdatedAt === "number" && Number.isFinite(args.resourceUpdatedAt)
    ? Math.floor(args.resourceUpdatedAt)
    : args.nowMs;
  const resource = await ctx.db.get(args.resourceId as any) as CommunityResourceLike | null;
  if (
    !resource ||
    normalizeIdValue(resource.communityId) !== normalizeIdValue(args.communityId)
  ) {
    throw new Error("community_resource_content_scope_mismatch");
  }
  const existing = await getCommunityResourceContentRow(ctx, args.resourceId);
  if (existing) requireCommunityResourceContentMatchesResource(existing, resource);
  if (!bodyMd) {
    if (existing) await ctx.db.delete(existing._id as any);
    await ctx.db.patch(args.resourceId as any, {
      bodyChars: 0,
      updatedAt: resourceUpdatedAt,
    });
    return {
      ...resource,
      bodyChars: 0,
      updatedAt: resourceUpdatedAt,
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
    bodyChars,
    updatedAt: resourceUpdatedAt,
  });
  return {
    ...resource,
    bodyMd,
    bodyChars,
    bodyHash,
    updatedAt: resourceUpdatedAt,
  };
}

export async function deleteCommunityResourceBodyContent(
  ctx: { db: any },
  resourceId: any,
): Promise<void> {
  const existing = await getCommunityResourceContentRow(ctx, resourceId);
  if (existing) await ctx.db.delete(existing._id as any);
}

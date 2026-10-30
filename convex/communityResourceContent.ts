import { sha256HexText } from "./secretCrypto";
import {
  type CommunityResourceLike,
  communityResourceBodyChars,
  normalizeIdValue,
  normalizeOptionalText,
} from "./communityCore";
import {
  COMMUNITY_RESOURCE_BODY_MAX_CHARS,
  checkCommunityResourceBody,
} from "../shared/communityLessonSections";

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

/**
 * A body someone wrote (the editor, a changeset, an agent): refused whole,
 * with a message saying what to change, when it is too long for a page or one
 * of its sections is. Never cut off. See shared/communityLessonSections.ts.
 */
export function normalizeAuthoredCommunityResourceBodyMd(raw: unknown): string | null {
  const bodyMd = String(raw ?? "").trim();
  if (!bodyMd) return null;
  const problems = checkCommunityResourceBody(bodyMd);
  if (problems.length) {
    throw new Error(`community_resource_body_too_long: ${problems.map((problem) => problem.message).join(" ")}`);
  }
  return bodyMd;
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

// A pause this long between saves starts a new version in the history.
export const COMMUNITY_RESOURCE_REVISION_SESSION_GAP_MS = 10 * 60 * 1000;
export const COMMUNITY_RESOURCE_REVISION_KEEP = 40;

export type CommunityResourceRevisionLike = {
  _id: any;
  communityId: any;
  resourceId: any;
  title: string;
  bodyMd: string;
  bodyChars: number;
  bodyHash: string;
  savedAt: number;
  createdAt: number;
};

export async function listCommunityResourceRevisionRows(
  ctx: { db: any },
  resourceId: any,
  limit = COMMUNITY_RESOURCE_REVISION_KEEP,
): Promise<CommunityResourceRevisionLike[]> {
  return (await ctx.db
    .query("communityResourceRevisions" as any)
    .withIndex("by_resource_createdAt", (q: any) => q.eq("resourceId", resourceId))
    .order("desc")
    .take(limit)) as CommunityResourceRevisionLike[];
}

// Keeps the body about to be replaced as a version, once per editing session
// (or always, for a restore, so a restore can itself be undone).
async function keepCommunityResourceRevision(
  ctx: { db: any },
  args: {
    communityId: any;
    resourceId: any;
    nextBodyHash: string | null;
    previousBodyMd: string;
    previousSavedAt: number;
    previousTitle?: string;
    nowMs: number;
    force?: boolean;
  },
): Promise<void> {
  if (!args.previousBodyMd.trim()) return;
  const previousHash = await sha256HexText(args.previousBodyMd);
  if (previousHash === args.nextBodyHash) return;
  const recent = await listCommunityResourceRevisionRows(ctx, args.resourceId, COMMUNITY_RESOURCE_REVISION_KEEP + 5);
  const latest = recent[0] ?? null;
  if (!args.force && latest && args.nowMs - latest.createdAt < COMMUNITY_RESOURCE_REVISION_SESSION_GAP_MS) return;
  if (latest?.bodyHash === previousHash) return;
  let title = args.previousTitle;
  if (title === undefined) {
    const resource = (await ctx.db.get(args.resourceId)) as { title?: string } | null;
    title = String(resource?.title ?? "");
  }
  await ctx.db.insert("communityResourceRevisions" as any, {
    communityId: args.communityId,
    resourceId: args.resourceId,
    title,
    bodyMd: args.previousBodyMd,
    bodyChars: args.previousBodyMd.trim().length,
    bodyHash: previousHash,
    savedAt: args.previousSavedAt,
    createdAt: args.nowMs,
  });
  for (const stale of recent.slice(COMMUNITY_RESOURCE_REVISION_KEEP - 1)) {
    await ctx.db.delete(stale._id);
  }
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
    /** The title the replaced body had, when the caller has already changed it. */
    previousTitle?: string;
    /** Always keep the replaced body as a version (a restore). */
    forceRevision?: boolean;
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
  const legacy = existing ? null : (await ctx.db.get(args.resourceId)) as { bodyMd?: string; updatedAt?: number } | null;
  await keepCommunityResourceRevision(ctx, {
    communityId: args.communityId,
    resourceId: args.resourceId,
    nextBodyHash: bodyMd ? await sha256HexText(bodyMd) : null,
    previousBodyMd: String(existing?.bodyMd ?? legacy?.bodyMd ?? ""),
    previousSavedAt: Number(existing?.updatedAt ?? legacy?.updatedAt ?? args.nowMs),
    previousTitle: args.previousTitle,
    nowMs: args.nowMs,
    force: args.forceRevision,
  });
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
  // The page is gone, so its history goes with it.
  for (const revision of await listCommunityResourceRevisionRows(ctx, resourceId, COMMUNITY_RESOURCE_REVISION_KEEP + 5)) {
    await ctx.db.delete(revision._id);
  }
}

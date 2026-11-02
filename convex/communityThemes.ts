import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import {
  DEFAULT_COMMUNITY_THEME,
  normalizeCommunityTheme,
  type CommunityThemeV1,
} from "../shared/communityTheme";
import {
  requireActiveCommunity,
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
  type CommunityLike,
} from "./communityCore";

// A community's look: one draft managers edit and one published theme members
// see. Same revision rules as other drafts: writes name the draft revision they
// started from, so a stale editor never overwrites a newer draft.

type CommunityThemeRowLike = {
  _id: any;
  draftTheme: unknown;
  draftRevision: number;
  draftUpdatedAt: number;
  publishedTheme?: unknown;
  publishedDraftRevision?: number;
  publishedAt?: number;
};

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
  await requireCommunityManager({ ctx: args.ctx, communityId: args.communityId, userId });
  return userId;
}

async function getThemeRow(ctx: any, communityId: any): Promise<CommunityThemeRowLike | null> {
  return await ctx.db
    .query("communityThemes")
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .unique();
}

// Stored themes were valid when written; reading through the normalizer again
// means a theme saved under older rules still renders, or falls back to Polynet's.
function readStoredTheme(raw: unknown): CommunityThemeV1 | null {
  if (raw == null) return null;
  const result = normalizeCommunityTheme(raw);
  return result.ok ? result.theme : null;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function sameTheme(a: CommunityThemeV1, b: CommunityThemeV1) {
  return canonicalJson(a) === canonicalJson(b);
}

function managerProjection(row: CommunityThemeRowLike | null) {
  if (!row) {
    return {
      draft: DEFAULT_COMMUNITY_THEME,
      draftRevision: 0,
      published: null,
      publishedAt: null,
      hasUnpublishedChanges: false,
    };
  }
  const draft = readStoredTheme(row.draftTheme) ?? DEFAULT_COMMUNITY_THEME;
  const published = readStoredTheme(row.publishedTheme);
  return {
    draft,
    draftRevision: row.draftRevision,
    published,
    publishedAt: row.publishedAt ?? null,
    hasUnpublishedChanges: !sameTheme(draft, published ?? DEFAULT_COMMUNITY_THEME),
  };
}

function requireExpectedRevision(row: CommunityThemeRowLike | null, expected: number) {
  const current = row?.draftRevision ?? 0;
  if (current !== expected) {
    throw new ConvexError({ code: "community_theme_revision_conflict", currentRevision: current });
  }
}

/** The published theme, or null for Polynet's own look. Safe for anyone who can open the community. */
export const getPublishedCommunityTheme = query({
  args: { communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const community = (await ctx.db.get(args.communityId)) as CommunityLike | null;
    if (!community) return null;
    requireActiveCommunity(community);
    const row = await getThemeRow(ctx, args.communityId);
    return readStoredTheme(row?.publishedTheme);
  },
});

export const getCommunityThemeDraft = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    await requireManager({ ctx, ...args });
    return managerProjection(await getThemeRow(ctx, args.communityId));
  },
});

export async function saveDraft(ctx: any, args: { userId: any; communityId: any; expectedDraftRevision: number; theme: unknown }) {
  const result = normalizeCommunityTheme(args.theme);
  if (!result.ok) {
    throw new ConvexError({ code: "community_theme_invalid", problems: result.problems });
  }
  const row = await getThemeRow(ctx, args.communityId);
  requireExpectedRevision(row, args.expectedDraftRevision);
  if (row && sameTheme(readStoredTheme(row.draftTheme) ?? DEFAULT_COMMUNITY_THEME, result.theme)) {
    return managerProjection(row);
  }
  const now = Date.now();
  const draftRevision = (row?.draftRevision ?? 0) + 1;
  if (row) {
    await ctx.db.patch(row._id, {
      draftTheme: result.theme,
      draftRevision,
      draftUpdatedAt: now,
      draftUpdatedByUserId: args.userId,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("communityThemes", {
      communityId: args.communityId,
      draftTheme: result.theme,
      draftRevision,
      draftUpdatedAt: now,
      draftUpdatedByUserId: args.userId,
      createdAt: now,
      updatedAt: now,
    });
  }
  return managerProjection(await getThemeRow(ctx, args.communityId));
}

async function publishDraft(ctx: any, args: { userId: any; communityId: any; expectedDraftRevision: number }) {
  const row = await getThemeRow(ctx, args.communityId);
  if (!row) throw new ConvexError({ code: "community_theme_no_draft" });
  requireExpectedRevision(row, args.expectedDraftRevision);
  const draft = readStoredTheme(row.draftTheme) ?? DEFAULT_COMMUNITY_THEME;
  const published = readStoredTheme(row.publishedTheme);
  if (!published || !sameTheme(draft, published)) {
    const now = Date.now();
    await ctx.db.patch(row._id, {
      publishedTheme: draft,
      publishedDraftRevision: row.draftRevision,
      publishedAt: now,
      publishedByUserId: args.userId,
      updatedAt: now,
    });
  }
  return managerProjection(await getThemeRow(ctx, args.communityId));
}

/** Replaces the draft. An invalid theme is rejected with every problem and, for contrast, a colour that passes. Saving the same theme again changes nothing. */
export const saveCommunityThemeDraft = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    expectedDraftRevision: v.number(),
    theme: v.any(),
  },
  handler: async (ctx, args) => {
    const userId = await requireManager({ ctx, userId: args.userId, authSubject: args.authSubject, communityId: args.communityId });
    return await saveDraft(ctx, { userId, communityId: args.communityId, expectedDraftRevision: args.expectedDraftRevision, theme: args.theme });
  },
});

/** Makes the draft what members see. Publishing an unchanged draft again changes nothing. */
export const publishCommunityThemeDraft = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    expectedDraftRevision: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireManager({ ctx, userId: args.userId, authSubject: args.authSubject, communityId: args.communityId });
    return await publishDraft(ctx, { userId, communityId: args.communityId, expectedDraftRevision: args.expectedDraftRevision });
  },
});

/** Throws away unpublished changes: the draft becomes the published theme again. */
export const discardCommunityThemeDraft = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    expectedDraftRevision: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireManager({ ctx, userId: args.userId, authSubject: args.authSubject, communityId: args.communityId });
    const row = await getThemeRow(ctx, args.communityId);
    if (!row) return managerProjection(null);
    requireExpectedRevision(row, args.expectedDraftRevision);
    const published = readStoredTheme(row.publishedTheme) ?? DEFAULT_COMMUNITY_THEME;
    if (!sameTheme(readStoredTheme(row.draftTheme) ?? DEFAULT_COMMUNITY_THEME, published)) {
      const now = Date.now();
      await ctx.db.patch(row._id, {
        draftTheme: published,
        draftRevision: row.draftRevision + 1,
        draftUpdatedAt: now,
        draftUpdatedByUserId: userId,
        updatedAt: now,
      });
    }
    return managerProjection(await getThemeRow(ctx, args.communityId));
  },
});

// The same draft and publish steps for a founder's own agent or `polynet dev`,
// through the MCP (convex/polynetCanonicalExecutor.ts). Refusals come back as
// values so the agent can read the problems and correct the theme.

type BuilderThemeResult =
  | { ok: true; theme: ReturnType<typeof managerProjection> }
  | { ok: false; code: string; message: string; problems?: unknown; current_revision?: number };

function builderThemeRefusal(error: unknown): BuilderThemeResult {
  const data = error instanceof ConvexError ? (error.data as Record<string, unknown>) : null;
  if (data?.code === "community_theme_invalid") {
    return { ok: false, code: "theme_invalid", message: "The theme breaks the design contract. Fix each problem and save again.", problems: data.problems };
  }
  if (data?.code === "community_theme_revision_conflict") {
    return { ok: false, code: "theme_revision_conflict",
      message: "The draft changed since you read it. Read the theme again and redo your change on top.",
      current_revision: data.currentRevision as number };
  }
  if (data?.code === "community_theme_no_draft") {
    return { ok: false, code: "theme_no_draft", message: "There is no draft to publish yet. Save one first." };
  }
  throw error;
}

export const readBuilderThemeInternal = internalQuery({
  args: { userId: v.id("users"), communityId: v.id("communities") },
  handler: async (ctx, args) => {
    await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
    const row = await getThemeRow(ctx, args.communityId);
    return { ...managerProjection(row), publishedDraftRevision: row?.publishedDraftRevision ?? null };
  },
});

export const saveBuilderThemeDraftInternal = internalMutation({
  args: { userId: v.id("users"), communityId: v.id("communities"), expectedDraftRevision: v.number(), theme: v.any() },
  handler: async (ctx, args): Promise<BuilderThemeResult> => {
    await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
    try {
      return { ok: true, theme: await saveDraft(ctx, args) };
    } catch (error) {
      return builderThemeRefusal(error);
    }
  },
});

export const publishBuilderThemeDraftInternal = internalMutation({
  args: { userId: v.id("users"), communityId: v.id("communities"), expectedDraftRevision: v.number() },
  handler: async (ctx, args): Promise<BuilderThemeResult> => {
    await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
    try {
      return { ok: true, theme: await publishDraft(ctx, args) };
    } catch (error) {
      return builderThemeRefusal(error);
    }
  },
});

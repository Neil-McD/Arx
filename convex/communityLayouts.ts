import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import {
  DEFAULT_COMMUNITY_LAYOUT,
  normalizeCommunityLayout,
  type CommunityLayoutPosition,
  type CommunityLayoutV1,
} from "../shared/communityLayout";
import {
  requireActiveCommunity,
  requireCommunityChatAccess,
  requireCommunityManager,
  resolveUserIdForAuthenticatedRequest,
  type CommunityLike,
} from "./communityCore";

// A community's layout: one draft managers edit and one published layout members
// see. Same revision rules as other drafts: writes name the draft revision they
// started from, so a stale editor never overwrites a newer draft.

type CommunityLayoutRowLike = {
  _id: any;
  draftLayout: unknown;
  draftRevision: number;
  draftUpdatedAt: number;
  publishedLayout?: unknown;
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

async function getLayoutRow(ctx: any, communityId: any): Promise<CommunityLayoutRowLike | null> {
  return await ctx.db
    .query("communityLayouts")
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .unique();
}

// Stored layouts were valid when written; reading through the normalizer again
// means a layout saved under older rules still renders, or falls back to Polynet's.
function readStoredLayout(raw: unknown): CommunityLayoutV1 | null {
  if (raw == null) return null;
  const result = normalizeCommunityLayout(raw);
  return result.ok ? result.layout : null;
}

/** The published layout, or null, for code that already holds a community. */
export async function readPublishedCommunityLayout(ctx: any, communityId: any): Promise<CommunityLayoutV1 | null> {
  const row = await getLayoutRow(ctx, communityId);
  return readStoredLayout(row?.publishedLayout);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function sameLayout(a: CommunityLayoutV1, b: CommunityLayoutV1) {
  return canonicalJson(a) === canonicalJson(b);
}

function managerProjection(row: CommunityLayoutRowLike | null) {
  if (!row) {
    return {
      draft: DEFAULT_COMMUNITY_LAYOUT,
      draftRevision: 0,
      published: null,
      publishedAt: null,
      hasUnpublishedChanges: false,
    };
  }
  const draft = readStoredLayout(row.draftLayout) ?? DEFAULT_COMMUNITY_LAYOUT;
  const published = readStoredLayout(row.publishedLayout);
  return {
    draft,
    draftRevision: row.draftRevision,
    published,
    publishedAt: row.publishedAt ?? null,
    hasUnpublishedChanges: !sameLayout(draft, published ?? DEFAULT_COMMUNITY_LAYOUT),
  };
}

function requireExpectedRevision(row: CommunityLayoutRowLike | null, expected: number) {
  const current = row?.draftRevision ?? 0;
  if (current !== expected) {
    throw new ConvexError({ code: "community_layout_revision_conflict", currentRevision: current });
  }
}

/** The published layout, or null for Polynet's own layout. Safe for anyone who can open the community. */
export const getPublishedCommunityLayout = query({
  args: { communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const community = (await ctx.db.get(args.communityId)) as CommunityLike | null;
    if (!community) return null;
    requireActiveCommunity(community);
    const row = await getLayoutRow(ctx, args.communityId);
    return readStoredLayout(row?.publishedLayout);
  },
});

export const getCommunityLayoutDraft = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    await requireManager({ ctx, ...args });
    return managerProjection(await getLayoutRow(ctx, args.communityId));
  },
});

async function saveDraft(ctx: any, args: { userId: any; communityId: any; expectedDraftRevision: number; layout: unknown }) {
  const result = normalizeCommunityLayout(args.layout);
  if (!result.ok) {
    throw new ConvexError({ code: "community_layout_invalid", problems: result.problems });
  }
  const row = await getLayoutRow(ctx, args.communityId);
  requireExpectedRevision(row, args.expectedDraftRevision);
  if (row && sameLayout(readStoredLayout(row.draftLayout) ?? DEFAULT_COMMUNITY_LAYOUT, result.layout)) {
    return managerProjection(row);
  }
  const now = Date.now();
  const draftRevision = (row?.draftRevision ?? 0) + 1;
  if (row) {
    await ctx.db.patch(row._id, {
      draftLayout: result.layout,
      draftRevision,
      draftUpdatedAt: now,
      draftUpdatedByUserId: args.userId,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("communityLayouts", {
      communityId: args.communityId,
      draftLayout: result.layout,
      draftRevision,
      draftUpdatedAt: now,
      draftUpdatedByUserId: args.userId,
      createdAt: now,
      updatedAt: now,
    });
  }
  return managerProjection(await getLayoutRow(ctx, args.communityId));
}

async function publishDraft(ctx: any, args: { userId: any; communityId: any; expectedDraftRevision: number }) {
  const row = await getLayoutRow(ctx, args.communityId);
  if (!row) throw new ConvexError({ code: "community_layout_no_draft" });
  requireExpectedRevision(row, args.expectedDraftRevision);
  const draft = readStoredLayout(row.draftLayout) ?? DEFAULT_COMMUNITY_LAYOUT;
  const published = readStoredLayout(row.publishedLayout);
  if (!published || !sameLayout(draft, published)) {
    const now = Date.now();
    await ctx.db.patch(row._id, {
      publishedLayout: draft,
      publishedDraftRevision: row.draftRevision,
      publishedAt: now,
      publishedByUserId: args.userId,
      updatedAt: now,
    });
  }
  return managerProjection(await getLayoutRow(ctx, args.communityId));
}

/** Replaces the draft. An invalid layout is rejected with every problem. Saving the same layout again changes nothing. */
export const saveCommunityLayoutDraft = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    expectedDraftRevision: v.number(),
    layout: v.any(),
  },
  handler: async (ctx, args) => {
    const userId = await requireManager({ ctx, userId: args.userId, authSubject: args.authSubject, communityId: args.communityId });
    return await saveDraft(ctx, { userId, communityId: args.communityId, expectedDraftRevision: args.expectedDraftRevision, layout: args.layout });
  },
});

/** Makes the draft what members see. Publishing an unchanged draft again changes nothing. */
export const publishCommunityLayoutDraft = mutation({
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

/** Throws away unpublished changes: the draft becomes the published layout again. */
export const discardCommunityLayoutDraft = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    expectedDraftRevision: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireManager({ ctx, userId: args.userId, authSubject: args.authSubject, communityId: args.communityId });
    const row = await getLayoutRow(ctx, args.communityId);
    if (!row) return managerProjection(null);
    requireExpectedRevision(row, args.expectedDraftRevision);
    const published = readStoredLayout(row.publishedLayout) ?? DEFAULT_COMMUNITY_LAYOUT;
    if (!sameLayout(readStoredLayout(row.draftLayout) ?? DEFAULT_COMMUNITY_LAYOUT, published)) {
      const now = Date.now();
      await ctx.db.patch(row._id, {
        draftLayout: published,
        draftRevision: row.draftRevision + 1,
        draftUpdatedAt: now,
        draftUpdatedByUserId: userId,
        updatedAt: now,
      });
    }
    return managerProjection(await getLayoutRow(ctx, args.communityId));
  },
});

// The same draft and publish steps for a founder's own agent or `polynet dev`,
// through the MCP (convex/polynetCanonicalExecutor.ts). Refusals come back as
// values so the agent can read the problems and correct the layout.

type BuilderLayoutResult =
  | { ok: true; layout: ReturnType<typeof managerProjection> }
  | { ok: false; code: string; message: string; problems?: unknown; current_revision?: number };

function builderLayoutRefusal(error: unknown): BuilderLayoutResult {
  const data = error instanceof ConvexError ? (error.data as Record<string, unknown>) : null;
  if (data?.code === "community_layout_invalid") {
    return { ok: false, code: "layout_invalid", message: "The layout breaks the design contract. Fix each problem and save again.", problems: data.problems };
  }
  if (data?.code === "community_layout_revision_conflict") {
    return { ok: false, code: "layout_revision_conflict",
      message: "The draft changed since you read it. Read the layout again and redo your change on top.",
      current_revision: data.currentRevision as number };
  }
  if (data?.code === "community_layout_no_draft") {
    return { ok: false, code: "layout_no_draft", message: "There is no draft to publish yet. Save one first." };
  }
  throw error;
}

export const readBuilderLayoutInternal = internalQuery({
  args: { userId: v.id("users"), communityId: v.id("communities") },
  handler: async (ctx, args) => {
    await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
    const row = await getLayoutRow(ctx, args.communityId);
    return { ...managerProjection(row), publishedDraftRevision: row?.publishedDraftRevision ?? null };
  },
});

export const saveBuilderLayoutDraftInternal = internalMutation({
  args: { userId: v.id("users"), communityId: v.id("communities"), expectedDraftRevision: v.number(), layout: v.any() },
  handler: async (ctx, args): Promise<BuilderLayoutResult> => {
    await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
    try {
      return { ok: true, layout: await saveDraft(ctx, args) };
    } catch (error) {
      return builderLayoutRefusal(error);
    }
  },
});

export const publishBuilderLayoutDraftInternal = internalMutation({
  args: { userId: v.id("users"), communityId: v.id("communities"), expectedDraftRevision: v.number() },
  handler: async (ctx, args): Promise<BuilderLayoutResult> => {
    await requireCommunityManager({ ctx, communityId: args.communityId, userId: args.userId });
    try {
      return { ok: true, layout: await publishDraft(ctx, args) };
    } catch (error) {
      return builderLayoutRefusal(error);
    }
  },
});

// A member's own layout choice. Only arrangements the owner's published layout
// offers can be picked; a pick the owner later withdraws is ignored when read
// rather than deleted, so it comes back if the owner offers it again.

async function getMemberLayoutPreference(ctx: any, communityId: any, userId: any) {
  return await ctx.db
    .query("communityMemberLayoutPreferences")
    .withIndex("by_community_user", (q: any) => q.eq("communityId", communityId).eq("userId", userId))
    .unique();
}

async function memberChoiceState(ctx: any, communityId: any, userId: any) {
  const layout = (await readPublishedCommunityLayout(ctx, communityId)) ?? DEFAULT_COMMUNITY_LAYOUT;
  const allowed = layout.navigation.member_choice;
  const row = await getMemberLayoutPreference(ctx, communityId, userId);
  const stored = (row?.position ?? null) as CommunityLayoutPosition | null;
  return { allowed, position: stored && allowed.includes(stored) ? stored : null };
}

export const getMyCommunityLayoutChoice = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
    return await memberChoiceState(ctx, args.communityId, userId);
  },
});

export const setMyCommunityLayoutChoice = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    // null goes back to the owner's layout.
    position: v.union(v.literal("top"), v.literal("side"), v.null()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
    await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
    const { allowed } = await memberChoiceState(ctx, args.communityId, userId);
    if (args.position !== null && !allowed.includes(args.position)) {
      throw new ConvexError({ code: "community_layout_choice_not_offered", allowed });
    }
    const row = await getMemberLayoutPreference(ctx, args.communityId, userId);
    if (args.position === null) {
      if (row) await ctx.db.delete(row._id);
    } else if (row) {
      await ctx.db.patch(row._id, { position: args.position, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("communityMemberLayoutPreferences", {
        communityId: args.communityId,
        userId,
        position: args.position,
        updatedAt: Date.now(),
      });
    }
    return await memberChoiceState(ctx, args.communityId, userId);
  },
});

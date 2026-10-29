import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { normalizeCommunityTheme, type CommunityThemeV1 } from "../shared/communityTheme";
import { applyCommunityThemePalette, findCommunityThemePalette } from "../shared/communityThemePalettes";
import { requireCommunityManager, resolveUserIdForAuthenticatedRequest } from "./communityCore";
import { saveDraft } from "./communityThemes";

// Looks an owner saved under a name (Settings → Appearance → Customize →
// Saved themes), and the ready-made colour palettes. Saving, renaming and
// deleting change only this list. Applying one replaces the theme draft
// through communityThemes' own save, so revisions, validation and publishing
// work as they do for any other draft edit.

const MAX_SAVED_THEMES = 50;
const MAX_NAME_LENGTH = 60;

async function requireManager(ctx: any, args: { userId?: any; authSubject?: string | null; communityId: any }) {
  const userId = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
  await requireCommunityManager({ ctx, communityId: args.communityId, userId });
  return userId;
}

async function listRows(ctx: any, communityId: any) {
  return await ctx.db.query("communitySavedThemes").withIndex("by_community", (q: any) => q.eq("communityId", communityId)).collect();
}

function projection(row: any) {
  const result = normalizeCommunityTheme(row.theme);
  return {
    savedThemeId: row._id as string,
    name: row.name as string,
    // Saved under older rules and no longer valid: shown, but can't be applied.
    theme: result.ok ? result.theme : null,
    createdAt: row.createdAt as number,
    updatedAt: row.updatedAt as number,
  };
}

async function listProjection(ctx: any, communityId: any) {
  const rows = await listRows(ctx, communityId);
  return rows.sort((a: any, b: any) => b.updatedAt - a.updatedAt).map(projection);
}

function cleanName(raw: string): string {
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) throw new ConvexError({ code: "saved_theme_name_required" });
  if (name.length > MAX_NAME_LENGTH) throw new ConvexError({ code: "saved_theme_name_too_long", max: MAX_NAME_LENGTH });
  return name;
}

function requireUniqueName(rows: any[], name: string, exceptId?: any) {
  const taken = rows.some((row) => row._id !== exceptId && row.name.toLowerCase() === name.toLowerCase());
  if (taken) throw new ConvexError({ code: "saved_theme_name_taken", name });
}

async function requireRow(ctx: any, communityId: any, savedThemeId: any) {
  const row = await ctx.db.get(savedThemeId);
  if (!row || row.communityId !== communityId) throw new ConvexError({ code: "saved_theme_not_found" });
  return row;
}

/** The community's saved themes, newest change first. */
export const listCommunitySavedThemes = query({
  args: { userId: v.optional(v.id("users")), authSubject: v.optional(v.string()), communityId: v.id("communities") },
  handler: async (ctx, args) => {
    await requireManager(ctx, args);
    return await listProjection(ctx, args.communityId);
  },
});

/** Saves a look under a name. With savedThemeId it replaces that saved theme's look (and name, if given). */
export const saveCommunitySavedTheme = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    name: v.optional(v.string()),
    theme: v.any(),
    savedThemeId: v.optional(v.id("communitySavedThemes")),
  },
  handler: async (ctx, args) => {
    const userId = await requireManager(ctx, args);
    const result = normalizeCommunityTheme(args.theme);
    if (!result.ok) throw new ConvexError({ code: "community_theme_invalid", problems: result.problems });
    const rows = await listRows(ctx, args.communityId);
    const now = Date.now();
    if (args.savedThemeId) {
      const row = await requireRow(ctx, args.communityId, args.savedThemeId);
      const name = args.name === undefined ? row.name : cleanName(args.name);
      requireUniqueName(rows, name, row._id);
      await ctx.db.patch(row._id, { name, theme: result.theme, updatedByUserId: userId, updatedAt: now });
      return { savedThemeId: row._id as string, savedThemes: await listProjection(ctx, args.communityId) };
    }
    if (args.name === undefined) throw new ConvexError({ code: "saved_theme_name_required" });
    const name = cleanName(args.name);
    requireUniqueName(rows, name);
    if (rows.length >= MAX_SAVED_THEMES) throw new ConvexError({ code: "saved_theme_limit", max: MAX_SAVED_THEMES });
    const savedThemeId = await ctx.db.insert("communitySavedThemes", {
      communityId: args.communityId, name, theme: result.theme,
      createdByUserId: userId, updatedByUserId: userId, createdAt: now, updatedAt: now,
    });
    return { savedThemeId: savedThemeId as string, savedThemes: await listProjection(ctx, args.communityId) };
  },
});

export const renameCommunitySavedTheme = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    savedThemeId: v.id("communitySavedThemes"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireManager(ctx, args);
    const row = await requireRow(ctx, args.communityId, args.savedThemeId);
    const name = cleanName(args.name);
    requireUniqueName(await listRows(ctx, args.communityId), name, row._id);
    if (name !== row.name) await ctx.db.patch(row._id, { name, updatedByUserId: userId, updatedAt: Date.now() });
    return await listProjection(ctx, args.communityId);
  },
});

/** Removes a saved theme. The live and draft looks don't change. */
export const deleteCommunitySavedTheme = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    savedThemeId: v.id("communitySavedThemes"),
  },
  handler: async (ctx, args) => {
    await requireManager(ctx, args);
    const row = await requireRow(ctx, args.communityId, args.savedThemeId);
    await ctx.db.delete(row._id);
    return await listProjection(ctx, args.communityId);
  },
});

/** Makes a saved theme the draft. Members see it once the draft is published. */
export const applyCommunitySavedThemeToDraft = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    savedThemeId: v.id("communitySavedThemes"),
    expectedDraftRevision: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireManager(ctx, args);
    const row = await requireRow(ctx, args.communityId, args.savedThemeId);
    return await saveDraft(ctx, { userId, communityId: args.communityId, expectedDraftRevision: args.expectedDraftRevision, theme: row.theme });
  },
});

/** Puts a ready-made palette's colours on the draft; fonts, shapes and course cards stay. */
export const applyCommunityThemePaletteToDraft = mutation({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    paletteId: v.string(),
    // "light" or "dark" fixes the look to one scheme; left out, the draft keeps the schemes it has.
    scheme: v.optional(v.union(v.literal("light"), v.literal("dark"))),
    expectedDraftRevision: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireManager(ctx, args);
    const palette = findCommunityThemePalette(args.paletteId);
    if (!palette) throw new ConvexError({ code: "theme_palette_not_found", paletteId: args.paletteId });
    const row = await ctx.db.query("communityThemes").withIndex("by_community", (q: any) => q.eq("communityId", args.communityId)).unique();
    const current = row ? normalizeCommunityTheme(row.draftTheme) : null;
    const base: CommunityThemeV1 = current?.ok ? current.theme : (normalizeCommunityTheme({ version: 1 }) as { ok: true; theme: CommunityThemeV1 }).theme;
    return await saveDraft(ctx, {
      userId, communityId: args.communityId, expectedDraftRevision: args.expectedDraftRevision,
      theme: applyCommunityThemePalette(base, palette, args.scheme),
    });
  },
});

import { query } from "./_generated/server";
import { v } from "convex/values";

export const listCloudProjectsByOwner = query({
  args: {
    ownerId: v.id("users"),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("cloudProjects")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .collect();
    const filtered = args.includeArchived ? rows : rows.filter((row) => row.status === "active");
    return filtered.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const getCloudProjectById = query({
  args: {
    projectId: v.id("cloudProjects"),
    ownerId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.projectId);
    if (!row) return null;
    if (args.ownerId && row.ownerId !== args.ownerId) return null;
    return row;
  },
});

export const getCloudProjectBySlug = query({
  args: {
    ownerId: v.id("users"),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("cloudProjects")
      .withIndex("by_owner_slug", (q) => q.eq("ownerId", args.ownerId).eq("slug", args.slug))
      .first();
    return row ?? null;
  },
});


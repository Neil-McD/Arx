import { query } from "./_generated/server";
import { v } from "convex/values";

export const listCloudThreadsByOwner = query({
  args: {
    ownerId: v.id("users"),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("threads")
      .withIndex("by_owner_context", (q) => q.eq("ownerId", args.ownerId).eq("context", "cloud"))
      .collect();
    const filtered = args.includeArchived ? rows : rows.filter((row) => typeof row.archivedAt !== "number");
    return filtered.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const listCloudThreadsByProject = query({
  args: {
    projectId: v.id("cloudProjects"),
    ownerId: v.optional(v.id("users")),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("threads")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const ownerFiltered = args.ownerId ? rows.filter((row) => row.ownerId === args.ownerId) : rows;
    const activeFiltered = args.includeArchived
      ? ownerFiltered
      : ownerFiltered.filter((row) => typeof row.archivedAt !== "number");
    const cloudOnly = activeFiltered.filter((row) => row.context === "cloud");
    return cloudOnly.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const getThreadById = query({
  args: {
    threadId: v.id("threads"),
    ownerId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.threadId);
    if (!row) return null;
    if (args.ownerId && row.ownerId !== args.ownerId) return null;
    return row;
  },
});


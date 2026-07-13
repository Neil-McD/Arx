import { paginationOptsValidator } from "convex/server";

import { internalMutation, internalQuery } from "./_generated/server";

const MAX_BATCH_SIZE = 100;

function boundedPaginationOpts(args: { cursor: string | null; numItems: number }) {
  const numItems = Math.max(1, Math.min(MAX_BATCH_SIZE, Math.floor(args.numItems)));
  return {
    cursor: args.cursor,
    numItems,
    maximumRowsRead: numItems,
  };
}

export const auditCommunityMemberOnboardingPageInternal = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("communities")
      .paginate(boundedPaginationOpts(args.paginationOpts));
    return {
      scanned: page.page.length,
      legacyRows: page.page.filter((row) => row.memberOnboarding !== undefined).length,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const clearCommunityMemberOnboardingPageInternal = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("communities")
      .paginate(boundedPaginationOpts(args.paginationOpts));
    let cleared = 0;
    for (const row of page.page) {
      if (row.memberOnboarding === undefined) continue;
      await ctx.db.patch(row._id, { memberOnboarding: undefined });
      cleared += 1;
    }
    return {
      scanned: page.page.length,
      cleared,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const auditAgentLifecycleActivationsPageInternal = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("agentLifecycleActivations")
      .paginate(boundedPaginationOpts(args.paginationOpts));
    return {
      scanned: page.page.length,
      legacyRows: page.page.length,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const deleteAgentLifecycleActivationsPageInternal = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("agentLifecycleActivations")
      .paginate(boundedPaginationOpts(args.paginationOpts));
    for (const row of page.page) await ctx.db.delete(row._id);
    return {
      scanned: page.page.length,
      deleted: page.page.length,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

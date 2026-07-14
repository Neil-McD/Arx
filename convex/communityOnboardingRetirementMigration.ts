import { paginationOptsValidator } from "convex/server";
import { internalMutation } from "./_generated/server";

const MAX_BATCH_SIZE = 100;

function boundedPaginationOpts(args: { cursor: string | null; numItems: number }) {
  const numItems = Math.max(1, Math.min(MAX_BATCH_SIZE, Math.floor(args.numItems)));
  return {
    cursor: args.cursor,
    numItems,
    maximumRowsRead: numItems,
  };
}

export const clearConfigFieldsPageInternal = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("communityOnboardingConfigs")
      .paginate(boundedPaginationOpts(args.paginationOpts));
    let cleared = 0;
    for (const row of page.page) {
      if (row.agentInstructions === undefined && row.version === undefined) continue;
      await ctx.db.patch(row._id, {
        agentInstructions: undefined,
        version: undefined,
      });
      cleared += 1;
    }
    return { scanned: page.page.length, cleared, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

export const clearSessionFieldsPageInternal = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("communityOnboardingSessions")
      .paginate(boundedPaginationOpts(args.paginationOpts));
    let cleared = 0;
    for (const row of page.page) {
      if (
        row.configVersion === undefined &&
        row.agentInstructionsSnapshot === undefined &&
        row.conciergeDisplayNameSnapshot === undefined &&
        row.orientationSeededAt === undefined &&
        row.orientationSeedReplyId === undefined &&
        row.orientationSeedMessageKey === undefined &&
        row.orientationSeedMessageSeq === undefined &&
        row.openedAt === undefined
      ) continue;
      await ctx.db.patch(row._id, {
        configVersion: undefined,
        agentInstructionsSnapshot: undefined,
        conciergeDisplayNameSnapshot: undefined,
        orientationSeededAt: undefined,
        orientationSeedReplyId: undefined,
        orientationSeedMessageKey: undefined,
        orientationSeedMessageSeq: undefined,
        openedAt: undefined,
      });
      cleared += 1;
    }
    return { scanned: page.page.length, cleared, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

export const clearServeRequestFieldsPageInternal = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("communityAgentServeRequests")
      .paginate(boundedPaginationOpts(args.paginationOpts));
    let cleared = 0;
    for (const row of page.page) {
      if (row.onboardingMode === undefined && row.onboardingSessionId === undefined) continue;
      await ctx.db.patch(row._id, {
        onboardingMode: undefined,
        onboardingSessionId: undefined,
      });
      cleared += 1;
    }
    return { scanned: page.page.length, cleared, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

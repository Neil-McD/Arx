import { v } from "convex/values";

import { internalMutation } from "./_generated/server";

export const clearCommunityAnalyticsIdentityResidueInternal = internalMutation({
  args: {
    expectedTotalRows: v.number(),
    expectedUserLinkedRows: v.number(),
    expectedRawVisitorKeyRows: v.number(),
    expectedHashedVisitorKeyRows: v.number(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("communityAnalyticsEvents")
      .take(args.expectedTotalRows + 1);
    const userLinkedRows = rows.filter((row) => row.userId !== undefined);
    const rawVisitorKeyRows = rows.filter(
      (row) => typeof row.visitorKey === "string" && row.visitorKey.length > 0,
    );
    const hashedVisitorKeyRows = rows.filter(
      (row) =>
        typeof row.visitorKeyHash === "string" &&
        row.visitorKeyHash.length > 0,
    );

    const observed = {
      totalRows: rows.length,
      userLinkedRows: userLinkedRows.length,
      rawVisitorKeyRows: rawVisitorKeyRows.length,
      hashedVisitorKeyRows: hashedVisitorKeyRows.length,
    };
    const expected = {
      totalRows: args.expectedTotalRows,
      userLinkedRows: args.expectedUserLinkedRows,
      rawVisitorKeyRows: args.expectedRawVisitorKeyRows,
      hashedVisitorKeyRows: args.expectedHashedVisitorKeyRows,
    };

    if (
      observed.totalRows !== expected.totalRows ||
      observed.userLinkedRows !== expected.userLinkedRows ||
      observed.rawVisitorKeyRows !== expected.rawVisitorKeyRows ||
      observed.hashedVisitorKeyRows !== expected.hashedVisitorKeyRows
    ) {
      throw new Error(
        `community_analytics_identity_expectation_mismatch:${JSON.stringify({
          expected,
          observed,
        })}`,
      );
    }

    for (const row of userLinkedRows) {
      await ctx.db.patch(row._id, { userId: undefined });
    }

    return {
      ...observed,
      clearedUserLinkedRows: userLinkedRows.length,
      remainingUserLinkedRows: 0,
    };
  },
});

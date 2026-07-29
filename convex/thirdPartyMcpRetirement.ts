import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";

const RETIRED_TABLES = [
  "userPlatformAppMountSources",
  "communityAppMounts",
  "userPlatformAppMounts",
  "appOAuthStates",
  "appConnections",
  "appToolSnapshots",
  "developerApps",
] as const;

type RetiredTable = (typeof RETIRED_TABLES)[number];

export const inspectRetiredStateInternal = internalQuery({
  args: {
    sampleLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const sampleLimit = Math.max(
      1,
      Math.min(1000, Math.floor(args.sampleLimit ?? 100)),
    );
    const tables: Record<
      RetiredTable,
      { sampledCount: number; truncated: boolean }
    > = {} as Record<
      RetiredTable,
      { sampledCount: number; truncated: boolean }
    >;
    for (const table of RETIRED_TABLES) {
      const rows = await ctx.db.query(table).take(sampleLimit + 1);
      tables[table] = {
        sampledCount: Math.min(sampleLimit, rows.length),
        truncated: rows.length > sampleLimit,
      };
    }
    return {
      tables,
    };
  },
});

export const deleteRetiredStateBatchInternal = internalMutation({
  args: {
    perTableLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const perTableLimit = Math.max(
      1,
      Math.min(250, Math.floor(args.perTableLimit ?? 100)),
    );
    const deleted: Record<RetiredTable, number> = {} as Record<
      RetiredTable,
      number
    >;
    for (const table of RETIRED_TABLES) {
      const rows = await ctx.db.query(table).take(perTableLimit);
      for (const row of rows) {
        await ctx.db.delete(row._id);
      }
      deleted[table] = rows.length;
    }
    return {
      deleted,
      hasMore: Object.values(deleted).some(
        (count) => count === perTableLimit,
      ),
    };
  },
});

/// <reference types="vite/client" />
// The one-off backfill that makes every message belong to a channel: every
// community gets a General channel, and old read positions become General cursors.
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const NOW = 1_760_000_000_000;

test("the backfill creates General, scopes old cursors and carries old read positions, and is safe to rerun", async () => {
  const t = convexTest(schema, modules);
  const f = await t.run(async (ctx) => {
    const user = (subject: string) => ctx.db.insert("users", {
      authSubject: subject, displayName: subject, handle: subject, normalizedHandle: subject, createdAt: NOW, updatedAt: NOW,
    });
    const ownerId = await user("backfill-owner");
    const readerId = await user("backfill-reader");
    const unscopedId = await user("backfill-unscoped");
    const communityId = await ctx.db.insert("communities", {
      ownerId, slug: "backfill", name: "Backfill", lifecycleStatus: "active", visibility: "unlisted",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 3, createdAt: NOW, updatedAt: NOW,
    });
    for (const userId of [readerId, unscopedId]) {
      await ctx.db.insert("communityMemberships", {
        communityId, userId, role: "member", accessSource: "free_grant", active: true, createdAt: NOW, updatedAt: NOW,
      });
    }
    await ctx.db.insert("communityMemberSettings", { communityId, userId: readerId, muted: false, chatLastSeenAt: NOW - 5, createdAt: NOW, updatedAt: NOW } as any);
    const unscopedCursorId = await ctx.db.insert("communityReadCursors", {
      communityId, userId: unscopedId, streamKind: "chat", seenThroughAt: NOW - 9, createdAt: NOW, updatedAt: NOW,
    });
    return { communityId, readerId, unscopedCursorId };
  });

  const first: any = await t.mutation(internal.communityChannels.backfillChannelsAndReadCursorsInternal, {});
  expect(first).toMatchObject({ done: true, general_created: 1, cursors_scoped: 1, cursors_created: 1 });

  const state = await t.run(async (ctx) => ({
    channels: await ctx.db.query("communityChannels").collect(),
    cursors: await ctx.db.query("communityReadCursors").collect(),
  }));
  expect(state.channels).toHaveLength(1);
  const general = state.channels[0]!;
  expect(general.systemRole).toBe("general");
  expect(state.cursors.every((row) => row.channelId === general._id)).toBe(true);
  expect(state.cursors.find((row) => row.userId === f.readerId)?.seenThroughAt).toBe(NOW - 5);

  const second: any = await t.mutation(internal.communityChannels.backfillChannelsAndReadCursorsInternal, {});
  expect(second).toMatchObject({ general_created: 0, cursors_scoped: 0, cursors_created: 0 });
});

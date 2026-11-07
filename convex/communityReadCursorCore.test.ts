/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import schema from "./schema";
import {
  advanceCommunityChatReadCursor,
  clampCommunityReadPosition,
  nextCommunityReadPosition,
  readCommunityChatReadState,
} from "./communityReadCursorCore";

const modules = import.meta.glob([
  "./communityReadCursorCore.ts",
  "./_generated/**/*.*s",
]);

async function createScope(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      authSubject: "read-cursor-user",
      displayName: "Read cursor user",
      handle: "read-cursor-user",
      normalizedHandle: "read-cursor-user",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId: userId,
      slug: "read-cursor-community",
      name: "Read cursor community",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    return { communityId, userId };
  });
}

test("requested read positions are clamped to the server-visible head", () => {
  expect(clampCommunityReadPosition(9_000, 5_000)).toBe(5_000);
  expect(clampCommunityReadPosition(4_000, 5_000)).toBe(4_000);
  expect(clampCommunityReadPosition(undefined, 5_000)).toBe(0);
  expect(clampCommunityReadPosition(-1, 5_000)).toBe(0);
  expect(clampCommunityReadPosition(5_000, null)).toBe(0);
});

test("read positions advance monotonically across repeated and stale acknowledgements", () => {
  expect(nextCommunityReadPosition(5_000, 4_000, 6_000)).toBe(5_000);
  expect(nextCommunityReadPosition(5_000, 5_000, 6_000)).toBe(5_000);
  expect(nextCommunityReadPosition(5_000, 6_000, 6_000)).toBe(6_000);
});

test("custom channel cursors are independent and never inherit legacy General state", async () => {
  const t = convexTest(schema, modules);
  const scope = await createScope(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("communityMemberSettings", {
      ...scope,
      muted: false,
      chatLastSeenAt: 4_000,
      mentionsLastSeenAt: 5_000,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const customChannelId = await ctx.db.insert("communityChannels", {
      communityId: scope.communityId,
      slug: "custom",
      name: "Custom",
      accessMode: "all_members",
      postingPolicy: "members",
      status: "active",
      position: 1,
      createdByUserId: scope.userId,
      createdAt: 1_000,
      updatedAt: 1_000,
    });

    await expect(
      readCommunityChatReadState(
        ctx,
        scope.communityId,
        scope.userId,
        customChannelId,
      ),
    ).resolves.toEqual({
      chatSeenThroughAt: 0,
      mentionSeenThroughAt: 0,
      source: "none",
    });

    await advanceCommunityChatReadCursor({
      ctx,
      ...scope,
      requestedThroughAt: 6_000,
      latestReadableAt: 6_000,
      nowMs: 2_000,
    });
    await advanceCommunityChatReadCursor({
      ctx,
      ...scope,
      channelId: customChannelId,
      requestedThroughAt: 3_000,
      latestReadableAt: 3_000,
      nowMs: 3_000,
    });

    await expect(
      readCommunityChatReadState(ctx, scope.communityId, scope.userId),
    ).resolves.toMatchObject({ chatSeenThroughAt: 6_000 });
    await expect(
      readCommunityChatReadState(
        ctx,
        scope.communityId,
        scope.userId,
        customChannelId,
      ),
    ).resolves.toEqual({
      chatSeenThroughAt: 3_000,
      mentionSeenThroughAt: 3_000,
      source: "cursor",
    });
    expect(await ctx.db.query("communityReadCursors").collect()).toHaveLength(2);
  });
});

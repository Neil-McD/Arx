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

test("lazy migration clamps corrupt legacy timestamps and then remains monotonic", async () => {
  const t = convexTest(schema, modules);
  const scope = await createScope(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("communityMemberSettings", {
      ...scope,
      muted: false,
      chatLastSeenAt: 99_000,
      mentionsLastSeenAt: 99_000,
      createdAt: 1_000,
      updatedAt: 1_000,
    });

    await expect(
      advanceCommunityChatReadCursor({
        ctx,
        ...scope,
        requestedThroughAt: 90_000,
        latestReadableAt: 5_000,
        nowMs: 2_000,
      }),
    ).resolves.toEqual({
      advanced: false,
      seenThroughAt: 5_000,
    });

    await expect(
      advanceCommunityChatReadCursor({
        ctx,
        ...scope,
        requestedThroughAt: 4_000,
        latestReadableAt: 6_000,
        nowMs: 3_000,
      }),
    ).resolves.toEqual({
      advanced: false,
      seenThroughAt: 5_000,
    });

    await expect(
      advanceCommunityChatReadCursor({
        ctx,
        ...scope,
        requestedThroughAt: 6_000,
        latestReadableAt: 6_000,
        nowMs: 4_000,
      }),
    ).resolves.toEqual({
      advanced: true,
      seenThroughAt: 6_000,
    });

    expect(
      await ctx.db
        .query("communityReadCursors")
        .withIndex("by_community_user_stream", (q) =>
          q
            .eq("communityId", scope.communityId)
            .eq("userId", scope.userId)
            .eq("streamKind", "chat"),
        )
        .collect(),
    ).toHaveLength(1);
    await expect(
      readCommunityChatReadState(
        ctx,
        scope.communityId,
        scope.userId,
      ),
    ).resolves.toEqual({
      chatSeenThroughAt: 6_000,
      mentionSeenThroughAt: 6_000,
      source: "cursor",
    });
  });
});

test("legacy read state remains available before the first additive cursor write", async () => {
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
    await expect(
      readCommunityChatReadState(
        ctx,
        scope.communityId,
        scope.userId,
      ),
    ).resolves.toEqual({
      chatSeenThroughAt: 4_000,
      mentionSeenThroughAt: 5_000,
      source: "legacy",
    });
  });
});

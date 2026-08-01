/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import schema from "./schema";
import { ensureGeneralChannel } from "./communityChannelCore";
import { resolvePublicCommunityInteractionActivityCounts } from "./communityPublic";

const modules = import.meta.glob(["./_generated/**/*.*s"]);

test("public activity counts every active member-readable channel and excludes private/admin rows", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "public-channel-count-owner",
      displayName: "Public channel count owner",
      handle: "public-channel-count-owner",
      normalizedHandle: "public-channel-count-owner",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "public-channel-count",
      name: "Public channel count",
      visibility: "published",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const general = await ensureGeneralChannel({ ctx, communityId, nowMs: 2_000 });
    const otherChannelId = await ctx.db.insert("communityChannels", {
      communityId,
      slug: "future-channel",
      name: "Future channel",
      accessMode: "all_members",
      postingPolicy: "members",
      status: "active",
      position: 1,
      createdByUserId: ownerId,
      createdAt: 2_000,
      updatedAt: 2_000,
    });
    const nowMs = 100_000_000;
    const recentAt = 99_000_000;

    const insertRoot = async (args: {
      key: string;
      visibilityScope: "private" | "admin" | "community" | "public";
      channelId?: any;
      status?: "live" | "hidden" | "deleted";
      createdAt?: number;
      replyCount?: number;
    }) => {
      return await ctx.db.insert("communityInteractionRoots", {
        communityId,
        ...(args.channelId ? { channelId: args.channelId } : {}),
        actorType: "human",
        actorUserId: ownerId,
        kind: "discussion",
        status: args.status ?? "live",
        visibilityScope: args.visibilityScope,
        contentSummary: args.key,
        replyCount: args.replyCount ?? 0,
        reactionSummary: [],
        idempotencyKey: args.key,
        createdAt: args.createdAt ?? recentAt,
        updatedAt: args.createdAt ?? recentAt,
      });
    };

    await insertRoot({ key: "legacy-general", visibilityScope: "community" });
    await insertRoot({
      key: "canonical-general",
      visibilityScope: "public",
      channelId: general._id,
    });
    const generalThreadRootId = await insertRoot({
      key: "canonical-general-thread",
      visibilityScope: "community",
      channelId: general._id,
      replyCount: 1,
    });
    await ctx.db.insert("communityInteractionReplies", {
      communityId,
      channelId: general._id,
      rootId: generalThreadRootId,
      seq: 1,
      actorType: "human",
      actorUserId: ownerId,
      status: "live",
      visibilityScope: "community",
      contentSummary: "canonical-general-reply",
      reactionSummary: [],
      idempotencyKey: "canonical-general-reply",
      createdAt: recentAt + 1,
      updatedAt: recentAt + 1,
    });

    await insertRoot({ key: "private-dock", visibilityScope: "private" });
    await insertRoot({ key: "admin-only", visibilityScope: "admin" });
    const futureRootId = await insertRoot({
      key: "future-channel-root",
      visibilityScope: "public",
      channelId: otherChannelId,
      replyCount: 1,
    });
    await ctx.db.insert("communityInteractionReplies", {
      communityId,
      channelId: otherChannelId,
      rootId: futureRootId,
      seq: 1,
      actorType: "human",
      actorUserId: ownerId,
      status: "live",
      visibilityScope: "public",
      contentSummary: "future-channel-reply",
      reactionSummary: [],
      idempotencyKey: "future-channel-reply",
      createdAt: recentAt + 2,
      updatedAt: recentAt + 2,
    });
    await insertRoot({
      key: "hidden-general",
      visibilityScope: "community",
      channelId: general._id,
      status: "hidden",
    });
    await insertRoot({
      key: "old-general",
      visibilityScope: "community",
      channelId: general._id,
      createdAt: 10_000_000,
    });

    await expect(
      resolvePublicCommunityInteractionActivityCounts(ctx, communityId, {
        nowMs,
        cap: 20,
      }),
    ).resolves.toEqual({
      messagesTodayCount: 6,
      messagesTodayCapped: false,
    });
    await expect(
      resolvePublicCommunityInteractionActivityCounts(ctx, communityId, {
        nowMs,
        cap: 3,
      }),
    ).resolves.toEqual({
      messagesTodayCount: 3,
      messagesTodayCapped: true,
    });
  });
});

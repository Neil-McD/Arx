/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import schema from "./schema";
import { backfillGeneralChannelBatchCore } from "./communityChannelBackfill";

const modules = import.meta.glob([
  "./communityInteractionEvidence.ts",
  "./_generated/**/*.*s",
]);

test("the bounded migration is dry-run-first, idempotent, and preserves private dock rows", async () => {
  const t = convexTest(schema, modules);
  const fixture = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "channel-backfill-owner",
      displayName: "Channel backfill owner",
      handle: "channel-backfill-owner",
      normalizedHandle: "channel-backfill-owner",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "channel-backfill",
      name: "Channel backfill",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const rootId = await ctx.db.insert("communityInteractionRoots", {
      communityId,
      actorType: "human",
      actorUserId: ownerId,
      kind: "discussion",
      status: "live",
      visibilityScope: "community",
      contentSummary: "Legacy General root",
      replyCount: 1,
      reactionSummary: [],
      idempotencyKey: "legacy-general-root",
      createdAt: 2_000,
      updatedAt: 2_000,
    });
    const replyId = await ctx.db.insert("communityInteractionReplies", {
      communityId,
      rootId,
      seq: 1,
      actorType: "human",
      actorUserId: ownerId,
      status: "live",
      visibilityScope: "community",
      contentSummary: "Legacy General reply",
      reactionSummary: [],
      idempotencyKey: "legacy-general-reply",
      createdAt: 2_001,
      updatedAt: 2_001,
    });
    const privateRootId = await ctx.db.insert("communityInteractionRoots", {
      communityId,
      actorType: "system",
      actorUserId: ownerId,
      actorAgentKey: "personal_agent",
      kind: "agent_signal",
      status: "live",
      visibilityScope: "private",
      contentSummary: "Private community agent conversation",
      replyCount: 1,
      reactionSummary: [],
      idempotencyKey: "private_member_agent:root:backfill",
      createdAt: 3_000,
      updatedAt: 3_000,
    });
    const privateReplyId = await ctx.db.insert("communityInteractionReplies", {
      communityId,
      rootId: privateRootId,
      seq: 1,
      actorType: "human",
      actorUserId: ownerId,
      status: "live",
      visibilityScope: "private",
      contentSummary: "Private community agent turn",
      reactionSummary: [],
      idempotencyKey: "private_member_agent:reply:backfill",
      createdAt: 3_001,
      updatedAt: 3_001,
    });
    const cursorId = await ctx.db.insert("communityReadCursors", {
      communityId,
      userId: ownerId,
      streamKind: "chat",
      seenThroughAt: 2_001,
      createdAt: 2_100,
      updatedAt: 2_100,
    });
    const typingId = await ctx.db.insert("communityTypingPresence", {
      communityId,
      userId: ownerId,
      displayUntil: 9_999,
      createdAt: 2_200,
      updatedAt: 2_200,
    });
    const mentionId = await ctx.db.insert("communityInteractionMentions", {
      communityId,
      rootId,
      mentionKind: "role",
      mentionedRoleKey: "everybody",
      notifyState: "pending",
      createdAt: 2_000,
      updatedAt: 2_000,
    });
    const broadcastId = await ctx.db.insert("communityMentionBroadcasts", {
      communityId,
      roleKey: "everybody",
      actorUserId: ownerId,
      sourceRootId: rootId,
      sourceMentionId: mentionId,
      sourceCreatedAt: 2_000,
      emailMode: "in_app_only",
      status: "queued",
      processedCount: 0,
      recipientCount: 0,
      skippedCount: 0,
      createdAt: 2_000,
      updatedAt: 2_000,
    });
    await ctx.db.patch(mentionId, { sourceBroadcastId: broadcastId });
    return {
      broadcastId,
      communityId,
      cursorId,
      mentionId,
      privateReplyId,
      privateRootId,
      replyId,
      rootId,
      typingId,
    };
  });

  const paginationOpts = { numItems: 10_000, cursor: null };
  await t.run(async (ctx) => {
    await expect(
      backfillGeneralChannelBatchCore({
        ctx,
        communityId: fixture.communityId,
        phase: "roots",
        paginationOpts,
        dryRun: true,
      }),
    ).resolves.toMatchObject({
      general_channel_would_create: true,
      batch_limit: 100,
      wouldUpdate: 1,
      intentionallyUnchanneled: 1,
      invalid: 0,
    });
    expect(await ctx.db.query("communityChannels").collect()).toHaveLength(0);
  });

  await t.run(async (ctx) => {
    await expect(
      backfillGeneralChannelBatchCore({
        ctx,
        communityId: fixture.communityId,
        phase: "replies",
        paginationOpts,
        dryRun: false,
      }),
    ).resolves.toMatchObject({ invalid: 1, updated: 0 });
    expect((await ctx.db.get(fixture.replyId))?.channelId).toBeUndefined();
  });

  for (const phase of [
    "roots",
    "replies",
    "mentions",
    "mention_broadcasts",
    "read_cursors",
    "typing_presence",
  ] as const) {
    await t.run(async (ctx) => {
      const result = await backfillGeneralChannelBatchCore({
        ctx,
        communityId: fixture.communityId,
        phase,
        paginationOpts,
        dryRun: false,
      });
      expect(result).toMatchObject({ ok: true, complete: true, invalid: 0 });
    });
  }

  await t.run(async (ctx) => {
    const channels = await ctx.db.query("communityChannels").collect();
    expect(channels).toHaveLength(1);
    const channelId = channels[0]!._id;
    expect((await ctx.db.get(fixture.rootId))?.channelId).toBe(channelId);
    expect((await ctx.db.get(fixture.replyId))?.channelId).toBe(channelId);
    expect((await ctx.db.get(fixture.mentionId))?.channelId).toBe(channelId);
    expect((await ctx.db.get(fixture.broadcastId))?.channelId).toBe(channelId);
    expect((await ctx.db.get(fixture.cursorId))?.channelId).toBe(channelId);
    expect((await ctx.db.get(fixture.typingId))?.channelId).toBe(channelId);
    expect((await ctx.db.get(fixture.privateRootId))?.channelId).toBeUndefined();
    expect((await ctx.db.get(fixture.privateReplyId))?.channelId).toBeUndefined();
  });

  for (const phase of [
    "roots",
    "replies",
    "mentions",
    "mention_broadcasts",
    "read_cursors",
    "typing_presence",
  ] as const) {
    await t.run(async (ctx) => {
      await expect(
        backfillGeneralChannelBatchCore({
          ctx,
          communityId: fixture.communityId,
          phase,
          paginationOpts,
          dryRun: true,
        }),
      ).resolves.toMatchObject({ wouldUpdate: 0, invalid: 0 });
    });
  }
});

test("the migration fails closed instead of duplicating a semantic cursor or typing lease", async () => {
  const t = convexTest(schema, modules);
  const fixture = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "channel-collision-owner",
      displayName: "Channel collision owner",
      handle: "channel-collision-owner",
      normalizedHandle: "channel-collision-owner",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "channel-collision",
      name: "Channel collision",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const channelId = await ctx.db.insert("communityChannels", {
      communityId,
      systemRole: "general",
      slug: "general",
      name: "General",
      accessMode: "all_members",
      postingPolicy: "members",
      status: "active",
      position: 0,
      createdAt: 2_000,
      updatedAt: 2_000,
    });
    await ctx.db.insert("communityReadCursors", {
      communityId,
      channelId,
      userId: ownerId,
      streamKind: "chat",
      seenThroughAt: 10,
      createdAt: 2_000,
      updatedAt: 2_000,
    });
    await ctx.db.insert("communityReadCursors", {
      communityId,
      userId: ownerId,
      streamKind: "chat",
      seenThroughAt: 20,
      createdAt: 2_001,
      updatedAt: 2_001,
    });
    await ctx.db.insert("communityTypingPresence", {
      communityId,
      channelId,
      userId: ownerId,
      displayUntil: 5_000,
      createdAt: 2_000,
      updatedAt: 2_000,
    });
    await ctx.db.insert("communityTypingPresence", {
      communityId,
      userId: ownerId,
      displayUntil: 6_000,
      createdAt: 2_001,
      updatedAt: 2_001,
    });
    return { communityId };
  });

  for (const phase of ["read_cursors", "typing_presence"] as const) {
    await t.run(async (ctx) => {
      await expect(
        backfillGeneralChannelBatchCore({
          ctx,
          communityId: fixture.communityId,
          phase,
          paginationOpts: { numItems: 100, cursor: null },
          dryRun: false,
        }),
      ).resolves.toMatchObject({
        invalid: 1,
        alreadyCanonical: 1,
        updated: 0,
      });
    });
  }
});

test("duplicate legacy cursor and typing rows remain entirely unmodified", async () => {
  const t = convexTest(schema, modules);
  const fixture = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "channel-legacy-collision-owner",
      displayName: "Legacy collision owner",
      handle: "channel-legacy-collision-owner",
      normalizedHandle: "channel-legacy-collision-owner",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "channel-legacy-collision",
      name: "Channel legacy collision",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    for (const offset of [0, 1]) {
      await ctx.db.insert("communityReadCursors", {
        communityId,
        userId: ownerId,
        streamKind: "chat",
        seenThroughAt: 10 + offset,
        createdAt: 2_000 + offset,
        updatedAt: 2_000 + offset,
      });
      await ctx.db.insert("communityTypingPresence", {
        communityId,
        userId: ownerId,
        displayUntil: 5_000 + offset,
        createdAt: 2_000 + offset,
        updatedAt: 2_000 + offset,
      });
    }
    return { communityId };
  });

  for (const phase of ["read_cursors", "typing_presence"] as const) {
    await t.run(async (ctx) => {
      await expect(
        backfillGeneralChannelBatchCore({
          ctx,
          communityId: fixture.communityId,
          phase,
          paginationOpts: { numItems: 100, cursor: null },
          dryRun: false,
        }),
      ).resolves.toMatchObject({
        invalid: 2,
        alreadyCanonical: 0,
        updated: 0,
      });
      const rows = await ctx.db
        .query(
          phase === "read_cursors"
            ? "communityReadCursors"
            : "communityTypingPresence",
        )
        .collect();
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.channelId === undefined)).toBe(true);
    });
  }
});

test("the General migration accepts retained archived-channel projections", async () => {
  const t = convexTest(schema, modules);
  const fixture = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "channel-custom-migration-owner",
      displayName: "Custom migration owner",
      handle: "channel-custom-migration-owner",
      normalizedHandle: "channel-custom-migration-owner",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "channel-custom-migration",
      name: "Channel custom migration",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    await ctx.db.insert("communityChannels", {
      communityId,
      systemRole: "general",
      slug: "general",
      name: "General",
      accessMode: "all_members",
      postingPolicy: "members",
      status: "active",
      position: 0,
      createdAt: 1_500,
      updatedAt: 1_500,
    });
    const channelId = await ctx.db.insert("communityChannels", {
      communityId,
      slug: "custom",
      name: "Custom",
      accessMode: "all_members",
      postingPolicy: "members",
      status: "archived",
      position: 1,
      createdByUserId: ownerId,
      createdAt: 1_500,
      updatedAt: 1_500,
    });
    const rootId = await ctx.db.insert("communityInteractionRoots", {
      communityId,
      channelId,
      actorType: "human",
      actorUserId: ownerId,
      kind: "discussion",
      status: "live",
      visibilityScope: "community",
      contentSummary: "Custom root",
      replyCount: 1,
      reactionSummary: [],
      idempotencyKey: "custom-migration-root",
      createdAt: 2_000,
      updatedAt: 2_000,
    });
    const replyId = await ctx.db.insert("communityInteractionReplies", {
      communityId,
      channelId,
      rootId,
      seq: 1,
      actorType: "human",
      actorUserId: ownerId,
      status: "live",
      visibilityScope: "community",
      contentSummary: "Custom reply",
      reactionSummary: [],
      idempotencyKey: "custom-migration-reply",
      createdAt: 2_001,
      updatedAt: 2_001,
    });
    const mentionId = await ctx.db.insert("communityInteractionMentions", {
      communityId,
      channelId,
      rootId,
      mentionKind: "role",
      mentionedRoleKey: "everybody",
      notifyState: "pending",
      createdAt: 2_000,
      updatedAt: 2_000,
    });
    const broadcastId = await ctx.db.insert("communityMentionBroadcasts", {
      communityId,
      channelId,
      roleKey: "everybody",
      actorUserId: ownerId,
      sourceRootId: rootId,
      sourceMentionId: mentionId,
      sourceCreatedAt: 2_000,
      emailMode: "in_app_only",
      status: "queued",
      processedCount: 0,
      recipientCount: 0,
      skippedCount: 0,
      createdAt: 2_000,
      updatedAt: 2_000,
    });
    await ctx.db.patch(mentionId, { sourceBroadcastId: broadcastId });
    await ctx.db.insert("communityReadCursors", {
      communityId,
      channelId,
      userId: ownerId,
      streamKind: "chat",
      seenThroughAt: 2_001,
      createdAt: 2_100,
      updatedAt: 2_100,
    });
    await ctx.db.insert("communityTypingPresence", {
      communityId,
      channelId,
      userId: ownerId,
      displayUntil: 9_999,
      createdAt: 2_100,
      updatedAt: 2_100,
    });
    return { communityId, channelId, replyId };
  });

  for (const phase of [
    "roots",
    "replies",
    "mentions",
    "mention_broadcasts",
    "read_cursors",
    "typing_presence",
  ] as const) {
    await t.run(async (ctx) => {
      await expect(
        backfillGeneralChannelBatchCore({
          ctx,
          communityId: fixture.communityId,
          phase,
          paginationOpts: { numItems: 100, cursor: null },
          dryRun: false,
        }),
      ).resolves.toMatchObject({ invalid: 0, updated: 0 });
    });
  }
  await t.run(async (ctx) => {
    expect((await ctx.db.get(fixture.replyId))?.channelId).toBe(
      fixture.channelId,
    );
  });
});

test("dry-run detects a General slug collision before any write", async () => {
  const t = convexTest(schema, modules);
  const communityId = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "channel-dry-run-collision-owner",
      displayName: "Dry-run collision owner",
      handle: "channel-dry-run-collision-owner",
      normalizedHandle: "channel-dry-run-collision-owner",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const createdCommunityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "channel-dry-run-collision",
      name: "Channel dry-run collision",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    await ctx.db.insert("communityChannels", {
      communityId: createdCommunityId,
      slug: "general",
      name: "Collision",
      accessMode: "all_members",
      postingPolicy: "members",
      status: "active",
      position: 1,
      createdAt: 2_000,
      updatedAt: 2_000,
    });
    return createdCommunityId;
  });

  await t.run(async (ctx) => {
    await expect(
      backfillGeneralChannelBatchCore({
        ctx,
        communityId,
        phase: "roots",
        paginationOpts: { numItems: 10_000, cursor: null },
        dryRun: true,
      }),
    ).rejects.toThrow("community_general_channel_slug_conflict");
    expect(await ctx.db.query("communityChannels").collect()).toHaveLength(1);
  });
});

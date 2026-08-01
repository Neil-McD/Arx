/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import schema from "./schema";
import {
  auditGeneralChannelMigrationBatchCore,
  listGeneralChannelAuditCommunitiesCore,
} from "./communityChannelAudit";

const modules = import.meta.glob(["./_generated/**/*.*s"]);

test("the bounded audit inventories migration state without changing any row", async () => {
  const t = convexTest(schema, modules);
  const fixture = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "channel-audit-owner",
      displayName: "Channel audit owner",
      handle: "channel-audit-owner",
      normalizedHandle: "channel-audit-owner",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "channel-audit",
      name: "Channel audit",
      visibility: "unlisted",
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
      idempotencyKey: "channel-audit-root",
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
      idempotencyKey: "channel-audit-reply",
      createdAt: 2_001,
      updatedAt: 2_001,
    });
    const privateRootId = await ctx.db.insert("communityInteractionRoots", {
      communityId,
      actorType: "personal_agent",
      actorUserId: ownerId,
      actorAgentKey: "member_agent",
      kind: "agent_signal",
      status: "live",
      visibilityScope: "private",
      contentSummary: "Private dock root",
      replyCount: 0,
      reactionSummary: [],
      idempotencyKey: "channel-audit-private-root",
      createdAt: 2_002,
      updatedAt: 2_002,
    });
    for (const offset of [0, 1]) {
      await ctx.db.insert("communityReadCursors", {
        communityId,
        userId: ownerId,
        streamKind: "chat",
        seenThroughAt: 2_000 + offset,
        createdAt: 2_100 + offset,
        updatedAt: 2_100 + offset,
      });
      await ctx.db.insert("communityTypingPresence", {
        communityId,
        userId: ownerId,
        displayUntil: 9_000 + offset,
        createdAt: 2_200 + offset,
        updatedAt: 2_200 + offset,
      });
    }
    return { communityId, ownerId, privateRootId, replyId, rootId };
  });

  await t.run(async (ctx) => {
    await expect(
      listGeneralChannelAuditCommunitiesCore({
        ctx,
        paginationOpts: { numItems: 10_000, cursor: null },
      }),
    ).resolves.toMatchObject({
      batch_limit: 100,
      scanned: 1,
      community_ids: [String(fixture.communityId)],
      complete: true,
    });
  });
  await t.run(async (ctx) => {
    await expect(
      auditGeneralChannelMigrationBatchCore({
        ctx,
        communityId: fixture.communityId,
        phase: "roots",
        paginationOpts: { numItems: 10_000, cursor: null },
      }),
    ).resolves.toMatchObject({
      read_only: true,
      general_channel_state: "missing",
      general_channel_would_create: true,
      batch_limit: 100,
      scanned: 2,
      would_update: 1,
      intentionally_unchanneled: 1,
      evidence_sync_would_schedule: 1,
      migration_blocked: false,
    });
    expect(await ctx.db.query("communityChannels").collect()).toHaveLength(0);
    expect((await ctx.db.get(fixture.rootId))?.channelId).toBeUndefined();
    expect((await ctx.db.get(fixture.privateRootId))?.channelId).toBeUndefined();
  });

  const channelFixture = await t.run(async (ctx) => {
    const generalChannelId = await ctx.db.insert("communityChannels", {
      communityId: fixture.communityId,
      systemRole: "general",
      slug: "general",
      name: "Community Lobby",
      accessMode: "all_members",
      postingPolicy: "members",
      status: "active",
      position: 0,
      createdAt: 3_000,
      updatedAt: 3_000,
    });
    const otherChannelId = await ctx.db.insert("communityChannels", {
      communityId: fixture.communityId,
      slug: "future-channel",
      name: "Future channel",
      accessMode: "all_members",
      postingPolicy: "members",
      status: "active",
      position: 1,
      createdByUserId: fixture.ownerId,
      createdAt: 3_000,
      updatedAt: 3_000,
    });
    await ctx.db.insert("communityInteractionRoots", {
      communityId: fixture.communityId,
      channelId: otherChannelId,
      actorType: "human",
      actorUserId: fixture.ownerId,
      kind: "discussion",
      status: "live",
      visibilityScope: "community",
      contentSummary: "Unexpected future-channel root",
      replyCount: 0,
      reactionSummary: [],
      idempotencyKey: "channel-audit-other-root",
      createdAt: 3_001,
      updatedAt: 3_001,
    });
    return { generalChannelId };
  });

  await t.run(async (ctx) => {
    await expect(
      auditGeneralChannelMigrationBatchCore({
        ctx,
        communityId: fixture.communityId,
        phase: "roots",
        paginationOpts: { numItems: 100, cursor: null },
      }),
    ).resolves.toMatchObject({
      general_channel_state: "canonical",
      general_channel_id: String(channelFixture.generalChannelId),
      general_channel_display_name: "Community Lobby",
      scanned: 3,
      would_update: 1,
      intentionally_unchanneled: 1,
      unexpected_channel: 1,
      invalid: 1,
      migration_blocked: true,
    });
  });
  await t.run(async (ctx) => {
    await expect(
      auditGeneralChannelMigrationBatchCore({
        ctx,
        communityId: fixture.communityId,
        phase: "replies",
        paginationOpts: { numItems: 100, cursor: null },
      }),
    ).resolves.toMatchObject({
      scanned: 1,
      would_update: 1,
      phase_order_blocked: 1,
      evidence_sync_would_schedule: 1,
      migration_blocked: true,
    });
  });
  for (const phase of ["read_cursors", "typing_presence"] as const) {
    await t.run(async (ctx) => {
      await expect(
        auditGeneralChannelMigrationBatchCore({
          ctx,
          communityId: fixture.communityId,
          phase,
          paginationOpts: { numItems: 100, cursor: null },
        }),
      ).resolves.toMatchObject({
        scanned: 2,
        already_canonical: 0,
        would_update: 0,
        invalid: 2,
        projection_collision_rows: 2,
        migration_blocked: true,
      });
    });
  }

  await t.run(async (ctx) => {
    expect((await ctx.db.get(fixture.rootId))?.channelId).toBeUndefined();
    expect((await ctx.db.get(fixture.replyId))?.channelId).toBeUndefined();
    expect(
      (await ctx.db.query("communityReadCursors").collect()).every(
        (row) => row.channelId === undefined,
      ),
    ).toBe(true);
    expect(
      (await ctx.db.query("communityTypingPresence").collect()).every(
        (row) => row.channelId === undefined,
      ),
    ).toBe(true);
  });
});

test("the audit reports a General slug collision without creating a channel", async () => {
  const t = convexTest(schema, modules);
  const communityId = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "channel-audit-collision-owner",
      displayName: "Channel audit collision owner",
      handle: "channel-audit-collision-owner",
      normalizedHandle: "channel-audit-collision-owner",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const createdCommunityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "channel-audit-collision",
      name: "Channel audit collision",
      visibility: "unlisted",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    await ctx.db.insert("communityChannels", {
      communityId: createdCommunityId,
      slug: "general",
      name: "Impostor",
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
      auditGeneralChannelMigrationBatchCore({
        ctx,
        communityId,
        phase: "roots",
        paginationOpts: { numItems: 100, cursor: null },
      }),
    ).resolves.toMatchObject({
      read_only: true,
      general_channel_state: "slug_collision",
      general_channel_would_create: false,
      migration_blocked: true,
    });
    expect(await ctx.db.query("communityChannels").collect()).toHaveLength(1);
  });
});

/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import schema from "./schema";
import {
  archiveActiveCommunityChannel,
  createActiveCommunityChannel,
  ensureGeneralChannel,
  ensureReplyChannelMatchesRoot,
  getGeneralChannel,
  listSharedChannelReadableRows,
  listChannelProjectionRows,
  listChannelReadableRows,
  listGeneralChannelReadableRows,
  listSharedCommunityChannels,
  requireActiveCommunityChannel,
  requireChannelForAddressableRoot,
  requireCommunityChannelLineage,
  requireSharedChannelForAddressableRow,
  resolveRequestedCommunityChannel,
} from "./communityChannelCore";

const modules = import.meta.glob(["./_generated/**/*.*s"]);

async function createFixture(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "channel-owner",
      displayName: "Channel owner",
      handle: "channel-owner",
      normalizedHandle: "channel-owner",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "channel-community",
      name: "Channel community",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    return { communityId, ownerId };
  });
}

test("General is created exactly once with the immutable system identity", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  await t.run(async (ctx) => {
    const first = await ensureGeneralChannel({
      ctx,
      communityId: fixture.communityId,
      nowMs: 2_000,
    });
    const second = await ensureGeneralChannel({
      ctx,
      communityId: fixture.communityId,
      nowMs: 3_000,
    });
    expect(second._id).toBe(first._id);
    expect(await getGeneralChannel(ctx, fixture.communityId)).toMatchObject({
      _id: first._id,
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
    expect(await ctx.db.query("communityChannels").collect()).toHaveLength(1);
  });
});

test("repeated archive and recreate cycles keep channel slugs unique without unbounded scans", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  await t.run(async (ctx) => {
    const slugs: string[] = [];
    for (let index = 0; index < 13; index += 1) {
      const channel = await createActiveCommunityChannel({
        ctx,
        communityId: fixture.communityId,
        createdByUserId: fixture.ownerId,
        name: "Repeated channel",
        nowMs: 2_000 + index,
      });
      slugs.push(channel.slug);
      await archiveActiveCommunityChannel({
        ctx,
        communityId: fixture.communityId,
        channelId: channel._id,
        nowMs: 3_000 + index,
      });
    }
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.slice(0, 3)).toEqual([
      "repeated-channel",
      "repeated-channel-2",
      "repeated-channel-3",
    ]);
    expect(slugs[11]).toMatch(/^repeated-channel-[a-z0-9]+$/);
  });
});

test("General creation fails closed on slug or system-role collisions", async () => {
  const slugTest = convexTest(schema, modules);
  const slugFixture = await createFixture(slugTest);
  await slugTest.run(async (ctx) => {
    await ctx.db.insert("communityChannels", {
      communityId: slugFixture.communityId,
      slug: "general",
      name: "Impostor",
      accessMode: "all_members",
      postingPolicy: "members",
      status: "active",
      position: 1,
      createdAt: 2_000,
      updatedAt: 2_000,
    });
    await expect(
      ensureGeneralChannel({ ctx, communityId: slugFixture.communityId }),
    ).rejects.toThrow("community_general_channel_slug_conflict");
  });

  const roleTest = convexTest(schema, modules);
  const roleFixture = await createFixture(roleTest);
  await roleTest.run(async (ctx) => {
    for (const suffix of ["a", "b"]) {
      await ctx.db.insert("communityChannels", {
        communityId: roleFixture.communityId,
        systemRole: "general",
        slug: `general-${suffix}`,
        name: "General",
        accessMode: "all_members",
        postingPolicy: "members",
        status: "active",
        position: 0,
        createdAt: 2_000,
        updatedAt: 2_000,
      });
    }
    await expect(
      getGeneralChannel(ctx, roleFixture.communityId),
    ).rejects.toThrow("community_general_channel_duplicate");
  });

  const displayNameTest = convexTest(schema, modules);
  const displayNameFixture = await createFixture(displayNameTest);
  await displayNameTest.run(async (ctx) => {
    const channelId = await ctx.db.insert("communityChannels", {
      communityId: displayNameFixture.communityId,
      systemRole: "general",
      slug: "general",
      name: "Renamed General",
      accessMode: "all_members",
      postingPolicy: "members",
      status: "active",
      position: 0,
      createdAt: 2_000,
      updatedAt: 2_000,
    });
    expect(await getGeneralChannel(ctx, displayNameFixture.communityId)).toMatchObject({
      _id: channelId,
      systemRole: "general",
      slug: "general",
      name: "Renamed General",
    });
  });
});

test("channel-facing roots and replies acquire General while private dock rows remain unchanneled", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  await t.run(async (ctx) => {
    const rootId = await ctx.db.insert("communityInteractionRoots", {
      communityId: fixture.communityId,
      actorType: "human",
      actorUserId: fixture.ownerId,
      kind: "discussion",
      status: "live",
      visibilityScope: "community",
      contentSummary: "Channel root",
      replyCount: 1,
      reactionSummary: [],
      idempotencyKey: "channel-root",
      createdAt: 2_000,
      updatedAt: 2_000,
    });
    const replyId = await ctx.db.insert("communityInteractionReplies", {
      communityId: fixture.communityId,
      rootId,
      seq: 1,
      actorType: "human",
      actorUserId: fixture.ownerId,
      status: "live",
      visibilityScope: "community",
      contentSummary: "Channel reply",
      reactionSummary: [],
      idempotencyKey: "channel-reply",
      createdAt: 2_001,
      updatedAt: 2_001,
    });
    const root = await ctx.db.get(rootId);
    const reply = await ctx.db.get(replyId);
    if (!root || !reply) throw new Error("missing_channel_fixture");
    const channel = await requireChannelForAddressableRoot({ ctx, root });
    await ensureReplyChannelMatchesRoot({ ctx, root, reply });
    expect((await ctx.db.get(rootId))?.channelId).toBe(channel._id);
    expect((await ctx.db.get(replyId))?.channelId).toBe(channel._id);

    const privateRootId = await ctx.db.insert("communityInteractionRoots", {
      communityId: fixture.communityId,
      actorType: "system",
      actorUserId: fixture.ownerId,
      actorAgentKey: "personal_agent",
      kind: "agent_signal",
      status: "live",
      visibilityScope: "private",
      contentSummary: "Private community agent conversation",
      replyCount: 0,
      reactionSummary: [],
      idempotencyKey: "private_member_agent:root:test",
      createdAt: 3_000,
      updatedAt: 3_000,
    });
    const privateRoot = await ctx.db.get(privateRootId);
    if (!privateRoot) throw new Error("missing_private_root_fixture");
    await expect(
      requireChannelForAddressableRoot({ ctx, root: privateRoot }),
    ).rejects.toThrow("interaction_not_channel_addressable");
    expect((await ctx.db.get(privateRootId))?.channelId).toBeUndefined();
  });
});

test("General reads merge legacy rows without admitting private or other-channel activity", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  await t.run(async (ctx) => {
    const general = await ensureGeneralChannel({
      ctx,
      communityId: fixture.communityId,
      nowMs: 2_000,
    });
    const otherChannelId = await ctx.db.insert("communityChannels", {
      communityId: fixture.communityId,
      slug: "other",
      name: "Other",
      accessMode: "all_members",
      postingPolicy: "members",
      status: "active",
      position: 1,
      createdAt: 2_000,
      updatedAt: 2_000,
    });
    const insertRoot = async (args: {
      key: string;
      createdAt: number;
      channelId?: any;
      visibilityScope: "private" | "community" | "public";
    }) =>
      await ctx.db.insert("communityInteractionRoots", {
        communityId: fixture.communityId,
        ...(args.channelId ? { channelId: args.channelId } : {}),
        actorType: "human",
        actorUserId: fixture.ownerId,
        kind: "discussion",
        status: "live",
        visibilityScope: args.visibilityScope,
        contentSummary: args.key,
        replyCount: 0,
        reactionSummary: [],
        idempotencyKey: args.key,
        createdAt: args.createdAt,
        updatedAt: args.createdAt,
      });
    const legacyId = await insertRoot({
      key: "legacy-general",
      createdAt: 2_100,
      visibilityScope: "community",
    });
    const canonicalId = await insertRoot({
      key: "canonical-general",
      createdAt: 2_200,
      channelId: general._id,
      visibilityScope: "public",
    });
    await insertRoot({
      key: "private-dock",
      createdAt: 9_000,
      visibilityScope: "private",
    });
    const otherChannelRootId = await insertRoot({
      key: "other-channel",
      createdAt: 10_000,
      channelId: otherChannelId,
      visibilityScope: "community",
    });

    const rows = await listGeneralChannelReadableRows({
      ctx,
      tableName: "communityInteractionRoots",
      communityId: fixture.communityId,
      generalChannel: general,
      limit: 10,
    });
    expect(rows.map((row) => row._id)).toEqual([canonicalId, legacyId]);

    const otherChannel = await requireActiveCommunityChannel({
      ctx,
      communityId: fixture.communityId,
      channelId: otherChannelId,
    });
    const otherRows = await listChannelReadableRows({
      ctx,
      tableName: "communityInteractionRoots",
      communityId: fixture.communityId,
      channel: otherChannel,
      limit: 10,
    });
    expect(otherRows.map((row) => row._id)).toEqual([otherChannelRootId]);
  });
});

test("active channel resolution fails closed across communities and archived rows", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  await t.run(async (ctx) => {
    const otherCommunityId = await ctx.db.insert("communities", {
      ownerId: fixture.ownerId,
      slug: "other-channel-community",
      name: "Other channel community",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const archivedChannelId = await ctx.db.insert("communityChannels", {
      communityId: fixture.communityId,
      slug: "archived",
      name: "Archived",
      accessMode: "all_members",
      postingPolicy: "members",
      status: "archived",
      position: 1,
      createdAt: 2_000,
      updatedAt: 2_000,
    });

    await expect(
      requireCommunityChannelLineage({
        ctx,
        communityId: fixture.communityId,
        channelId: archivedChannelId,
      }),
    ).resolves.toMatchObject({ status: "archived" });
    await expect(
      requireCommunityChannelLineage({
        ctx,
        communityId: otherCommunityId,
        channelId: archivedChannelId,
      }),
    ).rejects.toThrow("community_channel_invalid");

    await expect(
      requireActiveCommunityChannel({
        ctx,
        communityId: otherCommunityId,
        channelId: archivedChannelId,
      }),
    ).rejects.toThrow("community_channel_invalid");
    await expect(
      requireActiveCommunityChannel({
        ctx,
        communityId: fixture.communityId,
        channelId: archivedChannelId,
      }),
    ).rejects.toThrow("community_channel_inactive");
  });
});

test("requested channels default only omission to General and resolve explicit active channels", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  await t.run(async (ctx) => {
    const legacyGeneral = await resolveRequestedCommunityChannel({
      ctx,
      communityId: fixture.communityId,
    });
    expect(legacyGeneral).toMatchObject({
      _id: undefined,
      systemRole: "general",
      slug: "general",
      status: "active",
    });
    const storedGeneral = await resolveRequestedCommunityChannel({
      ctx,
      communityId: fixture.communityId,
      ensureGeneralForWrite: true,
      nowMs: 2_000,
    });
    expect(storedGeneral._id).toBeTruthy();

    const customChannelId = await ctx.db.insert("communityChannels", {
      communityId: fixture.communityId,
      slug: "custom",
      name: "Custom",
      accessMode: "all_members",
      postingPolicy: "members",
      status: "active",
      position: 1,
      createdByUserId: fixture.ownerId,
      createdAt: 2_100,
      updatedAt: 2_100,
    });
    expect(
      (
        await resolveRequestedCommunityChannel({
          ctx,
          communityId: fixture.communityId,
          channelId: customChannelId,
        })
      )._id,
    ).toBe(customChannelId);
  });
});

test("community aggregate reads merge active channels and preserve exact row ownership", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  await t.run(async (ctx) => {
    const general = await ensureGeneralChannel({
      ctx,
      communityId: fixture.communityId,
      nowMs: 2_000,
    });
    const customChannelId = await ctx.db.insert("communityChannels", {
      communityId: fixture.communityId,
      slug: "custom",
      name: "Custom",
      accessMode: "all_members",
      postingPolicy: "members",
      status: "active",
      position: 1,
      createdByUserId: fixture.ownerId,
      createdAt: 2_000,
      updatedAt: 2_000,
    });
    const insertRoot = async (key: string, createdAt: number, channelId?: any) =>
      await ctx.db.insert("communityInteractionRoots", {
        communityId: fixture.communityId,
        ...(channelId ? { channelId } : {}),
        actorType: "human",
        actorUserId: fixture.ownerId,
        kind: "discussion",
        status: "live",
        visibilityScope: "community",
        contentSummary: key,
        replyCount: 0,
        reactionSummary: [],
        idempotencyKey: key,
        createdAt,
        updatedAt: createdAt,
      });
    const legacyId = await insertRoot("legacy", 2_100);
    const generalId = await insertRoot("general", 2_200, general._id);
    const customId = await insertRoot("custom", 2_300, customChannelId);

    const rows = await listSharedChannelReadableRows({
      ctx,
      tableName: "communityInteractionRoots",
      communityId: fixture.communityId,
      limit: 10,
    });
    expect(rows.map((row) => row._id)).toEqual([customId, generalId, legacyId]);

    const channels = await listSharedCommunityChannels({
      ctx,
      communityId: fixture.communityId,
    });
    expect(
      requireSharedChannelForAddressableRow({
        row: rows[0]!,
        communityId: fixture.communityId,
        channels,
      }).slug,
    ).toBe("custom");
    expect(
      requireSharedChannelForAddressableRow({
        row: rows[2]!,
        communityId: fixture.communityId,
        channels,
      }).slug,
    ).toBe("general");
  });
});

test("custom channel projections never absorb the legacy General lane", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  await t.run(async (ctx) => {
    await ensureGeneralChannel({
      ctx,
      communityId: fixture.communityId,
      nowMs: 2_000,
    });
    const customChannelId = await ctx.db.insert("communityChannels", {
      communityId: fixture.communityId,
      slug: "custom",
      name: "Custom",
      accessMode: "all_members",
      postingPolicy: "members",
      status: "active",
      position: 1,
      createdByUserId: fixture.ownerId,
      createdAt: 2_000,
      updatedAt: 2_000,
    });
    const legacyCursorId = await ctx.db.insert("communityReadCursors", {
      communityId: fixture.communityId,
      userId: fixture.ownerId,
      streamKind: "chat",
      seenThroughAt: 100,
      createdAt: 2_000,
      updatedAt: 2_000,
    });
    const customCursorId = await ctx.db.insert("communityReadCursors", {
      communityId: fixture.communityId,
      channelId: customChannelId,
      userId: fixture.ownerId,
      streamKind: "chat",
      seenThroughAt: 200,
      createdAt: 2_000,
      updatedAt: 2_000,
    });
    const customChannel = await requireActiveCommunityChannel({
      ctx,
      communityId: fixture.communityId,
      channelId: customChannelId,
    });

    const rows = await listChannelProjectionRows({
      ctx,
      tableName: "communityReadCursors",
      communityId: fixture.communityId,
      channel: customChannel,
      userId: fixture.ownerId,
      streamKind: "chat",
    });
    expect(rows.map((row) => row._id)).toEqual([customCursorId]);
    expect(rows.map((row) => row._id)).not.toContain(legacyCursorId);
  });
});

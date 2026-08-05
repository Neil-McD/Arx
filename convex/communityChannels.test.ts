/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityChannels.ts",
  "./communityInteractions.ts",
  "./communityInteractionEvidence.ts",
  "./_generated/**/*.*s",
]);

const OWNER_SUBJECT = "channel-catalog-owner";
const ADMIN_SUBJECT = "channel-catalog-admin";
const MODERATOR_SUBJECT = "channel-catalog-moderator";
const MEMBER_SUBJECT = "channel-catalog-member";
const OUTSIDER_SUBJECT = "channel-catalog-outsider";

async function createFixture(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const nowMs = 1_750_000_000_000;
    const createUser = async (authSubject: string) =>
      await ctx.db.insert("users", {
        authSubject,
        displayName: authSubject,
        handle: authSubject,
        normalizedHandle: authSubject,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    const ownerId = await createUser(OWNER_SUBJECT);
    const adminId = await createUser(ADMIN_SUBJECT);
    const moderatorId = await createUser(MODERATOR_SUBJECT);
    const memberId = await createUser(MEMBER_SUBJECT);
    await createUser(OUTSIDER_SUBJECT);
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "channel-catalog",
      name: "Channel catalog",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 4,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    for (const [userId, role] of [
      [adminId, "admin"],
      [moderatorId, "moderator"],
      [memberId, "member"],
    ] as const) {
      await ctx.db.insert("communityMemberships", {
        communityId,
        userId,
        role,
        accessSource: "manual_grant",
        active: true,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    }
    return { communityId, ownerId };
  });
}

test("owners and admins create ordered all-member channels while members can list them", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const asAdmin = t.withIdentity({ subject: ADMIN_SUBJECT });
  const asMember = t.withIdentity({ subject: MEMBER_SUBJECT });

  await expect(
    asOwner.mutation(api.communityChannels.createCommunityChannel, {
      communityId: fixture.communityId,
      name: "  Product   Design  ",
    }),
  ).resolves.toMatchObject({
    name: "Product Design",
    slug: "product-design",
    position: 1,
    is_general: false,
  });
  await expect(
    asAdmin.mutation(api.communityChannels.createCommunityChannel, {
      communityId: fixture.communityId,
      name: "Engineering",
    }),
  ).resolves.toMatchObject({
    name: "Engineering",
    slug: "engineering",
    position: 2,
    is_general: false,
  });

  await expect(
    asMember.query(api.communityChannels.listCommunityChannels, {
      communityId: fixture.communityId,
    }),
  ).resolves.toMatchObject({
    max_active_channels: 10,
    channels: [
      expect.objectContaining({
        name: "General",
        slug: "general",
        position: 0,
        is_general: true,
      }),
      expect.objectContaining({ name: "Product Design", position: 1 }),
      expect.objectContaining({ name: "Engineering", position: 2 }),
    ],
  });
});

test("managers reorder the exact custom-channel set while General remains fixed", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const asMember = t.withIdentity({ subject: MEMBER_SUBJECT });
  const created = await Promise.all(
    ["Alpha", "Beta", "Gamma"].map((name) =>
      asOwner.mutation(api.communityChannels.createCommunityChannel, {
        communityId: fixture.communityId,
        name,
      })),
  );

  await expect(
    asOwner.mutation(api.communityChannels.reorderCommunityChannels, {
      communityId: fixture.communityId,
      orderedChannelIds: [created[2]!.id, created[0]!.id, created[1]!.id] as any,
    }),
  ).resolves.toMatchObject({
    channels: [
      expect.objectContaining({ name: "General", position: 0 }),
      expect.objectContaining({ name: "Gamma", position: 1 }),
      expect.objectContaining({ name: "Alpha", position: 2 }),
      expect.objectContaining({ name: "Beta", position: 3 }),
    ],
  });

  await expect(
    asMember.mutation(api.communityChannels.reorderCommunityChannels, {
      communityId: fixture.communityId,
      orderedChannelIds: [created[0]!.id, created[1]!.id, created[2]!.id] as any,
    }),
  ).rejects.toThrow("community_forbidden");
  await expect(
    asOwner.mutation(api.communityChannels.reorderCommunityChannels, {
      communityId: fixture.communityId,
      orderedChannelIds: [created[0]!.id, created[0]!.id, created[2]!.id] as any,
    }),
  ).rejects.toThrow("community_channel_order_duplicate_id");
  await expect(
    asOwner.mutation(api.communityChannels.reorderCommunityChannels, {
      communityId: fixture.communityId,
      orderedChannelIds: [created[0]!.id, created[1]!.id] as any,
    }),
  ).rejects.toThrow("community_channel_order_stale");

  const listed = await asMember.query(api.communityChannels.listCommunityChannels, {
    communityId: fixture.communityId,
  });
  await expect(
    asOwner.mutation(api.communityChannels.reorderCommunityChannels, {
      communityId: fixture.communityId,
      orderedChannelIds: [
        listed.channels[0]!.id,
        created[0]!.id,
        created[1]!.id,
        created[2]!.id,
      ] as any,
    }),
  ).rejects.toThrow("community_general_channel_immutable");
});

test("each channel owns one manager-controlled live pinned root", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const asAdmin = t.withIdentity({ subject: ADMIN_SUBJECT });
  const asModerator = t.withIdentity({ subject: MODERATOR_SUBJECT });
  const asMember = t.withIdentity({ subject: MEMBER_SUBJECT });
  const channel = await asOwner.mutation(api.communityChannels.createCommunityChannel, {
    communityId: fixture.communityId,
    name: "Pinned posts",
  });
  const otherChannel = await asOwner.mutation(api.communityChannels.createCommunityChannel, {
    communityId: fixture.communityId,
    name: "Other",
  });
  const { firstRootId, secondRootId, otherRootId, hiddenRootId, privateRootId, systemRootId } = await t.run(async (ctx) => {
    const insertRoot = async (
      channelId: any,
      key: string,
      createdAt: number,
      status: "live" | "hidden" = "live",
      visibilityScope: "community" | "private" = "community",
      actorType: "human" | "system" = "human",
    ) =>
      await ctx.db.insert("communityInteractionRoots", {
        communityId: fixture.communityId,
        channelId,
        actorType,
        ...(actorType === "human" ? { actorUserId: fixture.ownerId } : {}),
        kind: "discussion",
        status,
        visibilityScope,
        contentSummary: key,
        replyCount: 0,
        reactionSummary: [],
        idempotencyKey: key,
        createdAt,
        updatedAt: createdAt,
      });
    return {
      firstRootId: await insertRoot(channel.id, "first-pin", 1_750_000_000_100),
      secondRootId: await insertRoot(channel.id, "second-pin", 1_750_000_000_200),
      otherRootId: await insertRoot(otherChannel.id, "cross-channel", 1_750_000_000_300),
      hiddenRootId: await insertRoot(channel.id, "hidden", 1_750_000_000_400, "hidden"),
      privateRootId: await insertRoot(channel.id, "private", 1_750_000_000_500, "live", "private"),
      systemRootId: await insertRoot(
        channel.id,
        "system",
        1_750_000_000_550,
        "live",
        "community",
        "system",
      ),
    };
  });

  await expect(
    asModerator.mutation(api.communityChannels.setCommunityChannelPinnedRoot, {
      communityId: fixture.communityId,
      channelId: channel.id as any,
      rootId: firstRootId,
    }),
  ).rejects.toThrow("community_forbidden");
  await expect(
    asMember.mutation(api.communityChannels.setCommunityChannelPinnedRoot, {
      communityId: fixture.communityId,
      channelId: channel.id as any,
      rootId: firstRootId,
    }),
  ).rejects.toThrow("community_forbidden");
  await expect(
    asOwner.mutation(api.communityChannels.setCommunityChannelPinnedRoot, {
      communityId: fixture.communityId,
      channelId: channel.id as any,
      rootId: otherRootId,
    }),
  ).rejects.toThrow("community_channel_pin_target_invalid");
  for (const rootId of [hiddenRootId, privateRootId, systemRootId]) {
    await expect(
      asOwner.mutation(api.communityChannels.setCommunityChannelPinnedRoot, {
        communityId: fixture.communityId,
        channelId: channel.id as any,
        rootId,
      }),
    ).rejects.toThrow("community_channel_pin_target_invalid");
  }

  await asOwner.mutation(api.communityChannels.setCommunityChannelPinnedRoot, {
    communityId: fixture.communityId,
    channelId: channel.id as any,
    rootId: firstRootId,
  });
  await expect(
    asMember.query(api.communityInteractions.getCommunityChannelPinnedRoot, {
      communityId: fixture.communityId,
      channelId: channel.id as any,
    }),
  ).resolves.toMatchObject({
    pinned_root: { root: { id: String(firstRootId), content_summary: "first-pin" } },
  });
  await expect(
    asMember.query(api.communityInteractions.getCommunityChannelInteractionRoot, {
      communityId: fixture.communityId,
      channelId: channel.id as any,
      rootId: firstRootId,
    }),
  ).resolves.toMatchObject({
    root: { root: { id: String(firstRootId), content_summary: "first-pin" } },
  });
  await expect(
    asMember.query(api.communityInteractions.getCommunityChannelInteractionRoot, {
      communityId: fixture.communityId,
      channelId: otherChannel.id as any,
      rootId: firstRootId,
    }),
  ).resolves.toEqual({ root: null });

  await asAdmin.mutation(api.communityChannels.setCommunityChannelPinnedRoot, {
    communityId: fixture.communityId,
    channelId: channel.id as any,
    rootId: secondRootId,
  });
  await asAdmin.mutation(api.communityChannels.setCommunityChannelPinnedRoot, {
    communityId: fixture.communityId,
    channelId: channel.id as any,
    rootId: secondRootId,
  });
  await asAdmin.mutation(api.communityChannels.setCommunityChannelPinnedRoot, {
    communityId: fixture.communityId,
    channelId: channel.id as any,
    rootId: null,
  });

  await expect(
    asMember.query(api.communityInteractions.getCommunityChannelPinnedRoot, {
      communityId: fixture.communityId,
      channelId: channel.id as any,
    }),
  ).resolves.toEqual({ pinned_root: null });
  await expect(
    asMember.query(api.communityInteractions.getCommunityChannelInteractionRoot, {
      communityId: fixture.communityId,
      channelId: channel.id as any,
      rootId: secondRootId,
    }),
  ).resolves.toMatchObject({
    root: { root: { id: String(secondRootId), content_summary: "second-pin" } },
  });
  await t.run(async (ctx) => {
    const events = await ctx.db
      .query("communityInteractionModerationEvents")
      .withIndex("by_community_createdAt", (q) => q.eq("communityId", fixture.communityId))
      .collect();
    expect(events.map((event) => event.eventType)).toEqual(["pin", "unpin", "pin", "unpin"]);
  });

  await asOwner.mutation(api.communityChannels.setCommunityChannelPinnedRoot, {
    communityId: fixture.communityId,
    channelId: channel.id as any,
    rootId: firstRootId,
  });
  await asOwner.mutation(api.communityInteractions.deleteCommunityInteractionMessage, {
    targetType: "root",
    targetId: String(firstRootId),
  });
  await expect(
    asMember.query(api.communityInteractions.getCommunityChannelPinnedRoot, {
      communityId: fixture.communityId,
      channelId: channel.id as any,
    }),
  ).resolves.toEqual({ pinned_root: null });
  await t.run(async (ctx) => {
    expect(await ctx.db.get(channel.id as any)).not.toHaveProperty("pinnedRootId");
  });
});

test("legacy General roots can be pinned without creating a second channel lane", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const asMember = t.withIdentity({ subject: MEMBER_SUBJECT });
  const rootId = await t.run(async (ctx) =>
    await ctx.db.insert("communityInteractionRoots", {
      communityId: fixture.communityId,
      actorType: "human",
      actorUserId: fixture.ownerId,
      kind: "discussion",
      status: "live",
      visibilityScope: "community",
      contentSummary: "legacy-general",
      replyCount: 0,
      reactionSummary: [],
      idempotencyKey: "legacy-general",
      createdAt: 1_750_000_000_600,
      updatedAt: 1_750_000_000_600,
    }),
  );

  await asOwner.mutation(api.communityChannels.setCommunityChannelPinnedRoot, {
    communityId: fixture.communityId,
    rootId,
  });
  await expect(
    asMember.query(api.communityInteractions.getCommunityChannelPinnedRoot, {
      communityId: fixture.communityId,
    }),
  ).resolves.toMatchObject({
    pinned_root: { root: { id: String(rootId), channel_id: null } },
  });
  await t.run(async (ctx) => {
    const channels = await ctx.db
      .query("communityChannels")
      .withIndex("by_community_systemRole", (q) =>
        q.eq("communityId", fixture.communityId).eq("systemRole", "general"),
      )
      .collect();
    expect(channels).toHaveLength(1);
    expect(channels[0]).toMatchObject({ pinnedRootId: rootId, position: 0 });
  });
});

test("archiving a channel clears its current pin and preserves an audit event", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const channel = await asOwner.mutation(api.communityChannels.createCommunityChannel, {
    communityId: fixture.communityId,
    name: "Archive pin",
  });
  const rootId = await t.run(async (ctx) =>
    await ctx.db.insert("communityInteractionRoots", {
      communityId: fixture.communityId,
      channelId: channel.id as any,
      actorType: "human",
      actorUserId: fixture.ownerId,
      kind: "discussion",
      status: "live",
      visibilityScope: "community",
      contentSummary: "archive-pin",
      replyCount: 0,
      reactionSummary: [],
      idempotencyKey: "archive-pin",
      createdAt: 1_750_000_000_700,
      updatedAt: 1_750_000_000_700,
    }),
  );
  await asOwner.mutation(api.communityChannels.setCommunityChannelPinnedRoot, {
    communityId: fixture.communityId,
    channelId: channel.id as any,
    rootId,
  });
  await asOwner.mutation(api.communityChannels.deleteCommunityChannel, {
    communityId: fixture.communityId,
    channelId: channel.id as any,
  });

  await t.run(async (ctx) => {
    const stored = await ctx.db.get(channel.id as any);
    expect(stored).toMatchObject({ status: "archived" });
    expect(stored).not.toHaveProperty("pinnedRootId");
    const events = await ctx.db
      .query("communityInteractionModerationEvents")
      .withIndex("by_community_createdAt", (q) => q.eq("communityId", fixture.communityId))
      .collect();
    expect(events.map((event) => [event.eventType, event.reason ?? null])).toEqual([
      ["pin", null],
      ["unpin", "channel_archived"],
    ]);
  });
});

test("legacy communities list a synthetic General channel before durable backfill", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asMember = t.withIdentity({ subject: MEMBER_SUBJECT });

  await expect(
    asMember.query(api.communityChannels.listCommunityChannels, {
      communityId: fixture.communityId,
    }),
  ).resolves.toEqual({
    max_active_channels: 10,
    channels: [
      expect.objectContaining({
        id: "",
        name: "General",
        slug: "general",
        position: 0,
        is_general: true,
      }),
    ],
  });
  expect(
    await t.run(async (ctx) => await ctx.db.query("communityChannels").collect()),
  ).toEqual([]);
});

test("channel creation is manager-only and listing requires community access", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const asMember = t.withIdentity({ subject: MEMBER_SUBJECT });
  const asOutsider = t.withIdentity({ subject: OUTSIDER_SUBJECT });

  await asOwner.mutation(api.communityChannels.createCommunityChannel, {
    communityId: fixture.communityId,
    name: "Announcements",
  });
  await expect(
    asMember.mutation(api.communityChannels.createCommunityChannel, {
      communityId: fixture.communityId,
      name: "Member-created",
    }),
  ).rejects.toThrow("community_forbidden");
  await expect(
    asOutsider.query(api.communityChannels.listCommunityChannels, {
      communityId: fixture.communityId,
    }),
  ).rejects.toThrow("community_entitlement_required");
});

test("channel creation enforces the ten-channel cap and normalized-name uniqueness", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });

  await asOwner.mutation(api.communityChannels.createCommunityChannel, {
    communityId: fixture.communityId,
    name: "Product & Design",
  });
  await expect(
    asOwner.mutation(api.communityChannels.createCommunityChannel, {
      communityId: fixture.communityId,
      name: " product & DESIGN ",
    }),
  ).rejects.toThrow("community_channel_name_taken");
  await expect(
    asOwner.mutation(api.communityChannels.createCommunityChannel, {
      communityId: fixture.communityId,
      name: "Product Design",
    }),
  ).resolves.toMatchObject({ slug: "product-design-2" });

  for (let index = 3; index <= 9; index += 1) {
    await asOwner.mutation(api.communityChannels.createCommunityChannel, {
      communityId: fixture.communityId,
      name: `Channel ${index}`,
    });
  }
  await expect(
    asOwner.mutation(api.communityChannels.createCommunityChannel, {
      communityId: fixture.communityId,
      name: "Channel 10",
    }),
  ).rejects.toThrow("community_channel_limit_reached");

  const catalog = await asOwner.query(
    api.communityChannels.listCommunityChannels,
    { communityId: fixture.communityId },
  );
  expect(catalog.channels).toHaveLength(10);
});

test("channel names are required and bounded before any custom row is written", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });

  await expect(
    asOwner.mutation(api.communityChannels.createCommunityChannel, {
      communityId: fixture.communityId,
      name: "   ",
    }),
  ).rejects.toThrow("community_channel_name_required");
  await expect(
    asOwner.mutation(api.communityChannels.createCommunityChannel, {
      communityId: fixture.communityId,
      name: "x".repeat(49),
    }),
  ).rejects.toThrow("community_channel_name_too_long");

  expect(await t.run(async (ctx) => await ctx.db.query("communityChannels").collect())).toEqual([]);
});

test("managers rename and soft-delete custom channels while General stays immutable", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const asAdmin = t.withIdentity({ subject: ADMIN_SUBJECT });
  const asMember = t.withIdentity({ subject: MEMBER_SUBJECT });

  const created = await asOwner.mutation(api.communityChannels.createCommunityChannel, {
    communityId: fixture.communityId,
    name: "Product",
  });
  const adminCreated = await asAdmin.mutation(api.communityChannels.createCommunityChannel, {
    communityId: fixture.communityId,
    name: "Operations",
  });
  const catalog = await asOwner.query(api.communityChannels.listCommunityChannels, {
    communityId: fixture.communityId,
  });
  const general = catalog.channels.find((channel: any) => channel.is_general);
  if (!general) throw new Error("general_channel_missing");

  await expect(
    asOwner.mutation(api.communityChannels.renameCommunityChannel, {
      communityId: fixture.communityId,
      channelId: created.id as any,
      name: "  Product   Feedback  ",
    }),
  ).resolves.toMatchObject({
    id: created.id,
    name: "Product Feedback",
    slug: "product",
  });
  await expect(
    asMember.mutation(api.communityChannels.renameCommunityChannel, {
      communityId: fixture.communityId,
      channelId: created.id as any,
      name: "Member rename",
    }),
  ).rejects.toThrow("community_forbidden");
  await expect(
    asAdmin.mutation(api.communityChannels.renameCommunityChannel, {
      communityId: fixture.communityId,
      channelId: adminCreated.id as any,
      name: "Operations Hub",
    }),
  ).resolves.toMatchObject({
    id: adminCreated.id,
    name: "Operations Hub",
    slug: "operations",
  });
  await expect(
    asOwner.mutation(api.communityChannels.renameCommunityChannel, {
      communityId: fixture.communityId,
      channelId: created.id as any,
      name: "operations hub",
    }),
  ).rejects.toThrow("community_channel_name_taken");
  await expect(
    asOwner.mutation(api.communityChannels.renameCommunityChannel, {
      communityId: fixture.communityId,
      channelId: general.id as any,
      name: "Lobby",
    }),
  ).rejects.toThrow("community_general_channel_immutable");

  const otherChannelId = await t.run(async (ctx) => {
    const otherCommunityId = await ctx.db.insert("communities", {
      ownerId: fixture.ownerId,
      slug: "other-managed-channel-catalog",
      name: "Other managed channel catalog",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: 1_750_000_000_000,
      updatedAt: 1_750_000_000_000,
    });
    return await ctx.db.insert("communityChannels", {
      communityId: otherCommunityId,
      slug: "other-custom",
      name: "Other custom",
      accessMode: "all_members",
      postingPolicy: "members",
      status: "active",
      position: 1,
      createdByUserId: fixture.ownerId,
      createdAt: 1_750_000_000_000,
      updatedAt: 1_750_000_000_000,
    });
  });
  await expect(
    asOwner.mutation(api.communityChannels.renameCommunityChannel, {
      communityId: fixture.communityId,
      channelId: otherChannelId,
      name: "Cross-community rename",
    }),
  ).rejects.toThrow("community_channel_unavailable");
  await expect(
    asOwner.mutation(api.communityChannels.deleteCommunityChannel, {
      communityId: fixture.communityId,
      channelId: general.id as any,
    }),
  ).rejects.toThrow("community_general_channel_immutable");
  await expect(
    asAdmin.mutation(api.communityChannels.deleteCommunityChannel, {
      communityId: fixture.communityId,
      channelId: adminCreated.id as any,
    }),
  ).resolves.toEqual({
    deleted_channel_id: adminCreated.id,
    deleted_channel_slug: "operations",
  });

  const rootId = await t.run(async (ctx) =>
    await ctx.db.insert("communityInteractionRoots", {
      communityId: fixture.communityId,
      channelId: created.id as any,
      actorType: "human",
      kind: "discussion",
      status: "live",
      visibilityScope: "community",
      contentSummary: "Retained after channel deletion",
      replyCount: 0,
      reactionSummary: [],
      idempotencyKey: "retained-channel-root",
      createdAt: 1_750_000_000_100,
      updatedAt: 1_750_000_000_100,
    }),
  );
  await expect(
    asMember.mutation(api.communityChannels.deleteCommunityChannel, {
      communityId: fixture.communityId,
      channelId: created.id as any,
    }),
  ).rejects.toThrow("community_forbidden");
  await expect(
    asOwner.mutation(api.communityChannels.deleteCommunityChannel, {
      communityId: fixture.communityId,
      channelId: created.id as any,
    }),
  ).resolves.toEqual({
    deleted_channel_id: created.id,
    deleted_channel_slug: "product",
  });
  await expect(
    asOwner.mutation(api.communityChannels.deleteCommunityChannel, {
      communityId: fixture.communityId,
      channelId: created.id as any,
    }),
  ).resolves.toEqual({
    deleted_channel_id: created.id,
    deleted_channel_slug: "product",
  });

  const afterDelete = await asOwner.query(api.communityChannels.listCommunityChannels, {
    communityId: fixture.communityId,
  });
  expect(afterDelete.channels.map((channel: any) => channel.id)).not.toContain(created.id);
  await t.run(async (ctx) => {
    expect(await ctx.db.get(created.id as any)).toMatchObject({
      status: "archived",
      name: "Product Feedback",
      slug: "product",
    });
    expect(await ctx.db.get(rootId)).toMatchObject({ channelId: created.id });
  });

  await expect(
    asOwner.mutation(api.communityChannels.renameCommunityChannel, {
      communityId: fixture.communityId,
      channelId: created.id as any,
      name: "Archived rename",
    }),
  ).rejects.toThrow("community_channel_unavailable");
});

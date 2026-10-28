/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { listSharedCommunityChannels, listSharedChannelReadableRows } from "./communityChannelCore";

const modules = import.meta.glob([
  "./communityChannels.ts",
  "./communityAttention.ts",
  "./communityInteractions.ts",
  "./communityInteractionEvidence.ts",
  "./_generated/**/*.*s",
]);

const OWNER_SUBJECT = "channel-catalog-owner";
const ADMIN_SUBJECT = "channel-catalog-admin";
const MODERATOR_SUBJECT = "channel-catalog-moderator";
const MEMBER_SUBJECT = "channel-catalog-member";
const OUTSIDER_SUBJECT = "channel-catalog-outsider";

test("paged directory isolates member grants from 120 private rooms and bounds manager pages", async () => {
  const t = convexTest(schema, modules), f = await createFixture(t);
  const owner = t.withIdentity({ subject: OWNER_SUBJECT }), member = t.withIdentity({ subject: MEMBER_SUBJECT });
  await owner.mutation(api.communityChannels.createCommunityChannel, { communityId: f.communityId, name: "Shared" });
  const seeded = await t.run(async ctx => {
    const membership = (await ctx.db.query("communityMemberships").collect()).find(m => m.role === "member")!;
    let last: any;
    for (let i = 0; i < 120; i++) last = await ctx.db.insert("communityChannels", {
      communityId: f.communityId, name: `Client ${i}`, slug: `client-${i}`, accessMode: "restricted",
      postingPolicy: "members", status: "active", position: i + 2, createdByUserId: f.ownerId, createdAt: i, updatedAt: i,
    });
    const grant = await ctx.db.insert("communityChannelParticipants", { communityId: f.communityId, channelId: last,
      principalKey: `user:${membership.userId}`, membershipId: membership._id, membershipActivationSequence: 0,
      status: "active", createdByUserId: f.ownerId, createdAt: 1, updatedAt: 1 });
    return { last, grant, membership };
  });
  const args = { communityId: f.communityId, section: "private" as const, paginationOpts: { cursor: null, numItems: 1000 } };
  const first = await owner.query(api.communityChannels.listCommunityChannelPage, args);
  expect(first.page).toHaveLength(50); expect(first.isDone).toBe(false);
  const second = await owner.query(api.communityChannels.listCommunityChannelPage, { ...args, paginationOpts: { cursor: first.continueCursor, numItems: 50 } });
  const third = await owner.query(api.communityChannels.listCommunityChannelPage, { ...args, paginationOpts: { cursor: second.continueCursor, numItems: 50 } });
  expect(new Set([...first.page, ...second.page, ...third.page].map(c => c.id)).size).toBe(120);
  expect(third.isDone).toBe(true);
  const own = await member.query(api.communityChannels.listCommunityChannelPage, args);
  expect(own.page.map(c => c.id)).toEqual([seeded.last]); expect(own.isDone).toBe(true);
  await t.run(ctx => ctx.db.insert("communityInteractionRoots", {
    communityId: f.communityId, channelId: seeded.last, actorType: "human", actorUserId: f.ownerId,
    kind: "discussion", status: "live", visibilityScope: "community", contentSummary: "Late room unread",
    replyCount: 0, reactionSummary: [], idempotencyKey: "late-room", createdAt: 10000, updatedAt: 10000,
  }));
  const attentionArgs = { ...args, paginationOpts: { cursor: null, numItems: 1000 } };
  const ownAttention = await member.query(api.communityAttention.listMyCommunityAttentionPage, attentionArgs);
  expect(ownAttention.page).toEqual([expect.objectContaining({ channel_id: String(seeded.last), chat: true })]);
  let attentionCursor: string | null = null;
  const attentionRows: any[] = [];
  do {
    const page: any = await owner.query(api.communityAttention.listMyCommunityAttentionPage, {
      ...attentionArgs, paginationOpts: { cursor: attentionCursor, numItems: 1000 },
    });
    expect(page.page.length).toBeLessThanOrEqual(10);
    attentionRows.push(...page.page);
    attentionCursor = page.isDone ? null : page.continueCursor;
  } while (attentionCursor);
  expect(attentionRows).toHaveLength(120);
  expect(attentionRows[attentionRows.length - 1]).toMatchObject({ channel_id: String(seeded.last), chat: true });
  let agentCursor: string | undefined;
  const agentRows: any[] = [];
  do {
    const page: any = await t.query(internal.communityChannels.listCommunityChannelPageInternal, {
      communityId: f.communityId, userId: f.ownerId, actorKind: "external_mcp", cursor: agentCursor,
    });
    expect(page.channels.length).toBeLessThanOrEqual(50);
    agentRows.push(...page.channels); agentCursor = page.next_cursor ?? undefined;
  } while (agentCursor);
  expect(new Set(agentRows.map(row => row.id)).size).toBe(122);
  const sharedAgent = await t.query(internal.communityChannels.listCommunityChannelPageInternal, {
    communityId: f.communityId, userId: f.ownerId, actorKind: "community_agent",
  });
  expect(sharedAgent.channels.map(c => c.name)).toEqual(["General", "Shared"]);
  expect(sharedAgent.next_cursor).toBeNull();
  const memberDirectory = await t.query(internal.communityChannels.listCommunityChannelPageInternal, {
    communityId: f.communityId, userId: seeded.membership.userId, actorKind: "external_mcp",
  });
  await expect(t.query(internal.communityChannels.listCommunityChannelPageInternal, {
    communityId: f.communityId, userId: f.ownerId, actorKind: "external_mcp", cursor: memberDirectory.next_cursor!,
  })).rejects.toThrow("community_channel_cursor_invalid");
  expect((await member.query(api.communityChannels.listCommunityChannelPage, { ...args, section: "shared" })).page.map(c => c.name)).toEqual(["General", "Shared"]);
  await t.run(ctx => ctx.db.patch(seeded.membership._id, { activationSequence: 1 }));
  expect((await member.query(api.communityChannels.listCommunityChannelPage, args)).page).toEqual([]);
  expect((await member.query(api.communityAttention.listMyCommunityAttentionPage, attentionArgs)).page).toEqual([]);
  await t.run(ctx => ctx.db.patch(seeded.grant, { membershipActivationSequence: 1 }));
  expect((await member.query(api.communityChannels.listCommunityChannelPage, args)).page).toHaveLength(1);
  await t.run(ctx => ctx.db.patch(seeded.grant, { status: "revoked" }));
  expect((await member.query(api.communityChannels.listCommunityChannelPage, args)).page).toEqual([]);
  expect((await member.query(api.communityAttention.listMyCommunityAttentionPage, attentionArgs)).page).toEqual([]);
  await t.run(ctx => ctx.db.patch(seeded.last, { status: "archived" }));
  expect((await member.query(api.communityAttention.listMyCommunityAttentionPage, attentionArgs)).page).toEqual([]);
  await expect(t.withIdentity({ subject: OUTSIDER_SUBJECT }).query(api.communityChannels.listCommunityChannelPage, args)).rejects.toThrow();
});

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

test("managers move one channel between current neighbors while General remains fixed", async () => {
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
    asOwner.mutation(api.communityChannels.moveCommunityChannel, {
      communityId: fixture.communityId,
      channelId: created[2]!.id as any, afterChannelId: null, beforeChannelId: created[0]!.id as any,
      expectedPosition: created[2]!.position,
    }),
  ).resolves.toMatchObject({
    name: "Gamma", position: 0.5,
  });

  await expect(
    asMember.mutation(api.communityChannels.moveCommunityChannel, {
      communityId: fixture.communityId,
      channelId: created[0]!.id as any, afterChannelId: null, beforeChannelId: null, expectedPosition: 1,
    }),
  ).rejects.toThrow("community_forbidden");
  await expect(
    asOwner.mutation(api.communityChannels.moveCommunityChannel, {
      communityId: fixture.communityId,
      channelId: created[0]!.id as any, afterChannelId: created[0]!.id as any, beforeChannelId: null, expectedPosition: 1,
    }),
  ).rejects.toThrow("community_channel_order_duplicate_id");
  await expect(
    asOwner.mutation(api.communityChannels.moveCommunityChannel, {
      communityId: fixture.communityId,
      channelId: created[0]!.id as any, afterChannelId: null, beforeChannelId: created[1]!.id as any, expectedPosition: 1,
    }),
  ).rejects.toThrow("community_channel_order_stale");

  const listed = await asMember.query(api.communityChannels.listCommunityChannels, {
    communityId: fixture.communityId,
  });
  await expect(
    asOwner.mutation(api.communityChannels.moveCommunityChannel, {
      communityId: fixture.communityId,
      channelId: listed.channels[0]!.id as any, afterChannelId: null, beforeChannelId: null, expectedPosition: 0,
    }),
  ).rejects.toThrow("community_general_channel_immutable");
  expect(listed.channels.map(c => [c.name, c.position])).toEqual([["General", 0], ["Gamma", 0.5], ["Alpha", 1], ["Beta", 2]]);
});

test("indexed names and neighbor moves work beyond the retained creation cap", async () => {
  const t = convexTest(schema, modules), f = await createFixture(t);
  const owner = t.withIdentity({ subject: OWNER_SUBJECT });
  await owner.mutation(api.communityChannels.createCommunityChannel, { communityId: f.communityId, name: "Shared" });
  const ids = await t.run(async ctx => {
    const ids = [];
    for (let i = 0; i < 120; i++) ids.push(await ctx.db.insert("communityChannels", {
      communityId: f.communityId, name: `Client ${i}`, slug: `client-${i}`, accessMode: "restricted",
      postingPolicy: "members", status: "active", position: i + 2, createdAt: i, updatedAt: i,
    }));
    return ids;
  });
  await expect(owner.mutation(api.communityChannels.renameCommunityChannel, {
    communityId: f.communityId, channelId: ids[119]!, name: "Renamed",
  })).rejects.toThrow("community_channel_name_migration_required");
  let cursor: string | null = null;
  let updated = 0;
  do {
    const result: { updated: number; isDone: boolean; continueCursor: string } = await t.mutation(internal.communityChannels.backfillChannelNamesInternal, {
      paginationOpts: { cursor, numItems: 40 },
    });
    updated += result.updated;
    cursor = result.isDone ? null : result.continueCursor;
  } while (cursor);
  expect(updated).toBe(120);
  await expect(owner.mutation(api.communityChannels.renameCommunityChannel, {
    communityId: f.communityId, channelId: ids[119]!, name: "  CLIENT   118 ",
  })).rejects.toThrow("community_channel_name_taken");
  await owner.mutation(api.communityChannels.renameCommunityChannel, {
    communityId: f.communityId, channelId: ids[119]!, name: "Renamed",
  });
  const before = await t.run(ctx => ctx.db.query("communityChannels").collect());
  await owner.mutation(api.communityChannels.moveCommunityChannel, {
    communityId: f.communityId, channelId: ids[119]!, afterChannelId: ids[49]!, beforeChannelId: ids[50]!, expectedPosition: 121,
  });
  const after = await t.run(ctx => ctx.db.query("communityChannels").collect());
  expect(after.filter((row, i) => row.position !== before[i]!.position).map(row => row._id)).toEqual([ids[119]]);
  expect(after.find(row => row._id === ids[119])!.position).toBe(51.5);
  await expect(owner.mutation(api.communityChannels.moveCommunityChannel, {
    communityId: f.communityId, channelId: ids[119]!, afterChannelId: ids[49]!, beforeChannelId: ids[50]!, expectedPosition: 121,
  })).rejects.toThrow("community_channel_order_stale");
  await expect(owner.mutation(api.communityChannels.createCommunityChannel, {
    communityId: f.communityId, name: "Still capped", accessMode: "restricted",
  })).rejects.toThrow("community_private_channel_limit_reached");
});

test("move rejects exhausted gaps and cross-community neighbors without rewriting rows", async () => {
  const t = convexTest(schema, modules), f = await createFixture(t);
  const owner = t.withIdentity({ subject: OWNER_SUBJECT });
  const a = await owner.mutation(api.communityChannels.createCommunityChannel, { communityId: f.communityId, name: "A" });
  const b = await owner.mutation(api.communityChannels.createCommunityChannel, { communityId: f.communityId, name: "B" });
  const c = await owner.mutation(api.communityChannels.createCommunityChannel, { communityId: f.communityId, name: "C" });
  await t.run(ctx => ctx.db.patch(b.id as any, { position: 1 + Number.EPSILON }));
  const args = { communityId: f.communityId, channelId: c.id as any, afterChannelId: a.id as any, beforeChannelId: b.id as any, expectedPosition: 3 };
  await expect(owner.mutation(api.communityChannels.moveCommunityChannel, args)).rejects.toThrow("community_channel_order_space_exhausted");
  const foreign = await t.run(async ctx => {
    const community = await ctx.db.get(f.communityId);
    const { _id, _creationTime, ...fields } = community!;
    const other = await ctx.db.insert("communities", { ...fields, slug: "other" });
    return await ctx.db.insert("communityChannels", { communityId: other, name: "Foreign", normalizedName: "foreign", slug: "foreign", status: "active", accessMode: "restricted", postingPolicy: "members", position: 1, createdAt: 1, updatedAt: 1 });
  });
  await expect(owner.mutation(api.communityChannels.moveCommunityChannel, { ...args, afterChannelId: foreign })).rejects.toThrow("community_channel_unavailable");
  expect((await t.run(ctx => ctx.db.get(c.id as Id<"communityChannels">)))!.position).toBe(3);
});

test("concurrent names and appends remain unique; competing moves cannot overwrite a changed target", async () => {
  const t = convexTest(schema, modules), f = await createFixture(t);
  const owner = t.withIdentity({ subject: OWNER_SUBJECT });
  const results = await Promise.allSettled(["Alpha", " ALPHA "].map(name => owner.mutation(api.communityChannels.createCommunityChannel, { communityId: f.communityId, name })));
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  const [b, c] = await Promise.all(["Beta", "Gamma"].map(name => owner.mutation(api.communityChannels.createCommunityChannel, { communityId: f.communityId, name })));
  expect(b!.position).not.toBe(c!.position);
  const rows = await t.run(ctx => ctx.db.query("communityChannels").collect());
  const first = rows.find(row => row.position === 1)!;
  const moves = await Promise.allSettled([0, 1].map(() => owner.mutation(api.communityChannels.moveCommunityChannel, {
    communityId: f.communityId, channelId: c!.id as any, afterChannelId: null, beforeChannelId: first._id, expectedPosition: c!.position,
  })));
  expect(moves.filter(r => r.status === "fulfilled")).toHaveLength(1);
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
  ).rejects.toThrow("community_shared_channel_limit_reached");

  const catalog = await asOwner.query(
    api.communityChannels.listCommunityChannels,
    { communityId: fixture.communityId },
  );
  expect(catalog.channels).toHaveLength(10);
});

test("100 private rooms coexist with 10 shared rooms; creation and conversion share transactional limits", async () => {
  const t = convexTest(schema, modules), f = await createFixture(t);
  const owner = t.withIdentity({ subject: OWNER_SUBJECT });
  const shared: Array<{ id: string }> = [];
  for (let i = 0; i < 9; i++) shared.push(await owner.mutation(api.communityChannels.createCommunityChannel, {
    communityId: f.communityId, name: `Shared ${i}`,
  }));
  const privateRooms: Array<{ id: string }> = [];
  for (let i = 0; i < 99; i++) privateRooms.push(await owner.mutation(api.communityChannels.createCommunityChannel, {
    communityId: f.communityId, name: `Client ${i}`, accessMode: "restricted",
  }));
  const competing = await Promise.allSettled(["Last A", "Last B"].map(name => owner.mutation(api.communityChannels.createCommunityChannel, {
    communityId: f.communityId, name, accessMode: "restricted",
  })));
  expect(competing.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(competing.filter(result => result.status === "rejected")).toHaveLength(1);
  const rows = await t.run(ctx => ctx.db.query("communityChannels").collect());
  expect(rows.filter(row => row.accessMode === "restricted")).toHaveLength(100);
  expect(rows.filter(row => row.accessMode === "all_members")).toHaveLength(10);
  expect(new Set(rows.map(row => row.position)).size).toBe(110);
  await expect(owner.mutation(api.communityChannels.createCommunityChannel, { communityId: f.communityId, name: "Shared overflow" }))
    .rejects.toThrow("community_shared_channel_limit_reached");
  const convert = (channelId: string, expectedAccessMode: "restricted" | "all_members", accessMode: "restricted" | "all_members") =>
    owner.mutation(api.communityChannels.setChannelAccess, { communityId: f.communityId, channelId: channelId as any,
      expectedAccessMode, accessMode, acknowledgeHistoryExposure: true });
  await expect(convert(privateRooms[0]!.id, "restricted", "all_members")).rejects.toThrow("community_shared_channel_limit_reached");
  await expect(convert(shared[0]!.id, "all_members", "restricted")).rejects.toThrow("community_private_channel_limit_reached");
  // No-op at capacity still succeeds; archive frees only that audience's slot.
  await convert(privateRooms[0]!.id, "restricted", "restricted");
  await owner.mutation(api.communityChannels.deleteCommunityChannel, { communityId: f.communityId, channelId: privateRooms[1]!.id as any });
  await convert(shared[0]!.id, "all_members", "restricted");
  await convert(shared[0]!.id, "restricted", "all_members");
  await owner.mutation(api.communityChannels.createCommunityChannel, { communityId: f.communityId, name: "Replacement", accessMode: "restricted" });
  await expect(owner.query(api.communityChannels.listCommunityChannels, { communityId: f.communityId })).rejects.toThrow("community_channel_refresh_required");
  await expect(owner.query(api.communityAttention.listMyCommunityAttention, { communityIds: [f.communityId] })).rejects.toThrow("community_channel_refresh_required");
  const sharedRows = await t.run(ctx => listSharedCommunityChannels({ ctx, communityId: f.communityId }));
  expect(sharedRows).toHaveLength(10);
  expect(sharedRows.every(row => row.accessMode === "all_members")).toBe(true);
  await t.run(async ctx => {
    for (const channelId of [shared[0]!.id, privateRooms[0]!.id]) await ctx.db.insert("communityInteractionRoots", {
      communityId: f.communityId, channelId: channelId as any, actorType: "human", actorUserId: f.ownerId,
      kind: "discussion", status: "live", visibilityScope: "community", contentSummary: channelId,
      replyCount: 0, reactionSummary: [], idempotencyKey: channelId, createdAt: 10000, updatedAt: 10000,
    });
  });
  const contextRows = await t.run(ctx => listSharedChannelReadableRows({ ctx, communityId: f.communityId,
    tableName: "communityInteractionRoots", limit: 24 }));
  expect(contextRows.map(row => String(row.channelId))).toEqual([shared[0]!.id]);
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
  const general = catalog.channels.find((channel) => channel.is_general);
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
  expect(afterDelete.channels.map((channel) => channel.id)).not.toContain(created.id);
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

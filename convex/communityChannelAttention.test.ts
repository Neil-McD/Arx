/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityAttention.ts",
  "./_generated/**/*.*s",
]);

test("attention and acknowledgements remain independent per channel", async () => {
  const t = convexTest(schema, modules);
  const fixture = await t.run(async (ctx) => {
    const createUser = async (subject: string) =>
      await ctx.db.insert("users", {
        authSubject: subject,
        displayName: subject,
        handle: subject,
        normalizedHandle: subject,
        createdAt: 1_000,
        updatedAt: 1_000,
      });
    const ownerId = await createUser("channel-attention-owner");
    const memberId = await createUser("channel-attention-member");
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "channel-attention",
      name: "Channel attention",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 2,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    await ctx.db.insert("communityMemberships", {
      communityId,
      userId: memberId,
      role: "member",
      accessSource: "manual_grant",
      active: true,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const generalChannelId = await ctx.db.insert("communityChannels", {
      communityId,
      systemRole: "general",
      slug: "general",
      name: "General",
      accessMode: "all_members",
      postingPolicy: "members",
      status: "active",
      position: 0,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const customChannelId = await ctx.db.insert("communityChannels", {
      communityId,
      slug: "custom",
      name: "Custom",
      accessMode: "all_members",
      postingPolicy: "members",
      status: "active",
      position: 1,
      createdByUserId: ownerId,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const insertRoot = async (channelId: any, key: string, createdAt: number) =>
      await ctx.db.insert("communityInteractionRoots", {
        communityId,
        channelId,
        actorType: "human",
        actorUserId: ownerId,
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
    await insertRoot(generalChannelId, "general-root", 2_000);
    const customRootId = await insertRoot(
      customChannelId,
      "custom-root",
      3_000,
    );
    await ctx.db.insert("communityInteractionMentions", {
      communityId,
      channelId: customChannelId,
      rootId: customRootId,
      mentionKind: "user",
      mentionedUserId: memberId,
      notifyState: "pending",
      createdAt: 3_000,
      updatedAt: 3_000,
    });
    return { communityId, generalChannelId, customChannelId };
  });
  const asMember = t.withIdentity({ subject: "channel-attention-member" });

  const initial = await asMember.query(
    api.communityAttention.listMyCommunityAttention,
    { communityIds: [fixture.communityId] },
  );
  expect(initial[0]).toMatchObject({ chat: true });
  expect(initial[0]?.channels).toEqual([
    expect.objectContaining({
      channel_slug: "general",
      chat: true,
      mentions: false,
    }),
    expect.objectContaining({
      channel_slug: "custom",
      chat: true,
      mentions: true,
    }),
  ]);

  await asMember.mutation(
    api.communityAttention.acknowledgeCommunityChatRead,
    {
      communityId: fixture.communityId,
      channelId: fixture.customChannelId,
      throughAtMs: 3_000,
    },
  );
  const afterCustom = await asMember.query(
    api.communityAttention.listMyCommunityAttention,
    { communityIds: [fixture.communityId] },
  );
  expect(afterCustom[0]?.chat).toBe(true);
  expect(
    afterCustom[0]?.channels.find((row) => row.channel_slug === "custom")?.chat,
  ).toBe(false);
  expect(
    afterCustom[0]?.channels.find((row) => row.channel_slug === "custom")
      ?.mentions,
  ).toBe(false);
  expect(
    afterCustom[0]?.channels.find((row) => row.channel_slug === "general")?.chat,
  ).toBe(true);

  await asMember.mutation(
    api.communityAttention.acknowledgeCommunityChatRead,
    { communityId: fixture.communityId, throughAtMs: 2_000 },
  );
  const afterGeneral = await asMember.query(
    api.communityAttention.listMyCommunityAttention,
    { communityIds: [fixture.communityId] },
  );
  expect(afterGeneral[0]?.chat).toBe(false);
});

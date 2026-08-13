/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import { MAX_COMMUNITY_ATTENTION_COMMUNITIES_PER_QUERY } from "../shared/communityAttentionContract";
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

test("resource attention inspects only recent referenced modules and fails closed across communities", async () => {
  const t = convexTest(schema, modules);
  const fixture = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "resource-attention-owner",
      displayName: "resource-attention-owner",
      handle: "resource-attention-owner",
      normalizedHandle: "resource-attention-owner",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const insertCommunity = async (slug: string) => {
      const communityId = await ctx.db.insert("communities", {
        ownerId,
        slug,
        name: slug,
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
        createdAt: 1_000,
        updatedAt: 1_000,
      });
      return communityId;
    };
    const communityId = await insertCommunity("resource-attention");
    const foreignCommunityId = await insertCommunity("resource-attention-foreign");
    const insertModule = async (targetCommunityId: any, status: "draft" | "live", name: string) =>
      await ctx.db.insert("communityResourceModules", {
        communityId: targetCommunityId,
        createdByUserId: ownerId,
        status,
        name,
        sortOrder: 0,
        createdAt: 1_000,
        updatedAt: 1_000,
      });
    const liveModuleId = await insertModule(communityId, "live", "Live");
    const draftModuleId = await insertModule(communityId, "draft", "Draft");
    const foreignModuleId = await insertModule(foreignCommunityId, "live", "Foreign");
    const insertPage = async (moduleId: any, title: string, createdAt: number) =>
      await ctx.db.insert("communityResources", {
        communityId,
        moduleId,
        createdByUserId: ownerId,
        type: "page",
        role: "page",
        status: "published",
        title,
        bodyMd: `${title} body`,
        pinned: false,
        createdAt,
        updatedAt: createdAt,
      });
    await insertPage(liveModuleId, "Visible", 2_000);
    await insertPage(draftModuleId, "Newer draft", 3_000);
    await insertPage(foreignModuleId, "Newest foreign", 4_000);
    return { communityId, liveModuleId };
  });
  const asOwner = t.withIdentity({ subject: "resource-attention-owner" });

  const initial = await asOwner.query(
    api.communityAttention.listMyCommunityAttention,
    { communityIds: [fixture.communityId] },
  );
  expect(initial[0]?.resources).toBe(true);

  await asOwner.mutation(api.communityAttention.markCommunitySurfaceSeen, {
    communityId: fixture.communityId,
    surface: "resources",
    nowMs: 4_500,
  });
  const acknowledged = await asOwner.query(
    api.communityAttention.listMyCommunityAttention,
    { communityIds: [fixture.communityId] },
  );
  expect(acknowledged[0]?.resources).toBe(false);

  await t.run(async (ctx) => {
    await ctx.db.insert("communityResources", {
      communityId: fixture.communityId,
      moduleId: fixture.liveModuleId,
      createdByUserId: (await ctx.db
        .query("users")
        .withIndex("by_authSubject", (q) => q.eq("authSubject", "resource-attention-owner"))
        .unique())!._id,
      type: "page",
      role: "page",
      status: "published",
      title: "New visible page",
      bodyMd: "New visible body",
      pinned: false,
      createdAt: 5_000,
      updatedAt: 5_000,
    });
  });
  const afterNewLivePage = await asOwner.query(
    api.communityAttention.listMyCommunityAttention,
    { communityIds: [fixture.communityId] },
  );
  expect(afterNewLivePage[0]?.resources).toBe(true);
});

test("attention rejects an oversized execution scope before domain reads", async () => {
  const t = convexTest(schema, modules);
  const fixture = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "attention-scope-owner",
      displayName: "attention-scope-owner",
      handle: "attention-scope-owner",
      normalizedHandle: "attention-scope-owner",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const communityIds = [];
    for (let index = 0; index <= MAX_COMMUNITY_ATTENTION_COMMUNITIES_PER_QUERY; index += 1) {
      communityIds.push(await ctx.db.insert("communities", {
        ownerId,
        slug: `attention-scope-${index}`,
        name: `Attention scope ${index}`,
        visibility: "unlisted",
        inferenceFundingPolicy: "managed_required",
        entryPolicy: "open",
        activeMemberCount: 1,
        createdAt: 1_000 + index,
        updatedAt: 1_000 + index,
      }));
    }
    return { communityIds };
  });
  const asOwner = t.withIdentity({ subject: "attention-scope-owner" });

  await expect(asOwner.query(
    api.communityAttention.listMyCommunityAttention,
    { communityIds: fixture.communityIds },
  )).rejects.toThrow("community_attention_scope_limit_exceeded");
});

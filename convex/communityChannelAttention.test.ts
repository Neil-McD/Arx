/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

// A member's attention for one community, as the web reads it: both channel
// sections of the paged query, combined.
type MyAttention = {
  chat: boolean;
  resources: boolean;
  events: boolean;
  mentions: boolean;
  channels: Array<{ channel_slug: string; chat: boolean; mentions: boolean }>;
};
async function myAttention(client: any, communityId: any): Promise<MyAttention[]> {
  const page = (section: "shared" | "private") => client.query(api.communityAttention.listMyCommunityAttentionPage,
    { communityId, section, paginationOpts: { numItems: 10, cursor: null } });
  const [shared, own] = await Promise.all([page("shared"), page("private")]);
  return [{
    ...shared.attention,
    chat: shared.attention.chat || own.attention.chat,
    mentions: shared.attention.mentions || own.attention.mentions,
    channels: [...shared.page, ...own.page],
  }];
}

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
      state: "active",
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

  const initial = await myAttention(asMember, fixture.communityId);
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
  const afterCustom = await myAttention(asMember, fixture.communityId);
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
  const afterGeneral = await myAttention(asMember, fixture.communityId);
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
    // The Knowledge dot is a member's: whoever can edit courses never gets it.
    const memberId = await ctx.db.insert("users", {
      authSubject: "resource-attention-member",
      displayName: "resource-attention-member",
      handle: "resource-attention-member",
      normalizedHandle: "resource-attention-member",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    await ctx.db.insert("communityMemberships", {
      communityId,
      userId: memberId,
      role: "member",
      accessSource: "manual_grant",
      state: "active",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
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
  const asMember = t.withIdentity({ subject: "resource-attention-member" });

  const initial = await myAttention(asMember, fixture.communityId);
  expect(initial[0]?.resources).toBe(true);
  expect((await myAttention(asOwner, fixture.communityId))[0]?.resources).toBe(false);

  await asMember.mutation(api.communityAttention.markCommunitySurfaceSeen, {
    communityId: fixture.communityId,
    surface: "resources",
    nowMs: 4_500,
  });
  const acknowledged = await myAttention(asMember, fixture.communityId);
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
  const afterNewLivePage = await myAttention(asMember, fixture.communityId);
  expect(afterNewLivePage[0]?.resources).toBe(true);
  expect((await myAttention(asOwner, fixture.communityId))[0]?.resources).toBe(false);
});

test("listMyCommunityRailAttention batches communities, enforces fail-closed access, and matches pod/mention dot rules", async () => {
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
    const ownerId = await createUser("rail-owner");
    const memberId = await createUser("rail-member");
    const outsiderId = await createUser("rail-outsider");

    const createCommunity = async (slug: string, owner: any) => {
      const communityId = await ctx.db.insert("communities", {
        ownerId: owner,
        slug,
        name: slug,
        visibility: "unlisted",
        inferenceFundingPolicy: "managed_required",
        entryPolicy: "open",
        activeMemberCount: 2,
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
      return { communityId, generalChannelId };
    };

    // Community 1: unread chat in General for member.
    const cChat = await createCommunity("rail-chat", ownerId);
    await ctx.db.insert("communityMemberships", {
      communityId: cChat.communityId, userId: memberId, role: "member", accessSource: "manual_grant",
      state: "active", createdAt: 1_000, updatedAt: 1_000,
    });
    await ctx.db.insert("communityInteractionRoots", {
      communityId: cChat.communityId, channelId: cChat.generalChannelId, actorType: "human", actorUserId: ownerId,
      kind: "discussion", status: "live", visibilityScope: "community", contentSummary: "Hello",
      replyCount: 0, reactionSummary: [], idempotencyKey: "rail-chat-1", createdAt: 2_000, updatedAt: 2_000,
    });

    // Community 2: quiet pod activity (owner NOT in pod -> false for owner; member IN pod -> true for member).
    const cPod = await createCommunity("rail-pod", ownerId);
    const podMembershipId = await ctx.db.insert("communityMemberships", {
      communityId: cPod.communityId, userId: memberId, role: "member", accessSource: "manual_grant",
      state: "active", activationSequence: 0, createdAt: 1_000, updatedAt: 1_000,
    });
    const podChannelId = await ctx.db.insert("communityChannels", {
      communityId: cPod.communityId, slug: "founders-pod", name: "Founders pod",
      accessMode: "restricted", postingPolicy: "members", status: "active", position: 1,
      createdByUserId: ownerId, createdAt: 1_000, updatedAt: 1_000,
    });
    await ctx.db.insert("communityPods", {
      communityId: cPod.communityId, channelId: podChannelId, purpose: "Founders", visibility: "listed",
      hostUserIds: [], createdAt: 1_000, updatedAt: 1_000,
    });
    await ctx.db.insert("communityChannelParticipants", {
      communityId: cPod.communityId, channelId: podChannelId,
      principalKey: `user:${String(memberId)}`, membershipId: podMembershipId,
      membershipActivationSequence: 0, status: "active",
      createdByUserId: ownerId, createdAt: 1_000, updatedAt: 1_000,
    });
    const podRootId = await ctx.db.insert("communityInteractionRoots", {
      communityId: cPod.communityId, channelId: podChannelId, actorType: "human", actorUserId: outsiderId,
      kind: "discussion", status: "live", visibilityScope: "community", contentSummary: "Pod note",
      replyCount: 0, reactionSummary: [], idempotencyKey: "rail-pod-1", createdAt: 2_500, updatedAt: 2_500,
    });

    // Community 3: all read for member, unread event for owner.
    const cQuiet = await createCommunity("rail-quiet", ownerId);
    await ctx.db.insert("communityMemberships", {
      communityId: cQuiet.communityId, userId: memberId, role: "member", accessSource: "manual_grant",
      state: "active", createdAt: 1_000, updatedAt: 1_000,
    });

    // Community 4: private to outsider (neither owner nor member belongs).
    const cPrivate = await createCommunity("rail-private", outsiderId);

    return { ownerId, memberId, cChat, cPod, podChannelId, podRootId, cQuiet, cPrivate };
  });

  const asMember = t.withIdentity({ subject: "rail-member" });
  const asOwner = t.withIdentity({ subject: "rail-owner" });

  // Member gets chat=true for cChat and cPod, false for cQuiet, and cPrivate is omitted (fail closed).
  const memberRows = await asMember.query(api.communityAttention.listMyCommunityRailAttention, {
    communityIds: [
      fixture.cChat.communityId,
      fixture.cPod.communityId,
      fixture.cQuiet.communityId,
      fixture.cPrivate.communityId,
      fixture.cChat.communityId,
    ],
  });
  expect(memberRows).toEqual([
    { community_id: String(fixture.cChat.communityId), chat: true, resources: false, events: false, mentions: false },
    { community_id: String(fixture.cPod.communityId), chat: true, resources: false, events: false, mentions: false },
    { community_id: String(fixture.cQuiet.communityId), chat: false, resources: false, events: false, mentions: false },
  ]);

  // Owner posted the message in cChat (own message never lights own dot) and is not in cPod's pod.
  const ownerRowsBeforeMention = await asOwner.query(api.communityAttention.listMyCommunityRailAttention, {
    communityIds: [fixture.cChat.communityId, fixture.cPod.communityId, fixture.cPrivate.communityId],
  });
  expect(ownerRowsBeforeMention).toEqual([
    { community_id: String(fixture.cChat.communityId), chat: false, resources: false, events: false, mentions: false },
    { community_id: String(fixture.cPod.communityId), chat: false, resources: false, events: false, mentions: false },
  ]);

  // Mentioning owner inside cPod lights owner's rail dot even though owner isn't a pod member.
  await t.run(async (ctx) => {
    await ctx.db.insert("communityInteractionMentions", {
      communityId: fixture.cPod.communityId,
      channelId: fixture.podChannelId,
      rootId: fixture.podRootId,
      mentionKind: "user",
      mentionedUserId: fixture.ownerId,
      notifyState: "pending",
      createdAt: 3_000,
      updatedAt: 3_000,
    });
  });
  const ownerRowsAfterMention = await asOwner.query(api.communityAttention.listMyCommunityRailAttention, {
    communityIds: [fixture.cPod.communityId],
  });
  expect(ownerRowsAfterMention).toEqual([
    { community_id: String(fixture.cPod.communityId), chat: false, resources: false, events: false, mentions: true },
  ]);
});

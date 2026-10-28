/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";
import { buildCommunityInteractionEvidenceRef } from "../shared/communityEvidenceContract";
import {
  evaluateCommunityChannelCapabilities,
  getCommunityChannelCapabilities,
  requireCommunityChannelCapability,
  resolveCommunityChannelActor,
  type ChannelActorKind,
  type ChannelPolicy,
} from "./communityChannelAccess";

const modules = import.meta.glob([
  "./communityChannels.ts", "./communityInteractions.ts", "./communityInteractionEvidence.ts", "./_generated/**/*.*s",
]);
const shared: ChannelPolicy = {
  _id: "channel", communityId: "community", status: "active", accessMode: "all_members", postingPolicy: "members",
};

test("exact private-room lookup and scoped search do not enumerate a large directory", async () => {
  const t = convexTest(schema, modules), f = await fixture(t);
  const grantId = await t.run(async ctx => {
    const original = (await ctx.db.get(f.channelId))!;
    const { _id, _creationTime, ...fields } = original;
    for (let i = 0; i < 120; i++) await ctx.db.insert("communityChannels", {
      ...fields, name: `Other ${i}`, normalizedName: `other ${i}`, slug: `other-${i}`, position: i + 2,
    });
    return ctx.db.insert("communityChannelParticipants", { communityId: f.communityId, channelId: f.channelId,
      principalKey: `user:${f.users.member}`, membershipId: f.memberships.member, membershipActivationSequence: 0,
      status: "active", createdByUserId: f.users.owner, createdAt: 1, updatedAt: 1 });
  });
  const lookup = { communityId: f.communityId, userId: f.users.member, actorKind: "external_mcp" as const, slug: "client" };
  expect((await t.query(internal.communityChannels.resolveCommunityChannelBySlugInternal, lookup))?.id).toBe(String(f.channelId));
  const search = { communityId: f.communityId, userId: f.users.member, actorKind: "external_mcp" as const,
    channelSlug: "client", query: "canary", limit: 5 };
  await expect(t.query(internal.communityInteractionEvidence.searchRecentCommunityInteractionEvidenceInternal, search)).resolves.toBeDefined();
  await expect(t.query(internal.communityInteractionEvidence.searchRecentCommunityInteractionEvidenceInternal,
    { ...search, channelId: f.channelId, channelSlug: "other-0" })).rejects.toThrow("community_channel_unavailable");
  expect(await t.query(internal.communityChannels.resolveCommunityChannelBySlugInternal,
    { ...lookup, actorKind: "community_agent", userId: f.users.owner })).toBeNull();
  await t.run(ctx => ctx.db.patch(grantId, { status: "revoked" }));
  expect(await t.query(internal.communityChannels.resolveCommunityChannelBySlugInternal, lookup)).toBeNull();
  await expect(t.query(internal.communityInteractionEvidence.searchRecentCommunityInteractionEvidenceInternal, search)).rejects.toThrow("community_channel_unavailable");
});

test.each<ChannelActorKind>(["human", "community_agent_for_member", "external_mcp", "community_agent"])(
  "%s keeps shared-room participation without gaining management", (kind) => {
    expect(evaluateCommunityChannelCapabilities({
      channel: shared, actor: { communityId: "community", kind, principalKey: kind, isManager: false }, hasGrant: false,
    })).toEqual({ canRead: true, canPost: true, canReply: true, canManage: false });
  },
);

test("announcement publishing, replies and management are separate capabilities", () => {
  const channel: ChannelPolicy = { ...shared, postingPolicy: "managers" };
  const actor = { communityId: "community", kind: "human" as const, principalKey: "user:one", isManager: false };
  expect(evaluateCommunityChannelCapabilities({ channel, actor, hasGrant: true }))
    .toEqual({ canRead: true, canPost: false, canReply: true, canManage: false });
  expect(evaluateCommunityChannelCapabilities({ channel: { ...channel, replyPolicy: "disabled" }, actor, hasGrant: true }).canReply).toBe(false);
  expect(evaluateCommunityChannelCapabilities({ channel, actor: { ...actor, isManager: true }, hasGrant: false }).canManage).toBe(true);
  expect(evaluateCommunityChannelCapabilities({ channel, actor: { ...actor, kind: "community_agent_for_member", isManager: true }, hasGrant: false }))
    .toEqual({ canRead: true, canPost: true, canReply: true, canManage: false });
  const agent = { ...actor, kind: "community_agent" as const, isManager: true };
  expect(evaluateCommunityChannelCapabilities({ channel, actor: agent, hasGrant: false }).canPost).toBe(false);
  expect(evaluateCommunityChannelCapabilities({ channel, actor: agent, hasGrant: true }).canPost).toBe(true);
});

test("unknown policies, archived rooms and cross-community actors fail closed", () => {
  const actor = { communityId: "community", kind: "human" as const, principalKey: "user:one", isManager: true };
  for (const channel of [
    { ...shared, status: "archived" }, { ...shared, communityId: "other" },
    { ...shared, accessMode: "unknown" }, { ...shared, postingPolicy: "unknown" }, { ...shared, replyPolicy: "unknown" },
  ]) {
    expect(evaluateCommunityChannelCapabilities({ channel: channel as ChannelPolicy, actor, hasGrant: true }))
      .toEqual({ canRead: false, canPost: false, canReply: false, canManage: false });
  }
});

async function fixture(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const users: Record<string, any> = {};
    for (const name of ["owner", "admin", "moderator", "member", "outsider"]) {
      users[name] = await ctx.db.insert("users", {
        authSubject: name, handle: name, normalizedHandle: name, displayName: name, createdAt: 1, updatedAt: 1,
      });
      await ctx.db.insert("userProfileDetails", {
        userId: users[name], displayName: name, avatarUrl: `https://example.com/${name}.png`, createdAt: 1, updatedAt: 1,
      });
      for (const document of PLATFORM_LEGAL_DOCUMENTS) {
        await ctx.db.insert("legalAcceptances", {
          userId: users[name], documentKey: document.key, documentVersion: document.version,
          acceptedAt: 1, source: "test", createdAt: 1,
        });
      }
    }
    const communityId = await ctx.db.insert("communities", {
      ownerId: users.owner, name: "Authority", slug: "authority", visibility: "unlisted",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 4, createdAt: 1, updatedAt: 1,
    });
    const memberships: Record<string, any> = {};
    for (const name of ["admin", "moderator", "member"] as const) {
      memberships[name] = await ctx.db.insert("communityMemberships", {
        communityId, userId: users[name], role: name, active: true, accessSource: "manual_grant", createdAt: 1, updatedAt: 1,
      });
    }
    const channelId = await ctx.db.insert("communityChannels", {
      communityId, name: "Client", normalizedName: "client", slug: "client", position: 1, status: "active",
      accessMode: "restricted", postingPolicy: "members", createdAt: 1, updatedAt: 1,
    });
    return { communityId, channelId, users, memberships };
  });
}

test("restricted-room grants are exact, revocable, and distinct from sponsor authority", async () => {
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  await t.run(async (ctx) => {
    const channel = (await ctx.db.get(f.channelId))!;
    const member = await resolveCommunityChannelActor({ ctx, communityId: f.communityId, userId: f.users.member });
    await expect(requireCommunityChannelCapability({ ctx, channel, actor: member, capability: "canRead" }))
      .rejects.toThrow("community_channel_unavailable");
    const grantId = await ctx.db.insert("communityChannelParticipants", {
      communityId: f.communityId, channelId: f.channelId, principalKey: member.principalKey,
      membershipId: f.memberships.member, membershipActivationSequence: 0,
      status: "active", createdByUserId: f.users.owner, createdAt: 1, updatedAt: 1,
    });
    expect((await getCommunityChannelCapabilities({ ctx, channel, actor: member })).canRead).toBe(true);
    for (const kind of ["community_agent_for_member", "external_mcp"] as const) {
      const delegated = await resolveCommunityChannelActor({ ctx, communityId: f.communityId, userId: f.users.member, kind });
      expect(delegated.principalKey).toBe(member.principalKey);
      expect((await getCommunityChannelCapabilities({ ctx, channel, actor: delegated })).canRead).toBe(true);
    }
    const communityAgent = await resolveCommunityChannelActor({ ctx, communityId: f.communityId, userId: f.users.owner, kind: "community_agent" });
    expect(communityAgent.isManager).toBe(false);
    expect((await getCommunityChannelCapabilities({ ctx, channel, actor: communityAgent })).canRead).toBe(false);
    await ctx.db.patch(grantId, { status: "revoked" });
    expect((await getCommunityChannelCapabilities({ ctx, channel, actor: member })).canRead).toBe(false);
    await ctx.db.insert("communityChannelParticipants", {
      communityId: f.communityId, channelId: f.channelId, principalKey: "community_agent",
      status: "active", createdByUserId: f.users.owner, createdAt: 1, updatedAt: 1,
    });
    expect((await getCommunityChannelCapabilities({ ctx, channel, actor: communityAgent })).canRead).toBe(true);
    expect((await getCommunityChannelCapabilities({ ctx, channel, actor: member })).canRead).toBe(false);
  });
});

test("owner/admin oversight is explicit; moderator is not private-room authority", async () => {
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  await t.run(async (ctx) => {
    const channel = (await ctx.db.get(f.channelId))!;
    for (const name of ["owner", "admin", "moderator"]) {
      const actor = await resolveCommunityChannelActor({ ctx, communityId: f.communityId, userId: f.users[name] });
      expect((await getCommunityChannelCapabilities({ ctx, channel, actor })).canManage).toBe(name !== "moderator");
    }
    await expect(resolveCommunityChannelActor({ ctx, communityId: f.communityId, userId: f.users.outsider })).rejects.toThrow();
    await ctx.db.patch(f.memberships.member, { active: false, revokedAt: 2 });
    for (const kind of ["human", "community_agent_for_member", "external_mcp", "community_agent"] as const) {
      await expect(resolveCommunityChannelActor({ ctx, communityId: f.communityId, userId: f.users.member, kind })).rejects.toThrow();
    }
  });
});

test("duplicate and foreign-community grants never grant access", async () => {
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  await t.run(async (ctx) => {
    const channel = (await ctx.db.get(f.channelId))!;
    const actor = await resolveCommunityChannelActor({ ctx, communityId: f.communityId, userId: f.users.member });
    const otherId = await ctx.db.insert("communities", {
      ownerId: f.users.owner, name: "Other", slug: "other", visibility: "unlisted", inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 1, createdAt: 1, updatedAt: 1,
    });
    const grant = { communityId: otherId, channelId: f.channelId, principalKey: actor.principalKey,
      status: "active" as const, createdByUserId: f.users.owner, createdAt: 1, updatedAt: 1 };
    await ctx.db.insert("communityChannelParticipants", grant);
    expect((await getCommunityChannelCapabilities({ ctx, channel, actor })).canRead).toBe(false);
    await ctx.db.insert("communityChannelParticipants", { ...grant, communityId: f.communityId });
    await expect(getCommunityChannelCapabilities({ ctx, channel, actor })).rejects.toThrow("community_channel_participant_duplicate");
  });
});

test("managers can create private rooms but uninvited callers cannot read or write them", async () => {
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  const owner = t.withIdentity({ subject: "owner" });
  const member = t.withIdentity({ subject: "member" });
  await expect(owner.mutation(api.communityChannels.createCommunityChannel, {
    communityId: f.communityId, name: "Secret", accessMode: "restricted",
  })).resolves.toMatchObject({ name: "Secret", access_mode: "restricted" });
  await expect(member.query(api.communityInteractions.listCommunityInteractionRoots, {
    communityId: f.communityId, channelId: f.channelId,
  })).rejects.toThrow("community_channel_unavailable");
  await expect(t.query(internal.communityChannels.resolveCommunityChannelBySlugInternal, {
    communityId: f.communityId, userId: f.users.owner, actorKind: "community_agent", slug: "client",
  })).resolves.toBeNull();
  await expect(member.mutation(api.communityInteractions.createCommunityInteractionComposerMessage, {
    communityId: f.communityId, channelId: f.channelId, text: "Must not write", idempotencyKey: "private-closed",
  })).rejects.toThrow("community_channel_unavailable");
  expect(await t.run(ctx => ctx.db.query("communityInteractionRoots").collect())).toHaveLength(0);
});

test("an invited member uses canonical roots and replies; removal denies exact IDs and discovery", async () => {
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  const grantId = await t.run(ctx => ctx.db.insert("communityChannelParticipants", {
    communityId: f.communityId, channelId: f.channelId, principalKey: `user:${f.users.member}`,
    membershipId: f.memberships.member, membershipActivationSequence: 0,
    status: "active", createdByUserId: f.users.owner, createdAt: 1, updatedAt: 1,
  }));
  const member = t.withIdentity({ subject: "member" });
  const created = await member.mutation(api.communityInteractions.createCommunityInteractionComposerMessage, {
    communityId: f.communityId, channelId: f.channelId, text: "My private message", idempotencyKey: "private-message",
  });
  const rootId = created.interaction.root_id as any;
  await member.mutation(api.communityInteractions.createCommunityInteractionComposerMessage, {
    communityId: f.communityId, channelId: f.channelId, rootId, text: "Private reply", idempotencyKey: "private-reply",
  });
  expect((await member.query(api.communityInteractions.listCommunityInteractionRoots, {
    communityId: f.communityId, channelId: f.channelId,
  })).roots).toHaveLength(1);
  expect((await member.query(api.communityInteractions.listCommunityInteractionReplies, { rootId })).replies).toHaveLength(1);
  for (const actorKind of ["community_agent_for_member", "external_mcp"] as const) {
    const evidence = await t.query(internal.communityInteractionEvidence.readCommunityInteractionEvidenceInternal, {
      userId: f.users.member, communityId: f.communityId, actorKind, expectedChannelId: f.channelId,
      ref: buildCommunityInteractionEvidenceRef({ objectType: "root", objectId: rootId }),
    });
    expect(JSON.stringify(evidence)).toContain("My private message");
    const recent = await t.query(internal.communityInteractionEvidence.listRecentCommunityInteractionEvidenceInternal, {
      userId: f.users.member, communityId: f.communityId, actorKind, channelId: f.channelId, limit: 10,
    });
    expect(recent.results).toHaveLength(2);
  }
  expect((await member.query(api.communityChannels.listCommunityChannels, { communityId: f.communityId })).channels.some(c => c.id === f.channelId)).toBe(true);
  await t.run(ctx => ctx.db.patch(grantId, { status: "revoked" }));
  expect((await member.query(api.communityChannels.listCommunityChannels, { communityId: f.communityId })).channels.some(c => c.id === f.channelId)).toBe(false);
  await expect(member.query(api.communityInteractions.listCommunityInteractionReplies, { rootId })).rejects.toThrow("community_channel_unavailable");
});

test("access changes require explicit history acknowledgement, reject stale edits, and preserve General", async () => {
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  const owner = t.withIdentity({ subject: "owner" });
  const args = { communityId: f.communityId, channelId: f.channelId, expectedAccessMode: "restricted" as const,
    accessMode: "all_members" as const, acknowledgeHistoryExposure: false };
  await expect(owner.mutation(api.communityChannels.setChannelAccess, args)).rejects.toThrow("history_acknowledgement_required");
  await owner.mutation(api.communityChannels.setChannelAccess, { ...args, acknowledgeHistoryExposure: true });
  await expect(owner.mutation(api.communityChannels.setChannelAccess, { ...args, acknowledgeHistoryExposure: true })).rejects.toThrow("access_changed");
  const generalId = await t.run(ctx => ctx.db.insert("communityChannels", { communityId: f.communityId,
    systemRole: "general", slug: "general", name: "General", normalizedName: "general", position: 0, accessMode: "all_members",
    postingPolicy: "members", status: "active", createdAt: 1, updatedAt: 1 }));
  await expect(owner.mutation(api.communityChannels.setChannelAccess, { ...args, channelId: generalId,
    expectedAccessMode: "all_members", accessMode: "restricted", acknowledgeHistoryExposure: true })).rejects.toThrow("general_channel_immutable");
  const renamed = await owner.mutation(api.communityChannels.renameCommunityChannel, {
    communityId: f.communityId, channelId: f.channelId, name: "Client renamed",
  });
  expect(renamed.name).toBe("Client renamed");
  await owner.mutation(api.communityChannels.deleteCommunityChannel, { communityId: f.communityId, channelId: f.channelId });
  expect((await t.run(ctx => ctx.db.get(f.channelId)))?.status).toBe("archived");
});

test("direct root and reply IDs cannot bypass the closed restricted-channel boundary", async () => {
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  const { rootId, replyId } = await t.run(async (ctx) => {
    const rootId = await ctx.db.insert("communityInteractionRoots", {
      communityId: f.communityId, channelId: f.channelId, actorType: "human", actorUserId: f.users.member,
      kind: "discussion", status: "live", visibilityScope: "community", contentSummary: "Private fixture",
      replyCount: 1, reactionSummary: [], idempotencyKey: "private-root", createdAt: 1, updatedAt: 1,
    });
    const replyId = await ctx.db.insert("communityInteractionReplies", {
      communityId: f.communityId, channelId: f.channelId, rootId, actorType: "human", actorUserId: f.users.member,
      seq: 1, status: "live", visibilityScope: "community", contentSummary: "Private reply",
      reactionSummary: [], idempotencyKey: "private-reply", createdAt: 1, updatedAt: 1,
    });
    return { rootId, replyId };
  });
  const member = t.withIdentity({ subject: "member" });
  await expect(member.query(api.communityInteractions.listCommunityInteractionReplies, { rootId })).rejects.toThrow("community_channel_unavailable");
  for (const [targetType, targetId] of [["root", rootId], ["reply", replyId]] as const) {
    await expect(member.mutation(api.communityInteractions.toggleCommunityInteractionReaction, { targetType, targetId, emoji: "👍" })).rejects.toThrow("community_channel_unavailable");
    await expect(member.mutation(api.communityInteractions.editCommunityInteractionMessage, { targetType, targetId, text: "Changed" })).rejects.toThrow("community_channel_unavailable");
    await expect(member.mutation(api.communityInteractions.deleteCommunityInteractionMessage, { targetType, targetId })).rejects.toThrow("community_channel_unavailable");
  }
  expect(await t.run(ctx => ctx.db.query("communityInteractionReactions").collect())).toHaveLength(0);
  expect(await t.run(ctx => ctx.db.get(rootId))).toMatchObject({ status: "live", contentSummary: "Private fixture" });
});

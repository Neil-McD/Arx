/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { resolveSelfCommunityMembershipContext } from "./communityMembershipContextCore";
import { intakeCommunityAgentTurn } from "./communityAgentConciergeCore";

const modules = import.meta.glob(["./communityMemberWorkflows.ts", "./_generated/**/*.*s"]);
const mutate = api.communityMemberWorkflows.setBuilderMemberServiceChannel;
const query = api.communityMemberWorkflows.getBuilderWorkflowMemberSuccessDossier;

async function fixture() {
  const t = convexTest(schema, modules);
  const f = await t.run(async ctx => {
    const now = Date.now();
    const ownerId = await ctx.db.insert("users", { authSubject: "service-owner", createdAt: now, updatedAt: now });
    const userId = await ctx.db.insert("users", { authSubject: "service-member", createdAt: now, updatedAt: now });
    const otherId = await ctx.db.insert("users", { authSubject: "service-other", createdAt: now, updatedAt: now });
    await ctx.db.insert("operatorRoles", { userId: ownerId, role: "owner", active: true, createdAt: now, updatedAt: now });
    const communityId = await ctx.db.insert("communities", { ownerId, slug: "service", name: "Service", lifecycleStatus: "active", visibility: "unlisted", inferenceFundingPolicy: "managed_required", entryPolicy: "approval", createdAt: now, updatedAt: now });
    const membershipId = await ctx.db.insert("communityMemberships", { communityId, userId, role: "member", accessSource: "manual_grant", active: true, activationSequence: 1, activatedAt: now, createdAt: now, updatedAt: now });
    const otherMembershipId = await ctx.db.insert("communityMemberships", { communityId, userId: otherId, role: "member", accessSource: "manual_grant", active: true, activationSequence: 1, createdAt: now, updatedAt: now });
    const channelId = await ctx.db.insert("communityChannels", { communityId, name: "Private client room", slug: "client", accessMode: "restricted", postingPolicy: "members", status: "active", position: 1, createdAt: now, updatedAt: now });
    const memberGrant = await ctx.db.insert("communityChannelParticipants", { communityId, channelId, principalKey: `user:${userId}`, membershipId, membershipActivationSequence: 1, status: "active", createdByUserId: ownerId, createdAt: now, updatedAt: now });
    const agentGrant = await ctx.db.insert("communityChannelParticipants", { communityId, channelId, principalKey: "community_agent", status: "active", createdByUserId: ownerId, createdAt: now, updatedAt: now });
    return { ownerId, userId, otherId, communityId, membershipId, otherMembershipId, channelId, memberGrant, agentGrant };
  });
  const owner = t.withIdentity({ subject: "service-owner" });
  const set = (channelId: typeof f.channelId | null, expectedRevision = 0) => owner.mutation(mutate, { communityId: f.communityId, membershipId: f.membershipId, channelId, expectedRevision });
  const read = () => owner.query(query, { communityId: f.communityId, membershipId: f.membershipId });
  return { t, f, owner, set, read };
}

test("assignment is membership-owned, idempotent, and visible in authorized context without creating grants or work", async () => {
  const s = await fixture();
  expect((await s.read()).service_channel.status).toBe("unassigned");
  expect(await s.set(s.f.channelId)).toEqual({ revision: 1 });
  expect(await s.set(s.f.channelId, 1)).toEqual({ revision: 1 });
  expect((await s.read()).service_channel).toEqual({ status: "available", revision: 1, channel_id: s.f.channelId, name: "Private client room" });
  const self = await s.t.run(ctx => resolveSelfCommunityMembershipContext({ ctx, actorUserId: s.f.userId, communityId: s.f.communityId }));
  expect(self.service_channel).toEqual((await s.read()).service_channel);
  expect((await s.read()).markdown).toContain("A destination reference does not grant access");
  await s.t.run(async ctx => {
    expect(await ctx.db.query("communityChannelParticipants").collect()).toHaveLength(2);
    expect(await ctx.db.query("communityMemberWorkflowRuns").collect()).toHaveLength(0);
    expect(await ctx.db.query("communityAgentServeRequests").collect()).toHaveLength(0);
    expect((await ctx.db.get(s.f.membershipId))?.serviceChannelId).toBe(s.f.channelId);
    expect((await ctx.db.get(s.f.otherMembershipId))?.serviceChannelId).toBeUndefined();
  });
});

test.each(["member_grant", "agent_grant", "archived", "shared", "deleted", "activation"])("%s invalidation clears service identity while preserving independently authorized channel access", async kind => {
  const s = await fixture(); await s.set(s.f.channelId);
  await s.t.run(async ctx => {
    if (kind === "member_grant") await ctx.db.patch(s.f.memberGrant, { status: "revoked" });
    if (kind === "agent_grant") await ctx.db.patch(s.f.agentGrant, { status: "revoked" });
    if (kind === "archived") await ctx.db.patch(s.f.channelId, { status: "archived" });
    if (kind === "shared") await ctx.db.patch(s.f.channelId, { accessMode: "all_members" });
    if (kind === "deleted") await ctx.db.delete(s.f.channelId);
    if (kind === "activation") await ctx.db.patch(s.f.membershipId, { activationSequence: 2 });
  });
  const source = await s.read();
  expect(source.service_channel).toEqual({ status: "unavailable", revision: 1, channel_id: null, name: null });
  expect(source.channel_access).toMatchObject({ status: "available", truncated: false });
  // Losing service readiness does not revoke a member's independent read access.
  const memberCanStillRead = kind === "agent_grant" || kind === "shared";
  expect(source.channel_access?.channels).toEqual(memberCanStillRead
    ? [{ name: "Private client room", slug: "client", access_mode: kind === "shared" ? "all_members" : "restricted" }]
    : []);
  if (memberCanStillRead) {
    expect(source.markdown).toContain(`Private client room (${kind === "shared" ? "shared" : "private"})`);
  } else {
    expect(source.markdown).not.toContain("Private client room");
  }
  expect(source.markdown).toContain("Service channel: unavailable.");
  const self = await s.t.run(ctx => resolveSelfCommunityMembershipContext({ ctx, actorUserId: s.f.userId, communityId: s.f.communityId }));
  expect(self.service_channel).toEqual(source.service_channel);
  await s.set(null, 1);
  expect((await s.read()).service_channel).toEqual({ status: "unassigned", revision: 2, channel_id: null, name: null });
});

test.each(["member_grant", "agent_grant", "shared", "archived", "foreign"])("cannot assign %s destination or implicitly grant permissions", async kind => {
  const s = await fixture();
  await s.t.run(async ctx => {
    if (kind === "member_grant") await ctx.db.delete(s.f.memberGrant);
    if (kind === "agent_grant") await ctx.db.delete(s.f.agentGrant);
    if (kind === "shared") await ctx.db.patch(s.f.channelId, { accessMode: "all_members" });
    if (kind === "archived") await ctx.db.patch(s.f.channelId, { status: "archived" });
    if (kind === "foreign") {
      const { _id, _creationTime, ...community } = (await ctx.db.get(s.f.communityId))!;
      const foreign = await ctx.db.insert("communities", { ...community, slug: "foreign" });
      await ctx.db.patch(s.f.channelId, { communityId: foreign });
    }
  });
  await expect(s.set(s.f.channelId)).rejects.toThrow("community_member_service_channel_unavailable");
  expect((await s.read()).service_channel.status).toBe("unassigned");
});

test("ordinary member cannot assign, spoof builder, or read somebody else's binding", async () => {
  const s = await fixture();
  const member = s.t.withIdentity({ subject: "service-member" });
  await expect(member.mutation(mutate, { communityId: s.f.communityId, membershipId: s.f.membershipId, channelId: s.f.channelId, expectedRevision: 0 })).rejects.toThrow();
  await expect(member.mutation(mutate, { communityId: s.f.communityId, membershipId: s.f.membershipId, channelId: s.f.channelId, expectedRevision: 0, userId: s.f.ownerId })).rejects.toThrow();
  await expect(member.query(query, { communityId: s.f.communityId, membershipId: s.f.otherMembershipId })).rejects.toThrow();
});

test("stale revision cannot overwrite or clear a newer assignment, including ABA", async () => {
  const s = await fixture(); await s.set(s.f.channelId);
  await expect(s.set(null, 0)).rejects.toThrow("revision_conflict");
  await s.set(null, 1); await s.set(s.f.channelId, 2);
  await expect(s.set(null, 1)).rejects.toThrow("revision_conflict");
  expect((await s.read()).service_channel.revision).toBe(3);
});

test("renaming preserves binding and inactive members cannot be assigned", async () => {
  const s = await fixture(); await s.set(s.f.channelId);
  await s.t.run(ctx => ctx.db.patch(s.f.channelId, { name: "Renamed" }));
  expect((await s.read()).service_channel.name).toBe("Renamed");
  await s.t.run(ctx => ctx.db.patch(s.f.membershipId, { active: false }));
  await expect(s.set(null, 1)).rejects.toThrow("member_not_found");
});

test("active admin can assign without lending their own privileges to the agent", async () => {
  const s = await fixture();
  await s.t.run(ctx => ctx.db.patch(s.f.otherMembershipId, { role: "admin" }));
  const admin = s.t.withIdentity({ subject: "service-other" });
  await admin.mutation(mutate, { communityId: s.f.communityId, membershipId: s.f.membershipId, channelId: s.f.channelId, expectedRevision: 0 });
  await s.t.run(ctx => ctx.db.delete(s.f.agentGrant));
  await expect(admin.mutation(mutate, { communityId: s.f.communityId, membershipId: s.f.membershipId, channelId: s.f.channelId, expectedRevision: 1 })).rejects.toThrow("service_channel_unavailable");
});

test("cross-community membership cannot be targeted", async () => {
  const s = await fixture();
  await s.t.run(async ctx => {
    const { _id, _creationTime, ...row } = (await ctx.db.get(s.f.communityId))!;
    const foreign = await ctx.db.insert("communities", { ...row, slug: "foreign-member" });
    await ctx.db.patch(s.f.membershipId, { communityId: foreign });
  });
  await expect(s.set(s.f.channelId)).rejects.toThrow("member_not_found");
});

test("the member's own posts in their guide channel go to the agent without an @mention; others' don't", async () => {
  const s = await fixture();
  await s.set(s.f.channelId);
  const post = (actorUserId: any, channelId: any, key: string) => s.t.run(async ctx => {
    const now = Date.now();
    const rootId = await ctx.db.insert("communityInteractionRoots", {
      communityId: s.f.communityId, channelId, actorType: "human", actorUserId, kind: "discussion", status: "live",
      visibilityScope: "community", contentSummary: "What should I do first?", replyCount: 0, reactionSummary: [],
      idempotencyKey: key, createdAt: now, updatedAt: now,
    } as any);
    const result = await intakeCommunityAgentTurn({ ctx, communityId: s.f.communityId, rootId, nowMs: now });
    return `${result.trigger_kind}:${result.status}`;
  });
  expect(await post(s.f.userId, s.f.channelId, "guide-post")).toBe("direct_reply:queued");
  // Someone else posting in that room (the owner looking in) still needs an @mention.
  expect(await post(s.f.ownerId, s.f.channelId, "owner-post")).toBe("null:ignored");
  const generalId = await s.t.run(ctx => ctx.db.insert("communityChannels", { communityId: s.f.communityId, name: "General", slug: "general", accessMode: "all_members", postingPolicy: "members", status: "active", position: 0, createdAt: Date.now(), updatedAt: Date.now() } as any));
  expect(await post(s.f.userId, generalId, "general-post")).toBe("null:ignored");
});

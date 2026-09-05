/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { getCommunityChannelCapabilities, resolveCommunityChannelActor } from "./communityChannelAccess";

const modules = import.meta.glob(["./communityChannelParticipants.ts", "./_generated/**/*.*s"]);
const set = "communityChannelParticipants:setParticipant" as any;
const list = "communityChannelParticipants:listMemberAccess" as any;

async function fixture() {
  const t = convexTest(schema, modules);
  const f = await t.run(async ctx => {
    const user = async (name: string) => ctx.db.insert("users", { authSubject: name, displayName: name, createdAt: 1, updatedAt: 1 });
    const ownerId = await user("owner"), memberId = await user("member"), outsiderId = await user("outsider");
    const communityId = await ctx.db.insert("communities", { ownerId, name: "Client service", slug: "client-service",
      visibility: "unlisted", entryPolicy: "open", inferenceFundingPolicy: "managed_required", createdAt: 1, updatedAt: 1 });
    const membershipId = await ctx.db.insert("communityMemberships", { communityId, userId: memberId, role: "member",
      active: true, activationSequence: 1, accessSource: "manual_grant", createdAt: 1, updatedAt: 1 });
    const channelId = await ctx.db.insert("communityChannels", { communityId, name: "Client", slug: "client", position: 1,
      accessMode: "restricted", postingPolicy: "members", status: "active", createdAt: 1, updatedAt: 1 });
    return { ownerId, memberId, outsiderId, communityId, membershipId, channelId };
  });
  const args = { communityId: f.communityId, channelId: f.channelId, target: { kind: "member", userId: f.memberId }, active: true };
  const owner = t.withIdentity({ subject: "owner" });
  const canRead = async () => t.run(async ctx => getCommunityChannelCapabilities({ ctx,
    channel: (await ctx.db.get(f.channelId))!, actor: await resolveCommunityChannelActor({ ctx, communityId: f.communityId, userId: f.memberId }) }));
  return { t, f, args, owner, canRead };
}

test("participant upserts and revocations are idempotent and cannot confer manager authority", async () => {
  const { t, f, args, owner, canRead } = await fixture();
  expect((await canRead()).canRead).toBe(false);
  expect(await owner.mutation(set, args)).toEqual({ changed: true });
  expect(await owner.mutation(set, args)).toEqual({ changed: false });
  expect(await canRead()).toEqual({ canRead: true, canPost: true, canReply: true, canManage: false });
  expect(await t.run(ctx => ctx.db.query("communityChannelParticipants").collect())).toHaveLength(1);
  const page: any = await owner.query(list, { communityId: f.communityId, channelId: f.channelId, paginationOpts: { numItems: 10, cursor: null } });
  expect(page.page[0]).toMatchObject({ user_id: f.memberId, active: true, profile: { display_name: "member" } });
  expect(await owner.mutation(set, { ...args, active: false })).toEqual({ changed: true });
  expect(await owner.mutation(set, { ...args, active: false })).toEqual({ changed: false });
  expect((await canRead()).canRead).toBe(false);
});

test("rejoining a community cannot resurrect an old private-room grant", async () => {
  const { t, f, args, owner, canRead } = await fixture();
  await owner.mutation(set, args);
  await t.run(ctx => ctx.db.patch(f.membershipId, { active: false, revokedAt: 2 }));
  await expect(canRead()).rejects.toThrow();
  await t.run(ctx => ctx.db.patch(f.membershipId, { active: true, revokedAt: undefined, activationSequence: 2 }));
  expect((await canRead()).canRead).toBe(false);
  await owner.mutation(set, args);
  expect((await canRead()).canRead).toBe(true);
  expect(await t.run(ctx => ctx.db.query("communityChannelParticipants").collect())).toHaveLength(1);
});

test("members and outsiders cannot manage grants or enumerate participants", async () => {
  const { t, f, args, owner } = await fixture();
  for (const subject of ["member", "outsider"]) {
    const actor = t.withIdentity({ subject });
    await expect(actor.mutation(set, args)).rejects.toThrow();
    await expect(actor.query(list, { communityId: f.communityId, channelId: f.channelId, paginationOpts: { numItems: 10, cursor: null } })).rejects.toThrow();
  }
  await expect(owner.mutation(set, { ...args, target: { kind: "member", userId: f.outsiderId } })).rejects.toThrow("community_channel_member_inactive");
});

test("community-agent grant is independent and archive blocks all access", async () => {
  const { t, f, args, owner } = await fixture();
  const agentRead = () => t.run(async ctx => getCommunityChannelCapabilities({ ctx, channel: (await ctx.db.get(f.channelId))!,
    actor: await resolveCommunityChannelActor({ ctx, communityId: f.communityId, userId: f.ownerId, kind: "community_agent" }) }));
  expect((await agentRead()).canRead).toBe(false);
  const grant = { ...args, target: { kind: "community_agent" } };
  await owner.mutation(set, grant);
  expect((await agentRead()).canRead).toBe(true);
  expect((await agentRead()).canManage).toBe(false);
  await owner.mutation(set, { ...grant, active: false });
  expect((await agentRead()).canRead).toBe(false);
  await t.run(ctx => ctx.db.patch(f.channelId, { status: "archived" }));
  await expect(owner.mutation(set, grant)).rejects.toThrow();
});

/// <reference types="vite/client" />
// Pod settings (docs/specs/pods-v0.md, "Pod settings"): the pod's hosts change
// its pitch and add people; who can get in, taking people off and deleting
// the pod stay the builder's; a pod people still pay for can't be deleted.
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const NOW = Date.now();

async function world() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx: any) => {
    const user = (subject: string, name: string) => ctx.db.insert("users", { authSubject: subject, displayName: name, createdAt: NOW, updatedAt: NOW });
    const ownerId = await user("owner", "Owner");
    const hostId = await user("host", "Hana");
    const memberId = await user("member", "Milo");
    const otherId = await user("other", "Ola");
    await user("stranger", "Stranger");
    const communityId = await ctx.db.insert("communities", { ownerId, slug: "kiln", name: "Kiln", visibility: "published",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 3, createdAt: NOW, updatedAt: NOW });
    const membership = (userId: any) => ctx.db.insert("communityMemberships", { communityId, userId, role: "member", accessSource: "free_grant", state: "active", createdAt: NOW, updatedAt: NOW });
    const hostMembership = await membership(hostId);
    await membership(memberId);
    await membership(otherId);
    await ctx.db.insert("communityChannels", { communityId, systemRole: "general", slug: "general", name: "General", accessMode: "all_members", postingPolicy: "members", status: "active", position: 0, createdAt: NOW, updatedAt: NOW } as any);
    const channelId = await ctx.db.insert("communityChannels", { communityId, slug: "founders", name: "Founders", accessMode: "restricted", postingPolicy: "members", status: "active", position: 1, createdAt: NOW, updatedAt: NOW } as any);
    await ctx.db.insert("communityPods", { communityId, channelId, purpose: "Old purpose", visibility: "listed", hostUserIds: [hostId], createdAt: NOW, updatedAt: NOW });
    await ctx.db.insert("communityChannelParticipants", { communityId, channelId, principalKey: `user:${hostId}`, membershipId: hostMembership,
      membershipActivationSequence: 0, status: "active", reasons: ["host"], createdByUserId: ownerId, createdAt: NOW, updatedAt: NOW });
    return { communityId, channelId, ownerId, hostId, memberId, otherId };
  });
  const as = (who: string) => t.withIdentity({ subject: who });
  const read = (who: string) => as(who).query((api as any).communityPods.getPod, { communityId: ids.communityId, channelId: ids.channelId }) as Promise<any>;
  return { t, ids, as, read };
}

test("a host changes the pitch, but not who can get in", async () => {
  const { ids, as, read } = await world();
  await as("host").mutation((api as any).communityPods.savePodDetails, { communityId: ids.communityId, channelId: ids.channelId,
    purpose: "Weekly accountability", whatYouGet: ["A call every Friday"], about: "Who it's for." });
  const pod = await read("host");
  expect(pod).toMatchObject({ purpose: "Weekly accountability", what_you_get: ["A call every Friday"], about_md: "Who it's for.", can_manage: true, can_edit: false });
  // Listed or hidden, and seats: the builder's.
  await expect(as("host").mutation((api as any).communityPods.savePodDetails, { communityId: ids.communityId, channelId: ids.channelId, visibility: "hidden" })).rejects.toThrow();
  await expect(as("host").mutation((api as any).communityPods.savePodDetails, { communityId: ids.communityId, channelId: ids.channelId, seats: 3 })).rejects.toThrow();
  // A member who isn't a host can't change anything.
  await expect(as("member").mutation((api as any).communityPods.savePodDetails, { communityId: ids.communityId, channelId: ids.channelId, purpose: "Mine" })).rejects.toThrow();
  // The builder can.
  await as("owner").mutation((api as any).communityPods.savePodDetails, { communityId: ids.communityId, channelId: ids.channelId, seats: 3 });
  expect((await read("owner")).seats).toBe(3);
});

test("a host adds someone from the community; only the builder takes people off", async () => {
  const { t, ids, as, read } = await world();
  await as("host").mutation((api as any).communityPods.addPodMember, { communityId: ids.communityId, channelId: ids.channelId, userId: ids.memberId });
  expect((await read("owner")).members.map((m: any) => m.name).sort()).toEqual(["Hana", "Milo"]);
  // Someone outside the community can't be added.
  const strangerId = await t.run(async (ctx: any) => (await ctx.db.query("users").filter((q: any) => q.eq(q.field("authSubject"), "stranger")).first())._id);
  await expect(as("host").mutation((api as any).communityPods.addPodMember, { communityId: ids.communityId, channelId: ids.channelId, userId: strangerId })).rejects.toThrow();
  // A member who isn't a host can't add.
  await expect(as("member").mutation((api as any).communityPods.addPodMember, { communityId: ids.communityId, channelId: ids.channelId, userId: ids.otherId })).rejects.toThrow();
  // A host can't take people off; the builder can.
  const off = { communityId: ids.communityId, channelId: ids.channelId, target: { kind: "member", userId: ids.memberId }, active: false };
  await expect(as("host").mutation((api as any).communityChannelParticipants.setParticipant, off)).rejects.toThrow();
  await as("owner").mutation((api as any).communityChannelParticipants.setParticipant, off);
  expect((await read("owner")).members.map((m: any) => m.name)).toEqual(["Hana"]);
});

test("adding someone answers their request", async () => {
  const { t, ids, as, read } = await world();
  await as("member").mutation((api as any).communityPods.requestToJoinPod, { communityId: ids.communityId, channelId: ids.channelId });
  expect((await read("host")).requests.map((r: any) => r.name)).toEqual(["Milo"]);
  await as("host").mutation((api as any).communityPods.addPodMember, { communityId: ids.communityId, channelId: ids.channelId, userId: ids.memberId });
  expect((await read("host")).requests).toEqual([]);
  const row: any = await t.run((ctx: any) => ctx.db.query("communityPodRequests").first());
  expect(row.status).toBe("approved");
});

test("the builder sees which seats come from a plan; a pod people still pay for can't be deleted", async () => {
  const { t, ids, as, read } = await world();
  await as("owner").mutation((api as any).communityPods.addPodMember, { communityId: ids.communityId, channelId: ids.channelId, userId: ids.memberId });
  await t.run(async (ctx: any) => {
    const seat = await ctx.db.query("communityChannelParticipants").withIndex("by_channel_principal", (q: any) => q.eq("channelId", ids.channelId).eq("principalKey", `user:${ids.memberId}`)).first();
    await ctx.db.patch(seat._id, { reasons: ["plan"] });
  });
  const pod = await read("owner");
  expect(pod.members.find((m: any) => m.name === "Milo").from_plan).toBe(true);
  expect(pod.members.find((m: any) => m.name === "Hana").from_plan).toBe(false);
  expect(pod.included_with).toEqual([]);
  // Hosts see how each person is in too (they manage the pod); a plain member doesn't.
  expect((await read("host")).members.find((m: any) => m.name === "Milo").from_plan).toBe(true);

  const payment = await t.run((ctx: any) => ctx.db.insert("communityPodPayments", {
    communityId: ids.communityId, channelId: ids.channelId, userId: ids.otherId, status: "active", amountBaseUnits: 5000, currency: "usd",
    providerAccountId: "acct_builder", providerPriceId: "price_pod", checkoutExpiresAt: NOW, createdAt: NOW, updatedAt: NOW,
  }));
  const del = () => as("owner").mutation((api as any).communityChannels.deleteCommunityChannel, { communityId: ids.communityId, channelId: ids.channelId });
  await expect(del()).rejects.toThrow(/community_pod_has_payments/);
  await t.run((ctx: any) => ctx.db.patch(payment, { status: "ended" }));
  await expect(del()).resolves.toMatchObject({ deleted_channel_slug: "founders" });
});

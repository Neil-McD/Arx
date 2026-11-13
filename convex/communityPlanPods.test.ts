import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { setChannelParticipantCore } from "./communityChannelParticipants";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const NOW = Date.now();

// Distribution Engineer's community: Connect ($47), Setter ($197), CRIS ($297); CRIS includes the agency pod.
async function setup(t: ReturnType<typeof convexTest>) {
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "owner-subject", displayName: "owner", handle: "owner", normalizedHandle: "owner",
      email: "owner@example.com", normalizedEmail: "owner@example.com", emailVerifiedAt: NOW, createdAt: NOW, updatedAt: NOW,
    } as any);
    const communityId = await ctx.db.insert("communities", {
      ownerId, slug: "de-pilot", name: "Distribution Engineer", lifecycleStatus: "active", lifecycleGeneration: 0, visibility: "published",
      inferenceFundingPolicy: "managed_required", entryPolicy: "paid_subscription", activeMemberCount: 0, createdAt: NOW, updatedAt: NOW,
    } as any);
    await ctx.db.insert("communityPricePoints", { communityId, billingPeriod: "monthly", name: "Connect", amountBaseUnits: 4700, currency: "usd", currencyDecimals: 2, isCurrent: true, createdAt: NOW, updatedAt: NOW } as any);
    await ctx.db.insert("communityTiers", { communityId, key: "member", name: "Connect", rank: 0, grants: ["de:connect"], createdAt: NOW, updatedAt: NOW });
    await ctx.db.insert("communityTiers", { communityId, key: "setter", name: "Setter", rank: 1, grants: ["de:setter"], createdAt: NOW, updatedAt: NOW });
    await ctx.db.insert("communityTiers", { communityId, key: "cris", name: "CRIS", rank: 2, grants: ["de:cris"], createdAt: NOW, updatedAt: NOW });
    const podId = await ctx.db.insert("communityChannels", {
      communityId, slug: "agency", name: "Agency", accessMode: "restricted", postingPolicy: "members", status: "active", position: 1,
      createdByUserId: ownerId, createdAt: NOW, updatedAt: NOW,
    } as any);
    // One seat: a plan's members get in whatever the pod's seats (only asking to join counts them).
    await ctx.db.insert("communityPods", { communityId, channelId: podId, purpose: "Drop-in agency", visibility: "listed", seats: 1, createdAt: NOW, updatedAt: NOW });
    return { ownerId, communityId, podId };
  });
  const asOwner = t.withIdentity({ subject: "owner-subject" });
  const app = await asOwner.mutation(api.connectedApps.registerConnectedApp, { communityId: ids.communityId, name: "DE" });
  return { ...ids, app, asOwner };
}

const buyer = (t: ReturnType<typeof convexTest>, handle: string) => t.run((ctx) => ctx.db.insert("users", {
  authSubject: `${handle}-subject`, displayName: handle, handle, normalizedHandle: handle,
  email: `${handle}@example.com`, normalizedEmail: `${handle}@example.com`, emailVerifiedAt: NOW, createdAt: NOW, updatedAt: NOW,
} as any));
const sell = (t: ReturnType<typeof convexTest>, secret: string, body: Record<string, unknown>) => t.fetch("/apps/v1/sales", {
  method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" }, body: JSON.stringify(body),
});
const seat = (t: ReturnType<typeof convexTest>, podId: any, userId: any) => t.run(async (ctx: any) => (await ctx.db.query("communityChannelParticipants")
  .withIndex("by_channel_principal", (q: any) => q.eq("channelId", podId).eq("principalKey", `user:${userId}`)).first()) as any);
const inPod = async (t: ReturnType<typeof convexTest>, podId: any, userId: any) => (await seat(t, podId, userId))?.status === "active";
const grants = async (t: ReturnType<typeof convexTest>, secret: string, handle: string) =>
  (await (await t.fetch(`/apps/v1/access?email=${handle}%40example.com`, { headers: { authorization: `Bearer ${secret}` } })).json()).grants as string[];
const includePod = (ids: any, key: string, name: string, grantsList: string[], pods: any[], amount?: number) =>
  ids.asOwner.mutation(api.communityTiers.saveCommunityTier, { communityId: ids.communityId, key, name, grants: grantsList, podChannelIds: pods, ...(amount ? { monthlyAmountBaseUnits: amount } : {}) });

test("the plan that includes a pod puts its holders in it, whichever plan they move to, and takes them out when it ends", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t);
  await includePod(ids, "cris", "CRIS", ["de:cris"], [ids.podId], 29700);
  const userId = await buyer(t, "ana");
  // Setter: the community, not the pod.
  await sell(t, ids.app.secret, { email: "ana@example.com", active: true, tier: "setter" });
  expect(await inPod(t, ids.podId, userId)).toBe(false);
  // Up to CRIS: in the pod, and apps see it.
  await sell(t, ids.app.secret, { email: "ana@example.com", active: true, tier: "cris" });
  expect(await inPod(t, ids.podId, userId)).toBe(true);
  expect((await seat(t, ids.podId, userId)).reasons).toEqual(["plan"]);
  expect(await grants(t, ids.app.secret, "ana")).toEqual(["community", "de:cris", "pod:agency"]);
  // Back down to Setter: out.
  await sell(t, ids.app.secret, { email: "ana@example.com", active: true, tier: "setter" });
  expect(await inPod(t, ids.podId, userId)).toBe(false);
  // CRIS again, then the sale ends: out of the pod and the community.
  await sell(t, ids.app.secret, { email: "ana@example.com", active: true, tier: "cris" });
  expect(await inPod(t, ids.podId, userId)).toBe(true);
  await sell(t, ids.app.secret, { email: "ana@example.com", active: false });
  expect(await inPod(t, ids.podId, userId)).toBe(false);
});

test("adding a pod to a plan seats everyone already on it; taking it off unseats them", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t);
  const userId = await buyer(t, "ben");
  await sell(t, ids.app.secret, { email: "ben@example.com", active: true, tier: "cris" });
  expect(await inPod(t, ids.podId, userId)).toBe(false);
  await includePod(ids, "cris", "CRIS", ["de:cris"], [ids.podId], 29700);
  expect(await inPod(t, ids.podId, userId)).toBe(true);
  await includePod(ids, "cris", "CRIS", ["de:cris"], [], 29700);
  expect(await inPod(t, ids.podId, userId)).toBe(false);
  // Only this community's live pods.
  const other = await t.run((ctx) => ctx.db.insert("communityChannels", {
    communityId: ids.communityId, slug: "open", name: "Open", accessMode: "all_members", postingPolicy: "members", status: "active", position: 2,
    createdByUserId: ids.ownerId, createdAt: NOW, updatedAt: NOW,
  } as any));
  await expect(includePod(ids, "cris", "CRIS", ["de:cris"], [other], 29700)).rejects.toThrow(/community_tier_pod_invalid/);
});

test("a seat has reasons: the plan's going leaves a host's add or a pod payment in place, and the plan's seat can't be taken away on its own", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t);
  await includePod(ids, "cris", "CRIS", ["de:cris"], [ids.podId], 29700);
  const userId = await buyer(t, "cy");
  await sell(t, ids.app.secret, { email: "cy@example.com", active: true, tier: "cris" });
  // A host can't take away the seat the plan gives, nor can they leave it: it goes with the plan.
  await expect(ids.asOwner.mutation(api.communityChannelParticipants.setParticipant, {
    communityId: ids.communityId, channelId: ids.podId, target: { kind: "member", userId }, active: false,
  } as any)).rejects.toThrow(/community_pod_seat_from_plan/);
  await expect(t.query(internal.communityPodPayments.podLeavePlanInternal, { userId, communityId: ids.communityId, channelId: ids.podId }))
    .rejects.toThrow(/community_pod_seat_from_plan/);
  // They also pay for the pod on its own: moving down a plan keeps the paid seat.
  await t.run((ctx) => setChannelParticipantCore(ctx, { communityId: ids.communityId, channelId: ids.podId, createdByUserId: userId, active: true, target: { kind: "member", userId }, reason: "paid" }));
  await sell(t, ids.app.secret, { email: "cy@example.com", active: true, tier: "setter" });
  expect(await inPod(t, ids.podId, userId)).toBe(true);
  expect((await seat(t, ids.podId, userId)).reasons).toEqual(["paid"]);
  // The payment ends too: out.
  await t.run((ctx) => setChannelParticipantCore(ctx, { communityId: ids.communityId, channelId: ids.podId, createdByUserId: userId, active: false, target: { kind: "member", userId }, reason: "paid" }));
  expect(await inPod(t, ids.podId, userId)).toBe(false);
});

test("a seat from before reasons is a host's, and keeps working", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t);
  const userId = await buyer(t, "dee");
  await sell(t, ids.app.secret, { email: "dee@example.com", active: true, tier: "setter" });
  const membership = await t.run(async (ctx) => (await ctx.db.query("communityMemberships").collect()).find((row: any) => String(row.userId) === String(userId)) as any);
  await t.run((ctx) => ctx.db.insert("communityChannelParticipants", {
    communityId: ids.communityId, channelId: ids.podId, principalKey: `user:${userId}`, membershipId: membership._id,
    membershipActivationSequence: membership.activationSequence ?? 0, status: "active", createdByUserId: ids.ownerId, createdAt: NOW, updatedAt: NOW,
  } as any));
  // A plan change doesn't touch it.
  await sell(t, ids.app.secret, { email: "dee@example.com", active: true, tier: "cris" });
  expect(await inPod(t, ids.podId, userId)).toBe(true);
  // The host takes them off: off.
  await ids.asOwner.mutation(api.communityChannelParticipants.setParticipant, {
    communityId: ids.communityId, channelId: ids.podId, target: { kind: "member", userId }, active: false,
  } as any);
  expect(await inPod(t, ids.podId, userId)).toBe(false);
});

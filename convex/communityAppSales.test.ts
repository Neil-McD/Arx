import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { requireCommunityChatAccess } from "./communityCore";
import { attachPaidCheckoutsForVerifiedEmail } from "./communityCheckoutBuyer";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const NOW = Date.now();

// A paid community (Distribution Engineer's) with three tiers and its app.
async function setup(t: ReturnType<typeof convexTest>) {
  const ids = await t.run(async (ctx) => {
    const user = (handle: string, verified = true) => ctx.db.insert("users", {
      authSubject: `${handle}-subject`, displayName: handle, handle, normalizedHandle: handle,
      email: `${handle}@example.com`, normalizedEmail: `${handle}@example.com`, ...(verified ? { emailVerifiedAt: NOW } : {}),
      createdAt: NOW, updatedAt: NOW,
    });
    const ownerId = await user("owner");
    const communityId = await ctx.db.insert("communities", {
      ownerId, slug: "de-pilot", name: "Distribution Engineer", lifecycleStatus: "active", lifecycleGeneration: 0, visibility: "published",
      inferenceFundingPolicy: "managed_required", entryPolicy: "paid_subscription", activeMemberCount: 0, createdAt: NOW, updatedAt: NOW,
    } as any);
    const basePrice = await ctx.db.insert("communityPricePoints", {
      communityId, billingPeriod: "monthly", name: "Connect", amountBaseUnits: 4700, currency: "usd", currencyDecimals: 2, isCurrent: true, createdAt: NOW, updatedAt: NOW,
    } as any);
    await ctx.db.insert("communityTiers", { communityId, key: "member", name: "Connect", rank: 0, grants: ["de:connect"], createdAt: NOW, updatedAt: NOW });
    await ctx.db.insert("communityTiers", { communityId, key: "setter", name: "Setter", rank: 1, grants: ["de:setter"], createdAt: NOW, updatedAt: NOW });
    await ctx.db.insert("communityTiers", { communityId, key: "cris", name: "CRIS", rank: 2, grants: ["de:cris"], createdAt: NOW, updatedAt: NOW });
    return { ownerId, communityId, basePrice, user: null as any };
  });
  const app = await t.withIdentity({ subject: "owner-subject" }).mutation(api.connectedApps.registerConnectedApp, { communityId: ids.communityId, name: "DE" });
  return { ...ids, app };
}

const newUser = (t: ReturnType<typeof convexTest>, handle: string, verified = true) => t.run((ctx) => ctx.db.insert("users", {
  authSubject: `${handle}-subject`, displayName: handle, handle, normalizedHandle: handle,
  email: `${handle}@example.com`, normalizedEmail: `${handle}@example.com`, ...(verified ? { emailVerifiedAt: NOW } : {}), createdAt: NOW, updatedAt: NOW,
}));

const report = (t: ReturnType<typeof convexTest>, secret: string, body: Record<string, unknown>) => t.fetch("/apps/v1/sales", {
  method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" }, body: JSON.stringify(body),
});
const access = async (t: ReturnType<typeof convexTest>, secret: string, email: string) =>
  (await t.fetch(`/apps/v1/access?email=${encodeURIComponent(email)}`, { headers: { authorization: `Bearer ${secret}` } })).json();
const canEnter = (t: ReturnType<typeof convexTest>, communityId: any, userId: any) =>
  t.run((ctx) => requireCommunityChatAccess({ ctx, communityId, userId }).then(() => true, () => false));
const membership = (t: ReturnType<typeof convexTest>, userId: any) =>
  t.run(async (ctx) => (await ctx.db.query("communityMemberships").collect()).find((row: any) => String(row.userId) === String(userId)) as any);

test("an app's own sale lets the buyer in, free of Polynet's fee; its end takes them out", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t);
  const buyer = await newUser(t, "buyer");
  // Bad reports are refused.
  expect((await report(t, `psk_${"0".repeat(48)}`, { email: "buyer@example.com", active: true })).status).toBe(401);
  expect((await report(t, ids.app.secret, { email: "buyer@example.com" })).status).toBe(400);
  expect((await report(t, ids.app.secret, { email: "buyer@example.com", active: true, tier: "platinum" })).status).toBe(400);
  // "buyer@ bought Setter on our site": in, with Setter's grants, no checkout and no fee.
  const sold = await report(t, ids.app.secret, { email: "Buyer@Example.com", active: true, tier: "setter", external_ref: "sub_de_123" });
  expect(await sold.json()).toEqual({ outcome: "in" });
  expect(await membership(t, buyer)).toMatchObject({ state: "active", accessSource: "app_grant" });
  expect(await canEnter(t, ids.communityId, buyer)).toBe(true);
  expect(await access(t, ids.app.secret, "buyer@example.com")).toEqual({ allowed: true, tier: { key: "setter", name: "Setter" }, grants: ["community", "de:setter"] });
  expect(await t.run((ctx) => ctx.db.query("checkoutSessions").collect())).toEqual([]);
  // An upgrade on their site: the tier follows.
  await report(t, ids.app.secret, { email: "buyer@example.com", active: true, tier: "cris" });
  expect((await access(t, ids.app.secret, "buyer@example.com")).tier).toEqual({ key: "cris", name: "CRIS" });
  // It ends: out.
  expect(await (await report(t, ids.app.secret, { email: "buyer@example.com", active: false })).json()).toEqual({ outcome: "ended" });
  expect(await membership(t, buyer)).toMatchObject({ state: "lapsed", revokedReason: "connected_app_sale_ended" });
  expect(await canEnter(t, ids.communityId, buyer)).toBe(false);
  expect(await access(t, ids.app.secret, "buyer@example.com")).toEqual({ allowed: false, tier: null, grants: [] });
  // Bought again later: back in.
  expect(await (await report(t, ids.app.secret, { email: "buyer@example.com", active: true })).json()).toEqual({ outcome: "in" });
  expect(await canEnter(t, ids.communityId, buyer)).toBe(true);
});

test("a sale to an email with no account waits, and lands when that verified email signs in", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t);
  expect(await (await report(t, ids.app.secret, { email: "later@example.com", active: true, tier: "setter" })).json()).toEqual({ outcome: "waiting_for_account" });
  // An unverified account with that email isn't enough.
  const later = await newUser(t, "later", false);
  expect(await (await report(t, ids.app.secret, { email: "later@example.com", active: true, tier: "setter" })).json()).toEqual({ outcome: "waiting_for_account" });
  // Verified and signed in: collected.
  await t.run((ctx) => ctx.db.patch(later, { emailVerifiedAt: NOW } as any));
  await t.run((ctx) => attachPaidCheckoutsForVerifiedEmail(ctx, later, "later@example.com", NOW));
  expect(await canEnter(t, ids.communityId, later)).toBe(true);
  expect((await access(t, ids.app.secret, "later@example.com")).tier).toEqual({ key: "setter", name: "Setter" });
});

test("access is the union: either side ending leaves the other's access in place", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t);
  const both = await newUser(t, "both");
  // A Polynet subscriber on Connect...
  await t.run(async (ctx) => {
    const membershipId = await ctx.db.insert("communityMemberships", {
      communityId: ids.communityId, userId: both, role: "member", accessSource: "paid_subscription", pricePointId: ids.basePrice,
      state: "active", activationSequence: 1, activatedAt: NOW, createdAt: NOW, updatedAt: NOW,
    } as any);
    await ctx.db.insert("communitySubscriptions", {
      communityId: ids.communityId, userId: both, membershipId, pricePointId: ids.basePrice, source: "stripe", status: "active",
      providerSubscriptionId: "sub_polynet", providerAccountId: "acct_de", currentPeriodEndAt: NOW + 86_400_000, cancelAtPeriodEnd: false, createdAt: NOW, updatedAt: NOW,
    } as any);
  });
  // ...who also bought CRIS on the app's site: the grants are both, the tier the highest.
  expect(await (await report(t, ids.app.secret, { email: "both@example.com", active: true, tier: "cris" })).json()).toEqual({ outcome: "in" });
  expect(await access(t, ids.app.secret, "both@example.com")).toEqual({ allowed: true, tier: { key: "cris", name: "CRIS" }, grants: ["community", "de:cris", "de:connect"] });
  // The app sale ends: the Polynet subscription still lets them in.
  expect(await (await report(t, ids.app.secret, { email: "both@example.com", active: false })).json()).toEqual({ outcome: "kept_by_other_access" });
  expect(await canEnter(t, ids.communityId, both)).toBe(true);
  expect((await access(t, ids.app.secret, "both@example.com")).grants).toEqual(["community", "de:connect"]);
  // The other way round: an app sale again, then the Polynet subscription ends.
  await report(t, ids.app.secret, { email: "both@example.com", active: true, tier: "setter" });
  await t.mutation(internal.communityCommerce.syncCommunitySubscriptionLifecycleInternal, {
    communityId: ids.communityId, userId: both, source: "stripe", status: "canceled", providerAccountId: "acct_de", providerSubscriptionId: "sub_polynet",
  });
  expect(await membership(t, both)).toMatchObject({ state: "active" });
  expect(await canEnter(t, ids.communityId, both)).toBe(true);
  expect(await access(t, ids.app.secret, "both@example.com")).toEqual({ allowed: true, tier: { key: "setter", name: "Setter" }, grants: ["community", "de:setter"] });
  // Now the app sale ends too: nothing left, out.
  expect(await (await report(t, ids.app.secret, { email: "both@example.com", active: false })).json()).toEqual({ outcome: "ended" });
  expect(await canEnter(t, ids.communityId, both)).toBe(false);
});

test("an app sale never puts back someone who left, was removed or is blocked; a comp outlasts it", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t);
  const states: Array<[string, string]> = [["leaver", "left"], ["removed", "removed"]];
  for (const [handle, state] of states) {
    const userId = await newUser(t, handle);
    await t.run((ctx) => ctx.db.insert("communityMemberships", {
      communityId: ids.communityId, userId, role: "member", accessSource: "paid_subscription", state, activationSequence: 1, createdAt: NOW, updatedAt: NOW,
    } as any));
    expect(await (await report(t, ids.app.secret, { email: `${handle}@example.com`, active: true })).json()).toEqual({ outcome: "kept_out" });
    expect(await canEnter(t, ids.communityId, userId)).toBe(false);
  }
  const blockedId = await newUser(t, "blocked");
  await t.run((ctx) => ctx.db.insert("communityBlocks", { communityId: ids.communityId, userId: blockedId, createdByUserId: ids.ownerId, createdAt: NOW, updatedAt: NOW } as any));
  expect(await (await report(t, ids.app.secret, { email: "blocked@example.com", active: true })).json()).toEqual({ outcome: "kept_out" });
  expect(await canEnter(t, ids.communityId, blockedId)).toBe(false);
  // A comped member who also buys on the app's site keeps the comp when that ends.
  const comped = await newUser(t, "comped");
  await t.run((ctx) => ctx.db.insert("communityMemberships", {
    communityId: ids.communityId, userId: comped, role: "member", accessSource: "manual_grant", state: "active", activationSequence: 1, activatedAt: NOW, createdAt: NOW, updatedAt: NOW,
  } as any));
  await report(t, ids.app.secret, { email: "comped@example.com", active: true, tier: "setter" });
  expect(await (await report(t, ids.app.secret, { email: "comped@example.com", active: false })).json()).toEqual({ outcome: "kept_by_other_access" });
  expect(await canEnter(t, ids.communityId, comped)).toBe(true);
});

test("changing a plan's grants tells the app, for everyone holding that plan", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t);
  const asOwner = t.withIdentity({ subject: "owner-subject" });
  await asOwner.mutation(api.connectedApps.updateConnectedApp, { communityId: ids.communityId, appId: ids.app.app_id, webhookUrl: "https://de.example.com/polynet" });
  const buyer = await newUser(t, "buyer");
  await report(t, ids.app.secret, { email: "buyer@example.com", active: true, tier: "setter" });
  const before = (await t.run((ctx) => ctx.db.query("connectedAppDeliveries").collect())).length;
  // A rename alone tells nobody; changing Setter's grants tells its holder.
  await asOwner.mutation(api.communityTiers.saveCommunityTier, { communityId: ids.communityId, key: "setter", name: "Setter Pro", grants: ["de:setter"], monthlyAmountBaseUnits: 19700 });
  expect((await t.run((ctx) => ctx.db.query("connectedAppDeliveries").collect())).length).toBe(before);
  await asOwner.mutation(api.communityTiers.saveCommunityTier, { communityId: ids.communityId, key: "setter", name: "Setter Pro", grants: ["de:setter", "de:reports"], monthlyAmountBaseUnits: 19700 });
  const after = await t.run((ctx) => ctx.db.query("connectedAppDeliveries").collect());
  expect(after.length).toBe(before + 1);
  expect(after[after.length - 1]).toMatchObject({ email: "buyer@example.com", type: "access.changed" });
  void buyer;
});

test("someone who left comes back on their app purchase by joining, without paying twice; a removed member or a payment hold doesn't", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t);
  const { communityAppJoinProjection } = await import("./communityAppJoin");
  for (const [handle, state] of [["leaver", "left"], ["removed", "removed"], ["held", "payment_hold"]] as const) {
    const userId = await newUser(t, handle);
    await t.run((ctx) => ctx.db.insert("communityMemberships", {
      communityId: ids.communityId, userId, role: "member", accessSource: "app_grant", state, activationSequence: 1, createdAt: NOW, updatedAt: NOW,
    } as any));
    // The app still reports the purchase; the sale alone doesn't put them back.
    expect(await (await report(t, ids.app.secret, { email: `${handle}@example.com`, active: true, tier: "setter" })).json()).toEqual({ outcome: "kept_out" });
    const projection = await t.run(async (ctx) => communityAppJoinProjection(ctx, (await ctx.db.get(ids.communityId)) as any, userId));
    const joined = await t.mutation(internal.communityAppJoin.joinCommunityAppVisitorInternal, { userId, communityId: ids.communityId });
    if (state === "left") {
      // Their own choice: Join, not a price, and they're in on the app's plan.
      expect(projection.gate).toBe("join");
      expect(projection.plans).toEqual([]);
      expect(joined.outcome).toBe("joined");
      expect(await canEnter(t, ids.communityId, userId)).toBe(true);
      expect((await membership(t, userId)).accessSource).toBe("app_grant");
      expect((await access(t, ids.app.secret, `${handle}@example.com`)).tier).toEqual({ key: "setter", name: "Setter" });
    } else {
      expect(projection.gate).toBe("checkout");
      expect(joined.outcome).toBe("paid_plan_required");
      expect(await canEnter(t, ids.communityId, userId)).toBe(false);
    }
  }
});

/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";
import {
  communityOfferAudienceIncludes,
  communityOfferKeyFromName,
  communityOffersHeld,
  diffCommunityOffersHeld,
  resolveCommunityOfferLadder,
} from "../shared/communityOffers";
import { workflowConditionHolds } from "../shared/communityMemberWorkflow";

const modules = import.meta.glob([
  "./communityOffers.ts",
  "./communityOfferCheckout.ts",
  "./communityLifecycle.ts",
  "./auth.ts",
  "./creatorCommerce.ts",
  "./communityAccess.ts",
  "./communityAccessSync.ts",
  "./communityClients.ts",
  "./communityCommerce.ts",
  "./communityMemberWorkflows.ts",
  "./communityResourceProgress.ts",
  "./communityLessonTracks.ts",
  "./communityResources.ts",
  "./communityChannelParticipants.ts",
  "./_generated/**/*.*s",
]);

const DAY = 24 * 60 * 60 * 1000;
const internalApi = internal as any;

describe("the offer ladder", () => {
  const ladder = [
    { key: "membership", name: "Membership", rank: 0, isBase: true },
    { key: "consulting", name: "Membership + Consulting", rank: 1 },
    { key: "done-for-you", name: "Done for you", rank: 2 },
  ];

  test("a member has their offer and every one below it; nobody has none", () => {
    expect(communityOffersHeld(ladder, "consulting").map((offer) => offer.key)).toEqual(["membership", "consulting"]);
    expect(communityOffersHeld(ladder, "membership").map((offer) => offer.key)).toEqual(["membership"]);
    expect(communityOffersHeld(ladder, null)).toEqual([]);
    // An offer that no longer exists falls back to the base one.
    expect(communityOffersHeld(ladder, "gone").map((offer) => offer.key)).toEqual(["membership"]);
  });

  test("with nothing saved the community sells one offer, Membership", () => {
    expect(resolveCommunityOfferLadder([])).toEqual([{ key: "membership", name: "Membership", rank: 0, isBase: true }]);
  });

  test("an audience lets in the offers it names and the ones above them", () => {
    const consulting = communityOffersHeld(ladder, "consulting");
    const base = communityOffersHeld(ladder, "membership");
    expect(communityOfferAudienceIncludes(["consulting"], consulting)).toBe(true);
    expect(communityOfferAudienceIncludes(["consulting"], base)).toBe(false);
    expect(communityOfferAudienceIncludes(["membership"], consulting)).toBe(true);
    expect(communityOfferAudienceIncludes([], base)).toBe(true);
  });

  test("keys come from names and never repeat; diffs list what started and ended", () => {
    expect(communityOfferKeyFromName("Membership + Consulting", new Set(["membership"]))).toBe("membership-consulting");
    expect(communityOfferKeyFromName("Consulting", new Set(["consulting"]))).toBe("consulting-2");
    expect(diffCommunityOffersHeld(["membership"], ["membership", "consulting"])).toEqual({ started: ["consulting"], ended: [] });
    expect(diffCommunityOffersHeld(["membership", "consulting"], [])).toEqual({ started: [], ended: ["membership", "consulting"] });
  });

  test("the Offer property works with today's Only if: a Consulting member is on both offers", () => {
    const names = ["Membership", "Membership + Consulting"];
    expect(workflowConditionHolds({ propertyKey: "polynet_offer", op: "is", value: "Membership + Consulting" }, names)).toBe(true);
    expect(workflowConditionHolds({ propertyKey: "polynet_offer", op: "is", value: "Membership + Consulting" }, ["Membership"])).toBe(false);
  });
});

async function fixture() {
  const t = convexTest(schema, modules);
  const nowMs = Date.now();
  const ids = await t.run(async (ctx) => {
    const user = (subject: string, handle: string, email: string) => ctx.db.insert("users", {
      authSubject: subject, displayName: handle, handle, normalizedHandle: handle, createdAt: nowMs, updatedAt: nowMs,
      email, normalizedEmail: email, emailVerifiedAt: nowMs,
    });
    const ownerId = await user("offers-owner", "rashid", "owner@example.com");
    const samId = await user("offers-sam", "sam", "sam@example.com");
    const leeId = await user("offers-lee", "lee", "lee@example.com");
    const annaId = await user("offers-anna", "anna", "anna@example.com");
    await ctx.db.insert("operatorRoles", { userId: ownerId, role: "owner", active: true, createdAt: nowMs, updatedAt: nowMs });
    const communityId = await ctx.db.insert("communities", {
      ownerId, slug: "club", name: "Builders Club", lifecycleStatus: "active", visibility: "unlisted",
      inferenceFundingPolicy: "managed_required", entryPolicy: "paid_subscription", activeMemberCount: 2, createdAt: nowMs, updatedAt: nowMs,
    });
    const pricePointId = await ctx.db.insert("communityPricePoints", {
      communityId, billingPeriod: "monthly", name: "Monthly", amountBaseUnits: 13000, currency: "usd", currencyDecimals: 2,
      isCurrent: true, createdAt: nowMs, updatedAt: nowMs,
    });
    const member = (userId: any, accessSource: "paid_subscription" | "manual_grant") => ctx.db.insert("communityMemberships", {
      communityId, userId, role: "member", accessSource, ...(accessSource === "paid_subscription" ? { pricePointId } : {}),
      active: true, activationSequence: 1, activatedAt: nowMs - DAY, createdAt: nowMs - DAY, updatedAt: nowMs - DAY,
    });
    const samMembership = await member(samId, "paid_subscription");
    const annaMembership = await member(annaId, "manual_grant");
    await ctx.db.insert("communitySubscriptions", {
      communityId, userId: samId, membershipId: samMembership, pricePointId, source: "stripe", status: "active",
      cancelAtPeriodEnd: false, currentPeriodEndAt: nowMs + 20 * DAY, createdAt: nowMs, updatedAt: nowMs,
    });
    const roomId = await ctx.db.insert("communityChannels", {
      communityId, slug: "consulting-room", name: "Consulting room", accessMode: "restricted", postingPolicy: "members",
      status: "active", position: 1, createdAt: nowMs, updatedAt: nowMs,
    });
    return { ownerId, samId, leeId, annaId, communityId, pricePointId, samMembership, annaMembership, roomId };
  });
  return { t, ...ids, asOwner: t.withIdentity({ subject: "offers-owner" }), asSam: t.withIdentity({ subject: "offers-sam" }) };
}

type F = Awaited<ReturnType<typeof fixture>>;

const roomMembers = (f: F) => f.t.run(async (ctx) => (await ctx.db.query("communityChannelParticipants").collect())
  .filter((row) => String(row.channelId) === String(f.roomId) && row.status === "active")
  .map((row) => row.principalKey).sort());
const offerValue = (f: F, membershipId: any) => f.t.run(async (ctx) => (await ctx.db.query("communityClientValues")
  .withIndex("by_membership_property", (q) => q.eq("membershipId", membershipId).eq("propertyKey", "polynet_offer")).unique())?.value ?? null);

describe("offers in a community", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  test("adding a second offer keeps everyone on Membership, quietly", async () => {
    const f = await fixture();
    const saved = await f.asOwner.mutation(api.communityOffers.saveCommunityOffer, {
      communityId: f.communityId, name: "Membership + Consulting", blurb: "Everything, plus a private room with me.",
      price: { billingPeriod: "monthly", amountBaseUnits: 50000 },
    });
    expect(saved.key).toBe("membership-consulting");
    const view = await f.asOwner.query(api.communityOffers.listCommunityOffers, { communityId: f.communityId });
    expect(view.offers.map((offer: any) => [offer.key, offer.is_base, offer.price?.amount_base_units ?? null, offer.members])).toEqual([
      ["membership", true, 13000, 2],
      ["membership-consulting", false, 50000, 0],
    ]);
    expect(await offerValue(f, f.samMembership)).toEqual(["Membership"]);
    // The base price stays the community's only current price.
    const prices = await f.t.run((ctx) => ctx.db.query("communityPricePoints").collect());
    expect(prices.filter((row) => row.isCurrent).map((row) => row.amountBaseUnits)).toEqual([13000]);
    // Owner-side changes never start Workflow steps for everyone.
    expect(await f.t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())).toHaveLength(0);
    // Polynet keeps the Offer property; the owner can't overwrite it.
    await expect(f.asOwner.mutation(api.communityClients.setClientPropertyValue, {
      communityId: f.communityId, membershipId: String(f.samMembership), key: "polynet_offer", value: ["Membership + Consulting"],
    })).rejects.toThrow("client_property_system");
    await expect(f.asOwner.mutation(api.communityOffers.saveCommunityOffer, { communityId: f.communityId, name: "membership + consulting" }))
      .rejects.toThrow("offer_name_taken");
  });

  test("a private channel for Consulting adds the people on it and removes them when they leave", async () => {
    const f = await fixture();
    const { key } = await f.asOwner.mutation(api.communityOffers.saveCommunityOffer, {
      communityId: f.communityId, name: "Membership + Consulting", price: { billingPeriod: "monthly", amountBaseUnits: 50000 },
    });
    // Someone the owner put in by hand stays, whatever their offer.
    await f.asOwner.mutation(api.communityChannelParticipants.setParticipant, {
      communityId: f.communityId, channelId: f.roomId, target: { kind: "member", userId: f.annaId }, active: true,
    });
    await f.asOwner.mutation(api.communityOffers.setCommunityChannelOfferAudience, { communityId: f.communityId, channelId: f.roomId, offerKeys: [key] });
    expect(await roomMembers(f)).toEqual([`user:${f.annaId}`]);

    // Lee gets Consulting from the owner: he is in the room and on both offers.
    await f.asOwner.mutation(api.communityAccess.grantCommunityAccess, {
      communityId: f.communityId, email: "lee@example.com", endsAt: null, reason: "Consulting client", offerKey: key,
    });
    expect(await roomMembers(f)).toEqual([`user:${f.annaId}`, `user:${f.leeId}`].sort());
    const lee = await f.t.run((ctx) => ctx.db.query("communityMemberships").withIndex("by_community_user", (q) => q.eq("communityId", f.communityId).eq("userId", f.leeId)).unique());
    expect(await offerValue(f, lee!._id)).toEqual(["Membership", "Membership + Consulting"]);
    expect(lee!.heldOfferKeys).toEqual(["membership", key]);
    // His change (not the owner's setup) is what starts "starts an offer" steps.
    const scheduled = await f.t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled.some((job: any) => job.name.includes("handleOfferChangedInternal")
      && job.args[0].started.join() === `membership,${key}`)).toBe(true);

    // Moving him down to Membership takes him out of the room; Anna stays.
    await f.asOwner.mutation(api.communityAccess.grantCommunityAccess, {
      communityId: f.communityId, membershipId: String(lee!._id), endsAt: null, reason: "Consulting finished",
    });
    expect(await roomMembers(f)).toEqual([`user:${f.annaId}`]);
    expect(await offerValue(f, lee!._id)).toEqual(["Membership"]);

    // Sam pays for Consulting: his subscription's price decides it.
    const consultingPrice = await f.t.run(async (ctx) => (await ctx.db.query("communityPricePoints").collect()).find((row) => row.offerId)!);
    await f.t.run(async (ctx) => {
      const sub = await ctx.db.query("communitySubscriptions").first();
      await ctx.db.patch(sub!._id, { pricePointId: consultingPrice._id, updatedAt: Date.now() });
    });
    await f.t.run(async (ctx) => {
      const { syncCommunityAccessForUser } = await import("./communityAccessSync");
      await syncCommunityAccessForUser(ctx, { communityId: f.communityId, userId: f.samId, nowMs: Date.now(), reason: "test" });
    });
    expect(await roomMembers(f)).toContain(`user:${f.samId}`);

    // Taking the audience away removes only the people it added.
    await f.asOwner.mutation(api.communityOffers.setCommunityChannelOfferAudience, { communityId: f.communityId, channelId: f.roomId, offerKeys: [] });
    expect(await roomMembers(f)).toEqual([`user:${f.annaId}`]);
  });

  test("a Workflow step runs when someone starts the Consulting offer, and never holds anyone else's stage", async () => {
    const f = await fixture();
    const { key } = await f.asOwner.mutation(api.communityOffers.saveCommunityOffer, {
      communityId: f.communityId, name: "Membership + Consulting", price: { billingPeriod: "monthly", amountBaseUnits: 50000 },
    });
    await f.asOwner.mutation(api.communityClients.createClientProperty, { communityId: f.communityId, name: "Track", type: "select", options: ["Consulting"] });
    const first = await f.asOwner.mutation(api.communityMemberWorkflows.createBuilderWorkflowMilestone, { communityId: f.communityId, expectedRevision: 0, name: "New" });
    await expect(f.asOwner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
      communityId: f.communityId, expectedRevision: 1, milestoneKey: first.milestone.key, name: "New",
      automations: [{ key: "", trigger: { type: "offer_started" as const, offerKey: "nope" },
        action: { key: "", type: "set_client_property" as const, propertyKey: "track", value: "Consulting" } }],
    })).rejects.toThrow("workflow_offer_unavailable");
    await f.asOwner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
      communityId: f.communityId, expectedRevision: 1, milestoneKey: first.milestone.key, name: "New",
      automations: [{ key: "", trigger: { type: "offer_started" as const, offerKey: key },
        action: { key: "", type: "set_client_property" as const, propertyKey: "track", value: "Consulting" } }],
    });
    const run = (started: string[]) => f.t.mutation(internalApi.communityMemberWorkflows.handleOfferChangedInternal, {
      communityId: f.communityId, userId: f.samId, membershipId: f.samMembership, activationSequence: 1, started, ended: [], at: 1,
    });
    expect(await run(["membership"])).toMatchObject({ status: "trigger_unconfigured" });
    expect(await run([key])).toMatchObject({ status: "handled" });
    expect(await run([key])).toMatchObject({ results: [{ status: "already_executed" }] });
    const value = await f.t.run(async (ctx) => (await ctx.db.query("communityClientValues").collect()).find((row) => row.propertyKey === "track"));
    expect(value?.value).toBe("Consulting");
  });

  test("buying a higher offer: a visitor checks out at its price, a paying member switches plan, a hand-given member asks the owner", async () => {
    const f = await fixture();
    const { key } = await f.asOwner.mutation(api.communityOffers.saveCommunityOffer, {
      communityId: f.communityId, name: "Consulting", price: { billingPeriod: "monthly", amountBaseUnits: 50000 },
    });
    await f.asOwner.mutation(api.communityOffers.setCommunityChannelOfferAudience, { communityId: f.communityId, channelId: f.roomId, offerKeys: [key] });
    await f.t.run(async (ctx) => {
      const sub = await ctx.db.query("communitySubscriptions").first();
      await ctx.db.patch(sub!._id, { providerAccountId: "acct_owner", providerSubscriptionId: "sub_sam" });
      await ctx.db.patch(f.pricePointId, { providerAccountId: "acct_owner", providerPriceId: "price_membership" });
    });

    // The sales page lists both, lowest first; Sam sees he is on Membership and can move up here.
    const seen = await f.asSam.query(api.communityOfferCheckout.getCommunityOffersForVisitor, { communityId: f.communityId });
    expect(seen.offers.map((offer: any) => [offer.name, offer.prices[0].amount_base_units])).toEqual([["Membership", 13000], ["Consulting", 50000]]);
    expect(seen).toMatchObject({ current_offer_key: "membership", can_upgrade_here: true });

    // A visitor's checkout charges the offer's own price, not the membership's.
    const { resolveCommunityOfferCheckoutPricePoint } = await import("./communityOfferAccessCore");
    const visitor = await f.t.run(async (ctx) => await resolveCommunityOfferCheckoutPricePoint(ctx, { communityId: f.communityId, offerKey: key, billingPeriod: "monthly" }));
    expect(visitor).toMatchObject({ offerKey: key, offerName: "Consulting", pricePoint: { amountBaseUnits: 50000 } });
    expect(await f.t.run(async (ctx) => await resolveCommunityOfferCheckoutPricePoint(ctx, { communityId: f.communityId, offerKey: "membership", billingPeriod: "monthly" }))).toBeNull();
    await expect(f.t.run(async (ctx) => await resolveCommunityOfferCheckoutPricePoint(ctx, { communityId: f.communityId, offerKey: key, billingPeriod: "annual" })))
      .rejects.toThrow("offer_price_missing");

    const plan = (userId: any) => f.t.query(internalApi.communityOfferCheckout.planCommunityOfferUpgradeInternal, { communityId: f.communityId, userId, offerKey: key });
    expect(await plan(f.samId)).toMatchObject({ kind: "update", providerSubscriptionId: "sub_sam", providerAccountId: "acct_owner",
      amountBaseUnits: 50000, billingPeriod: "monthly", offerName: "Consulting" });
    expect(await plan(f.leeId)).toEqual({ kind: "checkout" });
    await expect(plan(f.annaId)).rejects.toThrow("offer_upgrade_ask_owner");

    // Stripe bills the Consulting price (an upgrade, or a switch in Stripe itself): Sam moves up and into the room.
    const consulting = await f.t.run(async (ctx) => (await ctx.db.query("communityPricePoints").collect()).find((row) => row.offerId)!);
    await f.t.run(async (ctx) => { await ctx.db.patch(consulting._id, { providerAccountId: "acct_owner", providerPriceId: "price_consulting" }); });
    await f.t.mutation(internalApi.communityCommerce.syncCommunitySubscriptionLifecycleInternal, {
      communityId: f.communityId, userId: f.samId, source: "stripe", status: "active", pricePointId: f.pricePointId,
      providerAccountId: "acct_owner", providerPriceId: "price_consulting", providerSubscriptionId: "sub_sam",
    });
    expect(await roomMembers(f)).toContain(`user:${f.samId}`);
    expect(await offerValue(f, f.samMembership)).toEqual(["Membership", "Consulting"]);
    expect(await f.t.run(async (ctx) => (await ctx.db.query("communitySubscriptions").collect()).map((row) => String(row.pricePointId))))
      .toEqual([String(consulting._id)]);
    await expect(plan(f.samId)).rejects.toThrow("offer_upgrade_not_higher");
  });

  test("Membership's price can be set from Offers: free or paid, and nobody already in loses access", async () => {
    const f = await fixture();
    await f.asOwner.mutation(api.communityOffers.saveCommunityOffer, {
      communityId: f.communityId, name: "Consulting", price: { billingPeriod: "monthly", amountBaseUnits: 50000 },
    });
    // Paid needs payouts first, as in General › Access & pricing.
    await expect(f.asOwner.mutation(api.communityOffers.setCommunityBaseOfferPrice, {
      communityId: f.communityId, price: { billingPeriod: "annual", amountBaseUnits: 100000 },
    })).rejects.toThrow(/community_(payout_access|stripe_connect)/);
    await f.asOwner.mutation(api.communityOffers.setCommunityBaseOfferPrice, { communityId: f.communityId, price: null });
    const view = await f.asOwner.query(api.communityOffers.listCommunityOffers, { communityId: f.communityId });
    expect(view.offers.map((offer: any) => [offer.key, offer.price?.amount_base_units ?? null])).toEqual([["membership", null], ["consulting", 50000]]);
    const community = await f.t.run((ctx) => ctx.db.get(f.communityId));
    expect(community).toMatchObject({ name: "Builders Club", slug: "club", visibility: "unlisted" });
    const memberships = await f.t.run((ctx) => ctx.db.query("communityMemberships").collect());
    expect(memberships.filter((row) => row.active).length).toBe(2);
    await expect(f.asSam.mutation(api.communityOffers.setCommunityBaseOfferPrice, { communityId: f.communityId, price: null })).rejects.toThrow();
  });

  test("a price that isn't a number is refused, and the community stays paid", async () => {
    const f = await fixture();
    for (const amountBaseUnits of [Number.NaN, Number.POSITIVE_INFINITY, 99]) {
      await expect(f.asOwner.mutation(api.communityOffers.setCommunityBaseOfferPrice, {
        communityId: f.communityId, price: { billingPeriod: "monthly", amountBaseUnits },
      })).rejects.toThrow("offer_price_invalid");
    }
    expect(await f.t.run((ctx) => ctx.db.get(f.communityId))).toMatchObject({ entryPolicy: "paid_subscription" });
    const prices = await f.t.run((ctx) => ctx.db.query("communityPricePoints").collect());
    expect(prices.filter((row) => row.isCurrent).map((row) => row.amountBaseUnits)).toEqual([13000]);
  });

  test("a member who already pays can't start a second checkout; others can", async () => {
    const f = await fixture();
    const check = (userId: any) => f.t.query(internalApi.communityCommerce.requirePublicCommunityCheckoutNotBlockedInternal, { communityId: f.communityId, userId });
    await expect(check(f.samId)).rejects.toThrow("offer_checkout_already_paying");
    await expect(check(f.leeId)).resolves.toEqual({ ok: true });
    // Access given by hand has no plan to switch, so Anna buys at checkout.
    await expect(check(f.annaId)).resolves.toEqual({ ok: true });
  });

  test("a track sold through Consulting: a Membership member reads the first lesson free and sees the rest locked, without their text", async () => {
    const f = await fixture();
    const { key } = await f.asOwner.mutation(api.communityOffers.saveCommunityOffer, {
      communityId: f.communityId, name: "Membership + Consulting", price: { billingPeriod: "monthly", amountBaseUnits: 50000 },
    });
    const ids = await f.t.run(async (ctx) => {
      const now = Date.now();
      const moduleId = await ctx.db.insert("communityResourceModules", {
        communityId: f.communityId, createdByUserId: f.ownerId, status: "live", name: "Sales calls", sortOrder: 1, createdAt: now, updatedAt: now,
      });
      const page = (title: string, sortOrder: number) => ctx.db.insert("communityResources", {
        communityId: f.communityId, moduleId, createdByUserId: f.ownerId, type: "post", role: "page", status: "published",
        title, bodyMd: `Inside ${title}.`, bodyChars: 9, pinned: false, sortOrder, lesson: { minutes: 6 }, createdAt: now, updatedAt: now,
      } as any);
      return { first: String(await page("Open the call", 1)), second: String(await page("Close the call", 2)) };
    });
    await expect(f.asOwner.mutation(api.communityLessonTracks.saveCommunityLessonTrack, {
      communityId: f.communityId, key: "sales", expectedRevision: 0, title: "Sales calls", opensWhen: [{ type: "offer", offer: "vip" }],
      stages: [{ name: "Calls", steps: [{ resource_id: ids.first }, { resource_id: ids.second }] }],
    })).rejects.toThrow("track_invalid");
    await f.asOwner.mutation(api.communityLessonTracks.saveCommunityLessonTrack, {
      communityId: f.communityId, key: "sales", expectedRevision: 0, title: "Sales calls", summary: "Book and close calls on your own.",
      outcomes: ["Open a call", "Close a call"], audience: "Owners who sell on calls", coverStyle: "diagram",
      opensWhen: [{ type: "offer", offer: key }], stages: [{ name: "Calls", steps: [{ resource_id: ids.first }, { resource_id: ids.second }] }],
    });

    const progress: any = await f.asSam.query(api.communityResourceProgress.getOwnResourceProgress, { communityId: f.communityId });
    const sales = progress.tracks.find((track: any) => track.key === "sales");
    expect(sales).toMatchObject({
      open: false, minutes: 12, cover_style: "diagram", outcomes: ["Open a call", "Close a call"], audience: "Owners who sell on calls",
      paid: { offer: key, offer_name: "Membership + Consulting", preview: { resource_id: ids.first } },
    });
    const listed: any[] = await f.asSam.query(api.communityResources.listCommunityResources, { communityId: f.communityId });
    const byId = new Map(listed.map((row) => [row.id, row]));
    expect(byId.get(ids.first)).toMatchObject({ body_md: "Inside Open the call." });
    expect(byId.get(ids.second)).toMatchObject({ title: "Close the call", body_md: null, paywalled: true });
    expect(await f.asSam.mutation(api.communityResourceProgress.setOwnResourceProgressStatus, {
      communityId: f.communityId, resourceId: ids.second, status: "done",
    })).toMatchObject({ ok: false, code: "lesson_locked" });

    // Sam's agent can't read it either.
    const reads: any[] = await Promise.all([ids.first, ids.second].map((id) =>
      f.t.query(internalApi.communityResources.readCommunityResourceDirectoryInternal, {
        userId: f.samId, communityId: f.communityId, ref: `resource:${id}`,
      })));
    expect(reads.map((read) => read.ok)).toEqual([true, false]);
    // The owner reads everything they sell.
    const owned: any[] = await f.asOwner.query(api.communityResources.listCommunityResources, { communityId: f.communityId });
    expect(owned.find((row) => row.id === ids.second)).toMatchObject({ body_md: "Inside Close the call." });
    const builder: any = await f.asOwner.query(api.communityLessonTracks.listCommunityLessonTracks, { communityId: f.communityId });
    expect(builder.offers.map((offer: any) => offer.key)).toEqual(["membership", key]);
    expect(builder.tracks.find((track: any) => track.key === "sales")).toMatchObject({ cover_style: "diagram", audience: "Owners who sell on calls" });
  });
});

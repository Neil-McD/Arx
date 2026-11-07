/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";
import { getCommunityAndMembership, requireCommunityChatAccess, resolveCommunityLens } from "./communityCore";
import { resolveCommunityInferenceFundingAdmission } from "./founderInferenceCore";
import { FREE_COMMUNITIES_PER_OWNER } from "./communityCore";

const modules = import.meta.glob(["./*.ts", "!./*.test.ts", "./_generated/**/*.*s"]);
const NOW = Date.now();

// A founder with a finished account and no plan, not the platform owner.
async function founder(t: ReturnType<typeof convexTest>, handle = "free-founder") {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      authSubject: `${handle}-subject`, displayName: "Free Founder", handle, normalizedHandle: handle, createdAt: NOW, updatedAt: NOW,
    });
    await ctx.db.insert("userProfileDetails", { userId, displayName: "Free Founder", avatarUrl: "https://example.com/f.png", createdAt: NOW, updatedAt: NOW });
    for (const document of PLATFORM_LEGAL_DOCUMENTS) {
      await ctx.db.insert("legalAcceptances", { userId, documentKey: document.key, documentVersion: document.version, acceptedAt: NOW, source: "test", createdAt: NOW });
    }
    return userId;
  });
}

test("free dashboard: a founder with no plan creates a community that runs; only the agent needs a plan", async () => {
  const t = convexTest(schema, modules);
  const ownerId = await founder(t);
  const asOwner = t.withIdentity({ subject: "free-founder-subject" });
  const created = await asOwner.mutation(api.communityLifecycle.createCommunity, { name: "Night Swimmers", slug: "night-swimmers" });
  const communityId = created.id as any;
  const result = await t.run(async (ctx) => {
    const community = (await ctx.db.get(communityId)) as any;
    const { membership } = await getCommunityAndMembership({ ctx, communityId, userId: ownerId });
    const lens = await resolveCommunityLens({ ctx, community, membership, userId: ownerId });
    await requireCommunityChatAccess({ ctx, communityId, userId: ownerId });
    const agent = await resolveCommunityInferenceFundingAdmission(ctx, communityId);
    return { operational: lens.operational, relation: lens.relation, manage: lens.can.manageMembers, agent };
  });
  expect(result).toEqual({
    operational: true, relation: "owner", manage: true,
    agent: { ok: false, code: "founder_plan_required" },
  });
});

test("free dashboard: an owner has a bounded number of live communities; archived ones don't count", async () => {
  const t = convexTest(schema, modules);
  await founder(t, "busy-founder");
  const asOwner = t.withIdentity({ subject: "busy-founder-subject" });
  const ids: any[] = [];
  for (let index = 0; index < FREE_COMMUNITIES_PER_OWNER; index += 1) {
    ids.push((await asOwner.mutation(api.communityLifecycle.createCommunity, { name: `Club ${index}`, slug: `busy-club-${index}` })).id);
  }
  await expect(asOwner.mutation(api.communityLifecycle.createCommunity, { name: "One more", slug: "busy-one-more" }))
    .rejects.toThrow("community_owner_limit_reached");
  await t.run((ctx) => ctx.db.patch(ids[0], { lifecycleStatus: "archived" } as any));
  await expect(asOwner.mutation(api.communityLifecycle.createCommunity, { name: "One more", slug: "busy-one-more" })).resolves.toMatchObject({ slug: "busy-one-more" });
});

test("free dashboard: the cap counts every live community, however much archived history comes first", async () => {
  const t = convexTest(schema, modules);
  const ownerId = await founder(t, "history-founder");
  await t.run(async (ctx) => {
    for (let index = 0; index < 205; index += 1) {
      await ctx.db.insert("communities", { ownerId, slug: `old-${index}`, name: `Old ${index}`, lifecycleStatus: "archived", lifecycleGeneration: 1,
        visibility: "unlisted", inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 1, createdAt: NOW, updatedAt: NOW } as any);
    }
  });
  const asOwner = t.withIdentity({ subject: "history-founder-subject" });
  for (let index = 0; index < FREE_COMMUNITIES_PER_OWNER; index += 1) {
    await asOwner.mutation(api.communityLifecycle.createCommunity, { name: `New ${index}`, slug: `history-new-${index}` });
  }
  await expect(asOwner.mutation(api.communityLifecycle.createCommunity, { name: "One more", slug: "history-one-more" }))
    .rejects.toThrow("community_owner_limit_reached");
});

test("free dashboard: restoring a free community counts against the cap, as creating does", async () => {
  const t = convexTest(schema, modules);
  const ownerId = await founder(t, "restore-founder");
  const asOwner = t.withIdentity({ subject: "restore-founder-subject" });
  const archivedId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("communities", { ownerId, slug: "restore-me", name: "Restore me", lifecycleStatus: "archived", lifecycleGeneration: 1,
      visibility: "unlisted", inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 1,
      createdAt: NOW, updatedAt: NOW } as any);
    await ctx.db.insert("communityArchiveBillingJobs", { communityId: id, lifecycleGeneration: 1, status: "complete", attemptCount: 0,
      nextAttemptAt: NOW, completedAt: NOW, createdAt: NOW, updatedAt: NOW } as any);
    return id;
  });
  for (let index = 0; index < FREE_COMMUNITIES_PER_OWNER; index += 1) {
    await asOwner.mutation(api.communityLifecycle.createCommunity, { name: `Live ${index}`, slug: `restore-live-${index}` });
  }
  const restore = () => asOwner.mutation((api as any).communityColdArchive.restoreCommunityWithoutPayment, { communityId: archivedId, lifecycleGeneration: 1 });
  await expect(restore()).rejects.toThrow("community_owner_limit_reached");
  // Its old plan, ended by archive cleanup, doesn't exempt it.
  await t.run((ctx) => ctx.db.insert("founderSubscriptions", {
    ownerUserId: ownerId, communityId: archivedId, provider: "stripe", providerCustomerId: "cus_r", providerSubscriptionId: "sub_r", providerPriceId: "price_r",
    status: "ended", cancelAtPeriodEnd: false, lastProviderEventCreatedAt: NOW, currentPeriodStartAt: NOW - 2000, currentPeriodEndAt: NOW - 1000,
    attachedAt: NOW - 2000, createdAt: NOW, updatedAt: NOW,
  } as any));
  await expect(restore()).rejects.toThrow("community_owner_limit_reached");
  // One live community archived: there's room, and it comes back.
  const live = await t.run((ctx) => ctx.db.query("communities").withIndex("by_slug", (q) => q.eq("slug", "restore-live-0")).first());
  await t.run((ctx) => ctx.db.patch(live!._id, { lifecycleStatus: "archived" } as any));
  await expect(restore()).resolves.toMatchObject({ ok: true, changed: true });
});

test("free dashboard: a founder at the cap still creates a community that brings its own Agent plan", async () => {
  vi.stubEnv("POLYNET_FOUNDER_STRIPE_PRICE_ID", "price_agent_plan");
  vi.stubEnv("POLYNET_LUNA_INPUT_COST_MICROS_PER_MILLION_TOKENS", "200000");
  vi.stubEnv("POLYNET_LUNA_OUTPUT_COST_MICROS_PER_MILLION_TOKENS", "1200000");
  vi.stubEnv("POLYNET_FOUNDER_MAX_RUN_RESERVATION_COST_MICROS", "1000000");
  try {
    const t = convexTest(schema, modules);
    const ownerId = await founder(t, "funded-founder");
    const asOwner = t.withIdentity({ subject: "funded-founder-subject" });
    for (let index = 0; index < FREE_COMMUNITIES_PER_OWNER; index += 1) {
      await asOwner.mutation(api.communityLifecycle.createCommunity, { name: `Club ${index}`, slug: `funded-club-${index}` });
    }
    await expect(asOwner.mutation(api.communityLifecycle.createCommunity, { name: "Free one", slug: "funded-free-one" }))
      .rejects.toThrow("community_owner_limit_reached");
    const subscriptionId = await t.run((ctx) => ctx.db.insert("founderSubscriptions", {
      ownerUserId: ownerId, provider: "stripe", providerCustomerId: "cus_f", providerSubscriptionId: "sub_f", providerPriceId: "price_agent_plan",
      status: "active", cancelAtPeriodEnd: false, lastProviderEventCreatedAt: NOW, currentPeriodStartAt: NOW - 1000, currentPeriodEndAt: NOW + 86_400_000,
      createdAt: NOW, updatedAt: NOW,
    } as any));
    const funded = await asOwner.mutation(api.communityLifecycle.createCommunity, { name: "Funded one", slug: "funded-one", founderSubscriptionId: subscriptionId });
    expect(funded).toMatchObject({ slug: "funded-one" });
    expect(await t.run((ctx) => ctx.db.get(subscriptionId))).toMatchObject({ communityId: funded.id });
  } finally {
    vi.unstubAllEnvs();
  }
});


/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";
import { getCommunityAndMembership, requireCommunityChatAccess, resolveCommunityLens } from "./communityCore";
import { resolveCommunityBuilderAccess } from "./communityBuilderAccessCore";
import { resolveCommunityInferenceFundingAdmission } from "./founderInferenceCore";
import { FREE_COMMUNITIES_PER_OWNER } from "./communityLifecycle";

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
    const access = await resolveCommunityBuilderAccess({ ctx, community });
    const { membership } = await getCommunityAndMembership({ ctx, communityId, userId: ownerId });
    const lens = await resolveCommunityLens({ ctx, community, membership, userId: ownerId });
    await requireCommunityChatAccess({ ctx, communityId, userId: ownerId });
    const agent = await resolveCommunityInferenceFundingAdmission(ctx, communityId);
    return { mode: community.builderAccessMode, operational: access.operational, source: access.source, relation: lens.relation, manage: lens.can.manageMembers, agent };
  });
  expect(result).toEqual({
    mode: "free", operational: true, source: "free", relation: "owner", manage: true,
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

test("pricing v2 migration: subscription-required communities become free, audited, plans untouched; free and grandfathered stay", async () => {
  const t = convexTest(schema, modules);
  const ownerId = await founder(t, "legacy-founder");
  const ids = await t.run(async (ctx) => {
    const community = (slug: string, builderAccessMode?: string) => ctx.db.insert("communities", {
      ownerId, slug, name: slug, visibility: "unlisted", inferenceFundingPolicy: "managed_required", entryPolicy: "open",
      activeMemberCount: 1, createdAt: NOW, updatedAt: NOW, ...(builderAccessMode ? { builderAccessMode } : {}),
    } as any);
    const legacy = await community("legacy-paid", "subscription_required");
    const legacyArchived = await community("legacy-archived", "subscription_required");
    await ctx.db.patch(legacyArchived, { lifecycleStatus: "archived" } as any);
    const old = await community("old-grandfathered");
    const free = await community("already-free", "free");
    const subscriptionId = await ctx.db.insert("founderSubscriptions", {
      ownerUserId: ownerId, communityId: legacy, provider: "stripe", providerCustomerId: "cus_x", providerSubscriptionId: "sub_x",
      providerPriceId: "price_x", status: "past_due", cancelAtPeriodEnd: false, lastProviderEventCreatedAt: NOW, currentPeriodStartAt: NOW - 1000, currentPeriodEndAt: NOW + 1000, attachedAt: NOW, createdAt: NOW, updatedAt: NOW,
    } as any);
    return { legacy, legacyArchived, old, free, subscriptionId };
  });
  const before = await t.run((ctx) => ctx.db.get(ids.legacy));
  const dry = await t.mutation(internal.communityLifecycle.migrateSubscriptionRequiredCommunitiesToFreeInternal, { dryRun: true });
  expect(dry).toEqual({ dryRun: true, changed: 2, communityIds: expect.arrayContaining([String(ids.legacy), String(ids.legacyArchived)]) });
  expect((await t.run((ctx) => ctx.db.get(ids.legacy)))?.builderAccessMode).toBe("subscription_required");
  const run = await t.mutation(internal.communityLifecycle.migrateSubscriptionRequiredCommunitiesToFreeInternal, {});
  expect(run).toMatchObject({ dryRun: false, changed: 2 });
  const after = await t.run(async (ctx) => ({
    modes: await Promise.all([ids.legacy, ids.legacyArchived, ids.old, ids.free].map(async (id) => ((await ctx.db.get(id)) as any)?.builderAccessMode ?? null)),
    archived: ((await ctx.db.get(ids.legacyArchived)) as any)?.lifecycleStatus,
    subscription: await ctx.db.get(ids.subscriptionId),
    audit: (await ctx.db.query("criticalAuditEvents").collect()).filter((row) => row.eventType === "community_builder_access_freed").length,
  }));
  expect(after.modes).toEqual(["free", "free", null, "free"]);
  expect(after.archived).toBe("archived");
  expect(after.subscription).toMatchObject({ communityId: ids.legacy, status: "past_due" });
  expect(after.audit).toBe(2);
  expect((before as any).name).toBe("legacy-paid");
  // Run again: nothing left.
  expect(await t.mutation(internal.communityLifecycle.migrateSubscriptionRequiredCommunitiesToFreeInternal, {})).toMatchObject({ changed: 0 });
});

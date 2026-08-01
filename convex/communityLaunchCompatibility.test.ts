/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./community.ts",
  "./communityLifecycle.ts",
  "./communityLaunchSetup.ts",
  "./_generated/**/*.*s",
]);

const OWNER_SUBJECT = "community-launch-owner";
const ADMIN_SUBJECT = "community-launch-admin";
const OUTSIDER_SUBJECT = "community-launch-outsider";

async function createFixture(t: ReturnType<typeof convexTest>) {
  const nowMs = 1_750_000_000_000;
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: OWNER_SUBJECT,
      displayName: "Community launch owner",
      handle: "community-launch-owner",
      normalizedHandle: "community-launch-owner",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const adminId = await ctx.db.insert("users", {
      authSubject: ADMIN_SUBJECT,
      displayName: "Community launch admin",
      handle: "community-launch-admin",
      normalizedHandle: "community-launch-admin",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const outsiderId = await ctx.db.insert("users", {
      authSubject: OUTSIDER_SUBJECT,
      displayName: "Community launch outsider",
      handle: "community-launch-outsider",
      normalizedHandle: "community-launch-outsider",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "rolling-launch-contract",
      name: "Rolling launch contract",
      oneLiner: "Compatibility without restoring the launcher.",
      about: "Initial about",
      visibility: "unlisted",
      entryPolicy: "open",
      activeMemberCount: 2,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.insert("communityMemberships", {
      communityId,
      userId: adminId,
      role: "admin",
      accessSource: "free_grant",
      active: true,
      activationSequence: 1,
      activatedAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return { ownerId, adminId, outsiderId, communityId };
  });
}

test("new About and legacy launch RPCs coexist across a rolling deployment", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });

  await expect(
    asOwner.mutation(api.communityLifecycle.saveCommunityAbout, {
      communityId: fixture.communityId,
      about: "Updated through the narrow contract.",
    }),
  ).resolves.toMatchObject({
    community_id: String(fixture.communityId),
    about: "Updated through the narrow contract.",
  });

  await expect(
    asOwner.mutation(api.communityLifecycle.saveCommunityLaunchProfile, {
      communityId: fixture.communityId,
      name: "Rolling contract preserved",
      about: "Updated through an already-loaded client.",
    }),
  ).resolves.toMatchObject({
    id: String(fixture.communityId),
    name: "Rolling contract preserved",
    about: "Updated through an already-loaded client.",
  });

  await expect(
    asOwner.mutation(api.community.saveCommunityLaunchProfile, {
      communityId: fixture.communityId,
      about: "Updated through the production compatibility facade.",
    }),
  ).resolves.toMatchObject({
    id: String(fixture.communityId),
    name: "Rolling contract preserved",
    about: "Updated through the production compatibility facade.",
  });

  const stagingStatus = await asOwner.query(
    api.communityLaunchSetup.getCommunityLaunchSetupStatus,
    {
      communityId: fixture.communityId,
    },
  );
  const productionStatus = await asOwner.query(
    api.community.getCommunityLaunchSetupStatus,
    {
      communityId: fixture.communityId,
    },
  );
  expect(productionStatus).toEqual(stagingStatus);
  expect(stagingStatus).toMatchObject({
    completed: false,
    steps: expect.arrayContaining([
      expect.objectContaining({ step: "profile", completed: true }),
      expect.objectContaining({ step: "about", completed: true }),
    ]),
  });
});

test("admins can update copy but cannot use compatibility RPCs for owner-only changes", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asAdmin = t.withIdentity({ subject: ADMIN_SUBJECT });

  await expect(
    asAdmin.mutation(api.communityLifecycle.saveCommunityAbout, {
      communityId: fixture.communityId,
      about: "Admin-managed narrow About.",
    }),
  ).resolves.toMatchObject({
    community_id: String(fixture.communityId),
    about: "Admin-managed narrow About.",
  });
  await expect(
    asAdmin.mutation(api.community.saveCommunityLaunchProfile, {
      communityId: fixture.communityId,
      oneLiner: "Admin-managed compatibility copy.",
      about: "Admin-managed compatibility About.",
    }),
  ).resolves.toMatchObject({
    id: String(fixture.communityId),
    name: "Rolling launch contract",
    one_liner: "Admin-managed compatibility copy.",
    about: "Admin-managed compatibility About.",
  });

  await expect(
    asAdmin.mutation(api.communityLifecycle.saveCommunityLaunchProfile, {
      communityId: fixture.communityId,
      name: "Unauthorized admin rename",
    }),
  ).rejects.toThrow("community_owner_required");

  const community = await t.run(async (ctx) =>
    ctx.db.get(fixture.communityId),
  );
  expect(community).toMatchObject({
    name: "Rolling launch contract",
    oneLiner: "Admin-managed compatibility copy.",
    about: "Admin-managed compatibility About.",
  });
});

test("rolling compatibility RPCs remain fail-closed to non-managers", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOutsider = t.withIdentity({ subject: OUTSIDER_SUBJECT });

  await expect(
    asOutsider.mutation(api.communityLifecycle.saveCommunityAbout, {
      communityId: fixture.communityId,
      about: "Unauthorized",
    }),
  ).rejects.toThrow();
  await expect(
    asOutsider.mutation(api.community.saveCommunityLaunchProfile, {
      communityId: fixture.communityId,
      about: "Unauthorized",
    }),
  ).rejects.toThrow();
  await expect(
    asOutsider.query(api.community.getCommunityLaunchSetupStatus, {
      communityId: fixture.communityId,
    }),
  ).rejects.toThrow();

  await expect(
    asOutsider.mutation(api.community.saveCommunityLaunchProfile, {
      userId: fixture.ownerId,
      communityId: fixture.communityId,
      about: "Spoofed owner ID",
    }),
  ).rejects.toThrow("user_id_mismatch");
  await expect(
    asOutsider.mutation(api.communityLifecycle.saveCommunityLaunchProfile, {
      userId: fixture.ownerId,
      authSubject: OWNER_SUBJECT,
      communityId: fixture.communityId,
      about: "Spoofed owner subject",
    }),
  ).rejects.toThrow("auth_subject_mismatch");

  const community = await t.run(async (ctx) =>
    ctx.db.get(fixture.communityId),
  );
  expect(community).toMatchObject({
    name: "Rolling launch contract",
    about: "Initial about",
  });
});

test("legacy Published communities can save unrelated settings without weakening readiness", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });

  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.communityId, {
      visibility: "published",
    });
  });

  await expect(
    asOwner.mutation(api.communityLifecycle.saveCommunitySettings, {
      communityId: fixture.communityId,
      name: "Rolling launch contract",
      slug: "rolling-launch-contract",
      oneLiner: "Compatibility without restoring the launcher.",
      about: "Updated through the canonical settings mutation.",
      avatarStorageId: null,
      avatarUrl: null,
      bannerStorageId: null,
      bannerUrl: null,
      visibility: "published",
      monthlyAmountBaseUnits: null,
      annualAmountBaseUnits: null,
    }),
  ).resolves.toMatchObject({
    community_id: String(fixture.communityId),
    about: "Updated through the canonical settings mutation.",
    visibility: "published",
  });

  await expect(
    asOwner.mutation(api.community.saveCommunityLaunchProfile, {
      communityId: fixture.communityId,
      about: "Updated through the rolling compatibility mutation.",
    }),
  ).resolves.toMatchObject({
    id: String(fixture.communityId),
    about: "Updated through the rolling compatibility mutation.",
    visibility: "published",
  });

  await expect(
    asOwner.mutation(api.communityLifecycle.saveCommunitySettings, {
      communityId: fixture.communityId,
      name: "Rolling launch contract",
      slug: "rolling-launch-contract",
      oneLiner: null,
      about: "Must not persist.",
      avatarStorageId: null,
      avatarUrl: null,
      bannerStorageId: null,
      bannerUrl: null,
      visibility: "published",
      monthlyAmountBaseUnits: null,
      annualAmountBaseUnits: null,
    }),
  ).rejects.toThrow(
    "community_publish_ready_required:community_one_liner",
  );

  const community = await t.run(async (ctx) =>
    ctx.db.get(fixture.communityId),
  );
  expect(community).toMatchObject({
    oneLiner: "Compatibility without restoring the launcher.",
    about: "Updated through the rolling compatibility mutation.",
    visibility: "published",
  });
});

test("publishing transitions and readiness regressions remain fail-closed", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });

  await expect(
    asOwner.mutation(api.communityLifecycle.saveCommunitySettings, {
      communityId: fixture.communityId,
      name: "Rolling launch contract",
      slug: "rolling-launch-contract",
      oneLiner: "Compatibility without restoring the launcher.",
      about: "Still a draft.",
      avatarStorageId: null,
      avatarUrl: null,
      bannerStorageId: null,
      bannerUrl: null,
      visibility: "published",
      monthlyAmountBaseUnits: null,
      annualAmountBaseUnits: null,
    }),
  ).rejects.toThrow(
    "community_publish_ready_required:community_avatar,community_banner",
  );

  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.communityId, {
      avatarUrl: "https://example.com/avatar.png",
      bannerUrl: "https://example.com/banner.png",
      visibility: "published",
    });
  });

  await expect(
    asOwner.mutation(api.communityLifecycle.saveCommunitySettings, {
      communityId: fixture.communityId,
      name: "Rolling launch contract",
      slug: "rolling-launch-contract",
      oneLiner: "Compatibility without restoring the launcher.",
      about: "Must not persist.",
      avatarStorageId: null,
      avatarUrl: "https://example.com/avatar.png",
      bannerStorageId: null,
      bannerUrl: null,
      visibility: "published",
      monthlyAmountBaseUnits: null,
      annualAmountBaseUnits: null,
    }),
  ).rejects.toThrow(
    "community_publish_ready_required:community_banner",
  );

  const community = await t.run(async (ctx) =>
    ctx.db.get(fixture.communityId),
  );
  expect(community).toMatchObject({
    avatarUrl: "https://example.com/avatar.png",
    bannerUrl: "https://example.com/banner.png",
    about: "Initial about",
    visibility: "published",
  });
});

test("managed communities require an active founder subscription before publishing", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const nowMs = Date.now();

  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.communityId, {
      inferenceFundingPolicy: "managed_required",
      avatarUrl: "https://example.com/avatar.png",
      bannerUrl: "https://example.com/banner.png",
    });
    await ctx.db.insert("founderInferenceGrants", {
      userId: fixture.adminId,
      cohortKey: "existing_founder_cutover_v1",
      status: "approved",
      approvedAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
  });

  const publish = () => asOwner.mutation(api.communityLifecycle.saveCommunitySettings, {
    communityId: fixture.communityId,
    name: "Rolling launch contract",
    slug: "rolling-launch-contract",
    oneLiner: "Compatibility without restoring the launcher.",
    about: "Ready to launch.",
    avatarStorageId: null,
    avatarUrl: "https://example.com/avatar.png",
    bannerStorageId: null,
    bannerUrl: "https://example.com/banner.png",
    visibility: "published",
    monthlyAmountBaseUnits: null,
    annualAmountBaseUnits: null,
  });

  await expect(publish()).rejects.toThrow(
    "community_founder_funding_required_to_publish",
  );

  await t.run(async (ctx) => {
    await ctx.db.insert("founderSubscriptions", {
      ownerUserId: fixture.ownerId,
      communityId: fixture.communityId,
      provider: "stripe",
      providerCustomerId: "cus_publish_gate",
      providerSubscriptionId: "sub_publish_gate",
      providerPriceId: "price_publish_gate",
      status: "active",
      currentPeriodStartAt: nowMs - 1_000,
      currentPeriodEndAt: nowMs + 30 * 24 * 60 * 60 * 1_000,
      cancelAtPeriodEnd: false,
      lastProviderEventCreatedAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
  });

  await expect(publish()).resolves.toMatchObject({ visibility: "published" });
});

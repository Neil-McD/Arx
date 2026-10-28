/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityLifecycle.ts",
  "./_generated/**/*.*s",
]);

const OWNER_SUBJECT = "community-settings-version-owner";
const ADMIN_SUBJECT = "community-settings-version-admin";
const OUTSIDER_SUBJECT = "community-settings-version-outsider";

async function createFixture(t: ReturnType<typeof convexTest>) {
  const nowMs = 1_775_000_000_000;
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: OWNER_SUBJECT,
      displayName: "Settings version owner",
      handle: "settings-version-owner",
      normalizedHandle: "settings-version-owner",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const adminId = await ctx.db.insert("users", {
      authSubject: ADMIN_SUBJECT,
      displayName: "Settings version admin",
      handle: "settings-version-admin",
      normalizedHandle: "settings-version-admin",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const outsiderId = await ctx.db.insert("users", {
      authSubject: OUTSIDER_SUBJECT,
      displayName: "Settings version outsider",
      handle: "settings-version-outsider",
      normalizedHandle: "settings-version-outsider",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "settings-version-contract",
      name: "Settings version contract",
      oneLiner: "One canonical settings snapshot.",
      about: "Initial settings snapshot.",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "approval",
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
    return { ownerId, adminId, outsiderId, communityId, nowMs };
  });
}

function settingsInput(
  communityId: any,
  expectedSettingsRevision: number,
  about: string,
) {
  return {
    communityId,
    expectedSettingsRevision,
    name: "Settings version contract",
    slug: "settings-version-contract",
    oneLiner: "One canonical settings snapshot.",
    about,
    avatarStorageId: null,
    avatarUrl: null,
    bannerStorageId: null,
    bannerUrl: null,
    visibility: "unlisted",
    monthlyAmountBaseUnits: null,
    annualAmountBaseUnits: null,
  } as const;
}

test("authorized managers read one canonical settings snapshot", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  const asAdmin = t.withIdentity({ subject: ADMIN_SUBJECT });
  const asOutsider = t.withIdentity({ subject: OUTSIDER_SUBJECT });

  await expect(
    asOwner.query(api.communityLifecycle.getCommunitySettings, {
      communityId: fixture.communityId,
    }),
  ).resolves.toMatchObject({
    community_id: String(fixture.communityId),
    settings_revision: 0,
    about: "Initial settings snapshot.",
    pricing: {
      mode: "free",
      monthly_amount_base_units: null,
      annual_amount_base_units: null,
      currency: "usd",
      currency_decimals: 2,
    },
  });
  await expect(
    asAdmin.query(api.communityLifecycle.getCommunitySettings, {
      communityId: fixture.communityId,
    }),
  ).resolves.toMatchObject({ settings_revision: 0 });
  await expect(
    asOutsider.query(api.communityLifecycle.getCommunitySettings, {
      communityId: fixture.communityId,
    }),
  ).rejects.toThrow("community_forbidden");
});

test("settings saves reject stale revisions without changing canonical state", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });

  await expect(
    asOwner.mutation(
      api.communityLifecycle.saveCommunitySettings,
      settingsInput(fixture.communityId, 0, "First committed settings."),
    ),
  ).resolves.toMatchObject({
    settings_revision: 1,
    about: "First committed settings.",
  });

  await expect(
    asOwner.mutation(
      api.communityLifecycle.saveCommunitySettings,
      settingsInput(fixture.communityId, 0, "Stale settings must not persist."),
    ),
  ).rejects.toThrow("community_settings_conflict");

  await expect(
    asOwner.query(api.communityLifecycle.getCommunitySettings, {
      communityId: fixture.communityId,
    }),
  ).resolves.toMatchObject({
    settings_revision: 1,
    about: "First committed settings.",
  });

  await expect(
    asOwner.mutation(
      api.communityLifecycle.saveCommunitySettings,
      settingsInput(fixture.communityId, 1, "Retry against the current revision."),
    ),
  ).resolves.toMatchObject({
    settings_revision: 2,
    about: "Retry against the current revision.",
  });
});

test("competing writers cannot both commit the same settings revision", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });

  const results = await Promise.allSettled([
    asOwner.mutation(
      api.communityLifecycle.saveCommunitySettings,
      settingsInput(fixture.communityId, 0, "Writer A"),
    ),
    asOwner.mutation(
      api.communityLifecycle.saveCommunitySettings,
      settingsInput(fixture.communityId, 0, "Writer B"),
    ),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  expect(
    results.some(
      (result) =>
        result.status === "rejected" &&
        String(result.reason).includes("community_settings_conflict"),
    ),
  ).toBe(true);

  const snapshot = await asOwner.query(
    api.communityLifecycle.getCommunitySettings,
    { communityId: fixture.communityId },
  );
  expect(snapshot.settings_revision).toBe(1);
  expect(["Writer A", "Writer B"]).toContain(snapshot.about);
});

test("the narrow About write advances the settings revision", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });

  await expect(
    asOwner.mutation(api.communityLifecycle.saveCommunityAbout, {
      communityId: fixture.communityId,
      about: "Narrow About write.",
    }),
  ).resolves.toMatchObject({ settings_revision: 1 });
  await expect(
    asOwner.query(api.communityLifecycle.getCommunitySettings, {
      communityId: fixture.communityId,
    }),
  ).resolves.toMatchObject({
    settings_revision: 1,
    about: "Narrow About write.",
  });
});

test("a stale settings write cannot partially change active pricing", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createFixture(t);
  await t.run(async (ctx) => {
    await ctx.db.patch(fixture.communityId, { settingsRevision: 4 });
    await ctx.db.insert("communityPricePoints", {
      communityId: fixture.communityId,
      billingPeriod: "monthly",
      name: "Monthly access",
      amountBaseUnits: 9900,
      currency: "usd",
      currencyDecimals: 2,
      isCurrent: true,
      createdAt: fixture.nowMs,
      updatedAt: fixture.nowMs,
    });
  });
  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });

  await expect(
    asOwner.mutation(
      api.communityLifecycle.saveCommunitySettings,
      settingsInput(fixture.communityId, 3, "Stale free downgrade."),
    ),
  ).rejects.toThrow("community_settings_conflict");

  await expect(
    asOwner.query(api.communityLifecycle.getCommunitySettings, {
      communityId: fixture.communityId,
    }),
  ).resolves.toMatchObject({
    settings_revision: 4,
    about: "Initial settings snapshot.",
    pricing: {
      mode: "monthly",
      monthly_amount_base_units: 9900,
    },
  });
});

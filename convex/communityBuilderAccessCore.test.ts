/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import {
  requireCommunityBuilderAccess,
  resolveCommunityBuilderAccess,
} from "./communityBuilderAccessCore";
import schema from "./schema";

const modules = import.meta.glob(["./_generated/**/*.*s"]);
const NOW_MS = 1_750_000_000_000;

async function createFixture(args?: {
  accessMode?: "grandfathered" | "subscription_required";
  lifecycleStatus?: "active" | "archived";
  operator?: boolean;
}) {
  const t = convexTest(schema, modules);
  const fixture = await t.run(async (ctx) => {
    const suffix = `${args?.accessMode ?? "legacy"}-${args?.lifecycleStatus ?? "active"}`;
    const ownerId = await ctx.db.insert("users", {
      authSubject: `builder-access-owner-${suffix}`,
      displayName: "Builder access owner",
      handle: `builder-access-${suffix}`,
      normalizedHandle: `builder-access-${suffix}`,
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    if (args?.operator) {
      await ctx.db.insert("operatorRoles", {
        userId: ownerId,
        role: "owner",
        active: true,
        createdAt: NOW_MS,
        updatedAt: NOW_MS,
      });
    }
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: `builder-access-${suffix}`,
      name: "Builder access community",
      lifecycleStatus: args?.lifecycleStatus ?? "active",
      lifecycleGeneration: args?.lifecycleStatus === "archived" ? 1 : 0,
      ...(args?.accessMode ? { builderAccessMode: args.accessMode } : {}),
      visibility: "published",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: NOW_MS,
      updatedAt: NOW_MS,
    });
    const community = await ctx.db.get(communityId);
    if (!community) throw new Error("test_community_missing");
    return { ownerId, communityId, community };
  });
  return { t, ...fixture };
}

async function attachSubscription(args: {
  t: ReturnType<typeof convexTest>;
  ownerId: any;
  communityId: any;
  status?: "active" | "past_due" | "cancel_at_period_end" | "canceled" | "ended";
  currentPeriodEndAt?: number;
  attachedAt?: number | null;
  suffix?: string;
}) {
  return await args.t.run(async (ctx) =>
    await ctx.db.insert("founderSubscriptions", {
      ownerUserId: args.ownerId,
      communityId: args.communityId,
      ...(args.attachedAt === null
        ? {}
        : { attachedAt: args.attachedAt ?? NOW_MS - 1_000 }),
      provider: "stripe",
      providerCustomerId: `cus_builder_access_${args.suffix ?? "one"}`,
      providerSubscriptionId: `sub_builder_access_${args.suffix ?? "one"}`,
      providerPriceId: "price_founder_79_monthly",
      status: args.status ?? "active",
      currentPeriodStartAt: NOW_MS - 10_000,
      currentPeriodEndAt: args.currentPeriodEndAt ?? NOW_MS + 10_000,
      cancelAtPeriodEnd: args.status === "cancel_at_period_end",
      lastProviderEventCreatedAt: NOW_MS - 1_000,
      createdAt: NOW_MS - 1_000,
      updatedAt: NOW_MS - 1_000,
    }),
  );
}

test("active missing and explicit grandfathered modes remain operational without billing", async () => {
  for (const accessMode of [undefined, "grandfathered"] as const) {
    const fixture = await createFixture({ accessMode });
    await expect(
      fixture.t.run(async (ctx) =>
        await resolveCommunityBuilderAccess({
          ctx,
          community: fixture.community,
          nowMs: NOW_MS,
        }),
      ),
    ).resolves.toMatchObject({
      lifecycleStatus: "active",
      accessMode: "grandfathered",
      operational: true,
      source: "grandfathered",
      reason: "grandfathered",
    });
  }
});

test("archive state wins over grandfathering, payment, and operator authority", async () => {
  const grandfathered = await createFixture({
    accessMode: "grandfathered",
    lifecycleStatus: "archived",
  });
  const paid = await createFixture({
    accessMode: "subscription_required",
    lifecycleStatus: "archived",
  });
  await attachSubscription({ ...paid, suffix: "archived-paid" });
  const operator = await createFixture({
    accessMode: "subscription_required",
    lifecycleStatus: "archived",
    operator: true,
  });

  for (const fixture of [grandfathered, paid, operator]) {
    await expect(
      fixture.t.run(async (ctx) =>
        await resolveCommunityBuilderAccess({
          ctx,
          community: fixture.community,
          nowMs: NOW_MS,
        }),
      ),
    ).resolves.toMatchObject({
      lifecycleStatus: "archived",
      lifecycleGeneration: 1,
      operational: false,
      source: "none",
      reason: "community_archived",
    });
    await expect(
      fixture.t.run(async (ctx) =>
        await requireCommunityBuilderAccess({
          ctx,
          community: fixture.community,
          nowMs: NOW_MS,
        }),
      ),
    ).rejects.toThrow("community_archived");
  }
});

test("malformed access modes fail closed instead of becoming grandfathered", async () => {
  const fixture = await createFixture();
  const malformedCommunity = {
    ...fixture.community,
    builderAccessMode: "legacy_magic_access",
  };
  await expect(
    fixture.t.run(async (ctx) =>
      await resolveCommunityBuilderAccess({
        ctx,
        community: malformedCommunity,
        nowMs: NOW_MS,
      }),
    ),
  ).resolves.toMatchObject({
    accessMode: "invalid",
    operational: false,
    source: "none",
    reason: "community_access_mode_invalid",
  });
});

test("subscription-required access follows attachment, status, and paid-through boundaries", async () => {
  const grantingCases = [
    { status: "active" as const, currentPeriodEndAt: NOW_MS + 1 },
    { status: "cancel_at_period_end" as const, currentPeriodEndAt: NOW_MS + 1 },
  ];
  for (const [index, granting] of grantingCases.entries()) {
    const fixture = await createFixture({ accessMode: "subscription_required" });
    await attachSubscription({
      ...fixture,
      ...granting,
      suffix: `granting-${index}`,
    });
    await expect(
      fixture.t.run(async (ctx) =>
        await resolveCommunityBuilderAccess({
          ctx,
          community: fixture.community,
          nowMs: NOW_MS,
        }),
      ),
    ).resolves.toMatchObject({
      operational: true,
      source: "founder_subscription",
      reason: "active_subscription",
      subscriptionStatus: granting.status,
    });
  }

  const deniedCases = [
    { status: "active" as const, currentPeriodEndAt: NOW_MS },
    { status: "cancel_at_period_end" as const, currentPeriodEndAt: NOW_MS },
    { status: "past_due" as const, currentPeriodEndAt: NOW_MS + 10_000 },
    { status: "canceled" as const, currentPeriodEndAt: NOW_MS + 10_000 },
    { status: "ended" as const, currentPeriodEndAt: NOW_MS + 10_000 },
  ];
  for (const [index, denied] of deniedCases.entries()) {
    const fixture = await createFixture({ accessMode: "subscription_required" });
    await attachSubscription({
      ...fixture,
      ...denied,
      suffix: `denied-${index}`,
    });
    await expect(
      fixture.t.run(async (ctx) =>
        await resolveCommunityBuilderAccess({
          ctx,
          community: fixture.community,
          nowMs: NOW_MS,
        }),
      ),
    ).resolves.toMatchObject({
      operational: false,
      source: "none",
      reason: "subscription_inactive",
      subscriptionStatus: denied.status,
    });
  }
});

test("subscription-required access fails closed for missing, unattached, and ambiguous subscriptions", async () => {
  const missing = await createFixture({ accessMode: "subscription_required" });
  await expect(
    missing.t.run(async (ctx) =>
      await resolveCommunityBuilderAccess({
        ctx,
        community: missing.community,
        nowMs: NOW_MS,
      }),
    ),
  ).resolves.toMatchObject({
    operational: false,
    reason: "subscription_missing",
  });

  const unattached = await createFixture({ accessMode: "subscription_required" });
  await attachSubscription({ ...unattached, attachedAt: null, suffix: "unattached" });
  await expect(
    unattached.t.run(async (ctx) =>
      await resolveCommunityBuilderAccess({
        ctx,
        community: unattached.community,
        nowMs: NOW_MS,
      }),
    ),
  ).resolves.toMatchObject({
    operational: false,
    reason: "subscription_attachment_invalid",
  });

  const ambiguous = await createFixture({ accessMode: "subscription_required" });
  await attachSubscription({ ...ambiguous, suffix: "ambiguous-a" });
  await attachSubscription({ ...ambiguous, suffix: "ambiguous-b" });
  await expect(
    ambiguous.t.run(async (ctx) =>
      await resolveCommunityBuilderAccess({
        ctx,
        community: ambiguous.community,
        nowMs: NOW_MS,
      }),
    ),
  ).resolves.toMatchObject({
    operational: false,
    reason: "subscription_ambiguous",
  });
});

test("one active canonical operator owner grants active subscription-required access", async () => {
  const fixture = await createFixture({
    accessMode: "subscription_required",
    operator: true,
  });
  await expect(
    fixture.t.run(async (ctx) =>
      await resolveCommunityBuilderAccess({
        ctx,
        community: fixture.community,
        nowMs: NOW_MS,
      }),
    ),
  ).resolves.toMatchObject({
    operational: true,
    source: "operator_comp",
    reason: "operator_comp",
  });
});

test("an attached subscription outranks operator comp and fails closed when inactive", async () => {
  const active = await createFixture({
    accessMode: "subscription_required",
    operator: true,
  });
  await attachSubscription({ ...active, status: "active", suffix: "operator-active" });
  await expect(
    active.t.run(async (ctx) =>
      await resolveCommunityBuilderAccess({
        ctx,
        community: active.community,
        nowMs: NOW_MS,
      }),
    ),
  ).resolves.toMatchObject({
    operational: true,
    source: "founder_subscription",
    reason: "active_subscription",
    subscriptionStatus: "active",
  });

  const ended = await createFixture({
    accessMode: "subscription_required",
    operator: true,
  });
  await attachSubscription({ ...ended, status: "ended", suffix: "operator-ended" });
  await expect(
    ended.t.run(async (ctx) =>
      await resolveCommunityBuilderAccess({
        ctx,
        community: ended.community,
        nowMs: NOW_MS,
      }),
    ),
  ).resolves.toMatchObject({
    operational: false,
    source: "none",
    reason: "subscription_inactive",
    subscriptionStatus: "ended",
  });
});

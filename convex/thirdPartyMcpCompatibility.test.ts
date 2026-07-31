/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./appOAuth.ts",
  "./community.ts",
  "./communityAccessQueries.ts",
  "./communityActivity.ts",
  "./communityAdmin.ts",
  "./communityAgent.ts",
  "./communityAiFeed.ts",
  "./communityAttention.ts",
  "./communityChat.ts",
  "./communityDirectory.ts",
  "./communityEvents.ts",
  "./communityFunnel.ts",
  "./communityInteractions.ts",
  "./communityIntelligenceDirectory.ts",
  "./communityLaunchSetup.ts",
  "./communityLifecycle.ts",
  "./communityPublic.ts",
  "./communityResources.ts",
  "./communitySkillAttachments.ts",
  "./communityWikiArchitect.ts",
  "./harnessMounts.ts",
  "./skillPackages.ts",
  "./thirdPartyMcpCompatibility.ts",
  "./userPlatformAppMounts.ts",
  "./_generated/**/*.*s",
]);

async function createLegacyRows(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const nowMs = 1_750_000_000_000;
    const userId = await ctx.db.insert("users", {
      authSubject: "cached-client-user",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId: userId,
      slug: "cached-client-community",
      name: "Cached client community",
      visibility: "unlisted",
      entryPolicy: "open",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const developerAppId = await ctx.db.insert("developerApps", {
      ownerUserId: userId,
      name: "Retired app",
      slug: "retired-app",
      endpointUrl: "https://retired.invalid/mcp",
      authType: "none",
      status: "valid",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const communityAppMountId = await ctx.db.insert("communityAppMounts", {
      communityId,
      developerAppId,
      mountedByUserId: userId,
      enabled: true,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const userPlatformAppMountId = await ctx.db.insert(
      "userPlatformAppMounts",
      {
        userId,
        developerAppId,
        enabled: true,
        createdAt: nowMs,
        updatedAt: nowMs,
      },
    );
    return {
      communityAppMountId,
      communityId,
      userId,
      userPlatformAppMountId,
    };
  });
}

test("cached-client tombstones fail closed and never mutate legacy rows", async () => {
  const t = convexTest(schema, modules);
  const fixture = await createLegacyRows(t);

  await expect(
    t.query(api.community.listCommunityAppMounts, {
      communityId: fixture.communityId,
    }),
  ).resolves.toEqual([]);
  await expect(
    t.query(api.harnessMounts.listEffectiveMcpApps, {
      communityId: fixture.communityId,
    }),
  ).resolves.toEqual([]);
  await expect(
    t.query(api.userPlatformAppMounts.listUserPlatformAppMounts, {}),
  ).resolves.toEqual([]);

  await expect(
    t.action(api.appOAuth.beginUserPlatformAppOAuth, {
      catalogAppId: "retired",
    }),
  ).resolves.toMatchObject({
    ok: false,
    catalog_app_id: "retired",
    error_code: "third_party_mcp_retired",
  });
  await expect(
    t.action(api.appOAuth.finalizeUserPlatformAppOAuth, {
      finalizeToken: "retired",
      state: "retired",
    }),
  ).resolves.toMatchObject({
    ok: false,
    validation_status: "retired",
    error_code: "third_party_mcp_retired",
  });

  await expect(
    t.action(api.community.connectCommunityApp, {
      authType: "none",
      communityId: fixture.communityId,
      endpointUrl: "https://retired.invalid/mcp",
      name: "Retired",
    }),
  ).resolves.toBeNull();
  await expect(
    t.action(api.community.refreshCommunityApp, {
      communityAppMountId: fixture.communityAppMountId,
      communityId: fixture.communityId,
    }),
  ).resolves.toBeNull();
  await expect(
    t.action(api.community.setupImportedCommunityMcpApp, {
      authType: "none",
      communityAppMountId: fixture.communityAppMountId,
      communityId: fixture.communityId,
      endpointUrl: "https://retired.invalid/mcp",
    }),
  ).resolves.toBeNull();
  await expect(
    t.action(api.community.unmountCommunityApp, {
      communityAppMountId: fixture.communityAppMountId,
      communityId: fixture.communityId,
    }),
  ).resolves.toEqual({
    removed: false,
    error_code: "third_party_mcp_retired",
  });
  await expect(
    t.mutation(api.community.updateCommunityAppMount, {
      communityAppMountId: fixture.communityAppMountId,
      communityId: fixture.communityId,
      enabled: false,
    }),
  ).resolves.toBeNull();

  await expect(
    t.action(api.userPlatformAppMounts.connectUserPlatformApp, {
      authType: "none",
      connectAttemptId: "attempt-1",
      endpointUrl: "https://retired.invalid/mcp",
      name: "Retired",
    }),
  ).resolves.toMatchObject({
    ok: false,
    connect_attempt_id: "attempt-1",
    error_code: "third_party_mcp_retired",
  });
  await expect(
    t.action(
      api.userPlatformAppMounts.setupImportedCommunityMcpUserHarness,
      {
        authType: "none",
        communityAppMountId: fixture.communityAppMountId,
        communityId: fixture.communityId,
        endpointUrl: "https://retired.invalid/mcp",
      },
    ),
  ).resolves.toMatchObject({
    ok: false,
    connect_attempt_id: null,
    error_code: "third_party_mcp_retired",
  });
  await expect(
    t.action(api.userPlatformAppMounts.refreshUserPlatformApp, {
      userPlatformAppMountId: fixture.userPlatformAppMountId,
    }),
  ).resolves.toBeNull();
  await expect(
    t.action(api.userPlatformAppMounts.reconnectUserPlatformApp, {
      secret: "unused",
      userPlatformAppMountId: fixture.userPlatformAppMountId,
    }),
  ).resolves.toBeNull();
  await expect(
    t.mutation(api.userPlatformAppMounts.updateUserPlatformAppMount, {
      enabled: false,
      userPlatformAppMountId: fixture.userPlatformAppMountId,
    }),
  ).resolves.toBeNull();
  await expect(
    t.mutation(api.userPlatformAppMounts.unmountUserPlatformApp, {
      userPlatformAppMountId: fixture.userPlatformAppMountId,
    }),
  ).resolves.toEqual({
    removed: false,
    error_code: "third_party_mcp_retired",
  });

  const legacyRows = await t.run(async (ctx) => ({
    communityMounts: await ctx.db.query("communityAppMounts").collect(),
    userMounts: await ctx.db.query("userPlatformAppMounts").collect(),
  }));
  expect(legacyRows.communityMounts).toHaveLength(1);
  expect(legacyRows.communityMounts[0]).toMatchObject({ enabled: true });
  expect(legacyRows.userMounts).toHaveLength(1);
  expect(legacyRows.userMounts[0]).toMatchObject({ enabled: true });
});

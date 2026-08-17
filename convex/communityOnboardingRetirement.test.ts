/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityOnboarding.ts",
  "./_generated/**/*.*s",
]);

test("cached community onboarding endpoints stay authorized and stateless", async () => {
  const t = convexTest(schema, modules);
  const nowMs = 1_755_000_000_000;
  const fixture = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "retired-onboarding-owner",
      displayName: "Retired onboarding owner",
      handle: "retired-onboarding-owner",
      normalizedHandle: "retired-onboarding-owner",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const memberId = await ctx.db.insert("users", {
      authSubject: "retired-onboarding-member",
      displayName: "Retired onboarding member",
      handle: "retired-onboarding-member",
      normalizedHandle: "retired-onboarding-member",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "retired-onboarding",
      name: "Retired onboarding",
      visibility: "published",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 2,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const membershipId = await ctx.db.insert("communityMemberships", {
      communityId,
      userId: memberId,
      role: "member",
      accessSource: "free_grant",
      active: true,
      activationSequence: 1,
      activatedAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const configId = await ctx.db.insert("communityOnboardingConfigs", {
      communityId,
      enabled: true,
      introVideoUrl: "https://example.com/retired",
      updatedByUserId: ownerId,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const sessionId = await ctx.db.insert("communityOnboardingSessions", {
      communityId,
      membershipId,
      userId: memberId,
      activationSequence: 1,
      status: "active",
      activatedAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return { communityId, configId, sessionId };
  });

  const asOwner = t.withIdentity({ subject: "retired-onboarding-owner" });
  const asMember = t.withIdentity({ subject: "retired-onboarding-member" });

  await expect(asOwner.query(api.communityOnboarding.getCommunityOnboardingConfig, {
    communityId: fixture.communityId,
  })).resolves.toEqual({
    enabled: false,
    intro_video_url: null,
    updated_at: null,
  });
  await expect(asOwner.mutation(api.communityOnboarding.saveCommunityOnboardingConfig, {
    communityId: fixture.communityId,
    enabled: true,
    introVideoUrl: "https://example.com/new",
  })).resolves.toEqual({
    enabled: false,
    intro_video_url: null,
    updated_at: null,
  });
  await expect(asMember.mutation(api.communityOnboarding.completeMyCommunityOnboardingOrientation, {
    communityId: fixture.communityId,
    sessionId: fixture.sessionId,
  })).resolves.toBeNull();
  await expect(asMember.mutation(api.communityOnboarding.acknowledgeMyCommunityOnboardingAgentTurn, {
    communityId: fixture.communityId,
    sessionId: fixture.sessionId,
  })).resolves.toBeNull();
  await expect(asMember.mutation(api.communityOnboarding.completeMyCommunityOnboardingMcpHandoff, {
    communityId: fixture.communityId,
    sessionId: fixture.sessionId,
  })).resolves.toBeNull();
  await expect(asMember.mutation(api.communityOnboarding.dismissMyCommunityOnboardingSession, {
    communityId: fixture.communityId,
    sessionId: fixture.sessionId,
  })).resolves.toEqual({ dismissed: true });

  await t.run(async (ctx) => {
    expect(await ctx.db.get(fixture.configId)).toMatchObject({
      enabled: true,
      introVideoUrl: "https://example.com/retired",
      updatedAt: nowMs,
    });
    expect(await ctx.db.get(fixture.sessionId)).toMatchObject({
      status: "active",
      updatedAt: nowMs,
    });
  });
});

/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./communityLifecycle.ts", "./_generated/**/*.*s"]);
const OWNER_SUBJECT = "community-deletion-safety-owner";
const MEMBER_SUBJECT = "community-deletion-safety-member";
const INTRUDER_SUBJECT = "community-deletion-safety-intruder";
const LIFECYCLE_BLOCKER = "community_delete_lifecycle_migration_blocked";

async function readFixtureState(
  t: ReturnType<typeof convexTest>,
  ids: Record<string, string>,
) {
  return await t.run(async (ctx) => ({
    rows: await Promise.all(Object.values(ids).map((id) => ctx.db.get(id as any))),
    scheduledFunctions: await (ctx.db as any).system
      .query("_scheduled_functions")
      .collect(),
  }));
}

test("community deletion quarantine requires verified identity", async () => {
  const t = convexTest(schema, modules);
  const communityId = await t.run(async (ctx) => {
    const now = 1_750_000_000_000;
    const ownerId = await ctx.db.insert("users", {
      authSubject: OWNER_SUBJECT,
      displayName: "Deletion safety owner",
      createdAt: now,
      updatedAt: now,
    });
    return await ctx.db.insert("communities", {
      ownerId,
      slug: "community-deletion-identity",
      name: "Community deletion identity",
      visibility: "unlisted",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: now,
      updatedAt: now,
    });
  });

  await expect(
    t.mutation(api.communityLifecycle.deleteCommunity, { communityId }),
  ).rejects.toThrow("verified_identity_required");

  expect(await t.run(async (ctx) => await ctx.db.get(communityId))).not.toBeNull();
  expect(
    await t.run(async (ctx) =>
      await (ctx.db as any).system.query("_scheduled_functions").collect(),
    ),
  ).toEqual([]);
});

test("community deletion quarantine preserves every representative community domain", async () => {
  const t = convexTest(schema, modules);
  const now = 1_750_000_000_000;

  const fixture = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: OWNER_SUBJECT,
      displayName: "Deletion safety owner",
      createdAt: now,
      updatedAt: now,
    });
    const memberId = await ctx.db.insert("users", {
      authSubject: MEMBER_SUBJECT,
      displayName: "Deletion safety member",
      createdAt: now,
      updatedAt: now,
    });
    const intruderId = await ctx.db.insert("users", {
      authSubject: INTRUDER_SUBJECT,
      displayName: "Deletion safety intruder",
      createdAt: now,
      updatedAt: now,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "community-deletion-safety",
      name: "Community deletion safety",
      visibility: "unlisted",
      entryPolicy: "approval",
      activeMemberCount: 2,
      createdAt: now,
      updatedAt: now,
    });

    const membershipId = await ctx.db.insert("communityMemberships", {
      communityId,
      userId: memberId,
      role: "member",
      accessSource: "free_grant",
      active: true,
      activationSequence: 1,
      activatedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const joinRequestId = await ctx.db.insert("communityJoinRequests", {
      communityId,
      userId: intruderId,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    const pricePointId = await ctx.db.insert("communityPricePoints", {
      communityId,
      billingPeriod: "monthly",
      name: "Deletion safety plan",
      amountBaseUnits: 1_000,
      currency: "usd",
      currencyDecimals: 2,
      isCurrent: true,
      createdAt: now,
      updatedAt: now,
    });
    const checkoutSessionId = await ctx.db.insert("checkoutSessions", {
      sessionId: "community-deletion-safety-checkout",
      mode: "community_join",
      provider: "stripe",
      communityId,
      pricePointId,
      ownerUserId: memberId,
      status: "pending",
      expiresAt: now + 60_000,
      createdAt: now,
      updatedAt: now,
    });

    const legacyThreadId = await ctx.db.insert("communityChatThreads", {
      communityId,
      lastSeq: 1,
      createdAt: now,
      updatedAt: now,
    });
    const legacyMessageId = await ctx.db.insert("communityChatMessages", {
      threadId: legacyThreadId,
      seq: 1,
      role: "user",
      senderUserId: memberId,
      contentJson: { text: "Legacy history must survive quarantine." },
      createdAt: now,
      updatedAt: now,
    });
    const legacyReactionId = await ctx.db.insert("communityMessageReactions", {
      messageId: legacyMessageId,
      userId: ownerId,
      emoji: "check",
      createdAt: now,
    });
    const canonicalInteractionId = await ctx.db.insert("communityInteractionRoots", {
      communityId,
      actorType: "human",
      actorUserId: memberId,
      kind: "discussion",
      status: "live",
      visibilityScope: "community",
      contentSummary: "Canonical history must survive quarantine.",
      replyCount: 0,
      reactionSummary: [],
      idempotencyKey: "community-deletion-safety-root",
      createdAt: now,
      updatedAt: now,
    });
    const resourceId = await ctx.db.insert("communityResources", {
      communityId,
      createdByUserId: ownerId,
      type: "page",
      role: "page",
      status: "published",
      title: "Deletion safety resource",
      pinned: false,
      createdAt: now,
      updatedAt: now,
    });
    const eventId = await ctx.db.insert("communityEvents", {
      communityId,
      createdByUserId: ownerId,
      title: "Deletion safety event",
      startsAt: now + 86_400_000,
      timezone: "UTC",
      locationType: "online",
      visibility: "members",
      status: "live",
      createdAt: now,
      updatedAt: now,
    });

    const sourceTraceId = await ctx.db.insert("communitySourceTraces", {
      communityId,
      sourceType: "interaction",
      sourceId: String(canonicalInteractionId),
      summary: "Deletion safety evidence",
      visibilityScope: "community",
      sourceVisibility: "community",
      artifactIds: [],
      outcomeObservationIds: [],
      actorType: "member",
      actorUserId: memberId,
      createdAt: now,
      updatedAt: now,
    });
    const runEventId = await ctx.db.insert("communityAgentRunEvents", {
      communityId,
      runId: "community-deletion-safety-run",
      seq: 1,
      kind: "final",
      content: "Runtime evidence must survive quarantine.",
      createdAt: now,
    });

    const developerAppId = await ctx.db.insert("developerApps", {
      ownerUserId: ownerId,
      name: "Deletion safety app",
      slug: "community-deletion-safety-app",
      endpointUrl: "https://example.com/mcp",
      authType: "none",
      status: "valid",
      createdAt: now,
      updatedAt: now,
    });
    const appMountId = await ctx.db.insert("communityAppMounts", {
      communityId,
      developerAppId,
      mountedByUserId: ownerId,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
    const skillPackageId = await ctx.db.insert("skillPackages", {
      ownerUserId: ownerId,
      name: "Deletion safety skill",
      instructionsMd: "Preserve the community while deletion is quarantined.",
      createdAt: now,
      updatedAt: now,
    });
    const skillAttachmentId = await ctx.db.insert("communitySkillAttachments", {
      communityId,
      skillPackageId,
      attachedByUserId: ownerId,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });

    return {
      ids: {
        ownerId,
        memberId,
        intruderId,
        communityId,
        membershipId,
        joinRequestId,
        pricePointId,
        checkoutSessionId,
        legacyThreadId,
        legacyMessageId,
        legacyReactionId,
        canonicalInteractionId,
        resourceId,
        eventId,
        sourceTraceId,
        runEventId,
        developerAppId,
        appMountId,
        skillPackageId,
        skillAttachmentId,
      },
      communityId,
    };
  });

  const before = await readFixtureState(t, fixture.ids as unknown as Record<string, string>);

  const asIntruder = t.withIdentity({ subject: INTRUDER_SUBJECT });
  await expect(
    asIntruder.mutation(api.communityLifecycle.deleteCommunity, {
      authSubject: INTRUDER_SUBJECT,
      communityId: fixture.communityId,
    }),
  ).rejects.toThrow("community_owner_required");

  const asOwner = t.withIdentity({ subject: OWNER_SUBJECT });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await expect(
      asOwner.mutation(api.communityLifecycle.deleteCommunity, {
        authSubject: OWNER_SUBJECT,
        communityId: fixture.communityId,
      }),
    ).rejects.toMatchObject({
      data: {
        code: LIFECYCLE_BLOCKER,
        reason: LIFECYCLE_BLOCKER,
      },
    });
  }

  const after = await readFixtureState(t, fixture.ids as unknown as Record<string, string>);
  expect(after).toEqual(before);
});

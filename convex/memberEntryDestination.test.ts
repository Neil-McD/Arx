import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";
import schema from "./schema";

const modules = import.meta.glob([
  "./memberEntryDestination.ts",
  "./_generated/**/*.*s",
]);

type Runtime = ReturnType<typeof convexTest>;
const nowMs = 1_786_000_000_000;

async function insertCompletedUser(ctx: any, suffix: string) {
  const userId = await ctx.db.insert("users", {
    authSubject: `entry-${suffix}`,
    displayName: `User ${suffix}`,
    handle: `entry-${suffix}`,
    normalizedHandle: `entry-${suffix}`,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  await ctx.db.insert("userProfileDetails", {
    userId,
    displayName: `User ${suffix}`,
    avatarUrl: `https://example.com/entry-${suffix}.png`,
    onboardingCompletedAt: nowMs,
    createdAt: nowMs,
    updatedAt: nowMs,
  });
  for (const document of PLATFORM_LEGAL_DOCUMENTS) {
    await ctx.db.insert("legalAcceptances", {
      userId,
      documentKey: document.key,
      documentVersion: document.version,
      acceptedAt: nowMs,
      source: "test",
      createdAt: nowMs,
    });
  }
  return userId;
}

async function insertCommunity(ctx: any, ownerId: any, slug: string, createdAt = nowMs) {
  return await ctx.db.insert("communities", {
    ownerId,
    slug,
    name: slug,
    visibility: "published",
    entryPolicy: "open",
    inferenceFundingPolicy: "managed_required",
    activeMemberCount: 1,
    createdAt,
    updatedAt: createdAt,
  });
}

async function insertMembership(
  ctx: any,
  communityId: any,
  userId: any,
  activatedAt: number,
  revoked = false,
) {
  return await ctx.db.insert("communityMemberships", {
    communityId,
    userId,
    role: "member",
    accessSource: "free_grant",
    active: !revoked,
    activationSequence: 1,
    activatedAt,
    ...(revoked ? { revokedAt: activatedAt + 1, revokedReason: "left_by_member" } : {}),
    createdAt: activatedAt,
    updatedAt: activatedAt,
  });
}

async function resolve(t: Runtime, userId: any) {
  return await t.query(
    (internal as any).memberEntryDestination.resolveMemberEntryDestinationInternal,
    { userId },
  );
}

describe("default member entry destination", () => {
  test("a user with no communities lands on Discover and is never auto-joined", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run(async (ctx) => {
      const ownerId = await insertCompletedUser(ctx, "home-owner");
      const userId = await insertCompletedUser(ctx, "newcomer");
      const homeId = await insertCommunity(ctx, ownerId, "polynet");
      return { userId, homeId };
    });
    await expect(resolve(t, f.userId)).resolves.toMatchObject({
      page: "discover",
      reason: "no_default_community",
    });
    await t.run(async (ctx) => {
      expect(await ctx.db.query("communityMemberships").collect()).toHaveLength(0);
    });
  });

  test("an owned community takes precedence over memberships", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run(async (ctx) => {
      const otherOwnerId = await insertCompletedUser(ctx, "other-owner");
      const builderId = await insertCompletedUser(ctx, "builder");
      const joinedId = await insertCommunity(ctx, otherOwnerId, "joined-community");
      await insertMembership(ctx, joinedId, builderId, nowMs + 50);
      const ownedId = await insertCommunity(ctx, builderId, "builder-community");
      return { builderId, ownedId };
    });
    await expect(resolve(t, f.builderId)).resolves.toMatchObject({
      page: "community",
      reason: "default_community",
      community_slug: "builder-community",
    });
  });

  test("the most recently activated active membership wins and revoked ones are skipped", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run(async (ctx) => {
      const ownerId = await insertCompletedUser(ctx, "owner");
      const memberId = await insertCompletedUser(ctx, "member");
      const olderId = await insertCommunity(ctx, ownerId, "older-community");
      const newerId = await insertCommunity(ctx, ownerId, "newer-community");
      const leftId = await insertCommunity(ctx, ownerId, "left-community");
      await insertMembership(ctx, olderId, memberId, nowMs + 10);
      await insertMembership(ctx, newerId, memberId, nowMs + 20);
      await insertMembership(ctx, leftId, memberId, nowMs + 30, true);
      return { memberId };
    });
    await expect(resolve(t, f.memberId)).resolves.toMatchObject({
      page: "community",
      community_slug: "newer-community",
    });
  });
});

describe("last-visited default entry", () => {
  async function insertPresence(ctx: any, communityId: any, userId: any, seenAt: number, leased = true) {
    await ctx.db.insert("communityPresence", {
      communityId,
      userId,
      lastSeenAt: seenAt,
      ...(leased ? { activeUntil: seenAt + 60_000 } : {}),
      createdAt: seenAt,
      updatedAt: seenAt,
    });
  }

  test("the most recently visited community wins over newer owned communities", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run(async (ctx) => {
      const ownerId = await insertCompletedUser(ctx, "visit-owner");
      const homeId = await insertCommunity(ctx, ownerId, "polynet", nowMs);
      await insertCommunity(ctx, ownerId, "newest-test-fixture", nowMs + 500);
      await insertPresence(ctx, homeId, ownerId, nowMs + 1_000);
      return { ownerId };
    });
    await expect(resolve(t, f.ownerId)).resolves.toMatchObject({
      page: "community",
      reason: "default_community",
      community_slug: "polynet",
    });
  });

  test("a recently visited community the user has left is skipped", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run(async (ctx) => {
      const ownerId = await insertCompletedUser(ctx, "left-owner");
      const memberId = await insertCompletedUser(ctx, "left-member");
      const leftId = await insertCommunity(ctx, ownerId, "left-recently");
      const stayedId = await insertCommunity(ctx, ownerId, "still-joined");
      await insertMembership(ctx, leftId, memberId, nowMs + 10, true);
      await insertMembership(ctx, stayedId, memberId, nowMs + 5);
      await insertPresence(ctx, leftId, memberId, nowMs + 2_000);
      await insertPresence(ctx, stayedId, memberId, nowMs + 1_000);
      return { memberId };
    });
    await expect(resolve(t, f.memberId)).resolves.toMatchObject({
      page: "community",
      community_slug: "still-joined",
    });
  });

  test("presence rows without a lease fall through to the existing order", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run(async (ctx) => {
      const builderId = await insertCompletedUser(ctx, "legacy-builder");
      const otherOwnerId = await insertCompletedUser(ctx, "legacy-other");
      const joinedId = await insertCommunity(ctx, otherOwnerId, "legacy-joined");
      await insertMembership(ctx, joinedId, builderId, nowMs + 50);
      await insertPresence(ctx, joinedId, builderId, nowMs + 3_000, false);
      await insertCommunity(ctx, builderId, "legacy-owned");
      return { builderId };
    });
    await expect(resolve(t, f.builderId)).resolves.toMatchObject({
      community_slug: "legacy-owned",
    });
  });
});

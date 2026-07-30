/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import schema from "./schema";
import {
  COMMUNITY_PRESENCE_LEASE_DURATION_MS,
  communityPresenceLeaseIsActive,
  issueCommunityPresenceLease,
  renewCommunityPresenceLease,
  resolveAuthorizedCommunityPresenceWindow,
} from "./communityPresenceCore";

const modules = import.meta.glob([
  "./communityPresenceCore.ts",
  "./_generated/**/*.*s",
]);

async function createScope(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      authSubject: "presence-user",
      displayName: "Presence user",
      handle: "presence-user",
      normalizedHandle: "presence-user",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId: userId,
      slug: "presence-community",
      name: "Presence community",
      visibility: "unlisted",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    return { communityId, userId };
  });
}

test("presence leases are server-timed and expire at the canonical boundary", () => {
  const lease = issueCommunityPresenceLease(10_000.9);
  expect(lease).toEqual({
    lastSeenAt: 10_000,
    activeUntil: 10_000 + COMMUNITY_PRESENCE_LEASE_DURATION_MS,
  });
  expect(communityPresenceLeaseIsActive(lease, lease.activeUntil - 1)).toBe(true);
  expect(communityPresenceLeaseIsActive(lease, lease.activeUntil)).toBe(false);
  expect(() => issueCommunityPresenceLease(Number.NaN)).toThrow(
    "community_presence_clock_invalid",
  );
});

test("legacy rows remain readable during the additive lease rollout", () => {
  const lastSeenAt = 20_000;
  expect(
    communityPresenceLeaseIsActive(
      { lastSeenAt },
      lastSeenAt + COMMUNITY_PRESENCE_LEASE_DURATION_MS - 1,
    ),
  ).toBe(true);
  expect(
    communityPresenceLeaseIsActive(
      { lastSeenAt },
      lastSeenAt + COMMUNITY_PRESENCE_LEASE_DURATION_MS,
    ),
  ).toBe(false);
});

test("repeated and multi-tab heartbeats coalesce into one community-user lease", async () => {
  const t = convexTest(schema, modules);
  const scope = await createScope(t);

  await t.run(async (ctx) => {
    await expect(
      renewCommunityPresenceLease({
        ctx,
        ...scope,
        nowMs: 30_000,
      }),
    ).resolves.toEqual({
      lastSeenAt: 30_000,
      activeUntil: 30_000 + COMMUNITY_PRESENCE_LEASE_DURATION_MS,
    });
    await expect(
      renewCommunityPresenceLease({
        ctx,
        ...scope,
        nowMs: 31_000,
      }),
    ).resolves.toEqual({
      lastSeenAt: 31_000,
      activeUntil: 31_000 + COMMUNITY_PRESENCE_LEASE_DURATION_MS,
    });
    await expect(
      renewCommunityPresenceLease({
        ctx,
        ...scope,
        nowMs: 30_500,
      }),
    ).resolves.toEqual({
      lastSeenAt: 31_000,
      activeUntil: 31_000 + COMMUNITY_PRESENCE_LEASE_DURATION_MS,
    });

    const rows = await ctx.db
      .query("communityPresence")
      .withIndex("by_community_user", (q) =>
        q.eq("communityId", scope.communityId).eq("userId", scope.userId),
      )
      .collect();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.lastSeenAt).toBe(31_000);
    expect(rows[0]?.activeUntil).toBe(
      31_000 + COMMUNITY_PRESENCE_LEASE_DURATION_MS,
    );
  });
});

test("bounded presence windows remain conservatively capped after authorization filtering", async () => {
  const t = convexTest(schema, modules);
  const scope = await createScope(t);
  await t.run(async (ctx) => {
    const nowMs = 100_000;
    const outsiderId = await ctx.db.insert("users", {
      authSubject: "presence-outsider",
      displayName: "Presence outsider",
      handle: "presence-outsider",
      normalizedHandle: "presence-outsider",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    await ctx.db.insert("communityPresence", {
      communityId: scope.communityId,
      userId: outsiderId,
      lastSeenAt: nowMs,
      activeUntil: nowMs + 200_000,
      createdAt: nowMs,
      updatedAt: nowMs,
    });

    for (let index = 0; index < 64; index += 1) {
      const userId = await ctx.db.insert("users", {
        authSubject: `presence-member-${index}`,
        displayName: `Presence member ${index}`,
        handle: `presence-member-${index}`,
        normalizedHandle: `presence-member-${index}`,
        createdAt: 1_000 + index,
        updatedAt: 1_000 + index,
      });
      await ctx.db.insert("communityMemberships", {
        communityId: scope.communityId,
        userId,
        role: "member",
        accessSource: "free_grant",
        active: true,
        createdAt: 1_000 + index,
        updatedAt: 1_000 + index,
      });
      await ctx.db.insert("communityPresence", {
        communityId: scope.communityId,
        userId,
        lastSeenAt: nowMs - index,
        activeUntil: nowMs + 100_000 - index,
        createdAt: nowMs - index,
        updatedAt: nowMs - index,
      });
    }

    const community = await ctx.db.get(scope.communityId);
    if (!community) throw new Error("missing_test_community");
    const window = await resolveAuthorizedCommunityPresenceWindow(
      ctx,
      community,
      nowMs,
    );
    expect(window.entries).toHaveLength(63);
    expect(window.countCapped).toBe(true);
    expect(
      window.entries.some((entry) => String(entry.userId) === String(outsiderId)),
    ).toBe(false);
  });
});

test("blocked members disappear from active presence immediately", async () => {
  const t = convexTest(schema, modules);
  const scope = await createScope(t);
  await t.run(async (ctx) => {
    const nowMs = 200_000;
    const memberId = await ctx.db.insert("users", {
      authSubject: "presence-blocked-member",
      displayName: "Blocked member",
      handle: "presence-blocked-member",
      normalizedHandle: "presence-blocked-member",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    await ctx.db.insert("communityMemberships", {
      communityId: scope.communityId,
      userId: memberId,
      role: "member",
      accessSource: "free_grant",
      active: true,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    await ctx.db.insert("communityBlocks", {
      communityId: scope.communityId,
      userId: memberId,
      createdByUserId: scope.userId,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.insert("communityPresence", {
      communityId: scope.communityId,
      userId: memberId,
      lastSeenAt: nowMs,
      activeUntil: nowMs + COMMUNITY_PRESENCE_LEASE_DURATION_MS,
      createdAt: nowMs,
      updatedAt: nowMs,
    });

    const community = await ctx.db.get(scope.communityId);
    if (!community) throw new Error("missing_test_community");
    await expect(
      resolveAuthorizedCommunityPresenceWindow(ctx, community, nowMs),
    ).resolves.toEqual({
      entries: [],
      countCapped: false,
    });
  });
});

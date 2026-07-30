/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import schema from "./schema";
import {
  TYPING_PRESENCE_LEASE_DURATION_MS,
  clearCommunityTypingLease,
  issueTypingPresenceLease,
  renewCommunityTypingLease,
  resolveCommunityTypingPresence,
  typingPresenceLeaseIsActive,
} from "./communityTypingPresenceCore";

const modules = import.meta.glob([
  "./communityTypingPresenceCore.ts",
  "./_generated/**/*.*s",
]);

async function createScope(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "typing-owner",
      displayName: "Typing owner",
      handle: "typing-owner",
      normalizedHandle: "typing-owner",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const memberId = await ctx.db.insert("users", {
      authSubject: "typing-member",
      displayName: "Typing member",
      handle: "typing-member",
      normalizedHandle: "typing-member",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "typing-community",
      name: "Typing community",
      visibility: "unlisted",
      entryPolicy: "open",
      activeMemberCount: 2,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const otherCommunityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "other-typing-community",
      name: "Other typing community",
      visibility: "unlisted",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const membershipId = await ctx.db.insert("communityMemberships", {
      communityId,
      userId: memberId,
      role: "member",
      accessSource: "free_grant",
      active: true,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const rootId = await ctx.db.insert("communityInteractionRoots", {
      communityId,
      actorType: "human",
      actorUserId: ownerId,
      kind: "discussion",
      status: "live",
      visibilityScope: "community",
      contentSummary: "Root",
      replyCount: 0,
      reactionSummary: [],
      idempotencyKey: "typing-root",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    const otherRootId = await ctx.db.insert("communityInteractionRoots", {
      communityId: otherCommunityId,
      actorType: "human",
      actorUserId: ownerId,
      kind: "discussion",
      status: "live",
      visibilityScope: "community",
      contentSummary: "Other root",
      replyCount: 0,
      reactionSummary: [],
      idempotencyKey: "other-typing-root",
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    return {
      communityId,
      membershipId,
      memberId,
      otherRootId,
      ownerId,
      rootId,
    };
  });
}

test("typing leases are server-timed and expire at the canonical boundary", () => {
  const lease = issueTypingPresenceLease(10_000.9);
  expect(lease).toEqual({
    displayUntil: 10_000 + TYPING_PRESENCE_LEASE_DURATION_MS,
    updatedAt: 10_000,
  });
  expect(typingPresenceLeaseIsActive(lease, lease.displayUntil - 1)).toBe(true);
  expect(typingPresenceLeaseIsActive(lease, lease.displayUntil)).toBe(false);
  expect(() => issueTypingPresenceLease(Number.NaN)).toThrow(
    "typing_presence_clock_invalid",
  );
});

test("channel and thread renewals coalesce while stale clears cannot erase a newer scope", async () => {
  const t = convexTest(schema, modules);
  const scope = await createScope(t);
  await t.run(async (ctx) => {
    await expect(
      renewCommunityTypingLease({
        ctx,
        communityId: scope.communityId,
        userId: scope.memberId,
        nowMs: 30_000,
      }),
    ).resolves.toMatchObject({
      rootId: null,
      updatedAt: 30_000,
    });
    await expect(
      renewCommunityTypingLease({
        ctx,
        communityId: scope.communityId,
        userId: scope.memberId,
        rootId: scope.rootId,
        nowMs: 31_000,
      }),
    ).resolves.toMatchObject({
      rootId: String(scope.rootId),
      updatedAt: 31_000,
    });
    await expect(
      clearCommunityTypingLease({
        ctx,
        communityId: scope.communityId,
        userId: scope.memberId,
      }),
    ).resolves.toEqual({ cleared: false });

    const rows = await ctx.db
      .query("communityTypingPresence")
      .withIndex("by_community_user", (q) =>
        q
          .eq("communityId", scope.communityId)
          .eq("userId", scope.memberId),
      )
      .collect();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.rootId).toBe(scope.rootId);

    await expect(
      clearCommunityTypingLease({
        ctx,
        communityId: scope.communityId,
        userId: scope.memberId,
        rootId: scope.rootId,
      }),
    ).resolves.toEqual({ cleared: true });
    expect(
      await ctx.db
        .query("communityTypingPresence")
        .withIndex("by_community_user", (q) =>
          q
            .eq("communityId", scope.communityId)
            .eq("userId", scope.memberId),
        )
        .collect(),
    ).toHaveLength(0);
  });
});

test("cross-community thread scopes fail closed", async () => {
  const t = convexTest(schema, modules);
  const scope = await createScope(t);
  await t.run(async (ctx) => {
    await expect(
      renewCommunityTypingLease({
        ctx,
        communityId: scope.communityId,
        userId: scope.memberId,
        rootId: scope.otherRootId,
        nowMs: 30_000,
      }),
    ).rejects.toThrow("community_typing_scope_invalid");
  });
});

test("revoked members are removed from the typing projection", async () => {
  const t = convexTest(schema, modules);
  const scope = await createScope(t);
  await t.run(async (ctx) => {
    const nowMs = Date.now();
    await renewCommunityTypingLease({
      ctx,
      communityId: scope.communityId,
      userId: scope.memberId,
      nowMs,
    });
    const community = await ctx.db.get(scope.communityId);
    if (!community) throw new Error("missing_test_community");
    await expect(
      resolveCommunityTypingPresence({
        ctx,
        community,
        viewerUserId: scope.ownerId,
      }),
    ).resolves.toMatchObject({
      totalCount: 1,
      totalCountCapped: false,
    });

    await ctx.db.patch(scope.membershipId, {
      active: false,
      revokedAt: nowMs,
      updatedAt: nowMs,
    });
    await expect(
      resolveCommunityTypingPresence({
        ctx,
        community,
        viewerUserId: scope.ownerId,
      }),
    ).resolves.toEqual({
      users: [],
      totalCount: 0,
      totalCountCapped: false,
    });
  });
});

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import {
  cancelPendingCommunityJoinRequest,
  communityJoinRequestCanReapply,
  denyCommunityJoinRequestCore,
  ensureDeniedCommunityJoinRequest,
  ensurePendingCommunityJoinRequest,
  getCurrentCommunityJoinRequestByPair,
} from "./communityJoinRequestCore";
import { activateCommunityMembershipCore } from "./communityMembershipLifecycle";
import schema from "./schema";

const modules = import.meta.glob([
  "./email.ts",
  "./_generated/**/*.*s",
]);

async function createFixture(t: ReturnType<typeof convexTest>, suffix: string) {
  const nowMs = 1_786_000_000_000;
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: `join-owner-${suffix}`,
      displayName: "Owner",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const userId = await ctx.db.insert("users", {
      authSubject: `join-user-${suffix}`,
      displayName: "Applicant",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: `join-${suffix}`,
      name: "Join test",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "approval",
      activeMemberCount: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return { nowMs, ownerId, userId, communityId };
  });
}

describe("canonical join-request kernel", () => {
  test("overlapping applications converge on one pending row", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "concurrent");
    const apply = () => t.run(async (ctx) => ensurePendingCommunityJoinRequest({
      ctx,
      communityId: fixture.communityId,
      userId: fixture.userId,
      nowMs: fixture.nowMs + 1,
    }));
    const [first, second] = await Promise.all([apply(), apply()]);
    expect(first._id).toEqual(second._id);
    expect(await t.run(async (ctx) => ctx.db.query("communityJoinRequests").collect()))
      .toHaveLength(1);
  });

  test("cancel deletes state and a later application is visible again", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "cancel-reapply");
    await t.run(async (ctx) => ensurePendingCommunityJoinRequest({
      ctx,
      communityId: fixture.communityId,
      userId: fixture.userId,
      nowMs: fixture.nowMs + 1,
    }));
    await expect(t.run(async (ctx) => cancelPendingCommunityJoinRequest({
      ctx,
      communityId: fixture.communityId,
      userId: fixture.userId,
    }))).resolves.toEqual({ outcome: "canceled" });
    expect(await t.run(async (ctx) => getCurrentCommunityJoinRequestByPair({
      ctx,
      communityId: fixture.communityId,
      userId: fixture.userId,
    }))).toBeNull();
    const reapplied = await t.run(async (ctx) => ensurePendingCommunityJoinRequest({
      ctx,
      communityId: fixture.communityId,
      userId: fixture.userId,
      nowMs: fixture.nowMs + 2,
    }));
    expect(reapplied.status).toBe("pending");
  });

  test("repeat denial preserves its cooldown and elapsed reapply reuses the row", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "denied");
    const pending = await t.run(async (ctx) => ensurePendingCommunityJoinRequest({
      ctx,
      communityId: fixture.communityId,
      userId: fixture.userId,
      nowMs: fixture.nowMs + 1,
    }));
    const first = await t.run(async (ctx) => denyCommunityJoinRequestCore({
      ctx,
      request: pending,
      nowMs: fixture.nowMs + 2,
      cooldownMs: 100,
    }));
    const repeated = await t.run(async (ctx) => {
      const request = await getCurrentCommunityJoinRequestByPair({
        ctx,
        communityId: fixture.communityId,
        userId: fixture.userId,
      });
      if (!request) throw new Error("request_missing");
      return denyCommunityJoinRequestCore({
        ctx,
        request,
        nowMs: fixture.nowMs + 50,
        cooldownMs: 100,
      });
    });
    expect(repeated.changed).toBe(false);
    expect(repeated.request.reapplyAt).toBe(first.request.reapplyAt);
    expect(communityJoinRequestCanReapply(repeated.request, fixture.nowMs + 102)).toBe(true);
    const reopened = await t.run(async (ctx) => ensurePendingCommunityJoinRequest({
      ctx,
      communityId: fixture.communityId,
      userId: fixture.userId,
      nowMs: fixture.nowMs + 102,
    }));
    expect(reopened._id).toEqual(pending._id);
    expect(reopened.status).toBe("pending");
    expect("deniedAt" in reopened).toBe(false);
    expect("reapplyAt" in reopened).toBe(false);
  });

  test("manager removal state is one denial row under retry", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "removal");
    const first = await t.run(async (ctx) => ensureDeniedCommunityJoinRequest({
      ctx,
      communityId: fixture.communityId,
      userId: fixture.userId,
      nowMs: fixture.nowMs + 1,
      cooldownMs: 200,
    }));
    const repeated = await t.run(async (ctx) => ensureDeniedCommunityJoinRequest({
      ctx,
      communityId: fixture.communityId,
      userId: fixture.userId,
      nowMs: fixture.nowMs + 50,
      cooldownMs: 200,
    }));
    expect(repeated.changed).toBe(false);
    expect(repeated.request._id).toEqual(first.request._id);
    expect(repeated.request.reapplyAt).toBe(first.request.reapplyAt);
  });

  test("ambiguous duplicate current requests fail closed", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "duplicates");
    await t.run(async (ctx) => {
      for (let index = 0; index < 2; index += 1) {
        await ctx.db.insert("communityJoinRequests", {
          communityId: fixture.communityId,
          userId: fixture.userId,
          status: "pending",
          createdAt: fixture.nowMs + index,
          updatedAt: fixture.nowMs + index,
        });
      }
    });
    await expect(t.run(async (ctx) => getCurrentCommunityJoinRequestByPair({
      ctx,
      communityId: fixture.communityId,
      userId: fixture.userId,
    }))).rejects.toThrow("community_join_request_state_ambiguous");
  });

  test("a valid denied-to-pending reapplication resolves and collapses on write", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "legacy-reapply");
    const deniedAt = fixture.nowMs + 1;
    const reapplyAt = fixture.nowMs + 101;
    await t.run(async (ctx) => {
      await ctx.db.insert("communityJoinRequests", {
        communityId: fixture.communityId,
        userId: fixture.userId,
        status: "denied",
        deniedAt,
        reapplyAt,
        createdAt: deniedAt,
        updatedAt: deniedAt,
      });
      await ctx.db.insert("communityJoinRequests", {
        communityId: fixture.communityId,
        userId: fixture.userId,
        status: "pending",
        createdAt: reapplyAt,
        updatedAt: reapplyAt,
      });
    });
    await expect(t.run(async (ctx) => getCurrentCommunityJoinRequestByPair({
      ctx,
      communityId: fixture.communityId,
      userId: fixture.userId,
    }))).resolves.toMatchObject({ status: "pending" });
    await t.run(async (ctx) => ensurePendingCommunityJoinRequest({
      ctx,
      communityId: fixture.communityId,
      userId: fixture.userId,
      nowMs: reapplyAt + 1,
    }));
    expect(await t.run(async (ctx) => ctx.db.query("communityJoinRequests").collect()))
      .toHaveLength(1);
  });

  test("legacy terminal history is not current admission state", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "terminal-history");
    await t.run(async (ctx) => {
      await ctx.db.insert("communityJoinRequests", {
        communityId: fixture.communityId,
        userId: fixture.userId,
        status: "approved",
        createdAt: fixture.nowMs + 1,
        updatedAt: fixture.nowMs + 2,
      });
    });
    await expect(t.run(async (ctx) => getCurrentCommunityJoinRequestByPair({
      ctx,
      communityId: fixture.communityId,
      userId: fixture.userId,
    }))).resolves.toBeNull();
  });

  test("membership activation consumes residual request state", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "activation");
    await t.run(async (ctx) => ensurePendingCommunityJoinRequest({
      ctx,
      communityId: fixture.communityId,
      userId: fixture.userId,
      nowMs: fixture.nowMs + 1,
    }));
    const first = await t.run(async (ctx) => activateCommunityMembershipCore({
      ctx,
      communityId: fixture.communityId,
      userId: fixture.userId,
      accessSource: "free_grant",
      activationReason: "test",
      nowMs: fixture.nowMs + 2,
    }));
    expect(first).toMatchObject({ accessGranted: true });
    expect(await t.run(async (ctx) => ctx.db.query("communityJoinRequests").collect()))
      .toHaveLength(0);

    const replay = await t.run(async (ctx) => activateCommunityMembershipCore({
      ctx,
      communityId: fixture.communityId,
      userId: fixture.userId,
      accessSource: "free_grant",
      activationReason: "test_replay",
      nowMs: fixture.nowMs + 3,
    }));
    expect(replay).toMatchObject({ accessGranted: false, activationMarker: null });

    const firstEvents = await t.run(async (ctx) =>
      await ctx.db
        .query("communityActivityEvents")
        .withIndex("by_community_createdAt", (q) =>
          q.eq("communityId", fixture.communityId),
        )
        .collect(),
    );
    expect(firstEvents).toEqual([
      expect.objectContaining({
        type: "member_joined",
        actorUserId: fixture.userId,
        targetType: "membership",
        targetId: String(first.membership._id),
        dedupeKey: `member_joined:${String(first.membership._id)}:1`,
      }),
    ]);

    await t.run(async (ctx) => {
      await ctx.db.patch(first.membership._id, {
        active: false,
        revokedAt: fixture.nowMs + 4,
        revokedReason: "test_reactivation",
        updatedAt: fixture.nowMs + 4,
      });
    });
    const reactivated = await t.run(async (ctx) => activateCommunityMembershipCore({
      ctx,
      communityId: fixture.communityId,
      userId: fixture.userId,
      accessSource: "free_grant",
      activationReason: "test_reactivation",
      nowMs: fixture.nowMs + 5,
    }));
    expect(reactivated).toMatchObject({ accessGranted: true });
    expect(reactivated.membership).toMatchObject({ activationSequence: 2 });

    const reactivationEvents = await t.run(async (ctx) =>
      await ctx.db
        .query("communityActivityEvents")
        .withIndex("by_community_createdAt", (q) =>
          q.eq("communityId", fixture.communityId),
        )
        .collect(),
    );
    expect(reactivationEvents).toEqual([
      expect.objectContaining({ dedupeKey: `member_joined:${String(first.membership._id)}:1` }),
      expect.objectContaining({ dedupeKey: `member_joined:${String(first.membership._id)}:2` }),
    ]);
  });

  test("membership activation fails closed on duplicate membership authority", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "duplicate-membership");
    await t.run(async (ctx) => {
      for (let index = 0; index < 2; index += 1) {
        await ctx.db.insert("communityMemberships", {
          communityId: fixture.communityId,
          userId: fixture.userId,
          role: "member",
          accessSource: "free_grant",
          active: false,
          activationSequence: 0,
          createdAt: fixture.nowMs + index,
          updatedAt: fixture.nowMs + index,
        });
      }
    });
    await expect(t.run(async (ctx) => activateCommunityMembershipCore({
      ctx,
      communityId: fixture.communityId,
      userId: fixture.userId,
      accessSource: "free_grant",
      activationReason: "test",
      nowMs: fixture.nowMs + 2,
    }))).rejects.toThrow("community_membership_pair_not_unique");
  });
});

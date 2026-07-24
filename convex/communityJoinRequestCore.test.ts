import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import {
  assertCanonicalCommunityJoinRequest,
  cancelPendingCommunityJoinRequest,
  communityJoinRequestCanReapply,
  denyCommunityJoinRequest,
  ensurePendingCommunityJoinRequest,
  getUniqueCommunityJoinRequestByPair,
} from "./communityJoinRequestCore";
import { communityMembershipRowIsActive } from "./communityCore";
import { activateCommunityMembershipCore } from "./communityMembershipLifecycle";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityAdmin.ts",
  "./communityLifecycle.ts",
  "./communityPublic.ts",
  "./email.ts",
  "./userPlatformAppMounts.ts",
  "./_generated/**/*.*s",
]);

async function createFixture(t: ReturnType<typeof convexTest>, suffix: string) {
  const nowMs = 1_760_000_000_000;
  const ownerSubject = `join-kernel-owner-${suffix}`;
  const userSubject = `join-kernel-user-${suffix}`;
  const otherSubject = `join-kernel-other-${suffix}`;
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: ownerSubject,
      displayName: "Join kernel owner",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const userId = await ctx.db.insert("users", {
      authSubject: userSubject,
      displayName: "Join kernel member",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const otherUserId = await ctx.db.insert("users", {
      authSubject: otherSubject,
      displayName: "Join kernel second member",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const communitySlug = `join-kernel-${suffix}`;
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: communitySlug,
      name: "Join kernel",
      visibility: "unlisted",
      entryPolicy: "approval",
      activeMemberCount: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return {
      nowMs,
      ownerId,
      ownerSubject,
      userId,
      userSubject,
      otherUserId,
      otherSubject,
      communityId,
      communitySlug,
    };
  });
}

describe("canonical community join-request kernel", () => {
  test("repeated and overlapping applications converge on one pending row", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "application");
    const apply = async () =>
      await t.run(async (ctx) =>
        await ensurePendingCommunityJoinRequest({
          ctx,
          communityId: fixture.communityId,
          userId: fixture.userId,
          nowMs: fixture.nowMs + 1,
        }),
      );

    const [first, second] = await Promise.all([apply(), apply()]);
    expect(first._id).toEqual(second._id);
    const repeated = await apply();
    expect(repeated._id).toEqual(first._id);
    expect(
      await t.run(async (ctx) => await ctx.db.query("communityJoinRequests").collect()),
    ).toHaveLength(1);
  });

  test("cancel deletes pending state and is idempotent", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "cancel");
    await t.run(async (ctx) =>
      await ensurePendingCommunityJoinRequest({
        ctx,
        communityId: fixture.communityId,
        userId: fixture.userId,
        nowMs: fixture.nowMs + 1,
      }),
    );
    await expect(
      t.run(async (ctx) =>
        await cancelPendingCommunityJoinRequest({
          ctx,
          communityId: fixture.communityId,
          userId: fixture.userId,
        }),
      ),
    ).resolves.toEqual({ outcome: "canceled" });
    await expect(
      t.run(async (ctx) =>
        await cancelPendingCommunityJoinRequest({
          ctx,
          communityId: fixture.communityId,
          userId: fixture.userId,
        }),
      ),
    ).resolves.toEqual({ outcome: "none" });
  });

  test("denial retry preserves its window and reapply reuses the same row", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "denial");
    const pending = await t.run(async (ctx) =>
      await ensurePendingCommunityJoinRequest({
        ctx,
        communityId: fixture.communityId,
        userId: fixture.userId,
        nowMs: fixture.nowMs + 1,
      }),
    );
    const first = await t.run(async (ctx) =>
      await denyCommunityJoinRequest({
        ctx,
        request: pending,
        nowMs: fixture.nowMs + 2,
        cooldownMs: 100,
      }),
    );
    const repeated = await t.run(async (ctx) => {
      const request = await getUniqueCommunityJoinRequestByPair({
        ctx,
        communityId: fixture.communityId,
        userId: fixture.userId,
      });
      if (!request) throw new Error("test_request_missing");
      return await denyCommunityJoinRequest({
        ctx,
        request,
        nowMs: fixture.nowMs + 50,
        cooldownMs: 100,
      });
    });
    expect(repeated.changed).toBe(false);
    expect(repeated.request.deniedAt).toBe(first.request.deniedAt);
    expect(repeated.request.reapplyAt).toBe(first.request.reapplyAt);
    expect(communityJoinRequestCanReapply(repeated.request, fixture.nowMs + 101)).toBe(false);

    const reopened = await t.run(async (ctx) =>
      await ensurePendingCommunityJoinRequest({
        ctx,
        communityId: fixture.communityId,
        userId: fixture.userId,
        nowMs: fixture.nowMs + 102,
      }),
    );
    expect(reopened._id).toEqual(pending._id);
    expect(reopened.status).toBe("pending");
    expect(reopened.deniedAt).toBeUndefined();
    expect(reopened.reapplyAt).toBeUndefined();
    expect(reopened.createdAt).toBe(fixture.nowMs + 102);
  });

  test("approval activates membership and consumes the pending request", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "approval");
    const asMember = t.withIdentity({ subject: fixture.userSubject });
    const asOwner = t.withIdentity({ subject: fixture.ownerSubject });
    await asMember.mutation(api.communityPublic.joinPublicCommunityBySlug, {
      communitySlug: fixture.communitySlug,
    });
    const request = await t.run(async (ctx) =>
      await getUniqueCommunityJoinRequestByPair({
        ctx,
        communityId: fixture.communityId,
        userId: fixture.userId,
      }),
    );
    if (!request) throw new Error("test_request_missing");
    await expect(
      asOwner.mutation(api.communityAdmin.approveCommunityJoinRequest, {
        requestId: request._id,
      }),
    ).resolves.toEqual({ ok: true });
    const state = await t.run(async (ctx) => ({
      request: await ctx.db.get(request._id),
      memberships: await ctx.db.query("communityMemberships").collect(),
    }));
    expect(state.request).toBeNull();
    expect(state.memberships).toHaveLength(1);
    expect(communityMembershipRowIsActive(state.memberships[0] as any)).toBe(true);
    await expect(
      asOwner.mutation(api.communityAdmin.approveCommunityJoinRequest, {
        requestId: request._id,
      }),
    ).rejects.toThrow("join_request_not_found");
  });

  test("non-pending and blocked approvals fail closed without changing state", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "approval-guards");
    const asMember = t.withIdentity({ subject: fixture.userSubject });
    const asOwner = t.withIdentity({ subject: fixture.ownerSubject });
    await asMember.mutation(api.communityPublic.joinPublicCommunityBySlug, {
      communitySlug: fixture.communitySlug,
    });
    const request = await t.run(async (ctx) =>
      await getUniqueCommunityJoinRequestByPair({
        ctx,
        communityId: fixture.communityId,
        userId: fixture.userId,
      }),
    );
    if (!request) throw new Error("test_request_missing");
    await asOwner.mutation(api.communityAdmin.denyCommunityJoinRequest, {
      requestId: request._id,
    });
    await expect(
      asOwner.mutation(api.communityAdmin.approveCommunityJoinRequest, {
        requestId: request._id,
      }),
    ).rejects.toThrow("join_request_not_pending");
    await t.run(async (ctx) => {
      await ctx.db.patch(request._id, {
        status: "pending",
        deniedAt: undefined,
        reapplyAt: undefined,
      });
      await ctx.db.insert("communityBlocks", {
        communityId: fixture.communityId,
        userId: fixture.userId,
        createdByUserId: fixture.ownerId,
        createdAt: fixture.nowMs + 10,
        updatedAt: fixture.nowMs + 10,
      });
    });
    await expect(
      asOwner.mutation(api.communityAdmin.approveCommunityJoinRequest, {
        requestId: request._id,
      }),
    ).rejects.toThrow("community_user_blocked");
    expect(
      await t.run(async (ctx) =>
        String((await ctx.db.get(request._id) as any)?.status ?? ""),
      ),
    ).toBe("pending");
  });

  test("active-member and paid-policy approvals fail closed", async () => {
    const active = convexTest(schema, modules);
    const activeFixture = await createFixture(active, "active-approval-guard");
    await active.run(async (ctx) =>
      await activateCommunityMembershipCore({
        ctx,
        communityId: activeFixture.communityId,
        userId: activeFixture.userId,
        accessSource: "free_grant",
        activationReason: "active_approval_guard_test",
        nowMs: activeFixture.nowMs + 1,
      }),
    );
    const activeRequest = await active.run(async (ctx) =>
      await ensurePendingCommunityJoinRequest({
        ctx,
        communityId: activeFixture.communityId,
        userId: activeFixture.userId,
        nowMs: activeFixture.nowMs + 2,
      }),
    );
    await expect(
      active.withIdentity({ subject: activeFixture.ownerSubject }).mutation(
        api.communityAdmin.approveCommunityJoinRequest,
        { requestId: activeRequest._id },
      ),
    ).rejects.toThrow("community_membership_already_active");
    expect(await active.run(async (ctx) => ctx.db.get(activeRequest._id))).not.toBeNull();

    const paid = convexTest(schema, modules);
    const paidFixture = await createFixture(paid, "paid-approval-guard");
    const paidRequest = await paid.run(async (ctx) => {
      const request = await ensurePendingCommunityJoinRequest({
        ctx,
        communityId: paidFixture.communityId,
        userId: paidFixture.userId,
        nowMs: paidFixture.nowMs + 1,
      });
      await ctx.db.patch(paidFixture.communityId, {
        entryPolicy: "paid_subscription",
        updatedAt: paidFixture.nowMs + 2,
      });
      return request;
    });
    await expect(
      paid.withIdentity({ subject: paidFixture.ownerSubject }).mutation(
        api.communityAdmin.approveCommunityJoinRequest,
        { requestId: paidRequest._id },
      ),
    ).rejects.toThrow("community_paid_checkout_required");
    expect(await paid.run(async (ctx) => ctx.db.get(paidRequest._id))).not.toBeNull();
  });

  test("opening access resolves pending requests but never activates blocked users", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "open");
    await t.withIdentity({ subject: fixture.userSubject }).mutation(
      api.communityPublic.joinPublicCommunityBySlug,
      { communitySlug: fixture.communitySlug },
    );
    await t.withIdentity({ subject: fixture.otherSubject }).mutation(
      api.communityPublic.joinPublicCommunityBySlug,
      { communitySlug: fixture.communitySlug },
    );
    await t.run(async (ctx) => {
      await ctx.db.insert("communityBlocks", {
        communityId: fixture.communityId,
        userId: fixture.otherUserId,
        createdByUserId: fixture.ownerId,
        createdAt: fixture.nowMs + 2,
        updatedAt: fixture.nowMs + 2,
      });
    });
    await t.withIdentity({ subject: fixture.ownerSubject }).mutation(
      api.communityAdmin.setCommunityFreeAccessMode,
      { communityId: fixture.communityId, mode: "open" },
    );
    const state = await t.run(async (ctx) => ({
      requests: await ctx.db.query("communityJoinRequests").collect(),
      memberships: await ctx.db.query("communityMemberships").collect(),
    }));
    expect(state.requests).toHaveLength(0);
    expect(state.memberships.map((row) => String(row.userId))).toEqual([
      String(fixture.userId),
    ]);
  });

  test("ordinary denial does not survive a later open-access join", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "denied-to-open");
    const asMember = t.withIdentity({ subject: fixture.userSubject });
    const asOwner = t.withIdentity({ subject: fixture.ownerSubject });
    await asMember.mutation(api.communityPublic.joinPublicCommunityBySlug, {
      communitySlug: fixture.communitySlug,
    });
    const request = await t.run(async (ctx) =>
      await getUniqueCommunityJoinRequestByPair({
        ctx,
        communityId: fixture.communityId,
        userId: fixture.userId,
      }),
    );
    if (!request) throw new Error("test_request_missing");
    await asOwner.mutation(api.communityAdmin.denyCommunityJoinRequest, {
      requestId: request._id,
    });
    await asOwner.mutation(api.communityAdmin.setCommunityFreeAccessMode, {
      communityId: fixture.communityId,
      mode: "open",
    });
    await expect(
      asMember.mutation(api.communityPublic.joinPublicCommunityBySlug, {
        communitySlug: fixture.communitySlug,
      }),
    ).resolves.toMatchObject({ outcome: "joined" });
    expect(
      await t.run(async (ctx) => await ctx.db.query("communityJoinRequests").collect()),
    ).toHaveLength(0);
  });

  test("authorized activation clears residual requests and blocks fail closed", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "activation");
    await t.run(async (ctx) =>
      await ensurePendingCommunityJoinRequest({
        ctx,
        communityId: fixture.communityId,
        userId: fixture.userId,
        nowMs: fixture.nowMs + 1,
      }),
    );
    await t.run(async (ctx) =>
      await activateCommunityMembershipCore({
        ctx,
        communityId: fixture.communityId,
        userId: fixture.userId,
        accessSource: "free_grant",
        activationReason: "join_kernel_test",
        nowMs: fixture.nowMs + 2,
      }),
    );
    expect(
      await t.run(async (ctx) => await ctx.db.query("communityJoinRequests").collect()),
    ).toHaveLength(0);

    await t.run(async (ctx) => {
      await ctx.db.insert("communityBlocks", {
        communityId: fixture.communityId,
        userId: fixture.otherUserId,
        createdByUserId: fixture.ownerId,
        createdAt: fixture.nowMs + 3,
        updatedAt: fixture.nowMs + 3,
      });
    });
    await expect(
      t.run(async (ctx) =>
        await activateCommunityMembershipCore({
          ctx,
          communityId: fixture.communityId,
          userId: fixture.otherUserId,
          accessSource: "free_grant",
          activationReason: "join_kernel_block_test",
          nowMs: fixture.nowMs + 4,
        }),
      ),
    ).rejects.toThrow("community_user_blocked");
  });

  test("paid policy cleanup deletes pending admission state", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "paid");
    await t.run(async (ctx) => {
      await ensurePendingCommunityJoinRequest({
        ctx,
        communityId: fixture.communityId,
        userId: fixture.userId,
        nowMs: fixture.nowMs + 1,
      });
      await ensurePendingCommunityJoinRequest({
        ctx,
        communityId: fixture.communityId,
        userId: fixture.otherUserId,
        nowMs: fixture.nowMs + 1,
      });
      await ctx.db.patch(fixture.communityId, {
        entryPolicy: "paid_subscription",
        updatedAt: fixture.nowMs + 2,
      });
    });
    await expect(
      t.withIdentity({ subject: fixture.userSubject }).mutation(
        api.communityPublic.joinPublicCommunityBySlug,
        { communitySlug: fixture.communitySlug },
      ),
    ).resolves.toMatchObject({ outcome: "paid_plan_required" });
    expect(
      await t.run(async (ctx) =>
        await getUniqueCommunityJoinRequestByPair({
          ctx,
          communityId: fixture.communityId,
          userId: fixture.userId,
        }),
      ),
    ).toBeNull();
    await t.mutation(
      (internal as any).communityLifecycle.deletePendingJoinRequestsForPaidPolicyInternal,
      { communityId: fixture.communityId },
    );
    expect(
      await t.run(async (ctx) => await ctx.db.query("communityJoinRequests").collect()),
    ).toHaveLength(0);
  });

  test("duplicates and malformed legacy states fail closed", async () => {
    expect(() =>
      assertCanonicalCommunityJoinRequest({
        _id: "legacy_approved",
        communityId: "community",
        userId: "user",
        status: "approved",
        createdAt: 1,
        updatedAt: 1,
      } as any),
    ).toThrow("community_join_request_status_invalid");
    expect(() =>
      assertCanonicalCommunityJoinRequest({
        _id: "malformed_denial",
        communityId: "community",
        userId: "user",
        status: "denied",
        deniedAt: 10,
        reapplyAt: 9,
        createdAt: 1,
        updatedAt: 1,
      }),
    ).toThrow("community_join_request_denial_fields_invalid");

    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "duplicate");
    const duplicateIds = await t.run(async (ctx) => {
      const ids = [];
      for (let index = 0; index < 2; index += 1) {
        ids.push(await ctx.db.insert("communityJoinRequests", {
          communityId: fixture.communityId,
          userId: fixture.userId,
          status: "pending",
          createdAt: fixture.nowMs + index,
          updatedAt: fixture.nowMs + index,
        }));
      }
      return ids;
    });
    await expect(
      t.run(async (ctx) =>
        await getUniqueCommunityJoinRequestByPair({
          ctx,
          communityId: fixture.communityId,
          userId: fixture.userId,
        }),
      ),
    ).rejects.toThrow("community_join_request_pair_not_unique");
    await expect(
      t.withIdentity({ subject: fixture.ownerSubject }).mutation(
        api.communityAdmin.denyCommunityJoinRequest,
        { requestId: duplicateIds[0] },
      ),
    ).rejects.toThrow("community_join_request_pair_not_unique");
    await t.run(async (ctx) => {
      await ctx.db.patch(fixture.communityId, {
        entryPolicy: "paid_subscription",
        updatedAt: fixture.nowMs + 3,
      });
    });
    await expect(
      t.mutation(
        (internal as any).communityLifecycle.deletePendingJoinRequestsForPaidPolicyInternal,
        { communityId: fixture.communityId },
      ),
    ).rejects.toThrow("community_join_request_pair_not_unique");
    expect(
      await t.run(async (ctx) =>
        (await ctx.db.query("communityJoinRequests").collect()).map((row) => row.status),
      ),
    ).toEqual(["pending", "pending"]);
  });
});

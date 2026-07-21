import { readFileSync } from "node:fs";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import {
  type CommunityMembershipLike,
  communityMembershipRowIsActive,
} from "./communityCore";
import { COMMUNITY_REMOVAL_REAPPLY_COOLDOWN_MS } from "./communityJoinRequestCore";
import { activateCommunityMembershipCore } from "./communityMembershipLifecycle";
import {
  ensurePlatformHomeCommunityMembership,
  PLATFORM_HOME_MEMBER_LEFT_REVOKED_REASON,
} from "./platformHomeCommunity";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityAppMounts.ts",
  "./communityAdmin.ts",
  "./communityPublic.ts",
  "./email.ts",
  "./userPlatformAppMounts.ts",
  "./_generated/**/*.*s",
]);

process.env.ARX_PUBLIC_APP_URL ||= "https://polynet.test";

type TestRuntime = ReturnType<typeof convexTest>;

async function createFixture(t: TestRuntime, suffix: string) {
  const nowMs = Date.now();
  const ownerSubject = `platform-home-owner-${suffix}`;
  const memberSubject = `platform-home-member-${suffix}`;
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: ownerSubject,
      displayName: "Platform home owner",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const userId = await ctx.db.insert("users", {
      authSubject: memberSubject,
      displayName: "Platform home member",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "polynet",
      name: "Polynet",
      visibility: "published",
      entryPolicy: "open",
      activeMemberCount: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return {
      communityId,
      ownerId,
      ownerSubject,
      userId,
      memberSubject,
      nowMs,
    };
  });
}

async function activateMember(
  t: TestRuntime,
  fixture: Awaited<ReturnType<typeof createFixture>>,
) {
  return await t.run(
    async (ctx) =>
      await activateCommunityMembershipCore({
        ctx,
        communityId: fixture.communityId,
        userId: fixture.userId,
        accessSource: "free_grant",
        activationReason: "platform_home_admission_test",
        nowMs: fixture.nowMs + 1,
      }),
  );
}

async function ensureHome(
  t: TestRuntime,
  fixture: Awaited<ReturnType<typeof createFixture>>,
  nowMs = fixture.nowMs + 2,
) {
  return await t.run(
    async (ctx) =>
      await ensurePlatformHomeCommunityMembership({
        ctx,
        userId: fixture.userId,
        nowMs,
      }),
  );
}

async function revokeMember(
  t: TestRuntime,
  fixture: Awaited<ReturnType<typeof createFixture>>,
  membershipId: any,
  revokedReason = "removed_by_manager",
  nowMs = fixture.nowMs + 2,
) {
  return await t
    .withIdentity({ subject: fixture.ownerSubject })
    .mutation((internal as any).communityAdmin.revokeCommunityMemberInternal, {
      communityId: fixture.communityId,
      targetMembershipId: membershipId,
      revokedReason,
      nowMs,
    });
}

async function readPairState(
  t: TestRuntime,
  fixture: Awaited<ReturnType<typeof createFixture>>,
) {
  return await t.run(async (ctx) => {
    const memberships = (await ctx.db.query("communityMemberships").collect()).filter(
      (row) =>
        String(row.communityId) === String(fixture.communityId) &&
        String(row.userId) === String(fixture.userId),
    );
    const joinRequests = (await ctx.db.query("communityJoinRequests").collect()).filter(
      (row) =>
        String(row.communityId) === String(fixture.communityId) &&
        String(row.userId) === String(fixture.userId),
    );
    return {
      community: await ctx.db.get(fixture.communityId),
      memberships,
      joinRequests,
    };
  });
}

describe("platform home admission authority", () => {
  test("a new user is autojoined exactly once", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "new-user");

    await expect(ensureHome(t, fixture)).resolves.toMatchObject({
      status: "joined",
    });
    const state = await readPairState(t, fixture);
    expect(state.memberships).toHaveLength(1);
    expect(
      communityMembershipRowIsActive(
        state.memberships[0] as CommunityMembershipLike,
      ),
    ).toBe(true);
    expect(state.community?.activeMemberCount).toBe(2);
  });

  test("repeated bootstrap does not create another membership", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "repeat-bootstrap");

    const first = await ensureHome(t, fixture);
    const repeated = await ensureHome(t, fixture, fixture.nowMs + 3);
    expect(first.status).toBe("joined");
    expect(repeated.status).toBe("already_member");
    expect((await readPairState(t, fixture)).memberships).toHaveLength(1);
  });

  test("voluntary leave preserves one inactive membership relationship", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "leave");
    const activation = await activateMember(t, fixture);
    const asMember = t.withIdentity({ subject: fixture.memberSubject });

    await asMember.mutation(api.communityAdmin.leaveCommunity, {
      communityId: fixture.communityId,
    });
    await expect(
      asMember.mutation(api.communityAdmin.leaveCommunity, {
        communityId: fixture.communityId,
      }),
    ).resolves.toEqual({ ok: true });
    const state = await readPairState(t, fixture);
    expect(state.memberships).toHaveLength(1);
    expect(state.memberships[0]?._id).toEqual(activation.membership._id);
    expect(state.memberships[0]?.active).toBe(false);
    expect(state.memberships[0]?.revokedReason).toBe(
      PLATFORM_HOME_MEMBER_LEFT_REVOKED_REASON,
    );
    expect(state.joinRequests).toHaveLength(0);
    expect(state.community?.activeMemberCount).toBe(1);
  });

  test("bootstrap cannot undo a voluntary leave", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "leave-bootstrap");
    await activateMember(t, fixture);
    await t
      .withIdentity({ subject: fixture.memberSubject })
      .mutation(api.communityAdmin.leaveCommunity, {
        communityId: fixture.communityId,
      });

    await expect(ensureHome(t, fixture)).resolves.toMatchObject({
      status: "disabled",
    });
    expect((await readPairState(t, fixture)).memberships[0]?.active).toBe(
      false,
    );
  });

  test("explicit join after voluntary leave reactivates the same membership", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "leave-rejoin");
    const activation = await activateMember(t, fixture);
    const asMember = t.withIdentity({ subject: fixture.memberSubject });
    await asMember.mutation(api.communityAdmin.leaveCommunity, {
      communityId: fixture.communityId,
    });

    await expect(
      asMember.mutation(api.communityPublic.joinPublicCommunity, {
        communityId: fixture.communityId,
      }),
    ).resolves.toMatchObject({ outcome: "joined" });
    const state = await readPairState(t, fixture);
    expect(state.memberships).toHaveLength(1);
    expect(state.memberships[0]?._id).toEqual(activation.membership._id);
    expect(
      communityMembershipRowIsActive(
        state.memberships[0] as CommunityMembershipLike,
      ),
    ).toBe(true);
    expect(state.memberships[0]?.revokedReason).toBeUndefined();
  });

  test("manager removal preserves the membership and one denial row under retry", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "remove");
    const activation = await activateMember(t, fixture);
    await revokeMember(t, fixture, activation.membership._id);
    await revokeMember(
      t,
      fixture,
      activation.membership._id,
      "removed_by_manager",
      fixture.nowMs + 3,
    );

    const state = await readPairState(t, fixture);
    expect(state.memberships).toHaveLength(1);
    expect(state.memberships[0]?._id).toEqual(activation.membership._id);
    expect(state.memberships[0]?.active).toBe(false);
    expect(state.memberships[0]?.revokedReason).toBe("removed_by_manager");
    expect(state.joinRequests).toHaveLength(1);
    expect(state.joinRequests[0]?.status).toBe("denied");
    expect(state.joinRequests[0]?.deniedAt).toBe(fixture.nowMs + 2);
    expect(state.joinRequests[0]?.reapplyAt).toBe(
      fixture.nowMs + 2 + COMMUNITY_REMOVAL_REAPPLY_COOLDOWN_MS,
    );
    await expect(
      t
        .withIdentity({ subject: fixture.memberSubject })
        .mutation(api.communityAdmin.leaveCommunity, {
          communityId: fixture.communityId,
        }),
    ).rejects.toThrow("community_membership_inactive");
    const protectedState = await readPairState(t, fixture);
    expect(protectedState.memberships[0]?.revokedReason).toBe(
      "removed_by_manager",
    );
    expect(protectedState.joinRequests[0]?.status).toBe("denied");
  });

  test("manager removal blocks explicit rejoin during the 14 day cooldown", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "remove-cooldown");
    const activation = await activateMember(t, fixture);
    await revokeMember(t, fixture, activation.membership._id);

    const result = await t
      .withIdentity({ subject: fixture.memberSubject })
      .mutation(api.communityPublic.joinPublicCommunity, {
        communityId: fixture.communityId,
      });
    expect(result.outcome).toBe("approval_denied");
    expect(Date.parse(String(result.reapply_at))).toBeGreaterThan(Date.now());
  });

  test("manager-removed member requests approval after cooldown even while home is open", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "remove-reapply");
    const activation = await activateMember(t, fixture);
    await revokeMember(t, fixture, activation.membership._id);
    await t.run(async (ctx) => {
      const denied = await ctx.db
        .query("communityJoinRequests")
        .withIndex("by_community_user", (q) =>
          q.eq("communityId", fixture.communityId).eq("userId", fixture.userId),
        )
        .unique();
      if (!denied) throw new Error("test_denial_missing");
      await ctx.db.patch(denied._id, {
        deniedAt: fixture.nowMs - 2,
        reapplyAt: fixture.nowMs - 1,
      });
    });

    const result = await t
      .withIdentity({ subject: fixture.memberSubject })
      .mutation(api.communityPublic.joinPublicCommunity, {
        communityId: fixture.communityId,
      });
    expect(result.outcome).toBe("approval_pending");
    expect(
      (await readPairState(t, fixture)).joinRequests.some(
        (row) => row.status === "pending",
      ),
    ).toBe(true);
  });

  test("approval reactivates a manager-removed member", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "remove-approval");
    const activation = await activateMember(t, fixture);
    await revokeMember(t, fixture, activation.membership._id);
    const pendingId = await t.run(async (ctx) => {
      const denied = await ctx.db
        .query("communityJoinRequests")
        .withIndex("by_community_user", (q) =>
          q.eq("communityId", fixture.communityId).eq("userId", fixture.userId),
        )
        .unique();
      if (!denied) throw new Error("test_denial_missing");
      await ctx.db.patch(denied._id, {
        deniedAt: fixture.nowMs - 2,
        reapplyAt: fixture.nowMs - 1,
      });
      return denied._id;
    });
    await t
      .withIdentity({ subject: fixture.memberSubject })
      .mutation(api.communityPublic.joinPublicCommunity, {
        communityId: fixture.communityId,
      });
    const pending = (await readPairState(t, fixture)).joinRequests.find(
      (row) => row.status === "pending",
    );
    expect(pending?._id).toEqual(pendingId);

    await t
      .withIdentity({ subject: fixture.ownerSubject })
      .mutation(api.communityAdmin.approveCommunityJoinRequest, {
        requestId: pending?._id as any,
      });
    const state = await readPairState(t, fixture);
    expect(state.memberships).toHaveLength(1);
    expect(state.memberships[0]?._id).toEqual(activation.membership._id);
    expect(
      communityMembershipRowIsActive(
        state.memberships[0] as CommunityMembershipLike,
      ),
    ).toBe(true);
    expect(state.joinRequests).toHaveLength(0);
    await expect(ensureHome(t, fixture)).resolves.toMatchObject({
      status: "already_member",
    });
  });

  test("an active ban blocks explicit join", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "ban");
    const activation = await activateMember(t, fixture);
    await revokeMember(
      t,
      fixture,
      activation.membership._id,
      "banned_by_manager",
    );
    await t.run(async (ctx) => {
      await ctx.db.insert("communityBlocks", {
        communityId: fixture.communityId,
        userId: fixture.userId,
        createdByUserId: fixture.ownerId,
        reason: "platform_home_admission_test",
        createdAt: fixture.nowMs + 3,
        updatedAt: fixture.nowMs + 3,
      });
    });

    await expect(
      t
        .withIdentity({ subject: fixture.memberSubject })
        .mutation(api.communityPublic.joinPublicCommunity, {
          communityId: fixture.communityId,
        }),
    ).rejects.toThrow("community_user_blocked");
  });

  test("lifting a ban does not silently autojoin the revoked member", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "unban");
    const activation = await activateMember(t, fixture);
    await revokeMember(
      t,
      fixture,
      activation.membership._id,
      "banned_by_manager",
    );
    await t.run(async (ctx) => {
      const blockId = await ctx.db.insert("communityBlocks", {
        communityId: fixture.communityId,
        userId: fixture.userId,
        createdByUserId: fixture.ownerId,
        createdAt: fixture.nowMs + 3,
        updatedAt: fixture.nowMs + 3,
      });
      await ctx.db.patch(blockId, {
        liftedAt: fixture.nowMs + 4,
        updatedAt: fixture.nowMs + 4,
      });
    });

    await expect(ensureHome(t, fixture)).resolves.toMatchObject({
      status: "disabled",
    });
    expect((await readPairState(t, fixture)).memberships[0]?.active).toBe(
      false,
    );
  });

  test("community owner never receives a platform-home membership or join request", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "owner");
    const result = await t.run(
      async (ctx) =>
        await ensurePlatformHomeCommunityMembership({
          ctx,
          userId: fixture.ownerId,
          nowMs: fixture.nowMs + 1,
        }),
    );
    expect(result.status).toBe("owner");
    const state = await t.run(async (ctx) => ({
      memberships: await ctx.db.query("communityMemberships").collect(),
      joinRequests: await ctx.db.query("communityJoinRequests").collect(),
    }));
    expect(state.memberships).toHaveLength(0);
    expect(state.joinRequests).toHaveLength(0);
  });

  test("no platform-home path writes the deleted sentinel", async () => {
    for (const relativePath of [
      "platformHomeCommunity.ts",
      "communityAdmin.ts",
      "communityPublic.ts",
    ]) {
      expect(
        readFileSync(new URL(relativePath, import.meta.url), "utf8"),
      ).not.toContain("platform_home_autojoin_opt_out");
    }

    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "no-sentinel");
    const activation = await activateMember(t, fixture);
    await t
      .withIdentity({ subject: fixture.memberSubject })
      .mutation(api.communityAdmin.leaveCommunity, {
        communityId: fixture.communityId,
      });
    expect((await readPairState(t, fixture)).joinRequests).toHaveLength(0);
    await t
      .withIdentity({ subject: fixture.memberSubject })
      .mutation(api.communityPublic.joinPublicCommunity, {
        communityId: fixture.communityId,
      });
    await revokeMember(t, fixture, activation.membership._id);
    const requests = (await readPairState(t, fixture)).joinRequests;
    expect(requests).toHaveLength(1);
    expect(requests[0]?.message).toBeUndefined();
  });

  test("concurrent and retried autojoin attempts converge on one membership", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "concurrent");
    const run = async () => await ensureHome(t, fixture);

    const concurrent = await Promise.all([run(), run()]);
    expect(
      concurrent.every((result) =>
        ["joined", "already_member"].includes(result.status),
      ),
    ).toBe(true);
    expect((await run()).status).toBe("already_member");
    const state = await readPairState(t, fixture);
    expect(state.memberships).toHaveLength(1);
    expect(state.community?.activeMemberCount).toBe(2);
  });

  test("manager removal uses the canonical 14 day denial window", async () => {
    const t = convexTest(schema, modules);
    const fixture = await createFixture(t, "removal-window");
    const activation = await activateMember(t, fixture);
    const removedAt = fixture.nowMs + 10;
    await revokeMember(
      t,
      fixture,
      activation.membership._id,
      "removed_by_manager",
      removedAt,
    );

    const request = (await readPairState(t, fixture)).joinRequests[0];
    expect(request?.deniedAt).toBe(removedAt);
    expect(request?.reapplyAt).toBe(
      removedAt + COMMUNITY_REMOVAL_REAPPLY_COOLDOWN_MS,
    );
  });
});

import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { COMMUNITY_REMOVAL_REAPPLY_COOLDOWN_MS } from "./communityJoinRequestCore";
import { activateCommunityMembershipCore } from "./communityMembershipLifecycle";
import {
  ensurePlatformHomeCommunityMembership,
  PLATFORM_HOME_MEMBER_LEFT_REVOKED_REASON,
} from "./platformHomeCommunity";
import { PLATFORM_LEGAL_DOCUMENTS } from "../shared/legalDocuments";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityAdmin.ts",
  "./communityPublic.ts",
  "./email.ts",
  "./_generated/**/*.*s",
]);

process.env.ARX_PUBLIC_APP_URL ||= "https://polynet.test";

type Runtime = ReturnType<typeof convexTest>;

async function fixture(t: Runtime, suffix: string) {
  const nowMs = 1_786_000_000_000;
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: `home-owner-${suffix}`,
      displayName: "Owner",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const userId = await ctx.db.insert("users", {
      authSubject: `home-user-${suffix}`,
      displayName: "Member",
      handle: `home-user-${suffix}`,
      normalizedHandle: `home-user-${suffix}`,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.insert("userProfileDetails", {
      userId,
      displayName: "Member",
      avatarUrl: `https://example.com/home-user-${suffix}.png`,
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
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "polynet",
      name: "Polynet",
      visibility: "published",
      entryPolicy: "open",
      inferenceFundingPolicy: "managed_required",
      conciergeWelcomesEnabled: false,
      activeMemberCount: 1,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return {
      nowMs,
      ownerId,
      userId,
      communityId,
      ownerSubject: `home-owner-${suffix}`,
      memberSubject: `home-user-${suffix}`,
    };
  });
}

async function activate(t: Runtime, f: Awaited<ReturnType<typeof fixture>>) {
  return await t.run(async (ctx) => activateCommunityMembershipCore({
    ctx,
    communityId: f.communityId,
    userId: f.userId,
    accessSource: "free_grant",
    activationReason: "platform_home_test",
    nowMs: f.nowMs + 1,
  }));
}

async function state(t: Runtime, f: Awaited<ReturnType<typeof fixture>>) {
  return await t.run(async (ctx) => ({
    memberships: (await ctx.db.query("communityMemberships").collect()).filter(
      (row) => String(row.communityId) === String(f.communityId) &&
        String(row.userId) === String(f.userId),
    ),
    requests: (await ctx.db.query("communityJoinRequests").collect()).filter(
      (row) => String(row.communityId) === String(f.communityId) &&
        String(row.userId) === String(f.userId),
    ),
    community: await ctx.db.get(f.communityId),
  }));
}

async function revoke(
  t: Runtime,
  f: Awaited<ReturnType<typeof fixture>>,
  membershipId: any,
  nowMs = f.nowMs + 2,
) {
  return await t.withIdentity({ subject: f.ownerSubject }).mutation(
    (internal as any).communityAdmin.revokeCommunityMemberInternal,
    {
      communityId: f.communityId,
      targetMembershipId: membershipId,
      revokedReason: "removed_by_manager",
      nowMs,
    },
  );
}

describe("platform-home admission authority", () => {
  test("bootstrap converges on one active membership", async () => {
    const t = convexTest(schema, modules);
    const f = await fixture(t, "bootstrap");
    const run = () => t.run(async (ctx) => ensurePlatformHomeCommunityMembership({
      ctx,
      userId: f.userId,
      nowMs: f.nowMs + 1,
    }));
    const results = await Promise.all([run(), run()]);
    expect(results.every((result) => ["joined", "already_member"].includes(result.status)))
      .toBe(true);
    const current = await state(t, f);
    expect(current.memberships).toHaveLength(1);
    expect(current.memberships[0]?.active).not.toBe(false);
    expect(current.community?.activeMemberCount).toBe(2);
  });

  test("voluntary leave is membership state and bootstrap cannot undo it", async () => {
    const t = convexTest(schema, modules);
    const f = await fixture(t, "leave");
    const activated = await activate(t, f);
    const member = t.withIdentity({ subject: f.memberSubject });
    await member.mutation(api.communityAdmin.leaveCommunity, {
      communityId: f.communityId,
    });
    const bootstrap = await t.run(async (ctx) => ensurePlatformHomeCommunityMembership({
      ctx,
      userId: f.userId,
      nowMs: f.nowMs + 3,
    }));
    expect(bootstrap.status).toBe("disabled");
    const current = await state(t, f);
    expect(current.memberships).toHaveLength(1);
    expect(current.memberships[0]?._id).toEqual(activated.membership._id);
    expect(current.memberships[0]?.active).toBe(false);
    expect(current.memberships[0]?.revokedReason).toBe(
      PLATFORM_HOME_MEMBER_LEFT_REVOKED_REASON,
    );
    expect(current.requests).toHaveLength(0);
  });

  test("explicit join reactivates the same voluntarily-left membership", async () => {
    const t = convexTest(schema, modules);
    const f = await fixture(t, "rejoin");
    const activated = await activate(t, f);
    const member = t.withIdentity({ subject: f.memberSubject });
    await member.mutation(api.communityAdmin.leaveCommunity, {
      communityId: f.communityId,
    });
    await expect(member.mutation(api.communityPublic.joinPublicCommunity, {
      communityId: f.communityId,
    })).resolves.toMatchObject({ outcome: "joined" });
    const current = await state(t, f);
    expect(current.memberships).toHaveLength(1);
    expect(current.memberships[0]?._id).toEqual(activated.membership._id);
    expect(current.memberships[0]?.active).not.toBe(false);
    expect(current.memberships[0]?.revokedReason).toBeUndefined();
  });

  test("manager-removal retry preserves one membership and one cooldown", async () => {
    const t = convexTest(schema, modules);
    const f = await fixture(t, "removal");
    const activated = await activate(t, f);
    await revoke(t, f, activated.membership._id);
    await revoke(t, f, activated.membership._id, f.nowMs + 50);
    const current = await state(t, f);
    expect(current.memberships).toHaveLength(1);
    expect(current.memberships[0]?.active).toBe(false);
    expect(current.memberships[0]?.revokedAt).toBe(f.nowMs + 2);
    expect(current.memberships[0]?.revokedReason).toBe("removed_by_manager");
    expect(current.requests).toHaveLength(1);
    expect(current.requests[0]).toMatchObject({
      status: "denied",
      deniedAt: f.nowMs + 2,
      reapplyAt: f.nowMs + 2 + COMMUNITY_REMOVAL_REAPPLY_COOLDOWN_MS,
    });
  });

  test("manager-removed member cannot bypass cooldown through open entry", async () => {
    const t = convexTest(schema, modules);
    const f = await fixture(t, "cooldown");
    const activated = await activate(t, f);
    await revoke(t, f, activated.membership._id);
    vi.useFakeTimers();
    vi.setSystemTime(f.nowMs + 3);
    try {
      await expect(
        t.withIdentity({ subject: f.memberSubject }).mutation(
          api.communityPublic.joinPublicCommunity,
          { communityId: f.communityId },
        ),
      ).resolves.toMatchObject({ outcome: "approval_denied" });
    } finally {
      vi.useRealTimers();
    }
  });
});

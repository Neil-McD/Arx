/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { DEFAULT_PERSONAL_SOUL_MD } from "../shared/agentSoul";

const modules = import.meta.glob([
  "./userGuideSettings.ts",
  "./memberMemory.ts",
  "./communityGuideQuestions.ts",
  "./communityMemberCoach.ts",
  "./communityBuilderHeartbeat.ts",
  "./_generated/**/*.*s",
]);

async function createFixture(t: ReturnType<typeof convexTest>, suffix: string) {
  return await t.run(async (ctx) => {
    const now = 90_000;
    const ownerId = await ctx.db.insert("users", {
      authSubject: `ugs-owner-${suffix}`,
      displayName: "Owner",
      handle: `ugs-owner-${suffix}`,
      normalizedHandle: `ugs-owner-${suffix}`,
      createdAt: now,
      updatedAt: now,
    });
    const memberAId = await ctx.db.insert("users", {
      authSubject: `ugs-alice-${suffix}`,
      displayName: "Alice",
      handle: `ugs-alice-${suffix}`,
      normalizedHandle: `ugs-alice-${suffix}`,
      createdAt: now,
      updatedAt: now,
    });
    const memberBId = await ctx.db.insert("users", {
      authSubject: `ugs-bob-${suffix}`,
      displayName: "Bob",
      handle: `ugs-bob-${suffix}`,
      normalizedHandle: `ugs-bob-${suffix}`,
      createdAt: now,
      updatedAt: now,
    });
    const community1Id = await ctx.db.insert("communities", {
      ownerId,
      slug: `ugs-comm-1-${suffix}`,
      name: "Community One",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 3,
      createdAt: now,
      updatedAt: now,
    });
    const community2Id = await ctx.db.insert("communities", {
      ownerId,
      slug: `ugs-comm-2-${suffix}`,
      name: "Community Two",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 3,
      createdAt: now,
      updatedAt: now,
    });
    for (const [communityId, userId] of [
      [community1Id, memberAId],
      [community1Id, memberBId],
      [community2Id, memberAId],
      [community2Id, memberBId],
    ] as const) {
      await ctx.db.insert("communityMemberships", {
        communityId,
        userId,
        role: "member",
        accessSource: "manual_grant",
        state: "active",
        createdAt: now,
        updatedAt: now,
      });
    }
    return {
      ownerId,
      ownerSubject: `ugs-owner-${suffix}`,
      memberAId,
      memberASubject: `ugs-alice-${suffix}`,
      memberBId,
      memberBSubject: `ugs-bob-${suffix}`,
      community1Id,
      community2Id,
    };
  });
}

describe("userGuideSettings global Personal Guide defaults", () => {
  test("global Personal Soul inherits across communities, allows per-community overrides, and restores on reset while keeping memories isolated", async () => {
    const t = convexTest(schema, modules);
    const fx = await createFixture(t, "soul");
    const alice = t.withIdentity({ subject: fx.memberASubject });
    const bob = t.withIdentity({ subject: fx.memberBSubject });

    // Starter state before any global writes.
    const initial = await alice.query(api.userGuideSettings.getMyGlobalGuideSettings, {
      authSubject: fx.memberASubject,
    });
    expect(initial.soul_is_default).toBe(true);
    expect(initial.soul_md).toBe(DEFAULT_PERSONAL_SOUL_MD);
    expect(initial.allow_post).toBe(false);
    expect(initial.allow_message).toBe(false);
    expect(initial.coach_muted).toBe(false);

    // Save Alice's global Soul once.
    const savedGlobal = await alice.mutation(api.userGuideSettings.saveMyGlobalGuideSettings, {
      authSubject: fx.memberASubject,
      soulMd: "Keep answers crisp, practical, and direct across all my communities.",
    });
    expect(savedGlobal.soul_is_default).toBe(false);
    expect(savedGlobal.soul_md).toBe("Keep answers crisp, practical, and direct across all my communities.");

    // Both Community 1 and Community 2 inherit Alice's global Soul automatically.
    const [c1Soul, c2Soul, c1Internal, bobC1Soul] = await Promise.all([
      alice.query(api.memberMemory.getMyGuideSoulAndMemory, {
        authSubject: fx.memberASubject,
        communityId: fx.community1Id,
      }),
      alice.query(api.memberMemory.getMyGuideSoulAndMemory, {
        authSubject: fx.memberASubject,
        communityId: fx.community2Id,
      }),
      t.query(internal.memberMemory.readMemberSoulInternal, {
        communityId: fx.community2Id,
        userId: fx.memberAId,
      }),
      bob.query(api.memberMemory.getMyGuideSoulAndMemory, {
        authSubject: fx.memberBSubject,
        communityId: fx.community1Id,
      }),
    ]);
    expect(c1Soul.soul_md).toBe("Keep answers crisp, practical, and direct across all my communities.");
    expect(c1Soul.soul_is_default).toBe(true);
    expect(c2Soul.soul_md).toBe("Keep answers crisp, practical, and direct across all my communities.");
    expect(c1Internal.body).toBe("Keep answers crisp, practical, and direct across all my communities.");
    expect(c1Internal.isDefault).toBe(false);
    // Strict per-user isolation: Bob still sees the starter Soul.
    expect(bobC1Soul.soul_md).toBe(DEFAULT_PERSONAL_SOUL_MD);

    // Alice overrides her Soul in Community 1 only, and adds a memory in Community 1.
    const overridden = await alice.mutation(api.memberMemory.saveMyGuideSoul, {
      authSubject: fx.memberASubject,
      communityId: fx.community1Id,
      soulMd: "In Community 1, use friendly Socratic questions.",
    });
    expect(overridden.soul_md).toBe("In Community 1, use friendly Socratic questions.");
    expect(overridden.soul_is_default).toBe(false);

    await alice.mutation(api.memberMemory.saveMyGuideMemory, {
      authSubject: fx.memberASubject,
      communityId: fx.community1Id,
      operation: { action: "add", text: "Training for a marathon.", category: "fact" },
    });

    // Community 2 still uses Alice's global Soul and has ZERO memories from Community 1.
    const c2After = await alice.query(api.memberMemory.getMyGuideSoulAndMemory, {
      authSubject: fx.memberASubject,
      communityId: fx.community2Id,
    });
    expect(c2After.soul_md).toBe("Keep answers crisp, practical, and direct across all my communities.");
    expect(c2After.entries).toEqual([]);

    // Resetting Community 1's custom Soul falls right back to Alice's global Soul.
    const resetC1 = await alice.mutation(api.memberMemory.saveMyGuideSoul, {
      authSubject: fx.memberASubject,
      communityId: fx.community1Id,
      soulMd: null,
    });
    expect(resetC1.soul_md).toBe("Keep answers crisp, practical, and direct across all my communities.");
    expect(resetC1.soul_is_default).toBe(true);

    // Resetting global Soul falls back to the starter Soul.
    const resetGlobal = await alice.mutation(api.userGuideSettings.saveMyGlobalGuideSettings, {
      authSubject: fx.memberASubject,
      soulMd: null,
    });
    expect(resetGlobal.soul_is_default).toBe(true);
    expect(resetGlobal.soul_md).toBe(DEFAULT_PERSONAL_SOUL_MD);
  });

  test("global allow-without-asking permissions apply across all communities and isolate per user", async () => {
    const t = convexTest(schema, modules);
    const fx = await createFixture(t, "allow");
    const alice = t.withIdentity({ subject: fx.memberASubject });
    const bob = t.withIdentity({ subject: fx.memberBSubject });

    await alice.mutation(api.userGuideSettings.saveMyGlobalGuideSettings, {
      authSubject: fx.memberASubject,
      allowPost: true,
      allowMessage: false,
    });

    const [c1Allowed, c2Allowed, internalPost, internalMsg, bobAllowed] = await Promise.all([
      alice.query(api.communityGuideQuestions.getGuideAlwaysAllowed, {
        authSubject: fx.memberASubject,
        communityId: fx.community1Id,
      }),
      alice.query(api.communityGuideQuestions.getGuideAlwaysAllowed, {
        authSubject: fx.memberASubject,
        communityId: fx.community2Id,
      }),
      t.query(internal.communityGuideQuestions.isAlwaysAllowedInternal, {
        communityId: fx.community2Id,
        userId: fx.memberAId,
        kind: "post",
      }),
      t.query(internal.communityGuideQuestions.isAlwaysAllowedInternal, {
        communityId: fx.community2Id,
        userId: fx.memberAId,
        kind: "message",
      }),
      bob.query(api.communityGuideQuestions.getGuideAlwaysAllowed, {
        authSubject: fx.memberBSubject,
        communityId: fx.community1Id,
      }),
    ]);

    expect(c1Allowed).toEqual({ post: true, message: false, post_global: true, message_global: false });
    expect(c2Allowed).toEqual({ post: true, message: false, post_global: true, message_global: false });
    expect(internalPost).toBe(true);
    expect(internalMsg).toBe(false);
    expect(bobAllowed).toEqual({ post: false, message: false, post_global: false, message_global: false });
  });

  test("global coachMuted pauses proactive check-ins for both members and builders across all communities", async () => {
    const t = convexTest(schema, modules);
    const fx = await createFixture(t, "mute");
    const alice = t.withIdentity({ subject: fx.memberASubject });
    const owner = t.withIdentity({ subject: fx.ownerSubject });
    const bob = t.withIdentity({ subject: fx.memberBSubject });

    await alice.mutation(api.userGuideSettings.saveMyGlobalGuideSettings, {
      authSubject: fx.memberASubject,
      coachMuted: true,
    });
    await owner.mutation(api.userGuideSettings.saveMyGlobalGuideSettings, {
      authSubject: fx.ownerSubject,
      coachMuted: true,
    });

    const [aliceC1, aliceC2, bobC1, ownerBuilderPref] = await Promise.all([
      alice.query(api.communityMemberCoach.getMyMemberCoachPreference, {
        authSubject: fx.memberASubject,
        communityId: fx.community1Id,
      }),
      alice.query(api.communityMemberCoach.getMyMemberCoachPreference, {
        authSubject: fx.memberASubject,
        communityId: fx.community2Id,
      }),
      bob.query(api.communityMemberCoach.getMyMemberCoachPreference, {
        authSubject: fx.memberBSubject,
        communityId: fx.community1Id,
      }),
      owner.query(api.communityBuilderHeartbeat.getMyBuilderHeartbeatPreference, {
        authSubject: fx.ownerSubject,
        communityId: fx.community1Id,
      }),
    ]);

    expect(aliceC1).toEqual({ coach_muted: true, community_muted: false, global_coach_muted: true });
    expect(aliceC2).toEqual({ coach_muted: true, community_muted: false, global_coach_muted: true });
    expect(bobC1).toEqual({ coach_muted: false, community_muted: false, global_coach_muted: false });
    expect(ownerBuilderPref).toEqual({ eligible: true, enabled: false, community_muted: false });

    // Trying to unmute per-community while globally muted keeps effective state honest.
    const afterLocalAttempt = await alice.mutation(api.communityMemberCoach.setMyMemberCoachPreference, {
      authSubject: fx.memberASubject,
      communityId: fx.community1Id,
      coachMuted: false,
    });
    expect(afterLocalAttempt).toEqual({ coach_muted: true, community_muted: false, global_coach_muted: true });
  });
});

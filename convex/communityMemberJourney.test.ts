/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { DEFAULT_JOURNEY_STAGES } from "../shared/communityMemberJourney";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts", "./_generated/**/*.*s"]);
const internalRefs = internal as any;
const DAY_MS = 24 * 60 * 60 * 1000;

async function seedJourneyFixture(t: ReturnType<typeof convexTest>, nowMs: number) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "journey-owner",
      displayName: "Neil",
      handle: "neil",
      normalizedHandle: "neil",
      email: "owner@example.com",
      emailVerifiedAt: nowMs,
      createdAt: nowMs - 30 * DAY_MS,
      updatedAt: nowMs,
    } as any);
    const modId = await ctx.db.insert("users", {
      authSubject: "journey-mod",
      displayName: "Maya",
      handle: "maya",
      normalizedHandle: "maya",
      email: "maya@example.com",
      emailVerifiedAt: nowMs,
      createdAt: nowMs - 20 * DAY_MS,
      updatedAt: nowMs,
    } as any);
    const memberId = await ctx.db.insert("users", {
      authSubject: "journey-member",
      displayName: "Sam",
      handle: "sam",
      normalizedHandle: "sam",
      email: "sam@example.com",
      emailVerifiedAt: nowMs,
      createdAt: nowMs - 20 * DAY_MS,
      updatedAt: nowMs,
    } as any);
    const quietMemberId = await ctx.db.insert("users", {
      authSubject: "journey-quiet",
      displayName: "Alex",
      handle: "alex",
      normalizedHandle: "alex",
      email: "alex@example.com",
      emailVerifiedAt: nowMs,
      createdAt: nowMs - 25 * DAY_MS,
      updatedAt: nowMs,
    } as any);
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "builders",
      name: "Builders",
      visibility: "unlisted",
      lifecycleStatus: "active",
      lifecycleGeneration: 0,
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "open",
      activeMemberCount: 4,
      createdAt: nowMs - 30 * DAY_MS,
      updatedAt: nowMs,
    } as any);
    await ctx.db.insert("communityMemberships", {
      communityId,
      userId: modId,
      role: "moderator",
      accessSource: "free_grant",
      state: "active",
      createdAt: nowMs - 15 * DAY_MS,
      updatedAt: nowMs,
    } as any);
    const memberMembershipId = await ctx.db.insert("communityMemberships", {
      communityId,
      userId: memberId,
      role: "member",
      accessSource: "free_grant",
      state: "active",
      createdAt: nowMs - 3 * DAY_MS,
      updatedAt: nowMs,
    } as any);
    const quietMembershipId = await ctx.db.insert("communityMemberships", {
      communityId,
      userId: quietMemberId,
      role: "member",
      accessSource: "free_grant",
      state: "active",
      createdAt: nowMs - 20 * DAY_MS,
      updatedAt: nowMs,
    } as any);
    await ctx.db.insert("communityPresence", {
      communityId,
      userId: memberId,
      lastSeenAt: nowMs - 2 * 60 * 60 * 1000,
      createdAt: nowMs - 3 * DAY_MS,
      updatedAt: nowMs,
    } as any);
    await ctx.db.insert("communityPresence", {
      communityId,
      userId: quietMemberId,
      lastSeenAt: nowMs - 18 * DAY_MS,
      createdAt: nowMs - 20 * DAY_MS,
      updatedAt: nowMs - 18 * DAY_MS,
    } as any);
    return { ownerId, modId, memberId, quietMemberId, communityId, memberMembershipId, quietMembershipId };
  });
}

describe("member journey board", () => {
  it("restricts reading and editing the board to community managers (owners/admins)", async () => {
    const t = convexTest(schema, modules);
    const f = await seedJourneyFixture(t, Date.now());

    const asMember = t.withIdentity({ subject: "journey-member" });
    const asMod = t.withIdentity({ subject: "journey-mod" });
    await expect(
      asMember.query(api.communityMemberJourney.getCommunityMemberJourneyBoard, { communityId: f.communityId }),
    ).rejects.toThrow();
    await expect(
      asMod.query(api.communityMemberJourney.getCommunityMemberJourneyBoard, { communityId: f.communityId }),
    ).rejects.toThrow();
    await expect(
      asMod.mutation(api.communityMemberJourney.updateMemberJourneyCard, {
        communityId: f.communityId,
        membershipId: f.memberMembershipId,
        stageKey: "active",
      }),
    ).rejects.toThrow();
  });

  it("returns default stages, derives health statuses, moves cards, saves founder instructions, and reassigns cards when a stage is removed", async () => {
    const t = convexTest(schema, modules);
    const nowMs = Date.now();
    const f = await seedJourneyFixture(t, nowMs);
    const asOwner = t.withIdentity({ subject: "journey-owner" });

    const initial = await asOwner.query(api.communityMemberJourney.getCommunityMemberJourneyBoard, {
      communityId: f.communityId,
    });
    expect(initial.stages.map((s) => s.key)).toEqual(DEFAULT_JOURNEY_STAGES.map((s) => s.key));
    const sam = initial.cards.find((c) => c.membership_id === String(f.memberMembershipId))!;
    const alex = initial.cards.find((c) => c.membership_id === String(f.quietMembershipId))!;
    expect(sam.stage_key).toBe("new");
    expect(sam.status).toBe("on_track");
    expect(alex.status).toBe("stuck"); // quiet 18 days

    // Move Sam to "active", pin status to "needs_you", and add a founder instruction for the Guide.
    await asOwner.mutation(api.communityMemberJourney.updateMemberJourneyCard, {
      communityId: f.communityId,
      membershipId: f.memberMembershipId,
      stageKey: "active",
      statusOverride: "needs_you",
      founderInstruction: "Ask if they shipped their first automation.",
    });

    const afterUpdate = await asOwner.query(api.communityMemberJourney.getCommunityMemberJourneyBoard, {
      communityId: f.communityId,
    });
    const samAfter = afterUpdate.cards.find((c) => c.membership_id === String(f.memberMembershipId))!;
    expect(samAfter.stage_key).toBe("active");
    expect(samAfter.status).toBe("needs_you");
    expect(samAfter.status_is_manual).toBe(true);
    expect(samAfter.founder_instruction).toBe("Ask if they shipped their first automation.");

    // Clear manual status override back to auto.
    await asOwner.mutation(api.communityMemberJourney.updateMemberJourneyCard, {
      communityId: f.communityId,
      membershipId: f.memberMembershipId,
      statusOverride: "auto",
    });
    const afterAuto = await asOwner.query(api.communityMemberJourney.getCommunityMemberJourneyBoard, {
      communityId: f.communityId,
    });
    const samAuto = afterAuto.cards.find((c) => c.membership_id === String(f.memberMembershipId))!;
    expect(samAuto.status).toBe("on_track");
    expect(samAuto.status_is_manual).toBe(false);

    // Customize stages and drop "active" — Sam's card must reassign cleanly to the first remaining stage.
    await asOwner.mutation(api.communityMemberJourney.saveCommunityJourneyStages, {
      communityId: f.communityId,
      stages: [
        { key: "onboarding", name: "Onboarding", goal: "Complete week 1 setup." },
        { key: "building", name: "Building", goal: "Launch first workflow." },
        { key: "scaling", name: "Scaling", goal: "Hit recurring milestones." },
      ],
    });
    const afterStages = await asOwner.query(api.communityMemberJourney.getCommunityMemberJourneyBoard, {
      communityId: f.communityId,
    });
    expect(afterStages.stages.map((s) => s.key)).toEqual(["onboarding", "building", "scaling"]);
    const samReassigned = afterStages.cards.find((c) => c.membership_id === String(f.memberMembershipId))!;
    expect(samReassigned.stage_key).toBe("onboarding");
    // Founder instruction persists across stage reassignment.
    expect(samReassigned.founder_instruction).toBe("Ask if they shipped their first automation.");
  });

  it("feeds the member's Journey stage goal and founder instruction into Member Coach candidates", async () => {
    const t = convexTest(schema, modules);
    const nowMs = Date.now();
    const f = await seedJourneyFixture(t, nowMs);
    const asOwner = t.withIdentity({ subject: "journey-owner" });

    await asOwner.mutation(api.communityMemberJourney.updateMemberJourneyCard, {
      communityId: f.communityId,
      membershipId: f.memberMembershipId,
      stageKey: "getting_started",
      founderInstruction: "Pause nudges until next Monday; Sam is on vacation.",
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("communityMemberCoachSettings", {
        communityId: f.communityId,
        enabled: true,
        autoReasons: [],
        createdAt: nowMs - 10 * DAY_MS,
        updatedAt: nowMs,
      } as any);
    });

    const prepared = await t.query(internalRefs.communityMemberCoach.readNextMemberCoachCandidateInternal, {
      communityId: f.communityId,
      autoReasons: [],
      nowMs,
    });
    expect(prepared.candidate).not.toBeNull();
    expect(prepared.candidate?.memberUserId).toBe(f.memberId);
    expect(prepared.candidate?.journeyStageName).toBe("Getting started");
    expect(prepared.candidate?.journeyStageGoal).toContain("early lessons");
    expect(prepared.candidate?.founderCardInstruction).toBe(
      "Pause nudges until next Monday; Sam is on vacation.",
    );
  });
});

/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";
import { requireNotTestMemberOutsideCommunity } from "./communityTestMemberCore";

const modules = import.meta.glob([
  "./auth.ts",
  "./authActor.ts",
  "./communityClients.ts",
  "./communityForms.ts",
  "./communityFormRequests.ts",
  "./communityMemberWorkflows.ts",
  "./communityResourceProgress.ts",
  "./communityAdmin.ts",
  "./communityLifecycle.ts",
  "./communityPublic.ts",
  "./communityTestMembers.ts",
  "./_generated/**/*.*s",
]);

const OWNER = "test-run-owner";
const STRANGER = "test-run-stranger";
const nowMs = 1_787_478_400_000;
const internalApi = internal as any;

afterEach(() => { vi.useRealTimers(); });

async function fixture(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", { authSubject: OWNER, displayName: "Ada Builder", createdAt: nowMs, updatedAt: nowMs });
    await ctx.db.insert("users", { authSubject: STRANGER, displayName: "Eve", createdAt: nowMs, updatedAt: nowMs });
    await ctx.db.insert("operatorRoles", { userId: ownerId, role: "owner", active: true, createdAt: nowMs, updatedAt: nowMs });
    const community = (slug: string) => ctx.db.insert("communities", {
      ownerId, slug, name: slug, lifecycleStatus: "active", visibility: "unlisted",
      inferenceFundingPolicy: "managed_required", entryPolicy: "open", activeMemberCount: 0, createdAt: nowMs, updatedAt: nowMs,
    });
    const communityId = await community("test-run");
    const otherCommunityId = await community("elsewhere");
    await ctx.db.insert("communityMemberWorkflows", {
      communityId, welcomeGate: true, welcomeGateEnabledAt: nowMs - 1, revision: 1, createdByUserId: ownerId, updatedByUserId: ownerId,
      milestones: [{ key: "onboarding", name: "Onboarding", automations: [{
        key: "welcome", trigger: { type: "member_joined" }, action: { key: "intake", type: "request_form", formKey: "intake" },
      }] }],
      createdAt: nowMs, updatedAt: nowMs,
    } as any);
    const formId = await ctx.db.insert("communityForms", {
      communityId, key: "intake", name: "Intake", questions: [], revision: 1, publishedRevision: 1, createdAt: nowMs, updatedAt: nowMs,
    });
    await ctx.db.insert("communityFormVersions", {
      communityId, formId, revision: 1, name: "Intake", questions: [], publishedBy: ownerId, publishedAt: nowMs,
    });
    return { ownerId, communityId, otherCommunityId };
  });
}

test("an owner goes through their community as a test member, then ends it", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  const owner = t.withIdentity({ subject: OWNER });

  const started = await owner.mutation(api.communityTestMembers.startTestMember, { communityId: f.communityId });
  expect(started.label).toBe("Test member 1");
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  // The owner's tab, sending the test member's subject, acts as the test member.
  const asTest = { authSubject: started.auth_subject };
  await expect(owner.query(api.communityTestMembers.getMyTestRun, asTest))
    .resolves.toMatchObject({ label: "Test member 1", community_slug: "test-run" });
  const forms = await owner.query(api.communityFormRequests.listMyRequests, { ...asTest, communityId: f.communityId }) as any[];
  expect(forms.map((row) => row.name)).toEqual(["Intake"]);

  // The record is tagged so owners and agents can tell it from real members.
  const clients = await owner.query(api.communityClients.listClientsForOwner, { communityId: f.communityId });
  expect(clients.clients.map((row: any) => [row.name, row.is_test])).toEqual([["Test member 1", true]]);

  const timeline = await owner.query(api.communityClients.getClientTimeline, { communityId: f.communityId, membershipId: started.membership_id });
  const said = timeline.entries.map((entry: any) => entry.summary);
  expect(said).toContain("Joined as a test member");
  expect(said).toContain("Workflow sent the Intake form (Onboarding)");

  // Nobody else can use the subject, and the test member can't manage or leave its community.
  await expect(t.withIdentity({ subject: STRANGER }).query(api.communityTestMembers.getMyTestRun, asTest))
    .rejects.toThrow("auth_subject_mismatch");
  await expect(owner.query(api.communityTestMembers.listTestMembers, { ...asTest, communityId: f.communityId }))
    .rejects.toThrow("test_member_cannot_manage");
  await expect(t.run(async (ctx) => {
    const row = (await ctx.db.query("communityTestMembers").first())!;
    await requireNotTestMemberOutsideCommunity(ctx, row.userId, f.communityId);
    await requireNotTestMemberOutsideCommunity(ctx, row.userId, f.otherCommunityId);
  })).rejects.toThrow("test_member_outside_community");
  await expect(owner.query(internalApi.authActor.resolveAuthenticatedActorInternal, asTest))
    .rejects.toThrow("test_member_unavailable_here");

  const listed = await owner.query(api.communityTestMembers.listTestMembers, { communityId: f.communityId });
  expect(listed.test_members).toMatchObject([{ label: "Test member 1", mine: true, auth_subject: started.auth_subject }]);
  // Another manager sees the run but not the subject to act as it.
  expect(await t.run(async (ctx) => {
    const strangerId = (await ctx.db.query("users").withIndex("by_authSubject", (q) => q.eq("authSubject", STRANGER)).first())!._id;
    await ctx.db.insert("communityMemberships", { communityId: f.communityId, userId: strangerId, role: "admin",
      accessSource: "manual_grant", active: true, activationSequence: 1, activatedAt: nowMs, createdAt: nowMs, updatedAt: nowMs });
    return true;
  })).toBe(true);
  const adminView = await t.withIdentity({ subject: STRANGER }).query(api.communityTestMembers.listTestMembers, { communityId: f.communityId });
  expect(adminView.test_members[0]).toMatchObject({ mine: false, auth_subject: null });

  // A pod seat the run picked up is given back when it ends.
  const seatId = await t.run(async (ctx) => {
    const row = (await ctx.db.query("communityTestMembers").first())!;
    const channelId = await ctx.db.insert("communityChannels", { communityId: f.communityId, slug: "pod", name: "Pod",
      accessMode: "restricted", postingPolicy: "members", status: "active", position: 1, createdByUserId: row.ownerUserId, createdAt: nowMs, updatedAt: nowMs } as any);
    return ctx.db.insert("communityChannelParticipants", { communityId: f.communityId, channelId,
      principalKey: `user:${row.userId}`, status: "active", createdByUserId: row.ownerUserId, createdAt: nowMs, updatedAt: nowMs });
  });
  await owner.mutation(api.communityTestMembers.endTestMember, { communityId: f.communityId, testMemberId: started.id as any });
  expect((await t.run(async (ctx) => ctx.db.get(seatId)))?.status).toBe("revoked");
  await expect(owner.query(api.communityTestMembers.getMyTestRun, asTest)).rejects.toThrow("test_member_ended");
  const left = await t.run(async (ctx) => ({
    memberships: (await ctx.db.query("communityMemberships").withIndex("by_community", (q) => q.eq("communityId", f.communityId)).collect()).length,
    requests: (await ctx.db.query("communityFormRequests").collect()).length,
  }));
  expect(left).toEqual({ memberships: 1, requests: 0 });

  // A fresh run starts over as a new member.
  const again = await owner.mutation(api.communityTestMembers.startTestMember, { communityId: f.communityId });
  expect(again.label).toBe("Test member 2");
});

test("only managers start test runs, and a test member can't create a community", async () => {
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  await expect(t.withIdentity({ subject: STRANGER }).mutation(api.communityTestMembers.startTestMember, { communityId: f.communityId }))
    .rejects.toThrow();
  const started = await t.withIdentity({ subject: OWNER }).mutation(api.communityTestMembers.startTestMember, { communityId: f.communityId });
  await expect(t.withIdentity({ subject: OWNER }).mutation(api.communityLifecycle.createCommunity as any, {
    authSubject: started.auth_subject, name: "Sock puppet", slug: "sock-puppet",
  })).rejects.toThrow("test_member_outside_community");
});

test("a test run can start at a later stage, show its sequence and skip a timed wait", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  await t.run(async (ctx) => {
    const workflow = (await ctx.db.query("communityMemberWorkflows").first())!;
    await ctx.db.patch(workflow._id, { milestones: [...workflow.milestones, { key: "nurture", name: "Nurture", automations: [{
      key: "tier", timerGeneration: "g1", trigger: { type: "milestone_elapsed", delayMinutes: 1440 },
      action: { key: "set-tier", type: "set_client_property", propertyKey: "tier", value: "Warm" },
    }] }] } as any);
    await ctx.db.insert("communityClientProperties", { communityId: f.communityId, key: "tier", name: "Tier", type: "text",
      options: [], position: 0, createdByUserId: f.ownerId, createdAt: nowMs, updatedAt: nowMs } as any);
  });
  const owner = t.withIdentity({ subject: OWNER });
  const started = await owner.mutation(api.communityTestMembers.startTestMember, { communityId: f.communityId, milestoneKey: "nurture" });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const args = { communityId: f.communityId, testMemberId: started.id as any };

  let sequence = await owner.query(api.communityTestMembers.getTestRunSequence, args);
  expect(sequence.stages.map((stage: any) => [stage.name, stage.is_current])).toEqual([["Onboarding", false], ["Nurture", true]]);
  // Started past the welcome stage: its join form was never sent.
  expect(sequence.stages[0].steps[0]).toMatchObject({ when: "When they join", does: "Send the Intake form", status: "skipped" });
  expect(sequence.stages[1].steps[0]).toMatchObject({ when: "1 day after they reach this stage", does: "Set tier to Warm", status: "scheduled" });
  await expect(owner.query(api.communityFormRequests.listMyRequests, { authSubject: started.auth_subject, communityId: f.communityId }))
    .resolves.toEqual([]);

  await expect(owner.mutation(api.communityTestMembers.runTestMemberTimedStepsNow, args)).resolves.toEqual({ ran: 1 });
  sequence = await owner.query(api.communityTestMembers.getTestRunSequence, args);
  expect(sequence.stages[1].steps[0].status).toBe("done");
  const value = await t.run(async (ctx) => (await ctx.db.query("communityClientValues").first())?.value);
  expect(value).toBe("Warm");

  // Only the manager who started a run can drive it.
  await expect(t.withIdentity({ subject: STRANGER }).mutation(api.communityTestMembers.runTestMemberTimedStepsNow, args)).rejects.toThrow();
});

test("ending a run archives the private channel a Workflow opened for it", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(nowMs + 60_000);
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  const owner = t.withIdentity({ subject: OWNER });
  const started = await owner.mutation(api.communityTestMembers.startTestMember, { communityId: f.communityId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const channels = await t.run(async (ctx) => {
    const channel = (name: string, createdAt: number) => ctx.db.insert("communityChannels", {
      communityId: f.communityId, slug: name, name, accessMode: "restricted", postingPolicy: "members",
      status: "active", position: 1, createdAt, updatedAt: createdAt,
    } as any);
    const opened = await channel("test-member-1", nowMs + 120_000);
    const older = await channel("older", nowMs - 1);
    const user = await ctx.db.query("users").withIndex("by_authSubject", (q: any) => q.eq("authSubject", started.auth_subject)).unique();
    const membership = await ctx.db.query("communityMemberships")
      .withIndex("by_community_user", (q: any) => q.eq("communityId", f.communityId).eq("userId", user!._id)).unique();
    await ctx.db.patch(membership!._id, { serviceChannelId: opened } as any);
    return { opened, older };
  });
  await owner.mutation(api.communityTestMembers.endTestMember, { communityId: f.communityId, testMemberId: started.id as any });
  const after = await t.run(async (ctx) => [(await ctx.db.get(channels.opened))!.status, (await ctx.db.get(channels.older))!.status]);
  expect(after).toEqual(["archived", "active"]);
});

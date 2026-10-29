/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { activateCommunityMembershipCore } from "./communityMembershipLifecycle";

const modules = import.meta.glob(["./communityMemberWorkflows.ts", "./communityWorkflowRunHistory.ts", "./communityAgentServeWorker.ts", "./memberOntology.ts", "./_generated/**/*.*s"]);
const epoch = 1_800_000_000_000;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(epoch); });
afterEach(() => vi.useRealTimers());

test("Run history lists a member's automation runs for managers only", async () => {
  const t = convexTest(schema, modules);
  const f = await t.run(async ctx => {
    const ownerId = await ctx.db.insert("users", { authSubject: "runs-owner", createdAt: epoch, updatedAt: epoch });
    const userId = await ctx.db.insert("users", { authSubject: "runs-member", displayName: "Ava", createdAt: epoch, updatedAt: epoch });
    await ctx.db.insert("operatorRoles", { userId: ownerId, role: "owner", active: true, createdAt: epoch, updatedAt: epoch });
    const communityId = await ctx.db.insert("communities", { ownerId, name: "Runs", slug: "runs", lifecycleStatus: "active", visibility: "unlisted", inferenceFundingPolicy: "managed_required", entryPolicy: "approval", createdAt: epoch, updatedAt: epoch });
    return { ownerId, userId, communityId };
  });
  const owner = t.withIdentity({ subject: "runs-owner" });
  const first = await owner.mutation(api.communityMemberWorkflows.createBuilderWorkflowMilestone, { communityId: f.communityId, expectedRevision: 0, name: "Getting started" });
  await owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, { communityId: f.communityId, expectedRevision: 1,
    milestoneKey: first.milestone.key, name: "Getting started",
    automations: [{ trigger: { type: "milestone_elapsed" as const, delayMinutes: 1 }, action: { type: "prompt_agent" as const, prompt: "Say hi" } }] });
  await t.run(ctx => activateCommunityMembershipCore({ ctx, communityId: f.communityId, userId: f.userId, accessSource: "manual_grant", activationReason: "test", nowMs: epoch }));

  expect((await owner.query(api.communityWorkflowRunHistory.listBuilderWorkflowRunHistory, { communityId: f.communityId })).runs).toEqual([]);
  vi.setSystemTime(epoch + 60_000);
  await t.mutation(internal.communityMemberWorkflows.processDueMilestoneTimersInternal, {});

  const history = await owner.query(api.communityWorkflowRunHistory.listBuilderWorkflowRunHistory, { communityId: f.communityId });
  expect(history.runs).toHaveLength(1);
  expect(history.runs[0]).toMatchObject({ member_name: "Ava", is_test: false, milestone_name: "Getting started", status: "failed" });
  // No private room is set up for Ava, so the agent step fails and says why.
  expect(history.runs[0].steps.map((step) => step.action_type)).toEqual(["prompt_agent"]);
  expect(history.runs[0].steps[0].error_code).toBeTruthy();
  expect((await owner.query(api.communityWorkflowRunHistory.listBuilderWorkflowRunHistory, { communityId: f.communityId, filter: "failed" })).runs).toHaveLength(1);
  expect((await owner.query(api.communityWorkflowRunHistory.listBuilderWorkflowRunHistory, { communityId: f.communityId, filter: "tests" })).runs).toEqual([]);

  const member = t.withIdentity({ subject: "runs-member" });
  await expect(member.query(api.communityWorkflowRunHistory.listBuilderWorkflowRunHistory, { communityId: f.communityId })).rejects.toThrow();
});

test("Tests shows a new test member's runs even when the community has many ended test runs", async () => {
  const t = convexTest(schema, modules);
  const f = await t.run(async ctx => {
    const ownerId = await ctx.db.insert("users", { authSubject: "tests-owner", createdAt: epoch, updatedAt: epoch });
    await ctx.db.insert("operatorRoles", { userId: ownerId, role: "owner", active: true, createdAt: epoch, updatedAt: epoch });
    const communityId = await ctx.db.insert("communities", { ownerId, name: "Tests", slug: "tests", lifecycleStatus: "active", visibility: "unlisted", inferenceFundingPolicy: "managed_required", entryPolicy: "approval", createdAt: epoch, updatedAt: epoch });
    for (let n = 1; n <= 60; n += 1) {
      const oldId = await ctx.db.insert("users", { authSubject: `old-tester-${n}`, createdAt: epoch, updatedAt: epoch });
      await ctx.db.insert("communityTestMembers", { communityId, userId: oldId, authSubject: `old-tester-${n}`, ownerUserId: ownerId, ownerAuthSubject: "tests-owner",
        label: `Test member ${n}`, number: n, createdAt: epoch - 100_000 + n, endedAt: epoch - 50_000 });
    }
    const userId = await ctx.db.insert("users", { authSubject: "new-tester", createdAt: epoch, updatedAt: epoch });
    await ctx.db.insert("communityTestMembers", { communityId, userId, authSubject: "new-tester", ownerUserId: ownerId, ownerAuthSubject: "tests-owner",
      label: "Test member 61", number: 61, createdAt: epoch });
    return { communityId, userId };
  });
  const owner = t.withIdentity({ subject: "tests-owner" });
  const first = await owner.mutation(api.communityMemberWorkflows.createBuilderWorkflowMilestone, { communityId: f.communityId, expectedRevision: 0, name: "Start" });
  await owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, { communityId: f.communityId, expectedRevision: 1,
    milestoneKey: first.milestone.key, name: "Start",
    automations: [{ trigger: { type: "milestone_elapsed" as const, delayMinutes: 1 }, action: { type: "prompt_agent" as const, prompt: "Say hi" } }] });
  await t.run(ctx => activateCommunityMembershipCore({ ctx, communityId: f.communityId, userId: f.userId, accessSource: "manual_grant", activationReason: "test", nowMs: epoch }));
  vi.setSystemTime(epoch + 60_000);
  await t.mutation(internal.communityMemberWorkflows.processDueMilestoneTimersInternal, {});

  const tests = await owner.query(api.communityWorkflowRunHistory.listBuilderWorkflowRunHistory, { communityId: f.communityId, filter: "tests" });
  expect(tests.runs).toHaveLength(1);
  expect(tests.runs[0]).toMatchObject({ member_name: "Test member 61", is_test: true });
});

test("a stage keeps its colour until the owner changes or clears it, and refuses colours outside the palette", async () => {
  const t = convexTest(schema, modules);
  const communityId = await t.run(async ctx => {
    const ownerId = await ctx.db.insert("users", { authSubject: "color-owner", createdAt: epoch, updatedAt: epoch });
    await ctx.db.insert("operatorRoles", { userId: ownerId, role: "owner", active: true, createdAt: epoch, updatedAt: epoch });
    return ctx.db.insert("communities", { ownerId, name: "Colours", slug: "colours", lifecycleStatus: "active", visibility: "unlisted", inferenceFundingPolicy: "managed_required", entryPolicy: "approval", createdAt: epoch, updatedAt: epoch });
  });
  const owner = t.withIdentity({ subject: "color-owner" });
  const created = await owner.mutation(api.communityMemberWorkflows.createBuilderWorkflowMilestone, { communityId, expectedRevision: 0, name: "Start", color: "green" });
  expect(created.milestone.color).toBe("green");
  const kept = await owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, { communityId, expectedRevision: 1,
    milestoneKey: created.milestone.key, name: "Start", automations: [] });
  expect(kept.milestone?.color).toBe("green");
  const cleared = await owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, { communityId, expectedRevision: 2,
    milestoneKey: created.milestone.key, name: "Start", automations: [], color: "none" });
  expect(cleared.milestone?.color).toBeUndefined();
  await expect(owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, { communityId, expectedRevision: 3,
    milestoneKey: created.milestone.key, name: "Start", automations: [], color: "#ff00ff" })).rejects.toThrow("community_member_workflow_stage_color_invalid");
});

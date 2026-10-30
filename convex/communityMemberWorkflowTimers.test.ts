/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { activateCommunityMembershipCore } from "./communityMembershipLifecycle";

const modules = import.meta.glob(["./communityMemberWorkflows.ts", "./_generated/**/*.*s"]);
const epoch = 1_800_000_000_000;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(epoch); });
afterEach(() => vi.useRealTimers());

async function setup() {
  const t = convexTest(schema, modules);
  const f = await t.run(async ctx => {
    const ownerId = await ctx.db.insert("users", { authSubject: "timer-owner", displayName: "Owner", createdAt: epoch, updatedAt: epoch });
    const userId = await ctx.db.insert("users", { authSubject: "timer-member", displayName: "Member", createdAt: epoch, updatedAt: epoch });
    const communityId = await ctx.db.insert("communities", { ownerId, name: "Timers", slug: "timers", lifecycleStatus: "active", visibility: "unlisted", inferenceFundingPolicy: "managed_required", entryPolicy: "approval", createdAt: epoch, updatedAt: epoch });
    return { userId, communityId };
  });
  const owner = t.withIdentity({ subject: "timer-owner" });
  const first = await owner.mutation(api.communityMemberWorkflows.createBuilderWorkflowMilestone, { communityId: f.communityId, expectedRevision: 0, name: "New" });
  await owner.mutation(api.communityMemberWorkflows.createBuilderWorkflowMilestone, { communityId: f.communityId, expectedRevision: 1, name: "Next" });
  const rule = { trigger: { type: "milestone_elapsed" as const, delayMinutes: 10 }, action: { type: "prompt_agent" as const, prompt: "Check in with this member" } };
  const updated = await owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, { communityId: f.communityId, expectedRevision: 2, milestoneKey: first.milestone.key, name: "New", automations: [rule] });
  const membership = await t.run(ctx => activateCommunityMembershipCore({ ctx, communityId: f.communityId, userId: f.userId, accessSource: "manual_grant", activationReason: "test", nowMs: Date.now() }));
  const rows = () => t.run(async ctx => ({ timers: await ctx.db.query("communityMemberWorkflowTimers").collect(), runs: await ctx.db.query("communityMemberWorkflowRuns").collect(), transitions: await ctx.db.query("communityMemberWorkflowTransitions").collect() }));
  const process = () => t.mutation(internal.communityMemberWorkflows.processDueMilestoneTimersInternal, {});
  return { t, f, owner, first, updated, membership, rows, process };
}

test("a timed action runs once at its due time and never moves the member by itself", async () => {
  const s = await setup();
  expect((await s.rows()).timers).toHaveLength(1);
  vi.setSystemTime(epoch + 599_999);
  await s.process();
  expect((await s.rows()).runs).toHaveLength(0);
  vi.setSystemTime(epoch + 600_000);
  await s.process();
  await s.process();
  const rows = await s.rows();
  expect(rows.timers[0].status).toBe("consumed");
  expect(rows.runs).toHaveLength(1);
  expect(rows.runs[0].triggerType).toBe("milestone_elapsed");
  expect(rows.transitions).toHaveLength(0);
});

test("duration edits postpone an existing pending action", async () => {
  const s = await setup();
  const rule = s.updated.milestone.automations[0];
  await s.owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, { communityId: s.f.communityId, expectedRevision: 3, milestoneKey: s.first.milestone.key, name: "New", automations: [{ key: rule.key, trigger: { type: "milestone_elapsed", delayMinutes: 20 }, action: rule.action }] });
  vi.setSystemTime(epoch + 600_000);
  await s.process();
  expect((await s.rows()).runs).toHaveLength(0);
  expect((await s.rows()).timers[0].dueAt).toBe(epoch + 1_200_000);
  vi.setSystemTime(epoch + 1_200_000);
  await s.process();
  expect((await s.rows()).runs).toHaveLength(1);
});

test("revoked membership makes a pending timed action obsolete", async () => {
  const s = await setup();
  await s.t.run(async ctx => { await ctx.db.patch(s.membership.membership._id, { active: false }); });
  vi.setSystemTime(epoch + 600_000);
  await s.process();
  const rows = await s.rows();
  expect(rows.timers[0].status).toBe("obsolete");
  expect(rows.runs).toHaveLength(0);
});

test("a zero wait runs the moment they reach the stage", async () => {
  const s = await setup();
  const rule = s.updated.milestone.automations[0];
  await s.owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, { communityId: s.f.communityId, expectedRevision: 3, milestoneKey: s.first.milestone.key, name: "New", automations: [{ key: rule.key, trigger: { type: "milestone_elapsed", delayMinutes: 0 }, action: rule.action }] });
  const userId = await s.t.run(ctx => ctx.db.insert("users", { authSubject: "timer-arrival", displayName: "Arrival", createdAt: epoch, updatedAt: epoch }));
  await s.t.run(ctx => activateCommunityMembershipCore({ ctx, communityId: s.f.communityId, userId, accessSource: "manual_grant", activationReason: "test", nowMs: Date.now() }));
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  const rows = await s.rows();
  const arrival = rows.timers.filter(timer => timer.dueAt === epoch && timer.membershipId !== s.membership.membership._id);
  expect(arrival).toHaveLength(1);
  expect(arrival[0].status).toBe("consumed");
  expect(rows.runs.filter(run => run.membershipId !== s.membership.membership._id)).toHaveLength(1);
});

test("a nudge still needs a real wait", async () => {
  const s = await setup();
  await expect(s.owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, { communityId: s.f.communityId, expectedRevision: 3, milestoneKey: s.first.milestone.key, name: "New", automations: [{ trigger: { type: "milestone_elapsed", delayMinutes: 0, nudge: true }, action: { type: "prompt_agent", prompt: "Check in" } }] })).rejects.toThrow("community_member_workflow_delay_invalid");
});

test.each([-1, 0.5, 525601])("invalid duration %s is rejected for a timed action", async delayMinutes => {
  const s = await setup();
  await expect(s.owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, { communityId: s.f.communityId, expectedRevision: 3, milestoneKey: s.first.milestone.key, name: "New", automations: [{ trigger: { type: "milestone_elapsed", delayMinutes }, action: { type: "prompt_agent", prompt: "Check in" } }] })).rejects.toThrow("community_member_workflow_delay_invalid");
});

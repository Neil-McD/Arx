/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { activateCommunityMembershipCore } from "./communityMembershipLifecycle";
import { enrollWorkflowMilestoneTimers } from "./communityMemberWorkflowTimerCore";

const modules = import.meta.glob(["./communityMemberWorkflows.ts", "./_generated/**/*.*s"]);
const epoch = 1_800_000_000_000;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(epoch); });
afterEach(() => vi.useRealTimers());

async function setup(delayMinutes = 10) {
  const t = convexTest(schema, modules);
  const f = await t.run(async ctx => {
    const ownerId = await ctx.db.insert("users", { authSubject: "timer-owner", displayName: "Owner", createdAt: epoch, updatedAt: epoch });
    const userId = await ctx.db.insert("users", { authSubject: "timer-member", displayName: "Member", createdAt: epoch, updatedAt: epoch });
    const communityId = await ctx.db.insert("communities", { ownerId, name: "Timers", slug: "timers", lifecycleStatus: "active", visibility: "unlisted", inferenceFundingPolicy: "managed_required", entryPolicy: "approval", createdAt: epoch, updatedAt: epoch });
    return { ownerId, userId, communityId };
  });
  const owner = t.withIdentity({ subject: "timer-owner" });
  const first = await owner.mutation(api.communityMemberWorkflows.createBuilderWorkflowMilestone, { communityId: f.communityId, expectedRevision: 0, name: "New" });
  await owner.mutation(api.communityMemberWorkflows.createBuilderWorkflowMilestone, { communityId: f.communityId, expectedRevision: 1, name: "Next" });
  await owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, { communityId: f.communityId, expectedRevision: 2, milestoneKey: first.milestone.key, name: "New", automations: [{ trigger: { type: "milestone_elapsed", delayMinutes }, action: { type: "move_member", destination: "next_or_complete" } }] });
  const activate = () => t.run(ctx => activateCommunityMembershipCore({ ctx, communityId: f.communityId, userId: f.userId, accessSource: "manual_grant", activationReason: "test", nowMs: Date.now() }));
  const process = () => t.mutation(internal.communityMemberWorkflows.processDueMilestoneTimersInternal, {});
  const rows = () => t.run(async ctx => ({
    timers: await ctx.db.query("communityMemberWorkflowTimers").collect(),
    runs: await ctx.db.query("communityMemberWorkflowRuns").collect(),
    transitions: await ctx.db.query("communityMemberWorkflowTransitions").collect(),
    states: await ctx.db.query("communityMemberWorkflowMemberMilestones").collect(),
  }));
  const edit = async (delay: number | null) => {
    const workflow = (await t.run(ctx => ctx.db.query("communityMemberWorkflows").first()))!;
    const rule = workflow.milestones[0].automations[0];
    await owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
      communityId: f.communityId, expectedRevision: workflow.revision, milestoneKey: first.milestone.key, name: "Renamed",
      automations: delay === null ? [] : [{ key: rule.key, trigger: { type: "milestone_elapsed", delayMinutes: delay }, action: rule.action }],
    });
  };
  return { t, f, owner, first, activate, process, rows, edit };
}

test("real activation enrolls once; never early; duplicate dispatch moves once without an agent", async () => {
  const s = await setup();
  expect((await s.rows()).timers).toHaveLength(0);
  await s.activate(); await s.activate();
  expect((await s.rows()).timers).toHaveLength(1);
  expect((await s.rows()).states).toHaveLength(0);
  vi.setSystemTime(epoch + 599999); await s.process();
  expect((await s.rows()).transitions).toHaveLength(0);
  vi.setSystemTime(epoch + 600000);
  await Promise.all([s.process(), s.process()]);
  const result = await s.rows();
  expect(result.transitions).toHaveLength(1);
  expect(result.runs).toHaveLength(1);
  expect(result.runs[0]).toMatchObject({ triggerType: "milestone_elapsed", triggerSnapshot: { type: "milestone_elapsed", delayMinutes: 10 }, status: "finished" });
  expect(result.runs[0].triggerReceiptRef).toBe(`workflow-timer:${result.timers[0]._id}`);
  expect(result.timers[0].status).toBe("consumed");
  expect(await s.t.run(ctx => ctx.db.query("communityAgentServeRequests").collect())).toHaveLength(0);
});

test("multiple time requirements accumulate without a second scheduler", async () => {
  const s = await setup(10);
  const workflow = (await s.t.run(ctx => ctx.db.query("communityMemberWorkflows").first()))!;
  const rule = workflow.milestones[0].automations[0];
  await s.owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
    communityId: s.f.communityId, expectedRevision: workflow.revision, milestoneKey: s.first.milestone.key, name: "New",
    automations: [{ key: rule.key, trigger: rule.trigger, action: rule.action },
      { trigger: { type: "milestone_elapsed", delayMinutes: 20 }, action: { type: "move_member", destination: "next_or_complete" } }],
  });
  await s.activate();
  expect((await s.rows()).timers).toHaveLength(2);
  vi.setSystemTime(epoch + 600000); await s.process(); await s.process();
  expect((await s.rows()).transitions).toHaveLength(0);
  expect((await s.rows()).states[0].requirementEvidence).toHaveLength(1);
  vi.setSystemTime(epoch + 1200000); await s.process(); await s.process();
  expect((await s.rows()).transitions).toHaveLength(1);
  expect((await s.rows()).transitions[0].requirementEvidence).toHaveLength(2);
});

test.each(["revoked", "archived", "restored", "moved", "completed", "reactivated"])("%s members cannot execute stale work", async kind => {
  const s = await setup();
  const { membership } = await s.activate();
  await s.t.run(async ctx => {
    if (kind === "revoked") await ctx.db.patch(membership._id as any, { active: false });
    if (kind === "reactivated") await ctx.db.patch(membership._id as any, { activationSequence: 2 });
    if (kind === "archived") await ctx.db.patch(s.f.communityId, { lifecycleStatus: "archived" });
    if (kind === "restored") await ctx.db.patch(s.f.communityId, { lifecycleGeneration: 2 });
    if (kind === "moved" || kind === "completed") {
      const w = (await ctx.db.query("communityMemberWorkflows").first())!;
      await ctx.db.insert("communityMemberWorkflowMemberMilestones", { workflowId: w._id, membershipId: membership._id as any,
        currentMilestoneKey: w.milestones[kind === "moved" ? 1 : 0].key, milestoneEnteredAt: epoch, transitionSeq: 1,
        ...(kind === "completed" ? { completedAt: epoch + 1 } : {}), createdAt: epoch, updatedAt: epoch });
    }
  });
  vi.setSystemTime(epoch + 600000); await s.process();
  expect((await s.rows()).transitions).toHaveLength(0);
  expect((await s.rows()).timers[0].status).toBe("obsolete");
});

test("lengthening a duration is honored before background refresh", async () => {
  const s = await setup(); await s.activate(); await s.edit(20);
  vi.setSystemTime(epoch + 600000); await s.process();
  expect((await s.rows()).transitions).toHaveLength(0);
  expect((await s.rows()).timers[0].dueAt).toBe(epoch + 1200000);
  await s.t.finishAllScheduledFunctions(() => vi.runAllTimers());
  vi.setSystemTime(epoch + 1200000); await s.process();
  expect((await s.rows()).transitions).toHaveLength(1);
});

test("shortening refreshes existing pending timers without enrolling other members", async () => {
  const s = await setup(); await s.activate(); await s.edit(2);
  await s.t.finishAllScheduledFunctions(() => vi.runAllTimers());
  expect((await s.rows()).timers[0].dueAt).toBe(epoch + 120000);
  vi.setSystemTime(epoch + 120000); await s.process();
  expect((await s.rows()).transitions).toHaveLength(1);
});

test("deletion is effective before refresh and unrelated edits never restart the clock", async () => {
  const s = await setup(); await s.activate(); await s.edit(10);
  await s.t.finishAllScheduledFunctions(() => vi.runAllTimers());
  expect((await s.rows()).timers[0].dueAt).toBe(epoch + 600000);
  await s.edit(null);
  vi.setSystemTime(epoch + 600000); await s.process();
  expect((await s.rows()).transitions).toHaveLength(0);
  await s.t.finishAllScheduledFunctions(() => vi.runAllTimers());
});

test("late processing starts the next timer at actual entry, not historical due time", async () => {
  const s = await setup();
  const w = (await s.t.run(ctx => ctx.db.query("communityMemberWorkflows").first()))!;
  await s.owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, { communityId: s.f.communityId, expectedRevision: w.revision,
    milestoneKey: w.milestones[1].key, name: "Next", automations: [{ trigger: { type: "milestone_elapsed", delayMinutes: 1 }, action: { type: "move_member", destination: "next_or_complete" } }] });
  await s.activate(); vi.setSystemTime(epoch + 86400000); await s.process(); await s.process();
  expect((await s.rows()).transitions).toHaveLength(1);
  expect((await s.rows()).timers.find(t => t.status === "pending")?.dueAt).toBe(epoch + 86460000);
  vi.setSystemTime(epoch + 86460000); await s.process();
  expect((await s.rows()).transitions[1].completedWorkflow).toBe(true);
});

test("persisted milestone reentry has a distinct sequence even at the same timestamp", async () => {
  const s = await setup(); const { membership } = await s.activate();
  await s.t.run(async ctx => {
    const w = (await ctx.db.query("communityMemberWorkflows").first())!;
    await ctx.db.insert("communityMemberWorkflowMemberMilestones", { workflowId: w._id, membershipId: membership._id as any, currentMilestoneKey: w.milestones[0].key, milestoneEnteredAt: epoch, transitionSeq: 2, createdAt: epoch, updatedAt: epoch });
    await enrollWorkflowMilestoneTimers({ ctx, membership, nowMs: epoch });
  });
  vi.setSystemTime(epoch + 600000); await s.process();
  expect((await s.rows()).transitions).toHaveLength(1);
  expect((await s.rows()).timers.map(t => t.status).sort()).toEqual(["consumed", "obsolete"]);
});

test.each([0, -1, 0.5, 525601])("invalid duration %s rejected", async delay => {
  await expect(setup(delay)).rejects.toThrow("community_member_workflow_delay_invalid");
});

test("timer prompts can be configured without provisioning member destinations", async () => {
  const s = await setup();
  await expect(s.owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, { communityId: s.f.communityId, expectedRevision: 3,
    milestoneKey: s.first.milestone.key, name: "New", automations: [{ trigger: { type: "milestone_elapsed", delayMinutes: 1 }, action: { type: "prompt_agent", prompt: "No destination" } }] }))
    .resolves.toBeDefined();
});

test("adding a timer after entry does not backfill an existing member", async () => {
  const s = await setup(); await s.edit(null);
  await s.t.finishAllScheduledFunctions(() => vi.runAllTimers());
  await s.activate();
  const w = (await s.t.run(ctx => ctx.db.query("communityMemberWorkflows").first()))!;
  await s.owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, { communityId: s.f.communityId, expectedRevision: w.revision,
    milestoneKey: s.first.milestone.key, name: "New", automations: [{ trigger: { type: "milestone_elapsed", delayMinutes: 1 }, action: { type: "move_member", destination: "next_or_complete" } }] });
  vi.setSystemTime(epoch + 600000); await s.process();
  expect((await s.rows()).timers).toHaveLength(0);
  expect((await s.rows()).transitions).toHaveLength(0);
});

test("converting away and back cannot revive an old timer even before refresh", async () => {
  const s = await setup(); await s.activate();
  const w = (await s.t.run(ctx => ctx.db.query("communityMemberWorkflows").first()))!;
  const { timerGeneration: _, ...rule } = w.milestones[0].automations[0];
  await s.owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, { communityId: s.f.communityId, expectedRevision: w.revision,
    milestoneKey: s.first.milestone.key, name: "New", automations: [{ ...rule, trigger: { type: "member_contributed" } }] });
  await s.edit(1);
  vi.setSystemTime(epoch + 600000); await s.process();
  expect((await s.rows()).timers[0].status).toBe("obsolete");
  expect((await s.rows()).transitions).toHaveLength(0);
  await s.t.finishAllScheduledFunctions(() => vi.runAllTimers());
});

test("refresh and dispatch drain bounded pages without losing occurrences", async () => {
  const s = await setup();
  await s.t.run(async ctx => {
    for (let i = 0; i < 61; i++) {
      const userId = await ctx.db.insert("users", { authSubject: `batch-${i}`, createdAt: epoch, updatedAt: epoch });
      await activateCommunityMembershipCore({ ctx, communityId: s.f.communityId, userId, accessSource: "manual_grant", activationReason: "batch", nowMs: epoch });
    }
  });
  await s.edit(1);
  await s.t.finishAllScheduledFunctions(() => vi.runAllTimers());
  expect((await s.rows()).timers.every(t => t.dueAt === epoch + 60000)).toBe(true);
  vi.setSystemTime(epoch + 60000);
  expect(await s.process()).toEqual({ processed: 25 });
  await s.t.finishAllScheduledFunctions(() => vi.runAllTimers());
  expect((await s.rows()).transitions).toHaveLength(61);
  expect((await s.rows()).timers.every(t => t.status === "consumed")).toBe(true);
});

/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { CommunityMemberWorkflowAutomation } from "../shared/communityMemberWorkflow";
import { activateCommunityMembershipCore } from "./communityMembershipLifecycle";
import { resolveMemberServiceChannel } from "./communityMemberServiceChannelCore";
import { getCommunityChannelCapabilities, resolveCommunityChannelActor } from "./communityChannelAccess";
import { createActiveCommunityChannel } from "./communityChannelCore";
import { setChannelParticipantCore } from "./communityChannelParticipants";
import { bindMemberServiceChannel } from "./communityMemberServiceChannelCore";
import { readWorkflowActionProgress } from "./communityWorkflowCompletionCore";
const modules = import.meta.glob(["./*.ts", "./_generated/**/*.*s"]);
const joinHandler = internal.communityMemberWorkflows.handleFirstMemberJoinInternal;
const reconcileCompletion = internal.communityMemberWorkflows.reconcileCompletedWorkflowActionsInternal;

test.each(["", "Member has demonstrated readiness"])("human approval holds completed work with goal %s", async goal => {
  const f = await fixture();
  await f.t.run(async ctx => {
    const w = (await ctx.db.get(f.workflowId))!;
    await ctx.db.patch(w._id, { milestones: [{ ...w.milestones[0], goal, requireHumanApproval: true }] });
  });
  await f.t.mutation(joinHandler, f.job);
  const run = (await f.t.run(ctx => ctx.db.query("communityMemberWorkflowRuns").first()))!;
  await f.t.mutation(reconcileCompletion, { workflowRunId: run._id });
  expect(await progress(f)).toMatchObject({ all_actions_complete: true });
  expect(await f.t.run(ctx => ctx.db.query("communityMemberWorkflowTransitions").collect())).toHaveLength(0);
  const args = approvalArgs(f);
  await expect(f.t.withIdentity({ subject: "join-member" }).mutation(api.communityMemberWorkflows.approveBuilderMemberMilestone, args)).rejects.toThrow();
  const owner = f.t.withIdentity({ subject: "join-owner" });
  await owner.mutation(api.communityMemberWorkflows.approveBuilderMemberMilestone, args);
  await expect(owner.mutation(api.communityMemberWorkflows.approveBuilderMemberMilestone, args)).rejects.toThrow();
  const rows = await f.t.run(ctx => ctx.db.query("communityMemberWorkflowTransitions").collect());
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ completedWorkflow: true, approval: { actorUserId: f.ownerId, goal, activationSequence: 1 } });
  expect(rows[0].completionEvidence).toHaveLength(1);
  expect(rows[0].forcedByUserId).toBeUndefined();
});

test.each(["incomplete", "unchecked", "revision", "activation", "visit"])("normal approval rejects %s", async kind => {
  const f = await fixture();
  await f.t.run(async ctx => {
    const w = (await ctx.db.get(f.workflowId))!;
    await ctx.db.patch(w._id, { milestones: [{ ...w.milestones[0], requireHumanApproval: kind !== "unchecked" }] });
  });
  if (kind !== "incomplete") await f.t.mutation(joinHandler, f.job);
  const args = approvalArgs(f);
  if (kind === "revision") args.expectedWorkflowRevision = 0;
  if (kind === "activation") args.expectedActivationSequence = 0;
  if (kind === "visit") args.expectedTransitionSeq = 99;
  await expect(f.t.withIdentity({ subject: "join-owner" }).mutation(api.communityMemberWorkflows.approveBuilderMemberMilestone, args)).rejects.toThrow();
  expect(await f.t.run(ctx => ctx.db.query("communityMemberWorkflowTransitions").collect())).toHaveLength(0);
});

function approvalArgs(f: Awaited<ReturnType<typeof fixture>>) {
  return { communityId: f.communityId, membershipId: f.membershipId, expectedWorkflowId: f.workflowId,
    expectedWorkflowRevision: 1, expectedMilestoneKey: "new", expectedMilestoneEnteredAt: f.now,
    expectedActivationSequence: 1, expectedTransitionSeq: 0 };
}

test("enabling human approval preserves completed work without scheduling movement", async () => {
  const f = await fixture();
  await f.t.mutation(joinHandler, f.job);
  const before = await progress(f);
  const jobsBefore = await f.t.run(ctx => ctx.db.system.query("_scheduled_functions").collect());
  await f.t.withIdentity({ subject: "join-owner" }).mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
    communityId: f.communityId, expectedRevision: 1, milestoneKey: "new", name: "New", requireHumanApproval: true,
    automations: [{ key: "join", trigger: { type: "member_joined" }, action: { key: "room", type: "create_service_channel" } }],
  });
  expect(await progress(f)).toEqual(before);
  expect(await f.t.run(ctx => ctx.db.system.query("_scheduled_functions").collect())).toHaveLength(jobsBefore.length);
  expect(await f.t.run(ctx => ctx.db.query("communityMemberWorkflowTransitions").collect())).toHaveLength(0);
});

test("human approval rejects legacy automatic movement configuration", async () => {
  const f = await fixture();
  await expect(f.t.withIdentity({ subject: "join-owner" }).mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
    communityId: f.communityId, expectedRevision: 1, milestoneKey: "new", name: "New", requireHumanApproval: true,
    automations: [{ key: "join", trigger: { type: "member_contributed" }, action: { key: "room", type: "move_member", destination: "next_or_complete" } }],
  })).rejects.toThrow("Remove automatic movement");
});

test("last proven action advances once and never skips the empty next stage", async () => {
  const f = await fixture("both");
  await f.t.run(async ctx => {
    const w = (await ctx.db.get(f.workflowId))!;
    await ctx.db.patch(w._id, { milestones: [...w.milestones, { key: "next", name: "Next", automations: [] }] });
  });
  await f.t.mutation(joinHandler, f.job);
  const runs = await f.t.run(ctx => ctx.db.query("communityMemberWorkflowRuns").collect());
  await f.t.mutation(reconcileCompletion, { workflowRunId: runs[0]._id });
  expect(await f.t.run(ctx => ctx.db.query("communityMemberWorkflowTransitions").collect())).toHaveLength(0);
  const request = (await f.t.run(ctx => ctx.db.query("communityFormRequests").first()))!;
  await f.t.withIdentity({ subject: "join-member" }).mutation(api.communityFormRequests.saveMyAnswers,
    { communityId: f.communityId, requestId: request._id, expectedRevision: 0, answers: {}, submit: true });
  const jobs = await f.t.run(ctx => ctx.db.system.query("_scheduled_functions").collect());
  expect(jobs.some(job => job.name.includes("reconcileCompletedWorkflowActionsInternal")
    && (job.args[0] as any).workflowRunId === request.workflowRunId)).toBe(true);
  await Promise.all(runs.map(run => f.t.mutation(reconcileCompletion, { workflowRunId: run._id })));
  for (const run of runs) await f.t.mutation(reconcileCompletion, { workflowRunId: run._id });
  const transitions = await f.t.run(ctx => ctx.db.query("communityMemberWorkflowTransitions").collect());
  expect(transitions).toHaveLength(1);
  expect(transitions[0]).toMatchObject({ toMilestoneKey: "next", seq: 1, completedWorkflow: false });
  expect(transitions[0].completionEvidence).toHaveLength(2);
});

test("blank-goal final stage completes once", async () => {
  const f = await fixture();
  await f.t.mutation(joinHandler, f.job);
  const run = (await f.t.run(ctx => ctx.db.query("communityMemberWorkflowRuns").first()))!;
  await f.t.mutation(reconcileCompletion, { workflowRunId: run._id });
  await f.t.mutation(reconcileCompletion, { workflowRunId: run._id });
  const rows = await f.t.run(ctx => ctx.db.query("communityMemberWorkflowTransitions").collect());
  expect(rows).toHaveLength(1);
  expect(rows[0].completedWorkflow).toBe(true);
});

test.each(["goal", "legacy", "empty", "activation", "visit", "definition", "failed", "truncated", "human_moved"])("automatic movement stays closed for %s", async kind => {
  const f = await fixture();
  await f.t.mutation(joinHandler, f.job);
  const run = (await f.t.run(ctx => ctx.db.query("communityMemberWorkflowRuns").first()))!;
  await f.t.run(async ctx => {
    const w = (await ctx.db.get(f.workflowId))!;
    const m = w.milestones[0];
    if (kind === "goal") m.goal = "A human or agent must judge this.";
    if (kind === "legacy") m.automations.push({ key: "legacy", trigger: { type: "member_contributed" }, action: { key: "move", type: "move_member", destination: "next_or_complete" } });
    if (kind === "empty") m.automations = [];
    if (kind === "definition") m.automations[0].action.key = "different";
    await ctx.db.patch(w._id, { milestones: [m] });
    if (kind === "activation") await ctx.db.patch(f.membershipId, { activationSequence: 2 });
    if (kind === "visit") await ctx.db.patch(run._id, { transitionSeq: 99 });
    if (kind === "failed") await ctx.db.patch(run._id, { status: "failed" });
    if (kind === "truncated") {
      const { _id, _creationTime, ...copy } = run;
      for (let i = 0; i < 257; i++) await ctx.db.insert("communityMemberWorkflowRuns", { ...copy, createdAt: run.createdAt + i + 1 });
    }
    if (kind === "human_moved") await ctx.db.insert("communityMemberWorkflowMemberMilestones", {
      workflowId: w._id, membershipId: f.membershipId, currentMilestoneKey: "new", milestoneEnteredAt: f.now,
      transitionSeq: 1, completedAt: f.now + 1, createdAt: f.now, updatedAt: f.now + 1 });
  });
  await f.t.mutation(reconcileCompletion, { workflowRunId: run._id });
  expect(await f.t.run(ctx => ctx.db.query("communityMemberWorkflowTransitions").collect())).toHaveLength(0);
});

async function progress(f: Awaited<ReturnType<typeof fixture>>) {
  return f.t.run(async ctx => {
    const workflow = (await ctx.db.get(f.workflowId))!;
    const membership = (await ctx.db.get(f.membershipId))!;
    return readWorkflowActionProgress(ctx, { workflow, membership, milestone: workflow.milestones[0],
      milestoneEnteredAt: f.now, transitionSeq: 0 });
  });
}

test("completion verifies channel and form outcomes without writes or movement", async () => {
  const f = await fixture("both");
  await f.t.mutation(joinHandler, f.job);
  const before = await f.t.run(ctx => ctx.db.query("communityMemberWorkflowRuns").collect());
  expect(await progress(f)).toMatchObject({ all_actions_complete: false, actions: [
    { action_type: "create_service_channel", status: "complete" }, { action_type: "request_form", status: "pending" },
  ] });
  expect(await f.t.run(ctx => ctx.db.query("communityMemberWorkflowRuns").collect())).toEqual(before);
  expect(await f.t.run(ctx => ctx.db.query("communityMemberWorkflowTransitions").collect())).toHaveLength(0);
  await f.t.mutation(joinHandler, f.job);
  expect((await progress(f)).actions).toHaveLength(2);
  await f.t.run(async ctx => {
    const member = (await ctx.db.get(f.membershipId))!;
    await ctx.db.patch(member.serviceChannelId!, { status: "archived" });
  });
  expect((await progress(f)).actions[0].status).toBe("unavailable");
});

test.each(["activation", "visit", "revision", "historical", "definition", "trigger", "context"])("completion rejects %s evidence", async kind => {
  const f = await fixture();
  await f.t.mutation(joinHandler, f.job);
  await f.t.run(async ctx => {
    const run = (await ctx.db.query("communityMemberWorkflowRuns").first())!;
    if (kind === "activation") await ctx.db.patch(run._id, { activationSequence: 999 });
    if (kind === "visit") await ctx.db.patch(run._id, { transitionSeq: 999 });
    if (kind === "revision") await ctx.db.patch(run._id, { workflowRevision: 999 });
    if (kind === "historical") await ctx.db.patch(run._id, { activationSequence: undefined });
    if (kind === "definition") await ctx.db.patch(run._id, { actionSnapshot: { key: "changed", type: "create_service_channel" } });
    if (kind === "trigger") await ctx.db.patch(run._id, { triggerSnapshot: { type: "member_contributed" } });
    if (kind === "context") await ctx.db.patch(run._id, { milestoneContextSnapshot: { instructions: "Different instructions", goal: "" } });
  });
  expect(await progress(f)).toMatchObject({ all_actions_complete: false, actions: [{ status: "unavailable" }] });
});

test("adding an unrelated action preserves existing channel and submitted-form proof", async () => {
  const f = await fixture("both");
  await f.t.mutation(joinHandler, f.job);
  await f.t.run(async ctx => {
    const request = (await ctx.db.query("communityFormRequests").first())!;
    await ctx.db.patch(request._id, { status: "submitted", submittedAt: f.now + 1, answers: {} });
  });
  const before = await progress(f);
  expect(before.all_actions_complete).toBe(true);
  const workflow = (await f.t.run(ctx => ctx.db.get(f.workflowId)))!;
  await f.t.withIdentity({ subject: "join-owner" }).mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
    communityId: f.communityId, expectedRevision: workflow.revision,
    milestoneKey: workflow.milestones[0].key, name: "Renamed stage",
    automations: [...workflow.milestones[0].automations, {
      key: "", trigger: { type: "member_contributed" },
      action: { key: "", type: "prompt_agent", prompt: "Introduce yourself." },
    }],
  });
  const after = await progress(f);
  expect(after.actions.slice(0, 2)).toEqual(before.actions);
  expect(after.actions[2].status).toBe("unavailable");
  expect(after.all_actions_complete).toBe(false);
  expect(await f.t.run(ctx => ctx.db.query("communityMemberWorkflowRuns").collect())).toHaveLength(2);
  expect(await f.t.run(ctx => ctx.db.query("communityMemberWorkflowTransitions").collect())).toHaveLength(0);
  await f.t.run(async ctx => {
    const current = (await ctx.db.get(f.workflowId))!;
    await ctx.db.patch(current._id, { revision: current.revision + 1,
      milestones: [...current.milestones, { key: "unrelated", name: "Unrelated stage", automations: [] }] });
  });
  expect((await progress(f)).actions.slice(0, 2)).toEqual(before.actions);
});

test("submitted forms require valid pinned answers, and progress stays manager-only", async () => {
  const f = await fixture("form");
  await f.t.mutation(joinHandler, f.job);
  await f.t.run(async ctx => {
    const request = (await ctx.db.query("communityFormRequests").first())!;
    await ctx.db.patch(request._id, { status: "submitted", submittedAt: f.now + 1, answers: {} });
  });
  expect(await progress(f)).toMatchObject({ all_actions_complete: true, actions: [{ status: "complete" }] });
  const query = api.communityMemberWorkflows.getBuilderWorkflowMemberSuccessDossier;
  const args = { communityId: f.communityId, membershipId: f.membershipId };
  await expect(f.t.withIdentity({ subject: "join-member" }).query(query, args)).rejects.toThrow();
  const builder = await f.t.withIdentity({ subject: "join-owner" }).query(query, args);
  expect(builder.workflow?.action_progress?.all_actions_complete).toBe(true);
  await f.t.run(async ctx => {
    await ctx.db.patch(f.versionId, { questions: [{ key: "required", type: "short_text", title: "Required", description: "", options: [], required: true }] });
  });
  expect((await progress(f)).actions[0].status).toBe("unavailable");
});

test("an older receipt for a different form does not prove the current form action", async () => {
  const f = await fixture("form");
  await f.t.mutation(joinHandler, f.job);
  await f.t.run(async ctx => {
    const workflow = (await ctx.db.get(f.workflowId))!;
    const run = (await ctx.db.query("communityMemberWorkflowRuns").first())!;
    if (run.actionSnapshot.type !== "request_form") throw new Error("expected form fixture");
    await ctx.db.patch(workflow._id, { revision: workflow.revision + 1 });
    await ctx.db.patch(run._id, { actionSnapshot: { ...run.actionSnapshot, formKey: "different-form" } });
  });
  expect((await progress(f)).actions[0].status).toBe("unavailable");
});

test.each(["failed", "running"] as const)("action progress retains %s outcome", async status => {
  const f = await fixture();
  await f.t.mutation(joinHandler, f.job);
  await f.t.run(async ctx => {
    const run = (await ctx.db.query("communityMemberWorkflowRuns").first())!;
    await ctx.db.patch(run._id, { status, actionResult: undefined });
  });
  expect((await progress(f)).actions[0].status).toBe(status);
});

test("empty actions and truncated history never fabricate completion", async () => {
  const f = await fixture();
  expect((await progress(f)).actions[0].status).toBe("unavailable");
  await f.t.mutation(joinHandler, f.job);
  await f.t.run(async ctx => {
    const { _id, _creationTime, ...run } = (await ctx.db.query("communityMemberWorkflowRuns").first())!;
    for (let i = 1; i <= 257; i++) await ctx.db.insert("communityMemberWorkflowRuns", { ...run,
      automationKey: "other", createdAt: run.createdAt + i, triggerReceiptRef: `other-${i}` });
  });
  expect(await progress(f)).toMatchObject({ scan_truncated: true, all_actions_complete: false, actions: [{ status: "unavailable" }] });
  await f.t.run(async ctx => {
    const workflow = (await ctx.db.get(f.workflowId))!;
    await ctx.db.patch(workflow._id, { milestones: [{ ...workflow.milestones[0], automations: [] }] });
  });
  expect(await progress(f)).toEqual({ actions: [], all_actions_complete: false, scan_truncated: false });
});

async function fixture(mode: "room" | "form" | "both" = "room", reverse = false) {
  const t = convexTest(schema, modules);
  const f = await t.run(async ctx => {
    const now = Date.now();
    const ownerId = await ctx.db.insert("users", { authSubject: "join-owner", displayName: "Owner", createdAt: now, updatedAt: now });
    const memberId = await ctx.db.insert("users", { authSubject: "join-member", displayName: "Member", createdAt: now, updatedAt: now });
    await ctx.db.insert("operatorRoles", { userId: ownerId, role: "owner", active: true, createdAt: now, updatedAt: now });
    const communityId = await ctx.db.insert("communities", { ownerId, slug: "join-workflow", name: "Join workflow", lifecycleStatus: "active",
      visibility: "unlisted", inferenceFundingPolicy: "managed_required", entryPolicy: "approval", createdAt: now, updatedAt: now });
    const formId = await ctx.db.insert("communityForms", { communityId, key: "intake", name: "Intake", questions: [], revision: 1, publishedRevision: 1, createdAt: now, updatedAt: now });
    const versionId = await ctx.db.insert("communityFormVersions", { communityId, formId, revision: 1, name: "Intake", questions: [], publishedBy: ownerId, publishedAt: now });
    const automations: CommunityMemberWorkflowAutomation[] = [];
    if (mode !== "form") automations.push({ key: "join", trigger: { type: "member_joined" }, action: { key: "room", type: "create_service_channel" } });
    if (mode !== "room") automations.push({ key: "intake", trigger: { type: "member_joined" }, action: { key: "intake", type: "request_form", formKey: "intake" } });
    if (reverse) automations.reverse();
    const workflowId = await ctx.db.insert("communityMemberWorkflows", { communityId, revision: 1,
      milestones: [{ key: "new", name: "New", automations }],
      createdByUserId: ownerId, updatedByUserId: ownerId, createdAt: now, updatedAt: now });
    return { now, ownerId, memberId, communityId, workflowId, formId, versionId };
  });
  const activation = await t.run(ctx => activateCommunityMembershipCore({ ctx, communityId: f.communityId, userId: f.memberId,
    accessSource: "manual_grant", activationReason: "test", nowMs: f.now }));
  const membershipId = activation.membership._id as Id<"communityMemberships">;
  const job = { membershipId, workflowId: f.workflowId, workflowRevision: 1, lifecycleGeneration: 0, serviceChannelRevision: 0, activatedAt: f.now };
  return { t, ...f, membershipId, job };
}

test("first activation schedules configured job; sign-in/active grant does not schedule again", async () => {
  const f = await fixture();
  await f.t.run(async ctx => {
    const jobs = await ctx.db.system.query("_scheduled_functions").collect();
    expect(jobs.filter(j => j.name.includes("handleFirstMemberJoinInternal"))).toHaveLength(1);
    await activateCommunityMembershipCore({ ctx, communityId: f.communityId, userId: f.memberId, accessSource: "manual_grant", activationReason: "again", nowMs: f.now + 1 });
    expect((await ctx.db.system.query("_scheduled_functions").collect()).filter(j => j.name.includes("handleFirstMemberJoinInternal"))).toHaveLength(1);
  });
});

test("join creates one private room, activation grants, binding and receipt; replay cannot duplicate", async () => {
  const f = await fixture();
  expect((await f.t.mutation(joinHandler, f.job)).status).toBe("service_channel_ready");
  expect((await f.t.mutation(joinHandler, f.job)).status).toBe("already_executed");
  await f.t.run(async ctx => {
    const membership = (await ctx.db.get(f.membershipId))! as any;
    expect((await resolveMemberServiceChannel({ ctx, membership })).status).toBe("available");
    const rooms = await ctx.db.query("communityChannels").collect();
    expect(rooms.filter(c => c.accessMode === "restricted")).toHaveLength(1);
    expect(await ctx.db.query("communityChannelParticipants").collect()).toHaveLength(2);
    expect(await ctx.db.query("communityMemberWorkflowRuns").collect()).toHaveLength(1);
    expect(await ctx.db.query("communityMemberWorkflowTransitions").collect()).toHaveLength(0);
    expect(await ctx.db.query("communityAgentServeRequests").collect()).toHaveLength(0);
    const outsiderId = await ctx.db.insert("users", { authSubject: "outsider", createdAt: f.now, updatedAt: f.now });
    await ctx.db.insert("communityMemberships", { communityId: f.communityId, userId: outsiderId, role: "member", active: true, activationSequence: 1, accessSource: "manual_grant", createdAt: f.now, updatedAt: f.now });
    const actor = await resolveCommunityChannelActor({ ctx, communityId: f.communityId, userId: outsiderId });
    expect((await getCommunityChannelCapabilities({ ctx, actor, channel: (await ctx.db.get(membership.serviceChannelId))! as any })).canRead).toBe(false);
  });
});

test.each([
  { account: "Google name", profile: "Community name", expected: "Community name" },
  { account: "Account name", profile: undefined, expected: "Account name" },
  { account: undefined, profile: undefined, expected: "Member" },
  { account: "General", profile: undefined, expected: "General (2)" },
  { account: "A".repeat(80), profile: undefined, expected: "A".repeat(48) },
])("generated room uses canonical name: $expected", async ({ account, profile, expected }) => {
  const f = await fixture();
  await f.t.run(async ctx => {
    await ctx.db.patch(f.memberId, { displayName: account });
    if (profile) await ctx.db.insert("userProfileDetails", { userId: f.memberId, displayName: profile, createdAt: f.now, updatedAt: f.now });
  });
  expect((await f.t.mutation(joinHandler, f.job)).status).toBe("service_channel_ready");
  await f.t.run(async ctx => {
    const membership = (await ctx.db.get(f.membershipId))!;
    const channel = (await ctx.db.get(membership.serviceChannelId!))!;
    expect(channel.name).toBe(expected);
    expect(channel.name).not.toContain(f.membershipId);
  });
});

test("same-name members get distinct readable rooms; replay preserves builder renames", async () => {
  const f = await fixture();
  await f.t.mutation(joinHandler, f.job);
  const second = await f.t.run(async ctx => {
    const userId = await ctx.db.insert("users", { authSubject: "second-member", displayName: "member", createdAt: f.now, updatedAt: f.now });
    const { membership } = await activateCommunityMembershipCore({ ctx, communityId: f.communityId, userId,
      accessSource: "manual_grant", activationReason: "test", nowMs: f.now });
    return membership._id as Id<"communityMemberships">;
  });
  expect((await f.t.mutation(joinHandler, { ...f.job, membershipId: second })).status).toBe("service_channel_ready");
  await f.t.run(async ctx => {
    const first = (await ctx.db.get(f.membershipId))!;
    const other = (await ctx.db.get(second))!;
    expect(first.serviceChannelId).not.toBe(other.serviceChannelId);
    expect((await ctx.db.get(other.serviceChannelId!))!.name).toBe("member (2)");
    await ctx.db.patch(first.serviceChannelId!, { name: "Coaching room", normalizedName: "coaching room" });
  });
  expect((await f.t.mutation(joinHandler, f.job)).status).toBe("already_executed");
  await f.t.run(async ctx => {
    const first = (await ctx.db.get(f.membershipId))!;
    expect((await ctx.db.get(first.serviceChannelId!))!.name).toBe("Coaching room");
    expect((await ctx.db.query("communityChannels").collect()).filter(c => c.accessMode === "restricted")).toHaveLength(2);
  });
});

test.each(["revision", "inactive", "reactivated", "archived", "moved"])("queued join fails closed after %s", async change => {
  const f = await fixture();
  await f.t.run(async ctx => {
    if (change === "revision") await ctx.db.patch(f.workflowId, { revision: 2 });
    if (change === "inactive") await ctx.db.patch(f.membershipId, { active: false });
    if (change === "reactivated") await ctx.db.patch(f.membershipId, { activationSequence: 2 });
    if (change === "archived") await ctx.db.patch(f.communityId, { lifecycleStatus: "archived" as any });
    if (change === "moved") await ctx.db.insert("communityMemberWorkflowMemberMilestones", { workflowId: f.workflowId, membershipId: f.membershipId,
      currentMilestoneKey: "new", milestoneEnteredAt: f.now, transitionSeq: 1, createdAt: f.now, updatedAt: f.now });
  });
  expect((await f.t.mutation(joinHandler, f.job)).status).toBe("stale");
  expect(await f.t.run(ctx => ctx.db.query("communityChannelParticipants").collect())).toHaveLength(0);
});

test("capacity failure keeps membership active and leaves no partial General, room or grants", async () => {
  const f = await fixture();
  await f.t.run(async ctx => {
    for (let i = 0; i < 100; i++) await ctx.db.insert("communityChannels", { communityId: f.communityId,
      name: `Private ${i}`, normalizedName: `private ${i}`, slug: `private-${i}`, accessMode: "restricted", postingPolicy: "members", status: "active", position: i + 1, createdAt: f.now, updatedAt: f.now });
  });
  expect((await f.t.mutation(joinHandler, f.job)).status).toBe("action_failed");
  await f.t.run(async ctx => {
    expect((await ctx.db.get(f.membershipId))!.active).toBe(true);
    expect(await ctx.db.query("communityChannels").collect()).toHaveLength(100);
    expect(await ctx.db.query("communityChannelParticipants").collect()).toHaveLength(0);
    const run = (await ctx.db.query("communityMemberWorkflowRuns").first())!;
    expect(run.status).toBe("failed");
    expect(run.errorCode).toContain("limit");
  });
});

test("builder-cleared assignment is not replaced", async () => {
  const f = await fixture();
  await f.t.run(ctx => ctx.db.patch(f.membershipId, { serviceChannelRevision: 1 }));
  expect((await f.t.mutation(joinHandler, f.job)).status).toBe("action_failed");
  expect(await f.t.run(ctx => ctx.db.query("communityChannels").collect())).toHaveLength(0);
});

test("rejoin does not reopen the existing room or enqueue another join", async () => {
  const f = await fixture();
  await f.t.mutation(joinHandler, f.job);
  await f.t.run(async ctx => {
    await ctx.db.patch(f.membershipId, { active: false });
    await activateCommunityMembershipCore({ ctx, communityId: f.communityId, userId: f.memberId, accessSource: "manual_grant", activationReason: "rejoin", nowMs: f.now + 1 });
    expect((await resolveMemberServiceChannel({ ctx, membership: (await ctx.db.get(f.membershipId))! as any })).status).toBe("unavailable");
    expect((await ctx.db.system.query("_scheduled_functions").collect()).filter(j => j.name.includes("handleFirstMemberJoinInternal"))).toHaveLength(1);
  });
});

test("builder config only accepts one join/private-room rule in the first milestone", async () => {
  const f = await fixture(), builder = f.t.withIdentity({ subject: "join-owner" });
  const base = { communityId: f.communityId, expectedRevision: 1, milestoneKey: "new", name: "New" };
  await expect(builder.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, { ...base,
    automations: [{ trigger: { type: "member_joined" }, action: { type: "prompt_agent", prompt: "hello" } }] })).rejects.toThrow("workflow_join_action_invalid");
  await expect(builder.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, { ...base,
    automations: [1, 2].map(() => ({ trigger: { type: "member_joined" as const }, action: { type: "create_service_channel" as const } })) })).rejects.toThrow("workflow_join_action_duplicate");
});

test("a late member-access failure rolls back room and grants, retaining only failed receipt", async () => {
  const f = await fixture();
  await f.t.run(ctx => ctx.db.insert("communityBlocks", { communityId: f.communityId, userId: f.memberId,
    createdByUserId: f.ownerId, createdAt: f.now, updatedAt: f.now }));
  expect((await f.t.mutation(joinHandler, f.job)).status).toBe("action_failed");
  await f.t.run(async ctx => {
    expect(await ctx.db.query("communityChannels").collect()).toHaveLength(0);
    expect(await ctx.db.query("communityChannelParticipants").collect()).toHaveLength(0);
    expect((await ctx.db.get(f.membershipId))!.serviceChannelId).toBeUndefined();
    expect((await ctx.db.query("communityMemberWorkflowRuns").first())!.status).toBe("failed");
  });
});

test.each(["valid", "revoked", "archived", "shared", "other_client"])("existing binding is reused only with intact single-client access: %s", async condition => {
  const f = await fixture();
  await f.t.run(async ctx => {
    const channel = await createActiveCommunityChannel({ ctx, communityId: f.communityId, createdByUserId: f.ownerId, name: "Existing service", accessMode: "restricted" });
    for (const target of [{ kind: "member" as const, userId: f.memberId }, { kind: "community_agent" as const }]) {
      await setChannelParticipantCore(ctx, { communityId: f.communityId, channelId: channel._id, createdByUserId: f.ownerId, target, active: true });
    }
    await bindMemberServiceChannel({ ctx, membership: (await ctx.db.get(f.membershipId))! as any, channelId: channel._id, expectedRevision: 0 });
    if (condition === "revoked") await setChannelParticipantCore(ctx, { communityId: f.communityId, channelId: channel._id, createdByUserId: f.ownerId, target: { kind: "community_agent" }, active: false });
    if (condition === "archived") await ctx.db.patch(channel._id, { status: "archived" });
    if (condition === "shared") await ctx.db.patch(channel._id, { accessMode: "all_members" });
    if (condition === "other_client") {
      const userId = await ctx.db.insert("users", { authSubject: "other-client", createdAt: f.now, updatedAt: f.now });
      await ctx.db.insert("communityMemberships", { communityId: f.communityId, userId, role: "member", active: true, activationSequence: 1, accessSource: "manual_grant", createdAt: f.now, updatedAt: f.now });
      await setChannelParticipantCore(ctx, { communityId: f.communityId, channelId: channel._id, createdByUserId: f.ownerId, target: { kind: "member", userId }, active: true });
    }
  });
  const before = await f.t.run(async ctx => ({ channels: await ctx.db.query("communityChannels").collect(), grants: await ctx.db.query("communityChannelParticipants").collect() }));
  expect((await f.t.mutation(joinHandler, { ...f.job, serviceChannelRevision: 1 })).status).toBe(condition === "valid" ? "service_channel_ready" : "action_failed");
  const after = await f.t.run(async ctx => ({ channels: await ctx.db.query("communityChannels").collect(), grants: await ctx.db.query("communityChannelParticipants").collect() }));
  expect(after).toEqual(before);
});

test("concurrent duplicate join dispatch creates one room and run", async () => {
  const f = await fixture();
  await Promise.all([f.t.mutation(joinHandler, f.job), f.t.mutation(joinHandler, f.job)]);
  await f.t.run(async ctx => {
    expect((await ctx.db.query("communityChannels").collect()).filter(c => c.accessMode === "restricted")).toHaveLength(1);
    expect(await ctx.db.query("communityMemberWorkflowRuns").collect()).toHaveLength(1);
  });
});

test("form-only join needs no channel, pins version, and replays without another request", async () => {
  const f = await fixture("form");
  expect((await f.t.mutation(joinHandler, f.job)).status).toBe("form_requested");
  await f.t.run(ctx => ctx.db.patch(f.formId, { publishedRevision: 2 }));
  expect((await f.t.mutation(joinHandler, f.job)).status).toBe("already_executed");
  await f.t.run(async ctx => {
    const requests = await ctx.db.query("communityFormRequests").collect();
    expect(requests).toHaveLength(1);
    expect(requests[0].versionId).toBe(f.versionId);
    expect(requests[0].membershipId).toBe(f.membershipId);
    expect(await ctx.db.query("communityChannels").collect()).toHaveLength(0);
    expect(await ctx.db.query("communityMemberWorkflowTransitions").collect()).toHaveLength(0);
    expect(await ctx.db.query("communityAgentServeRequests").collect()).toHaveLength(0);
  });
});

test.each([false, true])("both join actions are replay-safe in either order (reverse=%s)", async reverse => {
  const f = await fixture("both", reverse);
  await Promise.all([f.t.mutation(joinHandler, f.job), f.t.mutation(joinHandler, f.job)]);
  await f.t.run(async ctx => {
    expect(await ctx.db.query("communityFormRequests").collect()).toHaveLength(1);
    expect((await ctx.db.query("communityChannels").collect()).filter(c => c.accessMode === "restricted")).toHaveLength(1);
    expect((await ctx.db.query("communityMemberWorkflowRuns").collect()).map(r => r.status)).toEqual(["finished", "finished"]);
  });
});

test.each([false, true])("missing form does not roll back room (reverse=%s)", async reverse => {
  const f = await fixture("both", reverse);
  await f.t.run(ctx => ctx.db.delete(f.versionId));
  await f.t.mutation(joinHandler, f.job);
  await f.t.run(async ctx => {
    expect((await ctx.db.query("communityChannels").collect()).filter(c => c.accessMode === "restricted")).toHaveLength(1);
    expect(await ctx.db.query("communityFormRequests").collect()).toHaveLength(0);
    const runs = await ctx.db.query("communityMemberWorkflowRuns").collect();
    expect(runs.find(r => r.actionSnapshot.type === "request_form")!.status).toBe("failed");
    expect(runs.find(r => r.actionSnapshot.type === "create_service_channel")!.status).toBe("finished");
  });
});

test.each([false, true])("room assignment conflict does not prevent form (reverse=%s)", async reverse => {
  const f = await fixture("both", reverse);
  await f.t.run(ctx => ctx.db.patch(f.membershipId, { serviceChannelRevision: 1 }));
  await f.t.mutation(joinHandler, f.job);
  await f.t.run(async ctx => {
    expect(await ctx.db.query("communityFormRequests").collect()).toHaveLength(1);
    expect(await ctx.db.query("communityChannels").collect()).toHaveLength(0);
    const runs = await ctx.db.query("communityMemberWorkflowRuns").collect();
    expect(runs.find(r => r.actionSnapshot.type === "request_form")!.status).toBe("finished");
    expect(runs.find(r => r.actionSnapshot.type === "create_service_channel")!.status).toBe("failed");
  });
});

test("duplicate join form configuration is rejected; different forms remain possible", async () => {
  const f = await fixture();
  await expect(f.t.withIdentity({ subject: "join-owner" }).mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone,
    { communityId: f.communityId, milestoneKey: "new", name: "New", expectedRevision: 1,
      automations: [1, 2].map(() => ({ trigger: { type: "member_joined" as const }, action: { type: "request_form" as const, formKey: "intake" } })) })).rejects.toThrow("workflow_join_action_duplicate");
});

test.each([false, true])("private capacity failure still assigns the form (reverse=%s)", async reverse => {
  const f = await fixture("both", reverse);
  await f.t.run(async ctx => {
    for (let i = 0; i < 100; i++) await ctx.db.insert("communityChannels", { communityId: f.communityId,
      name: `Private ${i}`, normalizedName: `private ${i}`, slug: `private-${i}`, accessMode: "restricted", postingPolicy: "members", status: "active", position: i + 1, createdAt: f.now, updatedAt: f.now });
  });
  await f.t.mutation(joinHandler, f.job);
  await f.t.run(async ctx => {
    expect(await ctx.db.query("communityFormRequests").collect()).toHaveLength(1);
    expect(await ctx.db.query("communityChannels").collect()).toHaveLength(100);
    expect(await ctx.db.query("communityChannelParticipants").collect()).toHaveLength(0);
    expect((await ctx.db.get(f.membershipId))!.active).toBe(true);
  });
});

test.each(["revision", "reactivation", "blocked", "manager_removed"])("form join checks current authority: %s", async change => {
  const f = await fixture("form");
  await f.t.run(async ctx => {
    if (change === "revision") await ctx.db.patch(f.workflowId, { revision: 2 });
    if (change === "reactivation") await ctx.db.patch(f.membershipId, { activationSequence: 2 });
    if (change === "blocked") await ctx.db.insert("communityBlocks", { communityId: f.communityId, userId: f.memberId, createdByUserId: f.ownerId, createdAt: f.now, updatedAt: f.now });
    if (change === "manager_removed") await ctx.db.patch(f.workflowId, { updatedByUserId: f.memberId });
  });
  const result = await f.t.mutation(joinHandler, f.job);
  expect(result.status).toBe(change === "revision" || change === "reactivation" ? "stale" : "action_failed");
  expect(await f.t.run(ctx => ctx.db.query("communityFormRequests").collect())).toHaveLength(0);
});

/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./communityCapabilityContext.ts",
  "./communityInteractions.ts",
  "./communityInteractionEvidence.ts",
  "./communityRecentContext.ts",
  "./communityMentionBroadcasts.ts",
  "./communityMentionLifecycle.ts",
  "./communityOnboarding.ts",
  "./communityAgentServeWorker.ts",
  "./communityIntelligenceDirectory.ts",
  "./communityEvidenceAudit.ts",
  "./communityMemberWorkflows.ts",
  "./_generated/**/*.*s",
]);

const OWNER_SUBJECT = "workflow-owner-v1";
const MEMBER_SUBJECT = "workflow-member-v1";
const internalApi = internal as any;

async function fixture(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const nowMs = 1_787_478_400_000;
    const ownerId = await ctx.db.insert("users", {
      authSubject: OWNER_SUBJECT,
      displayName: "Ada Builder",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const memberId = await ctx.db.insert("users", {
      authSubject: MEMBER_SUBJECT,
      displayName: "Grace Member",
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    await ctx.db.insert("operatorRoles", {
      userId: ownerId,
      role: "owner",
      active: true,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const communityId = await ctx.db.insert("communities", {
      ownerId,
      slug: "workflow-v1",
      name: "Workflow V1",
      lifecycleStatus: "active",
      visibility: "unlisted",
      inferenceFundingPolicy: "managed_required",
      entryPolicy: "approval",
      activeMemberCount: 2,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const membershipId = await ctx.db.insert("communityMemberships", {
      communityId,
      userId: memberId,
      role: "member",
      accessSource: "manual_grant",
      active: true,
      activationSequence: 1,
      activatedAt: nowMs,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    const channelId = await ctx.db.insert("communityChannels", {
      communityId,
      systemRole: "general",
      slug: "general",
      name: "General",
      accessMode: "all_members",
      postingPolicy: "members",
      status: "active",
      position: 0,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return { channelId, communityId, memberId, membershipId, nowMs };
  });
}

async function addRoot(t: ReturnType<typeof convexTest>, f: Awaited<ReturnType<typeof fixture>>, suffix: string) {
  return await t.run(async (ctx) => await ctx.db.insert("communityInteractionRoots", {
    communityId: f.communityId,
    channelId: f.channelId,
    actorType: "human",
    actorUserId: f.memberId,
    kind: "discussion",
    status: "live",
    visibilityScope: "community",
    contentSummary: "I completed the next useful step.",
    replyCount: 0,
    reactionSummary: [],
    idempotencyKey: `workflow-v1-${suffix}`,
    createdAt: f.nowMs + 10,
    updatedAt: f.nowMs + 10,
  }));
}

async function configureAutomations(
  t: ReturnType<typeof convexTest>,
  communityId: any,
  actions: any[],
) {
  const owner = t.withIdentity({ subject: OWNER_SUBJECT });
  const first = await owner.mutation(api.communityMemberWorkflows.createBuilderWorkflowMilestone, {
    communityId,
    expectedRevision: 0,
    name: "New",
  });
  const second = await owner.mutation(api.communityMemberWorkflows.createBuilderWorkflowMilestone, {
    communityId,
    expectedRevision: 1,
    name: "Activated",
  });
  const updated = await owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
    communityId,
    expectedRevision: 2,
    milestoneKey: first.milestone.key,
    name: "New",
    automations: actions.map((action) => ({
      key: "",
      trigger: { type: "member_contributed" as const },
      action,
    })),
  });
  return {
    firstKey: first.milestone.key,
    secondKey: second.milestone.key,
    firstMilestone: updated.milestone,
  };
}

async function configure(t: ReturnType<typeof convexTest>, communityId: any, action: any) {
  const configured = await configureAutomations(t, communityId, [action]);
  return configured.firstKey;
}

test("a blank milestone has no hidden behavior", async () => {
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  const owner = t.withIdentity({ subject: OWNER_SUBJECT });
  const created = await owner.mutation(api.communityMemberWorkflows.createBuilderWorkflowMilestone, {
    communityId: f.communityId,
    expectedRevision: 0,
    name: "New",
  });
  expect(created.milestone).toEqual({ key: expect.any(String), name: "New", automations: [] });
  const rootId = await addRoot(t, f, "blank");
  await expect(t.mutation(internalApi.communityMemberWorkflows.handleChannelContributionRootInternal, { rootId }))
    .resolves.toMatchObject({ status: "trigger_unconfigured" });
  expect(await t.run(async (ctx) => await ctx.db.query("communityMemberWorkflowRuns").collect())).toHaveLength(0);
});

test("move_member advances exactly once for one contribution receipt", async () => {
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  const firstKey = await configure(t, f.communityId, { key: "", type: "move_member", destination: "next_or_complete" });
  const rootId = await addRoot(t, f, "move");
  const first = await t.mutation(internalApi.communityMemberWorkflows.handleChannelContributionRootInternal, { rootId });
  const replay = await t.mutation(internalApi.communityMemberWorkflows.handleChannelContributionRootInternal, { rootId });
  expect(first.results[0]).toMatchObject({ status: "member_moved", replayed: false });
  expect(replay).toMatchObject({ status: "action_before_milestone" });
  const state = await t.run(async (ctx) => ({
    runs: await ctx.db.query("communityMemberWorkflowRuns").collect(),
    transitions: await ctx.db.query("communityMemberWorkflowTransitions").collect(),
    member: await ctx.db.query("communityMemberWorkflowMemberMilestones").first(),
  }));
  expect(state.runs).toHaveLength(1);
  expect(state.transitions).toHaveLength(1);
  expect(state.member?.currentMilestoneKey).not.toBe(firstKey);
});

test("prompt_agent admits one linked serve request and never moves the member", async () => {
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  const firstKey = await configure(t, f.communityId, { key: "", type: "prompt_agent", prompt: "Help the member choose one concrete next step." });
  const rootId = await addRoot(t, f, "prompt");
  const result = await t.mutation(internalApi.communityMemberWorkflows.handleChannelContributionRootInternal, { rootId });
  expect(result.results[0]).toMatchObject({ status: "agent_queued", replayed: false });
  const state = await t.run(async (ctx) => ({
    runs: await ctx.db.query("communityMemberWorkflowRuns").collect(),
    requests: await ctx.db.query("communityAgentServeRequests").collect(),
    transitions: await ctx.db.query("communityMemberWorkflowTransitions").collect(),
    member: await ctx.db.query("communityMemberWorkflowMemberMilestones").first(),
  }));
  expect(state.runs).toHaveLength(1);
  expect(state.requests).toHaveLength(1);
  expect(state.requests[0]).toMatchObject({
    triggerKind: "workflow",
    workflowRunId: state.runs[0]._id,
    workflowPromptSnapshot: "Help the member choose one concrete next step.",
  });
  expect(state.transitions).toHaveLength(0);
  expect(state.member).toBeNull();
  expect(firstKey).toEqual(expect.any(String));
});

test("a milestone rejects more than one terminal move without changing revision", async () => {
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  const owner = t.withIdentity({ subject: OWNER_SUBJECT });
  const first = await owner.mutation(api.communityMemberWorkflows.createBuilderWorkflowMilestone, {
    communityId: f.communityId,
    expectedRevision: 0,
    name: "New",
  });
  await owner.mutation(api.communityMemberWorkflows.createBuilderWorkflowMilestone, {
    communityId: f.communityId,
    expectedRevision: 1,
    name: "Activated",
  });

  await expect(owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
    communityId: f.communityId,
    expectedRevision: 2,
    milestoneKey: first.milestone.key,
    name: "New",
    automations: [
      { key: "", trigger: { type: "member_contributed" }, action: { key: "", type: "move_member", destination: "next_or_complete" } },
      { key: "", trigger: { type: "member_contributed" }, action: { key: "", type: "move_member", destination: "next_or_complete" } },
    ],
  })).rejects.toThrow("community_member_workflow_move_action_count_invalid");

  const page = await owner.query(api.communityMemberWorkflows.getBuilderWorkflowBoardPage, {
    communityId: f.communityId,
    pageSize: 10,
  });
  expect(page.workflow?.revision).toBe(2);
  expect(page.workflow?.milestones[0].automations).toEqual([]);
});

test("prompt actions are admitted before the single terminal move regardless of editor order", async () => {
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  const configured = await configureAutomations(t, f.communityId, [
    { key: "", type: "move_member", destination: "next_or_complete" },
    { key: "", type: "prompt_agent", prompt: "Offer one concise next step." },
    { key: "", type: "prompt_agent", prompt: "Reflect the member's progress." },
  ]);
  const rootId = await addRoot(t, f, "prompt-then-move");

  const first = await t.mutation(
    internalApi.communityMemberWorkflows.handleChannelContributionRootInternal,
    { rootId },
  );
  expect(first.results.map((result: any) => result.status)).toEqual([
    "agent_queued",
    "agent_queued",
    "member_moved",
  ]);

  const beforeReplay = await t.run(async (ctx) => ({
    runs: await ctx.db.query("communityMemberWorkflowRuns").collect(),
    requests: await ctx.db.query("communityAgentServeRequests").collect(),
    transitions: await ctx.db.query("communityMemberWorkflowTransitions").collect(),
    member: await ctx.db.query("communityMemberWorkflowMemberMilestones").first(),
  }));
  expect(beforeReplay.runs).toHaveLength(3);
  expect(beforeReplay.requests).toHaveLength(2);
  expect(beforeReplay.transitions).toHaveLength(1);
  expect(beforeReplay.transitions[0]).toMatchObject({
    fromMilestoneKey: configured.firstKey,
    fromMilestoneName: "New",
    toMilestoneKey: configured.secondKey,
    toMilestoneName: "Activated",
  });
  expect(beforeReplay.member?.currentMilestoneKey).toBe(configured.secondKey);

  await expect(t.mutation(
    internalApi.communityMemberWorkflows.handleChannelContributionRootInternal,
    { rootId },
  )).resolves.toMatchObject({ status: "action_before_milestone" });
  const afterReplay = await t.run(async (ctx) => ({
    runs: await ctx.db.query("communityMemberWorkflowRuns").collect(),
    requests: await ctx.db.query("communityAgentServeRequests").collect(),
    transitions: await ctx.db.query("communityMemberWorkflowTransitions").collect(),
  }));
  expect(afterReplay.runs).toHaveLength(3);
  expect(afterReplay.requests).toHaveLength(2);
  expect(afterReplay.transitions).toHaveLength(1);
});

test("milestone history keeps occurrence-time names after the workflow is renamed", async () => {
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  const owner = t.withIdentity({ subject: OWNER_SUBJECT });
  const configured = await configureAutomations(t, f.communityId, [
    { key: "", type: "move_member", destination: "next_or_complete" },
  ]);
  const rootId = await addRoot(t, f, "rename-history");
  await t.mutation(
    internalApi.communityMemberWorkflows.handleChannelContributionRootInternal,
    { rootId },
  );

  await owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
    communityId: f.communityId,
    expectedRevision: 3,
    milestoneKey: configured.firstKey,
    name: "Renamed start",
    automations: configured.firstMilestone.automations,
  });
  await owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
    communityId: f.communityId,
    expectedRevision: 4,
    milestoneKey: configured.secondKey,
    name: "Renamed destination",
    automations: [],
  });

  const dossier = await owner.query(
    api.communityMemberWorkflows.getBuilderWorkflowMemberSuccessDossier,
    { communityId: f.communityId, membershipId: f.membershipId },
  );
  expect(dossier.workflow.current_milestone_name).toBe("Renamed destination");
  expect(dossier.milestone_history).toEqual([
    expect.objectContaining({
      milestone_name: "New",
      next_milestone_name: "Activated",
    }),
  ]);
  expect(dossier.markdown).toContain("New → Activated");
});

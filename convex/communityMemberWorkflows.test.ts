/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";

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
const dossierQuery = api.communityMemberWorkflows.getBuilderWorkflowMemberSuccessDossier;
afterEach(() => vi.unstubAllEnvs());

test("membership context exists without a workflow and reading creates no state", async () => {
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  const snapshot = () => t.run(async (ctx) => ({
    memberships: await ctx.db.query("communityMemberships").collect(),
    workflows: await ctx.db.query("communityMemberWorkflows").collect(),
    states: await ctx.db.query("communityMemberWorkflowMemberMilestones").collect(),
    runs: await ctx.db.query("communityMemberWorkflowRuns").collect(),
    transitions: await ctx.db.query("communityMemberWorkflowTransitions").collect(),
    facts: await ctx.db.query("memberFacts").collect(),
  }));
  const before = await snapshot();
  const owner = t.withIdentity({ subject: OWNER_SUBJECT });
  const args = { communityId: f.communityId, membershipId: f.membershipId };
  const result = await owner.query(dossierQuery, args);
  expect(result).toMatchObject({
    community_id: f.communityId, user_id: f.memberId, membership_id: f.membershipId,
    display_name: "Grace Member", workflow: null,
    joined_at: new Date(f.nowMs).toISOString(),
    approved_community_context: [], recent_workflow_activity: [], milestone_history: [],
  });
  expect(result.markdown).toContain("- Workflow: Not configured");
  expect(await owner.query(dossierQuery, args)).toEqual(result);
  expect(await snapshot()).toEqual(before);
});

test("membership context isolates the same user across communities and preserves fact provenance", async () => {
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  const seeded = await t.run(async (ctx) => {
    const community = (await ctx.db.get(f.communityId))!;
    const { _id, _creationTime, ...communityFields } = community;
    const otherCommunityId = await ctx.db.insert("communities", {
      ...communityFields, slug: "second-context", name: "Second community",
    });
    const membership = (await ctx.db.get(f.membershipId))!;
    const { _id: memberRowId, _creationTime: memberCreationTime, ...memberFields } = membership;
    const otherMembershipId = await ctx.db.insert("communityMemberships", {
      ...memberFields, communityId: otherCommunityId,
    });
    const fact = {
      userId: f.memberId, communityId: f.communityId,
      kind: "goal" as const, body: "Community A goal", provenance: "form_answer" as const,
      confidence: 1, evidenceRefs: [], stalenessScore: 0, consentState: "approved" as const,
      createdByActorType: "member" as const, version: 1,
      createdAt: f.nowMs, updatedAt: f.nowMs + 1,
    };
    const factId = await ctx.db.insert("memberFacts", fact);
    await ctx.db.insert("memberFacts", { ...fact, communityId: otherCommunityId, body: "Community B goal" });
    await ctx.db.insert("memberFacts", { ...fact, communityId: undefined, body: "Private platform fact" });
    await ctx.db.insert("memberFacts", { ...fact, userId: f.ownerId, body: "Another member fact" });
    for (const consentState of ["pending", "rejected", "retracted", "superseded", "agent_internal"] as const) {
      await ctx.db.insert("memberFacts", { ...fact, consentState, body: consentState });
    }
    await ctx.db.insert("memberFacts", { ...fact, provenance: "observed_behavior", body: "Internal observation" });
    await ctx.db.insert("memberFacts", { ...fact, provenance: "inferred_agent", consentState: "pending", body: "Unapproved inference" });
    return { otherCommunityId, otherMembershipId, factId };
  });
  const owner = t.withIdentity({ subject: OWNER_SUBJECT });
  const a = await owner.query(dossierQuery, { communityId: f.communityId, membershipId: f.membershipId });
  const b = await owner.query(dossierQuery, { communityId: seeded.otherCommunityId, membershipId: seeded.otherMembershipId });
  expect(a.approved_community_context).toEqual([{
    id: seeded.factId, kind: "goal", body: "Community A goal", provenance: "form_answer",
    created_at: new Date(f.nowMs).toISOString(), updated_at: new Date(f.nowMs + 1).toISOString(),
  }]);
  expect(b.approved_community_context.map((fact) => fact.body)).toEqual(["Community B goal"]);
  expect(a.user_id).toBe(b.user_id);
  expect(a.membership_id).not.toBe(b.membership_id);
  expect(a.community_id).not.toBe(b.community_id);
  await expect(owner.query(dossierQuery, {
    communityId: f.communityId, membershipId: seeded.otherMembershipId,
  })).rejects.toThrow("community_member_workflow_member_not_found");
});

test("membership context rejects unauthenticated, non-manager, spoofed, and inactive access", async () => {
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  const args = { communityId: f.communityId, membershipId: f.membershipId };
  await expect(t.query(dossierQuery, args)).rejects.toThrow();
  const member = t.withIdentity({ subject: MEMBER_SUBJECT });
  await expect(member.query(dossierQuery, args)).rejects.toThrow("community_forbidden");
  await expect(member.query(dossierQuery, { ...args, userId: f.ownerId })).rejects.toThrow();
  await expect(member.query(dossierQuery, { ...args, authSubject: OWNER_SUBJECT })).rejects.toThrow();
  await t.run(async (ctx) => ctx.db.patch(f.membershipId, { active: false }));
  await expect(t.withIdentity({ subject: OWNER_SUBJECT }).query(dossierQuery, args))
    .rejects.toThrow("community_member_workflow_member_not_found");
});

test("membership context distinguishes default, recorded, and completed workflow state", async () => {
  vi.stubEnv("ARX_PUBLIC_APP_URL", "https://polynet-staging.vercel.app");
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  const configured = await configureAutomations(t, f.communityId, []);
  const owner = t.withIdentity({ subject: OWNER_SUBJECT });
  const args = { communityId: f.communityId, membershipId: f.membershipId };
  const selfProfile = () => t.withIdentity({ subject: MEMBER_SUBJECT }).action(
    internal.communityCapabilityContext.readCommunitySemanticRepositoryInternal,
    {
      authSubject: MEMBER_SUBJECT, userId: f.memberId, communityId: f.communityId,
      path: "/self.md", surface: "member_agent_dock",
    },
  );
  const initial = await owner.query(dossierQuery, args);
  expect(initial.workflow).toMatchObject({
    current_milestone_key: configured.firstKey,
    current_milestone_entered_at: new Date(f.nowMs).toISOString(), completed_at: null,
  });
  expect(await t.run(async (ctx) => ctx.db.query("communityMemberWorkflowMemberMilestones").collect())).toEqual([]);
  expect((await selfProfile()).result.body).toContain('Current milestone: "New"');
  const stateId = await t.run(async (ctx) => {
    const workflow = (await ctx.db.query("communityMemberWorkflows").first())!;
    return await ctx.db.insert("communityMemberWorkflowMemberMilestones", {
      workflowId: workflow._id, membershipId: f.membershipId,
      currentMilestoneKey: configured.secondKey, milestoneEnteredAt: f.nowMs + 10,
      transitionSeq: 1, createdAt: f.nowMs, updatedAt: f.nowMs + 10,
    });
  });
  expect((await owner.query(dossierQuery, args)).workflow).toMatchObject({
    current_milestone_key: configured.secondKey,
    current_milestone_entered_at: new Date(f.nowMs + 10).toISOString(), completed_at: null,
  });
  await t.run(async (ctx) => ctx.db.patch(stateId, { completedAt: f.nowMs + 20 }));
  expect((await owner.query(dossierQuery, args)).workflow?.completed_at).toBe(new Date(f.nowMs + 20).toISOString());
  const completedSelf = await selfProfile();
  expect(completedSelf.result.body).toContain('Current milestone: "Activated"');
  expect(completedSelf.result.body).toContain("- Status: Complete");
});

test.each(["unknown_milestone", "duplicate_state", "duplicate_workflow"] as const)(
  "membership context fails closed on %s",
  async (corruption) => {
    const t = convexTest(schema, modules);
    const f = await fixture(t);
    const configured = await configureAutomations(t, f.communityId, []);
    await t.run(async (ctx) => {
      const workflow = (await ctx.db.query("communityMemberWorkflows").first())!;
      if (corruption === "duplicate_workflow") {
        const { _id, _creationTime, ...fields } = workflow;
        await ctx.db.insert("communityMemberWorkflows", fields);
        return;
      }
      const state = {
        workflowId: workflow._id, membershipId: f.membershipId,
        currentMilestoneKey: corruption === "unknown_milestone" ? "missing" : configured.firstKey,
        milestoneEnteredAt: f.nowMs, transitionSeq: 0, createdAt: f.nowMs, updatedAt: f.nowMs,
      };
      await ctx.db.insert("communityMemberWorkflowMemberMilestones", state);
      if (corruption === "duplicate_state") await ctx.db.insert("communityMemberWorkflowMemberMilestones", state);
    });
    const errors = {
      unknown_milestone: "community_member_workflow_member_milestone_invalid",
      duplicate_state: "community_member_workflow_member_milestone_ambiguous",
      duplicate_workflow: "community_member_workflow_ambiguous",
    };
    await expect(t.withIdentity({ subject: OWNER_SUBJECT }).query(dossierQuery, {
      communityId: f.communityId, membershipId: f.membershipId,
    })).rejects.toThrow(errors[corruption]);
  },
);

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
    return { channelId, communityId, ownerId, memberId, membershipId, nowMs };
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
  const dossier = await t.withIdentity({ subject: OWNER_SUBJECT }).query(
    api.communityMemberWorkflows.getBuilderWorkflowMemberSuccessDossier,
    { communityId: f.communityId, membershipId: f.membershipId },
  );
  expect(dossier.recent_workflow_activity).toEqual([
    expect.objectContaining({
      action_type: "move_member",
      status: "moved",
      milestone_name: "New",
      next_milestone_name: "Activated",
      prompt: null,
    }),
  ]);
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
  const owner = t.withIdentity({ subject: OWNER_SUBJECT });
  const queuedDossier = await owner.query(
    api.communityMemberWorkflows.getBuilderWorkflowMemberSuccessDossier,
    { communityId: f.communityId, membershipId: f.membershipId },
  );
  expect(queuedDossier.recent_workflow_activity).toEqual([
    expect.objectContaining({
      action_type: "prompt_agent",
      status: "queued",
      milestone_name: "New",
      prompt: "Help the member choose one concrete next step.",
    }),
  ]);

  await t.run(async (ctx) => await ctx.db.patch(state.requests[0]._id, {
    status: "responded",
    respondedAt: f.nowMs + 20,
    updatedAt: f.nowMs + 20,
  }));
  const respondedDossier = await owner.query(
    api.communityMemberWorkflows.getBuilderWorkflowMemberSuccessDossier,
    { communityId: f.communityId, membershipId: f.membershipId },
  );
  expect(respondedDossier.recent_workflow_activity[0].status).toBe("responded");
  expect(respondedDossier.markdown).toContain(
    "Agent prompt responded in New — Help the member choose one concrete next step.",
  );
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
  expect(dossier.workflow?.current_milestone_name).toBe("Renamed destination");
  expect(dossier.milestone_history).toEqual([
    expect.objectContaining({
      milestone_name: "New",
      next_milestone_name: "Activated",
    }),
  ]);
  expect(dossier.recent_workflow_activity).toEqual([
    expect.objectContaining({
      action_type: "move_member",
      milestone_name: "New",
      next_milestone_name: "Activated",
    }),
  ]);
  expect(dossier.markdown).toContain("New → Activated");
});

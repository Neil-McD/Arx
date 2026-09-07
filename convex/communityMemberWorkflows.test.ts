/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";
import { buildCommunityAgentServePromptBundle } from "../shared/communityAgentServePrompt";

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

async function readActivityViews(t: ReturnType<typeof convexTest>, f: Awaited<ReturnType<typeof fixture>>) {
  const builder = await t.withIdentity({ subject: OWNER_SUBJECT }).query(dossierQuery,
    { communityId: f.communityId, membershipId: f.membershipId });
  const self = await t.withIdentity({ subject: MEMBER_SUBJECT }).query(
    internal.communityCapabilityContext.resolveCommunityMemberSelfContextInternal,
    { authSubject: MEMBER_SUBJECT, userId: f.memberId, communityId: f.communityId });
  if (!self.ok) throw new Error(self.code);
  expect(self.context.recent_workflow_activity).toEqual(
    builder.recent_workflow_activity.map(({ prompt: _prompt, ...activity }) => activity));
  expect(self.context.recent_workflow_activity.every((activity) => !("prompt" in activity))).toBe(true);
  return { builder, self: self.context };
}

test.each(["queued", "running", "responded", "error", "skipped"] as const)("activity is backed by exact agent request status: %s", async (status) => {
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  await configure(t, f.communityId, { key: "", type: "prompt_agent", prompt: "PRIVATE_BUILDER_PROMPT" });
  const rootId = await addRoot(t, f, "status");
  await t.mutation(internalApi.communityMemberWorkflows.handleChannelContributionRootInternal, { rootId });
  await t.run(async (ctx) => {
    const request = (await ctx.db.query("communityAgentServeRequests").first())!;
    await ctx.db.patch(request._id, { status });
  });
  const views = await readActivityViews(t, f);
  expect(views.self.recent_workflow_activity[0].status).toBe(status === "error" || status === "skipped" ? "failed" : status);
  expect(JSON.stringify(views.self)).not.toContain("PRIVATE_BUILDER_PROMPT");
});

test.each(["missing", "wrong_community", "wrong_requester", "wrong_run", "wrong_action", "wrong_prompt", "wrong_source", "wrong_kind", "wrong_result", "failed_run"] as const)("unverifiable agent activity does not masquerade as queued: %s", async (failure) => {
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  await configure(t, f.communityId, { key: "", type: "prompt_agent", prompt: "PRIVATE_BUILDER_PROMPT" });
  const rootId = await addRoot(t, f, "bad-link");
  await t.mutation(internalApi.communityMemberWorkflows.handleChannelContributionRootInternal, { rootId });
  await t.run(async (ctx) => {
    const request = (await ctx.db.query("communityAgentServeRequests").first())!;
    const run = (await ctx.db.query("communityMemberWorkflowRuns").first())!;
    if (failure === "missing") await ctx.db.delete(request._id);
    if (failure === "wrong_requester") await ctx.db.patch(request._id, { requesterUserId: f.ownerId });
    if (failure === "wrong_action") await ctx.db.patch(request._id, { workflowActionKey: "foreign-action" });
    if (failure === "wrong_prompt") await ctx.db.patch(request._id, { workflowPromptSnapshot: "FOREIGN_PROMPT" });
    if (failure === "wrong_source") await ctx.db.patch(request._id, { sourceRootId: undefined });
    if (failure === "wrong_kind") await ctx.db.patch(request._id, { triggerKind: "mention" });
    if (failure === "wrong_result") await ctx.db.patch(run._id, { actionResult: { ...run.actionResult!, actionKey: "foreign-action" } });
    if (failure === "failed_run") { await ctx.db.delete(request._id); await ctx.db.patch(run._id, { status: "failed" }); }
    if (failure === "wrong_run") {
      const { _id, _creationTime, ...fields } = run;
      const otherId = await ctx.db.insert("communityMemberWorkflowRuns", { ...fields, createdAt: run.createdAt - 1 });
      await ctx.db.patch(request._id, { workflowRunId: otherId });
    }
    if (failure === "wrong_community") {
      const { _id, _creationTime, ...fields } = (await ctx.db.get(f.communityId))!;
      const otherId = await ctx.db.insert("communities", { ...fields, slug: "foreign-community" });
      await ctx.db.patch(request._id, { communityId: otherId });
    }
  });
  const views = await readActivityViews(t, f);
  expect(views.self.recent_workflow_activity[0].status).toBe(failure === "failed_run" ? "failed" : "unavailable");
  expect(JSON.stringify(views.self)).not.toContain("FOREIGN_PROMPT");
});

test.each(["missing", "wrong_community", "wrong_membership", "wrong_workflow", "wrong_run", "wrong_action", "wrong_revision", "wrong_milestone", "wrong_entry", "failed_run"] as const)("move activity rejects unverifiable receipts: %s", async (failure) => {
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  await configure(t, f.communityId, { key: "", type: "move_member", destination: "next_or_complete" });
  const rootId = await addRoot(t, f, "bad-move");
  await t.mutation(internalApi.communityMemberWorkflows.handleChannelContributionRootInternal, { rootId });
  await t.run(async (ctx) => {
    const receipt = (await ctx.db.query("communityMemberWorkflowTransitions").first())!;
    const run = (await ctx.db.query("communityMemberWorkflowRuns").first())!;
    if (failure === "missing") await ctx.db.delete(receipt._id);
    if (failure === "failed_run") { await ctx.db.delete(receipt._id); await ctx.db.patch(run._id, { status: "failed" }); }
    if (failure === "wrong_action") await ctx.db.patch(receipt._id, { actionKey: "foreign-action" });
    if (failure === "wrong_revision") await ctx.db.patch(receipt._id, { workflowRevision: receipt.workflowRevision + 1 });
    if (failure === "wrong_milestone") await ctx.db.patch(receipt._id, { fromMilestoneKey: "foreign-milestone" });
    if (failure === "wrong_entry") await ctx.db.patch(receipt._id, { milestoneEnteredAt: receipt.milestoneEnteredAt + 1 });
    if (failure === "wrong_run") {
      const { _id, _creationTime, ...fields } = run;
      const otherId = await ctx.db.insert("communityMemberWorkflowRuns", { ...fields, createdAt: run.createdAt - 1 });
      await ctx.db.patch(receipt._id, { workflowRunId: otherId });
    }
    if (failure === "wrong_membership") {
      const { _id, _creationTime, ...fields } = (await ctx.db.get(f.membershipId))!;
      const otherId = await ctx.db.insert("communityMemberships", { ...fields, userId: f.ownerId });
      await ctx.db.patch(receipt._id, { membershipId: otherId });
    }
    if (failure === "wrong_workflow") {
      const { _id, _creationTime, ...fields } = (await ctx.db.get(f.communityId))!;
      const otherCommunityId = await ctx.db.insert("communities", { ...fields, slug: "foreign-workflow-community" });
      const { _id: wid, _creationTime: wtime, ...workflow } = (await ctx.db.get(run.workflowId))!;
      const otherId = await ctx.db.insert("communityMemberWorkflows", { ...workflow, communityId: otherCommunityId });
      await ctx.db.patch(receipt._id, { workflowId: otherId, toMilestoneName: "FOREIGN_DESTINATION" });
    }
    if (failure === "wrong_community") {
      const { _id, _creationTime, ...fields } = (await ctx.db.get(f.communityId))!;
      const otherId = await ctx.db.insert("communities", { ...fields, slug: "foreign-move-community" });
      await ctx.db.patch(receipt._id, { communityId: otherId, toMilestoneName: "FOREIGN_DESTINATION" });
    }
  });
  const views = await readActivityViews(t, f);
  expect(views.self.recent_workflow_activity[0]).toMatchObject({
    status: failure === "failed_run" ? "failed" : "unavailable", next_milestone_key: null, next_milestone_name: null,
  });
  expect(JSON.stringify(views.self)).not.toContain("FOREIGN_DESTINATION");
});

test("the final milestone's exact receipt projects completion in both authorized views", async () => {
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  const owner = t.withIdentity({ subject: OWNER_SUBJECT });
  const first = await owner.mutation(api.communityMemberWorkflows.createBuilderWorkflowMilestone,
    { communityId: f.communityId, expectedRevision: 0, name: "Only milestone" });
  await owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
    communityId: f.communityId, expectedRevision: 1, milestoneKey: first.milestone.key, name: "Only milestone",
    automations: [{ key: "", trigger: { type: "member_contributed" }, action: { key: "", type: "move_member", destination: "next_or_complete" } }],
  });
  const rootId = await addRoot(t, f, "completion");
  await t.mutation(internalApi.communityMemberWorkflows.handleChannelContributionRootInternal, { rootId });
  const views = await readActivityViews(t, f);
  expect(views.self.recent_workflow_activity[0]).toMatchObject({ status: "workflow_completed", next_milestone_key: null, next_milestone_name: null });
  expect(views.self.workflow?.completed_at).toBeTruthy();
});

test("exact movement receipt remains authoritative outside the displayed history window; reads do not write", async () => {
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  await configure(t, f.communityId, { key: "", type: "move_member", destination: "next_or_complete" });
  const rootId = await addRoot(t, f, "history-window");
  await t.mutation(internalApi.communityMemberWorkflows.handleChannelContributionRootInternal, { rootId });
  const receiptId = await t.run(async (ctx) => {
    const receipt = (await ctx.db.query("communityMemberWorkflowTransitions").first())!;
    const run = (await ctx.db.query("communityMemberWorkflowRuns").first())!;
    // Independent history/run windows: import-like chronology, not a new runtime write path.
    for (let i = 1; i <= 13; i++) {
      const { _id: rid, _creationTime: rtime, ...r } = run;
      const olderRunId = await ctx.db.insert("communityMemberWorkflowRuns", { ...r, createdAt: run.createdAt - i });
      const { _id, _creationTime, ...fields } = receipt;
      await ctx.db.insert("communityMemberWorkflowTransitions", { ...fields, workflowRunId: olderRunId, seq: receipt.seq + i });
    }
    return receipt._id;
  });
  const snapshot = () => t.run(async (ctx) => ({
    runs: await ctx.db.query("communityMemberWorkflowRuns").collect(),
    transitions: await ctx.db.query("communityMemberWorkflowTransitions").collect(),
    states: await ctx.db.query("communityMemberWorkflowMemberMilestones").collect(),
    requests: await ctx.db.query("communityAgentServeRequests").collect(),
  }));
  const before = await snapshot();
  const views = await readActivityViews(t, f);
  expect(views.self.milestone_history).toHaveLength(12);
  expect(views.self.milestone_history.map((row) => row.id)).not.toContain(receiptId);
  expect(views.self.recent_workflow_activity[0]).toMatchObject({ status: "moved", next_milestone_name: "Activated" });
  await readActivityViews(t, f);
  expect(await snapshot()).toEqual(before);
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); vi.restoreAllMocks(); });

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

test.each([false, true])("private contribution requires a current grant and deterministic movement needs no agent: granted=%s", async (granted) => {
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  await configure(t, f.communityId, { key: "", type: "move_member", destination: "next_or_complete" });
  await t.run(async ctx => {
    await ctx.db.patch(f.channelId, { systemRole: undefined, slug: "private-client", name: "Private client", position: 1, accessMode: "restricted" });
    if (granted) await ctx.db.insert("communityChannelParticipants", { communityId: f.communityId, channelId: f.channelId,
      principalKey: `user:${f.memberId}`, membershipId: f.membershipId, membershipActivationSequence: 1,
      status: "active", createdByUserId: f.ownerId, createdAt: f.nowMs, updatedAt: f.nowMs });
  });
  const rootId = await addRoot(t, f, `private-${granted}`);
  await t.mutation(internalApi.communityMemberWorkflows.handleChannelContributionRootInternal, { rootId });
  await t.mutation(internalApi.communityMemberWorkflows.handleChannelContributionRootInternal, { rootId });
  expect(await t.run(ctx => ctx.db.query("communityMemberWorkflowTransitions").collect())).toHaveLength(granted ? 1 : 0);
  expect(await t.run(ctx => ctx.db.query("communityAgentServeRequests").collect())).toHaveLength(0);
});

test("membership context distinguishes default, recorded, and completed workflow state", async () => {
  vi.stubEnv("ARX_PUBLIC_APP_URL", "https://polynet-staging.vercel.app");
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  const configured = await configureAutomations(t, f.communityId, []);
  const owner = t.withIdentity({ subject: OWNER_SUBJECT });
  const args = { communityId: f.communityId, membershipId: f.membershipId };
  const selfProfile = () => t.withIdentity({ subject: MEMBER_SUBJECT }).query(
    internal.communityCapabilityContext.resolveCommunityMemberSelfContextInternal,
    {
      authSubject: MEMBER_SUBJECT, userId: f.memberId, communityId: f.communityId,
    },
  );
  const initial = await owner.query(dossierQuery, args);
  expect(initial.workflow).toMatchObject({
    current_milestone_key: configured.firstKey,
    current_milestone_entered_at: new Date(f.nowMs).toISOString(), completed_at: null,
  });
  expect(await t.run(async (ctx) => ctx.db.query("communityMemberWorkflowMemberMilestones").collect())).toEqual([]);
  expect((await selfProfile()).context?.workflow?.current_milestone_name).toBe("New");
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
  expect(completedSelf.context?.workflow?.current_milestone_name).toBe("Activated");
  expect(completedSelf.context?.workflow?.completed_at).toBe(new Date(f.nowMs + 20).toISOString());
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
  channelId?: any,
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
      trigger: { type: "member_contributed" as const, ...(channelId ? { channelId } : {}) },
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

test.each(["root", "reply"] as const)("channel filter selects only its source, snapshots the rule, and replays once: %s", async (kind) => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  const selectedId = await t.run(async ctx => ctx.db.insert("communityChannels", {
    communityId: f.communityId, slug: "client", name: "Client", status: "active",
    accessMode: "all_members", postingPolicy: "members", position: 1, createdAt: f.nowMs, updatedAt: f.nowMs,
  }));
  const configured = await configureAutomations(t, f.communityId, [
    { key: "", type: "prompt_agent", prompt: "Help in this thread." },
  ], selectedId);
  expect(configured.firstMilestone.automations[0].trigger).toMatchObject({ channelId: selectedId });
  const contribute = async (channelId: typeof selectedId, suffix: string) => {
    const rootId = await addRoot(t, { ...f, channelId }, suffix);
    if (kind === "root") return () => t.mutation(internalApi.communityMemberWorkflows.handleChannelContributionRootInternal, { rootId });
    const replyId = await t.run(async ctx => ctx.db.insert("communityInteractionReplies", {
      communityId: f.communityId, channelId, rootId, actorType: "human", actorUserId: f.memberId,
      status: "live", visibilityScope: "community", contentSummary: "A member reply", reactionSummary: [],
      seq: 1, idempotencyKey: `filter-reply-${suffix}`,
      createdAt: f.nowMs + 11, updatedAt: f.nowMs + 11,
    }));
    return () => t.mutation(internalApi.communityMemberWorkflows.handleChannelContributionReplyInternal, { replyId });
  };
  expect(await (await contribute(f.channelId, "other"))()).toMatchObject({ status: "trigger_unconfigured" });
  expect(await t.run(ctx => ctx.db.query("communityMemberWorkflowRuns").collect())).toHaveLength(0);
  await t.run(ctx => ctx.db.patch(selectedId, { name: "Renamed client", slug: "renamed-client" }));
  const run = await contribute(selectedId, "selected");
  expect((await run()).results[0].status).toBe("agent_queued");
  expect((await run()).results[0].status).toBe("already_executed");
  const runs = await t.run(ctx => ctx.db.query("communityMemberWorkflowRuns").collect());
  expect(runs).toHaveLength(1);
  expect(runs[0].triggerSnapshot).toEqual({ type: "member_contributed", channelId: selectedId });
  const requests = await t.run(ctx => ctx.db.query("communityAgentServeRequests").collect());
  expect(requests).toHaveLength(1);
  expect((await t.run(ctx => ctx.db.get(requests[0].sourceRootId!)))?.channelId).toBe(selectedId);
  // Edits do not rewrite the occurrence-time condition, nor replay an old action.
  await t.withIdentity({ subject: OWNER_SUBJECT }).mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
    communityId: f.communityId, expectedRevision: 3, milestoneKey: configured.firstKey, name: "New",
    automations: configured.firstMilestone.automations.map(a => ({ ...a, trigger: { type: "member_contributed" as const } })),
  });
  expect((await run()).results[0].status).toBe("already_executed");
  expect((await t.run(ctx => ctx.db.get(runs[0]._id)))?.triggerSnapshot).toMatchObject({ channelId: selectedId });
});

test.each(["archived", "deleted", "foreign", "malformed", "empty"] as const)("channel selection rejects %s targets without a partial save", async (kind) => {
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  const configured = await configureAutomations(t, f.communityId, []);
  await t.run(async ctx => {
    if (kind === "archived") await ctx.db.patch(f.channelId, { status: "archived" });
    if (kind === "deleted") await ctx.db.delete(f.channelId);
    if (kind === "foreign") {
      const { _id, _creationTime, ...community } = (await ctx.db.get(f.communityId))!;
      const otherId = await ctx.db.insert("communities", { ...community, slug: "other" });
      await ctx.db.patch(f.channelId, { communityId: otherId });
    }
  });
  await expect(t.withIdentity({ subject: OWNER_SUBJECT }).mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
    communityId: f.communityId, expectedRevision: 3, milestoneKey: configured.firstKey, name: "Changed",
    automations: [{ key: "", trigger: { type: "member_contributed", channelId: kind === "empty" ? "" : kind === "malformed" ? "not-a-channel-id" : f.channelId },
      action: { key: "", type: "move_member", destination: "next_or_complete" } }],
  })).rejects.toThrow("community_member_workflow_channel_unavailable");
  const workflow = await t.run(ctx => ctx.db.query("communityMemberWorkflows").first());
  expect(workflow?.revision).toBe(3);
  expect(workflow?.milestones[0].automations).toEqual([]);
});

test.each(["active", "archived", "deleted", "revoked"] as const)("selected private room is fail-closed at contribution time: %s", async (state) => {
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  await configureAutomations(t, f.communityId, [{ key: "", type: "move_member", destination: "next_or_complete" }], f.channelId);
  await t.run(async ctx => {
    await ctx.db.patch(f.channelId, { systemRole: undefined, slug: "private-client", name: "Private client", position: 1, accessMode: "restricted" });
    const grantId = await ctx.db.insert("communityChannelParticipants", { communityId: f.communityId, channelId: f.channelId,
      principalKey: `user:${f.memberId}`, membershipId: f.membershipId, membershipActivationSequence: 1,
      status: "active", createdByUserId: f.ownerId, createdAt: f.nowMs, updatedAt: f.nowMs });
    if (state === "archived") await ctx.db.patch(f.channelId, { status: "archived" });
    if (state === "deleted") await ctx.db.delete(f.channelId);
    if (state === "revoked") await ctx.db.patch(grantId, { status: "revoked" });
  });
  const rootId = await addRoot(t, f, state);
  await t.mutation(internalApi.communityMemberWorkflows.handleChannelContributionRootInternal, { rootId });
  await t.mutation(internalApi.communityMemberWorkflows.handleChannelContributionRootInternal, { rootId });
  expect(await t.run(ctx => ctx.db.query("communityMemberWorkflowTransitions").collect())).toHaveLength(state === "active" ? 1 : 0);
  expect(await t.run(ctx => ctx.db.query("communityAgentServeRequests").collect())).toHaveLength(0);
});

async function workflowServeFixture(t: ReturnType<typeof convexTest>, move = true) {
  // Drive admission/claims explicitly; do not race the scheduled live worker.
  vi.useFakeTimers();
  const f = await fixture(t);
  const configured = await configureAutomations(t, f.communityId, [
    { key: "", type: "prompt_agent", prompt: "Help with the original New milestone task." },
    ...(move ? [{ key: "", type: "move_member", destination: "next_or_complete" }] : []),
  ]);
  const rootId = await addRoot(t, f, "context");
  await t.mutation(internalApi.communityMemberWorkflows.handleChannelContributionRootInternal, { rootId });
  const request = (await t.run((ctx) => ctx.db.query("communityAgentServeRequests").first()))!;
  const claim = await t.mutation(internalApi.communityAgentServeWorker.claimNextCommunityAgentServeRequestInternal, {
    requestId: request._id, nowMs: f.nowMs + 100,
  });
  const read = (attempt = claim.attempt) => t.query(
    internalApi.communityAgentServeWorker.readCommunityAgentServeRequestContextInternal,
    { requestId: request._id, expectedAttempt: attempt },
  );
  return { ...f, ...configured, rootId, request, claim, read };
}

function workflowOrientation(context: any) {
  expect(context.ok).toBe(true);
  const line = context.threadContext.rendered.split("\n").find((value: string) => value.startsWith("Workflow orientation"));
  expect(line).toBeDefined();
  return JSON.parse(line.slice(line.indexOf(": ") + 2));
}

function contextSnapshot(context: any) {
  const bundle = buildCommunityAgentServePromptBundle(context);
  return JSON.stringify({
    version: 2, sha256: "a".repeat(64), messages: bundle.messages,
    prompt_sections: bundle.systemPromptBundle.sections,
  });
}

test("queued workflow context separates immutable origin from moved and renamed current position", async () => {
  const t = convexTest(schema, modules);
  const f = await workflowServeFixture(t);
  await t.withIdentity({ subject: OWNER_SUBJECT }).mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
    communityId: f.communityId, expectedRevision: 3, milestoneKey: f.secondKey,
    name: "Renamed destination", automations: [],
  });
  const context = await f.read();
  expect(context.workflowPrompt).toBe("Help with the original New milestone task.");
  expect(workflowOrientation(context)).toMatchObject({
    community_id: f.communityId, membership_id: f.membershipId,
    action_origin: { run_id: f.request.workflowRunId, revision: 3, milestone_key: f.firstKey, milestone_name: "New" },
    current_at_context_read: { revision: 4, milestone_key: f.secondKey, milestone_name: "Renamed destination", completed_at: null },
  });
  const bundle = buildCommunityAgentServePromptBundle(context);
  expect(bundle.messages.find((message) => message.role === "user")?.content).toContain("action_origin");
  expect(bundle.systemPromptBundle.sections.map((section) => section.id)).toEqual([
    "community_agent_identity", "concierge_operating_policy", "community_system_prompt", "community_workflow_action",
  ]);
  const snapshotJson = contextSnapshot(context);
  const snapshotArgs = { requestId: f.request._id, expectedAttempt: f.claim.attempt, snapshotJson };
  await expect(t.mutation(internalApi.communityAgentServeWorker.recordCommunityAgentServeContextSnapshotInternal, snapshotArgs))
    .resolves.toMatchObject({ ok: true });
  await expect(t.mutation(internalApi.communityAgentServeWorker.recordCommunityAgentServeContextSnapshotInternal, snapshotArgs))
    .resolves.toMatchObject({ ok: true, duplicate: true });
  await t.mutation(internalApi.communityMemberWorkflows.handleChannelContributionRootInternal, { rootId: f.rootId });
  await t.run(async (ctx) => {
    expect(await ctx.db.query("communityAgentRunEvents").collect()).toHaveLength(1);
    expect((await ctx.db.query("communityAgentRunEvents").first())?.content).toBe(snapshotJson);
    expect(await ctx.db.query("communityMemberWorkflowRuns").collect()).toHaveLength(2);
    expect(await ctx.db.query("communityMemberWorkflowTransitions").collect()).toHaveLength(1);
    expect(await ctx.db.query("communityAgentServeRequests").collect()).toHaveLength(1);
  });
});

test("workflow context uses read-only defaults, preserves completion, and allows absent current workflow", async () => {
  const t = convexTest(schema, modules);
  const f = await workflowServeFixture(t, false);
  expect(workflowOrientation(await f.read()).current_at_context_read).toMatchObject({
    milestone_key: f.firstKey, entered_at: f.nowMs, completed_at: null,
  });
  expect(await t.run((ctx) => ctx.db.query("communityMemberWorkflowMemberMilestones").collect())).toEqual([]);
  const workflow = (await t.run((ctx) => ctx.db.query("communityMemberWorkflows").first()))!;
  await t.run(async (ctx) => ctx.db.insert("communityMemberWorkflowMemberMilestones", {
    workflowId: workflow._id, membershipId: f.membershipId,
    currentMilestoneKey: f.secondKey, milestoneEnteredAt: f.nowMs + 20,
    completedAt: f.nowMs + 30, transitionSeq: 2, createdAt: f.nowMs, updatedAt: f.nowMs + 30,
  }));
  expect(workflowOrientation(await f.read()).current_at_context_read.completed_at).toBe(f.nowMs + 30);
  await t.run((ctx) => ctx.db.delete(workflow._id));
  const withoutWorkflow = workflowOrientation(await f.read());
  expect(withoutWorkflow.current_at_context_read).toBeNull();
  expect(withoutWorkflow.action_origin.milestone_name).toBe("New");
});

test.each(["wrong_user", "wrong_community", "replacement_membership", "revoked", "wrong_receipt"] as const)(
  "workflow context rejects %s rather than enriching the wrong member",
  async (corruption) => {
    const t = convexTest(schema, modules);
    const f = await workflowServeFixture(t);
    await t.run(async (ctx) => {
      const membership = (await ctx.db.get(f.membershipId))!;
      const { _id, _creationTime, ...fields } = membership;
      if (corruption === "wrong_receipt") {
        await ctx.db.patch(f.request.workflowRunId!, { triggerReceiptRef: "different-source" });
      } else if (corruption === "revoked") {
        await ctx.db.patch(f.membershipId, { active: false });
      } else {
        const other = await ctx.db.insert("communities", {
          ownerId: f.ownerId, slug: "other-context", name: "Other",
          inferenceFundingPolicy: "managed_required",
          visibility: "unlisted", entryPolicy: "open", createdAt: f.nowMs, updatedAt: f.nowMs,
        });
        const memberId = await ctx.db.insert("communityMemberships", {
          ...fields,
          userId: corruption === "wrong_user" ? f.ownerId : f.memberId,
          communityId: corruption === "wrong_community" ? other : f.communityId,
        });
        if (corruption === "replacement_membership") await ctx.db.delete(f.membershipId);
        else await ctx.db.patch(f.request.workflowRunId!, { membershipId: memberId });
      }
    });
    await expect(f.read()).resolves.toMatchObject({ ok: false, errorCode:
      corruption === "wrong_receipt" ? "workflow_action_link_invalid" : "workflow_member_link_invalid",
    });
  },
);

test.each(["duplicate_membership", "duplicate_workflow", "duplicate_state", "unknown_milestone"] as const)(
  "workflow context fails closed on %s using canonical readers",
  async (corruption) => {
    const t = convexTest(schema, modules);
    const f = await workflowServeFixture(t);
    await t.run(async (ctx) => {
      if (corruption === "duplicate_membership") {
        const { _id, _creationTime, ...fields } = (await ctx.db.get(f.membershipId))!;
        await ctx.db.insert("communityMemberships", fields);
      } else if (corruption === "duplicate_workflow") {
        const { _id, _creationTime, ...fields } = (await ctx.db.query("communityMemberWorkflows").first())!;
        await ctx.db.insert("communityMemberWorkflows", fields);
      } else {
        const { _id, _creationTime, ...fields } = (await ctx.db.query("communityMemberWorkflowMemberMilestones").first())!;
        if (corruption === "duplicate_state") await ctx.db.insert("communityMemberWorkflowMemberMilestones", fields);
        else await ctx.db.patch(_id, { currentMilestoneKey: "missing" });
      }
    });
    await expect(f.read()).rejects.toThrow();
  },
);

test("workflow retry refreshes consented facts but cannot rewrite an earlier attempt snapshot", async () => {
  const t = convexTest(schema, modules);
  const f = await workflowServeFixture(t);
  const factId = await t.run(async (ctx) => {
    const fact = {
      userId: f.memberId, communityId: f.communityId, kind: "goal" as const,
      body: "Consented community goal", provenance: "form_answer" as const,
      confidence: 1, evidenceRefs: [], stalenessScore: 0, consentState: "approved" as const,
      createdByActorType: "member" as const, version: 1, createdAt: f.nowMs, updatedAt: f.nowMs,
    };
    const id = await ctx.db.insert("memberFacts", fact);
    await ctx.db.insert("memberFacts", { ...fact, communityId: undefined, body: "PRIVATE PLATFORM FACT" });
    await ctx.db.insert("memberFacts", { ...fact, consentState: "pending", body: "PENDING FACT" });
    await ctx.db.insert("memberFacts", { ...fact, provenance: "observed_behavior", body: "INTERNAL BEHAVIOR" });
    return id;
  });
  const first = await f.read();
  expect(first.threadContext.rendered).toContain("Consented community goal");
  for (const secret of ["PRIVATE PLATFORM FACT", "PENDING FACT", "INTERNAL BEHAVIOR"]) {
    expect(first.threadContext.rendered).not.toContain(secret);
  }
  const firstSnapshot = contextSnapshot(first);
  await t.mutation(internalApi.communityAgentServeWorker.recordCommunityAgentServeContextSnapshotInternal, {
    requestId: f.request._id, expectedAttempt: f.claim.attempt, snapshotJson: firstSnapshot,
  });
  await t.run((ctx) => ctx.db.patch(factId, { consentState: "retracted" }));
  const next = await t.mutation(internalApi.communityAgentServeWorker.claimNextCommunityAgentServeRequestInternal, {
    requestId: f.request._id, nowMs: f.claim.leaseExpiresAt,
  });
  expect(next.attempt).toBe(f.claim.attempt + 1);
  await expect(f.read()).resolves.toMatchObject({ ok: false, errorCode: "serve_request_not_running" });
  const second = await f.read(next.attempt);
  expect(second.threadContext.rendered).not.toContain("Consented community goal");
  expect(workflowOrientation(second).action_origin).toEqual(workflowOrientation(first).action_origin);
  await expect(t.mutation(internalApi.communityAgentServeWorker.recordCommunityAgentServeContextSnapshotInternal, {
    requestId: f.request._id, expectedAttempt: f.claim.attempt, snapshotJson: contextSnapshot(second),
  })).resolves.toMatchObject({ ok: false, errorCode: "serve_request_attempt_stale" });
  await t.mutation(internalApi.communityAgentServeWorker.recordCommunityAgentServeContextSnapshotInternal, {
    requestId: f.request._id, expectedAttempt: next.attempt, snapshotJson: contextSnapshot(second),
  });
  const snapshots = await t.run((ctx) => ctx.db.query("communityAgentRunEvents").collect());
  expect(snapshots).toHaveLength(2);
  expect(snapshots[0].content).toBe(firstSnapshot);
});

test("membership revoked after workflow context read blocks snapshot and reply persistence", async () => {
  const t = convexTest(schema, modules);
  const f = await workflowServeFixture(t);
  const context = await f.read();
  await t.run((ctx) => ctx.db.patch(f.membershipId, { active: false }));
  await expect(t.mutation(internalApi.communityAgentServeWorker.recordCommunityAgentServeContextSnapshotInternal, {
    requestId: f.request._id, expectedAttempt: f.claim.attempt, snapshotJson: contextSnapshot(context),
  })).resolves.toMatchObject({ ok: false, errorCode: "requester_access_missing" });
  await expect(t.mutation(internalApi.communityAgentServeWorker.finalizeCommunityAgentServeReplyInternal, {
    requestId: f.request._id, expectedAttempt: f.claim.attempt, content: "Must not post.",
  })).resolves.toMatchObject({ ok: false });
  expect(await t.run((ctx) => ctx.db.query("communityInteractionReplies").collect())).toEqual([]);
});

test("a canonical context read failure fails the claimed worker without provider execution", async () => {
  const t = convexTest(schema, modules);
  const f = await workflowServeFixture(t);
  await t.run(async (ctx) => {
    const state = (await ctx.db.query("communityMemberWorkflowMemberMilestones").first())!;
    await ctx.db.patch(state._id, { currentMilestoneKey: "missing" });
  });
  vi.setSystemTime(f.claim.leaseExpiresAt);
  const result = await t.action(internalApi.communityAgentServeWorker.processQueuedCommunityAgentServeRequestsInternal, {
    requestId: f.request._id,
  });
  expect(JSON.stringify(result)).toContain("community_member_workflow_member_milestone_invalid");
  expect(await t.run((ctx) => ctx.db.get(f.request._id))).toMatchObject({ status: "error" });
  expect(await t.run((ctx) => ctx.db.query("communityAgentRunEvents").collect())).toEqual([]);
  expect(await t.run((ctx) => ctx.db.query("communityInteractionReplies").collect())).toEqual([]);
});

test("unexpected context infrastructure errors retain the existing leased recovery path", async () => {
  const t = convexTest(schema, modules);
  const f = await workflowServeFixture(t);
  vi.setSystemTime(f.claim.leaseExpiresAt);
  const contextModule = await import("./communityAgentContext");
  vi.spyOn(contextModule, "readCanonicalCommunityAgentContext")
    .mockRejectedValueOnce(new Error("temporary context transport failure"));
  await expect(t.action(internalApi.communityAgentServeWorker.processQueuedCommunityAgentServeRequestsInternal, {
    requestId: f.request._id,
  })).rejects.toThrow("temporary context transport failure");
  expect(await t.run((ctx) => ctx.db.get(f.request._id))).toMatchObject({
    status: "running", attempt: f.claim.attempt + 1,
  });
  expect(await t.run((ctx) => ctx.db.query("communityAgentRunEvents").collect())).toEqual([]);
});

test("concurrent duplicate deliveries and contributions do not duplicate a transition or prompt admission", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  await configureAutomations(t, f.communityId, [
    { key: "", type: "prompt_agent", prompt: "Help with the next step." },
    { key: "", type: "move_member", destination: "next_or_complete" },
  ]);
  const a = await addRoot(t, f, "concurrent-a");
  const b = await addRoot(t, f, "concurrent-b");
  await Promise.all([a, a, b].map((rootId) => t.mutation(
    internalApi.communityMemberWorkflows.handleChannelContributionRootInternal, { rootId },
  )));
  await t.run(async (ctx) => {
    expect(await ctx.db.query("communityMemberWorkflowRuns").collect()).toHaveLength(2);
    expect(await ctx.db.query("communityMemberWorkflowTransitions").collect()).toHaveLength(1);
    expect(await ctx.db.query("communityAgentServeRequests").collect()).toHaveLength(1);
  });
});

test("reply-triggered orientation belongs to the replying member, not the thread author", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  await configure(t, f.communityId, { key: "", type: "prompt_agent", prompt: "Help the replying member." });
  const rootId = await addRoot(t, f, "owner-root");
  const replyId = await t.run(async (ctx) => {
    await ctx.db.patch(rootId, { actorUserId: f.ownerId, replyCount: 1 });
    return await ctx.db.insert("communityInteractionReplies", {
      communityId: f.communityId, channelId: f.channelId, rootId, seq: 1,
      actorType: "human", actorUserId: f.memberId, status: "live",
      visibilityScope: "community", contentSummary: "Help with my next step.",
      reactionSummary: [], idempotencyKey: "workflow-context-reply",
      createdAt: f.nowMs + 20, updatedAt: f.nowMs + 20,
    });
  });
  await t.mutation(internalApi.communityMemberWorkflows.handleChannelContributionReplyInternal, { replyId });
  const request = (await t.run((ctx) => ctx.db.query("communityAgentServeRequests").first()))!;
  const claim = await t.mutation(internalApi.communityAgentServeWorker.claimNextCommunityAgentServeRequestInternal, {
    requestId: request._id, nowMs: f.nowMs + 100,
  });
  const context = await t.query(internalApi.communityAgentServeWorker.readCommunityAgentServeRequestContextInternal, {
    requestId: request._id, expectedAttempt: claim.attempt,
  });
  expect(context.request.requesterUserId).toBe(f.memberId);
  expect(workflowOrientation(context)).toMatchObject({
    membership_id: f.membershipId,
    action_origin: { trigger_receipt: `interaction:reply:${replyId}` },
  });
  expect(context.threadContext.rendered.match(/Workflow orientation/g)).toHaveLength(1);
});

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

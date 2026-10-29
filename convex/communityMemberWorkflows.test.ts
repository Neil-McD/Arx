/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";
import { buildCommunityAgentServePromptBundle } from "../shared/communityAgentServePrompt";

const modules = import.meta.glob([
  "./communityClients.ts",
  "./communityForms.ts",
  "./communityFormRequests.ts",
  "./communityCapabilityContext.ts",
  "./communityInteractions.ts",
  "./communityInteractionEvidence.ts",
  "./communityMentionBroadcasts.ts",
  "./communityMentionLifecycle.ts",
  "./communityAgentServeWorker.ts",
  "./communityAgentChannelAccess.ts",
  "./communityIntelligenceDirectory.ts",
  "./communityEvidenceAudit.ts",
  "./communityMemberWorkflows.ts",
  "./communityResourceProgress.ts",
  "./communityLessonTracks.ts",
  "./communityAdmin.ts",
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

test.each(["channel_access_missing", "workflow_member_context_changed", "PRIVATE_UNKNOWN_ERROR"])("activity explains recorded failure: %s", async errorCode => {
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  await configure(t, f.communityId, { key: "", type: "prompt_agent", prompt: "Help" });
  const rootId = await addRoot(t, f, "explanation");
  await t.mutation(internalApi.communityMemberWorkflows.handleChannelContributionRootInternal, { rootId });
  await t.run(async ctx => {
    const request = (await ctx.db.query("communityAgentServeRequests").first())!;
    await ctx.db.patch(request._id, { status: "error", errorCode });
  });
  const { builder } = await readActivityViews(t, f);
  const activity = builder.recent_workflow_activity[0];
  expect(activity.failure_reason).toBeTruthy();
  expect(builder.markdown).toContain(activity.failure_reason);
  expect(activity.status).toBe(errorCode === "workflow_member_context_changed" ? "not_applicable" : "failed");
  expect(JSON.stringify(builder)).not.toContain("PRIVATE_UNKNOWN_ERROR");
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

async function formFlowFixture() {
  const t = convexTest(schema, modules), f = await fixture(t);
  const owner = t.withIdentity({ subject: OWNER_SUBJECT });
  const member = t.withIdentity({ subject: MEMBER_SUBJECT });
  const question = { key: "q", title: "Goal?", description: "", required: true, type: "short_text" as const, options: [] };
  await owner.mutation(api.communityForms.saveBuilderForm, { communityId: f.communityId, key: "intake", expectedRevision: 0, name: "Intake", questions: [question] });
  await owner.mutation(api.communityForms.publishBuilderForm, { communityId: f.communityId, key: "intake", expectedRevision: 1 });
  const configured = await configureAutomations(t, f.communityId, [{ key: "", type: "request_form", formKey: "intake" }]);
  await owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
    communityId: f.communityId, milestoneKey: configured.firstKey, expectedRevision: 3, name: "New",
    automations: configured.firstMilestone.automations,
  });
  const rootId = await addRoot(t, f, "form");
  await t.mutation(internalApi.communityMemberWorkflows.handleChannelContributionRootInternal, { rootId });
  const request = (await t.run(ctx => ctx.db.query("communityFormRequests").first()))!;
  return { t, f, owner, member, question, request, rootId, configured };
}

async function formAgentFixture(assigned = true) {
  const s = await formFlowFixture();
  await s.owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
    communityId: s.f.communityId, milestoneKey: s.configured.firstKey, expectedRevision: 4, name: "New",
    automations: [{ trigger: { type: "form_submitted", formKey: "intake" }, action: { type: "prompt_agent", prompt: "Help with the submitted goal." } }],
  });
  if (assigned) {
    await s.t.run(async ctx => {
      await ctx.db.patch(s.f.channelId, { systemRole: undefined, slug: "service", position: 1, accessMode: "restricted" });
      for (const principalKey of [`user:${s.f.memberId}`, "community_agent"]) await ctx.db.insert("communityChannelParticipants", {
        communityId: s.f.communityId, channelId: s.f.channelId, principalKey,
        ...(principalKey !== "community_agent" ? { membershipId: s.f.membershipId, membershipActivationSequence: 1 } : {}),
        status: "active", createdByUserId: s.f.ownerId, createdAt: s.f.nowMs, updatedAt: s.f.nowMs,
      });
    });
    await s.owner.mutation(api.communityMemberWorkflows.setBuilderMemberServiceChannel, {
      communityId: s.f.communityId, membershipId: s.f.membershipId, channelId: s.f.channelId, expectedRevision: 0,
    });
  }
  const submit = () => s.member.mutation(api.communityFormRequests.saveMyAnswers, {
    communityId: s.f.communityId, requestId: s.request._id, expectedRevision: 0, answers: { q: "EXACT_SUBMITTED_GOAL" }, submit: true,
  });
  return { ...s, submit };
}

test("form submission queues one exact-source agent action and publishes once without moving", async () => {
  const s = await formAgentFixture();
  await s.submit(); await s.submit();
  const requests = await s.t.run(ctx => ctx.db.query("communityAgentServeRequests").collect());
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ status: "queued", workflowFormRequestId: s.request._id, serviceChannelId: s.f.channelId });
  expect(requests[0].workflowTimerId).toBeUndefined();
  expect(requests[0].sourceRootId).toBeUndefined();
  const claim = await s.t.mutation(internal.communityAgentServeWorker.claimNextCommunityAgentServeRequestInternal, { requestId: requests[0]._id });
  const args = { requestId: requests[0]._id, expectedAttempt: claim.attempt! };
  const context = await s.t.query(internal.communityAgentServeWorker.readCommunityAgentServeRequestContextInternal, args);
  expect(context.ok).toBe(true); if (!context.ok) return;
  expect(context.delivery).toBe("service_channel");
  expect(JSON.stringify(context)).toContain("EXACT_SUBMITTED_GOAL");
  const bundle = buildCommunityAgentServePromptBundle(context);
  const snapshotJson = JSON.stringify({ version: 2, sha256: "a".repeat(64), messages: bundle.messages,
    prompt_sections: bundle.systemPromptBundle.sections, timed_member_context: context.timedMemberContext });
  expect((await s.t.mutation(internal.communityAgentServeWorker.recordCommunityAgentServeContextSnapshotInternal, { ...args, snapshotJson })).ok).toBe(true);
  const send = () => s.t.mutation(internal.communityAgentServeWorker.finalizeCommunityAgentServeReplyInternal, { ...args, content: "One next step for your goal." });
  expect((await send()).ok).toBe(true); await send();
  expect(await s.t.run(ctx => ctx.db.query("communityInteractionRoots").filter(q => q.eq(q.field("actorType"), "community_agent")).collect())).toHaveLength(1);
  expect(await s.t.run(ctx => ctx.db.query("communityMemberWorkflowTransitions").collect())).toHaveLength(0);
});

test("missing service destination records failure without losing form submission", async () => {
  const s = await formAgentFixture(false); await s.submit(); await s.submit();
  expect((await s.t.run(ctx => ctx.db.get(s.request._id)))?.status).toBe("submitted");
  const runs = await s.t.run(ctx => ctx.db.query("communityMemberWorkflowRuns").collect());
  expect(runs.filter(r => r.triggerType === "form_submitted")).toHaveLength(1);
  expect(runs.find(r => r.triggerType === "form_submitted")?.status).toBe("failed");
});

test("exact submitted form remains first even outside the recent evidence scan", async () => {
  const s = await formAgentFixture(); await s.submit();
  await s.t.run(async ctx => {
    const original = (await ctx.db.get(s.request._id))!;
    const { _id, _creationTime, ...fields } = original;
    for (let i = 0; i < 55; i++) await ctx.db.insert("communityFormRequests", { ...fields, answers: { q: `OTHER_${i}` } });
  });
  const request = (await s.t.run(ctx => ctx.db.query("communityAgentServeRequests").first()))!;
  const claim = await s.t.mutation(internal.communityAgentServeWorker.claimNextCommunityAgentServeRequestInternal, { requestId: request._id });
  const result = await s.t.query(internal.communityAgentServeWorker.readCommunityAgentServeRequestContextInternal,
    { requestId: request._id, expectedAttempt: claim.attempt! });
  expect(result.ok).toBe(true); if (!result.ok) return;
  const evidence = JSON.parse(result.timedMemberContext!).submitted_form_evidence;
  expect(evidence.submissions[0].request_id).toBe(s.request._id);
  expect(evidence.submissions[0].questions[0].answer).toBe("EXACT_SUBMITTED_GOAL");
  expect(evidence.truncated).toBe(true);
});

test.each(["move", "reactivate", "source", "mixed", "shared", "rule"])("form agent rejects stale or unsafe authority: %s", async change => {
  const s = await formAgentFixture(); await s.submit();
  const request = (await s.t.run(ctx => ctx.db.query("communityAgentServeRequests").first()))!;
  const claim = await s.t.mutation(internal.communityAgentServeWorker.claimNextCommunityAgentServeRequestInternal, { requestId: request._id });
  await s.t.run(async ctx => {
    if (change === "move") await ctx.db.patch(s.request._id, { milestoneEnteredAt: 1 });
    if (change === "reactivate") await ctx.db.patch(s.f.membershipId, { activationSequence: 2 });
    if (change === "source") await ctx.db.patch(s.request._id, { status: "pending" });
    if (change === "mixed") await ctx.db.patch(request._id, { sourceRootId: s.rootId });
    if (change === "shared") await ctx.db.patch(s.f.channelId, { accessMode: "all_members" });
    if (change === "rule") {
      const workflow = (await ctx.db.get(s.request.workflowId))!;
      await ctx.db.patch(workflow._id, { milestones: workflow.milestones.map(m => ({ ...m, automations: [] })) });
    }
  });
  expect((await s.t.query(internal.communityAgentServeWorker.readCommunityAgentServeRequestContextInternal,
    { requestId: request._id, expectedAttempt: claim.attempt! })).ok).toBe(false);
});

test.each(["reactivate", "shared", "rule", "binding", "answers"])("moved form response rechecks publication authority: %s", async change => {
  const s = await formAgentFixture(); await s.submit();
  const request = (await s.t.run(ctx => ctx.db.query("communityAgentServeRequests").first()))!;
  const claim = await s.t.mutation(internal.communityAgentServeWorker.claimNextCommunityAgentServeRequestInternal, { requestId: request._id });
  const args = { requestId: request._id, expectedAttempt: claim.attempt! };
  const context = await s.t.query(internal.communityAgentServeWorker.readCommunityAgentServeRequestContextInternal, args);
  expect(context.ok).toBe(true); if (!context.ok) return;
  const bundle = buildCommunityAgentServePromptBundle(context);
  const snapshotJson = JSON.stringify({ version: 2, sha256: "a".repeat(64), messages: bundle.messages,
    prompt_sections: bundle.systemPromptBundle.sections, timed_member_context: context.timedMemberContext });
  await s.t.mutation(internal.communityAgentServeWorker.recordCommunityAgentServeContextSnapshotInternal, { ...args, snapshotJson });
  await s.t.run(async ctx => {
    await ctx.db.insert("communityMemberWorkflowMemberMilestones", { workflowId: s.request.workflowId,
      membershipId: s.f.membershipId, currentMilestoneKey: s.configured.secondKey, milestoneEnteredAt: s.f.nowMs + 10,
      transitionSeq: 1, createdAt: s.f.nowMs, updatedAt: s.f.nowMs });
    if (change === "reactivate") await ctx.db.patch(s.f.membershipId, { activationSequence: 2 });
    if (change === "shared") await ctx.db.patch(s.f.channelId, { accessMode: "all_members" });
    if (change === "binding") await ctx.db.patch(s.f.membershipId, { serviceChannelRevision: 2 });
    if (change === "answers") await ctx.db.patch(s.request._id, { answers: { q: "Changed evidence" }, revision: 2 });
    if (change === "rule") {
      const workflow = (await ctx.db.get(s.request.workflowId))!;
      await ctx.db.patch(workflow._id, { milestones: workflow.milestones.map(m => ({ ...m, automations: [] })) });
    }
  });
  expect((await s.t.mutation(internal.communityAgentServeWorker.finalizeCommunityAgentServeReplyInternal,
    { ...args, content: "Must not publish" })).ok).toBe(false);
  expect(await s.t.run(ctx => ctx.db.query("communityInteractionRoots").filter(q => q.eq(q.field("actorType"), "community_agent")).collect())).toHaveLength(0);
});

test("form submission rejects two competing rules for one form", async () => {
  const s = await formAgentFixture();
  await expect(s.owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
    communityId: s.f.communityId, milestoneKey: s.configured.firstKey, expectedRevision: 5, name: "New",
    automations: ["First", "Second"].map(prompt => ({ trigger: { type: "form_submitted" as const, formKey: "intake" }, action: { type: "prompt_agent" as const, prompt } })),
  })).rejects.toThrow("form_submission_trigger_duplicate");
});

test("form evidence: invalid ownership fails closed and answer truncation is explicit", async () => {
  const { t, f, owner, member, request } = await formFlowFixture();
  const scope = { communityId: f.communityId, membershipId: f.membershipId };
  await member.mutation(api.communityFormRequests.saveMyAnswers, { communityId: f.communityId, requestId: request._id,
    expectedRevision: 0, answers: { q: "x".repeat(2000) }, submit: true });
  const evidence = (await owner.query(dossierQuery, scope)).submitted_form_evidence;
  expect(evidence.truncated).toBe(true);
  expect(evidence.submissions[0].questions[0]).toMatchObject({ answer: "x".repeat(1000), truncated: true });
  await t.run(async ctx => {
    const other = await ctx.db.insert("communities", { ownerId: f.ownerId, name: "Other", slug: "other-evidence", visibility: "unlisted", entryPolicy: "approval", inferenceFundingPolicy: "managed_required", createdAt: Date.now(), updatedAt: Date.now() });
    await ctx.db.patch(request.versionId, { communityId: other });
  });
  expect((await owner.query(dossierQuery, scope)).submitted_form_evidence).toMatchObject({ submissions: [], unavailable_records: 1 });
  expect(await owner.query(api.communityFormRequests.listBuilderResponses, { ...scope, includeCompleteness: true })).toEqual({ rows: [], truncated: false, unavailable_records: 1 });
  expect(await owner.query(api.communityFormRequests.listBuilderResponses, scope)).toEqual([]);
});

test("form evidence: choices use pinned labels, scans and context are bounded, cancelled answers stay out", async () => {
  const { t, f, owner, request, question } = await formFlowFixture();
  await t.run(async ctx => {
    await ctx.db.patch(request.versionId, { questions: [{ ...question, type: "multiple_choice", options: ["First", "Second"] }] });
    await ctx.db.patch(request._id, { status: "cancelled", answers: { q: "CANCELLED_SECRET" } });
    const { _id, _creationTime, ...base } = request;
    for (let i = 0; i < 52; i++) await ctx.db.insert("communityFormRequests", {
      ...base, status: "submitted", answers: { q: ["1", "0"] }, submittedAt: f.nowMs + i,
    });
  });
  const evidence = (await owner.query(dossierQuery, { communityId: f.communityId, membershipId: f.membershipId })).submitted_form_evidence;
  expect(evidence.submissions).toHaveLength(5);
  const page = await owner.query(api.communityFormRequests.listBuilderResponses, { communityId: f.communityId, membershipId: f.membershipId, includeCompleteness: true });
  expect(page).toMatchObject({ truncated: true, unavailable_records: 0 });
  if (Array.isArray(page)) throw new Error("Expected completeness metadata");
  expect(page.rows).toHaveLength(50);
  expect(evidence.truncated).toBe(true);
  expect(evidence.submissions[0].questions[0].answer).toEqual(["Second", "First"]);
  expect(JSON.stringify(evidence)).not.toContain("CANCELLED_SECRET");
});

test("pending form admission stays capped across rule recreation and preserves existing requests", async () => {
  const { t, f, owner, request, configured, rootId } = await formFlowFixture();
  let revision = 4;
  for (let i = 0; i < 13; i++) {
    const saved = await owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
      communityId: f.communityId, milestoneKey: configured.firstKey, expectedRevision: revision, name: "New",
      automations: [{ trigger: { type: "member_contributed" }, action: { type: "request_form", formKey: "intake" } }],
    });
    revision = saved.revision;
    await t.mutation(internalApi.communityMemberWorkflows.handleChannelContributionRootInternal, { rootId: await addRoot(t, f, `cap-${i}`) });
  }
  const rows = await t.run(ctx => ctx.db.query("communityFormRequests").collect());
  expect(rows).toHaveLength(12);
  expect(rows.every(row => row.status === "pending")).toBe(true);
  expect(rows.some(row => row._id === request._id)).toBe(true);
  expect((await t.run(ctx => ctx.db.query("communityMemberWorkflowRuns").collect())).filter(r => r.errorCode === "form_pending_limit_reached")).toHaveLength(2);
  const dossier = await owner.query(dossierQuery, { communityId: f.communityId, membershipId: f.membershipId });
  expect(dossier.recent_workflow_activity.some(r => r.status === "failed" && r.failure_reason?.includes("12 pending forms"))).toBe(true);
  await t.mutation(internalApi.communityMemberWorkflows.handleChannelContributionRootInternal, { rootId });
  expect(await t.run(ctx => ctx.db.query("communityFormRequests").collect())).toHaveLength(12);
});

test("concurrent contribution assignments cannot overfill the last slot; old activations do not consume it", async () => {
  const { t, f, owner, configured, request } = await formFlowFixture();
  await t.run(async ctx => {
    const { _id, _creationTime, ...base } = request;
    for (let i = 0; i < 10; i++) await ctx.db.insert("communityFormRequests", { ...base, automationKey: `prior-${i}` });
  });
  await owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
    communityId: f.communityId, milestoneKey: configured.firstKey, expectedRevision: 4, name: "New",
    automations: [0, 1].map(() => ({ trigger: { type: "member_contributed" as const }, action: { type: "request_form" as const, formKey: "intake" } })),
  });
  const roots = [await addRoot(t, f, "concurrent-a"), await addRoot(t, f, "concurrent-b")];
  await Promise.all(roots.map(rootId => t.mutation(internalApi.communityMemberWorkflows.handleChannelContributionRootInternal, { rootId })));
  expect(await t.run(ctx => ctx.db.query("communityFormRequests").collect())).toHaveLength(12);
  await t.run(ctx => ctx.db.patch(f.membershipId, { activationSequence: request.activationSequence + 1 }));
  await t.mutation(internalApi.communityMemberWorkflows.handleChannelContributionRootInternal, { rootId: await addRoot(t, f, "new-activation") });
  expect((await t.run(ctx => ctx.db.query("communityFormRequests").collect())).filter(r => r.activationSequence !== request.activationSequence)).toHaveLength(2);
});

test("form privacy rejects another active member and rechecks administrator demotion", async () => {
  const { t, f, member, request } = await formFlowFixture();
  const otherMembership = await t.run(async ctx => {
    const userId = await ctx.db.insert("users", { authSubject: "form-privacy-other", displayName: "Other member", createdAt: f.nowMs, updatedAt: f.nowMs });
    return await ctx.db.insert("communityMemberships", { communityId: f.communityId, userId,
      role: "member", active: true, activationSequence: 1, accessSource: "manual_grant", createdAt: f.nowMs, updatedAt: f.nowMs });
  });
  const other = t.withIdentity({ subject: "form-privacy-other" });
  const requestArgs = { communityId: f.communityId, requestId: request._id };
  const scope = { communityId: f.communityId, membershipId: f.membershipId };
  await member.mutation(api.communityFormRequests.saveMyAnswers, { ...requestArgs,
    expectedRevision: 0, answers: { q: "PRIVATE_MEMBER_ANSWER" }, submit: false });
  await expect(other.query(api.communityFormRequests.getMyRequest, requestArgs)).rejects.toThrow("form_request_not_found");
  await expect(other.mutation(api.communityFormRequests.saveMyAnswers, { ...requestArgs,
    expectedRevision: 1, answers: { q: "OVERWRITE" }, submit: true })).rejects.toThrow("form_request_not_found");
  expect(await other.query(api.communityFormRequests.listMyRequests, { communityId: f.communityId })).toEqual([]);
  await expect(other.query(api.communityFormRequests.listBuilderResponses, scope)).rejects.toThrow("community_forbidden");
  await member.mutation(api.communityFormRequests.saveMyAnswers, { ...requestArgs,
    expectedRevision: 1, answers: { q: "PRIVATE_MEMBER_ANSWER" }, submit: true });
  await t.run(ctx => ctx.db.patch(otherMembership, { role: "admin" }));
  expect(JSON.stringify(await other.query(api.communityFormRequests.listBuilderResponses, scope))).toContain("PRIVATE_MEMBER_ANSWER");
  expect(JSON.stringify(await other.query(dossierQuery, scope))).toContain("PRIVATE_MEMBER_ANSWER");
  await t.run(ctx => ctx.db.patch(otherMembership, { role: "member" }));
  await expect(other.query(api.communityFormRequests.listBuilderResponses, scope)).rejects.toThrow("community_forbidden");
  await expect(other.query(dossierQuery, scope)).rejects.toThrow("community_forbidden");
});

test("forms: pinned questions, required validation, privacy and expired visits", async () => {
  const { t, f, member, owner, question, request } = await formFlowFixture();
  await owner.mutation(api.communityForms.saveBuilderForm, { communityId: f.communityId, key: "intake", expectedRevision: 1, name: "New intake", questions: [{ ...question, title: "Changed" }] });
  await owner.mutation(api.communityForms.publishBuilderForm, { communityId: f.communityId, key: "intake", expectedRevision: 2 });
  expect((await member.query(api.communityFormRequests.getMyRequest, { communityId: f.communityId, requestId: request._id })).questions[0].title).toBe("Goal?");
  await expect(owner.query(api.communityFormRequests.getMyRequest, { communityId: f.communityId, requestId: request._id })).rejects.toThrow("not_found");
  await expect(member.query(api.communityFormRequests.listBuilderResponses, { communityId: f.communityId, membershipId: f.membershipId })).rejects.toThrow();
  const args = { communityId: f.communityId, requestId: request._id, expectedRevision: 0, answers: {}, submit: true };
  await expect(member.mutation(api.communityFormRequests.saveMyAnswers, args)).rejects.toThrow("required");
  expect((await t.run(ctx => ctx.db.get(request._id)))?.status).toBe("pending");
  await t.run(ctx => ctx.db.patch(f.membershipId, { activationSequence: 2 }));
  expect(await member.query(api.communityFormRequests.listMyRequests, { communityId: f.communityId })).toEqual([]);
  await expect(member.mutation(api.communityFormRequests.saveMyAnswers, { ...args, answers: { q: "late" } })).rejects.toThrow("expired");
});

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
  // Edits do not rewrite the occurrence-time trigger, nor replay an old action.
  await t.withIdentity({ subject: OWNER_SUBJECT }).mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
    communityId: f.communityId, expectedRevision: 3, milestoneKey: configured.firstKey, name: "New",
    automations: configured.firstMilestone.automations.map(a => ({ ...a, trigger: { type: "member_contributed" as const } })),
  });
  expect((await run()).results[0].status).toBe("already_executed");
  expect((await t.run(ctx => ctx.db.get(runs[0]._id)))?.triggerSnapshot).toMatchObject({ channelId: selectedId });
});

async function workflowServeFixture(t: ReturnType<typeof convexTest>) {
  // Drive admission/claims explicitly; do not race the scheduled live worker.
  vi.useFakeTimers();
  const f = await fixture(t);
  const configured = await configureAutomations(t, f.communityId, [
    { key: "", type: "prompt_agent", prompt: "Help with the original New milestone task." },
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

test("milestone context saves, snapshots at admission, and never changes advancement", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const f = await fixture(t);
  const owner = t.withIdentity({ subject: OWNER_SUBJECT });
  const created = await owner.mutation(api.communityMemberWorkflows.createBuilderWorkflowMilestone, {
    communityId: f.communityId, expectedRevision: 0, name: "New",
    instructions: "  Coach gently.  ", goal: "A clear offer.",
  });
  expect(created.milestone.instructions).toBe("Coach gently.");
  const configured = await owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
    communityId: f.communityId, expectedRevision: 1, milestoneKey: created.milestone.key, name: "New",
    automations: [{ key: "", trigger: { type: "member_contributed" }, action: { key: "", type: "prompt_agent", prompt: "Offer one next step." } }],
  });
  expect(configured.milestone.goal).toBe("A clear offer."); // Older clients preserve context.
  const dossier = await owner.query(dossierQuery, { communityId: f.communityId, membershipId: f.membershipId });
  expect(dossier.membership_status).toBe("active");
  expect(dossier.workflow?.instructions).toBe("Coach gently.");
  expect(dossier.markdown).toContain("Instructions: Coach gently.");
  expect(dossier.markdown).toContain("Goal: A clear offer.");
  expect(dossier.markdown).toContain("Human approval required: No");
  expect(dossier.markdown).toContain("## Action progress");
  await t.mutation(internalApi.communityMemberWorkflows.handleChannelContributionRootInternal, { rootId: await addRoot(t, f, "context-snapshot") });
  const run = (await t.run(ctx => ctx.db.query("communityMemberWorkflowRuns").first()))!;
  expect(run.milestoneContextSnapshot).toEqual({ instructions: "Coach gently.", goal: "A clear offer." });
  const request = (await t.run(ctx => ctx.db.query("communityAgentServeRequests").first()))!;
  await owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
    communityId: f.communityId, expectedRevision: configured.revision, milestoneKey: created.milestone.key,
    name: "New", instructions: "", goal: "Replacement goal", automations: configured.milestone.automations,
  });
  const claim = await t.mutation(internalApi.communityAgentServeWorker.claimNextCommunityAgentServeRequestInternal, { requestId: request._id, nowMs: f.nowMs + 100 });
  const context = await t.query(internalApi.communityAgentServeWorker.readCommunityAgentServeRequestContextInternal, { requestId: request._id, expectedAttempt: claim.attempt });
  expect(context.ok).toBe(true);
  expect(context.workflowPrompt).toContain("Coach gently.");
  expect(context.workflowPrompt).toContain("A clear offer.");
  expect(context.workflowPrompt).not.toContain("Replacement goal");
  expect(await t.run(ctx => ctx.db.query("communityMemberWorkflowTransitions").collect())).toEqual([]);
  await expect(t.withIdentity({ subject: MEMBER_SUBJECT }).mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
    communityId: f.communityId, expectedRevision: 3, milestoneKey: created.milestone.key, name: "New", instructions: "Escalate", goal: "Pass", automations: [],
  })).rejects.toThrow();
});

test("contribution execution context is bound to the live requester and source", async () => {
  const t = convexTest(schema, modules);
  const f = await workflowServeFixture(t);
  vi.setSystemTime(f.nowMs + 100);
  const args = { requestId: f.request._id, expectedAttempt: f.claim.attempt };
  await t.run(async ctx => {
    const run = (await ctx.db.query("communityMemberWorkflowRuns").collect()).find(row => row._id === f.request.workflowRunId)!;
    const membership = (await ctx.db.get(f.membershipId))!;
    const questions = [{ key: "q", title: "Goal", description: "", type: "short_text" as const, required: true, options: [] }];
    const formId = await ctx.db.insert("communityForms", { communityId: f.communityId, key: "intake", name: "Intake", questions, revision: 1, createdAt: f.nowMs, updatedAt: f.nowMs });
    const versionId = await ctx.db.insert("communityFormVersions", { communityId: f.communityId, formId, revision: 1, name: "Intake", questions, publishedBy: f.ownerId, publishedAt: f.nowMs });
    await ctx.db.insert("communityFormRequests", { communityId: f.communityId, membershipId: f.membershipId,
      workflowId: run.workflowId, workflowRunId: run._id, automationKey: "historical-form", milestoneKey: "historical",
      milestoneEnteredAt: f.nowMs - 100, activationSequence: membership.activationSequence ?? 0, formKey: "intake", versionId,
      status: "submitted", answers: { q: "PRIVATE_EXECUTION_FORM" }, revision: 1, createdAt: f.nowMs, updatedAt: f.nowMs, submittedAt: f.nowMs });
  });
  const context = await t.query(internalApi.communityMemberWorkflows.getWorkflowExecutionContextInternal, args);
  expect(context.user_id).toBe(String(f.memberId));
  expect(context.community_id).toBe(String(f.communityId));
  expect(context.submitted_form_evidence.submissions[0].questions[0].answer).toBe("PRIVATE_EXECUTION_FORM");
  expect(JSON.stringify(await f.read())).not.toContain("PRIVATE_EXECUTION_FORM");
  await expect(t.query(internalApi.communityMemberWorkflows.getWorkflowExecutionContextInternal, { ...args, expectedAttempt: args.expectedAttempt + 1 })).rejects.toThrow();
  vi.setSystemTime(f.nowMs + 24 * 60 * 60 * 1000);
  await expect(t.query(internalApi.communityMemberWorkflows.getWorkflowExecutionContextInternal, args)).rejects.toThrow("workflow_context_forbidden");
  vi.setSystemTime(f.nowMs + 100);
  await t.run(ctx => ctx.db.patch(f.rootId, { status: "hidden" }));
  await expect(t.query(internalApi.communityMemberWorkflows.getWorkflowExecutionContextInternal, args)).rejects.toThrow();
});

function workflowOrientation(context: any) {
  expect(context.ok).toBe(true);
  const line = context.threadContext.rendered.split("\n").find((value: string) => value.startsWith("Workflow orientation"));
  expect(line).toBeDefined();
  return JSON.parse(line.slice(line.indexOf(": ") + 2));
}

test("workflow context uses read-only defaults, preserves completion, and allows absent current workflow", async () => {
  const t = convexTest(schema, modules);
  const f = await workflowServeFixture(t);
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
  expect(created.milestone).toEqual({ key: expect.any(String), name: "New", instructions: "", goal: "", requireHumanApproval: false, automations: [] });
  const rootId = await addRoot(t, f, "blank");
  await expect(t.mutation(internalApi.communityMemberWorkflows.handleChannelContributionRootInternal, { rootId }))
    .resolves.toMatchObject({ status: "trigger_unconfigured" });
  expect(await t.run(async (ctx) => await ctx.db.query("communityMemberWorkflowRuns").collect())).toHaveLength(0);
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
  expect(queuedDossier.workflow?.action_progress?.actions[0].status).toBe("pending");

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
  expect(respondedDossier.workflow?.action_progress?.actions[0].status).toBe("unavailable");
  const responseId = await t.run(async ctx => {
    const id = await ctx.db.insert("communityInteractionReplies", {
      communityId: f.communityId, channelId: f.channelId, rootId, seq: 1,
      actorType: "community_agent", actorAgentKey: state.requests[0].agentKey, status: "live",
      visibilityScope: "community", contentSummary: "Here is your next step.", reactionSummary: [],
      idempotencyKey: `community_agent_serve:${state.requests[0]._id}`,
      createdAt: f.nowMs + 20, updatedAt: f.nowMs + 20,
    });
    await ctx.db.patch(state.requests[0]._id, { responseReplyId: id });
    return id;
  });
  const completedDossier = await owner.query(api.communityMemberWorkflows.getBuilderWorkflowMemberSuccessDossier,
    { communityId: f.communityId, membershipId: f.membershipId });
  expect(completedDossier.workflow?.action_progress?.all_actions_complete).toBe(true);
  await t.run(async ctx => {
    const run = (await ctx.db.get(state.runs[0]._id))!;
    if (run.actionSnapshot.type !== "prompt_agent") throw new Error("expected prompt fixture");
    await ctx.db.patch(run._id, { actionSnapshot: { ...run.actionSnapshot, prompt: "Different work." } });
  });
  const changedPromptDossier = await owner.query(api.communityMemberWorkflows.getBuilderWorkflowMemberSuccessDossier,
    { communityId: f.communityId, membershipId: f.membershipId });
  expect(changedPromptDossier.workflow?.action_progress?.actions[0].status).toBe("unavailable");
  await t.run(ctx => ctx.db.patch(state.runs[0]._id, { actionSnapshot: state.runs[0].actionSnapshot }));
  await t.run(async ctx => { await ctx.db.delete(responseId); });
  const missingDossier = await owner.query(api.communityMemberWorkflows.getBuilderWorkflowMemberSuccessDossier,
    { communityId: f.communityId, membershipId: f.membershipId });
  expect(missingDossier.workflow?.action_progress?.actions[0].status).toBe("unavailable");
  expect(respondedDossier.markdown).toContain(
    "Agent prompt responded in New — Help the member choose one concrete next step.",
  );
});

test("finishing every lesson in a course requests the stage's checkpoint form once; one lesson alone does not", async () => {
  const t = convexTest(schema, modules), f = await fixture(t);
  const owner = t.withIdentity({ subject: OWNER_SUBJECT });
  const question = { key: "q", title: "What did you build?", description: "", required: true, type: "short_text" as const, options: [] };
  await owner.mutation(api.communityForms.saveBuilderForm, { communityId: f.communityId, key: "checkpoint", expectedRevision: 0, name: "Checkpoint", questions: [question] });
  await owner.mutation(api.communityForms.publishBuilderForm, { communityId: f.communityId, key: "checkpoint", expectedRevision: 1 });
  const { moduleId, first, second } = await t.run(async (ctx) => {
    const now = Date.now();
    const moduleId = await ctx.db.insert("communityResourceModules", {
      communityId: f.communityId, createdByUserId: f.ownerId, status: "live", name: "Your first skill", sortOrder: 1, createdAt: now, updatedAt: now,
    });
    const page = (title: string, sortOrder: number) => ctx.db.insert("communityResources", {
      communityId: f.communityId, moduleId, createdByUserId: f.ownerId, type: "post", role: "page", status: "published",
      title, bodyMd: "Go.", bodyChars: 3, pinned: false, sortOrder, createdAt: now, updatedAt: now,
    } as any);
    return { moduleId, first: await page("What is a skill", 1), second: await page("Build one", 2) };
  });
  const configured = await configureAutomations(t, f.communityId, []);
  await expect(owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
    communityId: f.communityId, milestoneKey: configured.firstKey, expectedRevision: 3, name: "New",
    automations: [{ key: "", trigger: { type: "lesson_completed" as const }, action: { key: "", type: "create_service_channel" as const } }],
  })).rejects.toThrow("workflow_join_action_invalid");
  await owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
    communityId: f.communityId, milestoneKey: configured.firstKey, expectedRevision: 3, name: "New",
    automations: [{ key: "", trigger: { type: "course_completed" as const, moduleId: String(moduleId) },
      action: { key: "", type: "request_form" as const, formKey: "checkpoint" } }],
  });
  const finish = async (resourceId: any) => {
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("communityResourceProgress", {
        communityId: f.communityId, userId: f.memberId, resourceId, status: "done", startedAt: now, completedAt: now, updatedAt: now,
      });
    });
    return await t.mutation(internalApi.communityMemberWorkflows.handleLessonCompletedInternal,
      { communityId: f.communityId, userId: f.memberId, resourceId });
  };
  expect(await finish(first)).toMatchObject({ status: "trigger_unconfigured" });
  expect(await t.run(ctx => ctx.db.query("communityFormRequests").collect())).toHaveLength(0);
  expect(await finish(second)).toMatchObject({ status: "handled" });
  const requests = await t.run(ctx => ctx.db.query("communityFormRequests").collect());
  expect(requests).toMatchObject([{ formKey: "checkpoint", status: "pending" }]);
  const runs = await t.run(ctx => ctx.db.query("communityMemberWorkflowRuns").collect());
  expect(runs).toMatchObject([{ triggerType: "course_completed", status: "finished" }]);
  // A replay of the same completion runs nothing new.
  await t.mutation(internalApi.communityMemberWorkflows.handleLessonCompletedInternal,
    { communityId: f.communityId, userId: f.memberId, resourceId: second });
  expect(await t.run(ctx => ctx.db.query("communityMemberWorkflowRuns").collect())).toHaveLength(1);
  expect(await t.run(ctx => ctx.db.query("communityFormRequests").collect())).toHaveLength(1);
});

test("finishing the last step of a Roadmap track sets a client property once; a missing track can't be named", async () => {
  const t = convexTest(schema, modules), f = await fixture(t);
  const owner = t.withIdentity({ subject: OWNER_SUBJECT });
  await owner.mutation(api.communityClients.createClientProperty, { communityId: f.communityId, name: "Phase", type: "select", options: ["Onboarding", "Building"] });
  const { first, second } = await t.run(async (ctx) => {
    const now = Date.now();
    const moduleId = await ctx.db.insert("communityResourceModules", {
      communityId: f.communityId, createdByUserId: f.ownerId, status: "live", name: "Business X-Ray", sortOrder: 1, createdAt: now, updatedAt: now,
    });
    const page = (title: string, sortOrder: number) => ctx.db.insert("communityResources", {
      communityId: f.communityId, moduleId, createdByUserId: f.ownerId, type: "post", role: "page", status: "published",
      title, bodyMd: "Go.", bodyChars: 3, pinned: false, sortOrder, createdAt: now, updatedAt: now,
    } as any);
    const first = await page("Map the business", 1), second = await page("Find the bottleneck", 2);
    await ctx.db.insert("communityLessonTracks", {
      communityId: f.communityId, key: "xray", title: "Business X-Ray deep dive", order: 1, show: "always", opensWhen: [],
      stages: [{ name: "Map", steps: [{ resource_id: String(first) }, { resource_id: String(second), checkpoint: true }] }],
      revision: 1, createdByUserId: f.ownerId, updatedByUserId: f.ownerId, createdAt: now, updatedAt: now,
    });
    return { first, second };
  });
  const configured = await configureAutomations(t, f.communityId, []);
  const save = (trackKey: string) => owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
    communityId: f.communityId, milestoneKey: configured.firstKey, expectedRevision: 3, name: "New",
    automations: [{ key: "", trigger: { type: "track_completed" as const, trackKey },
      action: { key: "", type: "set_client_property" as const, propertyKey: "phase", value: "Building" } }],
  });
  await expect(save("nope")).rejects.toThrow("workflow_track_unavailable");
  await save("xray");
  const finish = async (resourceId: any) => {
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("communityResourceProgress", {
        communityId: f.communityId, userId: f.memberId, resourceId, status: "done", startedAt: now, completedAt: now, updatedAt: now,
      });
    });
    return await t.mutation(internalApi.communityMemberWorkflows.handleLessonCompletedInternal,
      { communityId: f.communityId, userId: f.memberId, resourceId });
  };
  await finish(first);
  expect(await t.run(ctx => ctx.db.query("communityMemberWorkflowRuns").collect())).toHaveLength(0);
  expect(await finish(second)).toMatchObject({ status: "handled" });
  const runs = await t.run(ctx => ctx.db.query("communityMemberWorkflowRuns").collect());
  expect(runs).toMatchObject([{ triggerType: "track_completed", status: "finished" }]);
  await t.mutation(internalApi.communityMemberWorkflows.handleLessonCompletedInternal,
    { communityId: f.communityId, userId: f.memberId, resourceId: second });
  expect(await t.run(ctx => ctx.db.query("communityMemberWorkflowRuns").collect())).toHaveLength(1);
});

test("a stage rule writes a client property when a lesson is done; an archived property fails the run, not the lesson", async () => {
  const t = convexTest(schema, modules), f = await fixture(t);
  const owner = t.withIdentity({ subject: OWNER_SUBJECT });
  await owner.mutation(api.communityClients.createClientProperty, { communityId: f.communityId, name: "Phase", type: "select", options: ["Onboarding", "Building"] });
  const { first, second } = await t.run(async (ctx) => {
    const now = Date.now();
    const moduleId = await ctx.db.insert("communityResourceModules", {
      communityId: f.communityId, createdByUserId: f.ownerId, status: "live", name: "Start", sortOrder: 1, createdAt: now, updatedAt: now,
    });
    const page = (title: string, sortOrder: number) => ctx.db.insert("communityResources", {
      communityId: f.communityId, moduleId, createdByUserId: f.ownerId, type: "post", role: "page", status: "published",
      title, bodyMd: "Go.", bodyChars: 3, pinned: false, sortOrder, createdAt: now, updatedAt: now,
    } as any);
    return { first: await page("One", 1), second: await page("Two", 2) };
  });
  const configured = await configureAutomations(t, f.communityId, []);
  const save = (propertyKey: string, value: any, resourceId?: any) => owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
    communityId: f.communityId, milestoneKey: configured.firstKey, expectedRevision: 3, name: "New",
    automations: [{ key: "", trigger: { type: "lesson_completed" as const, ...(resourceId ? { resourceId: String(resourceId) } : {}) },
      action: { key: "", type: "set_client_property" as const, propertyKey, value } }],
  });
  await expect(save("missing", "Building")).rejects.toThrow("client_property_not_found");
  await expect(save("phase", "Nope")).rejects.toThrow("client_property_value_invalid");
  const saved = await save("phase", "building");
  expect(saved.milestone.automations[0].action).toMatchObject({ type: "set_client_property", value: "Building" });
  const finish = async (resourceId: any) => {
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("communityResourceProgress", {
        communityId: f.communityId, userId: f.memberId, resourceId, status: "done", startedAt: now, completedAt: now, updatedAt: now,
      });
    });
    return await t.mutation(internalApi.communityMemberWorkflows.handleLessonCompletedInternal,
      { communityId: f.communityId, userId: f.memberId, resourceId });
  };
  await finish(first);
  expect(await t.run(ctx => ctx.db.query("communityClientValues").collect())).toMatchObject([{ propertyKey: "phase", value: "Building", updatedVia: "workflow" }]);
  const timeline = await owner.query(api.communityClients.getClientTimeline, { communityId: f.communityId, membershipId: String(f.membershipId) });
  expect(timeline.entries.some((entry: any) => entry.summary === 'Workflow set phase to "Building"')).toBe(true);
  // Finishing the lesson is member work, so this rule counts toward completing the stage.
  const progress = await t.run(async (ctx) => {
    const { readWorkflowActionProgress } = await import("./communityWorkflowCompletionCore");
    const workflow = (await ctx.db.query("communityMemberWorkflows").first())!;
    const run = (await ctx.db.query("communityMemberWorkflowRuns").first())!;
    return readWorkflowActionProgress(ctx as any, { workflow, membership: (await ctx.db.get(f.membershipId))!,
      milestone: workflow.milestones[0] as any, milestoneEnteredAt: run.milestoneEnteredAt ?? 0, transitionSeq: run.transitionSeq ?? 0 });
  });
  expect(progress).toMatchObject({ all_actions_complete: true,
    actions: [{ action_type: "set_client_property", label: "Lesson done, then set Phase", status: "complete" }] });
  await owner.mutation(api.communityClients.archiveClientProperty, { communityId: f.communityId, key: "phase" });
  expect(await finish(second)).toMatchObject({ status: "handled" });
  const runs = await t.run(ctx => ctx.db.query("communityMemberWorkflowRuns").collect());
  expect(runs.map(run => run.status).sort()).toEqual(["failed", "finished"]);
  expect(await t.run(ctx => ctx.db.query("communityResourceProgress").collect())).toHaveLength(2);
});

test("a nudge only asks the agent and never holds the stage open", async () => {
  const t = convexTest(schema, modules), f = await fixture(t);
  const owner = t.withIdentity({ subject: OWNER_SUBJECT });
  await owner.mutation(api.communityClients.createClientProperty, { communityId: f.communityId, name: "Journey", type: "select", options: ["Finished first lesson"] });
  const lesson = await t.run(async (ctx) => {
    const now = Date.now();
    const moduleId = await ctx.db.insert("communityResourceModules", {
      communityId: f.communityId, createdByUserId: f.ownerId, status: "live", name: "Start", sortOrder: 1, createdAt: now, updatedAt: now,
    });
    return ctx.db.insert("communityResources", {
      communityId: f.communityId, moduleId, createdByUserId: f.ownerId, type: "post", role: "page", status: "published",
      title: "One", bodyMd: "Go.", bodyChars: 3, pinned: false, sortOrder: 1, createdAt: now, updatedAt: now,
    } as any);
  });
  const configured = await configureAutomations(t, f.communityId, []);
  const lessonRule = { key: "", trigger: { type: "lesson_completed" as const }, action: { key: "", type: "set_client_property" as const, propertyKey: "journey", value: "Finished first lesson" } };
  const save = (nudgeAction: any) => owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
    communityId: f.communityId, milestoneKey: configured.firstKey, expectedRevision: 3, name: "First win",
    automations: [lessonRule, { key: "", trigger: { type: "milestone_elapsed" as const, delayMinutes: 4320, nudge: true }, action: nudgeAction }],
  });
  await expect(save({ key: "", type: "request_form", formKey: "intake" })).rejects.toThrow("workflow_nudge_action_invalid");
  const saved = await save({ key: "", type: "prompt_agent", prompt: "Check in kindly." });
  expect(saved.milestone.automations[1].trigger).toEqual({ type: "milestone_elapsed", delayMinutes: 4320, nudge: true });
  await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("communityResourceProgress", { communityId: f.communityId, userId: f.memberId, resourceId: lesson, status: "done", startedAt: now, completedAt: now, updatedAt: now });
  });
  await t.mutation(internalApi.communityMemberWorkflows.handleLessonCompletedInternal, { communityId: f.communityId, userId: f.memberId, resourceId: lesson });
  // The lesson is the stage's only work; the three-day nudge hasn't fired and doesn't count.
  const progress = await t.run(async (ctx) => {
    const { readWorkflowActionProgress } = await import("./communityWorkflowCompletionCore");
    const workflow = (await ctx.db.query("communityMemberWorkflows").first())!;
    const run = (await ctx.db.query("communityMemberWorkflowRuns").first())!;
    return readWorkflowActionProgress(ctx as any, { workflow, membership: (await ctx.db.get(f.membershipId))!,
      milestone: workflow.milestones[0] as any, milestoneEnteredAt: run.milestoneEnteredAt ?? 0, transitionSeq: run.transitionSeq ?? 0 });
  });
  expect(progress).toMatchObject({ all_actions_complete: true, actions: [{ action_type: "set_client_property", status: "complete" }] });
});

test("a stage only members who left ever reached can be deleted; a current member still holds it", async () => {
  const t = convexTest(schema, modules), f = await fixture(t);
  const owner = t.withIdentity({ subject: OWNER_SUBJECT });
  const configured = await configureAutomations(t, f.communityId, []);
  const { workflowId, departed } = await t.run(async (ctx) => {
    const workflow = (await ctx.db.query("communityMemberWorkflows").first())!;
    const { _id, _creationTime, ...member } = (await ctx.db.get(f.membershipId))!;
    const departed = await ctx.db.insert("communityMemberships", member);
    await ctx.db.delete(departed);
    return { workflowId: workflow._id, departed };
  });
  const place = (membershipId: any) => t.run(ctx => ctx.db.insert("communityMemberWorkflowMemberMilestones", {
    workflowId, membershipId, currentMilestoneKey: configured.secondKey, milestoneEnteredAt: 1, transitionSeq: 1, createdAt: 1, updatedAt: 1,
  }));
  const live = await place(f.membershipId);
  await place(departed);
  const remove = () => owner.mutation(api.communityMemberWorkflows.deleteBuilderWorkflowMilestone,
    { communityId: f.communityId, expectedRevision: 3, milestoneKey: configured.secondKey });
  await expect(remove()).rejects.toThrow("community_member_workflow_milestone_has_members");
  await t.run(ctx => ctx.db.delete(live));
  await remove();
  expect(await t.run(ctx => ctx.db.query("communityMemberWorkflowMemberMilestones").collect())).toHaveLength(0);
});

test("a stage with more departed positions than one call clears asks to be called again, then deletes", async () => {
  const t = convexTest(schema, modules), f = await fixture(t);
  const owner = t.withIdentity({ subject: OWNER_SUBJECT });
  const configured = await configureAutomations(t, f.communityId, []);
  await t.run(async (ctx) => {
    const workflow = (await ctx.db.query("communityMemberWorkflows").first())!;
    const { _id, _creationTime, ...member } = (await ctx.db.get(f.membershipId))!;
    const departed = await ctx.db.insert("communityMemberships", member);
    await ctx.db.delete(departed);
    for (let i = 0; i < 1_001; i += 1) {
      await ctx.db.insert("communityMemberWorkflowMemberMilestones", { workflowId: workflow._id, membershipId: departed,
        currentMilestoneKey: configured.secondKey, milestoneEnteredAt: 1, transitionSeq: 1, createdAt: 1, updatedAt: 1 });
    }
  });
  const remove = () => owner.mutation(api.communityMemberWorkflows.deleteBuilderWorkflowMilestone,
    { communityId: f.communityId, expectedRevision: 3, milestoneKey: configured.secondKey });
  expect(await remove()).toMatchObject({ revision: 3, pending_cleanup: true });
  expect(await t.run(ctx => ctx.db.query("communityMemberWorkflowMemberMilestones").collect())).toHaveLength(1);
  expect(await remove()).toMatchObject({ revision: 4 });
  expect(await t.run(ctx => ctx.db.query("communityMemberWorkflowMemberMilestones").collect())).toHaveLength(0);
});

test("leaving a community removes the member's stage position with their membership", async () => {
  const t = convexTest(schema, modules), f = await fixture(t);
  const configured = await configureAutomations(t, f.communityId, []);
  await t.run(async (ctx) => {
    const workflow = (await ctx.db.query("communityMemberWorkflows").first())!;
    await ctx.db.insert("communityMemberWorkflowMemberMilestones", { workflowId: workflow._id, membershipId: f.membershipId,
      currentMilestoneKey: configured.secondKey, milestoneEnteredAt: 1, transitionSeq: 1, createdAt: 1, updatedAt: 1 });
  });
  await t.withIdentity({ subject: MEMBER_SUBJECT }).mutation(api.communityAdmin.leaveCommunity, { communityId: f.communityId });
  expect(await t.run(ctx => ctx.db.get(f.membershipId))).toBeNull();
  expect(await t.run(ctx => ctx.db.query("communityMemberWorkflowMemberMilestones").collect())).toHaveLength(0);
});

test("a lesson-done property write that failed runs again once repaired, and an edited rule needs a fresh write", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules), f = await fixture(t);
  const owner = t.withIdentity({ subject: OWNER_SUBJECT });
  await owner.mutation(api.communityClients.createClientProperty, { communityId: f.communityId, name: "Phase", type: "select", options: ["Onboarding", "Building"] });
  const lesson = await t.run(async (ctx) => {
    const now = Date.now();
    const moduleId = await ctx.db.insert("communityResourceModules", {
      communityId: f.communityId, createdByUserId: f.ownerId, status: "live", name: "Start", sortOrder: 1, createdAt: now, updatedAt: now,
    });
    return await ctx.db.insert("communityResources", {
      communityId: f.communityId, moduleId, createdByUserId: f.ownerId, type: "post", role: "page", status: "published",
      title: "One", bodyMd: "Go.", bodyChars: 3, pinned: false, sortOrder: 1, createdAt: now, updatedAt: now,
    } as any);
  });
  const configured = await configureAutomations(t, f.communityId, []);
  const save = (expectedRevision: number, value: string, keys?: { key: string; action: string }) =>
    owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
      communityId: f.communityId, milestoneKey: configured.firstKey, expectedRevision, name: "New",
      automations: [{ key: keys?.key ?? "", trigger: { type: "lesson_completed" as const, resourceId: String(lesson) },
        action: { key: keys?.action ?? "", type: "set_client_property" as const, propertyKey: "phase", value } }],
    });
  const saved = await save(3, "Building");
  const rule = saved.milestone.automations[0];
  // The owner removes the option the rule writes, then the member finishes the lesson.
  await owner.mutation(api.communityClients.updateClientProperty, { communityId: f.communityId, key: "phase", options: ["Onboarding"] });
  await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("communityResourceProgress", {
      communityId: f.communityId, userId: f.memberId, resourceId: lesson, status: "done", startedAt: now, completedAt: now, updatedAt: now,
    });
  });
  await t.mutation(internalApi.communityMemberWorkflows.handleLessonCompletedInternal, { communityId: f.communityId, userId: f.memberId, resourceId: lesson });
  const progress = () => t.run(async (ctx) => {
    const { readWorkflowActionProgress } = await import("./communityWorkflowCompletionCore");
    const workflow = (await ctx.db.query("communityMemberWorkflows").first())!;
    const run = (await ctx.db.query("communityMemberWorkflowRuns").first())!;
    return readWorkflowActionProgress(ctx as any, { workflow, membership: (await ctx.db.get(f.membershipId))!,
      milestone: workflow.milestones[0] as any, milestoneEnteredAt: run.milestoneEnteredAt ?? 0, transitionSeq: run.transitionSeq ?? 0 });
  });
  expect(await progress()).toMatchObject({ all_actions_complete: false, actions: [{ status: "failed", retryable: true }] });
  const retry = () => t.run(async (ctx) => {
    const workflow = (await ctx.db.query("communityMemberWorkflows").first())!;
    const run = (await ctx.db.query("communityMemberWorkflowRuns").first())!;
    return { communityId: f.communityId, membershipId: f.membershipId, expectedWorkflowId: workflow._id,
      expectedWorkflowRevision: workflow.revision, expectedMilestoneKey: configured.firstKey,
      expectedMilestoneEnteredAt: run.milestoneEnteredAt, expectedActivationSequence: run.activationSequence ?? 0,
      expectedTransitionSeq: run.transitionSeq ?? 0, automationKey: rule.key };
  }).then(args => owner.mutation(api.communityMemberWorkflows.retryBuilderMemberWorkflowAction, args));
  // Running it again before the repair fails again and stays retryable.
  expect(await retry()).toMatchObject({ status: "action_failed" });
  expect(await progress()).toMatchObject({ actions: [{ status: "failed", retryable: true }] });
  await owner.mutation(api.communityClients.updateClientProperty, { communityId: f.communityId, key: "phase", options: ["Onboarding", "Building"] });
  expect(await retry()).toMatchObject({ status: "client_property_set" });
  expect(await progress()).toMatchObject({ all_actions_complete: true, actions: [{ status: "complete" }] });
  expect((await progress()).actions[0].retryable).toBeUndefined();
  await expect(retry()).rejects.toThrow("community_member_workflow_action_retry_unavailable");
  expect(await t.run(ctx => ctx.db.query("communityClientValues").collect())).toMatchObject([{ propertyKey: "phase", value: "Building" }]);
  // The builder changes the value the same rule writes: the old write no longer counts.
  await save(4, "Onboarding", { key: rule.key, action: rule.action.key });
  expect(await progress()).toMatchObject({ all_actions_complete: false, actions: [{ status: "unavailable", retryable: true }] });
  expect(await retry()).toMatchObject({ status: "client_property_set" });
  expect(await progress()).toMatchObject({ all_actions_complete: true, actions: [{ status: "complete" }] });
  expect(await t.run(ctx => ctx.db.query("communityClientValues").collect())).toMatchObject([{ propertyKey: "phase", value: "Onboarding" }]);
  // Back to the first value: that older write was replaced, so it no longer counts.
  await save(5, "Building", { key: rule.key, action: rule.action.key });
  expect(await progress()).toMatchObject({ all_actions_complete: false, actions: [{ status: "unavailable", retryable: true }] });
  expect(await retry()).toMatchObject({ status: "client_property_set" });
  expect(await progress()).toMatchObject({ all_actions_complete: true, actions: [{ status: "complete" }] });
  expect(await t.run(ctx => ctx.db.query("communityClientValues").collect())).toMatchObject([{ propertyKey: "phase", value: "Building" }]);
  // Each success completes the stage once the scheduled check runs.
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const state = await t.run(ctx => ctx.db.query("communityMemberWorkflowMemberMilestones").first());
  expect(state).toMatchObject({ currentMilestoneKey: configured.secondKey });
});


// ---- Branches ("Only if"), waits, and lesson-started agent steps ----

async function branchFixture() {
  vi.useFakeTimers();
  const t = convexTest(schema, modules), f = await fixture(t);
  vi.setSystemTime(f.nowMs + 1_000);
  const owner = t.withIdentity({ subject: OWNER_SUBJECT });
  for (const name of ["Plan", "Tag", "Other"]) {
    await owner.mutation(api.communityClients.createClientProperty, { communityId: f.communityId, name, type: "text", options: [] });
  }
  const configured = await configureAutomations(t, f.communityId, []);
  const values = () => t.run(async ctx => Object.fromEntries((await ctx.db.query("communityClientValues").collect()).map(row => [row.propertyKey, row.value])));
  const runs = () => t.run(ctx => ctx.db.query("communityMemberWorkflowRuns").collect());
  return { t, f, owner, configured, values, runs };
}

test("only-if branches: the matching path runs, the other path and everything after it is skipped, and the stage completes", async () => {
  const { t, f, owner, configured, values, runs } = await branchFixture();
  const set = (key: string, propertyKey: string, value: string) => ({ key, type: "set_client_property" as const, propertyKey, value });
  await owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
    communityId: f.communityId, milestoneKey: configured.firstKey, expectedRevision: 3, name: "New",
    automations: [
      { trigger: { type: "member_contributed" as const }, action: set("draft-plan", "plan", "pro") },
      { condition: { propertyKey: "plan", op: "is" as const, value: "Pro" }, trigger: { type: "previous_action_completed" as const, predecessorActionKey: "draft-plan" }, action: set("draft-yes", "tag", "yes") },
      { condition: { propertyKey: "plan", op: "is" as const, value: "basic" }, trigger: { type: "previous_action_completed" as const, predecessorActionKey: "draft-plan" }, action: set("draft-no", "tag", "no") },
      { trigger: { type: "previous_action_completed" as const, predecessorActionKey: "draft-no" }, action: set("draft-after-no", "other", "x") },
    ],
  });
  const rootId = await addRoot(t, f, "branch");
  await t.mutation(internalApi.communityMemberWorkflows.handleChannelContributionRootInternal, { rootId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await values()).toEqual({ plan: "pro", tag: "yes" });
  const codes = (await runs()).map(run => run.actionResult?.resultCode).sort();
  expect(codes).toEqual(["client_property_set", "client_property_set", "condition_skipped", "path_skipped"]);
  const state = await t.run(ctx => ctx.db.query("communityMemberWorkflowMemberMilestones").first());
  expect(state?.currentMilestoneKey).toBe(configured.secondKey);
  vi.useRealTimers();
});

test("only-if groups: all/any join up to four conditions, and an Otherwise step runs exactly when they don't hold", async () => {
  const { t, f, owner, configured, values, runs } = await branchFixture();
  const set = (key: string, propertyKey: string, value: string) => ({ key, type: "set_client_property" as const, propertyKey, value });
  const after = { type: "previous_action_completed" as const, predecessorActionKey: "draft-plan" };
  const proAndTagged = { propertyKey: "plan", op: "is" as const, value: "pro", match: "all" as const, also: [{ propertyKey: "tag", op: "is_set" as const }] };
  const saved = await owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
    communityId: f.communityId, milestoneKey: configured.firstKey, expectedRevision: 3, name: "New",
    automations: [
      { trigger: { type: "member_contributed" as const }, action: set("draft-plan", "plan", "pro") },
      // AND: plan is pro but no tag yet, so this one is skipped...
      { condition: proAndTagged, trigger: after, action: set("draft-and", "other", "and") },
      // ...and its Otherwise runs instead.
      { condition: { ...proAndTagged, otherwise: true }, trigger: after, action: set("draft-else", "tag", "else") },
      // OR: plan is basic or plan is pro, so this runs.
      { condition: { propertyKey: "plan", op: "is" as const, value: "basic", match: "any" as const, also: [{ propertyKey: "plan", op: "is" as const, value: "pro" }] },
        trigger: { type: "previous_action_completed" as const, predecessorActionKey: "draft-else" }, action: set("draft-or", "other", "or") },
    ],
  });
  expect(saved.milestone!.automations[2].condition).toEqual({ ...proAndTagged, otherwise: true });
  const rootId = await addRoot(t, f, "groups");
  await t.mutation(internalApi.communityMemberWorkflows.handleChannelContributionRootInternal, { rootId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await values()).toEqual({ plan: "pro", tag: "else", other: "or" });
  const codes = (await runs()).map(run => run.actionResult?.resultCode).sort();
  expect(codes).toEqual(["client_property_set", "client_property_set", "client_property_set", "condition_skipped"]);
  const state = await t.run(ctx => ctx.db.query("communityMemberWorkflowMemberMilestones").first());
  expect(state?.currentMilestoneKey).toBe(configured.secondKey);
  vi.useRealTimers();
});

test("only-if groups refuse more than four conditions and an unknown join", async () => {
  const { f, owner, configured } = await branchFixture();
  const save = (condition: unknown) => owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
    communityId: f.communityId, milestoneKey: configured.firstKey, expectedRevision: 3, name: "New",
    automations: [{ condition: condition as any, trigger: { type: "member_contributed" as const }, action: { key: "draft-a", type: "set_client_property" as const, propertyKey: "plan", value: "x" } }],
  });
  const clause = { propertyKey: "tag", op: "is_set" as const };
  await expect(save({ ...clause, also: [clause, clause, clause, clause] })).rejects.toThrow(/workflow_condition_too_many_clauses/);
  await expect(save({ ...clause, match: "most", also: [clause] })).rejects.toThrow();
  vi.useRealTimers();
});

test("a member record change starts its automation (to a value, when set), never from a Workflow step's own write, and never holds the stage", async () => {
  const { t, f, owner, configured, values, runs } = await branchFixture();
  const set = (key: string, propertyKey: string, value: string) => ({ key, type: "set_client_property" as const, propertyKey, value });
  await owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
    communityId: f.communityId, milestoneKey: configured.firstKey, expectedRevision: 3, name: "New",
    automations: [
      { trigger: { type: "member_contributed" as const }, action: set("draft-plan", "plan", "pro") },
      { trigger: { type: "client_property_changed" as const, propertyKey: "plan", value: "Pro" }, action: set("draft-vip", "tag", "vip") },
      { trigger: { type: "previous_action_completed" as const, predecessorActionKey: "draft-vip" }, action: set("draft-after", "other", "x") },
    ],
  });
  const settle = () => t.finishAllScheduledFunctions(vi.runAllTimers);
  // A Workflow step sets Plan: no record-change run.
  await t.mutation(internalApi.communityMemberWorkflows.handleChannelContributionRootInternal, { rootId: await addRoot(t, f, "record") });
  await settle();
  expect(await values()).toEqual({ plan: "pro" });
  // The owner sets another value: the rule waits for Pro.
  const setPlan = (value: string) => owner.mutation(api.communityClients.setClientPropertyValue, { communityId: f.communityId, membershipId: String(f.membershipId), key: "plan", value });
  await setPlan("Basic");
  await settle();
  expect(await values()).toEqual({ plan: "Basic" });
  await setPlan("Pro");
  await settle();
  expect(await values()).toEqual({ plan: "Pro", tag: "vip", other: "x" });
  // Setting the same value again is no change.
  await setPlan("Pro");
  await settle();
  expect((await runs()).filter(run => run.triggerType === "client_property_changed")).toHaveLength(1);
  await expect(owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
    communityId: f.communityId, milestoneKey: configured.firstKey, expectedRevision: 4, name: "New",
    automations: [{ trigger: { type: "client_property_changed" as const, propertyKey: "nope" }, action: set("draft-x", "tag", "x") }],
  })).rejects.toThrow(/client_property_not_found/);
  vi.useRealTimers();
});

test("a record-change automation that never fires doesn't keep the member in the stage", async () => {
  const { t, f, owner, configured } = await branchFixture();
  const set = (key: string, propertyKey: string, value: string) => ({ key, type: "set_client_property" as const, propertyKey, value });
  await owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
    communityId: f.communityId, milestoneKey: configured.firstKey, expectedRevision: 3, name: "New",
    automations: [
      { trigger: { type: "member_contributed" as const }, action: set("draft-plan", "plan", "pro") },
      { trigger: { type: "previous_action_completed" as const, predecessorActionKey: "draft-plan" }, action: set("draft-next", "other", "x") },
      { trigger: { type: "client_property_changed" as const, propertyKey: "tag" }, action: set("draft-tag", "other", "tagged") },
      { trigger: { type: "previous_action_completed" as const, predecessorActionKey: "draft-tag" }, action: set("draft-tag-next", "plan", "done") },
    ],
  });
  await t.mutation(internalApi.communityMemberWorkflows.handleChannelContributionRootInternal, { rootId: await addRoot(t, f, "reactive") });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const state = await t.run(ctx => ctx.db.query("communityMemberWorkflowMemberMilestones").first());
  expect(state?.currentMilestoneKey).toBe(configured.secondKey);
  vi.useRealTimers();
});

test("a date on the member record runs its rule once, offset days before it, and never for dates long gone", async () => {
  const { t, f, owner, configured, values, runs } = await branchFixture();
  await owner.mutation(api.communityClients.createClientProperty, { communityId: f.communityId, name: "Renewal", type: "date", options: [] });
  const set = (key: string, propertyKey: string, value: string) => ({ key, type: "set_client_property" as const, propertyKey, value });
  await owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
    communityId: f.communityId, milestoneKey: configured.firstKey, expectedRevision: 3, name: "New",
    automations: [{ trigger: { type: "property_date" as const, propertyKey: "renewal", offsetDays: -3 }, action: set("draft-soon", "tag", "soon") }],
  });
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const renewal = day(f.nowMs + 10 * 86_400_000);
  const dueAt = Date.parse(`${renewal}T09:00:00Z`) - 3 * 86_400_000;
  const setRenewal = (value: string) => owner.mutation(api.communityClients.setClientPropertyValue, { communityId: f.communityId, membershipId: String(f.membershipId), key: "renewal", value });
  await setRenewal(renewal);
  const tick = async () => { await t.mutation(internalApi.communityMemberWorkflows.processDuePropertyDateTriggersInternal, {}); await t.finishAllScheduledFunctions(vi.runAllTimers); };
  vi.setSystemTime(dueAt - 60_000);
  await tick();
  expect((await values()).tag).toBeUndefined();
  vi.setSystemTime(dueAt + 60_000);
  await tick();
  await tick();
  expect((await values()).tag).toBe("soon");
  expect((await runs()).filter(run => run.triggerType === "property_date")).toHaveLength(1);
  // A date that came round long ago never fires.
  await t.run(async ctx => { for (const run of await ctx.db.query("communityMemberWorkflowRuns").collect()) await ctx.db.delete(run._id); });
  await setRenewal(day(f.nowMs - 30 * 86_400_000));
  await tick();
  expect((await runs()).filter(run => run.triggerType === "property_date")).toHaveLength(0);
  await expect(owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
    communityId: f.communityId, milestoneKey: configured.firstKey, expectedRevision: 4, name: "New",
    automations: [{ trigger: { type: "property_date" as const, propertyKey: "plan", offsetDays: 0 }, action: set("draft-x", "tag", "x") }],
  })).rejects.toThrow(/workflow_property_not_a_date/);
  vi.useRealTimers();
});

test("a wait after a step starts a timer from when that step finished, and runs once it is due", async () => {
  const { t, f, owner, configured, values } = await branchFixture();
  await owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
    communityId: f.communityId, milestoneKey: configured.firstKey, expectedRevision: 3, name: "New",
    automations: [
      { trigger: { type: "member_contributed" as const }, action: { key: "draft-a", type: "set_client_property" as const, propertyKey: "plan", value: "pro" } },
      { trigger: { type: "previous_action_completed" as const, predecessorActionKey: "draft-a", delayMinutes: 60 }, action: { key: "draft-b", type: "set_client_property" as const, propertyKey: "tag", value: "later" } },
    ],
  });
  const rootId = await addRoot(t, f, "wait");
  await t.mutation(internalApi.communityMemberWorkflows.handleChannelContributionRootInternal, { rootId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await values()).toEqual({ plan: "pro" });
  const [timer] = await t.run(ctx => ctx.db.query("communityMemberWorkflowTimers").collect());
  expect(timer).toMatchObject({ status: "pending" });
  expect(timer.dueAt - timer.startedAt!).toBe(60 * 60_000);
  await t.mutation(internalApi.communityMemberWorkflows.processDueMilestoneTimersInternal, {});
  expect(await values()).toEqual({ plan: "pro" });
  vi.setSystemTime(timer.dueAt + 1);
  await t.mutation(internalApi.communityMemberWorkflows.processDueMilestoneTimersInternal, {});
  expect(await values()).toEqual({ plan: "pro", tag: "later" });
  vi.useRealTimers();
});

test("a lesson can ask the agent directly; a replay of the same lesson asks only once", async () => {
  const t = convexTest(schema, modules), f = await fixture(t);
  const owner = t.withIdentity({ subject: OWNER_SUBJECT });
  const lessonId = await t.run(async (ctx) => {
    const now = Date.now();
    const moduleId = await ctx.db.insert("communityResourceModules", {
      communityId: f.communityId, createdByUserId: f.ownerId, status: "live", name: "Start", sortOrder: 1, createdAt: now, updatedAt: now,
    });
    return ctx.db.insert("communityResources", {
      communityId: f.communityId, moduleId, createdByUserId: f.ownerId, type: "post", role: "page", status: "published",
      title: "What is a skill", bodyMd: "Go.", bodyChars: 3, pinned: false, sortOrder: 1, createdAt: now, updatedAt: now,
    } as any);
  });
  const configured = await configureAutomations(t, f.communityId, []);
  await owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
    communityId: f.communityId, milestoneKey: configured.firstKey, expectedRevision: 3, name: "New",
    automations: [{ trigger: { type: "lesson_completed" as const }, action: { type: "prompt_agent" as const, prompt: "Ask what they'll build first." } }],
  });
  await t.run(async (ctx) => {
    await ctx.db.patch(f.channelId, { systemRole: undefined, slug: "service", position: 1, accessMode: "restricted" });
    for (const principalKey of [`user:${f.memberId}`, "community_agent"]) await ctx.db.insert("communityChannelParticipants", {
      communityId: f.communityId, channelId: f.channelId, principalKey,
      ...(principalKey !== "community_agent" ? { membershipId: f.membershipId, membershipActivationSequence: 1 } : {}),
      status: "active", createdByUserId: f.ownerId, createdAt: f.nowMs, updatedAt: f.nowMs,
    });
    const now = Date.now();
    await ctx.db.insert("communityResourceProgress", { communityId: f.communityId, userId: f.memberId, resourceId: lessonId, status: "done", startedAt: now, completedAt: now, updatedAt: now } as any);
  });
  await owner.mutation(api.communityMemberWorkflows.setBuilderMemberServiceChannel, { communityId: f.communityId, membershipId: f.membershipId, channelId: f.channelId, expectedRevision: 0 });
  const finish = () => t.mutation(internalApi.communityMemberWorkflows.handleLessonCompletedInternal, { communityId: f.communityId, userId: f.memberId, resourceId: lessonId });
  expect(await finish()).toMatchObject({ status: "handled", results: [{ status: "agent_started" }] });
  await finish();
  const requests = await t.run(ctx => ctx.db.query("communityAgentServeRequests").collect());
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ triggerKind: "workflow", workflowPromptSnapshot: "Ask what they'll build first." });
  expect(requests[0].workflowTimerId).toBeTruthy();
});

test("a step can follow any earlier step, but not a later one or a nudge", async () => {
  const { f, owner, configured } = await branchFixture();
  const save = (automations: any[]) => owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, {
    communityId: f.communityId, milestoneKey: configured.firstKey, expectedRevision: 3, name: "New", automations });
  const a = { trigger: { type: "member_contributed" as const }, action: { key: "draft-a", type: "set_client_property" as const, propertyKey: "plan", value: "x" } };
  await expect(save([{ trigger: { type: "previous_action_completed", predecessorActionKey: "draft-a" }, action: { type: "prompt_agent", prompt: "Hi" } }, a]))
    .rejects.toThrow("workflow_previous_action_invalid");
  await expect(save([{ trigger: { type: "milestone_elapsed", delayMinutes: 10, nudge: true }, action: { key: "draft-n", type: "prompt_agent", prompt: "Nudge" } },
    { trigger: { type: "previous_action_completed", predecessorActionKey: "draft-n" }, action: { type: "prompt_agent", prompt: "Hi" } }]))
    .rejects.toThrow("workflow_previous_action_invalid");
  await expect(save([a, { condition: { propertyKey: "plan", op: "is" }, trigger: { type: "member_contributed" }, action: { type: "prompt_agent", prompt: "Hi" } }]))
    .rejects.toThrow("workflow_condition_invalid");
  vi.useRealTimers();
});

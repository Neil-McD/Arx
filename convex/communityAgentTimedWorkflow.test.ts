/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { activateCommunityMembershipCore } from "./communityMembershipLifecycle";
import { enrollWorkflowMilestoneTimers } from "./communityMemberWorkflowTimerCore";
import { runWorkflowTimerNow } from "./communityMemberWorkflows";
import { buildCommunityAgentServePromptBundle } from "../shared/communityAgentServePrompt";
import { executeConciergeTool } from "./communityAgentServeWorker";
import * as serviceChannelCore from "./communityMemberServiceChannelCore";

const modules = import.meta.glob(["./communityMemberWorkflows.ts", "./communityAgentServeWorker.ts", "./communityAgentChannelAccess.ts", "./memberOntology.ts", "./_generated/**/*.*s"]);
const epoch = 1_800_000_000_000;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(epoch); });
afterEach(() => vi.useRealTimers());

async function setup(count = 1, assigned = true) {
  const t = convexTest(schema, modules);
  const f = await t.run(async ctx => {
    const ownerId = await ctx.db.insert("users", { authSubject: "timed-owner", createdAt: epoch, updatedAt: epoch });
    const userId = await ctx.db.insert("users", { authSubject: "timed-member", displayName: "Member", createdAt: epoch, updatedAt: epoch });
    await ctx.db.insert("operatorRoles", { userId: ownerId, role: "owner", active: true, createdAt: epoch, updatedAt: epoch });
    const communityId = await ctx.db.insert("communities", { ownerId, name: "Timed service", slug: "timed", lifecycleStatus: "active", visibility: "unlisted", inferenceFundingPolicy: "managed_required", entryPolicy: "approval", createdAt: epoch, updatedAt: epoch });
    const channelId = await ctx.db.insert("communityChannels", { communityId, name: "Service", slug: "service", accessMode: "restricted", postingPolicy: "members", status: "active", position: 1, createdAt: epoch, updatedAt: epoch });
    return { ownerId, userId, communityId, channelId };
  });
  const owner = t.withIdentity({ subject: "timed-owner" });
  const first = await owner.mutation(api.communityMemberWorkflows.createBuilderWorkflowMilestone, { communityId: f.communityId, expectedRevision: 0, name: "New" });
  await owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, { communityId: f.communityId, expectedRevision: 1,
    milestoneKey: first.milestone.key, name: "New", automations: Array.from({ length: count }, (_, i) => ({
      trigger: { type: "milestone_elapsed" as const, delayMinutes: i + 1 }, action: { type: "prompt_agent" as const, prompt: `Check in ${i}` },
    })) });
  const { membership } = await t.run(ctx => activateCommunityMembershipCore({ ctx, communityId: f.communityId, userId: f.userId, accessSource: "manual_grant", activationReason: "test", nowMs: epoch }));
  const membershipId = membership._id as Id<"communityMemberships">;
  const grants = await t.run(async ctx => {
    const memberGrant = await ctx.db.insert("communityChannelParticipants", { communityId: f.communityId, channelId: f.channelId, principalKey: `user:${f.userId}`, membershipId, membershipActivationSequence: 1, status: "active", createdByUserId: f.ownerId, createdAt: epoch, updatedAt: epoch });
    const agentGrant = await ctx.db.insert("communityChannelParticipants", { communityId: f.communityId, channelId: f.channelId, principalKey: "community_agent", status: "active", createdByUserId: f.ownerId, createdAt: epoch, updatedAt: epoch });
    return { memberGrant, agentGrant };
  });
  if (assigned) await owner.mutation(api.communityMemberWorkflows.setBuilderMemberServiceChannel, { communityId: f.communityId, membershipId, channelId: f.channelId, expectedRevision: 0 });
  const process = () => t.mutation(internal.communityMemberWorkflows.processDueMilestoneTimersInternal, {});
  const requests = () => t.run(ctx => ctx.db.query("communityAgentServeRequests").collect());
  const claim = async () => {
    const [r] = await requests();
    return t.mutation(internal.communityAgentServeWorker.claimNextCommunityAgentServeRequestInternal, { requestId: r._id });
  };
  return { t, f: { ...f, ...grants, membershipId }, owner, process, requests, claim };
}

async function formAwareRun() {
  const s = await setup();
  vi.setSystemTime(epoch + 60000); await s.process();
  const claim = await s.claim();
  const args = { requestId: claim.requestId! as Id<"communityAgentServeRequests">, expectedAttempt: claim.attempt! };
  const formRequestId = await s.t.run(async ctx => {
    const request = (await ctx.db.get(args.requestId))!;
    const run = (await ctx.db.get(request.workflowRunId!))!;
    const questions = [{ key: "q", title: "What needs help?", description: "", type: "short_text" as const, required: true, options: [] }];
    const formId = await ctx.db.insert("communityForms", { communityId: s.f.communityId, key: "intake", name: "Intake", questions, revision: 1, createdAt: epoch, updatedAt: epoch });
    const versionId = await ctx.db.insert("communityFormVersions", { communityId: s.f.communityId, formId, revision: 1, name: "Intake", questions, publishedBy: s.f.ownerId, publishedAt: epoch });
    await ctx.db.insert("memberFacts", { userId: s.f.userId, communityId: s.f.communityId, contextKind: "workflow", kind: "situation",
      body: "BUILDER_PRIVATE_NOTE", provenance: "form_answer", confidence: 1, evidenceRefs: [], stalenessScore: 0,
      consentState: "approved", createdByActorType: "admin", version: 1, createdAt: epoch, updatedAt: epoch });
    return ctx.db.insert("communityFormRequests", { communityId: s.f.communityId, membershipId: s.f.membershipId,
      workflowId: run.workflowId, workflowRunId: run._id, automationKey: "historical-form", milestoneKey: "earlier",
      milestoneEnteredAt: epoch - 100, activationSequence: 1, formKey: "intake", versionId,
      status: "submitted", answers: { q: "I need help pricing my first course" }, revision: 1,
      createdAt: epoch, updatedAt: epoch, submittedAt: epoch });
  });
  const read = () => s.t.query(internal.communityAgentServeWorker.readCommunityAgentServeRequestContextInternal, args);
  const capture = async () => {
    const context = await read();
    if (!context.ok) throw new Error(context.errorCode);
    const bundle = buildCommunityAgentServePromptBundle(context);
    const snapshotJson = JSON.stringify({ version: 2, sha256: "a".repeat(64), messages: bundle.messages,
      prompt_sections: bundle.systemPromptBundle.sections, timed_member_context: context.timedMemberContext });
    expect((await s.t.mutation(internal.communityAgentServeWorker.recordCommunityAgentServeContextSnapshotInternal,
      { ...args, snapshotJson })).ok).toBe(true);
    return { context, bundle, snapshotJson };
  };
  return { ...s, args, formRequestId, read, capture };
}

async function inviteOther(s: Awaited<ReturnType<typeof formAwareRun>>, role: "member" | "admin" = "member") {
  return s.t.run(async ctx => {
    const userId = await ctx.db.insert("users", { authSubject: "another-client", createdAt: epoch, updatedAt: epoch });
    const { membership } = await activateCommunityMembershipCore({ ctx, communityId: s.f.communityId, userId,
      accessSource: "manual_grant", activationReason: "test", nowMs: epoch });
    const membershipId = membership._id as Id<"communityMemberships">;
    await ctx.db.patch(membershipId, { role });
    await ctx.db.insert("communityChannelParticipants", { communityId: s.f.communityId, channelId: s.f.channelId,
      principalKey: `user:${userId}`, membershipId, membershipActivationSequence: 1, status: "active",
      createdByUserId: s.f.ownerId, createdAt: epoch, updatedAt: epoch });
    return membershipId;
  });
}

test("submitted forms reach the prompt and receipt, not builder-private notes; delivery is idempotent", async () => {
  const s = await formAwareRun();
  await inviteOther(s, "admin");
  const { context, bundle } = await s.capture();
  expect(JSON.stringify(bundle.messages)).toContain("I need help pricing my first course");
  expect(JSON.stringify(bundle.messages)).not.toContain("BUILDER_PRIVATE_NOTE");
  const packet = JSON.parse(context.timedMemberContext!);
  expect(packet.form_audience.policy).toBe("member_and_managers");
  expect(packet.submitted_form_evidence.submissions[0].request_id).toBe(s.formRequestId);
  expect(JSON.stringify(await s.t.run(ctx => ctx.db.query("communityAgentRunEvents").collect()))).toContain(s.formRequestId);
  // Stub final provider text: this proves delivery, not live-model quality.
  const send = () => s.t.mutation(internal.communityAgentServeWorker.finalizeCommunityAgentServeReplyInternal,
    { ...s.args, content: "For your course pricing, start with one offer and a small pilot." });
  expect((await send()).ok).toBe(true);
  await send();
  expect(await s.t.run(ctx => ctx.db.query("communityInteractionRoots").collect())).toHaveLength(1);
});

test("another invited client blocks form context before generation", async () => {
  const s = await formAwareRun(); await inviteOther(s);
  const result = await s.read();
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result)).not.toContain("pricing my first course");
});

test("large forms fit the existing context receipt envelope with explicit omissions", async () => {
  const s = await formAwareRun();
  await s.t.run(async ctx => {
    const request = (await ctx.db.get(s.formRequestId))!;
    const questions = Array.from({ length: 30 }, (_, i) => ({ key: `q${i}`, title: "Question ".repeat(50),
      description: "", type: "long_text" as const, required: true, options: [] }));
    await ctx.db.patch(request.versionId, { questions });
    await ctx.db.patch(request._id, { answers: Object.fromEntries(questions.map(q => [q.key, "\"\\\n".repeat(1000)])) });
  });
  const { context } = await s.capture();
  const evidence = JSON.parse(context.timedMemberContext!).submitted_form_evidence;
  expect(evidence.truncated).toBe(true);
  expect(evidence.submissions[0].omitted_questions).toBeGreaterThan(0);
  expect(JSON.stringify(evidence).length).toBeLessThanOrEqual(8000);
});

test.each(["invite", "demote", "shared", "revoke", "reassign", "answers", "snapshot", "lease"])("%s change fences form-aware publication", async change => {
  const s = await formAwareRun();
  const admin = change === "demote" ? await inviteOther(s, "admin") : null;
  await s.capture();
  if (change === "invite") await inviteOther(s);
  else if (change === "lease") vi.setSystemTime(epoch + 86400000);
  else await s.t.run(async ctx => {
    if (change === "demote") await ctx.db.patch(admin!, { role: "member" });
    if (change === "shared") await ctx.db.patch(s.f.channelId, { accessMode: "all_members" });
    if (change === "revoke") await ctx.db.patch(s.f.membershipId, { active: false });
    if (change === "reassign") await ctx.db.patch(s.f.membershipId, { serviceChannelRevision: 2 });
    if (change === "answers") await ctx.db.patch(s.formRequestId, { answers: { q: "Changed" }, revision: 2 });
    if (change === "snapshot") for (const row of await ctx.db.query("communityAgentRunEvents").collect()) await ctx.db.delete(row._id);
  });
  expect((await s.t.mutation(internal.communityAgentServeWorker.finalizeCommunityAgentServeReplyInternal,
    { ...s.args, content: "Must not publish" })).ok).toBe(false);
  expect(await s.t.run(ctx => ctx.db.query("communityInteractionRoots").collect())).toHaveLength(0);
});

test("confidential workflow facts require manager or live execution, never self/profile/channel authority", async () => {
  const s = await setup();
  const member = s.t.withIdentity({ subject: "timed-member" });
  const factId = await s.t.run(ctx => ctx.db.insert("memberFacts", {
    userId: s.f.userId, communityId: s.f.communityId, contextKind: "workflow", kind: "situation",
    body: "CONFIDENTIAL_SERVICE_RECORD", provenance: "form_answer", confidence: 1, evidenceRefs: [],
    stalenessScore: 0, consentState: "approved", createdByActorType: "member", version: 1, createdAt: epoch, updatedAt: epoch,
  }));
  const dossierArgs = { communityId: s.f.communityId, membershipId: s.f.membershipId };
  expect(JSON.stringify(await s.owner.query(api.communityMemberWorkflows.getBuilderWorkflowMemberSuccessDossier, dossierArgs))).toContain("CONFIDENTIAL_SERVICE_RECORD");
  await expect(member.query(api.communityMemberWorkflows.getBuilderWorkflowMemberSuccessDossier, dossierArgs)).rejects.toThrow();
  // A profile submission must not supersede a same-text confidential record.
  await member.mutation(api.memberOntology.confirmMemberInterviewFacts, { communityId: s.f.communityId,
    facts: [{ kind: "situation", body: "CONFIDENTIAL_SERVICE_RECORD", provenance: "form_answer" }] });
  expect((await s.t.run(ctx => ctx.db.get(factId)))?.consentState).toBe("approved");
  // Remove the deliberately duplicated profile fixture, preserving the workflow record.
  await s.t.run(async ctx => { for (const fact of await ctx.db.query("memberFacts").collect()) {
    if (fact._id !== factId) await ctx.db.delete(fact._id);
  } });
  vi.setSystemTime(epoch + 60000); await s.process();
  const queued = (await s.requests())[0];
  await expect(s.t.query(internal.communityMemberWorkflows.getWorkflowExecutionContextInternal,
    { requestId: queued._id, expectedAttempt: 0 })).rejects.toThrow("workflow_context_forbidden");
  const claim = await s.claim();
  const args = { requestId: claim.requestId!, expectedAttempt: claim.attempt! };
  expect(JSON.stringify(await s.t.query(internal.communityMemberWorkflows.getWorkflowExecutionContextInternal, args))).toContain("CONFIDENTIAL_SERVICE_RECORD");
  await expect(s.t.query(internal.communityMemberWorkflows.getWorkflowExecutionContextInternal,
    { ...args, expectedAttempt: args.expectedAttempt + 1 })).rejects.toThrow("workflow_context_forbidden");
  const context = await s.t.query(internal.communityAgentServeWorker.readCommunityAgentServeRequestContextInternal, args);
  expect(JSON.stringify(context)).not.toContain("CONFIDENTIAL_SERVICE_RECORD");
  await s.t.run(ctx => ctx.db.patch(s.f.agentGrant, { status: "revoked" }));
  await expect(s.t.query(internal.communityMemberWorkflows.getWorkflowExecutionContextInternal, args)).rejects.toThrow();
});

test.each(["retracted", "edited"])("approved context is bounded, scoped and %s facts fence delivery", async change => {
  const s = await setup();
  const factId = await s.t.run(async ctx => {
    const base = { userId: s.f.userId, communityId: s.f.communityId, kind: "goal" as const,
      body: "Launch my first course", provenance: "form_answer" as const, confidence: 1,
      evidenceRefs: [], stalenessScore: 0, consentState: "approved" as const,
      createdByActorType: "member" as const, version: 1, createdAt: epoch, updatedAt: epoch };
    const id = await ctx.db.insert("memberFacts", base);
    const otherCommunity = await ctx.db.insert("communities", { ownerId: s.f.ownerId, name: "Other", slug: "other", visibility: "unlisted", inferenceFundingPolicy: "managed_required", entryPolicy: "approval", createdAt: epoch, updatedAt: epoch });
    await ctx.db.insert("memberFacts", { ...base, body: "OTHER_COMMUNITY", communityId: otherCommunity });
    await ctx.db.insert("memberFacts", { ...base, body: "PRIVATE_ACCOUNT", communityId: undefined });
    await ctx.db.insert("memberFacts", { ...base, body: "PENDING_SECRET", consentState: "pending" });
    await ctx.db.insert("memberFacts", { ...base, body: "OBSERVED_SECRET", provenance: "observed_behavior" });
    await ctx.db.insert("memberFacts", { ...base, body: "OTHER_MEMBER", userId: s.f.ownerId });
    await ctx.db.insert("memberFacts", { ...base, body: "x".repeat(1000) });
    return id;
  });
  vi.setSystemTime(epoch + 60000); await s.process();
  const claim = await s.claim();
  const args = { requestId: claim.requestId!, expectedAttempt: claim.attempt! };
  const context = await s.t.query(internal.communityAgentServeWorker.readCommunityAgentServeRequestContextInternal, args);
  expect(context.ok).toBe(true); if (!context.ok) return;
  const orientation = JSON.parse(context.timedMemberContext!);
  expect(orientation.approved_community_facts).toHaveLength(2);
  expect(orientation.truncated).toBe(true);
  expect(context.threadContext.rendered).toContain("Launch my first course");
  expect(context.threadContext.rendered).not.toMatch(/PRIVATE_ACCOUNT|PENDING_SECRET|OBSERVED_SECRET|OTHER_MEMBER|OTHER_COMMUNITY/);
  const bundle = buildCommunityAgentServePromptBundle(context);
  const snapshotJson = JSON.stringify({ version: 2, sha256: "a".repeat(64), messages: bundle.messages,
    prompt_sections: bundle.systemPromptBundle.sections, timed_member_context: context.timedMemberContext });
  expect((await s.t.mutation(internal.communityAgentServeWorker.recordCommunityAgentServeContextSnapshotInternal, { ...args, snapshotJson })).ok).toBe(true);
  await s.t.run(ctx => ctx.db.patch(factId, change === "retracted" ? { consentState: "retracted" } : { body: "A different goal", version: 2 }));
  expect((await s.t.mutation(internal.communityAgentServeWorker.recordCommunityAgentServeContextSnapshotInternal, { ...args, snapshotJson })).ok).toBe(false);
  await expect(s.t.query(internal.communityAgentChannelAccess.authorizeServeToolsInternal, args)).rejects.toThrow("workflow_member_context_changed");
  expect((await s.t.mutation(internal.communityAgentServeWorker.finalizeCommunityAgentServeReplyInternal,
    { ...args, content: "Stale goal advice" })).ok).toBe(false);
  expect(await s.t.run(ctx => ctx.db.query("communityInteractionRoots").collect())).toHaveLength(0);
});

test("each automation enrolls once; timer queues without fake posts and never moves the member", async () => {
  const s = await setup(2);
  await s.t.run(async ctx => enrollWorkflowMilestoneTimers({ ctx, membership: (await ctx.db.get(s.f.membershipId))!, nowMs: epoch }));
  expect(await s.t.run(ctx => ctx.db.query("communityMemberWorkflowTimers").collect())).toHaveLength(2);
  await s.process(); expect(await s.requests()).toHaveLength(0);
  vi.setSystemTime(epoch + 120000); await s.process(); await s.process();
  expect(await s.requests()).toHaveLength(2);
  await s.t.run(async ctx => {
    expect(await ctx.db.query("communityInteractionRoots").collect()).toHaveLength(0);
    expect(await ctx.db.query("communityMemberWorkflowTransitions").collect()).toHaveLength(0);
  });
  const [request] = await s.requests();
  expect(request).toMatchObject({ status: "queued", serviceChannelId: s.f.channelId, serviceChannelRevision: 1 });
  expect(request.sourceRootId).toBeUndefined();
});

test("a wait the owner skips still lets its agent step run before the due time", async () => {
  const s = await setup();
  await s.t.run(async ctx => {
    const timer = (await ctx.db.query("communityMemberWorkflowTimers").first())!;
    expect(timer.dueAt).toBeGreaterThan(Date.now());
    expect(await runWorkflowTimerNow(ctx, timer)).toBe(true);
  });
  expect((await s.requests())[0]).toMatchObject({ status: "queued" });
  const claim = await s.claim();
  expect(claim.requestId).toBeTruthy();
  const context = await s.t.query(internal.communityAgentServeWorker.readCommunityAgentServeRequestContextInternal,
    { requestId: claim.requestId!, expectedAttempt: claim.attempt! });
  expect(context.ok).toBe(true);
});

test("missing destination is recorded, with no fallback or later replay", async () => {
  const s = await setup(1, false); vi.setSystemTime(epoch + 60000); await s.process();
  expect((await s.requests())[0]).toMatchObject({ status: "skipped" });
  await s.owner.mutation(api.communityMemberWorkflows.setBuilderMemberServiceChannel, { communityId: s.f.communityId, membershipId: s.f.membershipId, channelId: s.f.channelId, expectedRevision: 0 });
  await s.process(); expect(await s.requests()).toHaveLength(1);
  expect((await s.requests())[0].status).toBe("skipped");
});

test("unexpected admission failure rolls back timer consumption and request/run writes", async () => {
  const s = await setup(); vi.setSystemTime(epoch + 60000);
  const failure = vi.spyOn(serviceChannelCore, "resolveMemberServiceChannel").mockRejectedValueOnce(new Error("transient storage outage"));
  try { await expect(s.process()).rejects.toThrow("transient storage outage"); }
  finally { failure.mockRestore(); }
  expect(await s.requests()).toHaveLength(0);
  await s.t.run(async ctx => {
    expect(await ctx.db.query("communityMemberWorkflowRuns").collect()).toHaveLength(0);
    expect((await ctx.db.query("communityMemberWorkflowTimers").first())?.status).toBe("pending");
  });
  await s.process(); expect((await s.requests())[0].status).toBe("queued");
});

test("claim, scoped context, publication and replay use existing serve lifecycle", async () => {
  const s = await setup(); vi.setSystemTime(epoch + 60000); await s.process();
  const claim = await s.claim();
  expect(claim.requestId).toBeTruthy();
  const args = { requestId: claim.requestId!, expectedAttempt: claim.attempt! };
  const context = await s.t.query(internal.communityAgentServeWorker.readCommunityAgentServeRequestContextInternal, args);
  expect(context.ok).toBe(true);
  if (!context.ok) return;
  expect(context.request.sourceRootId).toBeNull();
  expect(context.workflowPrompt).toBe("Check in 0");
  expect(context.threadContext.rendered).toContain("not a reply");
  expect(context.threadContext.participantUserIds).toEqual([]);
  const bundle = buildCommunityAgentServePromptBundle(context);
  expect(bundle.systemPromptBundle.text).toContain("This is not a reply");
  expect(bundle.systemPromptBundle.text).not.toContain("Use polynet_write");
  const snapshotJson = JSON.stringify({ version: 2, sha256: "a".repeat(64), messages: bundle.messages, prompt_sections: bundle.systemPromptBundle.sections, timed_member_context: context.timedMemberContext });
  expect((await s.t.mutation(internal.communityAgentServeWorker.recordCommunityAgentServeContextSnapshotInternal, { ...args, snapshotJson })).ok).toBe(true);
  const tool = await executeConciergeTool({ ctx: { runQuery: (ref: any, input: any) => s.t.query(ref, input) }, context,
    requestId: args.requestId, toolName: "polynet_read", rawArguments: { path: "/members/me/context.md" } });
  expect(tool.errorCode).toBe("timed_check_in_prompt_only");
  expect(await s.t.query(internal.communityAgentChannelAccess.authorizeServeToolsInternal, args)).toEqual({ restricted: true, timed: true });
  const post = await s.t.mutation(internal.communityAgentServeWorker.finalizeCommunityAgentServeReplyInternal, { ...args, content: "How is your first step going?" });
  expect(post.ok).toBe(true);
  await s.t.mutation(internal.communityAgentServeWorker.finalizeCommunityAgentServeReplyInternal, { ...args, content: "Duplicate" });
  await s.t.run(async ctx => {
    const roots = await ctx.db.query("communityInteractionRoots").collect();
    expect(roots).toHaveLength(1);
    expect(roots[0]).toMatchObject({ channelId: s.f.channelId, actorType: "community_agent" });
    expect(await ctx.db.query("communityInteractionReplies").collect()).toHaveLength(0);
  });
  const dossier = await s.owner.query(api.communityMemberWorkflows.getBuilderWorkflowMemberSuccessDossier, { communityId: s.f.communityId, membershipId: s.f.membershipId });
  expect(JSON.stringify(dossier)).toContain('"status":"responded"');
  expect(dossier.recent_workflow_activity[0].delivery_channel_url).toBe("/c/timed/chat/service");
  await s.t.run(ctx => ctx.db.patch(s.f.memberGrant, { status: "revoked" }));
  const hidden = await s.owner.query(api.communityMemberWorkflows.getBuilderWorkflowMemberSuccessDossier, { communityId: s.f.communityId, membershipId: s.f.membershipId });
  expect(hidden.recent_workflow_activity[0].delivery_channel_url).toBeNull();
});

test.each(["member_revoked", "agent_revoked", "archived", "shared", "reassigned", "aba", "member_left", "reactivated", "completed", "rule_changed", "community_archived", "community_restored", "agent_disabled", "prompt_changed", "duration_changed"])("%s cancels execution and publication", async kind => {
  const s = await setup(); vi.setSystemTime(epoch + 60000); await s.process();
  const claim = await s.claim();
  const args = { requestId: claim.requestId!, expectedAttempt: claim.attempt! };
  await s.t.run(async ctx => {
    if (kind === "community_archived") await ctx.db.patch(s.f.communityId, { lifecycleStatus: "archived" });
    if (kind === "community_restored") await ctx.db.patch(s.f.communityId, { lifecycleGeneration: 2 });
    if (kind === "agent_disabled") await ctx.db.insert("communityAgentConfigs", { communityId: s.f.communityId, agentEnabled: false, systemPrompt: "", createdAt: epoch, updatedAt: epoch });
    if (kind === "prompt_changed" || kind === "duration_changed") {
      const w = (await ctx.db.query("communityMemberWorkflows").first())!;
      const a = w.milestones[0].automations[0];
      await ctx.db.patch(w._id, { milestones: [{ ...w.milestones[0], automations: [{ ...a,
        ...(kind === "prompt_changed" ? { action: { key: a.action.key, type: "prompt_agent" as const, prompt: "Changed" } }
          : { trigger: { type: "milestone_elapsed" as const, delayMinutes: 2 } }) }] }] });
    }
    if (kind === "member_revoked") await ctx.db.patch(s.f.memberGrant, { status: "revoked" });
    if (kind === "agent_revoked") await ctx.db.patch(s.f.agentGrant, { status: "revoked" });
    if (kind === "archived") await ctx.db.patch(s.f.channelId, { status: "archived" });
    if (kind === "shared") await ctx.db.patch(s.f.channelId, { accessMode: "all_members" });
    if (kind === "reassigned") await ctx.db.patch(s.f.membershipId, { serviceChannelId: undefined, serviceChannelRevision: 2 });
    if (kind === "aba") await ctx.db.patch(s.f.membershipId, { serviceChannelRevision: 3 });
    if (kind === "member_left") await ctx.db.patch(s.f.membershipId, { active: false });
    if (kind === "reactivated") await ctx.db.patch(s.f.membershipId, { activationSequence: 2 });
    if (kind === "completed" || kind === "rule_changed") {
      const w = (await ctx.db.query("communityMemberWorkflows").first())!;
      if (kind === "completed") await ctx.db.insert("communityMemberWorkflowMemberMilestones", { workflowId: w._id, membershipId: s.f.membershipId, currentMilestoneKey: w.milestones[0].key, milestoneEnteredAt: epoch, completedAt: Date.now(), transitionSeq: 1, createdAt: epoch, updatedAt: Date.now() });
      else await ctx.db.patch(w._id, { milestones: [{ ...w.milestones[0], automations: [] }] });
    }
  });
  await expect(s.t.query(internal.communityMemberWorkflows.getWorkflowExecutionContextInternal, args)).rejects.toThrow();
  expect((await s.t.query(internal.communityAgentServeWorker.readCommunityAgentServeRequestContextInternal, args)).ok).toBe(false);
  expect((await s.t.mutation(internal.communityAgentServeWorker.finalizeCommunityAgentServeReplyInternal, { ...args, content: "Do not send" })).ok).toBe(false);
  expect(await s.t.run(ctx => ctx.db.query("communityInteractionRoots").collect())).toHaveLength(0);
});

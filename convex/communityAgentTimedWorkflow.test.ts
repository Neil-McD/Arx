/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { activateCommunityMembershipCore } from "./communityMembershipLifecycle";
import { enrollWorkflowMilestoneTimers } from "./communityMemberWorkflowTimerCore";
import { buildCommunityAgentServePromptBundle } from "../shared/communityAgentServePrompt";
import { executeConciergeTool } from "./communityAgentServeWorker";
import * as serviceChannelCore from "./communityMemberServiceChannelCore";

const modules = import.meta.glob(["./communityMemberWorkflows.ts", "./communityAgentServeWorker.ts", "./communityAgentChannelAccess.ts", "./_generated/**/*.*s"]);
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
  const snapshotJson = JSON.stringify({ version: 2, sha256: "a".repeat(64), messages: bundle.messages, prompt_sections: bundle.systemPromptBundle.sections });
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
  expect((await s.t.query(internal.communityAgentServeWorker.readCommunityAgentServeRequestContextInternal, args)).ok).toBe(false);
  expect((await s.t.mutation(internal.communityAgentServeWorker.finalizeCommunityAgentServeReplyInternal, { ...args, content: "Do not send" })).ok).toBe(false);
  expect(await s.t.run(ctx => ctx.db.query("communityInteractionRoots").collect())).toHaveLength(0);
});

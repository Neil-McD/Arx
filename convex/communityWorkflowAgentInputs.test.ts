/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { activateCommunityMembershipCore } from "./communityMembershipLifecycle";
import { normalizeWorkflowAgentSees } from "../shared/communityMemberWorkflow";

const modules = import.meta.glob(["./communityMemberWorkflows.ts", "./communityAgentServeWorker.ts", "./communityAgentChannelAccess.ts", "./memberOntology.ts", "./_generated/**/*.*s"]);
const epoch = 1_800_000_000_000;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(epoch); });
afterEach(() => vi.useRealTimers());

// One timed "Ask the agent" step, with or without picked inputs, run to the
// point where the agent's context is read.
async function agentContext(sees?: string[]) {
  const t = convexTest(schema, modules);
  const f = await t.run(async ctx => {
    const ownerId = await ctx.db.insert("users", { authSubject: "inputs-owner", createdAt: epoch, updatedAt: epoch });
    const userId = await ctx.db.insert("users", { authSubject: "inputs-member", displayName: "Member", createdAt: epoch, updatedAt: epoch });
    await ctx.db.insert("operatorRoles", { userId: ownerId, role: "owner", active: true, createdAt: epoch, updatedAt: epoch });
    const communityId = await ctx.db.insert("communities", { ownerId, name: "Inputs", slug: "inputs", lifecycleStatus: "active", visibility: "unlisted", inferenceFundingPolicy: "managed_required", entryPolicy: "approval", createdAt: epoch, updatedAt: epoch });
    const channelId = await ctx.db.insert("communityChannels", { communityId, name: "Guide", slug: "guide", accessMode: "restricted", postingPolicy: "members", status: "active", position: 1, createdAt: epoch, updatedAt: epoch });
    await ctx.db.insert("communityClientProperties", { communityId, key: "first_skill", name: "First skill idea", type: "text", options: [], position: 0, createdByUserId: ownerId, createdAt: epoch, updatedAt: epoch });
    await ctx.db.insert("communityClientProperties", { communityId, key: "private_note", name: "Private note", type: "text", options: [], position: 1, createdByUserId: ownerId, createdAt: epoch, updatedAt: epoch });
    return { ownerId, userId, communityId, channelId };
  });
  const owner = t.withIdentity({ subject: "inputs-owner" });
  const first = await owner.mutation(api.communityMemberWorkflows.createBuilderWorkflowMilestone, { communityId: f.communityId, expectedRevision: 0, name: "Welcome" });
  await owner.mutation(api.communityMemberWorkflows.updateBuilderWorkflowMilestone, { communityId: f.communityId, expectedRevision: 1,
    milestoneKey: first.milestone.key, name: "Welcome", automations: [{
      trigger: { type: "milestone_elapsed" as const, delayMinutes: 1 },
      action: { type: "prompt_agent" as const, prompt: "Welcome them", ...(sees ? { sees } : {}) },
    }] });
  const { membership } = await t.run(ctx => activateCommunityMembershipCore({ ctx, communityId: f.communityId, userId: f.userId, accessSource: "manual_grant", activationReason: "test", nowMs: epoch }));
  const membershipId = membership._id as Id<"communityMemberships">;
  await t.run(async ctx => {
    await ctx.db.insert("communityChannelParticipants", { communityId: f.communityId, channelId: f.channelId, principalKey: `user:${f.userId}`, membershipId, membershipActivationSequence: 1, status: "active", createdByUserId: f.ownerId, createdAt: epoch, updatedAt: epoch });
    await ctx.db.insert("communityChannelParticipants", { communityId: f.communityId, channelId: f.channelId, principalKey: "community_agent", status: "active", createdByUserId: f.ownerId, createdAt: epoch, updatedAt: epoch });
    await ctx.db.insert("communityClientValues", { communityId: f.communityId, membershipId, propertyKey: "first_skill", value: "Weekly client report", updatedByUserId: f.ownerId, updatedVia: "web", updatedAt: epoch });
    await ctx.db.insert("communityClientValues", { communityId: f.communityId, membershipId, propertyKey: "private_note", value: "OWNER_ONLY_NOTE", updatedByUserId: f.ownerId, updatedVia: "web", updatedAt: epoch });
    await ctx.db.insert("communityInteractionRoots", { communityId: f.communityId, channelId: f.channelId, actorType: "human", actorUserId: f.userId,
      kind: "discussion", status: "live", visibilityScope: "community", contentSummary: "I run a bookkeeping firm", replyCount: 0, reactionSummary: [],
      idempotencyKey: "guide-1", createdAt: epoch, updatedAt: epoch });
  });
  await owner.mutation(api.communityMemberWorkflows.setBuilderMemberServiceChannel, { communityId: f.communityId, membershipId, channelId: f.channelId, expectedRevision: 0 });
  vi.setSystemTime(epoch + 60_000);
  await t.mutation(internal.communityMemberWorkflows.processDueMilestoneTimersInternal, {});
  const [request] = await t.run(ctx => ctx.db.query("communityAgentServeRequests").collect());
  const claim = await t.mutation(internal.communityAgentServeWorker.claimNextCommunityAgentServeRequestInternal, { requestId: request._id });
  const context = await t.query(internal.communityAgentServeWorker.readCommunityAgentServeRequestContextInternal,
    { requestId: claim.requestId!, expectedAttempt: claim.attempt! });
  if (!context.ok) throw new Error(context.errorCode);
  return context;
}

test("without picked inputs the agent gets today's bundle and no extra block", async () => {
  const context = await agentContext();
  expect(context.workflowPrompt).toBe("Welcome them");
  expect(JSON.parse(context.timedMemberContext!).approved_community_facts).toEqual([]);
});

test("picked inputs reach the agent: only the chosen property, the guide channel, and no facts", async () => {
  const context = await agentContext(["property:first_skill", "guide_channel", "progress"]);
  expect(context.workflowPrompt).toContain("Inputs the community chose for this step");
  expect(context.workflowPrompt).toContain("Weekly client report");
  expect(context.workflowPrompt).toContain("I run a bookkeeping firm");
  expect(context.workflowPrompt).not.toContain("OWNER_ONLY_NOTE");
  expect(context.workflowPrompt).toContain('"progress"');
});

test("all their data hands the agent every property, the guide channel and progress", async () => {
  const context = await agentContext(["all_member_data"]);
  expect(context.workflowPrompt).toContain("Weekly client report");
  expect(context.workflowPrompt).toContain("OWNER_ONLY_NOTE");
  expect(context.workflowPrompt).toContain("I run a bookkeeping firm");
  expect(context.workflowPrompt).toContain('"progress"');
});

test("sees accepts the known inputs only", () => {
  expect(normalizeWorkflowAgentSees(undefined)).toBeUndefined();
  expect(normalizeWorkflowAgentSees(["all_member_data"])).toEqual(["all_member_data"]);
  expect(normalizeWorkflowAgentSees(["facts", "facts", "form:intake", "lesson:abc123"])).toEqual(["facts", "form:intake", "lesson:abc123"]);
  expect(() => normalizeWorkflowAgentSees(["everything"])).toThrow("workflow_agent_sees_invalid");
  expect(() => normalizeWorkflowAgentSees(["property:"])).toThrow("workflow_agent_sees_invalid");
  expect(() => normalizeWorkflowAgentSees(Array.from({ length: 13 }, (_, i) => `form:f${i}`))).toThrow("workflow_agent_sees_invalid");
});

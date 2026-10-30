import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalQuery, mutation, query } from "./_generated/server";
import { workflowRuleUsesTimer } from "../shared/communityMemberWorkflow";
import { getCommunityMemberWorkflowByCommunity } from "./communityMemberWorkflowReadCore";
import { managerIdentityArgs, requireWorkflowManager } from "./communityMemberWorkflows";
import { recordWorkflowStageChange, stageSnapshot } from "./communityWorkflowChangeLog";

// Workflows › Recent changes: agents such as Claude Code
// change stages over the MCP/CLI, and the owner sees what changed, by whom,
// and can undo it. The owner also picks whether an agent's change goes live at
// once or waits for them (the "ask" settings stage it in communitySettingProposals).

const SHOWN = 30;

export type AgentChangeReview = "apply" | "ask_others" | "ask";
const reviewValidator = v.union(v.literal("apply"), v.literal("ask_others"), v.literal("ask"));

async function displayName(ctx: any, userId: any): Promise<string | null> {
  if (!userId) return null;
  const user = await ctx.db.get(userId);
  return user?.displayName ?? user?.handle ?? null;
}

export const listBuilderWorkflowChanges = query({
  args: { ...managerIdentityArgs, communityId: v.id("communities") },
  handler: async (ctx, args) => {
    await requireWorkflowManager({ ctx, ...args });
    const workflow = await getCommunityMemberWorkflowByCommunity({ ctx, communityId: args.communityId });
    const rows = await ctx.db.query("communityWorkflowChanges")
      .withIndex("by_community_createdAt", q => q.eq("communityId", args.communityId))
      .order("desc").take(SHOWN);
    const changes = [];
    for (const row of rows) {
      const stage = workflow?.milestones.find(milestone => milestone.key === row.milestoneKey) ?? null;
      changes.push({
        change_id: String(row._id),
        milestone_key: row.milestoneKey,
        stage_name: (row.after as any)?.name ?? (row.before as any)?.name ?? "",
        via: row.via,
        changed_by: row.via === "agent" ? row.changedBy ?? "An agent" : await displayName(ctx, row.changedByUserId) ?? "Someone",
        // Whose account the agent used, so the owner knows which admin it was.
        on_behalf_of: row.via === "agent" ? await displayName(ctx, row.changedByUserId) : null,
        approved_by: await displayName(ctx, row.approvedByUserId),
        undo_of: row.undoOf ? String(row.undoOf) : null,
        before: row.before,
        after: row.after,
        revision: row.revision,
        created_at: new Date(row.createdAt).toISOString(),
        // Undo puts the stage back only while nothing has changed it since.
        can_undo: Boolean(stage) && stageSnapshot(stage) === stageSnapshot(row.after),
      });
    }
    return { agent_change_review: (workflow?.agentChangeReview ?? "apply") as AgentChangeReview, changes };
  },
});

export const undoBuilderWorkflowChange = mutation({
  args: { ...managerIdentityArgs, communityId: v.id("communities"), changeId: v.id("communityWorkflowChanges"),
    via: v.optional(v.literal("agent")), changedBy: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { userId } = await requireWorkflowManager({ ctx, communityId: args.communityId, userId: args.userId, authSubject: args.authSubject });
    const change = await ctx.db.get(args.changeId);
    if (!change || change.communityId !== args.communityId) throw new Error("workflow_change_not_found");
    const workflow = await getCommunityMemberWorkflowByCommunity({ ctx, communityId: args.communityId });
    const index = workflow?.milestones.findIndex(milestone => milestone.key === change.milestoneKey) ?? -1;
    if (!workflow || index < 0) throw new Error("workflow_change_stage_gone");
    const current = workflow.milestones[index];
    if (stageSnapshot(current) !== stageSnapshot(change.after)) throw new Error("workflow_change_newer_edits");
    const revision = workflow.revision + 1;
    await ctx.db.patch(workflow._id, {
      milestones: workflow.milestones.map((item, at) => at === index ? change.before : item),
      revision, updatedByUserId: userId, updatedAt: Date.now(),
    });
    await recordWorkflowStageChange(ctx, { communityId: args.communityId, milestoneKey: change.milestoneKey, userId, revision,
      via: args.via ?? "app", changedBy: args.changedBy, undoOf: change._id, before: current, after: change.before });
    if ([...current.automations, ...(change.before?.automations ?? [])].some((rule: any) => workflowRuleUsesTimer(rule))) {
      await ctx.scheduler.runAfter(0, internal.communityMemberWorkflows.refreshMilestoneTimersInternal,
        { workflowId: workflow._id, milestoneKey: change.milestoneKey, cursor: null });
    }
    return { revision, milestone: change.before };
  },
});

// Only the owner decides how much the agents may do alone, so another admin
// can't lift the check that exists for them.
export const setBuilderWorkflowAgentChangeReview = mutation({
  args: { ...managerIdentityArgs, communityId: v.id("communities"), review: reviewValidator },
  handler: async (ctx, args) => {
    const { userId, community } = await requireWorkflowManager({ ctx, communityId: args.communityId, userId: args.userId, authSubject: args.authSubject });
    if (String((community as any).ownerId) !== String(userId)) throw new Error("workflow_agent_review_owner_only");
    const workflow = await getCommunityMemberWorkflowByCommunity({ ctx, communityId: args.communityId });
    if (!workflow) throw new Error("community_member_workflow_not_found");
    await ctx.db.patch(workflow._id, { agentChangeReview: args.review, updatedAt: Date.now() });
    return { agent_change_review: args.review };
  },
});

/** Whether a stage change this person's agent makes waits for the owner. */
export const agentStageChangeNeedsOwnerInternal = internalQuery({
  args: { communityId: v.id("communities"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const workflow = await getCommunityMemberWorkflowByCommunity({ ctx, communityId: args.communityId });
    const review = workflow?.agentChangeReview ?? "apply";
    if (review === "apply") return false;
    if (review === "ask") return true;
    const community = await ctx.db.get(args.communityId);
    return String((community as any)?.ownerId) !== String(args.userId);
  },
});

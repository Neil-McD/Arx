import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireCommunityManager, resolveUserIdForAuthenticatedRequest } from "./communityCore";
import { getCommunityMemberWorkflowByCommunity } from "./communityMemberWorkflowReadCore";
import { resolveUserProfileDisplayProjection } from "./userProfileProjection";
import { workflowRunWasSkipped } from "../shared/communityMemberWorkflow";
import { groupWorkflowRunSteps, type WorkflowRunStepRow } from "../shared/workflowRunHistory";

const RUN_HISTORY_STEP_LIMIT = 400;
const RUN_HISTORY_DEFAULT_LIMIT = 60;

// Workflows → Run history: the community's latest automation runs, newest
// first, each with its steps. Owners and admins only, and read-only.
export const listBuilderWorkflowRunHistory = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    filter: v.optional(v.union(v.literal("all"), v.literal("failed"), v.literal("tests"))),
    membershipId: v.optional(v.id("communityMemberships")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, userId: args.userId, authSubject: args.authSubject ?? null });
    await requireCommunityManager({ ctx, communityId: args.communityId, userId });
    const workflow = await getCommunityMemberWorkflowByCommunity({ ctx, communityId: args.communityId });
    if (!workflow) return { runs: [], truncated: false };
    const rows = args.membershipId
      ? await ctx.db.query("communityMemberWorkflowRuns")
        .withIndex("by_workflow_membership_createdAt", (q) => q.eq("workflowId", workflow._id).eq("membershipId", args.membershipId!))
        .order("desc").take(RUN_HISTORY_STEP_LIMIT)
      : await ctx.db.query("communityMemberWorkflowRuns")
        .withIndex("by_workflow_updatedAt", (q) => q.eq("workflowId", workflow._id))
        .order("desc").take(RUN_HISTORY_STEP_LIMIT);
    const steps: WorkflowRunStepRow[] = rows.map((row) => ({
      id: String(row._id),
      predecessor_id: row.predecessorRunId ? String(row.predecessorRunId) : null,
      membership_id: String(row.membershipId),
      milestone_key: row.milestoneKey,
      milestone_name: row.milestoneName,
      automation_key: row.automationKey,
      trigger_type: row.triggerType,
      action_type: row.actionSnapshot.type,
      status: row.status,
      skipped: workflowRunWasSkipped(row),
      result_code: row.actionResult?.resultCode ?? null,
      error_code: row.errorCode ?? row.actionResult?.errorCode ?? null,
      created_at: row.createdAt,
      finished_at: row.finishedAt ?? null,
    }));

    // A run is waiting when a later step of the same automation has a pending wait for that member.
    const successors = new Map<string, string[]>();
    for (const milestone of workflow.milestones) {
      const byAction = new Map(milestone.automations.map((rule: any) => [rule.action.key, rule.key]));
      for (const rule of milestone.automations as any[]) {
        if (rule.trigger.type !== "previous_action_completed") continue;
        const parent = byAction.get(rule.trigger.predecessorActionKey);
        if (parent) successors.set(parent, [...(successors.get(parent) ?? []), rule.key]);
      }
    }
    const descendants = (key: string, seen = new Set<string>()): Set<string> => {
      for (const next of successors.get(key) ?? []) if (!seen.has(next)) { seen.add(next); descendants(next, seen); }
      return seen;
    };
    const pending = await ctx.db.query("communityMemberWorkflowTimers")
      .withIndex("by_status_dueAt", (q) => q.eq("status", "pending"))
      .take(500);
    const pendingFor = pending.filter((timer) => String(timer.workflowId) === String(workflow._id));
    const runs = groupWorkflowRunSteps(steps, (run) => {
      const later = descendants(run.automation_key);
      return pendingFor.some((timer) => String(timer.membershipId) === run.membership_id && later.has(timer.automationKey)
        && (timer.startedAt ?? timer.createdAt) >= run.started_at);
    });

    // Looked up per member: a community keeps every ended test run's row, so a
    // list of its test members would miss the newest ones.
    const people = new Map<string, { name: string; is_test: boolean }>();
    for (const run of runs) {
      if (people.has(run.membership_id)) continue;
      const membership = await ctx.db.get(run.membership_id as any) as { userId?: any } | null;
      if (!membership?.userId) { people.set(run.membership_id, { name: "Former member", is_test: false }); continue; }
      const testRow = await ctx.db.query("communityTestMembers").withIndex("by_user", (q) => q.eq("userId", membership.userId)).first();
      if (testRow && String(testRow.communityId) === String(args.communityId)) { people.set(run.membership_id, { name: testRow.label, is_test: true }); continue; }
      const profile = await resolveUserProfileDisplayProjection(ctx, membership.userId);
      people.set(run.membership_id, { name: profile?.display_name ?? "Member", is_test: false });
    }

    const filter = args.filter ?? "all";
    const limit = Math.max(1, Math.min(200, Math.floor(args.limit ?? RUN_HISTORY_DEFAULT_LIMIT)));
    const visible = runs.filter((run) => filter === "all" ? true : filter === "failed" ? run.status === "failed" : people.get(run.membership_id)?.is_test);
    return {
      runs: visible.slice(0, limit).map((run) => ({ ...run, member_name: people.get(run.membership_id)?.name ?? "Member",
        is_test: people.get(run.membership_id)?.is_test ?? false })),
      truncated: rows.length >= RUN_HISTORY_STEP_LIMIT || visible.length > limit,
    };
  },
});

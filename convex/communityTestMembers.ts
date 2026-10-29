import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import {
  adjustCommunityActiveMemberCountForMembershipTransition,
  getUniqueCommunityMembershipByPair,
  requireCommunityManager,
  type CommunityMembershipLike,
} from "./communityCore";
import { activateCommunityMembershipCore } from "./communityMembershipLifecycle";
import { deleteMemberWorkflowPosition, getCommunityMemberWorkflowByCommunity, getMemberMilestone, resolveCurrentMilestone } from "./communityMemberWorkflowReadCore";
import { enrollWorkflowMilestoneTimers } from "./communityMemberWorkflowTimerCore";
import { runWorkflowTimerNow } from "./communityMemberWorkflows";
import { archiveActiveCommunityChannel } from "./communityChannelCore";
import { deleteCommunityPresenceForUser } from "./communityPresenceCore";
import { deleteCommunityReadCursorsForUserCommunity } from "./communityReadCursorCore";
import { deleteCommunityJoinRequestByPair } from "./communityJoinRequestCore";
import {
  TEST_MEMBER_SUBJECT_PREFIX,
  findTestMemberByUserId,
  type TestMemberRow,
} from "./communityTestMemberCore";
import { workflowConditionClauses } from "../shared/communityMemberWorkflow";

/** Running test members per community; each one is a full member record. */
export const COMMUNITY_TEST_MEMBER_LIMIT = 5;
// Test data is a few dozen rows; this bounds one end call per table.
const CLEANUP_BATCH = 500;

function randomToken(length: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

async function listRunning(ctx: any, communityId: any): Promise<TestMemberRow[]> {
  const rows = (await ctx.db.query("communityTestMembers")
    .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", communityId))
    .order("desc").take(50)) as TestMemberRow[];
  return rows.filter((row) => row.endedAt === undefined);
}

async function requireManagerNotTestMember(ctx: any, args: { authSubject?: string; communityId: any }) {
  const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
  if (await findTestMemberByUserId(ctx, userId)) throw new Error("test_member_cannot_manage");
  const { community } = await requireCommunityManager({ ctx, communityId: args.communityId, userId });
  const owner = await ctx.db.get(userId);
  if (!owner) throw new Error("user_not_found");
  return { userId, community, ownerAuthSubject: String(owner.authSubject) };
}

async function deleteAll(ctx: any, rows: Array<{ _id: any }>) {
  for (const row of rows) await ctx.db.delete(row._id);
}

/** Removes everything the test member did in the community, then the membership. */
async function deleteTestMemberData(ctx: any, row: TestMemberRow, nowMs: number) {
  const { communityId, userId } = row;
  const membership = await getUniqueCommunityMembershipByPair({ ctx, communityId, userId });
  if (membership) {
    const membershipId = membership._id;
    const workflow = await getCommunityMemberWorkflowByCommunity({ ctx, communityId });
    await deleteAll(ctx, await ctx.db.query("communityFormRequests")
      .withIndex("by_member_status", (q: any) => q.eq("membershipId", membershipId)).take(CLEANUP_BATCH));
    await deleteAll(ctx, await ctx.db.query("communityClientEvents")
      .withIndex("by_membership_createdAt", (q: any) => q.eq("membershipId", membershipId)).take(CLEANUP_BATCH));
    await deleteAll(ctx, await ctx.db.query("communityClientValues")
      .withIndex("by_membership", (q: any) => q.eq("membershipId", membershipId)).take(CLEANUP_BATCH));
    if (workflow) {
      await deleteAll(ctx, await ctx.db.query("communityMemberWorkflowRuns")
        .withIndex("by_workflow_membership_createdAt", (q: any) => q.eq("workflowId", workflow._id).eq("membershipId", membershipId))
        .take(CLEANUP_BATCH));
      await deleteAll(ctx, await ctx.db.query("communityMemberWorkflowTransitions")
        .withIndex("by_workflow_membership_seq", (q: any) => q.eq("workflowId", workflow._id).eq("membershipId", membershipId))
        .take(CLEANUP_BATCH));
      await deleteAll(ctx, await ctx.db.query("communityMemberWorkflowTimers")
        .withIndex("by_member_entry", (q: any) => q.eq("workflowId", workflow._id).eq("membershipId", membershipId))
        .take(CLEANUP_BATCH));
      await deleteMemberWorkflowPosition({ ctx, communityId, membershipId });
    }
    // The private channel a Workflow opened for the run goes with it.
    const serviceChannelId = (membership as { serviceChannelId?: any }).serviceChannelId;
    const channel = serviceChannelId ? await ctx.db.get(serviceChannelId) : null;
    if (channel && String(channel.communityId) === String(communityId) && channel.status === "active"
      && !channel.systemRole && (channel.createdAt ?? 0) >= row.createdAt) {
      await archiveActiveCommunityChannel({ ctx, communityId, channelId: channel._id, actorUserId: row.ownerUserId, nowMs });
      // Its other seats (the community agent) go with it.
      for (const seat of await ctx.db.query("communityChannelParticipants")
        .withIndex("by_channel_principal", (q: any) => q.eq("channelId", channel._id)).take(CLEANUP_BATCH)) {
        if (seat.status === "active") await ctx.db.patch(seat._id, { status: "revoked", updatedAt: nowMs });
      }
    }
    await ctx.db.delete(membershipId);
    await adjustCommunityActiveMemberCountForMembershipTransition({
      ctx, communityId, before: membership as CommunityMembershipLike, after: null,
    });
  }
  await deleteAll(ctx, await ctx.db.query("communityResourceProgress")
    .withIndex("by_community_user", (q: any) => q.eq("communityId", communityId).eq("userId", userId)).take(CLEANUP_BATCH));
  await deleteAll(ctx, await ctx.db.query("communityEmbedValues")
    .withIndex("by_community_user_key", (q: any) => q.eq("communityId", communityId).eq("userId", userId)).take(CLEANUP_BATCH));
  await deleteAll(ctx, await ctx.db.query("communityReferrals")
    .withIndex("by_community_user", (q: any) => q.eq("communityId", communityId).eq("userId", userId)).take(CLEANUP_BATCH));
  await deleteAll(ctx, await ctx.db.query("communityMemberSettings")
    .withIndex("by_community_user", (q: any) => q.eq("communityId", communityId).eq("userId", userId)).take(CLEANUP_BATCH));
  await deleteAll(ctx, await ctx.db.query("memberFacts")
    .withIndex("by_user_community", (q: any) => q.eq("userId", userId).eq("communityId", communityId)).take(CLEANUP_BATCH));
  // Pod seats (their personal pod is archived above, shared pods too) stop counting them.
  for (const seat of await ctx.db.query("communityChannelParticipants")
    .withIndex("by_community_principal_status", (q: any) => q.eq("communityId", communityId).eq("principalKey", `user:${userId}`).eq("status", "active"))
    .take(CLEANUP_BATCH)) {
    await ctx.db.patch(seat._id, { status: "revoked", updatedAt: nowMs });
  }
  await deleteCommunityReadCursorsForUserCommunity(ctx, communityId, userId);
  await deleteCommunityPresenceForUser({ ctx, communityId, userId });
  await deleteCommunityJoinRequestByPair({ ctx, communityId, userId });
  // Autoplay's posts come down with the run, so members don't keep seeing them.
  for (const entry of row.autoplayDone ?? []) {
    const rootId = entry.startsWith("posted:") ? ctx.db.normalizeId("communityInteractionRoots", entry.slice(7)) : null;
    const root = rootId ? await ctx.db.get(rootId) : null;
    if (root && String(root.actorUserId) === String(userId) && root.status === "live") await ctx.db.patch(root._id, { status: "hidden", updatedAt: nowMs });
  }
  // The user row stays (chat posts point at it) but can no longer sign in as anything.
  await ctx.db.patch(row._id, { endedAt: nowMs, autoplayUntil: undefined, autoplayPending: undefined });
}

function projectRow(row: TestMemberRow, membershipId: string | null, viewerUserId: any) {
  return {
    id: String(row._id),
    label: row.label,
    start_milestone_key: row.startMilestoneKey ?? null,
    membership_id: membershipId,
    created_at: new Date(row.createdAt).toISOString(),
    // Only the manager who started a test run can open the community as it.
    mine: String(row.ownerUserId) === String(viewerUserId),
    auth_subject: String(row.ownerUserId) === String(viewerUserId) ? row.authSubject : null,
  };
}

export const listTestMembers = query({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const { userId } = await requireManagerNotTestMember(ctx, args);
    const rows = await listRunning(ctx, args.communityId);
    const projected = await Promise.all(rows.map(async (row) => {
      const membership = await getUniqueCommunityMembershipByPair({ ctx, communityId: args.communityId, userId: row.userId });
      return projectRow(row, membership ? String(membership._id) : null, userId);
    }));
    return { kind: "community_test_members", limit: COMMUNITY_TEST_MEMBER_LIMIT, test_members: projected };
  },
});

/** Creates a test member that joins like a new member: join rules, welcome flow and all. */
export const startTestMember = mutation({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    /** Start in this Workflow stage instead of joining at the first, to test that stage's rules. */
    milestoneKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, ownerAuthSubject } = await requireManagerNotTestMember(ctx, args);
    const workflow = await getCommunityMemberWorkflowByCommunity({ ctx, communityId: args.communityId });
    const startStage = args.milestoneKey ? workflow?.milestones.find((m) => m.key === args.milestoneKey) : undefined;
    if (args.milestoneKey && !startStage) throw new Error("test_member_stage_not_found");
    const laterStage = startStage && startStage.key !== workflow!.milestones[0]?.key ? startStage : undefined;
    const running = await listRunning(ctx, args.communityId);
    if (running.length >= COMMUNITY_TEST_MEMBER_LIMIT) throw new Error("test_member_limit_reached");
    const nowMs = Date.now();
    const latest = (await ctx.db.query("communityTestMembers")
      .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", args.communityId))
      .order("desc").first()) as TestMemberRow | null;
    const number = (latest?.number ?? 0) + 1;
    const label = `Test member ${number}`;
    const token = randomToken(12);
    const authSubject = `${TEST_MEMBER_SUBJECT_PREFIX}${token}`;
    const handle = `test-${token.slice(0, 8)}`;
    const testUserId = await ctx.db.insert("users", {
      authSubject, displayName: label, handle, normalizedHandle: handle, createdAt: nowMs, updatedAt: nowMs,
    });
    const testMemberId = await ctx.db.insert("communityTestMembers", {
      communityId: args.communityId, userId: testUserId, authSubject, ownerUserId: userId, ownerAuthSubject,
      label, number, ...(laterStage ? { startMilestoneKey: laterStage.key } : {}),
      createdAt: nowMs,
    });
    const activation = await activateCommunityMembershipCore({
      ctx, communityId: args.communityId, userId: testUserId, role: "member",
      accessSource: "manual_grant", activationReason: "test_member", nowMs,
    });
    if (laterStage) {
      // Placed straight into the stage, as if moved there on joining: the
      // first stage's join rules stand down and this stage's timers start now.
      await ctx.db.insert("communityMemberWorkflowMemberMilestones", {
        workflowId: workflow!._id, membershipId: activation.membership._id, currentMilestoneKey: laterStage.key,
        milestoneEnteredAt: nowMs, transitionSeq: 1, createdAt: nowMs, updatedAt: nowMs,
      });
      for (const timer of await ctx.db.query("communityMemberWorkflowTimers")
        .withIndex("by_member_entry", (q: any) => q.eq("workflowId", workflow!._id).eq("membershipId", activation.membership._id))
        .take(20)) await ctx.db.patch(timer._id, { status: "obsolete", finishedAt: nowMs });
      await enrollWorkflowMilestoneTimers({ ctx, membership: activation.membership, nowMs });
    }
    return {
      id: String(testMemberId),
      label,
      auth_subject: authSubject,
      membership_id: String(activation.membership._id),
    };
  },
});

/** Ends a test run: the test member and everything it did in the community are deleted. */
export const endTestMember = mutation({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities"), testMemberId: v.id("communityTestMembers") },
  handler: async (ctx, args) => {
    await requireManagerNotTestMember(ctx, args);
    const row = (await ctx.db.get(args.testMemberId)) as TestMemberRow | null;
    if (!row || String(row.communityId) !== String(args.communityId)) throw new Error("test_member_not_found");
    if (row.endedAt !== undefined) return { ok: true };
    await deleteTestMemberData(ctx, row, Date.now());
    return { ok: true };
  },
});

/** In a test-run tab: who the tab is acting as, so the page can say so. */
export const getMyTestRun = query({
  args: { authSubject: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
    const row = await findTestMemberByUserId(ctx, userId);
    if (!row || row.endedAt !== undefined) return null;
    const community = (await ctx.db.get(row.communityId)) as { slug?: string; name?: string } | null;
    return {
      label: row.label,
      community_id: String(row.communityId),
      community_slug: community?.slug ?? null,
      community_name: community?.name ?? null,
      // Autoplay's latest step while it plays, so this tab can follow along.
      autoplay: (row.autoplayUntil ?? 0) > Date.now() && row.autoplayLast
        ? { at: new Date(row.autoplayLast.at).toISOString(), text: row.autoplayLast.text,
          path: row.autoplayLast.path ?? null, target: row.autoplayLast.target ?? null } : null,
      // On screen: the step this tab should do now, in the real member screens.
      autoplay_step: (row.autoplayUntil ?? 0) > Date.now() && row.autoplayPending && !row.autoplayPending.reportedAt
        ? { id: row.autoplayPending.id, pace: row.autoplayPending.pace, ...row.autoplayPending.plan } : null,
    };
  },
});

export async function requireMyTestMember(ctx: any, args: { authSubject?: string; communityId: any; testMemberId: any }) {
  const { userId } = await requireManagerNotTestMember(ctx, args);
  const row = (await ctx.db.get(args.testMemberId)) as TestMemberRow | null;
  if (!row || String(row.communityId) !== String(args.communityId) || row.endedAt !== undefined) throw new Error("test_member_not_found");
  if (String(row.ownerUserId) !== String(userId)) throw new Error("test_member_not_yours");
  const membership = await getUniqueCommunityMembershipByPair({ ctx, communityId: row.communityId, userId: row.userId });
  if (!membership) throw new Error("test_member_not_found");
  return { row, membership };
}

export function durationText(minutes: number): string {
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (minutes % 1440 === 0) return unit(minutes / 1440, "day");
  if (minutes % 60 === 0) return unit(minutes / 60, "hour");
  return unit(minutes, "minute");
}

async function nameOf(ctx: any, table: string, id: string | undefined, field: "title" | "name"): Promise<string | null> {
  if (!id) return null;
  const normalized = ctx.db.normalizeId(table, id);
  const row = normalized ? await ctx.db.get(normalized) : null;
  return row?.[field] ?? null;
}

async function offerName(ctx: any, communityId: any, key: string): Promise<string | null> {
  const row = await ctx.db.query("communityOffers").withIndex("by_community_key", (q: any) => q.eq("communityId", communityId).eq("key", key)).unique();
  return row?.name ?? null;
}

async function trackTitle(ctx: any, communityId: any, key: string): Promise<string | null> {
  const row = await ctx.db.query("communityLessonTracks")
    .withIndex("by_community_key", (q: any) => q.eq("communityId", communityId).eq("key", key)).unique();
  return row?.title ?? (key === "main" ? "main Roadmap" : null);
}

async function propertyName(ctx: any, communityId: any, key: string): Promise<string | null> {
  const row = await ctx.db.query("communityClientProperties")
    .withIndex("by_community_key", (q: any) => q.eq("communityId", communityId).eq("key", key)).unique();
  return row?.name ?? null;
}

/** One rule of a stage, in plain words, as the Workflows editor sets it up. */
async function describeRule(ctx: any, communityId: any, rules: any[], rule: any, formName: (key: string) => Promise<string>) {
  const trigger = rule.trigger;
  const action = rule.action;
  const actionText = async (a: any): Promise<string> =>
    a.type === "request_form" ? `Send the ${await formName(a.formKey)} form`
    : a.type === "create_service_channel" ? "Create a personal pod for them"
    : a.type === "prompt_agent" ? `Agent: ${String(a.prompt ?? "").slice(0, 160)}${String(a.prompt ?? "").length > 160 ? "…" : ""}`
    : a.type === "send_email" ? `Email them: ${String(a.subject ?? "")}`
    : a.type === "set_pod_member" ? `${a.active ? "Add them to" : "Take them out of"} the ${(await nameOf(ctx, "communityChannels", a.channelId, "name")) ?? "selected"} pod`
    : a.type === "set_client_property" ? `Set ${a.propertyKey} to ${a.value === null ? "empty" : Array.isArray(a.value) ? a.value.join(", ") : String(a.value)}`
    : String(a.type ?? "action").replace(/_/g, " ");
  const predecessor = trigger.type === "previous_action_completed"
    ? rules.find((other) => other.action?.key === trigger.predecessorActionKey) : null;
  const when = trigger.type === "member_joined" ? "When they join"
    : trigger.type === "previous_action_completed" ? `${trigger.delayMinutes ? `${durationText(trigger.delayMinutes)} after` : "After"} “${predecessor ? await actionText(predecessor.action) : "the previous step"}”`
    : trigger.type === "member_contributed" ? `When they post${trigger.channelId ? ` in #${(await nameOf(ctx, "communityChannels", trigger.channelId, "name")) ?? "a channel"}` : ""}`
    : trigger.type === "form_submitted" ? `When they submit the ${await formName(trigger.formKey)} form`
    : trigger.type === "milestone_elapsed" && trigger.delayMinutes === 0 && !trigger.nudge ? "When they reach this stage"
    : trigger.type === "milestone_elapsed" ? trigger.nudge
      ? `If they're still in this stage ${durationText(trigger.delayMinutes)} after reaching it (a nudge; doesn't hold them here)`
      : `${durationText(trigger.delayMinutes)} after they reach this stage`
    : trigger.type === "lesson_completed" ? `When they finish ${trigger.resourceId ? `“${(await nameOf(ctx, "communityResources", trigger.resourceId, "title")) ?? "a lesson"}”` : "any lesson"}`
    : trigger.type === "course_completed" ? `When they finish ${trigger.moduleId ? `the ${(await nameOf(ctx, "communityResourceModules", trigger.moduleId, "name")) ?? ""} course` : "any course"}`
    : trigger.type === "track_completed" ? `When they finish ${trigger.trackKey ? `the “${(await trackTitle(ctx, communityId, trigger.trackKey)) ?? trigger.trackKey}” track` : "any Roadmap track"}`
    : trigger.type === "property_date" ? `${trigger.offsetDays === 0 ? "On" : `${Math.abs(trigger.offsetDays)} day${Math.abs(trigger.offsetDays) === 1 ? "" : "s"} ${trigger.offsetDays < 0 ? "before" : "after"}`} the ${(await propertyName(ctx, communityId, trigger.propertyKey)) ?? trigger.propertyKey} date on their record`
    : trigger.type === "client_property_changed" ? `When ${(await propertyName(ctx, communityId, trigger.propertyKey)) ?? trigger.propertyKey} changes${trigger.value === undefined ? "" : ` to ${String(trigger.value)}`} on their record`
    : trigger.type === "offer_started" || trigger.type === "offer_ended"
      ? `When they ${trigger.type === "offer_started" ? "start" : "leave"} ${trigger.offerKey ? `the “${(await offerName(ctx, communityId, trigger.offerKey)) ?? trigger.offerKey}” offer` : "any offer"}`
    : trigger.type === "pod_member_added" ? `When they're added to ${trigger.channelId ? `the ${(await nameOf(ctx, "communityChannels", trigger.channelId, "name")) ?? "selected"} pod` : "any pod"}`
    : "When its trigger happens";
  const condition = rule.condition;
  const clause = (c: { propertyKey: string; op: string; value?: unknown }) => c.op === "is_set" ? `${c.propertyKey} is filled in`
    : c.op === "is_empty" ? `${c.propertyKey} is empty` : `${c.propertyKey} ${c.op === "is" ? "is" : "is not"} ${String(c.value)}`;
  const only = !condition ? "" : `${condition.otherwise ? ", otherwise (when this isn't true:" : ", only if"} ${workflowConditionClauses(condition)
    .map(clause).join(condition.match === "any" ? " or " : " and ")}${condition.otherwise ? ")" : ""}`;
  return { when: when + only, does: await actionText(action), timed: trigger.type === "milestone_elapsed" || !!trigger.delayMinutes };
}

/**
 * The test member's way through the Workflow, stage by stage: every rule in
 * order, what it waits for, and whether it has run (and when), is timed for
 * later, or failed. This is how an owner reviews a welcome sequence.
 */
export const getTestRunSequence = query({
  args: { authSubject: v.optional(v.string()), communityId: v.id("communities"), testMemberId: v.id("communityTestMembers") },
  handler: async (ctx, args) => {
    const { membership } = await requireMyTestMember(ctx, args);
    const workflow = await getCommunityMemberWorkflowByCommunity({ ctx, communityId: args.communityId });
    if (!workflow || !workflow.milestones.length) return { kind: "community_test_run_sequence", stages: [], completed_at: null };
    const state = await getMemberMilestone({ ctx, workflowId: workflow._id, membershipId: membership._id });
    const current = resolveCurrentMilestone({ workflow, membership, state });
    const [runs, timers] = await Promise.all([
      ctx.db.query("communityMemberWorkflowRuns")
        .withIndex("by_workflow_membership_createdAt", (q: any) => q.eq("workflowId", workflow._id).eq("membershipId", membership._id))
        .order("desc").take(200),
      ctx.db.query("communityMemberWorkflowTimers")
        .withIndex("by_member_entry", (q: any) => q.eq("workflowId", workflow._id).eq("membershipId", membership._id))
        .take(100),
    ]);
    const forms = new Map<string, string>();
    const formName = async (key: string) => {
      if (!forms.has(key)) {
        const form = await ctx.db.query("communityForms")
          .withIndex("by_community_key", (q: any) => q.eq("communityId", args.communityId).eq("key", key)).first();
        forms.set(key, form?.name ?? key);
      }
      return forms.get(key)!;
    };
    const visitedKeys = new Set((runs as any[]).map((run) => run.milestoneKey));
    const stages = [];
    for (const [index, stage] of workflow.milestones.entries()) {
      const isCurrent = !current.completedAt && stage.key === current.milestone.key;
      const reached = isCurrent || index < current.milestoneIndex || current.completedAt !== null && current.completedAt !== undefined || visitedKeys.has(stage.key);
      const steps = [];
      for (const rule of stage.automations) {
        const described = await describeRule(ctx, args.communityId, stage.automations, rule, formName);
        const run = (runs as any[]).find((row) => row.milestoneKey === stage.key && row.automationKey === rule.key
          && (!isCurrent || row.milestoneEnteredAt === current.milestoneEnteredAt));
        const timer = isCurrent ? (timers as any[]).find((row) => row.automationKey === rule.key && row.status === "pending"
          && row.milestoneKey === stage.key && row.milestoneEnteredAt === current.milestoneEnteredAt) : null;
        const status = run ? (run.status === "finished" ? "done" : run.status === "failed" ? "failed" : "running")
          : timer ? "scheduled" : isCurrent ? "waiting" : reached ? "skipped" : "not_reached";
        steps.push({
          key: rule.key,
          when: described.when,
          does: described.does,
          status,
          at: run ? new Date(run.finishedAt ?? run.updatedAt ?? run.createdAt).toISOString() : null,
          due_at: timer ? new Date(timer.dueAt).toISOString() : null,
          error: run?.status === "failed" ? String(run.errorCode ?? "unknown").replace(/_/g, " ") : null,
          note: run?.actionResult?.resultCode === "agent_previewed" ? "Previewed, not sent"
            : run?.actionResult?.resultCode === "email_previewed" ? "Previewed, not sent"
            : run?.actionResult?.resultCode === "email_queued" ? "A test copy went to your inbox"
            : run?.actionResult?.resultCode === "email_opted_out" ? "Not sent: they unsubscribed"
            : run?.actionResult?.resultCode === "email_not_sent" ? "Not sent: no verified email address"
            : run?.actionResult?.resultCode === "condition_skipped" ? "Skipped: its “only if” didn't match"
            : run?.actionResult?.resultCode === "path_skipped" ? "Skipped: the step before it was skipped" : null,
        });
      }
      stages.push({
        key: stage.key,
        name: stage.name,
        is_current: isCurrent,
        reached,
        entered_at: isCurrent ? new Date(current.milestoneEnteredAt).toISOString() : null,
        steps,
      });
    }
    return {
      kind: "community_test_run_sequence",
      stages,
      completed_at: current.completedAt ? new Date(current.completedAt).toISOString() : null,
    };
  },
});

/** Skips the wait on the test member's timed steps in their current stage: one, or all of them. */
export const runTestMemberTimedStepsNow = mutation({
  args: {
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    testMemberId: v.id("communityTestMembers"),
    automationKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { membership } = await requireMyTestMember(ctx, args);
    const workflow = await getCommunityMemberWorkflowByCommunity({ ctx, communityId: args.communityId });
    if (!workflow) return { ran: 0 };
    const pending = (await ctx.db.query("communityMemberWorkflowTimers")
      .withIndex("by_member_entry", (q: any) => q.eq("workflowId", workflow._id).eq("membershipId", membership._id))
      .take(100)).filter((timer: any) => timer.status === "pending" && (!args.automationKey || timer.automationKey === args.automationKey))
      .sort((a: any, b: any) => a.dueAt - b.dueAt);
    let ran = 0;
    for (const timer of pending) if (await runWorkflowTimerNow(ctx, timer)) ran += 1;
    return { ran };
  },
});

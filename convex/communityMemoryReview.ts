// The guide's nightly memory review (docs/specs/agent-system-slice-1.md,
// step 4). A post or reply by a person in an open channel makes the
// community's review due at its next quiet hour; a job is scheduled for that
// one row. The review runs the guide on the run entry with the memory review
// lens: it reads what was said, writes notes with memory.observe and
// rewrites memory.md. A quiet community costs nothing; with AI off nothing
// runs. A daily sweep re-schedules any due row whose job was lost.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { communityIsActive } from "../shared/communityLifecycle";
import { MEMORY_REVIEW_INSTRUCTIONS, type AgentLens } from "../shared/agentLens";
import { nextMemoryReviewAtMs } from "../shared/communityMemory";
import { communityTimeZone, scheduleMemoryReview } from "./communityMemory";
import { runFundedCommunityAgent, type CommunityAgentRunEvent } from "./communityAgentRun";
import { executePolynetCanonicalTool } from "./polynetCanonicalExecutor";
import { founderProviderRequests } from "./founderInferenceUsage";
import { resolveCommunityInferenceFundingForAction, settleCommunityInferenceFundingSession } from "./founderInferenceRuntime";

const internalRefs = internal as any;
const LEASE_MS = 15 * 60_000;
const RETRY_MS = 30 * 60_000;
const MAX_FAILURES = 3;
const REVIEW_MAX_TOOL_STEPS = 24;
const REVIEW_MAX_OUTPUT_TOKENS = 1_500;
const LOST_AFTER_MS = 2 * 60 * 60_000;
const SWEEP_LIMIT = 100;

export const claimMemoryReviewInternal = internalMutation({
  args: { workId: v.id("agentWork"), nowMs: v.number() },
  handler: async (ctx, args) => {
    const work = await ctx.db.get(args.workId);
    if (!work || !work.dueAt || work.dueAt > args.nowMs + 60_000) return null;
    if (work.leaseUntil && work.leaseUntil > args.nowMs) return null;
    const community = await ctx.db.get(work.communityId);
    if (!community || !communityIsActive(community as any)) {
      await ctx.db.patch(work._id, { dueAt: undefined, updatedAt: args.nowMs });
      return null;
    }
    if (work.pending <= 0) {
      await ctx.db.patch(work._id, { dueAt: undefined, updatedAt: args.nowMs });
      return null;
    }
    const owner = await ctx.db.get(community.ownerId);
    if (!owner?.authSubject) return null;
    await ctx.db.patch(work._id, { leaseUntil: args.nowMs + LEASE_MS, updatedAt: args.nowMs });
    return {
      communityId: work.communityId, communitySlug: community.slug, communityName: community.name,
      ownerUserId: community.ownerId, ownerAuthSubject: owner.authSubject,
      windowStart: work.reviewedThrough, windowEnd: args.nowMs, claimedPending: work.pending,
    };
  },
});

export const completeMemoryReviewInternal = internalMutation({
  args: {
    workId: v.id("agentWork"),
    outcome: v.union(v.literal("reviewed"), v.literal("failed"), v.literal("skipped")),
    windowEnd: v.number(),
    claimedPending: v.number(),
    errorCode: v.optional(v.string()),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const work = await ctx.db.get(args.workId);
    if (!work) return null;
    if (args.outcome === "reviewed") {
      // Posts written while the review ran wait for the next one.
      const pending = Math.max(0, work.pending - args.claimedPending);
      const dueAt = pending > 0 ? nextMemoryReviewAtMs(args.nowMs, await communityTimeZone(ctx, work.communityId)) : undefined;
      await ctx.db.patch(work._id, { reviewedThrough: args.windowEnd, pending, dueAt, leaseUntil: undefined, failures: 0, lastErrorCode: undefined, updatedAt: args.nowMs });
      if (dueAt) await scheduleMemoryReview(ctx, work._id, dueAt);
      return { dueAt: dueAt ?? null };
    }
    if (args.outcome === "skipped") {
      // AI is off: nothing runs. The next post after it's on makes it due again.
      await ctx.db.patch(work._id, { dueAt: undefined, leaseUntil: undefined, updatedAt: args.nowMs });
      return { dueAt: null };
    }
    const failures = work.failures + 1;
    const dueAt = failures < MAX_FAILURES ? args.nowMs + RETRY_MS : undefined;
    await ctx.db.patch(work._id, { failures, dueAt, leaseUntil: undefined, lastErrorCode: args.errorCode?.slice(0, 120), updatedAt: args.nowMs });
    if (dueAt) await scheduleMemoryReview(ctx, work._id, dueAt);
    return { dueAt: dueAt ?? null };
  },
});

// The open channels with something new since the last review.
export const listOpenChannelsWithNewInternal = internalQuery({
  args: { communityId: v.id("communities"), sinceMs: v.number() },
  handler: async (ctx, args) => {
    const channels = await ctx.db.query("communityChannels")
      .withIndex("by_community_access_status_position", (q) => q.eq("communityId", args.communityId).eq("accessMode", "all_members").eq("status", "active"))
      .take(100);
    const out: Array<{ slug: string; name: string; count: number }> = [];
    for (const channel of channels) {
      let count = 0;
      for (const table of ["communityInteractionRoots", "communityInteractionReplies"] as const) {
        for (const scope of ["community", "public"] as const) {
          count += (await ctx.db.query(table).withIndex("by_community_channel_visibility_status_createdAt", (q: any) =>
            q.eq("communityId", args.communityId).eq("channelId", channel._id).eq("visibilityScope", scope).eq("status", "live").gt("createdAt", args.sinceMs))
            .take(201)).length;
        }
      }
      if (count > 0) out.push({ slug: channel.slug, name: channel.name, count });
    }
    return out;
  },
});

function eventRecorder(ctx: any, communityId: any, runId: string) {
  let seq = 1;
  let buffer: Array<CommunityAgentRunEvent & { seq: number }> = [];
  const flushAll = async () => {
    if (buffer.length === 0) return;
    const events = buffer;
    buffer = [];
    await ctx.runMutation(internalRefs.communityAgentServeWorker.recordCommunityAgentRunEventsInternal, { communityId, runId, events });
  };
  const record = async (event: CommunityAgentRunEvent) => {
    buffer.push({ ...event, seq: seq++ });
    if (buffer.length >= 10) await flushAll();
  };
  return { record, recordRequired: async (event: CommunityAgentRunEvent) => { await record(event); await flushAll(); }, flushAll };
}

export const runMemoryReviewInternal = internalAction({
  args: { workId: v.id("agentWork") },
  handler: async (ctx, args) => {
    const claim = await ctx.runMutation(internalRefs.communityMemoryReview.claimMemoryReviewInternal, { workId: args.workId, nowMs: Date.now() });
    if (!claim) return { status: "not_due" };
    const complete = (outcome: "reviewed" | "failed" | "skipped", errorCode?: string) =>
      ctx.runMutation(internalRefs.communityMemoryReview.completeMemoryReviewInternal, {
        workId: args.workId, outcome, windowEnd: claim.windowEnd, claimedPending: claim.claimedPending, nowMs: Date.now(),
        ...(errorCode ? { errorCode } : {}),
      });

    const admission = await resolveCommunityInferenceFundingForAction(ctx, claim.communityId);
    if (!admission.ok) {
      await complete("skipped");
      return { status: "skipped" };
    }
    const { runId } = await ctx.runMutation(internalRefs.communityMemory.openMemoryReviewRunInternal, {
      communityId: claim.communityId, windowStart: claim.windowStart, windowEnd: claim.windowEnd, nowMs: Date.now(),
    });
    const finish = (extra: Record<string, unknown>) => ctx.runMutation(internalRefs.communityMemory.finishMemoryReviewRunInternal, {
      communityId: claim.communityId, runId, nowMs: Date.now(), ...extra,
    });
    const channels = await ctx.runQuery(internalRefs.communityMemoryReview.listOpenChannelsWithNewInternal, {
      communityId: claim.communityId, sinceMs: claim.windowStart });
    if (channels.length === 0) {
      await finish({});
      await complete("reviewed");
      return { status: "empty" };
    }

    const root = `/communities/${claim.communitySlug}/`;
    const lens: AgentLens = { name: "memory_review", runId: String(runId), sinceMs: claim.windowStart };
    const messages = [
      { role: "system", content: `${MEMORY_REVIEW_INSTRUCTIONS}\n\nThis community: ${claim.communityName} (${root}).` },
      { role: "user", content: [
        `Review what was said from ${new Date(claim.windowStart).toISOString()} to ${new Date(claim.windowEnd).toISOString()}.`,
        "Channels with something new:",
        ...channels.map((channel: any) => `- #${channel.name} (${channel.count}${channel.count > 200 ? "+" : ""}): ${root}channels/${channel.slug}/new.md`),
        `Start with ${root}memory.md.`,
      ].join("\n") },
    ];
    const recorder = eventRecorder(ctx, claim.communityId, `memory-review:${String(runId)}`);
    const run = await runFundedCommunityAgent({
      ctx,
      communityId: claim.communityId,
      actorUserId: claim.ownerUserId,
      surface: "community_autonomous_cognition",
      receiptKey: `community_memory_review:${String(runId)}`,
      sourceRunId: `community-memory-review:${String(runId)}`,
      admission,
      messages,
      maxOutputTokens: REVIEW_MAX_OUTPUT_TOKENS,
      maxToolSteps: REVIEW_MAX_TOOL_STEPS,
      promptCacheKey: `pn:${String(claim.communityId)}:memory-review`,
      recorder,
      executeTool: async (toolName, rawArguments) => {
        const result = await executePolynetCanonicalTool({
          ctx, authSubject: claim.ownerAuthSubject, userId: String(claim.ownerUserId), principalKind: "community_agent",
          mountedCommunityId: String(claim.communityId), evidenceSurface: "community_concierge", toolName, input: rawArguments, lens,
        });
        return result.ok
          ? { status: "ok", exitCode: 0, outputText: JSON.stringify(result.value), errorCode: null, errorMessage: null }
          : { status: "error", exitCode: null, outputText: "", errorCode: result.code, errorMessage: result.message };
      },
    });
    if (!run.ok) {
      await finish({ failed: true, errorCode: run.failureCode });
      await complete("failed", run.failureCode);
      return { status: "failed", errorCode: run.failureCode };
    }
    try {
      await settleCommunityInferenceFundingSession({
        ctx, session: run.fundingSession, promptTokens: run.usage.promptTokens, completionTokens: run.usage.completionTokens,
        providerRequests: founderProviderRequests(run.usage), usageComplete: run.usage.complete, outcomeCode: "provider_completed",
      });
    } catch {
      // The receipt's own lease settles it as indeterminate; the review's work stands.
    }
    await finish({ summary: run.assistantText, promptTokens: run.usage.promptTokens, completionTokens: run.usage.completionTokens });
    await complete("reviewed");
    return { status: "reviewed" };
  },
});

// A job lost to a deploy or a crash: any row still due long after its time
// gets a new one. Once a day.
export const repairMemoryReviewScheduleInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const nowMs = Date.now();
    const lost = await ctx.db.query("agentWork").withIndex("by_dueAt", (q) => q.gt("dueAt", 0).lt("dueAt", nowMs - LOST_AFTER_MS)).take(SWEEP_LIMIT);
    let rescheduled = 0;
    for (const work of lost) {
      if (work.leaseUntil && work.leaseUntil > nowMs) continue;
      await ctx.db.patch(work._id, { dueAt: nowMs + 60_000, updatedAt: nowMs });
      await scheduleMemoryReview(ctx, work._id, nowMs + 60_000);
      rescheduled += 1;
    }
    return { rescheduled };
  },
});

// Operator tool: run a community's review now, reading from a chosen time
// (acceptance runs on staging; a review after turning learning on).
export const requestMemoryReviewNowInternal = internalMutation({
  args: { communityId: v.id("communities"), sinceMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const work = await ctx.db.query("agentWork")
      .withIndex("by_community_scope_kind", (q) => q.eq("communityId", args.communityId).eq("scope", "community").eq("kind", "memory_review"))
      .first();
    const reviewedThrough = args.sinceMs ?? work?.reviewedThrough ?? nowMs - 24 * 60 * 60_000;
    let workId = work?._id;
    if (work) {
      await ctx.db.patch(work._id, { pending: Math.max(1, work.pending), reviewedThrough, dueAt: nowMs, leaseUntil: undefined, failures: 0, updatedAt: nowMs });
    } else {
      workId = await ctx.db.insert("agentWork", {
        communityId: args.communityId, scope: "community", kind: "memory_review", pending: 1, firstPendingAt: nowMs,
        reviewedThrough, dueAt: nowMs, failures: 0, createdAt: nowMs, updatedAt: nowMs,
      });
    }
    await scheduleMemoryReview(ctx, workId, nowMs);
    return { workId };
  },
});

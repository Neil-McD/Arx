// Work the guide does with nobody present (docs/specs/agent-system-end-state.md
// §3.5): the nightly memory review and a place's brief. It has nothing of its
// own: the same records, the one run entry and the worker lens. Each kind of
// work is a row per scope (agentWork) that events make due; a job is scheduled
// for that one row, and a daily sweep re-schedules any due row whose job was
// lost. This file is what every kind shares: claiming a row and completing
// it, and runAgentWork, the run itself. A kind (convex/communityMemoryReview.ts,
// convex/communityBriefs.ts) says only what the guide is shown, its
// instructions, and how its one write is checked and applied.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { communityIsActive } from "../shared/communityLifecycle";
import { nextMemoryReviewAtMs } from "../shared/communityMemory";
import { nextBriefAtMs } from "../shared/communityBriefs";
import { REPLY_DRAFT_WAIT_MS } from "../shared/communityReplyDrafts";
import { communityScopeKey, dueWork, parseScopeKey, type AgentWorkKind, type ScopeKey } from "./communityNotesStore";
import { communityTimeZone, guideSeatedInPod, scheduleAgentWork } from "./communityMemory";
import { runFundedCommunityAgent, type CommunityAgentRunEvent } from "./communityAgentRun";
import { founderProviderRequests } from "./founderInferenceUsage";
import { settleCommunityInferenceFundingSession } from "./founderInferenceRuntime";
import { communityAgentIsOn } from "./communityApps";
import { resolveCommunityInferenceFundingAdmission } from "./founderInferenceCore";

const internalRefs = internal as any;
const LEASE_MS = 15 * 60_000;
const RETRY_MS = 30 * 60_000;
const MAX_FAILURES = 3;
const LOST_AFTER_MS = 2 * 60 * 60_000;
const SWEEP_LIMIT = 100;
const BACKLOG_NEXT_MS = 15 * 60_000;

export const claimAgentWorkInternal = internalMutation({
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
    if (!owner?.authSubject) {
      await ctx.db.patch(work._id, { dueAt: undefined, leaseUntil: undefined, leaseToken: undefined, updatedAt: args.nowMs });
      return null;
    }
    // The owner's agent switch and the funding, together: with either off,
    // nothing runs and nothing is spent.
    if (!(await communityAgentIsOn(ctx, work.communityId))) {
      await ctx.db.patch(work._id, { dueAt: undefined, leaseUntil: undefined, leaseToken: undefined, updatedAt: args.nowMs });
      return { skipped: true as const };
    }
    // A pod's review runs only while its room is open and the guide works there.
    const scope = parseScopeKey((work.scopeKey as ScopeKey | undefined) ?? communityScopeKey(work.communityId));
    let pod: { roomId: string; name: string } | null = null;
    if (scope?.kind === "pod") {
      const room = await ctx.db.get(ctx.db.normalizeId("communityChannels", scope.id) as any) as any;
      if (!room || String(room.communityId) !== String(work.communityId) || room.accessMode !== "restricted" || room.status !== "active"
        || !(await guideSeatedInPod(ctx, room._id))) {
        await ctx.db.patch(work._id, { dueAt: undefined, leaseUntil: undefined, leaseToken: undefined, updatedAt: args.nowMs });
        return { skipped: true as const };
      }
      pod = { roomId: String(room._id), name: String(room.name ?? "") };
    }
    const leaseToken = `${args.nowMs}:${Math.random().toString(36).slice(2, 10)}`;
    await ctx.db.patch(work._id, { leaseUntil: args.nowMs + LEASE_MS, leaseToken, updatedAt: args.nowMs });
    return {
      pod,
      leaseToken,
      communityId: work.communityId, communitySlug: community.slug, communityName: community.name,
      ownerUserId: community.ownerId, ownerAuthSubject: owner.authSubject,
      windowStart: work.reviewedThrough, windowEnd: args.nowMs, claimedPending: work.pending,
    };
  },
});

export const completeAgentWorkInternal = internalMutation({
  args: {
    workId: v.id("agentWork"),
    leaseToken: v.optional(v.string()),
    outcome: v.union(v.literal("reviewed"), v.literal("failed"), v.literal("skipped")),
    windowEnd: v.number(),
    claimedPending: v.number(),
    // Posts past windowEnd were left for the next review (a busy window).
    backlog: v.optional(v.boolean()),
    errorCode: v.optional(v.string()),
    // The kind knows when it next has something to look at (a question
    // reaching a day old): due then, whatever else arrived meanwhile.
    nextDueAt: v.optional(v.number()),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const work = await ctx.db.get(args.workId);
    if (!work) return null;
    if (args.leaseToken && work.leaseToken && work.leaseToken !== args.leaseToken) return null;
    if (args.outcome === "reviewed" && args.nextDueAt && !args.backlog) {
      const dueAt = Math.max(args.nextDueAt, args.nowMs + 60_000);
      await ctx.db.patch(work._id, { reviewedThrough: args.windowEnd, pending: Math.max(1, work.pending - args.claimedPending), dueAt,
        leaseUntil: undefined, leaseToken: undefined, failures: 0, lastErrorCode: undefined, updatedAt: args.nowMs });
      await scheduleAgentWork(ctx, work._id, dueAt);
      return { dueAt };
    }
    if (args.outcome === "reviewed") {
      // Posts written while the review ran, or left over from a busy window,
      // wait for the next one: a backlog soon, new posts at the quiet hour.
      const pending = args.backlog ? Math.max(1, work.pending) : Math.max(0, work.pending - args.claimedPending);
      // A brief written while more happened is due again once its gap has passed.
      const dueAt = args.backlog ? args.nowMs + BACKLOG_NEXT_MS
        : pending <= 0 ? undefined
          : work.kind === "brief" ? nextBriefAtMs(args.nowMs, args.nowMs)
            // Posts written while a draft was made: look again when they are a day old.
            : work.kind === "reply_draft" ? args.nowMs + REPLY_DRAFT_WAIT_MS
            : nextMemoryReviewAtMs(args.nowMs, await communityTimeZone(ctx, work.communityId));
      await ctx.db.patch(work._id, { reviewedThrough: args.windowEnd, pending, dueAt, leaseUntil: undefined, leaseToken: undefined, failures: 0, lastErrorCode: undefined, updatedAt: args.nowMs });
      if (dueAt) await scheduleAgentWork(ctx, work._id, dueAt);
      return { dueAt: dueAt ?? null };
    }
    if (args.outcome === "skipped") {
      // AI is off: nothing runs. The next post after it's on makes it due again.
      await ctx.db.patch(work._id, { dueAt: undefined, leaseUntil: undefined, leaseToken: undefined, updatedAt: args.nowMs });
      return { dueAt: null };
    }
    const failures = work.failures + 1;
    const dueAt = failures < MAX_FAILURES ? args.nowMs + RETRY_MS : undefined;
    await ctx.db.patch(work._id, { failures, dueAt, leaseUntil: undefined, leaseToken: undefined, lastErrorCode: args.errorCode?.slice(0, 120), updatedAt: args.nowMs });
    if (dueAt) await scheduleAgentWork(ctx, work._id, dueAt);
    return { dueAt: dueAt ?? null };
  },
});

export const readAgentWorkAdmissionInternal = internalQuery({
  args: { communityId: v.id("communities") },
  handler: async (ctx, args) => await resolveCommunityInferenceFundingAdmission(ctx, args.communityId),
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


// What a claimed row gives its run.
export type AgentWorkClaim = {
  // A pod's work: its room. Null: the community's.
  pod: { roomId: string; name: string } | null;
  leaseToken: string;
  communityId: any; communitySlug: string; communityName: string;
  ownerUserId: any; ownerAuthSubject: string;
  windowStart: number; windowEnd: number; claimedPending: number;
};

// What a write did: it went through (ended: text that ends the run there,
// when nothing is left to fix), or it was refused with the reason.
export type AgentWorkWrite =
  | { ok: true; output: unknown; ended: string | null }
  | { ok: false; code: string; message: string };

export type AgentWorkJob = {
  // Nothing to do: the run is recorded as empty and nothing is spent.
  empty: boolean;
  messages: any[];
  // The work read up to here; with backlog, the rest is due again soon.
  readThrough?: number;
  backlog?: boolean;
  // When this kind next has something to look at, if it knows.
  nextDueAt?: number;
  write: (rawArguments: Record<string, unknown>) => Promise<AgentWorkWrite>;
};

// One run of one kind of work: claim the row, check the owner's funding, open
// the run's record, hand the guide what the kind prepared, take its one
// checked write (a write that leaves nothing to fix ends the run, with no
// further model request), settle what was spent, and complete the row.
export async function runAgentWork(ctx: any, def: {
  workId: any;
  kind: AgentWorkKind;
  // How this kind is named in receipts, run events and the prompt cache.
  names: { receipt: string; source: string; events: string; cache: string };
  maxOutputTokens: number;
  maxToolSteps: number;
  // The window on the run's record (by default, since the last run).
  window?: (claim: AgentWorkClaim) => { start: number; end: number };
  prepare: (claim: AgentWorkClaim, runId: any) => Promise<AgentWorkJob>;
  // A kind whose run must write: one that ends without a write that went
  // through fails with this code and is retried.
  mustWrite?: string;
  // What a finished run reports.
  done: string;
}): Promise<{ status: string; errorCode?: string }> {
  const claim = await ctx.runMutation(internalRefs.agentWork.claimAgentWorkInternal, { workId: def.workId, nowMs: Date.now() }) as
    AgentWorkClaim | { skipped: true } | null;
  if (!claim) return { status: "not_due" };
  if ("skipped" in claim) return { status: "skipped" };
  let readThrough = claim.windowEnd;
  let backlog = false;
  let nextDueAt: number | undefined;
  const complete = (outcome: "reviewed" | "failed" | "skipped", errorCode?: string) =>
    ctx.runMutation(internalRefs.agentWork.completeAgentWorkInternal, {
      workId: def.workId, leaseToken: claim.leaseToken, outcome, windowEnd: readThrough, claimedPending: claim.claimedPending, nowMs: Date.now(),
      ...(backlog ? { backlog: true } : {}),
      ...(nextDueAt ? { nextDueAt } : {}),
      ...(errorCode ? { errorCode } : {}),
    });
  const admission = await ctx.runQuery(internalRefs.agentWork.readAgentWorkAdmissionInternal, { communityId: claim.communityId });
  if (!admission.ok) {
    await complete("skipped");
    return { status: "skipped" };
  }
  const window = def.window?.(claim) ?? { start: claim.windowStart, end: claim.windowEnd };
  const { runId } = await ctx.runMutation(internalRefs.communityMemory.openMemoryReviewRunInternal, {
    communityId: claim.communityId, windowStart: window.start, windowEnd: window.end, nowMs: Date.now(), kind: def.kind,
    ...(claim.pod ? { podRoomId: claim.pod.roomId } : {}),
  });
  const finish = (extra: Record<string, unknown>) => ctx.runMutation(internalRefs.communityMemory.finishMemoryReviewRunInternal, {
    communityId: claim.communityId, runId, nowMs: Date.now(), ...extra,
  });
  try {
    const job = await def.prepare(claim, runId);
    // A busy window is read in parts: through the last post shown; the rest waits.
    if (job.readThrough !== undefined) readThrough = job.readThrough;
    backlog = job.backlog === true;
    nextDueAt = job.nextDueAt;
    if (job.empty) {
      await finish({});
      await complete("reviewed");
      return { status: "empty" };
    }
    const state = { wrote: false, ended: null as string | null };
    const run = await runFundedCommunityAgent({
      lens: "worker",
      ctx,
      communityId: claim.communityId,
      actorUserId: claim.ownerUserId,
      surface: "community_autonomous_cognition",
      receiptKey: `${def.names.receipt}:${String(runId)}`,
      sourceRunId: `${def.names.source}:${String(runId)}`,
      admission,
      messages: job.messages,
      maxOutputTokens: def.maxOutputTokens,
      maxToolSteps: def.maxToolSteps,
      promptCacheKey: `pn:${String(claim.communityId)}:${def.names.cache}${claim.pod ? `:${claim.pod.roomId}` : ""}`,
      recorder: eventRecorder(ctx, claim.communityId, `${def.names.events}:${String(runId)}`),
      // The call's input is parsed by the kind's own rules.
      normalizeToolArguments: (_toolName, rawArgs) => rawArgs,
      describeToolCall: (toolName, callArgs) => `${toolName} ${String(callArgs.operation ?? "")}`.trim(),
      maxConsecutiveFailures: 2,
      // The first answer is the write (it may be empty): a model that
      // describes the write instead of making it would lose the run.
      firstToolChoice: { type: "function", name: "polynet_call" },
      // A write with nothing left to fix ends the run: no further model
      // request just to say what changed.
      endWith: () => state.ended,
      executeTool: async (_toolName, rawArguments) => {
        const result = await job.write(rawArguments);
        if (!result.ok) return { status: "error" as const, exitCode: null, outputText: "", errorCode: result.code, errorMessage: result.message };
        state.wrote = true;
        if (result.ended !== null) state.ended = result.ended;
        return { status: "ok" as const, exitCode: 0, outputText: JSON.stringify(result.output), errorCode: null, errorMessage: null };
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
    } catch (settlementError) {
      // The receipt's own lease settles it as indeterminate; the run's work stands.
      console.error("agent_work_settlement_failed", { workId: String(def.workId), runId: String(runId), error: settlementError instanceof Error ? settlementError.message : String(settlementError) });
    }
    if (def.mustWrite && !state.wrote) {
      // It answered but never made a valid write: what it spent is settled, and the work is retried.
      await finish({ failed: true, errorCode: def.mustWrite });
      await complete("failed", def.mustWrite);
      return { status: "failed", errorCode: def.mustWrite };
    }
    await finish({ summary: state.ended ?? run.assistantText, promptTokens: run.usage.promptTokens, completionTokens: run.usage.completionTokens });
    await complete("reviewed");
    return { status: def.done };
  } catch (error) {
    const errorCode = error instanceof Error && error.message ? error.message.slice(0, 120) : "agent_work_unexpected_error";
    await finish({ failed: true, errorCode }).catch(() => undefined);
    await complete("failed", errorCode).catch(() => undefined);
    return { status: "failed", errorCode };
  }
}

// A job lost to a deploy or a crash: any row still due long after its time
// gets a new one. Once a day.
export const repairAgentWorkScheduleInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const nowMs = Date.now();
    const lost = await dueWork(ctx, nowMs - LOST_AFTER_MS).take(SWEEP_LIMIT);
    let rescheduled = 0;
    for (const work of lost) {
      if (work.leaseUntil && work.leaseUntil > nowMs) continue;
      await ctx.db.patch(work._id, { dueAt: nowMs + 60_000, updatedAt: nowMs });
      await scheduleAgentWork(ctx, work._id, nowMs + 60_000);
      rescheduled += 1;
    }
    return { rescheduled };
  },
});

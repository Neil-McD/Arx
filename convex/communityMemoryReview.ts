// The guide's nightly memory review (docs/specs/agent-system-slice-1.md,
// step 4). A post or reply by a person in an open channel makes the
// community's review due at its next quiet hour; a job is scheduled for that
// one row. The review runs the guide on the run entry in one pass: the
// server hands it memory.md, the notes and what was said in open channels;
// it answers with one memory.apply (notes with cited posts, a new
// memory.md), which the server checks note by note. A quiet community costs
// nothing; with AI off nothing runs. A daily sweep re-schedules any due row
// whose job was lost.
import { communityScopeKey, dueWork, insertWork, workFor } from "./communityNotesStore";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { communityIsActive } from "../shared/communityLifecycle";
import { MEMORY_APPLY_OPERATION, MEMORY_REFUSAL_WORDS, MEMORY_REVIEW_INSTRUCTIONS, nextMemoryReviewAtMs, parseMemoryApplyCall } from "../shared/communityMemory";
import { communityTimeZone, scheduleMemoryReview } from "./communityMemory";
import { runFundedCommunityAgent, type CommunityAgentRunEvent } from "./communityAgentRun";
import { founderProviderRequests } from "./founderInferenceUsage";
import { settleCommunityInferenceFundingSession } from "./founderInferenceRuntime";
import { communityAgentIsOn } from "./communityApps";
import { resolveCommunityInferenceFundingAdmission } from "./founderInferenceCore";

const internalRefs = internal as any;
const LEASE_MS = 15 * 60_000;
const RETRY_MS = 30 * 60_000;
const MAX_FAILURES = 3;
// One write, one fix-up of anything refused, and a spare.
const REVIEW_MAX_TOOL_STEPS = 3;
const REVIEW_MAX_OUTPUT_TOKENS = 4_000;
const LOST_AFTER_MS = 2 * 60 * 60_000;
const SWEEP_LIMIT = 100;
const BACKLOG_NEXT_MS = 15 * 60_000;

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
    // The owner's agent switch and the funding, together: with either off,
    // nothing runs and nothing is spent.
    if (!(await communityAgentIsOn(ctx, work.communityId))) {
      await ctx.db.patch(work._id, { dueAt: undefined, updatedAt: args.nowMs });
      return { skipped: true as const };
    }
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
    // Posts past windowEnd were left for the next review (a busy window).
    backlog: v.optional(v.boolean()),
    errorCode: v.optional(v.string()),
    nowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const work = await ctx.db.get(args.workId);
    if (!work) return null;
    if (args.outcome === "reviewed") {
      // Posts written while the review ran, or left over from a busy window,
      // wait for the next one: a backlog soon, new posts at the quiet hour.
      const pending = args.backlog ? Math.max(1, work.pending) : Math.max(0, work.pending - args.claimedPending);
      const dueAt = args.backlog ? args.nowMs + BACKLOG_NEXT_MS
        : pending > 0 ? nextMemoryReviewAtMs(args.nowMs, await communityTimeZone(ctx, work.communityId)) : undefined;
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

export const readReviewAdmissionInternal = internalQuery({
  args: { communityId: v.id("communities") },
  handler: async (ctx, args) => await resolveCommunityInferenceFundingAdmission(ctx, args.communityId),
});

// Applies one memory.apply: each note through the same checks as ever
// (cited posts, builder notes untouched, the run's limit), then memory.md.
// Each item says what happened, so a refused one can be fixed.
// A rewrite replaces a note whole, so only notes the guide was shown whole
// can be rewritten.
async function applyMemory(ctx: any, communityId: any, runId: any, rewritable: Set<string>, apply: { notes: Array<{ title: string; body: string; evidenceRefs: string[]; supersedes?: string }>; index: string | null }) {
  const results: Array<Record<string, unknown>> = [];
  for (const note of apply.notes) {
    if (note.supersedes && !rewritable.has(note.supersedes)) {
      results.push({ note: note.title, refused: "note_not_shown", why: MEMORY_REFUSAL_WORDS.note_not_shown });
      continue;
    }
    const answer = await ctx.runMutation(internalRefs.communityMemory.observeCommunityMemoryInternal, {
      communityId, runId, title: note.title, body: note.body, evidenceRefs: note.evidenceRefs,
      ...(note.supersedes ? { supersedes: note.supersedes } : {}), nowMs: Date.now(),
    });
    results.push(answer?.ok
      ? { note: note.title, written: `memory/${String(answer.slug ?? "")}.md` }
      : { note: note.title, refused: String(answer?.code ?? "refused"), why: MEMORY_REFUSAL_WORDS[String(answer?.code)] ?? "Refused." });
  }
  if (apply.index !== null) {
    const answer = await ctx.runMutation(internalRefs.communityMemory.writeCommunityMemoryIndexInternal, {
      communityId, runId, bodyMd: apply.index, nowMs: Date.now(),
    });
    results.push(answer?.ok ? { index: "written" } : { index: "refused", refused: String(answer?.code), why: MEMORY_REFUSAL_WORDS[String(answer?.code)] ?? "Refused." });
  }
  return results;
}

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
    if ("skipped" in claim) return { status: "skipped" };
    let readThrough = claim.windowEnd;
    let backlogLeft = false;
    const complete = (outcome: "reviewed" | "failed" | "skipped", errorCode?: string) =>
      ctx.runMutation(internalRefs.communityMemoryReview.completeMemoryReviewInternal, {
        workId: args.workId, outcome, windowEnd: readThrough, claimedPending: claim.claimedPending, nowMs: Date.now(),
        ...(backlogLeft ? { backlog: true } : {}),
        ...(errorCode ? { errorCode } : {}),
      });

    const admission = await ctx.runQuery(internalRefs.communityMemoryReview.readReviewAdmissionInternal, { communityId: claim.communityId });
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
    const input = await ctx.runQuery(internalRefs.communityMemory.readMemoryReviewInputInternal, {
      communityId: claim.communityId, sinceMs: claim.windowStart, untilMs: claim.windowEnd });
    // A busy window is read in parts: through the last post shown; the rest waits.
    readThrough = input.readUntil;
    backlogLeft = input.readUntil < claim.windowEnd;
    if (input.posts === 0) {
      await finish({});
      await complete("reviewed");
      return { status: "empty" };
    }

    const messages = [
      { role: "system", content: `${MEMORY_REVIEW_INSTRUCTIONS}\n\nThis community: ${claim.communityName}.` },
      { role: "user", content: input.text },
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
      // The call's input is parsed here, by the review's own rules.
      normalizeToolArguments: (_toolName, rawArgs) => rawArgs,
      describeToolCall: (toolName, callArgs) => `${toolName} ${String(callArgs.operation ?? "")}`.trim(),
      maxConsecutiveFailures: 2,
      executeTool: async (toolName, rawArguments) => {
        const failed = (errorCode: string, errorMessage: string) => ({ status: "error" as const, exitCode: null, outputText: "", errorCode, errorMessage });
        if (toolName !== "polynet_call") return failed("review_reads_nothing", `Everything is in front of you. Write with polynet_call ${MEMORY_APPLY_OPERATION}.`);
        const apply = parseMemoryApplyCall(rawArguments);
        if ("error" in apply) return failed(apply.error, `Write with polynet_call { operation: "${MEMORY_APPLY_OPERATION}", input: { notes, index } }.`);
        const results = await applyMemory(ctx, claim.communityId, runId, new Set<string>(input.rewritable), apply);
        return { status: "ok" as const, exitCode: 0, outputText: JSON.stringify({ results }), errorCode: null, errorMessage: null };
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
    const lost = await dueWork(ctx, nowMs - LOST_AFTER_MS).take(SWEEP_LIMIT);
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
    const scope = communityScopeKey(args.communityId);
    const work = await workFor(ctx, scope, "memory_review");
    const reviewedThrough = args.sinceMs ?? work?.reviewedThrough ?? nowMs - 24 * 60 * 60_000;
    let workId = work?._id;
    if (work) {
      await ctx.db.patch(work._id, { pending: Math.max(1, work.pending), reviewedThrough, dueAt: nowMs, leaseUntil: undefined, failures: 0, updatedAt: nowMs });
    } else {
      workId = await insertWork(ctx, scope, {
        communityId: args.communityId, kind: "memory_review", pending: 1, firstPendingAt: nowMs,
        reviewedThrough, dueAt: nowMs, failures: 0, createdAt: nowMs, updatedAt: nowMs,
      });
    }
    await scheduleMemoryReview(ctx, workId, nowMs);
    return { workId };
  },
});

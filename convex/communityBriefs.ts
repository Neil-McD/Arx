// A place's brief (shared/communityBriefs.ts): the guide, with nobody
// present, rewrites what's happening in the community and what matters next,
// an hour after the first new post or reply in its open channels, so a burst
// is read once. It runs on the one run entry with the worker lens: the server
// hands it the place's recent activity, its numbers, its memory.md and the
// last brief, and it answers with one brief.write. A quiet place costs
// nothing; with AI off nothing runs. Pods get their own briefs next.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { listSharedChannelReadableRows } from "./communityChannelCore";
import { buildSnapshot, displayName } from "./communityFounderBrief";
import { communityScopeKey, insertWork, memoryIndexFor, briefFor, workFor, writeBrief, type ScopeKey } from "./communityNotesStore";
import { scheduleAgentWork } from "./communityMemory";
import { runFundedCommunityAgent, type CommunityAgentRunEvent } from "./communityAgentRun";
import { founderProviderRequests } from "./founderInferenceUsage";
import { settleCommunityInferenceFundingSession } from "./founderInferenceRuntime";
import { BRIEF_DELAY_MS, BRIEF_INSTRUCTIONS, BRIEF_WRITE_OPERATION, briefMarkdown, parseBriefWriteCall } from "../shared/communityBriefs";

const internalRefs = internal as any;
const BRIEF_MAX_TOOL_STEPS = 2;
const BRIEF_MAX_OUTPUT_TOKENS = 1_200;
const POSTS_SHOWN = 40;
const POST_CHARS = 300;
const SCAN = 200;

// A person's post or reply in an open channel makes the community's brief
// due an hour after the first one; more activity before then joins it.
export async function markCommunityBriefDue(ctx: any, args: { communityId: any; channelId: any; actorType: string; nowMs: number }) {
  if (args.actorType !== "human" || !args.channelId) return;
  const channel = await ctx.db.get(args.channelId);
  if (!channel || channel.status !== "active" || String(channel.communityId) !== String(args.communityId)) return;
  if (channel.accessMode !== "all_members") return;
  const scope = communityScopeKey(args.communityId);
  const work = await workFor(ctx, scope, "brief");
  if (work?.dueAt) {
    await ctx.db.patch(work._id, { pending: work.pending + 1, updatedAt: args.nowMs });
    return;
  }
  const dueAt = args.nowMs + BRIEF_DELAY_MS;
  if (work) {
    await ctx.db.patch(work._id, { pending: work.pending + 1, firstPendingAt: args.nowMs, dueAt, failures: 0, updatedAt: args.nowMs });
    await scheduleAgentWork(ctx, work._id, dueAt);
  } else {
    // The first brief reads the last day.
    const workId = await insertWork(ctx, scope, {
      communityId: args.communityId, kind: "brief", pending: 1, firstPendingAt: args.nowMs,
      reviewedThrough: args.nowMs - 24 * 60 * 60_000, dueAt, failures: 0, createdAt: args.nowMs, updatedAt: args.nowMs,
    });
    await scheduleAgentWork(ctx, workId, dueAt);
  }
}

function clip(raw: unknown, max: number): string {
  const text = String(raw ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// What the brief is written from: the community's numbers as any member sees
// them, what people said in its open channels since the last brief, its
// memory.md and the last brief. Never join requests, quiet newcomers,
// private talks or pods.
export const readCommunityBriefInputInternal = internalQuery({
  args: { communityId: v.id("communities"), sinceMs: v.number(), untilMs: v.number() },
  handler: async (ctx, args) => {
    const community: any = await ctx.db.get(args.communityId);
    if (!community) return { posts: 0, text: "" };
    const scope = communityScopeKey(args.communityId);
    const snapshot = await buildSnapshot(ctx, community, args.sinceMs, args.untilMs);
    const [roots, replies] = await Promise.all([
      listSharedChannelReadableRows<any>({ ctx, tableName: "communityInteractionRoots", communityId: args.communityId, limit: SCAN }),
      listSharedChannelReadableRows<any>({ ctx, tableName: "communityInteractionReplies", communityId: args.communityId, limit: SCAN }),
    ]);
    const inWindow = (row: any) => row.status === "live" && row.actorType === "human" && row.actorUserId
      && Number(row.createdAt) >= args.sinceMs && Number(row.createdAt) < args.untilMs;
    const said = [...roots.filter(inWindow), ...replies.filter(inWindow)]
      .sort((a: any, b: any) => Number(a.createdAt) - Number(b.createdAt)).slice(-POSTS_SHOWN);
    const names = new Map<string, string>();
    const channels = new Map<string, string>();
    const lines: string[] = [];
    for (const row of said) {
      const key = String(row.channelId ?? "");
      if (key && !channels.has(key)) channels.set(key, String((await ctx.db.get(row.channelId) as any)?.name ?? "a channel"));
      const who = await displayName(ctx, row.actorUserId, names);
      lines.push(`- ${who} in #${channels.get(key) ?? "a channel"}${row.rootId ? " (reply)" : ""}: ${clip(row.title ? `${row.title}. ${row.contentSummary ?? ""}` : row.contentSummary, POST_CHARS)}`);
    }
    const memory: any = await memoryIndexFor(ctx, scope);
    const last: any = await briefFor(ctx, scope);
    const text = [
      `# ${community.name}`,
      "## Numbers since the last brief",
      `${snapshot.activity.posts} posts and ${snapshot.activity.replies} replies from ${snapshot.activity.activePeople} people; ${snapshot.newMembers.count} new members${snapshot.newMembers.names.length ? ` (${snapshot.newMembers.names.join(", ")})` : ""}. ${snapshot.memberCount} members in all.`,
      ...(snapshot.busiest ? [`Busiest: #${snapshot.busiest.channel} (${snapshot.busiest.posts} posts, ${snapshot.busiest.replies} replies).`] : []),
      ...(snapshot.unanswered.length ? ["Questions nobody has answered yet:", ...snapshot.unanswered.map((item) => `- ${item.author} in #${item.channel}: ${item.text}`)] : []),
      ...(snapshot.upcomingEvents.length ? ["Coming up:", ...snapshot.upcomingEvents.map((event) => `- ${event.title} (${event.startsAt})`)] : []),
      "## What people said",
      ...(lines.length ? lines : ["(nothing new in the open channels)"]),
      "## memory.md",
      memory?.bodyMd ? String(memory.bodyMd) : "(empty)",
      "## The last brief",
      last ? briefMarkdown({ headline: last.headline, points: last.points, nextStep: last.nextStep ?? null }) : "(none yet)",
    ].join("\n\n");
    return { posts: said.length, text };
  },
});

// The brief's one write: a place has one brief, and this replaces it.
export const writeCommunityBriefInternal = internalMutation({
  args: { communityId: v.id("communities"), runId: v.id("agentWorkRuns"), headline: v.string(), points: v.array(v.string()),
    nextStep: v.optional(v.string()), windowEnd: v.number(), nowMs: v.number() },
  handler: async (ctx, args) => {
    const run: any = await ctx.db.get(args.runId);
    if (!run || String(run.communityId) !== String(args.communityId) || run.status !== "running" || run.kind !== "brief") return { ok: false as const };
    const scope = (run.scopeKey as ScopeKey | undefined) ?? communityScopeKey(args.communityId);
    await writeBrief(ctx, scope, {
      communityId: args.communityId, headline: args.headline, points: args.points,
      ...(args.nextStep ? { nextStep: args.nextStep } : {}), runId: args.runId, windowEnd: args.windowEnd, updatedAt: args.nowMs,
    });
    await ctx.db.patch(run._id, { changed: ["brief"] });
    return { ok: true as const };
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

export const runCommunityBriefInternal = internalAction({
  args: { workId: v.id("agentWork") },
  handler: async (ctx, args) => {
    const claim = await ctx.runMutation(internalRefs.communityMemoryReview.claimMemoryReviewInternal, { workId: args.workId, nowMs: Date.now() });
    if (!claim) return { status: "not_due" };
    if ("skipped" in claim) return { status: "skipped" };
    const complete = (outcome: "reviewed" | "failed" | "skipped", errorCode?: string) =>
      ctx.runMutation(internalRefs.communityMemoryReview.completeMemoryReviewInternal, {
        workId: args.workId, outcome, windowEnd: claim.windowEnd, claimedPending: claim.claimedPending, nowMs: Date.now(),
        ...(errorCode ? { errorCode } : {}),
      });
    const admission = await ctx.runQuery(internalRefs.communityMemoryReview.readReviewAdmissionInternal, { communityId: claim.communityId });
    if (!admission.ok) {
      await complete("skipped");
      return { status: "skipped" };
    }
    const { runId } = await ctx.runMutation(internalRefs.communityMemory.openMemoryReviewRunInternal, {
      communityId: claim.communityId, windowStart: claim.windowStart, windowEnd: claim.windowEnd, nowMs: Date.now(), kind: "brief",
    });
    const finish = (extra: Record<string, unknown>) => ctx.runMutation(internalRefs.communityMemory.finishMemoryReviewRunInternal, {
      communityId: claim.communityId, runId, nowMs: Date.now(), ...extra,
    });
    const input = await ctx.runQuery(internalRefs.communityBriefs.readCommunityBriefInputInternal, {
      communityId: claim.communityId, sinceMs: claim.windowStart, untilMs: claim.windowEnd });
    if (input.posts === 0) {
      await finish({});
      await complete("reviewed");
      return { status: "empty" };
    }
    const run = await runFundedCommunityAgent({
      lens: "worker",
      ctx,
      communityId: claim.communityId,
      actorUserId: claim.ownerUserId,
      surface: "community_autonomous_cognition",
      receiptKey: `community_brief:${String(runId)}`,
      sourceRunId: `community-brief:${String(runId)}`,
      admission,
      messages: [
        { role: "system", content: `${BRIEF_INSTRUCTIONS}\n\nThis place: the ${claim.communityName} community.` },
        { role: "user", content: input.text },
      ],
      maxOutputTokens: BRIEF_MAX_OUTPUT_TOKENS,
      maxToolSteps: BRIEF_MAX_TOOL_STEPS,
      promptCacheKey: `pn:${String(claim.communityId)}:brief`,
      recorder: eventRecorder(ctx, claim.communityId, `community-brief:${String(runId)}`),
      // The call's input is parsed here, by the brief's own rules.
      normalizeToolArguments: (_toolName, rawArgs) => rawArgs,
      describeToolCall: (toolName, callArgs) => `${toolName} ${String(callArgs.operation ?? "")}`.trim(),
      maxConsecutiveFailures: 2,
      // The first answer is the brief: a model that describes it instead of
      // writing it would leave the place without one.
      firstToolChoice: { type: "function", name: "polynet_call" },
      executeTool: async (_toolName, rawArguments) => {
        const brief = parseBriefWriteCall(rawArguments);
        if ("error" in brief) {
          return { status: "error" as const, exitCode: null, outputText: "", errorCode: brief.error,
            errorMessage: `${brief.why} Write with polynet_call { operation: "${BRIEF_WRITE_OPERATION}", input: { headline, points, next_step? } }.` };
        }
        const written = await ctx.runMutation(internalRefs.communityBriefs.writeCommunityBriefInternal, {
          communityId: claim.communityId, runId, headline: brief.headline, points: brief.points,
          ...(brief.nextStep ? { nextStep: brief.nextStep } : {}), windowEnd: claim.windowEnd, nowMs: Date.now(),
        });
        return written?.ok
          ? { status: "ok" as const, exitCode: 0, outputText: JSON.stringify({ written: "brief" }), errorCode: null, errorMessage: null }
          : { status: "error" as const, exitCode: null, outputText: "", errorCode: "run_closed", errorMessage: "This brief's run is no longer open." };
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
      // The receipt's own lease settles it as indeterminate; the brief stands.
    }
    await finish({ summary: run.assistantText, promptTokens: run.usage.promptTokens, completionTokens: run.usage.completionTokens });
    await complete("reviewed");
    return { status: "written" };
  },
});

// Operator tool: write a community's brief now, reading from a chosen time
// (acceptance runs on staging).
export const requestCommunityBriefNowInternal = internalMutation({
  args: { communityId: v.id("communities"), sinceMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const scope = communityScopeKey(args.communityId);
    const work = await workFor(ctx, scope, "brief");
    const reviewedThrough = args.sinceMs ?? work?.reviewedThrough ?? nowMs - 24 * 60 * 60_000;
    let workId = work?._id;
    if (work) {
      await ctx.db.patch(work._id, { pending: Math.max(1, work.pending), reviewedThrough, dueAt: nowMs, leaseUntil: undefined, failures: 0, updatedAt: nowMs });
    } else {
      workId = await insertWork(ctx, scope, {
        communityId: args.communityId, kind: "brief", pending: 1, firstPendingAt: nowMs,
        reviewedThrough, dueAt: nowMs, failures: 0, createdAt: nowMs, updatedAt: nowMs,
      });
    }
    await scheduleAgentWork(ctx, workId, nowMs);
    return { workId };
  },
});

// A place's brief (shared/communityBriefs.ts): the guide, with nobody
// present, writes what's happening in the community, after new activity in
// its open channels: an hour after the first new post, and at most once
// every three hours, so a burst is read once and a busy place stays cheap.
// It runs on the one run entry with the worker lens, in one model request:
// the server hands it who the community is, its handbook, its memory.md and
// its recent threads (picked by how much they matter, each post with the id
// a point cites), and it answers with one brief.write, which ends the run.
// A quiet place costs nothing; with AI off nothing runs. Pods get their own
// briefs next.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { getUniqueCommunityMembershipByPair, normalizeCommunityRoleForOutput } from "./communityCore";
import { displayName } from "./communityFounderBrief";
import { communityScopeKey, insertWork, memoryIndexFor, workFor, writeBrief, type ScopeKey } from "./communityNotesStore";
import { scheduleAgentWork } from "./communityMemory";
import { runFundedCommunityAgent, type CommunityAgentRunEvent } from "./communityAgentRun";
import { founderProviderRequests } from "./founderInferenceUsage";
import { settleCommunityInferenceFundingSession } from "./founderInferenceRuntime";
import { renderCommunityCard } from "../shared/communityOntology";
import { renderCommunityHandbook } from "../shared/communityHandbook";
import { BRIEF_INSTRUCTIONS, BRIEF_WINDOW_MS, BRIEF_WRITE_OPERATION, nextBriefAtMs, parseBriefWriteCall } from "../shared/communityBriefs";

const internalRefs = internal as any;
// The write, and one more if it's refused.
const BRIEF_MAX_TOOL_STEPS = 2;
const BRIEF_MAX_OUTPUT_TOKENS = 1_200;
const THREADS_SHOWN = 12;
const REPLIES_PER_THREAD = 3;
const POST_CHARS = 300;
const REPLY_CHARS = 200;
const PER_CHANNEL_SCAN = 60;
const CHANNELS_MAX = 50;

// A person's post or reply in an open channel makes the community's brief
// due; more activity before then joins it.
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
  if (work) {
    // reviewedThrough is when the last brief was written.
    const dueAt = nextBriefAtMs(args.nowMs, work.reviewedThrough);
    await ctx.db.patch(work._id, { pending: work.pending + 1, firstPendingAt: args.nowMs, dueAt, failures: 0, updatedAt: args.nowMs });
    await scheduleAgentWork(ctx, work._id, dueAt);
  } else {
    const dueAt = nextBriefAtMs(args.nowMs, null);
    const workId = await insertWork(ctx, scope, {
      communityId: args.communityId, kind: "brief", pending: 1, firstPendingAt: args.nowMs,
      reviewedThrough: 0, dueAt, failures: 0, createdAt: args.nowMs, updatedAt: args.nowMs,
    });
    await scheduleAgentWork(ctx, workId, dueAt);
  }
}

function clip(raw: unknown, max: number): string {
  const text = String(raw ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const asksSomething = (row: any) => row.kind === "question" || String(row.title ?? row.contentSummary ?? "").includes("?");

// What the brief is written from: the community's memory.md and its recent
// threads in open channels, as any member sees them. Threads are picked by
// how much they matter (a host wrote it, people replied, a question nobody
// answered, how recent), not only by time, so a busy community's brief is
// about what counts. Each post and reply carries the id a point cites; refs
// lists exactly those. Never pods, private talks, join requests or people's
// plans.
export const readCommunityBriefInputInternal = internalQuery({
  args: { communityId: v.id("communities"), untilMs: v.number() },
  handler: async (ctx, args) => {
    const none = { threads: 0, text: "", refs: [] as string[] };
    const community: any = await ctx.db.get(args.communityId);
    if (!community) return none;
    const sinceMs = args.untilMs - BRIEF_WINDOW_MS;
    const channels: any[] = await ctx.db.query("communityChannels")
      .withIndex("by_community_access_status_position", (q: any) => q.eq("communityId", args.communityId).eq("accessMode", "all_members").eq("status", "active"))
      .take(CHANNELS_MAX);
    const channelNames = new Map<string, string>(channels.map((channel) => [String(channel._id), String(channel.name ?? "a channel")]));
    const recent = async (table: "communityInteractionRoots" | "communityInteractionReplies") => {
      const rows: any[] = [];
      for (const channel of channels) {
        for (const visibility of ["community", "public"] as const) {
          rows.push(...await ctx.db.query(table).withIndex("by_community_channel_visibility_status_createdAt", (q: any) => q
            .eq("communityId", args.communityId).eq("channelId", channel._id).eq("visibilityScope", visibility).eq("status", "live")
            .gte("createdAt", sinceMs).lt("createdAt", args.untilMs)).order("desc").take(PER_CHANNEL_SCAN));
        }
      }
      return rows.filter((row) => row.actorType === "human" && row.actorUserId);
    };
    const roots = await recent("communityInteractionRoots");
    const replies = await recent("communityInteractionReplies");

    // A thread: a person's live post in an open channel, with the replies
    // people wrote in the window. An older post people are still replying to
    // counts too.
    const threads = new Map<string, { root: any; replies: any[] }>();
    for (const root of roots) threads.set(String(root._id), { root, replies: [] });
    for (const reply of replies) {
      const key = String(reply.rootId);
      if (!threads.has(key)) {
        const root: any = await ctx.db.get(reply.rootId);
        if (!root || root.status !== "live" || root.actorType !== "human" || !root.actorUserId || !channelNames.has(String(root.channelId ?? ""))
          || !(root.visibilityScope === "community" || root.visibilityScope === "public")) continue;
        threads.set(key, { root, replies: [] });
      }
      threads.get(key)!.replies.push(reply);
    }
    if (threads.size === 0) return none;

    const hosts = new Map<string, boolean>();
    const isHost = async (userId: any) => {
      const key = String(userId);
      if (!hosts.has(key)) {
        const membership = key === String(community.ownerId) ? null
          : await getUniqueCommunityMembershipByPair({ ctx, communityId: args.communityId, userId });
        const role = normalizeCommunityRoleForOutput(membership?.role);
        hosts.set(key, key === String(community.ownerId) || role === "admin" || role === "moderator");
      }
      return hosts.get(key)!;
    };
    const scored: Array<{ root: any; replies: any[]; host: boolean; unanswered: boolean; score: number }> = [];
    for (const thread of threads.values()) {
      const host = await isHost(thread.root.actorUserId);
      const unanswered = asksSomething(thread.root) && Number(thread.root.replyCount ?? 0) === 0;
      const people = new Set(thread.replies.map((reply) => String(reply.actorUserId))).size;
      const latest = Math.max(Number(thread.root.createdAt), ...thread.replies.map((reply) => Number(reply.createdAt)));
      const recency = Math.max(0, 1 - (args.untilMs - latest) / BRIEF_WINDOW_MS);
      scored.push({ ...thread, host, unanswered,
        score: thread.replies.length * 2 + people * 2 + (host ? 3 : 0) + (unanswered ? 3 : 0) + recency * 3 });
    }
    scored.sort((a, b) => b.score - a.score || Number(b.root.createdAt) - Number(a.root.createdAt));

    const names = new Map<string, string>();
    const refs: string[] = [];
    const blocks: string[] = [];
    for (const thread of scored.slice(0, THREADS_SHOWN)) {
      const rootRef = `post:${String(thread.root._id)}`;
      refs.push(rootRef);
      const author = await displayName(ctx, thread.root.actorUserId, names);
      const text = thread.root.title ? `${thread.root.title}. ${thread.root.contentSummary ?? ""}` : thread.root.contentSummary;
      const lines = [
        `### ${rootRef} · #${channelNames.get(String(thread.root.channelId)) ?? "a channel"} · ${author}${thread.host ? " (host)" : ""}${thread.unanswered ? " · a question nobody has answered" : ""}`,
        clip(text, POST_CHARS),
      ];
      const shown = [...thread.replies].sort((a, b) => Number(a.createdAt) - Number(b.createdAt)).slice(-REPLIES_PER_THREAD);
      if (thread.replies.length > shown.length) lines.push(`(${thread.replies.length - shown.length} earlier replies not shown)`);
      for (const reply of shown) {
        const replyRef = `reply:${String(reply._id)}`;
        refs.push(replyRef);
        lines.push(`- ${replyRef} · ${await displayName(ctx, reply.actorUserId, names)}${(await isHost(reply.actorUserId)) ? " (host)" : ""}: ${clip(reply.contentSummary, REPLY_CHARS)}`);
      }
      blocks.push(lines.join("\n"));
    }
    const memory: any = await memoryIndexFor(ctx, communityScopeKey(args.communityId));
    const text = [
      "## memory.md (what this community has settled; for context, not to repeat)",
      memory?.bodyMd ? String(memory.bodyMd) : "(empty)",
      "## Recent threads in the open channels, the ones that matter most first",
      ...blocks,
    ].join("\n\n");
    return { threads: blocks.length, text, refs };
  },
});

// The brief's one write: a place has one brief, and this replaces it.
export const writeCommunityBriefInternal = internalMutation({
  args: { communityId: v.id("communities"), runId: v.id("agentWorkRuns"), headline: v.string(),
    points: v.array(v.object({ text: v.string(), refs: v.array(v.string()) })), windowEnd: v.number(), nowMs: v.number() },
  handler: async (ctx, args) => {
    const run: any = await ctx.db.get(args.runId);
    if (!run || String(run.communityId) !== String(args.communityId) || run.status !== "running" || run.kind !== "brief") return { ok: false as const };
    const scope = (run.scopeKey as ScopeKey | undefined) ?? communityScopeKey(args.communityId);
    await writeBrief(ctx, scope, {
      communityId: args.communityId, headline: args.headline, points: args.points,
      runId: args.runId, windowEnd: args.windowEnd, updatedAt: args.nowMs,
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
      communityId: claim.communityId, windowStart: claim.windowEnd - BRIEF_WINDOW_MS, windowEnd: claim.windowEnd, nowMs: Date.now(), kind: "brief",
    });
    const finish = (extra: Record<string, unknown>) => ctx.runMutation(internalRefs.communityMemory.finishMemoryReviewRunInternal, {
      communityId: claim.communityId, runId, nowMs: Date.now(), ...extra,
    });
    const [input, cardSource, handbook] = await Promise.all([
      ctx.runQuery(internalRefs.communityBriefs.readCommunityBriefInputInternal, { communityId: claim.communityId, untilMs: claim.windowEnd }),
      ctx.runQuery(internalRefs.communityOntologyCards.loadCommunityCardSourceInternal, { communityId: claim.communityId }).catch(() => null),
      ctx.runQuery(internalRefs.communityHandbook.readApprovedCommunityHandbookInternal, { communityId: claim.communityId }).catch(() => null),
    ]);
    if (input.threads === 0) {
      await finish({});
      await complete("reviewed");
      return { status: "empty" };
    }
    // Who the community is and how its builder wants the guide to speak:
    // stable text first, so requests share a cached prefix. What's coming up
    // is left off the card: the page shows it live.
    const system = [
      BRIEF_INSTRUCTIONS,
      `This place: the ${claim.communityName} community.`,
      ...(cardSource ? [renderCommunityCard({ ...cardSource, channels: [], events: [] }, "member")] : []),
      ...(handbook ? [renderCommunityHandbook(handbook)] : []),
    ].join("\n\n");
    const shownRefs = new Set<string>(input.refs);
    // The run counts only if the brief was written, and the write ends it.
    const brief = { written: null as string | null };
    const run = await runFundedCommunityAgent({
      lens: "worker",
      ctx,
      communityId: claim.communityId,
      actorUserId: claim.ownerUserId,
      surface: "community_autonomous_cognition",
      receiptKey: `community_brief:${String(runId)}`,
      sourceRunId: `community-brief:${String(runId)}`,
      admission,
      messages: [{ role: "system", content: system }, { role: "user", content: input.text }],
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
      endWith: () => brief.written,
      executeTool: async (_toolName, rawArguments) => {
        const parsed = parseBriefWriteCall(rawArguments, shownRefs);
        if ("error" in parsed) {
          return { status: "error" as const, exitCode: null, outputText: "", errorCode: parsed.error,
            errorMessage: `${parsed.why} Write with polynet_call { operation: "${BRIEF_WRITE_OPERATION}", input: { headline, points: [{ text, refs }] } }.` };
        }
        const saved = await ctx.runMutation(internalRefs.communityBriefs.writeCommunityBriefInternal, {
          communityId: claim.communityId, runId, headline: parsed.headline, points: parsed.points, windowEnd: claim.windowEnd, nowMs: Date.now(),
        });
        if (saved?.ok) brief.written = parsed.headline;
        return saved?.ok
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
    if (brief.written === null) {
      // It answered but never wrote a valid brief: what it spent is settled, and the work is retried.
      await finish({ failed: true, errorCode: "brief_not_written" });
      await complete("failed", "brief_not_written");
      return { status: "failed", errorCode: "brief_not_written" };
    }
    await finish({ summary: brief.written, promptTokens: run.usage.promptTokens, completionTokens: run.usage.completionTokens });
    await complete("reviewed");
    return { status: "written" };
  },
});

// Operator tool: write a community's brief now (acceptance runs on staging).
export const requestCommunityBriefNowInternal = internalMutation({
  args: { communityId: v.id("communities") },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const scope = communityScopeKey(args.communityId);
    const work = await workFor(ctx, scope, "brief");
    let workId = work?._id;
    if (work) {
      await ctx.db.patch(work._id, { pending: Math.max(1, work.pending), dueAt: nowMs, leaseUntil: undefined, failures: 0, updatedAt: nowMs });
    } else {
      workId = await insertWork(ctx, scope, {
        communityId: args.communityId, kind: "brief", pending: 1, firstPendingAt: nowMs,
        reviewedThrough: 0, dueAt: nowMs, failures: 0, createdAt: nowMs, updatedAt: nowMs,
      });
    }
    await scheduleAgentWork(ctx, workId, nowMs);
    return { workId };
  },
});

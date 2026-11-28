// A place's brief (shared/communityBriefs.ts): the guide, with nobody
// present, writes what's happening in a place after new activity there: an
// hour after the first new post, and at most once every three hours, so a
// burst is read once and a busy place stays cheap. The places are the
// community (its open channels) and each pod the guide works in (its own
// room); a pod's brief is written from that room alone and kept in the pod's
// scope, so it never leaves the pod. It is one kind of the guide's work with
// nobody present (convex/agentWork.ts runs it), in one model request: the
// server hands the guide who the community is, its handbook, the place's
// memory.md and its recent threads (picked by how much they matter, each
// post with the id the brief names), and it answers with one brief.write:
// a summary of one to three sentences, or that there is nothing worth one.
// That ends the run. A quiet place costs nothing; with AI off nothing runs.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import { getCommunityChannelCapabilities, resolveCommunityChannelActor } from "./communityChannelAccess";
import { runAgentWork } from "./agentWork";
import { getUniqueCommunityMembershipByPair, normalizeCommunityRoleForOutput, requireCommunityChatAccess } from "./communityCore";
import { readCachedUserDisplayName as displayName } from "./profileCore";
import { briefFor, communityScopeKey, insertWork, memoryIndexFor, podScopeKey, workFor, writeBrief, type ScopeKey } from "./communityNotesStore";
import { docReader, evidenceFacts, guideSeatedInPod, openRun, podRoom, scheduleAgentWork } from "./communityMemory";
import { communityAgentIsOn } from "./communityApps";
import { communityHasProactiveAgentTier } from "./founderInferenceCore";
import { memoryEvidenceRefusal, parseMemoryEvidenceRef } from "../shared/communityMemory";
import { renderCommunityCard } from "../shared/communityOntology";
import { renderCommunityHandbook } from "../shared/communityHandbook";
import { BRIEF_INSTRUCTIONS, BRIEF_WINDOW_MS, BRIEF_WRITE_OPERATION, briefMinGapMsForTier, nextBriefAtMs, parseBriefWriteCall, visibleBrief, type BriefView } from "../shared/communityBriefs";

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
const CHANNEL_SCAN_CONCURRENCY = 10;
const LOOKUP_CONCURRENCY = 25;

// A person's post or reply makes its place's brief due; more activity before
// then joins it. An open channel's post is the community's; a pod room's is
// that pod's, where the guide works (a builder seated it there).
export async function markCommunityBriefDue(ctx: any, args: { communityId: any; channelId: any; actorType: string; nowMs: number }) {
  if (args.actorType !== "human" || !args.channelId) return;
  const channel = await ctx.db.get(args.channelId);
  if (!channel || channel.status !== "active" || String(channel.communityId) !== String(args.communityId)) return;
  let scope: ScopeKey;
  if (channel.accessMode === "all_members") scope = communityScopeKey(args.communityId);
  else if (channel.accessMode === "restricted" && await guideSeatedInPod(ctx, channel._id)) scope = podScopeKey(channel._id);
  else return;
  const work = await workFor(ctx, scope, "brief");
  if (work?.dueAt && work.pending > 0) {
    const leased = typeof work.leaseUntil === "number" && work.leaseUntil > args.nowMs;
    if (leased && !work.dirtyWhileLeased) {
      await ctx.db.patch(work._id, { pending: work.pending + 1, dirtyWhileLeased: true, updatedAt: args.nowMs });
    }
    return;
  }
  const minGapMs = briefMinGapMsForTier(
    await communityHasProactiveAgentTier(ctx, args.communityId, args.nowMs),
  );
  if (work) {
    // reviewedThrough is when the last brief was written.
    const dueAt = nextBriefAtMs(args.nowMs, work.reviewedThrough, minGapMs);
    await ctx.db.patch(work._id, { pending: work.pending + 1, firstPendingAt: args.nowMs, dueAt, failures: 0, updatedAt: args.nowMs });
    await scheduleAgentWork(ctx, work._id, dueAt);
  } else {
    const dueAt = nextBriefAtMs(args.nowMs, null, minGapMs);
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

// What the brief is written from: the place's memory.md and its recent
// threads, as anyone in the place sees them. The community's: its open
// channels. A pod's: its own room and its own memory, never the community's
// posts or another pod's. Threads are picked by how much they matter (a host
// wrote it, people replied, a question nobody answered, how recent), not
// only by time, so a busy place's brief is about what counts. Each post and
// reply carries the id the brief names; refs lists exactly those. Never
// private talks, join requests or people's plans.
export const readCommunityBriefInputInternal = internalQuery({
  args: { communityId: v.id("communities"), untilMs: v.number(), podRoomId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const none = { threads: 0, text: "", refs: [] as string[] };
    const community: any = await ctx.db.get(args.communityId);
    if (!community) return none;
    const room: any = args.podRoomId ? await podRoom(ctx, args.communityId, args.podRoomId) : null;
    if (args.podRoomId && !room) return none;
    const sinceMs = args.untilMs - BRIEF_WINDOW_MS;
    const channels: any[] = room ? [room] : await ctx.db.query("communityChannels")
      .withIndex("by_community_access_status_position", (q: any) => q.eq("communityId", args.communityId).eq("accessMode", "all_members").eq("status", "active"))
      .take(CHANNELS_MAX);
    const channelNames = new Map<string, string>(channels.map((channel) => [String(channel._id), String(channel.name ?? "a channel")]));
    const recent = async (table: "communityInteractionRoots" | "communityInteractionReplies") => {
      const rows: any[] = [];
      for (let start = 0; start < channels.length; start += CHANNEL_SCAN_CONCURRENCY) {
        const chunk = channels.slice(start, start + CHANNEL_SCAN_CONCURRENCY);
        const batch = await Promise.all(
          chunk.flatMap((channel) =>
            (["community", "public"] as const).map((visibility) =>
              ctx.db.query(table).withIndex("by_community_channel_visibility_status_createdAt", (q: any) => q
                .eq("communityId", args.communityId).eq("channelId", channel._id).eq("visibilityScope", visibility).eq("status", "live")
                .gte("createdAt", sinceMs).lt("createdAt", args.untilMs)).order("desc").take(PER_CHANNEL_SCAN),
            ),
          ),
        );
        for (const found of batch) rows.push(...found);
      }
      return rows.filter((row) => row.actorType === "human" && row.actorUserId);
    };
    const [roots, replies] = await Promise.all([
      recent("communityInteractionRoots"),
      recent("communityInteractionReplies"),
    ]);

    // A thread: a person's live post in an open channel, with the replies
    // people wrote in the window. An older post people are still replying to
    // counts too.
    const threads = new Map<string, { root: any; replies: any[] }>();
    for (const root of roots) threads.set(String(root._id), { root, replies: [] });
    const missingRootIds: any[] = [];
    const seenMissingRoots = new Set<string>();
    for (const reply of replies) {
      const key = String(reply.rootId);
      if (!threads.has(key) && !seenMissingRoots.has(key)) {
        seenMissingRoots.add(key);
        missingRootIds.push(reply.rootId);
      }
    }
    const fetchedRoots = new Map<string, any>();
    for (let start = 0; start < missingRootIds.length; start += LOOKUP_CONCURRENCY) {
      const chunk = missingRootIds.slice(start, start + LOOKUP_CONCURRENCY);
      const loaded = await Promise.all(chunk.map((rootId) => ctx.db.get(rootId)));
      chunk.forEach((rootId, idx) => fetchedRoots.set(String(rootId), loaded[idx]));
    }
    for (const reply of replies) {
      const key = String(reply.rootId);
      if (!threads.has(key)) {
        const root: any = fetchedRoots.get(key);
        if (!root || root.status !== "live" || root.actorType !== "human" || !root.actorUserId || !channelNames.has(String(root.channelId ?? ""))
          || !(root.visibilityScope === "community" || root.visibilityScope === "public")) continue;
        threads.set(key, { root, replies: [] });
      }
      threads.get(key)!.replies.push(reply);
    }
    if (threads.size === 0) return none;

    // A pod's hosts count as hosts there, beside the community's.
    const podRecord: any = room ? await ctx.db.query("communityPods")
      .withIndex("by_community_channel", (q: any) => q.eq("communityId", args.communityId).eq("channelId", room._id)).first() : null;
    const hosts = new Map<string, boolean>(((podRecord?.hostUserIds ?? []) as any[]).map((id) => [String(id), true]));
    const warmHosts = async (userIds: any[]) => {
      const missing: any[] = [];
      const seen = new Set<string>();
      for (const userId of userIds) {
        const key = String(userId ?? "");
        if (!key || hosts.has(key) || seen.has(key)) continue;
        seen.add(key);
        missing.push(userId);
      }
      for (let start = 0; start < missing.length; start += LOOKUP_CONCURRENCY) {
        const chunk = missing.slice(start, start + LOOKUP_CONCURRENCY);
        await Promise.all(chunk.map(async (userId) => {
          const key = String(userId);
          const membership = key === String(community.ownerId) ? null
            : await getUniqueCommunityMembershipByPair({ ctx, communityId: args.communityId, userId });
          const role = normalizeCommunityRoleForOutput(membership?.role);
          hosts.set(key, key === String(community.ownerId) || role === "admin" || role === "moderator");
        }));
      }
    };
    const isHost = async (userId: any) => {
      const key = String(userId);
      if (!hosts.has(key)) {
        await warmHosts([userId]);
      }
      return hosts.get(key)!;
    };
    await warmHosts([...threads.values()].map((thread) => thread.root.actorUserId));
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

    const topThreads = scored.slice(0, THREADS_SHOWN).map((thread) => ({
      thread,
      shownReplies: [...thread.replies].sort((a, b) => Number(a.createdAt) - Number(b.createdAt)).slice(-REPLIES_PER_THREAD),
    }));
    const shownUserIds = topThreads.flatMap(({ thread, shownReplies }) => [
      thread.root.actorUserId,
      ...shownReplies.map((reply) => reply.actorUserId),
    ]);
    const uniqueShownUsers = Array.from(
      new Map(shownUserIds.filter(Boolean).map((id) => [String(id), id])).values(),
    );
    const names = new Map<string, string>();
    const [memory] = await Promise.all([
      memoryIndexFor(ctx, room ? podScopeKey(room._id) : communityScopeKey(args.communityId)),
      warmHosts(uniqueShownUsers),
      (async () => {
        for (let start = 0; start < uniqueShownUsers.length; start += LOOKUP_CONCURRENCY) {
          const chunk = uniqueShownUsers.slice(start, start + LOOKUP_CONCURRENCY);
          await Promise.all(chunk.map((userId) => displayName(ctx, userId, names)));
        }
      })(),
    ]);
    const refs: string[] = [];
    const blocks: string[] = [];
    for (const { thread, shownReplies } of topThreads) {
      const rootRef = `post:${String(thread.root._id)}`;
      refs.push(rootRef);
      const author = await displayName(ctx, thread.root.actorUserId, names);
      const text = thread.root.title ? `${thread.root.title}. ${thread.root.contentSummary ?? ""}` : thread.root.contentSummary;
      const lines = [
        `### ${rootRef} · #${channelNames.get(String(thread.root.channelId)) ?? "a channel"} · ${author}${thread.host ? " (host)" : ""}${thread.unanswered ? " · a question nobody has answered" : ""}`,
        clip(text, POST_CHARS),
      ];
      if (thread.replies.length > shownReplies.length) lines.push(`(${thread.replies.length - shownReplies.length} earlier replies not shown)`);
      for (const reply of shownReplies) {
        const replyRef = `reply:${String(reply._id)}`;
        refs.push(replyRef);
        lines.push(`- ${replyRef} · ${await displayName(ctx, reply.actorUserId, names)}${(await isHost(reply.actorUserId)) ? " (host)" : ""}: ${clip(reply.contentSummary, REPLY_CHARS)}`);
      }
      blocks.push(lines.join("\n"));
    }
    const text = [
      `## memory.md (what this ${room ? "pod" : "community"} has settled; for context, not to repeat)`,
      memory?.bodyMd ? String(memory.bodyMd) : "(empty)",
      room ? "## Recent threads in the pod's room, the ones that matter most first" : "## Recent threads in the open channels, the ones that matter most first",
      ...blocks,
    ].join("\n\n");
    return { threads: blocks.length, text, refs };
  },
});

// The brief's one write: a place has one brief, and this replaces it.
export const writeCommunityBriefInternal = internalMutation({
  // No summary: the guide found nothing worth a brief, so the place has none.
  args: { communityId: v.id("communities"), runId: v.id("agentWorkRuns"), summary: v.optional(v.string()),
    refs: v.array(v.string()), windowEnd: v.number(), nowMs: v.number() },
  handler: async (ctx, args) => {
    // Checked when the write happens: the run is still open, and for a pod,
    // its room is open and the guide still works there (a builder taking the
    // guide out stops a brief already being written).
    const run: any = await openRun(ctx, args.communityId, args.runId);
    if (!run || run.kind !== "brief") return { ok: false as const };
    const scope = (run.scopeKey as ScopeKey | undefined) ?? communityScopeKey(args.communityId);
    if (args.summary) {
      await writeBrief(ctx, scope, {
        communityId: args.communityId, summary: args.summary, refs: args.refs,
        runId: args.runId, windowEnd: args.windowEnd, updatedAt: args.nowMs,
      });
      await ctx.db.patch(run._id, { changed: ["brief"] });
    } else {
      // Nothing new worth rewriting over: preserve any existing valid brief so
      // quiet chatter or test posts never wipe a good brief off the panel.
      const existing = await briefFor(ctx, scope);
      await ctx.db.patch(run._id, { changed: [existing ? "kept brief" : "no brief"] });
    }
    return { ok: true as const };
  },
});

export const runCommunityBriefInternal = internalAction({
  args: { workId: v.id("agentWork") },
  handler: async (ctx, args) => await runAgentWork(ctx, {
    workId: args.workId,
    kind: "brief",
    names: { receipt: "community_brief", source: "community-brief", events: "community-brief", cache: "brief" },
    maxOutputTokens: BRIEF_MAX_OUTPUT_TOKENS,
    maxToolSteps: BRIEF_MAX_TOOL_STEPS,
    // A run that ends in words leaves the place's activity for the retry.
    mustWrite: "brief_not_written",
    done: "written",
    window: (claim) => ({ start: claim.windowEnd - BRIEF_WINDOW_MS, end: claim.windowEnd }),
    prepare: async (claim, runId) => {
      const untilMs = claim.windowEnd;
      const [input, cardSource, handbook] = await Promise.all([
        ctx.runQuery(internalRefs.communityBriefs.readCommunityBriefInputInternal, {
          communityId: claim.communityId, untilMs, ...(claim.pod ? { podRoomId: claim.pod.roomId } : {}) }),
        ctx.runQuery(internalRefs.communityOntologyCards.loadCommunityCardSourceInternal, { communityId: claim.communityId }).catch(() => null),
        ctx.runQuery(internalRefs.communityHandbook.readApprovedCommunityHandbookInternal, { communityId: claim.communityId }).catch(() => null),
      ]);
      // Who the community is and how its builder wants the guide to speak:
      // stable text first, so requests share a cached prefix. What's coming
      // up is left off the card: the page shows it live.
      const system = [
        BRIEF_INSTRUCTIONS,
        claim.pod
          ? `This place: the ${claim.pod.name} pod, in the ${claim.communityName} community. Only people in this pod read this brief: write what's happening in the pod, from its own room.`
          : `This place: the ${claim.communityName} community.`,
        ...(cardSource ? [renderCommunityCard({ ...cardSource, channels: [], events: [] }, "member")] : []),
        ...(handbook ? [renderCommunityHandbook(handbook)] : []),
      ].join("\n\n");
      const shownRefs = new Set<string>(input.refs);
      return {
        empty: input.threads === 0,
        messages: [{ role: "system", content: system }, { role: "user", content: input.text }],
        write: async (rawArguments) => {
          const brief = parseBriefWriteCall(rawArguments, shownRefs);
          if ("error" in brief) {
            return { ok: false, code: brief.error,
              message: `${brief.why} Write with polynet_call { operation: "${BRIEF_WRITE_OPERATION}", input: { summary, refs } }.` };
          }
          const saved = await ctx.runMutation(internalRefs.communityBriefs.writeCommunityBriefInternal, {
            communityId: claim.communityId, runId, windowEnd: untilMs, nowMs: Date.now(),
            ...("nothing" in brief ? { refs: [] } : { summary: brief.summary, refs: brief.refs }),
          });
          return saved?.ok
            ? { ok: true, output: { written: "nothing" in brief ? "no brief" : "brief" }, ended: "nothing" in brief ? "Nothing worth a brief." : brief.summary }
            : { ok: false, code: "run_closed", message: "This brief's run is no longer open." };
        },
      };
    },
  }),
});

// A place's brief, as its readers get it (brief.md in the folder; the panels
// too): nothing when the guide is off, the brief is over 14 days old, or
// any post it drew on is no longer there, live, in the place. The
// caller has already checked the reader may enter the place.
export async function readPlaceBrief(ctx: any, args: { communityId: any; podRoomId?: unknown; nowMs: number }): Promise<BriefView | null> {
  if (!(await communityAgentIsOn(ctx, args.communityId))) return null;
  const room: any = args.podRoomId ? await podRoom(ctx, args.communityId, args.podRoomId) : null;
  if (args.podRoomId && !room) return null;
  const scope = room ? podScopeKey(room._id) : communityScopeKey(args.communityId);
  const stored: any = await briefFor(ctx, scope);
  if (!stored) return null;
  // Where each cited post is now; null once it is gone, hidden or moved out of the place.
  const reader = docReader(ctx);
  const where = new Map<string, { slug: string; name: string } | null>();
  await Promise.all(
    [...new Set<string>(stored.refs as string[])].map(async (ref) => {
      const parsed = parseMemoryEvidenceRef(ref);
      if (!parsed || memoryEvidenceRefusal(await evidenceFacts(ctx, args.communityId, parsed, scope, reader))) {
        where.set(ref, null);
        return;
      }
      const row: any = await reader.get(ctx.db.normalizeId(parsed.kind === "post" ? "communityInteractionRoots" : "communityInteractionReplies", parsed.id)!);
      const channel: any = row?.channelId ? await reader.get(row.channelId) : null;
      where.set(ref, channel ? { slug: String(channel.slug ?? ""), name: String(channel.name ?? "") } : null);
    }),
  );
  const visible = visibleBrief(stored, args.nowMs, (ref) => Boolean(where.get(ref)));
  if (!visible) return null;
  return {
    summary: visible.summary,
    channels: [...new Map(visible.refs.map((ref) => where.get(ref)!).map((channel) => [channel.slug, channel])).values()],
    updated_at: new Date(visible.updatedAt).toISOString(),
  };
}

export const readBriefInternal = internalQuery({
  args: { communityId: v.id("communities"), podRoomId: v.optional(v.string()) },
  handler: async (ctx, args) => await readPlaceBrief(ctx, { ...args, nowMs: Date.now() }),
});

// ---------- the panels (Home's and a pod's right column)

const placeArgs = { authSubject: v.optional(v.string()), communityId: v.id("communities"),
  // A pod's brief: its room. Missing: the community's.
  podChannelId: v.optional(v.id("communityChannels")) };

// Someone who can enter the place: the community, or the pod's room (the
// room's own read check, as for pod notes).
async function placeReader(ctx: any, args: { authSubject?: string; communityId: any; podChannelId?: any }) {
  const userId = await resolveUserIdForAuthenticatedRequest({ ctx, authSubject: args.authSubject ?? null });
  await requireCommunityChatAccess({ ctx, communityId: args.communityId, userId });
  if (args.podChannelId) {
    const channel: any = await podRoom(ctx, args.communityId, args.podChannelId);
    if (!channel) throw new Error("community_pod_not_found");
    const actor = await resolveCommunityChannelActor({ ctx, communityId: args.communityId, userId });
    if (!(await getCommunityChannelCapabilities({ ctx, channel, actor })).canRead) throw new Error("community_pod_not_found");
  }
  return userId;
}

export const getPlaceBrief = query({
  args: placeArgs,
  handler: async (ctx, args) => {
    await placeReader(ctx, args);
    return { brief: await readPlaceBrief(ctx, { communityId: args.communityId, podRoomId: args.podChannelId, nowMs: Date.now() }) };
  },
});

// Operator tool: write a place's brief now. podRoomId: a pod's brief.
export const requestCommunityBriefNowInternal = internalMutation({
  args: { communityId: v.id("communities"), podRoomId: v.optional(v.id("communityChannels")) },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const scope = args.podRoomId ? podScopeKey(args.podRoomId) : communityScopeKey(args.communityId);
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
    await ctx.scheduler.runAt(nowMs, internalRefs.communityBriefs.runCommunityBriefInternal, { workId });
    return { workId };
  },
});

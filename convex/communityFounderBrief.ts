// The founder's daily brief: each morning, in the founder's time zone, the
// community agent reads the community's last day (public activity and counts
// only, never members' private conversations with the agent), writes a short
// brief, posts it into the founder's agent conversation and emails it.
// Slice A of docs/specs/proactive-community-agent-v0.md: read-only, it never
// messages members. A quiet day, or missing funding, gets a plain brief without
// a model call.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { listSharedChannelReadableRows } from "./communityChannelCore";
import { readCanonicalUserIdentityProjection } from "./profileCore";
import { communityIsActive, normalizeCommunityLifecycle } from "../shared/communityLifecycle";
import { readCommunityActiveMemberCount } from "./communityCore";
import { resolveCommunityInferenceFundingForAction } from "./founderInferenceRuntime";
import { startFundedInferenceRun } from "./fundedInferenceGateway";
import { readCanonicalPublicAppOrigin } from "./publicAppUrl";
import { buildCommunityTabPath } from "../shared/webAppRouteState";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_WINDOW_MS = 3 * DAY_MS;
const CLAIM_LEASE_MS = 10 * 60 * 1000;
const MAX_BRIEFS_PER_RUN = 25;
const SCAN_LIMIT = 200;
const LIST_LIMIT = 5;
const BRIEF_MAX_OUTPUT_TOKENS = 1_200;
const internalRefs = internal as any;

export type FounderBriefSnapshot = {
  communityName: string;
  memberCount: number;
  windowHours: number;
  newMembers: { count: number; names: string[] };
  activity: { posts: number; replies: number; activePeople: number };
  unanswered: Array<{ author: string; channel: string; text: string; hoursAgo: number }>;
  quietNewcomers: { count: number; names: string[] };
  joinRequestsPending: number;
  upcomingEvents: Array<{ title: string; startsAt: string }>;
};

export type FounderBrief = {
  headline: string;
  sections: Array<{ title: string; items: string[] }>;
  nextStep: string | null;
};

// ---------- time ----------

// The founder's local date (YYYY-MM-DD) and hour in their IANA time zone.
export function localDateAndHour(nowMs: number, timeZone: string): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(nowMs));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

export function validTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

// ---------- snapshot (deterministic, bounded) ----------

function clip(raw: unknown, max: number): string {
  const text = String(raw ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

async function displayName(ctx: any, userId: unknown, cache: Map<string, string>): Promise<string> {
  const key = String(userId ?? "");
  if (!key) return "A member";
  if (!cache.has(key)) {
    const identity = await readCanonicalUserIdentityProjection(ctx, userId as any).catch(() => null);
    cache.set(key, identity?.displayName || (identity?.handle ? `@${identity.handle}` : "A member"));
  }
  return cache.get(key)!;
}

async function buildSnapshot(ctx: any, community: any, windowStartMs: number, nowMs: number): Promise<FounderBriefSnapshot> {
  const names = new Map<string, string>();
  const ownerId = String(community.ownerId);
  const memberRows = (from: number, to: number) => ctx.db.query("communityMemberships")
    .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", community._id).gte("createdAt", from).lt("createdAt", to))
    .order("desc").take(SCAN_LIMIT);
  const [roots, replies, recentJoins, newcomerRows, joinRequests, events] = await Promise.all([
    listSharedChannelReadableRows<any>({ ctx, tableName: "communityInteractionRoots", communityId: community._id, limit: SCAN_LIMIT }),
    listSharedChannelReadableRows<any>({ ctx, tableName: "communityInteractionReplies", communityId: community._id, limit: SCAN_LIMIT }),
    // Joins in the reporting window, and newcomers who joined 3 to 14 days ago,
    // read separately so a busy fortnight can't hide yesterday's joins.
    memberRows(windowStartMs, nowMs),
    memberRows(nowMs - 14 * DAY_MS, nowMs - 3 * DAY_MS),
    ctx.db.query("communityJoinRequests")
      .withIndex("by_community_status_createdAt", (q: any) => q.eq("communityId", community._id).eq("status", "pending"))
      .take(SCAN_LIMIT),
    ctx.db.query("communityEvents")
      .withIndex("by_community_status_startsAt", (q: any) =>
        q.eq("communityId", community._id).eq("status", "live").gte("startsAt", nowMs).lt("startsAt", nowMs + 2 * DAY_MS))
      .take(LIST_LIMIT),
  ]);
  const live = (row: any) => row.status === "live";
  const human = (row: any) => row.actorType === "human" && row.actorUserId;
  const inWindow = (row: any) => Number(row.createdAt) >= windowStartMs && Number(row.createdAt) < nowMs;

  const windowRoots = roots.filter((row: any) => live(row) && inWindow(row));
  const windowReplies = replies.filter((row: any) => live(row) && inWindow(row));
  const activePeople = new Set(
    [...windowRoots, ...windowReplies].filter(human).map((row: any) => String(row.actorUserId)),
  );

  const activeMember = (row: any) => row.active !== false && typeof row.revokedAt !== "number" && String(row.userId) !== ownerId;
  const joined = recentJoins.filter(activeMember);

  // Anyone who has posted or replied in the recent scan is not quiet.
  const everActive = new Set([...roots, ...replies].filter(human).map((row: any) => String(row.actorUserId)));
  const quiet = newcomerRows.filter((row: any) => activeMember(row) && !everActive.has(String(row.userId)));

  const unansweredRows = roots
    .filter((row: any) => live(row) && human(row) && String(row.actorUserId) !== ownerId
      && Number(row.replyCount ?? 0) === 0
      && Number(row.createdAt) <= nowMs - 2 * HOUR_MS && Number(row.createdAt) >= nowMs - MAX_WINDOW_MS)
    .sort((a: any, b: any) => Number(a.createdAt) - Number(b.createdAt))
    .slice(0, LIST_LIMIT);
  const channelNames = new Map<string, string>();
  const unanswered = [];
  for (const row of unansweredRows) {
    const channelKey = String(row.channelId ?? "");
    if (channelKey && !channelNames.has(channelKey)) {
      const channel = await ctx.db.get(row.channelId);
      channelNames.set(channelKey, channel?.name ? String(channel.name) : "a channel");
    }
    unanswered.push({
      author: await displayName(ctx, row.actorUserId, names),
      channel: channelNames.get(channelKey) ?? "a channel",
      text: clip(row.title || row.contentSummary, 160),
      hoursAgo: Math.round((nowMs - Number(row.createdAt)) / HOUR_MS),
    });
  }

  const nameList = async (rows: any[]) => {
    const list: string[] = [];
    for (const row of rows.slice(0, LIST_LIMIT)) list.push(await displayName(ctx, row.userId, names));
    return list;
  };

  return {
    communityName: String(community.name ?? community.slug ?? "your community"),
    memberCount: readCommunityActiveMemberCount(community) ?? 0,
    windowHours: Math.max(1, Math.round((nowMs - windowStartMs) / HOUR_MS)),
    newMembers: { count: joined.length, names: await nameList(joined) },
    activity: { posts: windowRoots.length, replies: windowReplies.length, activePeople: activePeople.size },
    unanswered,
    quietNewcomers: { count: quiet.length, names: await nameList(quiet) },
    joinRequestsPending: joinRequests.length,
    upcomingEvents: events.map((event: any) => ({ title: clip(event.title, 120), startsAt: new Date(Number(event.startsAt)).toISOString() })),
  };
}

export function snapshotIsQuiet(snapshot: FounderBriefSnapshot): boolean {
  return snapshot.newMembers.count === 0 && snapshot.activity.posts === 0 && snapshot.activity.replies === 0
    && snapshot.unanswered.length === 0 && snapshot.joinRequestsPending === 0 && snapshot.upcomingEvents.length === 0;
}

// ---------- writing ----------

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

// The brief without a model: plain facts in the same shape.
export function deterministicBrief(snapshot: FounderBriefSnapshot): FounderBrief {
  if (snapshotIsQuiet(snapshot)) {
    return {
      headline: `A quiet day in ${snapshot.communityName}`,
      sections: [{ title: "Activity", items: [`No new members, posts or replies in the last ${snapshot.windowHours} hours.`] }],
      nextStep: snapshot.quietNewcomers.count
        ? `Say hello to a quiet newcomer: ${snapshot.quietNewcomers.names[0]}.`
        : "Post something that invites a reply, like a question for the week.",
    };
  }
  const sections: FounderBrief["sections"] = [];
  const waiting: string[] = [];
  if (snapshot.joinRequestsPending) waiting.push(`${plural(snapshot.joinRequestsPending, "join request")} to review.`);
  for (const post of snapshot.unanswered) waiting.push(`${post.author} in #${post.channel}, ${post.hoursAgo}h with no reply: "${post.text}"`);
  if (waiting.length) sections.push({ title: "Waiting on you", items: waiting });
  const people: string[] = [];
  if (snapshot.newMembers.count) people.push(`${plural(snapshot.newMembers.count, "new member")}: ${snapshot.newMembers.names.join(", ")}.`);
  if (snapshot.quietNewcomers.count) people.push(`${plural(snapshot.quietNewcomers.count, "newcomer")} haven't posted yet: ${snapshot.quietNewcomers.names.join(", ")}.`);
  if (people.length) sections.push({ title: "People", items: people });
  sections.push({ title: "Activity", items: [
    `${plural(snapshot.activity.posts, "post")} and ${plural(snapshot.activity.replies, "reply")} from ${plural(snapshot.activity.activePeople, "person")} in the last ${snapshot.windowHours} hours.`,
  ] });
  if (snapshot.upcomingEvents.length) {
    sections.push({ title: "Coming up", items: snapshot.upcomingEvents.map((event) => `${event.title} (${event.startsAt})`) });
  }
  return {
    headline: waiting.length ? `${plural(waiting.length, "thing")} waiting on you in ${snapshot.communityName}` : `Your day in ${snapshot.communityName}`,
    sections: sections.slice(0, 5),
    nextStep: snapshot.unanswered[0] ? `Reply to ${snapshot.unanswered[0].author} in #${snapshot.unanswered[0].channel}.` : null,
  };
}

export const FOUNDER_BRIEF_PROMPT = [
  "You are this community's AI agent writing the founder's morning brief.",
  "Write like a sharp chief of staff: short, specific, warm, no filler.",
  "Use only facts in the snapshot. Never invent people, numbers or events.",
  "Lead with what needs the founder (join requests, unanswered posts), then people (new members, quiet newcomers), then activity and what's coming up.",
  "Name people. Times are UTC ISO; say them as relative days (\"tomorrow\"), not raw timestamps.",
  "End with one concrete suggested next step the founder can do in two minutes.",
  "Reply with JSON only: {\"headline\": string (max 90 chars), \"sections\": [{\"title\": string (max 30 chars), \"items\": [string (max 220 chars)]}] (1-5 sections, 1-5 items each), \"next_step\": string (max 160 chars)}.",
].join("\n");

// Parses and bounds the model's brief; null when it isn't usable.
export function parseBrief(raw: string): FounderBrief | null {
  let value: any;
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    value = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  const headline = clip(value?.headline, 120);
  const sections = (Array.isArray(value?.sections) ? value.sections : [])
    .map((section: any) => ({
      title: clip(section?.title, 40),
      items: (Array.isArray(section?.items) ? section.items : []).map((item: unknown) => clip(item, 260)).filter(Boolean).slice(0, 5),
    }))
    .filter((section: any) => section.title && section.items.length)
    .slice(0, 5);
  if (!headline || !sections.length) return null;
  return { headline, sections, nextStep: clip(value?.next_step, 200) || null };
}

export function briefMarkdown(brief: FounderBrief): string {
  return [
    `**${brief.headline}**`,
    ...brief.sections.map((section) => [`### ${section.title}`, ...section.items.map((item) => `- ${item}`)].join("\n")),
    brief.nextStep ? `**Suggested next step:** ${brief.nextStep}` : "",
  ].filter(Boolean).join("\n\n");
}

// ---------- scheduling ----------

const MAX_ATTEMPTS = 3;
const RETRY_AFTER_MS = 30 * 60 * 1000;

function localMinute(nowMs: number, timeZone: string): number {
  const minute = new Intl.DateTimeFormat("en-US", { timeZone, minute: "2-digit" })
    .formatToParts(new Date(nowMs)).find((part) => part.type === "minute")?.value;
  return Number(minute ?? 0);
}

// The next moment after afterMs when it is localHour:00 in the founder's time
// zone. Steps in quarter hours, so fractional offsets (India, Nepal) land on time.
export function nextOccurrenceMs(afterMs: number, localHour: number, timeZone: string): number {
  const QUARTER_MS = HOUR_MS / 4;
  let at = Math.floor(afterMs / QUARTER_MS) * QUARTER_MS + QUARTER_MS;
  for (let step = 0; step < 4 * 50; step += 1, at += QUARTER_MS) {
    if (localDateAndHour(at, timeZone).hour === localHour && localMinute(at, timeZone) === 0) return at;
  }
  return afterMs + DAY_MS;
}

// Due now when today's hour has already come, otherwise at the next one.
function firstDueAtMs(nowMs: number, localHour: number, timeZone: string): number {
  return localDateAndHour(nowMs, timeZone).hour >= localHour ? nowMs : nextOccurrenceMs(nowMs, localHour, timeZone);
}

async function readSettings(ctx: any, communityId: any) {
  return await ctx.db.query("communityFounderBriefSettings")
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId)).unique();
}

async function scheduleNext(ctx: any, communityId: any, nowMs: number, retry: boolean) {
  const settings = await readSettings(ctx, communityId);
  if (!settings) return;
  await ctx.db.patch(settings._id, {
    nextDueAt: retry ? nowMs + RETRY_AFTER_MS : nextOccurrenceMs(nowMs, settings.localHour, settings.timeZone),
  });
}

export const setFounderBriefSettingsInternal = internalMutation({
  args: {
    communityId: v.id("communities"),
    enabled: v.boolean(),
    localHour: v.number(),
    timeZone: v.string(),
    actorUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const community = await ctx.db.get(args.communityId);
    if (!community || String(community.ownerId) !== String(args.actorUserId)) throw new Error("founder_brief_owner_required");
    if (!Number.isInteger(args.localHour) || args.localHour < 0 || args.localHour > 23) throw new Error("founder_brief_hour_invalid");
    if (!validTimeZone(args.timeZone)) throw new Error("founder_brief_time_zone_invalid");
    const nowMs = Date.now();
    const existing = await readSettings(ctx, args.communityId);
    const fields = {
      enabled: args.enabled, localHour: args.localHour, timeZone: args.timeZone, updatedByUserId: args.actorUserId,
      nextDueAt: firstDueAtMs(nowMs, args.localHour, args.timeZone), updatedAt: nowMs,
    };
    if (existing) await ctx.db.patch(existing._id, fields);
    else await ctx.db.insert("communityFounderBriefSettings", { communityId: args.communityId, ...fields, createdAt: nowMs });
    return { ok: true };
  },
});

// Enabled communities whose next brief is due, oldest first. Every claim moves
// nextDueAt forward, so a bounded scan still reaches every community.
export const listDueFounderBriefsInternal = internalQuery({
  args: { nowMs: v.number() },
  handler: async (ctx, args) => {
    const settings = await ctx.db.query("communityFounderBriefSettings")
      .withIndex("by_enabled_nextDueAt", (q) => q.eq("enabled", true).lte("nextDueAt", args.nowMs))
      .take(MAX_BRIEFS_PER_RUN);
    return settings.map((row) => ({ communityId: row.communityId, briefDate: localDateAndHour(args.nowMs, row.timeZone).date }));
  },
});

export const claimFounderBriefInternal = internalMutation({
  args: { communityId: v.id("communities"), briefDate: v.string(), nowMs: v.number() },
  handler: async (ctx, args) => {
    const community = await ctx.db.get(args.communityId);
    if (!community || !communityIsActive(community)) {
      // An archived community waits a day at a time, so it never blocks the queue.
      await scheduleNext(ctx, args.communityId, args.nowMs, false);
      return null;
    }
    const existing = await ctx.db.query("communityFounderBriefs")
      .withIndex("by_community_date", (q) => q.eq("communityId", args.communityId).eq("briefDate", args.briefDate)).unique();
    if (existing) {
      const leased = existing.status === "running" && existing.leaseExpiresAt >= args.nowMs;
      if (leased) return null;
      if (existing.status === "sent" || existing.attempts >= MAX_ATTEMPTS) {
        await scheduleNext(ctx, args.communityId, args.nowMs, false);
        return null;
      }
    }
    const previous = await ctx.db.query("communityFounderBriefs")
      .withIndex("by_community_status_windowEnd", (q) => q.eq("communityId", args.communityId).eq("status", "sent"))
      .order("desc").first();
    const windowStartMs = Math.max(args.nowMs - MAX_WINDOW_MS, previous?.windowEndMs ?? args.nowMs - DAY_MS);
    // Once delivery has started, the window and content are fixed: a retry
    // finishes delivering the same brief.
    const delivery = existing?.delivery ?? null;
    const fields = {
      status: "running" as const,
      windowStartMs: delivery ? existing!.windowStartMs : windowStartMs,
      windowEndMs: delivery ? existing!.windowEndMs : args.nowMs,
      leaseExpiresAt: args.nowMs + CLAIM_LEASE_MS, updatedAt: args.nowMs,
    };
    let briefId;
    if (existing) {
      briefId = existing._id;
      await ctx.db.patch(existing._id, { ...fields, attempts: existing.attempts + 1, errorCode: undefined });
    } else {
      briefId = await ctx.db.insert("communityFounderBriefs", {
        communityId: args.communityId, ownerUserId: community.ownerId, briefDate: args.briefDate,
        ...fields, attempts: 1, createdAt: args.nowMs,
      });
    }
    // Hold the schedule while this attempt runs; finishing sets the next time.
    await scheduleNext(ctx, args.communityId, args.nowMs, true);
    return { briefId, ownerUserId: community.ownerId, windowStartMs: fields.windowStartMs, windowEndMs: fields.windowEndMs, delivery };
  },
});

export const recordFounderBriefDeliveryInternal = internalMutation({
  args: {
    briefId: v.id("communityFounderBriefs"),
    delivery: v.object({
      threadId: v.string(), markdown: v.string(), emailPayload: v.any(),
      communityLifecycleGeneration: v.number(),
      writer: v.union(v.literal("model"), v.literal("deterministic")),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.briefId, { delivery: args.delivery, updatedAt: Date.now() });
  },
});

export const readFounderBriefSnapshotInternal = internalQuery({
  args: { communityId: v.id("communities"), windowStartMs: v.number(), nowMs: v.number() },
  handler: async (ctx, args) => {
    const community = await ctx.db.get(args.communityId);
    if (!community || !communityIsActive(community)) return null;
    return {
      snapshot: await buildSnapshot(ctx, community, args.windowStartMs, args.nowMs),
      communitySlug: String(community.slug ?? ""),
      communityLifecycleGeneration: normalizeCommunityLifecycle(community).generation,
    };
  },
});

export const finishFounderBriefInternal = internalMutation({
  args: {
    briefId: v.id("communityFounderBriefs"),
    status: v.union(v.literal("sent"), v.literal("failed")),
    writer: v.optional(v.union(v.literal("model"), v.literal("deterministic"))),
    stats: v.optional(v.record(v.string(), v.number())),
    threadMessageKey: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    nowMs: v.number(),
  },
  handler: async (ctx, { briefId, nowMs, ...fields }) => {
    const brief = await ctx.db.get(briefId);
    if (!brief) return;
    await ctx.db.patch(briefId, {
      ...fields, updatedAt: nowMs, leaseExpiresAt: nowMs,
      ...(fields.status === "sent" ? { sentAt: nowMs } : {}),
    });
    // A failed attempt retries in 30 minutes, up to three attempts a day.
    await scheduleNext(ctx, brief.communityId, nowMs, fields.status === "failed" && brief.attempts < MAX_ATTEMPTS);
  },
});

// Asks the model for the brief. Null when funding, the provider or the reply
// isn't usable: the caller then sends the plain brief.
async function writeWithModel(ctx: any, claim: any, communityId: any, briefDate: string, snapshot: FounderBriefSnapshot, stats: Record<string, number>) {
  const funding = await resolveCommunityInferenceFundingForAction(ctx, communityId);
  if (!funding.ok) return null;
  let run;
  try {
    run = await startFundedInferenceRun({
      ctx, communityId, actorUserId: claim.ownerUserId, surface: "community_founder_brief",
      receiptKey: `community_founder_brief:${String(communityId)}:${briefDate}:${claim.windowEndMs}`,
      sourceRunId: `community-founder-brief:${String(claim.briefId)}`, admission: funding,
    });
  } catch {
    // Usage exhausted, rate limited or funding changed: no model today.
    return null;
  }
  try {
    const response = await run.request({
      messages: [
        { role: "system", content: FOUNDER_BRIEF_PROMPT },
        { role: "user", content: JSON.stringify(snapshot) },
      ],
      maxTokens: BRIEF_MAX_OUTPUT_TOKENS,
      tools: [],
    });
    if (!response.ok || response.type !== "assistant") {
      await run.fail(response.ok ? "invalid_model_output" : response.code);
      return null;
    }
    const settled = await run.settle("provider_completed");
    stats.promptTokens = Number(response.promptTokens ?? 0);
    stats.completionTokens = Number(response.completionTokens ?? 0);
    return settled ? parseBrief(response.assistantText) : null;
  } catch (error) {
    await run.fail(error instanceof Error ? error.message.slice(0, 120) : "founder_brief_provider_failed").catch(() => {});
    return null;
  }
}

// Writes the brief (model when there is something to say and funding allows,
// plain otherwise) and delivers it to the founder's agent thread and email.
// The thread message and email are keyed by date, so a retry never doubles them.
async function writeAndDeliver(ctx: any, args: { communityId: any; briefDate: string; nowMs: number }) {
  const claim = await ctx.runMutation(internalRefs.communityFounderBrief.claimFounderBriefInternal, args);
  if (!claim) return "skipped";
  const finish = (status: "sent" | "failed", extra: Record<string, unknown>) =>
    ctx.runMutation(internalRefs.communityFounderBrief.finishFounderBriefInternal, { briefId: claim.briefId, status, nowMs: Date.now(), ...extra });
  try {
    const threadMessageKey = `founder-brief:${String(args.communityId)}:${args.briefDate}`;
    let delivery = claim.delivery as null | {
      threadId: string; markdown: string; emailPayload: any; communityLifecycleGeneration: number; writer: "model" | "deterministic";
    };
    let stats: Record<string, number> | undefined;
    if (!delivery) {
      const read = await ctx.runQuery(internalRefs.communityFounderBrief.readFounderBriefSnapshotInternal, {
        communityId: args.communityId, windowStartMs: claim.windowStartMs, nowMs: claim.windowEndMs,
      });
      if (!read) {
        await finish("failed", { errorCode: "community_unavailable" });
        return "failed";
      }
      const snapshot = read.snapshot as FounderBriefSnapshot;
      stats = {
        newMembers: snapshot.newMembers.count, posts: snapshot.activity.posts, replies: snapshot.activity.replies,
        unanswered: snapshot.unanswered.length, quietNewcomers: snapshot.quietNewcomers.count,
        joinRequests: snapshot.joinRequestsPending, upcomingEvents: snapshot.upcomingEvents.length,
      };
      const modelBrief = snapshotIsQuiet(snapshot)
        ? null : await writeWithModel(ctx, claim, args.communityId, args.briefDate, snapshot, stats);
      const brief = modelBrief ?? deterministicBrief(snapshot);
      const conversation = await ctx.runMutation(internalRefs.threads.ensureCommunityAgentConversationForTrustedUserInternal, {
        communityId: args.communityId, trustedUserId: claim.ownerUserId,
      }) as { thread_id: string };
      const agentPath = buildCommunityTabPath(read.communitySlug, "agent" as any);
      delivery = {
        threadId: String(conversation.thread_id),
        markdown: briefMarkdown(brief),
        writer: modelBrief ? "model" : "deterministic",
        communityLifecycleGeneration: read.communityLifecycleGeneration,
        emailPayload: {
          communityName: snapshot.communityName, dateLabel: args.briefDate, headline: brief.headline,
          sections: brief.sections, nextStep: brief.nextStep,
          actionUrl: agentPath ? `${readCanonicalPublicAppOrigin()}${agentPath}` : readCanonicalPublicAppOrigin(),
        },
      };
      await ctx.runMutation(internalRefs.communityFounderBrief.recordFounderBriefDeliveryInternal, { briefId: claim.briefId, delivery });
    }
    const writer = delivery.writer;
    await ctx.runMutation(internalRefs.threads.addCloudThreadMessageForTrustedOwnerInternal, {
      trustedOwnerId: claim.ownerUserId, threadId: delivery.threadId, messageKey: threadMessageKey, role: "assistant",
      contentJson: { text: delivery.markdown, meta: { kind: "founder_brief", brief_date: args.briefDate, writer } },
    });
    await ctx.runMutation(internalRefs.email.enqueueEmailJobInternal, {
      kind: "founder_daily_brief",
      communityId: args.communityId,
      communityLifecycleGeneration: delivery.communityLifecycleGeneration,
      recipientUserId: claim.ownerUserId,
      templateKey: "founder_daily_brief",
      payload: delivery.emailPayload,
      dedupeKey: threadMessageKey,
    });
    await finish("sent", { writer, ...(stats ? { stats } : {}), threadMessageKey });
    return "sent";
  } catch (error) {
    await finish("failed", { errorCode: error instanceof Error ? error.message.slice(0, 120) : "founder_brief_failed" });
    return "failed";
  }
}

export const processDueFounderBriefsInternal = internalAction({
  args: {},
  handler: async (ctx) => {
    const nowMs = Date.now();
    const due = await ctx.runQuery(internalRefs.communityFounderBrief.listDueFounderBriefsInternal, { nowMs });
    const outcomes: Record<string, number> = {};
    for (const item of due) {
      const outcome = await writeAndDeliver(ctx, { communityId: item.communityId, briefDate: item.briefDate, nowMs });
      outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
    }
    return { due: due.length, outcomes };
  },
});

// Sends today's brief now (staging and acceptance checks), ignoring the hour.
export const sendFounderBriefNowInternal = internalAction({
  args: { communityId: v.id("communities"), timeZone: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const timeZone = args.timeZone && validTimeZone(args.timeZone) ? args.timeZone : "UTC";
    return await writeAndDeliver(ctx, { communityId: args.communityId, briefDate: localDateAndHour(nowMs, timeZone).date, nowMs });
  },
});

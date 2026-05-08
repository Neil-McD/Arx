import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { buildCommunityTabPath } from "../shared/webAppRouteState";
import { listActiveCommunityRecipientUserIds } from "./communityRecipientCore";
import {
  buildWeeklyDigestDedupeKey,
  buildWeeklyDigestPeriod,
  capWeeklyDigestItems,
  formatWeeklyDigestStats,
  shouldSendWeeklyDigest,
  stableWeeklyDigestDay,
  type WeeklyDigestActivityCounts,
} from "../shared/weeklyDigestCore";

type CommunityRow = {
  _id: any;
  ownerId: any;
  slug: string;
  name: string;
  visibility: "published" | "unlisted";
  updatedAt: number;
};

type CommunityMembershipRow = {
  _id: any;
  communityId: any;
  userId: any;
  active?: boolean;
  revokedAt?: number;
  createdAt: number;
};

type CommunityChatThreadRow = {
  _id: any;
  communityId: any;
  createdAt: number;
  updatedAt: number;
};

type CommunityChatMessageRow = {
  _id: any;
  seq: number;
  contentJson: unknown;
  createdAt: number;
};

type CommunityAiFeedPostRow = {
  _id: any;
  title?: string;
  body: string;
  type: "observation" | "recommendation" | "action";
  score: number;
  goodCount: number;
  createdAt: number;
};

type CommunityResourceRow = {
  _id: any;
  title: string;
  bodyMd?: string;
  url?: string;
  type: string;
  pinned: boolean;
  createdAt: number;
};

type CommunityArchiveDocumentRow = {
  _id: any;
  sourceType: "chat" | "ai_feed" | "resource";
  title?: string;
  snippet: string;
  url?: string;
  createdAt: number;
};

type DigestItemCandidate = {
  priority: number;
  createdAt: number;
  title: string;
  summary?: string;
  meta?: string;
  urlPath: string;
};

type DigestBatch = {
  communityId: string;
  communityName: string;
  communitySlug: string;
  periodStartDay: string;
  periodEndDay: string;
  dateLabel: string;
  intro: string;
  activity: WeeklyDigestActivityCounts;
  items: Array<{
    title: string;
    summary?: string;
    meta?: string;
    urlPath: string;
  }>;
  recipientUserIds: any[];
};

const PUBLIC_APP_URL_ENV_KEYS = [
  "ARX_PUBLIC_APP_URL",
  "PUBLIC_APP_URL",
  "VITE_PUBLIC_APP_URL",
  "VITE_APP_URL",
] as const;

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // ignore
  }
  return "";
}

function readPublicAppBaseUrl(): string {
  for (const key of PUBLIC_APP_URL_ENV_KEYS) {
    const value = readEnv(key).replace(/\/+$/, "");
    if (!value) continue;
    if (/^https?:\/\//i.test(value)) return value;
  }
  throw new Error("public_app_url_missing");
}

function buildAppUrl(path: string): string {
  return new URL(path, `${readPublicAppBaseUrl()}/`).toString();
}

function normalizePositiveLimit(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(max, Math.floor(parsed)));
}

function truncateText(raw: unknown, maxLen: number): string {
  const value = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!value) return "";
  return value.length <= maxLen ? value : `${value.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

function stripMarkdown(raw: unknown): string {
  return truncateText(
    String(raw ?? "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/!\[[^\]]*\]\(([^)]+)\)/g, " $1 ")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 $2")
      .replace(/[#>*_~-]+/g, " "),
    240,
  );
}

function extractChatMessageText(contentJson: unknown): string {
  if (typeof contentJson === "string") return truncateText(contentJson, 240);
  if (!contentJson || typeof contentJson !== "object" || Array.isArray(contentJson)) return "";
  const record = contentJson as Record<string, unknown>;
  return truncateText(record.text ?? "", 240);
}

function formatDigestDateLabel(periodStartDay: string, periodEndDay: string): string {
  const start = new Date(`${periodStartDay}T00:00:00.000Z`);
  const end = new Date(`${periodEndDay}T00:00:00.000Z`);
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

function sourceTypeLabel(sourceType: CommunityArchiveDocumentRow["sourceType"]): string {
  if (sourceType === "ai_feed") return "AI signal";
  if (sourceType === "resource") return "Resource";
  return "Discussion";
}

function itemUrlPath(communitySlug: string, tab: "chat" | "ai_feed" | "resources" | "polynet"): string {
  return buildCommunityTabPath(communitySlug, tab) ?? "/workspace";
}

async function listDigestCommunities(ctx: any, args: {
  communityId?: any;
  limit: number;
}): Promise<CommunityRow[]> {
  if (args.communityId) {
    const community = (await ctx.db.get(args.communityId)) as CommunityRow | null;
    return community ? [community] : [];
  }
  const published = (await ctx.db
    .query("communities")
    .withIndex("by_visibility_updatedAt", (q: any) => q.eq("visibility", "published"))
    .order("desc")
    .take(args.limit)) as CommunityRow[];
  const unlisted = (await ctx.db
    .query("communities")
    .withIndex("by_visibility_updatedAt", (q: any) => q.eq("visibility", "unlisted"))
    .order("desc")
    .take(args.limit)) as CommunityRow[];
  return [...published, ...unlisted]
    .sort((a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0))
    .slice(0, args.limit * 2);
}

async function getCanonicalCommunityChatThread(ctx: any, communityId: any): Promise<CommunityChatThreadRow | null> {
  const rows = (await ctx.db
    .query("communityChatThreads" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", communityId))
    .collect()) as CommunityChatThreadRow[];
  return rows.slice().sort((a, b) => a.createdAt - b.createdAt || a.updatedAt - b.updatedAt)[0] ?? null;
}

async function listRecentCommunityChatMessages(ctx: any, params: {
  communityId: any;
  periodStartMs: number;
  periodEndMs: number;
}): Promise<CommunityChatMessageRow[]> {
  const thread = await getCanonicalCommunityChatThread(ctx, params.communityId);
  if (!thread?._id) return [];
  const rows = (await ctx.db
    .query("communityChatMessages" as any)
    .withIndex("by_thread_seq", (q: any) => q.eq("threadId", thread._id))
    .order("desc")
    .take(500)) as CommunityChatMessageRow[];
  return rows
    .filter((row) => row.createdAt >= params.periodStartMs && row.createdAt <= params.periodEndMs)
    .sort((a, b) => b.createdAt - a.createdAt);
}

async function listRecentAiFeedPosts(ctx: any, params: {
  communityId: any;
  periodStartMs: number;
  periodEndMs: number;
}): Promise<CommunityAiFeedPostRow[]> {
  const rows = (await ctx.db
    .query("communityAiFeedPosts" as any)
    .withIndex("by_community_status_createdAt", (q: any) =>
      q.eq("communityId", params.communityId).eq("status", "live").gte("createdAt", params.periodStartMs),
    )
    .collect()) as CommunityAiFeedPostRow[];
  return rows
    .filter((row) => row.createdAt <= params.periodEndMs)
    .sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0) || b.createdAt - a.createdAt);
}

async function listRecentResources(ctx: any, params: {
  communityId: any;
  periodStartMs: number;
  periodEndMs: number;
}): Promise<CommunityResourceRow[]> {
  const rows = (await ctx.db
    .query("communityResources" as any)
    .withIndex("by_community_createdAt", (q: any) =>
      q.eq("communityId", params.communityId).gte("createdAt", params.periodStartMs),
    )
    .collect()) as CommunityResourceRow[];
  return rows
    .filter((row) => row.createdAt <= params.periodEndMs)
    .sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return Boolean(a.pinned) ? -1 : 1;
      return b.createdAt - a.createdAt;
    });
}

async function listRecentArchiveDocuments(ctx: any, params: {
  communityId: any;
  periodStartMs: number;
  periodEndMs: number;
}): Promise<CommunityArchiveDocumentRow[]> {
  const rows = (await ctx.db
    .query("communityArchiveDocuments" as any)
    .withIndex("by_community_createdAt", (q: any) =>
      q.eq("communityId", params.communityId).gte("createdAt", params.periodStartMs),
    )
    .collect()) as CommunityArchiveDocumentRow[];
  return rows
    .filter((row) => row.createdAt <= params.periodEndMs)
    .sort((a, b) => b.createdAt - a.createdAt);
}

async function countNewActiveMembers(ctx: any, params: {
  communityId: any;
  periodStartMs: number;
  periodEndMs: number;
}): Promise<number> {
  const memberships = (await ctx.db
    .query("communityMemberships" as any)
    .withIndex("by_community", (q: any) => q.eq("communityId", params.communityId))
    .collect()) as CommunityMembershipRow[];
  return memberships.filter(
    (row) =>
      row.active !== false &&
      typeof row.revokedAt !== "number" &&
      row.createdAt >= params.periodStartMs &&
      row.createdAt <= params.periodEndMs,
  ).length;
}

function buildDigestItems(args: {
  communitySlug: string;
  aiFeedPosts: CommunityAiFeedPostRow[];
  archiveDocuments: CommunityArchiveDocumentRow[];
  resources: CommunityResourceRow[];
  chatMessages: CommunityChatMessageRow[];
}): DigestItemCandidate[] {
  const items: DigestItemCandidate[] = [];
  for (const post of args.aiFeedPosts.slice(0, 4)) {
    const title = truncateText(post.title || post.body, 96);
    const summary = truncateText(post.body, 220);
    items.push({
      priority: 400 + Number(post.score ?? 0) + Number(post.goodCount ?? 0),
      createdAt: post.createdAt,
      title,
      summary,
      meta: `AI ${post.type}`,
      urlPath: itemUrlPath(args.communitySlug, "polynet"),
    });
  }
  for (const doc of args.archiveDocuments.slice(0, 4)) {
    items.push({
      priority: 300,
      createdAt: doc.createdAt,
      title: truncateText(doc.title || "New knowledge added to collective intelligence", 96),
      summary: truncateText(doc.snippet, 220),
      meta: `Collective intelligence • ${sourceTypeLabel(doc.sourceType)}`,
      urlPath: itemUrlPath(args.communitySlug, doc.sourceType === "resource" ? "resources" : "polynet"),
    });
  }
  for (const resource of args.resources.slice(0, 3)) {
    items.push({
      priority: 200 + (resource.pinned ? 25 : 0),
      createdAt: resource.createdAt,
      title: truncateText(resource.title, 96),
      summary: stripMarkdown(resource.bodyMd || resource.url || resource.type),
      meta: `Resource • ${truncateText(resource.type, 32) || "new"}`,
      urlPath: itemUrlPath(args.communitySlug, "resources"),
    });
  }
  for (const message of args.chatMessages.slice(0, 3)) {
    const text = extractChatMessageText(message.contentJson);
    if (!text) continue;
    items.push({
      priority: 100,
      createdAt: message.createdAt,
      title: "Active discussion",
      summary: text,
      meta: "Community chat",
      urlPath: itemUrlPath(args.communitySlug, "chat"),
    });
  }
  return capWeeklyDigestItems(
    items.sort((a, b) => b.priority - a.priority || b.createdAt - a.createdAt),
    8,
  );
}

export const buildWeeklyCommunityDigestBatchesInternal = internalQuery({
  args: {
    communityId: v.optional(v.id("communities")),
    force: v.optional(v.boolean()),
    nowMs: v.optional(v.number()),
    limitCommunities: v.optional(v.number()),
    limitRecipientsPerCommunity: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<DigestBatch[]> => {
    const nowMs = Number.isFinite(args.nowMs) ? Math.floor(args.nowMs as number) : Date.now();
    const todayDigestDay = new Date(nowMs).getUTCDay();
    const force = Boolean(args.force);
    const limitCommunities = normalizePositiveLimit(args.limitCommunities, args.communityId ? 1 : 50, 200);
    const limitRecipientsPerCommunity = normalizePositiveLimit(args.limitRecipientsPerCommunity, 500, 2000);
    const period = buildWeeklyDigestPeriod(nowMs, 7);
    const communities = await listDigestCommunities(ctx, {
      communityId: args.communityId,
      limit: limitCommunities,
    });
    const batches: DigestBatch[] = [];

    for (const community of communities) {
      const communityId = String(community._id);
      if (!force && stableWeeklyDigestDay(communityId) !== todayDigestDay) continue;
      const communitySlug = String(community.slug ?? "").trim();
      if (!communitySlug) continue;

      const [chatMessages, aiFeedPosts, resources, archiveDocuments, newMemberCount] = await Promise.all([
        listRecentCommunityChatMessages(ctx, {
          communityId: community._id,
          periodStartMs: period.periodStartMs,
          periodEndMs: period.periodEndMs,
        }),
        listRecentAiFeedPosts(ctx, {
          communityId: community._id,
          periodStartMs: period.periodStartMs,
          periodEndMs: period.periodEndMs,
        }),
        listRecentResources(ctx, {
          communityId: community._id,
          periodStartMs: period.periodStartMs,
          periodEndMs: period.periodEndMs,
        }),
        listRecentArchiveDocuments(ctx, {
          communityId: community._id,
          periodStartMs: period.periodStartMs,
          periodEndMs: period.periodEndMs,
        }),
        countNewActiveMembers(ctx, {
          communityId: community._id,
          periodStartMs: period.periodStartMs,
          periodEndMs: period.periodEndMs,
        }),
      ]);

      const activity: WeeklyDigestActivityCounts = {
        chatMessageCount: chatMessages.length,
        aiFeedPostCount: aiFeedPosts.length,
        resourceCount: resources.length,
        archiveDocumentCount: archiveDocuments.length,
        newMemberCount,
      };
      if (!shouldSendWeeklyDigest(activity)) continue;

      const recipientUserIds = await listActiveCommunityRecipientUserIds(ctx, {
        communityId: community._id,
        communityOwnerId: community.ownerId,
        nowMs,
        limit: limitRecipientsPerCommunity,
      });
      if (recipientUserIds.length === 0) continue;

      const items = buildDigestItems({
        communitySlug,
        aiFeedPosts,
        archiveDocuments,
        resources,
        chatMessages,
      }).map(({ title, summary, meta, urlPath }) => ({
        title,
        ...(summary ? { summary } : null),
        ...(meta ? { meta } : null),
        urlPath,
      }));
      if (items.length === 0) continue;

      batches.push({
        communityId,
        communityName: String(community.name ?? communitySlug).trim() || "your community",
        communitySlug,
        periodStartDay: period.periodStartDay,
        periodEndDay: period.periodEndDay,
        dateLabel: formatDigestDateLabel(period.periodStartDay, period.periodEndDay),
        intro: formatWeeklyDigestStats(activity),
        activity,
        items,
        recipientUserIds,
      });
    }

    return batches;
  },
});

export const enqueueWeeklyCommunityDigestsInternal = internalAction({
  args: {
    communityId: v.optional(v.id("communities")),
    force: v.optional(v.boolean()),
    nowMs: v.optional(v.number()),
    limitCommunities: v.optional(v.number()),
    limitRecipientsPerCommunity: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<unknown> => {
    const nowMs = Number.isFinite(args.nowMs) ? Math.floor(args.nowMs as number) : Date.now();
    const batches = (await ctx.runQuery(
      (internal as any).emailDigests.buildWeeklyCommunityDigestBatchesInternal,
      {
        communityId: args.communityId,
        force: args.force,
        nowMs,
        limitCommunities: args.limitCommunities,
        limitRecipientsPerCommunity: args.limitRecipientsPerCommunity,
      },
    )) as DigestBatch[];

    let enqueued = 0;
    let deduped = 0;
    let suppressed = 0;
    for (const batch of batches) {
      const actionUrl = buildAppUrl(itemUrlPath(batch.communitySlug, "chat"));
      const payload = {
        communityName: batch.communityName,
        dateLabel: batch.dateLabel,
        intro: batch.intro,
        ctaLabel: "View community",
        actionUrl,
        footerNote: "You can change digest emails from account settings.",
        items: batch.items.map((item) => ({
          title: item.title,
          ...(item.summary ? { summary: item.summary } : null),
          ...(item.meta ? { meta: item.meta } : null),
          url: buildAppUrl(item.urlPath),
        })),
      };
      for (const userId of batch.recipientUserIds) {
        const result = (await ctx.runMutation(
          (internal as any).email.enqueueEmailJobInternal,
          {
            kind: "weekly_member_digest",
            recipientUserId: userId,
            templateKey: "weekly_member_digest",
            payload,
            dedupeKey: buildWeeklyDigestDedupeKey({
              communityId: batch.communityId,
              userId,
              periodStartDay: batch.periodStartDay,
              periodEndDay: batch.periodEndDay,
            }),
            nowMs,
          },
        )) as { deduped?: boolean; status?: string } | null;
        if (result?.deduped) {
          deduped += 1;
        } else if (result?.status === "suppressed") {
          suppressed += 1;
        } else {
          enqueued += 1;
        }
      }
    }

    return {
      ok: true,
      communities: batches.length,
      recipients: batches.reduce((count, batch) => count + batch.recipientUserIds.length, 0),
      enqueued,
      deduped,
      suppressed,
    };
  },
});

import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { buildCommunityTabPath } from "../shared/webAppRouteState";
import { listActiveCommunityRecipientUserIds } from "./communityRecipientCore";
import {
  type CommunityResourceModuleLike,
  communityResourceIsLiveModulePage,
  communityResourceModuleIsLive,
} from "./communityCore";
import {
  buildWeeklyDigestDedupeKey,
  buildWeeklyDigestPeriod,
  capWeeklyDigestItems,
  formatWeeklyDigestStats,
  shouldSendWeeklyDigest,
  stableWeeklyDigestDay,
  type WeeklyDigestActivityCounts,
} from "../shared/weeklyDigestCore";
import {
  communityIsActive,
  normalizeCommunityLifecycle,
  type CommunityLifecycleFields,
} from "../shared/communityLifecycle";

type CommunityRow = CommunityLifecycleFields & {
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

type CommunityResourceRow = {
  _id: any;
  title: string;
  bodyMd?: string;
  url?: string;
  fileKey?: string;
  type: string;
  status?: string;
  pinned: boolean;
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
  communityLifecycleGeneration: number;
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

function itemUrlPath(communitySlug: string, tab: "chat" | "resources"): string {
  return buildCommunityTabPath(communitySlug, tab) ?? "/discover";
}

async function listDigestCommunities(ctx: any, args: {
  communityId?: any;
  limit: number;
}): Promise<CommunityRow[]> {
  if (args.communityId) {
    const community = (await ctx.db.get(args.communityId)) as CommunityRow | null;
    return community && communityIsActive(community) ? [community] : [];
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
    .filter((community) => communityIsActive(community))
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

async function listRecentResources(ctx: any, params: {
  communityId: any;
  periodStartMs: number;
  periodEndMs: number;
}): Promise<CommunityResourceRow[]> {
  const [modules, recentRows] = await Promise.all([
    ctx.db
      .query("communityResourceModules" as any)
      .withIndex("by_community", (q: any) => q.eq("communityId", params.communityId))
      .collect() as Promise<CommunityResourceModuleLike[]>,
    ctx.db
      .query("communityResources" as any)
      .withIndex("by_community_createdAt", (q: any) =>
        q.eq("communityId", params.communityId).gte("createdAt", params.periodStartMs),
      )
      .collect(),
  ]);
  const uniqueRows = new Map<string, CommunityResourceRow>();
  const liveModuleIds = new Set(
    modules
      .filter(communityResourceModuleIsLive)
      .map((module) => String(module._id)),
  );
  for (const row of recentRows as CommunityResourceRow[]) {
    uniqueRows.set(String(row._id), row);
  }
  return Array.from(uniqueRows.values())
    .filter(
      (row) =>
        row.createdAt <= params.periodEndMs &&
        communityResourceIsLiveModulePage(row as any, liveModuleIds),
    )
    .sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return Boolean(a.pinned) ? -1 : 1;
      return b.createdAt - a.createdAt;
    });
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
  resources: CommunityResourceRow[];
  chatMessages: CommunityChatMessageRow[];
}): DigestItemCandidate[] {
  const items: DigestItemCandidate[] = [];
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

      const [chatMessages, resources, newMemberCount] = await Promise.all([
        listRecentCommunityChatMessages(ctx, {
          communityId: community._id,
          periodStartMs: period.periodStartMs,
          periodEndMs: period.periodEndMs,
        }),
        listRecentResources(ctx, {
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
        resourceCount: resources.length,
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
        communityLifecycleGeneration: normalizeCommunityLifecycle(community).generation,
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
            communityId: batch.communityId,
            communityLifecycleGeneration: batch.communityLifecycleGeneration,
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

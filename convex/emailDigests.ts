import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { buildCommunityTabPath } from "../shared/webAppRouteState";
import { listActiveCommunityRecipientUserIds } from "./communityRecipientCore";
import {
  type CommunityResourceLike,
  type CommunityResourceModuleLike,
  communityMembershipRowIsActive,
  communityResourceIsLiveModulePage,
  communityResourceModuleIsLive,
} from "./communityCore";
import { hydrateCommunityResourceBody } from "./communityResourceContent";
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

type CommunityInteractionDigestRootRow = {
  _id: any;
  communityId: any;
  status: "live" | "hidden" | "deleted";
  visibilityScope: "private" | "admin" | "community" | "public";
  contentSummary: string;
  createdAt: number;
};

type CommunityInteractionDigestReplyRow = {
  _id: any;
  communityId: any;
  rootId: any;
  status: "live" | "hidden" | "deleted";
  visibilityScope: "private" | "admin" | "community" | "public";
  contentSummary: string;
  createdAt: number;
};

type CommunityInteractionDigestMessageRow = {
  _id: any;
  objectType: "root" | "reply";
  contentSummary: string;
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

type CommunityResourceRow = CommunityResourceLike;

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

const COMMUNITY_DIGEST_INTERACTION_LIMIT = 50;

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

function itemUrlPath(communitySlug: string, tab: "chat" | "ai_feed" | "resources" | "polynet"): string {
  return buildCommunityTabPath(communitySlug, tab) ?? "/discover";
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

function communityInteractionIsDigestReadable(
  row: CommunityInteractionDigestRootRow | CommunityInteractionDigestReplyRow,
): boolean {
  return (
    row.status === "live" &&
    (row.visibilityScope === "community" || row.visibilityScope === "public")
  );
}

export async function listRecentCanonicalCommunityChatMessages(ctx: any, params: {
  communityId: any;
  periodStartMs: number;
  periodEndMs: number;
}): Promise<CommunityInteractionDigestMessageRow[]> {
  const [rootWindow, replyWindow] = (await Promise.all([
    ctx.db
      .query("communityInteractionRoots" as any)
      .withIndex("by_community_status_createdAt", (q: any) =>
        q
          .eq("communityId", params.communityId)
          .eq("status", "live")
          .gte("createdAt", params.periodStartMs)
          .lte("createdAt", params.periodEndMs),
      )
      .order("desc")
      .take(COMMUNITY_DIGEST_INTERACTION_LIMIT + 1),
    ctx.db
      .query("communityInteractionReplies" as any)
      .withIndex("by_community_status_createdAt", (q: any) =>
        q
          .eq("communityId", params.communityId)
          .eq("status", "live")
          .gte("createdAt", params.periodStartMs)
          .lte("createdAt", params.periodEndMs),
      )
      .order("desc")
      .take(COMMUNITY_DIGEST_INTERACTION_LIMIT + 1),
  ])) as [CommunityInteractionDigestRootRow[], CommunityInteractionDigestReplyRow[]];
  const recentRoots = rootWindow.slice(0, COMMUNITY_DIGEST_INTERACTION_LIMIT);
  const recentReplies = replyWindow.slice(0, COMMUNITY_DIGEST_INTERACTION_LIMIT);
  const readableParentRoots = new Map(
    recentRoots
      .filter(communityInteractionIsDigestReadable)
      .map((root) => [String(root._id), root]),
  );
  const missingParentIds = new Map<string, any>();
  for (const reply of recentReplies) {
    if (!readableParentRoots.has(String(reply.rootId))) {
      missingParentIds.set(String(reply.rootId), reply.rootId);
    }
  }
  const fetchedParents = await Promise.all(
    Array.from(missingParentIds.entries()).map(async ([key, rootId]) => [
      key,
      (await ctx.db.get(rootId)) as CommunityInteractionDigestRootRow | null,
    ] as const),
  );
  for (const [key, root] of fetchedParents) {
    if (
      root &&
      String(root.communityId) === String(params.communityId) &&
      communityInteractionIsDigestReadable(root)
    ) {
      readableParentRoots.set(key, root);
    }
  }

  return [
    ...recentRoots
      .filter(communityInteractionIsDigestReadable)
      .map((root) => ({
        _id: root._id,
        objectType: "root" as const,
        contentSummary: root.contentSummary,
        createdAt: root.createdAt,
      })),
    ...recentReplies
      .filter(
        (reply) =>
          communityInteractionIsDigestReadable(reply) &&
          readableParentRoots.has(String(reply.rootId)),
      )
      .map((reply) => ({
        _id: reply._id,
        objectType: "reply" as const,
        contentSummary: reply.contentSummary,
        createdAt: reply.createdAt,
      })),
  ].sort(
    (a, b) =>
      b.createdAt - a.createdAt ||
      a.objectType.localeCompare(b.objectType) ||
      String(a._id).localeCompare(String(b._id)),
  );
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
  const sorted = Array.from(uniqueRows.values())
    .filter(
      (row) =>
        row.createdAt <= params.periodEndMs &&
        communityResourceIsLiveModulePage(row as any, liveModuleIds),
    )
    .sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return Boolean(a.pinned) ? -1 : 1;
      return b.createdAt - a.createdAt;
    });
  const hydratedHead = await Promise.all(
    sorted.slice(0, 3).map(async (row) => (await hydrateCommunityResourceBody(ctx, row)) ?? row),
  );
  return [...hydratedHead, ...sorted.slice(3)];
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
      communityMembershipRowIsActive(row) &&
      row.createdAt >= params.periodStartMs &&
      row.createdAt <= params.periodEndMs,
  ).length;
}

function buildDigestItems(args: {
  communitySlug: string;
  aiFeedPosts: CommunityAiFeedPostRow[];
  resources: CommunityResourceRow[];
  chatMessages: CommunityInteractionDigestMessageRow[];
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
    const text = truncateText(message.contentSummary, 240);
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

      const [chatMessages, aiFeedPosts, resources, newMemberCount] = await Promise.all([
        listRecentCanonicalCommunityChatMessages(ctx, {
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

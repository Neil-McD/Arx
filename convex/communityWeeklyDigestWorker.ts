import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { listSharedChannelReadableRows } from "./communityChannelCore";
import { communityWeeklyDigestSnapshotValidator } from "./communityWeeklyDigestValidators";
import {
  communityIsActive,
  communityLifecycleGenerationMatches,
} from "../shared/communityLifecycle";
import {
  communityResourceIsLiveModulePage,
  communityResourceModuleIsLive,
} from "./communityCore";
import { readCanonicalPublicAppOrigin } from "./publicAppUrl";
import { buildCommunityTabPath } from "../shared/webAppRouteState";
import {
  COMMUNITY_WEEKLY_DIGEST_MAX_COMMUNITIES_PER_RUN,
  COMMUNITY_WEEKLY_DIGEST_MAX_INTERACTIONS_SCANNED,
  COMMUNITY_WEEKLY_DIGEST_MAX_ITEMS,
  COMMUNITY_WEEKLY_DIGEST_MAX_NEW_MEMBERS_SCANNED,
  COMMUNITY_WEEKLY_DIGEST_MAX_RECIPIENTS_PER_COMMUNITY_BATCH,
  COMMUNITY_WEEKLY_DIGEST_MAX_RECIPIENTS_PER_RUN,
  COMMUNITY_WEEKLY_DIGEST_MAX_RESOURCE_MODULES_SCANNED,
  COMMUNITY_WEEKLY_DIGEST_MAX_RESOURCES_SCANNED,
  buildCommunityWeeklyDigestDedupeKey,
  buildCommunityWeeklyDigestPeriod,
  formatCommunityWeeklyDigestDateLabel,
  formatCommunityWeeklyDigestStats,
  readCommunityWeeklyDigestPeriod,
  truncateCommunityWeeklyDigestText,
  type CommunityWeeklyDigestActivityCounts,
} from "../shared/communityWeeklyDigestSchedule";

type DigestSnapshotItem = {
  title: string;
  summary?: string;
  meta?: string;
  tab: "chat" | "resources";
};

type DigestSnapshot = {
  communityName: string;
  communitySlug: string;
  dateLabel: string;
  intro: string;
  items: DigestSnapshotItem[];
};

function boundedRecipientLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return COMMUNITY_WEEKLY_DIGEST_MAX_RECIPIENTS_PER_COMMUNITY_BATCH;
  }
  return Math.min(
    COMMUNITY_WEEKLY_DIGEST_MAX_RECIPIENTS_PER_COMMUNITY_BATCH,
    Math.max(1, Math.floor(parsed)),
  );
}

function readDigestSnapshot(raw: unknown): DigestSnapshot | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const communityName = String(value.communityName ?? "").trim();
  const communitySlug = String(value.communitySlug ?? "").trim();
  const dateLabel = String(value.dateLabel ?? "").trim();
  const intro = String(value.intro ?? "").trim();
  if (!communityName || !communitySlug || !dateLabel || !intro) return null;
  const items = Array.isArray(value.items)
    ? value.items.flatMap((rawItem): DigestSnapshotItem[] => {
        if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) return [];
        const item = rawItem as Record<string, unknown>;
        const title = truncateCommunityWeeklyDigestText(item.title, 96);
        const tab = item.tab === "resources" ? "resources" : item.tab === "chat" ? "chat" : null;
        if (!title || !tab) return [];
        const summary = truncateCommunityWeeklyDigestText(item.summary, 240);
        const meta = truncateCommunityWeeklyDigestText(item.meta, 48);
        return [{
          title,
          ...(summary ? { summary } : null),
          ...(meta ? { meta } : null),
          tab,
        }];
      })
    : [];
  if (items.length === 0) return null;
  return {
    communityName,
    communitySlug,
    dateLabel,
    intro,
    items: items.slice(0, COMMUNITY_WEEKLY_DIGEST_MAX_ITEMS),
  };
}

function stripMarkdown(raw: unknown): string {
  return truncateCommunityWeeklyDigestText(
    String(raw ?? "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/!\[[^\]]*\]\(([^)]+)\)/g, " $1 ")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
      .replace(/[#>*_~-]+/g, " "),
    240,
  );
}

async function buildDigestSnapshot(ctx: any, params: {
  community: any;
  periodStartMs: number;
  periodEndExclusiveMs: number;
  periodStartDay: string;
  periodEndDay: string;
}): Promise<DigestSnapshot | null> {
  const [roots, replies, modules, resources, recentMemberships] = await Promise.all([
    listSharedChannelReadableRows({
      ctx, tableName: "communityInteractionRoots", communityId: params.community._id,
      limit: COMMUNITY_WEEKLY_DIGEST_MAX_INTERACTIONS_SCANNED, beforeCreatedAt: params.periodEndExclusiveMs,
    }),
    listSharedChannelReadableRows({
      ctx, tableName: "communityInteractionReplies", communityId: params.community._id,
      limit: COMMUNITY_WEEKLY_DIGEST_MAX_INTERACTIONS_SCANNED, beforeCreatedAt: params.periodEndExclusiveMs,
    }),
    ctx.db
      .query("communityResourceModules")
      .withIndex("by_community", (q: any) => q.eq("communityId", params.community._id))
      .take(COMMUNITY_WEEKLY_DIGEST_MAX_RESOURCE_MODULES_SCANNED),
    ctx.db
      .query("communityResources")
      .withIndex("by_community_createdAt", (q: any) =>
        q
          .eq("communityId", params.community._id)
          .gte("createdAt", params.periodStartMs)
          .lt("createdAt", params.periodEndExclusiveMs),
      )
      .order("desc")
      .take(COMMUNITY_WEEKLY_DIGEST_MAX_RESOURCES_SCANNED),
    ctx.db
      .query("communityMemberships")
      .withIndex("by_community_createdAt", (q: any) =>
        q
          .eq("communityId", params.community._id)
          .gte("createdAt", params.periodStartMs)
          .lt("createdAt", params.periodEndExclusiveMs),
      )
      .take(COMMUNITY_WEEKLY_DIGEST_MAX_NEW_MEMBERS_SCANNED),
  ]);

  const interactions = [...roots, ...replies]
    .filter((row: any) => row.createdAt >= params.periodStartMs)
    .sort((a: any, b: any) => Number(b.createdAt ?? 0) - Number(a.createdAt ?? 0));
  const liveModuleIds = new Set<string>(
    modules
      .filter(communityResourceModuleIsLive)
      .map((row: any) => String(row._id)),
  );
  const liveResources = resources.filter((row: any) =>
    communityResourceIsLiveModulePage(row, liveModuleIds),
  );
  const activity: CommunityWeeklyDigestActivityCounts = {
    interactionCount: interactions.length,
    resourceCount: liveResources.length,
    newMemberCount: recentMemberships.filter(
      (row: any) => row.active !== false && typeof row.revokedAt !== "number",
    ).length,
  };

  const resourceItems: DigestSnapshotItem[] = liveResources.slice(0, 3).map((row: any) => ({
    title: truncateCommunityWeeklyDigestText(row.title, 96) || "New community resource",
    summary: stripMarkdown(row.bodyMd || row.url || row.type),
    meta: "Community resource",
    tab: "resources",
  }));
  const interactionItems: DigestSnapshotItem[] = interactions.slice(0, 5).map((row: any) => ({
    title: truncateCommunityWeeklyDigestText(row.title, 96) || "Community conversation",
    summary: truncateCommunityWeeklyDigestText(row.contentSummary, 240),
    meta: "Community chat",
    tab: "chat",
  }));
  const items = [...resourceItems, ...interactionItems]
    .filter((item) => Boolean(item.summary))
    .slice(0, COMMUNITY_WEEKLY_DIGEST_MAX_ITEMS);
  const intro = formatCommunityWeeklyDigestStats(activity);
  const communitySlug = String(params.community.slug ?? "").trim();
  if (!communitySlug || !intro || items.length === 0) return null;
  return {
    communityName:
      String(params.community.name ?? communitySlug).trim() || "your community",
    communitySlug,
    dateLabel: formatCommunityWeeklyDigestDateLabel({
      periodStartDay: params.periodStartDay,
      periodEndDay: params.periodEndDay,
    }),
    intro,
    items,
  };
}

export const readCommunityWeeklyDigestPageInternal = internalQuery({
  args: {
    communityId: v.id("communities"),
    communityLifecycleGeneration: v.number(),
    recipientCursor: v.optional(v.string()),
    periodStartDay: v.optional(v.string()),
    periodEndDay: v.optional(v.string()),
    digestSnapshot: v.optional(communityWeeklyDigestSnapshotValidator),
    recipientLimit: v.optional(v.number()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = Number.isFinite(args.nowMs) ? Math.floor(args.nowMs as number) : Date.now();
    const community = await ctx.db.get(args.communityId);
    if (
      !community ||
      !communityIsActive(community) ||
      !communityLifecycleGenerationMatches(community, args.communityLifecycleGeneration)
    ) {
      return { status: "community_inactive" as const };
    }
    const period = args.periodStartDay && args.periodEndDay
      ? readCommunityWeeklyDigestPeriod({
          periodStartDay: args.periodStartDay,
          periodEndDay: args.periodEndDay,
        })
      : buildCommunityWeeklyDigestPeriod(nowMs);
    const digestSnapshot =
      readDigestSnapshot(args.digestSnapshot) ??
      await buildDigestSnapshot(ctx, { community, ...period });
    if (!digestSnapshot) {
      return {
        status: "no_activity" as const,
        periodStartDay: period.periodStartDay,
        periodEndDay: period.periodEndDay,
      };
    }

    const recipientLimit = boundedRecipientLimit(args.recipientLimit);
    const firstPage = !args.recipientCursor;
    const includeOwner = firstPage && recipientLimit >= 1;
    const membershipPageSize = Math.max(1, recipientLimit - (includeOwner ? 1 : 0));
    const page = await ctx.db
      .query("communityMemberships")
      .withIndex("by_community_createdAt", (q: any) => q.eq("communityId", args.communityId))
      .paginate({
        cursor: args.recipientCursor ?? null,
        numItems: membershipPageSize,
      });
    const recipientUserIds: any[] = [];
    const seen = new Set<string>();
    const addRecipient = (userId: any) => {
      const key = String(userId ?? "").trim();
      if (!key || seen.has(key) || key === String(community.ownerId) && !includeOwner) return;
      seen.add(key);
      recipientUserIds.push(userId);
    };
    if (includeOwner) addRecipient(community.ownerId);
    for (const membership of page.page) {
      if (membership.active === false || typeof membership.revokedAt === "number") continue;
      if (String(membership.userId) === String(community.ownerId)) continue;
      addRecipient(membership.userId);
      if (recipientUserIds.length >= recipientLimit) break;
    }
    return {
      status: "ready" as const,
      periodStartDay: period.periodStartDay,
      periodEndDay: period.periodEndDay,
      digestSnapshot,
      recipientUserIds,
      recipientCursor: page.continueCursor,
      recipientsDone: page.isDone,
    };
  },
});

function buildAbsoluteAppUrl(origin: string, path: string): string {
  return new URL(path, `${origin.replace(/\/+$/, "")}/`).toString();
}

export const processDueCommunityWeeklyDigestsInternal = internalAction({
  args: {
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const nowMs = Number.isFinite(args.nowMs) ? Math.floor(args.nowMs as number) : Date.now();
    let communities = 0;
    let recipients = 0;
    let enqueued = 0;
    let deduped = 0;
    let suppressed = 0;
    let continued = 0;
    let completed = 0;
    let failed = 0;

    while (
      communities < COMMUNITY_WEEKLY_DIGEST_MAX_COMMUNITIES_PER_RUN &&
      COMMUNITY_WEEKLY_DIGEST_MAX_RECIPIENTS_PER_RUN - recipients >= 2
    ) {
      const claims = await ctx.runMutation(
        (internal as any).communityWeeklyDigestSchedule
          .claimDueCommunityWeeklyDigestSchedulesInternal,
        { limit: 1, nowMs },
      ) as any[];
      const claim = claims[0];
      if (!claim) break;
      communities += 1;
      try {
        const remainingRecipientBudget =
          COMMUNITY_WEEKLY_DIGEST_MAX_RECIPIENTS_PER_RUN - recipients;
        const page = await ctx.runQuery(
          (internal as any).communityWeeklyDigestWorker
            .readCommunityWeeklyDigestPageInternal,
          {
            communityId: claim.communityId,
            communityLifecycleGeneration: claim.communityLifecycleGeneration,
            recipientCursor: claim.recipientCursor ?? undefined,
            periodStartDay: claim.periodStartDay ?? undefined,
            periodEndDay: claim.periodEndDay ?? undefined,
            digestSnapshot: claim.digestSnapshot ?? undefined,
            recipientLimit: Math.min(
              COMMUNITY_WEEKLY_DIGEST_MAX_RECIPIENTS_PER_COMMUNITY_BATCH,
              remainingRecipientBudget,
            ),
            nowMs,
          },
        ) as any;
        if (page.status !== "ready") {
          await ctx.runMutation(
            (internal as any).communityWeeklyDigestSchedule
              .settleCommunityWeeklyDigestScheduleInternal,
            {
              scheduleId: claim.scheduleId,
              leaseToken: claim.leaseToken,
              outcome: "complete",
              nowMs,
            },
          );
          completed += 1;
          continue;
        }

        const snapshot = readDigestSnapshot(page.digestSnapshot);
        if (!snapshot) throw new Error("weekly_digest_snapshot_invalid");
        const origin = readCanonicalPublicAppOrigin();
        const actionPath = buildCommunityTabPath(snapshot.communitySlug, "chat") ?? "/discover";
        const payload = {
          communityName: snapshot.communityName,
          dateLabel: snapshot.dateLabel,
          intro: snapshot.intro,
          ctaLabel: "View community",
          actionUrl: buildAbsoluteAppUrl(origin, actionPath),
          footerNote: "You can change digest emails from account settings.",
          items: snapshot.items.map((item) => ({
            title: item.title,
            ...(item.summary ? { summary: item.summary } : null),
            ...(item.meta ? { meta: item.meta } : null),
            url: buildAbsoluteAppUrl(
              origin,
              buildCommunityTabPath(snapshot.communitySlug, item.tab) ?? actionPath,
            ),
          })),
        };
        for (const userId of page.recipientUserIds as any[]) {
          const result = await ctx.runMutation(
            (internal as any).email.enqueueEmailJobInternal,
            {
              kind: "weekly_member_digest",
              communityId: claim.communityId,
              communityLifecycleGeneration: claim.communityLifecycleGeneration,
              recipientUserId: userId,
              templateKey: "weekly_member_digest",
              payload,
              dedupeKey: buildCommunityWeeklyDigestDedupeKey({
                communityId: claim.communityId,
                userId,
                periodStartDay: page.periodStartDay,
                periodEndDay: page.periodEndDay,
              }),
              nowMs,
            },
          ) as any;
          recipients += 1;
          if (result?.deduped) deduped += 1;
          else if (result?.status === "suppressed") suppressed += 1;
          else enqueued += 1;
        }

        const outcome = page.recipientsDone ? "complete" : "continue";
        await ctx.runMutation(
          (internal as any).communityWeeklyDigestSchedule
            .settleCommunityWeeklyDigestScheduleInternal,
          {
            scheduleId: claim.scheduleId,
            leaseToken: claim.leaseToken,
            outcome,
            ...(outcome === "continue"
              ? {
                  recipientCursor: page.recipientCursor,
                  periodStartDay: page.periodStartDay,
                  periodEndDay: page.periodEndDay,
                  digestSnapshot: snapshot,
                }
              : null),
            nowMs,
          },
        );
        if (outcome === "continue") continued += 1;
        else completed += 1;
      } catch (error) {
        const errorCode = truncateCommunityWeeklyDigestText(
          error instanceof Error ? error.message : "weekly_digest_failed",
          120,
        ) || "weekly_digest_failed";
        await ctx.runMutation(
          (internal as any).communityWeeklyDigestSchedule
            .settleCommunityWeeklyDigestScheduleInternal,
          {
            scheduleId: claim.scheduleId,
            leaseToken: claim.leaseToken,
            outcome: "retry",
            errorCode,
            nowMs,
          },
        );
        failed += 1;
      }
    }

    return {
      ok: failed === 0,
      communities,
      recipients,
      enqueued,
      deduped,
      suppressed,
      continued,
      completed,
      failed,
    };
  },
});

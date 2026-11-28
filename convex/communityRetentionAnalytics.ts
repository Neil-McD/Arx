// Bounded, manager-only Retention & LTV Analytics query (Slice 4A).
// Reads canonical membership, Board checkpoint, connected-app milestone,
// Distribution Engineer origin, Chief of Staff check-in, and Stripe billing
// records and delegates all math to shared/retentionAnalytics.ts.
import { v } from "convex/values";
import { query } from "./_generated/server";
import { resolveUserIdForAuthenticatedRequest } from "./authActor";
import {
  normalizeAnalyticsRange,
  resolveAnalyticsWindowStartMs,
} from "./communityAdminAnalyticsCore";
import {
  communityMembershipRowIsActive,
  requireCommunityManager,
  resolveCommunityEntryPolicy,
} from "./communityCore";
import {
  readMemberActivityTimestampsInWindow,
  readMemberFirstPostSignalsForAnalytics,
  readStagesForCommunity,
} from "./communityMemberJourney";
import { communityHasProactiveAgentTier } from "./founderInferenceCore";
import {
  computeMemberRevenueSummary,
  evaluateVerifiedSavedMember,
  isAtRiskCoachReason,
  monthlyMrrForPricePoint,
  type PricePointRevenueLike,
  type SubscriptionAuditRevenueLike,
} from "../shared/memberRevenueLedger";
import {
  computeCommunityRetentionAnalytics,
  type CommunityRetentionAnalytics,
  type RetentionCheckpointDescriptor,
  type RetentionMemberInput,
} from "../shared/retentionAnalytics";
import { resolveAcquisitionSource } from "../shared/distributionAttribution";

const DAY_MS = 24 * 60 * 60_000;
const MAX_RETENTION_MEMBERS = 200;
const MAX_AUX_ROWS = 1_000;

export const getCommunityRetentionAnalytics = query({
  args: {
    userId: v.optional(v.id("users")),
    authSubject: v.optional(v.string()),
    communityId: v.id("communities"),
    range: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<CommunityRetentionAnalytics> => {
    const actorUserId = await resolveUserIdForAuthenticatedRequest({
      ctx,
      userId: args.userId,
      authSubject: args.authSubject ?? null,
    });
    const { community } = await requireCommunityManager({
      ctx,
      communityId: args.communityId,
      userId: actorUserId,
    });

    const nowMs = Date.now();
    const range = normalizeAnalyticsRange(args.range);
    const windowStartMs = resolveAnalyticsWindowStartMs({
      range,
      nowMs,
      communityCreatedAt: community.createdAt,
    });
    const ninetyDaysAgoMs = nowMs - 90 * DAY_MS;
    const thirtyDaysAgoMs = nowMs - 30 * DAY_MS;

    const [
      rawMemberships,
      stageConfig,
      journeyCards,
      subscriptions,
      podPayments,
      appGrants,
      sentCoachDrafts90d,
      presenceRows,
      courseRows,
      goalFacts,
      communityDeliveries,
      auditRows,
      hasProactiveAgent,
    ] = await Promise.all([
      ctx.db
        .query("communityMemberships")
        .withIndex("by_community_createdAt", (q) => q.eq("communityId", args.communityId))
        .order("desc")
        .take(MAX_RETENTION_MEMBERS + 1),
      readStagesForCommunity(ctx, args.communityId),
      ctx.db
        .query("communityMemberJourneyCards")
        .withIndex("by_community_user", (q) => q.eq("communityId", args.communityId))
        .take(MAX_AUX_ROWS),
      ctx.db
        .query("communitySubscriptions")
        .withIndex("by_community_status", (q) => q.eq("communityId", args.communityId))
        .take(MAX_AUX_ROWS),
      ctx.db
        .query("communityPodPayments")
        .withIndex("by_community", (q) => q.eq("communityId", args.communityId))
        .take(MAX_AUX_ROWS),
      ctx.db
        .query("communityAppGrants")
        .withIndex("by_community_user", (q) => q.eq("communityId", args.communityId))
        .take(MAX_AUX_ROWS),
      ctx.db
        .query("communityMemberCoachDrafts")
        .withIndex("by_community_status_sentAt", (q) =>
          q
            .eq("communityId", args.communityId)
            .eq("status", "sent")
            .gte("sentAt", ninetyDaysAgoMs),
        )
        .take(MAX_AUX_ROWS),
      ctx.db
        .query("communityPresence")
        .withIndex("by_community_lastSeenAt", (q) => q.eq("communityId", args.communityId))
        .take(MAX_AUX_ROWS),
      ctx.db
        .query("communityCourseProgress")
        .withIndex("by_community_user", (q) => q.eq("communityId", args.communityId))
        .take(MAX_AUX_ROWS),
      ctx.db
        .query("memberFacts")
        .withIndex("by_community_kind", (q) =>
          q.eq("communityId", args.communityId).eq("kind", "goal"),
        )
        .take(MAX_AUX_ROWS),
      ctx.db
        .query("distributionAttributionDeliveries")
        .withIndex("by_community_user", (q) => q.eq("communityId", args.communityId))
        .take(MAX_AUX_ROWS),
      ctx.db
        .query("criticalAuditEvents")
        .withIndex("by_community_createdAt", (q) => q.eq("communityId", args.communityId))
        .order("desc")
        .take(800),
      communityHasProactiveAgentTier(ctx, args.communityId, nowMs),
    ]);

    const ownerKey = String(community.ownerId);
    const nonOwnerMemberships = rawMemberships.filter((row) => String(row.userId) !== ownerKey);
    const isCapped = nonOwnerMemberships.length > MAX_RETENTION_MEMBERS;
    const memberships = nonOwnerMemberships.slice(0, MAX_RETENTION_MEMBERS);
    const sampledUserIds = memberships.map((m) => m.userId);

    // Per-member indexed reads for historical post signals and canonical first lesson completions,
    // so large communities never lose older posts or overwrite first-lesson timestamps with later ones.
    const [postSignalsByUser, firstLessonByUserEntries] = await Promise.all([
      readMemberFirstPostSignalsForAnalytics(ctx, args.communityId, sampledUserIds),
      Promise.all(
        sampledUserIds.map(async (userId) => {
          const earliest = await ctx.db
            .query("communityLessonProgress")
            .withIndex("by_community_user_completedAt", (q) =>
              q.eq("communityId", args.communityId).eq("userId", userId),
            )
            .order("asc")
            .first();
          return [
            String(userId),
            typeof earliest?.completedAt === "number" && Number.isFinite(earliest.completedAt)
              ? earliest.completedAt
              : null,
          ] as const;
        }),
      ),
    ]);
    const firstLessonAtByUser = new Map<string, number | null>(firstLessonByUserEntries);

    // Load referenced price points (deduplicated) for accurate historical LTV.
    const pricePointIds = new Set<string>();
    for (const sub of subscriptions) {
      if (sub.pricePointId) pricePointIds.add(String(sub.pricePointId));
    }
    for (const row of auditRows) {
      if (row.eventType !== "community_subscription_synced" || row.status !== "succeeded") continue;
      const meta =
        row.metadata && typeof row.metadata === "object"
          ? (row.metadata as Record<string, unknown>)
          : {};
      if (typeof meta.pricePointId === "string" && meta.pricePointId.trim()) {
        pricePointIds.add(meta.pricePointId.trim());
      }
    }
    const pricePointById = new Map<string, PricePointRevenueLike>();
    await Promise.all(
      [...pricePointIds].map(async (id) => {
        try {
          const doc = (await ctx.db.get(id as any)) as any;
          if (doc && typeof doc.amountBaseUnits === "number") {
            pricePointById.set(id, {
              amountBaseUnits: doc.amountBaseUnits,
              currency: String(doc.currency ?? "USD"),
              currencyDecimals: Number(doc.currencyDecimals ?? 2),
              billingPeriod: String(doc.billingPeriod ?? "monthly"),
            });
          }
        } catch {
          // Ignore invalid/archived price point ids.
        }
      }),
    );

    const cardByUser = new Map<string, any>();
    for (const card of journeyCards) cardByUser.set(String(card.userId), card);

    const subsByUser = new Map<string, any[]>();
    for (const sub of subscriptions) {
      const key = String(sub.userId);
      const list = subsByUser.get(key) ?? [];
      list.push(sub);
      subsByUser.set(key, list);
    }

    const podsByUser = new Map<string, any[]>();
    for (const pod of podPayments) {
      const key = String(pod.userId);
      const list = podsByUser.get(key) ?? [];
      list.push(pod);
      podsByUser.set(key, list);
    }

    const appGrantsByUser = new Map<string, any[]>();
    for (const grant of appGrants) {
      if (!grant.userId) continue;
      const key = String(grant.userId);
      const list = appGrantsByUser.get(key) ?? [];
      list.push(grant);
      appGrantsByUser.set(key, list);
    }

    const presenceByUser = new Map<string, any>();
    for (const row of presenceRows) presenceByUser.set(String(row.userId), row);

    const courseByUser = new Map<string, { lessonsDoneCount: number; firstLessonAtMs: number | null; latestLessonAtMs: number | null }>();
    for (const row of courseRows) {
      const key = String(row.userId);
      const count = Array.isArray(row.doneResourceIds) ? row.doneResourceIds.length : 0;
      if (count <= 0) continue;
      const completedAt =
        typeof row.lastCompletedAt === "number" && Number.isFinite(row.lastCompletedAt)
          ? row.lastCompletedAt
          : null;
      const cur = courseByUser.get(key) ?? {
        lessonsDoneCount: 0,
        firstLessonAtMs: null,
        latestLessonAtMs: null,
      };
      cur.lessonsDoneCount += count;
      if (completedAt !== null) {
        if (cur.firstLessonAtMs === null || completedAt < cur.firstLessonAtMs) {
          cur.firstLessonAtMs = completedAt;
        }
        if (cur.latestLessonAtMs === null || completedAt > cur.latestLessonAtMs) {
          cur.latestLessonAtMs = completedAt;
        }
      }
      courseByUser.set(key, cur);
    }

    const goalByUser = new Map<string, number>();
    for (const fact of goalFacts) {
      if (fact.consentState !== "approved") continue;
      const key = String(fact.userId);
      const ts = Number(fact.createdAt ?? fact.updatedAt ?? 0);
      const existing = goalByUser.get(key);
      if (existing === undefined || (ts > 0 && ts < existing)) {
        goalByUser.set(key, ts);
      }
    }

    const deDeliveryUsers = new Set<string>();
    for (const row of communityDeliveries) {
      if (row.clickId || row.anonymousId) deDeliveryUsers.add(String(row.userId));
    }

    const auditByUser = new Map<string, SubscriptionAuditRevenueLike[]>();
    for (const row of auditRows) {
      if (row.eventType !== "community_subscription_synced" || row.status !== "succeeded") continue;
      if (!row.subjectUserId) continue;
      const key = String(row.subjectUserId);
      const meta =
        row.metadata && typeof row.metadata === "object"
          ? (row.metadata as Record<string, unknown>)
          : {};
      const periodStart =
        typeof meta.currentPeriodStartAt === "number" && Number.isFinite(meta.currentPeriodStartAt)
          ? meta.currentPeriodStartAt
          : null;
      const pricePoint =
        typeof meta.pricePointId === "string"
          ? (pricePointById.get(meta.pricePointId.trim()) ?? null)
          : null;
      const list = auditByUser.get(key) ?? [];
      list.push({
        subscriptionStatus:
          typeof meta.subscriptionStatus === "string"
            ? meta.subscriptionStatus
            : typeof meta.communitySubscriptionStatus === "string"
              ? meta.communitySubscriptionStatus
              : null,
        currentPeriodStartAt: periodStart,
        pricePoint,
        createdAt: Number(row.createdAt ?? 0),
      });
      auditByUser.set(key, list);
    }

    const earliestCoachSent30ByUser = new Map<string, number>();
    const earliestCoachSent90ByUser = new Map<string, number>();
    for (const draft of sentCoachDrafts90d) {
      if (!isAtRiskCoachReason(draft.reason)) continue;
      const sentAt = typeof draft.sentAt === "number" ? draft.sentAt : null;
      if (sentAt === null || !Number.isFinite(sentAt)) continue;
      const key = String(draft.memberUserId);
      const cur90 = earliestCoachSent90ByUser.get(key);
      if (cur90 === undefined || sentAt < cur90) earliestCoachSent90ByUser.set(key, sentAt);
      if (sentAt >= thirtyDaysAgoMs) {
        const cur30 = earliestCoachSent30ByUser.get(key);
        if (cur30 === undefined || sentAt < cur30) earliestCoachSent30ByUser.set(key, sentAt);
      }
    }

    const checkpoints: RetentionCheckpointDescriptor[] = stageConfig.stages.flatMap((stage) =>
      stage.checkpoints.map((cp) => ({
        ...cp,
        stageName: stage.name,
      })),
    );

    const memberInputs: RetentionMemberInput[] = await Promise.all(
      memberships.map(async (membership) => {
        const userKey = String(membership.userId);
        const card = cardByUser.get(userKey) ?? null;
        const posts = postSignalsByUser.get(userKey) ?? {
          postsCount: 0,
          firstPostAtMs: null,
        };
        const courses = courseByUser.get(userKey) ?? {
          lessonsDoneCount: 0,
          firstLessonAtMs: null,
          latestLessonAtMs: null,
        };
        const canonicalFirstLessonAtMs = firstLessonAtByUser.get(userKey) ?? null;
        const lessonsDoneCount = Math.max(
          courses.lessonsDoneCount,
          canonicalFirstLessonAtMs !== null ? 1 : 0,
        );
        const firstLessonAtMs = canonicalFirstLessonAtMs ?? courses.firstLessonAtMs;
        const goalAt = goalByUser.get(userKey) ?? null;
        const presence = presenceByUser.get(userKey) ?? null;
        const presenceSeenAt =
          presence && (presence.activeUntil != null || presence.lastSeenAt > presence.createdAt)
            ? Number(presence.lastSeenAt)
            : null;
        const lastAppActivityAtMs =
          typeof card?.lastAppActivityAt === "number" && Number.isFinite(card.lastAppActivityAt)
            ? card.lastAppActivityAt
            : null;
        const completedMilestones = Array.isArray(card?.completedMilestones)
          ? card.completedMilestones.map((m: any) => ({
              key: String(m.key),
              completedAt: Number(m.completedAt ?? 0),
              source: typeof m.source === "string" ? m.source : undefined,
            }))
          : [];

        const userSubs = (subsByUser.get(userKey) ?? []).map((sub: any) => ({
          status: String(sub.status ?? ""),
          pricePoint: sub.pricePointId
            ? (pricePointById.get(String(sub.pricePointId)) ?? null)
            : null,
          createdAt: Number(sub.createdAt ?? 0),
          updatedAt: Number(sub.updatedAt ?? sub.createdAt ?? 0),
          currentPeriodStartAt: sub.currentPeriodStartAt ?? null,
          currentPeriodEndAt: sub.currentPeriodEndAt ?? null,
          endedAt: sub.endedAt ?? null,
          cancelAtPeriodEnd: Boolean(sub.cancelAtPeriodEnd),
          riskAccessState: sub.riskAccessState ?? null,
        }));
        const userPods = (podsByUser.get(userKey) ?? []).map((pod: any) => ({
          status: String(pod.status ?? ""),
          amountBaseUnits: Number(pod.amountBaseUnits ?? 0),
          currency: String(pod.currency ?? "USD"),
          createdAt: Number(pod.createdAt ?? 0),
          grantedAt: pod.grantedAt ?? null,
          refundDue: Boolean(pod.refundDue),
        }));

        const userAppGrants = (appGrantsByUser.get(userKey) ?? []).map((grant: any) => ({
          active: Boolean(grant.active),
          amountBaseUnits: grant.amountBaseUnits,
          currency: grant.currency,
          currencyDecimals: grant.currencyDecimals,
          billingInterval: grant.billingInterval,
          createdAt: Number(grant.createdAt ?? 0),
          startedAt: grant.startedAt ?? null,
          endedAt: grant.endedAt ?? null,
          updatedAt: grant.updatedAt ?? null,
        }));

        const revenue = computeMemberRevenueSummary({
          membership: {
            state: membership.state,
            createdAt: membership.createdAt,
            activatedAt: membership.activatedAt,
            revokedAt: membership.revokedAt,
            revokedReason: membership.revokedReason,
          },
          subscriptions: userSubs,
          subscriptionAuditEvents: auditByUser.get(userKey) ?? [],
          podPayments: userPods,
          externalAppGrants: userAppGrants,
          nowMs,
        });

        const sortedSubs = [...userSubs].sort((a, b) => b.updatedAt - a.updatedAt);
        const primarySub = sortedSubs.find((s) => s.status !== "ended") ?? sortedSubs[0] ?? null;
        const primarySubArg =
          primarySub && primarySub.pricePoint
            ? {
                status: primarySub.status,
                currentPeriodStartAt: primarySub.currentPeriodStartAt,
                riskAccessState: primarySub.riskAccessState,
                activeMrrBaseUnits: monthlyMrrForPricePoint(primarySub.pricePoint),
                currency: primarySub.pricePoint.currency,
                currencyDecimals: primarySub.pricePoint.currencyDecimals,
              }
            : null;

        const baseActivityTimestamps = [
          presenceSeenAt,
          posts.firstPostAtMs,
          firstLessonAtMs,
          courses.latestLessonAtMs,
          lastAppActivityAtMs,
          ...completedMilestones.map((m: { completedAt: number }) => m.completedAt),
        ];

        const sent30 = earliestCoachSent30ByUser.get(userKey) ?? null;
        const sent90 = earliestCoachSent90ByUser.get(userKey) ?? null;
        const renewedAt =
          primarySubArg &&
          typeof primarySubArg.currentPeriodStartAt === "number" &&
          Number.isFinite(primarySubArg.currentPeriodStartAt)
            ? primarySubArg.currentPeriodStartAt
            : null;

        // Query exact in-window activity between check-in and renewal so staying active
        // AFTER renewal never erases a previously verified save.
        const [inWindow30, inWindow90] = await Promise.all([
          sent30 !== null && renewedAt !== null && renewedAt > sent30
            ? readMemberActivityTimestampsInWindow(ctx, {
                communityId: args.communityId,
                userId: membership.userId,
                afterMs: sent30,
                throughMs: renewedAt,
              })
            : Promise.resolve([] as number[]),
          sent90 !== null && renewedAt !== null && renewedAt > sent90
            ? sent90 === sent30
              ? Promise.resolve(null)
              : readMemberActivityTimestampsInWindow(ctx, {
                  communityId: args.communityId,
                  userId: membership.userId,
                  afterMs: sent90,
                  throughMs: renewedAt,
                })
            : Promise.resolve([] as number[]),
        ]);
        const resolvedWindow90 = inWindow90 === null ? inWindow30 : inWindow90;

        const verifiedSave30d = evaluateVerifiedSavedMember({
          earliestAtRiskSentAtMs: sent30,
          activityTimestampsMs: [...baseActivityTimestamps, ...inWindow30],
          subscription: primarySubArg,
          membershipRevokedReason: membership.revokedReason,
        });
        const verifiedSave90d = evaluateVerifiedSavedMember({
          earliestAtRiskSentAtMs: sent90,
          activityTimestampsMs: [...baseActivityTimestamps, ...resolvedWindow90],
          subscription: primarySubArg,
          membershipRevokedReason: membership.revokedReason,
        });

        const resolvedSource = resolveAcquisitionSource({
          anonymousId: membership.attributionAnonymousId,
          clickId: membership.attributionClickId,
          hasDeDelivery: deDeliveryUsers.has(userKey),
          utmSource: membership.attributionUtmSource,
          utmMedium: membership.attributionUtmMedium,
          utmCampaign: membership.attributionUtmCampaign,
          utmContent: membership.attributionUtmContent,
          referrerHost: membership.attributionReferrerHost,
          referralCode: membership.attributionReferralCode,
        });

        return {
          userId: userKey,
          joinedAtMs: Number(membership.activatedAt ?? membership.createdAt ?? nowMs),
          isActive: communityMembershipRowIsActive(membership),
          source: resolvedSource.source,
          sourceLabel: resolvedSource.label,
          postsCount: posts.postsCount,
          firstPostAtMs: posts.firstPostAtMs,
          lessonsDoneCount,
          firstLessonAtMs,
          hasSharedGoal: goalAt !== null,
          firstGoalAtMs: goalAt,
          lastAppActivityAtMs,
          completedMilestones,
          revenue,
          verifiedSave30d,
          verifiedSave90d,
        };
      }),
    );

    const hasPaidPlans =
      resolveCommunityEntryPolicy(community) === "paid_subscription" ||
      subscriptions.length > 0 ||
      podPayments.some((p) => typeof p.grantedAt === "number") ||
      appGrants.some((g) => typeof g.amountBaseUnits === "number" && g.amountBaseUnits > 0);

    return computeCommunityRetentionAnalytics({
      range,
      windowStartMs,
      nowMs,
      checkpoints,
      members: memberInputs,
      hasPaidPlans,
      hasProactiveAgent,
      isCapped,
    });
  },
});

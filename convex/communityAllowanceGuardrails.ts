// Community AI Allowance Guardrails & Founder Alerts:
// 1) Leaf helper `readActiveCommunityAllowanceState` checks the authoritative
//    billing-cycle ledger (Stripe founderUsageCycles or operatorGrantUsageCycles)
//    so background AI (heartbeats & reply drafts) pauses at 90% to reserve the
//    final 10% for live human chats, @mentions, and the Daily Founder Brief.
// 2) Bounded paginated sweep sends calm, idempotent 80% & 100% founder alerts
//    (in private Guide thread + email) once per billing cycle with 30-day win-back context.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { communityAgentIsOn } from "./communityApps";
import { deliverAssistantMessageToMemberCommunityThread } from "./threads";
import { enqueueSingleEmailJob } from "./email";
import { operatorGrantUsageCycleKey } from "./operatorGrantUsageCore";
import { readCanonicalPublicAppOrigin } from "./publicAppUrl";
import { communityIsActive, normalizeCommunityLifecycle } from "../shared/communityLifecycle";
import { POLYNET_FOUNDER_PLAN_INCLUDED_COST_MICROS } from "../shared/founderPlan";
import { countReengagedMembersFromSentChecks } from "../shared/agentRoiSummary";
import {
  buildFounderAllowanceAlertCopy,
  computeAllowancePercentUsed,
  formatAllowanceResetDate,
  resolveAllowanceAlertMilestone,
  shouldPauseBackgroundAiForAllowance,
} from "../shared/allowanceGuardrails";

const internalRefs = internal as any;
const DAY_MS = 24 * 60 * 60_000;
const ALERT_PAGE_SIZE = 50;
const MAX_ALERT_PAGES_PER_RUN = 20;
const REENGAGEMENT_DRAFT_SCAN_LIMIT = 60;
const REENGAGEMENT_MEMBER_CHECK_CAP = 25;

export type ActiveCommunityAllowanceState = {
  cycleKey: string;
  cycleStartAt: number;
  cycleEndAt: number;
  settledMicros: number;
  allowanceMicros: number;
  percentUsed: number;
  backgroundAiPaused: boolean;
  exhausted: boolean;
};

// Authoritative cycle lookup: open Stripe founderUsageCycle first, then active
// operatorGrantUsageCycle for the current UTC month. Returns null when no cycle
// ledger row exists yet (e.g., unfunded/free or brand-new before first run).
export async function readActiveCommunityAllowanceState(
  ctx: any,
  communityId: Id<"communities">,
  nowMs: number,
): Promise<ActiveCommunityAllowanceState | null> {
  const [openFounderCycle, operatorCycle] = await Promise.all([
    ctx.db
      .query("founderUsageCycles")
      .withIndex("by_community_status", (q: any) =>
        q.eq("communityId", communityId).eq("status", "open"),
      )
      .order("desc")
      .first(),
    ctx.db
      .query("operatorGrantUsageCycles")
      .withIndex("by_cycle_key", (q: any) =>
        q.eq("cycleKey", operatorGrantUsageCycleKey(communityId, nowMs)),
      )
      .first(),
  ]);

  const activeCycle =
    openFounderCycle &&
    typeof openFounderCycle.cycleEndAt === "number" &&
    openFounderCycle.cycleEndAt > nowMs
      ? openFounderCycle
      : operatorCycle &&
          typeof operatorCycle.cycleEndAt === "number" &&
          operatorCycle.cycleEndAt > nowMs
        ? operatorCycle
        : null;
  if (!activeCycle) return null;

  const allowanceMicros = Math.max(
    0,
    Math.floor(Number(activeCycle.includedCostMicros ?? POLYNET_FOUNDER_PLAN_INCLUDED_COST_MICROS)),
  );
  const settledMicros = Math.max(0, Math.floor(Number(activeCycle.settledCostMicros ?? 0)));
  const maxReservation = Math.max(0, Math.floor(Number((activeCycle as any).maxRunReservationCostMicros ?? 0)));
  const exhausted =
    allowanceMicros > 0 &&
    (settledMicros >= allowanceMicros ||
      (maxReservation > 0 && settledMicros + maxReservation > allowanceMicros));
  return {
    cycleKey: String(activeCycle.cycleKey),
    cycleStartAt: Number(activeCycle.cycleStartAt),
    cycleEndAt: Number(activeCycle.cycleEndAt),
    settledMicros,
    allowanceMicros,
    percentUsed: computeAllowancePercentUsed(settledMicros, allowanceMicros),
    backgroundAiPaused:
      exhausted || shouldPauseBackgroundAiForAllowance({ settledMicros, allowanceMicros }),
    exhausted,
  };
}

async function readCompactReengagement30d(
  ctx: any,
  communityId: Id<"communities">,
  nowMs: number,
): Promise<{ reengagedCount: number; contactedCount: number }> {
  const cutoffMs = nowMs - 30 * DAY_MS;
  const sentRows = await ctx.db
    .query("communityMemberCoachDrafts")
    .withIndex("by_community_status_sentAt", (q: any) =>
      q.eq("communityId", communityId).eq("status", "sent").gte("sentAt", cutoffMs),
    )
    .order("desc")
    .take(REENGAGEMENT_DRAFT_SCAN_LIMIT);
  const sentChecks = sentRows
    .map((row: any) => ({
      memberUserId: String(row.memberUserId),
      rawMemberUserId: row.memberUserId as Id<"users">,
      sentAt: Number(row.sentAt ?? row.createdAt ?? 0),
    }))
    .filter((entry: any) => entry.sentAt > 0);
  if (sentChecks.length === 0) return { reengagedCount: 0, contactedCount: 0 };

  const uniqueMembers = new Map<string, Id<"users">>();
  for (const check of sentChecks) {
    if (uniqueMembers.has(check.memberUserId)) continue;
    if (uniqueMembers.size >= REENGAGEMENT_MEMBER_CHECK_CAP) break;
    uniqueMembers.set(check.memberUserId, check.rawMemberUserId);
  }

  const latestActivityByMember = new Map<string, number | null>();
  await Promise.all(
    [...uniqueMembers.entries()].map(async ([key, memberUserId]) => {
      const [latestRoot, latestReply, latestLesson, agentChannel] = await Promise.all([
        ctx.db
          .query("communityInteractionRoots")
          .withIndex("by_community_actorUser_createdAt", (q: any) =>
            q.eq("communityId", communityId).eq("actorUserId", memberUserId),
          )
          .order("desc")
          .first(),
        ctx.db
          .query("communityInteractionReplies")
          .withIndex("by_community_actorUser_createdAt", (q: any) =>
            q.eq("communityId", communityId).eq("actorUserId", memberUserId),
          )
          .order("desc")
          .first(),
        ctx.db
          .query("communityLessonProgress")
          .withIndex("by_community_user_completedAt", (q: any) =>
            q.eq("communityId", communityId).eq("userId", memberUserId),
          )
          .order("desc")
          .first(),
        ctx.db
          .query("memberAgentChannels")
          .withIndex("by_owner_scope_community", (q: any) =>
            q.eq("ownerId", memberUserId).eq("scopeKey", "community").eq("communityId", communityId),
          )
          .unique(),
      ]);
      const best = Math.max(
        latestRoot?.status === "live" ? Number(latestRoot.createdAt ?? 0) : 0,
        latestReply?.status === "live" ? Number(latestReply.createdAt ?? 0) : 0,
        Number(latestLesson?.completedAt ?? 0),
        Number(agentChannel?.updatedAt ?? 0),
      );
      latestActivityByMember.set(key, best > 0 ? best : null);
    }),
  );

  return countReengagedMembersFromSentChecks({
    sentChecks: sentChecks.filter((entry: any) => uniqueMembers.has(entry.memberUserId)),
    latestActivityByMember,
  });
}

// Checks one bounded page of enrolled communities and delivers idempotent
// 80% / 100% allowance notices (in the founder's private Guide thread + email).
export const processFounderAllowanceAlertsPageInternal = internalMutation({
  args: {
    nowMs: v.number(),
    cursor: v.optional(v.union(v.string(), v.null())),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const numItems = Math.max(1, Math.min(100, Math.floor(args.pageSize ?? ALERT_PAGE_SIZE)));
    const page = await ctx.db
      .query("communityMemberCoachSettings")
      .paginate({ numItems, cursor: args.cursor ?? null });

    let origin = "https://www.polynet.ai";
    try {
      origin = readCanonicalPublicAppOrigin();
    } catch {
      // fallback to canonical public origin
    }

    let alertsSent = 0;
    const communityCache = new Map<string, any>();

    for (const settings of page.page) {
      const state = await readActiveCommunityAllowanceState(ctx, settings.communityId, args.nowMs);
      if (!state) continue;

      const lastNotifiedPercent =
        settings.allowanceAlertCycleKey === state.cycleKey
          ? Number(settings.allowanceAlertNotifiedPercent ?? 0)
          : 0;
      const milestone = resolveAllowanceAlertMilestone({
        settledMicros: state.settledMicros,
        allowanceMicros: state.allowanceMicros,
        lastNotifiedPercent,
        exhausted: state.exhausted,
      });
      if (!milestone) continue;

      const community: any = await ctx.db.get(settings.communityId);
      if (!community || !communityIsActive(community) || !(await communityAgentIsOn(ctx, settings.communityId))) {
        continue;
      }

      const reengagement = await readCompactReengagement30d(ctx, settings.communityId, args.nowMs);
      const communityName = String(community.name ?? "your community").trim() || "your community";
      const slug = String(community.slug ?? "").trim();
      const copy = buildFounderAllowanceAlertCopy({
        milestone,
        communityName,
        settledMicros: state.settledMicros,
        allowanceMicros: state.allowanceMicros,
        resetDateLabel: formatAllowanceResetDate(state.cycleEndAt),
        reengaged30d: reengagement.reengagedCount,
        contacted30d: reengagement.contactedCount,
      });

      const dedupeKey = `founder-allowance:${String(settings.communityId)}:${state.cycleKey}:${milestone}`;
      const lifecycle = normalizeCommunityLifecycle(community);

      // Persist the notified milestone atomically alongside delivery so retries never double-alert.
      await ctx.db.patch(settings._id, {
        allowanceAlertCycleKey: state.cycleKey,
        allowanceAlertNotifiedPercent: milestone,
        updatedAt: args.nowMs,
      });

      await deliverAssistantMessageToMemberCommunityThread(ctx, {
        communityId: settings.communityId,
        memberUserId: community.ownerId,
        messageKey: dedupeKey,
        contentJson: {
          text: copy.threadMarkdown,
          meta: {
            kind: "founder_allowance_notice",
            milestone,
            cycle_key: state.cycleKey,
          },
        },
      });

      await enqueueSingleEmailJob(
        ctx,
        {
          kind: "founder_allowance_notice",
          communityId: settings.communityId,
          communityLifecycleGeneration: lifecycle.generation,
          recipientUserId: community.ownerId,
          templateKey: "founder_allowance_notice",
          payload: {
            communityName,
            subject: copy.subject,
            headline: copy.headline,
            bodyText: copy.bodyText,
            actionUrl: slug ? `${origin}/c/${encodeURIComponent(slug)}/settings?pane=agent` : origin,
          },
          dedupeKey,
          nowMs: args.nowMs,
        },
        communityCache,
      );

      alertsSent += 1;
    }

    return {
      alertsSent,
      isDone: page.isDone,
      continueCursor: page.isDone ? null : page.continueCursor,
    };
  },
});

export async function runFounderAllowanceAlertsForAction(ctx: any, nowMs: number) {
  let cursor: string | null = null;
  let totalAlertsSent = 0;
  for (let page = 0; page < MAX_ALERT_PAGES_PER_RUN; page += 1) {
    const res: { alertsSent: number; isDone: boolean; continueCursor: string | null } =
      await ctx.runMutation(
        internalRefs.communityAllowanceGuardrails.processFounderAllowanceAlertsPageInternal,
        { nowMs, cursor },
      );
    totalAlertsSent += res.alertsSent;
    if (res.isDone || !res.continueCursor) break;
    cursor = res.continueCursor;
  }
  return { alertsSent: totalAlertsSent };
}

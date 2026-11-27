// Pure, deterministic Retention & LTV Analytics engine (Slice 4A).
// Computes the 4 actionable retention answers from canonical community,
// connected-app, attribution, and Stripe billing inputs:
//   1. Activation rate & median Time-to-First-Value (TTFV)
//   2. Milestone-to-Retention Lift (with minimum sample guardrails)
//   3. LTV & Retention by Acquisition Source (Distribution Engineer vs Direct)
//   4. Chief of Staff Verified Saved Revenue (30d & 90d)
import {
  evaluateStageCheckpoints,
  type JourneyCheckpointKind,
  type JourneyStageCheckpoint,
} from "./communityMemberJourney";
import type { MemberRevenueSummary, VerifiedSaveResult } from "./memberRevenueLedger";

const DAY_MS = 24 * 60 * 60_000;
export const MIN_LIFT_SAMPLE_SIZE = 3;

export type RetentionAnalyticsSource = "distribution_engineer" | "direct";

export type RetentionCheckpointDescriptor = JourneyStageCheckpoint & {
  stageName: string;
};

export type RetentionMemberInput = {
  userId: string;
  joinedAtMs: number;
  isActive: boolean;
  source: RetentionAnalyticsSource;
  postsCount: number;
  firstPostAtMs: number | null;
  lessonsDoneCount: number;
  firstLessonAtMs: number | null;
  hasSharedGoal: boolean;
  firstGoalAtMs: number | null;
  lastAppActivityAtMs: number | null;
  completedMilestones: ReadonlyArray<{
    key: string;
    completedAt: number;
    source?: string;
  }>;
  revenue: MemberRevenueSummary;
  verifiedSave30d: VerifiedSaveResult;
  verifiedSave90d: VerifiedSaveResult;
};

export type RetentionActivationSummary = {
  cohort_members: number;
  activated_members: number;
  activation_rate: number | null;
  median_ttfv_days: number | null;
  using_activity_fallback: boolean;
};

export type RetentionMilestoneLiftRow = {
  key: string;
  label: string;
  kind: JourneyCheckpointKind;
  stage_name: string;
  completed_count: number;
  completed_retained_count: number;
  completed_retention_rate: number | null;
  completed_avg_ltv_base_units: number | null;
  not_completed_count: number;
  not_completed_retained_count: number;
  not_completed_retention_rate: number | null;
  not_completed_avg_ltv_base_units: number | null;
  retention_lift_multiple: number | null;
};

export type RetentionSourceRow = {
  source: RetentionAnalyticsSource;
  label: string;
  members: number;
  activated_members: number;
  activation_rate: number | null;
  retained_members: number;
  retention_rate: number | null;
  paid_members: number;
  avg_realized_ltv_base_units: number | null;
  total_realized_ltv_base_units: number | null;
  avg_months_retained: number | null;
};

export type RetentionSavedRevenueSummary = {
  show: boolean;
  saved_mrr_30d_base_units: number;
  saved_members_30d: number;
  saved_mrr_90d_base_units: number;
  saved_members_90d: number;
  currency: string | null;
  currency_decimals: number;
  mixed_currency: boolean;
};

export type CommunityRetentionAnalytics = {
  range: string;
  sampled_members: number;
  is_capped: boolean;
  has_paid_plans: boolean;
  currency: string | null;
  currency_decimals: number;
  mixed_currency: boolean;
  activation: RetentionActivationSummary;
  milestone_lift: RetentionMilestoneLiftRow[];
  by_source: RetentionSourceRow[];
  saved_revenue: RetentionSavedRevenueSummary;
};

export function medianNumber(values: readonly number[]): number | null {
  const clean = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (clean.length === 0) return null;
  const mid = Math.floor(clean.length / 2);
  const raw = clean.length % 2 === 1 ? clean[mid]! : (clean[mid - 1]! + clean[mid]!) / 2;
  return Math.round(raw * 10) / 10;
}

function roundOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function resolveMemberFirstValueAtMs(
  member: RetentionMemberInput,
  checkpoints: readonly RetentionCheckpointDescriptor[],
): { activated: boolean; firstValueAtMs: number | null; doneKeys: Set<string> } {
  const evaluated = evaluateStageCheckpoints({
    checkpoints,
    completedMilestones: member.completedMilestones,
    postsCount: member.postsCount,
    lessonsDoneCount: member.lessonsDoneCount,
    hasSharedGoal: member.hasSharedGoal,
  });
  const doneKeys = new Set<string>();
  const completionTimestamps: number[] = [];

  for (const cp of evaluated) {
    if (!cp.done) continue;
    doneKeys.add(cp.key);
    if (typeof cp.completedAtMs === "number" && cp.completedAtMs > 0) {
      completionTimestamps.push(cp.completedAtMs);
    } else if (cp.kind === "first_post" || cp.kind === "regular_posts") {
      if (member.firstPostAtMs && member.firstPostAtMs > 0) {
        completionTimestamps.push(member.firstPostAtMs);
      }
    } else if (cp.kind === "first_lesson") {
      if (member.firstLessonAtMs && member.firstLessonAtMs > 0) {
        completionTimestamps.push(member.firstLessonAtMs);
      }
    } else if (cp.kind === "shared_goal") {
      if (member.firstGoalAtMs && member.firstGoalAtMs > 0) {
        completionTimestamps.push(member.firstGoalAtMs);
      }
    }
  }

  // Fallback when a community hasn't configured any Board checkpoints yet:
  // count first meaningful participation (post, lesson, shared goal, or connected-app activity).
  if (checkpoints.length === 0) {
    const fallbackTimes = [
      member.firstPostAtMs,
      member.firstLessonAtMs,
      member.firstGoalAtMs,
      member.lastAppActivityAtMs,
      ...member.completedMilestones.map((m) => m.completedAt),
    ].filter((ts): ts is number => typeof ts === "number" && Number.isFinite(ts) && ts > 0);
    const activated =
      member.postsCount > 0 ||
      member.lessonsDoneCount > 0 ||
      member.hasSharedGoal ||
      fallbackTimes.length > 0;
    const validAfterJoin = fallbackTimes.filter((ts) => ts >= member.joinedAtMs - DAY_MS);
    const firstAt =
      validAfterJoin.length > 0
        ? Math.min(...validAfterJoin)
        : fallbackTimes.length > 0
          ? Math.min(...fallbackTimes)
          : null;
    return { activated, firstValueAtMs: firstAt, doneKeys };
  }

  const activated = doneKeys.size > 0;
  const validAfterJoin = completionTimestamps.filter((ts) => ts >= member.joinedAtMs - DAY_MS);
  const firstValueAtMs =
    validAfterJoin.length > 0
      ? Math.min(...validAfterJoin)
      : completionTimestamps.length > 0
        ? Math.min(...completionTimestamps)
        : null;
  return { activated, firstValueAtMs, doneKeys };
}

export function computeCommunityRetentionAnalytics(args: {
  range: string;
  windowStartMs: number;
  nowMs: number;
  checkpoints: readonly RetentionCheckpointDescriptor[];
  members: readonly RetentionMemberInput[];
  hasPaidPlans: boolean;
  hasProactiveAgent: boolean;
  isCapped?: boolean;
}): CommunityRetentionAnalytics {
  const uniqueCheckpoints: RetentionCheckpointDescriptor[] = [];
  const seenKeys = new Set<string>();
  for (const cp of args.checkpoints) {
    if (!cp.key || seenKeys.has(cp.key)) continue;
    seenKeys.add(cp.key);
    uniqueCheckpoints.push(cp);
  }

  let currency: string | null = null;
  let currencyDecimals = 2;
  let mixedCurrency = false;
  let observedPaidMember = false;

  const trackCurrency = (rawCurrency: string | null | undefined, decimals: number) => {
    const clean = String(rawCurrency ?? "").trim().toUpperCase();
    if (!clean) return;
    if (currency && currency !== clean) {
      mixedCurrency = true;
      return;
    }
    if (!currency) {
      currency = clean;
      currencyDecimals = Math.max(0, Math.floor(decimals));
    }
  };

  const memberEval = args.members.map((member) => {
    if (member.revenue.mixed_currency) mixedCurrency = true;
    if (member.revenue.realized_ltv_base_units > 0 || member.revenue.active_mrr_base_units > 0) {
      observedPaidMember = true;
      trackCurrency(member.revenue.currency, member.revenue.currency_decimals);
    }
    const activation = resolveMemberFirstValueAtMs(member, uniqueCheckpoints);
    return { member, ...activation };
  });

  const hasPaidPlans = args.hasPaidPlans || observedPaidMember;
  const cohort = memberEval.filter((entry) => entry.member.joinedAtMs >= args.windowStartMs);

  // 1. Activation & Median Time-to-First-Value
  let activatedCohortCount = 0;
  const ttfvDays: number[] = [];
  for (const entry of cohort) {
    if (!entry.activated) continue;
    activatedCohortCount += 1;
    if (entry.firstValueAtMs !== null) {
      const elapsedDays = Math.max(0, (entry.firstValueAtMs - entry.member.joinedAtMs) / DAY_MS);
      ttfvDays.push(elapsedDays);
    }
  }
  const activation: RetentionActivationSummary = {
    cohort_members: cohort.length,
    activated_members: activatedCohortCount,
    activation_rate: cohort.length > 0 ? activatedCohortCount / cohort.length : null,
    median_ttfv_days: medianNumber(ttfvDays),
    using_activity_fallback: uniqueCheckpoints.length === 0,
  };

  // 2. Milestone-to-Retention Lift (evaluated across all sampled members for statistical power)
  const milestoneLift: RetentionMilestoneLiftRow[] = uniqueCheckpoints.map((cp) => {
    let completedCount = 0;
    let completedRetained = 0;
    let completedLtvSum = 0;
    let completedPaidCount = 0;

    let notCompletedCount = 0;
    let notCompletedRetained = 0;
    let notCompletedLtvSum = 0;
    let notCompletedPaidCount = 0;

    for (const entry of memberEval) {
      const done = entry.doneKeys.has(cp.key);
      const ltv = !mixedCurrency ? entry.member.revenue.realized_ltv_base_units : 0;
      const isPaid = !mixedCurrency && ltv > 0;
      if (done) {
        completedCount += 1;
        if (entry.member.isActive) completedRetained += 1;
        if (isPaid) {
          completedPaidCount += 1;
          completedLtvSum += ltv;
        }
      } else {
        notCompletedCount += 1;
        if (entry.member.isActive) notCompletedRetained += 1;
        if (isPaid) {
          notCompletedPaidCount += 1;
          notCompletedLtvSum += ltv;
        }
      }
    }

    const completedRate = completedCount > 0 ? completedRetained / completedCount : null;
    const notCompletedRate = notCompletedCount > 0 ? notCompletedRetained / notCompletedCount : null;
    const liftMultiple =
      completedCount >= MIN_LIFT_SAMPLE_SIZE &&
      notCompletedCount >= MIN_LIFT_SAMPLE_SIZE &&
      completedRate !== null &&
      notCompletedRate !== null &&
      notCompletedRate > 0
        ? roundOneDecimal(completedRate / notCompletedRate)
        : null;

    return {
      key: cp.key,
      label: cp.label,
      kind: cp.kind,
      stage_name: cp.stageName,
      completed_count: completedCount,
      completed_retained_count: completedRetained,
      completed_retention_rate: completedRate,
      completed_avg_ltv_base_units:
        hasPaidPlans && !mixedCurrency && completedPaidCount > 0
          ? Math.round(completedLtvSum / completedPaidCount)
          : null,
      not_completed_count: notCompletedCount,
      not_completed_retained_count: notCompletedRetained,
      not_completed_retention_rate: notCompletedRate,
      not_completed_avg_ltv_base_units:
        hasPaidPlans && !mixedCurrency && notCompletedPaidCount > 0
          ? Math.round(notCompletedLtvSum / notCompletedPaidCount)
          : null,
      retention_lift_multiple: liftMultiple,
    };
  });

  milestoneLift.sort(
    (a, b) =>
      (b.retention_lift_multiple ?? -1) - (a.retention_lift_multiple ?? -1) ||
      b.completed_count - a.completed_count,
  );

  // 3. LTV & Retention by Acquisition Source (evaluated on selected window cohort)
  const sourceLabels: Record<RetentionAnalyticsSource, string> = {
    distribution_engineer: "Distribution Engineer",
    direct: "Direct & organic",
  };
  const bySource: RetentionSourceRow[] = (
    ["distribution_engineer", "direct"] as const
  ).map((source) => {
    const rows = cohort.filter((entry) => entry.member.source === source);
    let activatedCount = 0;
    let retainedCount = 0;
    let paidCount = 0;
    let ltvSum = 0;
    let monthsSum = 0;

    for (const entry of rows) {
      if (entry.activated) activatedCount += 1;
      if (entry.member.isActive) retainedCount += 1;
      monthsSum += entry.member.revenue.months_retained;
      if (!mixedCurrency && entry.member.revenue.realized_ltv_base_units > 0) {
        paidCount += 1;
        ltvSum += entry.member.revenue.realized_ltv_base_units;
      }
    }

    return {
      source,
      label: sourceLabels[source],
      members: rows.length,
      activated_members: activatedCount,
      activation_rate: rows.length > 0 ? activatedCount / rows.length : null,
      retained_members: retainedCount,
      retention_rate: rows.length > 0 ? retainedCount / rows.length : null,
      paid_members: paidCount,
      avg_realized_ltv_base_units:
        hasPaidPlans && !mixedCurrency && paidCount > 0 ? Math.round(ltvSum / paidCount) : null,
      total_realized_ltv_base_units:
        hasPaidPlans && !mixedCurrency && paidCount > 0 ? ltvSum : null,
      avg_months_retained: rows.length > 0 ? roundOneDecimal(monthsSum / rows.length) : null,
    };
  });

  // 4. Chief of Staff Verified Saved Revenue (30d & 90d across all sampled members)
  let savedMrr30 = 0;
  let savedMembers30 = 0;
  let savedMrr90 = 0;
  let savedMembers90 = 0;
  let saveCurrency: string | null = currency;
  let saveDecimals = currencyDecimals;
  let saveMixedCurrency = mixedCurrency;

  const trackSaveCurrency = (cur: string, dec: number) => {
    const clean = cur.trim().toUpperCase();
    if (!clean) return false;
    if (saveCurrency && saveCurrency !== clean) {
      saveMixedCurrency = true;
      return false;
    }
    saveCurrency = clean;
    saveDecimals = dec;
    return true;
  };

  for (const entry of memberEval) {
    if (entry.member.verifiedSave30d.saved) {
      savedMembers30 += 1;
      if (
        !saveMixedCurrency &&
        trackSaveCurrency(
          entry.member.verifiedSave30d.currency,
          entry.member.verifiedSave30d.currency_decimals,
        )
      ) {
        savedMrr30 += entry.member.verifiedSave30d.saved_mrr_base_units;
      }
    }
    if (entry.member.verifiedSave90d.saved) {
      savedMembers90 += 1;
      if (
        !saveMixedCurrency &&
        trackSaveCurrency(
          entry.member.verifiedSave90d.currency,
          entry.member.verifiedSave90d.currency_decimals,
        )
      ) {
        savedMrr90 += entry.member.verifiedSave90d.saved_mrr_base_units;
      }
    }
  }

  if (saveMixedCurrency) {
    savedMrr30 = 0;
    savedMrr90 = 0;
  }

  const savedRevenue: RetentionSavedRevenueSummary = {
    show: hasPaidPlans && (args.hasProactiveAgent || savedMembers90 > 0),
    saved_mrr_30d_base_units: savedMrr30,
    saved_members_30d: savedMembers30,
    saved_mrr_90d_base_units: savedMrr90,
    saved_members_90d: savedMembers90,
    currency: saveMixedCurrency ? null : saveCurrency,
    currency_decimals: saveDecimals,
    mixed_currency: saveMixedCurrency,
  };

  return {
    range: args.range,
    sampled_members: args.members.length,
    is_capped: args.isCapped === true,
    has_paid_plans: hasPaidPlans,
    currency: mixedCurrency ? null : currency,
    currency_decimals: currencyDecimals,
    mixed_currency: mixedCurrency,
    activation,
    milestone_lift: milestoneLift.slice(0, 8),
    by_source: bySource,
    saved_revenue: savedRevenue,
  };
}

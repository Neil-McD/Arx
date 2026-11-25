// Pure monthly AI allowance guardrails & founder alert helpers (client-safe + server-usable).
// Keeps the 90% live-chat reserve, 80%/100% alert milestones, reset-date formatting,
// and calm founder alert copy deterministic and testable.
import { formatMicrosUsd } from "./agentRoiSummary";

// Reserve the final 10% of each community's monthly AI allowance ($2 of $20)
// for live member/builder chats, @mentions, and the Daily Founder Brief by
// pausing non-urgent background AI (heartbeats & reply drafts) once 90% is reached.
export const BACKGROUND_AI_RESERVE_THRESHOLD_PERCENT = 90;

export const ALLOWANCE_ALERT_MILESTONES = [80, 100] as const;
export type AllowanceAlertMilestone = (typeof ALLOWANCE_ALERT_MILESTONES)[number];

export function computeAllowancePercentUsed(
  settledMicros: number,
  allowanceMicros: number,
): number {
  const safeAllowance = Math.max(0, Math.floor(Number(allowanceMicros ?? 0)));
  if (safeAllowance <= 0) return 0;
  const safeSettled = Math.max(0, Math.floor(Number(settledMicros ?? 0)));
  return Math.min(100, Math.round((safeSettled / safeAllowance) * 100));
}

export function shouldPauseBackgroundAiForAllowance(input: {
  settledMicros: number;
  allowanceMicros: number;
}): boolean {
  const allowance = Math.max(0, Math.floor(Number(input.allowanceMicros ?? 0)));
  if (allowance <= 0) return false;
  const settled = Math.max(0, Math.floor(Number(input.settledMicros ?? 0)));
  return settled * 100 >= allowance * BACKGROUND_AI_RESERVE_THRESHOLD_PERCENT;
}

export function resolveAllowanceAlertMilestone(input: {
  settledMicros: number;
  allowanceMicros: number;
  lastNotifiedPercent?: number | null;
  exhausted?: boolean;
}): AllowanceAlertMilestone | null {
  const allowance = Math.max(0, Math.floor(Number(input.allowanceMicros ?? 0)));
  if (allowance <= 0) return null;
  const settled = Math.max(0, Math.floor(Number(input.settledMicros ?? 0)));
  const lastNotified = Math.max(0, Math.floor(Number(input.lastNotifiedPercent ?? 0)));

  // Use exact integer threshold comparisons so rounding never fires prematurely
  // (e.g., 79.6% stays below 80%), while honoring cycle reservation exhaustion.
  if (input.exhausted || settled >= allowance) {
    return lastNotified < 100 ? 100 : null;
  }
  if (settled * 100 >= allowance * 80) {
    return lastNotified < 80 ? 80 : null;
  }
  return null;
}

export function formatAllowanceResetDate(cycleEndAtMs: number | null | undefined): string | null {
  if (typeof cycleEndAtMs !== "number" || !Number.isFinite(cycleEndAtMs) || cycleEndAtMs <= 0) {
    return null;
  }
  try {
    return new Date(cycleEndAtMs).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return null;
  }
}

export function buildFounderAllowanceAlertCopy(input: {
  milestone: AllowanceAlertMilestone;
  communityName: string;
  settledMicros: number;
  allowanceMicros: number;
  resetDateLabel: string | null;
  reengaged30d: number;
  contacted30d: number;
  actionUrl?: string | null;
  boostAvailable?: boolean;
}): {
  subject: string;
  headline: string;
  bodyText: string;
  threadMarkdown: string;
} {
  const name = String(input.communityName || "your community").trim() || "your community";
  const usedLabel = formatMicrosUsd(input.settledMicros);
  const allowanceLabel = formatMicrosUsd(input.allowanceMicros);
  const resetClause = input.resetDateLabel
    ? `Your allowance resets automatically on ${input.resetDateLabel}.`
    : "Your allowance resets automatically at the start of your next billing cycle.";
  const winBackLine =
    input.contacted30d > 0 && input.reengaged30d > 0
      ? `In the last 30 days, ${input.reengaged30d} of ${input.contacted30d} members checked in by your guide came back to participate.`
      : null;
  const boostClause = input.boostAvailable
    ? "If you need extra room before reset, you can add an optional $30 boost (+$20 AI allowance) anytime in Guide settings."
    : null;
  const actionUrl = String(input.actionUrl ?? "").trim();
  const threadActionLine = actionUrl
    ? input.boostAvailable
      ? `[Manage allowance & boosts](${actionUrl})`
      : `[View allowance & impact](${actionUrl})`
    : null;

  if (input.milestone === 100) {
    const headline = `${name} reached 100% of this month's AI allowance`;
    const bodyLines = [
      `Your community has used ${usedLabel} of its ${allowanceLabel} monthly AI allowance — a great sign of active member conversations.`,
      ...(winBackLine ? [winBackLine] : []),
      `${resetClause} Your community, channels, courses, events, and zero-AI weekly digests keep running normally in the meantime.`,
      ...(boostClause ? [boostClause] : []),
    ];
    return {
      subject: `${name} reached its monthly AI allowance`,
      headline,
      bodyText: bodyLines.join(" "),
      threadMarkdown: [
        `**${headline}**`,
        ...bodyLines,
        ...(threadActionLine ? [threadActionLine] : []),
      ].join("\n\n"),
    };
  }

  const headline = `${name} is at 80% of this month's AI allowance`;
  const bodyLines = [
    `Your community has used ${usedLabel} of its ${allowanceLabel} monthly AI allowance.`,
    ...(winBackLine ? [winBackLine] : []),
    `At 90%, background check-ins and reply drafts will pause automatically to reserve the final 10% for live member chats, @mentions, and your Daily Brief. ${resetClause}`,
    ...(boostClause ? [boostClause] : []),
  ];
  return {
    subject: `${name} is at 80% of its monthly AI allowance`,
    headline,
    bodyText: bodyLines.join(" "),
    threadMarkdown: [
      `**${headline}**`,
      ...bodyLines,
      ...(threadActionLine ? [threadActionLine] : []),
    ].join("\n\n"),
  };
}

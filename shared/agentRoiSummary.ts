// Pure founder impact & monthly AI allowance summary helpers (client-safe + server-usable).
// Keeps spend math and 30-day win-back attribution deterministic and testable.

export type CommunitySpendSurface =
  | "member_agent_dock"
  | "community_funnel_builder"
  | "community_agent_mention"
  | "community_autonomous_cognition"
  | "community_workflow_action"
  | "community_setup_generation"
  | "community_founder_brief";

export type CommunitySpendReceiptLike = {
  surface: string;
  status: string;
  settledCostMicros?: number | null;
};

export type CommunityMonthlySpendSummary = {
  totalMicros: number;
  liveChatMicros: number;
  proactiveMicros: number;
  briefMicros: number;
  allowanceMicros: number;
  percentUsed: number;
  receiptCount: number;
  truncated: boolean;
};

export function summarizeCommunityAiSpend(input: {
  receipts: readonly CommunitySpendReceiptLike[];
  allowanceMicros: number;
  truncated?: boolean;
}): CommunityMonthlySpendSummary {
  let liveChatMicros = 0;
  let proactiveMicros = 0;
  let briefMicros = 0;
  let receiptCount = 0;

  for (const receipt of input.receipts) {
    if (receipt.status === "failed") continue;
    const cost = Math.max(0, Math.floor(Number(receipt.settledCostMicros ?? 0)));
    receiptCount += 1;
    if (cost <= 0) continue;
    if (
      receipt.surface === "member_agent_dock" ||
      receipt.surface === "community_agent_mention"
    ) {
      liveChatMicros += cost;
    } else if (
      receipt.surface === "community_autonomous_cognition" ||
      receipt.surface === "community_workflow_action"
    ) {
      proactiveMicros += cost;
    } else {
      briefMicros += cost;
    }
  }

  const totalMicros = liveChatMicros + proactiveMicros + briefMicros;
  const allowanceMicros = Math.max(0, Math.floor(Number(input.allowanceMicros ?? 0)));
  const percentUsed =
    allowanceMicros > 0
      ? Math.min(100, Math.round((totalMicros / allowanceMicros) * 100))
      : 0;

  return {
    totalMicros,
    liveChatMicros,
    proactiveMicros,
    briefMicros,
    allowanceMicros,
    percentUsed,
    receiptCount,
    truncated: Boolean(input.truncated),
  };
}

export function countReengagedMembersFromSentChecks(input: {
  sentChecks: ReadonlyArray<{ memberUserId: string; sentAt: number }>;
  latestActivityByMember: ReadonlyMap<string, number | null>;
}): {
  contactedCount: number;
  reengagedCount: number;
} {
  const earliestSentByMember = new Map<string, number>();
  for (const row of input.sentChecks) {
    const key = String(row.memberUserId ?? "").trim();
    if (!key || !Number.isFinite(row.sentAt) || row.sentAt <= 0) continue;
    const prev = earliestSentByMember.get(key);
    if (prev === undefined || row.sentAt < prev) {
      earliestSentByMember.set(key, row.sentAt);
    }
  }

  let reengagedCount = 0;
  for (const [memberId, earliestSentAt] of earliestSentByMember.entries()) {
    const latestActivityAt = input.latestActivityByMember.get(memberId);
    if (typeof latestActivityAt === "number" && latestActivityAt > earliestSentAt) {
      reengagedCount += 1;
    }
  }

  return {
    contactedCount: earliestSentByMember.size,
    reengagedCount,
  };
}

export function formatMicrosUsd(micros: number): string {
  const safe = Math.max(0, Number.isFinite(micros) ? micros : 0);
  const dollars = safe / 1_000_000;
  if (dollars > 0 && dollars < 0.01) return "<$0.01";
  return `$${dollars.toFixed(2)}`;
}

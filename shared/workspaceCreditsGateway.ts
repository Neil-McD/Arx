import { type AuthSessionLike } from "./authSession";
import { bootstrapConvexAuthenticatedClient, requireConvexUrl } from "./convexAuthenticatedClient";

export type WorkspaceCreditBalance = {
  userId: string;
  includedCreditsBalance: number;
  purchasedCreditsBalance: number;
  uncollectedCreditsBalance: number;
  pendingCardCollectionCreditsBalance: number;
  outstandingUsageCreditsBalance: number;
  includedCycleCredits: number;
  includedCycleStartedAt: number;
  includedCycleEndsAt: number;
  createdAt: number;
  updatedAt: number;
  spendableCreditsBalance: number;
  displayBalanceUsd: string;
  blocked: boolean;
  blockedReason: string | null;
  lowBalance: boolean;
};

export type WorkspaceBillingMonthSummary = {
  key: string;
  label: string;
  startAt: number;
  endAt: number;
  workspaceUsageCredits: number;
  workspaceUsageUsd: string;
  paidCredits: number;
  paidUsd: string;
};

export type WorkspaceBillingOverview = {
  userId: string;
  generatedAt: number;
  currentPeriod: WorkspaceBillingMonthSummary & {
    prepaidBalanceCredits: number;
    prepaidBalanceUsd: string;
    currentUsageCredits: number;
    currentUsageUsd: string;
    pendingCardCollectionCredits: number;
    pendingCardCollectionUsd: string;
  };
  history: WorkspaceBillingMonthSummary[];
  scan: {
    creditLedgerEntriesTruncated: boolean;
    workspaceChargesTruncated: boolean;
    usageCollectionsTruncated: boolean;
    topupsTruncated: boolean;
  };
};

function normalizeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeString(value: unknown, fallback = ""): string {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function normalizeWorkspaceCreditBalance(row: unknown): WorkspaceCreditBalance | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const value = row as Record<string, unknown>;
  const userId = String(value.userId ?? "").trim();
  if (!userId) return null;
  return {
    userId,
    includedCreditsBalance: normalizeNumber(value.includedCreditsBalance),
    purchasedCreditsBalance: normalizeNumber(value.purchasedCreditsBalance),
    uncollectedCreditsBalance: normalizeNumber(value.uncollectedCreditsBalance),
    pendingCardCollectionCreditsBalance: normalizeNumber(value.pendingCardCollectionCreditsBalance),
    outstandingUsageCreditsBalance: normalizeNumber(
      value.outstandingUsageCreditsBalance,
      normalizeNumber(value.uncollectedCreditsBalance) +
        normalizeNumber(value.pendingCardCollectionCreditsBalance),
    ),
    includedCycleCredits: normalizeNumber(value.includedCycleCredits),
    includedCycleStartedAt: normalizeNumber(value.includedCycleStartedAt),
    includedCycleEndsAt: normalizeNumber(value.includedCycleEndsAt),
    createdAt: normalizeNumber(value.createdAt),
    updatedAt: normalizeNumber(value.updatedAt),
    spendableCreditsBalance: normalizeNumber(
      value.spendableCreditsBalance,
      normalizeNumber(value.purchasedCreditsBalance),
    ),
    displayBalanceUsd: String(value.displayBalanceUsd ?? "").trim(),
    blocked: value.blocked === true,
    blockedReason: typeof value.blockedReason === "string" ? value.blockedReason : null,
    lowBalance: value.lowBalance === true,
  };
}

export async function loadWorkspaceCreditBalanceCanonical(params: {
  session: AuthSessionLike;
}): Promise<WorkspaceCreditBalance | null> {
  requireConvexUrl();
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const row = await client.query("workspaceCredits:getWorkspaceToolBalance" as any, {
    authSubject,
    nowMs: Date.now(),
  });
  return normalizeWorkspaceCreditBalance(row);
}

function normalizeWorkspaceBillingMonthSummary(row: unknown): WorkspaceBillingMonthSummary | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const value = row as Record<string, unknown>;
  const key = normalizeString(value.key);
  if (!key) return null;
  return {
    key,
    label: normalizeString(value.label, key),
    startAt: normalizeNumber(value.startAt),
    endAt: normalizeNumber(value.endAt),
    workspaceUsageCredits: normalizeNumber(value.workspaceUsageCredits),
    workspaceUsageUsd: normalizeString(value.workspaceUsageUsd, "$0"),
    paidCredits: normalizeNumber(value.paidCredits),
    paidUsd: normalizeString(value.paidUsd, "$0"),
  };
}

function normalizeWorkspaceBillingOverview(row: unknown): WorkspaceBillingOverview | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const value = row as Record<string, unknown>;
  const userId = normalizeString(value.userId);
  if (!userId) return null;
  const currentPeriod = normalizeWorkspaceBillingMonthSummary(value.currentPeriod);
  if (!currentPeriod || !value.currentPeriod || typeof value.currentPeriod !== "object") return null;
  const currentValue = value.currentPeriod as Record<string, unknown>;
  const history = Array.isArray(value.history)
    ? value.history
        .map((entry) => normalizeWorkspaceBillingMonthSummary(entry))
        .filter((entry): entry is WorkspaceBillingMonthSummary => Boolean(entry))
    : [];
  const scan = value.scan && typeof value.scan === "object" && !Array.isArray(value.scan)
    ? value.scan as Record<string, unknown>
    : {};
  return {
    userId,
    generatedAt: normalizeNumber(value.generatedAt),
    currentPeriod: {
      ...currentPeriod,
      prepaidBalanceCredits: normalizeNumber(currentValue.prepaidBalanceCredits),
      prepaidBalanceUsd: normalizeString(currentValue.prepaidBalanceUsd, "$0"),
      currentUsageCredits: normalizeNumber(currentValue.currentUsageCredits),
      currentUsageUsd: normalizeString(currentValue.currentUsageUsd, "$0"),
      pendingCardCollectionCredits: normalizeNumber(currentValue.pendingCardCollectionCredits),
      pendingCardCollectionUsd: normalizeString(currentValue.pendingCardCollectionUsd, "$0"),
    },
    history,
    scan: {
      creditLedgerEntriesTruncated: scan.creditLedgerEntriesTruncated === true,
      workspaceChargesTruncated: scan.workspaceChargesTruncated === true,
      usageCollectionsTruncated: scan.usageCollectionsTruncated === true,
      topupsTruncated: scan.topupsTruncated === true,
    },
  };
}

export async function loadWorkspaceBillingOverviewCanonical(params: {
  session: AuthSessionLike;
}): Promise<WorkspaceBillingOverview | null> {
  requireConvexUrl();
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const row = await client.query("workspaceCredits:getWorkspaceBillingOverview" as any, {
    authSubject,
    nowMs: Date.now(),
  });
  return normalizeWorkspaceBillingOverview(row);
}

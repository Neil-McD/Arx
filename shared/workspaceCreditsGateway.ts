import { type AuthSessionLike } from "./authSession";
import { bootstrapConvexAuthenticatedClient, requireConvexUrl } from "./convexAuthenticatedClient";

export type WorkspaceCreditBalance = {
  userId: string;
  includedCreditsBalance: number;
  purchasedCreditsBalance: number;
  uncollectedCreditsBalance: number;
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

function normalizeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
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

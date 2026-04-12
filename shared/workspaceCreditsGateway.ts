import { type AuthSessionLike } from "./authSession";
import { bootstrapConvexAuthenticatedClient, requireConvexUrl } from "./convexAuthenticatedClient";

export type WorkspaceCreditBalance = {
  userId: string;
  includedCreditsBalance: number;
  purchasedCreditsBalance: number;
  includedCycleCredits: number;
  includedCycleStartedAt: number;
  includedCycleEndsAt: number;
  createdAt: number;
  updatedAt: number;
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
    includedCycleCredits: normalizeNumber(value.includedCycleCredits),
    includedCycleStartedAt: normalizeNumber(value.includedCycleStartedAt),
    includedCycleEndsAt: normalizeNumber(value.includedCycleEndsAt),
    createdAt: normalizeNumber(value.createdAt),
    updatedAt: normalizeNumber(value.updatedAt),
  };
}

export async function loadWorkspaceCreditBalanceCanonical(params: {
  session: AuthSessionLike;
}): Promise<WorkspaceCreditBalance | null> {
  requireConvexUrl();
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const row = await client.query("workspaceCredits:getWorkspaceCreditBalance" as any, {
    authSubject,
  });
  return normalizeWorkspaceCreditBalance(row);
}

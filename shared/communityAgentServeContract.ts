// Convex-runtime actions have a 30-minute execution ceiling. Recovery must not
// fence a provider-started action while that original action can still finish,
// settle its receipt, and materialize the one canonical reply.
export const COMMUNITY_AGENT_SERVE_RUNTIME_MAX_MS = 30 * 60 * 1000;
export const COMMUNITY_AGENT_SERVE_RECOVERY_GRACE_MS = 5 * 60 * 1000;
export const COMMUNITY_AGENT_SERVE_LEASE_MS =
  COMMUNITY_AGENT_SERVE_RUNTIME_MAX_MS + COMMUNITY_AGENT_SERVE_RECOVERY_GRACE_MS;
export const COMMUNITY_AGENT_SERVE_MAX_ATTEMPTS = 3;

export function normalizeCommunityAgentServeAttempt(raw: unknown): number {
  const parsed = Math.floor(Number(raw));
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(parsed, 1_000_000);
}

export function nextCommunityAgentServeAttempt(raw: unknown): number {
  return normalizeCommunityAgentServeAttempt(raw) + 1;
}

export function communityAgentServeAttemptMatches(raw: unknown, expectedRaw: unknown): boolean {
  const attempt = normalizeCommunityAgentServeAttempt(raw);
  const expectedAttempt = normalizeCommunityAgentServeAttempt(expectedRaw);
  return attempt > 0 && attempt === expectedAttempt;
}

export function buildCommunityAgentServeRunId(requestId: unknown, attemptRaw: unknown): string {
  const normalizedRequestId = String(requestId ?? "").trim();
  if (!normalizedRequestId) throw new Error("community_agent_serve_request_id_required");
  const attempt = normalizeCommunityAgentServeAttempt(attemptRaw);
  return attempt > 0
    ? `community-agent-serve:${normalizedRequestId}:attempt:${attempt}`
    : `community-agent-serve:${normalizedRequestId}`;
}

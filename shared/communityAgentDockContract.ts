export type CommunityAgentDockPublicErrorCode =
  | "connection_required"
  | "agent_unavailable"
  | "access_lost"
  | "turn_failed";

export type CommunityAgentDockPublicIssue = {
  code: CommunityAgentDockPublicErrorCode;
  message: string;
};

export function normalizeCommunityAgentServeAttempt(raw: unknown): number {
  const parsed = Math.floor(Number(raw));
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(parsed, 1_000_000);
}

export function nextCommunityAgentServeAttempt(raw: unknown): number {
  return normalizeCommunityAgentServeAttempt(raw) + 1;
}

export function buildCommunityAgentServeRunId(requestId: unknown, attemptRaw: unknown): string {
  const normalizedRequestId = String(requestId ?? "").trim();
  if (!normalizedRequestId) throw new Error("community_agent_serve_request_id_required");
  const attempt = normalizeCommunityAgentServeAttempt(attemptRaw);
  return attempt > 0
    ? `community-agent-serve:${normalizedRequestId}:attempt:${attempt}`
    : `community-agent-serve:${normalizedRequestId}`;
}

export function projectCommunityAgentDockPublicIssue(input: {
  status: unknown;
  intakeReason?: unknown;
  errorCode?: unknown;
}): CommunityAgentDockPublicIssue | null {
  const status = String(input.status ?? "").trim();
  if (status !== "error" && status !== "skipped") return null;
  const reason = String(input.intakeReason ?? "").trim();
  const errorCode = String(input.errorCode ?? "").trim();
  if (reason === "requester_connection_missing" || errorCode === "requester_connection_missing") {
    return { code: "connection_required", message: "Connect ChatGPT in Settings to use this agent." };
  }
  if (reason === "agent_disabled" || errorCode === "agent_disabled") {
    return { code: "agent_unavailable", message: "This community agent is currently unavailable." };
  }
  if (
    reason === "requester_access_missing" ||
    errorCode === "requester_access_missing" ||
    errorCode === "source_not_readable"
  ) {
    return { code: "access_lost", message: "You no longer have access to this community agent turn." };
  }
  return { code: "turn_failed", message: "The community agent could not complete this turn." };
}

export function communityAgentDockReplyIsVisibleToOwner(input: {
  actorType: unknown;
  actorUserId?: unknown;
  actorAgentKey?: unknown;
  ownerUserId: unknown;
  canonicalAgentKey: string;
}): boolean {
  if (input.actorType === "human") {
    return String(input.actorUserId ?? "") === String(input.ownerUserId ?? "");
  }
  return input.actorType === "community_agent" && input.actorAgentKey === input.canonicalAgentKey;
}

import type { CommunityMemoryCandidateProposeResult } from "./communityMemoryCandidates";
import { bootstrapConvexAuthenticatedClient } from "./convexAuthenticatedClient";

type CloudCommunityMemoryCandidatesGatewayParams<SessionT> = {
  session: SessionT;
  communityId: string;
  limit?: number;
};

function coerceObjectRows<TRow>(payload: unknown): TRow[] {
  if (Array.isArray(payload)) return payload as TRow[];
  if (!payload || typeof payload !== "object") return [];
  const payloadObj = payload as Record<string, unknown>;
  const keys = ["rows", "items", "data"] as const;
  for (const key of keys) {
    const value = payloadObj[key];
    if (Array.isArray(value)) return value as TRow[];
  }
  return [payload as TRow];
}

export async function listCloudCommunityMemoryCandidateRows<SessionT, TRow = unknown>(
  params: CloudCommunityMemoryCandidatesGatewayParams<SessionT>,
): Promise<TRow[]> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const limit =
    typeof params.limit === "number" && Number.isFinite(params.limit)
      ? Math.max(1, Math.floor(params.limit))
      : 100;
  const payload = await client.query("community:listCommunityMemoryCandidates" as any, {
    authSubject,
    communityId: params.communityId,
    limit,
  });
  return coerceObjectRows<TRow>(payload);
}

export async function proposeCloudCommunityMemoryCandidate<SessionT>(
  params: {
    session: SessionT;
    communityId: string;
    title: string | null;
    memoryText: string;
    evidence: unknown;
    requestKey: string | null;
  },
): Promise<CommunityMemoryCandidateProposeResult> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  const payload = await client.mutation("community:proposeCommunityMemoryCandidate" as any, {
    authSubject,
    communityId: params.communityId,
    title: params.title,
    memoryText: params.memoryText,
    evidence: params.evidence,
    requestKey: params.requestKey,
  });
  const rows = coerceObjectRows<CommunityMemoryCandidateProposeResult>(payload);
  const row = rows[0] ?? null;
  if (!row?.candidate_id) throw new Error("Memory candidate was not created.");
  return row;
}

export async function promoteCloudCommunityMemoryCandidate<SessionT>(
  params: {
    session: SessionT;
    candidateId: string;
    title: string | null;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:promoteCommunityMemoryCandidate" as any, {
    authSubject,
    candidateId: params.candidateId,
    title: params.title,
  });
}

export async function rejectCloudCommunityMemoryCandidate<SessionT>(
  params: {
    session: SessionT;
    candidateId: string;
    reason?: string | null;
  },
): Promise<void> {
  const { client, authSubject } = await bootstrapConvexAuthenticatedClient(params.session);
  await client.mutation("community:rejectCommunityMemoryCandidate" as any, {
    authSubject,
    candidateId: params.candidateId,
    reason: params.reason ?? null,
  });
}

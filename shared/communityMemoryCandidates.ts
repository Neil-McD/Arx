
import {
  listCloudCommunityMemoryCandidateRows,
  promoteCloudCommunityMemoryCandidate,
  proposeCloudCommunityMemoryCandidate,
  rejectCloudCommunityMemoryCandidate,
} from "./cloudCommunityMemoryCandidatesGateway";

export type CloudSessionLike = {
  user: {
    id: string;
  };
};

export type CommunityMemoryCandidateRow = {
  id: string;
  community_id: string;
  proposer_user_id: string;
  title: string | null;
  memory_text: string;
  evidence_json: unknown;
  router_state: string;
  signal_score: number;
  router_reason: string | null;
  promoted_memory_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CommunityMemoryCandidateProposeResult = {
  candidate_id: string;
  router_state: string;
  signal_score: number;
  router_reason: string | null;
  promoted_memory_id: string | null;
  created_at: string;
};

export function buildTeachMemoryText(value: string): string {
  const normalized = value
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!normalized) return "";
  if (normalized.length <= 4000) return normalized;
  return `${normalized.slice(0, 3997)}...`;
}

export function deriveTeachCandidateTitle(memoryText: string): string | null {
  const normalized = memoryText.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  const firstSentence = normalized.split(/(?<=[.!?])\s+/)[0] ?? normalized;
  const cleaned = firstSentence.replace(/^[-*#\d.\s]+/, "").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, 120);
}

function fnv1aHex(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export async function hashTeachCandidateContent(value: string): Promise<string> {
  const normalized = value.trim();
  if (!normalized) return "empty";
  if (typeof crypto === "undefined" || !crypto.subtle) {
    return `fnv1a-${fnv1aHex(normalized)}`;
  }
  try {
    const encoded = new TextEncoder().encode(normalized);
    const digest = await crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return `fnv1a-${fnv1aHex(normalized)}`;
  }
}

export async function listCommunityMemoryCandidatesRpc<S extends CloudSessionLike>(opts: {
  session: S;
  communityId: string;
  limit?: number;
}): Promise<CommunityMemoryCandidateRow[]> {
  return await listCloudCommunityMemoryCandidateRows<S, CommunityMemoryCandidateRow>({
    session: opts.session,
    communityId: opts.communityId,
    limit: opts.limit,
  });
}

export async function proposeCommunityMemoryCandidateRpc<S extends CloudSessionLike>(opts: {
  session: S;
  communityId: string;
  title: string | null;
  memoryText: string;
  evidence: unknown;
  requestKey: string | null;
}): Promise<CommunityMemoryCandidateProposeResult> {
  return await proposeCloudCommunityMemoryCandidate<S>({
    session: opts.session,
    communityId: opts.communityId,
    title: opts.title,
    memoryText: opts.memoryText,
    evidence: opts.evidence,
    requestKey: opts.requestKey,
  });
}

export async function promoteCommunityMemoryCandidateRpc<S extends CloudSessionLike>(opts: {
  session: S;
  candidateId: string;
  title: string | null;
}): Promise<void> {
  await promoteCloudCommunityMemoryCandidate<S>({
    session: opts.session,
    candidateId: opts.candidateId,
    title: opts.title,
  });
}

export async function rejectCommunityMemoryCandidateRpc<S extends CloudSessionLike>(opts: {
  session: S;
  candidateId: string;
  reason?: string | null;
}): Promise<void> {
  await rejectCloudCommunityMemoryCandidate<S>({
    session: opts.session,
    candidateId: opts.candidateId,
    reason: opts.reason ?? null,
  });
}

export type SupabaseSessionLike = {
  user: {
    id: string;
  };
};

export type FetchWithSupabaseAuth<S extends SupabaseSessionLike> = (
  url: string,
  init: RequestInit,
  session: S,
) => Promise<Response>;

export type ReadSupabaseError = (response: Response) => Promise<string>;

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

export async function listCommunityMemoryCandidatesRpc<S extends SupabaseSessionLike>(opts: {
  url: string;
  session: S;
  communityId: string;
  limit?: number;
  fetchWithSupabaseAuth: FetchWithSupabaseAuth<S>;
  readSupabaseError: ReadSupabaseError;
}): Promise<CommunityMemoryCandidateRow[]> {
  const limit = typeof opts.limit === "number" && Number.isFinite(opts.limit) ? Math.max(1, Math.floor(opts.limit)) : 100;
  const response = await opts.fetchWithSupabaseAuth(
    `${opts.url}/rest/v1/community_memory_candidates?select=id,community_id,proposer_user_id,title,memory_text,evidence_json,router_state,signal_score,router_reason,promoted_memory_id,reviewed_by,reviewed_at,created_at,updated_at&community_id=eq.${encodeURIComponent(
      opts.communityId,
    )}&order=created_at.desc&limit=${encodeURIComponent(String(limit))}`,
    { method: "GET" },
    opts.session,
  );
  if (!response.ok) throw new Error(await opts.readSupabaseError(response));
  const rows = (await response.json()) as CommunityMemoryCandidateRow[] | null;
  return Array.isArray(rows) ? rows : [];
}

export async function proposeCommunityMemoryCandidateRpc<S extends SupabaseSessionLike>(opts: {
  url: string;
  session: S;
  communityId: string;
  title: string | null;
  memoryText: string;
  evidence: unknown;
  requestKey: string | null;
  fetchWithSupabaseAuth: FetchWithSupabaseAuth<S>;
  readSupabaseError: ReadSupabaseError;
}): Promise<CommunityMemoryCandidateProposeResult> {
  const response = await opts.fetchWithSupabaseAuth(
    `${opts.url}/rest/v1/rpc/community_memory_candidate_propose`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_community_id: opts.communityId,
        p_title: opts.title,
        p_memory_text: opts.memoryText,
        p_evidence: opts.evidence,
        p_request_key: opts.requestKey,
      }),
    },
    opts.session,
  );
  if (!response.ok) throw new Error(await opts.readSupabaseError(response));
  const rows = (await response.json()) as CommunityMemoryCandidateProposeResult[] | null;
  const row = Array.isArray(rows) ? rows[0] ?? null : null;
  if (!row?.candidate_id) throw new Error("Memory candidate was not created.");
  return row;
}

export async function promoteCommunityMemoryCandidateRpc<S extends SupabaseSessionLike>(opts: {
  url: string;
  session: S;
  candidateId: string;
  title: string | null;
  fetchWithSupabaseAuth: FetchWithSupabaseAuth<S>;
  readSupabaseError: ReadSupabaseError;
}): Promise<void> {
  const response = await opts.fetchWithSupabaseAuth(
    `${opts.url}/rest/v1/rpc/community_memory_candidate_promote`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        p_candidate_id: opts.candidateId,
        p_title: opts.title,
      }),
    },
    opts.session,
  );
  if (!response.ok) throw new Error(await opts.readSupabaseError(response));
}

export async function rejectCommunityMemoryCandidateRpc<S extends SupabaseSessionLike>(opts: {
  url: string;
  session: S;
  candidateId: string;
  reason?: string | null;
  fetchWithSupabaseAuth: FetchWithSupabaseAuth<S>;
  readSupabaseError: ReadSupabaseError;
}): Promise<void> {
  const response = await opts.fetchWithSupabaseAuth(
    `${opts.url}/rest/v1/rpc/community_memory_candidate_reject`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_candidate_id: opts.candidateId,
        p_reason: opts.reason ?? null,
      }),
    },
    opts.session,
  );
  if (!response.ok) throw new Error(await opts.readSupabaseError(response));
}

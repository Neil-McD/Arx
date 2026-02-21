export const COMMUNITY_EVIDENCE_USED_CONTRACT_ID = "community_evidence_used_v1";
export const COMMUNITY_EVIDENCE_CHAT_LIMIT = 6;
export const COMMUNITY_EVIDENCE_RESOURCE_LIMIT = 5;
export const COMMUNITY_EVIDENCE_TOTAL_LIMIT =
  COMMUNITY_EVIDENCE_CHAT_LIMIT + COMMUNITY_EVIDENCE_RESOURCE_LIMIT;

export type CommunityEvidenceSourceType = "chat" | "resource" | "memory";

export type CommunityEvidenceItem = {
  source_type: CommunityEvidenceSourceType;
  source_id: string;
  internal_source_id?: string;
  title: string;
  snippet: string;
  url: string | null;
  score: number | null;
  rank: number;
};

export type CommunityEvidenceUsedV1 = {
  v: 1;
  contract_id: typeof COMMUNITY_EVIDENCE_USED_CONTRACT_ID;
  items: CommunityEvidenceItem[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asOptionalString(value: unknown): string | null {
  const trimmed = asTrimmedString(value);
  return trimmed.length > 0 ? trimmed : null;
}

function asNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeSourceType(value: unknown): CommunityEvidenceSourceType | null {
  const normalized = asTrimmedString(value).toLowerCase();
  if (normalized === "chat") return "chat";
  if (normalized === "resource") return "resource";
  if (normalized === "memory") return "memory";
  return null;
}

function normalizeEvidenceItem(value: unknown): CommunityEvidenceItem | null {
  const record = asRecord(value);
  if (!record) return null;

  const sourceType = normalizeSourceType(record.source_type);
  const sourceId = asTrimmedString(record.source_id);
  const title = asTrimmedString(record.title);
  const snippet = asTrimmedString(record.snippet);
  const rank = asNumberOrNull(record.rank);
  if (!sourceType || !sourceId || !title || !snippet || rank === null) return null;
  const rankInt = Math.floor(rank);
  if (!Number.isFinite(rankInt) || rankInt <= 0) return null;
  const internalSourceId = asTrimmedString(record.internal_source_id);

  return {
    source_type: sourceType,
    source_id: sourceId,
    ...(internalSourceId ? { internal_source_id: internalSourceId } : {}),
    title,
    snippet,
    url: asOptionalString(record.url),
    score: asNumberOrNull(record.score),
    rank: rankInt,
  };
}

function normalizeItemsArray(value: unknown): CommunityEvidenceItem[] {
  if (!Array.isArray(value)) return [];
  const out: CommunityEvidenceItem[] = [];
  for (const item of value) {
    const normalized = normalizeEvidenceItem(item);
    if (normalized) out.push(normalized);
  }
  out.sort((a, b) => a.rank - b.rank || a.source_id.localeCompare(b.source_id));
  if (out.length > COMMUNITY_EVIDENCE_TOTAL_LIMIT) {
    out.length = COMMUNITY_EVIDENCE_TOTAL_LIMIT;
  }
  return out;
}

export function normalizeCommunityEvidenceUsedV1(value: unknown): CommunityEvidenceUsedV1 | null {
  const record = asRecord(value);
  if (!record) return null;
  const items = normalizeItemsArray(record.items);
  if (items.length === 0) return null;

  return {
    v: 1,
    contract_id: COMMUNITY_EVIDENCE_USED_CONTRACT_ID,
    items,
  };
}

export function extractCommunityEvidenceUsedV1(content: unknown): CommunityEvidenceUsedV1 | null {
  if (typeof content === "string") {
    try {
      return extractCommunityEvidenceUsedV1(JSON.parse(content));
    } catch {
      return null;
    }
  }
  const record = asRecord(content);
  if (!record) return null;

  const metaRecord = asRecord(record.meta);
  if (metaRecord) {
    const v1 = normalizeCommunityEvidenceUsedV1(metaRecord.community_evidence_used_v1);
    if (v1) return v1;
  }

  const direct = normalizeCommunityEvidenceUsedV1(record.community_evidence_used_v1);
  return direct;
}

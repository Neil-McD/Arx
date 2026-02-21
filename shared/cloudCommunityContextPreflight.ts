import type { SupabaseSession } from "./supabaseAuthCore";
import {
  COMMUNITY_EVIDENCE_TOTAL_LIMIT,
  COMMUNITY_EVIDENCE_USED_CONTRACT_ID,
  type CommunityEvidenceUsedV1,
} from "./communityEvidence";
import {
  COMMUNITY_CONTEXT_BUNDLE_V1,
  COMMUNITY_CONTEXT_OBSERVABILITY_CONTRACT_ID,
  buildCommunityContextDiagnostics as buildCanonicalCommunityContextDiagnostics,
  buildCommunityContextSystemPrompt as buildCanonicalCommunityContextSystemPrompt,
  buildCommunityEvidenceUserMessage,
  parseNumberOrNull,
  truncateUtf8ForPrompt,
} from "../supabase/functions/agent_turn/community_context_bundle_v1.mjs";

export const COMMUNITY_HARNESS_UNAVAILABLE_FAILURE_CLASS = "community_harness_unavailable";
const COMMUNITY_HARNESS_UNAVAILABLE_MESSAGE =
  "Community tools are temporarily unavailable. Please retry shortly.";

const LIMITS = Object.freeze({
  queryMaxChars: COMMUNITY_CONTEXT_BUNDLE_V1.limits.queryMaxChars,
  compiledLimit: COMMUNITY_CONTEXT_BUNDLE_V1.limits.compiledLimit,
  chatLimit: COMMUNITY_CONTEXT_BUNDLE_V1.limits.chatLimit,
  resourceLimit: COMMUNITY_CONTEXT_BUNDLE_V1.limits.resourceLimit,
  chatSnippetMaxChars: COMMUNITY_CONTEXT_BUNDLE_V1.limits.chatSnippetMaxChars,
  chatSenderMaxChars: COMMUNITY_CONTEXT_BUNDLE_V1.limits.chatSenderMaxChars,
  resourceTitleMaxChars: COMMUNITY_CONTEXT_BUNDLE_V1.limits.resourceTitleMaxChars,
  resourceSnippetMaxChars: COMMUNITY_CONTEXT_BUNDLE_V1.limits.resourceSnippetMaxChars,
  resourceUrlMaxChars: COMMUNITY_CONTEXT_BUNDLE_V1.limits.resourceUrlMaxChars,
  communityLabelMaxChars: 80,
});

export type FetchWithSupabaseAuth = (
  url: string,
  init: RequestInit,
  session: SupabaseSession,
) => Promise<Response>;

type CommunitySearchPayloadChatRow = {
  source_type: "chat";
  source_id: string;
  internal_source_id?: string | null;
  sender_display: string;
  created_at: string;
  snippet: string;
  score?: number | string | null;
};

type CommunitySearchPayloadResourceRow = {
  source_type: "resource" | "memory";
  source_id: string;
  internal_source_id?: string | null;
  title: string;
  created_at: string;
  snippet: string;
  url: string | null;
  score?: number | string | null;
};

type CommunitySearchPayloadMemoryRow = {
  source_type: "memory";
  source_id: string;
  internal_source_id?: string | null;
  title: string;
  created_at: string;
  updated_at: string;
  snippet: string;
  score: number | string | null;
};

type CommunityResearchSuccessPayload = {
  ok: true;
  diagnostics?: Record<string, unknown> | null;
  meta_recent_fallback_used?: boolean;
  rows?: {
    chat?: CommunitySearchPayloadChatRow[];
    resources?: CommunitySearchPayloadResourceRow[];
    memory?: CommunitySearchPayloadMemoryRow[];
  };
};

type CommunityResearchErrorPayload = {
  ok: false;
  reason_code?: string;
  error?: string;
  message?: string;
};

export type CloudCommunityContextPreflightResult = {
  hasEntitlement: boolean;
  communityEvidenceUserMessage: string | null;
  communityEvidenceUsedV1: CommunityEvidenceUsedV1 | null;
  communityContextDiagnostics: Record<string, unknown> | null;
};

function getCommunityContextFailureClass(
  diagnostics: Record<string, unknown> | null | undefined,
): string | null {
  if (!diagnostics || typeof diagnostics !== "object" || Array.isArray(diagnostics)) return null;
  const raw = diagnostics.failure_class;
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim();
  return cleaned ? cleaned : null;
}

export function isCommunityHarnessUnavailablePreflight(
  preflight:
    | {
        communityContextDiagnostics: Record<string, unknown> | null;
      }
    | null
    | undefined,
): boolean {
  if (!preflight) return false;
  return (
    getCommunityContextFailureClass(preflight.communityContextDiagnostics) ===
    COMMUNITY_HARNESS_UNAVAILABLE_FAILURE_CLASS
  );
}

export function getCommunityHarnessUnavailableErrorMessage(): string {
  return COMMUNITY_HARNESS_UNAVAILABLE_MESSAGE;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) && value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
    if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
  }
  return false;
}

function parseNullableBool(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  return parseBool(value);
}

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toOptionalString(value: unknown): string | null {
  const trimmed = toTrimmedString(value);
  return trimmed ? trimmed : null;
}

function normalizeChatRows(value: unknown): CommunitySearchPayloadChatRow[] {
  if (!Array.isArray(value)) return [];
  const rows: CommunitySearchPayloadChatRow[] = [];
  for (const entry of value) {
    const row = asRecord(entry);
    if (!row) continue;
    const snippet = toTrimmedString(row.snippet);
    if (!snippet) continue;
    const sourceId = toTrimmedString(row.source_id);
    if (!sourceId) continue;
    rows.push({
      source_type: "chat",
      source_id: sourceId,
      internal_source_id: toOptionalString(row.internal_source_id),
      sender_display: toTrimmedString(row.sender_display) || "member",
      created_at: toTrimmedString(row.created_at),
      snippet,
      score: parseNumberOrNull(row.score),
    });
  }
  return rows.slice(0, LIMITS.chatLimit);
}

function normalizeResourceRows(value: unknown): CommunitySearchPayloadResourceRow[] {
  if (!Array.isArray(value)) return [];
  const rows: CommunitySearchPayloadResourceRow[] = [];
  for (const entry of value) {
    const row = asRecord(entry);
    if (!row) continue;
    const sourceTypeRaw = toTrimmedString(row.source_type).toLowerCase();
    const sourceType: "resource" | "memory" = sourceTypeRaw === "memory" ? "memory" : "resource";
    const sourceId = toTrimmedString(row.source_id);
    if (!sourceId) continue;
    const snippet = toTrimmedString(row.snippet);
    if (!snippet) continue;
    rows.push({
      source_type: sourceType,
      source_id: sourceId,
      internal_source_id: toOptionalString(row.internal_source_id),
      title:
        toTrimmedString(row.title) || (sourceType === "memory" ? "Community memory" : "Community resource"),
      created_at: toTrimmedString(row.created_at),
      snippet,
      url: toOptionalString(row.url),
      score: parseNumberOrNull(row.score),
    });
  }
  return rows.slice(0, LIMITS.resourceLimit);
}

function normalizeMemoryRows(value: unknown): CommunitySearchPayloadMemoryRow[] {
  if (!Array.isArray(value)) return [];
  const rows: CommunitySearchPayloadMemoryRow[] = [];
  for (const entry of value) {
    const row = asRecord(entry);
    if (!row) continue;
    const sourceId = toTrimmedString(row.source_id);
    if (!sourceId) continue;
    const snippet = toTrimmedString(row.snippet);
    if (!snippet) continue;
    rows.push({
      source_type: "memory",
      source_id: sourceId,
      internal_source_id: toOptionalString(row.internal_source_id),
      title: toTrimmedString(row.title) || "Community memory",
      created_at: toTrimmedString(row.created_at),
      updated_at: toTrimmedString(row.updated_at),
      snippet,
      score: parseNumberOrNull(row.score),
    });
  }
  return rows.slice(0, LIMITS.resourceLimit);
}

function buildCommunityContextDiagnostics(params: {
  rawDiagnostics: unknown;
  fallbackUsed: boolean;
  chatItemsUsed: number;
  resourceItemsUsed: number;
  failureClassOverride?: string | null;
}): Record<string, unknown> {
  const base = asRecord(params.rawDiagnostics) ?? {};
  const failureClass = toTrimmedString(params.failureClassOverride) || toTrimmedString(base.failure_class);
  return buildCanonicalCommunityContextDiagnostics(
    {
      compiledAttempted: parseBool(base.attempted),
      compiledFetchOk: parseBool(base.compiled_fetch_ok),
      compiledItemsUsed: parseNumberOrNull(base.compiled_items_used) ?? 0,
      compileVersion: parseNumberOrNull(base.compile_version),
      fallbackUsed: parseBool(base.fallback_used) || params.fallbackUsed,
      chatFetchOk: parseNullableBool(base.chat_fetch_ok),
      resourceFetchOk: parseNullableBool(base.resource_fetch_ok),
      retrievalLatencyMs: parseNumberOrNull(base.retrieval_latency_ms),
      ...(failureClass ? { failureClass } : null),
    },
    params.chatItemsUsed,
    params.resourceItemsUsed,
  );
}

function buildNotEntitledDiagnostics(): Record<string, unknown> {
  return {
    attempted: false,
    compiled_fetch_ok: false,
    compiled_items_used: 0,
    compile_version: null,
    fallback_used: false,
    chat_fetch_ok: null,
    resource_fetch_ok: null,
    chat_items_used: 0,
    resource_items_used: 0,
    retrieval_latency_ms: null,
    failure_class: "not_entitled",
    quality_score: 0,
    quality_band: "none",
    contract_id: COMMUNITY_CONTEXT_OBSERVABILITY_CONTRACT_ID,
  };
}

function buildFailureDiagnostics(reasonCode: string | null): Record<string, unknown> {
  const failureClass = toTrimmedString(reasonCode) || "community_research_failed";
  return {
    attempted: true,
    compiled_fetch_ok: false,
    compiled_items_used: 0,
    compile_version: null,
    fallback_used: false,
    chat_fetch_ok: null,
    resource_fetch_ok: null,
    chat_items_used: 0,
    resource_items_used: 0,
    retrieval_latency_ms: null,
    failure_class: failureClass,
    quality_score: 0,
    quality_band: "none",
    contract_id: COMMUNITY_CONTEXT_OBSERVABILITY_CONTRACT_ID,
  };
}

function normalizeCommunityResearchFailureClass(params: {
  status: number;
  reasonCode: string | null;
}): string {
  const explicit = toTrimmedString(params.reasonCode);
  if (explicit) return explicit;
  if (params.status === 404 || params.status === 0 || params.status >= 500) {
    return COMMUNITY_HARNESS_UNAVAILABLE_FAILURE_CLASS;
  }
  return "community_research_failed";
}

function buildCommunityEvidenceUsedV1(params: {
  chatRows: CommunitySearchPayloadChatRow[];
  resourceRows: CommunitySearchPayloadResourceRow[];
  memoryRows: CommunitySearchPayloadMemoryRow[];
}): CommunityEvidenceUsedV1 | null {
  const items: CommunityEvidenceUsedV1["items"] = [];
  const seen = new Set<string>();
  const addItem = (item: CommunityEvidenceUsedV1["items"][number]): void => {
    if (items.length >= COMMUNITY_EVIDENCE_TOTAL_LIMIT) return;
    const key = `${item.source_type}:${item.source_id}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ ...item, rank: items.length + 1 });
  };

  for (const row of params.chatRows.slice(0, LIMITS.chatLimit)) {
    const sourceId = toTrimmedString(row.source_id);
    const internalSourceId = toTrimmedString(row.internal_source_id) || sourceId;
    const snippet = truncateUtf8ForPrompt(toTrimmedString(row.snippet), LIMITS.chatSnippetMaxChars).trim();
    if (!sourceId || !snippet) continue;
    const title =
      truncateUtf8ForPrompt(toTrimmedString(row.sender_display) || "Community chat", LIMITS.chatSenderMaxChars).trim() ||
      "Community chat";
    addItem({
      source_type: "chat",
      source_id: sourceId,
      internal_source_id: internalSourceId,
      title,
      snippet,
      url: null,
      score: parseNumberOrNull(row.score),
      rank: 0,
    });
  }

  for (const row of params.resourceRows.slice(0, LIMITS.resourceLimit)) {
    const sourceType = row.source_type === "memory" ? "memory" : "resource";
    const sourceId = toTrimmedString(row.source_id);
    const internalSourceId = toTrimmedString(row.internal_source_id) || sourceId;
    if (!sourceId) continue;
    const title =
      truncateUtf8ForPrompt(
        toTrimmedString(row.title) || (sourceType === "memory" ? "Community memory" : "Community resource"),
        LIMITS.resourceTitleMaxChars,
      ).trim() || (sourceType === "memory" ? "Community memory" : "Community resource");
    const snippet =
      truncateUtf8ForPrompt(toTrimmedString(row.snippet) || title, LIMITS.resourceSnippetMaxChars).trim() || title;
    const url = toOptionalString(truncateUtf8ForPrompt(toTrimmedString(row.url), LIMITS.resourceUrlMaxChars));
    addItem({
      source_type: sourceType,
      source_id: sourceId,
      internal_source_id: internalSourceId,
      title,
      snippet,
      url,
      score: parseNumberOrNull(row.score),
      rank: 0,
    });
  }

  for (const row of params.memoryRows.slice(0, LIMITS.resourceLimit)) {
    const sourceId = toTrimmedString(row.source_id);
    const internalSourceId = toTrimmedString(row.internal_source_id) || sourceId;
    if (!sourceId) continue;
    const title =
      truncateUtf8ForPrompt(toTrimmedString(row.title) || "Community memory", LIMITS.resourceTitleMaxChars).trim() ||
      "Community memory";
    const snippet =
      truncateUtf8ForPrompt(toTrimmedString(row.snippet) || title, LIMITS.resourceSnippetMaxChars).trim() || title;
    addItem({
      source_type: "memory",
      source_id: sourceId,
      internal_source_id: internalSourceId,
      title,
      snippet,
      url: null,
      score: parseNumberOrNull(row.score),
      rank: 0,
    });
  }

  if (items.length === 0) return null;
  return {
    v: 1,
    contract_id: COMMUNITY_EVIDENCE_USED_CONTRACT_ID,
    items,
  };
}

type CommunityResearchCallResult =
  | {
      ok: true;
      payload: CommunityResearchSuccessPayload;
    }
  | {
      ok: false;
      status: number;
      reasonCode: string | null;
      message: string;
      payload: CommunityResearchErrorPayload | null;
    };

async function callCommunityResearch(params: {
  getSupabaseUrl: () => string | null;
  fetchWithSupabaseAuth: FetchWithSupabaseAuth;
  session: SupabaseSession;
  communityId: string;
  communityName: string | null;
  query: string;
}): Promise<CommunityResearchCallResult> {
  const url = params.getSupabaseUrl();
  if (!url) {
    return {
      ok: false,
      status: 0,
      reasonCode: "missing_supabase_url",
      message: "Missing Supabase URL.",
      payload: null,
    };
  }

  const response = await params.fetchWithSupabaseAuth(
    `${url}/functions/v1/community_research`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        community_id: params.communityId,
        ...(params.communityName ? { community_name: params.communityName } : null),
        query: truncateUtf8ForPrompt(params.query, LIMITS.queryMaxChars),
        source_types: ["chat", "resource", "memory"],
        limit: LIMITS.compiledLimit,
      }),
    },
    params.session,
  );

  const rawText = await response.text();
  let payload: unknown = null;
  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch {
    payload = null;
  }

  const payloadRecord = asRecord(payload);
  const reasonCode = toTrimmedString(payloadRecord?.reason_code ?? null) || null;
  const errorText =
    toTrimmedString(payloadRecord?.message ?? null) ||
    toTrimmedString(payloadRecord?.error ?? null) ||
    toTrimmedString(rawText) ||
    `community_research failed (${response.status})`;

  if (!response.ok) {
    const normalizedReasonCode = normalizeCommunityResearchFailureClass({
      status: response.status,
      reasonCode,
    });
    return {
      ok: false,
      status: response.status,
      reasonCode: normalizedReasonCode,
      message: errorText,
      payload: payloadRecord as CommunityResearchErrorPayload | null,
    };
  }

  if (!payloadRecord || payloadRecord.ok !== true) {
    const normalizedReasonCode = normalizeCommunityResearchFailureClass({
      status: response.status,
      reasonCode,
    });
    return {
      ok: false,
      status: response.status,
      reasonCode: normalizedReasonCode,
      message: errorText,
      payload: payloadRecord as CommunityResearchErrorPayload | null,
    };
  }

  return {
    ok: true,
    payload: payloadRecord as CommunityResearchSuccessPayload,
  };
}

export async function loadCloudCommunityContextPreflight(params: {
  getSupabaseUrl: () => string | null;
  fetchWithSupabaseAuth: FetchWithSupabaseAuth;
  session: SupabaseSession;
  communityId: string | null;
  communityName?: string | null;
  query: string;
}): Promise<CloudCommunityContextPreflightResult> {
  const communityId = toTrimmedString(params.communityId);
  if (!communityId) {
    return {
      hasEntitlement: false,
      communityEvidenceUserMessage: null,
      communityEvidenceUsedV1: null,
      communityContextDiagnostics: null,
    };
  }

  const communityName = toOptionalString(params.communityName);

  let searchResult: CommunityResearchCallResult;
  try {
    searchResult = await callCommunityResearch({
      getSupabaseUrl: params.getSupabaseUrl,
      fetchWithSupabaseAuth: params.fetchWithSupabaseAuth,
      session: params.session,
      communityId,
      communityName,
      query: toTrimmedString(params.query),
    });
  } catch {
    return {
      hasEntitlement: true,
      communityEvidenceUserMessage: null,
      communityEvidenceUsedV1: null,
      communityContextDiagnostics: buildFailureDiagnostics(COMMUNITY_HARNESS_UNAVAILABLE_FAILURE_CLASS),
    };
  }

  if (!searchResult.ok) {
    const isEntitlementFailure =
      searchResult.reasonCode === "community_entitlement_required" ||
      searchResult.reasonCode === "not_entitled" ||
      searchResult.message.toLowerCase().includes("active community entitlement");
    if (isEntitlementFailure) {
      return {
        hasEntitlement: false,
        communityEvidenceUserMessage: null,
        communityEvidenceUsedV1: null,
        communityContextDiagnostics: buildNotEntitledDiagnostics(),
      };
    }
    if (searchResult.reasonCode === "no_active_community") {
      return {
        hasEntitlement: false,
        communityEvidenceUserMessage: null,
        communityEvidenceUsedV1: null,
        communityContextDiagnostics: buildFailureDiagnostics("no_active_community"),
      };
    }
    return {
      hasEntitlement: true,
      communityEvidenceUserMessage: null,
      communityEvidenceUsedV1: null,
      communityContextDiagnostics: buildFailureDiagnostics(
        normalizeCommunityResearchFailureClass({
          status: searchResult.status,
          reasonCode: searchResult.reasonCode,
        }),
      ),
    };
  }

  const payload = searchResult.payload;
  const chatRows = normalizeChatRows(payload.rows?.chat);
  const resourceRows = normalizeResourceRows(payload.rows?.resources);
  const memoryRows = normalizeMemoryRows(payload.rows?.memory);

  const promptBundle = buildCanonicalCommunityContextSystemPrompt({
    communityName: truncateUtf8ForPrompt(communityName || "active community", LIMITS.communityLabelMaxChars),
    chatItems: chatRows,
    resourceItems: resourceRows,
  });
  const evidenceUserMessage = buildCommunityEvidenceUserMessage(promptBundle.prompt);

  const diagnostics = buildCommunityContextDiagnostics({
    rawDiagnostics: payload.diagnostics,
    fallbackUsed: parseBool(payload.meta_recent_fallback_used),
    chatItemsUsed: promptBundle.chatItemsUsed,
    resourceItemsUsed: promptBundle.resourceItemsUsed,
  });

  return {
    hasEntitlement: true,
    communityEvidenceUserMessage: evidenceUserMessage,
    communityEvidenceUsedV1: buildCommunityEvidenceUsedV1({
      chatRows,
      resourceRows,
      memoryRows,
    }),
    communityContextDiagnostics: diagnostics,
  };
}

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { jsonResponse, noStoreHeaders, withStrictCors } from "../_shared/http.ts";
import { extractBearerToken, isAuthApiError, requireVerifiedUserId } from "../_shared/auth.ts";
import { getEnv } from "../_shared/env.ts";
import { edgeRateLimitAllow } from "../_shared/rate_limit.ts";
import { supabaseAdminFetch } from "../_shared/supabase_admin.ts";
import { consumeSseEvents, encodeSse } from "../_shared/sse.ts";
import { type PlatformModelRef } from "../_shared/platform_model_routing.ts";
import {
  consumePlatformInferenceStandard,
  edgeRateLimitAllowKey,
  evaluatePlatformInferenceEntitlement,
  loadUserBuilderTierForPlatformInference,
  resolvePlatformInferenceTarget,
  type PlatformBuilderTier,
} from "../_shared/platform_inference_core.ts";
import {
  checkCommunityHarnessContract,
  toCommunityHarnessContractMeta,
  type CommunityHarnessContractCheckResult,
} from "../_shared/community_harness_contract_check.ts";
import {
  COMMUNITY_EVIDENCE_USER_MESSAGE_PREFIX,
  COMMUNITY_CONTEXT_BUNDLE_V1,
  buildCommunityEvidenceUsedV1,
  buildCommunityEvidenceUserMessage,
  buildCommunityContextSystemPrompt,
  COMMUNITY_CONTEXT_OBSERVABILITY_CONTRACT_ID,
} from "./community_context_bundle_v1.mjs";
import {
  buildCloudCommunityContextEnvelope,
} from "../../../shared/communityContextEnvelope.ts";
import {
  sanitizeUserFacingAssistantText,
  USER_FACING_INTERNAL_IDENTIFIER_KEYS,
} from "../../../shared/communityUserFacingOutputSanitizer.mjs";
import {
  parseCommunitySearchSourceTypes,
  runCanonicalCommunitySearch,
  runCanonicalCommunityDeepResearch,
  type CommunitySearchSourceType,
} from "../_shared/community_research_orchestrator.ts";

const COMMUNITY_RPC = Object.freeze({
  activeCommunitySystemPrompt: "get_active_community_agent_system_prompt",
  entitlementCheck: "user_has_active_entitlement",
  memoryCandidatePropose: "community_memory_candidate_propose",
});
const COMMUNITY_HARNESS_CAPABILITY_CONTRACT_ID = "community_harness_capabilities_v3";
const COMMUNITY_HARNESS_RUNTIME_TOOLS = Object.freeze([
  "community_search",
  "community_memory_candidate_propose",
] as const);
function communityHarnessRuntimeTools(): string[] {
  return [...COMMUNITY_HARNESS_RUNTIME_TOOLS];
}

type AgentTurnInput = {
  thread_id: string;
  reply_to_id?: string;
  model_id?: string;
  max_tokens?: number;
  stream?: boolean;
  mode?: "respond" | "regenerate";
  inference_lane_fallbacks?: unknown;
};

type ApiError = Error & {
  code: string;
  status: number;
  details?: Record<string, unknown>;
};

const USER_FACING_INTERNAL_IDENTIFIER_KEY_SET = new Set(USER_FACING_INTERNAL_IDENTIFIER_KEYS);

function createApiError(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>,
): ApiError {
  const err = new Error(message) as ApiError;
  err.code = code;
  err.status = status;
  if (details) err.details = details;
  return err;
}

function isApiError(error: unknown): error is ApiError {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      "status" in error &&
      typeof (error as { code?: unknown }).code === "string" &&
      typeof (error as { status?: unknown }).status === "number",
  );
}

function stripInternalIdentifiersForUserFacingValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stripInternalIdentifiersForUserFacingValue(item));
  }
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (USER_FACING_INTERNAL_IDENTIFIER_KEY_SET.has(key)) continue;
    out[key] = stripInternalIdentifiersForUserFacingValue(raw);
  }
  return out;
}

function sanitizeApiErrorDetails(details: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!details || typeof details !== "object") return {};
  const sanitized = stripInternalIdentifiersForUserFacingValue(details);
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
    ? (sanitized as Record<string, unknown>)
    : {};
}

function sanitizeUuid(value: string): string {
  const v = (value ?? "").trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(v)) throw new Error("Invalid id");
  return v;
}

async function readJson<T>(req: Request): Promise<T> {
  const text = await req.text();
  if (!text) throw new Error("Missing JSON body");
  return JSON.parse(text) as T;
}

type ThreadRow = {
  id: string;
  owner_id: string;
  engine_id: string;
  model_id: string | null;
  community_id: string | null;
};

type CommunityAgentSystemPromptRow = {
  draft_id: string;
  system_prompt: string;
};

type UserMemorySettingsRow = {
  memory_mode: "off" | "suggest" | "auto";
  remember_intent_enabled: boolean;
};

type UserModelSettingsRow = {
  system_prompt: string;
};

type PersonalMemoryRow = {
  id: string;
  content: string;
  scope: "global" | "workspace";
  scope_id: string | null;
  pinned: boolean;
  updated_at: string;
};

function isPlatformQuotaExceededErrorMessage(message: string): boolean {
  const raw = String(message ?? "");
  return raw.toLowerCase().includes("platform_inference_quota_exceeded");
}

async function loadThread(threadId: string): Promise<ThreadRow> {
  const res = await supabaseAdminFetch(
    `/rest/v1/threads?id=eq.${encodeURIComponent(threadId)}&select=id,owner_id,engine_id,model_id,community_id`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as ThreadRow[];
  const row = rows[0];
  if (!row) throw new Error("Thread not found");
  return row;
}

async function loadCommunityDisplayName(communityId: string): Promise<string | null> {
  const id = String(communityId ?? "").trim();
  if (!id) return null;
  try {
    const res = await supabaseAdminFetch(
      `/rest/v1/communities?id=eq.${encodeURIComponent(id)}&select=name,slug&limit=1`,
      { method: "GET" },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ name?: unknown; slug?: unknown }>;
    const row = rows[0];
    const name = typeof row?.name === "string" ? row.name.trim() : "";
    if (name) return name;
    const slug = typeof row?.slug === "string" ? row.slug.trim() : "";
    return slug || null;
  } catch {
    return null;
  }
}

async function loadCommunityAgentSystemPrompt(params: {
  userId: string;
  communityId: string;
}): Promise<{ draftId: string; systemPrompt: string } | null> {
  const communityId = (params.communityId ?? "").trim();
  if (!communityId) return null;
  try {
    const res = await supabaseAdminFetch(`/rest/v1/rpc/${COMMUNITY_RPC.activeCommunitySystemPrompt}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ p_user_id: params.userId, p_community_id: communityId }),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<Partial<CommunityAgentSystemPromptRow>>;
    const row = rows[0];
    const systemPrompt = typeof row?.system_prompt === "string" ? row.system_prompt.trim() : "";
    if (!systemPrompt) return null;
    return { draftId: String(row?.draft_id ?? "").trim(), systemPrompt };
  } catch {
    // Best-effort: don't block inference if the RPC isn't deployed yet.
    return null;
  }
}

async function userHasActiveEntitlement(params: { userId: string; communityId: string }): Promise<boolean> {
  const userId = (params.userId ?? "").trim();
  const communityId = (params.communityId ?? "").trim();
  if (!userId || !communityId) return false;
  try {
    const res = await supabaseAdminFetch(`/rest/v1/rpc/${COMMUNITY_RPC.entitlementCheck}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ p_user_id: userId, p_community_id: communityId }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as unknown;
    return data === true;
  } catch {
    return false;
  }
}

async function loadUserMemorySettings(userId: string): Promise<UserMemorySettingsRow> {
  const res = await supabaseAdminFetch(
    `/rest/v1/user_memory_settings?select=memory_mode,remember_intent_enabled&user_id=eq.${encodeURIComponent(
      userId,
    )}&limit=1`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as Array<Partial<UserMemorySettingsRow>>;
  const row = rows[0];
  const mode = row?.memory_mode;
  return {
    memory_mode: mode === "suggest" || mode === "auto" ? mode : "off",
    remember_intent_enabled: row?.remember_intent_enabled !== false,
  };
}

async function loadUserModelSettings(userId: string): Promise<UserModelSettingsRow> {
  const res = await supabaseAdminFetch(
    `/rest/v1/user_model_settings?select=system_prompt&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
    { method: "GET" },
  );
  if (!res.ok) {
    // Best-effort: older deployments may not have this table yet.
    return { system_prompt: "" };
  }
  const rows = (await res.json()) as Array<Partial<UserModelSettingsRow>>;
  return { system_prompt: typeof rows[0]?.system_prompt === "string" ? rows[0]!.system_prompt! : "" };
}

async function loadPersonalMemoryItems(userId: string, limit = 32): Promise<PersonalMemoryRow[]> {
  const safeLimit = Math.max(0, Math.min(200, Math.floor(limit)));
  if (safeLimit === 0) return [];
  const res = await supabaseAdminFetch(
    `/rest/v1/personal_memory_items?select=id,content,scope,scope_id,pinned,updated_at&user_id=eq.${encodeURIComponent(
      userId,
    )}&scope=eq.global&order=pinned.desc,updated_at.desc&limit=${safeLimit}`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as PersonalMemoryRow[];
}

type HistorySnippetRow = {
  thread_id: string;
  message_id: string;
  created_at: string;
  snippet: string;
};

type CommunityChatSnippetRow = {
  thread_id: string;
  message_id: string;
  sender_id: string | null;
  sender_display: string;
  created_at: string;
  snippet: string;
};

type CommunityResourceSnippetRow = {
  resource_id: string;
  resource_type: string;
  title: string;
  created_at: string;
  pinned: boolean;
  snippet: string;
  url: string | null;
  file_key: string | null;
};

async function loadHistorySnippets(params: {
  userId: string;
  query: string;
  excludeThreadId: string;
  limit?: number;
}): Promise<HistorySnippetRow[]> {
  const q = (params.query ?? "").trim();
  if (q.length < 4) return [];
  const res = await supabaseAdminFetch("/rest/v1/rpc/search_user_message_snippets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_user_id: params.userId,
      p_query: q.slice(0, 240),
      p_exclude_thread_id: params.excludeThreadId,
      p_limit: Math.max(0, Math.min(12, Math.floor(params.limit ?? 6))),
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as HistorySnippetRow[];
}

async function proposeCommunityMemoryCandidate(params: {
  communityId: string;
  userAccessToken: string | null;
  title?: string | null;
  memoryText: string;
  evidence: Record<string, unknown>;
  requestKey?: string | null;
}): Promise<CommunityMemoryCandidateProposeRow | null> {
  const res = await supabaseAdminFetch(`/rest/v1/rpc/${COMMUNITY_RPC.memoryCandidatePropose}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(params.userAccessToken ? { Authorization: `Bearer ${params.userAccessToken}` } : {}),
    },
    body: JSON.stringify({
      p_community_id: params.communityId,
      p_title: params.title ?? null,
      p_memory_text: params.memoryText,
      p_evidence: params.evidence,
      p_request_key: params.requestKey ?? null,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as CommunityMemoryCandidateProposeRow[] | CommunityMemoryCandidateProposeRow | null;
  if (Array.isArray(rows)) return rows[0] ?? null;
  if (rows && typeof rows === "object") return rows;
  return null;
}

function parseToolArguments(raw: string): Record<string, unknown> {
  const input = String(raw ?? "").trim();
  if (!input) return {};
  try {
    const parsed = JSON.parse(input) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fallthrough
  }
  return {};
}

function readToolStringArg(args: Record<string, unknown>, key: string): string | null {
  const value = args[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readToolLimitArg(
  args: Record<string, unknown>,
  fallback = COMMUNITY_CONTEXT_BUNDLE_V1.limits.compiledLimit,
): number {
  const raw = args.limit;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(1, Math.min(12, Math.floor(raw)));
  }
  if (typeof raw === "string") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return Math.max(1, Math.min(12, Math.floor(parsed)));
  }
  return Math.max(1, Math.min(12, Math.floor(fallback)));
}

type InferenceLaneFallbackItem = {
  from: "chatgpt" | "platform" | "public";
  to: "chatgpt" | "platform" | "public";
  reason: string;
};

function normalizeInferenceLaneFallbacks(value: unknown): InferenceLaneFallbackItem[] {
  if (!Array.isArray(value)) return [];
  const out: InferenceLaneFallbackItem[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    const from = String(item.from ?? "").trim().toLowerCase();
    const to = String(item.to ?? "").trim().toLowerCase();
    const reason = truncateUtf8(String(item.reason ?? "").trim(), 120);
    if (
      (from !== "chatgpt" && from !== "platform" && from !== "public") ||
      (to !== "chatgpt" && to !== "platform" && to !== "public") ||
      !reason
    ) {
      continue;
    }
    const key = `${from}:${to}:${reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      from: from as InferenceLaneFallbackItem["from"],
      to: to as InferenceLaneFallbackItem["to"],
      reason,
    });
    if (out.length >= 8) break;
  }
  return out;
}

const COMMUNITY_MEMORY_EVIDENCE_REQUIRED_REASON_CODE = "evidence_required";
const COMMUNITY_MEMORY_EVIDENCE_REQUIRED_ERROR =
  "community_memory_candidate_propose requires evidence.items with at least one provenance item.";

function hasValidCommunityEvidenceProvenanceItem(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const sourceType = String(item.source_type ?? "").trim().toLowerCase();
  const sourceId = String(item.source_id ?? "").trim();
  return (
    (sourceType === "chat" || sourceType === "resource" || sourceType === "memory")
    && sourceId.length > 0
  );
}

function validateCommunityMemoryProposalEvidence(
  value: unknown,
):
  | { ok: true; evidence: Record<string, unknown> }
  | { ok: false; reasonCode: typeof COMMUNITY_MEMORY_EVIDENCE_REQUIRED_REASON_CODE; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      reasonCode: COMMUNITY_MEMORY_EVIDENCE_REQUIRED_REASON_CODE,
      error: COMMUNITY_MEMORY_EVIDENCE_REQUIRED_ERROR,
    };
  }
  const evidence = value as Record<string, unknown>;
  const items = Array.isArray(evidence.items) ? evidence.items : [];
  const hasProvenance = items.some((item) => hasValidCommunityEvidenceProvenanceItem(item));
  if (!hasProvenance) {
    return {
      ok: false,
      reasonCode: COMMUNITY_MEMORY_EVIDENCE_REQUIRED_REASON_CODE,
      error: COMMUNITY_MEMORY_EVIDENCE_REQUIRED_ERROR,
    };
  }
  return { ok: true, evidence };
}

function mergeCommunityEvidenceRows(params: {
  chatRows: CommunityChatSnippetRow[];
  resourceRows: CommunityResourceSnippetRow[];
  nextChatRows: CommunityChatSnippetRow[];
  nextResourceRows: CommunityResourceSnippetRow[];
}): { chatRows: CommunityChatSnippetRow[]; resourceRows: CommunityResourceSnippetRow[] } {
  const chatMap = new Map<string, CommunityChatSnippetRow>();
  const resourceMap = new Map<string, CommunityResourceSnippetRow>();

  for (const row of params.chatRows) {
    const key = `${row.thread_id}:${row.message_id}`;
    if (!chatMap.has(key)) chatMap.set(key, row);
  }
  for (const row of params.nextChatRows) {
    const key = `${row.thread_id}:${row.message_id}`;
    chatMap.set(key, row);
  }

  for (const row of params.resourceRows) {
    const key = `${row.resource_id}:${row.resource_type}`;
    if (!resourceMap.has(key)) resourceMap.set(key, row);
  }
  for (const row of params.nextResourceRows) {
    const key = `${row.resource_id}:${row.resource_type}`;
    resourceMap.set(key, row);
  }

  return {
    chatRows: Array.from(chatMap.values()).slice(0, COMMUNITY_CONTEXT_BUNDLE_V1.limits.chatLimit),
    resourceRows: Array.from(resourceMap.values()).slice(0, COMMUNITY_CONTEXT_BUNDLE_V1.limits.resourceLimit),
  };
}

type CommunityContextPrefetchResult = {
  chatRows: CommunityChatSnippetRow[];
  resourceRows: CommunityResourceSnippetRow[];
  diagnostics: Record<string, unknown> | null;
};

type CanonicalCommunitySearchRuntimeResult =
  | Awaited<ReturnType<typeof runCanonicalCommunitySearch>>
  | Awaited<ReturnType<typeof runCanonicalCommunityDeepResearch>>;

async function executeCanonicalCommunitySearch(params: {
  userId: string;
  communityId: string;
  query: string;
  limit: number;
  sourceTypes: CommunitySearchSourceType[];
}): Promise<CanonicalCommunitySearchRuntimeResult> {
  try {
    return await runCanonicalCommunityDeepResearch({
      userId: params.userId,
      communityId: params.communityId,
      query: params.query,
      limit: params.limit,
      sourceTypes: params.sourceTypes,
    });
  } catch {
    return await runCanonicalCommunitySearch({
      userId: params.userId,
      communityId: params.communityId,
      query: params.query,
      limit: params.limit,
      sourceTypes: params.sourceTypes,
    });
  }
}

function buildCommunityContextFailureDiagnostics(
  failureClass: string,
): Record<string, unknown> {
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
    failure_class: failureClass,
    quality_score: 0,
    quality_band: "none",
    contract_id: COMMUNITY_CONTEXT_OBSERVABILITY_CONTRACT_ID,
  };
}

async function loadCommunityContextViaCanonicalSearch(params: {
  userId: string;
  communityId: string;
  query: string;
}): Promise<CommunityContextPrefetchResult> {
  const result = await executeCanonicalCommunitySearch({
    userId: params.userId,
    communityId: params.communityId,
    query: params.query,
    limit: COMMUNITY_CONTEXT_BUNDLE_V1.limits.compiledLimit,
    sourceTypes: ["chat", "resource", "memory"],
  });
  const merged = mergeCommunityEvidenceRows({
    chatRows: [],
    resourceRows: [],
    nextChatRows: result.chatRows,
    nextResourceRows: result.resourceRows,
  });
  const diagnosticsRaw = asRecord(result.diagnostics) ?? {};
  return {
    chatRows: merged.chatRows,
    resourceRows: merged.resourceRows,
    diagnostics: {
      ...diagnosticsRaw,
      ...(result.metaRecentFallbackUsed
        ? { meta_recent_fallback_used: true, fallback_used: true }
        : null),
    },
  };
}

async function runCommunityToolCall(params: {
  toolName: CommunityToolName;
  rawArguments: string;
  defaultCommunityId: string | null;
  defaultCommunityName: string | null;
  userId: string;
  userAccessToken: string | null;
  aliasLookup: CommunityEvidenceAliasLookup;
}): Promise<CommunityToolLoopCallResult> {
  const args = parseToolArguments(params.rawArguments);
  const communityId = String(params.defaultCommunityId ?? "").trim();
  const communityName = String(params.defaultCommunityName ?? "").trim() || null;
  const requestedCommunityId = readToolStringArg(args, "community_id");
  if (!communityId) {
    return {
      payload: {
        ok: false,
        tool: params.toolName,
        reason_code: "no_active_community",
        error: "community tool calls require an active thread community context.",
      },
      chatRows: [],
      resourceRows: [],
      aliasLookupUpdates: {},
    };
  }

  try {
    switch (params.toolName) {
      case "community_search": {
        const query = readToolStringArg(args, "query") ?? "";
        const limit = readToolLimitArg(args, COMMUNITY_CONTEXT_BUNDLE_V1.limits.compiledLimit);
        const sourceTypes: CommunitySearchSourceType[] = parseCommunitySearchSourceTypes(args);
        const searchResult = await executeCanonicalCommunitySearch({
          userId: params.userId,
          communityId,
          query,
          limit,
          sourceTypes,
        });
        const payloadChatRows = sanitizeCommunitySearchPayloadChatRows(searchResult.chatRows);
        const payloadResourceRows = sanitizeCommunitySearchPayloadResourceRows(searchResult.resourceRows);
        const payloadMemoryRows = sanitizeCommunitySearchPayloadMemoryRows(searchResult.memoryRows);
        const toolChatRows = payloadChatRows.map(({ internal_source_id: _internalSourceId, ...row }) => row);
        const toolResourceRows = payloadResourceRows.map(({ internal_source_id: _internalSourceId, ...row }) => row);
        const toolMemoryRows = payloadMemoryRows.map(({ internal_source_id: _internalSourceId, ...row }) => row);
        const aliasLookupUpdates = buildCommunitySearchAliasLookupUpdates({
          payloadChatRows,
          payloadResourceRows,
          payloadMemoryRows,
          internalChatRows: searchResult.chatRows,
          internalResourceRows: searchResult.resourceRows,
          internalMemoryRows: searchResult.memoryRows,
        });
        return {
          payload: {
            ok: true,
            tool: params.toolName,
            canonical_tool: "community_search",
            community_scope: "thread_context",
            ...(communityName ? { community_name: communityName } : {}),
            ...(requestedCommunityId && requestedCommunityId !== communityId
              ? { requested_community_id_ignored: true }
              : {}),
            query,
            limit,
            source_types: sourceTypes,
            query_plan: searchResult.queryPlan,
            executed_queries: searchResult.executedQueries,
            ...("deepQueryPlan" in searchResult ? { deep_query_plan: searchResult.deepQueryPlan } : null),
            ...("passCount" in searchResult ? { pass_count: searchResult.passCount } : null),
            ...("stopReason" in searchResult ? { stop_reason: searchResult.stopReason } : null),
            diagnostics: searchResult.diagnostics,
            meta_recent_fallback_used: searchResult.metaRecentFallbackUsed,
            rows: {
              chat: toolChatRows,
              resources: toolResourceRows,
              memory: toolMemoryRows,
            },
          },
          chatRows: searchResult.chatRows,
          resourceRows: searchResult.resourceRows,
          aliasLookupUpdates,
        };
      }
      case "community_memory_candidate_propose": {
        const memoryText = readToolStringArg(args, "memory_text");
        if (!memoryText) {
          return {
            payload: { ok: false, tool: params.toolName, error: "memory_text is required." },
            chatRows: [],
            resourceRows: [],
            aliasLookupUpdates: {},
          };
        }
        const title = readToolStringArg(args, "title");
        const requestKey = readToolStringArg(args, "request_key");
        const evidenceValidation = validateCommunityMemoryProposalEvidence(args.evidence);
        if (!evidenceValidation.ok) {
          return {
            payload: {
              ok: false,
              tool: params.toolName,
              reason_code: evidenceValidation.reasonCode,
              error: evidenceValidation.error,
              community_scope: "thread_context",
              ...(communityName ? { community_name: communityName } : {}),
              ...(requestedCommunityId && requestedCommunityId !== communityId
                ? { requested_community_id_ignored: true }
                : {}),
            },
            chatRows: [],
            resourceRows: [],
            aliasLookupUpdates: {},
          };
        }
        const evidence = resolveCommunityProposalEvidenceForRpc({
          evidence: evidenceValidation.evidence,
          aliasLookup: params.aliasLookup,
        });
        const result = await proposeCommunityMemoryCandidate({
          communityId,
          userAccessToken: params.userAccessToken,
          title,
          memoryText,
          evidence,
          requestKey,
        });
        return {
          payload: {
            ok: true,
            tool: params.toolName,
            community_scope: "thread_context",
            ...(communityName ? { community_name: communityName } : {}),
            ...(requestedCommunityId && requestedCommunityId !== communityId
              ? { requested_community_id_ignored: true }
              : {}),
            title: title ?? null,
            memory_text_preview: truncateUtf8(memoryText, 200),
            result,
          },
          chatRows: [],
          resourceRows: [],
          aliasLookupUpdates: {},
        };
      }
      default:
        return {
          payload: {
            ok: false,
            tool: params.toolName,
            error: `Unsupported community tool: ${params.toolName}`,
          },
          chatRows: [],
          resourceRows: [],
          aliasLookupUpdates: {},
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
        payload: {
          ok: false,
          tool: params.toolName,
          community_scope: "thread_context",
          ...(communityName ? { community_name: communityName } : {}),
          ...(requestedCommunityId && requestedCommunityId !== communityId
            ? { requested_community_id_ignored: true }
            : {}),
          error: message,
        },
        chatRows: [],
        resourceRows: [],
        aliasLookupUpdates: {},
      };
  }
}

type MessageRow = {
  id: string;
  role: "user" | "assistant" | "system";
  content_json: unknown;
  seq: number;
};

async function loadRecentMessages(threadId: string, limit = 50): Promise<MessageRow[]> {
  const res = await supabaseAdminFetch(
    `/rest/v1/messages?select=id,role,content_json,seq&thread_id=eq.${encodeURIComponent(threadId)}&order=seq.desc&limit=${limit}`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as MessageRow[];
}

async function loadRecentMessagesUpToSeq(threadId: string, maxSeq: number, limit = 50): Promise<MessageRow[]> {
  const seq = Number.isFinite(maxSeq) ? Math.max(0, Math.floor(maxSeq)) : 0;
  const res = await supabaseAdminFetch(
    `/rest/v1/messages?select=id,role,content_json,seq&thread_id=eq.${encodeURIComponent(
      threadId,
    )}&seq=lte.${seq}&order=seq.desc&limit=${limit}`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as MessageRow[];
}

async function loadMessageById(threadId: string, messageId: string): Promise<MessageRow | null> {
  const res = await supabaseAdminFetch(
    `/rest/v1/messages?select=id,role,content_json,seq&thread_id=eq.${encodeURIComponent(
      threadId,
    )}&id=eq.${encodeURIComponent(messageId)}&limit=1`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as MessageRow[];
  return rows[0] ?? null;
}

function extractTextFromContentJson(contentJson: unknown): string {
  if (contentJson === null || contentJson === undefined) return "";
  if (typeof contentJson === "string") {
    const trimmed = contentJson.trim();
    if (!trimmed) return "";
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return extractTextFromContentJson(parsed);
    } catch {
      return trimmed;
    }
  }
  if (typeof contentJson === "object") {
    const asAny = contentJson as any;
    const baseText =
      typeof asAny.text === "string"
        ? asAny.text
        : typeof asAny.body === "string"
          ? asAny.body
          : typeof asAny.content === "string"
            ? asAny.content
            : "";

    const attachments = Array.isArray(asAny.attachments) ? (asAny.attachments as any[]) : [];
    if (attachments.length === 0) return baseText;

    const maxAttachments = 6;
    const maxPerAttachmentChars = 8000;
    const maxTotalAttachmentChars = 20000;
    let budget = maxTotalAttachmentChars;

    const blocks: string[] = [];
    for (const item of attachments) {
      if (blocks.length >= maxAttachments) break;
      if (!item || typeof item !== "object") continue;
      const name = String((item as any).name ?? "attachment").trim() || "attachment";
      const text = typeof (item as any).text === "string" ? String((item as any).text) : "";
      const truncated = (item as any).truncated === true;
      const dataUrl = typeof (item as any).data_url === "string" ? String((item as any).data_url) : "";
      const type = String((item as any).type ?? "").trim();

      if (text.trim()) {
        const snippetRaw = text.length > maxPerAttachmentChars ? text.slice(0, maxPerAttachmentChars) : text;
        const snippet = snippetRaw + (text.length > maxPerAttachmentChars || truncated ? "\n…[truncated]" : "");
        const block = `[Attachment: ${name}]\n\`\`\`\n${snippet}\n\`\`\``;
        if (block.length > budget) break;
        blocks.push(block);
        budget -= block.length;
        continue;
      }

      if ((type === "image" || dataUrl.startsWith("data:image/")) && name) {
        const block = `[Image attachment: ${name}]`;
        if (block.length > budget) break;
        blocks.push(block);
        budget -= block.length;
        continue;
      }

      const block = `[Attachment: ${name}]`;
      if (block.length > budget) break;
      blocks.push(block);
      budget -= block.length;
    }

    if (blocks.length === 0) return baseText;
    return baseText ? `${baseText}\n\n${blocks.join("\n\n")}` : blocks.join("\n\n");
  }
  return "";
}

type OpenRouterChatMessage = { role: "system" | "user" | "assistant" | "tool"; content: string };

type CommunityToolName = (typeof COMMUNITY_HARNESS_RUNTIME_TOOLS)[number];

type CommunityMemorySearchRow = {
  memory_id: string;
  community_id: string;
  title: string | null;
  snippet: string;
  source: string | null;
  created_at: string;
  updated_at: string;
  score: number | null;
};

type CommunityMemoryCandidateProposeRow = {
  candidate_id?: string;
  router_state?: string;
  signal_score?: number | null;
  router_reason?: string | null;
  promoted_memory_id?: string | null;
  created_at?: string;
  [key: string]: unknown;
};

type OpenAiToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

type OpenAiUsage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };

type OpenAiToolCall = {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
};

type OpenAiMessageContentPart = { type?: string; text?: string };

type OpenAiChatMessagePayload = {
  role?: string;
  content?: string | OpenAiMessageContentPart[] | null;
  tool_calls?: OpenAiToolCall[];
};

type OpenAiChatCompletion = {
  choices?: Array<{ message?: OpenAiChatMessagePayload; finish_reason?: string | null }>;
  usage?: OpenAiUsage;
};

type OpenAiCompatibleCompletionResult = {
  text: string;
  usage?: OpenAiUsage;
  toolCalls: OpenAiToolCall[];
  finishReason: string | null;
};

type CommunityToolLoopCallResult = {
  payload: Record<string, unknown>;
  chatRows: CommunityChatSnippetRow[];
  resourceRows: CommunityResourceSnippetRow[];
  aliasLookupUpdates: CommunityEvidenceAliasLookup;
};

type CommunityToolLoopResult = {
  text: string;
  usage?: OpenAiUsage;
  toolCalls: CommunityToolTraceItem[];
  communityEvidenceUsedV1: ReturnType<typeof buildCommunityEvidenceUsedV1>;
};

const COMMUNITY_TOOL_LOOP_MAX_STEPS = 4;
const COMMUNITY_AUTO_SEARCH_FEEDBACK_MAX_CHARS = 12000;

type CommunityToolTraceItem = {
  name: string;
  ok: boolean;
  mode?: "model" | "auto";
};

type CommunityEvidenceSourceType = "chat" | "resource" | "memory";

type CommunityEvidenceAliasLookup = Record<
  string,
  {
    source_type: CommunityEvidenceSourceType;
    source_id: string;
  }
>;

type CommunitySearchPayloadChatRow = {
  source_type: "chat";
  source_id: string;
  sender_display: string;
  created_at: string;
  snippet: string;
};

type CommunitySearchPayloadResourceRow = {
  source_type: "resource" | "memory";
  source_id: string;
  title: string;
  created_at: string;
  snippet: string;
  url: string | null;
};

type CommunitySearchPayloadMemoryRow = {
  source_type: "memory";
  source_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  snippet: string;
  score: number | null;
};

function sanitizeCommunitySearchPayloadChatRows(
  rows: CommunityChatSnippetRow[],
): CommunitySearchPayloadChatRow[] {
  return rows.map((row, idx) => ({
    source_type: "chat",
    source_id: `chat_${idx + 1}`,
    sender_display: String(row.sender_display ?? "").trim() || "member",
    created_at: String(row.created_at ?? "").trim(),
    snippet: String(row.snippet ?? "").trim(),
  }));
}

function sanitizeCommunitySearchPayloadResourceRows(
  rows: CommunityResourceSnippetRow[],
): CommunitySearchPayloadResourceRow[] {
  const counts = new Map<string, number>();
  return rows.map((row) => {
    const sourceType = String(row.resource_type ?? "").trim().toLowerCase() === "memory" ? "memory" : "resource";
    const next = (counts.get(sourceType) ?? 0) + 1;
    counts.set(sourceType, next);
    return {
      source_type: sourceType,
      source_id: `${sourceType}_${next}`,
      title: String(row.title ?? "").trim() || (sourceType === "memory" ? "Community memory" : "Community resource"),
      created_at: String(row.created_at ?? "").trim(),
      snippet: String(row.snippet ?? "").trim(),
      url: typeof row.url === "string" && row.url.trim() ? row.url.trim() : null,
    };
  });
}

function sanitizeCommunitySearchPayloadMemoryRows(
  rows: CommunityMemorySearchRow[],
): CommunitySearchPayloadMemoryRow[] {
  return rows.map((row, idx) => ({
    source_type: "memory",
    source_id: `memory_${idx + 1}`,
    title: String(row.title ?? "").trim() || "Community memory",
    created_at: String(row.created_at ?? "").trim(),
    updated_at: String(row.updated_at ?? "").trim(),
    snippet: String(row.snippet ?? "").trim(),
    score: typeof row.score === "number" && Number.isFinite(row.score) ? row.score : null,
  }));
}

function communityEvidenceAliasLookupKey(sourceType: string, sourceId: string): string {
  return `${String(sourceType ?? "").trim().toLowerCase()}:${String(sourceId ?? "").trim()}`;
}

function buildCommunitySearchAliasLookupUpdates(params: {
  payloadChatRows: CommunitySearchPayloadChatRow[];
  payloadResourceRows: CommunitySearchPayloadResourceRow[];
  payloadMemoryRows: CommunitySearchPayloadMemoryRow[];
  internalChatRows: CommunityChatSnippetRow[];
  internalResourceRows: CommunityResourceSnippetRow[];
  internalMemoryRows: CommunityMemorySearchRow[];
}): CommunityEvidenceAliasLookup {
  const out: CommunityEvidenceAliasLookup = {};
  for (let idx = 0; idx < params.payloadChatRows.length; idx += 1) {
    const alias = params.payloadChatRows[idx];
    const internal = params.internalChatRows[idx];
    const internalSourceId = String(internal?.message_id ?? "").trim();
    if (!alias || !internalSourceId) continue;
    out[communityEvidenceAliasLookupKey("chat", alias.source_id)] = {
      source_type: "chat",
      source_id: internalSourceId,
    };
  }
  for (let idx = 0; idx < params.payloadResourceRows.length; idx += 1) {
    const alias = params.payloadResourceRows[idx];
    const internal = params.internalResourceRows[idx];
    const aliasSourceType = alias?.source_type === "memory" ? "memory" : "resource";
    const internalSourceId = String(internal?.resource_id ?? "").trim();
    if (!alias || !internalSourceId) continue;
    out[communityEvidenceAliasLookupKey(aliasSourceType, alias.source_id)] = {
      source_type: aliasSourceType,
      source_id: internalSourceId,
    };
  }
  for (let idx = 0; idx < params.payloadMemoryRows.length; idx += 1) {
    const alias = params.payloadMemoryRows[idx];
    const internal = params.internalMemoryRows[idx];
    const internalSourceId = String(internal?.memory_id ?? "").trim();
    if (!alias || !internalSourceId) continue;
    out[communityEvidenceAliasLookupKey("memory", alias.source_id)] = {
      source_type: "memory",
      source_id: internalSourceId,
    };
  }
  return out;
}

function resolveCommunityProposalEvidenceForRpc(params: {
  evidence: Record<string, unknown>;
  aliasLookup: CommunityEvidenceAliasLookup;
}): Record<string, unknown> {
  const evidenceItems = Array.isArray(params.evidence.items) ? params.evidence.items : [];
  const resolvedItems = evidenceItems.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
    const item = { ...(raw as Record<string, unknown>) };
    const internalSourceId = String(item.internal_source_id ?? "").trim();
    if (internalSourceId) {
      item.source_id = internalSourceId;
      return item;
    }
    const sourceType = String(item.source_type ?? "").trim().toLowerCase();
    const sourceId = String(item.source_id ?? "").trim();
    if (!sourceType || !sourceId) return item;
    const resolved = params.aliasLookup[communityEvidenceAliasLookupKey(sourceType, sourceId)];
    if (!resolved || resolved.source_type !== sourceType) return item;
    item.source_id = resolved.source_id;
    return item;
  });
  return {
    ...params.evidence,
    items: resolvedItems,
  };
}

function sanitizeCommunityEvidenceUsedForUserFacing(
  value: ReturnType<typeof buildCommunityEvidenceUsedV1>,
): ReturnType<typeof buildCommunityEvidenceUsedV1> {
  if (!value || typeof value !== "object") return null;
  const itemsRaw = Array.isArray(value.items) ? value.items : [];
  const counts = new Map<CommunityEvidenceSourceType, number>();
  const items = itemsRaw.map((item) => {
    const sourceType = String(item?.source_type ?? "").trim().toLowerCase();
    const normalizedType: CommunityEvidenceSourceType =
      sourceType === "chat" ? "chat" : sourceType === "memory" ? "memory" : "resource";
    const next = (counts.get(normalizedType) ?? 0) + 1;
    counts.set(normalizedType, next);
    const internalSourceId = String(item?.source_id ?? "").trim();
    return {
      ...item,
      source_type: normalizedType,
      source_id: `${normalizedType}_${next}`,
      ...(internalSourceId ? { internal_source_id: internalSourceId } : {}),
    };
  });
  return {
    ...value,
    items,
  };
}

function buildCommunityRuntimeToolDefinitions(): OpenAiToolDefinition[] {
  return [
    {
      type: "function",
      function: {
        name: "community_search",
        description:
          "Search the active thread community for chat/resource/memory evidence snippets. Read-only.",
        parameters: {
          type: "object",
          additionalProperties: false,
          required: [],
          properties: {
            query: { type: "string", maxLength: 240 },
            source_types: {
              type: "array",
              items: { type: "string", enum: ["chat", "resource", "memory"] },
              minItems: 1,
              maxItems: 3,
            },
            limit: { type: "integer", minimum: 1, maximum: 12 },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "community_memory_candidate_propose",
        description:
          "Propose a candidate memory item for the active thread community's governed memory router.",
        parameters: {
          type: "object",
          additionalProperties: false,
          required: ["memory_text", "evidence"],
          properties: {
            title: { type: "string", maxLength: 160 },
            memory_text: { type: "string", minLength: 1, maxLength: 32000 },
            evidence: {
              type: "object",
              additionalProperties: true,
              required: ["items"],
              properties: {
                v: { type: "integer" },
                contract_id: { type: "string", maxLength: 128 },
                items: {
                  type: "array",
                  minItems: 1,
                  maxItems: 32,
                  items: {
                    type: "object",
                    additionalProperties: true,
                    required: ["source_type", "source_id"],
                    properties: {
                      source_type: { type: "string", enum: ["chat", "resource", "memory"] },
                      source_id: { type: "string", minLength: 1, maxLength: 256 },
                      title: { type: "string", maxLength: 240 },
                      snippet: { type: "string", maxLength: 2400 },
                      url: { type: "string", maxLength: 2048 },
                      score: { type: "number" },
                      rank: { type: "integer", minimum: 1, maximum: 128 },
                    },
                  },
                },
              },
            },
            request_key: { type: "string", maxLength: 128 },
          },
        },
      },
    },
  ];
}

function extractOpenAiMessageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const text = (part as OpenAiMessageContentPart).text;
      return typeof text === "string" ? text : "";
    })
    .join("");
}

async function openAiChatCompletion(
  openaiKey: string,
  model: string,
  messages: OpenRouterChatMessage[],
  maxTokens: number,
): Promise<{ text: string; usage?: OpenAiUsage }> {
  return openAiCompatibleChatCompletion({
    apiKey: openaiKey,
    baseUrl: "https://api.openai.com/v1",
    model,
    messages,
    maxTokens,
  });
}

async function openAiCompatibleChatCompletionRaw(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  messages: Array<Record<string, unknown>>;
  maxTokens: number;
  tools?: OpenAiToolDefinition[];
  toolChoice?: "auto" | "none";
}): Promise<OpenAiCompatibleCompletionResult> {
  const url = `${params.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const tokenKey = params.baseUrl.includes("api.openai.com") ? "max_completion_tokens" : "max_tokens";
  const payload = Object.assign(
    {
      model: params.model,
      messages: params.messages,
      stream: false,
    },
    { [tokenKey]: params.maxTokens },
    params.tools && params.tools.length > 0
      ? { tools: params.tools, tool_choice: params.toolChoice ?? "auto" }
      : {},
  );
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`OpenAI-compatible error ${res.status}: ${text}`);
  const parsed = JSON.parse(text) as OpenAiChatCompletion;
  const choice = parsed.choices?.[0] ?? null;
  const message = choice?.message ?? null;
  const out = extractOpenAiMessageText(message?.content ?? "").trim();
  const toolCalls = Array.isArray(message?.tool_calls)
    ? message!.tool_calls!
        .map((call) => ({
          id: typeof call?.id === "string" ? call.id : undefined,
          type: typeof call?.type === "string" ? call.type : undefined,
          function: {
            name: typeof call?.function?.name === "string" ? call.function.name : undefined,
            arguments:
              typeof call?.function?.arguments === "string" ? call.function.arguments : undefined,
          },
        }))
        .filter((call) => typeof call.function?.name === "string" && call.function.name.trim().length > 0)
    : [];
  return {
    text: out,
    usage: parsed.usage,
    toolCalls,
    finishReason: typeof choice?.finish_reason === "string" ? choice.finish_reason : null,
  };
}

async function openAiCompatibleChatCompletion(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  messages: OpenRouterChatMessage[];
  maxTokens: number;
}): Promise<{ text: string; usage?: OpenAiUsage }> {
  const completion = await openAiCompatibleChatCompletionRaw({
    apiKey: params.apiKey,
    baseUrl: params.baseUrl,
    model: params.model,
    messages: params.messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    maxTokens: params.maxTokens,
  });
  const out = completion.text.trim();
  if (!out) throw new Error("Model returned an empty response");
  return { text: out, usage: completion.usage };
}

type OpenRouterStreamChunk = {
  choices?: Array<{
    delta?: { content?: string | null } | null;
    message?: { content?: string | null } | null;
    text?: string | null;
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

function extractStreamDelta(chunk: OpenRouterStreamChunk): string {
  const choice = chunk.choices?.[0];
  const fromDelta = choice?.delta && typeof choice.delta.content === "string" ? choice.delta.content : null;
  const fromText = typeof choice?.text === "string" ? choice.text : null;
  const fromMessage = choice?.message && typeof choice.message.content === "string" ? choice.message.content : null;
  return (fromDelta ?? fromText ?? fromMessage ?? "").toString();
}

type AnthropicRole = "user" | "assistant";
type AnthropicMessage = { role: AnthropicRole; content: string };

function toAnthropicSystemAndMessages(messages: OpenRouterChatMessage[]): { system: string; messages: AnthropicMessage[] } {
  const systemParts: string[] = [];
  const out: AnthropicMessage[] = [];
  for (const msg of messages) {
    if (!msg) continue;
    const role = msg.role;
    const content = String(msg.content ?? "");
    if (!content.trim()) continue;
    if (role === "system") {
      systemParts.push(content);
      continue;
    }
    if (role === "user" || role === "assistant") {
      out.push({ role, content });
    }
  }
  const system = systemParts.map((part) => part.trim()).filter(Boolean).join("\n\n---\n\n");
  // Anthropic expects alternating user/assistant; merge consecutive same-role messages.
  const merged: AnthropicMessage[] = [];
  for (const msg of out) {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === msg.role) {
      prev.content = `${prev.content}\n\n${msg.content}`;
      continue;
    }
    merged.push({ ...msg });
  }
  return { system, messages: merged };
}

type AnthropicUsage = { input_tokens?: number; output_tokens?: number };
type AnthropicResponse = { content?: Array<{ type?: string; text?: string }>; usage?: AnthropicUsage };

async function anthropicChatCompletion(params: {
  apiKey: string;
  model: string;
  messages: OpenRouterChatMessage[];
  maxTokens: number;
  stream: false;
}): Promise<{ text: string; usage?: AnthropicUsage }> {
  const { system, messages } = toAnthropicSystemAndMessages(params.messages);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": params.apiKey,
      "anthropic-version": getEnv("ANTHROPIC_VERSION") || "2023-06-01",
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: params.maxTokens,
      stream: false,
      ...(system ? { system } : {}),
      messages,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${text}`);
  const parsed = JSON.parse(text) as AnthropicResponse;
  const blocks = Array.isArray(parsed.content) ? parsed.content : [];
  const out = blocks
    .filter((b) => b && b.type === "text" && typeof b.text === "string")
    .map((b) => String(b.text))
    .join("")
    .trim();
  if (!out) throw new Error("Model returned an empty response");
  return { text: out, usage: parsed.usage };
}

type GeminiRole = "user" | "model";
type GeminiPart = { text: string };
type GeminiContent = { role: GeminiRole; parts: GeminiPart[] };

function toGeminiSystemAndContents(messages: OpenRouterChatMessage[]): { system: string; contents: GeminiContent[] } {
  const systemParts: string[] = [];
  const raw: GeminiContent[] = [];
  for (const msg of messages) {
    if (!msg) continue;
    const content = String(msg.content ?? "");
    if (!content.trim()) continue;
    if (msg.role === "system") {
      systemParts.push(content);
      continue;
    }
    if (msg.role === "user") {
      raw.push({ role: "user", parts: [{ text: content }] });
      continue;
    }
    if (msg.role === "assistant") {
      raw.push({ role: "model", parts: [{ text: content }] });
      continue;
    }
  }
  const system = systemParts.map((part) => part.trim()).filter(Boolean).join("\n\n---\n\n");

  const merged: GeminiContent[] = [];
  for (const item of raw) {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === item.role) {
      prev.parts[0]!.text = `${prev.parts[0]!.text}\n\n${item.parts[0]!.text}`;
      continue;
    }
    merged.push({ role: item.role, parts: [{ text: item.parts[0]!.text }] });
  }

  return { system, contents: merged };
}

type GeminiUsage = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  cachedContentTokenCount?: number;
  thoughtsTokenCount?: number;
};

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: GeminiUsage;
};

async function googleGenerateContent(params: {
  apiKey: string;
  model: string;
  messages: OpenRouterChatMessage[];
  maxTokens: number;
}): Promise<{ text: string; usage?: GeminiUsage }> {
  const { system, contents } = toGeminiSystemAndContents(params.messages);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    params.model,
  )}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": params.apiKey,
    },
    body: JSON.stringify({
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents,
      generationConfig: { maxOutputTokens: params.maxTokens },
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Google error ${res.status}: ${text}`);
  const parsed = JSON.parse(text) as GeminiResponse;
  const parts = parsed.candidates?.[0]?.content?.parts ?? [];
  const out = parts
    .map((p) => (typeof p?.text === "string" ? p.text : ""))
    .join("")
    .trim();
  if (!out) throw new Error("Model returned an empty response");
  return { text: out, usage: parsed.usageMetadata };
}

function normalizeToolCall(call: OpenAiToolCall): OpenAiToolCall {
  const name = typeof call?.function?.name === "string" ? call.function.name.trim() : "";
  const toolCallId = typeof call?.id === "string" && call.id.trim() ? call.id.trim() : `call_${crypto.randomUUID()}`;
  return {
    id: toolCallId,
    type: "function",
    function: {
      name,
      arguments: typeof call?.function?.arguments === "string" ? call.function.arguments : "{}",
    },
  };
}

function asCommunityToolName(value: string): CommunityToolName | null {
  if ((COMMUNITY_HARNESS_RUNTIME_TOOLS as readonly string[]).includes(value)) {
    return value as CommunityToolName;
  }
  return null;
}

function hasCommunityEvidenceRows(
  chatRows: CommunityChatSnippetRow[],
  resourceRows: CommunityResourceSnippetRow[],
): boolean {
  return chatRows.length > 0 || resourceRows.length > 0;
}

function latestUserPromptText(messages: OpenRouterChatMessage[]): string {
  for (let idx = messages.length - 1; idx >= 0; idx -= 1) {
    const message = messages[idx];
    if (!message || message.role !== "user") continue;
    const text = String(message.content ?? "").trim();
    if (!text) continue;
    if (text.startsWith(COMMUNITY_EVIDENCE_USER_MESSAGE_PREFIX)) continue;
    return text;
  }
  return "";
}

async function runOpenAiCommunityToolLoop(params: {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  messages: OpenRouterChatMessage[];
  userId: string;
  userAccessToken: string | null;
  defaultCommunityId: string | null;
  defaultCommunityName: string | null;
  seedChatRows: CommunityChatSnippetRow[];
  seedResourceRows: CommunityResourceSnippetRow[];
}): Promise<CommunityToolLoopResult> {
  const toolDefinitions = buildCommunityRuntimeToolDefinitions();
  const toolTrace: CommunityToolTraceItem[] = [];
  let chatRows = [...params.seedChatRows];
  let resourceRows = [...params.seedResourceRows];
  let aliasLookup: CommunityEvidenceAliasLookup = {};
  let usage: OpenAiUsage | undefined;
  let lastAssistantText = "";
  let autoSearchAttempted = false;
  const autoSearchQuery = truncateUtf8(
    latestUserPromptText(params.messages).trim(),
    COMMUNITY_CONTEXT_BUNDLE_V1.limits.queryMaxChars,
  );
  const workingMessages: Array<Record<string, unknown>> = params.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));

  for (let step = 0; step < COMMUNITY_TOOL_LOOP_MAX_STEPS; step += 1) {
    const completion = await openAiCompatibleChatCompletionRaw({
      apiKey: params.apiKey,
      baseUrl: params.baseUrl,
      model: params.model,
      messages: workingMessages,
      maxTokens: params.maxTokens,
      tools: toolDefinitions,
      toolChoice: "auto",
    });
    usage = completion.usage ?? usage;
    if (completion.text.trim()) lastAssistantText = completion.text.trim();
    const toolCalls = completion.toolCalls.map(normalizeToolCall);

    if (toolCalls.length === 0) {
      if (
        !hasCommunityEvidenceRows(chatRows, resourceRows) &&
        !autoSearchAttempted
      ) {
        autoSearchAttempted = true;
        const autoResult = await runCommunityToolCall({
          toolName: "community_search",
          rawArguments: JSON.stringify({
            query: autoSearchQuery,
            source_types: ["chat", "resource", "memory"],
            limit: COMMUNITY_CONTEXT_BUNDLE_V1.limits.compiledLimit,
          }),
          defaultCommunityId: params.defaultCommunityId,
          defaultCommunityName: params.defaultCommunityName,
          userId: params.userId,
          userAccessToken: params.userAccessToken,
          aliasLookup,
        });
        if (Object.keys(autoResult.aliasLookupUpdates).length > 0) {
          aliasLookup = { ...aliasLookup, ...autoResult.aliasLookupUpdates };
        }
        toolTrace.push({
          name: "community_search",
          ok: autoResult.payload.ok === true,
          mode: "auto",
        });

        if (autoResult.chatRows.length > 0 || autoResult.resourceRows.length > 0) {
          const merged = mergeCommunityEvidenceRows({
            chatRows,
            resourceRows,
            nextChatRows: autoResult.chatRows,
            nextResourceRows: autoResult.resourceRows,
          });
          chatRows = merged.chatRows;
          resourceRows = merged.resourceRows;
        }

        const autoFeedback = truncateUtf8(
          [
            "Automatic community retrieval pass executed because no evidence was available yet.",
            `Use this retrieval output as evidence and continue research only if needed:`,
            JSON.stringify(autoResult.payload),
          ].join("\n"),
          COMMUNITY_AUTO_SEARCH_FEEDBACK_MAX_CHARS,
        );
        workingMessages.push({
          role: "user",
          content: autoFeedback,
        });
        continue;
      }

      const finalText = completion.text.trim() || lastAssistantText;
      if (!finalText) throw new Error("Model returned an empty response");
      return {
        text: finalText,
        usage,
        toolCalls: toolTrace,
        communityEvidenceUsedV1: buildCommunityEvidenceUsedV1(chatRows, resourceRows),
      };
    }

    workingMessages.push({
      role: "assistant",
      content: completion.text.trim() || null,
      tool_calls: toolCalls,
    });

    for (const rawToolCall of toolCalls) {
      const toolCallId = String(rawToolCall.id ?? "").trim() || `call_${crypto.randomUUID()}`;
      const toolNameRaw = String(rawToolCall.function?.name ?? "").trim();
      const maybeToolName = asCommunityToolName(toolNameRaw);
      if (!maybeToolName) {
        toolTrace.push({ name: toolNameRaw || "unknown", ok: false, mode: "model" });
        workingMessages.push({
          role: "tool",
          tool_call_id: toolCallId,
          content: JSON.stringify({
            ok: false,
            tool: toolNameRaw || "unknown",
            error: "Unsupported tool requested by model.",
          }),
        });
        continue;
      }

      const result = await runCommunityToolCall({
        toolName: maybeToolName,
        rawArguments: typeof rawToolCall.function?.arguments === "string"
          ? rawToolCall.function.arguments
          : "{}",
        defaultCommunityId: params.defaultCommunityId,
        defaultCommunityName: params.defaultCommunityName,
        userId: params.userId,
        userAccessToken: params.userAccessToken,
        aliasLookup,
      });
      if (Object.keys(result.aliasLookupUpdates).length > 0) {
        aliasLookup = { ...aliasLookup, ...result.aliasLookupUpdates };
      }
      toolTrace.push({ name: maybeToolName, ok: result.payload.ok === true, mode: "model" });
      if (result.chatRows.length > 0 || result.resourceRows.length > 0) {
        const merged = mergeCommunityEvidenceRows({
          chatRows,
          resourceRows,
          nextChatRows: result.chatRows,
          nextResourceRows: result.resourceRows,
        });
        chatRows = merged.chatRows;
        resourceRows = merged.resourceRows;
      }
      workingMessages.push({
        role: "tool",
        tool_call_id: toolCallId,
        content: JSON.stringify(result.payload),
      });
    }
  }

  if (!lastAssistantText) {
    throw new Error("Tool loop exceeded maximum depth before final response.");
  }
  return {
    text: lastAssistantText,
    usage,
    toolCalls: toolTrace,
    communityEvidenceUsedV1: buildCommunityEvidenceUsedV1(chatRows, resourceRows),
  };
}

async function insertAssistantMessage(params: {
  threadId: string;
  replyToId: string;
  contentText: string;
  modelId: string;
  openrouterModelId: string;
  runId: string;
  meta: Record<string, unknown> | null;
}): Promise<{ inserted: boolean }> {
  const contentJson: Record<string, unknown> = { text: params.contentText };
  if (params.meta && Object.keys(params.meta).length > 0) contentJson.meta = params.meta;
  const res = await supabaseAdminFetch(
    "/rest/v1/messages?select=id",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        thread_id: params.threadId,
        role: "assistant",
        content_json: contentJson,
        engine_id: "agent_web",
        model_id: params.modelId,
        run_id: params.runId,
        reply_to_id: params.replyToId,
      }),
    },
  );

  if (res.ok) return { inserted: true };

  // Idempotency: if another worker already inserted the assistant reply, treat as success.
  const body = await res.text();
  if (res.status === 409 || body.includes("duplicate key") || body.includes("23505")) {
    return { inserted: false };
  }

  throw new Error(body || "Failed to insert assistant message");
}

async function loadAssistantReplyId(threadId: string, replyToId: string): Promise<string | null> {
  const res = await supabaseAdminFetch(
    `/rest/v1/messages?select=id&thread_id=eq.${encodeURIComponent(threadId)}&reply_to_id=eq.${encodeURIComponent(
      replyToId,
    )}&role=eq.assistant&limit=1`,
    { method: "GET" },
  );
  if (!res.ok) throw new Error(await res.text());
  const rows = (await res.json()) as Array<{ id: string }>;
  const id = String(rows[0]?.id ?? "").trim();
  return id ? id : null;
}

async function updateAssistantMessage(params: {
  id: string;
  contentText: string;
  modelId: string;
  runId: string;
  meta: Record<string, unknown> | null;
}): Promise<void> {
  const contentJson: Record<string, unknown> = { text: params.contentText };
  if (params.meta && Object.keys(params.meta).length > 0) contentJson.meta = params.meta;
  const res = await supabaseAdminFetch(
    `/rest/v1/messages?id=eq.${encodeURIComponent(params.id)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        content_json: contentJson,
        engine_id: "agent_web",
        model_id: params.modelId,
        run_id: params.runId,
        edited_at: new Date().toISOString(),
      }),
    },
  );
  if (!res.ok) throw new Error(await res.text());
}

async function writeAssistantReply(params: {
  threadId: string;
  replyToId: string;
  contentText: string;
  modelId: string;
  openrouterModelId: string;
  runId: string;
  meta: Record<string, unknown> | null;
  allowUpdate: boolean;
}): Promise<{ status: "inserted" | "duplicate" | "updated" }> {
  if (params.allowUpdate) {
    const existingId = await loadAssistantReplyId(params.threadId, params.replyToId);
    if (existingId) {
      await updateAssistantMessage({
        id: existingId,
        contentText: params.contentText,
        modelId: params.modelId,
        runId: params.runId,
        meta: params.meta,
      });
      return { status: "updated" };
    }
  }

  const { inserted } = await insertAssistantMessage(params);
  if (inserted) return { status: "inserted" };
  if (params.allowUpdate) {
    const existingId = await loadAssistantReplyId(params.threadId, params.replyToId);
    if (existingId) {
      await updateAssistantMessage({
        id: existingId,
        contentText: params.contentText,
        modelId: params.modelId,
        runId: params.runId,
        meta: params.meta,
      });
      return { status: "updated" };
    }
  }
  return { status: "duplicate" };
}

function truncateUtf8(input: string, maxChars: number): string {
  const text = (input ?? "").trim();
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars).trimEnd() + "…";
}

function selectPersonalMemoryForPrompt(items: PersonalMemoryRow[]): PersonalMemoryRow[] {
  const pinned: PersonalMemoryRow[] = [];
  const recent: PersonalMemoryRow[] = [];
  for (const item of items) {
    if (!item || typeof item.content !== "string") continue;
    const content = item.content.trim();
    if (!content) continue;
    (item.pinned ? pinned : recent).push(item);
  }
  const maxPinned = 6;
  const maxTotal = 10;
  const out: PersonalMemoryRow[] = [];
  for (const item of pinned) {
    if (out.length >= maxPinned) break;
    out.push(item);
  }
  for (const item of recent) {
    if (out.length >= maxTotal) break;
    out.push(item);
  }
  return out;
}

function buildPersonalMemorySystemPrompt(items: PersonalMemoryRow[]): string | null {
  if (items.length === 0) return null;
  const maxItemChars = 420;
  const lines = items.map((item) => `- ${truncateUtf8(item.content, maxItemChars)}`).filter(Boolean);
  if (lines.length === 0) return null;

  return [
    "Personal memory (user-provided, explicit, durable):",
    ...lines,
    "",
    "Use this memory only when relevant to the user's request. If it's not clearly relevant, ignore it.",
    "If memory may be outdated or ambiguous, ask a clarifying question.",
    "Do not mention these notes unless the user asks about them.",
  ].join("\n");
}

type MemoryCandidate = {
  content: string;
  pinned: boolean;
};

const MEMORY_EXTRACTION_CUE_RE =
  /\b(my|mine|i\b|i'm|im|i am|favorite|prefer|like|love|hate|allerg|timezone|from|live|work|job|call me|name is)\b/i;

function looksLikeQuestion(text: string): boolean {
  const input = (text ?? "").trim();
  if (!input) return false;
  if (input.includes("?")) return true;
  const lower = input.toLowerCase().replace(/[’']/g, "");
  return /^(do|does|did|can|could|would|should|is|are|am|was|were|what|whats|which|who|whos|when|where|wheres|why|how|hows)\b/.test(
    lower,
  );
}

const MEMORY_STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "if",
  "then",
  "this",
  "that",
  "these",
  "those",
  "i",
  "me",
  "my",
  "mine",
  "you",
  "your",
  "yours",
  "we",
  "us",
  "our",
  "ours",
  "he",
  "him",
  "his",
  "she",
  "her",
  "hers",
  "they",
  "them",
  "their",
  "theirs",
  "it",
  "its",
  "to",
  "of",
  "in",
  "on",
  "for",
  "with",
  "at",
  "from",
  "as",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
]);

function normalizeMemoryText(input: string): string {
  return (input ?? "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeMemoryText(input: string): string[] {
  const normalized = normalizeMemoryText(input);
  if (!normalized) return [];
  return normalized
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !MEMORY_STOPWORDS.has(token))
    .slice(0, 24);
}

function memoryJaccardSimilarity(aTokens: Set<string>, bTokens: Set<string>): { score: number; overlap: number } {
  if (aTokens.size === 0 || bTokens.size === 0) return { score: 0, overlap: 0 };
  let overlap = 0;
  for (const token of aTokens) if (bTokens.has(token)) overlap += 1;
  const union = new Set([...aTokens, ...bTokens]).size;
  return { score: union === 0 ? 0 : overlap / union, overlap };
}

function isNearDuplicateMemory(candidate: string, existing: string): boolean {
  const a = normalizeMemoryText(candidate);
  const b = normalizeMemoryText(existing);
  if (!a || !b) return false;
  if (a === b) return true;

  if (a.includes(b) || b.includes(a)) {
    const shorter = Math.min(a.length, b.length);
    const longer = Math.max(a.length, b.length);
    if (shorter >= 12 && shorter / longer >= 0.7) return true;
  }

  const aTokens = new Set(tokenizeMemoryText(a));
  const bTokens = new Set(tokenizeMemoryText(b));
  const { score, overlap } = memoryJaccardSimilarity(aTokens, bTokens);
  return overlap >= 2 && score >= 0.75;
}

function shouldAttemptMemoryExtraction(params: {
  userText: string;
  priorAssistantText: string;
  existingMemory: PersonalMemoryRow[];
}): boolean {
  const userText = (params.userText ?? "").trim();
  if (!userText) return false;
  if (userText.length < 6) return false;
  if (looksLikeQuestion(userText)) return false;

  // If the user is explicitly describing themselves/preferences, attempt extraction.
  if (MEMORY_EXTRACTION_CUE_RE.test(userText)) return true;

  // If the prior assistant message was a question about user preferences, attempt extraction even if user reply is terse.
  const prior = (params.priorAssistantText ?? "").trim();
  if (prior && looksLikeQuestion(prior) && MEMORY_EXTRACTION_CUE_RE.test(prior)) return true;

  // If the user is making a short correction that overlaps existing memory (e.g. refining a preference), attempt extraction.
  if (userText.length > 120) return false;
  const userTokens = new Set(tokenizeMemoryText(userText));
  if (userTokens.size < 2) return false;
  for (const row of params.existingMemory) {
    const memText = String(row?.content ?? "").trim();
    if (!memText) continue;
    const memTokens = new Set(tokenizeMemoryText(memText));
    const { overlap } = memoryJaccardSimilarity(userTokens, memTokens);
    if (overlap >= 1) return true;
  }
  return false;
}

function buildHistorySystemPrompt(items: HistorySnippetRow[]): string | null {
  if (items.length === 0) return null;
  const lines = items
    .map((item) => {
      const snippet = truncateUtf8(item.snippet ?? "", 260);
      return snippet ? `- ${snippet}` : null;
    })
    .filter(Boolean) as string[];
  if (lines.length === 0) return null;
  return [
    "Relevant past context (from previous chats):",
    ...lines,
    "",
    "Use this context only when relevant. If it might be outdated, ask a clarifying question.",
  ].join("\n");
}

function safeJsonParseArray(input: string): unknown[] | null {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    const start = trimmed.indexOf("[");
    const end = trimmed.lastIndexOf("]");
    if (start < 0 || end <= start) return null;
    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}

function normalizeMemoryCandidates(raw: unknown[]): MemoryCandidate[] {
  const out: MemoryCandidate[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const content = typeof record.content === "string" ? record.content.trim() : "";
    if (!content) continue;
    // Never store questions as memory.
    if (looksLikeQuestion(content)) continue;
    out.push({
      content: content.length > 240 ? content.slice(0, 240).trimEnd() + "…" : content,
      pinned: Boolean(record.pinned),
    });
  }
  const deduped = new Map<string, MemoryCandidate>();
  for (const item of out) {
    const key = item.content.toLowerCase();
    if (!deduped.has(key)) deduped.set(key, item);
  }
  return Array.from(deduped.values()).slice(0, 3);
}

async function extractMemoryCandidatesViaOpenAi(params: {
  openaiKey: string;
  baseUrl?: string;
  model: string;
  userText: string;
  priorAssistantText?: string;
}): Promise<MemoryCandidate[]> {
  const userText = (params.userText ?? "").trim();
  if (!userText) return [];
  const priorAssistantText = (params.priorAssistantText ?? "").trim();

  const prompt: OpenRouterChatMessage[] = [
    {
      role: "system",
      content:
        "You extract durable personal memory about a user.\n" +
        "Return ONLY valid JSON: an array of objects {\"content\": string, \"pinned\": boolean}.\n" +
        "Rules:\n" +
        "- Only store durable facts/preferences/goals that are likely helpful later.\n" +
        "- Do not store one-off tasks, transient details, secrets, or sensitive info.\n" +
        "- Never store questions; only store declarative facts about the user.\n" +
        "- You may use the prior assistant message for context, but only store facts the user explicitly states or affirms.\n" +
        "- If nothing should be remembered, return [].\n" +
        "- Keep each content item short (<= 200 chars).",
    },
    {
      role: "user",
      content:
        (priorAssistantText ? `Prior assistant message:\n${truncateUtf8(priorAssistantText, 600)}\n\n` : "") +
        `User message:\n${truncateUtf8(userText, 1600)}`,
    },
  ];

  const { text } = await openAiCompatibleChatCompletion({
    apiKey: params.openaiKey,
    baseUrl: params.baseUrl ?? "https://api.openai.com/v1",
    model: params.model,
    messages: prompt,
    maxTokens: 220,
  });
  const parsed = safeJsonParseArray(text);
  if (!parsed) return [];
  return normalizeMemoryCandidates(parsed);
}

async function extractMemoryCandidatesViaAnthropic(params: {
  apiKey: string;
  model: string;
  userText: string;
  priorAssistantText?: string;
}): Promise<MemoryCandidate[]> {
  const userText = (params.userText ?? "").trim();
  if (!userText) return [];
  const priorAssistantText = (params.priorAssistantText ?? "").trim();

  const prompt: OpenRouterChatMessage[] = [
    {
      role: "system",
      content:
        "You extract durable personal memory about a user.\n" +
        "Return ONLY valid JSON: an array of objects {\"content\": string, \"pinned\": boolean}.\n" +
        "Rules:\n" +
        "- Only store durable facts/preferences/goals that are likely helpful later.\n" +
        "- Do not store one-off tasks, transient details, secrets, or sensitive info.\n" +
        "- Never store questions; only store declarative facts about the user.\n" +
        "- You may use the prior assistant message for context, but only store facts the user explicitly states or affirms.\n" +
        "- If nothing should be remembered, return [].\n" +
        "- Keep each content item short (<= 200 chars).",
    },
    {
      role: "user",
      content:
        (priorAssistantText ? `Prior assistant message:\n${truncateUtf8(priorAssistantText, 600)}\n\n` : "") +
        `User message:\n${truncateUtf8(userText, 1600)}`,
    },
  ];

  const { text } = await anthropicChatCompletion({
    apiKey: params.apiKey,
    model: params.model,
    messages: prompt,
    maxTokens: 220,
    stream: false,
  });
  const parsed = safeJsonParseArray(text);
  if (!parsed) return [];
  return normalizeMemoryCandidates(parsed);
}

async function extractMemoryCandidatesViaGoogle(params: {
  apiKey: string;
  model: string;
  userText: string;
  priorAssistantText?: string;
}): Promise<MemoryCandidate[]> {
  const userText = (params.userText ?? "").trim();
  if (!userText) return [];
  const priorAssistantText = (params.priorAssistantText ?? "").trim();

  const prompt: OpenRouterChatMessage[] = [
    {
      role: "system",
      content:
        "You extract durable personal memory about a user.\n" +
        "Return ONLY valid JSON: an array of objects {\"content\": string, \"pinned\": boolean}.\n" +
        "Rules:\n" +
        "- Only store durable facts/preferences/goals that are likely helpful later.\n" +
        "- Do not store one-off tasks, transient details, secrets, or sensitive info.\n" +
        "- Never store questions; only store declarative facts about the user.\n" +
        "- You may use the prior assistant message for context, but only store facts the user explicitly states or affirms.\n" +
        "- If nothing should be remembered, return [].\n" +
        "- Keep each content item short (<= 200 chars).",
    },
    {
      role: "user",
      content:
        (priorAssistantText ? `Prior assistant message:\n${truncateUtf8(priorAssistantText, 600)}\n\n` : "") +
        `User message:\n${truncateUtf8(userText, 1600)}`,
    },
  ];

  const { text } = await googleGenerateContent({
    apiKey: params.apiKey,
    model: params.model,
    messages: prompt,
    maxTokens: 220,
  });
  const parsed = safeJsonParseArray(text);
  if (!parsed) return [];
  return normalizeMemoryCandidates(parsed);
}

async function insertPersonalMemoryItems(params: {
  userId: string;
  candidates: MemoryCandidate[];
  existing: PersonalMemoryRow[];
}): Promise<PersonalMemoryRow[]> {
  const updatedAt = new Date().toISOString();

  const existing = params.existing
    .map((row) => ({
      ...row,
      content: String(row.content ?? "").trim(),
    }))
    .filter((row) => row.content);

  const results: PersonalMemoryRow[] = [];
  const toInsert: Array<{ content: string; pinned: boolean }> = [];

  for (const cand of params.candidates) {
    const content = String(cand.content ?? "").trim();
    if (!content) continue;
    if (looksLikeQuestion(content)) continue;

    // If this is a refinement of an existing memory, update in place instead of inserting a duplicate.
    const match = existing.find((row) => isNearDuplicateMemory(content, row.content));
    if (match) {
      const nextPinned = Boolean(match.pinned) || Boolean(cand.pinned);
      const same = normalizeMemoryText(match.content) === normalizeMemoryText(content);
      if (!same || nextPinned !== Boolean(match.pinned)) {
        const res = await supabaseAdminFetch(
          `/rest/v1/personal_memory_items?id=eq.${encodeURIComponent(
            match.id,
          )}&select=id,content,scope,scope_id,pinned,updated_at`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Prefer: "return=representation",
            },
            body: JSON.stringify({
              content,
              pinned: nextPinned,
              updated_at: updatedAt,
            }),
          },
        );
        if (res.ok) {
          const rows = (await res.json()) as PersonalMemoryRow[];
          const row = rows[0];
          if (row) {
            results.push(row);
            match.content = content;
            match.pinned = nextPinned;
            match.updated_at = updatedAt;
          }
        }
      }
      continue;
    }

    // Avoid inserting near-duplicates within the same batch.
    if (toInsert.some((prev) => isNearDuplicateMemory(content, prev.content))) continue;

    toInsert.push({ content, pinned: Boolean(cand.pinned) });
  }

  if (toInsert.length > 0) {
    const res = await supabaseAdminFetch(
      "/rest/v1/personal_memory_items?select=id,content,scope,scope_id,pinned,updated_at",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(
          toInsert.map((row) => ({
            user_id: params.userId,
            content: row.content,
            scope: "global",
            scope_id: null,
            pinned: row.pinned,
            updated_at: updatedAt,
          })),
        ),
      },
    );
    if (res.ok) {
      const inserted = (await res.json()) as PersonalMemoryRow[];
      results.push(...inserted);
    }
  }

  return results;
}

Deno.serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  const withRequestId = (body: Record<string, unknown>): Record<string, unknown> => ({
    ...body,
    request_id: requestId,
  });
  const cors = withStrictCors(noStoreHeaders({ "x-arx-request-id": requestId }), req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: cors.allowed ? 204 : 403, headers: cors.headers });
  }
  if (!cors.allowed) {
    return jsonResponse(withRequestId({ ok: false, error: "cors_origin_not_allowed" }), { status: 403, headers: cors.headers });
  }
  const headers = cors.headers;
  if (req.method !== "POST") {
    return jsonResponse(withRequestId({ ok: false, error: "method_not_allowed" }), { status: 405, headers });
  }

  try {
    let userId: string;
    let userAccessToken: string | null = null;
    try {
      userId = await requireVerifiedUserId(req);
      userAccessToken = extractBearerToken(req);
    } catch (error) {
      if (isAuthApiError(error)) {
        throw createApiError(error.code, error.message, error.status, error.details);
      }
      throw error;
    }
    const input = await readJson<AgentTurnInput>(req);
    const threadId = sanitizeUuid(input.thread_id);
    const inferenceLaneFallbacks = normalizeInferenceLaneFallbacks(input.inference_lane_fallbacks);
    const replyToIdRaw = typeof input.reply_to_id === "string" ? input.reply_to_id.trim() : "";
    let requestedReplyToId: string | null = null;
    if (replyToIdRaw) {
      try {
        requestedReplyToId = sanitizeUuid(replyToIdRaw);
      } catch {
        throw createApiError("invalid_reply_to_id", "Invalid reply target.", 400);
      }
    }
    const maxTokens = Number.isFinite(input.max_tokens) ? Math.max(1, Math.min(4096, Number(input.max_tokens))) : 2048;
    const wantsStream = Boolean(input.stream);

    const thread = await loadThread(threadId);
    if ((thread.engine_id ?? "").trim() === "community_chat") throw new Error("forbidden");
    if ((thread.owner_id ?? "").trim() !== userId) throw new Error("forbidden");
    const requestedModelId = typeof input.model_id === "string" ? input.model_id.trim() : "";
    const aliasModelId = requestedModelId || (thread.model_id ?? "").trim() || "gpt-5.2";

    // Parallelize I/O to reduce time-to-first-token.
    const [
      rowsDescResult,
      builderTierResult,
      memorySettingsResult,
      modelSettingsResult,
      memoryRowsResult,
      contextEntitlementResult,
      communityAgentPromptResult,
      communityDisplayNameResult,
    ] = await Promise.allSettled([
      loadRecentMessages(threadId, 40),
      loadUserBuilderTierForPlatformInference(userId),
      loadUserMemorySettings(userId),
      loadUserModelSettings(userId),
      loadPersonalMemoryItems(userId, 32),
      thread.community_id ? userHasActiveEntitlement({ userId, communityId: thread.community_id }) : Promise.resolve(true),
      thread.community_id
        ? loadCommunityAgentSystemPrompt({ userId, communityId: thread.community_id })
        : Promise.resolve(null),
      thread.community_id ? loadCommunityDisplayName(thread.community_id) : Promise.resolve(null),
    ]);

    if (rowsDescResult.status !== "fulfilled") throw rowsDescResult.reason;

    let rowsDesc = rowsDescResult.value;
    if (rowsDesc.length === 0) throw new Error("No messages in thread");

    if (requestedReplyToId) {
      let replyTarget = rowsDesc.find((row) => row.id === requestedReplyToId) ?? null;
      if (!replyTarget) {
        replyTarget = await loadMessageById(threadId, requestedReplyToId);
      }
      if (!replyTarget) {
        throw createApiError("reply_to_not_found", "Reply target was not found.", 404);
      }
      if (replyTarget.role !== "user") {
        throw createApiError("invalid_reply_to", "reply_to_id must reference a user message.", 400);
      }
      const boundedRowsDesc = await loadRecentMessagesUpToSeq(threadId, replyTarget.seq, 40);
      rowsDesc = boundedRowsDesc.length > 0 ? boundedRowsDesc : [replyTarget];
    }

    const builderTier: PlatformBuilderTier =
      builderTierResult.status === "fulfilled" ? builderTierResult.value : "free";
    const hasPersonalMemoryAccess = builderTier !== "free";

    const inferenceSource = "platform" as const;

    const platformEntitlement = evaluatePlatformInferenceEntitlement(builderTier);
    if (!platformEntitlement.allowed && platformEntitlement.reason === "platform_inference_disabled") {
      throw createApiError("platform_inference_disabled", "Arx AI is temporarily unavailable.", 503, {
        model_id: aliasModelId,
      });
    }
    if (!platformEntitlement.allowed && platformEntitlement.reason === "platform_inference_not_allowed") {
      throw createApiError("platform_inference_not_allowed", "Arx AI isn't available on your current plan.", 403, {
        model_id: aliasModelId,
        tier: builderTier,
      });
    }

    const memorySettings: UserMemorySettingsRow =
      memorySettingsResult.status === "fulfilled"
        ? memorySettingsResult.value
        : { memory_mode: "off", remember_intent_enabled: true };

    if (!hasPersonalMemoryAccess) {
      memorySettings.memory_mode = "off";
    }

    const modelSettings: UserModelSettingsRow =
      modelSettingsResult.status === "fulfilled"
        ? modelSettingsResult.value
        : { system_prompt: "" };

    const memoryRows: PersonalMemoryRow[] = hasPersonalMemoryAccess
      ? memoryRowsResult.status === "fulfilled"
        ? memoryRowsResult.value
        : []
      : [];

    const hasCommunityContextEntitlement: boolean =
      contextEntitlementResult.status === "fulfilled" ? Boolean(contextEntitlementResult.value) : false;
    const threadCommunityId: string | null = thread.community_id ?? null;
    let communityContractResult: CommunityHarnessContractCheckResult | null = null;
    let communityContractMeta: Record<string, unknown> | null = null;
    const contextCommunityId: string | null = hasCommunityContextEntitlement ? threadCommunityId : null;
    const scopeCommunityId: string | null = threadCommunityId;
    const evidenceCommunityId: string | null = contextCommunityId;

    const latest = rowsDesc[0];
    if (latest.role !== "user") {
      if (wantsStream) {
        const s = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encodeSse("done", withRequestId({ ok: true, status: "noop", thread_id: threadId })));
            controller.close();
          },
        });
        return new Response(s, {
          status: 200,
          headers: { ...headers, "Content-Type": "text/event-stream; charset=utf-8", Connection: "keep-alive" },
        });
      }
      return jsonResponse(withRequestId({ ok: true, status: "noop" }), { status: 200, headers });
    }

    const replyToId = requestedReplyToId ?? latest.id;
    const replyTarget = rowsDesc.find((row) => row.id === replyToId) ?? latest;
    const allowUpdate = input.mode === "regenerate";
    const runId = allowUpdate ? `agent_web_regen:${replyToId}:${Date.now()}` : `agent_web:${replyToId}`;

    if (!allowUpdate) {
      const existing = await loadAssistantReplyId(threadId, replyToId);
      if (existing) {
        if (wantsStream) {
          const s = new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(encodeSse("done", withRequestId({ ok: true, status: "noop", thread_id: threadId })));
              controller.close();
            },
          });
          return new Response(s, {
            status: 200,
            headers: { ...headers, "Content-Type": "text/event-stream; charset=utf-8", Connection: "keep-alive" },
          });
        }
        return jsonResponse(withRequestId({ ok: true, status: "noop" }), { status: 200, headers });
      }
    }

    if (threadCommunityId) {
      communityContractResult = await checkCommunityHarnessContract();
      communityContractMeta = toCommunityHarnessContractMeta(communityContractResult);
      if (!communityContractResult.ok && communityContractResult.mode === "enforce") {
        throw createApiError(
          "community_contract_mismatch",
          "Community features are temporarily unavailable while the backend contract is out of sync.",
          503,
          {
            contract_id: communityContractResult.contract_id,
            missing_symbols: communityContractResult.missing_symbols,
            ...(communityContractResult.error_message
              ? { contract_check_error: communityContractResult.error_message }
              : {}),
          },
        );
      }
    }

    // Rate limits (defense in depth): always per-user; optionally also per-IP.
    const retryAfterSeconds = 60;
    const userRlAllowed = await edgeRateLimitAllowKey({
      key: `agent_turn:user:${userId}`,
      windowSeconds: 60,
      limit: 20,
    });
    if (!userRlAllowed) {
      throw createApiError("rate_limited", "Too many requests. Try again soon.", 429, {
        retry_after_seconds: retryAfterSeconds,
      });
    }

    const ipRlAllowed = await edgeRateLimitAllow({
      req,
      key: "agent_turn_platform",
      windowSeconds: 60,
      limit: 120,
    });
    if (!ipRlAllowed) {
      throw createApiError("rate_limited", "Too many requests. Try again soon.", 429, {
        retry_after_seconds: retryAfterSeconds,
      });
    }

    let platformRemaining: number | null = null;
    const platformMaxTokensRaw =
      getEnv("ARX_PLATFORM_INFERENCE_MAX_TOKENS") || getEnv("OPENROUTER_PLATFORM_MAX_TOKENS");
    const platformMaxTokens = Number.isFinite(Number(platformMaxTokensRaw))
      ? Math.max(64, Math.min(4096, Math.floor(Number(platformMaxTokensRaw))))
      : 2048;

    let platformModel: PlatformModelRef | null = null;
    let platformProviderKey: string | null = null;
    let platformOpenAiBaseUrl: string | null = null;

    const platformTarget = await resolvePlatformInferenceTarget(aliasModelId);
    if (!platformTarget.ok) {
      const strictRegistryMessage =
        platformTarget.code === "platform_inference_misconfigured"
          ? `platform model not configured for '${platformTarget.model_id}'`
          : platformTarget.message;
      throw createApiError(platformTarget.code, strictRegistryMessage, platformTarget.status, {
        model_id: platformTarget.model_id,
        provider: platformTarget.provider,
        ...(platformTarget.details ?? {}),
      });
    }
    platformModel = platformTarget.platform_model;
    platformProviderKey = platformTarget.provider_key;
    platformOpenAiBaseUrl = platformTarget.openai_compatible_base_url;
    try {
      platformRemaining = await consumePlatformInferenceStandard(userId, 1);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isPlatformQuotaExceededErrorMessage(message)) {
        return jsonResponse(
          withRequestId({
            ok: false,
            code: "platform_inference_quota_exceeded",
            provider: platformModel.provider,
            model_id: aliasModelId,
            message: "You've used your Arx AI quota for this month.",
          }),
          { status: 403, headers },
        );
      } else {
        throw error;
      }
    }

    const latestUserText = extractTextFromContentJson(replyTarget.content_json);
    let priorAssistantText = "";
    const replyTargetIndex = Math.max(
      0,
      rowsDesc.findIndex((row) => row.id === replyToId),
    );
    for (let i = replyTargetIndex + 1; i < rowsDesc.length; i++) {
      const row = rowsDesc[i];
      if (row?.role !== "assistant") continue;
      const text = extractTextFromContentJson(row.content_json);
      if (text.trim()) {
        priorAssistantText = text;
        break;
      }
    }

    const [resolvedModelResult, historyRowsResult, communityContextPrefetchResult] =
      await Promise.allSettled([
        Promise.resolve(platformModel!.ref),
        loadHistorySnippets({
          userId,
          query: latestUserText,
          excludeThreadId: threadId,
          limit: 4,
        }),
        evidenceCommunityId
          ? loadCommunityContextViaCanonicalSearch({
              userId,
              communityId: evidenceCommunityId,
              query: latestUserText,
            })
          : Promise.resolve({
              chatRows: [] as CommunityChatSnippetRow[],
              resourceRows: [] as CommunityResourceSnippetRow[],
              diagnostics: buildCommunityContextFailureDiagnostics(
                threadCommunityId
                  ? (!hasCommunityContextEntitlement ? "not_entitled" : "not_attempted")
                  : "no_active_community",
              ),
            } satisfies CommunityContextPrefetchResult),
      ]);

    if (resolvedModelResult.status !== "fulfilled") throw resolvedModelResult.reason;
    const resolvedModelId = resolvedModelResult.value;

    const historyRows: HistorySnippetRow[] = historyRowsResult.status === "fulfilled" ? historyRowsResult.value : [];
    const communityContextPrefetch: CommunityContextPrefetchResult =
      communityContextPrefetchResult.status === "fulfilled"
        ? communityContextPrefetchResult.value
        : {
            chatRows: [],
            resourceRows: [],
            diagnostics: buildCommunityContextFailureDiagnostics(
              evidenceCommunityId
                ? "compiled_fetch_failed_fallback_failed"
                : "no_active_community",
            ),
          };
    const communityChatRows: CommunityChatSnippetRow[] = communityContextPrefetch.chatRows;
    const communityResourceRows: CommunityResourceSnippetRow[] = communityContextPrefetch.resourceRows;

    const memoryExtractorModelId = platformModel!.model;

    const shouldExtractMemory =
      memorySettings.memory_mode === "suggest" || memorySettings.memory_mode === "auto"
        ? shouldAttemptMemoryExtraction({
            userText: latestUserText,
            priorAssistantText,
            existingMemory: memoryRows,
          })
        : false;

    const memoryCandidatesPromise: Promise<MemoryCandidate[]> = shouldExtractMemory
      ? (async () => {
          switch (platformModel!.provider) {
            case "openai":
              return extractMemoryCandidatesViaOpenAi({
                openaiKey: platformProviderKey!,
                model: memoryExtractorModelId,
                userText: latestUserText,
                priorAssistantText,
              });
            case "x-ai":
            case "openrouter":
              return extractMemoryCandidatesViaOpenAi({
                openaiKey: platformProviderKey!,
                baseUrl: platformOpenAiBaseUrl!,
                model: memoryExtractorModelId,
                userText: latestUserText,
                priorAssistantText,
              });
            case "anthropic":
              return extractMemoryCandidatesViaAnthropic({
                apiKey: platformProviderKey!,
                model: memoryExtractorModelId,
                userText: latestUserText,
                priorAssistantText,
              });
            case "google":
              return extractMemoryCandidatesViaGoogle({
                apiKey: platformProviderKey!,
                model: memoryExtractorModelId,
                userText: latestUserText,
                priorAssistantText,
              });
            default:
              return [];
          }
        })().catch(() => [])
      : Promise.resolve([]);

    const selectedMemory = selectPersonalMemoryForPrompt(memoryRows);
    const memoryPrompt = buildPersonalMemorySystemPrompt(selectedMemory);
    const memoryUsed = selectedMemory.map((item) => ({
      id: item.id,
      content: truncateUtf8(item.content, 800),
      scope: item.scope,
      scope_id: item.scope_id,
      pinned: Boolean(item.pinned),
      updated_at: item.updated_at,
    }));

    const historyPrompt = buildHistorySystemPrompt(historyRows);
    const historyUsed = historyRows.map((row) => ({
      thread_id: row.thread_id,
      message_id: row.message_id,
      created_at: row.created_at,
      snippet: truncateUtf8(row.snippet, 280),
    }));
    const communityAgentPrompt =
      scopeCommunityId && communityAgentPromptResult.status === "fulfilled" ? communityAgentPromptResult.value : null;
    const contextCommunityName =
      scopeCommunityId && communityDisplayNameResult.status === "fulfilled"
        ? (communityDisplayNameResult.value ?? null)
        : null;
    const communityContextPrompt =
      evidenceCommunityId && (communityChatRows.length > 0 || communityResourceRows.length > 0)
        ? buildCommunityContextSystemPrompt({
            communityId: evidenceCommunityId,
            communityName: contextCommunityName,
            chatItems: communityChatRows,
            resourceItems: communityResourceRows,
          }).prompt
        : null;
    const communityEvidenceUsedV1 = buildCommunityEvidenceUsedV1(
      communityChatRows,
      communityResourceRows,
    );
    const communityContextDiagnostics = threadCommunityId
      ? (communityContextPrefetch.diagnostics ?? null)
      : null;

    const history = [...rowsDesc].reverse();
    const messages: OpenRouterChatMessage[] = [];
    const personalSystemPrompt = String(modelSettings.system_prompt ?? "").trim();
    const contextEnvelope = buildCloudCommunityContextEnvelope({
      communityId: scopeCommunityId,
      communityName: contextCommunityName,
      customCommunitySystemPrompt: communityAgentPrompt?.systemPrompt ?? "",
      communityPromptDraftId: communityAgentPrompt?.draftId ?? null,
      personalSystemPrompt,
    });
    messages.push({
      role: "system",
      content: truncateUtf8(contextEnvelope.scopedSystemPrompt.trim() || "You are a helpful assistant.", 6000),
    });
    const communityEvidenceUserMessage = buildCommunityEvidenceUserMessage(communityContextPrompt);
    if (communityEvidenceUserMessage) {
      messages.push({
        role: "user",
        content: communityEvidenceUserMessage,
      });
    }
    if (memoryPrompt) {
      messages.push({ role: "system", content: memoryPrompt });
    }
    if (historyPrompt) {
      messages.push({ role: "system", content: historyPrompt });
    }
    for (const row of history) {
      const content = extractTextFromContentJson(row.content_json);
      if (!content.trim()) continue;
      if (row.role === "user" || row.role === "assistant" || row.role === "system") {
        messages.push({
          role: row.role,
          content: truncateUtf8(content, 2000),
        });
      }
    }

    const canUseOpenAiCommunityTools =
      Boolean(contextCommunityId) &&
      (platformModel!.provider === "openai" ||
        platformModel!.provider === "x-ai" ||
        platformModel!.provider === "openrouter");
    const openAiCompatibleBaseUrl = platformOpenAiBaseUrl ?? "https://api.openai.com/v1";
    let runtimeCommunityEvidenceUsedV1 = communityEvidenceUsedV1;
    let userFacingCommunityEvidenceUsedV1 = sanitizeCommunityEvidenceUsedForUserFacing(
      runtimeCommunityEvidenceUsedV1,
    );
    let runtimeCommunityToolCalls: CommunityToolTraceItem[] = [];

    if (!wantsStream) {
      const requested = maxTokens;
      const effectiveMaxTokens = Math.min(requested, platformMaxTokens);
      const { text, usage } = await (async () => {
        if (canUseOpenAiCommunityTools) {
          const loopResult = await runOpenAiCommunityToolLoop({
            apiKey: platformProviderKey!,
            baseUrl: openAiCompatibleBaseUrl,
            model: platformModel!.model,
            maxTokens: effectiveMaxTokens,
            messages,
            userId,
            userAccessToken,
            defaultCommunityId: contextCommunityId,
            defaultCommunityName: contextCommunityName,
            seedChatRows: communityChatRows,
            seedResourceRows: communityResourceRows,
          });
          runtimeCommunityToolCalls = loopResult.toolCalls;
          runtimeCommunityEvidenceUsedV1 = loopResult.communityEvidenceUsedV1;
          userFacingCommunityEvidenceUsedV1 = sanitizeCommunityEvidenceUsedForUserFacing(
            runtimeCommunityEvidenceUsedV1,
          );
          return { text: loopResult.text, usage: loopResult.usage };
        }
        switch (platformModel!.provider) {
          case "openai":
            return openAiChatCompletion(platformProviderKey!, platformModel!.model, messages, effectiveMaxTokens);
          case "x-ai":
          case "openrouter":
            return openAiCompatibleChatCompletion({
              apiKey: platformProviderKey!,
              baseUrl: platformOpenAiBaseUrl!,
              model: platformModel!.model,
              messages,
              maxTokens: effectiveMaxTokens,
            });
          case "anthropic":
            return anthropicChatCompletion({
              apiKey: platformProviderKey!,
              model: platformModel!.model,
              messages,
              maxTokens: effectiveMaxTokens,
              stream: false,
            });
          case "google":
            return googleGenerateContent({
              apiKey: platformProviderKey!,
              model: platformModel!.model,
              messages,
              maxTokens: effectiveMaxTokens,
            });
          default:
            throw new Error("Unsupported platform model provider");
        }
      })();

      const memoryCandidates = await memoryCandidatesPromise;
      const safeAssistantText = sanitizeUserFacingAssistantText({
        text,
        communityId: contextCommunityId,
        communityName: contextCommunityName,
        blockedIds: [threadId, replyToId, runId],
      });

      let memoryAdded: PersonalMemoryRow[] = [];
      if (memorySettings.memory_mode === "auto" && memoryCandidates.length > 0) {
        try {
          memoryAdded = await insertPersonalMemoryItems({ userId, candidates: memoryCandidates, existing: memoryRows });
        } catch {
          memoryAdded = [];
        }
      }

      const meta: Record<string, unknown> = {};
      if (contextCommunityId) meta.context_community_id = contextCommunityId;
      if (contextCommunityName) meta.context_community_name = contextCommunityName;
      meta.inference_source = inferenceSource;
      meta.community_harness_capability_contract_id = COMMUNITY_HARNESS_CAPABILITY_CONTRACT_ID;
      meta.community_harness_runtime_tools = communityHarnessRuntimeTools();
      if (contextEnvelope.communityPromptDraftId) meta.community_agent_draft_id = contextEnvelope.communityPromptDraftId;
      if (contextEnvelope.communitySystemPromptSource) {
        meta.community_system_prompt_source = contextEnvelope.communitySystemPromptSource;
      }
      meta.platform_standard_remaining = platformRemaining;
      meta.platform_provider = platformModel!.provider;
      meta.platform_model = platformModel!.model;
      if (usage && typeof usage === "object") {
        meta.platform_usage = usage;
      }
      if (userFacingCommunityEvidenceUsedV1) {
        meta.community_evidence_used_v1 = userFacingCommunityEvidenceUsedV1;
      }
      if (communityContextDiagnostics) {
        meta.community_context_diagnostics = communityContextDiagnostics;
      }
      if (inferenceLaneFallbacks.length > 0) {
        meta.inference_lane_fallbacks = inferenceLaneFallbacks;
      }
      if (runtimeCommunityToolCalls.length > 0) {
        meta.community_tool_calls = runtimeCommunityToolCalls;
      }
      if (communityContractMeta) {
        meta.community_contract = communityContractMeta;
      }
      if (memoryUsed.length > 0) meta.memory_used = memoryUsed;
      if (historyUsed.length > 0) meta.history_used = historyUsed;
      if (memorySettings.memory_mode === "suggest" && memoryCandidates.length > 0) meta.memory_suggestions = memoryCandidates;
      if (memoryAdded.length > 0) meta.memory_added = memoryAdded;

      const result = await writeAssistantReply({
        threadId,
        replyToId,
        contentText: safeAssistantText,
        modelId: aliasModelId,
        openrouterModelId: resolvedModelId,
        runId,
        meta: Object.keys(meta).length > 0 ? meta : null,
        allowUpdate,
      });
      return jsonResponse(
        withRequestId({
          ok: true,
          status: result.status,
          thread_id: threadId,
          reply_to_id: replyToId,
          run_id: runId,
          inference_source: inferenceSource,
          platform_standard_remaining: platformRemaining,
          community_harness_capability_contract_id: COMMUNITY_HARNESS_CAPABILITY_CONTRACT_ID,
          community_harness_runtime_tools: communityHarnessRuntimeTools(),
          community_evidence_used_v1: userFacingCommunityEvidenceUsedV1,
          community_context_diagnostics: communityContextDiagnostics,
          ...(inferenceLaneFallbacks.length > 0
            ? { inference_lane_fallbacks: inferenceLaneFallbacks }
            : {}),
          community_tool_calls: runtimeCommunityToolCalls,
          ...(communityContractMeta ? { community_contract: communityContractMeta } : {}),
          memory_used: memoryUsed,
          history_used: historyUsed,
          memory_suggestions: memorySettings.memory_mode === "suggest" ? memoryCandidates : [],
          memory_added: memoryAdded,
        }),
        { status: 200, headers },
      );
    }

    const streamHeaders = {
      ...headers,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    };

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (event: string, data: unknown) => controller.enqueue(encodeSse(event, data));
        try {
          emit("start", {
            ok: true,
            thread_id: threadId,
            reply_to_id: replyToId,
            run_id: runId,
            engine_id: "agent_web",
            model_id: aliasModelId,
            resolved_model_id: resolvedModelId,
            inference_source: inferenceSource,
            community_harness_capability_contract_id: COMMUNITY_HARNESS_CAPABILITY_CONTRACT_ID,
            community_harness_runtime_tools: communityHarnessRuntimeTools(),
            platform_standard_remaining: platformRemaining,
            community_evidence_used_v1: userFacingCommunityEvidenceUsedV1,
            community_context_diagnostics: communityContextDiagnostics,
            ...(inferenceLaneFallbacks.length > 0
              ? { inference_lane_fallbacks: inferenceLaneFallbacks }
              : {}),
            ...(communityContractMeta ? { community_contract: communityContractMeta } : {}),
            memory_used: memoryUsed,
            history_used: historyUsed,
            request_id: requestId,
          });

          const requested = maxTokens;
          const effectiveMaxTokens = Math.min(requested, platformMaxTokens);
          let fullContent = "";
          let emittedSafeContent = "";
          let usage: unknown | null = null;
          const emitSanitizedDeltaFromFullContent = () => {
            const nextSafe = sanitizeUserFacingAssistantText({
              text: fullContent,
              communityId: contextCommunityId,
              communityName: contextCommunityName,
              blockedIds: [threadId, replyToId, runId],
            });
            if (nextSafe === emittedSafeContent) return;
            const delta = nextSafe.startsWith(emittedSafeContent)
              ? nextSafe.slice(emittedSafeContent.length)
              : nextSafe;
            emittedSafeContent = nextSafe;
            emit("delta", {
              delta,
              full_content: emittedSafeContent,
            });
          };

          if (canUseOpenAiCommunityTools) {
            const loopResult = await runOpenAiCommunityToolLoop({
              apiKey: platformProviderKey!,
              baseUrl: openAiCompatibleBaseUrl,
              model: platformModel!.model,
              maxTokens: effectiveMaxTokens,
              messages,
              userId,
              userAccessToken,
              defaultCommunityId: contextCommunityId,
              defaultCommunityName: contextCommunityName,
              seedChatRows: communityChatRows,
              seedResourceRows: communityResourceRows,
            });
            runtimeCommunityToolCalls = loopResult.toolCalls;
            runtimeCommunityEvidenceUsedV1 = loopResult.communityEvidenceUsedV1;
            userFacingCommunityEvidenceUsedV1 = sanitizeCommunityEvidenceUsedForUserFacing(
              runtimeCommunityEvidenceUsedV1,
            );
            usage = loopResult.usage ?? usage;
            fullContent = loopResult.text.trim();
            emitSanitizedDeltaFromFullContent();
          } else {
            switch (platformModel!.provider) {
              case "openai": {
                const url = `${platformOpenAiBaseUrl!.replace(/\/+$/, "")}/chat/completions`;
                const streamingResponse = await fetch(url, {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${platformProviderKey!}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    model: platformModel!.model,
                    messages,
                    max_completion_tokens: effectiveMaxTokens,
                    stream: true,
                  }),
                });
                if (!streamingResponse.ok) {
                  const body = await streamingResponse.text();
                  throw new Error(`Platform model error ${streamingResponse.status}: ${body}`);
                }
                const reader = streamingResponse.body?.getReader();
                if (!reader) throw new Error("Missing model stream");

                await consumeSseEvents({
                  reader,
                  onData: (raw) => {
                    if (raw === "[DONE]") return true;
                    let parsed: OpenRouterStreamChunk | null = null;
                    try {
                      parsed = JSON.parse(raw) as OpenRouterStreamChunk;
                    } catch {
                      return;
                    }
                    if (parsed?.usage && typeof parsed.usage === "object") usage = parsed.usage;
                    const delta = extractStreamDelta(parsed);
                    if (!delta) return;
                    fullContent += delta;
                    emitSanitizedDeltaFromFullContent();
                  },
                });
                break;
              }
              case "x-ai":
              case "openrouter": {
                const url = `${platformOpenAiBaseUrl!.replace(/\/+$/, "")}/chat/completions`;
                const streamingResponse = await fetch(url, {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${platformProviderKey!}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    model: platformModel!.model,
                    messages,
                    max_tokens: effectiveMaxTokens,
                    stream: true,
                  }),
                });
                if (!streamingResponse.ok) {
                  const body = await streamingResponse.text();
                  throw new Error(`Platform model error ${streamingResponse.status}: ${body}`);
                }
                const reader = streamingResponse.body?.getReader();
                if (!reader) throw new Error("Missing model stream");

                await consumeSseEvents({
                  reader,
                  onData: (raw) => {
                    if (raw === "[DONE]") return true;
                    let parsed: OpenRouterStreamChunk | null = null;
                    try {
                      parsed = JSON.parse(raw) as OpenRouterStreamChunk;
                    } catch {
                      return;
                    }
                    if (parsed?.usage && typeof parsed.usage === "object") usage = parsed.usage;
                    const delta = extractStreamDelta(parsed);
                    if (!delta) return;
                    fullContent += delta;
                    emitSanitizedDeltaFromFullContent();
                  },
                });
                break;
              }
              case "anthropic": {
                const { system, messages: anthropicMessages } = toAnthropicSystemAndMessages(messages);
                const streamingResponse = await fetch("https://api.anthropic.com/v1/messages", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "x-api-key": platformProviderKey!,
                    "anthropic-version": getEnv("ANTHROPIC_VERSION") || "2023-06-01",
                  },
                  body: JSON.stringify({
                    model: platformModel!.model,
                    max_tokens: effectiveMaxTokens,
                    stream: true,
                    ...(system ? { system } : {}),
                    messages: anthropicMessages,
                  }),
                });
                if (!streamingResponse.ok) {
                  const body = await streamingResponse.text();
                  throw new Error(`Anthropic error ${streamingResponse.status}: ${body}`);
                }
                const reader = streamingResponse.body?.getReader();
                if (!reader) throw new Error("Missing model stream");

                await consumeSseEvents({
                  reader,
                  onData: (raw) => {
                    if (raw === "[DONE]") return true;
                    let parsed: Record<string, unknown> | null = null;
                    try {
                      parsed = JSON.parse(raw) as Record<string, unknown>;
                    } catch {
                      return;
                    }
                    if (parsed && typeof parsed.usage === "object" && parsed.usage) usage = parsed.usage;
                    const type = String(parsed?.type ?? "").trim();
                    if (type === "message_stop") return true;
                    if (type === "error") {
                      const err = parsed?.error;
                      const msg =
                        err && typeof err === "object" && typeof (err as any).message === "string"
                          ? String((err as any).message)
                          : "Anthropic stream error";
                      throw new Error(msg);
                    }
                    if (type !== "content_block_delta") return;
                    const deltaObj = parsed?.delta as any;
                    const deltaText = typeof deltaObj?.text === "string" ? String(deltaObj.text) : "";
                    if (!deltaText) return;
                    fullContent += deltaText;
                    emitSanitizedDeltaFromFullContent();
                  },
                });
                break;
              }
              case "google": {
                const { system, contents } = toGeminiSystemAndContents(messages);
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
                  platformModel!.model,
                )}:streamGenerateContent?alt=sse`;
                const streamingResponse = await fetch(url, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": platformProviderKey!,
                  },
                  body: JSON.stringify({
                    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
                    contents,
                    generationConfig: { maxOutputTokens: effectiveMaxTokens },
                  }),
                });
                if (!streamingResponse.ok) {
                  const body = await streamingResponse.text();
                  throw new Error(`Google error ${streamingResponse.status}: ${body}`);
                }
                const reader = streamingResponse.body?.getReader();
                if (!reader) throw new Error("Missing model stream");

                await consumeSseEvents({
                  reader,
                  onData: (raw) => {
                    if (raw === "[DONE]") return true;
                    let parsed: GeminiResponse | null = null;
                    try {
                      parsed = JSON.parse(raw) as GeminiResponse;
                    } catch {
                      return;
                    }
                    if (parsed?.usageMetadata && typeof parsed.usageMetadata === "object") usage = parsed.usageMetadata;
                    const parts = parsed?.candidates?.[0]?.content?.parts ?? [];
                    const nextText = parts
                      .map((p) => (typeof p?.text === "string" ? p.text : ""))
                      .join("")
                      .trim();
                    if (!nextText) return;
                    if (nextText.startsWith(fullContent)) {
                      const delta = nextText.slice(fullContent.length);
                      if (!delta) return;
                      fullContent = nextText;
                      emitSanitizedDeltaFromFullContent();
                      return;
                    }
                    // Fallback: emit the entire nextText if the stream is non-monotonic.
                    fullContent = nextText;
                    emitSanitizedDeltaFromFullContent();
                  },
                });
                break;
              }
              default:
                throw new Error("Unsupported platform model provider");
            }
          }
            const finalTextRaw = fullContent.trim();
            if (!finalTextRaw) throw new Error("Model returned an empty response");
            const finalText = sanitizeUserFacingAssistantText({
              text: finalTextRaw,
              communityId: contextCommunityId,
              communityName: contextCommunityName,
              blockedIds: [threadId, replyToId, runId],
            });
            if (finalText && emittedSafeContent !== finalText) {
              const delta = finalText.startsWith(emittedSafeContent)
                ? finalText.slice(emittedSafeContent.length)
                : finalText;
              emittedSafeContent = finalText;
              emit("delta", { delta, full_content: emittedSafeContent });
            }

            const memoryCandidates = await memoryCandidatesPromise;

            let memoryAdded: PersonalMemoryRow[] = [];
            if (memorySettings.memory_mode === "auto" && memoryCandidates.length > 0) {
              try {
                memoryAdded = await insertPersonalMemoryItems({ userId, candidates: memoryCandidates, existing: memoryRows });
              } catch {
                memoryAdded = [];
              }
            }

            const meta: Record<string, unknown> = {};
            if (contextCommunityId) meta.context_community_id = contextCommunityId;
            if (contextCommunityName) meta.context_community_name = contextCommunityName;
            meta.inference_source = inferenceSource;
            meta.community_harness_capability_contract_id = COMMUNITY_HARNESS_CAPABILITY_CONTRACT_ID;
            meta.community_harness_runtime_tools = communityHarnessRuntimeTools();
            if (contextEnvelope.communityPromptDraftId) {
              meta.community_agent_draft_id = contextEnvelope.communityPromptDraftId;
            }
            if (contextEnvelope.communitySystemPromptSource) {
              meta.community_system_prompt_source = contextEnvelope.communitySystemPromptSource;
            }
            meta.platform_standard_remaining = platformRemaining;
            meta.platform_provider = platformModel!.provider;
            meta.platform_model = platformModel!.model;
            if (usage && typeof usage === "object") {
              meta.platform_usage = usage;
            }
            if (userFacingCommunityEvidenceUsedV1) {
              meta.community_evidence_used_v1 = userFacingCommunityEvidenceUsedV1;
            }
            if (communityContextDiagnostics) {
              meta.community_context_diagnostics = communityContextDiagnostics;
            }
            if (inferenceLaneFallbacks.length > 0) {
              meta.inference_lane_fallbacks = inferenceLaneFallbacks;
            }
            if (runtimeCommunityToolCalls.length > 0) {
              meta.community_tool_calls = runtimeCommunityToolCalls;
            }
            if (communityContractMeta) {
              meta.community_contract = communityContractMeta;
            }
            if (memoryUsed.length > 0) meta.memory_used = memoryUsed;
            if (historyUsed.length > 0) meta.history_used = historyUsed;
            if (memorySettings.memory_mode === "suggest" && memoryCandidates.length > 0) meta.memory_suggestions = memoryCandidates;
            if (memoryAdded.length > 0) meta.memory_added = memoryAdded;

	          const result = await writeAssistantReply({
	            threadId,
	            replyToId,
	            contentText: finalText,
	            modelId: aliasModelId,
	            openrouterModelId: resolvedModelId,
	            runId,
              meta: Object.keys(meta).length > 0 ? meta : null,
	            allowUpdate,
	          });

            emit("done", {
              ok: true,
              status: result.status,
              thread_id: threadId,
              reply_to_id: replyToId,
              run_id: runId,
              inference_source: inferenceSource,
              community_harness_capability_contract_id: COMMUNITY_HARNESS_CAPABILITY_CONTRACT_ID,
              community_harness_runtime_tools: communityHarnessRuntimeTools(),
              platform_standard_remaining: platformRemaining,
              community_evidence_used_v1: userFacingCommunityEvidenceUsedV1,
              community_context_diagnostics: communityContextDiagnostics,
              ...(inferenceLaneFallbacks.length > 0
                ? { inference_lane_fallbacks: inferenceLaneFallbacks }
                : {}),
              community_tool_calls: runtimeCommunityToolCalls,
              ...(communityContractMeta ? { community_contract: communityContractMeta } : {}),
              memory_used: memoryUsed,
              history_used: historyUsed,
              memory_suggestions: memorySettings.memory_mode === "suggest" ? memoryCandidates : [],
              memory_added: memoryAdded,
              request_id: requestId,
	          });
	          controller.close();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          emit("error", withRequestId({ ok: false, error: message }));
          controller.close();
        }
      },
    });

    return new Response(stream, { status: 200, headers: streamHeaders });
  } catch (error) {
    if (isApiError(error)) {
      const details = sanitizeApiErrorDetails(error.details);
      const retryAfter =
        typeof details.retry_after_seconds === "number" && Number.isFinite(details.retry_after_seconds)
          ? Math.max(0, Math.floor(details.retry_after_seconds))
          : null;
      return jsonResponse(
        withRequestId({
          ok: false,
          code: error.code,
          error: error.code,
          message: error.message,
          ...details,
        }),
        {
          status: error.status,
          headers: retryAfter ? { ...headers, "Retry-After": String(retryAfter) } : headers,
        },
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "forbidden" ? 403 : message === "rate_limited" ? 429 : 400;
    return jsonResponse(withRequestId({ ok: false, error: message }), { status, headers });
  }
});

import { supabaseAdminFetch } from "./supabase_admin.ts";
import {
  COMMUNITY_CONTEXT_BUNDLE_V1,
  buildCommunityContextDiagnostics,
  normalizeCompiledCommunityRows,
} from "../agent_turn/community_context_bundle_v1.mjs";
import {
  loadCommunityContextBundleWithPolicy,
} from "../../../shared/communityContextRetrievalPolicy.ts";

const COMMUNITY_RPC = Object.freeze({
  entitlementCheck: "user_has_active_entitlement",
  compiledContextSearch: "search_compiled_community_context",
  chatSnippetSearch: "search_community_chat_snippets",
  resourceSnippetSearch: "search_community_resource_snippets",
  memorySearch: "search_community_memory_items",
});

export type CommunitySearchSourceType = "chat" | "resource" | "memory";

const COMMUNITY_SEARCH_DEFAULT_SOURCE_TYPES = Object.freeze([
  "chat",
  "resource",
  "memory",
] as const);

const COMMUNITY_META_DISCOVERY_HINTS = Object.freeze([
  "community chat",
  "chat messages",
  "messages in",
  "what is in",
  "what's in",
  "what resources",
  "what memory",
  "do you see",
  "show me",
  "list",
  "available",
] as const);

const COMMUNITY_MULTI_QUERY_MAX = 3;
const COMMUNITY_DEEP_RESEARCH_MAX_PASSES = 3;
const COMMUNITY_DEEP_RESEARCH_DEFAULT_MAX_PASSES = 2;
const COMMUNITY_DEEP_RESEARCH_DEFAULT_SUFFICIENCY_TARGET = 6;

const COMMUNITY_QUERY_STOP_WORDS = new Set<string>([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "or",
  "so",
  "that",
  "the",
  "their",
  "them",
  "there",
  "these",
  "they",
  "this",
  "to",
  "we",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
  "you",
  "your",
]);

export type CommunityChatSnippetRow = {
  thread_id: string;
  message_id: string;
  sender_id: string | null;
  sender_display: string;
  created_at: string;
  snippet: string;
};

export type CommunityResourceSnippetRow = {
  resource_id: string;
  resource_type: string;
  title: string;
  created_at: string;
  pinned: boolean;
  snippet: string;
  url: string | null;
  file_key: string | null;
};

export type CommunityMemorySearchRow = {
  memory_id: string;
  community_id: string;
  title: string | null;
  snippet: string;
  source: string | null;
  created_at: string;
  updated_at: string;
  score: number | null;
};

type CompiledCommunityContextRow = Record<string, unknown>;

export type CanonicalCommunitySearchResult = {
  query: string;
  limit: number;
  sourceTypes: CommunitySearchSourceType[];
  queryPlan: string[];
  executedQueries: string[];
  diagnostics: Record<string, unknown> | null;
  metaRecentFallbackUsed: boolean;
  chatRows: CommunityChatSnippetRow[];
  resourceRows: CommunityResourceSnippetRow[];
  memoryRows: CommunityMemorySearchRow[];
};

export type CanonicalCommunityDeepResearchStopReason =
  | "evidence_sufficient"
  | "budget_exhausted"
  | "no_evidence";

export type CanonicalCommunityDeepResearchResult = CanonicalCommunitySearchResult & {
  passCount: number;
  stopReason: CanonicalCommunityDeepResearchStopReason;
  deepQueryPlan: string[];
};

function parseBoolishJsonValue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value !== 0;
  if (typeof value === "string") {
    const raw = value.trim().toLowerCase();
    if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
    if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  }
  return false;
}

function readToolStringArrayArg(args: Record<string, unknown>, key: string): string[] {
  const value = args[key];
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function normalizeCommunitySearchSourceType(value: string): CommunitySearchSourceType | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "chat" || normalized === "resource" || normalized === "memory") {
    return normalized;
  }
  return null;
}

export function parseCommunitySearchSourceTypes(
  rawArgs: Record<string, unknown>,
): CommunitySearchSourceType[] {
  const requested = readToolStringArrayArg(rawArgs, "source_types")
    .map((value) => normalizeCommunitySearchSourceType(value))
    .filter((value): value is CommunitySearchSourceType => value !== null);
  if (requested.length === 0) return [...COMMUNITY_SEARCH_DEFAULT_SOURCE_TYPES];
  return Array.from(new Set(requested));
}

export function normalizeCommunitySearchQuery(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw.slice(0, COMMUNITY_CONTEXT_BUNDLE_V1.limits.queryMaxChars);
}

export function normalizeCommunitySearchLimit(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.min(12, Math.floor(value)));
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return Math.max(1, Math.min(12, Math.floor(parsed)));
    }
  }
  return COMMUNITY_CONTEXT_BUNDLE_V1.limits.compiledLimit;
}

function tokenizeCommunityQuery(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !COMMUNITY_QUERY_STOP_WORDS.has(token));
}

function buildKeywordFocusedCommunityQuery(value: string): string {
  const terms = tokenizeCommunityQuery(value);
  if (terms.length === 0) return "";
  return Array.from(new Set(terms)).slice(0, 8).join(" ");
}

function normalizeDeepResearchMaxPasses(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.min(COMMUNITY_DEEP_RESEARCH_MAX_PASSES, Math.floor(value)));
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return Math.max(1, Math.min(COMMUNITY_DEEP_RESEARCH_MAX_PASSES, Math.floor(parsed)));
    }
  }
  return COMMUNITY_DEEP_RESEARCH_DEFAULT_MAX_PASSES;
}

function normalizeDeepResearchSufficiencyTarget(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.min(24, Math.floor(value)));
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return Math.max(1, Math.min(24, Math.floor(parsed)));
    }
  }
  return COMMUNITY_DEEP_RESEARCH_DEFAULT_SUFFICIENCY_TARGET;
}

function appendUniqueStrings(into: string[], values: string[]): void {
  for (const value of values) {
    const normalized = String(value ?? "");
    if (into.includes(normalized)) continue;
    into.push(normalized);
  }
}

function buildCommunityDeepResearchPassPlan(query: string, maxPassesRaw?: number): string[] {
  const maxPasses = normalizeDeepResearchMaxPasses(maxPassesRaw);
  const primary = normalizeCommunitySearchQuery(query);
  if (!primary) return [""];

  const out: string[] = [primary];
  const keywordQuery = buildKeywordFocusedCommunityQuery(primary);
  if (keywordQuery && keywordQuery !== primary) out.push(keywordQuery);
  if (!out.includes("")) out.push("");
  return out.slice(0, maxPasses);
}

function buildCommunityResearchQueryPlan(query: string): string[] {
  const primary = normalizeCommunitySearchQuery(query);
  if (!primary) return [""];

  const out: string[] = [primary];
  const keywordQuery = buildKeywordFocusedCommunityQuery(primary);
  if (keywordQuery && keywordQuery !== primary) out.push(keywordQuery);

  const conciseQuery = primary.split(/\s+/).filter(Boolean).slice(0, 6).join(" ");
  if (conciseQuery && !out.includes(conciseQuery)) out.push(conciseQuery);

  return out.slice(0, COMMUNITY_MULTI_QUERY_MAX);
}

function isCommunityMetaDiscoveryQuery(query: string | null | undefined): boolean {
  const raw = String(query ?? "").trim().toLowerCase();
  if (!raw) return true;
  if (COMMUNITY_META_DISCOVERY_HINTS.some((hint) => raw.includes(hint))) return true;

  const hasCommunityNoun = /\b(community|chat|message|messages|resource|resources|memory)\b/.test(raw);
  const hasDiscoveryVerb = /\b(see|show|list|available|have|what|which|any)\b/.test(raw);
  return hasCommunityNoun && hasDiscoveryVerb;
}

function rowResourceType(row: CommunityResourceSnippetRow): "resource" | "memory" {
  return String(row.resource_type ?? "").trim().toLowerCase() === "memory" ? "memory" : "resource";
}

function splitCommunityResourceRowsByType(
  rows: CommunityResourceSnippetRow[],
): { resourceRows: CommunityResourceSnippetRow[]; memoryRows: CommunityResourceSnippetRow[] } {
  const resourceRows: CommunityResourceSnippetRow[] = [];
  const memoryRows: CommunityResourceSnippetRow[] = [];
  for (const row of rows) {
    if (rowResourceType(row) === "memory") {
      memoryRows.push(row);
      continue;
    }
    resourceRows.push(row);
  }
  return { resourceRows, memoryRows };
}

function memoryRowsToResourceRows(
  rows: CommunityMemorySearchRow[],
  limit: number,
): CommunityResourceSnippetRow[] {
  return rows.slice(0, Math.max(1, limit)).map((row) => ({
    resource_id: String(row.memory_id ?? "").trim(),
    resource_type: "memory",
    title: String(row.title ?? "Community memory").trim() || "Community memory",
    created_at: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
    pinned: false,
    snippet: String(row.snippet ?? "").trim(),
    url: null,
    file_key: null,
  }));
}

function mergeCommunityEvidenceRows(params: {
  chatRows: CommunityChatSnippetRow[];
  resourceRows: CommunityResourceSnippetRow[];
  nextChatRows: CommunityChatSnippetRow[];
  nextResourceRows: CommunityResourceSnippetRow[];
  chatLimit?: number;
  resourceLimit?: number;
}): { chatRows: CommunityChatSnippetRow[]; resourceRows: CommunityResourceSnippetRow[] } {
  const chatLimit = Math.max(
    1,
    Math.floor(params.chatLimit ?? COMMUNITY_CONTEXT_BUNDLE_V1.limits.chatLimit),
  );
  const resourceLimit = Math.max(
    1,
    Math.floor(params.resourceLimit ?? COMMUNITY_CONTEXT_BUNDLE_V1.limits.resourceLimit),
  );
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
    chatRows: Array.from(chatMap.values()).slice(0, chatLimit),
    resourceRows: Array.from(resourceMap.values()).slice(0, resourceLimit),
  };
}

function parseIsoEpochMs(value: unknown): number {
  if (typeof value !== "string") return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

type RankedRow<T> = {
  row: T;
  passIndex: number;
  rowIndex: number;
  recencyMs: number;
  key: string;
};

function rowSortComparator<T>(a: RankedRow<T>, b: RankedRow<T>): number {
  if (a.passIndex !== b.passIndex) return a.passIndex - b.passIndex;
  if (a.rowIndex !== b.rowIndex) return a.rowIndex - b.rowIndex;
  if (a.recencyMs !== b.recencyMs) return b.recencyMs - a.recencyMs;
  return a.key.localeCompare(b.key);
}

async function loadCommunityChatSnippets(params: {
  userId: string;
  communityId: string;
  query: string;
  limit: number;
}): Promise<CommunityChatSnippetRow[]> {
  const res = await supabaseAdminFetch(`/rest/v1/rpc/${COMMUNITY_RPC.chatSnippetSearch}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_user_id: params.userId,
      p_community_id: params.communityId,
      p_query: params.query,
      p_limit: Math.max(0, Math.min(20, Math.floor(params.limit))),
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as CommunityChatSnippetRow[];
}

async function loadCommunityResourceSnippets(params: {
  userId: string;
  communityId: string;
  query: string;
  limit: number;
}): Promise<CommunityResourceSnippetRow[]> {
  const res = await supabaseAdminFetch(`/rest/v1/rpc/${COMMUNITY_RPC.resourceSnippetSearch}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_user_id: params.userId,
      p_community_id: params.communityId,
      p_query: params.query,
      p_limit: Math.max(0, Math.min(20, Math.floor(params.limit))),
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as CommunityResourceSnippetRow[];
}

async function loadCompiledCommunityContextRows(params: {
  userId: string;
  communityId: string;
  query: string;
  limit: number;
}): Promise<CompiledCommunityContextRow[]> {
  const res = await supabaseAdminFetch(`/rest/v1/rpc/${COMMUNITY_RPC.compiledContextSearch}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_user_id: params.userId,
      p_community_id: params.communityId,
      p_query: params.query,
      p_limit: Math.max(0, Math.min(40, Math.floor(params.limit))),
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as CompiledCommunityContextRow[];
}

async function loadCommunityMemoryRows(params: {
  userId: string;
  communityId: string;
  query: string;
  limit: number;
}): Promise<CommunityMemorySearchRow[]> {
  if (!params.query.trim()) return [];
  const res = await supabaseAdminFetch(`/rest/v1/rpc/${COMMUNITY_RPC.memorySearch}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_user_id: params.userId,
      p_community_id: params.communityId,
      p_query: params.query,
      p_limit: Math.max(1, Math.min(12, Math.floor(params.limit))),
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as CommunityMemorySearchRow[];
}

async function executeCommunitySearchPass(params: {
  userId: string;
  communityId: string;
  query: string;
  limit: number;
  sourceTypes: CommunitySearchSourceType[];
}): Promise<{
  chatRows: CommunityChatSnippetRow[];
  resourceRows: CommunityResourceSnippetRow[];
  memoryRows: CommunityMemorySearchRow[];
  diagnostics: Record<string, unknown> | null;
  lexicalAdjunctUsed: boolean;
}> {
  const includesChat = params.sourceTypes.includes("chat");
  const includesResource = params.sourceTypes.includes("resource");
  const includesMemory = params.sourceTypes.includes("memory");
  const hasQuery = params.query.trim().length > 0;

  let chatRows: CommunityChatSnippetRow[] = [];
  let resourceRows: CommunityResourceSnippetRow[] = [];
  let memoryRows: CommunityMemorySearchRow[] = [];
  let diagnostics: Record<string, unknown> | null = null;
  let lexicalAdjunctUsed = false;

  if (includesChat || includesResource) {
    const bundle = await loadCommunityContextBundleWithPolicy<
      CompiledCommunityContextRow,
      CommunityChatSnippetRow,
      CommunityResourceSnippetRow
    >({
      loadCompiled: async () =>
        await loadCompiledCommunityContextRows({
          userId: params.userId,
          communityId: params.communityId,
          query: params.query,
          limit: params.limit,
        }),
      normalizeCompiled: (rows) => normalizeCompiledCommunityRows(rows, params.communityId),
      loadChatFallback: async () =>
        await loadCommunityChatSnippets({
          userId: params.userId,
          communityId: params.communityId,
          query: params.query,
          limit: params.limit,
        }),
      loadResourceFallback: async () =>
        await loadCommunityResourceSnippets({
          userId: params.userId,
          communityId: params.communityId,
          query: params.query,
          limit: params.limit,
        }),
      shouldFallbackOnEmptyCompiled: true,
      query: params.query,
    });

    diagnostics = buildCommunityContextDiagnostics(
      bundle,
      bundle.chatRows.length,
      bundle.resourceRows.length,
    ) as Record<string, unknown>;

    const splitRows = splitCommunityResourceRowsByType(bundle.resourceRows);
    if (includesChat) {
      chatRows = bundle.chatRows.slice(0, COMMUNITY_CONTEXT_BUNDLE_V1.limits.chatLimit);
    }
    if (includesResource) {
      resourceRows = resourceRows.concat(
        splitRows.resourceRows.slice(0, COMMUNITY_CONTEXT_BUNDLE_V1.limits.resourceLimit),
      );
    }
    if (includesMemory) {
      resourceRows = resourceRows.concat(
        splitRows.memoryRows.slice(0, COMMUNITY_CONTEXT_BUNDLE_V1.limits.resourceLimit),
      );
    }

    if (hasQuery) {
      const [chatAdjunctResult, resourceAdjunctResult] = await Promise.allSettled([
        includesChat
          ? loadCommunityChatSnippets({
              userId: params.userId,
              communityId: params.communityId,
              query: params.query,
              limit: params.limit,
            })
          : Promise.resolve<CommunityChatSnippetRow[]>([]),
        includesResource || includesMemory
          ? loadCommunityResourceSnippets({
              userId: params.userId,
              communityId: params.communityId,
              query: params.query,
              limit: params.limit,
            })
          : Promise.resolve<CommunityResourceSnippetRow[]>([]),
      ]);

      const adjunctChatRows =
        chatAdjunctResult.status === "fulfilled" ? chatAdjunctResult.value : [];
      const adjunctResourceRows =
        resourceAdjunctResult.status === "fulfilled" ? resourceAdjunctResult.value : [];
      lexicalAdjunctUsed =
        adjunctChatRows.length > 0 || adjunctResourceRows.length > 0;

      const mergedHybrid = mergeCommunityEvidenceRows({
        chatRows,
        resourceRows,
        nextChatRows: adjunctChatRows,
        nextResourceRows: adjunctResourceRows,
        chatLimit: COMMUNITY_CONTEXT_BUNDLE_V1.limits.chatLimit * 2,
        resourceLimit: COMMUNITY_CONTEXT_BUNDLE_V1.limits.resourceLimit * 2,
      });
      chatRows = mergedHybrid.chatRows;
      resourceRows = mergedHybrid.resourceRows;
    }
  }

  if (includesMemory) {
    memoryRows = await loadCommunityMemoryRows({
      userId: params.userId,
      communityId: params.communityId,
      query: params.query,
      limit: params.limit,
    });
    resourceRows = resourceRows.concat(
      memoryRowsToResourceRows(memoryRows, COMMUNITY_CONTEXT_BUNDLE_V1.limits.resourceLimit),
    );
  }

  const merged = mergeCommunityEvidenceRows({
    chatRows: [],
    resourceRows: [],
    nextChatRows: chatRows,
    nextResourceRows: resourceRows,
    chatLimit: COMMUNITY_CONTEXT_BUNDLE_V1.limits.chatLimit,
    resourceLimit: COMMUNITY_CONTEXT_BUNDLE_V1.limits.resourceLimit,
  });
  return {
    chatRows: merged.chatRows,
    resourceRows: merged.resourceRows,
    memoryRows,
    diagnostics,
    lexicalAdjunctUsed,
  };
}

function countCommunityEvidenceRows(params: {
  chatRows: CommunityChatSnippetRow[];
  resourceRows: CommunityResourceSnippetRow[];
  memoryRows: CommunityMemorySearchRow[];
}): number {
  return params.chatRows.length + params.resourceRows.length + params.memoryRows.length;
}

function mergeCommunityMemoryRows(params: {
  currentRows: CommunityMemorySearchRow[];
  nextRows: CommunityMemorySearchRow[];
  limit: number;
}): CommunityMemorySearchRow[] {
  const map = new Map<string, CommunityMemorySearchRow>();
  for (const row of params.currentRows) {
    const key = String(row.memory_id ?? "").trim();
    if (!key) continue;
    map.set(key, row);
  }
  for (const row of params.nextRows) {
    const key = String(row.memory_id ?? "").trim();
    if (!key) continue;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, row);
      continue;
    }
    const prevEpoch = parseIsoEpochMs(prev.updated_at || prev.created_at);
    const nextEpoch = parseIsoEpochMs(row.updated_at || row.created_at);
    if (nextEpoch >= prevEpoch) {
      map.set(key, row);
    }
  }
  return Array.from(map.values())
    .sort((a, b) => parseIsoEpochMs(b.updated_at || b.created_at) - parseIsoEpochMs(a.updated_at || a.created_at))
    .slice(0, Math.max(1, params.limit));
}

function shouldContinueMultiQuerySearch(params: {
  query: string;
  passIndex: number;
  fusedEvidenceCount: number;
}): boolean {
  if (!params.query.trim()) return false;
  if (params.passIndex >= COMMUNITY_MULTI_QUERY_MAX - 1) return false;
  if (params.fusedEvidenceCount <= 0) return true;
  return params.fusedEvidenceCount < 6;
}

type CommunitySearchPassResult = Awaited<ReturnType<typeof executeCommunitySearchPass>> & {
  query: string;
};

function fuseCommunitySearchPassResults(params: {
  passes: CommunitySearchPassResult[];
  sourceTypes: CommunitySearchSourceType[];
}): {
  chatRows: CommunityChatSnippetRow[];
  resourceRows: CommunityResourceSnippetRow[];
  memoryRows: CommunityMemorySearchRow[];
  diagnostics: Record<string, unknown> | null;
  lexicalAdjunctUsed: boolean;
} {
  const chatMap = new Map<string, RankedRow<CommunityChatSnippetRow>>();
  const resourceMap = new Map<string, RankedRow<CommunityResourceSnippetRow>>();
  const memoryMap = new Map<string, RankedRow<CommunityMemorySearchRow>>();
  let diagnostics: Record<string, unknown> | null = null;
  let lexicalAdjunctUsed = false;

  for (let passIndex = 0; passIndex < params.passes.length; passIndex += 1) {
    const pass = params.passes[passIndex];
    if (!diagnostics && pass.diagnostics) diagnostics = pass.diagnostics;
    lexicalAdjunctUsed = lexicalAdjunctUsed || pass.lexicalAdjunctUsed;

    for (let rowIndex = 0; rowIndex < pass.chatRows.length; rowIndex += 1) {
      const row = pass.chatRows[rowIndex];
      const key = `${row.thread_id}:${row.message_id}`;
      if (!key.trim()) continue;
      const next: RankedRow<CommunityChatSnippetRow> = {
        row,
        passIndex,
        rowIndex,
        recencyMs: parseIsoEpochMs(row.created_at),
        key,
      };
      const prev = chatMap.get(key);
      if (!prev || rowSortComparator(next, prev) < 0) chatMap.set(key, next);
    }

    for (let rowIndex = 0; rowIndex < pass.resourceRows.length; rowIndex += 1) {
      const row = pass.resourceRows[rowIndex];
      const key = `${row.resource_id}:${row.resource_type}`;
      if (!key.trim()) continue;
      const next: RankedRow<CommunityResourceSnippetRow> = {
        row,
        passIndex,
        rowIndex,
        recencyMs: parseIsoEpochMs(row.created_at),
        key,
      };
      const prev = resourceMap.get(key);
      if (!prev || rowSortComparator(next, prev) < 0) resourceMap.set(key, next);
    }

    for (let rowIndex = 0; rowIndex < pass.memoryRows.length; rowIndex += 1) {
      const row = pass.memoryRows[rowIndex];
      const key = String(row.memory_id ?? "").trim();
      if (!key) continue;
      const next: RankedRow<CommunityMemorySearchRow> = {
        row,
        passIndex,
        rowIndex,
        recencyMs: parseIsoEpochMs(row.updated_at || row.created_at),
        key,
      };
      const prev = memoryMap.get(key);
      if (!prev || rowSortComparator(next, prev) < 0) memoryMap.set(key, next);
    }
  }

  const includesChat = params.sourceTypes.includes("chat");
  const includesResource = params.sourceTypes.includes("resource");
  const includesMemory = params.sourceTypes.includes("memory");

  const chatRows = includesChat
    ? Array.from(chatMap.values())
        .sort(rowSortComparator)
        .map((entry) => entry.row)
        .slice(0, COMMUNITY_CONTEXT_BUNDLE_V1.limits.chatLimit)
    : [];
  const resourceRows = (includesResource || includesMemory)
    ? Array.from(resourceMap.values())
        .sort(rowSortComparator)
        .map((entry) => entry.row)
        .slice(0, COMMUNITY_CONTEXT_BUNDLE_V1.limits.resourceLimit)
    : [];
  const memoryRows = includesMemory
    ? Array.from(memoryMap.values())
        .sort(rowSortComparator)
        .map((entry) => entry.row)
        .slice(0, COMMUNITY_CONTEXT_BUNDLE_V1.limits.resourceLimit)
    : [];

  if (diagnostics && typeof diagnostics === "object") {
    diagnostics = {
      ...diagnostics,
      multi_query_used: params.passes.length > 1,
      query_count: params.passes.length,
      lexical_adjunct_used: lexicalAdjunctUsed,
    };
  }

  return {
    chatRows,
    resourceRows,
    memoryRows,
    diagnostics,
    lexicalAdjunctUsed,
  };
}

export async function runCanonicalCommunitySearch(params: {
  userId: string;
  communityId: string;
  query: string;
  limit: number;
  sourceTypes: CommunitySearchSourceType[];
}): Promise<CanonicalCommunitySearchResult> {
  const query = normalizeCommunitySearchQuery(params.query);
  const limit = normalizeCommunitySearchLimit(params.limit);
  const queryPlan = buildCommunityResearchQueryPlan(query);
  const plannedQueries = [...queryPlan];
  const passResults: CommunitySearchPassResult[] = [];

  for (let passIndex = 0; passIndex < plannedQueries.length; passIndex += 1) {
    const passQuery = plannedQueries[passIndex] ?? "";
    const passResult = await executeCommunitySearchPass({
      userId: params.userId,
      communityId: params.communityId,
      query: passQuery,
      limit,
      sourceTypes: params.sourceTypes,
    });
    passResults.push({ ...passResult, query: passQuery });

    const fused = fuseCommunitySearchPassResults({
      passes: passResults,
      sourceTypes: params.sourceTypes,
    });
    const fusedEvidenceCount = countCommunityEvidenceRows(fused);

    if (
      passIndex === plannedQueries.length - 1
      && fusedEvidenceCount === 0
      && query.trim()
      && isCommunityMetaDiscoveryQuery(query)
      && !plannedQueries.includes("")
    ) {
      plannedQueries.push("");
      continue;
    }

    if (
      passIndex < plannedQueries.length - 1
      && !shouldContinueMultiQuerySearch({
        query,
        passIndex,
        fusedEvidenceCount,
      })
    ) {
      break;
    }
  }

  const fusedResult = fuseCommunitySearchPassResults({
    passes: passResults,
    sourceTypes: params.sourceTypes,
  });
  const executedQueries = passResults.map((pass) => pass.query);
  const metaRecentFallbackUsed = query.trim().length > 0 && executedQueries.includes("");

  return {
    query,
    limit,
    sourceTypes: params.sourceTypes,
    queryPlan,
    executedQueries,
    diagnostics: fusedResult.diagnostics,
    metaRecentFallbackUsed,
    chatRows: fusedResult.chatRows,
    resourceRows: fusedResult.resourceRows,
    memoryRows: fusedResult.memoryRows,
  };
}

export async function runCanonicalCommunityDeepResearch(params: {
  userId: string;
  communityId: string;
  query: string;
  limit: number;
  sourceTypes: CommunitySearchSourceType[];
  maxPasses?: number;
  sufficiencyTarget?: number;
}): Promise<CanonicalCommunityDeepResearchResult> {
  const query = normalizeCommunitySearchQuery(params.query);
  const limit = normalizeCommunitySearchLimit(params.limit);
  const maxPasses = normalizeDeepResearchMaxPasses(params.maxPasses);
  const sufficiencyTarget = normalizeDeepResearchSufficiencyTarget(params.sufficiencyTarget);
  const deepQueryPlan = buildCommunityDeepResearchPassPlan(query, maxPasses);

  const queryPlan: string[] = [];
  const executedQueries: string[] = [];
  let chatRows: CommunityChatSnippetRow[] = [];
  let resourceRows: CommunityResourceSnippetRow[] = [];
  let memoryRows: CommunityMemorySearchRow[] = [];
  let diagnostics: Record<string, unknown> | null = null;
  let metaRecentFallbackUsed = false;
  let passCount = 0;
  let stopReason: CanonicalCommunityDeepResearchStopReason = "budget_exhausted";

  for (const passQuery of deepQueryPlan) {
    passCount += 1;
    const pass = await runCanonicalCommunitySearch({
      userId: params.userId,
      communityId: params.communityId,
      query: passQuery,
      limit,
      sourceTypes: params.sourceTypes,
    });

    appendUniqueStrings(queryPlan, pass.queryPlan);
    appendUniqueStrings(executedQueries, pass.executedQueries);
    if (pass.diagnostics) diagnostics = pass.diagnostics;
    metaRecentFallbackUsed = metaRecentFallbackUsed || pass.metaRecentFallbackUsed;

    const merged = mergeCommunityEvidenceRows({
      chatRows,
      resourceRows,
      nextChatRows: pass.chatRows,
      nextResourceRows: pass.resourceRows,
    });
    chatRows = merged.chatRows;
    resourceRows = merged.resourceRows;
    memoryRows = mergeCommunityMemoryRows({
      currentRows: memoryRows,
      nextRows: pass.memoryRows,
      limit: COMMUNITY_CONTEXT_BUNDLE_V1.limits.resourceLimit,
    });

    const evidenceCount = countCommunityEvidenceRows({
      chatRows,
      resourceRows,
      memoryRows,
    });
    if (evidenceCount >= sufficiencyTarget) {
      stopReason = "evidence_sufficient";
      break;
    }
  }

  if (
    countCommunityEvidenceRows({
      chatRows,
      resourceRows,
      memoryRows,
    }) === 0
  ) {
    stopReason = "no_evidence";
  }

  const diagnosticsRecord = diagnostics && typeof diagnostics === "object"
    ? diagnostics
    : null;
  const deepDiagnostics = {
    ...(diagnosticsRecord ?? {}),
    deep_research_used: true,
    deep_research_pass_count: passCount,
    deep_research_max_passes: maxPasses,
    deep_research_stop_reason: stopReason,
    deep_research_sufficiency_target: sufficiencyTarget,
    deep_research_query_plan: deepQueryPlan,
  };

  return {
    query,
    limit,
    sourceTypes: params.sourceTypes,
    queryPlan,
    executedQueries,
    diagnostics: deepDiagnostics,
    metaRecentFallbackUsed,
    chatRows,
    resourceRows,
    memoryRows,
    passCount,
    stopReason,
    deepQueryPlan,
  };
}

export async function loadCommunityEntitlement(params: {
  userId: string;
  communityId: string;
}): Promise<boolean> {
  const res = await supabaseAdminFetch(`/rest/v1/rpc/${COMMUNITY_RPC.entitlementCheck}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_user_id: params.userId,
      p_community_id: params.communityId,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  const payload = await res.json();
  return parseBoolishJsonValue(payload);
}

export type CommunitySearchPayloadChatRow = {
  source_type: "chat";
  source_id: string;
  internal_source_id: string;
  sender_display: string;
  created_at: string;
  snippet: string;
};

export type CommunitySearchPayloadResourceRow = {
  source_type: "resource" | "memory";
  source_id: string;
  internal_source_id: string;
  title: string;
  created_at: string;
  snippet: string;
  url: string | null;
};

export type CommunitySearchPayloadMemoryRow = {
  source_type: "memory";
  source_id: string;
  internal_source_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  snippet: string;
  score: number | null;
};

export function sanitizeCommunitySearchPayloadChatRows(
  rows: CommunityChatSnippetRow[],
): CommunitySearchPayloadChatRow[] {
  return rows.map((row, idx) => ({
    source_type: "chat",
    source_id: `chat_${idx + 1}`,
    internal_source_id: String(row.message_id ?? "").trim(),
    sender_display: String(row.sender_display ?? "").trim() || "member",
    created_at: String(row.created_at ?? "").trim(),
    snippet: String(row.snippet ?? "").trim(),
  }));
}

export function sanitizeCommunitySearchPayloadResourceRows(
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
      internal_source_id: String(row.resource_id ?? "").trim(),
      title: String(row.title ?? "").trim() || (sourceType === "memory" ? "Community memory" : "Community resource"),
      created_at: String(row.created_at ?? "").trim(),
      snippet: String(row.snippet ?? "").trim(),
      url: typeof row.url === "string" && row.url.trim() ? row.url.trim() : null,
    };
  });
}

export function sanitizeCommunitySearchPayloadMemoryRows(
  rows: CommunityMemorySearchRow[],
): CommunitySearchPayloadMemoryRow[] {
  return rows.map((row, idx) => ({
    source_type: "memory",
    source_id: `memory_${idx + 1}`,
    internal_source_id: String(row.memory_id ?? "").trim(),
    title: String(row.title ?? "").trim() || "Community memory",
    created_at: String(row.created_at ?? "").trim(),
    updated_at: String(row.updated_at ?? "").trim(),
    snippet: String(row.snippet ?? "").trim(),
    score: typeof row.score === "number" && Number.isFinite(row.score) ? row.score : null,
  }));
}

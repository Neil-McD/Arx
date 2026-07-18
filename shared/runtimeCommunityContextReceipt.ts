export const RUNTIME_COMMUNITY_CONTEXT_RECEIPT_VERSION =
  "runtime_community_context_receipt:v1" as const;

export const RUNTIME_COMMUNITY_CONTEXT_RECEIPT_TOOL_NAMES = [
  "community_search",
  "community_memory_search",
  "community_memory_read",
  "community_chat_search",
  "community_chat_read",
  "community_ai_feed_search",
  "community_ai_feed_read",
  "community_resources_map",
  "community_resources_list",
  "community_resources_read",
  "community_resource_read",
  "community_resources_search",
] as const;

type RuntimeCommunityContextReceiptToolName =
  (typeof RUNTIME_COMMUNITY_CONTEXT_RECEIPT_TOOL_NAMES)[number];

type JsonRecord = Record<string, unknown>;

const RECEIPT_TOOL_NAME_SET = new Set<string>(
  RUNTIME_COMMUNITY_CONTEXT_RECEIPT_TOOL_NAMES,
);
const TOOL_EVENT_TYPES = new Set(["tool_call_started", "tool_call_finished"]);
const MAX_IDENTIFIER_CHARS = 512;
const MAX_RECEIPT_REFERENCES = 12;
const MACHINE_ERROR_CODE_PATTERN = /^[a-z][a-z0-9_]{0,119}$/;
const FALLBACK_ERROR_CODE = "community_context_tool_failed";

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asFiniteInteger(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : null;
}

function boundedIdentifier(value: unknown, maxChars = MAX_IDENTIFIER_CHARS): string | null {
  const normalized = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!normalized) return null;
  return normalized.slice(0, maxChars);
}

function readToolName(payload: JsonRecord): string | null {
  return boundedIdentifier(payload.tool_name ?? payload.tool, 160);
}

function readToolArgs(payload: JsonRecord): JsonRecord {
  const direct = asRecord(payload.args) ?? asRecord(payload.arguments);
  if (direct) return direct;
  if (typeof payload.arguments !== "string" || !payload.arguments.trim()) return {};
  try {
    return asRecord(JSON.parse(payload.arguments)) ?? {};
  } catch {
    return {};
  }
}

function pushUnique(out: string[], value: unknown, maxChars = MAX_IDENTIFIER_CHARS): void {
  const normalized = boundedIdentifier(value, maxChars);
  if (!normalized || out.includes(normalized) || out.length >= MAX_RECEIPT_REFERENCES) return;
  out.push(normalized);
}

function pushValues(out: string[], value: unknown): void {
  if (Array.isArray(value)) {
    for (const entry of value) pushUnique(out, entry);
    return;
  }
  pushUnique(out, value);
}

function buildInputReceipt(args: JsonRecord): JsonRecord {
  const refs: string[] = [];
  const nodeIds: string[] = [];
  const retrievalIds: string[] = [];
  pushValues(refs, args.ref ?? args.refs);
  pushValues(nodeIds, args.node_id ?? args.nodeId);
  pushValues(
    retrievalIds,
    args.retrieval_log_id ?? args.retrievalLogId ?? args.retrieval_id ?? args.retrievalId,
  );
  const query = typeof args.query === "string" ? args.query : null;
  const numericOptions: JsonRecord = {};
  for (const key of [
    "limit",
    "offset",
    "max_chars",
    "maxChars",
    "per_resource_chars",
    "perResourceChars",
    "per_module_limit",
    "perModuleLimit",
  ]) {
    const value = asFiniteInteger(args[key]);
    if (value !== null) numericOptions[key] = value;
  }
  const types = Array.isArray(args.types)
    ? args.types
        .map((value) => boundedIdentifier(value, 80))
        .filter((value): value is string => Boolean(value))
        .slice(0, 12)
    : [];
  return {
    query_present: query !== null && query.trim().length > 0,
    query_char_count: query?.length ?? 0,
    path_present: typeof args.path === "string" && args.path.trim().length > 0,
    refs,
    node_ids: nodeIds,
    retrieval_ids: retrievalIds,
    types,
    numeric_options: numericOptions,
  };
}

function parseOutputRecord(payload: JsonRecord): {
  record: JsonRecord | null;
  status: "parsed" | "empty" | "unparseable" | "structured_details";
  charCount: number;
} {
  const output =
    typeof payload.output === "string"
      ? payload.output
      : typeof payload.output_preview === "string"
        ? payload.output_preview
        : "";
  if (output.trim()) {
    try {
      const parsed = asRecord(JSON.parse(output));
      return {
        record: parsed,
        status: parsed ? "parsed" : "unparseable",
        charCount: output.length,
      };
    } catch {
      return { record: null, status: "unparseable", charCount: output.length };
    }
  }
  const details = asRecord(payload.details);
  if (details) return { record: details, status: "structured_details", charCount: 0 };
  return { record: null, status: "empty", charCount: 0 };
}

type ResultReceiptAccumulator = {
  refs: string[];
  sourceIds: string[];
  nodeIds: string[];
  retrievalIds: string[];
  itemCount: number;
  sourceCounts: JsonRecord;
  receiptSurface: string | null;
  receiptVersion: string | null;
};

const ITEM_ARRAY_KEYS = new Set([
  "recent_context",
  "matches",
  "nodes",
  "resources",
  "items",
  "posts",
  "results",
]);

function collectResultReceipt(
  value: unknown,
  accumulator: ResultReceiptAccumulator,
  parentKey = "",
  depth = 0,
): void {
  if (depth > 7) return;
  if (Array.isArray(value)) {
    if (ITEM_ARRAY_KEYS.has(parentKey)) {
      accumulator.itemCount = Math.max(accumulator.itemCount, value.length);
    }
    for (const entry of value.slice(0, 80)) {
      collectResultReceipt(entry, accumulator, parentKey, depth + 1);
    }
    return;
  }
  const record = asRecord(value);
  if (!record) return;
  for (const [key, entry] of Object.entries(record)) {
    const normalizedKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    if (normalizedKey === "ref" || normalizedKey === "refs" || normalizedKey === "source_ref") {
      pushValues(accumulator.refs, entry);
    } else if (
      normalizedKey === "source_id" ||
      normalizedKey === "source_ids" ||
      normalizedKey === "evidence_citation_ids"
    ) {
      pushValues(accumulator.sourceIds, entry);
    } else if (
      normalizedKey === "node_id" ||
      normalizedKey === "node_ids" ||
      normalizedKey === "retrieved_node_ids" ||
      normalizedKey === "injected_node_ids" ||
      (normalizedKey === "id" && (parentKey === "nodes" || parentKey === "node"))
    ) {
      pushValues(accumulator.nodeIds, entry);
    } else if (
      normalizedKey === "retrieval_id" ||
      normalizedKey === "retrieval_ids" ||
      normalizedKey === "retrieval_log_id" ||
      normalizedKey === "retrieval_log_ids"
    ) {
      pushValues(accumulator.retrievalIds, entry);
    } else if (
      (normalizedKey === "source_counts" || normalizedKey === "archive_source_counts") &&
      asRecord(entry)
    ) {
      const counts: JsonRecord = {};
      for (const [countKey, countValue] of Object.entries(asRecord(entry) ?? {})) {
        const parsed = asFiniteInteger(countValue);
        if (parsed !== null) counts[countKey] = parsed;
      }
      accumulator.sourceCounts[normalizedKey] = counts;
    } else if (normalizedKey === "surface" && parentKey === "retrieval_receipt") {
      accumulator.receiptSurface = boundedIdentifier(entry, 80);
    } else if (normalizedKey === "version" && parentKey === "retrieval_receipt") {
      accumulator.receiptVersion = boundedIdentifier(entry, 120);
    }
    collectResultReceipt(entry, accumulator, normalizedKey, depth + 1);
  }
}

function buildResultReceipt(payload: JsonRecord): JsonRecord {
  const parsed = parseOutputRecord(payload);
  const accumulator: ResultReceiptAccumulator = {
    refs: [],
    sourceIds: [],
    nodeIds: [],
    retrievalIds: [],
    itemCount: 0,
    sourceCounts: {},
    receiptSurface: null,
    receiptVersion: null,
  };
  if (parsed.record) collectResultReceipt(parsed.record, accumulator);
  const ok =
    typeof parsed.record?.ok === "boolean"
      ? parsed.record.ok
      : payload.success === true || payload.status === "ok" || payload.status === "completed";
  return {
    parse_status: parsed.status,
    raw_output_char_count: parsed.charCount,
    ok,
    item_count: accumulator.itemCount,
    refs: accumulator.refs,
    source_ids: accumulator.sourceIds,
    node_ids: accumulator.nodeIds,
    retrieval_ids: accumulator.retrievalIds,
    source_counts: accumulator.sourceCounts,
    retrieval_receipt_surface: accumulator.receiptSurface,
    retrieval_receipt_version: accumulator.receiptVersion,
  };
}

function pickIdentifierFields(payload: JsonRecord): JsonRecord {
  const out: JsonRecord = {};
  for (const key of [
    "run_id",
    "tool_call_id",
    "provider_call_id",
    "item_id",
    "codex_turn_id",
    "engine_id",
    "ingest_source",
  ]) {
    const value = boundedIdentifier(payload[key], 512);
    if (value) out[key] = value;
  }
  for (const key of ["attempt", "worker_event_seq"]) {
    const value = asFiniteInteger(payload[key]);
    if (value !== null) out[key] = value;
  }
  return out;
}

function readFinishedSuccess(payload: JsonRecord, status: string | null): boolean | null {
  if (payload.success === false || status === "error") return false;
  if (payload.success === true || status === "ok" || status === "completed") return true;
  if (payload.error_code || payload.errorCode || payload.error_message || payload.errorMessage) {
    return false;
  }
  return null;
}

function canonicalErrorCode(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return MACHINE_ERROR_CODE_PATTERN.test(normalized) ? normalized : null;
}

export function isRuntimeCommunityContextReceiptToolName(
  value: unknown,
): value is RuntimeCommunityContextReceiptToolName {
  return RECEIPT_TOOL_NAME_SET.has(String(value ?? "").trim());
}

export function projectRuntimeCommunityContextEventPayload(args: {
  eventType: string;
  payload: unknown;
  communityScopeId: unknown;
}): unknown {
  const payload = asRecord(args.payload);
  if (!payload || !TOOL_EVENT_TYPES.has(String(args.eventType ?? "").trim())) {
    return args.payload;
  }
  const toolName = readToolName(payload);
  if (!toolName || !isRuntimeCommunityContextReceiptToolName(toolName)) {
    return args.payload;
  }
  const phase = args.eventType === "tool_call_started" ? "started" : "finished";
  const harnessKind = boundedIdentifier(asRecord(payload.harness)?.kind, 80);
  const communityScopeId = boundedIdentifier(args.communityScopeId, 160);
  const rawStatus = boundedIdentifier(payload.status, 40);
  const exitCode = asFiniteInteger(payload.exit_code ?? payload.exitCode);
  const success = phase === "finished" ? readFinishedSuccess(payload, rawStatus) : null;
  const status =
    phase === "started"
      ? "running"
      : success === true
        ? "ok"
        : success === false
          ? "error"
          : "unknown";
  const errorCode =
    phase === "finished" && success === false
      ? canonicalErrorCode(payload.error_code ?? payload.errorCode) ?? FALLBACK_ERROR_CODE
      : null;
  return {
    ...pickIdentifierFields(payload),
    tool_name: toolName,
    status,
    success,
    exit_code: exitCode,
    error_code: errorCode,
    community_scope_id: communityScopeId,
    harness: harnessKind ? { kind: harnessKind } : null,
    community_context_receipt: {
      version: RUNTIME_COMMUNITY_CONTEXT_RECEIPT_VERSION,
      phase,
      input: buildInputReceipt(readToolArgs(payload)),
      ...(phase === "finished" ? { result: buildResultReceipt(payload) } : null),
    },
  };
}

export function readRuntimeCommunityContextReceipt(payload: unknown): JsonRecord | null {
  const receipt = asRecord(asRecord(payload)?.community_context_receipt);
  return receipt?.version === RUNTIME_COMMUNITY_CONTEXT_RECEIPT_VERSION ? receipt : null;
}

export function runtimeCommunityContextReceiptTarget(payload: unknown): string | null {
  const receipt = readRuntimeCommunityContextReceipt(payload);
  const input = asRecord(receipt?.input);
  const refs = Array.isArray(input?.refs) ? input.refs : [];
  const nodeIds = Array.isArray(input?.node_ids) ? input.node_ids : [];
  const retrievalIds = Array.isArray(input?.retrieval_ids) ? input.retrieval_ids : [];
  return (
    boundedIdentifier(refs[0], 180) ??
    boundedIdentifier(nodeIds[0], 180) ??
    boundedIdentifier(retrievalIds[0], 180)
  );
}

export function runtimeCommunityContextReceiptResultSummary(payload: unknown): string | null {
  const receipt = readRuntimeCommunityContextReceipt(payload);
  const result = asRecord(receipt?.result);
  if (!result) return null;
  const itemCount = asFiniteInteger(result.item_count) ?? 0;
  const refs = Array.isArray(result.refs) ? result.refs.length : 0;
  const sourceIds = Array.isArray(result.source_ids) ? result.source_ids.length : 0;
  const nodeIds = Array.isArray(result.node_ids) ? result.node_ids.length : 0;
  const retrievalIds = Array.isArray(result.retrieval_ids) ? result.retrieval_ids.length : 0;
  const referenceCount = new Set(
    [
      ...(Array.isArray(result.refs) ? result.refs : []),
      ...(Array.isArray(result.source_ids) ? result.source_ids : []),
      ...(Array.isArray(result.node_ids) ? result.node_ids : []),
    ].map((value) => String(value)),
  ).size;
  const parts = [
    itemCount > 0 ? `${itemCount} item${itemCount === 1 ? "" : "s"}` : null,
    referenceCount > 0
      ? `${referenceCount} reference${referenceCount === 1 ? "" : "s"}`
      : null,
    retrievalIds > 0
      ? `${retrievalIds} retrieval receipt${retrievalIds === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("; ") : result.ok === true ? "completed" : null;
}

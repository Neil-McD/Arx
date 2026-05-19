import { api, internal } from "./_generated/api";
import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  INTERNAL_STAGING_MCP_CANARY_CATALOG_APP_ID,
  resolveInternalStagingMcpCanaryEndpointUrl,
} from "../shared/discoverCatalog.ts";
import {
  encodeMcpToolForStorage,
  normalizeStoredSnapshotTools,
} from "./mcpSnapshotCodec";
import {
  handleRuntimeTurnRequest,
  type JsonResponseFn,
} from "./runtimeTurnHandlers";
import type { SseResponseFn } from "./httpRuntimeTurnState";
import type { RequireAuthenticatedActor } from "./runtimeTurnResolution";

const DEFAULT_OWNER_EMAIL = "neilmcdevittd@gmail.com";
const DEFAULT_PROJECT_NAME = "General";
const STAGING_HOSTNAME = "polynet-staging.vercel.app";
const STAGING_MCP_CANARY_APP_NAME = "PolyNet staging MCP canary";
const STAGING_MCP_CANARY_APP_SLUG = "polynet-staging-mcp-canary";
const STAGING_MCP_CANARY_TOOL_NAME = "read_canary_record";
const STAGING_MCP_CANARY_NAMESPACED_TOOL_NAME =
  "polynet_staging_canary__read_canary_record";
const STAGING_MCP_CANARY_RUNTIME_TOOL_NAME =
  `me__${STAGING_MCP_CANARY_NAMESPACED_TOOL_NAME}`;
const DEFAULT_CODEX_MCP_CANARY_THREAD_KEY = "staging-codex-mounted-mcp-canary-v2";
const DEFAULT_CODEX_STREAMING_CANARY_THREAD_KEY =
  "staging-codex-primary-streaming-canary-v1";

const expectedCommunityArg = v.object({
  slug: v.string(),
  name: v.string(),
  visibility: v.optional(v.union(v.literal("published"), v.literal("unlisted"))),
  entryPolicy: v.optional(
    v.union(v.literal("open"), v.literal("approval"), v.literal("paid_subscription")),
  ),
  oneLiner: v.optional(v.string()),
});

type ExpectedCommunity = {
  slug: string;
  name: string;
  visibility?: "published" | "unlisted";
  entryPolicy?: "open" | "approval" | "paid_subscription";
  oneLiner?: string;
};

export type StagingAction = {
  entity: string;
  key: string;
  action: string;
  id?: string;
  changedFields?: string[];
};

type CodexHarnessOperabilityFingerprint = {
  nowMs: number;
  bridgeSessions: {
    activeCount: number;
    expiredCount: number;
    revokedActiveCount: number;
    sampleActiveRunIds: string[];
  };
  bindingLocks: {
    activeCount: number;
    expiredCount: number;
    duplicateActiveKeyCount: number;
    duplicateActiveRowCount: number;
    sampleDuplicateActiveKeys: string[];
    sampleActiveRunIds: string[];
  };
  threadBindings: {
    activeCount: number;
    rotatedCount: number;
    duplicateActiveKeyCount: number;
    duplicateActiveRowCount: number;
    duplicateAnyStatusKeyCount: number;
    sampleDuplicateActiveKeys: string[];
  };
};

const CODEX_THREAD_BINDING_EVIDENCE_EVENT_TYPES = new Set([
  "runtime_agent_harness_selected",
  "runtime_agent_harness_prepared",
  "runtime_agent_harness_fallback_started",
  "runtime_agent_harness_fallback_skipped",
  "codex_mcp_projection_resolved",
  "codex_thread_binding_resolved",
  "codex_thread_binding_lock_acquired",
  "codex_thread_binding_lock_conflict",
  "codex_thread_binding_lock_released",
  "codex_thread_binding_created",
  "codex_thread_binding_resumed",
  "codex_thread_binding_rotated",
  "codex_thread_binding_persist_failed",
  "codex_thread_binding_persist_skipped",
  "codex_mcp_projection_fingerprint_changed",
  "codex_harness_primary_started",
  "codex_harness_primary_completed",
  "codex_harness_stream_event_summary",
  "codex_harness_live_stream_delta_failed",
  "codex_harness_primary_dynamic_tool_event",
  "codex_harness_dynamic_tool_bridge_call_started",
  "codex_harness_dynamic_tool_bridge_call_completed",
  "codex_harness_dynamic_tool_bridge_call_failed",
  "codex_harness_dynamic_tool_bridge_call_finished",
  "codex_harness_dynamic_tool_bridge_call_denied",
  "mcp_connection_bundle_loaded",
  "mcp_session_initialized",
  "mcp_session_reused",
  "mcp_session_reinitialized",
  "mcp_tool_execution_completed",
]);

const CODEX_THREAD_BINDING_COMPACT_EVIDENCE_EVENT_TYPES = new Set([
  "runtime_agent_harness_selected",
  "codex_thread_binding_resolved",
  "codex_thread_binding_lock_acquired",
  "codex_thread_binding_lock_conflict",
  "codex_thread_binding_lock_released",
  "codex_thread_binding_created",
  "codex_thread_binding_resumed",
  "codex_thread_binding_rotated",
  "codex_thread_binding_persist_failed",
  "codex_thread_binding_persist_skipped",
  "codex_harness_primary_completed",
  "codex_harness_stream_event_summary",
  "runtime_agent_harness_fallback_started",
  "runtime_agent_harness_fallback_skipped",
  "codex_harness_primary_dynamic_tool_event",
]);

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // Convex environments may not expose process.env in every runtime.
  }
  return "";
}

function normalizeEmail(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

function normalizeSlug(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

export function normalizeText(raw: unknown): string {
  return String(raw ?? "").trim().replace(/\s+/g, " ");
}

export function normalizeLimit(raw: unknown, fallback: number, max: number): number {
  const value = Math.floor(Number(raw));
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(max, value));
}

function normalizeOptionalId(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  return value || null;
}

function pickPayloadFields(
  payload: unknown,
  fields: readonly string[],
): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  const record = payload as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    if (field in record) out[field] = record[field];
  }
  return out;
}

function summarizeCodexThreadBindingEvidencePayload(args: {
  eventType: string;
  payload: unknown;
}): Record<string, unknown> {
  const common = [
    "run_id",
    "status",
    "code",
    "message",
    "latency_ms",
    "projection_fingerprint",
    "projection_version",
    "dynamic_tool_surface_fingerprint",
    "dynamic_tool_surface_version",
  ];
  if (args.eventType === "runtime_agent_harness_prepared") {
    const base = pickPayloadFields(args.payload, [
      "run_id",
      "harness_id",
      "execution_placement",
      "inference_source",
      "stream",
      "thread_id",
      "project_id",
      "community_scope_id",
      "mounted_tool_count",
      "active_tool_count",
      "fixed_allowed_tool_count",
      "codex_primary_canary",
      "codex_mcp_projection",
      "skill_counts",
    ]);
    return base;
  }
  if (args.eventType === "runtime_agent_harness_selected") {
    return pickPayloadFields(args.payload, [
      "run_id",
      "selected_harness_id",
      "candidate_harness_id",
	      "fallback_harness_id",
	      "execution_placement",
	      "selection_reason",
      "codex_primary_enabled",
      "codex_primary_streaming_enabled",
      "codex_route_selected",
      "stream",
    ]);
  }
  if (
    args.eventType === "runtime_agent_harness_fallback_started" ||
    args.eventType === "runtime_agent_harness_fallback_skipped"
  ) {
    return pickPayloadFields(args.payload, [
      ...common,
      "failed_harness_id",
      "fallback_harness_id",
      "skipped_reason",
      "failed_code",
      "failed_message",
    ]);
  }
  if (args.eventType === "codex_mcp_projection_resolved") {
    return pickPayloadFields(args.payload, [
      "run_id",
      "projection_owner",
      "codex_route_selected",
      "version",
      "mode",
      "fingerprint",
      "eligible_tool_count",
      "blocked_tool_count",
      "server_count",
      "eligible_runtime_tool_names",
    ]);
  }
  if (args.eventType === "codex_thread_binding_resolved") {
    return pickPayloadFields(args.payload, [
      ...common,
      "action",
      "reason",
      "binding_key_present",
      "resume_thread_id_present",
      "codex_home_persistent",
      "previous_codex_thread_id_present",
      "duplicate_binding_count",
    ]);
  }
  if (
    args.eventType === "codex_thread_binding_lock_acquired" ||
    args.eventType === "codex_thread_binding_lock_conflict" ||
    args.eventType === "codex_thread_binding_lock_released"
  ) {
    return pickPayloadFields(args.payload, [
      ...common,
      "status",
      "code",
      "reason",
      "binding_key_present",
      "blocking_run_id_present",
      "lock_expires_at",
      "duplicate_lock_count",
      "released_lock_row_count",
      "repaired_duplicate_lock_count",
    ]);
  }
  if (
    args.eventType === "codex_thread_binding_created" ||
    args.eventType === "codex_thread_binding_resumed" ||
    args.eventType === "codex_thread_binding_rotated"
  ) {
    return pickPayloadFields(args.payload, [
      ...common,
      "lifecycle_action",
      "binding_key_present",
      "codex_thread_id_present",
      "observed_codex_thread_id",
      "resume_requested_codex_thread_id",
      "previous_codex_thread_id_present",
      "rotated_reason",
      "resume_attempted",
      "resume_failed",
      "resume_thread_id_matched",
      "resume_error_message",
      "duplicate_binding_count",
      "repaired_duplicate_binding_count",
      "codex_session_archive_strategy",
      "codex_session_archive_present",
      "codex_session_archive_restored",
      "codex_session_archive_persisted",
      "codex_session_archive_error_message",
    ]);
  }
  if (
    args.eventType === "codex_thread_binding_persist_skipped" ||
    args.eventType === "codex_thread_binding_persist_failed"
  ) {
    return pickPayloadFields(args.payload, [
      ...common,
      "code",
      "message",
      "binding_key_present",
      "codex_thread_id_present",
      "observed_codex_thread_id",
      "projection_fingerprint",
      "projection_version",
      "codex_session_archive_strategy",
      "codex_session_archive_error_message",
    ]);
  }
  if (args.eventType === "codex_harness_primary_started") {
    return pickPayloadFields(args.payload, [
      ...common,
      "model",
      "prompt_chars",
      "instruction_chars",
      "tool_projection",
      "platform_tool_projection",
      "combined_tool_projection",
      "codex_mcp_projection",
      "codex_dynamic_tool_surface",
      "codex_mcp_projection_execution",
      "dynamic_tool_bridge_configured",
      "dynamic_tool_requested_names",
      "dynamic_platform_tool_requested_names",
      "dynamic_mcp_tool_requested_names",
      "dynamic_tool_active_names",
      "dynamic_mcp_tool_active_names",
      "sandbox_policy",
      "approval_policy",
    ]);
  }
  if (args.eventType === "codex_harness_primary_completed") {
    return pickPayloadFields(args.payload, [
      ...common,
      "model",
      "codex_version",
      "thread_id_present",
      "observed_codex_thread_id",
      "thread_lifecycle_action",
      "thread_resume_attempted",
      "thread_resume_failed",
      "thread_resume_thread_id_matched",
      "resume_requested_codex_thread_id",
      "thread_resume_error_message",
      "codex_home_persistent",
      "codex_home_runtime_isolated",
      "codex_session_archive_strategy",
      "codex_session_archive_present",
      "codex_session_archive_restored",
      "codex_session_archive_persisted",
      "codex_session_archive_error_message",
      "binding_action",
      "turn_id_present",
      "sandbox_policy_type",
      "sandbox_policy_network_access",
      "sandbox_policy_writable_root_count",
      "sandbox_policy_exclude_tmpdir_env_var",
      "sandbox_policy_exclude_slash_tmp",
	      "dynamic_tool_bridge_configured",
	      "dynamic_tool_request_count",
	      "dynamic_tool_response_count",
      "dynamic_tool_failure_count",
      "streaming_transport",
      "stream_event_count",
      "live_stream_delta_events",
      "live_stream_delta_chars",
      "live_stream_delta_emit_failures",
      "first_stream_event_latency_ms",
      "last_stream_event_latency_ms",
      "log_poll_count",
      "malformed_stream_event_line_count",
      "output_sha256",
      "stdout_chars",
      "stage",
      "exit_code",
    ]);
  }
  if (args.eventType === "codex_harness_stream_event_summary") {
    return pickPayloadFields(args.payload, [
      ...common,
      "source",
      "captured_stream_events",
      "counts_by_type",
      "assistant_delta_events",
      "assistant_delta_chars",
      "first_stream_event_latency_ms",
      "last_stream_event_latency_ms",
      "first_assistant_delta_latency_ms",
      "reasoning_delta_events",
      "tool_output_delta_events",
      "tool_output_delta_chars",
      "raw_delta_storage_policy",
    ]);
  }
  if (args.eventType === "codex_harness_live_stream_delta_failed") {
    return pickPayloadFields(args.payload, [
      ...common,
      "delta_chars",
      "attempted_delta_events",
      "emitted_delta_events",
      "emitted_delta_chars",
    ]);
  }
  if (
    args.eventType === "codex_harness_dynamic_tool_bridge_call_started" ||
    args.eventType === "codex_harness_dynamic_tool_bridge_call_completed" ||
    args.eventType === "codex_harness_dynamic_tool_bridge_call_failed" ||
    args.eventType === "codex_harness_dynamic_tool_bridge_call_finished" ||
    args.eventType === "codex_harness_dynamic_tool_bridge_call_denied" ||
    args.eventType === "codex_harness_primary_dynamic_tool_event"
  ) {
    return pickPayloadFields(args.payload, [
      ...common,
      "tool_name",
      "call_id",
      "sequence",
      "success",
      "args_present",
      "output_chars",
      "output_sha256",
      "error_code",
    ]);
  }
  if (
    args.eventType === "mcp_connection_bundle_loaded" ||
    args.eventType === "mcp_session_initialized" ||
    args.eventType === "mcp_session_reused" ||
    args.eventType === "mcp_session_reinitialized" ||
    args.eventType === "mcp_tool_execution_completed"
  ) {
    return pickPayloadFields(args.payload, [
      ...common,
      "scope",
      "developer_app_id",
      "app_name",
      "protocol_version",
      "has_session_id",
      "runtime_tool_name",
      "risk_level",
      "status",
      "error_code",
      "refreshed_session",
    ]);
  }
  return pickPayloadFields(args.payload, common);
}

function readStagingHostname(): string {
  const raw = readEnv("ARX_PUBLIC_APP_URL") || readEnv("VITE_PUBLIC_APP_URL");
  if (!raw) return "";
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function readCodexDynamicToolBridgeUrl(): string {
  const explicit = readEnv("POLYNET_CODEX_DYNAMIC_TOOL_BRIDGE_URL");
  if (explicit) return explicit;
  const siteUrl =
    readEnv("CONVEX_SITE_URL") ||
    readEnv("VITE_CONVEX_SITE_URL") ||
    readEnv("PUBLIC_CONVEX_SITE_URL");
  return siteUrl ? `${siteUrl.replace(/\/+$/, "")}/runtime/codex_harness_dynamic_tool` : "";
}

function readStagingMcpCanaryEndpointUrl(): string {
  return resolveInternalStagingMcpCanaryEndpointUrl();
}

function stagingJsonResponse(_req: Request, status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

const stagingSseResponse: SseResponseFn = (_req, source) => {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const write = (event: string, data: Record<string, unknown>) => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };
      const close = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };
      if (Array.isArray(source)) {
        for (const entry of source) write(entry.event, entry.data);
        close();
        return;
      }
      const writer = {
        send(entry: { event: string; data: Record<string, unknown> }) {
          write(entry.event, entry.data);
        },
        close() {
          close();
        },
      };
      Promise.resolve(source(writer))
        .then(() => {
          close();
        })
        .catch((error) => {
          write("error", {
            error: error instanceof Error ? error.message : String(error ?? "Stream failed."),
          });
          close();
        });
    },
  });
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
};

function parseStagingRuntimeSseEvents(responseText: string): Array<{
  event: string;
  data: Record<string, unknown>;
}> {
  const events: Array<{ event: string; data: Record<string, unknown> }> = [];
  for (const block of String(responseText ?? "").split(/\n\n+/)) {
    const lines = block.split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) continue;
    let eventName = "message";
    const dataLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventName = line.slice("event:".length).trim() || eventName;
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trim());
      }
    }
    if (dataLines.length === 0) continue;
    const rawData = dataLines.join("\n");
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(rawData);
    } catch {
      parsed = null;
    }
    events.push({
      event: eventName,
      data:
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : {},
    });
  }
  return events;
}

function summarizeStagingRuntimeSseResponse(responseText: string): Record<string, unknown> {
  const events = parseStagingRuntimeSseEvents(responseText);
  const eventCounts: Record<string, number> = {};
  let deltaEventCount = 0;
  let deltaChars = 0;
  let runtimeEventCount = 0;
  let doneEventCount = 0;
  let errorEventCount = 0;
  let doneFullContentChars: number | null = null;
  const runtimeEventTypes = new Set<string>();
  for (const entry of events) {
    eventCounts[entry.event] = (eventCounts[entry.event] ?? 0) + 1;
    if (entry.event === "delta") {
      deltaEventCount += 1;
      deltaChars += String(entry.data.delta ?? "").length;
    } else if (entry.event === "runtime_event") {
      runtimeEventCount += 1;
      const eventType = String(entry.data.eventType ?? entry.data.event_type ?? "").trim();
      if (eventType) runtimeEventTypes.add(eventType);
    } else if (entry.event === "done") {
      doneEventCount += 1;
      doneFullContentChars = String(entry.data.full_content ?? "").length;
    } else if (entry.event === "error") {
      errorEventCount += 1;
    }
  }
  return {
    eventCount: events.length,
    eventCounts,
    eventTypes: events.map((entry) => entry.event),
    deltaEventCount,
    deltaChars,
    runtimeEventCount,
    runtimeEventTypes: [...runtimeEventTypes].sort(),
    doneEventCount,
    doneFullContentChars,
    errorEventCount,
  };
}

function canarySnapshotTools() {
  return [
    encodeMcpToolForStorage({
      tool_name: STAGING_MCP_CANARY_TOOL_NAME,
      namespaced_tool_name: STAGING_MCP_CANARY_NAMESPACED_TOOL_NAME,
      description:
        "Read deterministic staging evidence for the PolyNet mounted MCP bridge canary.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          marker: {
            type: "string",
          },
        },
      },
      risk_level: "read",
    }),
  ];
}

function snapshotHasStagingCanaryTool(snapshot: any, endpointUrl: string): boolean {
  if (!snapshot || snapshot.validationStatus !== "ok") return false;
  if (normalizeText(snapshot.endpointUrl) !== endpointUrl) return false;
  return normalizeStoredSnapshotTools(snapshot.toolsJson).some(
    (tool) =>
      tool.tool_name === STAGING_MCP_CANARY_TOOL_NAME &&
      tool.namespaced_tool_name === STAGING_MCP_CANARY_NAMESPACED_TOOL_NAME &&
      tool.risk_level === "read",
  );
}

async function resolveStagingUniqueDeveloperAppSlug(args: {
  ctx: any;
  ownerUserId: any;
  baseSlug: string;
  existingDeveloperAppId?: any;
}): Promise<string> {
  const baseSlug = normalizeSlug(args.baseSlug) || STAGING_MCP_CANARY_APP_SLUG;
  const rows = await args.ctx.db
    .query("developerApps")
    .withIndex("by_owner", (q: any) => q.eq("ownerUserId", args.ownerUserId))
    .collect();
  const conflicts = new Set(
    rows
      .filter((row: any) => String(row._id) !== String(args.existingDeveloperAppId ?? ""))
      .map((row: any) => normalizeSlug(row.slug))
      .filter(Boolean),
  );
  if (!conflicts.has(baseSlug)) return baseSlug;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${baseSlug}-${suffix}`.slice(0, 80);
    if (!conflicts.has(candidate)) return candidate;
  }
  throw new Error("staging_mcp_canary_slug_conflict");
}

async function buildCodexHarnessOperabilityFingerprint(args: {
  ctx: any;
  nowMs: number;
}): Promise<CodexHarnessOperabilityFingerprint> {
  const expiredBridgeSessions = await args.ctx.db
    .query("codexHarnessBridgeSessions")
    .withIndex("by_expiresAt", (q: any) => q.lte("expiresAt", args.nowMs))
    .collect();
  const futureBridgeSessions = await args.ctx.db
    .query("codexHarnessBridgeSessions")
    .withIndex("by_expiresAt", (q: any) => q.gt("expiresAt", args.nowMs))
    .collect();
  const expiredBindingLocks = await args.ctx.db
    .query("codexHarnessThreadBindingLocks")
    .withIndex("by_expiresAt", (q: any) => q.lte("expiresAt", args.nowMs))
    .collect();
  const futureBindingLocks = await args.ctx.db
    .query("codexHarnessThreadBindingLocks")
    .withIndex("by_expiresAt", (q: any) => q.gt("expiresAt", args.nowMs))
    .collect();
  const threadBindings = await args.ctx.db
    .query("codexHarnessThreadBindings")
    .collect();
  const activeBridgeSessions = futureBridgeSessions.filter(
    (session: any) => !session.revokedAt,
  );
  const revokedActiveBridgeSessions = futureBridgeSessions.filter(
    (session: any) => Boolean(session.revokedAt),
  );
  const activeBindingLocks = futureBindingLocks;
  const activeBindingLockDuplicates = summarizeDuplicateRowsByKey(
    activeBindingLocks,
    "bindingKey",
  );
  const activeThreadBindings = threadBindings.filter(
    (binding: any) => binding.status === "active",
  );
  const rotatedThreadBindings = threadBindings.filter(
    (binding: any) => binding.status === "rotated",
  );
  const activeThreadBindingDuplicates = summarizeDuplicateRowsByKey(
    activeThreadBindings,
    "bindingKey",
  );
  const anyThreadBindingDuplicates = summarizeDuplicateRowsByKey(
    threadBindings,
    "bindingKey",
  );
  return {
    nowMs: args.nowMs,
    bridgeSessions: {
      activeCount: activeBridgeSessions.length,
      expiredCount: expiredBridgeSessions.length,
      revokedActiveCount: revokedActiveBridgeSessions.length,
      sampleActiveRunIds: activeBridgeSessions
        .map((session: any) => normalizeText(session.runId))
        .filter(Boolean)
        .slice(0, 10),
    },
    bindingLocks: {
      activeCount: activeBindingLocks.length,
      expiredCount: expiredBindingLocks.length,
      duplicateActiveKeyCount: activeBindingLockDuplicates.duplicateKeyCount,
      duplicateActiveRowCount: activeBindingLockDuplicates.duplicateRowCount,
      sampleDuplicateActiveKeys: activeBindingLockDuplicates.sampleDuplicateKeys,
      sampleActiveRunIds: activeBindingLocks
        .map((lock: any) => normalizeText(lock.runId))
        .filter(Boolean)
        .slice(0, 10),
    },
    threadBindings: {
      activeCount: activeThreadBindings.length,
      rotatedCount: rotatedThreadBindings.length,
      duplicateActiveKeyCount: activeThreadBindingDuplicates.duplicateKeyCount,
      duplicateActiveRowCount: activeThreadBindingDuplicates.duplicateRowCount,
      duplicateAnyStatusKeyCount: anyThreadBindingDuplicates.duplicateKeyCount,
      sampleDuplicateActiveKeys: activeThreadBindingDuplicates.sampleDuplicateKeys,
    },
  };
}

function summarizeDuplicateRowsByKey(rows: readonly any[], keyField: string): {
  duplicateKeyCount: number;
  duplicateRowCount: number;
  sampleDuplicateKeys: string[];
} {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = normalizeText(row?.[keyField]);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const duplicateEntries = [...counts.entries()].filter(([, count]) => count > 1);
  return {
    duplicateKeyCount: duplicateEntries.length,
    duplicateRowCount: duplicateEntries.reduce((sum, [, count]) => sum + count - 1, 0),
    sampleDuplicateKeys: duplicateEntries.map(([key]) => key).slice(0, 10),
  };
}

export function assertStagingMaintenanceAllowed(args: { maintenanceToken: string }): void {
  const enabled = readEnv("POLYNET_STAGING_MAINTENANCE_ENABLED").toLowerCase() === "true";
  if (!enabled) throw new Error("staging_maintenance_disabled");

  const hostname = readStagingHostname();
  if (hostname !== STAGING_HOSTNAME) {
    throw new Error("staging_maintenance_wrong_environment");
  }

  const expectedToken = readEnv("POLYNET_STAGING_MAINTENANCE_TOKEN");
  if (!expectedToken) throw new Error("staging_maintenance_token_not_configured");
  if (!args.maintenanceToken || args.maintenanceToken !== expectedToken) {
    throw new Error("staging_maintenance_token_invalid");
  }
}

function defaultExpectedCommunities(): ExpectedCommunity[] {
  return [
    {
      slug: "polynet",
      name: "Polynet",
      visibility: "published",
      entryPolicy: "open",
      oneLiner: "PolyNet staging control community.",
    },
    {
      slug: "distribution-engineering",
      name: "Distribution Engineering",
      visibility: "published",
      entryPolicy: "open",
      oneLiner: "Distribution Engineering staging community.",
    },
  ];
}

function normalizeExpectedCommunities(raw: readonly ExpectedCommunity[] | undefined): ExpectedCommunity[] {
  const source = raw && raw.length > 0 ? raw : defaultExpectedCommunities();
  const out: ExpectedCommunity[] = [];
  const seen = new Set<string>();
  for (const item of source) {
    const slug = normalizeSlug(item.slug);
    const name = normalizeText(item.name);
    if (!slug || !name || seen.has(slug)) continue;
    seen.add(slug);
    out.push({
      slug,
      name,
      visibility: item.visibility ?? "published",
      entryPolicy: item.entryPolicy ?? "open",
      oneLiner: normalizeText(item.oneLiner) || undefined,
    });
  }
  return out;
}

export async function findOwnerUser(args: {
  ctx: any;
  ownerId?: string | null;
  ownerEmail?: string | null;
  ownerAuthSubject?: string | null;
}) {
  const ownerId = normalizeOptionalId(args.ownerId);
  const ownerEmail = normalizeEmail(args.ownerEmail) || DEFAULT_OWNER_EMAIL;
  const ownerAuthSubject = normalizeText(args.ownerAuthSubject);
  const byOwnerId = ownerId ? await args.ctx.db.get(ownerId as any) : null;
  const byEmail = ownerEmail
    ? await args.ctx.db
        .query("users")
        .withIndex("by_normalizedEmail", (q: any) => q.eq("normalizedEmail", ownerEmail))
        .first()
    : null;
  const byEmailFallback =
    !byEmail && ownerEmail
      ? (await args.ctx.db.query("users").collect()).find(
          (row: any) =>
            normalizeEmail(row.normalizedEmail) === ownerEmail ||
            normalizeEmail(row.email) === ownerEmail,
        ) ?? null
      : null;
  const byAuthSubject = ownerAuthSubject
    ? await args.ctx.db
        .query("users")
        .withIndex("by_authSubject", (q: any) => q.eq("authSubject", ownerAuthSubject))
        .first()
    : null;
  if (byOwnerId && byEmail && String(byOwnerId._id) !== String(byEmail._id)) {
    throw new Error("staging_owner_id_email_mismatch");
  }
  if (byOwnerId && byEmailFallback && String(byOwnerId._id) !== String(byEmailFallback._id)) {
    throw new Error("staging_owner_id_email_mismatch");
  }
  if (byOwnerId && byAuthSubject && String(byOwnerId._id) !== String(byAuthSubject._id)) {
    throw new Error("staging_owner_id_auth_subject_mismatch");
  }
  if (byEmail && byAuthSubject && String(byEmail._id) !== String(byAuthSubject._id)) {
    throw new Error("staging_owner_identity_mismatch");
  }
  const owner = byOwnerId ?? byEmail ?? byEmailFallback ?? byAuthSubject;
  if (!owner) throw new Error("staging_owner_user_missing");
  return owner;
}

async function readCommunityBySlug(ctx: any, slug: string) {
  return await ctx.db
    .query("communities")
    .withIndex("by_slug", (q: any) => q.eq("slug", slug))
    .first();
}

async function ensureExpectedCommunity(args: {
  ctx: any;
  ownerId: any;
  expected: ExpectedCommunity;
  dryRun: boolean;
  nowMs: number;
}): Promise<{ row: any | null; action: StagingAction }> {
  const existing = await readCommunityBySlug(args.ctx, args.expected.slug);
  if (!existing) {
    const action: StagingAction = {
      entity: "community",
      key: args.expected.slug,
      action: args.dryRun ? "would_create" : "created",
      changedFields: ["ownerId", "slug", "name", "visibility", "entryPolicy", "oneLiner"],
    };
    if (args.dryRun) return { row: null, action };
    const id = await args.ctx.db.insert("communities", {
      ownerId: args.ownerId,
      slug: args.expected.slug,
      name: args.expected.name,
      oneLiner: args.expected.oneLiner,
      visibility: args.expected.visibility ?? "published",
      entryPolicy: args.expected.entryPolicy ?? "open",
      createdAt: args.nowMs,
      updatedAt: args.nowMs,
    });
    const row = await args.ctx.db.get(id);
    return { row, action: { ...action, id: String(id) } };
  }

  const patch: Record<string, unknown> = {};
  const changedFields: string[] = [];
  if (String(existing.ownerId) !== String(args.ownerId)) {
    patch.ownerId = args.ownerId;
    changedFields.push("ownerId");
  }
  if (normalizeText(existing.name) !== args.expected.name) {
    patch.name = args.expected.name;
    changedFields.push("name");
  }
  if (existing.visibility !== (args.expected.visibility ?? "published")) {
    patch.visibility = args.expected.visibility ?? "published";
    changedFields.push("visibility");
  }
  if (existing.entryPolicy !== (args.expected.entryPolicy ?? "open")) {
    patch.entryPolicy = args.expected.entryPolicy ?? "open";
    changedFields.push("entryPolicy");
  }
  if (!normalizeText(existing.oneLiner) && args.expected.oneLiner) {
    patch.oneLiner = args.expected.oneLiner;
    changedFields.push("oneLiner");
  }
  if (changedFields.length === 0) {
    return {
      row: existing,
      action: {
        entity: "community",
        key: args.expected.slug,
        id: String(existing._id),
        action: "already_ok",
      },
    };
  }
  if (!args.dryRun) {
    await args.ctx.db.patch(existing._id, {
      ...patch,
      updatedAt: args.nowMs,
    });
  }
  const row = args.dryRun ? existing : await args.ctx.db.get(existing._id);
  return {
    row,
    action: {
      entity: "community",
      key: args.expected.slug,
      id: String(existing._id),
      action: args.dryRun ? "would_repair" : "repaired",
      changedFields,
    },
  };
}

export async function ensureExpectedProject(args: {
  ctx: any;
  ownerId: any;
  projectName: string;
  dryRun: boolean;
  nowMs: number;
}): Promise<{ row: any | null; action: StagingAction; existingCount: number }> {
  const rows = await args.ctx.db
    .query("cloudProjects")
    .withIndex("by_owner", (q: any) => q.eq("ownerId", args.ownerId))
    .collect();
  const matching = rows
    .filter((row: any) => normalizeText(row.name) === args.projectName)
    .sort((a: any, b: any) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  const existing = matching[0] ?? null;
  if (existing) {
    return {
      row: existing,
      existingCount: matching.length,
      action: {
        entity: "cloudProject",
        key: args.projectName,
        id: String(existing._id),
        action: matching.length > 1 ? "already_ok_duplicate_names_present" : "already_ok",
      },
    };
  }
  const action: StagingAction = {
    entity: "cloudProject",
    key: args.projectName,
    action: args.dryRun ? "would_create" : "created",
    changedFields: ["ownerId", "name", "status"],
  };
  if (args.dryRun) return { row: null, action, existingCount: 0 };
  const id = await args.ctx.db.insert("cloudProjects", {
    ownerId: args.ownerId,
    name: args.projectName,
    status: "active",
    createdAt: args.nowMs,
    updatedAt: args.nowMs,
  });
  return {
    row: await args.ctx.db.get(id),
    action: { ...action, id: String(id) },
    existingCount: 1,
  };
}

async function buildFingerprint(args: {
  ctx: any;
  ownerId?: string | null;
  ownerEmail?: string | null;
  ownerAuthSubject?: string | null;
  communities?: readonly ExpectedCommunity[];
  projectName?: string | null;
}) {
  const owner = await findOwnerUser({
    ctx: args.ctx,
    ownerId: args.ownerId ?? null,
    ownerEmail: args.ownerEmail,
    ownerAuthSubject: args.ownerAuthSubject,
  });
  const expectedCommunities = normalizeExpectedCommunities(args.communities);
  const projectName = normalizeText(args.projectName) || DEFAULT_PROJECT_NAME;
  const communities = [];
  for (const expected of expectedCommunities) {
    const row = await readCommunityBySlug(args.ctx, expected.slug);
    communities.push({
      slug: expected.slug,
      expectedName: expected.name,
      id: row ? String(row._id) : null,
      name: row?.name ?? null,
      ownerId: row ? String(row.ownerId) : null,
      ownedByExpectedUser: row ? String(row.ownerId) === String(owner._id) : false,
      visibility: row?.visibility ?? null,
      entryPolicy: row?.entryPolicy ?? null,
      exists: Boolean(row),
    });
  }

  const projects = await args.ctx.db
    .query("cloudProjects")
    .withIndex("by_owner", (q: any) => q.eq("ownerId", owner._id))
    .collect();
  const matchingProjects = projects
    .filter((row: any) => normalizeText(row.name) === projectName)
    .sort((a: any, b: any) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  const nowMs = Date.now();
  const codexHarnessOperability = await buildCodexHarnessOperabilityFingerprint({
    ctx: args.ctx,
    nowMs,
  });

  const chatgptConnections = await args.ctx.db
    .query("userProviderConnections")
    .withIndex("by_user_provider", (q: any) => q.eq("userId", owner._id).eq("provider", "chatgpt"))
    .collect();
  const pendingChatgptAuthStates = await args.ctx.db
    .query("userProviderAuthStates")
    .withIndex("by_user_provider", (q: any) => q.eq("userId", owner._id).eq("provider", "chatgpt"))
    .collect();
  const pendingChatgptDeviceStates = await args.ctx.db
    .query("userProviderDeviceAuthStates")
    .withIndex("by_user_provider", (q: any) => q.eq("userId", owner._id).eq("provider", "chatgpt"))
    .collect();

  return {
    staging: {
      hostname: readStagingHostname(),
      appUrlConfigured: Boolean(readEnv("ARX_PUBLIC_APP_URL") || readEnv("VITE_PUBLIC_APP_URL")),
      maintenanceEnabled: readEnv("POLYNET_STAGING_MAINTENANCE_ENABLED").toLowerCase() === "true",
    },
    owner: {
      id: String(owner._id),
      email: owner.email ?? null,
      normalizedEmail: owner.normalizedEmail ?? null,
      displayName: owner.displayName ?? null,
      authSubjectPresent: Boolean(owner.authSubject),
    },
    communities,
    project: {
      expectedName: projectName,
      exists: matchingProjects.length > 0,
      duplicateNameCount: matchingProjects.length,
      duplicateIds: matchingProjects.map((row: any) => String(row._id)),
      id: matchingProjects[0] ? String(matchingProjects[0]._id) : null,
      name: matchingProjects[0]?.name ?? null,
    },
    codex: {
      harnessEnabled: readEnv("POLYNET_CODEX_HARNESS_ENABLED").toLowerCase() === "true",
      executorEnabled: readEnv("POLYNET_CODEX_HARNESS_EXECUTOR_ENABLED").toLowerCase() === "true",
      primaryEnabled: readEnv("POLYNET_CODEX_HARNESS_PRIMARY_ENABLED").toLowerCase() === "true",
      primaryStreamingEnabled: readEnv("POLYNET_CODEX_HARNESS_PRIMARY_STREAMING_ENABLED").toLowerCase() === "true",
      probeMode: readEnv("POLYNET_CODEX_HARNESS_PROBE_MODE") || null,
      dynamicToolBridgeUrlConfigured: Boolean(readCodexDynamicToolBridgeUrl()),
      daytonaApiKeyPresent: Boolean(readEnv("DAYTONA_API_KEY")),
      daytonaOrgIdPresent: Boolean(readEnv("DAYTONA_ORG_ID") || readEnv("DAYTONA_ORGANIZATION_ID")),
      daytonaSnapshotPresent: Boolean(readEnv("DAYTONA_SNAPSHOT")),
      openaiApiKeyPresent: Boolean(readEnv("OPENAI_API_KEY")),
      chatgptConnectionCount: chatgptConnections.length,
      pendingChatgptAuthStateCount: pendingChatgptAuthStates.length,
      pendingChatgptDeviceAuthStateCount: pendingChatgptDeviceStates.length,
      operability: codexHarnessOperability,
    },
  };
}

export const getStagingWorldFingerprint = query({
  args: {
    maintenanceToken: v.string(),
    ownerId: v.optional(v.string()),
    ownerEmail: v.optional(v.string()),
    ownerAuthSubject: v.optional(v.string()),
    projectName: v.optional(v.string()),
    communities: v.optional(v.array(expectedCommunityArg)),
  },
  handler: async (ctx, args) => {
    assertStagingMaintenanceAllowed({ maintenanceToken: args.maintenanceToken });
    return await buildFingerprint({
      ctx,
      ownerId: args.ownerId ?? null,
      ownerEmail: args.ownerEmail ?? null,
      ownerAuthSubject: args.ownerAuthSubject ?? null,
      projectName: args.projectName ?? null,
      communities: args.communities,
    });
  },
});

export const ensureStagingWorld = mutation({
  args: {
    maintenanceToken: v.string(),
    ownerId: v.optional(v.string()),
    ownerEmail: v.optional(v.string()),
    ownerAuthSubject: v.optional(v.string()),
    projectName: v.optional(v.string()),
    communities: v.optional(v.array(expectedCommunityArg)),
    dryRun: v.optional(v.boolean()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertStagingMaintenanceAllowed({ maintenanceToken: args.maintenanceToken });
    const nowMs = Math.floor(args.nowMs ?? Date.now());
    const dryRun = args.dryRun === true;
    const owner = await findOwnerUser({
      ctx,
      ownerId: args.ownerId ?? null,
      ownerEmail: args.ownerEmail ?? null,
      ownerAuthSubject: args.ownerAuthSubject ?? null,
    });
    const expectedCommunities = normalizeExpectedCommunities(args.communities);
    const projectName = normalizeText(args.projectName) || DEFAULT_PROJECT_NAME;
    const actions: StagingAction[] = [];
    for (const expected of expectedCommunities) {
      const result = await ensureExpectedCommunity({
        ctx,
        ownerId: owner._id,
        expected,
        dryRun,
        nowMs,
      });
      actions.push(result.action);
    }
    const project = await ensureExpectedProject({
      ctx,
      ownerId: owner._id,
      projectName,
      dryRun,
      nowMs,
    });
    actions.push(project.action);

    const fingerprint = await buildFingerprint({
      ctx,
      ownerId: args.ownerId ?? null,
      ownerEmail: args.ownerEmail ?? null,
      ownerAuthSubject: args.ownerAuthSubject ?? null,
      projectName,
      communities: expectedCommunities,
    });
    return {
      ok: true,
      dryRun,
      actions,
      fingerprint,
    };
  },
});

export const ensureStagingMountedMcpCanary = mutation({
  args: {
    maintenanceToken: v.string(),
    ownerId: v.optional(v.string()),
    ownerEmail: v.optional(v.string()),
    ownerAuthSubject: v.optional(v.string()),
    projectName: v.optional(v.string()),
    threadKey: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertStagingMaintenanceAllowed({ maintenanceToken: args.maintenanceToken });
    const nowMs = Math.floor(args.nowMs ?? Date.now());
    const owner = await findOwnerUser({
      ctx,
      ownerId: args.ownerId ?? null,
      ownerEmail: args.ownerEmail ?? null,
      ownerAuthSubject: args.ownerAuthSubject ?? null,
    });
    const ownerAuthSubject = normalizeText(owner.authSubject);
    if (!ownerAuthSubject) throw new Error("staging_owner_auth_subject_missing");

    const projectName = normalizeText(args.projectName) || DEFAULT_PROJECT_NAME;
    const project = await ensureExpectedProject({
      ctx,
      ownerId: owner._id,
      projectName,
      dryRun: false,
      nowMs,
    });
    if (!project.row?._id) throw new Error("staging_project_missing");
    const canaryCommunityExpected = defaultExpectedCommunities()[0];
    const community = await ensureExpectedCommunity({
      ctx,
      ownerId: owner._id,
      expected: canaryCommunityExpected,
      dryRun: false,
      nowMs,
    });
    if (!community.row?._id) throw new Error("staging_mcp_canary_community_missing");

    const endpointUrl = readStagingMcpCanaryEndpointUrl();
    if (!endpointUrl) throw new Error("staging_mcp_canary_endpoint_missing");

    const existingApps = await ctx.db
      .query("developerApps")
      .withIndex("by_owner_catalogAppId", (q: any) =>
        q
          .eq("ownerUserId", owner._id)
          .eq("catalogAppId", INTERNAL_STAGING_MCP_CANARY_CATALOG_APP_ID),
      )
      .collect();
    const existingApp = existingApps.sort(
      (a: any, b: any) => (a.createdAt ?? 0) - (b.createdAt ?? 0),
    )[0] ?? null;
    const slug = await resolveStagingUniqueDeveloperAppSlug({
      ctx,
      ownerUserId: owner._id,
      baseSlug: STAGING_MCP_CANARY_APP_SLUG,
      existingDeveloperAppId: existingApp?._id,
    });
    const developerAppId = existingApp
      ? existingApp._id
      : await ctx.db.insert("developerApps", {
          ownerUserId: owner._id,
          catalogAppId: INTERNAL_STAGING_MCP_CANARY_CATALOG_APP_ID,
          name: STAGING_MCP_CANARY_APP_NAME,
          slug,
          description:
            "Internal staging-only canary used to prove mounted MCP projection through Codex.",
          endpointUrl,
          authType: "none",
          status: "draft",
          createdAt: nowMs,
          updatedAt: nowMs,
        });
    const app = existingApp ?? (await ctx.db.get(developerAppId));
    if (!app) throw new Error("staging_mcp_canary_app_missing");

    const activeSnapshot = app.activeSnapshotId
      ? await ctx.db.get(app.activeSnapshotId)
      : null;
    const snapshotId = snapshotHasStagingCanaryTool(activeSnapshot, endpointUrl)
      ? app.activeSnapshotId
      : await ctx.db.insert("appToolSnapshots", {
          developerAppId,
          snapshotVersion: "staging_mcp_canary_v1",
          endpointUrl,
          validationStatus: "ok",
          toolsJson: canarySnapshotTools(),
          fetchedAt: nowMs,
          createdAt: nowMs,
        });

    await ctx.db.patch(developerAppId, {
      catalogAppId: INTERNAL_STAGING_MCP_CANARY_CATALOG_APP_ID,
      name: STAGING_MCP_CANARY_APP_NAME,
      slug,
      description:
        "Internal staging-only canary used to prove mounted MCP projection through Codex.",
      endpointUrl,
      authType: "none",
      status: "valid",
      activeSnapshotId: snapshotId,
      lastValidatedAt: nowMs,
      lastValidationError: undefined,
      updatedAt: nowMs,
    });

    const existingMount = await ctx.db
      .query("userPlatformAppMounts")
      .withIndex("by_user_app", (q: any) =>
        q.eq("userId", owner._id).eq("developerAppId", developerAppId),
      )
      .first();
    const mountPatch = {
      userId: owner._id,
      developerAppId,
      toolSnapshotId: snapshotId,
      enabled: true,
      enabledTools: [STAGING_MCP_CANARY_TOOL_NAME],
      updatedAt: nowMs,
    };
    const mountId = existingMount
      ? (await ctx.db.patch(existingMount._id, mountPatch), existingMount._id)
      : await ctx.db.insert("userPlatformAppMounts", {
          ...mountPatch,
          createdAt: nowMs,
        });

    const sourceKey = `personal:${String(mountId)}`;
    const existingSource = await ctx.db
      .query("userPlatformAppMountSources")
      .withIndex("by_user_sourceKey", (q: any) =>
        q.eq("userId", owner._id).eq("sourceKey", sourceKey),
      )
      .first();
    if (existingSource) {
      await ctx.db.patch(existingSource._id, {
        userPlatformAppMountId: mountId,
        sourceType: "personal",
        sourceKey,
        updatedAt: nowMs,
      });
    } else {
      await ctx.db.insert("userPlatformAppMountSources", {
        userId: owner._id,
        userPlatformAppMountId: mountId,
        sourceType: "personal",
        sourceKey,
        createdAt: nowMs,
        updatedAt: nowMs,
      });
    }

    const threadKey =
      normalizeText(args.threadKey) || DEFAULT_CODEX_MCP_CANARY_THREAD_KEY;
    const existingThread = await ctx.db
      .query("threads")
      .withIndex("by_owner_threadKey", (q: any) =>
        q.eq("ownerId", owner._id).eq("threadKey", threadKey),
      )
      .first();
    const currentContextVersion = Number.isFinite(Number(existingThread?.contextVersion ?? 0))
      ? Math.max(0, Math.floor(Number(existingThread?.contextVersion ?? 0)))
      : 0;
    const communityChanged =
      String(existingThread?.communityId ?? "") !== String(community.row._id);
    const threadPatch = {
      title: "Staging Codex mounted MCP canary",
      titleSource: "manual" as const,
      projectId: project.row._id,
      communityId: community.row._id,
      modelId: "gpt-5.5",
      contextVersion: communityChanged
        ? currentContextVersion + 1
        : currentContextVersion,
      updatedAt: nowMs,
    };
    const threadId = existingThread
      ? (await ctx.db.patch(existingThread._id, threadPatch), existingThread._id)
      : await ctx.db.insert("threads", {
          ownerId: owner._id,
          threadKey,
          ...threadPatch,
          lastSeq: 0,
          createdAt: nowMs,
        });

    return {
      ok: true,
      owner: {
        id: String(owner._id),
        normalizedEmail: owner.normalizedEmail ?? null,
        authSubjectPresent: Boolean(ownerAuthSubject),
      },
      ownerAuthSubject,
      project: {
        id: String(project.row._id),
        name: project.row.name ?? null,
      },
      community: {
        id: String(community.row._id),
        slug: community.row.slug ?? null,
        name: community.row.name ?? null,
      },
      app: {
        id: String(developerAppId),
        catalogAppId: INTERNAL_STAGING_MCP_CANARY_CATALOG_APP_ID,
        endpointUrl,
        duplicateCatalogAppCount: existingApps.length,
      },
      mount: {
        id: String(mountId),
        enabledToolNames: [STAGING_MCP_CANARY_TOOL_NAME],
        runtimeToolName: STAGING_MCP_CANARY_RUNTIME_TOOL_NAME,
      },
      thread: {
        id: String(threadId),
        threadKey,
      },
    };
  },
});

export const runCodexMountedMcpCanaryTurn = action({
  args: {
    maintenanceToken: v.string(),
    ownerId: v.optional(v.string()),
    ownerEmail: v.optional(v.string()),
    ownerAuthSubject: v.optional(v.string()),
    projectName: v.optional(v.string()),
    threadKey: v.optional(v.string()),
    runId: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    assertStagingMaintenanceAllowed({ maintenanceToken: args.maintenanceToken });
    const nowMs = Math.floor(args.nowMs ?? Date.now());
    const setup = (await ctx.runMutation(
      (api as any).stagingMaintenance.ensureStagingMountedMcpCanary,
      {
        maintenanceToken: args.maintenanceToken,
        ownerId: args.ownerId ?? undefined,
        ownerEmail: args.ownerEmail ?? undefined,
        ownerAuthSubject: args.ownerAuthSubject ?? undefined,
        projectName: args.projectName ?? undefined,
        threadKey: args.threadKey ?? undefined,
        nowMs,
      },
    )) as Record<string, any>;
    if (setup?.ok !== true) throw new Error("staging_mcp_canary_setup_failed");
    const ownerId = String(setup.owner?.id ?? "").trim();
    const ownerAuthSubject = normalizeText(setup.ownerAuthSubject);
    const threadKey = normalizeText(setup.thread?.threadKey);
    if (!ownerId || !ownerAuthSubject || !threadKey) {
      throw new Error("staging_mcp_canary_setup_incomplete");
    }

    const runId =
      normalizeText(args.runId) ||
      `agent_web:staging-mounted-mcp-canary:${crypto.randomUUID()}`;
    const prompt = [
      "Run the staging mounted MCP canary.",
      "Before answering, perform these three PolyNet dynamic tool calls in this exact order:",
      "1. get_active_community_context with {}.",
      '2. community_search with {"query":"codex primary dynamic bridge canary"}.',
      `3. ${STAGING_MCP_CANARY_RUNTIME_TOOL_NAME} with {"marker":"codex-mounted-mcp-canary"}.`,
      "Do not produce the final answer until all three tool results have been observed.",
      "Then answer with a single sentence that says whether the platform tools and mounted MCP canary returned ok evidence.",
    ].join(" ");
    const req = new Request("https://polynet-staging.vercel.app/runtime/runtime_turn", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        thread_id: threadKey,
        model_id: "gpt-5.5",
        surface: "web",
        requested_agentic_tools: true,
        requested_funding_source: "user_chatgpt",
        stream: false,
        codex_primary_canary: true,
        idempotency_key: runId,
        user_message_key: `user:${threadKey}:${runId}`,
        message: {
          text: prompt,
        },
        max_tokens: 900,
      }),
    });
    const requireAuthenticatedActor: RequireAuthenticatedActor = async () => ({
      ok: true,
      actor: {
        userId: ownerId,
        dbUserId: ownerId as any,
        authSubject: ownerAuthSubject,
        email: String(setup.owner?.normalizedEmail ?? "") || null,
        displayName: null,
        avatarUrl: null,
      },
    });
    const startedAt = Date.now();
    const response = await handleRuntimeTurnRequest({
      ctx,
      req,
      jsonResponse: stagingJsonResponse as JsonResponseFn,
      sseResponse: stagingSseResponse,
      requireAuthenticatedActor,
    });
    const responseText = await response.text();
    let responseJson: unknown = null;
    try {
      responseJson = responseText ? JSON.parse(responseText) : null;
    } catch {
      responseJson = null;
    }
    const responseRecord =
      responseJson && typeof responseJson === "object" && !Array.isArray(responseJson)
        ? (responseJson as Record<string, unknown>)
        : {};
    return {
      ok: response.status >= 200 && response.status < 300 && responseRecord.ok !== false,
      status: response.status,
      latencyMs: Date.now() - startedAt,
      runId,
      threadKey,
      threadId: setup.thread?.id ?? null,
      project: setup.project ?? null,
      owner: setup.owner ?? null,
      app: {
        id: setup.app?.id ?? null,
        catalogAppId: setup.app?.catalogAppId ?? null,
        duplicateCatalogAppCount: setup.app?.duplicateCatalogAppCount ?? null,
      },
      mount: setup.mount ?? null,
      response: {
        ok: responseRecord.ok ?? null,
        engineId: responseRecord.engine_id ?? null,
        runtimeHarnessId: responseRecord.runtime_harness_id ?? null,
        contentChars:
          typeof responseRecord.content === "string"
            ? responseRecord.content.length
            : null,
        code: responseRecord.code ?? responseRecord.error ?? null,
        message: responseRecord.message ?? null,
      },
    };
  },
});

export const runCodexPrimaryStreamingCanaryTurn = action({
  args: {
    maintenanceToken: v.string(),
    ownerId: v.optional(v.string()),
    ownerEmail: v.optional(v.string()),
    ownerAuthSubject: v.optional(v.string()),
    projectName: v.optional(v.string()),
    threadKey: v.optional(v.string()),
    runId: v.optional(v.string()),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    assertStagingMaintenanceAllowed({ maintenanceToken: args.maintenanceToken });
    const nowMs = Math.floor(args.nowMs ?? Date.now());
    const setup = (await ctx.runMutation(
      (api as any).stagingMaintenance.ensureStagingMountedMcpCanary,
      {
        maintenanceToken: args.maintenanceToken,
        ownerId: args.ownerId ?? undefined,
        ownerEmail: args.ownerEmail ?? undefined,
        ownerAuthSubject: args.ownerAuthSubject ?? undefined,
        projectName: args.projectName ?? undefined,
        threadKey:
          normalizeText(args.threadKey) ||
          DEFAULT_CODEX_STREAMING_CANARY_THREAD_KEY,
        nowMs,
      },
    )) as Record<string, any>;
    if (setup?.ok !== true) throw new Error("staging_streaming_canary_setup_failed");
    const ownerId = String(setup.owner?.id ?? "").trim();
    const ownerAuthSubject = normalizeText(setup.ownerAuthSubject);
    const threadKey = normalizeText(setup.thread?.threadKey);
    if (!ownerId || !ownerAuthSubject || !threadKey) {
      throw new Error("staging_streaming_canary_setup_incomplete");
    }

    const runId =
      normalizeText(args.runId) ||
      `agent_web:staging-codex-streaming-canary:${crypto.randomUUID()}`;
    const prompt = [
      "Run the staging Codex primary streaming canary.",
      "Use the PolyNet read-only dynamic tools requested by the Codex primary canary before answering.",
      "Then answer with one short sentence containing POLYNET_CODEX_STREAMING_OK.",
    ].join(" ");
    const req = new Request("https://polynet-staging.vercel.app/runtime/runtime_turn", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        thread_id: threadKey,
        model_id: "gpt-5.5",
        surface: "web",
        requested_agentic_tools: true,
        requested_funding_source: "user_chatgpt",
        stream: true,
        codex_primary_canary: true,
        idempotency_key: runId,
        user_message_key: `user:${threadKey}:${runId}`,
        message: {
          text: prompt,
        },
        max_tokens: 900,
      }),
    });
    const requireAuthenticatedActor: RequireAuthenticatedActor = async () => ({
      ok: true,
      actor: {
        userId: ownerId,
        dbUserId: ownerId as any,
        authSubject: ownerAuthSubject,
        email: String(setup.owner?.normalizedEmail ?? "") || null,
        displayName: null,
        avatarUrl: null,
      },
    });
    const startedAt = Date.now();
    const response = await handleRuntimeTurnRequest({
      ctx,
      req,
      jsonResponse: stagingJsonResponse as JsonResponseFn,
      sseResponse: stagingSseResponse,
      requireAuthenticatedActor,
    });
    const responseText = await response.text();
    const sseSummary = summarizeStagingRuntimeSseResponse(responseText);
    const deltaEventCount = Number(sseSummary.deltaEventCount ?? 0);
    const doneEventCount = Number(sseSummary.doneEventCount ?? 0);
    const errorEventCount = Number(sseSummary.errorEventCount ?? 0);
    return {
      ok:
        response.status >= 200 &&
        response.status < 300 &&
        deltaEventCount > 0 &&
        doneEventCount > 0 &&
        errorEventCount === 0,
      status: response.status,
      latencyMs: Date.now() - startedAt,
      runId,
      threadKey,
      threadId: setup.thread?.id ?? null,
      project: setup.project ?? null,
      owner: setup.owner ?? null,
      response: {
        sse: sseSummary,
        responseTextChars: responseText.length,
      },
    };
  },
});

export const cleanupCodexHarnessOperability = action({
  args: {
    maintenanceToken: v.string(),
    nowMs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    assertStagingMaintenanceAllowed({ maintenanceToken: args.maintenanceToken });
    const nowMs = Number.isFinite(args.nowMs)
      ? Math.floor(args.nowMs as number)
      : Date.now();
    const limit = normalizeLimit(args.limit, 25, 100);
    const bridgeSessions = (await ctx.runMutation(
      (internal as any).codexHarnessDynamicToolBridge
        .cleanupExpiredCodexHarnessBridgeSessionsInternal,
      {
        nowMs,
        limit,
      },
    )) as Record<string, unknown>;
    const bindingLocks = (await ctx.runMutation(
      (internal as any).codexHarnessThreadBindings
        .cleanupExpiredCodexHarnessThreadBindingLocksInternal,
      {
        nowMs,
        limit,
      },
    )) as Record<string, unknown>;
    return {
      ok: true,
      nowMs,
      limit,
      bridgeSessions,
      bindingLocks,
    };
  },
});

export const runCodexHarnessLockContentionCanary = action({
  args: {
    maintenanceToken: v.string(),
    nowMs: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    assertStagingMaintenanceAllowed({ maintenanceToken: args.maintenanceToken });
    const nowMs = Number.isFinite(args.nowMs)
      ? Math.floor(args.nowMs as number)
      : Date.now();
    const suffix =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${nowMs}-${Math.random().toString(16).slice(2)}`;
    const bindingKey = `staging:codex-lock-canary:${suffix}`;
    const userId = "staging-codex-lock-canary-user";
    const threadId = `staging-codex-lock-canary-thread:${suffix}`;
    const projectId = "staging-codex-lock-canary-project";
    const runIdA = `staging-codex-lock-canary-run-a:${suffix}`;
    const runIdB = `staging-codex-lock-canary-run-b:${suffix}`;
    const releaseA = async (): Promise<Record<string, unknown>> =>
      (await ctx.runMutation(
        (internal as any).codexHarnessThreadBindings
          .releaseCodexHarnessThreadBindingLockInternal,
        {
          bindingKey,
          runId: runIdA,
          nowMs: Date.now(),
        },
      )) as Record<string, unknown>;
    const releaseB = async (): Promise<Record<string, unknown>> =>
      (await ctx.runMutation(
        (internal as any).codexHarnessThreadBindings
          .releaseCodexHarnessThreadBindingLockInternal,
        {
          bindingKey,
          runId: runIdB,
          nowMs: Date.now(),
        },
      )) as Record<string, unknown>;

    try {
      const acquireA = (await ctx.runMutation(
        (internal as any).codexHarnessThreadBindings
          .acquireCodexHarnessThreadBindingLockInternal,
        {
          bindingKey,
          userId,
          threadId,
          projectId,
          runId: runIdA,
          nowMs,
          ttlMs: 5 * 60 * 1000,
        },
      )) as Record<string, unknown>;
      const acquireBWhileLocked = (await ctx.runMutation(
        (internal as any).codexHarnessThreadBindings
          .acquireCodexHarnessThreadBindingLockInternal,
        {
          bindingKey,
          userId,
          threadId,
          projectId,
          runId: runIdB,
          nowMs: nowMs + 1,
          ttlMs: 5 * 60 * 1000,
        },
      )) as Record<string, unknown>;
      const reenterA = (await ctx.runMutation(
        (internal as any).codexHarnessThreadBindings
          .acquireCodexHarnessThreadBindingLockInternal,
        {
          bindingKey,
          userId,
          threadId,
          projectId,
          runId: runIdA,
          nowMs: nowMs + 2,
          ttlMs: 5 * 60 * 1000,
        },
      )) as Record<string, unknown>;
      const releaseBWhileOwnedByA = await releaseB();
      const releaseAResult = await releaseA();
      const acquireBAfterRelease = (await ctx.runMutation(
        (internal as any).codexHarnessThreadBindings
          .acquireCodexHarnessThreadBindingLockInternal,
        {
          bindingKey,
          userId,
          threadId,
          projectId,
          runId: runIdB,
          nowMs: nowMs + 3,
          ttlMs: 5 * 60 * 1000,
        },
      )) as Record<string, unknown>;
      const releaseBAfterAcquire = await releaseB();
      return {
        ok:
          Boolean((acquireA as any)?.acquired) &&
          (acquireBWhileLocked as any)?.acquired === false &&
          (acquireBWhileLocked as any)?.reason === "binding_locked" &&
          (acquireBWhileLocked as any)?.blockingRunId === runIdA &&
          Boolean((reenterA as any)?.acquired) &&
          (reenterA as any)?.reason === "lock_reentered" &&
          (releaseBWhileOwnedByA as any)?.released === false &&
          (releaseBWhileOwnedByA as any)?.reason === "lock_owned_by_another_run" &&
          Boolean((releaseAResult as any)?.released) &&
          Boolean((acquireBAfterRelease as any)?.acquired) &&
          Boolean((releaseBAfterAcquire as any)?.released),
        bindingKeyPresent: Boolean(bindingKey),
        acquireA,
        acquireBWhileLocked,
        reenterA,
        releaseBWhileOwnedByA,
        releaseA: releaseAResult,
        acquireBAfterRelease,
        releaseBAfterAcquire,
      };
    } finally {
      await releaseA();
      await releaseB();
    }
  },
});

export const getCodexThreadBindingCanaryEvidence = query({
  args: {
    maintenanceToken: v.string(),
    ownerId: v.optional(v.string()),
    ownerEmail: v.optional(v.string()),
    ownerAuthSubject: v.optional(v.string()),
    projectName: v.optional(v.string()),
    threadId: v.optional(v.string()),
    runId: v.optional(v.string()),
    sinceMs: v.optional(v.number()),
    limit: v.optional(v.number()),
    compact: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    assertStagingMaintenanceAllowed({ maintenanceToken: args.maintenanceToken });
    const owner = await findOwnerUser({
      ctx,
      ownerId: args.ownerId ?? null,
      ownerEmail: args.ownerEmail ?? null,
      ownerAuthSubject: args.ownerAuthSubject ?? null,
    });
    const projectName = normalizeText(args.projectName) || DEFAULT_PROJECT_NAME;
    const requestedThreadId = normalizeOptionalId(args.threadId);
    const requestedRunId = normalizeOptionalId(args.runId);
    const compact = args.compact === true;
    const sinceMs = Number.isFinite(args.sinceMs)
      ? Math.floor(args.sinceMs as number)
      : 0;
    const safeLimit = normalizeLimit(args.limit, 20, 50);
    const projects = await ctx.db
      .query("cloudProjects")
      .withIndex("by_owner", (q: any) => q.eq("ownerId", owner._id))
      .collect();
    const project = projects
      .filter((row: any) => normalizeText(row.name) === projectName)
      .sort((a: any, b: any) => (a.createdAt ?? 0) - (b.createdAt ?? 0))[0] ?? null;

    const runs = (await ctx.db
      .query("runtimeRuns")
      .withIndex("by_owner_startedAt", (q: any) => q.eq("ownerId", owner._id))
      .order("desc")
      .take(Math.max(safeLimit * 4, 40)))
      .filter((run: any) => {
        if (requestedRunId && String(run.runId) !== requestedRunId) return false;
        if (requestedThreadId && String(run.threadId) !== requestedThreadId) return false;
        if (project && run.projectId && String(run.projectId) !== String(project._id)) return false;
        if (sinceMs > 0 && Number(run.startedAt ?? 0) < sinceMs) return false;
        return true;
      })
      .slice(0, safeLimit);

    const runEvidence = [];
    for (const run of runs) {
      const events = (await ctx.db
        .query("runtimeRunEvents")
        .withIndex("by_owner_run_seq", (q: any) =>
          q.eq("ownerId", owner._id).eq("runId", run.runId),
        )
        .collect())
        .sort((a: any, b: any) => (a.seq ?? 0) - (b.seq ?? 0));
      const filteredEvents = events
        .filter((event: any) => {
          const eventType = String(event.eventType ?? "");
          if (!CODEX_THREAD_BINDING_EVIDENCE_EVENT_TYPES.has(eventType)) return false;
          return !compact || CODEX_THREAD_BINDING_COMPACT_EVIDENCE_EVENT_TYPES.has(eventType);
        })
        .map((event: any) => ({
          seq: event.seq,
          eventType: event.eventType,
          payload: summarizeCodexThreadBindingEvidencePayload({
            eventType: String(event.eventType ?? ""),
            payload: event.payload,
          }),
          createdAt: event.createdAt,
        }));
      const binding =
        project && run.threadId
          ? await ctx.db
              .query("codexHarnessThreadBindings")
              .withIndex("by_user_thread_project", (q: any) =>
                q
                  .eq("userId", String(owner._id))
                  .eq("threadId", String(run.threadId))
                  .eq("projectId", String(project._id)),
              )
              .first()
          : null;
      runEvidence.push({
        runId: run.runId,
        status: run.status,
        reason: run.reason ?? null,
        errorCode: run.errorCode ?? null,
        threadId: String(run.threadId),
        projectId: run.projectId ? String(run.projectId) : null,
        communityId: run.communityId ? String(run.communityId) : null,
        visibility: run.visibility ?? null,
        harnessProfile: run.harnessProfile ?? null,
        runtimeHarnessTelemetrySummary: run.runtimeHarnessTelemetrySummary ?? null,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt ?? null,
        events: filteredEvents,
        binding: binding
          ? {
              bindingKeyPresent: Boolean(binding.bindingKey),
              codexThreadId: binding.codexThreadId,
              codexHomePath: binding.codexHomePath,
              codexMcpProjectionVersion: binding.codexMcpProjectionVersion,
              codexMcpProjectionFingerprint: binding.codexMcpProjectionFingerprint,
              codexDynamicToolSurfaceVersion:
                binding.codexDynamicToolSurfaceVersion ?? null,
              codexDynamicToolSurfaceFingerprint:
                binding.codexDynamicToolSurfaceFingerprint ?? null,
              status: binding.status,
              lastRunId: binding.lastRunId ?? null,
              lastProviderSandboxId: binding.lastProviderSandboxId ?? null,
              lastProjectVolumeId: binding.lastProjectVolumeId ?? null,
              previousCodexThreadId: binding.previousCodexThreadId ?? null,
              previousCodexMcpProjectionFingerprint:
                binding.previousCodexMcpProjectionFingerprint ?? null,
              previousCodexDynamicToolSurfaceFingerprint:
                binding.previousCodexDynamicToolSurfaceFingerprint ?? null,
              rotatedAt: binding.rotatedAt ?? null,
              rotatedReason: binding.rotatedReason ?? null,
              createdAt: binding.createdAt,
              updatedAt: binding.updatedAt,
            }
          : null,
      });
    }

    return {
      ok: true,
      owner: {
        id: String(owner._id),
        normalizedEmail: owner.normalizedEmail ?? null,
      },
      project: project
        ? {
            id: String(project._id),
            name: project.name ?? null,
          }
        : null,
      filters: {
        threadId: requestedThreadId,
        runId: requestedRunId,
        sinceMs,
        limit: safeLimit,
        compact,
      },
      runs: runEvidence,
    };
  },
});

import { internal } from "./_generated/api";
import { buildRuntimeRunPersistenceHelpers } from "./httpRuntimeTurnState";
import { persistRuntimeAssistantMessage } from "./runtimeTurnPersistence";
import { disposeRuntimeWorkspaceSession } from "./runtimeWorkspaceSessionDisposal";
import type { RuntimeWorkspaceSession } from "./workspaceRuntimeSession";
import { POLYNET_CODEX_WORKER_ENGINE_ID } from "./polynetCodexWorkerBridge";
import {
  verifyPolynetCodexWorkerRunToken,
} from "./polynetCodexWorkerRunToken";
import {
  settleReservedCreditsBestEffort,
  settleReservedCreditsStrict,
} from "./workspaceCreditSettlement";
import {
  DAYTONA_WORKSPACE_COMPUTE_USD_PER_SECOND,
  estimateDaytonaWorkspaceComputeVendorCostUsd,
  PAID_TOOL_PRICING_VERSION,
  PAID_TOOL_TARGET_GROSS_MARGIN_BPS,
  priceDaytonaWorkspaceComputeCredits,
} from "../shared/workspaceCredits";
import { normalizeWorkspacePreviewPort } from "../shared/workspacePreviewPort";

type JsonRecord = Record<string, unknown>;

export const POLYNET_CODEX_WORKER_INGEST_PATH = "/runtime/polynet_codex_worker_ingest";

export type PolynetCodexWorkerIngestContext = {
  owner_id: string;
  auth_subject: string | null;
  thread_id: string;
  run_id: string;
  assistant_message_key: string;
  model_id: string;
  lane: "public" | "platform" | "chatgpt";
  inference_source: "free" | "platform" | "user_key" | "chatgpt";
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function readPositiveNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function addWorkspacePreviewReadyPort(target: Set<number>, payload: JsonRecord): void {
  try {
    const port = normalizeWorkspacePreviewPort(payload.port);
    if (port !== null) target.add(port);
  } catch {
    // Ignore malformed worker evidence; the target finalizer remains best effort.
  }
}

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // Convex exposes environment variables through process.env in actions.
  }
  return "";
}

export function buildPolynetCodexWorkerIngestTarget(): {
  url: string;
  token: string;
} | null {
  const siteUrl = readEnv("CONVEX_SITE_URL").replace(/\/+$/, "");
  const token = readEnv("POLYNET_CODEX_WORKER_AUTH_TOKEN");
  if (!siteUrl || !token) return null;
  return {
    url: `${siteUrl}${POLYNET_CODEX_WORKER_INGEST_PATH}`,
    token,
  };
}

export function parsePolynetCodexWorkerIngestContext(
  value: unknown,
): PolynetCodexWorkerIngestContext | null {
  const record = asRecord(value);
  if (!record) return null;
  const ownerId = String(record.owner_id ?? "").trim();
  const authSubject = String(record.auth_subject ?? "").trim() || null;
  const threadId = String(record.thread_id ?? "").trim();
  const runId = String(record.run_id ?? "").trim();
  const assistantMessageKey = String(record.assistant_message_key ?? "").trim();
  const modelId = String(record.model_id ?? "").trim();
  const lane = String(record.lane ?? "").trim();
  const inferenceSource = String(record.inference_source ?? "").trim();
  if (!ownerId || !threadId || !runId || !assistantMessageKey || !modelId) return null;
  if (!["public", "platform", "chatgpt"].includes(lane)) return null;
  if (!["free", "platform", "user_key", "chatgpt"].includes(inferenceSource)) return null;
  return {
    owner_id: ownerId,
    auth_subject: authSubject,
    thread_id: threadId,
    run_id: runId,
    assistant_message_key: assistantMessageKey,
    model_id: modelId,
    lane: lane as PolynetCodexWorkerIngestContext["lane"],
    inference_source: inferenceSource as PolynetCodexWorkerIngestContext["inference_source"],
  };
}

// Durable backstop for Codex runtime turns: the runtime posts its final payload
// here directly, so a Convex action dying mid-stream can no longer lose a
// completed turn. Every write below is idempotent against the live SSE path
// (events dedupe on eventKey, the assistant message dedupes on messageKey).
export async function handlePolynetCodexWorkerIngest(
  ctx: any,
  req: Request,
): Promise<Response> {
  const json = (status: number, payload: JsonRecord): Response =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });

  const expectedToken = readEnv("POLYNET_CODEX_WORKER_AUTH_TOKEN");
  const rawAuth = String(req.headers.get("authorization") ?? "").trim();
  const bearer = rawAuth.toLowerCase().startsWith("bearer ") ? rawAuth.slice(7).trim() : "";
  if (!expectedToken || bearer !== expectedToken) {
    return json(401, { ok: false, code: "unauthorized" });
  }

  let body: JsonRecord;
  try {
    body = asRecord(await req.json()) ?? {};
  } catch {
    return json(400, { ok: false, code: "invalid_json" });
  }

  const context = parsePolynetCodexWorkerIngestContext(body.context);
  if (!context) {
    return json(400, { ok: false, code: "invalid_ingest_context" });
  }
  const runTokenVerification = await verifyPolynetCodexWorkerRunToken({
    token: String(body.run_token ?? ""),
    expectedAudience: "ingest",
    context,
  });
  if (!runTokenVerification.ok) {
    return json(runTokenVerification.status, {
      ok: false,
      code: runTokenVerification.code,
      message: runTokenVerification.message,
    });
  }
  const status = String(body.status ?? "").trim();
  if (!["ok", "error", "cancelled"].includes(status)) {
    return json(400, { ok: false, code: "invalid_status" });
  }
  const assistantText = typeof body.assistant_text === "string" ? body.assistant_text : "";
  const errorRecord = asRecord(body.error);
  const events = Array.isArray(body.events) ? body.events : [];

  // The signed run token proves Convex minted this short-lived ingest request;
  // the live run row still remains the authority for owner/thread/engine.
  let runRow: { threadId?: unknown; engineId?: unknown } | null = null;
  try {
    runRow = (await ctx.runQuery(
      (internal as any).threads.getRuntimeRunByOwnerRunIdInternal as any,
      {
        ownerId: context.owner_id,
        runId: context.run_id,
      },
    )) as { threadId?: unknown; engineId?: unknown } | null;
  } catch {
    runRow = null;
  }
  if (
    !runRow ||
    String(runRow.threadId ?? "") !== context.thread_id ||
    String(runRow.engineId ?? "") !== POLYNET_CODEX_WORKER_ENGINE_ID
  ) {
    return json(404, { ok: false, code: "invalid_run" });
  }

  const { appendRunEvent, finishRunBestEffort } = buildRuntimeRunPersistenceHelpers({
    ctx,
    userId: context.owner_id,
    threadId: context.thread_id,
    runId: context.run_id,
  });

  const activePreviewPorts = new Set<number>();
  let eventsAppended = 0;
  for (const rawEvent of events.slice(0, 500)) {
    const event = asRecord(rawEvent);
    if (!event) continue;
    const eventType = String(event.event_type ?? "").trim();
    if (!eventType) continue;
    const seqRaw = Number(event.seq);
    const seq = Number.isFinite(seqRaw) ? Math.max(0, Math.floor(seqRaw)) : 0;
    const payload = asRecord(event.payload) ?? {};
    if (eventType === "workspace_preview_ready") {
      addWorkspacePreviewReadyPort(activePreviewPorts, payload);
    }
    try {
      await appendRunEvent({
        eventType,
        eventKey: `${context.run_id}:polynet_codex_worker:${seq}:${eventType}`,
        payload: {
          ...payload,
          run_id: context.run_id,
          engine_id: POLYNET_CODEX_WORKER_ENGINE_ID,
          worker_event_seq: seq,
          worker_event_type: eventType,
          ingest_source: "polynet_codex_worker_ingest",
        },
      });
      eventsAppended += 1;
    } catch {
      // Best effort per event; the final message persist below is the priority.
    }
  }

  let assistantPersisted = false;
  if (assistantText.trim() || status === "error" || status === "cancelled") {
    try {
      await persistRuntimeAssistantMessage({
        ctx,
        ownerId: context.owner_id,
        threadId: context.thread_id,
        messageKey: context.assistant_message_key,
        requestedModelId: context.model_id,
        engineId: POLYNET_CODEX_WORKER_ENGINE_ID,
        inferenceSource: context.inference_source,
        lane: context.lane,
        runId: context.run_id,
        content: assistantText,
        ...(status === "error" || status === "cancelled"
          ? {
              partialRun: {
                status: status === "cancelled" ? ("cancelled" as const) : ("error" as const),
                reason:
                  status === "cancelled"
                    ? "user_cancelled"
                    : String(errorRecord?.code ?? "polynet_codex_worker_turn_failed"),
                errorCode:
                  status === "cancelled"
                    ? "user_cancelled"
                    : String(errorRecord?.code ?? "polynet_codex_worker_turn_failed"),
                errorMessage:
                  status === "cancelled"
                    ? "Run cancelled by user."
                    : String(errorRecord?.message ?? "").trim() ||
                      "PolyNet Codex worker turn failed.",
              },
            }
          : {}),
      });
      assistantPersisted = true;
    } catch {
      // Idempotent persist may race the live path; the run finish below still lands.
    }
  }

  await finishRunBestEffort({
    status: status === "ok" ? "ok" : status === "cancelled" ? "cancelled" : "error",
    ...(status === "cancelled"
      ? {
          reason: "user_cancelled",
          errorCode: "user_cancelled",
          errorMessage: "Run cancelled by user.",
        }
      : status === "error"
        ? {
            reason: String(errorRecord?.code ?? "polynet_codex_worker_turn_failed"),
            errorCode: String(errorRecord?.code ?? "polynet_codex_worker_turn_failed"),
            errorMessage:
              String(errorRecord?.message ?? "").trim() ||
              "PolyNet Codex worker turn failed.",
          }
        : {}),
  });

  let codexRuntimeCreditsSettled = false;
  let codexRuntimeCreditsOutcome: string | null = null;
  const contextRecord = asRecord(body.context);
  const codexRuntimeBilling =
    asRecord(contextRecord?.workspace_compute_billing) ??
    asRecord(contextRecord?.codex_runtime_billing);
  const daytonaRuntimeTarget = asRecord(contextRecord?.daytona_runtime_target);
  const codexRuntimeCreditKey = String(codexRuntimeBilling?.credit_key ?? "").trim();
  if (codexRuntimeCreditKey) {
    const timing = asRecord(body.timing);
    const durationSeconds = Math.max(
      0,
      (readPositiveNumber(timing?.total_ms) ?? 0) / 1000,
    );
    const terminalReason =
      status === "ok"
        ? "completed"
        : status === "cancelled"
          ? "cancelled"
          : String(errorRecord?.code ?? "polynet_codex_worker_turn_failed");
    if (durationSeconds > 0) {
      const rawVendorCostUsd = estimateDaytonaWorkspaceComputeVendorCostUsd({
        durationSeconds,
      });
      const creditsSettled = priceDaytonaWorkspaceComputeCredits({ durationSeconds });
      try {
        await settleReservedCreditsStrict({
          ctx,
          creditKey: codexRuntimeCreditKey,
          status: "succeeded",
          creditsSettled,
          rawVendorCostUsd,
          metadata: {
            pricing_version: PAID_TOOL_PRICING_VERSION,
            billing_product: "workspace_compute",
            harness: "codex",
            target_gross_margin_bps: PAID_TOOL_TARGET_GROSS_MARGIN_BPS,
            provider: "daytona",
            pricing_model: "daytona_runtime_seconds_estimate",
            provider_billing_reconciliation: "pending",
            provider_billing_evidence: "estimated_from_runtime_duration",
            daytona_workspace_compute_usd_per_second:
              DAYTONA_WORKSPACE_COMPUTE_USD_PER_SECOND,
            duration_seconds: durationSeconds,
            duration_source: "worker_ingest_timing_total_ms",
            target_id: daytonaRuntimeTarget?.target_id ?? null,
            sandbox_id: daytonaRuntimeTarget?.sandbox_id ?? null,
            worker_machine_id: daytonaRuntimeTarget?.sandbox_id ?? null,
            reserved_credits: readPositiveNumber(codexRuntimeBilling?.reserved_credits),
            terminal_reason: terminalReason,
          },
        });
        codexRuntimeCreditsSettled = true;
        codexRuntimeCreditsOutcome = "succeeded";
      } catch {
        codexRuntimeCreditsOutcome = "settlement_failed";
      }
    } else {
      await settleReservedCreditsBestEffort({
        ctx,
        creditKey: codexRuntimeCreditKey,
        status: "refunded",
        failureReason: terminalReason || "workspace_compute_not_started",
        metadata: {
          pricing_version: PAID_TOOL_PRICING_VERSION,
          billing_product: "workspace_compute",
          harness: "codex",
          provider: "daytona",
          pricing_model: "daytona_runtime_seconds_estimate",
          worker_started: false,
          terminal_reason: terminalReason,
        },
      });
      codexRuntimeCreditsOutcome = "refunded_not_started";
    }
  }

  let capacityLeaseReleased = false;
  let capacityLeaseReleaseReason: string | null = null;
  try {
    const reason =
      status === "ok"
        ? "completed"
        : status === "cancelled"
          ? "cancelled"
          : String(errorRecord?.code ?? "polynet_codex_worker_turn_failed");
    const release = (await ctx.runMutation(
      (internal as any).polynetCodexWorkerAdmission
        .releasePolynetCodexWorkerLease as any,
      {
        ownerId: context.owner_id,
        runId: context.run_id,
        reason,
      },
    )) as { released?: unknown; reason?: unknown };
    capacityLeaseReleased = release.released === true;
    capacityLeaseReleaseReason = String(release.reason ?? reason);
  } catch {
    capacityLeaseReleaseReason = "release_failed";
  }

  // Dispose the workspace lease if the live path never did. Disposal is
  // terminal-aware, so app-preview terminals keep accounting alive instead of
  // getting prematurely settled by this durable backstop.
  let leaseSettled = false;
  let leaseDisposalOutcome: string | null = null;
  const lease = asRecord(body.context && (body.context as JsonRecord).lease);
  const leaseReservationKey = String(lease?.credit_reservation_key ?? "").trim();
  const leaseStartedAt = Number(lease?.started_at);
  if (leaseReservationKey && Number.isFinite(leaseStartedAt)) {
    try {
      const disposal = await disposeRuntimeWorkspaceSession({
        ctx,
        userId: context.owner_id,
        runId: context.run_id,
        session: {
          kind: "project_workspace",
          providerId: "blaxel",
          projectId: String(lease?.project_id ?? ""),
          projectVolumeId: null,
          providerSandboxId: String(lease?.provider_sandbox_id ?? ""),
          workspaceRoot: "/workspace",
          startedAt: leaseStartedAt,
          creditReservationKey: leaseReservationKey,
          sandboxCpu: Number(lease?.sandbox_cpu) || 1,
          sandboxMemoryGiB: Number(lease?.sandbox_memory_gib) || 2,
          sandboxDiskGiB: Number(lease?.sandbox_disk_gib) || 8,
          lifecycleMode: "provider_standby",
        } satisfies RuntimeWorkspaceSession,
        finalState: "released",
        appendRunEvent,
        source: "polynet_codex_worker_ingest",
      });
      leaseDisposalOutcome = disposal.outcome;
      leaseSettled = disposal.outcome === "settled";
    } catch {
      // Best effort: the reservation expiry remains the final backstop.
      leaseDisposalOutcome = "disposal_failed";
    }
  }

  const daytonaActivePreviewPorts = Array.from(activePreviewPorts);
  let daytonaLifecycleFinalized = false;
  let daytonaLifecycleFinalizeReason: string | null = null;
  try {
    const finalized = (await ctx.runAction(
      (internal as any).daytonaCodexRuntimeTargetActions
        .finalizeDaytonaCodexRuntimeTargetFromWorkerIngestInternal as any,
      {
        ownerId: context.owner_id,
        runId: context.run_id,
        status: status as "ok" | "error" | "cancelled",
        activePreviewPorts: daytonaActivePreviewPorts,
      },
    )) as { finalized?: unknown; reason?: unknown };
    daytonaLifecycleFinalized = finalized.finalized === true;
    daytonaLifecycleFinalizeReason = String(finalized.reason ?? "");
  } catch {
    // Best effort: Daytona auto-stop/delete and the sweeper remain backstops.
    daytonaLifecycleFinalizeReason = "finalize_failed";
  }

  return json(200, {
    ok: true,
    run_id: context.run_id,
    events_appended: eventsAppended,
    assistant_persisted: assistantPersisted,
    codex_runtime_credits_settled: codexRuntimeCreditsSettled,
    codex_runtime_credits_outcome: codexRuntimeCreditsOutcome,
    capacity_lease_released: capacityLeaseReleased,
    capacity_lease_release_reason: capacityLeaseReleaseReason,
    lease_settled: leaseSettled,
    lease_disposal_outcome: leaseDisposalOutcome,
    daytona_lifecycle_finalized: daytonaLifecycleFinalized,
    daytona_lifecycle_finalize_reason: daytonaLifecycleFinalizeReason,
    daytona_active_preview_ports: daytonaActivePreviewPorts,
  });
}

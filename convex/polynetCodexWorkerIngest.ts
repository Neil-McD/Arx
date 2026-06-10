import { buildRuntimeRunPersistenceHelpers } from "./httpRuntimeTurnState";
import { persistRuntimeAssistantMessage } from "./runtimeTurnPersistence";
import { POLYNET_CODEX_WORKER_ENGINE_ID } from "./polynetCodexWorkerBridge";

type JsonRecord = Record<string, unknown>;

export const POLYNET_CODEX_WORKER_INGEST_PATH = "/runtime/polynet_codex_worker_ingest";

export type PolynetCodexWorkerIngestContext = {
  owner_id: string;
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
    thread_id: threadId,
    run_id: runId,
    assistant_message_key: assistantMessageKey,
    model_id: modelId,
    lane: lane as PolynetCodexWorkerIngestContext["lane"],
    inference_source: inferenceSource as PolynetCodexWorkerIngestContext["inference_source"],
  };
}

// Durable backstop for worker turns: the Fly worker posts its final payload
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
  const status = String(body.status ?? "").trim();
  if (!["ok", "error"].includes(status)) {
    return json(400, { ok: false, code: "invalid_status" });
  }
  const assistantText = typeof body.assistant_text === "string" ? body.assistant_text : "";
  const errorRecord = asRecord(body.error);
  const events = Array.isArray(body.events) ? body.events : [];

  const { appendRunEvent, finishRunBestEffort } = buildRuntimeRunPersistenceHelpers({
    ctx,
    userId: context.owner_id,
    threadId: context.thread_id,
    runId: context.run_id,
  });

  let eventsAppended = 0;
  for (const rawEvent of events.slice(0, 500)) {
    const event = asRecord(rawEvent);
    if (!event) continue;
    const eventType = String(event.event_type ?? "").trim();
    if (!eventType) continue;
    const seqRaw = Number(event.seq);
    const seq = Number.isFinite(seqRaw) ? Math.max(0, Math.floor(seqRaw)) : 0;
    const payload = asRecord(event.payload) ?? {};
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
  if (assistantText.trim() || status === "error") {
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
        ...(status === "error"
          ? {
              partialRun: {
                status: "error" as const,
                reason: String(errorRecord?.code ?? "polynet_codex_worker_turn_failed"),
                errorCode: String(errorRecord?.code ?? "polynet_codex_worker_turn_failed"),
                errorMessage:
                  String(errorRecord?.message ?? "").trim() ||
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
    status: status === "ok" ? "ok" : "error",
    ...(status === "error"
      ? {
          reason: String(errorRecord?.code ?? "polynet_codex_worker_turn_failed"),
          errorCode: String(errorRecord?.code ?? "polynet_codex_worker_turn_failed"),
          errorMessage:
            String(errorRecord?.message ?? "").trim() ||
            "PolyNet Codex worker turn failed.",
        }
      : {}),
  });

  return json(200, {
    ok: true,
    run_id: context.run_id,
    events_appended: eventsAppended,
    assistant_persisted: assistantPersisted,
  });
}

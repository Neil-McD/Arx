import { api } from "./_generated/api";
import type { PublicHttpAction } from "convex/server";
import type {
  JsonResponseFn,
  RequireAuthenticatedActor,
  SseResponseFn,
} from "./runtimeTurnHandlers";

type HttpRouteMethod = "GET" | "POST" | "DELETE" | "OPTIONS" | "PUT" | "PATCH";

type HttpRouterLike = {
  route: (config: {
    path: string;
    method: HttpRouteMethod;
    handler: PublicHttpAction;
  }) => void;
};

type HttpActionLike = (handler: (ctx: unknown, req: Request) => Promise<Response>) => PublicHttpAction;

type RegisterCodexRunEventsStreamRoutesArgs = {
  http: HttpRouterLike;
  httpAction: HttpActionLike;
  jsonResponse: JsonResponseFn;
  optionsResponse: (req: Request) => Response;
  sseResponse: SseResponseFn;
  requireAuthenticatedActor: RequireAuthenticatedActor;
};

type RuntimeEventTransportRow = {
  id: string;
  run_id: string;
  seq: number;
  event_type: string;
  payload: unknown;
  created_at: string;
};

const CODEX_RUN_EVENTS_STREAM_MAX_BYTES = 8192;
const CODEX_RUN_EVENTS_STREAM_POLL_MS = 200;
const CODEX_RUN_EVENTS_STREAM_HEARTBEAT_MS = 15000;
const CODEX_RUN_EVENTS_STREAM_TIMEOUT_MS = 6 * 60 * 1000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function toIsoString(value: unknown): string {
  const parsed = Number(value);
  const ms = Number.isFinite(parsed) ? Math.floor(parsed) : Date.now();
  return new Date(ms).toISOString();
}

function normalizeNonEmptyText(value: unknown, maxLength: number): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

function normalizeAfterSeq(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJsonRequestBody(
  req: Request,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; status: number; code: string; message: string }> {
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > CODEX_RUN_EVENTS_STREAM_MAX_BYTES) {
    return {
      ok: false,
      status: 413,
      code: "codex_run_events_stream_payload_too_large",
      message: "Codex run event stream request is too large.",
    };
  }
  let raw = "";
  try {
    raw = await req.text();
  } catch {
    return {
      ok: false,
      status: 400,
      code: "codex_run_events_stream_payload_invalid",
      message: "Codex run event stream body could not be read.",
    };
  }
  if (byteLength(raw) > CODEX_RUN_EVENTS_STREAM_MAX_BYTES) {
    return {
      ok: false,
      status: 413,
      code: "codex_run_events_stream_payload_too_large",
      message: "Codex run event stream request is too large.",
    };
  }
  try {
    const parsed = JSON.parse(raw || "{}");
    const body = asRecord(parsed);
    if (!body) throw new Error("not_object");
    return { ok: true, body };
  } catch {
    return {
      ok: false,
      status: 400,
      code: "codex_run_events_stream_payload_invalid",
      message: "Codex run event stream body must be a JSON object.",
    };
  }
}

function mapRuntimeEventRow(row: Record<string, unknown>): RuntimeEventTransportRow | null {
  const id = normalizeNonEmptyText(row._id ?? row.id, 256);
  const runId = normalizeNonEmptyText(row.runId ?? row.run_id, 256);
  const eventType = normalizeNonEmptyText(row.eventType ?? row.event_type, 160);
  if (!id || !runId || !eventType) return null;
  return {
    id,
    run_id: runId,
    seq: normalizeAfterSeq(row.seq),
    event_type: eventType,
    payload: row.payload ?? null,
    created_at: typeof row.created_at === "string" ? row.created_at : toIsoString(row.createdAt),
  };
}

function readAssistantTextDelta(row: RuntimeEventTransportRow): string {
  if (row.event_type !== "assistant_text_delta") return "";
  const payload = asRecord(row.payload);
  return typeof payload?.delta === "string" ? payload.delta : "";
}

function readRunFinishedStatus(row: RuntimeEventTransportRow): {
  status: string | null;
  errorCode: string | null;
  errorMessage: string | null;
} {
  const payload = asRecord(row.payload);
  return {
    status: normalizeNonEmptyText(payload?.status, 64) || null,
    errorCode: normalizeNonEmptyText(payload?.error_code ?? payload?.errorCode, 160) || null,
    errorMessage: normalizeNonEmptyText(payload?.error_message ?? payload?.errorMessage, 2000) || null,
  };
}

export function registerCodexRunEventsStreamRoutes(args: RegisterCodexRunEventsStreamRoutesArgs): void {
  const {
    http,
    httpAction,
    jsonResponse,
    optionsResponse,
    sseResponse,
    requireAuthenticatedActor,
  } = args;

  http.route({
    path: "/runtime/codex_run_events_stream",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, req) => optionsResponse(req)),
  });

  http.route({
    path: "/runtime/codex_run_events_stream",
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      const authenticated = await requireAuthenticatedActor(ctx, req);
      if (!authenticated.ok) return authenticated.response;

      const parsed = await readJsonRequestBody(req);
      if (!parsed.ok) {
        return jsonResponse(req, parsed.status, {
          ok: false,
          code: parsed.code,
          error: parsed.code,
          message: parsed.message,
        });
      }

      const runId = normalizeNonEmptyText(parsed.body.run_id ?? parsed.body.runId, 256);
      if (!runId) {
        return jsonResponse(req, 400, {
          ok: false,
          code: "run_id_required",
          error: "run_id_required",
          message: "Codex runtime run id is required.",
        });
      }

      const startedAt = Date.now();
      let afterSeq = normalizeAfterSeq(parsed.body.after_seq ?? parsed.body.afterSeq);
      let lastHeartbeatAt = 0;

      return sseResponse(req, async (writer) => {
        writer.send({
          event: "start",
          data: {
            run_id: runId,
            stage: "start",
            engine_id: "codex_blaxel_app_server",
            stream_transport: "sse",
          },
        });

        while ((req as any).signal?.aborted !== true) {
          const elapsedMs = Date.now() - startedAt;
          if (elapsedMs > CODEX_RUN_EVENTS_STREAM_TIMEOUT_MS) {
            writer.send({
              event: "error",
              data: {
                run_id: runId,
                stage: "timeout",
                code: "codex_run_events_stream_timeout",
                error: "Codex run event stream timed out.",
              },
            });
            return;
          }

          const rows = ((await (ctx as any).runQuery((api as any).threads.listCloudRuntimeRunEvents as any, {
            authSubject: authenticated.actor.authSubject,
            runId,
            afterSeq,
            limit: 200,
          })) ?? []) as unknown[];

          let sawFinished = false;
          for (const rawRow of rows) {
            const record = asRecord(rawRow);
            if (!record) continue;
            const row = mapRuntimeEventRow(record);
            if (!row) continue;
            afterSeq = Math.max(afterSeq, row.seq);
            writer.send({
              event: "runtime_event",
              data: row,
            });
            const delta = readAssistantTextDelta(row);
            if (delta) {
              writer.send({
                event: "delta",
                data: {
                  run_id: row.run_id,
                  stage: "streaming",
                  delta,
                },
              });
            }
            if (row.event_type === "run_finished") {
              const finish = readRunFinishedStatus(row);
              writer.send({
                event: "done",
                data: {
                  run_id: row.run_id,
                  stage: "done",
                  status: finish.status,
                  error_code: finish.errorCode,
                  error_message: finish.errorMessage,
                },
              });
              sawFinished = true;
              break;
            }
          }
          if (sawFinished) return;

          const now = Date.now();
          if (now - lastHeartbeatAt >= CODEX_RUN_EVENTS_STREAM_HEARTBEAT_MS) {
            lastHeartbeatAt = now;
            writer.send({
              event: "heartbeat",
              data: {
                run_id: runId,
                stage: "streaming",
                after_seq: afterSeq,
              },
            });
          }
          await sleep(CODEX_RUN_EVENTS_STREAM_POLL_MS);
        }
      });
    }),
  });
}

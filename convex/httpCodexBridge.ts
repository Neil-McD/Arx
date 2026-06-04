import { internal } from "./_generated/api";
import type { PublicHttpAction } from "convex/server";
import {
  CODEX_BRIDGE_CALLBACK_MAX_BYTES,
  CODEX_BRIDGE_CONTEXT_PROMPT_MAX_CHARS,
  CODEX_BRIDGE_CONTRACT_VERSION,
  mapCodexBridgeFinishStatusToRuntimeStatus,
  normalizeCodexBridgeEventKey,
  normalizeCodexBridgeEventType,
  normalizeCodexBridgeFinishStatus,
  type CodexBridgeContextRequestV1,
  type CodexBridgeContextHttpResponseV1,
  type CodexBridgeContextResponseV1,
  type CodexBridgeRunEventRequestV1,
  type CodexBridgeRunFinishRequestV1,
  type CodexBridgeRunEventSource,
} from "../shared/codexBridgeContract.ts";
import {
  buildRuntimeTurnContextSnapshot,
  renderRuntimeTurnContextForPrompt,
} from "../shared/runtimeTurnContextPacket";
import { verifyCodexBridgeRunToken } from "./codexBridgeToken.ts";
import { loadRuntimeTurnContextPacketForRun } from "./runtimeTurnContext";

type HttpRouteMethod = "GET" | "POST" | "DELETE" | "OPTIONS" | "PUT" | "PATCH";

type HttpRouterLike = {
  route: (config: {
    path: string;
    method: HttpRouteMethod;
    handler: PublicHttpAction;
  }) => void;
};

type HttpActionLike = (handler: (ctx: unknown, req: Request) => Promise<Response>) => PublicHttpAction;

type JsonResponseFn = (req: Request, status: number, payload: unknown) => Response;

type RegisterCodexBridgeRoutesArgs = {
  http: HttpRouterLike;
  httpAction: HttpActionLike;
  jsonResponse: JsonResponseFn;
  optionsResponse: (req: Request) => Response;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function readBearerToken(req: Request): string {
  const raw = String(req.headers.get("authorization") ?? "").trim();
  if (!raw.toLowerCase().startsWith("bearer ")) return "";
  return raw.slice(7).trim();
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

async function readJsonRequestBody(
  req: Request,
): Promise<
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; code: string; message: string }
> {
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > CODEX_BRIDGE_CALLBACK_MAX_BYTES) {
    return {
      ok: false,
      status: 413,
      code: "codex_bridge_payload_too_large",
      message: "Codex bridge callback payload is too large.",
    };
  }
  let raw = "";
  try {
    raw = await req.text();
  } catch {
    return {
      ok: false,
      status: 400,
      code: "codex_bridge_payload_invalid",
      message: "Codex bridge callback body could not be read.",
    };
  }
  if (byteLength(raw) > CODEX_BRIDGE_CALLBACK_MAX_BYTES) {
    return {
      ok: false,
      status: 413,
      code: "codex_bridge_payload_too_large",
      message: "Codex bridge callback payload is too large.",
    };
  }
  try {
    const parsed = JSON.parse(raw);
    const body = asRecord(parsed);
    if (!body) throw new Error("not_object");
    return { ok: true, body };
  } catch {
    return {
      ok: false,
      status: 400,
      code: "codex_bridge_payload_invalid",
      message: "Codex bridge callback body must be a JSON object.",
    };
  }
}

function safeOptionalText(raw: unknown, maxLength: number): string | undefined {
  const value = String(raw ?? "").trim();
  return value ? value.slice(0, maxLength) : undefined;
}

function normalizeOptionalEpochMs(raw: unknown): number | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === "string" && raw.trim() === "") return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.floor(parsed) : undefined;
}

function truncateText(raw: unknown, maxLength: number): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function normalizeBridgeEventSource(raw: unknown): CodexBridgeRunEventSource {
  const value = String(raw ?? "").trim();
  if (
    value === "bridge_echo" ||
    value === "codex_exec_jsonl" ||
    value === "bridge_worker" ||
    value === "polynet_tool"
  ) {
    return value;
  }
  return "bridge_worker";
}

function mutationErrorResponse(
  req: Request,
  jsonResponse: JsonResponseFn,
  error: unknown,
): Response {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  if (normalized.includes("thread_access_denied")) {
    return jsonResponse(req, 403, {
      ok: false,
      code: "thread_access_denied",
      error: "thread_access_denied",
      message: "Thread access denied.",
    });
  }
  if (normalized.includes("thread_not_found") || normalized.includes("runtime_run_not_found")) {
    return jsonResponse(req, 404, {
      ok: false,
      code: "runtime_run_not_found",
      error: "runtime_run_not_found",
      message: "Runtime run not found.",
    });
  }
  if (normalized.includes("run_thread_conflict")) {
    return jsonResponse(req, 409, {
      ok: false,
      code: "run_thread_conflict",
      error: "run_thread_conflict",
      message: "Runtime run does not belong to this thread.",
    });
  }
  if (normalized.includes("run_project_scope_conflict") || normalized.includes("run_community_scope_conflict")) {
    return jsonResponse(req, 403, {
      ok: false,
      code: "runtime_run_scope_conflict",
      error: "runtime_run_scope_conflict",
      message: "Runtime run scope does not match the bridge token.",
    });
  }
  if (normalized.includes("runtime_run_not_running")) {
    return jsonResponse(req, 409, {
      ok: false,
      code: "runtime_run_not_running",
      error: "runtime_run_not_running",
      message: "Runtime run is not running.",
    });
  }
  return jsonResponse(req, 500, {
    ok: false,
    code: "codex_bridge_callback_failed",
    error: "codex_bridge_callback_failed",
    message: "Codex bridge callback failed.",
  });
}

function assertBridgeRequestVersion(body: Record<string, unknown>): void {
  if (body.version !== CODEX_BRIDGE_CONTRACT_VERSION) {
    throw new Error("codex_bridge_version_invalid");
  }
}

function assertRunMatchesBridgeClaims(args: {
  run: Record<string, unknown> | null;
  claims: {
    threadId: string;
    projectId?: string | null;
    communityId?: string | null;
  };
}): asserts args is {
  run: Record<string, unknown>;
  claims: {
    threadId: string;
    projectId?: string | null;
    communityId?: string | null;
  };
} {
  if (!args.run) throw new Error("runtime_run_not_found");
  if (String(args.run.threadId ?? "") !== args.claims.threadId) {
    throw new Error("run_thread_conflict");
  }
  const claimProjectId = String(args.claims.projectId ?? "").trim();
  if (claimProjectId && String(args.run.projectId ?? "") !== claimProjectId) {
    throw new Error("run_project_scope_conflict");
  }
  const claimCommunityId = String(args.claims.communityId ?? "").trim();
  if (claimCommunityId && String(args.run.communityId ?? "") !== claimCommunityId) {
    throw new Error("run_community_scope_conflict");
  }
}

export function registerCodexBridgeRoutes(args: RegisterCodexBridgeRoutesArgs): void {
  const { http, httpAction, jsonResponse, optionsResponse } = args;

  http.route({
    path: "/runtime/codex_bridge/event",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, req) => optionsResponse(req)),
  });

  http.route({
    path: "/runtime/codex_bridge/finish",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, req) => optionsResponse(req)),
  });

  http.route({
    path: "/runtime/codex_bridge/context",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, req) => optionsResponse(req)),
  });

  http.route({
    path: "/runtime/codex_bridge/context",
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      const verified = await verifyCodexBridgeRunToken({
        token: readBearerToken(req),
        requiredOperation: "context",
      });
      if (!verified.ok) {
        return jsonResponse(req, verified.status, {
          ok: false,
          code: verified.code,
          error: verified.code,
          message: verified.message,
        });
      }
      const parsed = await readJsonRequestBody(req);
      if (!parsed.ok) {
        return jsonResponse(req, parsed.status, {
          ok: false,
          code: parsed.code,
          error: parsed.code,
          message: parsed.message,
        });
      }

      let request: CodexBridgeContextRequestV1;
      try {
        assertBridgeRequestVersion(parsed.body);
        request = {
          version: CODEX_BRIDGE_CONTRACT_VERSION,
          runId: String(parsed.body.runId ?? "").trim(),
          includePrompt: parsed.body.includePrompt !== false,
        };
      } catch (error) {
        const code =
          error instanceof Error && error.message
            ? error.message
            : "codex_bridge_payload_invalid";
        return jsonResponse(req, 400, {
          ok: false,
          code,
          error: code,
          message: "Codex bridge context payload is invalid.",
        });
      }

      if (request.runId !== verified.claims.runId) {
        return jsonResponse(req, 403, {
          ok: false,
          code: "codex_bridge_run_scope_mismatch",
          error: "codex_bridge_run_scope_mismatch",
          message: "Codex bridge token is not scoped to this run.",
        });
      }

      try {
        const run = (await (ctx as any).runQuery(
          (internal as any).threads.getRuntimeRunByOwnerRunIdInternal as any,
          {
            ownerId: verified.claims.ownerId as any,
            runId: verified.claims.runId,
          },
        )) as Record<string, unknown> | null;
        assertRunMatchesBridgeClaims({
          run,
          claims: verified.claims,
        });

        const thread = (await (ctx as any).runQuery(
          (internal as any).threads.getCloudThreadRuntimeContextByOwnerInternal as any,
          {
            ownerId: verified.claims.ownerId as any,
            threadId: verified.claims.threadId as any,
          },
        )) as Record<string, unknown> | null;
        if (!thread) throw new Error("thread_not_found");

        const capturedAt = Date.now();
        const loadedContext = await loadRuntimeTurnContextPacketForRun({
          ctx,
          ownerId: verified.claims.ownerId as any,
          threadId: verified.claims.threadId as any,
          projectId: verified.claims.projectId ?? (String(run.projectId ?? "").trim() || null),
          runId: verified.claims.runId,
          latestUserText: truncateText(parsed.body.latestUserText, 500),
          threadWorkingState: (thread.workingState as any) ?? null,
        });
        const contextPrompt =
          request.includePrompt === false
            ? null
            : truncateText(
                renderRuntimeTurnContextForPrompt(loadedContext.packet),
                CODEX_BRIDGE_CONTEXT_PROMPT_MAX_CHARS,
              );
        const contextSnapshot = buildRuntimeTurnContextSnapshot({
          packet: loadedContext.packet,
          capturedAt,
        });
        const response: CodexBridgeContextResponseV1 = {
          version: CODEX_BRIDGE_CONTRACT_VERSION,
          runId: verified.claims.runId,
          capturedAt,
          contextPrompt,
          contextSnapshot,
          limits: {
            contextPromptMaxChars: CODEX_BRIDGE_CONTEXT_PROMPT_MAX_CHARS,
          },
        };

        await (ctx as any).runMutation(
          (internal as any).threads.appendCloudRuntimeRunEventByBridgeClaimsInternal as any,
          {
            ownerId: verified.claims.ownerId as any,
            threadId: verified.claims.threadId as any,
            runId: verified.claims.runId,
            claimProjectId: verified.claims.projectId ?? undefined,
            claimCommunityId: verified.claims.communityId ?? undefined,
            eventType: "codex_bridge_context_fetched",
            eventKey: "codex_bridge_context_fetched",
            payload: {
              bridge_source: "polynet_tool",
              bridge_payload: {
                captured_at: capturedAt,
                context_prompt_chars: contextPrompt?.length ?? 0,
                snapshot_version: contextSnapshot.version,
                active_terminal_count: contextSnapshot.activeBackgroundTerminals.length,
                recent_tool_attempt_count: contextSnapshot.recentToolAttempts.length,
              },
            },
            createdAt: capturedAt,
            nowMs: capturedAt,
          },
        );

        const httpResponse: CodexBridgeContextHttpResponseV1 = {
          ok: true,
          context: response,
        };
        return jsonResponse(req, 200, httpResponse);
      } catch (error) {
        return mutationErrorResponse(req, jsonResponse, error);
      }
    }),
  });

  http.route({
    path: "/runtime/codex_bridge/event",
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      const verified = await verifyCodexBridgeRunToken({
        token: readBearerToken(req),
        requiredOperation: "event",
      });
      if (!verified.ok) {
        return jsonResponse(req, verified.status, {
          ok: false,
          code: verified.code,
          error: verified.code,
          message: verified.message,
        });
      }
      const parsed = await readJsonRequestBody(req);
      if (!parsed.ok) {
        return jsonResponse(req, parsed.status, {
          ok: false,
          code: parsed.code,
          error: parsed.code,
          message: parsed.message,
        });
      }

      let request: CodexBridgeRunEventRequestV1;
      try {
        assertBridgeRequestVersion(parsed.body);
        request = {
          version: CODEX_BRIDGE_CONTRACT_VERSION,
          runId: String(parsed.body.runId ?? "").trim(),
          eventType: normalizeCodexBridgeEventType(parsed.body.eventType),
          eventKey: normalizeCodexBridgeEventKey(parsed.body.eventKey),
          source: normalizeBridgeEventSource(parsed.body.source),
          payload: parsed.body.payload,
          createdAt: normalizeOptionalEpochMs(parsed.body.createdAt),
        };
      } catch (error) {
        const code =
          error instanceof Error && error.message
            ? error.message
            : "codex_bridge_payload_invalid";
        return jsonResponse(req, 400, {
          ok: false,
          code,
          error: code,
          message: "Codex bridge event payload is invalid.",
        });
      }

      if (request.runId !== verified.claims.runId) {
        return jsonResponse(req, 403, {
          ok: false,
          code: "codex_bridge_run_scope_mismatch",
          error: "codex_bridge_run_scope_mismatch",
          message: "Codex bridge token is not scoped to this run.",
        });
      }

      try {
        const event = (await (ctx as any).runMutation(
          (internal as any).threads.appendCloudRuntimeRunEventByBridgeClaimsInternal as any,
          {
            ownerId: verified.claims.ownerId as any,
            threadId: verified.claims.threadId as any,
            runId: verified.claims.runId,
            claimProjectId: verified.claims.projectId ?? undefined,
            claimCommunityId: verified.claims.communityId ?? undefined,
            eventType: request.eventType,
            eventKey: request.eventKey,
            payload: {
              bridge_source: request.source ?? "bridge_worker",
              bridge_payload: request.payload ?? null,
            },
            createdAt: request.createdAt,
            nowMs: Date.now(),
          },
        )) as {
          seq?: unknown;
          eventType?: unknown;
          eventKey?: unknown;
          createdAt?: unknown;
        } | null;
        return jsonResponse(req, 200, {
          ok: true,
          event: {
            run_id: verified.claims.runId,
            seq: Number(event?.seq ?? 0),
            event_type: String(event?.eventType ?? request.eventType),
            event_key: event?.eventKey ? String(event.eventKey) : null,
            created_at: Number(event?.createdAt ?? request.createdAt ?? Date.now()),
          },
        });
      } catch (error) {
        return mutationErrorResponse(req, jsonResponse, error);
      }
    }),
  });

  http.route({
    path: "/runtime/codex_bridge/finish",
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      const verified = await verifyCodexBridgeRunToken({
        token: readBearerToken(req),
        requiredOperation: "finish",
      });
      if (!verified.ok) {
        return jsonResponse(req, verified.status, {
          ok: false,
          code: verified.code,
          error: verified.code,
          message: verified.message,
        });
      }
      const parsed = await readJsonRequestBody(req);
      if (!parsed.ok) {
        return jsonResponse(req, parsed.status, {
          ok: false,
          code: parsed.code,
          error: parsed.code,
          message: parsed.message,
        });
      }

      let request: CodexBridgeRunFinishRequestV1;
      try {
        assertBridgeRequestVersion(parsed.body);
        const status = normalizeCodexBridgeFinishStatus(parsed.body.status);
        request = {
          version: CODEX_BRIDGE_CONTRACT_VERSION,
          runId: String(parsed.body.runId ?? "").trim(),
          status,
          reason: safeOptionalText(parsed.body.reason, 500),
          errorCode: safeOptionalText(parsed.body.errorCode, 160),
          errorMessage: safeOptionalText(parsed.body.errorMessage, 1000),
          finishedAt: normalizeOptionalEpochMs(parsed.body.finishedAt),
        };
      } catch (error) {
        const code =
          error instanceof Error && error.message
            ? error.message
            : "codex_bridge_payload_invalid";
        return jsonResponse(req, 400, {
          ok: false,
          code,
          error: code,
          message: "Codex bridge finish payload is invalid.",
        });
      }

      if (request.runId !== verified.claims.runId) {
        return jsonResponse(req, 403, {
          ok: false,
          code: "codex_bridge_run_scope_mismatch",
          error: "codex_bridge_run_scope_mismatch",
          message: "Codex bridge token is not scoped to this run.",
        });
      }

      try {
        const run = (await (ctx as any).runMutation(
          (internal as any).threads.finishCloudRuntimeRunByBridgeClaimsInternal as any,
          {
            ownerId: verified.claims.ownerId as any,
            threadId: verified.claims.threadId as any,
            runId: verified.claims.runId,
            claimProjectId: verified.claims.projectId ?? undefined,
            claimCommunityId: verified.claims.communityId ?? undefined,
            status: mapCodexBridgeFinishStatusToRuntimeStatus(request.status),
            reason: request.reason,
            errorCode:
              request.errorCode ??
              (request.status === "timed_out" ? "codex_bridge_timed_out" : undefined),
            errorMessage: request.errorMessage,
            finishedAt: request.finishedAt,
            nowMs: Date.now(),
          },
        )) as { status?: unknown; finishedAt?: unknown } | null;
        return jsonResponse(req, 200, {
          ok: true,
          run: {
            run_id: verified.claims.runId,
            status: String(run?.status ?? ""),
            finished_at: Number(run?.finishedAt ?? request.finishedAt ?? Date.now()),
          },
        });
      } catch (error) {
        return mutationErrorResponse(req, jsonResponse, error);
      }
    }),
  });
}

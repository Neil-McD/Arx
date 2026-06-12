import { internal } from "./_generated/api";
import type { PublicHttpAction } from "convex/server";
import {
  CODEX_BRIDGE_CALLBACK_MAX_BYTES,
  CODEX_BRIDGE_CONTRACT_VERSION,
  mapCodexBridgeFinishStatusToRuntimeStatus,
  normalizeCodexBridgeEventKey,
  normalizeCodexBridgeEventType,
  normalizeCodexBridgeFinishStatus,
  type CodexBridgeRunEventSource,
} from "../shared/codexBridgeContract";
import { normalizeCodexAppServerNotification } from "../shared/codexAppServerEventNormalizer";
import { verifyCodexBridgeRunToken } from "./codexBridgeToken";

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
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
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
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; status: number; code: string; message: string }> {
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

function normalizeOptionalEpochMs(raw: unknown): number | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === "string" && raw.trim() === "") return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.floor(parsed) : undefined;
}

function safeOptionalText(raw: unknown, maxLength: number): string | undefined {
  const value = String(raw ?? "").trim();
  return value ? value.slice(0, maxLength) : undefined;
}

function safeRequiredText(raw: unknown, maxLength: number): string {
  const value = String(raw ?? "").trim();
  if (!value) throw new Error("codex_bridge_required_text_missing");
  return value.slice(0, maxLength);
}

function normalizeBridgeEventSource(raw: unknown): CodexBridgeRunEventSource {
  const value = String(raw ?? "").trim();
  return value === "codex_app_server_ws" || value === "bridge_worker" ? value : "bridge_worker";
}

function normalizeRuntimeMcpToolName(raw: unknown): {
  runtimeToolName: string;
  namespacedToolName: string;
} {
  const runtimeToolName = safeRequiredText(raw, 240);
  const namespacedToolName = runtimeToolName.startsWith("me__")
    ? runtimeToolName.slice(4)
    : runtimeToolName;
  if (!namespacedToolName || namespacedToolName.length > 220) {
    throw new Error("codex_bridge_mcp_tool_name_invalid");
  }
  return { runtimeToolName, namespacedToolName };
}

function normalizeMcpToolArguments(raw: unknown): Record<string, unknown> {
  const record = asRecord(raw);
  return record ?? {};
}

function summarizeMcpToolArguments(args: Record<string, unknown>): Record<string, unknown> {
  return {
    arg_keys: Object.keys(args).sort().slice(0, 50),
    arg_count: Object.keys(args).length,
  };
}

function redactSensitiveText(value: string): string {
  return String(value ?? "")
    .slice(0, 8000)
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted_jwt]")
    .replace(/\b(sk-[A-Za-z0-9_-]{16,})\b/g, "[redacted_api_key]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/(access[_-]?token|refresh[_-]?token|api[_-]?key|secret)["']?\s*[:=]\s*["']?[^"',}\s]+/gi, "$1:[redacted]");
}

function sanitizeBridgePayload(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[max_depth]";
  if (typeof value === "string") return redactSensitiveText(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeBridgePayload(item, depth + 1));
  const record = asRecord(value);
  if (!record) return null;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record).slice(0, 80)) {
    if (/(access[_-]?token|refresh[_-]?token|authorization|api[_-]?key|secret)/i.test(key)) {
      out[key] = "[redacted]";
    } else {
      out[key] = sanitizeBridgePayload(item, depth + 1);
    }
  }
  return out;
}

function mutationErrorResponse(req: Request, jsonResponse: JsonResponseFn, error: unknown): Response {
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
  return jsonResponse(req, 500, {
    ok: false,
    code: "codex_bridge_callback_failed",
    error: "codex_bridge_callback_failed",
    message: "Codex bridge callback failed.",
    detail: redactSensitiveText(message),
  });
}

function assertBridgeRequestVersion(body: Record<string, unknown>): void {
  if (body.version !== CODEX_BRIDGE_CONTRACT_VERSION) {
    throw new Error("codex_bridge_version_invalid");
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
    path: "/runtime/codex_bridge/mcp_tool",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, req) => optionsResponse(req)),
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

      let eventType = "";
      let eventKey: string | undefined;
      let payload: unknown = null;
      let createdAt: number | undefined;
      try {
        assertBridgeRequestVersion(parsed.body);
        const runId = String(parsed.body.runId ?? "").trim();
        if (runId !== verified.claims.runId) throw new Error("codex_bridge_run_scope_mismatch");
        createdAt = normalizeOptionalEpochMs(parsed.body.createdAt);
        const normalizedCodex = parsed.body.codexMessage
          ? normalizeCodexAppServerNotification({
              runId,
              message: parsed.body.codexMessage,
              ordinal: normalizeOptionalEpochMs(parsed.body.ordinal) ?? null,
            })
          : null;
        if (normalizedCodex) {
          eventType = normalizedCodex.eventType;
          eventKey = normalizeCodexBridgeEventKey(parsed.body.eventKey) ?? normalizedCodex.eventKey;
          payload = normalizedCodex.payload;
        } else if (parsed.body.codexMessage) {
          return jsonResponse(req, 200, {
            ok: true,
            skipped: true,
            reason: "codex_notification_not_persisted",
          });
        } else {
          eventType = normalizeCodexBridgeEventType(parsed.body.eventType);
          eventKey = normalizeCodexBridgeEventKey(parsed.body.eventKey);
          payload = parsed.body.payload ?? null;
        }
      } catch (error) {
        const code = error instanceof Error && error.message ? error.message : "codex_bridge_payload_invalid";
        return jsonResponse(req, code === "codex_bridge_run_scope_mismatch" ? 403 : 400, {
          ok: false,
          code,
          error: code,
          message: "Codex bridge event payload is invalid.",
        });
      }

      try {
        const sanitized = sanitizeBridgePayload(payload);
        const payloadRecord = asRecord(sanitized);
        const event = (await (ctx as any).runMutation(
          (internal as any).threads.appendCloudRuntimeRunEventByBridgeClaimsInternal as any,
          {
            ownerId: verified.claims.ownerId as any,
            threadId: verified.claims.threadId as any,
            runId: verified.claims.runId,
            claimProjectId: verified.claims.projectId ?? undefined,
            claimCommunityId: verified.claims.communityId ?? undefined,
            eventType,
            eventKey,
            payload: {
              ...(payloadRecord ?? { bridge_payload: sanitized }),
              bridge_source: normalizeBridgeEventSource(parsed.body.source),
            },
            createdAt,
            nowMs: Date.now(),
          },
        )) as { _id?: unknown; seq?: unknown; eventType?: unknown; eventKey?: unknown; createdAt?: unknown } | null;
        return jsonResponse(req, 200, {
          ok: true,
          event: {
            id: event?._id ? String(event._id) : null,
            run_id: verified.claims.runId,
            seq: Number(event?.seq ?? 0),
            event_type: String(event?.eventType ?? eventType),
            event_key: event?.eventKey ? String(event.eventKey) : null,
            created_at: Number(event?.createdAt ?? createdAt ?? Date.now()),
          },
        });
      } catch (error) {
        return mutationErrorResponse(req, jsonResponse, error);
      }
    }),
  });

  http.route({
    path: "/runtime/codex_bridge/mcp_tool",
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      const verified = await verifyCodexBridgeRunToken({
        token: readBearerToken(req),
        requiredOperation: "mcp_tool",
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

      let request: {
        runId: string;
        runtimeToolName: string;
        namespacedToolName: string;
        argumentsObject: Record<string, unknown>;
      } = {
        runId: "",
        runtimeToolName: "",
        namespacedToolName: "",
        argumentsObject: {},
      };
      try {
        assertBridgeRequestVersion(parsed.body);
        const runId = String(parsed.body.runId ?? "").trim();
        if (runId !== verified.claims.runId) throw new Error("codex_bridge_run_scope_mismatch");
        const toolName = normalizeRuntimeMcpToolName(parsed.body.runtimeToolName ?? parsed.body.toolName);
        request = {
          runId,
          ...toolName,
          argumentsObject: normalizeMcpToolArguments(parsed.body.arguments),
        };
      } catch (error) {
        const code = error instanceof Error && error.message ? error.message : "codex_bridge_payload_invalid";
        return jsonResponse(req, code === "codex_bridge_run_scope_mismatch" ? 403 : 400, {
          ok: false,
          code,
          error: code,
          message: "Codex bridge MCP tool payload is invalid.",
        });
      }

      const eventBase = {
        ownerId: verified.claims.ownerId as any,
        threadId: verified.claims.threadId as any,
        runId: verified.claims.runId,
        claimProjectId: verified.claims.projectId ?? undefined,
        claimCommunityId: verified.claims.communityId ?? undefined,
        nowMs: Date.now(),
      };
      try {
        await (ctx as any).runMutation(
          (internal as any).threads.appendCloudRuntimeRunEventByBridgeClaimsInternal as any,
          {
            ...eventBase,
            eventType: "codex_native_mcp_tool_call_started",
            eventKey: `${verified.claims.runId}:mcp:${request.runtimeToolName}:started:${Date.now()}`,
            payload: {
              bridge_source: "bridge_worker",
              mcp_server_name: "polynet_user_harness",
              runtime_tool_name: request.runtimeToolName,
              namespaced_tool_name: request.namespacedToolName,
              ...summarizeMcpToolArguments(request.argumentsObject),
            },
          },
        );
        const result = (await (ctx as any).runAction(
          (internal as any).userPlatformAppMounts.executeUserPlatformMountedAppToolInternal as any,
          {
            userId: verified.claims.ownerId as any,
            namespacedToolName: request.namespacedToolName,
            argsJson: request.argumentsObject,
          },
        )) as Record<string, unknown>;
        const status = String(result?.status ?? "") === "ok" ? "ok" : "error";
        const errorCode = safeOptionalText(result?.errorCode, 160) ?? null;
        await (ctx as any).runMutation(
          (internal as any).threads.appendCloudRuntimeRunEventByBridgeClaimsInternal as any,
          {
            ...eventBase,
            eventType: "codex_native_mcp_tool_call_completed",
            eventKey: `${verified.claims.runId}:mcp:${request.runtimeToolName}:completed:${Date.now()}`,
            payload: {
              bridge_source: "bridge_worker",
              mcp_server_name: "polynet_user_harness",
              runtime_tool_name: request.runtimeToolName,
              namespaced_tool_name: request.namespacedToolName,
              status,
              error_code: errorCode,
              output_chars: String(result?.outputText ?? "").length,
            },
          },
        );
        return jsonResponse(req, 200, {
          ok: true,
          result: sanitizeBridgePayload(result),
        });
      } catch (error) {
        const message = redactSensitiveText(error instanceof Error ? error.message : String(error));
        try {
          await (ctx as any).runMutation(
            (internal as any).threads.appendCloudRuntimeRunEventByBridgeClaimsInternal as any,
            {
              ...eventBase,
              eventType: "codex_native_mcp_tool_call_failed",
              eventKey: `${verified.claims.runId}:mcp:${request.runtimeToolName}:failed:${Date.now()}`,
              payload: {
                bridge_source: "bridge_worker",
                mcp_server_name: "polynet_user_harness",
                runtime_tool_name: request.runtimeToolName,
                namespaced_tool_name: request.namespacedToolName,
                error_message: message,
              },
            },
          );
        } catch {
          // Best-effort evidence only.
        }
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

      let request: {
        runId: string;
        status: ReturnType<typeof normalizeCodexBridgeFinishStatus>;
        reason?: string;
        errorCode?: string;
        errorMessage?: string;
        assistantText?: string;
        assistantModelId?: string;
        finishedAt?: number;
      };
      try {
        assertBridgeRequestVersion(parsed.body);
        request = {
          runId: String(parsed.body.runId ?? "").trim(),
          status: normalizeCodexBridgeFinishStatus(parsed.body.status),
          reason: safeOptionalText(parsed.body.reason, 500),
          errorCode: safeOptionalText(parsed.body.errorCode, 160),
          errorMessage: safeOptionalText(redactSensitiveText(String(parsed.body.errorMessage ?? "")), 1000),
          assistantText: safeOptionalText(parsed.body.assistantText, 80_000),
          assistantModelId: safeOptionalText(parsed.body.assistantModelId, 160),
          finishedAt: normalizeOptionalEpochMs(parsed.body.finishedAt),
        };
      } catch (error) {
        const code = error instanceof Error && error.message ? error.message : "codex_bridge_payload_invalid";
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
            assistantText: request.assistantText,
            assistantModelId: request.assistantModelId,
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

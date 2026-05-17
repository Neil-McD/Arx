import { api, internal } from "./_generated/api";
import type { PublicHttpAction } from "convex/server";
import {
  CODEX_HARNESS_DYNAMIC_TOOL_BRIDGE_ROUTE,
} from "../shared/codexHarnessDynamicTools.ts";
import {
  hashCodexHarnessBridgeToken,
} from "./codexHarnessDynamicToolBridge";
import {
  executeCodexHarnessReadOnlyPlatformTool,
} from "./codexHarnessPlatformTools";

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

type RegisterCodexHarnessBridgeRoutesArgs = {
  http: HttpRouterLike;
  httpAction: HttpActionLike;
  jsonResponse: JsonResponseFn;
  optionsResponse: (req: Request) => Response;
};

function readBearerToken(req: Request): string {
  const raw = String(req.headers.get("authorization") ?? "").trim();
  if (!raw.toLowerCase().startsWith("bearer ")) return "";
  return raw.slice(7).trim();
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function readArgs(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function sha256Text(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function summarizeContentItems(value: unknown): Promise<{ count: number; textChars: number; textSha256: string | null }> {
  if (!Array.isArray(value)) return { count: 0, textChars: 0, textSha256: null };
  const text = value
    .map((item) =>
      item && typeof item === "object" && !Array.isArray(item) && typeof (item as any).text === "string"
        ? (item as any).text
        : "",
    )
    .filter(Boolean)
    .join("\n");
  return {
    count: value.length,
    textChars: text.length,
    textSha256: text ? await sha256Text(text) : null,
  };
}

async function appendBridgeAuditEventBestEffort(params: {
  ctx: any;
  session: Record<string, unknown> | null | undefined;
  eventType: string;
  eventKeySuffix: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const userId = readString(params.session ?? {}, "userId");
  const authSubject = readString(params.session ?? {}, "authSubject");
  const threadId = readString(params.session ?? {}, "threadId");
  const runId = readString(params.session ?? {}, "runId");
  if (!userId || !authSubject || !threadId || !runId) return;
  try {
    await params.ctx.runMutation((internal as any).threads.appendTrustedCloudRuntimeRunEventInternal, {
      ownerId: userId,
      threadId,
      runId,
      eventType: params.eventType,
      eventKey: `${runId}:${params.eventType}:${params.eventKeySuffix}`,
      payload: {
        run_id: runId,
        bridge_source: "codex_harness_dynamic_tool_bridge",
        ...params.payload,
      },
    });
  } catch {
    // Runtime event audit is best-effort; bridge auth and tool execution remain authoritative.
  }
}

async function appendBridgeRuntimeRunEventBestEffort(params: {
  ctx: any;
  session: Record<string, unknown> | null | undefined;
  event: {
    eventType: string;
    eventKey?: string;
    payload: Record<string, unknown>;
  };
}): Promise<void> {
  const userId = readString(params.session ?? {}, "userId");
  const threadId = readString(params.session ?? {}, "threadId");
  const runId = readString(params.session ?? {}, "runId");
  if (!userId || !threadId || !runId || !params.event.eventType) return;
  try {
    await params.ctx.runMutation((internal as any).threads.appendTrustedCloudRuntimeRunEventInternal, {
      ownerId: userId,
      threadId,
      runId,
      eventType: params.event.eventType,
      eventKey: params.event.eventKey,
      payload: {
        bridge_source: "codex_harness_dynamic_tool_bridge",
        ...params.event.payload,
      },
    });
  } catch {
    // Runtime MCP telemetry is best-effort; bridge auth and tool execution remain authoritative.
  }
}

async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await req.json();
    return readArgs(parsed);
  } catch {
    return {};
  }
}

export function registerCodexHarnessBridgeRoutes(
  args: RegisterCodexHarnessBridgeRoutesArgs,
): void {
  const { http, httpAction, jsonResponse, optionsResponse } = args;

  http.route({
    path: CODEX_HARNESS_DYNAMIC_TOOL_BRIDGE_ROUTE,
    method: "OPTIONS",
    handler: httpAction(async (_ctx, req) => optionsResponse(req)),
  });

  http.route({
    path: CODEX_HARNESS_DYNAMIC_TOOL_BRIDGE_ROUTE,
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      const token = readBearerToken(req);
      if (!token) {
        return jsonResponse(req, 401, {
          success: false,
          contentItems: [
            {
              type: "inputText",
              text: "Codex dynamic tool bridge authentication is required.",
            },
          ],
          errorCode: "codex_bridge_auth_required",
        });
      }

      const body = await readJsonBody(req);
      const bridgeSessionId = readString(body, "bridgeSessionId");
      const runId = readString(body, "runId");
      const toolName = readString(body, "toolName") || readString(body, "tool");
      const callId = readString(body, "callId");
      const toolArgs = readArgs(body.arguments);
      const tokenHash = await hashCodexHarnessBridgeToken(token);

      const session = await (ctx as any).runMutation(
        (internal as any).codexHarnessDynamicToolBridge
          .resolveCodexHarnessBridgeSessionForCallInternal,
        {
          bridgeSessionId,
          tokenHash,
          runId,
          toolName,
          callId: callId || undefined,
          nowMs: Date.now(),
        },
      );
      if (!session?.ok) {
        await appendBridgeAuditEventBestEffort({
          ctx,
          session,
          eventType: "codex_harness_dynamic_tool_bridge_call_denied",
          eventKeySuffix: `${callId || "unknown"}:${String(session?.code ?? "denied")}`,
          payload: {
            status: "denied",
            code: String(session?.code ?? "codex_bridge_auth_invalid"),
            tool_name: toolName || null,
            call_id: callId || null,
            args_present: Object.keys(toolArgs).length > 0,
          },
        });
        return jsonResponse(req, Number(session?.status ?? 401), {
          success: false,
          contentItems: [
            {
              type: "inputText",
              text: String(
                session?.message ??
                  "Codex dynamic tool bridge authentication failed.",
              ),
            },
          ],
          errorCode: String(session?.code ?? "codex_bridge_auth_invalid"),
        });
      }

      await appendBridgeAuditEventBestEffort({
        ctx,
        session,
        eventType: "codex_harness_dynamic_tool_bridge_call_started",
        eventKeySuffix: callId || `${toolName || "unknown"}:${Date.now()}`,
        payload: {
          status: "started",
          tool_name: toolName,
          call_id: callId || null,
          args_present: Object.keys(toolArgs).length > 0,
        },
      });
      const result = await executeCodexHarnessReadOnlyPlatformTool({
        ctx,
        userId: String(session.userId ?? ""),
        authSubject:
          typeof session.authSubject === "string" ? session.authSubject : null,
        communityId:
          typeof session.communityId === "string" ? session.communityId : null,
        runId,
        toolName,
        args: toolArgs,
        appendRunEvent: async (event) =>
          await appendBridgeRuntimeRunEventBestEffort({
            ctx,
            session,
            event,
          }),
      });
      const outputSummary = await summarizeContentItems(result.contentItems);
      await appendBridgeAuditEventBestEffort({
        ctx,
        session,
        eventType: "codex_harness_dynamic_tool_bridge_call_finished",
        eventKeySuffix: callId || `${toolName || "unknown"}:${Date.now()}`,
        payload: {
          status: result.success ? "ok" : "error",
          success: result.success,
          tool_name: toolName,
          call_id: callId || null,
          error_code: result.errorCode ?? null,
          content_item_count: outputSummary.count,
          output_chars: outputSummary.textChars,
          output_sha256: outputSummary.textSha256,
        },
      });

      return jsonResponse(req, 200, {
        success: result.success,
        contentItems: result.contentItems,
        errorCode: result.errorCode ?? null,
      });
    }),
  });
}

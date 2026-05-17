import type { PublicHttpAction } from "convex/server";
import {
  INTERNAL_STAGING_MCP_CANARY_ENDPOINT_PATH,
} from "../shared/discoverCatalog.ts";

type HttpRouteMethod = "GET" | "POST" | "DELETE" | "OPTIONS" | "PUT" | "PATCH";

type HttpRouterLike = {
  route: (config: {
    path: string;
    method: HttpRouteMethod;
    handler: PublicHttpAction;
  }) => void;
};

type HttpActionLike = (handler: (ctx: unknown, req: Request) => Promise<Response>) => PublicHttpAction;

type RegisterStagingMcpCanaryRoutesArgs = {
  http: HttpRouterLike;
  httpAction: HttpActionLike;
  optionsResponse: (req: Request) => Response;
};

const STAGING_HOSTNAME = "polynet-staging.vercel.app";
const CANARY_PROTOCOL_VERSION = "2025-06-18";
const CANARY_SESSION_ID = "polynet-staging-mcp-canary-session";
const CANARY_TOOL_NAME = "read_canary_record";

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
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

function isStagingCanaryEnabled(): boolean {
  return (
    readStagingHostname() === STAGING_HOSTNAME &&
    readEnv("POLYNET_STAGING_MAINTENANCE_ENABLED").toLowerCase() === "true"
  );
}

function jsonRpcResponse(
  status: number,
  payload: Record<string, unknown>,
  sessionId?: string | null,
): Response {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  if (sessionId) headers.set("Mcp-Session-Id", sessionId);
  return new Response(JSON.stringify(payload), { status, headers });
}

function jsonRpcError(id: unknown, code: number, message: string): Response {
  return jsonRpcResponse(200, {
    jsonrpc: "2.0",
    id: id ?? null,
    error: {
      code,
      message,
    },
  });
}

async function readMcpRequest(req: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await req.json();
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function registerStagingMcpCanaryRoutes(
  args: RegisterStagingMcpCanaryRoutesArgs,
): void {
  const { http, httpAction, optionsResponse } = args;

  http.route({
    path: INTERNAL_STAGING_MCP_CANARY_ENDPOINT_PATH,
    method: "OPTIONS",
    handler: httpAction(async (_ctx, req) => optionsResponse(req)),
  });

  http.route({
    path: INTERNAL_STAGING_MCP_CANARY_ENDPOINT_PATH,
    method: "POST",
    handler: httpAction(async (_ctx, req) => {
      if (!isStagingCanaryEnabled()) {
        return jsonRpcResponse(404, {
          ok: false,
          code: "staging_mcp_canary_disabled",
        });
      }

      const body = await readMcpRequest(req);
      const id = body.id ?? null;
      const method = String(body.method ?? "").trim();

      if (method === "initialize") {
        return jsonRpcResponse(
          200,
          {
            jsonrpc: "2.0",
            id,
            result: {
              protocolVersion: CANARY_PROTOCOL_VERSION,
              capabilities: {
                tools: {},
              },
              serverInfo: {
                name: "polynet-staging-mcp-canary",
                version: "0.1.0",
              },
            },
          },
          CANARY_SESSION_ID,
        );
      }

      if (method === "notifications/initialized") {
        return jsonRpcResponse(202, {
          jsonrpc: "2.0",
          result: {},
        });
      }

      if (method === "tools/list") {
        return jsonRpcResponse(200, {
          jsonrpc: "2.0",
          id,
          result: {
            tools: [
              {
                name: CANARY_TOOL_NAME,
                description:
                  "Read deterministic staging evidence for the PolyNet mounted MCP bridge canary.",
                inputSchema: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    marker: {
                      type: "string",
                    },
                  },
                },
              },
            ],
          },
        });
      }

      if (method === "tools/call") {
        const params = body.params;
        const record =
          params && typeof params === "object" && !Array.isArray(params)
            ? (params as Record<string, unknown>)
            : {};
        const name = String(record.name ?? "").trim();
        if (name !== CANARY_TOOL_NAME) {
          return jsonRpcError(id, -32601, "staging_mcp_canary_tool_not_found");
        }
        return jsonRpcResponse(200, {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  ok: true,
                  canary: "polynet_staging_mounted_mcp",
                  tool: CANARY_TOOL_NAME,
                  marker:
                    record.arguments &&
                    typeof record.arguments === "object" &&
                    !Array.isArray(record.arguments)
                      ? String((record.arguments as Record<string, unknown>).marker ?? "")
                      : "",
                }),
              },
            ],
          },
        });
      }

      return jsonRpcError(id, -32601, "staging_mcp_canary_method_not_found");
    }),
  });
}

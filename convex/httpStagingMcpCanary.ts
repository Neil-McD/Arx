import type { PublicHttpAction } from "convex/server";
import {
  POLYNET_MCP_COMPAT_PROTOCOL_VERSION,
  POLYNET_MCP_PROTOCOL_VERSION,
} from "../shared/polynetMcp";

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

type RegisterStagingMcpCanaryRoutesArgs = {
  http: HttpRouterLike;
  httpAction: HttpActionLike;
  jsonResponse: JsonResponseFn;
  optionsResponse: (req: Request) => Response;
};

type JsonRpcRequest = {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
};

const CANARY_TOOL = {
  name: "read_canary_record",
  title: "Read PolyNet Staging Canary Record",
  description:
    "Read a staging-only PolyNet MCP canary record proving mounted MCP tool execution reached the canary server.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {},
  },
  annotations: {
    title: "Read PolyNet Staging Canary Record",
    readOnlyHint: true,
    idempotentHint: true,
    destructiveHint: false,
    openWorldHint: false,
  },
} as const;

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

function normalizeDeploymentKind(value: string): "staging" | "production" | "development" | "unknown" {
  const normalized = value.trim().toLowerCase();
  if (normalized === "staging") return "staging";
  if (normalized === "production" || normalized === "prod") return "production";
  if (normalized === "development" || normalized === "dev" || normalized === "local") return "development";
  return "unknown";
}

function isStagingDeployment(): boolean {
  return normalizeDeploymentKind(readEnv("POLYNET_DEPLOYMENT_KIND")) === "staging";
}

async function readJsonRpcRequest(req: Request): Promise<JsonRpcRequest> {
  const raw = await req.text();
  if (!raw.trim()) throw new Error("empty_body");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("invalid_request");
  }
  return parsed as JsonRpcRequest;
}

function jsonRpcResult(id: unknown, result: unknown) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    result,
  };
}

function jsonRpcError(id: unknown, code: number, message: string) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: {
      code,
      message,
    },
  };
}

function buildCanaryRecord(req: Request) {
  return {
    ok: true,
    canary: "polynet_staging_mcp_canary",
    deployment_kind: "staging",
    endpoint_path: new URL(req.url).pathname,
    protocol_versions: [POLYNET_MCP_PROTOCOL_VERSION, POLYNET_MCP_COMPAT_PROTOCOL_VERSION],
    checked_at_ms: Date.now(),
  };
}

async function handleCanaryPost(req: Request, jsonResponse: JsonResponseFn): Promise<Response> {
  if (!isStagingDeployment()) {
    return jsonResponse(req, 404, {
      ok: false,
      code: "staging_mcp_canary_unavailable",
      error: "staging_mcp_canary_unavailable",
      message: "The staging MCP canary is only available on staging deployments.",
    });
  }

  let message: JsonRpcRequest;
  try {
    message = await readJsonRpcRequest(req);
  } catch {
    return jsonResponse(req, 400, jsonRpcError(null, -32700, "Invalid JSON-RPC request."));
  }

  const id = Object.prototype.hasOwnProperty.call(message, "id") ? message.id : null;
  const method = typeof message.method === "string" ? message.method.trim() : "";
  const params =
    message.params && typeof message.params === "object" && !Array.isArray(message.params)
      ? (message.params as Record<string, unknown>)
      : {};

  if (message.jsonrpc !== "2.0" || !method) {
    return jsonResponse(req, 400, jsonRpcError(id, -32600, "Invalid Request"));
  }

  if (method === "initialize") {
    const requestedVersion =
      typeof params.protocolVersion === "string" && params.protocolVersion.trim()
        ? params.protocolVersion.trim()
        : POLYNET_MCP_PROTOCOL_VERSION;
    return jsonResponse(
      req,
      200,
      jsonRpcResult(id, {
        protocolVersion:
          requestedVersion === POLYNET_MCP_COMPAT_PROTOCOL_VERSION
            ? POLYNET_MCP_COMPAT_PROTOCOL_VERSION
            : POLYNET_MCP_PROTOCOL_VERSION,
        capabilities: {
          tools: {
            listChanged: false,
          },
        },
        serverInfo: {
          name: "polynet-staging-mcp-canary",
          version: "1.0.0",
        },
      }),
    );
  }

  if (method === "notifications/initialized") {
    return new Response(null, { status: 202 });
  }

  if (method === "tools/list") {
    return jsonResponse(req, 200, jsonRpcResult(id, { tools: [CANARY_TOOL] }));
  }

  if (method === "tools/call") {
    const name = typeof params.name === "string" ? params.name.trim() : "";
    if (name !== CANARY_TOOL.name) {
      return jsonResponse(req, 200, jsonRpcError(id, -32602, "Unknown canary tool."));
    }
    const result = {
      content: [
        {
          type: "text",
          text: JSON.stringify(buildCanaryRecord(req)),
        },
      ],
      structuredContent: buildCanaryRecord(req),
      isError: false,
    };
    return jsonResponse(req, 200, jsonRpcResult(id, result));
  }

  return jsonResponse(req, 404, jsonRpcError(id, -32601, "Method not found."));
}

export function registerStagingMcpCanaryRoutes(args: RegisterStagingMcpCanaryRoutesArgs): void {
  const { http, httpAction, jsonResponse, optionsResponse } = args;

  http.route({
    path: "/staging/mcp_canary",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, req) => optionsResponse(req)),
  });

  http.route({
    path: "/staging/mcp_canary",
    method: "GET",
    handler: httpAction(async (_ctx, req) =>
      jsonResponse(req, isStagingDeployment() ? 405 : 404, {
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: isStagingDeployment()
            ? "GET stream not supported by this stateless staging MCP canary."
            : "The staging MCP canary is only available on staging deployments.",
        },
      }),
    ),
  });

  http.route({
    path: "/staging/mcp_canary",
    method: "POST",
    handler: httpAction(async (_ctx, req) => handleCanaryPost(req, jsonResponse)),
  });
}

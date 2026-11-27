import { MCP_SERVER_INSTRUCTIONS } from "../shared/aiPostingRules";
import type { PublicHttpAction } from "convex/server";
import {
  POLYNET_MCP_PROTOCOL_VERSION,
  POLYNET_MCP_SUPPORTED_PROTOCOL_VERSIONS,
  getPolynetMcpToolDefinition,
  getPolynetMcpToolDefinitions,
  isSupportedPolynetMcpProtocolVersion,
} from "../shared/polynetMcp";
import { executePolynetCanonicalTool } from "./polynetCanonicalExecutor.ts";
import { toolArgumentProblems } from "../shared/toolArgumentCheck.ts";
import { internal } from "./_generated/api";
import { acceptLiveAuthServerMetadata, authServerMetadataUrl } from "../shared/mcpAuthServerMetadata";
import { actionTool, actionToolDefinition, actionToolsFor, translateActionTool, type ActionToolRole } from "../shared/actionTools";
import {
  POLYNET_CANONICAL_TOOL_NAMES,
  type PolynetCanonicalToolName,
} from "../shared/polynetCanonicalToolContract.ts";

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

type RequireAuthenticatedActor = (
  ctx: unknown,
  req: Request,
) => Promise<
  | {
      ok: true;
      actor: {
        userId: string;
        dbUserId: any;
        authSubject: string;
        email: string | null;
        displayName: string | null;
        avatarUrl: string | null;
        aiApp?: string | null;
      };
    }
  | { ok: false; response: Response }
>;

type RegisterRuntimeMcpRoutesArgs = {
  http: HttpRouterLike;
  httpAction: HttpActionLike;
  jsonResponse: JsonResponseFn;
  optionsResponse: (req: Request) => Response;
  requireAuthenticatedActor: RequireAuthenticatedActor;
};

type JsonRpcRequest = {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
};

function readEnv(name: string): string {
  try {
    const value = (globalThis as any)?.process?.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch {
    // ignore env read failures
  }
  return "";
}

// Who Polynet says it is to an AI app (initialize): its name, version, icon
// and website, as both directories show it.
export const MCP_SERVER_INFO = {
  name: "polynet",
  title: "Polynet",
  version: "1.0.0",
  websiteUrl: "https://www.polynet.ai",
  icons: [{ src: "https://www.polynet.ai/icon-512.png", mimeType: "image/png", sizes: ["512x512"] }],
};

// AI apps that call from a browser, and the standard MCP test tool on its
// usual local address: let in by default (a missing Origin, as server-side
// connectors send, is always fine). More come from ARX_ALLOWED_MCP_ORIGINS.
export const DEFAULT_MCP_ORIGINS = ["https://claude.ai", "https://chatgpt.com", "http://localhost:6274", "http://127.0.0.1:6274"];

function buildAllowedMcpOrigins(): Set<string> {
  const out = new Set<string>(DEFAULT_MCP_ORIGINS);
  // MCP hosts are a different trust boundary than the Polynet SPA/web origins.
  // Remote MCP clients may also omit Origin entirely, so only validate the header
  // when it is present and compare it against the dedicated MCP allowlist.
  const rawList = readEnv("ARX_ALLOWED_MCP_ORIGINS");
  for (const raw of rawList.split(",")) {
    const value = raw.trim();
    if (!value) continue;
    try {
      out.add(new URL(value).origin);
    } catch {
      // ignore invalid origin entries
    }
  }
  return out;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function resolveRequestOrigin(req: Request): string | null {
  try {
    return new URL(req.url).origin;
  } catch {
    return null;
  }
}

function normalizeMcpResourceUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (parsed.pathname.replace(/\/+$/, "") !== "/runtime/mcp") return null;
    parsed.pathname = "/runtime/mcp";
    parsed.search = "";
    parsed.hash = "";
    return trimTrailingSlash(parsed.toString());
  } catch {
    return null;
  }
}

function resolveConfiguredMcpResourceUrl():
  | { ok: true; value: string | null }
  | { ok: false; message: string } {
  const explicit = readEnv("ARX_MCP_RESOURCE_URL");
  if (!explicit) return { ok: true, value: null };
  const normalized = normalizeMcpResourceUrl(explicit);
  if (!normalized) {
    return {
      ok: false,
      message: "ARX_MCP_RESOURCE_URL must be an absolute http(s) URL ending in /runtime/mcp.",
    };
  }
  return { ok: true, value: normalized };
}

function resolveRequestMcpServerUrl(req: Request): string | null {
  const origin = resolveRequestOrigin(req);
  return origin ? `${origin}/runtime/mcp` : null;
}

function buildProtectedResourceMetadataUrl(resourceServerUrl: string): string | null {
  try {
    const parsed = new URL(resourceServerUrl);
    parsed.pathname = "/.well-known/oauth-protected-resource";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function resolveOAuthIssuer(): string {
  return trimTrailingSlash(readEnv("ARX_AUTH_JWT_ISSUER"));
}

function resolveOAuthAuthorizeUrl(): string {
  return readEnv("ARX_AUTH_AUTHORIZE_URL");
}

function resolveOAuthTokenUrl(): string {
  return readEnv("ARX_AUTH_TOKEN_URL");
}

function resolveOAuthJwksUrl(): string {
  const explicit = readEnv("ARX_AUTH_JWT_JWKS_URL");
  if (explicit) return explicit;
  const issuer = resolveOAuthIssuer();
  return issuer ? `${issuer}/.well-known/jwks.json` : "";
}

function resolveOAuthRegistrationUrl(): string {
  return readEnv("ARX_AUTH_REGISTRATION_URL");
}

function resolveOAuthScopes(): string[] {
  const raw = readEnv("ARX_AUTH_SCOPE") || "openid profile email offline_access";
  return raw
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 32);
}

type McpResolvedAuthMetadata =
  | {
      ok: true;
      resourceServerUrl: string;
      protectedResourceMetadataUrl: string;
      issuer: string;
      authorizationEndpoint: string;
      tokenEndpoint: string;
      registrationEndpoint: string | null;
      jwksUri: string | null;
      scopesSupported: string[];
    }
  | {
      ok: false;
      message: string;
    };

function resolveMcpAuthMetadata(req: Request): McpResolvedAuthMetadata {
  const configuredResource = resolveConfiguredMcpResourceUrl();
  if (!configuredResource.ok) {
    return {
      ok: false,
      message: configuredResource.message,
    };
  }
  const resourceServerUrl = configuredResource.value ?? resolveRequestMcpServerUrl(req);
  const protectedResourceMetadataUrl = resourceServerUrl
    ? buildProtectedResourceMetadataUrl(resourceServerUrl)
    : null;
  const issuer = resolveOAuthIssuer();
  const authorizationEndpoint = resolveOAuthAuthorizeUrl();
  const tokenEndpoint = resolveOAuthTokenUrl();
  const registrationEndpoint = resolveOAuthRegistrationUrl();
  const jwksUri = resolveOAuthJwksUrl();
  const scopesSupported = resolveOAuthScopes();

  if (!resourceServerUrl || !protectedResourceMetadataUrl) {
    return {
      ok: false,
      message: "MCP auth metadata is unavailable for this request origin.",
    };
  }
  if (!issuer || !authorizationEndpoint || !tokenEndpoint) {
    return {
      ok: false,
      message: "MCP auth metadata is not configured.",
    };
  }

  return {
    ok: true,
    resourceServerUrl,
    protectedResourceMetadataUrl,
    issuer,
    authorizationEndpoint,
    tokenEndpoint,
    registrationEndpoint: registrationEndpoint || null,
    jwksUri: jwksUri || null,
    scopesSupported,
  };
}

function validateMcpOrigin(req: Request): { ok: true } | { ok: false; response: Response } {
  const rawOrigin = String(req.headers.get("origin") ?? "").trim();
  if (!rawOrigin) return { ok: true };
  let parsedOrigin: string;
  try {
    parsedOrigin = new URL(rawOrigin).origin;
  } catch {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32003,
            message: "Forbidden origin.",
          },
        }),
        {
          status: 403,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          },
        },
      ),
    };
  }
  const allowedOrigins = buildAllowedMcpOrigins();
  if (!allowedOrigins.has(parsedOrigin)) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32003,
            message: "Forbidden origin.",
          },
        }),
        {
          status: 403,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          },
        },
      ),
    };
  }
  return { ok: true };
}

function normalizeString(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

function asJsonRpcId(id: unknown): string | number | null {
  if (typeof id === "string") return id;
  if (typeof id === "number" && Number.isFinite(id)) return id;
  return null;
}

function jsonRpcErrorResponse(
  req: Request,
  jsonResponse: JsonResponseFn,
  id: string | number | null,
  code: number,
  message: string,
  data?: Record<string, unknown>,
  status = 200,
): Response {
  return jsonResponse(req, status, {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      ...(data ? { data } : null),
    },
  });
}

function jsonRpcResultResponse(
  req: Request,
  jsonResponse: JsonResponseFn,
  id: string | number,
  result: Record<string, unknown>,
  headers?: HeadersInit,
): Response {
  const response = jsonResponse(req, 200, {
    jsonrpc: "2.0",
    id,
    result,
  });
  if (!headers) return response;
  const nextHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(headers)) {
    nextHeaders.set(key, String(value));
  }
  return new Response(response.body, {
    status: response.status,
    headers: nextHeaders,
  });
}

function mcpUnauthorizedResponse(
  req: Request,
  jsonResponse: JsonResponseFn,
  errorDescription: string,
): Response {
  const authMetadata = resolveMcpAuthMetadata(req);
  if (!authMetadata.ok) {
    return jsonResponse(req, 503, {
      error: "auth_server_metadata_unavailable",
      error_description: authMetadata.message,
    });
  }

  const template = jsonResponse(req, 401, {
    error: "invalid_token",
    error_description: errorDescription,
  });
  const headers = new Headers(template.headers);
  headers.set(
    "WWW-Authenticate",
    [
      'Bearer error="invalid_token"',
      `error_description="${errorDescription.replace(/["\\]/g, "")}"`,
      `resource_metadata="${authMetadata.protectedResourceMetadataUrl}"`,
    ].join(", "),
  );
  return new Response(template.body, {
    status: 401,
    headers,
  });
}

function emptyAcceptedResponse(req: Request, jsonResponse: JsonResponseFn): Response {
  const template = jsonResponse(req, 202, {});
  return new Response(null, {
    status: 202,
    headers: template.headers,
  });
}

function buildToolTextContent(payload: Record<string, unknown>): Array<{ type: "text"; text: string }> {
  return [
    {
      type: "text",
      text: JSON.stringify(payload),
    },
  ];
}

// What an outside AI is answered: the result, without Polynet's own
// bookkeeping (the receipt's contract, lane, relation and ids), which it
// repeated back to people as if it meant something. A retry is still said:
// already_done.
export function forOutsideAi(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const { receipt, ...rest } = value as Record<string, unknown>;
  const deduped = receipt && typeof receipt === "object" && (receipt as Record<string, unknown>).deduped === true;
  return { ...rest, ...(deduped ? { already_done: true } : {}) };
}

// Runs one tool for the person the door verified; tools/call has already
// checked the tool is offered and its arguments fit.
export async function handleToolCall(args: {
  ctx: any;
  authSubject: string;
  actor: {
    dbUserId: any;
    // Which AI app it is, by name, for the Yes/No card Polynet shows.
    aiApp?: string | null;
  };
  toolName: string;
  toolArgs: Record<string, unknown>;
}): Promise<{ ok: true; result: Record<string, unknown> }
  | { ok: false; type: "tool"; message: string; code?: string; details?: Record<string, unknown> }
  | { ok: false; type: "protocol"; message: string }> {
  const { ctx, authSubject, actor, toolName, toolArgs } = args;

  if (
    (POLYNET_CANONICAL_TOOL_NAMES as readonly string[]).includes(toolName)
  ) {
    // Every signed-in person: the door gives each community's caller the lens
    // their role there allows (member, moderator, builder) and refuses the rest.
    const execution = await executePolynetCanonicalTool({
      ctx,
      authSubject,
      userId: String(actor.dbUserId),
      principalKind: "external_mcp",
      evidenceSurface: "external_mcp",
      toolName: toolName as PolynetCanonicalToolName,
      input: toolArgs,
      ownAiApp: actor.aiApp ?? null,
    });
    if (!execution.ok) {
      // The code and any machine-readable details (retry_after_ms, ...) travel
      // with the message, so a client can back off without parsing text.
      const details = execution.value && typeof execution.value === "object" && !Array.isArray(execution.value)
        ? execution.value as Record<string, unknown> : undefined;
      return {
        ok: false,
        type: "tool",
        message: `${execution.code}: ${execution.message}`,
        code: execution.code,
        ...(details ? { details } : {}),
      };
    }
    const structuredContent = forOutsideAi(execution.value) as Record<string, unknown>;
    return {
      ok: true,
      result: {
        content: buildToolTextContent(structuredContent),
        structuredContent,
        isError: false,
      },
    };
  }

  // tools/list and tools/call share one exact public contract. Legacy names are
  // not hidden aliases: direct invocation must fail as an unknown tool.
  return {
    ok: false,
    type: "protocol",
    message: "Unknown tool.",
  };

}

export async function handleMcpPost(args: {
  ctx: any;
  req: Request;
  jsonResponse: JsonResponseFn;
  requireAuthenticatedActor: RequireAuthenticatedActor;
}): Promise<Response> {
  const { ctx, req, jsonResponse, requireAuthenticatedActor } = args;
  const originCheck = validateMcpOrigin(req);
  if (!originCheck.ok) return originCheck.response;

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonRpcErrorResponse(req, jsonResponse, null, -32700, "Parse error.", undefined, 400);
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return jsonRpcErrorResponse(req, jsonResponse, null, -32600, "Invalid Request.", undefined, 400);
  }

  const message = payload as JsonRpcRequest;
  const id = asJsonRpcId(message.id);
  const method = normalizeString(message.method, 120);
  if (message.jsonrpc !== "2.0" || !method) {
    return jsonRpcErrorResponse(req, jsonResponse, id, -32600, "Invalid Request.", undefined, 400);
  }

  const protocolHeader = normalizeString(
    req.headers.get("MCP-Protocol-Version") ?? req.headers.get("mcp-protocol-version"),
    32,
  );
  if (protocolHeader && !isSupportedPolynetMcpProtocolVersion(protocolHeader)) {
    return jsonRpcErrorResponse(
      req,
      jsonResponse,
      id,
      -32602,
      "Unsupported protocol version.",
      {
        requested: protocolHeader,
        supported: POLYNET_MCP_SUPPORTED_PROTOCOL_VERSIONS,
      },
      400,
    );
  }

  if (method.startsWith("notifications/")) {
    return emptyAcceptedResponse(req, jsonResponse);
  }

  if (method === "ping") {
    if (id === null) {
      return jsonRpcErrorResponse(req, jsonResponse, null, -32600, "Invalid Request.");
    }
    return jsonRpcResultResponse(req, jsonResponse, id, {});
  }

  const auth = await requireAuthenticatedActor(ctx, req);
  if (!auth.ok) {
    return mcpUnauthorizedResponse(
      req,
      jsonResponse,
      "Authorization required to connect to Polynet MCP.",
    );
  }
  const actor = auth.actor;

  if (method === "initialize") {
    const params =
      message.params && typeof message.params === "object" && !Array.isArray(message.params)
        ? (message.params as Record<string, unknown>)
        : {};
    const requestedVersion = normalizeString(params.protocolVersion, 32);
    // Which AI app connected and what it says it supports: its name and
    // version, the revision it asked for and the names of its capabilities.
    // Nothing about the person or what they do.
    const clientInfo = params.clientInfo && typeof params.clientInfo === "object" ? params.clientInfo as Record<string, unknown> : {};
    const clientCapabilities = params.capabilities && typeof params.capabilities === "object" ? params.capabilities as Record<string, unknown> : {};
    const elicitation = clientCapabilities.elicitation && typeof clientCapabilities.elicitation === "object" ? clientCapabilities.elicitation as Record<string, unknown> : null;
    console.log(JSON.stringify({
      event: "mcp_client_connected",
      client: normalizeString(clientInfo.name, 80) ?? null,
      client_version: normalizeString(clientInfo.version, 40) ?? null,
      requested_version: requestedVersion ?? null,
      supported: !requestedVersion || isSupportedPolynetMcpProtocolVersion(requestedVersion),
      capabilities: Object.keys(clientCapabilities).slice(0, 12).map((key) => key.slice(0, 40)),
      asks_person: elicitation ? (Object.keys(elicitation).length ? Object.keys(elicitation).slice(0, 4) : ["form"]) : [],
    }));
    if (requestedVersion && !isSupportedPolynetMcpProtocolVersion(requestedVersion)) {
      return jsonRpcErrorResponse(
        req,
        jsonResponse,
        id,
        -32602,
        "Unsupported protocol version.",
        {
          requested: requestedVersion,
          supported: POLYNET_MCP_SUPPORTED_PROTOCOL_VERSIONS,
        },
      );
    }
    if (id === null) {
      return jsonRpcErrorResponse(req, jsonResponse, null, -32600, "Invalid Request.");
    }
    const negotiatedVersion = requestedVersion ?? protocolHeader ?? POLYNET_MCP_PROTOCOL_VERSION;
    return jsonRpcResultResponse(
      req,
      jsonResponse,
      id,
      {
        protocolVersion: negotiatedVersion,
        capabilities: {
          tools: {},
        },
        serverInfo: MCP_SERVER_INFO,
        instructions: MCP_SERVER_INSTRUCTIONS,
      },
      {
        "MCP-Protocol-Version": negotiatedVersion,
      },
    );
  }

  if (method === "tools/list") {
    if (id === null) {
      return jsonRpcErrorResponse(req, jsonResponse, null, -32600, "Invalid Request.");
    }
    // Reading is three general tools; each action is its own named tool
    // (shared/actionTools.ts), the ones this person can use somewhere.
    const role = (await ctx.runQuery((internal as any).mcpActionTools.highestRoleInternal, { userId: actor.dbUserId })
      .catch(() => "member")) as ActionToolRole;
    return jsonRpcResultResponse(req, jsonResponse, id, {
      tools: [
        ...getPolynetMcpToolDefinitions().filter((tool) => tool.annotations.readOnlyHint === true),
        ...actionToolsFor(role, "own_ai").map(actionToolDefinition),
      ],
    });
  }

  if (method === "tools/call") {
    if (id === null) {
      return jsonRpcErrorResponse(req, jsonResponse, null, -32600, "Invalid Request.");
    }
    const params =
      message.params && typeof message.params === "object" && !Array.isArray(message.params)
        ? (message.params as Record<string, unknown>)
        : {};
    const toolName = normalizeString(params.name, 120);
    if (!toolName) {
      return jsonRpcErrorResponse(req, jsonResponse, id, -32602, "Tool name is required.");
    }
    // The guide's own tools (remembering, removing after a yes) are not a
    // person's own AI's. Of the general tools, only reading is offered: the
    // generic polynet_write and polynet_call are not, so every action goes
    // through its own named tool, its description and its labels.
    const named = actionTool(toolName)?.door === "guide" ? null : actionTool(toolName);
    const reading = getPolynetMcpToolDefinition(toolName);
    const definition = named ? actionToolDefinition(named) : reading?.annotations?.readOnlyHint === true ? reading : null;
    if (!definition) {
      return jsonRpcErrorResponse(req, jsonResponse, id, -32601, "Tool not found.");
    }
    const givenArgs =
      params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments)
        ? (params.arguments as Record<string, unknown>)
        : {};
    // What was sent must fit the tool's published shape: a misspelled or
    // unknown field is refused with where and what, never dropped silently.
    const problems = toolArgumentProblems(definition.inputSchema, givenArgs);
    if (problems.length) {
      const error = { error: `invalid_tool_args: ${problems.join("; ")}`, code: "invalid_tool_args", problems };
      return jsonRpcResultResponse(req, jsonResponse, id, { content: buildToolTextContent(error), structuredContent: error, isError: true });
    }
    // A named tool is the same call the executor already runs, written out.
    const translated = named ? translateActionTool(named, givenArgs, Date.now()) : null;
    const result = await handleToolCall({
      ctx,
      authSubject: actor.authSubject,
      actor: { dbUserId: actor.dbUserId, aiApp: actor.aiApp ?? null },
      toolName: translated ? translated.toolName : toolName,
      toolArgs: translated ? translated.input : givenArgs,
    });
    if (!result.ok && result.type === "protocol") {
      return jsonRpcErrorResponse(req, jsonResponse, id, -32601, result.message);
    }
    if (!result.ok) {
      const error = { error: result.message, ...(result.code ? { code: result.code } : {}), ...(result.details ?? {}) };
      const toolResult = {
        content: buildToolTextContent(error),
        structuredContent: error,
        isError: true,
      };
      return jsonRpcResultResponse(req, jsonResponse, id, toolResult);
    }
    return jsonRpcResultResponse(req, jsonResponse, id, result.result);
  }

  return jsonRpcErrorResponse(req, jsonResponse, id, -32601, "Method not found.");
}

// WorkOS AuthKit's live sign-in settings, kept for ten minutes. Read with a
// short timeout; any failure means Polynet's own copy is published instead.
const LIVE_AUTH_METADATA_TTL_MS = 10 * 60_000;
let liveAuthMetadataCache: { issuer: string; at: number; value: Record<string, unknown> } | null = null;
async function readLiveAuthServerMetadata(issuer: string): Promise<Record<string, unknown> | null> {
  const now = Date.now();
  if (liveAuthMetadataCache && liveAuthMetadataCache.issuer === issuer && now - liveAuthMetadataCache.at < LIVE_AUTH_METADATA_TTL_MS) {
    return liveAuthMetadataCache.value;
  }
  try {
    const response = await fetch(authServerMetadataUrl(issuer), { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(2500) });
    if (!response.ok) return null;
    const accepted = acceptLiveAuthServerMetadata(await response.json(), issuer);
    if (accepted) liveAuthMetadataCache = { issuer, at: now, value: accepted };
    return accepted;
  } catch {
    return null;
  }
}

export function registerRuntimeMcpRoutes(args: RegisterRuntimeMcpRoutesArgs): void {
  const { http, httpAction, jsonResponse, optionsResponse, requireAuthenticatedActor } = args;

  // Where to sign in for the MCP address: at the general address and at the
  // one some AI apps look up first (with the MCP path on the end).
  const protectedResourceHandler = httpAction(async (_ctx, req) => {
      const authMetadata = resolveMcpAuthMetadata(req);
      if (!authMetadata.ok) {
        return jsonResponse(req, 503, {
          error: "auth_server_metadata_unavailable",
          error_description: authMetadata.message,
        });
      }
      return jsonResponse(req, 200, {
        resource: authMetadata.resourceServerUrl,
        authorization_servers: [authMetadata.issuer],
        bearer_methods_supported: ["header"],
        scopes_supported: authMetadata.scopesSupported,
      });
  });
  for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/runtime/mcp"]) {
    http.route({ path, method: "GET", handler: protectedResourceHandler });
  }

  http.route({
    path: "/.well-known/oauth-authorization-server",
    method: "GET",
    handler: httpAction(async (_ctx, req) => {
      const authMetadata = resolveMcpAuthMetadata(req);
      if (!authMetadata.ok) {
        return jsonResponse(req, 503, {
          error: "auth_server_metadata_unavailable",
          error_description: authMetadata.message,
        });
      }
      // AuthKit's own live settings, as they are; Polynet's basic copy if they
      // can't be read (shared/mcpAuthServerMetadata.ts).
      const live = await readLiveAuthServerMetadata(authMetadata.issuer);
      if (live) return jsonResponse(req, 200, live);
      return jsonResponse(req, 200, {
        issuer: authMetadata.issuer,
        authorization_endpoint: authMetadata.authorizationEndpoint,
        token_endpoint: authMetadata.tokenEndpoint,
        ...(authMetadata.registrationEndpoint
          ? { registration_endpoint: authMetadata.registrationEndpoint }
          : null),
        ...(authMetadata.jwksUri ? { jwks_uri: authMetadata.jwksUri } : null),
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
        scopes_supported: authMetadata.scopesSupported,
      });
    }),
  });

  http.route({
    path: "/runtime/mcp",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, req) => {
      const originCheck = validateMcpOrigin(req);
      if (!originCheck.ok) return originCheck.response;
      return optionsResponse(req);
    }),
  });

  http.route({
    path: "/runtime/mcp",
    method: "GET",
    handler: httpAction(async (_ctx, req) => {
      const originCheck = validateMcpOrigin(req);
      if (!originCheck.ok) return originCheck.response;
      return jsonResponse(req, 405, {
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "GET stream not supported by this stateless MCP endpoint.",
        },
      });
    }),
  });

  http.route({
    path: "/runtime/mcp",
    method: "DELETE",
    handler: httpAction(async (_ctx, req) => {
      const originCheck = validateMcpOrigin(req);
      if (!originCheck.ok) return originCheck.response;
      return jsonResponse(req, 405, {
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Session deletion is not supported by this stateless MCP endpoint.",
        },
      });
    }),
  });

  http.route({
    path: "/runtime/mcp",
    method: "POST",
    handler: httpAction(async (ctx, req) =>
      handleMcpPost({
        ctx,
        req,
        jsonResponse,
        // Only a token minted for this door, checked by the door itself
        // (convex/http.ts requireMcpActor, shared/mcpAccessToken.ts).
        requireAuthenticatedActor,
      })),
  });
}

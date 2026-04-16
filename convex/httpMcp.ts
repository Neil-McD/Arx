import { api, internal } from "./_generated/api";
import type { PublicHttpAction } from "convex/server";
import {
  POLYNET_MCP_COMPAT_PROTOCOL_VERSION,
  POLYNET_MCP_PROTOCOL_VERSION,
  getPolynetMcpToolDefinition,
  getPolynetMcpToolDefinitions,
} from "../shared/polynetMcp";
import { normalizeSlug } from "./communityCore";

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

type CommunityMembershipProjection = {
  community_id: string;
  role: string;
  communities: {
    slug?: string | null;
    name?: string | null;
    one_liner?: string | null;
    about?: string | null;
    visibility?: string | null;
    entry_policy?: string | null;
  };
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

function buildAllowedMcpOrigins(): Set<string> {
  const out = new Set<string>();
  // MCP hosts are a different trust boundary than the PolyNet SPA/web origins.
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

function emptyAcceptedResponse(req: Request, jsonResponse: JsonResponseFn): Response {
  const template = jsonResponse(req, 202, {});
  return new Response(null, {
    status: 202,
    headers: template.headers,
  });
}

function sanitizeCommunitySummary(row: CommunityMembershipProjection) {
  return {
    slug: String(row.communities?.slug ?? "").trim(),
    name: String(row.communities?.name ?? "").trim() || "Community",
    one_liner: normalizeString(row.communities?.one_liner, 280),
    visibility:
      String(row.communities?.visibility ?? "").trim().toLowerCase() === "published"
        ? "published"
        : "unlisted",
    entry_policy:
      String(row.communities?.entry_policy ?? "").trim().toLowerCase() === "paid_subscription"
        ? "paid_subscription"
        : String(row.communities?.entry_policy ?? "").trim().toLowerCase() === "approval"
          ? "approval"
          : "open",
    relation:
      normalizeString(row.role, 32)?.toLowerCase() === "owner"
        ? "owner"
        : normalizeString(row.role, 32)?.toLowerCase() === "admin"
          ? "admin"
          : normalizeString(row.role, 32)?.toLowerCase() === "moderator"
            ? "moderator"
            : "member",
  };
}

function sanitizeCommunitySearchItem(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const snippet = normalizeString(row.snippet, 4000);
  if (!snippet) return null;
  const sourceType = normalizeString(row.source_type, 32)?.toLowerCase();
  return {
    source_type:
      sourceType === "chat" || sourceType === "ai_feed" || sourceType === "resource"
        ? sourceType
        : "resource",
    title: normalizeString(row.title, 180),
    snippet,
    created_at: normalizeString(row.created_at, 64),
    score: typeof row.score === "number" && Number.isFinite(row.score) ? row.score : null,
    author_label: normalizeString(row.author_label, 180),
    url: normalizeString(row.url, 2048),
    post_type: normalizeString(row.post_type, 32),
    resource_type: normalizeString(row.resource_type, 64),
  };
}

function buildToolTextContent(payload: Record<string, unknown>): Array<{ type: "text"; text: string }> {
  return [
    {
      type: "text",
      text: JSON.stringify(payload),
    },
  ];
}

async function listAccessibleCommunities(ctx: any, authSubject: string): Promise<CommunityMembershipProjection[]> {
  const rows = (await ctx.runQuery(api.community.listCommunityMemberships as any, {
    authSubject,
    selectMode: "full",
  })) as CommunityMembershipProjection[];
  return rows.filter((row) => normalizeString(row.communities?.slug, 160));
}

function findCommunityBySlug(
  rows: CommunityMembershipProjection[],
  communitySlug: string,
): CommunityMembershipProjection | null {
  const normalized = normalizeSlug(communitySlug);
  if (!normalized) return null;
  return (
    rows.find((row) => normalizeSlug(row.communities?.slug) === normalized) ??
    null
  );
}

async function handleToolCall(args: {
  ctx: any;
  authSubject: string;
  actor: {
    dbUserId: any;
  };
  toolName: string;
  toolArgs: Record<string, unknown>;
}): Promise<{ ok: true; result: Record<string, unknown> } | { ok: false; type: "tool"; message: string } | { ok: false; type: "protocol"; message: string }> {
  const { ctx, authSubject, actor, toolName, toolArgs } = args;

  if (toolName === "polynet_list_communities") {
    const rows = await listAccessibleCommunities(ctx, authSubject);
    const communities = rows.map(sanitizeCommunitySummary);
    return {
      ok: true,
      result: {
        content: buildToolTextContent({ communities }),
        structuredContent: { communities },
        isError: false,
      },
    };
  }

  if (toolName === "polynet_get_community") {
    const communitySlug = normalizeString(toolArgs.community_slug, 160);
    if (!communitySlug) {
      return { ok: false, type: "tool", message: "community_slug is required." };
    }
    const rows = await listAccessibleCommunities(ctx, authSubject);
    const row = findCommunityBySlug(rows, communitySlug);
    if (!row) {
      return { ok: false, type: "tool", message: "Community not found or not accessible." };
    }
    const access = (await ctx.runQuery(api.community.getMyCommunityAccessBySlug as any, {
      authSubject,
      communitySlug,
    })) as Record<string, unknown> | null;
    if (!access) {
      return { ok: false, type: "tool", message: "Community access could not be resolved." };
    }
    const community = {
      slug: String(row.communities?.slug ?? "").trim(),
      name: String(row.communities?.name ?? "").trim() || "Community",
      one_liner: normalizeString(row.communities?.one_liner, 280),
      about: normalizeString(row.communities?.about, 4000),
      visibility:
        String(row.communities?.visibility ?? "").trim().toLowerCase() === "published"
          ? "published"
          : "unlisted",
      entry_policy:
        String(row.communities?.entry_policy ?? "").trim().toLowerCase() === "paid_subscription"
          ? "paid_subscription"
          : String(row.communities?.entry_policy ?? "").trim().toLowerCase() === "approval"
            ? "approval"
            : "open",
      relation: normalizeString(access.relation, 32) ?? "member",
      is_entitled: access.is_entitled === true,
      capabilities: {
        can_view: access.can_view === true,
        can_enter_community: access.can_enter_community === true,
        can_read_chat: access.can_read_chat === true,
        can_post_chat: access.can_post_chat === true,
        can_post_message: access.can_post_message === true,
        can_manage_resources: access.can_manage_resources === true,
        can_manage_members: access.can_manage_members === true,
        can_review_join_requests: access.can_review_join_requests === true,
      },
    };
    return {
      ok: true,
      result: {
        content: buildToolTextContent({ community }),
        structuredContent: { community },
        isError: false,
      },
    };
  }

  if (toolName === "polynet_community_search") {
    const communitySlug = normalizeString(toolArgs.community_slug, 160);
    const query = normalizeString(toolArgs.query, 240);
    if (!communitySlug || !query) {
      return { ok: false, type: "tool", message: "community_slug and query are required." };
    }
    const rows = await listAccessibleCommunities(ctx, authSubject);
    const row = findCommunityBySlug(rows, communitySlug);
    if (!row) {
      return { ok: false, type: "tool", message: "Community not found or not accessible." };
    }
    const raw = (await ctx.runAction(
      internal.communityArchive.searchCommunityKnowledgeInternal as any,
      {
        userId: actor.dbUserId,
        authSubject,
        communityId: row.community_id,
        query,
      },
    )) as Record<string, unknown> | null;
    if (!raw || typeof raw !== "object") {
      return { ok: false, type: "tool", message: "Community search failed." };
    }
    const recentContext = Array.isArray(raw.recent_context)
      ? raw.recent_context.map(sanitizeCommunitySearchItem).filter(Boolean)
      : [];
    const archiveContext = Array.isArray(raw.archive_context)
      ? raw.archive_context.map(sanitizeCommunitySearchItem).filter(Boolean)
      : [];
    const structuredContent = {
      community: {
        slug: String(row.communities?.slug ?? "").trim(),
        name: String(row.communities?.name ?? "").trim() || "Community",
      },
      query,
      identity:
        raw.identity && typeof raw.identity === "object"
          ? {
              name: normalizeString((raw.identity as Record<string, unknown>).name, 180),
              slug: normalizeString((raw.identity as Record<string, unknown>).slug, 160),
              one_liner: normalizeString((raw.identity as Record<string, unknown>).one_liner, 280),
              about: normalizeString((raw.identity as Record<string, unknown>).about, 4000),
            }
          : null,
      recent_context: recentContext,
      archive_context: archiveContext,
      source_counts:
        raw.source_counts && typeof raw.source_counts === "object"
          ? raw.source_counts
          : null,
      archive_source_counts:
        raw.archive_source_counts && typeof raw.archive_source_counts === "object"
          ? raw.archive_source_counts
          : null,
    };
    return {
      ok: true,
      result: {
        content: buildToolTextContent(structuredContent),
        structuredContent,
        isError: false,
      },
    };
  }

  return {
    ok: false,
    type: "protocol",
    message: "Unknown tool.",
  };
}

async function handleMcpPost(args: {
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
  if (
    protocolHeader &&
    protocolHeader !== POLYNET_MCP_PROTOCOL_VERSION &&
    protocolHeader !== POLYNET_MCP_COMPAT_PROTOCOL_VERSION
  ) {
    return jsonRpcErrorResponse(
      req,
      jsonResponse,
      id,
      -32602,
      "Unsupported protocol version.",
      {
        requested: protocolHeader,
        supported: [POLYNET_MCP_PROTOCOL_VERSION, POLYNET_MCP_COMPAT_PROTOCOL_VERSION],
      },
      400,
    );
  }

  if (method.startsWith("notifications/")) {
    return emptyAcceptedResponse(req, jsonResponse);
  }

  if (method === "initialize") {
    const params =
      message.params && typeof message.params === "object" && !Array.isArray(message.params)
        ? (message.params as Record<string, unknown>)
        : {};
    const requestedVersion = normalizeString(params.protocolVersion, 32);
    if (
      requestedVersion &&
      requestedVersion !== POLYNET_MCP_PROTOCOL_VERSION &&
      requestedVersion !== POLYNET_MCP_COMPAT_PROTOCOL_VERSION
    ) {
      return jsonRpcErrorResponse(
        req,
        jsonResponse,
        id,
        -32602,
        "Unsupported protocol version.",
        {
          requested: requestedVersion,
          supported: [POLYNET_MCP_PROTOCOL_VERSION, POLYNET_MCP_COMPAT_PROTOCOL_VERSION],
        },
      );
    }
    if (id === null) {
      return jsonRpcErrorResponse(req, jsonResponse, null, -32600, "Invalid Request.");
    }
    return jsonRpcResultResponse(
      req,
      jsonResponse,
      id,
      {
        protocolVersion: requestedVersion ?? POLYNET_MCP_PROTOCOL_VERSION,
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: "polynet-mcp",
          version: "0.1.0-alpha",
        },
        instructions:
          "PolyNet MCP alpha exposes read-only community discovery and search tools over remote HTTP. Tool discovery is public; tool calls require PolyNet authentication.",
      },
      {
        "MCP-Protocol-Version": requestedVersion ?? POLYNET_MCP_PROTOCOL_VERSION,
      },
    );
  }

  if (method === "ping") {
    if (id === null) {
      return jsonRpcErrorResponse(req, jsonResponse, null, -32600, "Invalid Request.");
    }
    return jsonRpcResultResponse(req, jsonResponse, id, {});
  }

  if (method === "tools/list") {
    if (id === null) {
      return jsonRpcErrorResponse(req, jsonResponse, null, -32600, "Invalid Request.");
    }
    return jsonRpcResultResponse(req, jsonResponse, id, {
      tools: getPolynetMcpToolDefinitions(),
    });
  }

  if (method === "tools/call") {
    if (id === null) {
      return jsonRpcErrorResponse(req, jsonResponse, null, -32600, "Invalid Request.");
    }
    const auth = await requireAuthenticatedActor(ctx, req);
    if (!auth.ok) return auth.response;
    const actor = auth.actor;
    const params =
      message.params && typeof message.params === "object" && !Array.isArray(message.params)
        ? (message.params as Record<string, unknown>)
        : {};
    const toolName = normalizeString(params.name, 120);
    if (!toolName) {
      return jsonRpcErrorResponse(req, jsonResponse, id, -32602, "Tool name is required.");
    }
    if (!getPolynetMcpToolDefinition(toolName)) {
      return jsonRpcErrorResponse(req, jsonResponse, id, -32601, "Tool not found.");
    }
    const toolArgs =
      params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments)
        ? (params.arguments as Record<string, unknown>)
        : {};
    const result = await handleToolCall({
      ctx,
      authSubject: actor.authSubject,
      actor: { dbUserId: actor.dbUserId },
      toolName,
      toolArgs,
    });
    if (!result.ok && result.type === "protocol") {
      return jsonRpcErrorResponse(req, jsonResponse, id, -32601, result.message);
    }
    if (!result.ok) {
      const toolResult = {
        content: buildToolTextContent({ error: result.message }),
        structuredContent: { error: result.message },
        isError: true,
      };
      return jsonRpcResultResponse(req, jsonResponse, id, toolResult);
    }
    return jsonRpcResultResponse(req, jsonResponse, id, result.result);
  }

  return jsonRpcErrorResponse(req, jsonResponse, id, -32601, "Method not found.");
}

export function registerRuntimeMcpRoutes(args: RegisterRuntimeMcpRoutesArgs): void {
  const { http, httpAction, jsonResponse, optionsResponse, requireAuthenticatedActor } = args;

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
        requireAuthenticatedActor,
      })),
  });
}

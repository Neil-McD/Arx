import { api, internal } from "./_generated/api";
import type { PublicHttpAction } from "convex/server";
import {
  POLYNET_MCP_PROTOCOL_VERSION,
  POLYNET_MCP_SUPPORTED_PROTOCOL_VERSIONS,
  getPolynetMcpToolDefinition,
  getPolynetMcpToolDefinitions,
  isSupportedPolynetMcpProtocolVersion,
} from "../shared/polynetMcp";
import productDocsIndexJson from "../docs/product/generated/index.json";
import {
  executeGetProductDocTool,
  executeSearchProductDocsTool,
} from "../shared/productDocsRuntime.ts";
import type { ProductDocsSearchIndex } from "../shared/productDocsSearch.ts";
import {
  hasCommunityCapability,
  projectCommunityAccessCapabilities,
  type CommunityCapabilityAuthority,
  type CommunityCapabilityName,
} from "../shared/communityCapabilityContract";
import {
  findCommunityMembershipBySlug as findCommunityBySlug,
  listAccessibleCommunityMemberships as listAccessibleCommunities,
  type CommunityMembershipProjection,
} from "./communityCapabilityContext";
import { normalizeCommunityCapabilitySlug } from "../shared/communityCapabilityContextContract";
import {
  listCommunityReadSummaries,
  resolveAccessibleCommunityReadDetail,
} from "./communityReadKernel";
import type { CommunityReadSummary } from "../shared/communityReadContract.ts";
import { normalizePolynetProfileConfirmInput } from "../shared/polynetProfileMcpContract.ts";

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

type ListAccessibleCommunities = (
  ctx: any,
  authSubject: string,
) => Promise<CommunityMembershipProjection[]>;

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

type ResolvedWorkspaceContext = {
  communityId: string;
  communitySlug: string;
  row: CommunityMembershipProjection;
  access: Record<string, unknown>;
  authority: CommunityCapabilityAuthority;
  workspace: Record<string, unknown>;
};

const WORKSPACE_CONTEXT_PREFIX = "community:";
const COMMUNITY_MEMORY_TYPES = new Set([
  "playbook",
  "insight",
  "example",
  "warning_failure",
  "decision_judgment",
  "open_question",
]);
const productDocsIndex = productDocsIndexJson as ProductDocsSearchIndex;

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

function resolveMcpServerUrl(req: Request): string | null {
  const configured = resolveConfiguredMcpResourceUrl();
  if (!configured.ok) return null;
  return configured.value ?? resolveRequestMcpServerUrl(req);
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

function resolveProtectedResourceMetadataUrl(req: Request): string | null {
  const resourceServerUrl = resolveMcpServerUrl(req);
  return resourceServerUrl ? buildProtectedResourceMetadataUrl(resourceServerUrl) : null;
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

function sanitizeCommunitySummary(row: CommunityMembershipProjection): CommunityReadSummary {
  const role = normalizeString(row.role, 32)?.toLowerCase();
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
      role === "owner"
        ? "owner"
        : role === "admin"
          ? "admin"
          : role === "moderator"
            ? "moderator"
            : "member",
  };
}

function sanitizeCommunityAccessCapabilities(access: Record<string, unknown>) {
  const capabilities = projectCommunityAccessCapabilities(access);
  return {
    can_view: capabilities.canView,
    can_enter_community: capabilities.canEnterCommunity,
    can_read_chat: capabilities.canReadChat,
    can_post_chat: capabilities.canPostChat,
    can_post_message: capabilities.canPostMessage,
    can_manage_resources: capabilities.canManageResources,
    can_moderate_content: capabilities.canModerateContent,
    can_manage_members: capabilities.canManageMembers,
    can_review_join_requests: capabilities.canReviewJoinRequests,
    can_manage_pricing: capabilities.canManagePricing,
    can_manage_branding: capabilities.canManageBranding,
    can_manage_publishing: capabilities.canManagePublishing,
    can_manage_payouts: capabilities.canManagePayouts,
  };
}

const MCP_TOOLSET_BY_COMMUNITY_CAPABILITY: Record<CommunityCapabilityName, string> = {
  community_context: "workspace_context",
  accepted_memory: "accepted_memory",
  raw_evidence_search: "raw_evidence_search",
  member_resources: "member_resources",
  builder_resources: "builder_resources",
  join_request_review: "join_request_review",
  community_admin: "community_admin",
  owner_controls: "owner_controls",
};

function buildWorkspaceAuthority(authority: CommunityCapabilityAuthority) {
  return {
    relation: authority.relation,
    authority_lens: authority.authorityLens,
    available_toolsets: authority.availableCapabilities.map(
      (capability) => MCP_TOOLSET_BY_COMMUNITY_CAPABILITY[capability],
    ),
    unavailable_reason: authority.unavailableReason,
  };
}

function buildWorkspaceContextId(communitySlug: string | null | undefined): string | null {
  const slug = normalizeCommunityCapabilitySlug(communitySlug);
  return slug ? `${WORKSPACE_CONTEXT_PREFIX}${slug}` : null;
}

function parseWorkspaceContextId(value: unknown): string | null {
  const raw = normalizeString(value, 200);
  if (!raw || !raw.startsWith(WORKSPACE_CONTEXT_PREFIX)) return null;
  return normalizeCommunityCapabilitySlug(raw.slice(WORKSPACE_CONTEXT_PREFIX.length));
}

function sanitizeWorkspaceSummary(row: CommunityMembershipProjection) {
  const community = sanitizeCommunitySummary(row);
  return buildWorkspaceSummaryFromCommunity(community);
}

function buildWorkspaceSummaryFromCommunity(community: {
  slug: string;
  name: string;
  one_liner: string | null;
  visibility: "published" | "unlisted";
  entry_policy: "open" | "approval" | "paid_subscription";
  relation: string;
}) {
  return {
    workspace_context_id: buildWorkspaceContextId(community.slug) ?? "",
    workspace_type: "community",
    ...community,
  };
}

function buildWorkspaceContext(
  row: CommunityMembershipProjection,
  access: Record<string, unknown>,
  canonicalAuthority: CommunityCapabilityAuthority,
) {
  const summary = sanitizeWorkspaceSummary(row);
  const capabilities = sanitizeCommunityAccessCapabilities(access);
  const authority = buildWorkspaceAuthority(canonicalAuthority);
  return {
    ...summary,
    community: {
      slug: summary.slug,
      name: summary.name,
      one_liner: summary.one_liner,
      about: normalizeString(row.communities?.about, 4000),
      visibility: summary.visibility,
      entry_policy: summary.entry_policy,
    },
    access: {
      relation: authority.relation,
      is_entitled: access.is_entitled === true,
      capabilities,
    },
    authority,
    memory: {
      accepted_memory_tool: "polynet_workspace_memory_search",
      accepted_memory_read_tool: "polynet_workspace_memory_read",
      outcome_tool: "polynet_workspace_record_outcome",
    },
    epistemic_policy: {
      accepted_memory:
        "Use polynet_workspace_memory_search for accepted community intelligence.",
      raw_evidence:
        "Use polynet_community_search for raw recent community evidence; do not treat raw evidence as community-endorsed memory.",
    },
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
      sourceType === "interaction" || sourceType === "chat" || sourceType === "ai_feed" || sourceType === "resource"
        ? sourceType
        : "resource",
    ref: normalizeString(row.ref, 512),
    source_id: normalizeString(row.source_id, 512),
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

async function resolveWorkspaceContext(args: {
  ctx: any;
  authSubject: string;
  workspaceContextId: unknown;
}): Promise<
  | { ok: true; context: ResolvedWorkspaceContext }
  | { ok: false; message: string }
> {
  const communitySlug = parseWorkspaceContextId(args.workspaceContextId);
  if (!communitySlug) {
    return { ok: false, message: "workspace_context_id must use the community:<slug> shape." };
  }
  const resolved = await resolveAccessibleCommunityReadDetail({
    ctx: args.ctx,
    authSubject: args.authSubject,
    communitySlug,
  });
  if (!resolved.ok) {
    if (resolved.code === "community_access_unavailable") {
      return { ok: false, message: "Workspace access could not be resolved." };
    }
    if (resolved.code === "community_access_closed") {
      return { ok: false, message: "Workspace is not accessible for this user." };
    }
    return { ok: false, message: "Workspace not found or not accessible." };
  }
  const { membership, access, authority } = resolved.context;
  return {
    ok: true,
    context: {
      communityId: resolved.context.communityId,
      communitySlug,
      row: membership,
      access,
      authority,
      workspace: buildWorkspaceContext(membership, access, authority),
    },
  };
}

function normalizeWorkspaceMemoryTypes(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const types = value
    .map((item) => normalizeString(item, 64))
    .filter((item): item is string => Boolean(item && COMMUNITY_MEMORY_TYPES.has(item)))
    .slice(0, 6);
  return types.length > 0 ? types : undefined;
}

function normalizeWorkspaceMemoryLimit(value: unknown): number | undefined {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : NaN;
  if (!Number.isFinite(numeric)) return undefined;
  return Math.max(1, Math.min(12, Math.floor(numeric)));
}

function memoryToolErrorMessage(raw: unknown, fallback: string): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallback;
  const row = raw as Record<string, unknown>;
  if (row.ok === true) return null;
  return normalizeString(row.message, 500) ?? normalizeString(row.reason_code, 120) ?? fallback;
}

function requireWorkspaceAuthorityToolset(
  authority: CommunityCapabilityAuthority,
  capability: CommunityCapabilityName,
): { ok: true } | { ok: false; message: string } {
  if (hasCommunityCapability(authority, capability)) return { ok: true };
  return {
    ok: false,
    message: `Workspace authority does not include ${MCP_TOOLSET_BY_COMMUNITY_CAPABILITY[capability]}.`,
  };
}

function normalizeBoundedInteger(
  value: unknown,
  min: number,
  max: number,
): number | undefined {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : NaN;
  if (!Number.isFinite(numeric)) return undefined;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

function normalizeWorkspaceResourceLimit(value: unknown): number | undefined {
  return normalizeBoundedInteger(value, 1, 100);
}

function normalizeWorkspaceResourceSearchLimit(value: unknown): number | undefined {
  return normalizeBoundedInteger(value, 1, 20);
}

function normalizeWorkspaceResourceMapLimit(value: unknown): number | undefined {
  return normalizeBoundedInteger(value, 1, 250);
}

function normalizeWorkspaceResourceMapPerModuleLimit(value: unknown): number | undefined {
  return normalizeBoundedInteger(value, 1, 25);
}

function normalizeWorkspaceBuilderResourceLimit(value: unknown): number | undefined {
  return normalizeBoundedInteger(value, 1, 250);
}

function normalizeWorkspaceResourceReadOffset(value: unknown): number | undefined {
  return normalizeBoundedInteger(value, 0, 1_000_000);
}

function normalizeWorkspaceResourceReadLimit(value: unknown): number | undefined {
  return normalizeBoundedInteger(value, 1, 20_000);
}

async function handleToolCall(args: {
  ctx: any;
  authSubject: string;
  actor: {
    dbUserId: any;
  };
  toolName: string;
  toolArgs: Record<string, unknown>;
  listAccessibleCommunities?: ListAccessibleCommunities;
  resolveWorkspaceContext?: typeof resolveWorkspaceContext;
}): Promise<{ ok: true; result: Record<string, unknown> } | { ok: false; type: "tool"; message: string } | { ok: false; type: "protocol"; message: string }> {
  const { ctx, authSubject, actor, toolName, toolArgs } = args;
  const listAccessible = args.listAccessibleCommunities ?? listAccessibleCommunities;
  const resolveWorkspaceContextForCall = args.resolveWorkspaceContext ?? resolveWorkspaceContext;

  if (toolName === "polynet_list_communities") {
    const listed = await listCommunityReadSummaries({
      ctx,
      authSubject,
      scope: toolArgs.scope,
    });
    if (!listed.ok) {
      return { ok: false, type: "tool", message: "scope must be joined or discover." };
    }
    const communities = listed.communities;
    return {
      ok: true,
      result: {
        content: buildToolTextContent({ communities }),
        structuredContent: { communities },
        isError: false,
      },
    };
  }

  if (toolName === "polynet_list_workspaces") {
    const listed = await listCommunityReadSummaries({
      ctx,
      authSubject,
      scope: "joined",
    });
    if (!listed.ok) {
      return { ok: false, type: "tool", message: "Community listing failed." };
    }
    const workspaces = listed.communities.map(buildWorkspaceSummaryFromCommunity);
    return {
      ok: true,
      result: {
        content: buildToolTextContent({ workspaces }),
        structuredContent: { workspaces },
        isError: false,
      },
    };
  }

  if (toolName === "polynet_get_community") {
    const communitySlug = normalizeString(toolArgs.community_slug, 160);
    if (!communitySlug) {
      return { ok: false, type: "tool", message: "community_slug is required." };
    }
    const resolved = await resolveAccessibleCommunityReadDetail({
      ctx,
      authSubject,
      communitySlug,
    });
    if (!resolved.ok) {
      return {
        ok: false,
        type: "tool",
        message: "Community not found or not accessible.",
      };
    }
    const community = resolved.community;
    return {
      ok: true,
      result: {
        content: buildToolTextContent({ community }),
        structuredContent: { community },
        isError: false,
      },
    };
  }

  if (toolName === "polynet_get_my_profile") {
    try {
      const profile = (await ctx.runQuery(
        internal.memberOntology.getMemberProfileForMcpInternal as any,
        { userId: actor.dbUserId },
      )) as Record<string, unknown>;
      const structuredContent = { profile };
      return {
        ok: true,
        result: {
          content: buildToolTextContent(structuredContent),
          structuredContent,
          isError: false,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, type: "tool", message: message || "Profile read failed." };
    }
  }

  if (toolName === "polynet_confirm_my_profile_facts") {
    const normalized = normalizePolynetProfileConfirmInput(toolArgs);
    if (!normalized.ok) {
      return { ok: false, type: "tool", message: normalized.message };
    }
    try {
      const confirmation = (await ctx.runMutation(
        internal.memberOntology.confirmMemberProfileFactsForMcpInternal as any,
        {
          userId: actor.dbUserId,
          confirmMarker: normalized.input.confirmMarker,
          facts: normalized.input.facts,
        },
      )) as Record<string, unknown>;
      const structuredContent = { confirmation };
      return {
        ok: true,
        result: {
          content: buildToolTextContent(structuredContent),
          structuredContent,
          isError: false,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        type: "tool",
        message: message || "Profile confirmation failed.",
      };
    }
  }

  if (toolName === "polynet_product_docs_search") {
    const query = normalizeString(toolArgs.query, 240);
    if (!query) {
      return { ok: false, type: "tool", message: "query is required." };
    }
    const productDocs = executeSearchProductDocsTool({
      index: productDocsIndex,
      query,
      limit: normalizeBoundedInteger(toolArgs.limit, 1, 10),
      section: normalizeString(toolArgs.section, 80),
      audience: normalizeString(toolArgs.audience, 40),
    });
    const structuredContent = { product_docs: productDocs };
    return {
      ok: true,
      result: {
        content: buildToolTextContent(structuredContent),
        structuredContent,
        isError: false,
      },
    };
  }

  if (toolName === "polynet_product_doc_read") {
    const slug = normalizeString(toolArgs.slug, 160);
    if (!slug) {
      return { ok: false, type: "tool", message: "slug is required." };
    }
    const productDoc = executeGetProductDocTool({
      index: productDocsIndex,
      slug,
      heading: normalizeString(toolArgs.heading, 160),
    });
    if (!productDoc.ok) {
      return { ok: false, type: "tool", message: productDoc.message };
    }
    const structuredContent = { product_doc: productDoc };
    return {
      ok: true,
      result: {
        content: buildToolTextContent(structuredContent),
        structuredContent,
        isError: false,
      },
    };
  }

  if (toolName === "polynet_open_workspace") {
    const communitySlug = normalizeString(toolArgs.community_slug, 160);
    if (!communitySlug) {
      return { ok: false, type: "tool", message: "community_slug is required." };
    }
    const workspaceContextId = buildWorkspaceContextId(communitySlug);
    const resolved = await resolveWorkspaceContextForCall({
      ctx,
      authSubject,
      workspaceContextId,
    });
    if (!resolved.ok) {
      return { ok: false, type: "tool", message: resolved.message };
    }
    const structuredContent = { workspace: resolved.context.workspace };
    return {
      ok: true,
      result: {
        content: buildToolTextContent(structuredContent),
        structuredContent,
        isError: false,
      },
    };
  }

  if (toolName === "polynet_get_workspace_context") {
    const resolved = await resolveWorkspaceContextForCall({
      ctx,
      authSubject,
      workspaceContextId: toolArgs.workspace_context_id,
    });
    if (!resolved.ok) {
      return { ok: false, type: "tool", message: resolved.message };
    }
    const structuredContent = { workspace: resolved.context.workspace };
    return {
      ok: true,
      result: {
        content: buildToolTextContent(structuredContent),
        structuredContent,
        isError: false,
      },
    };
  }

  if (toolName === "polynet_workspace_ai_feed_search") {
    const resolved = await resolveWorkspaceContextForCall({
      ctx,
      authSubject,
      workspaceContextId: toolArgs.workspace_context_id,
    });
    if (!resolved.ok) {
      return { ok: false, type: "tool", message: resolved.message };
    }
    const authority = requireWorkspaceAuthorityToolset(
      resolved.context.authority,
      "raw_evidence_search",
    );
    if (!authority.ok) {
      return { ok: false, type: "tool", message: authority.message };
    }
    const query = normalizeString(toolArgs.query, 240);
    if (!query) {
      return { ok: false, type: "tool", message: "query is required." };
    }
    try {
      const aiFeed = (await ctx.runAction(
        (internal as any).communityAiFeedEvidence.searchCommunityAiFeedEvidenceInternal,
        {
          userId: actor.dbUserId,
          authSubject,
          communityId: resolved.context.communityId,
          query,
          limit: normalizeWorkspaceResourceSearchLimit(toolArgs.limit),
          surface: "external_mcp",
        },
      )) as Record<string, unknown> | null;
      if (!aiFeed || typeof aiFeed !== "object") {
        return { ok: false, type: "tool", message: "Workspace AI Feed search failed." };
      }
      const structuredContent = {
        workspace: sanitizeWorkspaceSummary(resolved.context.row),
        ai_feed: aiFeed,
      };
      return {
        ok: true,
        result: {
          content: buildToolTextContent(structuredContent),
          structuredContent,
          isError: false,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, type: "tool", message: message || "Workspace AI Feed search failed." };
    }
  }

  if (toolName === "polynet_workspace_ai_feed_read") {
    const resolved = await resolveWorkspaceContextForCall({
      ctx,
      authSubject,
      workspaceContextId: toolArgs.workspace_context_id,
    });
    if (!resolved.ok) {
      return { ok: false, type: "tool", message: resolved.message };
    }
    const authority = requireWorkspaceAuthorityToolset(
      resolved.context.authority,
      "raw_evidence_search",
    );
    if (!authority.ok) {
      return { ok: false, type: "tool", message: authority.message };
    }
    const ref = normalizeString(toolArgs.ref, 512);
    if (!ref) {
      return { ok: false, type: "tool", message: "ref is required." };
    }
    try {
      const aiFeed = (await ctx.runAction(
        (internal as any).communityAiFeedEvidence.readCommunityAiFeedEvidenceForToolInternal,
        {
          userId: actor.dbUserId,
          authSubject,
          communityId: resolved.context.communityId,
          ref,
          surface: "external_mcp",
        },
      )) as Record<string, unknown> | null;
      if (!aiFeed || typeof aiFeed !== "object") {
        return { ok: false, type: "tool", message: "Workspace AI Feed evidence read failed." };
      }
      const structuredContent = {
        workspace: sanitizeWorkspaceSummary(resolved.context.row),
        ai_feed: aiFeed,
      };
      return {
        ok: true,
        result: {
          content: buildToolTextContent(structuredContent),
          structuredContent,
          isError: false,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, type: "tool", message: message || "Workspace AI Feed evidence read failed." };
    }
  }

  if (toolName === "polynet_workspace_resources_map") {
    const resolved = await resolveWorkspaceContextForCall({
      ctx,
      authSubject,
      workspaceContextId: toolArgs.workspace_context_id,
    });
    if (!resolved.ok) {
      return { ok: false, type: "tool", message: resolved.message };
    }
    const authority = requireWorkspaceAuthorityToolset(resolved.context.authority, "member_resources");
    if (!authority.ok) {
      return { ok: false, type: "tool", message: authority.message };
    }
    try {
      const resources = (await ctx.runQuery(
        internal.communityResources.mapCommunityResourcesForToolInternal as any,
        {
          userId: actor.dbUserId,
          authSubject,
          communityId: resolved.context.communityId,
          limit: normalizeWorkspaceResourceMapLimit(toolArgs.limit),
          perModuleLimit: normalizeWorkspaceResourceMapPerModuleLimit(toolArgs.per_module_limit),
        },
      )) as Record<string, unknown> | null;
      if (!resources || typeof resources !== "object") {
        return { ok: false, type: "tool", message: "Workspace resource map failed." };
      }
      const structuredContent = {
        workspace: sanitizeWorkspaceSummary(resolved.context.row),
        resources,
      };
      return {
        ok: true,
        result: {
          content: buildToolTextContent(structuredContent),
          structuredContent,
          isError: false,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, type: "tool", message: message || "Workspace resource map failed." };
    }
  }

  if (toolName === "polynet_workspace_resources_list") {
    const resolved = await resolveWorkspaceContextForCall({
      ctx,
      authSubject,
      workspaceContextId: toolArgs.workspace_context_id,
    });
    if (!resolved.ok) {
      return { ok: false, type: "tool", message: resolved.message };
    }
    const authority = requireWorkspaceAuthorityToolset(resolved.context.authority, "member_resources");
    if (!authority.ok) {
      return { ok: false, type: "tool", message: authority.message };
    }
    const path = normalizeString(toolArgs.path, 1024);
    try {
      const resources = (await ctx.runQuery(
        internal.communityResources.listCommunityResourceDirectoryInternal as any,
        {
          userId: actor.dbUserId,
          authSubject,
          communityId: resolved.context.communityId,
          ...(path ? { path } : null),
          limit: normalizeWorkspaceResourceLimit(toolArgs.limit),
        },
      )) as Record<string, unknown> | null;
      if (!resources || typeof resources !== "object") {
        return { ok: false, type: "tool", message: "Workspace resource listing failed." };
      }
      const structuredContent = {
        workspace: sanitizeWorkspaceSummary(resolved.context.row),
        resources,
      };
      return {
        ok: true,
        result: {
          content: buildToolTextContent(structuredContent),
          structuredContent,
          isError: false,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, type: "tool", message: message || "Workspace resource listing failed." };
    }
  }

  if (toolName === "polynet_workspace_resource_read") {
    const resolved = await resolveWorkspaceContextForCall({
      ctx,
      authSubject,
      workspaceContextId: toolArgs.workspace_context_id,
    });
    if (!resolved.ok) {
      return { ok: false, type: "tool", message: resolved.message };
    }
    const authority = requireWorkspaceAuthorityToolset(resolved.context.authority, "member_resources");
    if (!authority.ok) {
      return { ok: false, type: "tool", message: authority.message };
    }
    const ref = normalizeString(toolArgs.ref, 1024);
    if (!ref) {
      return { ok: false, type: "tool", message: "ref is required." };
    }
    try {
      const resource = (await ctx.runAction(
        (internal as any).communityResourceEvidence.readCommunityResourceEvidenceForToolInternal,
        {
          userId: actor.dbUserId,
          authSubject,
          communityId: resolved.context.communityId,
          ref,
          offset: normalizeWorkspaceResourceReadOffset(toolArgs.offset),
          limit: normalizeWorkspaceResourceReadLimit(toolArgs.limit),
          surface: "external_mcp",
        },
      )) as Record<string, unknown> | null;
      if (!resource || typeof resource !== "object") {
        return { ok: false, type: "tool", message: "Workspace resource read failed." };
      }
      const structuredContent = {
        workspace: sanitizeWorkspaceSummary(resolved.context.row),
        resource,
      };
      return {
        ok: true,
        result: {
          content: buildToolTextContent(structuredContent),
          structuredContent,
          isError: false,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, type: "tool", message: message || "Workspace resource read failed." };
    }
  }

  if (toolName === "polynet_workspace_resources_search") {
    const resolved = await resolveWorkspaceContextForCall({
      ctx,
      authSubject,
      workspaceContextId: toolArgs.workspace_context_id,
    });
    if (!resolved.ok) {
      return { ok: false, type: "tool", message: resolved.message };
    }
    const authority = requireWorkspaceAuthorityToolset(resolved.context.authority, "member_resources");
    if (!authority.ok) {
      return { ok: false, type: "tool", message: authority.message };
    }
    const query = normalizeString(toolArgs.query, 240);
    if (!query) {
      return { ok: false, type: "tool", message: "query is required." };
    }
    try {
      const resources = (await ctx.runAction(
        (internal as any).communityResourceEvidence.searchCommunityResourceEvidenceInternal,
        {
          userId: actor.dbUserId,
          authSubject,
          communityId: resolved.context.communityId,
          query,
          limit: normalizeWorkspaceResourceSearchLimit(toolArgs.limit),
          surface: "external_mcp",
        },
      )) as Record<string, unknown> | null;
      if (!resources || typeof resources !== "object") {
        return { ok: false, type: "tool", message: "Workspace resource search failed." };
      }
      const structuredContent = {
        workspace: sanitizeWorkspaceSummary(resolved.context.row),
        resources,
      };
      return {
        ok: true,
        result: {
          content: buildToolTextContent(structuredContent),
          structuredContent,
          isError: false,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, type: "tool", message: message || "Workspace resource search failed." };
    }
  }

  if (toolName === "polynet_workspace_builder_resources_map") {
    const resolved = await resolveWorkspaceContextForCall({
      ctx,
      authSubject,
      workspaceContextId: toolArgs.workspace_context_id,
    });
    if (!resolved.ok) {
      return { ok: false, type: "tool", message: resolved.message };
    }
    const authority = requireWorkspaceAuthorityToolset(resolved.context.authority, "builder_resources");
    if (!authority.ok) {
      return { ok: false, type: "tool", message: authority.message };
    }
    try {
      const resources = (await ctx.runQuery(
        internal.communityResources.mapCommunityResourceBuilderForToolInternal as any,
        {
          userId: actor.dbUserId,
          authSubject,
          communityId: resolved.context.communityId,
          limit: normalizeWorkspaceResourceMapLimit(toolArgs.limit),
          perModuleLimit: normalizeWorkspaceResourceMapPerModuleLimit(toolArgs.per_module_limit),
        },
      )) as Record<string, unknown> | null;
      if (!resources || typeof resources !== "object") {
        return { ok: false, type: "tool", message: "Workspace builder resource map failed." };
      }
      const structuredContent = {
        workspace: sanitizeWorkspaceSummary(resolved.context.row),
        resources,
      };
      return {
        ok: true,
        result: {
          content: buildToolTextContent(structuredContent),
          structuredContent,
          isError: false,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, type: "tool", message: message || "Workspace builder resource map failed." };
    }
  }

  if (toolName === "polynet_workspace_builder_resources_list") {
    const resolved = await resolveWorkspaceContextForCall({
      ctx,
      authSubject,
      workspaceContextId: toolArgs.workspace_context_id,
    });
    if (!resolved.ok) {
      return { ok: false, type: "tool", message: resolved.message };
    }
    const authority = requireWorkspaceAuthorityToolset(resolved.context.authority, "builder_resources");
    if (!authority.ok) {
      return { ok: false, type: "tool", message: authority.message };
    }
    try {
      const resources = (await ctx.runQuery(
        api.communityResources.listCommunityResourceBuilderDirectory as any,
        {
          userId: actor.dbUserId,
          authSubject,
          communityId: resolved.context.communityId,
          limit: normalizeWorkspaceBuilderResourceLimit(toolArgs.limit),
        },
      )) as Record<string, unknown> | null;
      if (!resources || typeof resources !== "object") {
        return { ok: false, type: "tool", message: "Workspace builder resource listing failed." };
      }
      const structuredContent = {
        workspace: sanitizeWorkspaceSummary(resolved.context.row),
        resources,
      };
      return {
        ok: true,
        result: {
          content: buildToolTextContent(structuredContent),
          structuredContent,
          isError: false,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, type: "tool", message: message || "Workspace builder resource listing failed." };
    }
  }

  if (toolName === "polynet_workspace_builder_resource_read") {
    const resolved = await resolveWorkspaceContextForCall({
      ctx,
      authSubject,
      workspaceContextId: toolArgs.workspace_context_id,
    });
    if (!resolved.ok) {
      return { ok: false, type: "tool", message: resolved.message };
    }
    const authority = requireWorkspaceAuthorityToolset(resolved.context.authority, "builder_resources");
    if (!authority.ok) {
      return { ok: false, type: "tool", message: authority.message };
    }
    const ref = normalizeString(toolArgs.ref, 1024);
    if (!ref) {
      return { ok: false, type: "tool", message: "ref is required." };
    }
    try {
      const resource = (await ctx.runQuery(
        api.communityResources.readCommunityResourceBuilderResource as any,
        {
          userId: actor.dbUserId,
          authSubject,
          communityId: resolved.context.communityId,
          ref,
        },
      )) as Record<string, unknown> | null;
      if (!resource || typeof resource !== "object") {
        return { ok: false, type: "tool", message: "Workspace builder resource read failed." };
      }
      const structuredContent = {
        workspace: sanitizeWorkspaceSummary(resolved.context.row),
        resource,
      };
      return {
        ok: true,
        result: {
          content: buildToolTextContent(structuredContent),
          structuredContent,
          isError: false,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, type: "tool", message: message || "Workspace builder resource read failed." };
    }
  }

  if (toolName === "polynet_community_chat_search") {
    const communitySlug = normalizeString(toolArgs.community_slug, 160);
    const query = normalizeString(toolArgs.query, 240);
    if (!communitySlug || !query) {
      return { ok: false, type: "tool", message: "community_slug and query are required." };
    }
    const rows = await listAccessible(ctx, authSubject);
    const row = findCommunityBySlug(rows, communitySlug);
    if (!row) {
      return { ok: false, type: "tool", message: "Community not found or not accessible." };
    }
    try {
      const raw = (await ctx.runAction(
        (internal as any).communityInteractionEvidence.searchCommunityInteractionEvidenceInternal,
        {
          userId: actor.dbUserId,
          authSubject,
          communityId: row.community_id,
          query,
          limit: Math.max(1, Math.min(20, Math.floor(Number(toolArgs.limit ?? 10)))),
          surface: "external_mcp",
        },
      )) as Record<string, unknown> | null;
      if (!raw || typeof raw !== "object") {
        return { ok: false, type: "tool", message: "Community chat search failed." };
      }
      const structuredContent = {
        community: {
          slug: String(row.communities?.slug ?? "").trim(),
          name: String(row.communities?.name ?? "").trim() || "Community",
        },
        query,
        results: Array.isArray(raw.results) ? raw.results : [],
        retrieval_id: normalizeString(raw.retrieval_id, 160),
      };
      return {
        ok: true,
        result: {
          content: buildToolTextContent(structuredContent),
          structuredContent,
          isError: false,
        },
      };
    } catch (error) {
      return {
        ok: false,
        type: "tool",
        message: error instanceof Error ? error.message : "Community chat search failed.",
      };
    }
  }

  if (toolName === "polynet_community_chat_read") {
    const communitySlug = normalizeString(toolArgs.community_slug, 160);
    const ref = normalizeString(toolArgs.ref, 512);
    if (!communitySlug || !ref) {
      return { ok: false, type: "tool", message: "community_slug and ref are required." };
    }
    const rows = await listAccessible(ctx, authSubject);
    const row = findCommunityBySlug(rows, communitySlug);
    if (!row) {
      return { ok: false, type: "tool", message: "Community not found or not accessible." };
    }
    try {
      const raw = (await ctx.runAction(
        (internal as any).communityInteractionEvidence.readCommunityInteractionEvidenceForToolInternal,
        {
          userId: actor.dbUserId,
          authSubject,
          communityId: row.community_id,
          ref,
          surface: "external_mcp",
        },
      )) as Record<string, unknown> | null;
      if (!raw || typeof raw !== "object") {
        return { ok: false, type: "tool", message: "Community chat evidence read failed." };
      }
      const structuredContent = {
        community: {
          slug: String(row.communities?.slug ?? "").trim(),
          name: String(row.communities?.name ?? "").trim() || "Community",
        },
        evidence: raw.evidence ?? null,
        retrieval_id: normalizeString(raw.retrieval_id, 160),
      };
      return {
        ok: true,
        result: {
          content: buildToolTextContent(structuredContent),
          structuredContent,
          isError: false,
        },
      };
    } catch (error) {
      return {
        ok: false,
        type: "tool",
        message: error instanceof Error ? error.message : "Community chat evidence read failed.",
      };
    }
  }

  if (toolName === "polynet_community_search") {
    const communitySlug = normalizeString(toolArgs.community_slug, 160);
    const query = normalizeString(toolArgs.query, 240);
    if (!communitySlug || !query) {
      return { ok: false, type: "tool", message: "community_slug and query are required." };
    }
    const rows = await listAccessible(ctx, authSubject);
    const row = findCommunityBySlug(rows, communitySlug);
    if (!row) {
      return { ok: false, type: "tool", message: "Community not found or not accessible." };
    }
    const raw = (await ctx.runQuery(
      internal.communityRecentContext.readCommunityRecentContextInternal as any,
      {
        userId: actor.dbUserId,
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
      // Retained only at the external MCP boundary for v0 wire compatibility.
      archive_context: [],
      source_counts:
        raw.source_counts && typeof raw.source_counts === "object"
          ? raw.source_counts
          : null,
      archive_source_counts: { interaction: 0, ai_feed: 0, resource: 0 },
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

  if (toolName === "polynet_workspace_memory_search") {
    const resolved = await resolveWorkspaceContextForCall({
      ctx,
      authSubject,
      workspaceContextId: toolArgs.workspace_context_id,
    });
    if (!resolved.ok) {
      return { ok: false, type: "tool", message: resolved.message };
    }
    try {
      const memory = (await ctx.runMutation(
        internal.communityIntelligenceDirectory.searchCommunityMemoryInternal as any,
        {
          userId: actor.dbUserId,
          authSubject,
          communityId: resolved.context.communityId,
          surface: "external_mcp",
          query: normalizeString(toolArgs.query, 512) ?? undefined,
          types: normalizeWorkspaceMemoryTypes(toolArgs.types),
          limit: normalizeWorkspaceMemoryLimit(toolArgs.limit),
        },
      )) as Record<string, unknown> | null;
      const errorMessage = memoryToolErrorMessage(memory, "Workspace memory search failed.");
      if (errorMessage) {
        return { ok: false, type: "tool", message: errorMessage };
      }
      const structuredContent = {
        workspace: sanitizeWorkspaceSummary(resolved.context.row),
        memory,
      };
      return {
        ok: true,
        result: {
          content: buildToolTextContent(structuredContent),
          structuredContent,
          isError: false,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, type: "tool", message: message || "Workspace memory search failed." };
    }
  }

  if (toolName === "polynet_workspace_memory_read") {
    const resolved = await resolveWorkspaceContextForCall({
      ctx,
      authSubject,
      workspaceContextId: toolArgs.workspace_context_id,
    });
    if (!resolved.ok) {
      return { ok: false, type: "tool", message: resolved.message };
    }
    const nodeId = normalizeString(toolArgs.node_id, 128);
    if (!nodeId) {
      return { ok: false, type: "tool", message: "node_id is required." };
    }
    const retrievalLogId = normalizeString(toolArgs.retrieval_log_id, 128);
    try {
      const memory = (await ctx.runMutation(
        internal.communityIntelligenceDirectory.readCommunityMemoryInternal as any,
        {
          userId: actor.dbUserId,
          authSubject,
          communityId: resolved.context.communityId,
          surface: "external_mcp",
          nodeId,
          ...(retrievalLogId ? { retrievalLogId } : null),
        },
      )) as Record<string, unknown> | null;
      const errorMessage = memoryToolErrorMessage(memory, "Workspace memory read failed.");
      if (errorMessage) {
        return { ok: false, type: "tool", message: errorMessage };
      }
      const structuredContent = {
        workspace: sanitizeWorkspaceSummary(resolved.context.row),
        memory,
      };
      return {
        ok: true,
        result: {
          content: buildToolTextContent(structuredContent),
          structuredContent,
          isError: false,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, type: "tool", message: message || "Workspace memory read failed." };
    }
  }

  if (toolName === "polynet_workspace_record_outcome") {
    const resolved = await resolveWorkspaceContextForCall({
      ctx,
      authSubject,
      workspaceContextId: toolArgs.workspace_context_id,
    });
    if (!resolved.ok) {
      return { ok: false, type: "tool", message: resolved.message };
    }
    const retrievalLogId = normalizeString(toolArgs.retrieval_log_id, 128);
    if (!retrievalLogId) {
      return { ok: false, type: "tool", message: "retrieval_log_id is required." };
    }
    const resultStatus = normalizeString(toolArgs.result_status, 32);
    if (resultStatus !== "worked" && resultStatus !== "failed" && resultStatus !== "mixed") {
      return { ok: false, type: "tool", message: "result_status must be worked, failed, or mixed." };
    }
    const nodeId = normalizeString(toolArgs.node_id, 128);
    if (!nodeId) {
      return { ok: false, type: "tool", message: "node_id is required." };
    }
    const notes = normalizeString(toolArgs.notes, 1000);
    try {
      const outcome = (await ctx.runMutation(
        internal.communityIntelligenceDirectory.recordCommunityOutcomeObservationInternal as any,
        {
          userId: actor.dbUserId,
          authSubject,
          communityId: resolved.context.communityId,
          surface: "external_mcp",
          retrievalLogId,
          nodeId,
          resultStatus,
          ...(notes ? { notes } : null),
        },
      )) as Record<string, unknown> | null;
      const errorMessage = memoryToolErrorMessage(outcome, "Workspace memory outcome recording failed.");
      if (errorMessage) {
        return { ok: false, type: "tool", message: errorMessage };
      }
      const structuredContent = {
        workspace: sanitizeWorkspaceSummary(resolved.context.row),
        outcome,
      };
      return {
        ok: true,
        result: {
          content: buildToolTextContent(structuredContent),
          structuredContent,
          isError: false,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        type: "tool",
        message: message || "Workspace memory outcome recording failed.",
      };
    }
  }

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
  listAccessibleCommunities?: ListAccessibleCommunities;
  resolveWorkspaceContext?: typeof resolveWorkspaceContext;
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
        serverInfo: {
          name: "polynet-mcp",
          version: "0.1.0-alpha",
        },
        instructions:
          "Polynet MCP alpha exposes provider-side community and authenticated self-profile tools over remote HTTP. MCP connection and tool calls require Polynet authentication. Workspace context ids are selectors and are revalidated server-side on every call. After connection, offer profile setup once; read the current profile first and never confirm profile facts until the member has seen and explicitly approved the complete batch.",
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
    return jsonRpcResultResponse(req, jsonResponse, id, {
      tools: getPolynetMcpToolDefinitions(),
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
      listAccessibleCommunities: args.listAccessibleCommunities,
      resolveWorkspaceContext: args.resolveWorkspaceContext,
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
    path: "/.well-known/oauth-protected-resource",
    method: "GET",
    handler: httpAction(async (_ctx, req) => {
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
    }),
  });

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
        requireAuthenticatedActor,
      })),
  });
}

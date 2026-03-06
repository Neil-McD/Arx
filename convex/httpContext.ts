import { api } from "./_generated/api";
import {
  loadPlatformModelMap,
  normalizePositiveInt,
  parseBoolish,
  parseOptionalString,
  parseProviderModelRef,
} from "./httpInferenceConfig";

type RuntimeModelRegistryInput = {
  id?: unknown;
  model_id?: unknown;
  enabled?: unknown;
};

type RuntimePersonalMemoryInput = {
  user_id?: unknown;
  scope?: unknown;
  scope_id?: unknown;
  limit?: unknown;
};

type RuntimeCommunityResearchInput = {
  community_id?: unknown;
  community_name?: unknown;
  query?: unknown;
  source_types?: unknown;
  limit?: unknown;
};

type RuntimeCommunityMemoryCandidateInput = {
  p_community_id?: unknown;
  community_id?: unknown;
  p_title?: unknown;
  title?: unknown;
  p_memory_text?: unknown;
  memory_text?: unknown;
  p_evidence?: unknown;
  evidence?: unknown;
  p_request_key?: unknown;
  request_key?: unknown;
};

type HttpRouterLike = {
  route: (config: {
    path: string;
    method: string;
    handler: unknown;
  }) => void;
};

type HttpActionLike = (handler: (ctx: unknown, req: Request) => Promise<Response>) => unknown;

type RequireAuthenticatedUserId = (
  ctx: unknown,
  req: Request,
) => Promise<{ ok: true; userId: string } | { ok: false; response: Response }>;

type RegisterRuntimeContextRoutesArgs = {
  http: HttpRouterLike;
  httpAction: HttpActionLike;
  jsonResponse: (req: Request, status: number, payload: unknown) => Response;
  optionsResponse: (req: Request) => Response;
  requireAuthenticatedUserId: RequireAuthenticatedUserId;
};

function parseIsoToEpochSeconds(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.floor(raw);
  }
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;
  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) return Math.floor(asNumber);
  const parsedMs = Date.parse(value);
  if (!Number.isFinite(parsedMs)) return null;
  return Math.floor(parsedMs / 1000);
}

export function registerRuntimeContextRoutes(args: RegisterRuntimeContextRoutesArgs): void {
  const { http, httpAction, jsonResponse, optionsResponse, requireAuthenticatedUserId } = args;

  http.route({
    path: "/runtime/list_enabled_model_registry",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, req) => optionsResponse(req)),
  });

  http.route({
    path: "/runtime/list_personal_memory_items",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, req) => optionsResponse(req)),
  });

  http.route({
    path: "/runtime/community_research",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, req) => optionsResponse(req)),
  });

  http.route({
    path: "/runtime/community_memory_candidate_propose",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, req) => optionsResponse(req)),
  });

  http.route({
    path: "/runtime/list_enabled_model_registry",
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      let input: RuntimeModelRegistryInput = {};
      try {
        input = (await req.json()) as RuntimeModelRegistryInput;
      } catch {
        input = {};
      }

      const auth = await requireAuthenticatedUserId(ctx, req);
      if (!auth.ok) return auth.response;
      void auth.userId;

      const enabledOnly = parseBoolish(input.enabled, true);
      const requestedId = parseOptionalString(input.model_id ?? input.id, 160);
      const platformMap = loadPlatformModelMap();
      const rows = (await (ctx as any).runQuery(api.modelRegistry.listEnabledModelRegistry as any, {
        enabled: enabledOnly,
      })) as Array<{ id?: string; provider?: string; enabled?: boolean }>;

      const normalized = rows
        .map((row) => {
          const id = String(row?.id ?? "").trim();
          if (!id) return null;
          const mapped = parseProviderModelRef(platformMap[id] ?? "");
          const fallbackProvider = String(row?.provider ?? "").trim().toLowerCase();
          const provider = mapped?.provider || fallbackProvider || "openrouter";
          const providerModel = mapped?.providerModel || id;
          return {
            id,
            provider,
            provider_model: providerModel,
            enabled: row?.enabled !== false,
          };
        })
        .filter((row): row is { id: string; provider: string; provider_model: string; enabled: boolean } =>
          Boolean(row),
        );

      let filtered = normalized;
      if (requestedId) {
        filtered = normalized.filter((row) => row.id === requestedId);
        if (filtered.length === 0) {
          const mapped = parseProviderModelRef(platformMap[requestedId] ?? "");
          if (mapped) {
            filtered = [
              {
                id: requestedId,
                provider: mapped.provider,
                provider_model: mapped.providerModel,
                enabled: true,
              },
            ];
          }
        }
      }
      return jsonResponse(req, 200, filtered);
    }),
  });

  http.route({
    path: "/runtime/list_personal_memory_items",
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      let input: RuntimePersonalMemoryInput = {};
      try {
        input = (await req.json()) as RuntimePersonalMemoryInput;
      } catch {
        input = {};
      }

      const auth = await requireAuthenticatedUserId(ctx, req);
      if (!auth.ok) return auth.response;
      const scopeRaw = parseOptionalString(input.scope, 24);
      const scope = scopeRaw === "global" || scopeRaw === "workspace" ? scopeRaw : undefined;
      const scopeId = parseOptionalString(input.scope_id, 240) ?? undefined;
      const limit = normalizePositiveInt(input.limit, 200, 1000);
      const rows = (await (ctx as any).runQuery(api.personalMemory.listPersonalMemoryItems as any, {
        userId: auth.userId,
        scope,
        scopeId,
        limit,
      })) as Array<{
        id?: string;
        content?: string;
        scope?: string;
        scope_id?: string | null;
        pinned?: boolean;
        created_at?: string;
        updated_at?: string;
      }>;

      const normalized = rows.map((row, index) => {
        const nowSec = Math.floor(Date.now() / 1000);
        const updatedAt =
          parseIsoToEpochSeconds(row?.updated_at) ??
          parseIsoToEpochSeconds(row?.created_at) ??
          nowSec - Math.max(0, index);
        return {
          id: String(row?.id ?? "").trim(),
          content: String(row?.content ?? ""),
          scope: String(row?.scope ?? "global"),
          scope_id: row?.scope_id ?? null,
          pinned: row?.pinned === true ? 1 : 0,
          updated_at: updatedAt,
        };
      });
      return jsonResponse(req, 200, normalized);
    }),
  });

  http.route({
    path: "/runtime/community_research",
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      let input: RuntimeCommunityResearchInput;
      try {
        input = (await req.json()) as RuntimeCommunityResearchInput;
      } catch {
        return jsonResponse(req, 400, {
          ok: false,
          error: "invalid_request",
          code: "invalid_request",
        });
      }

      const auth = await requireAuthenticatedUserId(ctx, req);
      if (!auth.ok) return auth.response;

      const communityId = parseOptionalString(input.community_id, 200);
      const query = parseOptionalString(input.query, 240);
      if (!communityId || !query) {
        return jsonResponse(req, 400, {
          ok: false,
          error: "invalid_request",
          code: "invalid_request",
          message: "community_id and query are required.",
        });
      }
      const communityName = parseOptionalString(input.community_name, 200);
      const limit = normalizePositiveInt(input.limit, 12, 24);
      const sourceTypes = Array.isArray(input.source_types)
        ? input.source_types
            .map((value) => String(value ?? "").trim().toLowerCase())
            .filter((value) => value === "chat" || value === "resource" || value === "memory")
        : [];

      try {
        const payload = await (ctx as any).runQuery(api.community.researchCommunityContext as any, {
          userId: auth.userId,
          communityId,
          communityName: communityName ?? null,
          query,
          sourceTypes,
          limit,
        });
        return jsonResponse(req, 200, (payload ?? { ok: false }) as Record<string, unknown>);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonResponse(req, 400, {
          ok: false,
          error: "community_research_failed",
          code: "community_research_failed",
          message,
        });
      }
    }),
  });

  http.route({
    path: "/runtime/community_memory_candidate_propose",
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      let input: RuntimeCommunityMemoryCandidateInput;
      try {
        input = (await req.json()) as RuntimeCommunityMemoryCandidateInput;
      } catch {
        return jsonResponse(req, 400, {
          ok: false,
          error: "invalid_request",
          code: "invalid_request",
        });
      }

      const auth = await requireAuthenticatedUserId(ctx, req);
      if (!auth.ok) return auth.response;

      const communityId = parseOptionalString(input.p_community_id ?? input.community_id, 200);
      const memoryText = parseOptionalString(input.p_memory_text ?? input.memory_text, 8000);
      if (!communityId || !memoryText) {
        return jsonResponse(req, 400, {
          ok: false,
          error: "invalid_request",
          code: "invalid_request",
          message: "community_id and memory_text are required.",
        });
      }
      const title = parseOptionalString(input.p_title ?? input.title, 120);
      const requestKey = parseOptionalString(input.p_request_key ?? input.request_key, 256);
      const evidence = input.p_evidence ?? input.evidence ?? null;

      try {
        const payload = await (ctx as any).runMutation(api.community.proposeCommunityMemoryCandidate as any, {
          userId: auth.userId,
          communityId,
          title: title ?? null,
          memoryText,
          evidence,
          requestKey: requestKey ?? null,
        });
        return jsonResponse(req, 200, (payload ?? { ok: false }) as Record<string, unknown>);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonResponse(req, 400, {
          ok: false,
          error: "community_memory_candidate_propose_failed",
          code: "community_memory_candidate_propose_failed",
          message,
        });
      }
    }),
  });
}

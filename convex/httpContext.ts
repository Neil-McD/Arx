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
  query?: unknown;
};

type RuntimeCommunityLiveFeedWriteInput = {
  community_id?: unknown;
  agent_key?: unknown;
  author_label?: unknown;
  post_type?: unknown;
  title?: unknown;
  body?: unknown;
  why_now?: unknown;
  evidence?: unknown;
  publish_confidence?: unknown;
  novelty_key?: unknown;
};

type HttpRouterLike = {
  route: (config: {
    path: string;
    method: string;
    handler: unknown;
  }) => void;
};

type HttpActionLike = (handler: (ctx: unknown, req: Request) => Promise<Response>) => unknown;

type RequireAuthenticatedSubject = (
  ctx: unknown,
  req: Request,
) => Promise<{ ok: true; authSubject: string } | { ok: false; response: Response }>;

type RegisterRuntimeContextRoutesArgs = {
  http: HttpRouterLike;
  httpAction: HttpActionLike;
  jsonResponse: (req: Request, status: number, payload: unknown) => Response;
  optionsResponse: (req: Request) => Response;
  requireAuthenticatedSubject: RequireAuthenticatedSubject;
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
  const { http, httpAction, jsonResponse, optionsResponse, requireAuthenticatedSubject } = args;

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
    path: "/runtime/community_live_feed_write",
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

      const auth = await requireAuthenticatedSubject(ctx, req);
      if (!auth.ok) return auth.response;
      void auth.authSubject;

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

      const auth = await requireAuthenticatedSubject(ctx, req);
      if (!auth.ok) return auth.response;
      const scopeRaw = parseOptionalString(input.scope, 24);
      const scope = scopeRaw === "global" || scopeRaw === "workspace" ? scopeRaw : undefined;
      const scopeId = parseOptionalString(input.scope_id, 240) ?? undefined;
      const limit = normalizePositiveInt(input.limit, 200, 1000);
      const rows = (await (ctx as any).runQuery(api.personalMemory.listPersonalMemoryItems as any, {
        authSubject: auth.authSubject,
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

      const auth = await requireAuthenticatedSubject(ctx, req);
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
      try {
        const payload = await (ctx as any).runQuery(api.community.readCompiledCommunityContext as any, {
          authSubject: auth.authSubject,
          communityId,
          query,
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
    path: "/runtime/community_live_feed_write",
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      let input: RuntimeCommunityLiveFeedWriteInput;
      try {
        input = (await req.json()) as RuntimeCommunityLiveFeedWriteInput;
      } catch {
        return jsonResponse(req, 400, {
          ok: false,
          error: "invalid_request",
          code: "invalid_request",
        });
      }

      const auth = await requireAuthenticatedSubject(ctx, req);
      if (!auth.ok) return auth.response;

      const communityId = parseOptionalString(input.community_id, 200);
      const body = parseOptionalString(input.body, 12_000);
      if (!communityId || !body) {
        return jsonResponse(req, 400, {
          ok: false,
          error: "invalid_request",
          code: "invalid_request",
          message: "community_id and body are required.",
        });
      }

      const postTypeRaw = parseOptionalString(input.post_type, 32)?.toLowerCase();
      const postType =
        postTypeRaw === "recommendation" || postTypeRaw === "action" ? postTypeRaw : "observation";
      const title = parseOptionalString(input.title, 180);
      const whyNow = parseOptionalString(input.why_now, 280);
      const evidence = Array.isArray(input.evidence)
        ? input.evidence
            .map((entry) => parseOptionalString(entry, 180))
            .filter((entry): entry is string => Boolean(entry))
            .slice(0, 4)
        : [];
      const authorLabel = parseOptionalString(input.author_label, 80);
      const agentKey = parseOptionalString(input.agent_key, 120);
      const noveltyKey = parseOptionalString(input.novelty_key, 256);
      const publishConfidenceRaw = Number(input.publish_confidence);
      const publishConfidence = Number.isFinite(publishConfidenceRaw)
        ? Math.max(0, Math.min(6, Math.round(publishConfidenceRaw)))
        : undefined;
      if (evidence.length === 0) {
        return jsonResponse(req, 400, {
          ok: false,
          error: "invalid_request",
          code: "invalid_request",
          message: "evidence is required for community live feed writes.",
        });
      }

      try {
        const payload = await (ctx as any).runMutation(api.community.publishCommunityAiFeedAgentPost as any, {
          authSubject: auth.authSubject,
          communityId,
          agentKey: agentKey ?? null,
          authorLabel: authorLabel ?? null,
          postType,
          title: title ?? null,
          body,
          whyNow: whyNow ?? null,
          evidence,
          publishConfidence,
          noveltyKey: noveltyKey ?? null,
        });
        return jsonResponse(req, 200, {
          ok: true,
          post: payload ?? null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonResponse(req, 400, {
          ok: false,
          error: "community_live_feed_write_failed",
          code: "community_live_feed_write_failed",
          message,
        });
      }
    }),
  });

}

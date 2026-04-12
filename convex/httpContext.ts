import { api } from "./_generated/api";
import type { PublicHttpAction } from "convex/server";
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

type HttpRouteMethod = "GET" | "POST" | "DELETE" | "OPTIONS" | "PUT" | "PATCH";

type HttpRouterLike = {
  route: (config: {
    path: string;
    method: HttpRouteMethod;
    handler: PublicHttpAction;
  }) => void;
};

type HttpActionLike = (handler: (ctx: unknown, req: Request) => Promise<Response>) => PublicHttpAction;

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
}

import { api } from "./_generated/api";
import type { PublicHttpAction } from "convex/server";
import {
  loadPlatformModelMap,
  parseBoolish,
  parseOptionalString,
  parseProviderModelRef,
} from "./httpInferenceConfig";

type RuntimeModelRegistryInput = {
  id?: unknown;
  model_id?: unknown;
  enabled?: unknown;
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

export function registerRuntimeContextRoutes(args: RegisterRuntimeContextRoutesArgs): void {
  const { http, httpAction, jsonResponse, optionsResponse, requireAuthenticatedSubject } = args;

  http.route({
    path: "/runtime/list_enabled_model_registry",
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

}

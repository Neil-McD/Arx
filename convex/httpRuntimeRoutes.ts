import {
  handleRuntimeTurnRequest,
  JsonResponseFn,
  RequireAuthenticatedActor,
  SseResponseFn,
} from "./runtimeTurnHandlers";
import type { PublicHttpAction } from "convex/server";

type HttpRouteMethod = "GET" | "POST" | "DELETE" | "OPTIONS" | "PUT" | "PATCH";

type HttpRouterLike = {
  route: (config: {
    path: string;
    method: HttpRouteMethod;
    handler: PublicHttpAction;
  }) => void;
};

type HttpActionLike = (handler: (ctx: unknown, req: Request) => Promise<Response>) => PublicHttpAction;

type RegisterRuntimeTurnRoutesArgs = {
  http: HttpRouterLike;
  httpAction: HttpActionLike;
  jsonResponse: JsonResponseFn;
  optionsResponse: (req: Request) => Response;
  sseResponse: SseResponseFn;
  requireAuthenticatedActor: RequireAuthenticatedActor;
};

export function registerRuntimeTurnRoutes(args: RegisterRuntimeTurnRoutesArgs): void {
  const {
    http,
    httpAction,
    jsonResponse,
    optionsResponse,
    sseResponse,
    requireAuthenticatedActor,
  } = args;

  http.route({
    path: "/runtime/runtime_turn",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, req) => optionsResponse(req)),
  });

  http.route({
    path: "/runtime/runtime_turn",
    method: "POST",
    handler: httpAction(async (ctx, req) =>
      handleRuntimeTurnRequest({
        ctx,
        req,
        jsonResponse,
        sseResponse,
        requireAuthenticatedActor,
      }),
    ),
  });

}

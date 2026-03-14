import {
  handlePublicTurnRequest,
  handleRuntimeTurnRequest,
  JsonResponseFn,
  RequireAuthenticatedActor,
  SseResponseFn,
} from "./runtimeTurnHandlers";

type HttpRouterLike = {
  route: (config: {
    path: string;
    method: string;
    handler: unknown;
  }) => void;
};

type HttpActionLike = (handler: (ctx: unknown, req: Request) => Promise<Response>) => unknown;

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
    path: "/runtime/public_turn",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, req) => optionsResponse(req)),
  });

  http.route({
    path: "/runtime/runtime_turn",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, req) => optionsResponse(req)),
  });

  http.route({
    path: "/runtime/public_turn",
    method: "POST",
    handler: httpAction(async (_ctx, req) =>
      handlePublicTurnRequest({ req, jsonResponse, sseResponse }),
    ),
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

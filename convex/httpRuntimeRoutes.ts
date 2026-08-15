import {
  handleRuntimeTurnRequest,
  JsonResponseFn,
  RequireAuthenticatedActor,
  SseResponseFn,
} from "./runtimeTurnHandlers";
import { internal } from "./_generated/api";
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

  http.route({
    path: "/runtime/runtime_cancel",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, req) => optionsResponse(req)),
  });

  http.route({
    path: "/runtime/runtime_cancel",
    method: "POST",
    handler: httpAction(async (ctx: any, req) => {
      const auth = await requireAuthenticatedActor(ctx, req);
      if (!auth.ok) return auth.response;
      let input: { thread_id?: string; run_id?: string };
      try {
        input = (await req.json()) as { thread_id?: string; run_id?: string };
      } catch {
        return jsonResponse(req, 400, {
          ok: false,
          code: "invalid_request",
          message: "Invalid JSON payload.",
        });
      }
      const threadKey = String(input.thread_id ?? "").trim();
      const runId = String(input.run_id ?? "").trim();
      if (!threadKey || !runId) {
        return jsonResponse(req, 400, {
          ok: false,
          code: "runtime_cancel_scope_required",
          message: "thread_id and run_id are required.",
        });
      }
      const run = (await ctx.runMutation(
        internal.threads.cancelCloudRuntimeRunByThreadKeyInternal,
        {
          ownerId: auth.actor.dbUserId,
          threadKey,
          runId,
          nowMs: Date.now(),
        },
      )) as { status?: string; reason?: string; runId?: string } | null;
      if (!run) {
        return jsonResponse(req, 404, {
          ok: false,
          code: "runtime_run_not_found",
          message: "Runtime run not found.",
        });
      }
      return jsonResponse(req, 200, {
        ok: true,
        run_id: String(run.runId ?? runId),
        status: String(run.status ?? ""),
        reason: String(run.reason ?? "") || null,
      });
    }),
  });

}

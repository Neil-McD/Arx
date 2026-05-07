import { internal } from "./_generated/api";

type HttpRouterLike = {
  route: (config: {
    path: string;
    method: "GET" | "POST" | "DELETE" | "OPTIONS" | "PUT" | "PATCH";
    handler: any;
  }) => void;
};

type HttpActionLike = (handler: (ctx: any, req: Request) => Promise<Response>) => unknown;

function htmlResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function redirectResponse(url: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      "Cache-Control": "no-store",
    },
  });
}

export function registerAppOAuthRoutes(args: {
  http: HttpRouterLike;
  httpAction: HttpActionLike;
}): void {
  const { http, httpAction } = args;
  http.route({
    path: "/app-oauth/callback",
    method: "GET",
    handler: httpAction(async (ctx, req) => {
      const url = new URL(req.url);
      const result = (await ctx.runAction(
        internal.appOAuth.completeAppOAuthCallbackInternal,
        {
          state: url.searchParams.get("state") ?? "",
          code: url.searchParams.get("code") ?? undefined,
          oauthError: url.searchParams.get("error") ?? undefined,
          oauthErrorDescription:
            url.searchParams.get("error_description") ?? undefined,
        },
      )) as { redirect_url?: unknown } | null;
      const redirectUrl =
        typeof result?.redirect_url === "string" && result.redirect_url.trim()
          ? result.redirect_url.trim()
          : "";
      if (!redirectUrl) {
        return htmlResponse(
          500,
          "Polynet could not complete this app connection. Return to Polynet and try again.",
        );
      }
      return redirectResponse(redirectUrl);
    }),
  });
}

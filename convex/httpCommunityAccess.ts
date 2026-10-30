import { internal } from "./_generated/api";

// The read-only access lookup for a registered outside service (an access
// integration such as a paid MCP server), authenticated with its server API key:
//
//   GET  /access/v1/communities/<slug>/members?email=<verified email>
//   GET  /access/v1/communities/<slug>/members/<member id>
//   GET  /access/v1/communities/<slug>/members            (every member, paged by ?cursor=)
//   POST /access/v1/communities/<slug>/licenses/verify    {"key": "pnk_..."}
//   POST /access/v1/communities/<slug>/sign-in/redeem     {"code": "pnc_...", "return_url": "..."}
//
// A license key travels in a POST body, never in a URL, so it stays out of
// access logs. Every answer is computed live from the membership; anything
// unknown answers "not entitled".

const PREFIX = "/access/v1/communities/";

type HttpRouterLike = { route: (config: any) => void };
type HttpActionLike = (handler: (ctx: any, req: Request) => Promise<Response>) => unknown;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function bearer(req: Request): string {
  const raw = String(req.headers.get("authorization") ?? "").trim();
  return raw.toLowerCase().startsWith("bearer ") ? raw.slice(7).trim() : "";
}

function parsePath(req: Request): { slug: string; rest: string[] } | null {
  const path = new URL(req.url).pathname;
  if (!path.startsWith(PREFIX)) return null;
  const parts = path.slice(PREFIX.length).split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  const [slug, ...rest] = parts;
  return slug ? { slug, rest } : null;
}

export function registerCommunityAccessRoutes(args: { http: HttpRouterLike; httpAction: HttpActionLike }): void {
  const { http, httpAction } = args;

  http.route({
    pathPrefix: PREFIX,
    method: "GET",
    handler: httpAction(async (ctx, req) => {
      const parsed = parsePath(req);
      if (!parsed || parsed.rest[0] !== "members" || parsed.rest.length > 2) return json(404, { error: "not_found" });
      const url = new URL(req.url);
      const email = url.searchParams.get("email");
      const memberId = parsed.rest[1];
      const lookup = memberId
        ? { mode: "member" as const, value: memberId }
        : email !== null
          ? { mode: "email" as const, value: email }
          : { mode: "list" as const, cursor: url.searchParams.get("cursor") || null };
      const result = await ctx.runMutation((internal as any).communityAccess.lookupCommunityAccessInternal, {
        slug: parsed.slug, apiKey: bearer(req), ...lookup,
      });
      return json(result.status, result.body);
    }),
  });

  http.route({
    pathPrefix: PREFIX,
    method: "POST",
    handler: httpAction(async (ctx, req) => {
      const parsed = parsePath(req);
      const route = parsed?.rest.join("/");
      if (!parsed || (route !== "licenses/verify" && route !== "sign-in/redeem")) return json(404, { error: "not_found" });
      let body: any = null;
      try { body = await req.json(); } catch { body = null; }
      if (route === "sign-in/redeem") {
        const result = await ctx.runMutation((internal as any).communityAccess.lookupCommunityAccessInternal, {
          slug: parsed.slug, apiKey: bearer(req), mode: "sign_in",
          value: typeof body?.code === "string" ? body.code : "", returnUrl: typeof body?.return_url === "string" ? body.return_url : "",
        });
        return json(result.status, result.body);
      }
      const key = typeof body?.key === "string" ? body.key : typeof body?.license_key === "string" ? body.license_key : "";
      const result = await ctx.runMutation((internal as any).communityAccess.lookupCommunityAccessInternal, {
        slug: parsed.slug, apiKey: bearer(req), mode: "license", value: key,
      });
      return json(result.status, result.body);
    }),
  });
}

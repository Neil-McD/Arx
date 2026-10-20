// polynet deploy: a founder's static site goes live at <slug>.<sites domain>.
//
//   POST /runtime/sites/deploy/start    { community, manifest }  -> Cloudflare upload pass
//   (the CLI uploads only the missing files straight to Cloudflare with that pass)
//   POST /runtime/sites/deploy/publish  { community, completion_jwt, files, bytes } -> live URL
//
// The caller is the founder's own signed-in tool (the Polynet MCP sign-in), with
// builder authority (owner or admin) in that community. Polynet holds the
// Cloudflare token; founders never touch Cloudflare.
import { internal } from "./_generated/api";
import { derivePolynetHumanAuthority } from "../shared/polynetAuthority";
import { siteHostname, siteScriptName, validateSiteManifest } from "./communitySites";

const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";
const MAX_BODY_BYTES = 1024 * 1024;
// Each site's only code: assets are served first; anything else is not found.
const SITE_MODULE = `export default { async fetch() { return new Response("Not found", { status: 404 }); } };\n`;

type PublicHttpAction = any;
type HttpRouterLike = {
  route: (config: { path: string; method: "POST"; handler: PublicHttpAction }) => void;
};
type HttpActionLike = (handler: (ctx: any, req: Request) => Promise<Response>) => PublicHttpAction;
type RequireAuthenticatedActor = (ctx: any, req: Request) => Promise<
  | { ok: true; actor: { authSubject: string; dbUserId: any } }
  | { ok: false; response: Response }
>;

type SitesConfig = { token: string; accountId: string; namespace: string; routesKvId: string; domain: string };

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function readSitesConfig(env: Record<string, string | undefined> = process.env): SitesConfig | null {
  const config = {
    token: env.CLOUDFLARE_API_TOKEN ?? "",
    accountId: env.CLOUDFLARE_ACCOUNT_ID ?? "",
    namespace: env.POLYNET_SITES_NAMESPACE ?? "",
    routesKvId: env.POLYNET_SITES_ROUTES_KV_ID ?? "",
    domain: env.POLYNET_SITES_DOMAIN ?? "",
  };
  return Object.values(config).every(Boolean) ? config : null;
}

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function cloudflare(config: SitesConfig, path: string, init: RequestInit): Promise<{ ok: boolean; result: any; status: number }> {
  const response = await fetch(`${CLOUDFLARE_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${config.token}`, ...(init.headers ?? {}) },
  });
  const body = (await response.json().catch(() => null)) as { success?: boolean; result?: unknown } | null;
  return { ok: response.ok && body?.success !== false, result: body?.result ?? null, status: response.status };
}

// The signed-in founder, their builder authority in this community, and the site's name.
async function authorizeDeploy(args: {
  ctx: any; req: Request; body: Record<string, unknown>; requireAuthenticatedActor: RequireAuthenticatedActor; config: SitesConfig;
}): Promise<
  | { ok: true; communityId: string; communitySlug: string; userId: any; hostname: string; script: string }
  | { ok: false; response: Response }
> {
  const auth = await args.requireAuthenticatedActor(args.ctx, args.req);
  if (!auth.ok) return auth;
  const communitySlug = typeof args.body.community === "string" ? args.body.community.trim().toLowerCase() : "";
  const resolved = communitySlug
    ? ((await args.ctx.runQuery((internal as any).communityCapabilityContext.resolveCommunityCapabilityContextForTrustedActorInternal, {
        authSubject: auth.actor.authSubject, userId: auth.actor.dbUserId, communitySlug,
      })) as { ok: true; context: { communityId: string; communitySlug: string; access: Record<string, unknown> } } | { ok: false })
    : { ok: false as const };
  const authority = resolved.ok
    ? derivePolynetHumanAuthority({ access: resolved.context.access, principalKind: "external_mcp" })
    : null;
  if (!resolved.ok || !authority?.canUseBuilderProjection) {
    return { ok: false, response: reply(403, { ok: false, code: "not_a_builder", message: "Only the community's owner or admins can deploy its site." }) };
  }
  const hostname = siteHostname(resolved.context.communitySlug, args.config.domain);
  if (!hostname) {
    return { ok: false, response: reply(400, { ok: false, code: "site_name_unavailable", message: "This community's name can't be used as a site address." }) };
  }
  return {
    ok: true, communityId: resolved.context.communityId, communitySlug: resolved.context.communitySlug,
    userId: auth.actor.dbUserId, hostname, script: siteScriptName(resolved.context.communitySlug),
  };
}

export function registerCommunitySiteRoutes(args: {
  http: HttpRouterLike; httpAction: HttpActionLike; requireAuthenticatedActor: RequireAuthenticatedActor;
}) {
  args.http.route({
    path: "/runtime/sites/deploy/start",
    method: "POST",
    handler: args.httpAction(async (ctx, req) => {
      const config = readSitesConfig();
      if (!config) return reply(503, { ok: false, code: "sites_unconfigured", message: "Site hosting isn't set up here." });
      const body = await readBody(req);
      if (!body) return reply(400, { ok: false, code: "invalid_request", message: "Send JSON." });
      const site = await authorizeDeploy({ ctx, req, body, requireAuthenticatedActor: args.requireAuthenticatedActor, config });
      if (!site.ok) return site.response;
      const manifest = validateSiteManifest(body.manifest);
      if (!manifest.ok) return reply(400, { ok: false, code: manifest.code, message: manifest.message });
      const session = await cloudflare(config,
        `/accounts/${config.accountId}/workers/dispatch/namespaces/${config.namespace}/scripts/${site.script}/assets-upload-session`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ manifest: manifest.manifest }) });
      if (!session.ok || typeof session.result?.jwt !== "string") {
        return reply(502, { ok: false, code: "upload_session_failed", message: "Couldn't start the upload. Try again." });
      }
      return reply(200, {
        ok: true,
        hostname: site.hostname,
        upload: {
          url: `${CLOUDFLARE_API}/accounts/${config.accountId}/workers/assets/upload?base64=true`,
          jwt: session.result.jwt,
          buckets: Array.isArray(session.result.buckets) ? session.result.buckets : [],
        },
      });
    }),
  });

  args.http.route({
    path: "/runtime/sites/deploy/publish",
    method: "POST",
    handler: args.httpAction(async (ctx, req) => {
      const config = readSitesConfig();
      if (!config) return reply(503, { ok: false, code: "sites_unconfigured", message: "Site hosting isn't set up here." });
      const body = await readBody(req);
      if (!body || typeof body.completion_jwt !== "string" || !body.completion_jwt) {
        return reply(400, { ok: false, code: "invalid_request", message: "Send the completion token from the upload." });
      }
      const site = await authorizeDeploy({ ctx, req, body, requireAuthenticatedActor: args.requireAuthenticatedActor, config });
      if (!site.ok) return site.response;

      const form = new FormData();
      form.append("metadata", new Blob([JSON.stringify({
        main_module: "index.js",
        compatibility_date: "2026-09-30",
        assets: {
          jwt: body.completion_jwt,
          config: { html_handling: "auto-trailing-slash", not_found_handling: "single-page-application" },
        },
      })], { type: "application/json" }));
      form.append("index.js", new Blob([SITE_MODULE], { type: "application/javascript+module" }), "index.js");
      const deployed = await cloudflare(config,
        `/accounts/${config.accountId}/workers/dispatch/namespaces/${config.namespace}/scripts/${site.script}`,
        { method: "PUT", body: form });
      if (!deployed.ok) return reply(502, { ok: false, code: "publish_failed", message: "Couldn't publish the site. Deploy again." });

      const mapped = await cloudflare(config,
        `/accounts/${config.accountId}/storage/kv/namespaces/${config.routesKvId}/values/${encodeURIComponent(`host:${site.hostname}`)}`,
        { method: "PUT", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ script: site.script, community: site.communitySlug }) });
      if (!mapped.ok) return reply(502, { ok: false, code: "route_failed", message: "Published, but the address isn't connected yet. Deploy again." });

      try {
        await ctx.runMutation((internal as any).communitySites.recordCommunitySiteDeployInternal, {
          communityId: site.communityId, userId: site.userId, hostname: site.hostname,
          fileCount: Number(body.files) || 0, totalBytes: Number(body.bytes) || 0,
        });
      } catch (error) {
        const taken = error instanceof Error && error.message.includes("community_domain_taken");
        return reply(taken ? 409 : 500, { ok: false, code: taken ? "site_address_taken" : "record_failed", message: taken ? "That address belongs to another community." : "Published, but couldn't finish setup. Deploy again." });
      }
      return reply(200, { ok: true, url: `https://${site.hostname}` });
    }),
  });
}

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
import { publishSite, readSitesConfig, startSiteUpload, type SitesConfig } from "./communitySiteDeploy";

const MAX_BODY_BYTES = 1024 * 1024;

type PublicHttpAction = any;
type HttpRouterLike = {
  route: (config: { path: string; method: "POST"; handler: PublicHttpAction }) => void;
};
type HttpActionLike = (handler: (ctx: any, req: Request) => Promise<Response>) => PublicHttpAction;
type RequireAuthenticatedActor = (ctx: any, req: Request) => Promise<
  | { ok: true; actor: { authSubject: string; dbUserId: any } }
  | { ok: false; response: Response }
>;


function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
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
  const hostname = siteHostname(resolved.context.communitySlug, args.config.domain, args.config.hostSuffix);
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
      const upload = await startSiteUpload(config, site.script, manifest.manifest);
      if (!upload) return reply(502, { ok: false, code: "upload_session_failed", message: "Couldn't start the upload. Try again." });
      return reply(200, { ok: true, hostname: site.hostname, upload });
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

      const published = await publishSite({
        ctx, config, site, completionJwt: body.completion_jwt,
        files: Number(body.files) || 0, bytes: Number(body.bytes) || 0,
      });
      if (!published.ok) {
        const status = published.code === "site_address_taken" ? 409 : published.code === "record_failed" ? 500 : 502;
        return reply(status, { ok: false, code: published.code, message: published.message });
      }
      return reply(200, { ok: true, url: published.url });
    }),
  });
}

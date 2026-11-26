// One door: the routes a builder's own app calls, server to server, with the
// secret Polynet gave it ("Authorization: Bearer psk_..."). No browser calls
// these: no CORS, and nothing here takes a Polynet session.
import { internal } from "./_generated/api";
import { sha256Hex } from "./communityCheckoutBuyer";

export const CONNECTED_APP_ACCESS_PATH = "/apps/v1/access";
export const CONNECTED_APP_SALES_PATH = "/apps/v1/sales";
export const CONNECTED_APP_OAUTH_TOKEN_PATH = "/apps/v1/oauth/token";
export const CONNECTED_APP_MILESTONES_PATH = "/apps/v1/milestones";

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

async function requireApp(ctx: any, req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const match = /^bearer\s+(psk_[a-f0-9]{48})$/i.exec(header.trim());
  const secret = match && /^psk_[a-f0-9]{48}$/.test(match[1]) ? match[1] : null;
  if (!secret) return json(401, { error: "app_secret_required" });
  const app = await ctx.runQuery(internal.connectedApps.resolveConnectedAppBySecretInternal, { secretHash: await sha256Hex(secret) });
  return app ?? json(401, { error: "app_secret_invalid" });
}

export function registerConnectedAppRoutes(args: { http: any; httpAction: any }) {
  // What does this person (by verified email) have in the app's community?
  // { allowed, tier: { key, name } | null, grants: string[] }
  args.http.route({
    path: CONNECTED_APP_ACCESS_PATH,
    method: "GET",
    handler: args.httpAction(async (ctx: any, req: Request) => {
      const app = await requireApp(ctx, req);
      if (app instanceof Response) return app;
      const email = String(new URL(req.url).searchParams.get("email") ?? "").trim().toLowerCase();
      if (!email || email.length > 320 || !email.includes("@")) return json(400, { error: "email_required" });
      const access = await ctx.runQuery(internal.connectedApps.accessForEmailInternal, { communityId: app.communityId, email });
      return json(200, access);
    }),
  });

  // A sale the app made through its own checkout (no fee), or its end:
  // { email, active, tier?, external_ref? }. The latest report per email wins.
  args.http.route({
    path: CONNECTED_APP_SALES_PATH,
    method: "POST",
    handler: args.httpAction(async (ctx: any, req: Request) => {
      const app = await requireApp(ctx, req);
      if (app instanceof Response) return app;
      let body: any = null;
      try { body = JSON.parse((await req.text()).slice(0, 4_000)); } catch { body = null; }
      const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!email || email.length > 320 || !email.includes("@") || typeof body?.active !== "boolean") return json(400, { error: "email_and_active_required" });
      try {
        const result = await ctx.runMutation(internal.communityAppSales.recordAppSaleInternal, {
          appId: app.appId, communityId: app.communityId, email, active: body.active,
          ...(typeof body.tier === "string" && body.tier ? { tierKey: body.tier } : {}),
          ...(typeof body.external_ref === "string" && body.external_ref ? { externalRef: body.external_ref } : {}),
        });
        return json(200, result);
      } catch (error) {
        const code = error instanceof Error ? error.message : "";
        if (code.includes("community_tier_not_found")) return json(400, { error: "tier_not_found" });
        throw error;
      }
    }),
  });

  // Sign in with Polynet: exchange a one-time OAuth 2.1 + PKCE authorization
  // code for verified user identity + live server-evaluated community access.
  args.http.route({
    path: CONNECTED_APP_OAUTH_TOKEN_PATH,
    method: "POST",
    handler: args.httpAction(async (ctx: any, req: Request) => {
      const app = await requireApp(ctx, req);
      if (app instanceof Response) return app;
      const raw = await req.text();
      if (raw.length > 4_000) return json(413, { error: "invalid_request" });
      const contentType = String(req.headers.get("content-type") ?? "").toLowerCase();
      let grantType = "";
      let code = "";
      let redirectUri = "";
      let codeVerifier = "";
      if (contentType.includes("application/x-www-form-urlencoded")) {
        const params = new URLSearchParams(raw);
        grantType = String(params.get("grant_type") ?? "").trim();
        code = String(params.get("code") ?? "").trim();
        redirectUri = String(params.get("redirect_uri") ?? "").trim();
        codeVerifier = String(params.get("code_verifier") ?? "").trim();
      } else {
        let body: any = null;
        try { body = JSON.parse(raw); } catch { body = null; }
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          return json(400, { error: "invalid_request" });
        }
        grantType = typeof body.grant_type === "string" ? body.grant_type.trim() : "";
        code = typeof body.code === "string" ? body.code.trim() : "";
        redirectUri = typeof body.redirect_uri === "string" ? body.redirect_uri.trim() : "";
        codeVerifier = typeof body.code_verifier === "string" ? body.code_verifier.trim() : "";
      }
      if (!grantType) {
        return json(400, { error: "invalid_request" });
      }
      if (grantType !== "authorization_code") {
        return json(400, { error: "unsupported_grant_type" });
      }
      if (!/^pcode_[a-f0-9]{48}$/.test(code) || !redirectUri || !codeVerifier) {
        return json(400, { error: "invalid_request" });
      }
      const exchanged = await ctx.runMutation(internal.connectedApps.exchangeConnectedAppAuthCodeInternal, {
        appId: app.appId,
        communityId: app.communityId,
        codeHash: await sha256Hex(code),
        redirectUri,
        codeVerifier,
      });
      if (!exchanged.ok) {
        return json(400, { error: exchanged.error });
      }
      return json(200, { user: exchanged.user, access: exchanged.access });
    }),
  });

  // Report a member's product milestone or win directly onto their Member Board
  // card (source: "app") so automated onboarding and Chief of Staff reflect
  // real progress inside the founder's software.
  args.http.route({
    path: CONNECTED_APP_MILESTONES_PATH,
    method: "POST",
    handler: args.httpAction(async (ctx: any, req: Request) => {
      const app = await requireApp(ctx, req);
      if (app instanceof Response) return app;
      const raw = await req.text();
      if (raw.length > 4_000) return json(413, { error: "invalid_request" });
      let body: any = null;
      try { body = JSON.parse(raw); } catch { body = null; }
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return json(400, { error: "invalid_request" });
      }
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const milestone = typeof body.milestone === "string" ? body.milestone.trim().slice(0, 64) : "";
      const label = typeof body.label === "string" ? body.label.trim().slice(0, 64) : "";
      const outcome = typeof body.outcome === "string" ? body.outcome.trim().slice(0, 180) : "";
      const done = typeof body.done === "boolean" ? body.done : undefined;
      if (!email || email.length > 320 || !email.includes("@")) {
        return json(400, { error: "email_required" });
      }
      if (!milestone && !outcome) {
        return json(400, { error: "milestone_or_outcome_required" });
      }
      const result = await ctx.runMutation(internal.communityMemberJourney.recordConnectedAppMilestoneInternal, {
        communityId: app.communityId,
        email,
        ...(milestone ? { milestone } : {}),
        ...(label ? { label } : {}),
        ...(done !== undefined ? { done } : {}),
        ...(outcome ? { outcome } : {}),
      });
      return json(200, result);
    }),
  });
}

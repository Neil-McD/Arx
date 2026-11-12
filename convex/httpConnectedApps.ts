// One door: the routes a builder's own app calls, server to server, with the
// secret Polynet gave it ("Authorization: Bearer psk_..."). No browser calls
// these: no CORS, and nothing here takes a Polynet session.
import { internal } from "./_generated/api";
import { sha256Hex } from "./communityCheckoutBuyer";

export const CONNECTED_APP_ACCESS_PATH = "/apps/v1/access";

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

async function requireApp(ctx: any, req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const secret = /^Bearer\s+(psk_[a-f0-9]{48})$/.exec(header.trim())?.[1];
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
}

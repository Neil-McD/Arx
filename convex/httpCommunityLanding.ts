// A signed-out buyer's checkout from a community's landing page (/c/<slug>),
// cash first. Only the app's own server function (api/community-checkout.js)
// may call it, proved by the auth bridge secret, and it sends a keyed hash of
// the visitor's address (never the address) so each visitor gets a few
// checkouts and can't use up a community's allowance for everyone else
// (communityCheckoutBuyer.guestCheckoutAllowed). The buyer's secret goes back
// to that browser, which keeps it until it signs in and claims the payment.
import { startCommunityJoinCheckoutCore } from "./communityCommerce";
import { readCanonicalPublicAppOrigin } from "./publicAppUrl";

export const COMMUNITY_LANDING_GUEST_CHECKOUT_PATH = "/runtime/landing/guest-checkout";

function readEnv(name: string): string {
  return String(process.env?.[name] ?? "").trim();
}

function bridgeSecretMatches(req: Request): boolean {
  const expected = readEnv("ARX_AUTH_BRIDGE_SECRET");
  const provided = String(req.headers.get("x-arx-auth-bridge-secret") ?? "").trim();
  if (!expected || !provided || provided.length !== expected.length) return false;
  let diff = 0;
  for (let index = 0; index < expected.length; index += 1) diff |= provided.charCodeAt(index) ^ expected.charCodeAt(index);
  return diff === 0;
}

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

export function registerCommunityLandingRoutes(args: { http: any; httpAction: any }) {
  args.http.route({
    path: COMMUNITY_LANDING_GUEST_CHECKOUT_PATH,
    method: "POST",
    handler: args.httpAction(async (ctx: any, req: Request) => {
      if (!bridgeSecretMatches(req)) return reply(401, { ok: false, code: "unauthorized" });
      let body: any = null;
      try { body = await req.json(); } catch { body = null; }
      const slug = typeof body?.communitySlug === "string" ? body.communitySlug.trim().toLowerCase() : "";
      const period = body?.billingPeriod;
      const plan = typeof body?.plan === "string" && body.plan ? body.plan : null;
      const visitorHash = typeof body?.visitorHash === "string" ? body.visitorHash : "";
      if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug) || (period !== "monthly" && period !== "annual")) return reply(400, { ok: false, code: "invalid_request" });
      if (plan !== null && (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(plan) || period !== "monthly")) return reply(400, { ok: false, code: "invalid_request" });
      if (!/^[a-f0-9]{64}$/.test(visitorHash)) return reply(400, { ok: false, code: "invalid_request" });
      const page = `${readCanonicalPublicAppOrigin()}/c/${encodeURIComponent(slug)}`;
      try {
        const started = await startCommunityJoinCheckoutCore(ctx, {
          communitySlug: slug, billingPeriod: period, guest: true, visitorHash,
          successUrl: `${page}?checkout={CHECKOUT_SESSION_ID}`, cancelUrl: `${page}?checkout=canceled`,
          ...(plan ? { tierKey: plan } : {}),
        });
        if (!started.buyer_secret) return reply(500, { ok: false, code: "join_unavailable" });
        return reply(200, { ok: true, checkout_url: started.checkout_url, session_id: started.session_id, buyer_secret: started.buyer_secret });
      } catch (error) {
        const code = error instanceof Error ? error.message.replace(/^.*?([a-z_]{6,})$/s, "$1").slice(0, 80) : "join_unavailable";
        return reply(409, { ok: false, code });
      }
    }),
  });
}

// A signed-out buyer's checkout from a community's landing page (cash first).
// The browser posts here; this function turns the visitor's address into a
// keyed hash (the address itself never leaves this function) and asks the
// backend, with the auth bridge secret, to start the checkout. The backend
// limits each visitor's checkouts with that hash, so one visitor can't use up
// a community's checkouts for everyone else.
import { createHmac } from "node:crypto";

function readEnv(name) {
  return String(process.env?.[name] ?? "").trim();
}

function convexSiteUrl() {
  const site = readEnv("VITE_CONVEX_SITE_URL") || readEnv("VITE_PUBLIC_CONVEX_SITE_URL") || readEnv("PUBLIC_CONVEX_SITE_URL");
  if (site) return site.replace(/\/+$/, "");
  const cloud = readEnv("VITE_CONVEX_URL") || readEnv("VITE_PUBLIC_CONVEX_URL") || readEnv("PUBLIC_CONVEX_URL");
  return cloud ? cloud.replace(/\/+$/, "").replace(/\.convex\.cloud$/, ".convex.site") : "";
}

// Vercel puts the visitor's address first in x-forwarded-for (and x-real-ip).
export function visitorAddress(headers) {
  const real = String(headers?.["x-real-ip"] ?? "").trim();
  if (real) return real;
  return String(headers?.["x-forwarded-for"] ?? "").split(",")[0].trim();
}

export function visitorHash(address, secret) {
  return createHmac("sha256", secret).update(`landing-visitor:${address}`).digest("hex");
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return null; } }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { ok: false, code: "method_not_allowed" });
  const secret = readEnv("ARX_AUTH_BRIDGE_SECRET");
  const base = convexSiteUrl();
  if (!secret || !base) return send(res, 503, { ok: false, code: "join_unavailable" });
  const body = await readBody(req);
  const address = visitorAddress(req.headers);
  if (!address) return send(res, 400, { ok: false, code: "invalid_request" });
  try {
    const upstream = await fetch(`${base}/runtime/landing/guest-checkout`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-arx-auth-bridge-secret": secret },
      body: JSON.stringify({
        communitySlug: body?.communitySlug,
        billingPeriod: body?.billingPeriod,
        plan: body?.plan ?? null,
        visitorHash: visitorHash(address, secret),
      }),
    });
    const payload = await upstream.json().catch(() => ({ ok: false, code: "join_unavailable" }));
    return send(res, upstream.status, payload);
  } catch {
    return send(res, 502, { ok: false, code: "join_unavailable" });
  }
}

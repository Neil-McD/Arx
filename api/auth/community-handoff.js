import { callAuthBridgeJson } from "./_bridge.js";
import { getRequestOrigin, readAuthSessionId } from "./_cookies.js";

// "Sign in with Polynet" for a community's own domain.
//
// The community edge sends the member here with community, redirect_uri and
// state. With a Polynet session, the backend checks membership and that
// redirect_uri belongs to a registered address for that community. The first
// time (or when the front end's permissions change) the member must approve the
// front end acting as them; then this page redirects back with a one-time code.
// Unregistered addresses never receive a redirect, so this is not an open redirect.

const CALLBACK_PATH = "/__polynet/auth/callback";
const STATE_PATTERN = /^[A-Za-z0-9_-]{22,128}$/;
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const TOOL_LABELS = {
  polynet_list: "See what's in the community",
  polynet_read: "Read posts, resources and events you can read",
  polynet_search: "Search the community",
  polynet_write: "Post as you",
  polynet_call: "Take actions as you, like submitting your forms",
};

function sendText(res, status, message) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(message);
}

function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader("Location", location);
  res.setHeader("Cache-Control", "no-store");
  res.end();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

// Exact callback on HTTPS, or http on localhost / *.localhost for development.
export function parseCommunityCallback(raw) {
  let url;
  try {
    url = new URL(String(raw ?? ""));
  } catch {
    return null;
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== CALLBACK_PATH) return null;
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname.endsWith(".localhost");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
  return url;
}

function readParams(req) {
  if (req.method === "POST") {
    const body = req.body;
    if (body && typeof body === "object") return new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)]));
    return new URLSearchParams(typeof body === "string" ? body : "");
  }
  return new URL(req.url ?? "/", "http://polynet.local").searchParams;
}

function renderConsent(res, app, params, callbackOrigin) {
  const tools = (app.tools ?? []).map((tool) => `<li>${escapeHtml(TOOL_LABELS[tool] ?? tool)}</li>`).join("");
  const hidden = ["community", "redirect_uri", "state"]
    .map((name) => `<input type="hidden" name="${name}" value="${escapeHtml(params.get(name))}">`).join("");
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  // form-action also governs the redirect after posting, so it must allow the
  // community's validated callback origin as well as this page.
  res.setHeader("Content-Security-Policy", `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${callbackOrigin}; frame-ancestors 'none'`);
  res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Allow access</title>
<style>:root{color-scheme:light dark;font-family:system-ui,sans-serif}body{margin:0;display:grid;place-items:center;min-height:100vh}main{max-width:420px;padding:24px}button{padding:10px 16px;border-radius:8px;border:1px solid #8886;margin-right:8px;cursor:pointer}.primary{font-weight:600}.origin{opacity:.7;word-break:break-all}</style></head>
<body><main><h1>Allow ${escapeHtml(app.name)}?</h1>
<p><strong>${escapeHtml(app.name)}</strong> is the front end of <strong>${escapeHtml(app.community_name)}</strong> on Polynet.</p>
<p class="origin">${escapeHtml(app.origin)}</p>
<p>It will be able to act as you, only in this community:</p><ul>${tools}</ul>
<p>It can't see your account, payments or direct messages.</p>
<form method="post">${hidden}<button class="primary" name="decision" value="approve" type="submit">Allow</button><button name="decision" value="cancel" type="submit">Cancel</button></form>
</main></body></html>`);
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    sendText(res, 405, "Method not allowed.");
    return;
  }
  // Consent decisions must come from this page, not another site.
  if (req.method === "POST" && String(req.headers.origin ?? "") !== getRequestOrigin(req)) {
    sendText(res, 403, "This request could not be verified.");
    return;
  }
  const params = readParams(req);
  const communitySlug = String(params.get("community") ?? "").trim().toLowerCase();
  const state = String(params.get("state") ?? "");
  const callback = parseCommunityCallback(params.get("redirect_uri"));
  if (!SLUG_PATTERN.test(communitySlug) || !STATE_PATTERN.test(state) || !callback) {
    sendText(res, 400, "This sign-in link is invalid.");
    return;
  }

  const query = new URLSearchParams({ community: communitySlug, redirect_uri: callback.toString(), state });
  const returnTo = `/api/auth/community-handoff?${query.toString()}`;
  const sessionId = readAuthSessionId(req);
  if (!sessionId) {
    redirect(res, `/login?returnTo=${encodeURIComponent(returnTo)}`);
    return;
  }
  if (req.method === "POST" && params.get("decision") !== "approve") {
    redirect(res, `${callback.origin}/`);
    return;
  }

  let response;
  try {
    response = await callAuthBridgeJson("/runtime/auth_bridge_community_handoff", {
      payload: { session_id: sessionId, community_slug: communitySlug, origin: callback.origin, state, consent: req.method === "POST" },
    });
  } catch {
    sendText(res, 503, "Sign-in is temporarily unavailable. Try again.");
    return;
  }
  const payload = await response.json().catch(() => null);
  if (response.ok && payload?.ok === true && typeof payload.code === "string") {
    const target = new URL(callback.toString());
    target.searchParams.set("code", payload.code);
    target.searchParams.set("state", state);
    redirect(res, target.toString());
    return;
  }
  if (payload?.code === "consent_required" && payload.app) {
    renderConsent(res, payload.app, query, callback.origin);
    return;
  }
  if (payload?.code === "sign_in_required") {
    redirect(res, `/login?returnTo=${encodeURIComponent(returnTo)}`);
    return;
  }
  if (payload?.code === "not_a_member") {
    redirect(res, `/c/${encodeURIComponent(communitySlug)}`);
    return;
  }
  if (payload?.code === "rate_limited") {
    sendText(res, 429, "Too many sign-in attempts. Try again later.");
    return;
  }
  sendText(res, 400, "This community address isn't registered for sign-in.");
}

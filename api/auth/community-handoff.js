import { callAuthBridgeJson } from "./_bridge.js";
import { readAuthSessionId } from "./_cookies.js";

// "Sign in with Polynet" for a community's own domain.
//
// The community edge sends the member here with community, redirect_uri and
// state. With a Polynet session, the backend checks membership and that
// redirect_uri belongs to a registered domain of that community, then this
// page redirects back with a one-time code. Already signed in, the member sees
// nothing but a redirect. Unregistered domains never receive a redirect, so
// this is not an open redirect.

const CALLBACK_PATH = "/__polynet/auth/callback";
const STATE_PATTERN = /^[A-Za-z0-9_-]{22,128}$/;
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

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

export default async function handler(req, res) {
  if (req.method !== "GET") {
    sendText(res, 405, "Method not allowed.");
    return;
  }
  const params = new URL(req.url ?? "/", "http://polynet.local").searchParams;
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

  let response;
  try {
    response = await callAuthBridgeJson("/runtime/auth_bridge_community_handoff", {
      payload: { session_id: sessionId, community_slug: communitySlug, origin: callback.origin, state },
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
  if (payload?.code === "sign_in_required") {
    redirect(res, `/login?returnTo=${encodeURIComponent(returnTo)}`);
    return;
  }
  if (payload?.code === "not_a_member") {
    redirect(res, `/c/${encodeURIComponent(communitySlug)}`);
    return;
  }
  sendText(res, 400, "This community domain isn't registered for sign-in.");
}

import { callAuthBridgeJson, isSameOriginPost, sendJson } from "./_bridge.js";
import { clearAuthSessionCookie, readAuthSessionId } from "./_cookies.js";

const AUTH_LOGOUT_UNAVAILABLE_MESSAGE = "Sign out could not be confirmed. Please try again.";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "Method not allowed." });
    return;
  }

  if (!isSameOriginPost(req)) {
    sendJson(res, 403, { ok: false, error: "Origin mismatch." });
    return;
  }

  const sessionId = readAuthSessionId(req);
  if (sessionId) {
    let response;
    try {
      response = await callAuthBridgeJson("/runtime/auth_bridge_session_logout", {
        payload: { session_id: sessionId },
      });
    } catch {
      sendJson(res, 503, {
        ok: false,
        code: "auth_logout_unavailable",
        error: AUTH_LOGOUT_UNAVAILABLE_MESSAGE,
      });
      return;
    }
    if (!response.ok) {
      sendJson(res, 503, {
        ok: false,
        code: "auth_logout_unavailable",
        error: AUTH_LOGOUT_UNAVAILABLE_MESSAGE,
      });
      return;
    }
  }

  clearAuthSessionCookie(res, req);
  sendJson(res, 200, { ok: true });
}

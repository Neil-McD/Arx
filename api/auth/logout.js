import { callAuthBridgeJson, isSameOriginPost } from "./_bridge.js";
import { clearAuthSessionCookie, readAuthSessionId } from "./_cookies.js";

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    try {
      const response = await callAuthBridgeJson("/runtime/auth_bridge_session_logout", {
        payload: { session_id: sessionId },
        signal: controller.signal,
      });
      const payload = response.ok ? await response.json() : null;
      if (!response.ok || payload?.ok !== true) throw new Error("logout_unconfirmed");
    } catch {
      // Keep the opaque cookie so retry can resolve an uncertain outcome.
      sendJson(res, 503, { ok: false, error: "logout_unconfirmed", message: "Sign out couldn't be confirmed. Try again." });
      return;
    } finally {
      clearTimeout(timeout);
    }
  }

  clearAuthSessionCookie(res, req);
  sendJson(res, 200, { ok: true });
}

import { callAuthBridgeJson } from "./_bridge.js";
import { clearAuthSessionCookie, readAuthSessionId } from "./_cookies.js";

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function isSameOriginPost(req) {
  const origin = String(req.headers.origin ?? "").trim();
  if (!origin) return true;
  const proto = String(req.headers["x-forwarded-proto"] ?? "").trim() || "https";
  const host = String(req.headers.host ?? "").trim();
  return Boolean(host) && origin === `${proto}://${host}`;
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
    try {
      await callAuthBridgeJson("/runtime/auth_bridge_session_logout", {
        payload: { session_id: sessionId },
      });
    } catch {
      // best effort only
    }
  }

  clearAuthSessionCookie(res, req);
  sendJson(res, 200, { ok: true });
}

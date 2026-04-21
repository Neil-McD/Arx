import { callAuthBridgeJson, isSameOriginPost, readResponseError } from "./_bridge.js";
import { clearAuthSessionCookie, readAuthSessionId, setAuthSessionCookie } from "./_cookies.js";

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
  if (!sessionId) {
    clearAuthSessionCookie(res, req);
    sendJson(res, 401, { ok: false, error: "Missing auth session." });
    return;
  }

  let response;
  try {
    response = await callAuthBridgeJson("/runtime/auth_bridge_session_refresh", {
      payload: { session_id: sessionId },
    });
  } catch (error) {
    sendJson(res, 503, {
      ok: false,
      error: error instanceof Error ? error.message : "Auth bridge is unavailable.",
    });
    return;
  }

  if (response.ok) {
    const payload = await response.json();
    const nextSessionId = typeof payload?.session_id === "string" ? payload.session_id.trim() : "";
    if (nextSessionId) {
      setAuthSessionCookie(res, req, nextSessionId);
    }
    sendJson(res, 200, {
      ok: true,
      session: payload?.session ?? null,
    });
    return;
  }

  if (response.status === 401) {
    clearAuthSessionCookie(res, req);
    sendJson(res, 401, { ok: false, error: await readResponseError(response) });
    return;
  }

  sendJson(res, 503, {
    ok: false,
    error: await readResponseError(response),
  });
}

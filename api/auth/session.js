import { callAuthBridgeJson, isSameOriginPost, readResponseError, sendJson } from "./_bridge.js";
import { clearAuthSessionCookie, readAuthSessionCookie } from "./_cookies.js";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, error: "Method not allowed." });
    return;
  }

  if (!isSameOriginPost(req)) {
    sendJson(res, 403, { ok: false, error: "Origin mismatch." });
    return;
  }

  const sessionCookie = readAuthSessionCookie(req);
  if (sessionCookie.status !== "valid") {
    if (sessionCookie.status === "invalid") clearAuthSessionCookie(res, req);
    sendJson(res, 200, {
      ok: true,
      session: null,
      trace: {
        bootstrap_path:
          sessionCookie.status === "invalid" ? "cleared_invalid_cookie" : "missing_cookie",
      },
    });
    return;
  }
  const sessionId = sessionCookie.value;

  let response;
  try {
    response = await callAuthBridgeJson("/runtime/auth_bridge_session_bootstrap", {
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
    sendJson(res, 200, {
      ok: true,
      session: payload?.session ?? null,
      trace: payload?.trace ?? null,
    });
    return;
  }

  if (response.status === 401) {
    clearAuthSessionCookie(res, req);
    sendJson(res, 200, {
      ok: true,
      session: null,
      trace: {
        bootstrap_path: "cleared_invalid_session",
      },
    });
    return;
  }

  sendJson(res, 503, {
    ok: false,
    error: await readResponseError(response),
  });
}

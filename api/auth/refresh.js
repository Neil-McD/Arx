import {
  callAuthBridgeJson,
  createAuthConvexDeadline,
  isSameOriginPost,
  readResponseError,
  sendJson,
} from "./_bridge.js";
import { clearAuthSessionCookie, readAuthSessionCookie } from "./_cookies.js";

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

  const sessionCookie = readAuthSessionCookie(req);
  if (sessionCookie.status !== "valid") {
    clearAuthSessionCookie(res, req);
    sendJson(res, 401, { ok: false, error: "Missing auth session." });
    return;
  }
  const sessionId = sessionCookie.value;

  let response;
  const deadlineAt = createAuthConvexDeadline();
  try {
    response = await callAuthBridgeJson("/runtime/auth_bridge_session_refresh", {
      payload: { session_id: sessionId },
    }, deadlineAt);
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

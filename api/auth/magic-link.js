import { callRuntimeAuthJson, isSameOriginPost, readResponseError } from "./_bridge.js";

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

  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  if (!email) {
    sendJson(res, 400, { ok: false, error: "email is required." });
    return;
  }

  let response;
  try {
    response = await callRuntimeAuthJson("/runtime/auth_send_magic_link_otp", {
      email,
      create_user: req.body?.create_user ?? true,
      redirect_to: req.body?.redirect_to,
      email_redirect_to: req.body?.email_redirect_to,
    });
  } catch (error) {
    sendJson(res, 503, {
      ok: false,
      error: error instanceof Error ? error.message : "Auth gateway is unavailable.",
    });
    return;
  }

  if (!response.ok) {
    sendJson(res, response.status, {
      ok: false,
      error: await readResponseError(response),
    });
    return;
  }

  sendJson(res, 200, { ok: true });
}

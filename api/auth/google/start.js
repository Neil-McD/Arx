import { callRuntimeAuthJson, readResponseError } from "../_bridge.js";
import { buildRedirectUrl, normalizeReturnToPath, setAuthFlowCookie } from "../_cookies.js";

function randomBase64Url(bytes) {
  const view = crypto.getRandomValues(new Uint8Array(bytes));
  return Buffer.from(view)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function createCodeChallenge(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return Buffer.from(new Uint8Array(digest))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function readString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Location", location);
  res.end();
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end("Method not allowed.");
    return;
  }

  const returnTo = normalizeReturnToPath(req.query?.return_to);
  const redirectTo = new URL(
    "/api/auth/google/callback",
    `${String(req.headers["x-forwarded-proto"] ?? "https")}://${req.headers.host}`,
  ).toString();
  const codeVerifier = randomBase64Url(64);
  const codeChallenge = await createCodeChallenge(codeVerifier);
  const state = randomBase64Url(24);

  let response;
  try {
    response = await callRuntimeAuthJson("/runtime/auth_begin_google_sign_in", {
      provider: "GoogleOAuth",
      redirect_to: redirectTo,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state,
    });
  } catch (error) {
    redirect(
      res,
      buildRedirectUrl(req, returnTo, {
        error: "auth_start_failed",
        error_description: error instanceof Error ? error.message : "Auth start failed.",
      }),
    );
    return;
  }

  if (!response.ok) {
    redirect(
      res,
      buildRedirectUrl(req, returnTo, {
        error: "auth_start_failed",
        error_description: await readResponseError(response),
      }),
    );
    return;
  }

  let authUrl = null;
  try {
    const payload = await response.json();
    authUrl = readString(payload?.auth_url) ?? readString(payload?.authUrl) ?? readString(payload?.url);
  } catch {
    authUrl = null;
  }

  if (!authUrl) {
    redirect(
      res,
      buildRedirectUrl(req, returnTo, {
        error: "auth_start_failed",
        error_description: "Authorize URL missing from auth runtime response.",
      }),
    );
    return;
  }

  setAuthFlowCookie(res, req, {
    state,
    codeVerifier,
    redirectTo,
    returnTo,
    createdAtMs: Date.now(),
  });
  redirect(res, authUrl);
}

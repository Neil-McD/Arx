import {
  callAuthBridgeJson,
  callRuntimeAuthJson,
  extractAccessTokenFromAuthPayload,
  readResponseError,
} from "../_bridge.js";
import {
  buildRedirectUrl,
  clearAuthFlowCookie,
  clearAuthSessionCookie,
  readVerifiedAuthFlow,
  setAuthSessionCookie,
} from "../_cookies.js";

function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Location", location);
  res.end();
}

function readString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end("Method not allowed.");
    return;
  }

  const pending = readVerifiedAuthFlow(req);
  const fallbackReturnTo = pending?.returnTo ?? "/workspace";
  const redirectWithError = async (errorDescription) => {
    clearAuthFlowCookie(res, req);
    clearAuthSessionCookie(res, req);
    redirect(
      res,
      buildRedirectUrl(req, fallbackReturnTo, {
        error: "auth_callback_failed",
        error_description: errorDescription || "Google sign-in failed.",
      }),
    );
  };

  if (!pending) {
    await redirectWithError("Missing or expired auth flow state.");
    return;
  }

  const oauthError =
    readString(req.query?.error_description) ?? readString(req.query?.error) ?? readString(req.query?.error_code);
  if (oauthError) {
    await redirectWithError(oauthError);
    return;
  }

  const authCode = readString(req.query?.code);
  const callbackState = readString(req.query?.state);
  if (!authCode || !callbackState || callbackState !== pending.state) {
    await redirectWithError("Invalid OAuth callback state.");
    return;
  }

  let exchangeResponse;
  try {
    exchangeResponse = await callRuntimeAuthJson("/runtime/auth_exchange_pkce_code", {
      auth_code: authCode,
      code_verifier: pending.codeVerifier,
      redirect_to: pending.redirectTo,
    });
  } catch (error) {
    await redirectWithError(error instanceof Error ? error.message : "Auth exchange failed.");
    return;
  }

  if (!exchangeResponse.ok) {
    await redirectWithError(await readResponseError(exchangeResponse));
    return;
  }

  let payload = null;
  try {
    payload = await exchangeResponse.json();
  } catch {
    payload = null;
  }

  const accessToken = extractAccessTokenFromAuthPayload(payload);
  if (!accessToken) {
    await redirectWithError("Session exchange response was incomplete.");
    return;
  }

  let bridgeResponse;
  try {
    bridgeResponse = await callAuthBridgeJson("/runtime/auth_bridge_session_create", {
      accessToken,
      payload: {
        provider: "GoogleOAuth",
        payload,
      },
    });
  } catch (error) {
    await redirectWithError(error instanceof Error ? error.message : "Auth session creation failed.");
    return;
  }

  if (!bridgeResponse.ok) {
    await redirectWithError(await readResponseError(bridgeResponse));
    return;
  }

  let sessionId = null;
  try {
    const bridgePayload = await bridgeResponse.json();
    sessionId = readString(bridgePayload?.session_id);
  } catch {
    sessionId = null;
  }

  if (!sessionId) {
    await redirectWithError("Opaque auth session id missing.");
    return;
  }

  clearAuthFlowCookie(res, req);
  setAuthSessionCookie(res, req, sessionId);
  redirect(res, buildRedirectUrl(req, pending.returnTo));
}

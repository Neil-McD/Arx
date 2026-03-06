import {
  exchangeCloudPkceCodeForSession,
  fetchCloudUser,
  type CloudSession,
  type CloudUser,
} from "./cloudAuthCore";
import {
  clearOAuthCallbackParamsFromLocation,
  consumeCloudPkceState,
} from "./cloudPkce";

export type CloudOAuthParseResult =
  | { kind: "session"; session: CloudSession; rawHash: string }
  | { kind: "code"; authCode: string; state: string | null; rawHash: string }
  | { kind: "error"; error: string; rawHash: string }
  | null;

export type CloudOAuthConsumeResult = "none" | "session_set" | "callback_error";

export function parseCloudOAuthCallbackFromLocation(): CloudOAuthParseResult {
  const rawHash = window.location.hash;
  const hash = new URLSearchParams(rawHash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);

  const accessToken = hash.get("access_token") ?? query.get("access_token");
  const refreshToken = hash.get("refresh_token") ?? query.get("refresh_token");
  const expiresIn = hash.get("expires_in") ?? query.get("expires_in");
  if (accessToken && refreshToken && expiresIn) {
    const session: CloudSession = {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: Math.floor(Date.now() / 1000) + Number(expiresIn),
      user: { id: "" },
    };
    return { kind: "session", session, rawHash };
  }

  const errorCode = hash.get("error_code") ?? query.get("error_code");
  const errorDescription = hash.get("error_description") ?? query.get("error_description");
  const error = hash.get("error") ?? query.get("error");
  if (errorCode || errorDescription || error) {
    const message = errorDescription || errorCode || error || "Unknown OAuth error";
    return { kind: "error", error: message, rawHash };
  }

  const callbackState = (query.get("state") ?? hash.get("state") ?? "").trim() || null;
  const authCode = query.get("code") ?? hash.get("code");
  if (authCode && authCode.trim()) {
    return { kind: "code", authCode: authCode.trim(), state: callbackState, rawHash };
  }

  return null;
}

export async function consumeCloudOAuthCallback(params: {
  onBeforeStart?: () => void | Promise<void>;
  onAuthError: (message: string) => void | Promise<void>;
  persistSession: (session: CloudSession) => void | Promise<void>;
  onSessionSet: (session: CloudSession) => void | Promise<void>;
  parseResult?: CloudOAuthParseResult;
  parse?: () => CloudOAuthParseResult;
  authErrorPrefix?: string;
  missingPkceVerifierMessage?: string;
  oauthStateMismatchMessage?: string;
  codeExchangeErrorMessage?: string;
  profileLoadErrorMessage: string;
  clearCallbackParamsOnError?: boolean;
  clearCallbackParamsBeforeCodeExchange?: boolean;
  clearCallbackParamsOnSessionSet?: boolean;
}): Promise<CloudOAuthConsumeResult> {
  const {
    onBeforeStart,
    onAuthError,
    persistSession,
    onSessionSet,
    parseResult,
    parse,
    authErrorPrefix = "Google sign-in failed: ",
    missingPkceVerifierMessage = "Google sign-in failed: missing PKCE verifier. Try again.",
    oauthStateMismatchMessage = "Google sign-in failed: invalid OAuth state. Try again.",
    codeExchangeErrorMessage = "Google sign-in failed: could not exchange auth code.",
    profileLoadErrorMessage,
    clearCallbackParamsOnError = true,
    clearCallbackParamsBeforeCodeExchange = true,
    clearCallbackParamsOnSessionSet = false,
  } = params;

  const parsed = parseResult ?? (parse ? parse() : parseCloudOAuthCallbackFromLocation());
  if (!parsed) return "none";

  if (parsed.kind === "error") {
    await onAuthError(`${authErrorPrefix}${parsed.error}`);
    if (clearCallbackParamsOnError) clearOAuthCallbackParamsFromLocation();
    return "callback_error";
  }

  if (onBeforeStart) await onBeforeStart();

  let callbackSession: CloudSession | null = null;
  if (parsed.kind === "session") {
    callbackSession = parsed.session;
  } else {
    if (clearCallbackParamsBeforeCodeExchange) clearOAuthCallbackParamsFromLocation();
    const pkce = consumeCloudPkceState();
    if (!pkce) {
      await onAuthError(missingPkceVerifierMessage);
      return "callback_error";
    }
    if (!parsed.state || parsed.state !== pkce.state) {
      await onAuthError(oauthStateMismatchMessage);
      return "callback_error";
    }
    let exchanged: CloudSession | null = null;
    try {
      exchanged = await exchangeCloudPkceCodeForSession(parsed.authCode, pkce.codeVerifier);
    } catch (error) {
      const message = typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : codeExchangeErrorMessage;
      await onAuthError(message || codeExchangeErrorMessage);
      return "callback_error";
    }
    if (!exchanged) {
      await onAuthError(codeExchangeErrorMessage);
      return "callback_error";
    }
    callbackSession = exchanged;
  }

  const tokenUser = await fetchCloudUser(callbackSession.access_token);
  const fallbackUser = callbackSession.user;
  const mergedUserId = String(tokenUser?.id ?? fallbackUser.id ?? "").trim();
  const user: CloudUser | null = mergedUserId
    ? {
        id: mergedUserId,
        ...(tokenUser?.email ?? fallbackUser.email ? { email: tokenUser?.email ?? fallbackUser.email } : null),
        ...(tokenUser?.displayName ?? fallbackUser.displayName
          ? { displayName: tokenUser?.displayName ?? fallbackUser.displayName }
          : null),
        ...(tokenUser?.avatarUrl ?? fallbackUser.avatarUrl
          ? { avatarUrl: tokenUser?.avatarUrl ?? fallbackUser.avatarUrl }
          : null),
      }
    : null;
  if (!user) {
    await onAuthError(profileLoadErrorMessage);
    return "callback_error";
  }

  const session: CloudSession = { ...callbackSession, user };
  await persistSession(session);
  await onSessionSet(session);
  if (clearCallbackParamsOnSessionSet) clearOAuthCallbackParamsFromLocation();
  return "session_set";
}

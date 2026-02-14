import {
  exchangeSupabasePkceCodeForSession,
  fetchSupabaseUser,
  type SupabaseSession,
} from "./supabaseAuthCore";
import {
  clearOAuthCallbackParamsFromLocation,
  consumeSupabasePkceVerifier,
} from "./supabasePkce";

export type SupabaseOAuthParseResult =
  | { kind: "session"; session: SupabaseSession; rawHash: string }
  | { kind: "code"; authCode: string; rawHash: string }
  | { kind: "error"; error: string; rawHash: string }
  | null;

export type SupabaseOAuthConsumeResult = "none" | "session_set" | "callback_error";

export function parseSupabaseOAuthCallbackFromLocation(): SupabaseOAuthParseResult {
  const rawHash = window.location.hash;
  const hash = new URLSearchParams(rawHash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);

  const accessToken = hash.get("access_token") ?? query.get("access_token");
  const refreshToken = hash.get("refresh_token") ?? query.get("refresh_token");
  const expiresIn = hash.get("expires_in") ?? query.get("expires_in");
  if (accessToken && refreshToken && expiresIn) {
    const session: SupabaseSession = {
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

  const authCode = query.get("code") ?? hash.get("code");
  if (authCode && authCode.trim()) {
    return { kind: "code", authCode: authCode.trim(), rawHash };
  }

  return null;
}

export async function consumeSupabaseOAuthCallback(params: {
  onBeforeStart?: () => void | Promise<void>;
  onAuthError: (message: string) => void | Promise<void>;
  persistSession: (session: SupabaseSession) => void | Promise<void>;
  onSessionSet: (session: SupabaseSession) => void | Promise<void>;
  parseResult?: SupabaseOAuthParseResult;
  parse?: () => SupabaseOAuthParseResult;
  authErrorPrefix?: string;
  missingPkceVerifierMessage?: string;
  codeExchangeErrorMessage?: string;
  profileLoadErrorMessage: string;
  clearCallbackParamsOnError?: boolean;
  clearCallbackParamsBeforeCodeExchange?: boolean;
  clearCallbackParamsOnSessionSet?: boolean;
}): Promise<SupabaseOAuthConsumeResult> {
  const {
    onBeforeStart,
    onAuthError,
    persistSession,
    onSessionSet,
    parseResult,
    parse,
    authErrorPrefix = "Google sign-in failed: ",
    missingPkceVerifierMessage = "Google sign-in failed: missing PKCE verifier. Try again.",
    codeExchangeErrorMessage = "Google sign-in failed: could not exchange auth code.",
    profileLoadErrorMessage,
    clearCallbackParamsOnError = true,
    clearCallbackParamsBeforeCodeExchange = true,
    clearCallbackParamsOnSessionSet = false,
  } = params;

  const parsed = parseResult ?? (parse ? parse() : parseSupabaseOAuthCallbackFromLocation());
  if (!parsed) return "none";

  if (parsed.kind === "error") {
    await onAuthError(`${authErrorPrefix}${parsed.error}`);
    if (clearCallbackParamsOnError) clearOAuthCallbackParamsFromLocation();
    return "callback_error";
  }

  if (onBeforeStart) await onBeforeStart();

  let callbackSession: SupabaseSession | null = null;
  if (parsed.kind === "session") {
    callbackSession = parsed.session;
  } else {
    if (clearCallbackParamsBeforeCodeExchange) clearOAuthCallbackParamsFromLocation();
    const verifier = consumeSupabasePkceVerifier();
    if (!verifier) {
      await onAuthError(missingPkceVerifierMessage);
      return "callback_error";
    }
    const exchanged = await exchangeSupabasePkceCodeForSession(parsed.authCode, verifier);
    if (!exchanged) {
      await onAuthError(codeExchangeErrorMessage);
      return "callback_error";
    }
    callbackSession = exchanged;
  }

  const user = await fetchSupabaseUser(callbackSession.access_token);
  if (!user) {
    await onAuthError(profileLoadErrorMessage);
    return "callback_error";
  }

  const session: SupabaseSession = { ...callbackSession, user };
  await persistSession(session);
  await onSessionSet(session);
  if (clearCallbackParamsOnSessionSet) clearOAuthCallbackParamsFromLocation();
  return "session_set";
}

export type CloudOAuthParseResult =
  | { kind: "code"; authCode: string; state: string | null }
  | { kind: "error"; error: string }
  | null;

export function parseCloudOAuthCallbackFromLocation(): CloudOAuthParseResult {
  const query = new URLSearchParams(window.location.search);

  const errorCode = query.get("error_code");
  const errorDescription = query.get("error_description");
  const error = query.get("error");
  if (errorCode || errorDescription || error) {
    const message = errorDescription || errorCode || error || "Unknown OAuth error";
    return { kind: "error", error: message };
  }

  const callbackState = query.get("state")?.trim() || null;
  const authCode = query.get("code");
  if (authCode && authCode.trim()) {
    return { kind: "code", authCode: authCode.trim(), state: callbackState };
  }

  return null;
}

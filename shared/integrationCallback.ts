export const INTEGRATION_CALLBACK_PATH = "/integrations/callback";
export const INTEGRATION_ATTEMPT_KEY = "polynet.integration.attempt";
export type BrowserIntegrationAttempt = { communityId: string; userId: string; generation: number; expiresAt: number; sessionUri?: string };
export function readIntegrationAttempt(storage: Pick<Storage, "getItem" | "removeItem">, now = Date.now()): BrowserIntegrationAttempt | null {
  try {
    const a = JSON.parse(storage.getItem(INTEGRATION_ATTEMPT_KEY) || "null");
    if (!a || typeof a.communityId !== "string" || !a.communityId || typeof a.userId !== "string" || !a.userId ||
      !Number.isSafeInteger(a.generation) || a.generation < 1 || !Number.isFinite(a.expiresAt) || a.expiresAt <= now ||
      (a.sessionUri !== undefined && (typeof a.sessionUri !== "string" || !a.sessionUri || a.sessionUri.length > 4096))) throw new Error();
    return a;
  } catch { storage.removeItem(INTEGRATION_ATTEMPT_KEY); return null; }
}
// Runs before app telemetry. The opaque callback is tab-local and never enters
// OAuth returnTo URLs, analytics labels, or rendered text.
export function captureIntegrationCallback(location: Pick<Location, "href" | "pathname">, history: Pick<History, "replaceState" | "state">, storage: Storage) {
  const url = new URL(location.href);
  if (!url.searchParams.has("session_uri")) return;
  const sessionUri = url.searchParams.get("session_uri");
  url.searchParams.delete("session_uri");
  history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
  if (location.pathname !== INTEGRATION_CALLBACK_PATH) return;
  const attempt = readIntegrationAttempt(storage);
  if (!attempt || !sessionUri || sessionUri.length > 4096 || attempt.sessionUri) return;
  storage.setItem(INTEGRATION_ATTEMPT_KEY, JSON.stringify({ ...attempt, sessionUri }));
}

export async function completeStoredIntegrationCallback(storage: Storage, bootstrap: () => Promise<{user: {id: string}} | null>,
  verify: (attempt: BrowserIntegrationAttempt & {sessionUri: string}) => Promise<boolean>): Promise<"connected" | "signin" | "failed"> {
  let owned: string | null = null;
  const consume = () => {
    if (owned !== null && storage.getItem(INTEGRATION_ATTEMPT_KEY) === owned) storage.removeItem(INTEGRATION_ATTEMPT_KEY);
  };
  try {
    owned = storage.getItem(INTEGRATION_ATTEMPT_KEY);
    const attempt = readIntegrationAttempt(storage);
    if (!attempt?.sessionUri) return "failed";
    const session = await bootstrap();
    if (!session) return "signin";
    const current = readIntegrationAttempt(storage);
    if (current && (current.communityId !== attempt.communityId || current.userId !== attempt.userId || current.generation !== attempt.generation || current.sessionUri !== attempt.sessionUri)) return "failed";
    if (session.user.id !== attempt.userId || !current) {
      consume(); return "failed";
    }
    consume(); // No retry of a single-use callback, including refresh.
    return await verify({...attempt, sessionUri: attempt.sessionUri}) ? "connected" : "failed";
  } catch {
    try { consume(); } catch { /* Storage can be unavailable; still fail closed. */ }
    return "failed";
  }
}

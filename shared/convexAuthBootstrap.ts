import { bootstrapConvexAnonymousClient, hasConvexUrl } from "./convexAuthenticatedClient";

const CONVEX_ANON_ID_KEY = "arx_convex_anon_id_v1";

function generateAnonId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // ignore
  }
  return `anon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function readOrCreateAnonId(): string {
  try {
    const existing = String(localStorage.getItem(CONVEX_ANON_ID_KEY) ?? "").trim();
    if (existing) return existing;
    const created = generateAnonId();
    localStorage.setItem(CONVEX_ANON_ID_KEY, created);
    return created;
  } catch {
    return generateAnonId();
  }
}

let bootPromise: Promise<void> | null = null;

export function bootstrapConvexAnonymousActor(): void {
  if (bootPromise) return;
  if (!hasConvexUrl()) return;

  const anonymousId = readOrCreateAnonId();
  bootPromise = bootstrapConvexAnonymousClient(anonymousId)
    .then((result) => {
      console.info("[convex] auth:bootstrapActor ok", result);
    })
    .catch((error) => {
      console.warn("[convex] auth:bootstrapActor failed", error);
      bootPromise = null;
    });
}

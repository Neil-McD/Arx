type PosthogClient = typeof import("./posthogRuntime")["posthog"];

type AnalyticsUiContext = {
  authState: "anonymous" | "authenticated";
  userId?: string | null;
  accountTier?: string | null;
  pathname?: string | null;
  publicRouteKind?: string | null;
  activePage?: string | null;
  activeView?: string | null;
  communityId?: string | null;
  communitySlug?: string | null;
  threadId?: string | null;
  runId?: string | null;
};

type PrimitiveValue = string | number | boolean | null | undefined;
type EventProperties = Record<string, PrimitiveValue>;
type PendingPosthogOperation =
  | { kind: "identity"; userId: string | null; accountTier: string | null }
  | { kind: "event"; eventName: string; properties: Record<string, string | number | boolean> };

const posthogKey = String(import.meta.env.VITE_PUBLIC_POSTHOG_KEY ?? "").trim();
const posthogHost = String(import.meta.env.VITE_PUBLIC_POSTHOG_HOST ?? "").trim();
const analyticsEnabled = posthogKey.length > 0 && posthogHost.length > 0;

const MAX_QUEUED_OPERATIONS = 100;
const POSTHOG_IDENTIFIED_MARKER_KEY = "polynet_posthog_identified_v1";
let posthogClient: PosthogClient | null = null;
let posthogLoadPromise: Promise<PosthogClient | null> | null = null;
let lastIdentifiedUserId: string | null = null;
let currentUiContext: AnalyticsUiContext = {
  authState: "anonymous",
};
const pendingOperations: PendingPosthogOperation[] = [];

function readPersistedPosthogIdentified(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(POSTHOG_IDENTIFIED_MARKER_KEY) === "1";
  } catch {
    return false;
  }
}

function writePersistedPosthogIdentified(identified: boolean): void {
  try {
    if (typeof localStorage === "undefined") return;
    if (identified) localStorage.setItem(POSTHOG_IDENTIFIED_MARKER_KEY, "1");
    else localStorage.removeItem(POSTHOG_IDENTIFIED_MARKER_KEY);
  } catch {
    // Storage may be unavailable in hardened browser contexts.
  }
}

function applyPosthogIdentity(
  posthog: PosthogClient,
  userId: string | null,
  accountTier: string | null,
): void {
  if (userId) {
    if (lastIdentifiedUserId && lastIdentifiedUserId !== userId) {
      posthog.reset();
    }
    if (lastIdentifiedUserId !== userId) {
      posthog.identify(userId, compactProperties({ account_tier: accountTier }));
      lastIdentifiedUserId = userId;
      writePersistedPosthogIdentified(true);
    }
    return;
  }

  if (lastIdentifiedUserId || readPersistedPosthogIdentified()) {
    posthog.reset();
    lastIdentifiedUserId = null;
    writePersistedPosthogIdentified(false);
  }
}

function replayPendingPosthogOperations(posthog: PosthogClient): void {
  while (pendingOperations.length > 0) {
    const op = pendingOperations.shift();
    if (!op) continue;
    if (op.kind === "identity") {
      applyPosthogIdentity(posthog, op.userId, op.accountTier);
    } else {
      posthog.capture(op.eventName, op.properties);
    }
  }
}

function ensurePosthogLoaded(): Promise<PosthogClient | null> {
  if (!analyticsEnabled) return Promise.resolve(null);
  if (posthogClient) return Promise.resolve(posthogClient);
  if (!posthogLoadPromise) {
    posthogLoadPromise = import("./posthogRuntime")
      .then((module) => {
        const posthog = module.posthog;
        posthog.init(posthogKey, {
          api_host: posthogHost,
          autocapture: false,
          capture_pageview: false,
          capture_pageleave: false,
          disable_session_recording: true,
          person_profiles: "identified_only",
        });
        posthogClient = posthog;
        replayPendingPosthogOperations(posthog);
        return posthog;
      })
      .catch(() => {
        pendingOperations.length = 0;
        posthogLoadPromise = null;
        return null;
      });
  }
  return posthogLoadPromise;
}

if (analyticsEnabled && typeof window !== "undefined") {
  const schedule = () => {
    void ensurePosthogLoaded();
  };
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(schedule, { timeout: 2_500 });
  } else {
    window.setTimeout(schedule, 1_500);
  }
}

function normalizeString(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizePropertyValue(value: PrimitiveValue): string | number | boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = normalizeString(value == null ? null : String(value));
  return normalized ?? null;
}

function compactProperties(properties: EventProperties): Record<string, string | number | boolean> {
  const next: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(properties)) {
    const normalized = normalizePropertyValue(value);
    if (normalized === null) continue;
    next[key] = normalized;
  }
  return next;
}

function buildContextProperties(): Record<string, string | number | boolean> {
  return compactProperties({
    auth_state: currentUiContext.authState,
    account_tier: currentUiContext.accountTier,
    pathname: currentUiContext.pathname,
    route_kind: currentUiContext.publicRouteKind,
    active_page: currentUiContext.activePage,
    active_view: currentUiContext.activeView,
    community_id: currentUiContext.communityId,
    community_slug: currentUiContext.communitySlug,
    thread_id: currentUiContext.threadId,
    run_id: currentUiContext.runId,
  });
}

export function updatePosthogUiContext(context: AnalyticsUiContext): void {
  currentUiContext = context;
  if (!analyticsEnabled) return;
  const userId =
    context.authState === "authenticated" ? normalizeString(context.userId ?? null) : null;
  const accountTier = normalizeString(context.accountTier ?? null);
  if (posthogClient) {
    applyPosthogIdentity(posthogClient, userId, accountTier);
    return;
  }
  const last = pendingOperations[pendingOperations.length - 1];
  if (last?.kind === "identity" && (last.userId === null) === (userId === null)) {
    last.userId = userId;
    last.accountTier = accountTier;
  } else if (pendingOperations.length < MAX_QUEUED_OPERATIONS) {
    pendingOperations.push({ kind: "identity", userId, accountTier });
  } else {
    pendingOperations[pendingOperations.length - 1] = { kind: "identity", userId, accountTier };
  }
}

export function captureProductAnalyticsEvent(
  eventName: string,
  properties: EventProperties = {},
): void {
  if (!analyticsEnabled) return;
  const merged = {
    ...buildContextProperties(),
    ...compactProperties(properties),
  };
  if (posthogClient) {
    posthogClient.capture(eventName, merged);
    return;
  }
  if (pendingOperations.length < MAX_QUEUED_OPERATIONS) {
    pendingOperations.push({ kind: "event", eventName, properties: merged });
  }
  void ensurePosthogLoaded();
}

import posthog from "posthog-js";

type AnalyticsUiContext = {
  authState: "anonymous" | "authenticated";
  userId?: string | null;
  builderTier?: string | null;
  pathname?: string | null;
  publicRouteKind?: string | null;
  activePage?: string | null;
  activeView?: string | null;
  communityId?: string | null;
  communitySlug?: string | null;
  projectId?: string | null;
  threadId?: string | null;
  runId?: string | null;
};

type PrimitiveValue = string | number | boolean | null | undefined;
type EventProperties = Record<string, PrimitiveValue>;
type PendingReturnMarkerName = "builder_checkout" | "workspace_credit_topup";

const posthogKey = String(import.meta.env.VITE_PUBLIC_POSTHOG_KEY ?? "").trim();
const posthogHost = String(import.meta.env.VITE_PUBLIC_POSTHOG_HOST ?? "").trim();
const analyticsEnabled = posthogKey.length > 0 && posthogHost.length > 0;
const PENDING_RETURN_MARKER_PREFIX = "polynet-posthog-return:";
const PENDING_RETURN_MAX_AGE_MS = 2 * 60 * 60 * 1000;

let lastIdentifiedUserId: string | null = null;
let currentUiContext: AnalyticsUiContext = {
  authState: "anonymous",
};

if (analyticsEnabled) {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    person_profiles: "identified_only",
  });
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
    builder_tier: currentUiContext.builderTier,
    pathname: currentUiContext.pathname,
    route_kind: currentUiContext.publicRouteKind,
    active_page: currentUiContext.activePage,
    active_view: currentUiContext.activeView,
    community_id: currentUiContext.communityId,
    community_slug: currentUiContext.communitySlug,
    project_id: currentUiContext.projectId,
    thread_id: currentUiContext.threadId,
    run_id: currentUiContext.runId,
  });
}

type PendingReturnMarkerPayload = {
  at: number;
  properties: EventProperties;
};

function pendingReturnMarkerKey(name: PendingReturnMarkerName): string {
  return `${PENDING_RETURN_MARKER_PREFIX}${name}`;
}

function readPendingReturnPayload(name: PendingReturnMarkerName): PendingReturnMarkerPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(pendingReturnMarkerKey(name));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      at?: unknown;
      properties?: unknown;
    } | null;
    const at = Number(parsed?.at ?? 0);
    if (!Number.isFinite(at) || at <= 0 || Date.now() - at > PENDING_RETURN_MAX_AGE_MS) {
      window.sessionStorage.removeItem(pendingReturnMarkerKey(name));
      return null;
    }
    const properties =
      parsed?.properties && typeof parsed.properties === "object" && !Array.isArray(parsed.properties)
        ? (parsed.properties as EventProperties)
        : {};
    return { at, properties };
  } catch {
    return null;
  }
}

export function markPendingAnalyticsReturn(
  name: PendingReturnMarkerName,
  properties: EventProperties = {},
): void {
  if (!analyticsEnabled || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      pendingReturnMarkerKey(name),
      JSON.stringify({
        at: Date.now(),
        properties: compactProperties(properties),
      }),
    );
  } catch {
    // Best-effort marker only.
  }
}

export function readPendingAnalyticsReturn(name: PendingReturnMarkerName): EventProperties | null {
  return readPendingReturnPayload(name)?.properties ?? null;
}

export function clearPendingAnalyticsReturn(name: PendingReturnMarkerName): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(pendingReturnMarkerKey(name));
  } catch {
    // Best-effort marker only.
  }
}

export function consumePendingAnalyticsReturn(name: PendingReturnMarkerName): EventProperties | null {
  const payload = readPendingReturnPayload(name);
  if (!payload) return null;
  clearPendingAnalyticsReturn(name);
  return payload.properties;
}

export function updatePosthogUiContext(context: AnalyticsUiContext): void {
  currentUiContext = context;
  if (!analyticsEnabled) return;

  const userId =
    context.authState === "authenticated" ? normalizeString(context.userId ?? null) : null;
  if (userId) {
    if (lastIdentifiedUserId !== userId) {
      posthog.identify(userId, compactProperties({ builder_tier: context.builderTier }));
      lastIdentifiedUserId = userId;
    }
    return;
  }

  if (lastIdentifiedUserId) {
    posthog.reset();
    lastIdentifiedUserId = null;
  }
}

export function captureProductAnalyticsEvent(
  eventName: string,
  properties: EventProperties = {},
): void {
  if (!analyticsEnabled) return;
  posthog.capture(eventName, {
    ...buildContextProperties(),
    ...compactProperties(properties),
  });
}

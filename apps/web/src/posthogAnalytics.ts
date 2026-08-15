import posthog from "posthog-js";

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

const posthogKey = String(import.meta.env.VITE_PUBLIC_POSTHOG_KEY ?? "").trim();
const posthogHost = String(import.meta.env.VITE_PUBLIC_POSTHOG_HOST ?? "").trim();
const analyticsEnabled = posthogKey.length > 0 && posthogHost.length > 0;

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
  if (userId) {
    if (lastIdentifiedUserId !== userId) {
      posthog.identify(userId, compactProperties({ account_tier: context.accountTier }));
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

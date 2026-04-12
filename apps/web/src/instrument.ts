import * as Sentry from "@sentry/react";

declare const __SENTRY_RELEASE__: string | null;
declare const __SENTRY_ENVIRONMENT__: string | null;

type CaptureAppExceptionOptions = {
  tags?: Record<string, string | number | boolean | null | undefined>;
  contexts?: Record<string, Record<string, unknown> | null | undefined>;
  extras?: Record<string, unknown>;
};

type SentryUiContext = {
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

const sentryDsn = String(import.meta.env.VITE_SENTRY_DSN ?? "").trim();
const sentryEnabled = sentryDsn.length > 0;

if (sentryEnabled) {
  Sentry.init({
    dsn: sentryDsn,
    environment: __SENTRY_ENVIRONMENT__ ?? import.meta.env.MODE,
    release: __SENTRY_RELEASE__ ?? undefined,
    sendDefaultPii: false,
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      }),
    ],
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    beforeSend(event) {
      if (event.user) {
        delete event.user.email;
        delete event.user.ip_address;
        delete event.user.username;
        delete event.user.name;
      }
      return event;
    },
  });
}

function normalizeTagValue(value: string | number | boolean | null | undefined): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "unknown";
  const normalized = String(value ?? "").trim();
  return normalized || "none";
}

export function captureAppException(error: unknown, options?: CaptureAppExceptionOptions): void {
  if (!sentryEnabled) return;
  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(options?.tags ?? {})) {
      scope.setTag(key, normalizeTagValue(value));
    }
    for (const [key, value] of Object.entries(options?.contexts ?? {})) {
      scope.setContext(key, value ?? null);
    }
    for (const [key, value] of Object.entries(options?.extras ?? {})) {
      scope.setExtra(key, value);
    }
    Sentry.captureException(error);
  });
}

export function updateSentryUiContext(context: SentryUiContext): void {
  if (!sentryEnabled) return;

  Sentry.setTag("auth_state", normalizeTagValue(context.authState));
  Sentry.setTag("builder_tier", normalizeTagValue(context.builderTier));
  Sentry.setTag("route_kind", normalizeTagValue(context.publicRouteKind));
  Sentry.setTag("active_page", normalizeTagValue(context.activePage));
  Sentry.setTag("active_view", normalizeTagValue(context.activeView));
  Sentry.setTag("has_project", normalizeTagValue(Boolean(context.projectId)));
  Sentry.setTag("has_thread", normalizeTagValue(Boolean(context.threadId)));
  Sentry.setTag("has_run", normalizeTagValue(Boolean(context.runId)));
  Sentry.setTag("has_community", normalizeTagValue(Boolean(context.communityId || context.communitySlug)));

  Sentry.setUser(
    context.authState === "authenticated" && String(context.userId ?? "").trim()
      ? { id: String(context.userId).trim() }
      : null,
  );

  Sentry.setContext("route", {
    pathname: String(context.pathname ?? "").trim() || null,
    publicRouteKind: String(context.publicRouteKind ?? "").trim() || null,
    activePage: String(context.activePage ?? "").trim() || null,
    activeView: String(context.activeView ?? "").trim() || null,
  });

  Sentry.setContext(
    "community",
    context.communityId || context.communitySlug
      ? {
          communityId: String(context.communityId ?? "").trim() || null,
          communitySlug: String(context.communitySlug ?? "").trim() || null,
        }
      : null,
  );

  Sentry.setContext(
    "workspace",
    context.projectId || context.threadId || context.runId
      ? {
          projectId: String(context.projectId ?? "").trim() || null,
          threadId: String(context.threadId ?? "").trim() || null,
          runId: String(context.runId ?? "").trim() || null,
        }
      : null,
  );
}

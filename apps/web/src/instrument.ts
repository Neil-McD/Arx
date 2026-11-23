type SentryModule = typeof import("./sentryRuntime");

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

type PendingSentryOperation =
  | { kind: "context"; context: SentryUiContext }
  | { kind: "exception"; error: unknown; options?: CaptureAppExceptionOptions };

const sentryDsn = String(import.meta.env.VITE_SENTRY_DSN ?? "").trim();
const sentryEnvironment = String(__SENTRY_ENVIRONMENT__ ?? import.meta.env.MODE ?? "").trim();
const sentryEnabled = sentryDsn.length > 0;
const sentryTraceSampleRate = resolveSentryTraceSampleRate(sentryEnvironment);
const sentryTracePropagationTargets: Array<string | RegExp> = [
  /^\/(?:runtime|api)(?:\/|$)/,
  /^https:\/\/(?:www\.)?polynet\.ai(?:\/|$)/,
  /^https:\/\/[^/]*polynet[^/]*\.vercel\.app(?:\/|$)/,
  /^https:\/\/[a-z0-9-]+\.convex\.(?:cloud|site)(?:\/|$)/,
  /^http:\/\/localhost(?::\d+)?(?:\/|$)/,
  /^http:\/\/127\.0\.0\.1(?::\d+)?(?:\/|$)/,
];

const MAX_QUEUED_OPERATIONS = 50;
let sentryModule: SentryModule | null = null;
let sentryLoadPromise: Promise<SentryModule | null> | null = null;
const pendingOperations: PendingSentryOperation[] = [];

function initSentryModule(Sentry: SentryModule): SentryModule {
  Sentry.init({
    dsn: sentryDsn,
    environment: sentryEnvironment || import.meta.env.MODE,
    release: __SENTRY_RELEASE__ ?? undefined,
    sendDefaultPii: false,
    tracesSampleRate: sentryTraceSampleRate,
    tracePropagationTargets: sentryTracePropagationTargets,
    integrations: [
      Sentry.browserTracingIntegration({
        beforeStartSpan(options) {
          return {
            ...options,
            name: normalizeTransactionName(options.name),
          };
        },
      }),
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
  return Sentry;
}

function applySentryUiContext(Sentry: SentryModule, context: SentryUiContext): void {
  Sentry.setTag("auth_state", normalizeTagValue(context.authState));
  Sentry.setTag("account_tier", normalizeTagValue(context.accountTier));
  Sentry.setTag("route_kind", normalizeTagValue(context.publicRouteKind));
  Sentry.setTag("active_page", normalizeTagValue(context.activePage));
  Sentry.setTag("active_view", normalizeTagValue(context.activeView));
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
    "agent_runtime",
    context.threadId || context.runId
      ? {
          threadId: String(context.threadId ?? "").trim() || null,
          runId: String(context.runId ?? "").trim() || null,
        }
      : null,
  );
}

function sendExceptionToSentry(
  Sentry: SentryModule,
  error: unknown,
  options?: CaptureAppExceptionOptions,
): void {
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

function ensureSentryLoaded(): Promise<SentryModule | null> {
  if (!sentryEnabled) return Promise.resolve(null);
  if (sentryModule) return Promise.resolve(sentryModule);
  if (!sentryLoadPromise) {
    sentryLoadPromise = import("./sentryRuntime")
      .then((loaded) => {
        sentryModule = initSentryModule(loaded);
        while (pendingOperations.length > 0) {
          const op = pendingOperations.shift();
          if (!op) continue;
          if (op.kind === "context") {
            applySentryUiContext(sentryModule, op.context);
          } else {
            sendExceptionToSentry(sentryModule, op.error, op.options);
          }
        }
        return sentryModule;
      })
      .catch(() => {
        pendingOperations.length = 0;
        sentryLoadPromise = null;
        return null;
      });
  }
  return sentryLoadPromise;
}

if (sentryEnabled && typeof window !== "undefined") {
  const schedule = () => {
    void ensureSentryLoaded();
  };
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(schedule, { timeout: 2_000 });
  } else {
    window.setTimeout(schedule, 1_000);
  }
}

function resolveSentryTraceSampleRate(environment: string | null | undefined): number {
  const normalized = String(environment ?? "").trim().toLowerCase();
  if (normalized === "production") return 0.15;
  if (normalized === "preview") return 0.35;
  return 1.0;
}

function normalizeTransactionName(name: string | undefined): string {
  const normalized = String(name ?? "").trim();
  if (!normalized) return "/";
  if (normalized.startsWith("/")) {
    return normalized.split(/[?#]/, 1)[0] || "/";
  }
  if (/^https?:\/\//i.test(normalized)) {
    try {
      const parsed = new URL(normalized);
      return parsed.pathname || "/";
    } catch {
      return normalized;
    }
  }
  return normalized;
}

function normalizeTagValue(value: string | number | boolean | null | undefined): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "unknown";
  const normalized = String(value ?? "").trim();
  return normalized || "none";
}

export function captureAppException(error: unknown, options?: CaptureAppExceptionOptions): void {
  if (!sentryEnabled) return;
  if (sentryModule) {
    sendExceptionToSentry(sentryModule, error, options);
    return;
  }
  if (pendingOperations.length < MAX_QUEUED_OPERATIONS) {
    pendingOperations.push({ kind: "exception", error, options });
  }
  void ensureSentryLoaded();
}

export function updateSentryUiContext(context: SentryUiContext): void {
  if (!sentryEnabled) return;
  if (sentryModule) {
    applySentryUiContext(sentryModule, context);
    return;
  }
  const last = pendingOperations[pendingOperations.length - 1];
  if (last?.kind === "context") {
    last.context = context;
  } else if (pendingOperations.length < MAX_QUEUED_OPERATIONS) {
    pendingOperations.push({ kind: "context", context });
  } else {
    pendingOperations[pendingOperations.length - 1] = { kind: "context", context };
  }
}

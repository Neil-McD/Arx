import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import {
  beginOAuthSignIn,
  bootstrapSessionDetailed,
  clearAuthFlowPending,
  hasRecentAuthFlowPending,
  markAuthFlowPending,
} from "../auth";
import { captureProductAnalyticsEvent } from "../posthogAnalytics";
import {
  parsePendingAuthIntentInput,
  storeAuthResumeState,
} from "../../../../shared/authResumeState";
import {
  resolvePublicEntryRoute,
  type PublicEntryRoute,
} from "../../../../shared/publicEntryRoute";

const App = lazy(() => import("../App"));
const WebLandingPage = lazy(() =>
  import("./WebLandingPage").then((module) => ({ default: module.WebLandingPage })),
);
const PublicFindPage = lazy(() =>
  import("./polynetLanding/PublicFindPage").then((module) => ({ default: module.PublicFindPage })),
);
const WebCommunityLandingPage = lazy(() =>
  import("./WebCommunityLandingPage").then((module) => ({
    default: module.WebCommunityLandingPage,
  })),
);

export function WebPublicVisitorShell(props: { initialRoute: PublicEntryRoute }) {
  const [route, setRoute] = useState<PublicEntryRoute>(props.initialRoute);
  const [handoffToStudioApp, setHandoffToStudioApp] = useState(false);
  const [sessionCheckPending, setSessionCheckPending] = useState(true);

  // Check for an existing browser session in the background without blocking
  // first paint. Returning signed-in members — and transient session-check
  // failures — hand off cleanly to the full Studio app so membership state,
  // redirects, and auth recovery stay authoritative.
  useEffect(() => {
    let cancelled = false;
    void bootstrapSessionDetailed()
      .then((result) => {
        if (cancelled) return;
        if (result.session) {
          setHandoffToStudioApp(true);
          return;
        }
        setSessionCheckPending(false);
      })
      .catch(() => {
        if (!cancelled) {
          setHandoffToStudioApp(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // If browser history moves to a route outside the lightweight public shell,
  // hand off to the full Studio app immediately.
  useEffect(() => {
    if (handoffToStudioApp) return;
    const onPopState = () => {
      const next = resolvePublicEntryRoute({
        pathname: window.location.pathname || "/",
        search: window.location.search || "",
        hasRecentAuthFlowPending: hasRecentAuthFlowPending(),
      });
      if (!next) {
        setHandoffToStudioApp(true);
        return;
      }
      setRoute(next);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [handoffToStudioApp]);

  const handleStartBuilderPurchase = useCallback(() => {
    captureProductAnalyticsEvent("signin_started", { reason: "create_community" });
    const intent = parsePendingAuthIntentInput({
      reason: "create_community",
      payload: { draft: null },
    });
    if (intent) {
      storeAuthResumeState({ intent });
    }
    markAuthFlowPending();
    const returnTo = `${window.location.pathname || "/"}${window.location.search || ""}`;
    void beginOAuthSignIn({ returnTo })
      .then((result) => {
        if (result.ok && result.authUrl) {
          window.location.assign(result.authUrl);
          return;
        }
        clearAuthFlowPending();
        setHandoffToStudioApp(true);
      })
      .catch(() => {
        clearAuthFlowPending();
        setHandoffToStudioApp(true);
      });
  }, []);

  if (handoffToStudioApp) {
    return (
      <Suspense fallback={null}>
        <App />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={null}>
      {route.kind === "community_landing" ? (
        <WebCommunityLandingPage
          communitySlug={route.slug}
          session={null}
          sessionCheckPending={sessionCheckPending}
        />
      ) : route.kind === "discover" ? (
        <PublicFindPage onJoin={handleStartBuilderPurchase} />
      ) : (
        <WebLandingPage onStartBuilderPurchase={handleStartBuilderPurchase} />
      )}
    </Suspense>
  );
}

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
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
const PricingPage = lazy(() =>
  import("./polynetLanding/PricingPage").then((module) => ({ default: module.PricingPage })),
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
  // Pricing is for everyone: a signed-in person reading it stays on it, and
  // starting a community from it opens the app's create flow.
  const [signedIn, setSignedIn] = useState(false);
  const routeRef = useRef(route);
  routeRef.current = route;

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
          if (routeRef.current.kind === "pricing") {
            setSignedIn(true);
            setSessionCheckPending(false);
            return;
          }
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
      if (!next || (signedIn && next.kind !== "pricing")) {
        setHandoffToStudioApp(true);
        return;
      }
      setRoute(next);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [handoffToStudioApp, signedIn]);

  const handleStartBuilderPurchase = useCallback(() => {
    captureProductAnalyticsEvent("signin_started", { reason: "create_community" });
    const intent = parsePendingAuthIntentInput({
      reason: "create_community",
      payload: { draft: null },
    });
    if (intent) {
      storeAuthResumeState({ intent });
    }
    // Already signed in (on Pricing): the app picks the saved intent up and
    // opens its create flow.
    if (signedIn) {
      window.location.assign("/");
      return;
    }
    markAuthFlowPending();
    // Pricing has no signed-in twin in the app, so sign-in returns home.
    const returnTo = routeRef.current.kind === "pricing"
      ? "/"
      : `${window.location.pathname || "/"}${window.location.search || ""}`;
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
  }, [signedIn]);

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
      ) : route.kind === "pricing" ? (
        <PricingPage onJoin={handleStartBuilderPurchase} />
      ) : (
        <WebLandingPage onStartBuilderPurchase={handleStartBuilderPurchase} />
      )}
    </Suspense>
  );
}

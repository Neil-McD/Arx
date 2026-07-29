import { useEffect, useRef } from "react";

import { updateSentryUiContext } from "../instrument";
import {
  captureProductAnalyticsEvent,
  updatePosthogUiContext,
} from "../posthogAnalytics";
import { buildCurrentTelemetryPathname } from "../webAppRuntime";

export function useWebTelemetryLifecycle(params: {
  isAuthenticated: boolean;
  userId: string | null;
  accountTier: string | null;
  publicRouteKind: string;
  activePage: string;
  activeView: string;
  communityId: string | null;
  communitySlug: string | null;
}) {
  const lastTrackedAuthSessionUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const pathname = buildCurrentTelemetryPathname();
    const context = {
      authState: params.isAuthenticated
        ? ("authenticated" as const)
        : ("anonymous" as const),
      userId: params.userId,
      accountTier: params.accountTier,
      pathname,
      publicRouteKind: params.publicRouteKind,
      activePage: params.activePage,
      activeView: params.activeView,
      communityId: params.communityId,
      communitySlug: params.communitySlug,
    };
    updateSentryUiContext(context);
    updatePosthogUiContext(context);
  }, [
    params.accountTier,
    params.activePage,
    params.activeView,
    params.communityId,
    params.communitySlug,
    params.isAuthenticated,
    params.publicRouteKind,
    params.userId,
  ]);

  useEffect(() => {
    if (!params.userId) {
      lastTrackedAuthSessionUserIdRef.current = null;
      return;
    }
    if (lastTrackedAuthSessionUserIdRef.current === params.userId) return;
    lastTrackedAuthSessionUserIdRef.current = params.userId;
    captureProductAnalyticsEvent("auth session established", {
      surface:
        params.publicRouteKind === "app"
          ? params.activePage
          : params.publicRouteKind,
    });
  }, [
    params.activePage,
    params.publicRouteKind,
    params.userId,
  ]);
}

import {
  useCallback,
  type MutableRefObject,
} from "react";

import type { AuthSession } from "../auth";

export function useWebJoinedCommunityEntryAction(params: {
  session: AuthSession | null;
  sessionRef: MutableRefObject<AuthSession | null>;
  resolveKnownCommunitySlugById: (
    communityId: string,
  ) => string | null;
  syncCommunitySelection: (value: {
    communityId: string;
    communitySlug: string | null;
  }) => void;
  setPublicRoute: (route: { kind: "app" }) => void;
  applyAppRouteState: (route: {
    page: "community";
    view: "home";
    settingsPage: "agent";
    communitySlug: string | null;
    communityTab: "chat";
  }) => void;
  loadCommunities: (session: AuthSession) => Promise<void>;
}) {
  return useCallback(
    (options: {
      communityId: string;
      communitySlug?: string | null;
    }) => {
      const communityId = String(
        options.communityId ?? "",
      ).trim();
      if (!communityId) return;
      const slug =
        String(options.communitySlug ?? "").trim() ||
        params.resolveKnownCommunitySlugById(communityId);

      params.syncCommunitySelection({
        communityId,
        communitySlug: slug || null,
      });
      params.setPublicRoute({ kind: "app" });
      params.applyAppRouteState({
        page: "community",
        view: "home",
        settingsPage: "agent",
        communitySlug: slug || null,
        communityTab: "chat",
      });

      const session = params.sessionRef.current ?? params.session;
      if (session) {
        void params.loadCommunities(session).catch(() => {
          // Route entry remains responsive if the refresh fails.
        });
      }
    },
    [
      params.loadCommunities,
      params.resolveKnownCommunitySlugById,
      params.session,
      params.sessionRef,
      params.applyAppRouteState,
      params.setPublicRoute,
      params.syncCommunitySelection,
    ],
  );
}

import {
  useCallback,
  type MutableRefObject,
} from "react";

import type { AuthSession } from "../auth";
import type { AppView, CommunityTab } from "../../../../shared/appShellNavigation";
import type { AppShellVariant } from "../../../../shared/webAppRouteState";

export function useWebJoinedCommunityEntryAction(params: {
  session: AuthSession | null;
  shellVariant: AppShellVariant;
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
    view: AppView;
    settingsPage: "profile";
    communitySlug: string | null;
    communityTab: CommunityTab;
  }) => void;
  loadCommunities: (session: AuthSession) => Promise<void>;
}) {
  return useCallback(
    (options: {
      communityId: string;
      communitySlug?: string | null;
      communityTab?: CommunityTab;
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
        view: params.shellVariant === "mobile" ? "community_home" : "home",
        settingsPage: "profile",
        communitySlug: slug || null,
        communityTab: options.communityTab ?? "chat",
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
      params.shellVariant,
      params.sessionRef,
      params.applyAppRouteState,
      params.setPublicRoute,
      params.syncCommunitySelection,
    ],
  );
}

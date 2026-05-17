import { useEffect } from "react";
import type { AppPage, CommunityTab } from "./appShellNavigation";
import type { CommunityEventsRange } from "./useCommunityEventsController";

export function useCommunityEventsTabLifecycle<SessionT>(params: {
  activePage: AppPage;
  communityTab: CommunityTab;
  session: SessionT | null;
  activeCommunityId: string | null;
  range: CommunityEventsRange;
  loadCommunityEvents: (communityId: string, session: SessionT, range: CommunityEventsRange) => Promise<void>;
  requireCommunityPage?: boolean;
  shouldLoad?: boolean;
}) {
  useEffect(() => {
    if (!params.session || !params.activeCommunityId) return;
    if (!params.shouldLoad) {
      if ((params.requireCommunityPage ?? false) && params.activePage !== "community") return;
      if (params.communityTab !== "events") return;
    }
    void params.loadCommunityEvents(params.activeCommunityId, params.session, params.range);
  }, [
    params.session,
    params.activeCommunityId,
    params.activePage,
    params.communityTab,
    params.loadCommunityEvents,
    params.range,
    params.requireCommunityPage,
    params.shouldLoad,
  ]);
}

import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { AppPage, CommunityTab } from "./appShellNavigation";
import type { CommunityAccess } from "./communityTypes";

export function useCommunitySettingsAccessLifecycle<SessionT>(params: {
  activePage: AppPage;
  communityTab: CommunityTab;
  session: SessionT | null;
  activeCommunityId: string | null;
  activeCommunityAccess: CommunityAccess | null;
  resetCommunitySettingsSelection: (communityId: string | null) => void;
  loadCommunitySettings: (args: {
    communityId: string;
    session: SessionT;
    shouldIgnore: () => boolean;
  }) => Promise<void>;
  loadCommunityMemberSettings: (args: {
    communityId: string;
    session: SessionT;
  }) => Promise<void>;
  setCommunityMemberMuted: Dispatch<SetStateAction<boolean>>;
}) {
  const session = params.session;

  useEffect(() => {
    params.resetCommunitySettingsSelection(params.activeCommunityId);
  }, [params.activeCommunityId, params.resetCommunitySettingsSelection]);

  useEffect(() => {
    if (!session || !params.activeCommunityId) {
      params.setCommunityMemberMuted(false);
      return;
    }
    if (!(params.activeCommunityAccess?.can_enter_community ?? params.activeCommunityAccess?.can_view)) return;
    void params.loadCommunityMemberSettings({
      communityId: params.activeCommunityId,
      session,
    });
  }, [
    session,
    params.activeCommunityId,
    params.activeCommunityAccess?.can_enter_community,
    params.activeCommunityAccess?.can_view,
    params.loadCommunityMemberSettings,
  ]);

  useEffect(() => {
    const needsSettingsSnapshot =
      params.activePage === "community" &&
      (params.communityTab === "settings" || params.communityTab === "funnel");
    if (!needsSettingsSnapshot) return;
    if (!session || !params.activeCommunityId) return;
    if (!params.activeCommunityAccess?.can_manage_members) return;

    let cancelled = false;
    void params.loadCommunitySettings({
      communityId: params.activeCommunityId,
      session,
      shouldIgnore: () => cancelled,
    });
    return () => {
      cancelled = true;
    };
  }, [
    params.activePage,
    params.communityTab,
    session,
    params.activeCommunityId,
    params.activeCommunityAccess?.can_manage_members,
    params.loadCommunitySettings,
  ]);
}

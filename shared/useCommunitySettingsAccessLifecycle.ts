import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { AppPage, CommunityTab } from "./appShellNavigation";
import type { CommunityAccess, CommunityPricingMode } from "./communityTypes";

export function useCommunitySettingsAccessLifecycle<SessionT, CommunityT>(params: {
  activePage: AppPage;
  communityTab: CommunityTab;
  session: SessionT | null;
  activeCommunityId: string | null;
  activeCommunityAccess: CommunityAccess | null;
  communities: CommunityT[];
  syncCommunitySettingsSelection: (args: {
    activeCommunityId: string | null;
    communities: CommunityT[];
  }) => void;
  loadCommunityMemberSettings: (args: {
    communityId: string;
    session: SessionT;
  }) => Promise<void>;
  loadCommunityPricing: (args: {
    communityId: string;
    session: SessionT;
    shouldIgnore: () => boolean;
  }) => Promise<void>;
  loadCommunityAccess: (communityId: string, session: SessionT) => Promise<void>;
  setCommunityMemberMuted: Dispatch<SetStateAction<boolean>>;
  setCommunitySettingsPricingMode: Dispatch<SetStateAction<CommunityPricingMode>>;
  setCommunitySettingsPriceUsdMonthly: Dispatch<SetStateAction<string>>;
  setCommunitySettingsPriceUsdYearly: Dispatch<SetStateAction<string>>;
  setActiveCommunityAccess: Dispatch<SetStateAction<CommunityAccess | null>>;
  setIsLoadingCommunityAccess: Dispatch<SetStateAction<boolean>>;
}) {
  const session = params.session;

  useEffect(() => {
    params.syncCommunitySettingsSelection({
      activeCommunityId: params.activeCommunityId,
      communities: params.communities,
    });
  }, [params.activeCommunityId, params.communities, params.syncCommunitySettingsSelection]);

  useEffect(() => {
    if (params.activePage !== "community" || params.communityTab !== "settings") return;
    if (!session || !params.activeCommunityId) {
      params.setCommunityMemberMuted(false);
      return;
    }
    if (!(params.activeCommunityAccess?.can_enter_community ?? params.activeCommunityAccess?.can_view)) return;
    if (params.activeCommunityAccess.is_owner || params.activeCommunityAccess.can_manage_members) return;
    void params.loadCommunityMemberSettings({
      communityId: params.activeCommunityId,
      session,
    });
  }, [
    params.activePage,
    params.communityTab,
    session,
    params.activeCommunityId,
    params.activeCommunityAccess?.can_enter_community,
    params.activeCommunityAccess?.can_view,
    params.activeCommunityAccess?.is_owner,
    params.activeCommunityAccess?.can_manage_members,
    params.loadCommunityMemberSettings,
  ]);

  useEffect(() => {
    if (params.activePage !== "community" || params.communityTab !== "settings") return;
    if (!session || !params.activeCommunityId) {
      params.setCommunitySettingsPricingMode("free");
      params.setCommunitySettingsPriceUsdMonthly("");
      params.setCommunitySettingsPriceUsdYearly("");
      return;
    }
    if (!params.activeCommunityAccess?.can_manage_members) return;

    let cancelled = false;
    const communityId = params.activeCommunityId;
    void params.loadCommunityPricing({
      communityId,
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
    params.loadCommunityPricing,
  ]);

  useEffect(() => {
    if (!session || !params.activeCommunityId) {
      params.setActiveCommunityAccess(null);
      params.setIsLoadingCommunityAccess(false);
      return;
    }
    void params.loadCommunityAccess(params.activeCommunityId, session);
  }, [session, params.activeCommunityId]);
}

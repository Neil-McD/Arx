import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { AppPage, CommunityTab } from "./appShellNavigation";
import type { CommunityAccess, CommunityPricingMode } from "./communityTypes";

export function useCommunitySettingsAccessLifecycle<SessionT, CommunityT>(params: {
  activePage: AppPage;
  communityTab: CommunityTab;
  supabaseSession: SessionT | null;
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
  setCommunitySettingsMonthlyPlanId: Dispatch<SetStateAction<string | null>>;
  setCommunitySettingsYearlyPlanId: Dispatch<SetStateAction<string | null>>;
  setCommunitySettingsPricingMode: Dispatch<SetStateAction<CommunityPricingMode>>;
  setCommunitySettingsPriceUsdMonthly: Dispatch<SetStateAction<string>>;
  setCommunitySettingsPriceUsdYearly: Dispatch<SetStateAction<string>>;
  setActiveCommunityAccess: Dispatch<SetStateAction<CommunityAccess | null>>;
  setIsLoadingCommunityAccess: Dispatch<SetStateAction<boolean>>;
}) {
  useEffect(() => {
    params.syncCommunitySettingsSelection({
      activeCommunityId: params.activeCommunityId,
      communities: params.communities,
    });
  }, [params.activeCommunityId, params.communities, params.syncCommunitySettingsSelection]);

  useEffect(() => {
    if (params.activePage !== "community" || params.communityTab !== "settings") return;
    if (!params.supabaseSession || !params.activeCommunityId) {
      params.setCommunityMemberMuted(false);
      return;
    }
    if (!params.activeCommunityAccess?.can_view) return;
    if (params.activeCommunityAccess.is_owner || params.activeCommunityAccess.can_manage_members) return;
    void params.loadCommunityMemberSettings({
      communityId: params.activeCommunityId,
      session: params.supabaseSession,
    });
  }, [
    params.activePage,
    params.communityTab,
    params.supabaseSession,
    params.activeCommunityId,
    params.activeCommunityAccess?.can_view,
    params.activeCommunityAccess?.is_owner,
    params.activeCommunityAccess?.can_manage_members,
    params.loadCommunityMemberSettings,
  ]);

  useEffect(() => {
    if (params.activePage !== "community" || params.communityTab !== "settings") return;
    if (!params.supabaseSession || !params.activeCommunityId) {
      params.setCommunitySettingsMonthlyPlanId(null);
      params.setCommunitySettingsYearlyPlanId(null);
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
      session: params.supabaseSession,
      shouldIgnore: () => cancelled,
    });
    return () => {
      cancelled = true;
    };
  }, [
    params.activePage,
    params.communityTab,
    params.supabaseSession,
    params.activeCommunityId,
    params.activeCommunityAccess?.can_manage_members,
    params.loadCommunityPricing,
  ]);

  useEffect(() => {
    if (!params.supabaseSession || !params.activeCommunityId) {
      params.setActiveCommunityAccess(null);
      params.setIsLoadingCommunityAccess(false);
      return;
    }
    void params.loadCommunityAccess(params.activeCommunityId, params.supabaseSession);
  }, [params.supabaseSession, params.activeCommunityId]);
}

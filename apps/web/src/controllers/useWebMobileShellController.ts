import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react";
import type { AppPage, AppView } from "../../../../shared/appShellNavigation";
import type { BuilderUpgradeContext } from "../../../../shared/authResumeState";

type MobileOverlay = "agent" | "community" | "community_selector";
type MobileSettingsView = "index" | "detail";
type MobileShellMode = "agent" | "discover" | "community";

export function useWebMobileShellController(params: {
  activePage: AppPage;
  activeView: AppView;
  activeCommunitySlug: string | null;
  selectedActiveCommunitySlug: string | null;
  mobileOverlay: MobileOverlay | null;
  showMobileShell: boolean;
  showMobileSettingsShell: boolean;
  setMobileOverlay: Dispatch<SetStateAction<MobileOverlay | null>>;
  setActivePage: Dispatch<SetStateAction<AppPage>>;
  setActiveView: Dispatch<SetStateAction<AppView>>;
  setMobileSettingsView: Dispatch<SetStateAction<MobileSettingsView>>;
  openCommunityChat: (communitySlug: string, opts?: { clearUnread?: boolean; pushSnapshot?: boolean }) => void;
  handleOpenDiscover: () => void;
  handleTopbarBackToWorkspace: () => void;
  hasBuilderAccess: boolean;
  openCreateCommunityModal: () => void;
  setBuilderUpgradeContext: Dispatch<SetStateAction<BuilderUpgradeContext>>;
  setIsBuilderUpgradeOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const openMobileCommunitySurface = useCallback(() => {
    const nextCommunitySlug = String(
      params.selectedActiveCommunitySlug ?? params.activeCommunitySlug ?? "",
    ).trim();
    if (nextCommunitySlug) {
      params.openCommunityChat(nextCommunitySlug, { clearUnread: true });
      return;
    }
    params.handleOpenDiscover();
  }, [
    params.activeCommunitySlug,
    params.handleOpenDiscover,
    params.openCommunityChat,
    params.selectedActiveCommunitySlug,
  ]);

  const handleSelectMobileMode = useCallback(
    (nextMode: MobileShellMode) => {
      params.setMobileOverlay(null);
      if (nextMode === "agent") {
        if (params.activeView === "settings") {
          params.setActiveView("home");
          return;
        }
        if (params.activePage !== "workspace") {
          params.handleTopbarBackToWorkspace();
        }
        return;
      }
      openMobileCommunitySurface();
    },
    [
      params.activePage,
      params.activeView,
      params.handleTopbarBackToWorkspace,
      params.setActiveView,
      params.setMobileOverlay,
      openMobileCommunitySurface,
    ],
  );

  const openMobileAgentSettings = useCallback(() => {
    params.setMobileOverlay(null);
    params.setActivePage("workspace");
    params.setActiveView("settings");
    params.setMobileSettingsView("index");
  }, [
    params.setActivePage,
    params.setActiveView,
    params.setMobileOverlay,
    params.setMobileSettingsView,
  ]);

  const handleExitMobileSettings = useCallback(() => {
    params.setMobileOverlay(null);
    params.setActivePage("workspace");
    params.setActiveView("home");
  }, [params.setActivePage, params.setActiveView, params.setMobileOverlay]);

  const openMobileCreateCommunity = useCallback(() => {
    params.setMobileOverlay(null);
    if (params.hasBuilderAccess) {
      params.openCreateCommunityModal();
      return;
    }
    params.setBuilderUpgradeContext("builder");
    params.setIsBuilderUpgradeOpen(true);
  }, [
    params.hasBuilderAccess,
    params.openCreateCommunityModal,
    params.setBuilderUpgradeContext,
    params.setIsBuilderUpgradeOpen,
    params.setMobileOverlay,
  ]);

  useEffect(() => {
    if (!params.showMobileShell && params.mobileOverlay) {
      params.setMobileOverlay(null);
    }
  }, [params.mobileOverlay, params.setMobileOverlay, params.showMobileShell]);

  useEffect(() => {
    if (!params.showMobileSettingsShell) {
      params.setMobileSettingsView("detail");
    }
  }, [params.setMobileSettingsView, params.showMobileSettingsShell]);

  return {
    openMobileCommunitySurface,
    handleSelectMobileMode,
    openMobileAgentSettings,
    handleExitMobileSettings,
    openMobileCreateCommunity,
  };
}

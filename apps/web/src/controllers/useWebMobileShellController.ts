import {
  useCallback,
  useEffect,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { AppPage, AppView } from "../../../../shared/appShellNavigation";
import type { MobileOverlay, MobileRootPage } from "../components/webShellChromeShared";

type MobileSettingsView = "index" | "detail";

export function useWebMobileShellController(params: {
  activePage: AppPage;
  activeView: AppView;
  activeCommunitySlug: string | null;
  selectedActiveCommunitySlug: string | null;
  mobileRootPage: MobileRootPage;
  hasSelectedCommunity: boolean;
  canViewMembers: boolean;
  forceCommunityRoot: boolean;
  mobileOverlay: MobileOverlay | null;
  showMobileShell: boolean;
  showMobileSettingsShell: boolean;
  canOpenDirectMessages: boolean;
  isDirectMessagesOpen: boolean;
  setMobileOverlay: Dispatch<SetStateAction<MobileOverlay | null>>;
  setMobileRootPage: Dispatch<SetStateAction<MobileRootPage>>;
  setActivePage: Dispatch<SetStateAction<AppPage>>;
  setActiveView: Dispatch<SetStateAction<AppView>>;
  setMobileSettingsView: Dispatch<SetStateAction<MobileSettingsView>>;
  openCommunityChat: (communitySlug: string, opts?: { clearUnread?: boolean; pushSnapshot?: boolean }) => void;
  handleOpenDiscover: () => void;
  handleTopbarBackToWorkspace: () => void;
  openDirectMessages: () => void;
  closeDirectMessages: () => void;
  hasCommunityCreateAccess: boolean;
  openCommunityCreateFlow: () => void;
  setIsFreeAccountInfoOpen: Dispatch<SetStateAction<boolean>>;
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

  const handleSelectMobileRootPage = useCallback(
    (nextRootPage: MobileRootPage) => {
      if (params.forceCommunityRoot) {
        params.closeDirectMessages();
        params.setMobileRootPage("community");
        params.setMobileOverlay(nextRootPage === "community" ? null : "community");
        return;
      }

      if (nextRootPage === "messages") {
        if (!params.canOpenDirectMessages) return;
        params.setMobileOverlay(null);
        params.setMobileRootPage("messages");
        params.openDirectMessages();
        return;
      }

      params.closeDirectMessages();
      params.setMobileOverlay(null);

      if (nextRootPage === "agent") {
        params.setMobileRootPage("agent");
        if (params.activeView === "settings") {
          params.setActiveView("home");
          return;
        }
        if (params.activePage !== "workspace") {
          params.handleTopbarBackToWorkspace();
        }
        return;
      }

      params.setMobileRootPage("community");
      openMobileCommunitySurface();
    },
    [
      params.activePage,
      params.activeView,
      params.canOpenDirectMessages,
      params.closeDirectMessages,
      params.forceCommunityRoot,
      params.handleTopbarBackToWorkspace,
      params.openDirectMessages,
      params.setActiveView,
      params.setMobileOverlay,
      params.setMobileRootPage,
      openMobileCommunitySurface,
    ],
  );

  const openMobileAgentSettings = useCallback(() => {
    params.closeDirectMessages();
    params.setMobileOverlay(null);
    params.setActivePage("workspace");
    params.setActiveView("settings");
    params.setMobileSettingsView("index");
  }, [
    params.closeDirectMessages,
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
    if (params.hasCommunityCreateAccess) {
      params.openCommunityCreateFlow();
      return;
    }
    params.setIsFreeAccountInfoOpen(true);
  }, [
    params.hasCommunityCreateAccess,
    params.openCommunityCreateFlow,
    params.setIsFreeAccountInfoOpen,
    params.setMobileOverlay,
  ]);

  const openMobileDrawer = useCallback(() => {
    if (params.forceCommunityRoot) {
      params.setMobileOverlay("community");
      return;
    }
    if (params.mobileRootPage === "agent") {
      params.setMobileOverlay("agent");
      return;
    }
    if (params.mobileRootPage === "messages") return;
    params.setMobileOverlay(params.hasSelectedCommunity ? "community" : "community_selector");
  }, [
    params.forceCommunityRoot,
    params.hasSelectedCommunity,
    params.mobileRootPage,
    params.setMobileOverlay,
  ]);

  useEffect(() => {
    if (!params.showMobileShell && params.mobileOverlay) {
      params.setMobileOverlay(null);
    }
  }, [params.mobileOverlay, params.setMobileOverlay, params.showMobileShell]);

  useEffect(() => {
    if (params.mobileOverlay === "members" && !params.canViewMembers) {
      params.setMobileOverlay(null);
    }
  }, [params.canViewMembers, params.mobileOverlay, params.setMobileOverlay]);

  useEffect(() => {
    if (params.canOpenDirectMessages || params.mobileRootPage !== "messages") return;
    if (params.isDirectMessagesOpen) params.closeDirectMessages();
    params.setMobileRootPage("agent");
  }, [
    params.canOpenDirectMessages,
    params.closeDirectMessages,
    params.isDirectMessagesOpen,
    params.mobileRootPage,
    params.setMobileRootPage,
  ]);

  useEffect(() => {
    if (!params.showMobileSettingsShell) {
      params.setMobileSettingsView("detail");
    }
  }, [params.setMobileSettingsView, params.showMobileSettingsShell]);

  useEffect(() => {
    if (!params.showMobileShell) return;
    if (params.forceCommunityRoot) {
      if (params.isDirectMessagesOpen) params.closeDirectMessages();
      if (params.mobileRootPage !== "community") params.setMobileRootPage("community");
      return;
    }
    if (params.isDirectMessagesOpen && params.canOpenDirectMessages) {
      if (params.mobileOverlay) params.setMobileOverlay(null);
      if (params.mobileRootPage !== "messages") params.setMobileRootPage("messages");
      return;
    }
    if (params.activePage === "workspace") {
      if (params.mobileRootPage !== "agent") params.setMobileRootPage("agent");
      return;
    }
    if (
      params.activePage === "community" ||
      params.activePage === "discover" ||
      params.activePage === "docs"
    ) {
      if (params.mobileRootPage !== "community") params.setMobileRootPage("community");
    }
  }, [
    params.activePage,
    params.canOpenDirectMessages,
    params.closeDirectMessages,
    params.forceCommunityRoot,
    params.isDirectMessagesOpen,
    params.mobileOverlay,
    params.mobileRootPage,
    params.setMobileOverlay,
    params.setMobileRootPage,
    params.showMobileShell,
  ]);

  return {
    handleSelectMobileRootPage,
    openMobileAgentSettings,
    handleExitMobileSettings,
    openMobileCreateCommunity,
    openMobileDrawer,
  };
}

import {
  useCallback,
  useEffect,
  type Dispatch,
  type SetStateAction,
} from "react";
import type {
  MobileOverlay,
  MobileRootPage,
} from "../components/webShellChromeShared";

type MobileSettingsView = "index" | "detail";

export function useWebMobileShellController(params: {
  isCommunityAgentPage: boolean;
  activeCommunitySlug: string | null;
  selectedActiveCommunitySlug: string | null;
  mobileRootPage: MobileRootPage;
  canViewMembers: boolean;
  mobileOverlay: MobileOverlay | null;
  showMobileShell: boolean;
  showMobileSettingsShell: boolean;
  canOpenDirectMessages: boolean;
  isDirectMessagesOpen: boolean;
  isThreadPageOpen: boolean;
  setMobileOverlay: Dispatch<SetStateAction<MobileOverlay | null>>;
  setMobileRootPage: Dispatch<SetStateAction<MobileRootPage>>;
  setMobileSettingsView: Dispatch<SetStateAction<MobileSettingsView>>;
  openCommunityHome: (
    communitySlug: string,
    opts?: { pushSnapshot?: boolean },
  ) => void;
  handleOpenDiscover: () => void;
  // Home's own address (/c/:slug/home), so the Home tab survives a refresh.
  openHomePage?: () => void;
  openDirectMessages: () => void;
  closeDirectMessages: () => void;
  closeThreadPage: () => void;
  openCommunityCreateFlow: () => void;
}) {
  // The Home tab follows Home's address both ways: arriving at /home selects
  // it, and leaving it (Back to /browse, a link) hands the tab back to the
  // community, so the tab never shows Home over another address.
  useEffect(() => {
    if (!params.showMobileShell) return;
    if (params.isCommunityAgentPage) {
      params.setMobileRootPage("agent");
    } else if (params.mobileRootPage === "agent") {
      params.setMobileRootPage("community");
    }
  }, [
    params.showMobileShell,
    params.isCommunityAgentPage,
    params.mobileRootPage,
    params.setMobileRootPage,
  ]);

  const openMobileCommunitySurface = useCallback(() => {
    const nextCommunitySlug = String(
      params.selectedActiveCommunitySlug ?? params.activeCommunitySlug ?? "",
    ).trim();
    if (nextCommunitySlug) {
      params.openCommunityHome(nextCommunitySlug);
      return;
    }
    params.handleOpenDiscover();
  }, [
    params.activeCommunitySlug,
    params.handleOpenDiscover,
    params.openCommunityHome,
    params.selectedActiveCommunitySlug,
  ]);

  const prepareMobileGlobalNavigation = useCallback(() => {
    if (params.isThreadPageOpen) params.closeThreadPage();
    params.closeDirectMessages();
    params.setMobileOverlay(null);
    params.setMobileRootPage("community");
  }, [
    params.closeDirectMessages,
    params.closeThreadPage,
    params.isThreadPageOpen,
    params.setMobileOverlay,
    params.setMobileRootPage,
  ]);

  const handleSelectMobileRootPage = useCallback(
    (nextRootPage: MobileRootPage) => {
      if (params.isThreadPageOpen) params.closeThreadPage();

      if (nextRootPage === "messages") {
        if (!params.canOpenDirectMessages) return;
        params.setMobileOverlay(null);
        params.setMobileRootPage("messages");
        params.openDirectMessages();
        return;
      }

      if (nextRootPage === "agent") {
        params.closeDirectMessages();
        params.setMobileOverlay(null);
        params.setMobileRootPage("agent");
        params.openHomePage?.();
        return;
      }

      prepareMobileGlobalNavigation();
      openMobileCommunitySurface();
    },
    [
      params.canOpenDirectMessages,
      params.closeDirectMessages,
      params.closeThreadPage,
      params.isThreadPageOpen,
      params.openDirectMessages,
      params.openHomePage,
      params.setMobileOverlay,
      params.setMobileRootPage,
      openMobileCommunitySurface,
      prepareMobileGlobalNavigation,
    ],
  );

  const handleExitMobileSettings = useCallback(() => {
    params.setMobileOverlay(null);
    params.setMobileRootPage("community");
    openMobileCommunitySurface();
  }, [openMobileCommunitySurface, params.setMobileOverlay, params.setMobileRootPage]);

  const openMobileCreateCommunity = useCallback(() => {
    prepareMobileGlobalNavigation();
    params.openCommunityCreateFlow();
  }, [
    params.openCommunityCreateFlow,
    prepareMobileGlobalNavigation,
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
    params.setMobileRootPage("community");
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
    if (params.isDirectMessagesOpen && params.canOpenDirectMessages) {
      if (params.mobileOverlay) params.setMobileOverlay(null);
      if (params.mobileRootPage !== "messages") {
        params.setMobileRootPage("messages");
      }
      return;
    }
    if (params.mobileRootPage === "messages") {
      params.setMobileRootPage("community");
    }
  }, [
    params.canOpenDirectMessages,
    params.closeDirectMessages,
    params.isDirectMessagesOpen,
    params.mobileOverlay,
    params.mobileRootPage,
    params.setMobileOverlay,
    params.setMobileRootPage,
    params.showMobileShell,
  ]);

  return {
    handleSelectMobileRootPage,
    handleExitMobileSettings,
    openMobileCreateCommunity,
    prepareMobileGlobalNavigation,
  };
}

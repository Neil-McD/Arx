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
  isThreadPageOpen: boolean;
  setMobileOverlay: Dispatch<SetStateAction<MobileOverlay | null>>;
  setMobileRootPage: Dispatch<SetStateAction<MobileRootPage>>;
  setMobileSettingsView: Dispatch<SetStateAction<MobileSettingsView>>;
  openCommunityHome: (
    communitySlug: string,
    opts?: { pushSnapshot?: boolean },
  ) => void;
  handleOpenDiscover: () => void;
  // Messages is on the community's site: this leaves Studio for it.
  openDirectMessages: () => void;
  closeThreadPage: () => void;
  openCommunityCreateFlow: () => void;
}) {
  useEffect(() => {
    if (params.showMobileShell && params.isCommunityAgentPage) {
      params.setMobileRootPage("agent");
    }
  }, [params.showMobileShell, params.isCommunityAgentPage, params.setMobileRootPage]);

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
    params.setMobileOverlay(null);
    params.setMobileRootPage("community");
  }, [
    params.closeThreadPage,
    params.isThreadPageOpen,
    params.setMobileOverlay,
    params.setMobileRootPage,
  ]);

  const handleSelectMobileRootPage = useCallback(
    (nextRootPage: MobileRootPage) => {
      if (params.isThreadPageOpen) params.closeThreadPage();

      if (nextRootPage === "messages") {
        if (params.canOpenDirectMessages) params.openDirectMessages();
        return;
      }

      if (nextRootPage === "agent") {
        params.setMobileOverlay(null);
        params.setMobileRootPage("agent");
        return;
      }

      prepareMobileGlobalNavigation();
      openMobileCommunitySurface();
    },
    [
      params.canOpenDirectMessages,
      params.closeThreadPage,
      params.isThreadPageOpen,
      params.openDirectMessages,
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
    if (!params.showMobileSettingsShell) {
      params.setMobileSettingsView("detail");
    }
  }, [params.setMobileSettingsView, params.showMobileSettingsShell]);

  // Messages is never a Studio page now (it's on the site): back to the community.
  useEffect(() => {
    if (params.mobileRootPage === "messages") params.setMobileRootPage("community");
  }, [params.mobileRootPage, params.setMobileRootPage]);

  return {
    handleSelectMobileRootPage,
    handleExitMobileSettings,
    openMobileCreateCommunity,
    prepareMobileGlobalNavigation,
  };
}

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
  activeCommunitySlug: string | null;
  selectedActiveCommunitySlug: string | null;
  mobileRootPage: MobileRootPage;
  canViewMembers: boolean;
  forceCommunityRoot: boolean;
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
  openDirectMessages: () => void;
  closeDirectMessages: () => void;
  closeThreadPage: () => void;
  openCommunityCreateFlow: () => void;
}) {
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

  const handleSelectMobileRootPage = useCallback(
    (nextRootPage: MobileRootPage) => {
      if (params.isThreadPageOpen) params.closeThreadPage();

      if (params.forceCommunityRoot) {
        params.closeDirectMessages();
        params.setMobileRootPage("community");
        params.setMobileOverlay(null);
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
        return;
      }

      params.setMobileRootPage("community");
      openMobileCommunitySurface();
    },
    [
      params.canOpenDirectMessages,
      params.closeDirectMessages,
      params.closeThreadPage,
      params.forceCommunityRoot,
      params.isThreadPageOpen,
      params.openDirectMessages,
      params.setMobileOverlay,
      params.setMobileRootPage,
      openMobileCommunitySurface,
    ],
  );

  const handleExitMobileSettings = useCallback(() => {
    params.setMobileOverlay(null);
    params.setMobileRootPage("community");
    openMobileCommunitySurface();
  }, [openMobileCommunitySurface, params.setMobileOverlay, params.setMobileRootPage]);

  const openMobileCreateCommunity = useCallback(() => {
    params.setMobileOverlay(null);
    params.openCommunityCreateFlow();
  }, [
    params.openCommunityCreateFlow,
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
    if (params.forceCommunityRoot) {
      if (params.isDirectMessagesOpen) params.closeDirectMessages();
      if (params.mobileRootPage !== "community") {
        params.setMobileRootPage("community");
      }
      return;
    }
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
    handleExitMobileSettings,
    openMobileCreateCommunity,
  };
}

import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
  type TouchEventHandler,
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
  canViewMembersRoot: boolean;
  forceCommunityRoot: boolean;
  mobileOverlay: MobileOverlay | null;
  showMobileShell: boolean;
  showMobileSettingsShell: boolean;
  setMobileOverlay: Dispatch<SetStateAction<MobileOverlay | null>>;
  setMobileRootPage: Dispatch<SetStateAction<MobileRootPage>>;
  setActivePage: Dispatch<SetStateAction<AppPage>>;
  setActiveView: Dispatch<SetStateAction<AppView>>;
  setMobileSettingsView: Dispatch<SetStateAction<MobileSettingsView>>;
  openCommunityChat: (communitySlug: string, opts?: { clearUnread?: boolean; pushSnapshot?: boolean }) => void;
  handleOpenDiscover: () => void;
  handleTopbarBackToWorkspace: () => void;
  hasCommunityCreateAccess: boolean;
  openCommunityCreateFlow: () => void;
  setIsFreeAccountInfoOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const mobileShellSwipeStartRef = useRef<{ x: number; y: number } | null>(null);

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
        params.setMobileRootPage("community");
        params.setMobileOverlay(nextRootPage === "community" ? null : "community");
        return;
      }

      if (nextRootPage === "threads") {
        params.setMobileRootPage("agent");
        params.setMobileOverlay("agent");
        return;
      }

      if (nextRootPage === "agent") {
        params.setMobileOverlay(null);
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

      if (nextRootPage === "members") {
        if (!params.canViewMembersRoot) {
          params.setMobileOverlay(null);
          params.setMobileRootPage("community");
          openMobileCommunitySurface();
          return;
        }
        params.setMobileRootPage("community");
        if (params.activePage !== "community") {
          openMobileCommunitySurface();
        }
        params.setMobileOverlay("members");
        return;
      }

      params.setMobileOverlay(null);
      params.setMobileRootPage("community");
      openMobileCommunitySurface();
    },
    [
      params.activePage,
      params.activeView,
      params.canViewMembersRoot,
      params.forceCommunityRoot,
      params.handleTopbarBackToWorkspace,
      params.setActiveView,
      params.setMobileOverlay,
      params.setMobileRootPage,
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
    if (params.mobileRootPage === "agent" || params.mobileRootPage === "threads") {
      params.setMobileOverlay("agent");
      return;
    }
    params.setMobileOverlay(params.hasSelectedCommunity ? "community" : "community_selector");
  }, [
    params.hasSelectedCommunity,
    params.forceCommunityRoot,
    params.mobileRootPage,
    params.setMobileOverlay,
  ]);

  const handleMobileShellTouchStart = useCallback<TouchEventHandler<HTMLDivElement>>((event) => {
    if (!params.showMobileShell || params.mobileOverlay || event.touches.length !== 1) {
      mobileShellSwipeStartRef.current = null;
      return;
    }
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest(
        "input, textarea, button, a, [role='button'], [contenteditable='true'], .mobile-drawer",
      )
    ) {
      mobileShellSwipeStartRef.current = null;
      return;
    }
    const touch = event.touches[0];
    mobileShellSwipeStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, [params.mobileOverlay, params.showMobileShell]);

  const handleMobileShellTouchEnd = useCallback<TouchEventHandler<HTMLDivElement>>((event) => {
    const start = mobileShellSwipeStartRef.current;
    mobileShellSwipeStartRef.current = null;
    if (!start || !params.showMobileShell || params.mobileOverlay || event.changedTouches.length !== 1) {
      return;
    }
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 72 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const rootOrder: MobileRootPage[] = params.forceCommunityRoot
      ? ["community"]
      : params.canViewMembersRoot
      ? ["threads", "agent", "community", "members"]
      : ["threads", "agent", "community"];
    const currentIndex = Math.max(0, rootOrder.indexOf(params.mobileRootPage));
    const nextIndex = currentIndex + (dx < 0 ? 1 : -1);
    const nextRootPage = rootOrder[nextIndex];
    if (nextRootPage) handleSelectMobileRootPage(nextRootPage);
  }, [
    params.canViewMembersRoot,
    params.forceCommunityRoot,
    params.mobileOverlay,
    params.mobileRootPage,
    params.showMobileShell,
    handleSelectMobileRootPage,
  ]);

  const handleMobileShellTouchCancel = useCallback(() => {
    mobileShellSwipeStartRef.current = null;
  }, []);

  useEffect(() => {
    if (!params.showMobileShell && params.mobileOverlay) {
      params.setMobileOverlay(null);
    }
  }, [params.mobileOverlay, params.setMobileOverlay, params.showMobileShell]);

  useEffect(() => {
    if (params.mobileOverlay) {
      mobileShellSwipeStartRef.current = null;
      if (params.mobileOverlay === "members" && params.mobileRootPage !== "community") {
        params.setMobileRootPage("community");
      }
    }
  }, [params.mobileOverlay, params.mobileRootPage, params.setMobileRootPage]);

  useEffect(() => {
    if (!params.showMobileSettingsShell) {
      params.setMobileSettingsView("detail");
    }
  }, [params.setMobileSettingsView, params.showMobileSettingsShell]);

  useEffect(() => {
    if (!params.showMobileShell) return;
    if (params.forceCommunityRoot) {
      if (params.mobileRootPage !== "community") params.setMobileRootPage("community");
      return;
    }
    if (params.mobileRootPage === "members" && !params.canViewMembersRoot) {
      params.setMobileRootPage("community");
      return;
    }
    if (params.activePage === "workspace") {
      if (params.mobileRootPage === "community" || params.mobileRootPage === "members") {
        params.setMobileRootPage("agent");
      }
      return;
    }
    if (params.activePage === "community") {
      if (params.mobileRootPage === "threads" || params.mobileRootPage === "agent") {
        params.setMobileRootPage("community");
      }
      return;
    }
    if (params.activePage === "discover" || params.activePage === "docs") {
      if (params.mobileRootPage !== "community") params.setMobileRootPage("community");
    }
  }, [
    params.activePage,
    params.canViewMembersRoot,
    params.forceCommunityRoot,
    params.mobileRootPage,
    params.setMobileRootPage,
    params.showMobileShell,
  ]);

  return {
    handleSelectMobileRootPage,
    openMobileAgentSettings,
    handleExitMobileSettings,
    openMobileCreateCommunity,
    openMobileDrawer,
    handleMobileShellTouchStart,
    handleMobileShellTouchEnd,
    handleMobileShellTouchCancel,
  };
}

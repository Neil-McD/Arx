import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
  type TouchEventHandler,
} from "react";
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
  mobileShellMode: MobileShellMode;
  hasSelectedCommunity: boolean;
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
  const mobileShellSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const mobileAgentDrawerSwipeEdgePx = 44;

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

  const openMobileDrawer = useCallback(() => {
    if (params.mobileShellMode === "agent") {
      params.setMobileOverlay("agent");
      return;
    }
    params.setMobileOverlay(params.hasSelectedCommunity ? "community" : "community_selector");
  }, [
    params.hasSelectedCommunity,
    params.mobileShellMode,
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
    if (dx < 0) {
      if (params.activePage === "workspace") {
        openMobileCommunitySurface();
      }
      return;
    }
    if (params.activePage === "workspace") {
      if (start.x <= mobileAgentDrawerSwipeEdgePx) {
        openMobileDrawer();
      }
      return;
    }
    if (params.activePage === "community" || params.activePage === "discover") {
      params.handleTopbarBackToWorkspace();
    }
  }, [
    params.activePage,
    params.handleTopbarBackToWorkspace,
    params.mobileOverlay,
    params.showMobileShell,
    openMobileCommunitySurface,
    openMobileDrawer,
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
    }
  }, [params.mobileOverlay]);

  useEffect(() => {
    if (!params.showMobileSettingsShell) {
      params.setMobileSettingsView("detail");
    }
  }, [params.setMobileSettingsView, params.showMobileSettingsShell]);

  return {
    handleSelectMobileMode,
    openMobileAgentSettings,
    handleExitMobileSettings,
    openMobileCreateCommunity,
    openMobileDrawer,
    handleMobileShellTouchStart,
    handleMobileShellTouchEnd,
    handleMobileShellTouchCancel,
  };
}

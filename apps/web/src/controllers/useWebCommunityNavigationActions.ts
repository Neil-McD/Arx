import {
  useCallback,
  useEffect,
  type MutableRefObject,
} from "react";

import type {
  CommunitySettingsPane,
  CommunityTab,
} from "../../../../shared/appShellNavigation";
import { confirmDiscardUnsavedCommunitySettingsWeb } from "../../../../shared/communityUnsavedGuard";
import {
  applyShellVariantToPublicPath,
  buildCommunityFunnelPreviewPath,
  buildCommunityOnboardingPreviewPath,
  buildCommunityTabPath,
  type AppShellVariant,
} from "../../../../shared/webAppRouteState";
import type { CommunityFunnelSlot } from "../../../../shared/communityTypes";
import type { MobileOverlay } from "../components/webShellChromeShared";
import type { WebCommunityRecord } from "../webAppContracts";

export function useWebCommunityNavigationActions(params: {
  activeCommunity: WebCommunityRecord | null;
  selectedActiveCommunityId: string | null;
  selectedActiveCommunitySlug: string | null;
  communities: WebCommunityRecord[];
  shellVariant: AppShellVariant;
  isOnboardingPreviewMode: boolean;
  communitySettingsDirtyRef: MutableRefObject<boolean>;
  communityAgentConfigDirtyRef: MutableRefObject<boolean>;
  syncCommunitySelection: (value: {
    communitySlug: string | null;
    communityId: string;
  }) => void;
  resolveKnownCommunitySlugById: (
    communityId: string,
  ) => string | null;
  setCommunitySettingsPane: (pane: CommunitySettingsPane) => void;
  setCommunityResourceModuleId: (value: null) => void;
  setMobileOverlay: (value: MobileOverlay) => void;
  setCommunityOnboardingFirstPostFocusRequest: (
    update: (current: number) => number,
  ) => void;
  applyCommunityShellState: (value: {
    communityTab: CommunityTab;
  }) => void;
  openCommunityTab: (
    slug: string,
    tab: CommunityTab,
    options: {
      pushSnapshot: boolean;
    },
  ) => void;
  navigateTo: (
    path: string,
    options?: { replace?: boolean },
  ) => void;
  pushNavSnapshot: () => void;
}) {
  const confirmCommunityChange = useCallback(
    (nextCommunityId: string) =>
      confirmDiscardUnsavedCommunitySettingsWeb({
        isCommunitySettingsDirty:
          params.communitySettingsDirtyRef.current,
        isCommunityAgentConfigDirty:
          params.communityAgentConfigDirtyRef.current,
        activeCommunityId: params.selectedActiveCommunityId,
        nextCommunityId,
        confirmDiscard: (message) => window.confirm(message),
      }),
    [
      params.communityAgentConfigDirtyRef,
      params.communitySettingsDirtyRef,
      params.selectedActiveCommunityId,
    ],
  );

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (
        !params.communitySettingsDirtyRef.current
        && !params.communityAgentConfigDirtyRef.current
      ) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [
    params.communityAgentConfigDirtyRef,
    params.communitySettingsDirtyRef,
  ]);

  const handlePreviewCommunityFunnel = useCallback(
    (slot: CommunityFunnelSlot) => {
      const slug = String(params.activeCommunity?.slug ?? "").trim();
      if (!slug) return;
      const path = applyShellVariantToPublicPath(
        buildCommunityFunnelPreviewPath(slug, slot) ?? "",
        params.shellVariant,
      );
      if (!path) return;
      params.pushNavSnapshot();
      params.navigateTo(path);
    },
    [
      params.activeCommunity?.slug,
      params.navigateTo,
      params.pushNavSnapshot,
      params.shellVariant,
    ],
  );

  const handleSelectActiveCommunity = useCallback(
    (community: WebCommunityRecord): boolean => {
      if (!confirmCommunityChange(community.id)) return false;
      params.syncCommunitySelection({
        communitySlug: (community.slug ?? "").trim() || null,
        communityId: community.id,
      });
      return true;
    },
    [confirmCommunityChange, params.syncCommunitySelection],
  );

  const handleSelectCommunitySettingsPane = useCallback(
    (
      pane: CommunitySettingsPane,
      options?: { replace?: boolean },
    ) => {
      params.setCommunitySettingsPane(pane);
      const slug = String(
        params.selectedActiveCommunitySlug ??
          params.activeCommunity?.slug ??
          "",
      ).trim();
      if (!slug) return;
      const path = buildCommunityTabPath(
        slug,
        "settings",
        null,
        pane,
      );
      if (path) {
        params.navigateTo(
          path,
          options?.replace ? { replace: true } : {},
        );
      }
    },
    [
      params.activeCommunity?.slug,
      params.navigateTo,
      params.selectedActiveCommunitySlug,
      params.setCommunitySettingsPane,
    ],
  );

  const handlePreviewCommunityOnboarding = useCallback(() => {
    const slug = String(
      params.selectedActiveCommunitySlug ??
        params.activeCommunity?.slug ??
        "",
    ).trim();
    const path = buildCommunityOnboardingPreviewPath(slug);
    if (path) params.navigateTo(path);
  }, [
    params.activeCommunity?.slug,
    params.navigateTo,
    params.selectedActiveCommunitySlug,
  ]);

  const handleExitCommunityOnboardingPreview = useCallback(() => {
    const slug = String(
      params.selectedActiveCommunitySlug ??
        params.activeCommunity?.slug ??
        "",
    ).trim();
    const path = buildCommunityTabPath(
      slug,
      "settings",
      null,
      "workflows",
    );
    if (path) params.navigateTo(path, { replace: true });
  }, [
    params.activeCommunity?.slug,
    params.navigateTo,
    params.selectedActiveCommunitySlug,
  ]);

  const handleSelectCommunityTab = useCallback(
    (tab: CommunityTab) => {
      params.setCommunityResourceModuleId(null);
      const slug = String(
        params.selectedActiveCommunitySlug ??
          params.activeCommunity?.slug ??
          "",
      ).trim();
      if (slug) {
        params.openCommunityTab(slug, tab, {
          pushSnapshot: false,
        });
        return;
      }
      params.applyCommunityShellState({ communityTab: tab });
    },
    [
      params.activeCommunity?.slug,
      params.applyCommunityShellState,
      params.openCommunityTab,
      params.selectedActiveCommunitySlug,
      params.setCommunityResourceModuleId,
    ],
  );

  const handleSelectCommunityTabFromMobile = useCallback(
    (tab: CommunityTab) => {
      params.setMobileOverlay(null);
      params.setCommunityResourceModuleId(null);
      const slug = String(
        params.selectedActiveCommunitySlug ??
          params.activeCommunity?.slug ??
          "",
      ).trim();
      const path = buildCommunityTabPath(slug, tab);
      if (path) {
        params.navigateTo(path);
        return;
      }
      handleSelectCommunityTab(tab);
    },
    [
      handleSelectCommunityTab,
      params.activeCommunity?.slug,
      params.navigateTo,
      params.selectedActiveCommunitySlug,
      params.setCommunityResourceModuleId,
      params.setMobileOverlay,
    ],
  );

  const handleCommunityOnboardingOrientationCompleted =
    useCallback(() => {
      params.setCommunityOnboardingFirstPostFocusRequest(
        (current) => current + 1,
      );
      if (!params.isOnboardingPreviewMode) {
        handleSelectCommunityTab("chat");
      }
    }, [
      handleSelectCommunityTab,
      params.isOnboardingPreviewMode,
      params.setCommunityOnboardingFirstPostFocusRequest,
    ]);

  return {
    handlePreviewCommunityFunnel,
    handleSelectActiveCommunity,
    handleSelectCommunitySettingsPane,
    handlePreviewCommunityOnboarding,
    handleExitCommunityOnboardingPreview,
    handleSelectCommunityTab,
    handleSelectCommunityTabFromMobile,
    handleCommunityOnboardingOrientationCompleted,
  };
}

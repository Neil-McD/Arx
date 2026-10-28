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
  buildCommunityTabPath,
  type AppShellVariant,
} from "../../../../shared/webAppRouteState";
import type { MobileOverlay } from "../components/webShellChromeShared";
import type { WebCommunityRecord } from "../webAppContracts";

export function useWebCommunityNavigationActions(params: {
  activeCommunity: WebCommunityRecord | null;
  selectedActiveCommunityId: string | null;
  selectedActiveCommunitySlug: string | null;
  communities: WebCommunityRecord[];
  shellVariant: AppShellVariant;
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

  return {
    handleSelectActiveCommunity,
    handleSelectCommunitySettingsPane,
    handleSelectCommunityTab,
    handleSelectCommunityTabFromMobile,
  };
}

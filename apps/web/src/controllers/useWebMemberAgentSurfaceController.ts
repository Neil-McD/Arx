import { useEffect, useRef } from "react";

import type {
  AppPage,
  CommunityTab,
  OperatorTab,
  SettingsPage,
} from "../../../../shared/appShellNavigation";
import type {
  MemberAgentSurfaceContextV1,
} from "../../../../shared/memberAgentSurfaceContext";
import type { WebCommunityRecord } from "../webAppContracts";

export function useWebMemberAgentSurfaceController(params: {
  activePage: AppPage;
  communityTab: CommunityTab;
  settingsPage: SettingsPage;
  activeOperatorTab: OperatorTab;
  activeCommunity: WebCommunityRecord | null;
  isAuthenticated: boolean;
  publicRouteKind: string;
  hasResolvedCommunities: boolean;
  isDirectMessagesOpen: boolean;
  isOnboardingModalOpen: boolean;
  memberAgentVoiceUiState: string;
  cancelVoiceInput: () => void;
}) {
  const community =
    params.activePage === "community"
      ? params.activeCommunity
      : null;
  const surfaceContext: MemberAgentSurfaceContextV1 | null =
    params.activePage === "community" && community?.slug
      ? {
          version: 1,
          kind: "community",
          community_slug: community.slug,
          section: params.communityTab,
        }
      : params.activePage === "discover"
        ? {
            version: 1,
            kind: "discover",
            section: "communities",
          }
        : params.activePage === "settings" ||
            params.activePage === "docs" ||
            params.activePage === "operator"
          ? {
              version: 1,
              kind: "platform",
              page: params.activePage,
              section:
                params.activePage === "settings"
                  ? params.settingsPage
                  : params.activePage === "operator"
                    ? params.activeOperatorTab
                    : null,
            }
          : null;
  const isVisible =
    params.isAuthenticated &&
    params.publicRouteKind === "app" &&
    params.activePage !== "landing" &&
    params.activePage !== "onboarding" &&
    params.hasResolvedCommunities &&
    Boolean(surfaceContext) &&
    !params.isDirectMessagesOpen &&
    !params.isOnboardingModalOpen;
  const voiceScopeKey =
    `${params.activePage}:${params.communityTab}:${
      community?.id ?? "platform"
    }`;
  const previousVoiceScopeKeyRef = useRef(voiceScopeKey);

  useEffect(() => {
    const scopeChanged =
      previousVoiceScopeKeyRef.current !== voiceScopeKey;
    previousVoiceScopeKeyRef.current = voiceScopeKey;
    if (
      params.memberAgentVoiceUiState !== "idle" &&
      (!isVisible || scopeChanged)
    ) {
      params.cancelVoiceInput();
    }
  }, [
    isVisible,
    params.cancelVoiceInput,
    params.memberAgentVoiceUiState,
    voiceScopeKey,
  ]);

  return {
    community,
    surfaceContext,
    isVisible,
  };
}

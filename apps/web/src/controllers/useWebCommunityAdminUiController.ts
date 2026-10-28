import { useState } from "react";

export function useWebCommunityAdminUiController() {
  const [communityMemberMuted, setCommunityMemberMuted] = useState(false);
  const [isLoadingCommunityMemberSettings, setIsLoadingCommunityMemberSettings] = useState(false);
  const [communityMemberSettingsError, setCommunityMemberSettingsError] = useState<string | null>(null);
  const [isLeavingCommunity, setIsLeavingCommunity] = useState(false);

  return {
    communityMemberMuted,
    setCommunityMemberMuted,
    isLoadingCommunityMemberSettings,
    setIsLoadingCommunityMemberSettings,
    communityMemberSettingsError,
    setCommunityMemberSettingsError,
    isLeavingCommunity,
    setIsLeavingCommunity,
  };
}

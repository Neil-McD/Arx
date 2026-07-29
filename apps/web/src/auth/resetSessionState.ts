type WebSessionResetDeps = {
  beginBrowserSignedOutState: () => void | Promise<void>;
  setCommunities: (value: any[]) => void;
  setIsLoadingCommunities: (value: boolean) => void;
  setCommunityRoleById: (value: Record<string, string>) => void;
  setActiveCommunityId: (value: null) => void;
  setCommunityTab: (value: "chat") => void;
  resetCommunityChatState: () => void;
  resetCommunityContentState: () => void;
  setCommunitySettingsName: (value: string) => void;
  setCommunitySettingsSlug: (value: string) => void;
  setCommunitySettingsOneLiner: (value: string) => void;
  setCommunitySettingsVisibility: (value: string) => void;
  setCommunitySettingsAvatarUrl: (value: string | null) => void;
  setCommunitySettingsBannerUrl: (value: string | null) => void;
  setCommunitySettingsError: (value: string | null) => void;
  setIsSavingCommunitySettings: (value: boolean) => void;
  setIsSettingsBannerDragOver: (value: boolean) => void;
  setIsSettingsAvatarDragOver: (value: boolean) => void;
  setDiscoverCommunities: (value: any[]) => void;
};

export async function resetWebSessionStateAfterSignOut(deps: WebSessionResetDeps): Promise<void> {
  await deps.beginBrowserSignedOutState();
  deps.setCommunities([]);
  deps.setIsLoadingCommunities(false);
  deps.setCommunityRoleById({});
  deps.setActiveCommunityId(null);
  deps.setCommunityTab("chat");
  deps.resetCommunityChatState();
  deps.resetCommunityContentState();
  deps.setCommunitySettingsName("");
  deps.setCommunitySettingsSlug("");
  deps.setCommunitySettingsOneLiner("");
  deps.setCommunitySettingsVisibility("unlisted");
  deps.setCommunitySettingsAvatarUrl(null);
  deps.setCommunitySettingsBannerUrl(null);
  deps.setCommunitySettingsError(null);
  deps.setIsSavingCommunitySettings(false);
  deps.setIsSettingsBannerDragOver(false);
  deps.setIsSettingsAvatarDragOver(false);
  deps.setDiscoverCommunities([]);
}

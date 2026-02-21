import type { Dispatch, SetStateAction } from "react";
import {
  useSettingsImageUploadControllerCore,
  type UseSettingsImageUploadControllerCoreResult,
} from "../../../shared/useSettingsImageUploadControllerCore";

type UseDesktopSettingsImageUploadControllerArgs = {
  setIsSettingsBannerDragOver: Dispatch<SetStateAction<boolean>>;
  setIsSettingsAvatarDragOver: Dispatch<SetStateAction<boolean>>;
  setIsProfileAvatarDragOver: Dispatch<SetStateAction<boolean>>;
  setCommunitySettingsAvatarUrl: Dispatch<SetStateAction<string | null>>;
  setCommunitySettingsBannerUrl: Dispatch<SetStateAction<string | null>>;
  setCommunitySettingsError: Dispatch<SetStateAction<string | null>>;
  setCommunitySettingsBannerUploadError: Dispatch<SetStateAction<string | null>>;
  setIsProcessingCommunitySettingsBanner: Dispatch<SetStateAction<boolean>>;
  markCommunitySettingsDirty: () => void;
  isLikelyDesktopImageFile: (file: File) => boolean;
  maxCommunityImageDataUrlChars: number;
  setProfileAvatarUrl: Dispatch<SetStateAction<string | null>>;
  setAuthError: Dispatch<SetStateAction<string | null>>;
};

export function useDesktopSettingsImageUploadController(
  args: UseDesktopSettingsImageUploadControllerArgs,
): UseSettingsImageUploadControllerCoreResult {
  return useSettingsImageUploadControllerCore({
    setIsSettingsBannerDragOver: args.setIsSettingsBannerDragOver,
    setIsSettingsAvatarDragOver: args.setIsSettingsAvatarDragOver,
    setIsProfileAvatarDragOver: args.setIsProfileAvatarDragOver,
    setCommunitySettingsAvatarUrl: args.setCommunitySettingsAvatarUrl,
    setCommunitySettingsBannerUrl: args.setCommunitySettingsBannerUrl,
    setCommunitySettingsError: args.setCommunitySettingsError,
    setCommunitySettingsBannerUploadError: args.setCommunitySettingsBannerUploadError,
    setIsProcessingCommunitySettingsBanner: args.setIsProcessingCommunitySettingsBanner,
    markCommunitySettingsDirty: args.markCommunitySettingsDirty,
    isLikelyCommunityBannerImageFile: args.isLikelyDesktopImageFile,
    maxCommunityImageDataUrlChars: args.maxCommunityImageDataUrlChars,
    setProfileAvatarUrl: args.setProfileAvatarUrl,
    setAuthError: args.setAuthError,
    enforceCommunityAvatarDataUrlLimit: false,
    communityAvatarReadErrorFallback: "Failed to load image.",
    communityBannerReadErrorFallback: "Failed to load banner.",
    settingsDropStopPropagation: true,
    settingsDropRequireFile: true,
    profileDropStopPropagation: true,
  });
}

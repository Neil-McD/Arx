import type { Dispatch, SetStateAction } from "react";
import {
  useSettingsImageUploadControllerCore,
  type UseSettingsImageUploadControllerCoreResult,
} from "./useSettingsImageUploadControllerCore";

type UseWebSettingsImageUploadControllerArgs = {
  setIsSettingsBannerDragOver: Dispatch<SetStateAction<boolean>>;
  setIsSettingsAvatarDragOver: Dispatch<SetStateAction<boolean>>;
  setIsProfileAvatarDragOver: Dispatch<SetStateAction<boolean>>;
  setCommunitySettingsAvatarUrl: Dispatch<SetStateAction<string | null>>;
  setCommunitySettingsBannerUrl: Dispatch<SetStateAction<string | null>>;
  setCommunitySettingsBannerFocusX: Dispatch<SetStateAction<number>>;
  setCommunitySettingsBannerFocusY: Dispatch<SetStateAction<number>>;
  setCommunitySettingsBannerZoom: Dispatch<SetStateAction<number>>;
  setCommunitySettingsError: Dispatch<SetStateAction<string | null>>;
  setCommunitySettingsBannerUploadError: Dispatch<SetStateAction<string | null>>;
  setIsProcessingCommunitySettingsBanner: Dispatch<SetStateAction<boolean>>;
  markCommunitySettingsDirty: () => void;
  onCommunityBannerUploadSuccess?: () => void;
  isLikelyImageFile: (file: File) => boolean;
  maxWebImageDataUrlChars: number;
  setProfileAvatarUrl: Dispatch<SetStateAction<string | null>>;
  setAuthError: Dispatch<SetStateAction<string | null>>;
};

export function useWebSettingsImageUploadController(
  args: UseWebSettingsImageUploadControllerArgs,
): UseSettingsImageUploadControllerCoreResult {
  return useSettingsImageUploadControllerCore({
    setIsSettingsBannerDragOver: args.setIsSettingsBannerDragOver,
    setIsSettingsAvatarDragOver: args.setIsSettingsAvatarDragOver,
    setIsProfileAvatarDragOver: args.setIsProfileAvatarDragOver,
    setCommunitySettingsAvatarUrl: args.setCommunitySettingsAvatarUrl,
    setCommunitySettingsBannerUrl: args.setCommunitySettingsBannerUrl,
    setCommunitySettingsBannerFocusX: args.setCommunitySettingsBannerFocusX,
    setCommunitySettingsBannerFocusY: args.setCommunitySettingsBannerFocusY,
    setCommunitySettingsBannerZoom: args.setCommunitySettingsBannerZoom,
    setCommunitySettingsError: args.setCommunitySettingsError,
    setCommunitySettingsBannerUploadError: args.setCommunitySettingsBannerUploadError,
    setIsProcessingCommunitySettingsBanner: args.setIsProcessingCommunitySettingsBanner,
    markCommunitySettingsDirty: args.markCommunitySettingsDirty,
    onCommunityBannerUploadSuccess: args.onCommunityBannerUploadSuccess,
    isLikelyCommunityBannerImageFile: args.isLikelyImageFile,
    maxCommunityImageDataUrlChars: args.maxWebImageDataUrlChars,
    setProfileAvatarUrl: args.setProfileAvatarUrl,
    setAuthError: args.setAuthError,
    enforceCommunityAvatarDataUrlLimit: true,
    communityAvatarReadErrorFallback: "Failed to read avatar file.",
    communityBannerReadErrorFallback: "Failed to read banner file.",
    settingsDropStopPropagation: false,
    settingsDropRequireFile: false,
    profileDropStopPropagation: true,
  });
}

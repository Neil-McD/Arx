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
  setCommunitySettingsAvatarFocusX: Dispatch<SetStateAction<number>>;
  setCommunitySettingsAvatarFocusY: Dispatch<SetStateAction<number>>;
  setCommunitySettingsAvatarZoom: Dispatch<SetStateAction<number>>;
  setCommunitySettingsBannerUrl: Dispatch<SetStateAction<string | null>>;
  setCommunitySettingsBannerFocusX: Dispatch<SetStateAction<number>>;
  setCommunitySettingsBannerFocusY: Dispatch<SetStateAction<number>>;
  setCommunitySettingsBannerZoom: Dispatch<SetStateAction<number>>;
  setCommunitySettingsError: Dispatch<SetStateAction<string | null>>;
  setCommunitySettingsBannerUploadError: Dispatch<SetStateAction<string | null>>;
  setIsProcessingCommunitySettingsBanner: Dispatch<SetStateAction<boolean>>;
  markCommunitySettingsDirty: () => void;
  onCommunityAvatarUploadSuccess?: () => void;
  onCommunityBannerUploadSuccess?: () => void;
  isLikelyImageFile: (file: File) => boolean;
  maxWebImageDataUrlChars: number;
  setProfileAvatarUrl: Dispatch<SetStateAction<string | null>>;
  setProfileAvatarStorageId: Dispatch<SetStateAction<string | null>>;
  setProfileAvatarFocusX: Dispatch<SetStateAction<number>>;
  setProfileAvatarFocusY: Dispatch<SetStateAction<number>>;
  setProfileAvatarZoom: Dispatch<SetStateAction<number>>;
  setAuthError: Dispatch<SetStateAction<string | null>>;
  onProfileAvatarUploadSuccess?: () => void;
};

export function useWebSettingsImageUploadController(
  args: UseWebSettingsImageUploadControllerArgs,
): UseSettingsImageUploadControllerCoreResult {
  return useSettingsImageUploadControllerCore({
    setIsSettingsBannerDragOver: args.setIsSettingsBannerDragOver,
    setIsSettingsAvatarDragOver: args.setIsSettingsAvatarDragOver,
    setIsProfileAvatarDragOver: args.setIsProfileAvatarDragOver,
    setCommunitySettingsAvatarUrl: args.setCommunitySettingsAvatarUrl,
    setCommunitySettingsAvatarFocusX: args.setCommunitySettingsAvatarFocusX,
    setCommunitySettingsAvatarFocusY: args.setCommunitySettingsAvatarFocusY,
    setCommunitySettingsAvatarZoom: args.setCommunitySettingsAvatarZoom,
    setCommunitySettingsBannerUrl: args.setCommunitySettingsBannerUrl,
    setCommunitySettingsBannerFocusX: args.setCommunitySettingsBannerFocusX,
    setCommunitySettingsBannerFocusY: args.setCommunitySettingsBannerFocusY,
    setCommunitySettingsBannerZoom: args.setCommunitySettingsBannerZoom,
    setCommunitySettingsError: args.setCommunitySettingsError,
    setCommunitySettingsBannerUploadError: args.setCommunitySettingsBannerUploadError,
    setIsProcessingCommunitySettingsBanner: args.setIsProcessingCommunitySettingsBanner,
    markCommunitySettingsDirty: args.markCommunitySettingsDirty,
    onCommunityAvatarUploadSuccess: args.onCommunityAvatarUploadSuccess,
    onCommunityBannerUploadSuccess: args.onCommunityBannerUploadSuccess,
    isLikelyCommunityBannerImageFile: args.isLikelyImageFile,
    maxCommunityImageDataUrlChars: args.maxWebImageDataUrlChars,
    setProfileAvatarUrl: args.setProfileAvatarUrl,
    setProfileAvatarStorageId: args.setProfileAvatarStorageId,
    setProfileAvatarFocusX: args.setProfileAvatarFocusX,
    setProfileAvatarFocusY: args.setProfileAvatarFocusY,
    setProfileAvatarZoom: args.setProfileAvatarZoom,
    setAuthError: args.setAuthError,
    onProfileAvatarUploadSuccess: args.onProfileAvatarUploadSuccess,
    enforceCommunityAvatarDataUrlLimit: true,
    communityAvatarReadErrorFallback: "Failed to read avatar file.",
    communityBannerReadErrorFallback: "Failed to read banner file.",
    settingsDropStopPropagation: false,
    settingsDropRequireFile: false,
    profileDropStopPropagation: true,
  });
}

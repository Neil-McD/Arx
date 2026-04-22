import { useCallback, type Dispatch, type DragEvent, type SetStateAction } from "react";
import {
  readCommunityAvatarFileAsDataUrlWithinLimit,
  readAvatarFileAsSquareDataUrl,
  readBannerFileAsWideDataUrlWithinLimit,
} from "./imageTransforms";

type UseSettingsImageUploadControllerCoreArgs = {
  setIsSettingsBannerDragOver: Dispatch<SetStateAction<boolean>>;
  setIsSettingsAvatarDragOver: Dispatch<SetStateAction<boolean>>;
  setIsProfileAvatarDragOver: Dispatch<SetStateAction<boolean>>;
  setCommunitySettingsAvatarUrl: Dispatch<SetStateAction<string | null>>;
  setCommunitySettingsAvatarFocusX?: Dispatch<SetStateAction<number>>;
  setCommunitySettingsAvatarFocusY?: Dispatch<SetStateAction<number>>;
  setCommunitySettingsAvatarZoom?: Dispatch<SetStateAction<number>>;
  setCommunitySettingsBannerUrl: Dispatch<SetStateAction<string | null>>;
  setCommunitySettingsBannerFocusX?: Dispatch<SetStateAction<number>>;
  setCommunitySettingsBannerFocusY?: Dispatch<SetStateAction<number>>;
  setCommunitySettingsBannerZoom?: Dispatch<SetStateAction<number>>;
  setCommunitySettingsError: Dispatch<SetStateAction<string | null>>;
  setCommunitySettingsBannerUploadError: Dispatch<SetStateAction<string | null>>;
  setIsProcessingCommunitySettingsBanner: Dispatch<SetStateAction<boolean>>;
  markCommunitySettingsDirty: () => void;
  onCommunityAvatarUploadSuccess?: () => void;
  onCommunityBannerUploadSuccess?: () => void;
  isLikelyCommunityBannerImageFile: (file: File) => boolean;
  maxCommunityImageDataUrlChars: number;
  setProfileAvatarUrl: Dispatch<SetStateAction<string | null>>;
  setAuthError: Dispatch<SetStateAction<string | null>>;
  enforceCommunityAvatarDataUrlLimit?: boolean;
  communityAvatarReadErrorFallback: string;
  communityBannerReadErrorFallback: string;
  settingsDropStopPropagation?: boolean;
  settingsDropRequireFile?: boolean;
  profileDropStopPropagation?: boolean;
};

export type UseSettingsImageUploadControllerCoreResult = {
  handleSettingsBannerDrop: (event: DragEvent<HTMLDivElement>) => void;
  handleSettingsAvatarDrop: (event: DragEvent<HTMLDivElement>) => void;
  handleCommunityAvatarUpload: (file: File | null) => Promise<void>;
  handleCommunityBannerUpload: (file: File | null) => Promise<void>;
  handleProfileAvatarUpload: (file: File | null) => Promise<void>;
  handleProfileAvatarDrop: (event: DragEvent<HTMLDivElement>) => void;
};

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return fallback;
}

export function useSettingsImageUploadControllerCore(
  args: UseSettingsImageUploadControllerCoreArgs,
): UseSettingsImageUploadControllerCoreResult {
  const {
    setIsSettingsBannerDragOver,
    setIsSettingsAvatarDragOver,
    setIsProfileAvatarDragOver,
    setCommunitySettingsAvatarUrl,
    setCommunitySettingsAvatarFocusX,
    setCommunitySettingsAvatarFocusY,
    setCommunitySettingsAvatarZoom,
    setCommunitySettingsBannerUrl,
    setCommunitySettingsBannerFocusX,
    setCommunitySettingsBannerFocusY,
    setCommunitySettingsBannerZoom,
    setCommunitySettingsError,
    setCommunitySettingsBannerUploadError,
    setIsProcessingCommunitySettingsBanner,
    markCommunitySettingsDirty,
    onCommunityAvatarUploadSuccess,
    onCommunityBannerUploadSuccess,
    isLikelyCommunityBannerImageFile,
    maxCommunityImageDataUrlChars,
    setProfileAvatarUrl,
    setAuthError,
    enforceCommunityAvatarDataUrlLimit,
    communityAvatarReadErrorFallback,
    communityBannerReadErrorFallback,
    settingsDropStopPropagation,
    settingsDropRequireFile,
    profileDropStopPropagation,
  } = args;

  const handleCommunityAvatarUpload = useCallback(
    async (file: File | null) => {
      if (!file) return;
      try {
        const dataUrl = await readCommunityAvatarFileAsDataUrlWithinLimit(file, maxCommunityImageDataUrlChars);
        if (enforceCommunityAvatarDataUrlLimit && dataUrl.length > maxCommunityImageDataUrlChars) {
          throw new Error("Avatar image is too large. Try a smaller image.");
        }
        setCommunitySettingsAvatarUrl(dataUrl);
        setCommunitySettingsAvatarFocusX?.(0.5);
        setCommunitySettingsAvatarFocusY?.(0.5);
        setCommunitySettingsAvatarZoom?.(1);
        markCommunitySettingsDirty();
        onCommunityAvatarUploadSuccess?.();
      } catch (error) {
        setCommunitySettingsError(getErrorMessage(error, communityAvatarReadErrorFallback));
      }
    },
    [
      communityAvatarReadErrorFallback,
      enforceCommunityAvatarDataUrlLimit,
      markCommunitySettingsDirty,
      maxCommunityImageDataUrlChars,
      setCommunitySettingsAvatarUrl,
      setCommunitySettingsAvatarFocusX,
      setCommunitySettingsAvatarFocusY,
      setCommunitySettingsAvatarZoom,
      setCommunitySettingsError,
      onCommunityAvatarUploadSuccess,
    ],
  );

  const handleCommunityBannerUpload = useCallback(
    async (file: File | null) => {
      if (!file) return;
      if (!isLikelyCommunityBannerImageFile(file)) {
        setCommunitySettingsBannerUploadError("Banner must be an image file.");
        return;
      }
      setCommunitySettingsBannerUploadError(null);
      setIsProcessingCommunitySettingsBanner(true);
      try {
        const dataUrl = await readBannerFileAsWideDataUrlWithinLimit(file, maxCommunityImageDataUrlChars);
        setCommunitySettingsBannerUrl(dataUrl);
        setCommunitySettingsBannerFocusX?.(0.5);
        setCommunitySettingsBannerFocusY?.(0.5);
        setCommunitySettingsBannerZoom?.(1);
        markCommunitySettingsDirty();
        onCommunityBannerUploadSuccess?.();
      } catch (error) {
        setCommunitySettingsBannerUploadError(getErrorMessage(error, communityBannerReadErrorFallback));
      } finally {
        setIsProcessingCommunitySettingsBanner(false);
      }
    },
    [
      communityBannerReadErrorFallback,
      isLikelyCommunityBannerImageFile,
      markCommunitySettingsDirty,
      maxCommunityImageDataUrlChars,
      setCommunitySettingsBannerUploadError,
      setCommunitySettingsBannerUrl,
      setCommunitySettingsBannerFocusX,
      setCommunitySettingsBannerFocusY,
      setCommunitySettingsBannerZoom,
      setIsProcessingCommunitySettingsBanner,
      onCommunityBannerUploadSuccess,
    ],
  );

  const handleProfileAvatarUpload = useCallback(
    async (file: File | null) => {
      if (!file) return;
      try {
        const dataUrl = await readAvatarFileAsSquareDataUrl(file, 128);
        setProfileAvatarUrl(dataUrl);
      } catch (error) {
        setAuthError(getErrorMessage(error, "Failed to load image."));
      }
    },
    [setAuthError, setProfileAvatarUrl],
  );

  const handleSettingsBannerDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (settingsDropStopPropagation) {
        event.stopPropagation();
      }
      setIsSettingsBannerDragOver(false);
      const file = event.dataTransfer.files?.[0] ?? null;
      if (settingsDropRequireFile) {
        if (file) void handleCommunityBannerUpload(file);
        return;
      }
      void handleCommunityBannerUpload(file);
    },
    [
      handleCommunityBannerUpload,
      setIsSettingsBannerDragOver,
      settingsDropRequireFile,
      settingsDropStopPropagation,
    ],
  );

  const handleSettingsAvatarDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (settingsDropStopPropagation) {
        event.stopPropagation();
      }
      setIsSettingsAvatarDragOver(false);
      const file = event.dataTransfer.files?.[0] ?? null;
      if (settingsDropRequireFile) {
        if (file) void handleCommunityAvatarUpload(file);
        return;
      }
      void handleCommunityAvatarUpload(file);
    },
    [
      handleCommunityAvatarUpload,
      setIsSettingsAvatarDragOver,
      settingsDropRequireFile,
      settingsDropStopPropagation,
    ],
  );

  const handleProfileAvatarDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (profileDropStopPropagation ?? true) {
        event.stopPropagation();
      }
      setIsProfileAvatarDragOver(false);
      const file = event.dataTransfer.files?.[0] ?? null;
      if (file) void handleProfileAvatarUpload(file);
    },
    [handleProfileAvatarUpload, profileDropStopPropagation, setIsProfileAvatarDragOver],
  );

  return {
    handleSettingsBannerDrop,
    handleSettingsAvatarDrop,
    handleCommunityAvatarUpload,
    handleCommunityBannerUpload,
    handleProfileAvatarUpload,
    handleProfileAvatarDrop,
  };
}

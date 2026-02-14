import { useCallback, type Dispatch, type DragEvent, type SetStateAction } from "react";
import {
  readAvatarFileAsSquareDataUrl,
  readBannerFileAsWideDataUrlWithinLimit,
} from "./imageTransforms";

type UseWebSettingsImageUploadControllerArgs = {
  setIsSettingsBannerDragOver: Dispatch<SetStateAction<boolean>>;
  setIsSettingsAvatarDragOver: Dispatch<SetStateAction<boolean>>;
  setIsProfileAvatarDragOver: Dispatch<SetStateAction<boolean>>;
  setCommunitySettingsAvatarUrl: Dispatch<SetStateAction<string | null>>;
  setCommunitySettingsBannerUrl: Dispatch<SetStateAction<string | null>>;
  setCommunitySettingsError: Dispatch<SetStateAction<string | null>>;
  setCommunitySettingsBannerUploadError: Dispatch<SetStateAction<string | null>>;
  setIsProcessingCommunitySettingsBanner: Dispatch<SetStateAction<boolean>>;
  markCommunitySettingsDirty: () => void;
  isLikelyImageFile: (file: File) => boolean;
  maxWebImageDataUrlChars: number;
  setProfileAvatarUrl: Dispatch<SetStateAction<string | null>>;
  setAuthError: Dispatch<SetStateAction<string | null>>;
};

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return fallback;
}

export function useWebSettingsImageUploadController(
  args: UseWebSettingsImageUploadControllerArgs,
): {
  handleSettingsBannerDrop: (event: DragEvent<HTMLDivElement>) => void;
  handleSettingsAvatarDrop: (event: DragEvent<HTMLDivElement>) => void;
  handleCommunityAvatarUpload: (file: File | null) => Promise<void>;
  handleCommunityBannerUpload: (file: File | null) => Promise<void>;
  handleProfileAvatarUpload: (file: File | null) => Promise<void>;
  handleProfileAvatarDrop: (event: DragEvent<HTMLDivElement>) => void;
} {
  const {
    setIsSettingsBannerDragOver,
    setIsSettingsAvatarDragOver,
    setIsProfileAvatarDragOver,
    setCommunitySettingsAvatarUrl,
    setCommunitySettingsBannerUrl,
    setCommunitySettingsError,
    setCommunitySettingsBannerUploadError,
    setIsProcessingCommunitySettingsBanner,
    markCommunitySettingsDirty,
    isLikelyImageFile,
    maxWebImageDataUrlChars,
    setProfileAvatarUrl,
    setAuthError,
  } = args;

  const handleCommunityAvatarUpload = useCallback(
    async (file: File | null) => {
      if (!file) return;
      try {
        const dataUrl = await readAvatarFileAsSquareDataUrl(file, 128);
        if (dataUrl.length > maxWebImageDataUrlChars) {
          throw new Error("Avatar image is too large. Try a smaller image.");
        }
        setCommunitySettingsAvatarUrl(dataUrl);
        markCommunitySettingsDirty();
      } catch (error) {
        setCommunitySettingsError(getErrorMessage(error, "Failed to read avatar file."));
      }
    },
    [
      markCommunitySettingsDirty,
      maxWebImageDataUrlChars,
      setCommunitySettingsAvatarUrl,
      setCommunitySettingsError,
    ],
  );

  const handleCommunityBannerUpload = useCallback(
    async (file: File | null) => {
      if (!file) return;
      if (!isLikelyImageFile(file)) {
        setCommunitySettingsBannerUploadError("Banner must be an image file.");
        return;
      }
      setCommunitySettingsBannerUploadError(null);
      setIsProcessingCommunitySettingsBanner(true);
      try {
        const dataUrl = await readBannerFileAsWideDataUrlWithinLimit(file, maxWebImageDataUrlChars);
        setCommunitySettingsBannerUrl(dataUrl);
        markCommunitySettingsDirty();
      } catch (error) {
        setCommunitySettingsBannerUploadError(getErrorMessage(error, "Failed to read banner file."));
      } finally {
        setIsProcessingCommunitySettingsBanner(false);
      }
    },
    [
      isLikelyImageFile,
      markCommunitySettingsDirty,
      maxWebImageDataUrlChars,
      setCommunitySettingsBannerUploadError,
      setCommunitySettingsBannerUrl,
      setIsProcessingCommunitySettingsBanner,
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

  const handleProfileAvatarDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsProfileAvatarDragOver(false);
      const file = event.dataTransfer.files?.[0] ?? null;
      if (file) void handleProfileAvatarUpload(file);
    },
    [handleProfileAvatarUpload, setIsProfileAvatarDragOver],
  );

  const handleSettingsBannerDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsSettingsBannerDragOver(false);
      const file = event.dataTransfer.files?.[0] ?? null;
      void handleCommunityBannerUpload(file);
    },
    [handleCommunityBannerUpload, setIsSettingsBannerDragOver],
  );

  const handleSettingsAvatarDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsSettingsAvatarDragOver(false);
      const file = event.dataTransfer.files?.[0] ?? null;
      void handleCommunityAvatarUpload(file);
    },
    [handleCommunityAvatarUpload, setIsSettingsAvatarDragOver],
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

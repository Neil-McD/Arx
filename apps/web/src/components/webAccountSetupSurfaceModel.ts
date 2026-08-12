import type { ProfileHandleAvailabilityLike } from "./profileHandleAvailabilityHint";

export type WebAccountSetupSurfaceModel = {
  identity: {
    displayName: string;
    handle: string;
    avatarUrl: string | null;
    avatarFocusX: number;
    avatarFocusY: number;
    avatarZoom: number;
    handleAvailability: ProfileHandleAvailabilityLike | null;
    isCheckingHandleAvailability: boolean;
    onDisplayNameChange: (value: string) => void;
    onHandleChange: (value: string) => void;
    onAvatarUpload: (file: File | null) => Promise<void> | void;
    onAvatarFocusXChange: (value: number) => void;
    onAvatarFocusYChange: (value: number) => void;
    onAvatarZoomChange: (value: number) => void;
    onAvatarRemove: () => void;
  };
  submission: {
    isSaving: boolean;
    error: string | null;
  };
};

export type PlatformLegalAcceptanceDraft = {
  termsOfServiceVersion: string;
  privacyPolicyVersion: string;
};

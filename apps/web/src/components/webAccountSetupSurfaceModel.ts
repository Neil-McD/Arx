import type {
  SocialProfileKind,
  SocialProfileLinks,
} from "../../../../shared/socialProfileLinks";
import type { ProfileHandleAvailabilityLike } from "./profileHandleAvailabilityHint";

export type WebAccountSetupSurfaceModel = {
  identity: {
    displayName: string;
    handle: string;
    bio: string;
    socialLinks: SocialProfileLinks;
    avatarUrl: string | null;
    avatarFocusX: number;
    avatarFocusY: number;
    avatarZoom: number;
    handleAvailability: ProfileHandleAvailabilityLike | null;
    isCheckingHandleAvailability: boolean;
    onDisplayNameChange: (value: string) => void;
    onHandleChange: (value: string) => void;
    onBioChange: (value: string) => void;
    onSocialLinkChange: (kind: SocialProfileKind, value: string) => void;
    onAvatarUpload: (file: File | null) => Promise<void> | void;
  };
  inference: {
    chatgpt: {
      connected: boolean;
      status: string;
      isConnecting: boolean;
      isPolling: boolean;
      onConnect: () => void;
    };
    openai: {
      connected: boolean;
      status: string;
      apiKeyDraft: string;
      setApiKeyDraft: (value: string) => void;
      isSaving: boolean;
      error: string | null;
      success: string | null;
      onConnect: () => Promise<void> | void;
    };
  };
  submission: {
    isSaving: boolean;
    error: string | null;
  };
};

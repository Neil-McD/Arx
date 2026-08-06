import { useEffect, useRef, useState } from "react";

import {
  checkCloudProfileHandleAvailability,
  type CloudProfileHandleAvailability,
} from "../../../../shared/cloudProfilesGateway";
import type { WebAccountSetupSurfaceModel } from "../components/webAccountSetupSurfaceModel";
import type { UseWebProfileSettingsUiControllerResult } from "./useWebProfileSettingsUiController";

type UseWebAccountSetupSurfaceControllerParams<TSession> = {
  session: TSession | null;
  getSession: () => TSession | null;
  profile: UseWebProfileSettingsUiControllerResult;
  isSaving: boolean;
  error: string | null;
  onAvatarUpload: (file: File | null) => Promise<void> | void;
};

export type UseWebAccountSetupSurfaceControllerResult = {
  model: WebAccountSetupSurfaceModel;
};

export function useWebAccountSetupSurfaceController<TSession>(
  params: UseWebAccountSetupSurfaceControllerParams<TSession>,
): UseWebAccountSetupSurfaceControllerResult {
  const {
    session,
    profile,
    isSaving,
    error,
    onAvatarUpload,
  } = params;
  const getSessionRef = useRef(params.getSession);
  const availabilityRequestIdRef = useRef(0);
  const [handleAvailability, setHandleAvailability] =
    useState<CloudProfileHandleAvailability | null>(null);
  const [isCheckingHandleAvailability, setIsCheckingHandleAvailability] =
    useState(false);

  useEffect(() => {
    getSessionRef.current = params.getSession;
  }, [params.getSession]);

  useEffect(() => {
    const handle = profile.profileHandle.trim();
    const requestId = availabilityRequestIdRef.current + 1;
    availabilityRequestIdRef.current = requestId;
    setHandleAvailability(null);
    setIsCheckingHandleAvailability(false);

    if (!session || !handle) return;

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        const activeSession = getSessionRef.current() ?? session;
        if (!activeSession || cancelled || availabilityRequestIdRef.current !== requestId) {
          return;
        }
        setIsCheckingHandleAvailability(true);
        try {
          const availability = await checkCloudProfileHandleAvailability<TSession>({
            session: activeSession,
            handle,
          });
          if (!cancelled && availabilityRequestIdRef.current === requestId) {
            setHandleAvailability(availability);
          }
        } catch {
          if (!cancelled && availabilityRequestIdRef.current === requestId) {
            setHandleAvailability(null);
          }
        } finally {
          if (!cancelled && availabilityRequestIdRef.current === requestId) {
            setIsCheckingHandleAvailability(false);
          }
        }
      })();
    }, 260);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [profile.profileHandle, session]);

  return {
    model: {
      identity: {
        displayName: profile.profileName,
        handle: profile.profileHandle,
        bio: profile.profileBio,
        socialLinks: profile.profileSocialLinks,
        avatarUrl: profile.profileAvatarUrl,
        avatarFocusX: profile.profileAvatarFocusX,
        avatarFocusY: profile.profileAvatarFocusY,
        avatarZoom: profile.profileAvatarZoom,
        handleAvailability,
        isCheckingHandleAvailability,
        onDisplayNameChange: profile.setProfileName,
        onHandleChange: profile.setProfileHandle,
        onBioChange: profile.setProfileBio,
        onSocialLinkChange: profile.setProfileSocialLink,
        onAvatarUpload,
      },
      submission: {
        isSaving,
        error,
      },
    },
  };
}

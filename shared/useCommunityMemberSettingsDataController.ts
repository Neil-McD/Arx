import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { resolveUsableSession, type EnsureSessionFn } from "./ensureUsableSession";
import { fetchCloudCommunityMemberSettingsRow } from "./cloudCommunityAdminGateway";

type SessionLike = {
  user: {
    id: string;
  };
};

type CommunityMemberSettingsRow = {
  muted: boolean;
};

type UseCommunityMemberSettingsDataControllerArgs<SessionT extends SessionLike> = {
  ensureSession?: EnsureSessionFn<SessionT>;
  setCommunityMemberMuted: Dispatch<SetStateAction<boolean>>;
  setIsLoadingCommunityMemberSettings: Dispatch<SetStateAction<boolean>>;
  setCommunityMemberSettingsError: Dispatch<SetStateAction<string | null>>;
};

export function useCommunityMemberSettingsDataController<SessionT extends SessionLike>(
  args: UseCommunityMemberSettingsDataControllerArgs<SessionT>,
) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const loadCommunityMemberSettings = useCallback(async (params: {
    communityId: string;
    session: SessionT;
  }) => {
    const current = argsRef.current;
    const usableSession = await resolveUsableSession(params.session, current.ensureSession);
    if (!usableSession) return;
    current.setIsLoadingCommunityMemberSettings(true);
    current.setCommunityMemberSettingsError(null);
    try {
      const row = await fetchCloudCommunityMemberSettingsRow<
        SessionT,
        CommunityMemberSettingsRow
      >({
        session: usableSession,
        communityId: params.communityId,
      });
      current.setCommunityMemberMuted(Boolean(row?.muted));
    } catch {
      current.setCommunityMemberMuted(false);
    } finally {
      current.setIsLoadingCommunityMemberSettings(false);
    }
  }, []);

  return { loadCommunityMemberSettings };
}

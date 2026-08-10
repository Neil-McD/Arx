import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { resolveUsableSession, type EnsureSessionFn } from "./ensureUsableSession";

import { fetchCloudCommunityFunnelConfig } from "./cloudCommunityFunnelGateway";

type SessionLike = {
  user: {
    id: string;
  };
};

type UseCommunityFunnelControllerArgs<SessionT extends SessionLike, ConfigT> = {
  ensureSession?: EnsureSessionFn<SessionT>;
  hydrateEditor: (config: ConfigT | null) => void;
  setLoadedCommunityId: (communityId: string | null) => void;
  setIsLoadingCommunityFunnel: Dispatch<SetStateAction<boolean>>;
  setCommunityFunnelError: Dispatch<SetStateAction<string | null>>;
  loadFailureMessage: string;
};

export function useCommunityFunnelController<SessionT extends SessionLike, ConfigT>(
  args: UseCommunityFunnelControllerArgs<SessionT, ConfigT>,
) {
  const argsRef = useRef(args);
  argsRef.current = args;

  const loadCommunityFunnelConfig = useCallback(async (communityId: string, session: SessionT) => {
    const current = argsRef.current;
    const usableSession = await resolveUsableSession(session, current.ensureSession);
    if (!usableSession) return;
    current.setIsLoadingCommunityFunnel(true);
    current.setCommunityFunnelError(null);
    try {
      const config = await fetchCloudCommunityFunnelConfig<SessionT, ConfigT>({
        session: usableSession,
        communityId,
      });
      current.hydrateEditor(config);
      current.setLoadedCommunityId(communityId);
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : current.loadFailureMessage;
      current.setCommunityFunnelError(message);
      current.hydrateEditor(null);
      current.setLoadedCommunityId(communityId);
    } finally {
      current.setIsLoadingCommunityFunnel(false);
    }
  }, []);

  return { loadCommunityFunnelConfig };
}

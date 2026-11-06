import { useCallback, useRef } from "react";

import {
  consumeAuthResumeStateIfCurrent,
  readAuthResumeState,
} from "../../../../shared/authResumeState";
import { routePendingAuthIntent } from "../../../../shared/authResumeRouter";
import type {
  CreateCommunityIntentDraft,
} from "../../../../shared/createCommunityIntent";
import type { AuthSession } from "../auth";

export function useWebPendingAuthIntentController(params: {
  session: AuthSession | null;
  showToast: (message: string) => void;
  openCreateCommunity: (
    draft: CreateCommunityIntentDraft | null,
  ) => void;
  routeTryPolynetFree: (
    session: AuthSession,
  ) => Promise<"entered" | "onboarding" | "unavailable" | "unauthenticated">;
}) {
  const resumeInFlightRef = useRef(false);

  const resumePendingAuthIntent = useCallback(async (): Promise<boolean> => {
    if (!params.session || resumeInFlightRef.current) return false;
    const resumeState = readAuthResumeState();
    if (!resumeState) return false;
    resumeInFlightRef.current = true;
    try {
      const handled = await routePendingAuthIntent(resumeState.intent, {
        select_model: () => true,
        connect_provider: () => {
          params.showToast(
            "Personal AI connections are no longer supported. Community AI is provided by the community.",
          );
          return true;
        },
        create_community: (payload) => {
          params.openCreateCommunity(payload.draft);
          return true;
        },
        try_polynet_free: async () => {
          const outcome = await params.routeTryPolynetFree(params.session as AuthSession);
          return outcome === "entered" || outcome === "onboarding";
        },
      });
      if (handled) consumeAuthResumeStateIfCurrent(resumeState);
      return handled;
    } catch {
      return false;
    } finally {
      resumeInFlightRef.current = false;
    }
  }, [
    params.openCreateCommunity,
    params.routeTryPolynetFree,
    params.session,
    params.showToast,
  ]);

  return { resumePendingAuthIntent };
}

import { useCallback, useEffect, useRef, useState } from "react";

import {
  acceptBuilderPartnerTermsCanonical,
  captureBuilderPartnerAttributionFromCurrentUrl,
  loadBuilderPartnerProgramCanonical,
  type BuilderPartnerProgramSnapshot,
} from "../../../../shared/builderPartnerProgramGateway";
import type { SettingsGroup } from "../../../../shared/appShellNavigation";
import type { AuthSession } from "../auth";
import { isTransportRefreshError } from "../webAppRuntime";

type UseWebBuilderPartnerProgramControllerParams = {
  session: AuthSession | null;
  canonicalSessionUserId: string | null;
  activeView: string;
  settingsGroup: SettingsGroup;
  communitiesCount: number;
  ensureSession: (
    session?: AuthSession | null,
    reason?: string,
  ) => Promise<AuthSession | null>;
  requireSignIn: () => void;
};

function errorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string") return error;
  return error instanceof Error ? error.message : fallback;
}

export function useWebBuilderPartnerProgramController(
  params: UseWebBuilderPartnerProgramControllerParams,
) {
  const [program, setProgram] =
    useState<BuilderPartnerProgramSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAcceptingTerms, setIsAcceptingTerms] = useState(false);
  const loadRequestIdRef = useRef(0);

  const load = useCallback(
    async (nextSession?: AuthSession | null): Promise<void> => {
      const requestId = ++loadRequestIdRef.current;
      const usableSession = await params.ensureSession(
        nextSession ?? undefined,
        "builder_partner_program_load",
      );
      if (!usableSession) {
        if (requestId === loadRequestIdRef.current) setProgram(null);
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const snapshot = await loadBuilderPartnerProgramCanonical({
          session: usableSession,
        });
        if (requestId === loadRequestIdRef.current) setProgram(snapshot);
      } catch (loadError) {
        if (requestId === loadRequestIdRef.current) {
          if (isTransportRefreshError(loadError)) {
            console.warn("Builder Partner Program refresh failed:", loadError);
            setError(null);
          } else {
            setError(
              errorMessage(
                loadError,
                "Failed to load Builder Partner status.",
              ),
            );
            setProgram(null);
          }
        }
      } finally {
        if (requestId === loadRequestIdRef.current) setIsLoading(false);
      }
    },
    [params.ensureSession],
  );

  const acceptTerms = useCallback(
    async (termsVersion: string): Promise<void> => {
      const usableSession = await params.ensureSession();
      if (!usableSession) {
        params.requireSignIn();
        return;
      }

      setIsAcceptingTerms(true);
      setError(null);
      try {
        setProgram(
          await acceptBuilderPartnerTermsCanonical({
            session: usableSession,
            termsVersion,
          }),
        );
      } catch (acceptError) {
        setError(
          errorMessage(
            acceptError,
            "Failed to unlock Builder Partner Program.",
          ),
        );
      } finally {
        setIsAcceptingTerms(false);
      }
    },
    [params.ensureSession, params.requireSignIn],
  );

  useEffect(() => {
    void captureBuilderPartnerAttributionFromCurrentUrl({
      session: params.session,
    }).catch((captureError) => {
      console.warn("Failed to capture Builder Partner attribution:", captureError);
    });
  }, [params.canonicalSessionUserId, params.session]);

  useEffect(() => {
    if (!params.session) {
      setProgram(null);
      setError(null);
      setIsLoading(false);
      return;
    }
    if (
      params.activeView !== "settings" ||
      params.settingsGroup !== "partners"
    ) {
      return;
    }
    void load(params.session);
  }, [
    load,
    params.activeView,
    params.canonicalSessionUserId,
    params.communitiesCount,
    params.session,
    params.settingsGroup,
  ]);

  return {
    program,
    isLoading,
    error,
    isAcceptingTerms,
    load,
    acceptTerms,
  };
}

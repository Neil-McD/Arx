import { useCallback, useEffect, useRef, useState } from "react";
import {
  activateCloudFounderInference,
  loadCloudFounderInferenceStatus,
  suspendCloudFounderInference,
  type CloudFounderInferenceStatus,
} from "../../../../shared/cloudFounderInferenceGateway";
import type { AuthSession } from "../auth";

const EMPTY_STATUS: CloudFounderInferenceStatus = {
  eligible: false,
  cohort_key: null,
  status: null,
  model_id: "gpt-5.6-luna",
  key_connected: false,
  key_last_four: null,
  activated_at: null,
  suspended_at: null,
  communities: [],
};

function messageForError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("owner_credential_missing")) {
    return "Connect an OpenAI API key before activating community inference.";
  }
  if (message.includes("founder_inference_terms_acceptance_required")) {
    return "Confirm the community inference funding terms before activation.";
  }
  if (message.includes("provider_inference_misconfigured")) {
    return "This OpenAI key cannot access GPT 5.6 Luna.";
  }
  if (message.includes("provider_inference_quota_exceeded")) {
    return "This OpenAI account does not currently have usable API quota.";
  }
  if (message.includes("rate_limited")) {
    return "OpenAI rate-limited the activation check. Try again shortly.";
  }
  return message.trim() || "Community inference settings could not be updated.";
}

export function useWebFounderInferenceController(params: {
  session: AuthSession | null;
  ensureSession: (session?: AuthSession | null) => Promise<AuthSession | null>;
  providerConnectionUpdatedAt?: string | null;
}) {
  const [status, setStatus] = useState<CloudFounderInferenceStatus>(EMPTY_STATUS);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isActivationPromptDismissed, setIsActivationPromptDismissed] = useState(false);
  const ensureSessionRef = useRef(params.ensureSession);
  ensureSessionRef.current = params.ensureSession;

  useEffect(() => {
    setIsActivationPromptDismissed(false);
  }, [params.session?.user.id]);

  const refresh = useCallback(async (session?: AuthSession | null): Promise<void> => {
    const usableSession = await ensureSessionRef.current(session ?? undefined);
    if (!usableSession) return;
    setIsLoading(true);
    try {
      setStatus(await loadCloudFounderInferenceStatus({ session: usableSession }));
      setError(null);
    } catch (loadError) {
      setError(messageForError(loadError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!params.session) {
      setStatus(EMPTY_STATUS);
      setError(null);
      setSuccess(null);
      setIsLoading(false);
      setIsSaving(false);
      return;
    }
    void refresh(params.session);
  }, [params.providerConnectionUpdatedAt, params.session, refresh]);

  const activate = useCallback(async (acceptedTerms: boolean): Promise<void> => {
    const usableSession = await ensureSessionRef.current(params.session);
    if (!usableSession) return;
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await activateCloudFounderInference({ session: usableSession, acceptedTerms });
      await refresh(usableSession);
      setSuccess("GPT 5.6 Luna is active for your eligible legacy communities.");
    } catch (activationError) {
      setError(messageForError(activationError));
    } finally {
      setIsSaving(false);
    }
  }, [params.session, refresh]);

  const suspend = useCallback(async (): Promise<void> => {
    const usableSession = await ensureSessionRef.current(params.session);
    if (!usableSession) return;
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await suspendCloudFounderInference({ session: usableSession });
      await refresh(usableSession);
      setSuccess("Community inference is suspended.");
    } catch (suspendError) {
      setError(messageForError(suspendError));
    } finally {
      setIsSaving(false);
    }
  }, [params.session, refresh]);

  return {
    status,
    isLoading,
    isSaving,
    error,
    success,
    isActivationPromptDismissed,
    dismissActivationPrompt: () => setIsActivationPromptDismissed(true),
    activate,
    suspend,
    refresh,
  };
}

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_COMMUNITY_ONBOARDING_AGENT_INSTRUCTIONS,
  DEFAULT_COMMUNITY_ONBOARDING_WELCOME,
  type CommunityOnboardingConfig,
} from "../../../../shared/communityOnboarding";
import {
  fetchCloudCommunityOnboardingConfig,
  saveCloudCommunityOnboardingConfig,
} from "../../../../shared/cloudCommunityOnboardingGateway";

export function WebCommunityOnboardingWorkflowSection(props: {
  session: unknown;
  communityId: string;
  communityName: string;
}) {
  const [config, setConfig] = useState<CommunityOnboardingConfig | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState(DEFAULT_COMMUNITY_ONBOARDING_WELCOME);
  const [instructions, setInstructions] = useState(DEFAULT_COMMUNITY_ONBOARDING_AGENT_INSTRUCTIONS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;
    setIsLoading(true);
    setError(null);
    void fetchCloudCommunityOnboardingConfig({
      session: props.session,
      communityId: props.communityId,
    }).then((next) => {
      if (canceled) return;
      setConfig(next);
      setEnabled(next.enabled);
      setWelcomeMessage(next.welcome_message);
      setInstructions(next.agent_instructions);
    }).catch(() => {
      if (!canceled) setError("Couldn’t load the onboarding workflow.");
    }).finally(() => {
      if (!canceled) setIsLoading(false);
    });
    return () => {
      canceled = true;
    };
  }, [props.communityId, props.session]);

  const isDirty = useMemo(() => Boolean(config) && (
    enabled !== config?.enabled ||
    welcomeMessage.trim() !== config?.welcome_message ||
    instructions.trim() !== config?.agent_instructions
  ), [config, enabled, instructions, welcomeMessage]);

  const save = async () => {
    if (!welcomeMessage.trim() || !instructions.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      const next = await saveCloudCommunityOnboardingConfig({
        session: props.session,
        communityId: props.communityId,
        enabled,
        welcomeMessage,
        agentInstructions: instructions,
      });
      setConfig(next);
      setEnabled(next.enabled);
      setWelcomeMessage(next.welcome_message);
      setInstructions(next.agent_instructions);
    } catch {
      setError("Couldn’t save the onboarding workflow.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="community-onboarding-workflow" aria-busy={isLoading}>
      <div className="settings-section-title">Onboarding</div>
      <div className="model-note">
        Orient each newly activated member, help them post, and introduce their private personal agent.
      </div>
      {isLoading ? <div className="model-note">Loading onboarding…</div> : (
        <>
          <label className="community-onboarding-toggle-row">
            <span>
              <strong>Member onboarding</strong>
              <small>Runs once per membership activation. Existing members are not backfilled.</small>
            </span>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
          </label>
          <label className="create-field">
            <span>Welcome message</span>
            <textarea
              value={welcomeMessage}
              maxLength={1200}
              rows={4}
              onChange={(event) => setWelcomeMessage(event.target.value)}
            />
          </label>
          <label className="create-field">
            <span>Personal agent guidance</span>
            <textarea
              value={instructions}
              maxLength={4000}
              rows={7}
              onChange={(event) => setInstructions(event.target.value)}
            />
          </label>
          <div className="community-onboarding-preview">
            <span>Orientation preview · {props.communityName}</span>
            <p>{welcomeMessage.trim() || DEFAULT_COMMUNITY_ONBOARDING_WELCOME}</p>
          </div>
          {error ? <div className="auth-error">{error}</div> : null}
          <div className="create-community-actions">
            <button
              className={`platform-save-button${isDirty ? " is-dirty" : " is-saved"}`}
              type="button"
              disabled={!isDirty || isSaving || !welcomeMessage.trim() || !instructions.trim()}
              onClick={() => void save()}
            >
              {isSaving ? "Saving…" : isDirty ? "Save workflow" : "Saved"}
            </button>
          </div>
        </>
      )}
      {!isLoading && !error && !config ? <div className="auth-error">Onboarding is unavailable.</div> : null}
    </section>
  );
}

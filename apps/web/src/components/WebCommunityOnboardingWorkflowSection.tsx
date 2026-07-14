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
  onPreview: () => void;
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

  const reset = () => {
    if (!config) return;
    setEnabled(config.enabled);
    setWelcomeMessage(config.welcome_message);
    setInstructions(config.agent_instructions);
    setError(null);
  };

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
    <section className="settings-section community-onboarding-workflow" aria-busy={isLoading}>
      <header className="community-onboarding-header">
        <div className="community-onboarding-heading-copy">
          <div className="settings-section-title">Onboarding</div>
          <div className="settings-section-desc community-onboarding-description">
            Orient each newly activated member, help them post, and introduce their private
            personal agent.
          </div>
        </div>
        {!isLoading && config ? (
          <div className="agent-preview-actions community-onboarding-actions">
            {isDirty ? (
              <button type="button" onClick={reset} disabled={isSaving}>
                Cancel
              </button>
            ) : (
              <button type="button" onClick={props.onPreview} disabled={isSaving}>
                Preview
              </button>
            )}
            <button
              className={`platform-save-button${isDirty ? " is-dirty" : " is-saved"}`}
              type="button"
              disabled={!isDirty || isSaving || !welcomeMessage.trim() || !instructions.trim()}
              onClick={() => void save()}
            >
              {isSaving ? "Saving…" : isDirty ? "Save workflow" : "Saved"}
            </button>
          </div>
        ) : null}
      </header>
      {isLoading ? <div className="model-note">Loading onboarding…</div> : (
        <>
          <label className="community-onboarding-toggle-row">
            <input
              type="checkbox"
              role="switch"
              aria-label="Run onboarding for new members"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            <span className="community-onboarding-toggle-copy">
              <strong>Run for new members</strong>
              <small>Runs once when access activates. Existing members are not backfilled.</small>
            </span>
            <span className="community-onboarding-switch" aria-hidden="true" />
          </label>
          <label className="create-community-field community-onboarding-field">
            <span>Welcome message</span>
            <span className="community-onboarding-field-note">
              Shown in the opening welcome step.
            </span>
            <textarea
              className="community-onboarding-textarea"
              value={welcomeMessage}
              maxLength={1200}
              rows={4}
              onChange={(event) => setWelcomeMessage(event.target.value)}
            />
          </label>
          <label
            className={
              "create-community-field community-onboarding-field " +
              "community-onboarding-field-instructions"
            }
          >
            <span>Personal agent guidance</span>
            <span className="community-onboarding-field-note">
              Guides the member’s private agent during this onboarding flow.
            </span>
            <textarea
              className="community-onboarding-textarea"
              value={instructions}
              maxLength={4000}
              rows={7}
              onChange={(event) => setInstructions(event.target.value)}
            />
          </label>
          {error ? <div className="auth-error">{error}</div> : null}
        </>
      )}
      {!isLoading && !error && !config ? <div className="auth-error">Onboarding is unavailable.</div> : null}
    </section>
  );
}

import { useEffect, useState } from "react";

type SessionLike = {
  user: {
    id: string;
    email?: string | null;
  };
} | null;

export type PersonalAgentSettings = {
  memory_mode: "off" | "suggest" | "auto";
  remember_intent_enabled: boolean;
  agent_name: string;
  agent_soul: string;
};

type WebPersonalAgentSettingsSectionProps = {
  session: SessionLike;
  settings: PersonalAgentSettings;
  isLoading: boolean;
  onSave: (next: PersonalAgentSettings) => Promise<void> | void;
};

export function WebPersonalAgentSettingsSection(
  props: WebPersonalAgentSettingsSectionProps,
) {
  const { session, settings, isLoading, onSave } = props;
  const [agentNameDraft, setAgentNameDraft] = useState(settings.agent_name);
  const [agentSoulDraft, setAgentSoulDraft] = useState(settings.agent_soul);

  useEffect(() => {
    setAgentNameDraft(settings.agent_name);
  }, [settings.agent_name]);

  useEffect(() => {
    setAgentSoulDraft(settings.agent_soul);
  }, [settings.agent_soul]);

  const needsSave =
    agentNameDraft !== settings.agent_name ||
    agentSoulDraft !== settings.agent_soul;

  return (
    <div className="settings-section">
      <div className="settings-section-title">
        <svg viewBox="0 0 24 24">
          <path d="M12 3v18" />
          <path d="M5 8h14" />
          <path d="M7 16h10" />
        </svg>
        Personal agent
      </div>
      <div className="settings-section-desc">
        Name your agent and set private instructions. Community instructions
        apply on top when a community context is active.
      </div>
      <input
        className="provider-connection-input agent-name-input"
        value={agentNameDraft}
        onChange={(event) => setAgentNameDraft(event.target.value)}
        placeholder="Agent name"
        disabled={!session || isLoading}
      />
      <textarea
        className="profile-bio"
        value={agentSoulDraft}
        onChange={(event) => setAgentSoulDraft(event.target.value)}
        placeholder="Tell your agent how to think, collaborate, and behave for you."
        disabled={!session || isLoading}
        rows={6}
      />
      <div className="auth-actions" style={{ paddingLeft: 0, marginTop: 12 }}>
        <button
          className={
            needsSave
              ? "platform-save-button needs-save"
              : "platform-save-button synced"
          }
          type="button"
          onClick={() =>
            void onSave({
              ...settings,
              agent_name: agentNameDraft,
              agent_soul: agentSoulDraft,
            })
          }
          disabled={!session || isLoading || !needsSave}
        >
          {isLoading ? "Saving…" : needsSave ? "Save preferences" : "Saved"}
        </button>
      </div>
      {!session ? (
        <div className="model-note">
          Sign in to save personal agent preferences.
        </div>
      ) : null}
    </div>
  );
}

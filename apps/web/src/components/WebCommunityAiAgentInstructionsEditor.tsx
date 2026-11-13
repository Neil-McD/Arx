import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { isDesignV1Active } from "../../../../shared/designSystem";
import { SettingsGroup, SettingsRow } from "./SettingsRows";

export type WebCommunityAiAgentInstructionsEditorProps = {
  communityAgentConfigDirtyRef: MutableRefObject<boolean>;
  handleSaveCommunityAgentConfig: () => Promise<boolean> | boolean;
  handleResetCommunityAgentConfig: () => void;
  isSavingCommunityAgentConfig: boolean;
  communityAgentConfigSaveError: string | null;
  communityAgentConfigCommunitySystemPrompt: string;
  setCommunityAgentConfigCommunitySystemPrompt: Dispatch<SetStateAction<string>>;
  markCommunityAgentConfigDirty: () => void;
};

export function WebCommunityAiAgentInstructionsEditor(
  props: WebCommunityAiAgentInstructionsEditorProps,
) {
  const isDirty = props.communityAgentConfigDirtyRef.current;
  // Design v1: one stacked row; it saves when you leave the box.
  if (isDesignV1Active()) {
    const status = props.communityAgentConfigSaveError
      ? <span className="settings-v1-error">{props.communityAgentConfigSaveError}</span>
      : props.isSavingCommunityAgentConfig ? "Saving…" : isDirty ? "Unsaved" : "Adds to Polynet's fixed rules for identity, safety and authority. Saves as you go.";
    return (
      <SettingsGroup label="Instructions">
        <SettingsRow label="How should the guide help here?" htmlFor="guide-instructions" help={status} stacked>
          <textarea id="guide-instructions" className="settings-v1-input" rows={6}
            placeholder="Optional instructions for this community."
            value={props.communityAgentConfigCommunitySystemPrompt}
            onChange={(event) => { props.setCommunityAgentConfigCommunitySystemPrompt(event.target.value); props.markCommunityAgentConfigDirty(); }}
            onBlur={() => { if (props.communityAgentConfigDirtyRef.current && !props.isSavingCommunityAgentConfig) void props.handleSaveCommunityAgentConfig(); }} />
        </SettingsRow>
      </SettingsGroup>
    );
  }

  return (
    <div className="settings-section">
      <div className="model-note agent-editor-intro">
        Set the community-specific instructions used by this community's agent.
      </div>

      <div className="agent-preview-actions">
        {isDirty ? (
          <button
            type="button"
            onClick={props.handleResetCommunityAgentConfig}
            disabled={props.isSavingCommunityAgentConfig}
          >
            Cancel
          </button>
        ) : null}
        <button
          type="button"
          className={`platform-save-button ${isDirty ? "is-dirty" : "is-saved"}`}
          onClick={() => void props.handleSaveCommunityAgentConfig()}
          disabled={props.isSavingCommunityAgentConfig || !isDirty}
        >
          {props.isSavingCommunityAgentConfig ? "Saving..." : isDirty ? "Save changes" : "Saved"}
        </button>
      </div>

      {props.communityAgentConfigSaveError ? (
        <div className="auth-error">{props.communityAgentConfigSaveError}</div>
      ) : null}

      <label className="agent-canvas-target-card agent-canvas-target-card-editable">
        <span className="agent-canvas-target-kicker">Community instructions</span>
        <span className="agent-canvas-target-title">How should the agent help here?</span>
        <span className="model-note">
          These instructions augment the platform's locked identity, security, and authority rules.
        </span>
        <textarea
          className="system-prompt-input"
          placeholder="Optional instructions specific to this community."
          value={props.communityAgentConfigCommunitySystemPrompt}
          onChange={(event) => {
            props.setCommunityAgentConfigCommunitySystemPrompt(event.target.value);
            props.markCommunityAgentConfigDirty();
          }}
          rows={8}
        />
      </label>
    </div>
  );
}

import type { Dispatch, MutableRefObject, SetStateAction } from "react";

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

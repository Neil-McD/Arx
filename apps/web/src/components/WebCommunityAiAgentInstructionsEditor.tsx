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

  // The same card and row anatomy as the rest of Settings: a header, one
  // full-width field, and a footer whose status reads "Saved" until something
  // changes. Instructions are long, so they save on the button, not on blur.
  return (
    <section className="settings-section pn-settings-card pn-agent-instructions" aria-labelledby="agent-instructions-title">
      <header className="pn-settings-card-header">
        <h2 className="settings-section-title" id="agent-instructions-title">Instructions</h2>
        <p className="settings-section-desc">How the agent should help in this community. Polynet's own safety and identity rules always come first.</p>
      </header>
      <div className="pn-settings-card-body">
        <div className="pn-settings-row">
          <div className="pn-settings-row-field">
            <textarea
              id="agent-instructions"
              className="pn-settings-input"
              aria-labelledby="agent-instructions-title"
              placeholder="For example: answer in a friendly, direct tone and point people to the right lesson."
              value={props.communityAgentConfigCommunitySystemPrompt}
              onChange={(event) => {
                props.setCommunityAgentConfigCommunitySystemPrompt(event.target.value);
                props.markCommunityAgentConfigDirty();
              }}
              rows={8}
            />
          </div>
        </div>
        {props.communityAgentConfigSaveError ? (
          <p className="pn-settings-help" role="alert">{props.communityAgentConfigSaveError}</p>
        ) : null}
      </div>
      <footer className="pn-settings-card-footer">
        <span className="pn-settings-status" role="status" aria-live="polite">
          {props.isSavingCommunityAgentConfig ? "Saving…" : isDirty ? "Unsaved changes" : "Saved"}
        </span>
        {isDirty ? (
          <span className="pn-settings-actions">
            <button
              type="button"
              className="pn-settings-button"
              onClick={props.handleResetCommunityAgentConfig}
              disabled={props.isSavingCommunityAgentConfig}
            >
              Cancel
            </button>
            <button
              type="button"
              className="pn-settings-button is-primary"
              onClick={() => void props.handleSaveCommunityAgentConfig()}
              disabled={props.isSavingCommunityAgentConfig}
            >
              {props.isSavingCommunityAgentConfig ? "Saving…" : "Save"}
            </button>
          </span>
        ) : null}
      </footer>
    </section>
  );
}

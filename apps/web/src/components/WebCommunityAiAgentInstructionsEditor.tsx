import type { Dispatch, MutableRefObject, SetStateAction } from "react";
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

import type { ReactNode } from "react";

import {
  WebCommunityAiAgentInstructionsEditor,
  type WebCommunityAiAgentInstructionsEditorProps,
} from "./WebCommunityAiAgentInstructionsEditor";

type WebCommunityAiAgentSectionProps = {
  activeCommunity: unknown | null;
  hasSession: boolean;
  canManageMembersActiveCommunity: boolean;
  isLoadingCommunityAgentConfig: boolean;
  communityAgentConfigError: string | null;
  onRequireSignIn: () => void;
  instructionsEditorProps: WebCommunityAiAgentInstructionsEditorProps;
  embedded?: boolean;
  // Settings > Agent > Profile (name and photo), above the instructions.
  profileCard?: ReactNode;
};

export function WebCommunityAiAgentSection(props: WebCommunityAiAgentSectionProps) {
  const {
    activeCommunity,
    hasSession,
    canManageMembersActiveCommunity,
    isLoadingCommunityAgentConfig,
    communityAgentConfigError,
    onRequireSignIn,
    instructionsEditorProps,
    embedded = false,
    profileCard = null,
  } = props;

  let content: ReactNode = null;
  if (!activeCommunity) {
    content = <div className="chat-empty">Select a community to configure the community agent.</div>;
  } else if (!hasSession) {
    content = (
      <div className="chat-empty">
        <div>Sign in to configure the community agent.</div>
        <button
          className="secondary"
          type="button"
          onClick={onRequireSignIn}
          style={{ marginTop: 12 }}
        >
          Sign in
        </button>
      </div>
    );
  } else if (!canManageMembersActiveCommunity) {
    content = <div className="chat-empty">Only owners and admins can configure the community agent.</div>;
  } else if (isLoadingCommunityAgentConfig) {
    content = <div className="chat-empty">Loading…</div>;
  } else if (communityAgentConfigError) {
    content = <div className="auth-error">{communityAgentConfigError}</div>;
  } else {
    content = <>
      {profileCard}
      <WebCommunityAiAgentInstructionsEditor {...instructionsEditorProps} />
    </>;
  }

  return (
    <div className={embedded ? "community-settings-embedded-pane" : "settings-panel community-settings-panel"}>
      {embedded ? null : <div className="settings-section-title">Community Agent</div>}
      {content}
    </div>
  );
}

import type { ReactNode } from "react";

import {
  WebCommunityAiAgentInstructionsEditor,
  type WebCommunityAiAgentInstructionsEditorProps,
} from "./WebCommunityAiAgentInstructionsEditor";
import { WebCommunityHandbookEditor, type WebCommunityHandbookEditorProps } from "./WebCommunityHandbookEditor";

type WebCommunityAiAgentSectionProps = {
  activeCommunity: unknown | null;
  hasSession: boolean;
  canManageMembersActiveCommunity: boolean;
  isLoadingCommunityAgentConfig: boolean;
  communityAgentConfigError: string | null;
  onRequireSignIn: () => void;
  instructionsEditorProps: WebCommunityAiAgentInstructionsEditorProps;
  handbookEditorProps?: WebCommunityHandbookEditorProps<any>;
  embedded?: boolean;
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
    handbookEditorProps,
    embedded = false,
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
    content = (
      <>
        <WebCommunityAiAgentInstructionsEditor {...instructionsEditorProps} />
        {handbookEditorProps ? <WebCommunityHandbookEditor {...handbookEditorProps} /> : null}
      </>
    );
  }

  return (
    <div className={embedded ? "community-settings-embedded-pane" : "settings-panel community-settings-panel"}>
      <div className="settings-section-title">Community Agent</div>
      {content}
    </div>
  );
}

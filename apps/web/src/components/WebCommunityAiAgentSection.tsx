import { WebCommunityAiAgentLandingEditor, type WebCommunityAiAgentLandingEditorProps } from "./WebCommunityAiAgentLandingEditor";

type WebCommunityAiAgentSectionProps = {
  activeCommunity: unknown | null;
  hasSession: boolean;
  canManageMembersActiveCommunity: boolean;
  isLoadingCommunityAgentConfig: boolean;
  communityAgentConfigError: string | null;
  onOpenAuthGate: () => void;
  landingEditorProps: WebCommunityAiAgentLandingEditorProps;
};

export function WebCommunityAiAgentSection(props: WebCommunityAiAgentSectionProps) {
  const {
    activeCommunity,
    hasSession,
    canManageMembersActiveCommunity,
    isLoadingCommunityAgentConfig,
    communityAgentConfigError,
    onOpenAuthGate,
    landingEditorProps,
  } = props;

  return (
    <div className="settings-panel community-settings-panel">
      {!activeCommunity ? (
        <div className="chat-empty">Select a community to configure the AI agent.</div>
      ) : !hasSession ? (
        <div className="chat-empty">
          <div>Sign in to configure the AI agent.</div>
          <button
            className="secondary"
            type="button"
            onClick={onOpenAuthGate}
            style={{ marginTop: 12 }}
          >
            Sign in
          </button>
        </div>
      ) : !canManageMembersActiveCommunity ? (
        <div className="chat-empty">Only owners and admins can configure the AI agent.</div>
      ) : isLoadingCommunityAgentConfig ? (
        <div className="chat-empty">Loading…</div>
      ) : communityAgentConfigError ? (
        <div className="auth-error">{communityAgentConfigError}</div>
      ) : (
        <>
          <WebCommunityAiAgentLandingEditor {...landingEditorProps} />
        </>
      )}
    </div>
  );
}

import { WebCommunityAiAgentLandingEditor, type WebCommunityAiAgentLandingEditorProps } from "./WebCommunityAiAgentLandingEditor";
import { WebCommunityAiAgentUpgradeGate } from "./WebCommunityAiAgentUpgradeGate";

type WebCommunityAiAgentSectionProps = {
  activeCommunity: unknown | null;
  hasSession: boolean;
  canManageMembersActiveCommunity: boolean;
  isLoadingCommunityAgentDrafts: boolean;
  communityAgentDraftsError: string | null;
  isActiveCommunityOwner: boolean;
  onOpenAuthGate: () => void;
  onUpgradeToArchitect: () => void;
  landingEditorProps: WebCommunityAiAgentLandingEditorProps;
};

export function WebCommunityAiAgentSection(props: WebCommunityAiAgentSectionProps) {
  const {
    activeCommunity,
    hasSession,
    canManageMembersActiveCommunity,
    isLoadingCommunityAgentDrafts,
    communityAgentDraftsError,
    isActiveCommunityOwner,
    onOpenAuthGate,
    onUpgradeToArchitect,
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
      ) : isLoadingCommunityAgentDrafts ? (
        <div className="chat-empty">Loading…</div>
      ) : communityAgentDraftsError &&
        communityAgentDraftsError.toLowerCase().includes("pro_plan_required") ? (
        <WebCommunityAiAgentUpgradeGate
          isActiveCommunityOwner={isActiveCommunityOwner}
          onUpgrade={onUpgradeToArchitect}
        />
      ) : communityAgentDraftsError ? (
        <div className="auth-error">{communityAgentDraftsError}</div>
      ) : (
        <>
          <WebCommunityAiAgentLandingEditor {...landingEditorProps} />
        </>
      )}
    </div>
  );
}

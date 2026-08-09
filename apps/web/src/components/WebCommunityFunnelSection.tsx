import { WebCommunityFunnelEditor, type WebCommunityFunnelEditorProps } from "./WebCommunityFunnelEditor";

type WebCommunityFunnelSectionProps = {
  activeCommunity: unknown | null;
  hasSession: boolean;
  canManageMembersActiveCommunity: boolean;
  isLoadingCommunityFunnel: boolean;
  communityFunnelError: string | null;
  onRequireSignIn: () => void;
  editorProps: WebCommunityFunnelEditorProps;
};

export function WebCommunityFunnelSection(props: WebCommunityFunnelSectionProps) {
  const {
    activeCommunity,
    hasSession,
    canManageMembersActiveCommunity,
    isLoadingCommunityFunnel,
    communityFunnelError,
    onRequireSignIn,
    editorProps,
  } = props;

  return (
    <div className="settings-panel community-settings-panel">
      {!activeCommunity ? (
        <div className="chat-empty">Select a community to configure the public funnel.</div>
      ) : !hasSession ? (
        <div className="chat-empty">
          <div>Sign in to configure the public funnel.</div>
          <button
            className="secondary"
            type="button"
            onClick={onRequireSignIn}
            style={{ marginTop: 12 }}
          >
            Sign in
          </button>
        </div>
      ) : !canManageMembersActiveCommunity ? (
        <div className="chat-empty">Only owners and admins can configure the public funnel.</div>
      ) : isLoadingCommunityFunnel ? (
        <div className="chat-empty">Loading…</div>
      ) : communityFunnelError ? (
        <div className="auth-error">{communityFunnelError}</div>
      ) : (
        <WebCommunityFunnelEditor {...editorProps} />
      )}
    </div>
  );
}

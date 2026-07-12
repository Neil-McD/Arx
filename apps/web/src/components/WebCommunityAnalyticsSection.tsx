import {
  type CommunityAnalyticsActions,
  type CommunityAnalyticsState,
} from "./communityAnalyticsContracts";
import { CommunityAnalyticsPanel } from "./CommunityAnalyticsPanel";

type WebCommunityAnalyticsSectionProps = {
  hasActiveCommunity: boolean;
  hasSession: boolean;
  canViewActiveCommunityAnalytics: boolean;
  canViewPlatformAnalytics: boolean;
  onRequireSignIn: () => void;
  state: CommunityAnalyticsState;
  actions: CommunityAnalyticsActions;
};

export function WebCommunityAnalyticsSection(props: WebCommunityAnalyticsSectionProps) {
  const {
    hasActiveCommunity,
    hasSession,
    canViewActiveCommunityAnalytics,
    canViewPlatformAnalytics,
    onRequireSignIn,
    state,
    actions,
  } = props;

  return (
    <div className="settings-panel community-settings-panel">
      {hasActiveCommunity && !hasSession ? (
        <div className="chat-empty">
          <div>Sign in to view community analytics.</div>
          <button
            className="secondary"
            type="button"
            onClick={onRequireSignIn}
            style={{ marginTop: 12 }}
          >
            Sign in
          </button>
        </div>
      ) : (
        <CommunityAnalyticsPanel
          capabilities={{
            hasActiveCommunity,
            hasSession,
            canViewActiveCommunityAnalytics,
            canViewPlatformAnalytics,
          }}
          state={state}
          actions={actions}
        />
      )}
    </div>
  );
}

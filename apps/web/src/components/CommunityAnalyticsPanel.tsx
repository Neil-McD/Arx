import { KitAnalyticsPage } from "../v1/KitAnalyticsPage";
import type {
  CommunityAnalyticsActions,
  CommunityAnalyticsCapabilities,
  CommunityAnalyticsState,
} from "./communityAnalyticsContracts";

type CommunityAnalyticsPanelProps = {
  capabilities: CommunityAnalyticsCapabilities;
  state: CommunityAnalyticsState;
  actions: CommunityAnalyticsActions;
};

export function CommunityAnalyticsPanel(props: CommunityAnalyticsPanelProps) {
  const { capabilities, state, actions } = props;

  if (!capabilities.hasActiveCommunity) {
    return <div className="chat-empty">Select a community to view analytics.</div>;
  }
  if (!capabilities.hasSession) {
    return <div className="chat-empty">Sign in to view community analytics.</div>;
  }
  if (!capabilities.canViewActiveCommunityAnalytics) {
    return <div className="chat-empty">Only owners and admins can view community analytics.</div>;
  }

  return <KitAnalyticsPage state={state} actions={actions} />;
}

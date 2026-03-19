import { AnalyticsLineChart } from "../../shared/AnalyticsLineChart";
import { formatCount, formatPercent } from "../../shared/contentFormatting";
import { buildPlatformSwitcherStyle } from "../../shared/platformSwitcherUi";
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
  const rangeOptions = ["7d", "30d", "90d", "1y", "all"] as const;
  const rangeSwitcherStyle = buildPlatformSwitcherStyle(
    rangeOptions.length,
    rangeOptions.findIndex((value) => value === state.communityAnalyticsRange),
  );
  if (!capabilities.hasActiveCommunity) {
    return <div className="chat-empty">Select a community to view analytics.</div>;
  }
  if (!capabilities.hasSession) {
    return <div className="chat-empty">Sign in to view community analytics.</div>;
  }
  if (!capabilities.canViewActiveCommunityAnalytics) {
    return <div className="chat-empty">Only owners and admins can view community analytics.</div>;
  }

  return (
    <>
      <div className="analytics-header-row">
        <div className="panel-title">Community Analytics</div>
        <div
          className="platform-switcher platform-switcher-compact"
          role="tablist"
          aria-label="Time range"
          style={rangeSwitcherStyle}
        >
          {rangeOptions.map((value) => (
            <button
              key={value}
              className={
                value === state.communityAnalyticsRange
                  ? "platform-switcher-btn is-active"
                  : "platform-switcher-btn"
              }
              type="button"
              onClick={() => actions.setCommunityAnalyticsRange(value)}
              aria-pressed={value === state.communityAnalyticsRange}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      <div className="settings-section">
        {state.isLoadingCommunityAnalytics && (
          <div className="chat-loading">
            <div className="loading-spinner" />
            <span>Loading analytics...</span>
          </div>
        )}
        {state.communityAnalyticsError && <div className="auth-error">{state.communityAnalyticsError}</div>}
        <div className="analytics-kpi-strip" aria-label="Key performance indicators">
          {[
            { label: "Members", value: formatCount(state.communityAnalyticsSummary.total_members) },
            { label: "New", value: formatCount(state.communityAnalyticsSummary.new_members_window) },
            { label: "Active", value: formatCount(state.communityAnalyticsSummary.active_members_window) },
            { label: "Retention", value: formatPercent(state.communityAnalyticsSummary.retention_window) },
          ].map((kpi) => (
            <div key={kpi.label} className="analytics-kpi-tile">
              <div className="analytics-kpi-value-big">{kpi.value}</div>
              <div className="analytics-kpi-label">{kpi.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="settings-section">
        <div className="analytics-chart-card">
          <div className="analytics-chart-header">
            <div className="analytics-chart-label">Member growth</div>
            <div className="analytics-chart-stat">
              {state.communityAnalyticsSeries.length === 0
                ? "—"
                : formatCount(state.communityAnalyticsSeries.reduce((sum, point) => sum + point.value, 0))}
            </div>
          </div>
          <AnalyticsLineChart points={state.communityAnalyticsSeries} />
        </div>
      </div>
    </>
  );
}

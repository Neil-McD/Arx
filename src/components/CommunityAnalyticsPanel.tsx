import { AnalyticsLineChart } from "../../shared/AnalyticsLineChart";
import { formatCount, formatMoneyBaseUnits, formatPercent } from "../../shared/contentFormatting";
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

  return (
    <>
      <div className="analytics-header-row">
        <div className="panel-title">Community Analytics</div>
        <div className="analytics-range-toggle" role="tablist" aria-label="Time range">
          {(["7d", "30d", "90d", "1y", "all"] as const).map((value) => (
            <button
              key={value}
              className={value === state.communityAnalyticsRange ? "analytics-range-btn active" : "analytics-range-btn"}
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
            { label: "MRR", value: "—" },
            { label: "Conversion", value: "—" },
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
            <div className="analytics-range-toggle analytics-mode-toggle" role="tablist" aria-label="Metric">
              {(["members", "revenue"] as const).map((value) => (
                <button
                  key={value}
                  className={value === state.communityAnalyticsChartMode ? "analytics-range-btn active" : "analytics-range-btn"}
                  type="button"
                  onClick={() => actions.setCommunityAnalyticsChartMode(value)}
                  aria-pressed={value === state.communityAnalyticsChartMode}
                >
                  {value === "members" ? "Members" : "Revenue"}
                </button>
              ))}
            </div>
            <div className="analytics-chart-stat">
              {state.communityAnalyticsChartMode === "members"
                ? state.communityAnalyticsSeries.length === 0
                  ? "—"
                  : formatCount(state.communityAnalyticsSeries.reduce((sum, point) => sum + point.value, 0))
                : !state.communityRevenueMeta || state.communityRevenueSeries.length === 0
                  ? "—"
                  : formatMoneyBaseUnits(
                      state.communityRevenueSeries.reduce((sum, point) => sum + point.value, 0),
                      state.communityRevenueMeta.currency,
                      state.communityRevenueMeta.currency_decimals,
                    )}
            </div>
          </div>
          {state.communityAnalyticsChartMode === "members" ? (
            <AnalyticsLineChart points={state.communityAnalyticsSeries} />
          ) : (
            <AnalyticsLineChart
              points={state.communityRevenueSeries}
              valueFormatter={
                state.communityRevenueMeta
                  ? (value) =>
                      formatMoneyBaseUnits(
                        value,
                        state.communityRevenueMeta!.currency,
                        state.communityRevenueMeta!.currency_decimals,
                      )
                  : undefined
              }
            />
          )}
          {state.communityAnalyticsChartMode === "revenue" && state.communityRevenueError && (
            <div className="analytics-chart-note">
              {state.communityRevenueError.includes("schema cache")
                ? "Revenue is still syncing. Refresh in a moment."
                : state.communityRevenueError}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

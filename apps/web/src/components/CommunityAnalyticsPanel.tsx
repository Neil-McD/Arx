import { useMemo, useState } from "react";
import { AnalyticsLineChart } from "../../../../shared/AnalyticsLineChart";
import { formatCount, formatMoneyBaseUnits, formatPercent } from "../../../../shared/contentFormatting";
import { buildPlatformSwitcherStyle } from "../../../../shared/platformSwitcherUi";
import type {
  CommunityAnalyticsActions,
  CommunityAnalyticsCapabilities,
  CommunityAnalyticsState,
} from "./communityAnalyticsContracts";
import { WebAnalyticsScopeSwitcher } from "./WebAnalyticsScopeSwitcher";

type CommunityAnalyticsPanelProps = {
  capabilities: CommunityAnalyticsCapabilities;
  state: CommunityAnalyticsState;
  actions: CommunityAnalyticsActions;
};

export function CommunityAnalyticsPanel(props: CommunityAnalyticsPanelProps) {
  const { capabilities, state, actions } = props;
  const rangeOptions = ["7d", "30d", "90d", "1y", "all"] as const;
  const chartMetricOptions = ["visits", "members", "revenue"] as const;
  const [chartMetric, setChartMetric] = useState<(typeof chartMetricOptions)[number]>("members");
  const rangeSwitcherStyle = buildPlatformSwitcherStyle(
    rangeOptions.length,
    rangeOptions.findIndex((value) => value === state.communityAnalyticsRange),
  );
  const chartMetricSwitcherStyle = buildPlatformSwitcherStyle(
    chartMetricOptions.length,
    chartMetricOptions.findIndex((value) => value === chartMetric),
  );
  const chartPoints = state.communityAnalyticsSeries[chartMetric];
  const chartTitle = chartMetric === "visits" ? "Page visits" : chartMetric === "revenue" ? "Revenue" : "New members";
  const chartStat = useMemo(() => {
    if (chartPoints.length === 0) return "—";
    if (chartMetric === "revenue") {
      const latest = chartPoints[chartPoints.length - 1]?.value ?? 0;
      return formatMoneyBaseUnits(
        latest,
        state.communityAnalyticsSummary.currency,
        state.communityAnalyticsSummary.currency_decimals,
      );
    }
    const total = chartPoints.reduce((sum, point) => sum + point.value, 0);
    return formatCount(total);
  }, [
    chartMetric,
    chartPoints,
    state.communityAnalyticsSummary.currency,
    state.communityAnalyticsSummary.currency_decimals,
  ]);

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
        <div className="analytics-title-stack">
          <div className="panel-title">Analytics</div>
          <WebAnalyticsScopeSwitcher
            activeScope="community"
            showPlatformScope={capabilities.canViewPlatformAnalytics}
            onOpenCommunityScope={() => undefined}
            onOpenPlatformScope={actions.openPlatformAnalytics}
          />
        </div>
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
            { label: "Page visits", value: formatCount(state.communityAnalyticsSummary.page_visits_window) },
            { label: "New members", value: formatCount(state.communityAnalyticsSummary.new_members_window) },
            { label: "Conversion", value: formatPercent(state.communityAnalyticsSummary.conversion_rate_window) },
            {
              label: "MRR",
              value: formatMoneyBaseUnits(
                state.communityAnalyticsSummary.mrr_base_units,
                state.communityAnalyticsSummary.currency,
                state.communityAnalyticsSummary.currency_decimals,
              ),
            },
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
            <div className="analytics-chart-heading">
              <div className="analytics-chart-title">{chartTitle}</div>
              <div className="analytics-chart-stat">{chartStat}</div>
            </div>
            <div
              className="platform-switcher platform-switcher-compact analytics-chart-metric-switcher"
              role="tablist"
              aria-label="Chart metric"
              style={chartMetricSwitcherStyle}
            >
              {chartMetricOptions.map((value) => (
                <button
                  key={value}
                  className={value === chartMetric ? "platform-switcher-btn is-active" : "platform-switcher-btn"}
                  type="button"
                  onClick={() => setChartMetric(value)}
                  aria-pressed={value === chartMetric}
                >
                  {value === "visits" ? "Visits" : value === "revenue" ? "Revenue" : "Members"}
                </button>
              ))}
            </div>
          </div>
          <AnalyticsLineChart
            points={chartPoints}
            valueFormatter={
              chartMetric === "revenue"
                ? (value) =>
                    formatMoneyBaseUnits(
                      value,
                      state.communityAnalyticsSummary.currency,
                      state.communityAnalyticsSummary.currency_decimals,
                    )
                : undefined
            }
          />
        </div>
      </div>
    </>
  );
}

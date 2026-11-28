// Design system v1: Analytics for the people who run a community (Neil, Nov
// 13). One header like every page (the range on its right), four figures,
// one chart, and who is on which plan in the right column.
import { useState, type ReactNode } from "react";
import { AnalyticsLineChart } from "../../../../shared/AnalyticsLineChart";
import { formatCount, formatMoneyBaseUnits } from "../../../../shared/contentFormatting";
import type { AnalyticsRange, CommunityAnalyticsPlan } from "../../../../shared/communityTypes";
import type { CommunityRetentionAnalytics } from "../../../../shared/retentionAnalytics";
import { CommunityPageHeader } from "../components/CommunityPageHeader";
import { SettingsSegmented } from "../components/SettingsRows";
import type { CommunityAnalyticsActions, CommunityAnalyticsState } from "../components/communityAnalyticsContracts";
import { cx, Figs, KitApp } from "./kit";

const RANGES: readonly { id: AnalyticsRange; label: string }[] = [
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "90d", label: "90d" },
  { id: "1y", label: "1y" },
  { id: "all", label: "All" },
];

type ChartMetric = "members" | "revenue" | "visits";
const METRICS: readonly { id: ChartMetric; label: string }[] = [
  { id: "members", label: "Members" },
  { id: "revenue", label: "Revenue" },
  { id: "visits", label: "Visits" },
];
const CHART_TITLE: Record<ChartMetric, string> = { members: "New members", revenue: "Monthly revenue", visits: "Visits to the join page" };

const percent = (part: number, whole: number) => `${Math.round((part / whole) * 100)}%`;
const ratePercent = (rate: number | null) => (rate == null ? "—" : `${Math.round(rate * 100)}%`);
const formatDays = (days: number | null) => {
  if (days == null) return "—";
  if (days < 0.1) return "Same day";
  return `${days % 1 === 0 ? days.toFixed(0) : days.toFixed(1)}d`;
};

function RetentionAnalyticsSection(props: { retention: CommunityRetentionAnalytics }) {
  const { retention } = props;
  const formatRetentionMoney = (value: number | null) =>
    value == null || !retention.currency || retention.mixed_currency
      ? "—"
      : formatMoneyBaseUnits(value, retention.currency, retention.currency_decimals);
  const formatSavedMoney = (value: number) =>
    !retention.saved_revenue.currency || retention.saved_revenue.mixed_currency
      ? "—"
      : `${formatMoneyBaseUnits(value, retention.saved_revenue.currency, retention.saved_revenue.currency_decimals)}/mo`;

  const { activation, milestone_lift: milestoneLift, by_source: bySource, saved_revenue: saved } = retention;
  const hasAnyCohort = activation.cohort_members > 0;
  const hasAnyMembers = retention.sampled_members > 0;
  const showPaidColumns = retention.has_paid_plans && !retention.mixed_currency && Boolean(retention.currency);

  const retentionFigures: Array<{ label: string; value: string; note: string }> = [
    {
      label: "Activated",
      value: ratePercent(activation.activation_rate),
      note: hasAnyCohort
        ? `${formatCount(activation.activated_members)} of ${formatCount(activation.cohort_members)} joined`
        : "No new members in range",
    },
    {
      label: "Median time to value",
      value: formatDays(activation.median_ttfv_days),
      note: activation.using_activity_fallback
        ? "Join to first activity"
        : "Join to first milestone",
    },
  ];

  if (saved.show) {
    retentionFigures.push(
      {
        label: "Saved MRR (30d)",
        value: saved.saved_members_30d > 0 ? formatSavedMoney(saved.saved_mrr_30d_base_units) : "None yet",
        note: saved.saved_members_30d > 0
          ? `${formatCount(saved.saved_members_30d)} verified ${saved.saved_members_30d === 1 ? "save" : "saves"}`
          : "Chief of Staff verified renewals",
      },
      {
        label: "Saved MRR (90d)",
        value: saved.saved_members_90d > 0 ? formatSavedMoney(saved.saved_mrr_90d_base_units) : "None yet",
        note: saved.saved_members_90d > 0
          ? `${formatCount(saved.saved_members_90d)} verified ${saved.saved_members_90d === 1 ? "save" : "saves"}`
          : "Re-engaged & renewed",
      },
    );
  }

  return (
    <section className="analytics-v1-retention" aria-label="Retention and lifetime value">
      <div className="analytics-v1-head">
        <span className={cx("lab")}>Retention &amp; activation</span>
        {retention.is_capped ? (
          <span className="analytics-v1-subnote">Latest {formatCount(retention.sampled_members)} members</span>
        ) : null}
      </div>
      <div className={`analytics-v1-figs${retentionFigures.length === 2 ? " is-two" : ""}`}>
        <Figs figures={retentionFigures} />
      </div>

      {(hasAnyMembers && milestoneLift.length > 0) || hasAnyCohort ? (
        <div className="analytics-v1-grid">
          {hasAnyMembers && milestoneLift.length > 0 ? (
            <div className="analytics-v1-block">
              <span className={cx("lab")} style={{ display: "block", marginBottom: 10 }}>
                Milestone retention lift
              </span>
              <div className="analytics-v1-table">
                {milestoneLift.map((row) => (
                  <div key={row.key} className="analytics-v1-row">
                    <div className="analytics-v1-row-main">
                      <span>{row.label}</span>
                      <em>{row.stage_name}{row.kind === "custom" ? " · app or custom" : ""}</em>
                    </div>
                    <div className="analytics-v1-row-metrics">
                      <span>
                        <b>{ratePercent(row.completed_retention_rate)}</b> retained ({formatCount(row.completed_count)} done)
                        {showPaidColumns && row.completed_avg_ltv_base_units != null
                          ? ` · ${formatRetentionMoney(row.completed_avg_ltv_base_units)} avg LTV`
                          : ""}
                      </span>
                      <em>
                        vs. {ratePercent(row.not_completed_retention_rate)} without ({formatCount(row.not_completed_count)})
                        {showPaidColumns && row.not_completed_avg_ltv_base_units != null
                          ? ` · ${formatRetentionMoney(row.not_completed_avg_ltv_base_units)} avg LTV`
                          : ""}
                      </em>
                    </div>
                    {row.retention_lift_multiple != null ? (
                      <span className={`analytics-v1-lift${row.retention_lift_multiple >= 1.2 ? " is-pos" : ""}`}>
                        {row.retention_lift_multiple}× retention
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {hasAnyCohort ? (
            <div className="analytics-v1-block">
              <span className={cx("lab")} style={{ display: "block", marginBottom: 10 }}>
                By acquisition source
              </span>
              <div className="analytics-v1-table">
                {bySource.map((row) => (
                  <div key={row.source} className="analytics-v1-row">
                    <div className="analytics-v1-row-main">
                      <span>{row.label}</span>
                      <em>{formatCount(row.members)} {row.members === 1 ? "member" : "members"}</em>
                    </div>
                    <div className="analytics-v1-row-metrics">
                      <span>
                        <b>{ratePercent(row.activation_rate)}</b> activated · <b>{ratePercent(row.retention_rate)}</b> retained
                      </span>
                      {showPaidColumns ? (
                        <em>
                          {row.paid_members > 0
                            ? `${formatRetentionMoney(row.avg_realized_ltv_base_units)} avg LTV · ${formatCount(row.paid_members)} paid${row.avg_months_retained != null ? ` · ${row.avg_months_retained} mo avg` : ""}`
                            : "No paid members in range"}
                        </em>
                      ) : row.avg_months_retained != null ? (
                        <em>{row.avg_months_retained} mo average tenure</em>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function KitAnalyticsPage(props: { state: CommunityAnalyticsState; actions: CommunityAnalyticsActions }) {
  const { state, actions } = props;
  const [metric, setMetric] = useState<ChartMetric>("members");
  const summary = state.communityAnalyticsSummary;
  const money = (value: number | null) => formatMoneyBaseUnits(value, summary.currency, summary.currency_decimals);
  const signedMoney = (value: number) => `${value < 0 ? "−" : "+"}${money(Math.abs(value))}`;

  const total = summary.total_members;
  const newMembers = summary.new_members_window;
  const revenue = state.communityAnalyticsSeries.revenue;
  const revenueChange = revenue.length > 1 && summary.mrr_base_units != null
    ? summary.mrr_base_units - (revenue[0]?.value ?? 0)
    : null;
  // Nothing has ever been paid: no currency to show money in.
  const unpaid = !summary.mrr_base_units && !summary.currency;
  const active = summary.active_members_window;
  const visits = summary.page_visits_window ?? 0;
  const joined = newMembers ?? 0;

  const figures = [
    { label: "Members", value: formatCount(total), note: newMembers ? `+${formatCount(newMembers)} new` : "No one new" },
    unpaid
      ? { label: "Monthly revenue", value: "None", note: "No paid plans yet" }
      : {
        label: "Monthly revenue",
        value: money(summary.mrr_base_units),
        note: revenueChange == null || summary.mrr_base_units == null ? "" : revenueChange === 0 ? "No change" : signedMoney(revenueChange),
      },
    { label: "Active", value: active != null && total ? percent(active, total) : "—", note: active != null && total ? `${formatCount(active)} of ${formatCount(total)}` : "" },
    { label: "Join rate", value: visits > 0 ? percent(joined, visits) : "—", note: visits > 0 ? "of visitors" : "No visits yet" },
  ];

  const plans = summary.plans ?? [];
  const planList: ReactNode = plans.length ? (
    <div className="analytics-v1-plans">
      {plans.map((plan: CommunityAnalyticsPlan) => (
        <div key={plan.key} className="analytics-v1-plan">
          <div><span>{plan.name}</span><b>{formatCount(plan.members)}</b></div>
          {plan.mrr_base_units ? <em>{money(plan.mrr_base_units)}/mo</em> : null}
        </div>
      ))}
    </div>
  ) : <p>No one is on a plan yet.</p>;

  const points = state.communityAnalyticsSeries[metric];

  return (
    <>
      <CommunityPageHeader
        title="Analytics"
        actions={<SettingsSegmented label="Time range" value={state.communityAnalyticsRange} options={RANGES} onChange={actions.setCommunityAnalyticsRange} />}
      >
        <div className="panel-title">Analytics</div>
      </CommunityPageHeader>
      <KitApp view="manage" host part="flow">
        <div className={`${cx("page")} analytics-v1`} style={{ padding: 0, overflow: "visible" }} aria-busy={state.isLoadingCommunityAnalytics}>
          {state.communityAnalyticsError ? <p className={cx("bad")} role="alert">{state.communityAnalyticsError}</p> : null}
          <div className="analytics-v1-figs"><Figs figures={figures} /></div>

          <div className="analytics-v1-head">
            <span className={cx("lab")}>{CHART_TITLE[metric]}</span>
            <SettingsSegmented label="Chart" value={metric} options={METRICS} onChange={setMetric} />
          </div>
          <div className="analytics-v1-chart">
            <AnalyticsLineChart points={points} height={170} valueFormatter={metric === "revenue" ? (value) => money(value) : undefined} />
          </div>

          {/* The plans sit in the page: nothing is picked here, so there is no right column. */}
          <div className="analytics-v1-plans-inline">
            <span className={cx("lab")} style={{ display: "block", marginTop: 34 }}>By plan</span>
            {planList}
          </div>

          {summary.retention ? <RetentionAnalyticsSection retention={summary.retention} /> : null}
        </div>
      </KitApp>
    </>
  );
}

// Design system v1: Analytics for the people who run a community (Neil, Nov
// 13). One header like every page (the range on its right), four figures,
// one chart, how people join, and who is on which plan in the right column.
import { useState, type ReactNode } from "react";
import { AnalyticsLineChart } from "../../../../shared/AnalyticsLineChart";
import { formatCount, formatMoneyBaseUnits } from "../../../../shared/contentFormatting";
import type { AnalyticsRange, CommunityAnalyticsPlan } from "../../../../shared/communityTypes";
import { CommunityPageHeader, CommunityPageRail } from "../components/CommunityPageHeader";
import { SettingsSegmented } from "../components/SettingsRows";
import type { CommunityAnalyticsActions, CommunityAnalyticsState } from "../components/communityAnalyticsContracts";
import { cx, Figs, KitApp, Rail, Sec } from "./kit";

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
  const active = summary.active_members_window;
  const visits = summary.page_visits_window ?? 0;
  const started = summary.join_starts_window ?? 0;
  const joined = newMembers ?? 0;

  const figures = [
    { label: "Members", value: formatCount(total), note: newMembers ? `+${formatCount(newMembers)} new` : "No one new" },
    {
      label: "Monthly revenue",
      value: money(summary.mrr_base_units),
      note: revenueChange == null || summary.mrr_base_units == null ? "" : revenueChange === 0 ? "No change" : signedMoney(revenueChange),
    },
    { label: "Active", value: active != null && total ? percent(active, total) : "—", note: active != null && total ? `${formatCount(active)} of ${formatCount(total)}` : "" },
    { label: "Join rate", value: visits > 0 ? percent(joined, visits) : "—", note: visits > 0 ? "of visitors" : "No visits yet" },
  ];

  const steps = [
    { label: "Visited the join page", value: visits },
    { label: "Started joining", value: started },
    { label: "Joined", value: joined },
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

          <span className={cx("lab")} style={{ display: "block", marginTop: 34 }}>How people join</span>
          <div className="analytics-v1-funnel">
            {steps.map((step, index) => {
              const before = index > 0 ? steps[index - 1].value : 0;
              return (
                <div key={step.label} className="analytics-v1-step">
                  <div>
                    <span>{step.label}</span>
                    <em>{formatCount(step.value)}{index > 0 && before > 0 ? ` · ${percent(step.value, before)} of the step before` : ""}</em>
                  </div>
                  <div className={`${cx("bar")} analytics-v1-bar`}><i style={{ width: visits > 0 ? `${Math.min(100, (step.value / visits) * 100)}%` : "0%" }} /></div>
                </div>
              );
            })}
          </div>

          {/* Below 900px the right column is hidden, so the plans sit here. */}
          <div className="analytics-v1-plans-inline">
            <span className={cx("lab")} style={{ display: "block", marginTop: 34 }}>By plan</span>
            {planList}
          </div>
        </div>
      </KitApp>
      <CommunityPageRail label="By plan">
        {/* The kit shows a right column by its view; Members' column (r5) is the plain one. */}
        <KitApp view="members" host part="rail" className="kit-page-rail">
          <Rail index={5} label="By plan">
            <Sec label="By plan">{planList}</Sec>
          </Rail>
        </KitApp>
      </CommunityPageRail>
    </>
  );
}

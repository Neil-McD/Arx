import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import type { AuthSessionLike } from "../../../../shared/authSession";
import { buildPlatformSwitcherStyle } from "../../../../shared/platformSwitcherUi";
import {
  loadOperatorBuildersCanonical,
  loadOperatorEventsCanonical,
  loadOperatorMonetizationCanonical,
  loadOperatorOverviewCanonical,
  loadOperatorRisksCanonical,
  recordOperatorDashboardAccessCanonical,
} from "../../../../shared/cloudOperatorDashboardGateway";
import type {
  OperatorBuilderRecord,
  OperatorEventRecord,
  OperatorMonetizationSnapshot,
  OperatorOverviewSnapshot,
  OperatorRiskItem,
} from "../../../../shared/operatorTypes";

export type OperatorInsightTab = "platform" | "builders";

export const OPERATOR_RIGHT_PANEL_DEFAULT_WIDTH = 560;
export const OPERATOR_RIGHT_PANEL_MIN_WIDTH = 380;
export const OPERATOR_RIGHT_PANEL_MAX_WIDTH = 860;
export const OPERATOR_RIGHT_PANEL_GUTTER = 28;
export const OPERATOR_RIGHT_PANEL_KEYBOARD_STEP = 32;

const OPERATOR_INSIGHT_TABS: Array<{ id: OperatorInsightTab; label: string }> = [
  { id: "platform", label: "Platform" },
  { id: "builders", label: "Builders" },
];

export type OperatorDashboardState = {
  overview: OperatorOverviewSnapshot | null;
  monetization: OperatorMonetizationSnapshot | null;
  builders: OperatorBuilderRecord[];
  risks: OperatorRiskItem[];
  events: OperatorEventRecord[];
};

export function createEmptyOperatorDashboardState(): OperatorDashboardState {
  return {
    overview: null,
    monetization: null,
    builders: [],
    risks: [],
    events: [],
  };
}

export function clampOperatorRightPanelWidth(width: number): number {
  if (!Number.isFinite(width)) return OPERATOR_RIGHT_PANEL_DEFAULT_WIDTH;
  return Math.min(OPERATOR_RIGHT_PANEL_MAX_WIDTH, Math.max(OPERATOR_RIGHT_PANEL_MIN_WIDTH, Math.round(width)));
}

export function useOperatorDashboardData(params: {
  session: AuthSessionLike | null;
  enabled: boolean;
  surface: string;
}) {
  const [state, setState] = useState<OperatorDashboardState>(() => createEmptyOperatorDashboardState());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isAlive = true;
    if (!params.enabled) {
      setState(createEmptyOperatorDashboardState());
      setIsLoading(false);
      setError(null);
      return;
    }
    if (!params.session) {
      setState(createEmptyOperatorDashboardState());
      setIsLoading(false);
      setError("Sign in with an operator account to view this surface.");
      return;
    }

    setState(createEmptyOperatorDashboardState());
    setIsLoading(true);
    setError(null);
    const session = params.session;
    recordOperatorDashboardAccessCanonical({ session, surface: params.surface })
      .then(() =>
        Promise.all([
          loadOperatorOverviewCanonical({ session, range: "30d" }),
          loadOperatorMonetizationCanonical({ session, range: "30d" }),
          loadOperatorBuildersCanonical({ session, limit: 12 }),
          loadOperatorRisksCanonical({ session, limit: 12 }),
          loadOperatorEventsCanonical({ session, limit: 12 }),
        ]),
      )
      .then(
        ([overview, monetization, builders, risks, events]) => {
          if (!isAlive) return;
          setState({ overview, monetization, builders, risks, events });
        },
        (nextError) => {
          if (!isAlive) return;
          const message = nextError instanceof Error ? nextError.message : "Operator dashboard unavailable.";
          setState(createEmptyOperatorDashboardState());
          setError(message.includes("operator_access_forbidden") ? "Operator access required." : message);
        },
      )
      .finally(() => {
        if (isAlive) setIsLoading(false);
      });

    return () => {
      isAlive = false;
    };
  }, [params.enabled, params.session, params.surface]);

  const topBuilders = useMemo(
    () =>
      [...state.builders].sort(
        (a, b) => (b.money.estimatedMrr?.amountBaseUnits ?? 0) - (a.money.estimatedMrr?.amountBaseUnits ?? 0),
      ),
    [state.builders],
  );

  return { state, topBuilders, isLoading, error };
}

export function WebOperatorDataPanel(props: {
  state: OperatorDashboardState;
  topBuilders: OperatorBuilderRecord[];
  isLoading: boolean;
  error: string | null;
  activeInsightTab: OperatorInsightTab;
  onActiveInsightTabChange: (tab: OperatorInsightTab) => void;
  onResizePointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onResizePointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onResizeDoubleClick: () => void;
  onResizeKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}) {
  const activeInsightTabIndex = OPERATOR_INSIGHT_TABS.findIndex((tab) => tab.id === props.activeInsightTab);
  const insightTabSwitcherStyle = buildPlatformSwitcherStyle(OPERATOR_INSIGHT_TABS.length, activeInsightTabIndex);

  return (
    <>
      <div
        className="operator-data-panel__resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize operator data panel"
        tabIndex={0}
        onPointerDown={props.onResizePointerDown}
        onPointerMove={props.onResizePointerMove}
        onDoubleClick={props.onResizeDoubleClick}
        onKeyDown={props.onResizeKeyDown}
      />
      <div
        className="platform-switcher platform-switcher-compact operator-data-panel__tabs"
        role="tablist"
        aria-label="Operator data tabs"
        style={insightTabSwitcherStyle as CSSProperties}
      >
        {OPERATOR_INSIGHT_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className={`platform-switcher-btn${props.activeInsightTab === tab.id ? " is-active" : ""}`}
            aria-selected={props.activeInsightTab === tab.id}
            onClick={() => props.onActiveInsightTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="operator-data-panel__content">
        {props.error ? <div className="operator-surface-notice">{props.error}</div> : null}
        {props.isLoading ? <div className="operator-surface-notice">Loading operator data...</div> : null}
        {props.activeInsightTab === "platform" ? (
          <OperatorPlatformInsights
            overview={props.state.overview}
            monetization={props.state.monetization}
            risks={props.state.risks}
            events={props.state.events}
          />
        ) : (
          <OperatorBuilderInsights builders={props.topBuilders} />
        )}
      </div>
    </>
  );
}

function formatMoney(metric: { currency: string; amountBaseUnits: number; currencyDecimals: number } | null): string {
  if (!metric) return "$0";
  const amount = Number(metric.amountBaseUnits ?? 0) / 10 ** Number(metric.currencyDecimals ?? 2);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: metric.currency || "usd",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${Math.round(value * 100)}%`;
}

function OperatorPlatformInsights(props: {
  overview: OperatorOverviewSnapshot | null;
  monetization: OperatorMonetizationSnapshot | null;
  risks: OperatorRiskItem[];
  events: OperatorEventRecord[];
}) {
  return (
    <div className="operator-data-panel__grid">
      <section className="operator-dashboard__metrics" aria-label="Operator overview">
        <div>
          <span>Estimated community MRR</span>
          <strong>{formatMoney(props.overview?.totals.estimatedMrr ?? null)}</strong>
        </div>
        <div>
          <span>Builders</span>
          <strong>{props.overview?.totals.builders ?? 0}</strong>
        </div>
        <div>
          <span>Communities</span>
          <strong>{props.overview?.totals.communities ?? 0}</strong>
        </div>
        <div>
          <span>Risk items</span>
          <strong>{props.overview?.totals.riskItems ?? 0}</strong>
        </div>
      </section>

      <section className="operator-dashboard__panel">
        <h2>Polynet monetization</h2>
        <div className="operator-dashboard__table">
          <div className="operator-dashboard__row">
            <span>Builder checkout conversion</span>
            <strong>
              {formatPercent(
                props.monetization && props.monetization.builderPlanCheckoutStarts > 0
                  ? props.monetization.builderPlanCheckoutCompletions /
                      props.monetization.builderPlanCheckoutStarts
                  : null,
              )}
            </strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Community checkout conversion</span>
            <strong>
              {formatPercent(
                props.monetization && props.monetization.communityCheckoutStarts > 0
                  ? props.monetization.communityCheckoutCompletions /
                      props.monetization.communityCheckoutStarts
                  : null,
              )}
            </strong>
          </div>
          <div className="operator-dashboard__row">
            <span>Active community subscriptions</span>
            <strong>{props.monetization?.activeCommunitySubscriptions ?? 0}</strong>
          </div>
        </div>
      </section>

      <section className="operator-dashboard__panel">
        <h2>Risk</h2>
        <div className="operator-dashboard__table">
          {props.risks.length === 0 ? (
            <div className="operator-dashboard__empty">No risk items returned.</div>
          ) : (
            props.risks.map((risk) => (
              <div className="operator-dashboard__row" key={risk.id}>
                <div>
                  <strong>{risk.title}</strong>
                  <span>{risk.kind}</span>
                </div>
                <span>{risk.severity}</span>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="operator-dashboard__panel">
        <h2>Events</h2>
        <div className="operator-dashboard__table">
          {props.events.map((event) => (
            <div className="operator-dashboard__row" key={event.id}>
              <div>
                <strong>{event.eventType}</strong>
                <span>{event.status}</span>
              </div>
              <span>{event.severity}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function OperatorBuilderInsights(props: { builders: OperatorBuilderRecord[] }) {
  return (
    <div className="operator-data-panel__grid">
      <section className="operator-dashboard__panel operator-dashboard__panel--full">
        <h2>Builder performance</h2>
        <div className="operator-dashboard__table">
          {props.builders.map((record) => (
            <div className="operator-dashboard__row" key={record.community.communityId}>
              <div>
                <strong>{record.builder.displayName ?? record.builder.email ?? record.builder.userId}</strong>
                <span>{record.community.name}</span>
              </div>
              <div>
                <strong>{formatMoney(record.money.estimatedMrr)}</strong>
                <span>{record.money.activePaidMembers} paid</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
